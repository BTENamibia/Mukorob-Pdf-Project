/* Mukorob PDF v0.7.3 — interactive signature/stamp overlay controller.
   Geometry is stored normalized to the rendered PDF page: x,y,w,h ∈ [0,1].
   The DOM control is the single interactive representation; PDF.js/core canvas
   rendering never creates a second signature/stamp control.
*/
const A = window.MukorobApp;
const { state, $, toast, requirePermission, persistAnnotations, writeAudit } = A;
const DB = A.db;

let placement = null;
let selected = null;
let drag = null;
let resize = null;
let observer = null;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const normalRect = r => {
  const w = clamp(Number(r?.w) || .2, .02, 1);
  const h = clamp(Number(r?.h) || .08, .02, 1);
  return {
    x: clamp(Number(r?.x) || 0, 0, 1 - w),
    y: clamp(Number(r?.y) || 0, 0, 1 - h),
    w,
    h
  };
};

/* Screen pixels -> normalized page coordinates. The page wrapper is always
   measured at interaction time, so zoom, resize and high-DPI backing canvases
   do not alter the stored geometry. */
function screenToNormalized(layer, clientX, clientY) {
  const r = layer.getBoundingClientRect();
  if (!r.width || !r.height) return { x: 0, y: 0 };
  return {
    x: clamp((clientX - r.left) / r.width, 0, 1),
    y: clamp((clientY - r.top) / r.height, 0, 1)
  };
}

/* Normalized rendered-page coordinates -> PDF points (bottom-left origin).
   rotation is the active PDF page rotation in clockwise degrees.
   For rotated pages the rendered viewport dimensions are swapped by PDF.js;
   the formulas below map the visible, rotated page back to its unrotated PDF
   point space. */
function normalizedToPdfPoints(rect, pageWidthPt, pageHeightPt, rotation = 0) {
  const r = normalRect(rect);
  const W = Number(pageWidthPt) || 0;
  const H = Number(pageHeightPt) || 0;
  const rot = ((Number(rotation) || 0) % 360 + 360) % 360;

  const point = (nx, ny) => {
    if (rot === 90) return { x: (1 - ny) * W, y: nx * H };
    if (rot === 180) return { x: (1 - nx) * W, y: ny * H };
    if (rot === 270) return { x: ny * W, y: (1 - nx) * H };
    return { x: nx * W, y: (1 - ny) * H };
  };

  const p1 = point(r.x, r.y);
  const p2 = point(r.x + r.w, r.y + r.h);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    w: Math.abs(p2.x - p1.x),
    h: Math.abs(p2.y - p1.y)
  };
}

function normalizedToCss(rect) {
  const r = normalRect(rect);
  return {
    left: (r.x * 100) + '%',
    top: (r.y * 100) + '%',
    width: (r.w * 100) + '%',
    height: (r.h * 100) + '%'
  };
}

function hitAnnotation(pageNum, x, y) {
  const items = state.annotations.filter(a =>
    a.page === pageNum && (a.type === 'signature' || a.type === 'stamp')
  );
  for (let i = items.length - 1; i >= 0; i--) {
    const r = normalRect(items[i].rect);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return items[i];
  }
  return null;
}

function beginPlacement(type, src = null, text = null) {
  if (!state.pdfDoc) return toast('Open a PDF first.');
  const perm = type === 'signature' ? 'signature' : 'stamp';
  if (!requirePermission(perm)) return;
  placement = { type, src, text };
  selected = null;
  $('#annotToolbar').hidden = true;
  $('#pagesContainer').classList.add('placing-annotation');
  toast(type === 'signature'
    ? 'Tap/click where the signature should go.'
    : 'Tap/click where the company stamp should go.');
}

function cancelPlacement() {
  placement = null;
  $('#pagesContainer')?.classList.remove('placing-annotation');
}

async function saveUserStamp(src) {
  const userId = A.currentUserId?.();
  if (!userId || !DB || !src) return;
  await DB.put('settings', {
    key: 'userStamp:' + userId,
    userId,
    value: src,
    updatedAt: Date.now()
  });
}

async function getUserStamp() {
  const userId = A.currentUserId?.();
  if (!userId || !DB) return null;
  const row = await DB.get('settings', 'userStamp:' + userId);
  return row?.value || null;
}

function addPlaced(type, page, pt, src, text) {
  const r = type === 'stamp'
    ? { x: clamp(pt.x - .16, 0, .68), y: clamp(pt.y - .07, 0, .86), w: .32, h: .14 }
    : { x: clamp(pt.x - .18, 0, .64), y: clamp(pt.y - .045, 0, .91), w: .36, h: .09 };

  const a = {
    type,
    page,
    rect: normalRect(r),
    color: $('#annotColor')?.value || '#0B4F8A',
    id: 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    createdAt: Date.now()
  };
  if (src) a.src = src;
  if (text) a.text = text;

  state.annotations.push(a);
  state.undoStack.push({ op: 'add', id: a.id });
  state.redoStack = [];
  persistAnnotations();

  /* Core draw may paint non-interactive PDF annotation graphics. The
     interactive control below is deliberately created once by decoratePage. */
  A.drawAnnotationsForPage(page);
  decoratePage(page);
  selected = a;

  writeAudit(type + '-placed', { file: state.fileName, page });
  toast(type === 'signature'
    ? 'Signature placed. Drag or resize it as needed.'
    : 'Company stamp placed. Drag or resize it as needed.');
}

function applyRectStyle(el, rect) {
  const css = normalizedToCss(rect);
  el.style.left = css.left;
  el.style.top = css.top;
  el.style.width = css.width;
  el.style.height = css.height;
}

function finishInteraction(kind, pageNum, a) {
  if (!drag && !resize) return;
  a.rect = normalRect(a.rect);
  persistAnnotations();
  writeAudit('annotation-' + kind, {
    file: state.fileName,
    page: pageNum,
    type: a.type,
    id: a.id,
    rect: { ...a.rect }
  });
  drag = null;
  resize = null;
  /* Reflow only after pointerup. Never redraw the annotation layer from
     pointermove; doing so destroys the captured DOM node. */
  requestAnimationFrame(() => decoratePage(pageNum));
}

function makeInteractive(pageNum, a, layer) {
  const rect = normalRect(a.rect);
  a.rect = rect;

  const el = document.createElement('div');
  el.className = 'v07-annotation-control' + (selected === a ? ' selected' : '');
  el.dataset.annotationId = a.id;
  el.dataset.annotationType = a.type;
  el.style.touchAction = 'none';
  applyRectStyle(el, rect);

  /* Exactly one visual child for each annotation. Signature text is isolated
     in this one node; it is never copied into the core canvas/text layer. */
  if (a.type === 'signature') {
    const text = document.createElement('div');
    text.className = 'v07-signature-visual';
    text.dataset.signatureText = 'true';
    text.textContent = a.text || 'Signature';
    text.style.color = a.color || '#0B4F8A';
    el.appendChild(text);
  } else if (a.type === 'stamp') {
    const img = document.createElement('img');
    img.src = a.src || '';
    img.alt = 'Company stamp';
    img.draggable = false;
    el.appendChild(img);
  }

  const handle = document.createElement('span');
  handle.className = 'v07-resize-handle';
  handle.title = 'Resize';
  handle.setAttribute('aria-label', 'Resize ' + a.type);
  el.appendChild(handle);

  const startInteraction = e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selected = a;

    const start = screenToNormalized(layer, e.clientX, e.clientY);
    if (e.target === handle || e.target.closest?.('.v07-resize-handle')) {
      resize = {
        a,
        pageNum,
        pointerId: e.pointerId,
        start,
        rect: { ...normalRect(a.rect) }
      };
      drag = null;
    } else {
      drag = {
        a,
        pageNum,
        pointerId: e.pointerId,
        start,
        rect: { ...normalRect(a.rect) }
      };
      resize = null;
    }

    try { el.setPointerCapture(e.pointerId); } catch {}
    el.classList.add('dragging');
  };

  const moveInteraction = e => {
    const active = drag?.a === a ? drag : resize?.a === a ? resize : null;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();

    const pt = screenToNormalized(layer, e.clientX, e.clientY);
    const dx = pt.x - active.start.x;
    const dy = pt.y - active.start.y;

    if (drag?.a === a) {
      a.rect.x = clamp(active.rect.x + dx, 0, 1 - active.rect.w);
      a.rect.y = clamp(active.rect.y + dy, 0, 1 - active.rect.h);
    } else {
      a.rect.w = clamp(active.rect.w + dx, .02, 1 - active.rect.x);
      a.rect.h = clamp(active.rect.h + dy, .02, 1 - active.rect.y);
    }

    /* Only mutate the captured control during the gesture. This is a
       compositor-friendly percentage update and avoids layout-wide redraws. */
    applyRectStyle(el, a.rect);
    selected = a;
  };

  const endInteraction = e => {
    const active = drag?.a === a ? drag : resize?.a === a ? resize : null;
    if (!active || (e?.pointerId !== undefined && active.pointerId !== e.pointerId)) return;
    try {
      if (el.hasPointerCapture?.(active.pointerId)) el.releasePointerCapture(active.pointerId);
    } catch {}
    el.classList.remove('dragging');
    finishInteraction('repositioned', pageNum, a);
  };

  el.addEventListener('pointerdown', startInteraction, { passive: false });
  el.addEventListener('pointermove', moveInteraction, { passive: false });
  el.addEventListener('pointerup', endInteraction);
  el.addEventListener('pointercancel', endInteraction);
  el.addEventListener('lostpointercapture', endInteraction);

  el.addEventListener('dblclick', e => {
    e.stopPropagation();
    if (!confirm('Remove this ' + a.type + '?')) return;
    const i = state.annotations.findIndex(x => x.id === a.id);
    if (i > -1) state.annotations.splice(i, 1);
    if (selected === a) selected = null;
    persistAnnotations();
    A.drawAnnotationsForPage(pageNum);
    decoratePage(pageNum);
    toast('Removed.');
  });

  layer.appendChild(el);
  return el;
}

function decoratePage(pageNum) {
  const p = state.pageEls[pageNum - 1];
  if (!p?.annotLayer || !p.canvas) return;

  /* Idempotent render: remove only this module's controls, then create exactly
     one control per stored signature/stamp annotation ID. */
  const layer = p.annotLayer;
  layer.querySelectorAll('.v07-annotation-control').forEach(e => e.remove());

  const annotations = state.annotations.filter(a =>
    a.page === pageNum && (a.type === 'signature' || a.type === 'stamp')
  );
  const seen = new Set();
  annotations.forEach(a => {
    if (!a.id || seen.has(a.id)) return;
    seen.add(a.id);
    makeInteractive(pageNum, a, layer);
  });
}

function decorateAll() {
  state.pageEls.forEach((_, i) => decoratePage(i + 1));
}

function onLayerPointerDown(e, layer) {
  if (!placement) return;
  if (e.target.closest('.v07-annotation-control')) return;

  const pageNum = Number(layer.closest('.pdf-page')?.dataset.page);
  if (!pageNum) return;

  const pt = screenToNormalized(layer, e.clientX, e.clientY);
  e.preventDefault();
  e.stopImmediatePropagation();

  if (placement.type === 'signature') {
    const text = prompt('Type the signature name or initials:');
    if (text?.trim()) addPlaced('signature', pageNum, pt, null, text.trim());
    cancelPlacement();
  } else if (placement.type === 'stamp') {
    addPlaced('stamp', pageNum, pt, placement.src);
    cancelPlacement();
  }
}

function wire() {
  const pages = $('#pagesContainer');
  if (!pages) return;

  /* Capture phase is only for placement. Existing controls are excluded above,
     so dragging an existing annotation is never mistaken for placing a new one. */
  pages.addEventListener('pointerdown', e => {
    const layer = e.target.closest('.annot-layer');
    if (layer) onLayerPointerDown(e, layer);
  }, true);

  let queued = false;
  let decorating = false;
  observer = new MutationObserver(() => {
    if (decorating || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorating = true;
      observer.disconnect();
      decorateAll();
      observer.observe(pages, { subtree: true, childList: true });
      decorating = false;
    });
  });
  observer.observe(pages, { subtree: true, childList: true });

  $('#btnESignature')?.addEventListener('click', e => {
    e.stopImmediatePropagation();
    beginPlacement('signature');
  }, true);
  $('#toolESignature')?.addEventListener('click', e => {
    e.stopImmediatePropagation();
    $('#toolsMenu').hidden = true;
    beginPlacement('signature');
  }, true);
  $('#btnCompanyStamp')?.addEventListener('click', e => {
    e.stopImmediatePropagation();
    chooseStamp();
  }, true);
  $('#toolCompanyStamp')?.addEventListener('click', e => {
    e.stopImmediatePropagation();
    $('#toolsMenu').hidden = true;
    chooseStamp();
  }, true);
  $('#toolUploadStamp')?.addEventListener('click', e => {
    e.stopImmediatePropagation();
    $('#toolsMenu').hidden = true;
    uploadUserStamp();
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && placement) cancelPlacement();
  });
  window.addEventListener('resize', decorateAll);
}

async function chooseStamp() {
  if (!requirePermission('stamp')) return;
  const src = await getUserStamp();
  if (src) beginPlacement('stamp', src);
  else $('#stampInput')?.click();
}

async function uploadUserStamp() {
  if (!requirePermission('stamp')) return;
  $('#stampInput')?.click();
}

window.addEventListener('DOMContentLoaded', () => {
  wire();
  $('#stampInput')?.addEventListener('change', e => {
    e.stopImmediatePropagation();
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      await saveUserStamp(rd.result);
      beginPlacement('stamp', rd.result);
    };
    rd.readAsDataURL(f);
    e.target.value = '';
  }, true);
  decorateAll();
});

/* Expose pure geometry helpers for export code and deterministic smoke tests.
   No credentials or document contents are exposed here. */
window.MukorobAnnotations = {
  clamp,
  normalRect,
  screenToNormalized,
  normalizedToCss,
  normalizedToPdfPoints
};
