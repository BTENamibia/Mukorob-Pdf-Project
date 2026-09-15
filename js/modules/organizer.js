/* Mukorob PDF v0.7 — visual page organiser. */
const O=window.MukorobApp; const {state,$,toast,requirePermission,writeAudit,loadPdfLibDocument,saveBytesAs,makeFileFromBytes}=O;
let dragFrom=null;
function addButton(parent,label,fn,cls='text-btn'){const b=document.createElement('button');b.className=cls;b.textContent=label;b.type='button';b.addEventListener('click',fn);parent.appendChild(b);return b;}
async function openOrganizer(){
  if(!state.pdfDoc)return toast('Open a PDF first.'); if(!requirePermission('edit'))return;
  let modal=$('#organizerModal'); if(!modal){modal=document.createElement('div');modal.id='organizerModal';modal.className='modal-backdrop';modal.innerHTML='<div class="modal organizer-modal"><header class="modal-head"><h2>Page organiser</h2><button class="icon-btn" id="organizerClose">✕</button></header><div class="modal-body"><p class="muted">Drag pages to reorder them. Use Delete to remove a page.</p><div id="organizerGrid" class="organizer-grid"></div><div class="row-gap organizer-actions"></div></div></div>';document.body.appendChild(modal);$('#organizerClose').addEventListener('click',()=>modal.hidden=true); const actions=modal.querySelector('.organizer-actions'); addButton(actions,'Duplicate current page',duplicateCurrentPage); addButton(actions,'Close',()=>modal.hidden=true,'text-btn');}
  modal.hidden=false;renderGrid();
}
async function renderGrid(){
  const grid=$('#organizerGrid');grid.innerHTML='';
  for(let i=1;i<=state.numPages;i++){
    const card=document.createElement('div');card.className='organizer-card';card.draggable=true;card.dataset.page=i;
    const canvas=document.createElement('canvas');canvas.width=140;canvas.height=Math.round(140*(state.baseViewport.height/state.baseViewport.width));
    const lab=document.createElement('div');lab.className='organizer-label';lab.textContent='Page '+i;
    const del=document.createElement('button');del.className='text-btn danger';del.textContent='Delete';del.disabled=state.numPages<=1;del.addEventListener('click',e=>{e.stopPropagation();deleteOrganizedPage(i);});
    card.append(canvas,lab,del);card.addEventListener('dragstart',()=>dragFrom=i);card.addEventListener('dragover',e=>e.preventDefault());card.addEventListener('drop',e=>{e.preventDefault();if(dragFrom&&dragFrom!==i)reorderOrganized(dragFrom,i);dragFrom=null;});grid.appendChild(card);
    try{const pg=await state.pdfDoc.getPage(i);const vp=pg.getViewport({scale:140/state.baseViewport.width,rotation:state.pageRotations?.get(i)||0});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;}catch(_){ }
  }
}
async function reorderOrganized(from,to){
  if(!requirePermission('edit'))return;
  try{
    const oldAnnotations=structuredClone(state.annotations||[]); const oldRotations=new Map(state.pageRotations||[]);
    const oldName=state.fileName; const src=await loadPdfLibDocument(); const order=src.getPages().map((_,i)=>i); const [m]=order.splice(from-1,1); order.splice(to-1,0,m);
    const out=await PDFLib.PDFDocument.create(); (await out.copyPages(src,order)).forEach(p=>out.addPage(p));
    const bytes=await out.save({useObjectStreams:true});
    const mappedAnnotations=oldAnnotations.map(a=>({...a,page:order.indexOf(a.page-1)+1})).filter(a=>a.page>0);
    const mappedRotations=new Map(); order.forEach((oldIndex,newIndex)=>mappedRotations.set(newIndex+1,oldRotations.get(oldIndex+1)||0));
    await O.openFile(makeFileFromBytes(bytes,oldName.replace(/\.pdf$/i,'')+' (reordered).pdf'));
    state.annotations=mappedAnnotations; state.pageRotations=mappedRotations; await O.persistAnnotations(); state.pageEls.forEach((_,i)=>O.renderPage(i+1,true));
    await writeAudit('page-reordered',{file:oldName,from,to});toast('Page order updated and annotations preserved.');$('#organizerModal').hidden=true;
  }catch(e){console.error(e);toast('Could not reorder pages.');}
}
async function duplicateCurrentPage(){
  if(!state.pdfDoc||!requirePermission('edit'))return;
  try{const src=await loadPdfLibDocument();const out=await PDFLib.PDFDocument.create();const idx=state.currentPage-1;const cp=await out.copyPages(src,[idx,idx]);cp.forEach(p=>out.addPage(p));toast('Creating duplicate-page document…');await O.openFile(makeFileFromBytes(await out.save({useObjectStreams:true}),state.fileName.replace(/\.pdf$/i,'')+' (duplicate page).pdf'));toast('Duplicate page PDF created.');$('#organizerModal').hidden=true;}catch(e){console.error(e);toast('Could not duplicate the page.');}
}
async function deleteOrganizedPage(n){
  if(state.numPages<=1)return; if(!confirm('Delete page '+n+'?'))return;
  try{
    const oldAnnotations=structuredClone(state.annotations||[]); const oldRotations=new Map(state.pageRotations||[]); const oldName=state.fileName; const src=await loadPdfLibDocument(); src.removePage(n-1);
    const bytes=await src.save({useObjectStreams:true});
    const mappedAnnotations=oldAnnotations.filter(a=>a.page!==n).map(a=>({...a,page:a.page>n?a.page-1:a.page}));
    const mappedRotations=new Map(); for(let old=1;old<=state.numPages;old++){if(old===n)continue;mappedRotations.set(old+(old>n?-1:0),oldRotations.get(old)||0);}
    await O.openFile(makeFileFromBytes(bytes,oldName.replace(/\.pdf$/i,'')+' (edited).pdf'));
    state.annotations=mappedAnnotations; state.pageRotations=mappedRotations; await O.persistAnnotations(); state.pageEls.forEach((_,i)=>O.renderPage(i+1,true));
    await writeAudit('page-deleted',{file:oldName,page:n});toast('Page deleted and annotations preserved.');$('#organizerModal').hidden=true;
  }catch(e){console.error(e);toast('Could not delete that page.');}
}
function wire(){
  const btn=$('#toolPageOrganizer') || document.createElement('button');
  if(!btn.parentElement){btn.id='toolPageOrganizer';btn.textContent='▦ Page organiser';btn.type='button';$('#toolsMenu')?.insertBefore(btn,$('#toolRotateLeft'));}
  btn.addEventListener('click',()=>{$('#toolsMenu').hidden=true;openOrganizer();});
  const top=document.createElement('button');top.id='btnPageOrganizer';top.className='icon-btn doc-control';top.title='Page organiser';top.textContent='▦';top.disabled=true;top.addEventListener('click',openOrganizer);$('#btnPdfEdit')?.insertAdjacentElement('afterend',top);
  const update=()=>{top.disabled=!state.pdfDoc||!state.auth.user||!requirePermissionSilent('edit');};
  function requirePermissionSilent(p){return state.auth.user&&(state.auth.user.role==='superadmin'||state.auth.user.permissions?.[p]===true);}
  setInterval(update,800);
}
window.addEventListener('DOMContentLoaded',wire);
