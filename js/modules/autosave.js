/* Mukorob PDF v0.7 — resilient local autosave/draft recovery. */
const AS = window.MukorobApp;
const { state, $, toast, currentUserId, writeAudit } = AS;
let lastSnapshot=''; let timer=null; let saving=false;
function draftId(){return currentUserId()+'::'+state.fileHash;}
function signature(){
  return JSON.stringify({hash:state.fileHash,name:state.fileName,rot:[...(state.pageRotations||new Map()).entries()],annotations:state.annotations});
}
async function saveDraft(force=false){
  if(!state.pdfDoc||!state.fileHash||saving)return;
  const sig=signature(); if(!force&&sig===lastSnapshot)return;
  saving=true;
  try{
    const bytes=state.fileBytesForExport?new Blob([state.fileBytesForExport],{type:'application/pdf'}):null;
    await window.MukorobDB.put('drafts',{id:draftId(),userId:currentUserId(),hash:state.fileHash,name:state.fileName,bytes,rotations:[...(state.pageRotations||new Map()).entries()],annotations:structuredClone(state.annotations),savedAt:Date.now()});
    lastSnapshot=sig;
    $('#autosaveStatus')&&( $('#autosaveStatus').textContent='Saved locally');
  }catch(err){console.warn('Autosave failed',err);$('#autosaveStatus')&&($('#autosaveStatus').textContent='Autosave unavailable');}
  finally{saving=false;}
}
async function checkDraft(){
  if(!state.fileHash)return;
  try{
    const d=await window.MukorobDB.get('drafts',draftId()); if(!d)return;
    const recent=await window.MukorobDB.get('recent_scoped',draftId());
    const openedAt=Date.now();
    if(recent?.lastOpened && d.savedAt<=recent.lastOpened+1000)return;
    if(d.savedAt<openedAt-1000*60*60*24*30)return;
    const ok=confirm(`Mukorob has a newer local draft of “${d.name}”. Restore your unsaved changes?`);
    if(!ok)return;
    state.annotations=Array.isArray(d.annotations)?d.annotations:[];
    state.pageRotations=new Map(d.rotations||[]);
    AS.drawAnnotationsForPage(state.currentPage);
    state.pageEls.forEach((_,i)=>{const p=state.pageEls[i];if(p?.rendered){p.rendered=false;if(p.canvas){p.canvas.width=0;p.canvas.height=0;p.canvas=null;}p.textLayer=null;p.annotLayer=null;}});
    AS.updateZoomControls();
    state.pageEls.forEach((_,i)=>AS.renderPage(i+1,true));
    lastSnapshot=signature(); toast('Unsaved local changes restored.');
    await writeAudit('draft-restored',{file:d.name});
  }catch(err){console.warn('Draft recovery unavailable',err);}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>saveDraft(false),1200);}
function wire(){
  const c=$('#pagesContainer');
  c.addEventListener('pointerup',schedule,true);
  document.addEventListener('keyup',schedule);
  window.addEventListener('beforeunload',()=>{if(state.pdfDoc)saveDraft(true);});
  setInterval(()=>{if(state.pdfDoc)saveDraft(false);},2500);
  window.addEventListener('mukorob:document-opened',async()=>{lastSnapshot='';$('#autosaveStatus')&&($('#autosaveStatus').textContent='Checking local draft…');await checkDraft();});
  window.addEventListener('mukorob:document-closed',()=>{lastSnapshot='';$('#autosaveStatus')&&($('#autosaveStatus').textContent='Ready');});
  $('#autosaveStatus')&&($('#autosaveStatus').textContent='Ready');
}
window.addEventListener('DOMContentLoaded',wire);
