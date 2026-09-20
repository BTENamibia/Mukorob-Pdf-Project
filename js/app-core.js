/* ==========================================================================
   Mukorob PDF — application logic
   Local-first PDF reader/annotator. Rendering engine: pdf.js (client-side).
   This file deliberately keeps all PDF calls behind small wrapper functions
   (loadDocument / renderPageCanvas / getPageText) so a future native engine
   (per the architecture pack's Mukorob PDF Core / FFI boundary) could be
   swapped in without rewriting the UI layer above it.
   ========================================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const DEFAULT_SETTINGS = {
  name: 'Mukorob PDF',
  tagline: 'One Platform. One Organisation. One View.',
  logo: 'icons/mukorob-brand.jpg',
  dashboardLogo: 'icons/mukorob-brand.jpg',
  loginIconLogo: 'icons/mukorob-icon.jpg',
  loginBackgroundLogo: 'icons/mukorob-brand.jpg',
  primary: '#0B4F8A',
  accent: '#E2A321',
  notice: '',
  annotationsEnabled: true,
  recentEnabled: true,
  pinHash: null,
  pinSalt: null,
  theme: 'dark',
  renderQuality: 'high',
  companyStamp: null,
  accessCode: ''
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  adminUnlocked: false,
  pdfDoc: null,
  fileHash: null,
  fileName: '',
  fileBytesForExport: null,
  numPages: 0,
  scale: 1.0,
  baseViewport: null, // page 1 viewport at scale 1
  pageEls: [],        // { wrap, canvasHolder, canvas, annotLayer, rendered, rendering, textContent }
  observer: null,
  currentPage: 1,
  annotations: [],     // {id,page,type,color,rect|points,text}
  undoStack: [],
  redoStack: [],
  activeTool: 'select',
  drawing: null,
  searchQuery: '',
  searchMatches: [],  // {page, itemIndex}
  searchIndex: -1,
  pageTextCache: new Map(),
  pageDimensions: new Map(),
  adminEditingUserId: null,
  pendingLaunchFiles: [],
  loginFailures: 0,
  loginLockedUntil: 0,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */
/* Mobile PDF touch controls: two-finger pinch zoom without browser-page zoom.
   One-finger scrolling remains native; only two-finger gestures are intercepted. */
function installMobileTouchZoom(){
  const pages=$('#pagesContainer');
  if(!pages||pages.dataset.touchZoomInstalled)return;
  pages.dataset.touchZoomInstalled='1';
  let pinchStart=0, scaleStart=1, active=false, lastApplied=1, raf=0, pending=1;
  const distance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  pages.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      active=true; pinchStart=distance(e.touches[0],e.touches[1]); scaleStart=state.scale; lastApplied=scaleStart; pending=scaleStart;
      if(raf){cancelAnimationFrame(raf);raf=0;}
    }
  },{passive:false});
  pages.addEventListener('touchmove',e=>{
    if(!active||e.touches.length!==2)return;
    e.preventDefault();
    const d=distance(e.touches[0],e.touches[1]);
    if(pinchStart<=0)return;
    pending=Math.min(4,Math.max(.3,scaleStart*(d/pinchStart)));
    if(Math.abs(pending-lastApplied)<0.035)return;
    if(!raf){
      raf=requestAnimationFrame(()=>{raf=0;lastApplied=pending;setScale(pending);});
    }
  },{passive:false});
  const end=()=>{
    if(active && Math.abs(state.scale-pending)>0.01) setScale(pending);
    active=false;pinchStart=0;if(raf){cancelAnimationFrame(raf);raf=0;}
  };
  pages.addEventListener('touchend',end,{passive:true});
  pages.addEventListener('touchcancel',end,{passive:true});
}

window.addEventListener('DOMContentLoaded', async () => {
  installMobileTouchZoom();
  await loadSettings();
  applySettings();
  wireGlobalUI();
  wireAdminUI();
  wireAnnotationUI();
  wireSearchUI();
  // Recent documents are rendered only after authentication so one local user
  // can never see another user's document list behind the login screen.
  registerServiceWorker();
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      const entry = params.files && params.files[0];
      if (!entry) return;
      try {
        const file = await entry.getFile();
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return;
        if (!state.auth.user || !hasPermission('open')) { state.pendingLaunchFiles.push(file); return; }
        openFile(file);
      } catch (_) {}
    });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.adminUnlocked) state.adminUnlocked = false;
});

function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

/* ---------------------------------------------------------------------- */
/* Settings / branding                                                    */
/* ---------------------------------------------------------------------- */
async function loadSettings() {
  const saved = await MukorobDB.get('settings', 'config');
  if (saved && saved.value) state.settings = { ...DEFAULT_SETTINGS, ...saved.value };
}

async function saveSettings() {
  await MukorobDB.put('settings', { key: 'config', value: state.settings });
}

function applySettings() {
  const s = state.settings;
  document.documentElement.style.setProperty('--primary', s.primary);
  document.documentElement.style.setProperty('--accent', s.accent);
  document.documentElement.setAttribute('data-theme', s.theme);
  document.title = s.name;
  $('#brandName').textContent = s.name;
  $('#brandTag').textContent = s.tagline;
  $('#emptyTitle').textContent = s.name;
  $('#emptyTag').textContent = s.tagline;
  const headerLogo = s.logo || 'icons/mukorob-brand.jpg';
  const dashboardLogo = s.dashboardLogo || headerLogo;
  $('#brandLogo').src = headerLogo;
  $('.empty-mark').src = dashboardLogo;
  $('meta[name="theme-color"]').setAttribute('content', s.primary);
  window.dispatchEvent(new CustomEvent('mukorob:settings-applied', { detail: { settings: s } }));
  const notice = $('#staffNotice');
  if (s.notice && s.notice.trim()) {
    notice.hidden = false;
    notice.textContent = s.notice;
  } else {
    notice.hidden = true;
  }
  $('#btnAnnotate').style.display = s.annotationsEnabled ? '' : 'none';
  $('#sidebar').querySelector('[data-tab="recent"]').style.display = s.recentEnabled ? '' : 'none';
}

/* ---------------------------------------------------------------------- */
/* Global UI wiring                                                       */
/* ---------------------------------------------------------------------- */
function wireGlobalUI() {
  const fileInput = $('#fileInput');
  $('#btnOpen').addEventListener('click', () => fileInput.click());
  $('#btnOpenEmpty').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) openFile(e.target.files[0]);
    fileInput.value = '';
  });

  ['dragover', 'drop'].forEach((ev) =>
    window.addEventListener(ev, (e) => e.preventDefault())
  );
  window.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') openFile(f);
  });

  // theme cycle: dark -> light -> sepia -> high contrast -> dark
  $('#btnLoginTop')?.addEventListener('click', () => showAuth('login'));
  $('#btnTheme').addEventListener('click', () => {
    const order = ['dark', 'light', 'sepia', 'contrast'];
    const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
    state.settings.theme = next;
    applySettings();
    saveSettings();
  });

  // sidebar tabs
  $$('.tab-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $('#panelThumbs').hidden = tab !== 'thumbs';
      $('#panelRecent').hidden = tab !== 'recent';
    })
  );

  // Mobile + desktop document controls
  $('#btnPagesToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#btnZoomIn').addEventListener('click', () => setScale(state.scale * 1.2));
  $('#btnZoomOut').addEventListener('click', () => setScale(state.scale / 1.2));
  $('#btnZoomInTop').addEventListener('click', () => setScale(state.scale * 1.2));
  $('#btnZoomOutTop').addEventListener('click', () => setScale(state.scale / 1.2));
  $('#btnFitWidth').addEventListener('click', fitWidth);
  $('#btnFitPage').addEventListener('click', fitPage);
  $('#btnPrevPage').addEventListener('click', () => goToPage(state.currentPage - 1));
  $('#btnNextPage').addEventListener('click', () => goToPage(state.currentPage + 1));
  $('#pageJump').addEventListener('change', () => {
    const n = parseInt($('#pageJump').value, 10);
    if (Number.isFinite(n)) goToPage(n);
    else updatePageIndicator();
  });
  $('#pageJump').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(e.currentTarget.value, 10);
      if (Number.isFinite(n)) goToPage(n);
      e.currentTarget.blur();
    }
  });
  $('#btnDownload').addEventListener('click', downloadOriginalPdf);
  $('#btnCloseDocument').addEventListener('click', closeDocument);
  $('#btnCloseMobile').addEventListener('click', closeDocument);
  $('#btnFullscreen').addEventListener('click', toggleFullscreen);
  $('#btnAnnotate').addEventListener('click', () => toggleAnnotToolbar());

  // click outside sidebar closes it on mobile
  $('#viewer').addEventListener('click', () => {
    if (window.innerWidth < 720) $('#sidebar').classList.remove('open');
  });

  window.addEventListener('keydown', (e) => {
    if (!state.pdfDoc) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') { closeDocument(); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(state.currentPage + 1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage(state.currentPage - 1);
    if (e.key === '+' || e.key === '=') setScale(state.scale * 1.2);
    if (e.key === '-' || e.key === '_') setScale(state.scale / 1.2);
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setScale(1); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      printOriginalPdf();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
    }
  });

  window.addEventListener('resize', () => {
    if (state.pdfDoc) layoutPages();
  });
}

/* ---------------------------------------------------------------------- */
/* File hashing (content hash -> ties recent files & annotations to the
   actual bytes, not just the filename)                                   */
/* ---------------------------------------------------------------------- */
async function hashBytes(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------------------------------------------------------------------- */
/* Opening a document                                                     */
/* ---------------------------------------------------------------------- */
async function openFile(file, fileHandle = null) {
  if (!state.auth.user) { showAuth('login'); toast('Please sign in before opening a document.'); return; }
  if (!hasPermission('open')) { toast('Your account does not have permission to open PDFs.'); return; }
  try {
    toast('Opening ' + file.name + '…');
    const buf = await file.arrayBuffer();
    const hash = await hashBytes(buf.slice(0));
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;

    resetViewerState();
    state.pdfDoc = doc;
    state.fileHash = hash;
    state.fileName = file.name;
    state.fileBytesForExport = buf;
    state.numPages = doc.numPages;

    $('#emptyState').hidden = true;
    $('#pagesContainer').hidden = false;
    $('#docTitleWrap').hidden = false;
    $('#docTitle').textContent = file.name.replace(/\.pdf$/i, '');
    $('#btnSearch').disabled = false;

    const first = await doc.getPage(1);
    state.baseViewport = first.getViewport({ scale: 1 });

    await buildPageShells();
    layoutPages();
    setupObserver();
    updatePageIndicator();
    buildThumbnails();

    state.annotations = (await MukorobDB.get('annotations_scoped', scopedKey(hash)))?.items || [];
    redrawAllAnnotations();

    await saveRecent(file, hash, fileHandle);
    await renderRecentList();
    window.dispatchEvent(new CustomEvent('mukorob:document-opened', { detail: { hash, name: file.name, openedAt: Date.now() } }));
    toast(file.name + ' loaded — ' + state.numPages + ' pages');
  } catch (err) {
    console.error(err);
    toast('Could not open that PDF.');
  }
}

async function closeDocument() {
  const doc = state.pdfDoc;
  if (state.observer) state.observer.disconnect();
  closeSearch();
  $('#annotToolbar').hidden = true;
  $('#sidebar').classList.remove('open');
  if (doc) {
    try { await doc.destroy(); } catch (_) {}
  }
  state.pdfDoc = null;
  state.fileHash = null;
  state.fileName = '';
  state.fileBytesForExport = null;
  state.numPages = 0;
  state.baseViewport = null;
  state.pageEls = [];
  state.annotations = [];
  state.undoStack = [];
  state.redoStack = [];
  state.pageTextCache = new Map();
  state.pageDimensions = new Map();
  state.searchMatches = [];
  state.searchIndex = -1;
  state.scale = 1;
  $('#pagesContainer').innerHTML = '';
  $('#pagesContainer').hidden = true;
  $('#emptyState').hidden = false;
  $('#docTitleWrap').hidden = true;
  $('#docTitle').textContent = '—';
  $('#pageIndicator').textContent = '– / –';
  $('#panelThumbs').innerHTML = '';
  $('#btnSearch').disabled = true;
  updateZoomControls();
  window.dispatchEvent(new CustomEvent('mukorob:document-closed'));
  toast('Document closed');
}

function resetViewerState() {
  state.pdfDoc = null;
  state.pageEls = [];
  state.annotations = [];
  state.undoStack = [];
  state.redoStack = [];
  state.pageTextCache = new Map();
  state.pageDimensions = new Map();
  state.searchMatches = [];
  state.searchIndex = -1;
  state.scale = 1.0;
  state.currentPage = 1;
  $('#pagesContainer').innerHTML = '';
  if ($('#pageJump')) $('#pageJump').value = 1;
  if ($('#zoomLabelTop')) $('#zoomLabelTop').textContent = '100%';
  $('#panelThumbs').innerHTML = '';
  if (state.observer) state.observer.disconnect();
}

/* ---------------------------------------------------------------------- */
/* Page shells + virtualization                                           */
/* ---------------------------------------------------------------------- */
async function buildPageShells() {
  const container = $('#pagesContainer');
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= state.numPages; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page';
    wrap.dataset.page = i;

    const placeholder = document.createElement('div');
    placeholder.className = 'page-placeholder';
    placeholder.textContent = 'Page ' + i;
    wrap.appendChild(placeholder);

    frag.appendChild(wrap);
    state.pageEls.push({ wrap, placeholder, canvas: null, annotLayer: null, rendered: false, rendering: false });
  }
  container.appendChild(frag);
}

function layoutPages() {
  if (!state.baseViewport) return;
  const w = state.baseViewport.width * state.scale;
  const h = state.baseViewport.height * state.scale;
  state.pageEls.forEach((p) => {
    p.wrap.style.width = w + 'px';
    p.wrap.style.height = h + 'px';
    if (p.canvas) {
      p.canvas.style.width = '100%';
      p.canvas.style.height = '100%';
    }
    if (p.rendered) {
      p.rendered = false; // force re-render at new scale next time it's visible
      renderPage(state.pageEls.indexOf(p) + 1, true);
    }
  });
  $('#zoomLabelMobile').textContent = Math.round(state.scale * 100) + '%';
}

function setScale(newScale) {
  state.scale = Math.min(4, Math.max(0.3, newScale));
  layoutPages();
  updateZoomControls();
}

function updateZoomControls() {
  const hasDoc = !!state.pdfDoc;
  ['#btnPrevPage','#btnNextPage','#pageJump','#btnZoomOutTop','#btnZoomInTop','#btnFitWidth','#btnFitPage','#btnDownload','#btnCloseDocument']
    .forEach(sel => { $(sel).disabled = !hasDoc; });
  $('#pageJump').value = state.currentPage || 1;
  $('#pageJump').max = state.numPages || 1;
  $('#zoomLabelTop').textContent = Math.round(state.scale * 100) + '%';
  $('#zoomLabelMobile').textContent = Math.round(state.scale * 100) + '%';
  $('#btnPrevPage').disabled = !hasDoc || state.currentPage <= 1;
  $('#btnNextPage').disabled = !hasDoc || state.currentPage >= state.numPages;
}

function fitWidth() {
  if (!state.pdfDoc || !state.baseViewport) return;
  const available = Math.max(280, $('#viewer').clientWidth - 40);
  setScale(available / state.baseViewport.width);
}

function fitPage() {
  if (!state.pdfDoc || !state.baseViewport) return;
  const availableW = Math.max(280, $('#viewer').clientWidth - 40);
  const availableH = Math.max(280, $('#viewer').clientHeight - 40);
  setScale(Math.min(availableW / state.baseViewport.width, availableH / state.baseViewport.height));
}

function downloadOriginalPdf() {
  if (!state.fileBytesForExport) return;
  const blob = new Blob([state.fileBytesForExport], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = state.fileName || 'document.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printOriginalPdf() {
  if (!state.fileBytesForExport) return;
  const blob = new Blob([state.fileBytesForExport], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  let frame = document.getElementById('mukorobPrintFrame');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'mukorobPrintFrame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
  }
  const cleanup = () => URL.revokeObjectURL(url);
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      toast('Could not open the print dialog for this PDF.');
    }
    setTimeout(cleanup, 60000);
  };
  frame.src = url;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await $('#app').requestFullscreen();
    else await document.exitFullscreen();
  } catch (_) {
    toast('Fullscreen is not available in this browser.');
  }
}

function getViewportCurrentPage() {
  const viewer = $('#viewer');
  if (!viewer || !state.pageEls.length) return state.currentPage || 1;
  const vr = viewer.getBoundingClientRect();
  const centerY = vr.top + vr.height / 2;
  let bestPage = state.currentPage || 1;
  let bestDistance = Infinity;
  state.pageEls.forEach((p, index) => {
    if (!p?.wrap) return;
    const r = p.wrap.getBoundingClientRect();
    if (r.bottom <= vr.top || r.top >= vr.bottom) return;
    const distance = Math.abs((r.top + r.height / 2) - centerY);
    if (distance < bestDistance) { bestDistance = distance; bestPage = index + 1; }
  });
  return bestPage;
}
function syncCurrentPageFromViewport() {
  const page = getViewportCurrentPage();
  if (page !== state.currentPage) { state.currentPage = page; updatePageIndicator(); highlightCurrentThumb(); }
  return page;
}
function setupObserver() {
  if (state.observer) state.observer.disconnect();
  const viewer = $('#viewer');
  if (!viewer) return;
  state.observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const pageNum = Number(entry.target.dataset.page);
      if (entry.isIntersecting) renderPage(pageNum); else unrenderPage(pageNum);
    });
    syncCurrentPageFromViewport();
  }, { root: viewer, rootMargin: '1200px 0px 1200px 0px', threshold: [0, 0.5] });
  state.pageEls.forEach((p) => state.observer.observe(p.wrap));
  if (state._pageScrollHandler) viewer.removeEventListener('scroll', state._pageScrollHandler);
  let scrollTimer = null;
  state._pageScrollHandler = () => {
    if (scrollTimer) return;
    scrollTimer = requestAnimationFrame(() => { scrollTimer = null; syncCurrentPageFromViewport(); });
  };
  viewer.addEventListener('scroll', state._pageScrollHandler, { passive: true });
  state.pageEls.forEach((p, index) => {
    if (p.wrap.dataset.currentPageWired) return;
    p.wrap.dataset.currentPageWired = '1';
    p.wrap.addEventListener('pointerdown', () => {
      state.currentPage = index + 1; updatePageIndicator(); highlightCurrentThumb();
    }, { passive: true });
  });
  syncCurrentPageFromViewport();
}

async function renderPage(pageNum, force = false) {
  const p = state.pageEls[pageNum - 1];
  if (!p || (p.rendered && !force)) return;
  if (p.rendering) {
    if (!force) return;
    const started = Date.now();
    while (p.rendering && Date.now() - started < 5000) await new Promise(resolve => setTimeout(resolve, 16));
    if (p.rendering) return;
  }
  p.rendering = true;
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    // Render above CSS resolution so small text and text embedded in scanned/image PDFs
    // remain as sharp as the source permits. A high-quality cap prevents runaway memory use.
    const dpr = window.devicePixelRatio || 1;
    const outputScale = Math.min(4, Math.max(2, dpr * 1.25));
    const viewport = page.getViewport({ scale: state.scale * outputScale });
    const cssViewport = page.getViewport({ scale: state.scale });

    if (!p.canvas) {
      p.canvas = document.createElement('canvas');
      p.canvas.className = 'page-canvas';
      p.wrap.innerHTML = '';
      p.wrap.appendChild(p.canvas);
      const annot = document.createElement('div');
      annot.className = 'annot-layer';
      p.wrap.appendChild(annot);
      p.annotLayer = annot;
    }
    p.canvas.width = viewport.width;
    p.canvas.height = viewport.height;
    p.canvas.style.width = cssViewport.width + 'px';
    p.canvas.style.height = cssViewport.height + 'px';

    const ctx = p.canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;
    p.rendered = true;
    drawAnnotationsForPage(pageNum);
  } catch (err) {
    console.error('render error', pageNum, err);
  } finally {
    p.rendering = false;
  }
}

function unrenderPage(pageNum) {
  const p = state.pageEls[pageNum - 1];
  if (!p || !p.rendered) return;
  // keep a buffer around the visible area rendered; free the canvas bitmap
  // beyond that to bound memory on very large documents.
  p.canvas.width = 0;
  p.canvas.height = 0;
  p.rendered = false;
  const ph = document.createElement('div');
  ph.className = 'page-placeholder';
  ph.textContent = 'Page ' + pageNum;
  ph.style.width = '100%';
  ph.style.height = '100%';
  p.wrap.innerHTML = '';
  p.wrap.appendChild(ph);
  p.canvas = null;
  p.annotLayer = null;
}

function goToPage(n) {
  n = Math.max(1, Math.min(state.numPages, n));
  const p = state.pageEls[n - 1];
  if (p) p.wrap.scrollIntoView({ block: 'start' });
}

function updatePageIndicator() {
  $('#pageIndicator').textContent = state.currentPage + ' / ' + state.numPages;
  if ($('#pageJump')) $('#pageJump').value = state.currentPage;
  updateZoomControls();
}

/* ---------------------------------------------------------------------- */
/* Thumbnails                                                              */
/* ---------------------------------------------------------------------- */
async function buildThumbnails() {
  const panel = $('#panelThumbs');
  panel.innerHTML = '';
  const scale = 120 / state.baseViewport.width;
  for (let i = 1; i <= state.numPages; i++) {
    const item = document.createElement('div');
    item.className = 'thumb-item';
    item.dataset.page = i;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(state.baseViewport.width * scale);
    canvas.height = Math.round(state.baseViewport.height * scale);
    const label = document.createElement('div');
    label.className = 'thumb-num';
    label.textContent = i;
    item.appendChild(canvas);
    item.appendChild(label);
    item.addEventListener('click', () => {
      goToPage(i);
      if (window.innerWidth < 720) $('#sidebar').classList.remove('open');
    });
    panel.appendChild(item);
  }
  // Lazily paint thumbnails as they scroll into view of the panel.
  const thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const n = Number(el.dataset.page);
        thumbObserver.unobserve(el);
        const page = await state.pdfDoc.getPage(n);
        const vp = page.getViewport({ scale });
        const canvas = el.querySelector('canvas');
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      });
    },
    { root: panel, rootMargin: '400px 0px 400px 0px' }
  );
  panel.querySelectorAll('.thumb-item').forEach((el) => thumbObserver.observe(el));
}

function highlightCurrentThumb() {
  $$('.thumb-item').forEach((el) =>
    el.classList.toggle('current', Number(el.dataset.page) === state.currentPage)
  );
}

/* ---------------------------------------------------------------------- */
/* Text extraction + search                                                */
/* ---------------------------------------------------------------------- */
async function getPageText(pageNum) {
  if (state.pageTextCache.has(pageNum)) return state.pageTextCache.get(pageNum);
  const page = await state.pdfDoc.getPage(pageNum);
  const content = await page.getTextContent();
  state.pageTextCache.set(pageNum, content);
  return content;
}

function wireSearchUI() {
  $('#btnSearch').addEventListener('click', openSearch);
  $('#searchClose').addEventListener('click', closeSearch);
  $('#searchInput').addEventListener('input', debounce(runSearch, 250));
  $('#searchNext').addEventListener('click', () => stepSearch(1));
  $('#searchPrev').addEventListener('click', () => stepSearch(-1));
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') stepSearch(e.shiftKey ? -1 : 1);
    if (e.key === 'Escape') closeSearch();
  });
}

function openSearch() {
  if (!state.pdfDoc) return;
  $('#searchBar').hidden = false;
  $('#searchInput').focus();
}
function closeSearch() {
  $('#searchBar').hidden = true;
  clearSearchHighlight();
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

async function runSearch() {
  const q = $('#searchInput').value.trim().toLowerCase();
  state.searchQuery = q;
  state.searchMatches = [];
  state.searchIndex = -1;
  clearSearchHighlight();
  if (!q) {
    $('#searchCount').textContent = '0 / 0';
    return;
  }
  for (let n = 1; n <= state.numPages; n++) {
    const content = await getPageText(n);
    content.items.forEach((item, idx) => {
      if (item.str && item.str.toLowerCase().includes(q)) {
        state.searchMatches.push({ page: n, itemIndex: idx });
      }
    });
  }
  $('#searchCount').textContent = (state.searchMatches.length ? 1 : 0) + ' / ' + state.searchMatches.length;
  if (state.searchMatches.length) stepSearch(1, true);
}

async function stepSearch(dir, first = false) {
  if (!state.searchMatches.length) return;
  clearSearchHighlight();
  if (first) state.searchIndex = 0;
  else state.searchIndex = (state.searchIndex + dir + state.searchMatches.length) % state.searchMatches.length;
  const match = state.searchMatches[state.searchIndex];
  $('#searchCount').textContent = (state.searchIndex + 1) + ' / ' + state.searchMatches.length;
  goToPage(match.page);
  // give the page a tick to render before overlaying the highlight
  setTimeout(() => showMatchHighlight(match), 120);
}

async function showMatchHighlight(match) {
  const p = state.pageEls[match.page - 1];
  if (!p || !p.wrap) return;
  await renderPage(match.page);
  const page = await state.pdfDoc.getPage(match.page);
  const content = await getPageText(match.page);
  const item = content.items[match.itemIndex];
  if (!item) return;
  const viewport = page.getViewport({ scale: state.scale });
  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const overallScale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const box = document.createElement('div');
  box.className = 'search-hit-box';
  box.style.position = 'absolute';
  box.style.left = tx[4] + 'px';
  box.style.top = (tx[5] - fontHeight) + 'px';
  box.style.width = Math.max(4, item.width * overallScale) + 'px';
  box.style.height = fontHeight * 1.2 + 'px';
  box.style.background = 'rgba(199,123,74,.55)';
  box.style.pointerEvents = 'none';
  box.style.borderRadius = '2px';
  p.wrap.appendChild(box);
}

function clearSearchHighlight() {
  $$('.search-hit-box').forEach((el) => el.remove());
}

/* ---------------------------------------------------------------------- */
/* Annotations                                                             */
/* ---------------------------------------------------------------------- */
function wireAnnotationUI() {
  $$('.tool-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.activeTool = btn.dataset.tool;
      $$('.tool-btn').forEach((b) => b.classList.toggle('active', b === btn));
      state.pageEls.forEach((p) => {
        if (!p.annotLayer) return;
        p.annotLayer.className = 'annot-layer' + (state.activeTool !== 'select' ? ' tool-' + state.activeTool : '');
      });
    })
  );
  $('#btnCloseAnnot').addEventListener('click', () => (($('#annotToolbar').hidden = true), setTool('select')));
  $('#btnUndoAnnot').addEventListener('click', undoAnnotation);
  $('#btnRedoAnnot').addEventListener('click', redoAnnotation);
  $('#btnExportAnnotated').addEventListener('click', exportAnnotatedPdf);

  $('#noteSave').addEventListener('click', saveNotePopover);
  $('#noteDelete').addEventListener('click', deleteNotePopover);
}

function toggleAnnotToolbar() {
  if (!state.settings.annotationsEnabled) {
    toast('Annotations are turned off in Admin settings.');
    return;
  }
  const tb = $('#annotToolbar');
  tb.hidden = !tb.hidden;
  if (!tb.hidden) setTool('highlight');
}
function setTool(tool) {
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (btn) btn.click();
}

// Attach pointer handling to a page's annot layer once it exists.
function attachAnnotPointerHandlers(pageNum, layer) {
  let path = null;
  let startPt = null;

  const toNorm = (e) => {
    const r = layer.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  layer.addEventListener('pointerdown', (e) => {
    if (state.activeTool === 'select') return;
    layer.setPointerCapture(e.pointerId);
    const pt = toNorm(e);
    if (state.activeTool === 'highlight') {
      startPt = pt;
    } else if (state.activeTool === 'ink') {
      path = [pt];
    } else if (state.activeTool === 'note') {
      openNotePopover(pageNum, pt, null);
    } else if (state.activeTool === 'signature') {
      /* E-signature placement is owned exclusively by modules/annotations.js. */
    }
  });

  layer.addEventListener('pointermove', (e) => {
    if (state.activeTool === 'ink' && path) {
      path.push(toNorm(e));
      drawAnnotationsForPage(pageNum, { type: 'ink', color: $('#annotColor').value, points: path, page: pageNum });
    } else if (state.activeTool === 'highlight' && startPt) {
      const cur = toNorm(e);
      drawAnnotationsForPage(pageNum, rectFromPoints(startPt, cur, pageNum));
    }
  });

  layer.addEventListener('pointerup', (e) => {
    if (state.activeTool === 'highlight' && startPt) {
      const cur = toNorm(e);
      const rect = rectFromPoints(startPt, cur, pageNum);
      if (rect.rect.w > 0.005 && rect.rect.h > 0.003) addAnnotation(rect);
      startPt = null;
      drawAnnotationsForPage(pageNum);
    } else if (state.activeTool === 'ink' && path) {
      if (path.length > 1) addAnnotation({ type: 'ink', color: $('#annotColor').value, points: path, page: pageNum });
      path = null;
      drawAnnotationsForPage(pageNum);
    }
  });
}

function rectFromPoints(a, b, page) {
  return {
    type: 'highlight',
    color: $('#annotColor').value,
    page,
    rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) },
  };
}

function addAnnotation(a) {
  const needed = a.type === 'signature' ? 'signature' : (a.type === 'stamp' ? 'stamp' : 'annotate');
  if (!hasPermission(needed)) return false;
  a.id = 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  a.createdAt = Date.now();
  state.annotations.push(a);
  state.undoStack.push({ op: 'add', id: a.id });
  state.redoStack = [];
  persistAnnotations();
  return true;
}

function undoAnnotation() {
  const last = state.undoStack.pop();
  if (!last) return;
  if (last.op === 'add') {
    const idx = state.annotations.findIndex((x) => x.id === last.id);
    if (idx > -1) {
      const [removed] = state.annotations.splice(idx, 1);
      state.redoStack.push({ op: 'add', annotation: removed });
      drawAnnotationsForPage(removed.page);
    }
  }
  persistAnnotations();
}
function redoAnnotation() {
  const last = state.redoStack.pop();
  if (!last) return;
  state.annotations.push(last.annotation);
  state.undoStack.push({ op: 'add', id: last.annotation.id });
  drawAnnotationsForPage(last.annotation.page);
  persistAnnotations();
}

async function persistAnnotations() {
  if (!state.fileHash) return;
  await MukorobDB.put('annotations_scoped', { id: scopedKey(state.fileHash), userId: currentUserId(), hash: state.fileHash, items: state.annotations, updatedAt: Date.now() });
}

function redrawAllAnnotations() {
  const pages = new Set(state.annotations.map((a) => a.page));
  pages.forEach((p) => drawAnnotationsForPage(p));
}

function drawAnnotationsForPage(pageNum, liveDraft = null) {
  const p = state.pageEls[pageNum - 1];
  if (!p || !p.annotLayer) return;
  const layer = p.annotLayer;
  layer.innerHTML = '';
  const w = p.canvas.clientWidth || (state.baseViewport.width * state.scale);
  const h = p.canvas.clientHeight || (state.baseViewport.height * state.scale);

  const items = state.annotations.filter((a) => a.page === pageNum);
  const draw = (a) => {
    if (a.type === 'highlight') {
      const d = document.createElement('div');
      d.style.position = 'absolute';
      d.style.left = a.rect.x * w + 'px';
      d.style.top = a.rect.y * h + 'px';
      d.style.width = a.rect.w * w + 'px';
      d.style.height = a.rect.h * h + 'px';
      d.style.background = hexToRgba(a.color, 0.4);
      d.style.borderRadius = '2px';
      layer.appendChild(d);
    } else if (a.type === 'ink') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', a.points.map((pt) => `${pt.x * w},${pt.y * h}`).join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', a.color);
      poly.setAttribute('stroke-width', '2.4');
      poly.setAttribute('stroke-linecap', 'round');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
      layer.appendChild(svg);
    } else if (a.type === 'signature') {
      /* Interactive signatures are rendered by modules/annotations.js only. */
    } else if (a.type === 'note') {
      const m = document.createElement('div');
      m.className = 'note-marker';
      m.style.left = a.rect.x * w + 'px';
      m.style.top = a.rect.y * h + 'px';
      m.style.background = a.color;
      m.style.pointerEvents = 'auto';
      m.textContent = '!';
      m.title = a.text || '';
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        openNotePopover(pageNum, a.rect, a);
      });
      layer.appendChild(m);
    }
  };
  items.forEach(draw);
  if (liveDraft) draw(liveDraft);
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

let noteContext = null;
function openNotePopover(pageNum, pt, existing) {
  noteContext = { pageNum, pt, existing };
  const pop = $('#notePopover');
  const p = state.pageEls[pageNum - 1];
  const rect = p.wrap.getBoundingClientRect();
  pop.style.left = Math.min(rect.left + pt.x * rect.width, window.innerWidth - 220) + 'px';
  pop.style.top = rect.top + pt.y * rect.height + 'px';
  $('#noteText').value = existing ? existing.text || '' : '';
  $('#noteDelete').style.display = existing ? '' : 'none';
  pop.hidden = false;
  $('#noteText').focus();
}
function saveNotePopover() {
  if (!noteContext) return;
  const { pageNum, pt, existing } = noteContext;
  const text = $('#noteText').value.trim();
  if (existing) {
    existing.text = text;
  } else if (text) {
    addAnnotation({ type: 'note', color: $('#annotColor').value, page: pageNum, rect: { x: pt.x, y: pt.y }, text });
  }
  persistAnnotations();
  drawAnnotationsForPage(pageNum);
  $('#notePopover').hidden = true;
  noteContext = null;
}
function deleteNotePopover() {
  if (!noteContext || !noteContext.existing) return;
  const idx = state.annotations.findIndex((a) => a.id === noteContext.existing.id);
  if (idx > -1) state.annotations.splice(idx, 1);
  persistAnnotations();
  drawAnnotationsForPage(noteContext.pageNum);
  $('#notePopover').hidden = true;
  noteContext = null;
}

/* ---------------------------------------------------------------------- */
/* Export with annotations flattened (via pdf-lib)                        */
/* ---------------------------------------------------------------------- */
async function exportAnnotatedPdf() {
  if (!state.fileBytesForExport) return;
  if (!state.annotations.length) {
    toast('No annotations to export yet.');
    return;
  }
  toast('Preparing annotated copy…');
  try {
    const { PDFDocument, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.load(state.fileBytesForExport);
    const pages = pdfDoc.getPages();
    const annotationGeometry = window.MukorobAnnotations;
    const normalizedToPdfPoints = annotationGeometry?.normalizedToPdfPoints || ((r,W,H) => ({
      x:r.x*W, y:(1-r.y-r.h)*H, w:r.w*W, h:r.h*H
    }));
    const imageCache = new Map();

    for (const a of state.annotations) {
      const page = pages[a.page - 1];
      if (!page) continue;
      const { width, height } = page.getSize();
      const col = hexToRgbFloat(a.color || '#0B4F8A');
      const rotation = Number(state.pageRotations?.get(a.page) || 0);
      const box = normalizedToPdfPoints(a.rect, width, height, rotation);

      if (a.type === 'highlight') {
        page.drawRectangle({
          x: box.x, y: box.y, width: box.w, height: box.h,
          color: rgb(col.r, col.g, col.b), opacity: 0.35,
        });
      } else if (a.type === 'ink') {
        for (let i = 1; i < a.points.length; i++) {
          const p0 = a.points[i - 1], p1 = a.points[i];
          page.drawLine({
            start: { x: p0.x * width, y: height - p0.y * height },
            end: { x: p1.x * width, y: height - p1.y * height },
            thickness: 2, color: rgb(col.r, col.g, col.b),
          });
        }
      } else if (a.type === 'signature') {
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique);
        page.drawText(a.text || 'Signature', {
          x: box.x,
          y: box.y + box.h * 0.22,
          size: Math.max(10, box.h * 0.72),
          font,
          color: rgb(col.r, col.g, col.b),
        });
      } else if (a.type === 'stamp' && a.src) {
        let image = imageCache.get(a.src);
        if (!image) {
          const match = String(a.src).match(/^data:(image[^;]+);base64,(.+)$/i);
          if (!match) continue;
          const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
          image = /^image\/png$/i.test(match[1])
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes);
          imageCache.set(a.src, image);
        }
        page.drawImage(image, { x: box.x, y: box.y, width: box.w, height: box.h });
      } else if (a.type === 'note') {
        const x = a.rect.x * width;
        const y = height - a.rect.y * height;
        page.drawRectangle({ x, y: y - 10, width: 10, height: 10, color: rgb(col.r, col.g, col.b) });
        if (a.text) {
          page.drawText(a.text.slice(0, 90), {
            x: x + 14, y: y - 10, size: 8, color: rgb(col.r, col.g, col.b),
          });
        }
      }
    }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.fileName.replace(/\\.pdf$/i, '') + ' (annotated).pdf';
    link.click();
    URL.revokeObjectURL(url);
    toast('Annotated copy downloaded.');
  } catch (err) {
    console.error(err);
    toast('Export failed — see console for details.');
  }
}
function hexToRgbFloat(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

/* Hook annot layer creation into renderPage by patching after canvas built */
const _origRenderPage = renderPage;
renderPage = async function (pageNum, force) {
  await _origRenderPage(pageNum, force);
  const p = state.pageEls[pageNum - 1];
  if (p && p.annotLayer && !p.annotLayer.dataset.wired) {
    p.annotLayer.dataset.wired = '1';
    attachAnnotPointerHandlers(pageNum, p.annotLayer);
    if (state.activeTool !== 'select') p.annotLayer.className = 'annot-layer tool-' + state.activeTool;
  }
};

/* v0.6 user-scoped local storage. Documents and annotations are isolated by
   the signed-in user even when several Bradz staff members share one device. */
function currentUserId() { return state.auth.user?.id || 'anonymous'; }
function scopedKey(hash) { return currentUserId() + '::' + hash; }
async function getCurrentUserRecent() {
  const all = await MukorobDB.getAll('recent_scoped');
  return all.filter(r => r.userId === currentUserId());
}
async function migrateLegacyOwnerData(user) {
  if (!user || user.role !== 'superadmin') return;
  try {
    const legacyRecent = await MukorobDB.getAll('recent');
    for (const r of legacyRecent) {
      const id = user.id + '::' + r.hash;
      if (!(await MukorobDB.get('recent_scoped', id))) {
        await MukorobDB.put('recent_scoped', { ...r, id, userId: user.id });
      }
    }
    const legacyAnnotations = await MukorobDB.getAll('annotations');
    for (const r of legacyAnnotations) {
      const id = user.id + '::' + r.hash;
      if (!(await MukorobDB.get('annotations_scoped', id))) {
        await MukorobDB.put('annotations_scoped', { ...r, id, userId: user.id });
      }
    }
  } catch (err) { console.warn('Legacy local data migration skipped', err); }
}

/* ---------------------------------------------------------------------- */
/* Recent files                                                            */
/* ---------------------------------------------------------------------- */
async function saveRecent(file, hash, fileHandle) {
  if (!state.settings.recentEnabled) return;
  let thumb = null;
  try {
    const page = await state.pdfDoc.getPage(1);
    const vp = page.getViewport({ scale: 60 / state.baseViewport.width });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    thumb = canvas.toDataURL('image/png');
  } catch (e) { /* thumbnail is a nice-to-have, ignore failures */ }

  // Store the actual bytes so this document reopens instantly next time,
  // with no "please locate this file again" prompt — works on every
  // browser/device, not just ones with the File System Access API.
  let bytes = null;
  try { bytes = new Blob([state.fileBytesForExport], { type: 'application/pdf' }); } catch (e) { /* fall back to handle/re-pick */ }

  try {
    await MukorobDB.put('recent_scoped', {
      id: scopedKey(hash),
      userId: currentUserId(),
      hash,
      name: file.name,
      size: file.size,
      pages: state.numPages,
      lastOpened: Date.now(),
      thumb,
      bytes,
      handleSupported: !!fileHandle,
      handle: fileHandle || null,
    });
  } catch (err) {
    // A very large document may exceed local browser quota. The viewer must
    // still work even if the convenience Recent cache cannot be persisted.
    console.warn('Recent cache could not be saved', err);
    toast('Document opened. Recent cache is full; the PDF itself is unaffected.');
  }

  // Keep the recent list bounded so device storage doesn't grow without limit.
  const MAX_RECENT = 20;
  const all = await getCurrentUserRecent();
  if (all.length > MAX_RECENT) {
    all.sort((a, b) => a.lastOpened - b.lastOpened);
    const toRemove = all.slice(0, all.length - MAX_RECENT);
    for (const r of toRemove) await MukorobDB.del('recent_scoped', r.id);
  }
}

async function renderRecentList() {
  const all = (await getCurrentUserRecent()).sort((a, b) => b.lastOpened - a.lastOpened);
  const panel = $('#panelRecent');
  const emptyList = $('#recentEmptyList');
  panel.innerHTML = '';
  emptyList.innerHTML = '';
  if (!state.settings.recentEnabled) return;

  if (!all.length) {
    panel.innerHTML = '<p class="muted" style="padding:8px">No files yet.</p>';
    return;
  }
  all.forEach((r) => {
    const row = buildRecentRow(r);
    panel.appendChild(row);
    if (all.indexOf(r) < 4) emptyList.appendChild(buildRecentRow(r));
  });
}

function buildRecentRow(r) {
  const row = document.createElement('div');
  row.className = 'recent-item';
  const img = document.createElement('img');
  img.className = 'recent-thumb';
  img.src = r.thumb || 'icons/icon-192.png';
  const info = document.createElement('div');
  info.className = 'recent-info';
  const name = document.createElement('div');
  name.className = 'recent-name';
  name.textContent = r.name;
  const meta = document.createElement('div');
  meta.className = 'recent-meta';
  meta.textContent = (r.pages || '?') + ' pages · ' + timeAgo(r.lastOpened);
  info.appendChild(name);
  info.appendChild(meta);
  row.appendChild(img);
  row.appendChild(info);
  row.addEventListener('click', () => reopenRecent(r));
  return row;
}

async function reopenRecent(r) {
  if (r.bytes) {
    try {
      const file = new File([r.bytes], r.name, { type: 'application/pdf', lastModified: r.lastOpened });
      openFile(file, null);
      return;
    } catch (e) {
      console.error('reopen from stored bytes failed', e);
    }
  }
  if (r.handle) {
    try {
      const perm = await r.handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') {
        const req = await r.handle.requestPermission({ mode: 'read' });
        if (req !== 'granted') throw new Error('permission denied');
      }
      const file = await r.handle.getFile();
      openFile(file, r.handle);
      return;
    } catch (e) {
      // fall through to manual re-pick
    }
  }
  toast('This file was saved before the offline-reopen update — please locate "' + r.name + '" once more.');
  $('#fileInput').click();
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

/* Use the File System Access API when opening, if supported, so recent
   files can be reopened with one tap on Chrome/Edge desktop & Android. */
if (window.showOpenFilePicker) {
  const openViaPicker = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const file = await handle.getFile();
      openFile(file, handle);
    } catch (e) { /* user cancelled */ }
  };
  window.addEventListener('DOMContentLoaded', () => {
    $('#btnOpen').addEventListener('click', (e) => { e.stopImmediatePropagation(); openViaPicker(); }, true);
    $('#btnOpenEmpty').addEventListener('click', (e) => { e.stopImmediatePropagation(); openViaPicker(); }, true);
  });
}

/* ---------------------------------------------------------------------- */
/* Admin panel                                                             */
/* ---------------------------------------------------------------------- */
async function deriveOwnerKey(passcode, saltBytes) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 180000, hash: 'SHA-256' },
    material, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(x => parseInt(x, 16)));
}

function wireAdminUI() {
  $('#btnAdmin').addEventListener('click', openAdmin);
  $('#btnAdminClose').addEventListener('click', () => ($('#adminModal').hidden = true));

  const bindBrandUpload = (buttonId, inputId, previewId) => {
    $(buttonId).addEventListener('click', () => $(inputId).click());
    $(inputId).addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        $(previewId).src = reader.result;
        $(previewId).dataset.value = reader.result;
      };
      reader.readAsDataURL(f);
      e.target.value = '';
    });
  };
  bindBrandUpload('#btnLogoUpload', '#logoInput', '#cfgLogoPreview');
  bindBrandUpload('#btnDashboardLogoUpload', '#dashboardLogoInput', '#cfgDashboardLogoPreview');
  bindBrandUpload('#btnLoginIconUpload', '#loginIconInput', '#cfgLoginIconPreview');
  bindBrandUpload('#btnLoginBackgroundUpload', '#loginBackgroundInput', '#cfgLoginBackgroundPreview');

  $('#btnLogoReset').addEventListener('click', () => {
    $('#cfgLogoPreview').src = DEFAULT_SETTINGS.logo;
    $('#cfgLogoPreview').dataset.value = '';
  });
  $('#btnDashboardLogoReset').addEventListener('click', () => {
    $('#cfgDashboardLogoPreview').src = DEFAULT_SETTINGS.dashboardLogo;
    $('#cfgDashboardLogoPreview').dataset.value = '';
  });
  $('#btnLoginIconReset').addEventListener('click', () => {
    $('#cfgLoginIconPreview').src = DEFAULT_SETTINGS.loginIconLogo;
    $('#cfgLoginIconPreview').dataset.value = '';
  });
  $('#btnLoginBackgroundReset').addEventListener('click', () => {
    $('#cfgLoginBackgroundPreview').src = DEFAULT_SETTINGS.loginBackgroundLogo;
    $('#cfgLoginBackgroundPreview').dataset.value = '';
  });
  $('#btnStampUpload').addEventListener('click', () => $('#adminStampInput').click());
  $('#adminStampInput').addEventListener('change', (e) => {
    const f=e.target.files[0]; if(!f)return; const reader=new FileReader(); reader.onload=()=>{ $('#cfgStampPreview').src=reader.result; $('#cfgStampPreview').dataset.value=reader.result; }; reader.readAsDataURL(f);
  });
  $('#btnStampReset').addEventListener('click',()=>{ $('#cfgStampPreview').src='icons/icon-192.png'; $('#cfgStampPreview').dataset.value=''; });

  $('#btnAdminSave').addEventListener('click', async () => {
    state.settings.name = $('#cfgName').value.trim() || DEFAULT_SETTINGS.name;
    state.settings.tagline = $('#cfgTag').value.trim();
    state.settings.primary = $('#cfgPrimary').value;
    state.settings.accent = $('#cfgAccent').value;
    state.settings.notice = $('#cfgNotice').value.trim();
    state.settings.accessCode = $('#cfgAccessCode').value.trim();
    state.settings.annotationsEnabled = $('#cfgAnnotations').checked;
    state.settings.recentEnabled = $('#cfgRecent').checked;
    state.settings.companyStamp = $('#cfgStampPreview').dataset.value || null;
    state.settings.logo = $('#cfgLogoPreview').dataset.value || DEFAULT_SETTINGS.logo;
    state.settings.dashboardLogo = $('#cfgDashboardLogoPreview').dataset.value || DEFAULT_SETTINGS.dashboardLogo;
    state.settings.loginIconLogo = $('#cfgLoginIconPreview').dataset.value || DEFAULT_SETTINGS.loginIconLogo;
    state.settings.loginBackgroundLogo = $('#cfgLoginBackgroundPreview').dataset.value || DEFAULT_SETTINGS.loginBackgroundLogo;
    await saveSettings();
    applySettings();
    renderRecentList();
    $('#adminModal').hidden = true;
    toast('Super Admin settings saved.');
  });

  $('#btnPinChange').addEventListener('click', async () => {
    const u = state.auth.user;
    if (!u) return;
    const current = prompt('Enter your current password:');
    if (!current) return;
    const h = await hashPassword(current, u.passwordSalt);
    if (h !== u.passwordHash) return toast('Current password is incorrect.');
    const next = prompt('New password (minimum 8 characters):');
    if (!next || next.length < 8) return toast('New password must be at least 8 characters.');
    const rec = await makePasswordRecord(next);
    u.passwordHash = rec.hash; u.passwordSalt = rec.salt; u.updatedAt = Date.now();
    await MukorobDB.put('users', u);
    toast('Password updated.');
  });
  $('#btnLockAdmin').addEventListener('click', () => {
    $('#adminModal').hidden = true;
  });

  $('#btnCfgExport').addEventListener('click', () => {
    // Never export the owner credential material. Branding/config can be shared
    // with staff, but Super Admin ownership cannot be transferred by a config file.
    const safeConfig = { ...state.settings };
    delete safeConfig.pinHash;
    delete safeConfig.pinSalt;
    const blob = new Blob([JSON.stringify(safeConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mukorob-pdf-staff-config.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#btnCfgImport').addEventListener('click', () => $('#cfgImportInput').click());
  $('#cfgImportInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const ownerHash = state.settings.pinHash;
        const ownerSalt = state.settings.pinSalt;
        state.settings = { ...DEFAULT_SETTINGS, ...parsed, pinHash: ownerHash, pinSalt: ownerSalt };
        await saveSettings(); applySettings(); populateAdminForm();
        toast('Staff configuration imported. Owner access was preserved.');
      } catch (err) { toast('That file could not be read as config.'); }
    };
    reader.readAsText(f);
  });
}

function openAdmin() {
  if (!state.auth.user || state.auth.user.role !== 'superadmin') {
    toast('Sign in as Super Admin to open this panel.');
    return;
  }
  $('#adminModal').hidden = false;
  showAdminPanel();
}
function showAdminPanel() {
  $('#adminPanel').hidden = false;
  populateAdminForm();
}
function populateAdminForm() {
  const s = state.settings;
  $('#cfgName').value = s.name;
  $('#cfgTag').value = s.tagline;
  $('#cfgPrimary').value = s.primary;
  $('#cfgAccent').value = s.accent;
  $('#cfgNotice').value = s.notice || '';
  $('#cfgAccessCode').value = s.accessCode || '';
  $('#cfgAnnotations').checked = s.annotationsEnabled;
  $('#cfgRecent').checked = s.recentEnabled;
  $('#cfgLogoPreview').src = s.logo || DEFAULT_SETTINGS.logo;
  $('#cfgLogoPreview').dataset.value = s.logo || '';
  $('#cfgDashboardLogoPreview').src = s.dashboardLogo || DEFAULT_SETTINGS.dashboardLogo;
  $('#cfgDashboardLogoPreview').dataset.value = s.dashboardLogo || '';
  $('#cfgLoginIconPreview').src = s.loginIconLogo || DEFAULT_SETTINGS.loginIconLogo;
  $('#cfgLoginIconPreview').dataset.value = s.loginIconLogo || '';
  $('#cfgLoginBackgroundPreview').src = s.loginBackgroundLogo || DEFAULT_SETTINGS.loginBackgroundLogo;
  $('#cfgLoginBackgroundPreview').dataset.value = s.loginBackgroundLogo || '';
  $('#cfgStampPreview').src = s.companyStamp || 'icons/icon-192.png';
  $('#cfgStampPreview').dataset.value = s.companyStamp || '';
}

/* ---------------------------------------------------------------------- */
/* Service worker                                                          */
/* ---------------------------------------------------------------------- */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ========================================================================
   Mukorob PDF v0.4 — Professional PDF workflow layer
   Adds selectable text, bookmarks, page operations, save-as, merge/extract,
   properties, polished tool menu, and safer owner-only local administration.
   ======================================================================== */

function makeFileFromBytes(bytes, name) {
  return new File([bytes], name, { type: 'application/pdf', lastModified: Date.now() });
}

async function loadPdfLibDocument() {
  if (!state.fileBytesForExport) throw new Error('No document is open.');
  return PDFLib.PDFDocument.load(state.fileBytesForExport, { ignoreEncryption: false });
}

async function saveBytesAs(bytes, suggestedName, mime='application/pdf') {
  const blob = new Blob([bytes], { type: mime });
  const isPdf=mime==='application/pdf';
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [isPdf
          ? { description:'PDF document', accept:{'application/pdf':['.pdf']} }
          : { description:'CSV file', accept:{'text/csv':['.csv']} }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      toast('PDF saved successfully.');
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = suggestedName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('PDF saved to your downloads.');
  return true;
}

async function saveCurrentPdfAs() {
  if (!state.fileBytesForExport) return;
  await saveBytesAs(state.fileBytesForExport, state.fileName || 'Mukorob-document.pdf');
}

async function editCurrentPdf(mutator, suggestedName) {
  if (!state.fileBytesForExport) return;
  try {
    toast('Preparing PDF…');
    const doc = await loadPdfLibDocument();
    await mutator(doc);
    const bytes = await doc.save({ useObjectStreams: true });
    const file = makeFileFromBytes(bytes, suggestedName || state.fileName);
    await openFile(file);
  } catch (err) {
    console.error(err);
    toast('PDF edit could not be completed.');
  }
}

async function rotateCurrentPage(delta) {
  if (!state.pdfDoc) return;
  const n = state.currentPage;
  await editCurrentPdf(async (doc) => {
    const page = doc.getPages()[n - 1];
    if (!page) return;
    const current = page.getRotation().angle || 0;
    page.setRotation(PDFLib.degrees(current + delta));
  }, state.fileName.replace(/\.pdf$/i, '') + ' (rotated).pdf');
}

async function deleteCurrentPage() {
  if (!state.pdfDoc) return;
  if (state.numPages <= 1) return toast('A PDF must contain at least one page.');
  if (!confirm('Delete page ' + state.currentPage + '? This will create a new PDF.')) return;
  const deleted = state.currentPage;
  await editCurrentPdf(async (doc) => { doc.removePage(deleted - 1); }, state.fileName.replace(/\.pdf$/i, '') + ' (edited).pdf');
  toast('Page deleted.');
}

async function moveCurrentPage() {
  if (!state.pdfDoc || state.numPages < 2) return;
  const targetRaw = prompt('Move page ' + state.currentPage + ' to position (1–' + state.numPages + '):', String(state.currentPage));
  if (targetRaw === null) return;
  const target = Math.max(1, Math.min(state.numPages, parseInt(targetRaw, 10)));
  if (!Number.isFinite(target) || target === state.currentPage) return;
  try {
    const src = await loadPdfLibDocument();
    const pages = src.getPages();
    const order = pages.map((_, i) => i);
    const [moved] = order.splice(state.currentPage - 1, 1);
    order.splice(target - 1, 0, moved);
    const out = await PDFLib.PDFDocument.create();
    const copied = await out.copyPages(src, order);
    copied.forEach(p => out.addPage(p));
    const bytes = await out.save({ useObjectStreams: true });
    await openFile(makeFileFromBytes(bytes, state.fileName.replace(/\.pdf$/i, '') + ' (reordered).pdf'));
    toast('Page moved to position ' + target + '.');
  } catch (err) { console.error(err); toast('Page move failed.'); }
}

async function extractPages() {
  if (!state.pdfDoc) return;
  const range = prompt('Pages to extract (examples: 1-3 or 1,4,7-9):', '1-' + state.numPages);
  if (!range) return;
  try {
    const selected = parsePageRange(range, state.numPages);
    if (!selected.length) throw new Error('No pages selected');
    const src = await loadPdfLibDocument();
    const out = await PDFLib.PDFDocument.create();
    const copied = await out.copyPages(src, selected.map(n => n - 1));
    copied.forEach(p => out.addPage(p));
    const bytes = await out.save({ useObjectStreams: true });
    await saveBytesAs(bytes, state.fileName.replace(/\.pdf$/i, '') + ' (extracted).pdf');
  } catch (err) { console.error(err); toast('Could not extract those pages.'); }
}

function parsePageRange(input, max) {
  const set = new Set();
  input.split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
    if (/^\d+\s*-\s*\d+$/.test(part)) {
      let [a,b] = part.split('-').map(x => parseInt(x.trim(),10));
      if (a > b) [a,b] = [b,a];
      for (let n=a;n<=b;n++) if (n>=1 && n<=max) set.add(n);
    } else if (/^\d+$/.test(part)) {
      const n=parseInt(part,10); if(n>=1 && n<=max) set.add(n);
    }
  });
  return Array.from(set).sort((a,b)=>a-b);
}

async function mergePdfs(files) {
  if (!files || !files.length) return;
  try {
    toast('Merging ' + files.length + ' PDF' + (files.length === 1 ? '' : 's') + '…');
    const out = await PDFLib.PDFDocument.create();
    const inputs = [];
    if (state.fileBytesForExport) inputs.push(new Uint8Array(state.fileBytesForExport));
    for (const file of files) inputs.push(new Uint8Array(await file.arrayBuffer()));
    for (const bytes of inputs) {
      const doc = await PDFLib.PDFDocument.load(bytes);
      const copied = await out.copyPages(doc, doc.getPages().map((_,i)=>i));
      copied.forEach(p => out.addPage(p));
    }
    const bytes = await out.save({ useObjectStreams: true });
    await openFile(makeFileFromBytes(bytes, 'Mukorob merged document.pdf'));
    toast('PDFs merged successfully.');
  } catch (err) { console.error(err); toast('Merge failed. Check that all files are valid PDFs.'); }
}

async function showProperties() {
  if (!state.pdfDoc) return;
  const body = $('#propertiesBody');
  let meta = {};
  try { meta = await state.pdfDoc.getMetadata(); } catch (_) {}
  const info = meta.info || {};
  const bytes = state.fileBytesForExport ? state.fileBytesForExport.byteLength : 0;
  const size = bytes < 1024*1024 ? Math.round(bytes/1024) + ' KB' : (bytes/(1024*1024)).toFixed(2) + ' MB';
  body.innerHTML = `
    <div class="prop-grid">
      <div class="prop"><b>File</b><span>${escapeHtml(state.fileName)}</span></div>
      <div class="prop"><b>Pages</b><span>${state.numPages}</span></div>
      <div class="prop"><b>File size</b><span>${size}</span></div>
      <div class="prop"><b>PDF version</b><span>${escapeHtml(String(info.PDFFormatVersion || 'PDF'))}</span></div>
    </div>
    <label>Title<input id="metaTitle" type="text" value="${escapeAttr(info.Title || '')}"></label>
    <label>Author<input id="metaAuthor" type="text" value="${escapeAttr(info.Author || '')}"></label>
    <label>Subject<input id="metaSubject" type="text" value="${escapeAttr(info.Subject || '')}"></label>
    <label>Keywords<input id="metaKeywords" type="text" value="${escapeAttr(info.Keywords || '')}"></label>
    <div class="row-gap"><button class="primary-btn" id="btnSaveMetadata">Save metadata</button></div>`;
  $('#btnSaveMetadata').addEventListener('click', saveMetadata);
  $('#propertiesModal').hidden = false;
}
function escapeAttr(v) { return escapeHtml(v).replace(/\n/g, ' '); }
function escapeHtml(v) { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function saveMetadata() {
  if (!state.fileBytesForExport) return;
  try {
    const doc = await loadPdfLibDocument();
    const title=$('#metaTitle').value.trim(), author=$('#metaAuthor').value.trim(), subject=$('#metaSubject').value.trim(), keywords=$('#metaKeywords').value.trim();
    doc.setTitle(title); doc.setAuthor(author); doc.setSubject(subject); doc.setKeywords(keywords ? keywords.split(',').map(x=>x.trim()).filter(Boolean) : []);
    const bytes=await doc.save({useObjectStreams:true});
    $('#propertiesModal').hidden=true;
    await openFile(makeFileFromBytes(bytes, state.fileName.replace(/\.pdf$/i,'')+' (metadata).pdf'));
    toast('Document metadata updated.');
  } catch(err){ console.error(err); toast('Could not update metadata.'); }
}

async function buildBookmarks() {
  const panel = $('#panelBookmarks');
  if (!panel || !state.pdfDoc) return;
  panel.innerHTML = '<div class="bookmark-loading">Loading bookmarks…</div>';
  try {
    const outline = await state.pdfDoc.getOutline();
    if (!outline || !outline.length) { panel.innerHTML = '<div class="empty-panel">No bookmarks in this document.</div>'; return; }
    panel.innerHTML = '';
    const addItems = async (items, parent) => {
      for (const item of items) {
        const row = document.createElement('button');
        row.className = 'bookmark-item';
        row.textContent = item.title || 'Untitled';
        row.title = item.title || '';
        parent.appendChild(row);
        row.addEventListener('click', async () => {
          try {
            let dest = item.dest;
            if (typeof dest === 'string') dest = await state.pdfDoc.getDestination(dest);
            if (Array.isArray(dest) && dest[0]) {
              const ref = dest[0];
              const pageIndex = typeof ref === 'number' ? ref : await state.pdfDoc.getPageIndex(ref);
              goToPage(pageIndex + 1);
            }
          } catch (_) {}
        });
        if (item.items && item.items.length) {
          const child = document.createElement('div'); child.className='bookmark-children'; parent.appendChild(child);
          await addItems(item.items, child);
        }
      }
    };
    await addItems(outline, panel);
  } catch (_) { panel.innerHTML = '<div class="empty-panel">Bookmarks could not be read.</div>'; }
}

/* Replace the v0.3 renderer with a high-DPI renderer plus a genuine selectable
   PDF.js text layer. The canvas is intentionally rendered above CSS size;
   the text layer remains vector-like/transparent and is used for selection. */
const v04BaseRenderPage = renderPage;
renderPage = async function(pageNum, force=false) {
  await v04BaseRenderPage(pageNum, force);
  const p = state.pageEls[pageNum - 1];
  if (!p || !p.canvas || !state.pdfDoc) return;
  if (!p.textLayer || force) {
    if (p.textLayer) p.textLayer.remove();
    const layer = document.createElement('div');
    layer.className = 'text-layer';
    p.wrap.insertBefore(layer, p.annotLayer || null);
    p.textLayer = layer;
    try {
      const page = await state.pdfDoc.getPage(pageNum);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      const viewport = page.getViewport({ scale: state.scale });
      const textDivs = [];
      await pdfjsLib.renderTextLayer({
        textContentSource: content,
        container: layer,
        viewport,
        textDivs,
        enhanceTextSelection: true
      }).promise;
    } catch (err) { console.warn('text layer unavailable', err); }
  }
};

/* Ensure text layer is removed with the virtualized page. */
const v04Unrender = unrenderPage;
unrenderPage = function(pageNum) {
  const p = state.pageEls[pageNum - 1];
  if (p && p.textLayer) p.textLayer = null;
  return v04Unrender(pageNum);
};

function wireV04UI() {
  // Toolbar menu
  $('#btnTools').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.pdfDoc && state.auth?.user) { toast('Open a PDF to use PDF tools.'); return; }
    $('#toolsMenu').hidden = !$('#toolsMenu').hidden;
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#toolsMenu') && !e.target.closest('#btnTools') && !e.target.closest('#btnPdfEdit')) $('#toolsMenu').hidden = true;
  });
  $('#toolRotateLeft').addEventListener('click', () => { $('#toolsMenu').hidden=true; rotateCurrentPageAnticlockwise(); });
  $('#toolRotateRight').addEventListener('click', () => { $('#toolsMenu').hidden=true; rotateCurrentPageClockwise(); });
  $('#toolDeletePage').addEventListener('click', () => { $('#toolsMenu').hidden=true; deleteCurrentPage(); });
  $('#toolMovePage').addEventListener('click', () => { $('#toolsMenu').hidden=true; moveCurrentPage(); });
  $('#toolExtract').addEventListener('click', () => { $('#toolsMenu').hidden=true; extractPages(); });
  $('#toolMerge').addEventListener('click', () => { $('#toolsMenu').hidden=true; $('#mergeInput').click(); });
  $('#toolSaveAs').addEventListener('click', () => { $('#toolsMenu').hidden=true; saveCurrentPdfAs(); });
  $('#toolProperties').addEventListener('click', () => { $('#toolsMenu').hidden=true; showProperties(); });
  $('#toolDownload').addEventListener('click', () => { $('#toolsMenu').hidden=true; $('#btnDownload').click(); });
  $('#toolFullscreen').addEventListener('click', () => { $('#toolsMenu').hidden=true; $('#btnFullscreen').click(); });
  $('#toolTheme').addEventListener('click', () => { $('#toolsMenu').hidden=true; $('#btnTheme').click(); });
  $('#toolLogin').addEventListener('click', () => { $('#toolsMenu').hidden=true; showAuth('login'); });
  $('#toolAdmin').addEventListener('click', () => { $('#toolsMenu').hidden=true; openAdmin(); });
  $('#toolLogout').addEventListener('click', () => { $('#toolsMenu').hidden=true; $('#btnLogout').click(); });
  $('#mergeInput').addEventListener('change', e => { const files=Array.from(e.target.files||[]); mergePdfs(files); e.target.value=''; });
  $('#btnPropertiesClose').addEventListener('click', () => $('#propertiesModal').hidden=true);

  // Add Bookmarks tab behaviour to the existing tab controller.
  const tabs = $$('.tab-btn');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    $('#panelThumbs').hidden = tab !== 'thumbs';
    $('#panelBookmarks').hidden = tab !== 'bookmarks';
    $('#panelRecent').hidden = tab !== 'recent';
    if (tab === 'bookmarks' && state.pdfDoc) buildBookmarks();
  }));

  // Rebuild bookmarks after every newly opened document.
  const oldOpenFile = openFile;
  openFile = async function(file, fileHandle=null) {
    await oldOpenFile(file, fileHandle);
    if (state.pdfDoc) await buildBookmarks();
  };

  // Better keyboard controls.
  window.addEventListener('keydown', e => {
    if (!state.pdfDoc || e.target.matches('input,textarea,select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentPdfAs(); }
    if (e.key === 'Home') goToPage(1);
    if (e.key === 'End') goToPage(state.numPages);
    if (e.key === '0' && !e.ctrlKey && !e.metaKey) setScale(1);
  });

}

window.addEventListener('DOMContentLoaded', () => {
  wireV04UI();
});

/* ========================================================================
   Mukorob PDF v0.5 — Bradz Internal Security & Workflow Layer
   Local-first staff accounts, permissions, persistent sessions, recent-file
   deletion, accurate on-screen page rotation, print/e-signature/stamp entry
   points, and mobile-friendly controls.
   ======================================================================== */

const MUKOROB_PERMISSIONS = [
  ['open','Open & read PDFs'],
  ['print','Print PDFs'],
  ['download','Download / Save PDFs'],
  ['edit','Edit pages (rotate/delete/move/merge/extract)'],
  ['annotate','Annotate & export'],
  ['signature','E-signature'],
  ['stamp','Company stamp'],
  ['organize','Bookmarks & document properties'],
  ['recentDelete','Delete recent-file entries']
];
const MUKOROB_SESSION_KEY = 'mukorob-pdf-session-v1';
state.auth = { user: null, session: null };
state.pageRotations = new Map();

async function writeAudit(action, details={}) {
  try {
    await MukorobDB.put('audit', {
      userId: currentUserId(),
      userName: state.auth.user?.fullName || state.auth.user?.id || 'anonymous',
      action, details, at: Date.now()
    });
  } catch (_) {}
}
async function getAuditLog(limit=250) {
  const rows = await MukorobDB.getAll('audit');
  return rows.sort((a,b)=>b.at-a.at).slice(0,limit);
}

function hasPermission(permission) {
  return !!state.auth.user && (state.auth.user.role === 'superadmin' || state.auth.user.permissions?.[permission] === true);
}
function requirePermission(permission, message) {
  if (hasPermission(permission)) return true;
  toast(message || 'Your account does not have permission for this function.');
  return false;
}
function normalizeId(v) { return String(v || '').trim().toLowerCase(); }
function randomToken(len=24) {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes=crypto.getRandomValues(new Uint8Array(len)); let out='';
  for(let i=0;i<len;i++) out += chars[bytes[i] % chars.length];
  return out;
}
async function hashPassword(password, saltHex) {
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexToBytes(saltHex),iterations:210000,hash:'SHA-256'},material,256);
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function freshSalt(){ return randomSalt(); }
async function makePasswordRecord(password){ const salt=freshSalt(); return {salt,hash:await hashPassword(password,salt)}; }
function newUserRecord(id, fullName, role, permissions, passwordRec, recoveryRec) {
  return { id:normalizeId(id), fullName:String(fullName||id).trim(), role, permissions:{...permissions}, passwordHash:passwordRec.hash, passwordSalt:passwordRec.salt, recoveryHash:recoveryRec.hash, recoverySalt:recoveryRec.salt, createdAt:Date.now(), updatedAt:Date.now(), disabled:false };
}
function allPermissions(){ return Object.fromEntries(MUKOROB_PERMISSIONS.map(([k])=>[k,true])); }
function defaultStaffPermissions(){ return Object.fromEntries(MUKOROB_PERMISSIONS.map(([k])=>[k,['open','print','download','annotate','signature'].includes(k)])); }

async function userCount(){ return (await MukorobDB.getAll('users')).length; }
async function getUser(id){ return MukorobDB.get('users',normalizeId(id)); }
async function createInitialSuperAdmin(id,password){
  const p=await makePasswordRecord(password);
  const rec=await makePasswordRecord(randomToken(18));
  const user=newUserRecord(id,'Super Admin','superadmin',allPermissions(),p,rec);
  await MukorobDB.put('users',user);
  state.auth.user=user;
  state.auth.session=randomToken(32);
  localStorage.setItem(MUKOROB_SESSION_KEY,JSON.stringify({id:user.id,token:state.auth.session,createdAt:Date.now()}));
  return user;
}
async function loginUser(id,password){
  const now=Date.now();
  if(state.loginLockedUntil>now) return false;
  const user=await getUser(id);
  if(!user || user.disabled){ state.loginFailures++; if(state.loginFailures>=5){state.loginLockedUntil=now+30000;state.loginFailures=0;} await writeAudit('login-failed',{userId:normalizeId(id)}); return false; }
  const hash=await hashPassword(password,user.passwordSalt);
  if(hash!==user.passwordHash){
    state.loginFailures++;
    if(state.loginFailures>=5){state.loginLockedUntil=now+30000;state.loginFailures=0;}
    await writeAudit('login-failed',{userId:user.id});
    return false;
  }
  state.loginFailures=0; state.loginLockedUntil=0;
  state.auth.user=user; state.auth.session=randomToken(32);
  localStorage.setItem(MUKOROB_SESSION_KEY,JSON.stringify({id:user.id,token:state.auth.session,createdAt:Date.now()}));
  user.lastLoginAt=Date.now(); await MukorobDB.put('users',user);
  await migrateLegacyOwnerData(user);
  await writeAudit('login', { userId: user.id });
  return true;
}
async function restoreSession(){
  try{
    const raw=localStorage.getItem(MUKOROB_SESSION_KEY); if(!raw)return false;
    const s=JSON.parse(raw), user=await getUser(s.id);
    if(!user || user.disabled)return false;
    state.auth.session=s.token; state.auth.user=user;
    await migrateLegacyOwnerData(user);
    await writeAudit('session-restored', { userId: user.id });
    return true;
  }catch(_){return false;}
}
async function logoutUser(){
  const oldUser=state.auth.user;
  if(oldUser) await writeAudit('logout', { userId: oldUser.id });
  localStorage.removeItem(MUKOROB_SESSION_KEY);
  localStorage.removeItem('mukorob-central-user');
  try { if(window.MukorobSupabase?.client && oldUser?.authProvider==='supabase') await window.MukorobSupabase.client.auth.signOut({scope:'local'}); } catch(e) { console.warn('[Mukorob logout]',e); }
  state.auth.user=null; state.auth.session=null;
  if(state.pdfDoc) await closeDocument();
  $('#panelRecent').innerHTML=''; $('#recentEmptyList').innerHTML=''; updateAuthUI(); showAuth('login');
}

function showAuth(view){
  $('#authModal').hidden=false;
  $('#loginView').hidden=view!=='login'; $('#forgotView').hidden=view!=='forgot'; $('#bootstrapView').hidden=view!=='bootstrap';
  if(view==='login') setTimeout(()=>$('#loginUser').focus(),50);
}
function updateAuthUI(){
  const u=state.auth.user;
  const displayName=u ? (u.role==='superadmin' ? (u.fullName || 'Super Admin') : (u.fullName || u.id)) : '';
  const company=u?.organizationName || '';
  const workspaceCompany=company.replace(/\s+CC$/i,'').replace(/\s+\(Pty\)\s+Ltd\.?$/i,'');
  $('#currentUserBadge').textContent=displayName;
  $('#currentUserBadge').hidden=!u;
  $('#btnLogout').hidden=!u;
  if($('#btnLoginTop')) $('#btnLoginTop').hidden=!!u;
  if($('#toolLogin')) $('#toolLogin').hidden=!!u;
  if($('#toolLogout')) $('#toolLogout').hidden=!u;
  if($('#btnAdmin')) $('#btnAdmin').hidden=!u || u.role!=='superadmin';
  if($('#toolAdmin')) $('#toolAdmin').hidden=!u || u.role!=='superadmin';
  const bar=$('#identityBar');
  if(bar){
    $('#identityUser').textContent=u ? (u.role==='superadmin' ? 'SUPER ADMIN · '+displayName : displayName+' · '+u.id) : '';
    $('#identityCompany').textContent=workspaceCompany ? workspaceCompany+' - Internal Workplace' : (u ? 'Mukorob Internal Workplace' : '');
    bar.hidden=!u;
  }
  applyPermissionUI();
}
function applyPermissionUI(){
  const map={
    '#btnPrint':'print','#btnPdfEdit':'edit','#btnESignature':'signature','#btnCompanyStamp':'stamp',
    '#btnDownload':'download','#btnTools':'edit','#btnProperties':'organize','#btnAnnotate':'annotate',
    '#btnExportAnnotated':'annotate','#toolRotateLeft':'edit','#toolRotateRight':'edit','#toolDeletePage':'edit',
    '#toolMovePage':'edit','#toolExtract':'edit','#toolMerge':'edit','#toolSaveAs':'download','#toolProperties':'organize',
    '#toolDownload':'download'
  };
  Object.entries(map).forEach(([sel,perm])=>{const el=$(sel);if(!el)return; el.style.display=hasPermission(perm)?'':'none';});
  const exportBtn=$('#btnExportAnnotated');
  if(exportBtn) exportBtn.style.display=(hasPermission('download') && (hasPermission('annotate')||hasPermission('signature')||hasPermission('stamp'))) ? '' : 'none';
  if($('#btnPrint')) $('#btnPrint').disabled=!state.pdfDoc || !hasPermission('print');
  if($('#btnPrintMobile')) { $('#btnPrintMobile').style.display=hasPermission('print')?'':'none'; $('#btnPrintMobile').disabled=!state.pdfDoc || !hasPermission('print'); }
  if($('#btnDownload')) $('#btnDownload').disabled=!state.pdfDoc || !hasPermission('download');
  if($('#btnPdfEdit')) $('#btnPdfEdit').disabled=!state.pdfDoc || !hasPermission('edit');
  if($('#btnESignature')) $('#btnESignature').disabled=!state.pdfDoc || !hasPermission('signature');
  if($('#btnCompanyStamp')) $('#btnCompanyStamp').disabled=!state.pdfDoc || !hasPermission('stamp');
  if($('#btnAnnotate')) $('#btnAnnotate').disabled=!state.pdfDoc || !hasPermission('annotate');
}

async function consumePendingLaunchFiles() {
  if (!state.auth.user || !hasPermission('open') || !state.pendingLaunchFiles.length) return;
  const queue=[...state.pendingLaunchFiles]; state.pendingLaunchFiles=[];
  for(const file of queue) await openFile(file);
}

async function initMukorobAuth(){
  const count=await userCount();
  if(count===0){ showAuth('bootstrap'); }
  else if(await restoreSession()){ $('#authModal').hidden=true; updateAuthUI(); await renderRecentList(); await consumePendingLaunchFiles(); }
  else { showAuth('login'); updateAuthUI(); }
}

function renderPermissionChecks(existing=defaultStaffPermissions()){
  const box=$('#permissionChecks'); if(!box)return; box.innerHTML='';
  MUKOROB_PERMISSIONS.forEach(([key,label])=>{
    const lab=document.createElement('label'); lab.className='permission-row';
    lab.innerHTML=`<input type="checkbox" data-permission="${key}" ${existing[key]?'checked':''}> <span>${escapeHtml(label)}</span>`;
    box.appendChild(lab);
  });
}
async function renderUserList(){
  const box=$('#userList'); if(!box)return; const users=await MukorobDB.getAll('users'); box.innerHTML='';
  users.sort((a,b)=>a.role==='superadmin'?-1:b.role==='superadmin'?1:a.id.localeCompare(b.id));
  users.forEach(u=>{
    const row=document.createElement('div'); row.className='user-row';
    const perms=Object.values(u.permissions||{}).filter(Boolean).length;
    row.innerHTML=`<div><strong>${escapeHtml(u.fullName||u.id)}</strong><span>${escapeHtml(u.id)} · ${u.role==='superadmin'?'Super Admin':perms+' permissions'}${u.disabled?' · DISABLED':''}</span></div>`;
    const actions=document.createElement('div'); actions.className='user-actions';
    if(u.role!=='superadmin'){
      const edit=document.createElement('button'); edit.className='text-btn'; edit.textContent='Permissions'; edit.onclick=()=>beginEditUser(u.id);
      const reset=document.createElement('button'); reset.className='text-btn'; reset.textContent='Reset password'; reset.onclick=()=>adminResetUser(u.id);
      const toggle=document.createElement('button'); toggle.className='text-btn'; toggle.textContent=u.disabled?'Enable':'Disable'; toggle.onclick=()=>toggleUser(u.id);
      const del=document.createElement('button'); del.className='text-btn danger'; del.textContent='Delete'; del.onclick=()=>deleteUser(u.id);
      actions.append(edit,reset,toggle,del);
    }
    row.appendChild(actions); box.appendChild(row);
  });
}
function resetUserForm() {
  state.adminEditingUserId = null;
  $('#newUserName').value='';
  $('#newUserFullName').value='';
  $('#newUserPassword').value='';
  $('#newUserName').disabled=false;
  $('#newUserPassword').disabled=false;
  $('#btnCreateUser').textContent='Register user';
  $('#btnCancelUserEdit').hidden=true;
  $('#userFormHint').textContent='A recovery code is generated for each user. Give it to the staff member securely; it can be used for self-service password recovery.';
  renderPermissionChecks();
}
async function beginEditUser(id) {
  if(!state.auth.user || state.auth.user.role!=='superadmin') return;
  const u=await getUser(id); if(!u || u.role==='superadmin') return;
  state.adminEditingUserId=id;
  $('#newUserName').value=u.id;
  $('#newUserFullName').value=u.fullName||'';
  $('#newUserPassword').value='';
  $('#newUserName').disabled=true;
  $('#newUserPassword').disabled=true;
  $('#btnCreateUser').textContent='Update permissions';
  $('#btnCancelUserEdit').hidden=false;
  $('#userFormHint').textContent='Editing '+u.id+'. Password is unchanged. Select the permissions this staff member should have.';
  renderPermissionChecks(u.permissions||defaultStaffPermissions());
  document.querySelector('#userManagementSection')?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function updateUserPermissions(id) {
  const u=await getUser(id); if(!u || u.role==='superadmin') return;
  const perms={}; $$('#permissionChecks input').forEach(c=>perms[c.dataset.permission]=c.checked);
  u.permissions=perms; u.updatedAt=Date.now();
  await MukorobDB.put('users',u);
  await writeAudit('permissions-updated',{targetUserId:id,permissions:perms});
  await renderUserList(); resetUserForm(); toast('Permissions updated for '+id+'.');
}
async function exportAuditCsv() {
  if(!state.auth.user || state.auth.user.role!=='superadmin') return;
  const rows=await getAuditLog(1000);
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=['Date,User ID,User,Action,Details',...rows.map(r=>[
    new Date(r.at).toISOString(),r.userId,r.userName,r.action,JSON.stringify(r.details||{})
  ].map(esc).join(','))].join('\n');
  await saveBytesAs(new TextEncoder().encode(csv),'mukorob-audit-log.csv','text/csv');
}
async function renderAuditList() {
  const box=$('#auditList'); if(!box || !state.auth.user || state.auth.user.role!=='superadmin') return;
  const rows=await getAuditLog(100); box.innerHTML='';
  if(!rows.length){box.innerHTML='<div class="empty-panel">No audit activity yet.</div>';return;}
  rows.forEach(r=>{
    const el=document.createElement('div'); el.className='audit-row';
    const when=new Date(r.at).toLocaleString();
    el.innerHTML='<div><strong>'+escapeHtml(r.action)+'</strong><span>'+escapeHtml(r.userName||r.userId||'—')+'</span></div><time>'+escapeHtml(when)+'</time>';
    box.appendChild(el);
  });
}

async function adminResetUser(id){
  const u=await getUser(id); if(!u)return;
  const pwd=prompt('Temporary password for '+id+' (minimum 8 characters):'); if(!pwd || pwd.length<8)return toast('Password must be at least 8 characters.');
  const p=await makePasswordRecord(pwd);
  const recoveryCode=randomToken(12), rec=await makePasswordRecord(recoveryCode);
  u.passwordHash=p.hash;u.passwordSalt=p.salt;u.recoveryHash=rec.hash;u.recoverySalt=rec.salt;u.updatedAt=Date.now();
  await MukorobDB.put('users',u);
  await writeAudit('admin-password-reset',{targetUserId:id});
  alert('Password reset for '+id+'.\nTemporary password: '+pwd+'\nNew recovery code: '+recoveryCode+'\nGive these details to the staff member securely.');
  toast('Password reset.');
}
async function toggleUser(id){const u=await getUser(id);if(!u)return;u.disabled=!u.disabled;await MukorobDB.put('users',u);await writeAudit(u.disabled?'user-disabled':'user-enabled',{targetUserId:id});await renderUserList();toast(u.disabled?'User disabled.':'User enabled.');}
async function deleteUser(id){if(!confirm('Delete staff user '+id+'? This cannot be undone.'))return;await MukorobDB.del('users',id);await writeAudit('user-deleted',{targetUserId:id});await renderUserList();toast('User deleted.');}

/* Recent list entries get a dedicated delete action instead of making the
   whole row destructive. */
const v05BaseBuildRecentRow=buildRecentRow;
buildRecentRow=function(r){
  const row=v05BaseBuildRecentRow(r); row.classList.add('recent-item-with-delete');
  if(!row.querySelector('.recent-delete')){
    const b=document.createElement('button'); b.className='recent-delete'; b.type='button'; b.title='Remove from Recent'; b.setAttribute('aria-label','Remove from Recent'); b.textContent='×';
    b.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();if(!hasPermission('recentDelete')){toast('You do not have permission to remove Recent items.');return;} await MukorobDB.del('recent_scoped',r.id);await writeAudit('recent-removed',{file:r.name,hash:r.hash});await renderRecentList();toast('Removed from Recent.');});
    row.appendChild(b);
  }
  return row;
};

/* Accurate visual rotation: each page keeps its own rotation state and PDF.js
   renders the correct rotated viewport immediately. */
const v05BaseLayoutPages=layoutPages;
layoutPages=function(){
  if(!state.baseViewport)return;
  state.pageEls.forEach((p,i)=>{
    const rot=state.pageRotations.get(i+1)||0;
    const w0=state.baseViewport.width, h0=state.baseViewport.height;
    const swap=Math.abs(rot)%180===90;
    const w=(swap?h0:w0)*state.scale, h=(swap?w0:h0)*state.scale;
    p.wrap.style.width=w+'px';p.wrap.style.height=h+'px';
    if(p.canvas){p.canvas.style.width=w+'px';p.canvas.style.height=h+'px';}
    if(p.rendered){p.rendered=false;renderPage(i+1,true);}
  });
  $('#zoomLabelMobile').textContent=Math.round(state.scale*100)+'%';
};
const v05BaseRenderPage=renderPage;
renderPage=async function(pageNum,force=false){
  const p=state.pageEls[pageNum-1]; if(!p||!state.pdfDoc)return;
  // Rotation is a forced render. If an observer-triggered render is already
  // in flight, wait for it rather than silently dropping the rotation render.
  if(p.rendering && force){
    const started=performance.now();
    while(p.rendering && performance.now()-started<5000){
      await new Promise(resolve=>setTimeout(resolve,16));
    }
  }
  if(p.rendering)return;
  const rot=((Number(state.pageRotations.get(pageNum))||0)%360+360)%360;
  const old=state.pageRotations.get(pageNum);
  // Temporarily expose a page-specific viewport to the v0.4 renderer.
  const page=await state.pdfDoc.getPage(pageNum);
  const cssViewport=page.getViewport({scale:state.scale,rotation:rot});
  const dpr=window.devicePixelRatio||1;
  // Render above CSS resolution for crisp scanned/image text, but cap the
  // bitmap at roughly 24 MP so large pages/zoom levels do not exhaust RAM.
  let outputScale=Math.min(3.5,Math.max(2,dpr*1.5));
  const cssPixels=cssViewport.width*cssViewport.height;
  const maxPixels=24_000_000;
  if(cssPixels*outputScale*outputScale>maxPixels) outputScale=Math.max(1,Math.sqrt(maxPixels/cssPixels));
  const viewport=page.getViewport({scale:state.scale*outputScale,rotation:rot});
  p.rendering=true;
  try{
    if(!p.canvas){p.canvas=document.createElement('canvas');p.canvas.className='page-canvas';p.wrap.innerHTML='';p.wrap.appendChild(p.canvas);const annot=document.createElement('div');annot.className='annot-layer';p.wrap.appendChild(annot);p.annotLayer=annot;}
    p.wrap.style.width=cssViewport.width+'px';p.wrap.style.height=cssViewport.height+'px';
    p.canvas.width=viewport.width;p.canvas.height=viewport.height;p.canvas.style.width=cssViewport.width+'px';p.canvas.style.height=cssViewport.height+'px';
    const ctx=p.canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    await page.render({canvasContext:ctx,viewport,intent:'display'}).promise;
    p.rendered=true; drawAnnotationsForPage(pageNum);
    // Rebuild selectable text layer against the same rotated viewport.
    if(p.textLayer)p.textLayer.remove();
    const layer=document.createElement('div');layer.className='text-layer';p.wrap.insertBefore(layer,p.annotLayer||null);p.textLayer=layer;
    try{const content=await page.getTextContent({normalizeWhitespace:true});const divs=[];await pdfjsLib.renderTextLayer({textContentSource:content,container:layer,viewport:cssViewport,textDivs:divs,enhanceTextSelection:true}).promise;}catch(_){ }
    if(!p.annotLayer.dataset.wired){p.annotLayer.dataset.wired='1';attachAnnotPointerHandlers(pageNum,p.annotLayer);}
  }catch(err){console.error('render error',pageNum,err);}finally{p.rendering=false;}
};

async function rotateCurrentPageAccurate(delta){
  if(!requirePermission('edit'))return; if(!state.pdfDoc)return;
  const n=state.currentPage;
  const current=((Number(state.pageRotations.get(n))||0)%360+360)%360;
  const next=((current+delta)%360+360)%360;
  state.pageRotations.set(n,next);
  const p=state.pageEls[n-1];
  if(p){
    // Invalidate the old bitmap and explicitly force the new rotated PDF.js render.
    p.rendered=false;
    if(p.canvas){p.canvas.width=0;p.canvas.height=0;p.canvas=null;}
    p.textLayer=null;
    p.annotLayer=null;
  }
  layoutPages();
  await renderPage(n,true);
  highlightCurrentThumb();
  toast('Page '+n+' rotated '+(delta<0?'anticlockwise':'clockwise')+' 90°. Save As to keep the rotation in the PDF.');
}
const rotateCurrentPageAnticlockwise = () => rotateCurrentPageAccurate(-90);
const rotateCurrentPageClockwise = () => rotateCurrentPageAccurate(90);

function hasRotationEdits() {
  for (const r of state.pageRotations.values()) if ((Number(r)||0) % 360 !== 0) return true;
  return false;
}
async function saveCurrentPdfWithRotations(suggestedName){
  if(!state.fileBytesForExport)return;
  try{
    const doc=await loadPdfLibDocument(); const pages=doc.getPages();
    pages.forEach((page,i)=>{const rot=state.pageRotations.get(i+1);if(typeof rot==='number'&&rot)page.setRotation(PDFLib.degrees(rot));});
    const bytes=await doc.save({useObjectStreams:true});
    return saveBytesAs(bytes,suggestedName||state.fileName);
  }catch(err){console.error(err);toast('Could not save rotated PDF.');}
}

/* Print is a first-class action. */
const v05PrintOriginalPdf=printOriginalPdf;
printOriginalPdf=async function(){
  if(!requirePermission('print'))return;
  if(!state.fileBytesForExport)return;
  try{
    let bytes=state.fileBytesForExport;
    if(hasWorkingEdits()) bytes=await buildWorkingPdfBytes();
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    let frame=document.getElementById('mukorobPrintFrame');
    if(!frame){
      frame=document.createElement('iframe');
      frame.id='mukorobPrintFrame';
      frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(frame);
    }
    frame.onload=async()=>{
      try{frame.contentWindow.focus();frame.contentWindow.print();await writeAudit('print',{file:state.fileName,edited:hasWorkingEdits()});}
      catch(e){toast('Could not open the print dialog for this PDF.');}
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    };
    frame.src=url;
  }catch(err){console.error(err);toast('Could not prepare this PDF for printing.');}
};
const v05DownloadOriginalPdf=downloadOriginalPdf;
downloadOriginalPdf=function(){if(!requirePermission('download'))return;writeAudit('download',{file:state.fileName});return v05DownloadOriginalPdf();};
const v05SaveCurrentPdfAs=saveCurrentPdfAs;
saveCurrentPdfAs=async function(){if(!requirePermission('download'))return; if(hasRotationEdits())return saveCurrentPdfWithRotations(state.fileName||'Mukorob-document.pdf');return v05SaveCurrentPdfAs();};

/* Permission guards around page operations. */
const v05DeletePage=deleteCurrentPage; deleteCurrentPage=async function(){if(requirePermission('edit')){const ok=await v05DeletePage();await writeAudit('delete-page',{file:state.fileName,page:state.currentPage});return ok;}};
const v05MovePage=moveCurrentPage; moveCurrentPage=async function(){if(requirePermission('edit')){const ok=await v05MovePage();await writeAudit('move-page',{file:state.fileName,page:state.currentPage});return ok;}};
const v05Extract=extractPages; extractPages=async function(){if(requirePermission('edit')){const ok=await v05Extract();await writeAudit('extract-pages',{file:state.fileName});return ok;}};
const v05Merge=mergePdfs; mergePdfs=async function(files){if(requirePermission('edit')){const ok=await v05Merge(files);await writeAudit('merge-pdfs',{file:state.fileName,count:files?.length||0});return ok;}};
const v05Properties=showProperties; showProperties=async function(){if(requirePermission('organize'))return v05Properties();};
const v05Export=exportAnnotatedPdf; exportAnnotatedPdf=async function(){if(requirePermission('annotate'))return v05Export();};

/* E-signature and stamp placement are implemented by modules/annotations.js. */

/* Stamp rendering is owned exclusively by modules/annotations.js. */
/* Legacy stamp placement removed: modules/annotations.js owns stamp placement. */

async function buildWorkingPdfBytes() {
  if (!state.fileBytesForExport) return null;
  const {PDFDocument,rgb}=PDFLib;
  const pdfDoc=await PDFDocument.load(state.fileBytesForExport);
  const pages=pdfDoc.getPages();
  for(let i=0;i<pages.length;i++){
    const r=state.pageRotations.get(i+1);
    if(typeof r==='number' && r) pages[i].setRotation(PDFLib.degrees(r));
  }
  for(const a of state.annotations){
    const page=pages[a.page-1]; if(!page) continue;
    const {width,height}=page.getSize(); const col=hexToRgbFloat(a.color||'#E2A321');
    if(a.type==='highlight') page.drawRectangle({x:a.rect.x*width,y:height-(a.rect.y+a.rect.h)*height,width:a.rect.w*width,height:a.rect.h*height,color:rgb(col.r,col.g,col.b),opacity:.35});
    else if(a.type==='ink') for(let i=1;i<a.points.length;i++){
      const p0=a.points[i-1],p1=a.points[i];
      page.drawLine({start:{x:p0.x*width,y:height-p0.y*height},end:{x:p1.x*width,y:height-p1.y*height},thickness:2,color:rgb(col.r,col.g,col.b)});
    } else if(a.type==='signature'){
      const font=await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique);
      page.drawText(a.text||'Signature',{x:a.rect.x*width,y:height-(a.rect.y+a.rect.h*.78)*height,size:Math.max(10,a.rect.h*height*.72),font,color:rgb(col.r,col.g,col.b)});
    } else if(a.type==='note'){
      const x=a.rect.x*width,y=height-a.rect.y*height;
      page.drawRectangle({x,y:y-10,width:10,height:10,color:rgb(col.r,col.g,col.b)});
      if(a.text) page.drawText(a.text.slice(0,90),{x:x+14,y:y-10,size:8,color:rgb(col.r,col.g,col.b)});
    } else if(a.type==='stamp'&&a.src){
      try{
        const raw=a.src.split(',')[1],bin=atob(raw),bytes=new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        const image=/^data:image\/png/i.test(a.src)?await pdfDoc.embedPng(bytes):await pdfDoc.embedJpg(bytes);
        page.drawImage(image,{x:a.rect.x*width,y:height-(a.rect.y+a.rect.h)*height,width:a.rect.w*width,height:a.rect.h*height});
      }catch(err){console.warn('stamp export failed',err);}
    }
  }
  return pdfDoc.save({useObjectStreams:true});
}
function hasWorkingEdits() { return hasRotationEdits() || state.annotations.length>0; }

/* Save/export now includes rotation and image stamps. */
const v05ExportOriginal=exportAnnotatedPdf;
exportAnnotatedPdf=async function(){
  if(!requirePermission('download'))return;
  if(state.annotations.some(a=>a.type==='signature')&&!hasPermission('signature'))return;
  if(state.annotations.some(a=>a.type==='stamp')&&!hasPermission('stamp'))return;
  if(state.annotations.some(a=>!['signature','stamp'].includes(a.type))&&!hasPermission('annotate'))return;
  if(!state.fileBytesForExport)return;
  if(!hasWorkingEdits())return toast('No edits or annotations to export yet.');
  try{
    toast('Preparing edited PDF…');
    const bytes=await buildWorkingPdfBytes();
    await saveBytesAs(bytes,state.fileName.replace(/\.pdf$/i,'')+' (Mukorob edited).pdf');
    await writeAudit('export-edited',{file:state.fileName});
  }catch(err){console.error(err);toast('Edited PDF export failed.');}
};

/* Reset per-page rotations whenever a different document is opened/closed. */
const v05CloseDocument=closeDocument;
closeDocument=async function(){state.pageRotations=new Map();return v05CloseDocument();};

/* Print button + edit/sign/stamp wiring. */
window.addEventListener('DOMContentLoaded',()=>{
  $('#btnPrint').addEventListener('click',printOriginalPdf);
  $('#btnPrintMobile').addEventListener('click',printOriginalPdf);
  $('#btnPdfEdit').addEventListener('click',(e)=>{e.stopPropagation();if(requirePermission('edit')){$('#toolsMenu').hidden=false;}});
  $('#btnLogout').addEventListener('click',()=>{ logoutUser(); });

  $('#btnLogin').addEventListener('click',async()=>{
    const ok=await loginUser($('#loginUser').value,$('#loginPassword').value);
    if(!ok){
      $('#loginError').textContent=state.loginLockedUntil>Date.now()?'Too many failed attempts. Please wait 30 seconds.':'Invalid user ID or password.';
      $('#loginError').hidden=false;return;
    }
    $('#loginError').hidden=true;$('#loginPassword').value='';$('#authModal').hidden=true;updateAuthUI();await renderRecentList();await consumePendingLaunchFiles();toast('Welcome, '+(state.auth.user.fullName||state.auth.user.id)+'.');
  });
  $('#loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')$('#btnLogin').click();});
  $('#btnForgotPassword').addEventListener('click',()=>showAuth('forgot'));
  $('#btnBackLogin').addEventListener('click',()=>showAuth('login'));
  $('#btnSelfReset').addEventListener('click',async()=>{
    const id=normalizeId($('#resetUser').value),u=await getUser(id),code=$('#resetRecovery').value.trim(),pwd=$('#resetPassword').value;
    if(!u){$('#resetError').textContent='User ID not found.';$('#resetError').hidden=false;return;}
    if(!pwd||pwd.length<8){$('#resetError').textContent='New password must be at least 8 characters.';$('#resetError').hidden=false;return;}
    const rh=await hashPassword(code,u.recoverySalt);if(rh!==u.recoveryHash){$('#resetError').textContent='Incorrect recovery code.';$('#resetError').hidden=false;return;}
    const p=await makePasswordRecord(pwd);u.passwordHash=p.hash;u.passwordSalt=p.salt;u.updatedAt=Date.now();await MukorobDB.put('users',u);toast('Password reset successfully.');showAuth('login');$('#loginUser').value=id;
  });
  $('#btnBootstrap').addEventListener('click',async()=>{
    const id=normalizeId($('#setupUser').value),p1=$('#setupPassword').value,p2=$('#setupPassword2').value;
    if(!/^[a-z0-9._-]{3,32}$/.test(id))return $('#setupError').textContent='User ID must be 3–32 characters using letters, numbers, dot, underscore or hyphen.' , $('#setupError').hidden=false;
    if(p1.length<8||p1!==p2)return $('#setupError').textContent='Passwords must match and be at least 8 characters.', $('#setupError').hidden=false;
    const existing=await getUser(id);if(existing)return $('#setupError').textContent='That user ID already exists.', $('#setupError').hidden=false;
    const recoveryCode=randomToken(12),p=await makePasswordRecord(p1),r=await makePasswordRecord(recoveryCode),u=newUserRecord(id,'Super Admin','superadmin',allPermissions(),p,r);
    await MukorobDB.put('users',u);state.auth.user=u;state.auth.session=randomToken(32);localStorage.setItem(MUKOROB_SESSION_KEY,JSON.stringify({id:u.id,token:state.auth.session,createdAt:Date.now()}));
    $('#authModal').hidden=true;updateAuthUI();toast('Super Admin account created.');
    alert('Super Admin created. Keep this recovery code securely: '+recoveryCode);
  });

  $('#btnCreateUser').addEventListener('click',async()=>{
    if(!state.auth.user||state.auth.user.role!=='superadmin')return;
    if(state.adminEditingUserId){ await updateUserPermissions(state.adminEditingUserId); return; }
    const id=normalizeId($('#newUserName').value),name=$('#newUserFullName').value.trim(),pwd=$('#newUserPassword').value;
    if(!/^[a-z0-9._-]{3,32}$/.test(id))return toast('Enter a valid user ID.');
    if(pwd.length<8)return toast('Temporary password must be at least 8 characters.');
    if(await getUser(id))return toast('That user ID already exists.');
    const perms={};$$('#permissionChecks input').forEach(c=>perms[c.dataset.permission]=c.checked);
    const recoveryCode=randomToken(12),p=await makePasswordRecord(pwd),r=await makePasswordRecord(recoveryCode),u=newUserRecord(id,name||id,'staff',perms,p,r);await MukorobDB.put('users',u);
    await writeAudit('user-created',{targetUserId:id,permissions:perms});
    resetUserForm(); await renderUserList();
    alert('User '+id+' created. Temporary password: '+pwd+'\nRecovery code: '+recoveryCode+'\nGive these details to the staff member securely.');
  });
  $('#btnCancelUserEdit').addEventListener('click',resetUserForm);
  $('#btnRefreshAudit').addEventListener('click',renderAuditList);
  $('#btnExportAudit').addEventListener('click',exportAuditCsv);

  renderPermissionChecks();
  // Populate admin user management whenever Super Admin opens the panel.
  const oldShowAdminPanel=showAdminPanel;
  showAdminPanel=function(){oldShowAdminPanel();renderPermissionChecks();renderUserList();renderAuditList();};
  updateAuthUI();
  checkAccessGate();
});

async function checkAccessGate() {
  await loadSettings(); // make sure settings are current before deciding, regardless of listener timing
  if (!state.settings.accessCode) { initMukorobAuth(); return; }
  if (localStorage.getItem('mukorobGateOk') === state.settings.accessCode) { initMukorobAuth(); return; }
  $('#accessGate').hidden = false;
  setTimeout(() => $('#gateCode').focus(), 50);
}
$('#btnGateEnter') && $('#btnGateEnter').addEventListener('click', () => {
  const val = $('#gateCode').value.trim();
  if (val && val === state.settings.accessCode) {
    localStorage.setItem('mukorobGateOk', val);
    $('#accessGate').hidden = true;
    $('#gateError').hidden = true;
    initMukorobAuth();
  } else {
    $('#gateError').hidden = false;
  }
});
$('#gateCode') && $('#gateCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('#btnGateEnter').click(); }
});

/* Keep session alive across normal work; only explicit Log out clears it. */
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && state.auth.user) updateAuthUI(); });

/* v0.5 final wiring and document-state corrections */
window.addEventListener('DOMContentLoaded',()=>{
  $('#toolPrint').addEventListener('click',()=>{ $('#toolsMenu').hidden=true; printOriginalPdf(); });
  $('#toolESignature').addEventListener('click',()=>{ $('#toolsMenu').hidden=true; startESignature(); });
  $('#toolCompanyStamp').addEventListener('click',()=>{ $('#toolsMenu').hidden=true; startCompanyStamp(); });
  rotateCurrentPage=rotateCurrentPageAccurate;

  const baseUpdateZoomControls=updateZoomControls;
  updateZoomControls=function(){baseUpdateZoomControls();applyPermissionUI();};

  const baseResetViewerState=resetViewerState;
  resetViewerState=function(){state.pageRotations=new Map();return baseResetViewerState();};

  const baseOpenFile= openFile;
  openFile=async function(file,fileHandle=null){
    await baseOpenFile(file,fileHandle);
    if(!state.pdfDoc)return;
    try{
      const first=await state.pdfDoc.getPage(1);
      state.baseViewport=first.getViewport({scale:1,rotation:0});
      state.pageRotations=new Map();
      for(let i=1;i<=state.numPages;i++){
        const pg=await state.pdfDoc.getPage(i); const angle=((pg.rotate||0)%360+360)%360;
        state.pageRotations.set(i,angle);
      }
      layoutPages();
      updateZoomControls();
    }catch(err){console.warn('rotation state init failed',err);}
  };

  // Hide the browser-only owner admin entry from staff and enforce the current user.
  updateAuthUI();
});

async function openWindowsAssociatedPdf(){
  const path=new URLSearchParams(location.search).get('open');
  if(!path || !state.auth.user)return;
  try{
    const res=await fetch('/api/open?path='+encodeURIComponent(path));
    if(!res.ok)throw new Error('open failed');
    const blob=await res.blob();
    await openFile(new File([blob],path.split('\\').pop()||path.split('/').pop()||'document.pdf',{type:'application/pdf'}));
    history.replaceState({},'',location.pathname);
  }catch(err){console.warn('Associated PDF could not be opened',err);toast('The selected PDF could not be opened.');}
}
window.addEventListener('DOMContentLoaded',()=>{
  let tries=0; const t=setInterval(()=>{tries++;if(state.auth.user){clearInterval(t);openWindowsAssociatedPdf();}if(tries>100)clearInterval(t);},100);
});


/* v0.7 module bridge: expose the stable application surface to ES modules. */
window.MukorobApp = {
  state, $, $, toast, requirePermission, hasPermission, currentUserId, db: MukorobDB,
  openFile, closeDocument, renderPage, drawAnnotationsForPage, persistAnnotations,
  saveBytesAs, buildWorkingPdfBytes, hasWorkingEdits, writeAudit, loadSettings,
  saveSettings, applySettings, updateZoomControls, buildThumbnails, highlightCurrentThumb,
  getUser, normalizeId, randomToken, hashPassword, makePasswordRecord,
  loadPdfLibDocument, makeFileFromBytes, getCurrentUserRecent, renderRecentList
};
