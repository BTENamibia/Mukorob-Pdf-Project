/* Mukorob PDF v0.7 — browser-native print surface. */
const P = window.MukorobApp;
const { state, $, toast, requirePermission, writeAudit } = P;
let printing=false;

function ensureSurface(){
  let s=$('#mukorobPrintSurface');
  if(!s){s=document.createElement('div');s.id='mukorobPrintSurface';document.body.appendChild(s);}
  s.innerHTML=''; return s;
}
async function renderPrintPage(pdfDocument,pageNum,scale){
  const page=await pdfDocument.getPage(pageNum);
  const base=page.getViewport({scale});
  const boundedScale=scale*Math.min(1,Math.sqrt(12_000_000/(base.width*base.height)));
  const vp=page.getViewport({scale:boundedScale});const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
  const ctx=canvas.getContext('2d',{alpha:false});
  await page.render({canvasContext:ctx,viewport:vp,intent:'print'}).promise;
  const image=canvas.toDataURL('image/png');canvas.width=0;canvas.height=0;return image;
}
async function printPdf(){
  if(printing)return; if(!state.pdfDoc)return toast('Open a PDF first.'); if(!requirePermission('print'))return;
  printing=true; let printDocument=null; const surface=ensureSurface(); surface.hidden=false;
  toast('Preparing print preview…',5000);
  try{
    const bytes=await P.buildWorkingPdfBytes();
    printDocument=await pdfjsLib.getDocument({data:new Uint8Array(bytes).slice()}).promise;
    const scale=window.devicePixelRatio>1?1.75:1.5;
    for(let i=1;i<=printDocument.numPages;i++){
      const src=await renderPrintPage(printDocument,i,scale); const sheet=document.createElement('div');sheet.className='mukorob-print-page';
      const img=document.createElement('img');img.src=src;img.alt=`Page ${i}`;sheet.appendChild(img);surface.appendChild(sheet);
    }
    await printDocument.destroy();printDocument=null;
    await Promise.all([...surface.querySelectorAll('img')].map(img=>img.decode()));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const cleanup=()=>{surface.innerHTML='';surface.hidden=true;window.removeEventListener('afterprint',cleanup);printing=false;};
    window.addEventListener('afterprint',cleanup,{once:true});
    await writeAudit('print',{file:state.fileName,edited:P.hasWorkingEdits()});
    // Critical fix: no iframe, no new tab/window. Print the current Mukorob document context.
    window.print();
    setTimeout(()=>{if(printing)cleanup();},120000);
  }catch(err){if(printDocument)await printDocument.destroy().catch(()=>{});console.error(err);surface.hidden=true;surface.innerHTML='';printing=false;toast('Print preparation failed. Please try again.');}
}
function wire(){
  ['#btnPrint','#btnPrintMobile','#toolPrint'].forEach(sel=>$(sel)?.addEventListener('click',e=>{e.stopImmediatePropagation();$('#toolsMenu')&&(sel==='#toolPrint'?$('#toolsMenu').hidden=true:null);printPdf();},true));
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'&&state.pdfDoc){e.preventDefault();e.stopImmediatePropagation();printPdf();}},true);
  window.MukorobPrint={printPdf};
}
window.addEventListener('DOMContentLoaded',wire);
