/* Mukorob PDF v0.7 — interactive signature & stamp placement. */
const A = window.MukorobApp;
const { state, $, toast, requirePermission, persistAnnotations, writeAudit } = A;

let placement = null;
let selected = null;
let drag = null;
let resize = null;
let observer = null;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalRect(r) {
  return { x: clamp(Number(r.x)||0,0,1), y: clamp(Number(r.y)||0,0,1), w: clamp(Number(r.w)||.2,.02,1), h: clamp(Number(r.h)||.08,.02,1) };
}
function hitAnnotation(pageNum, x, y) {
  const items = state.annotations.filter(a => a.page === pageNum && (a.type === 'signature' || a.type === 'stamp'));
  for (let i = items.length - 1; i >= 0; i--) {
    const r = items[i].rect;
    if (x >= r.x && x <= r.x+r.w && y >= r.y && y <= r.y+r.h) return items[i];
  }
  return null;
}
function pagePoint(layer, e) {
  const r = layer.getBoundingClientRect();
  return { x: clamp((e.clientX-r.left)/r.width,0,1), y: clamp((e.clientY-r.top)/r.height,0,1) };
}
function beginPlacement(type, src=null, text=null) {
  if (!state.pdfDoc) return toast('Open a PDF first.');
  const perm = type === 'signature' ? 'signature' : 'stamp';
  if (!requirePermission(perm)) return;
  placement = { type, src, text };
  selected = null;
  $('#annotToolbar').hidden = true;
  $('#pagesContainer').classList.add('placing-annotation');
  toast(type === 'signature' ? 'Tap/click where the signature should go.' : 'Tap/click where the company stamp should go.');
}
function cancelPlacement() {
  placement = null;
  $('#pagesContainer')?.classList.remove('placing-annotation');
}
function addPlaced(type, page, pt, src, text) {
  const r = type === 'stamp' ? {x:clamp(pt.x-.16,0,.68),y:clamp(pt.y-.07,0,.86),w:.32,h:.14} : {x:clamp(pt.x-.18,0,.64),y:clamp(pt.y-.045,0,.91),w:.36,h:.09};
  const a = { type, page, rect:r, color:$('#annotColor')?.value || '#0B4F8A' };
  if (src) a.src = src;
  if (text) a.text = text;
  a.id='a_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); a.createdAt=Date.now();
  state.annotations.push(a);
  state.undoStack.push({op:'add',id:a.id}); state.redoStack=[];
  persistAnnotations();
  A.drawAnnotationsForPage(page);
  decoratePage(page);
  selected=a;
  writeAudit(type+'-placed',{file:state.fileName,page});
  toast(type === 'signature' ? 'Signature placed. Drag or resize it as needed.' : 'Company stamp placed. Drag or resize it as needed.');
}
function makeInteractive(pageNum, a, layer, w, h) {
  const el = document.createElement('div');
  el.className = 'v07-annotation-control' + (selected===a ? ' selected' : '');
  el.dataset.annotationId = a.id;
  el.style.left=(a.rect.x*w)+'px'; el.style.top=(a.rect.y*h)+'px';
  el.style.width=(a.rect.w*w)+'px'; el.style.height=(a.rect.h*h)+'px';
  if(a.type==='signature') {
    const text=document.createElement('div'); text.className='v07-signature-visual'; text.textContent=a.text||'Signature'; text.style.color=a.color||'#0B4F8A'; el.appendChild(text);
  } else if(a.type==='stamp') {
    const img=document.createElement('img'); img.src=a.src||''; img.alt='Company stamp'; img.draggable=false; el.appendChild(img);
  }
  const handle=document.createElement('span'); handle.className='v07-resize-handle'; handle.title='Resize'; el.appendChild(handle);
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    selected=a;
    const p=state.pageEls[pageNum-1]; const pr=layer.getBoundingClientRect();
    const pt=pagePoint(layer,e);
    if(e.target===handle){ resize={a, pageNum, start:pt, rect:{...a.rect}, layer}; }
    else { drag={a,pageNum,start:pt,rect:{...a.rect},layer}; }
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if(!drag && !resize) return;
    const pt=pagePoint(layer,e);
    if(drag && drag.a===a){
      const dx=pt.x-drag.start.x, dy=pt.y-drag.start.y;
      a.rect.x=clamp(drag.rect.x+dx,0,1-a.rect.w); a.rect.y=clamp(drag.rect.y+dy,0,1-a.rect.h);
    } else if(resize && resize.a===a){
      const dx=pt.x-resize.start.x, dy=pt.y-resize.start.y;
      a.rect.w=clamp(resize.rect.w+dx,.02,1-resize.rect.x);
      a.rect.h=clamp(resize.rect.h+dy,.02,1-resize.rect.y);
    }
    persistAnnotations(); A.drawAnnotationsForPage(pageNum); decoratePage(pageNum);
    selected=a;
  });
  const end=()=>{ if(drag||resize){ persistAnnotations(); writeAudit('annotation-repositioned',{file:state.fileName,page:pageNum,type:a.type,id:a.id}); } drag=null; resize=null; };
  el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
  el.addEventListener('dblclick',e=>{e.stopPropagation(); if(confirm('Remove this '+a.type+'?')){const i=state.annotations.findIndex(x=>x.id===a.id);if(i>-1)state.annotations.splice(i,1);persistAnnotations();A.drawAnnotationsForPage(pageNum);decoratePage(pageNum);toast('Removed.');}});
  layer.appendChild(el);
}
function decoratePage(pageNum){
  const p=state.pageEls[pageNum-1]; if(!p?.annotLayer||!p.canvas) return;
  p.annotLayer.querySelectorAll('.v07-annotation-control').forEach(e=>e.remove());
  const w=p.canvas.clientWidth||p.wrap.clientWidth, h=p.canvas.clientHeight||p.wrap.clientHeight;
  state.annotations.filter(a=>a.page===pageNum&&(a.type==='signature'||a.type==='stamp')).forEach(a=>makeInteractive(pageNum,a,p.annotLayer,w,h));
}
function decorateAll(){ state.pageEls.forEach((_,i)=>decoratePage(i+1)); }
function onLayerPointerDown(e, layer){
  if(!placement) return;
  const pageNum=Number(layer.closest('.pdf-page')?.dataset.page); if(!pageNum)return;
  const pt=pagePoint(layer,e); e.preventDefault(); e.stopImmediatePropagation();
  if(placement.type==='signature'){
    const text=prompt('Type the signature name or initials:');
    if(text?.trim()) addPlaced('signature',pageNum,pt,null,text.trim());
    cancelPlacement();
  } else if(placement.type==='stamp') { addPlaced('stamp',pageNum,pt,placement.src); cancelPlacement(); }
}
function wire(){
  // Capture phase prevents the old v0.6 fixed-size signature/stamp handlers from firing.
  $('#pagesContainer').addEventListener('pointerdown',e=>{
    const layer=e.target.closest('.annot-layer'); if(layer) onLayerPointerDown(e,layer);
  },true);
  let queued=false, decorating=false;
  observer=new MutationObserver(()=>{if(decorating||queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorating=true;observer.disconnect();decorateAll();observer.observe($('#pagesContainer'),{subtree:true,childList:true});decorating=false;});});
  observer.observe($('#pagesContainer'),{subtree:true,childList:true});
  $('#btnESignature').addEventListener('click',e=>{e.stopImmediatePropagation();beginPlacement('signature');},true);
  $('#toolESignature').addEventListener('click',e=>{e.stopImmediatePropagation();$('#toolsMenu').hidden=true;beginPlacement('signature');},true);
  $('#btnCompanyStamp').addEventListener('click',e=>{e.stopImmediatePropagation();chooseStamp();},true);
  $('#toolCompanyStamp').addEventListener('click',e=>{e.stopImmediatePropagation();$('#toolsMenu').hidden=true;chooseStamp();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&placement)cancelPlacement();});
  window.addEventListener('resize',decorateAll);
}
function chooseStamp(){
  if(!requirePermission('stamp'))return;
  const src=state.settings.companyStamp;
  if(src) beginPlacement('stamp',src);
  else $('#stampInput').click();
}
window.addEventListener('DOMContentLoaded',()=>{
  wire();
  $('#stampInput').addEventListener('change',e=>{e.stopImmediatePropagation();const f=e.target.files?.[0]; if(!f)return; const rd=new FileReader();rd.onload=()=>beginPlacement('stamp',rd.result);rd.readAsDataURL(f);e.target.value='';},true);
  decorateAll();
});
