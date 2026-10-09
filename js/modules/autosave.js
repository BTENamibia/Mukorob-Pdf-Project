/* User-scoped draft checkpoints and recovery before Recent timestamps change. */
const AS=window.MukorobApp;
const {state,$,currentUserId,writeAudit}=AS;
let lastSnapshot='',timer=null,pending=null,paused=false;
const draftId=()=>currentUserId()+'::'+state.fileHash;
const signature=()=>JSON.stringify({hash:state.fileHash,name:state.fileName,rot:[...(state.pageRotations||new Map()).entries()],annotations:state.annotations});
async function saveDraft(force=false){
  if(paused||!state.auth.user||!state.pdfDoc||!state.fileHash)return;
  if(pending){await pending;return saveDraft(force);}
  const snapshot=signature();if(!force&&snapshot===lastSnapshot)return;
  // Capture the owner, document and contents before any asynchronous write.
  const record={id:draftId(),userId:currentUserId(),hash:state.fileHash,name:state.fileName,bytes:new Blob([state.fileBytesForExport],{type:'application/pdf'}),rotations:[...state.pageRotations.entries()],annotations:structuredClone(state.annotations),savedAt:Date.now()};
  pending=(async()=>{
    try{await AS.db.put('drafts',record);if(record.id===draftId()){lastSnapshot=snapshot;if($('#autosaveStatus'))$('#autosaveStatus').textContent='Saved locally';}}
    catch(err){console.warn('Autosave failed',err);if($('#autosaveStatus'))$('#autosaveStatus').textContent='Autosave unavailable';}
  })();
  try{await pending;}finally{pending=null;}
}
async function recover(){
  if(!state.fileHash)return;
  try{
    const id=draftId(),d=await AS.db.get('drafts',id);
    if(!d||d.userId!==currentUserId()||d.hash!==state.fileHash||!d.bytes||d.savedAt<Date.now()-30*86400000)return;
    const sameAnnotations=JSON.stringify(d.annotations||[])===JSON.stringify(state.annotations||[]);
    const sameRotations=JSON.stringify(d.rotations||[])===JSON.stringify([...state.pageRotations.entries()]);
    if(sameAnnotations&&sameRotations)return;
    if(!confirm(`Restore the local draft of “${d.name}”, saved ${new Date(d.savedAt).toLocaleString()}?`))return;
    await AS.restoreDraftSource(await d.bytes.arrayBuffer(),d.rotations||[]);
    state.annotations=Array.isArray(d.annotations)?d.annotations:[];
    state.pageRotations=new Map(d.rotations||[]);
    await AS.persistAnnotations();
    await writeAudit('draft-restored',{file:d.name});
    AS.toast('Unsaved local changes restored.');
  }catch(err){console.warn('Draft recovery unavailable',err);AS.toast('The saved draft could not be restored. Your source PDF is still available.');}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>saveDraft(),1200);}
window.MukorobAutosave={flush:()=>saveDraft(true),recover,pause:()=>{paused=true;},resume:()=>{paused=false;}};
function wire(){
  $('#pagesContainer').addEventListener('pointerup',schedule,true);
  document.addEventListener('keyup',schedule);
  window.addEventListener('beforeunload',()=>saveDraft(true));
  window.addEventListener('pagehide',()=>saveDraft(true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft(true);});
  setInterval(()=>saveDraft(),2500);
  window.addEventListener('mukorob:document-opened',()=>{paused=false;lastSnapshot='';schedule();});
  window.addEventListener('mukorob:document-closed',()=>{clearTimeout(timer);lastSnapshot='';$('#autosaveStatus').textContent='Ready';});
  $('#autosaveStatus').textContent='Ready';
}
window.addEventListener('DOMContentLoaded',wire);
