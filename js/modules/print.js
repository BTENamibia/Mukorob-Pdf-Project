/* Mukorob PDF v0.7 — browser-native print surface. */
const P = window.MukorobApp;
const { state, $, toast, requirePermission, writeAudit } = P;
let printing=false;

function ensureSurface(){
  let s=$('#mukorobPrintSurface');
  if(!s){s=document.createElement('div');s.id='mukorobPrintSurface';document.body.appendChild(s);}
  s.innerHTML=''; return s;
}
function drawAnnotation(ctx,a,w,h){
  if(a.type==='highlight'){ctx.fillStyle=a.color||'#E2A321';ctx.globalAlpha=.35;ctx.fillRect(a.rect.x*w,a.rect.y*h,a.rect.w*w,a.rect.h*h);ctx.globalAlpha=1;}
  else if(a.type==='ink'){ctx.strokeStyle=a.color||'#0B4F8A';ctx.lineWidth=Math.max(2,w/500);ctx.lineCap='round';ctx.beginPath();a.points?.forEach((pt,i)=>i?ctx.lineTo(pt.x*w,pt.y*h):ctx.moveTo(pt.x*w,pt.y*h));ctx.stroke();}
  else if(a.type==='signature'){ctx.fillStyle=a.color||'#0B4F8A';ctx.font=`italic ${Math.max(20,h*.025)}px cursive`;ctx.fillText(a.text||'Signature',a.rect.x*w,(a.rect.y+a.rect.h*.78)*h);}
  else if(a.type==='stamp'&&a.src){const img=new Image();img.src=a.src;/* stamp is composited in async pass */}
}
async function renderPrintPage(pageNum, scale){
  const page=await state.pdfDoc.getPage(pageNum); const rot=state.pageRotations?.get(pageNum)||0;
  const vp=page.getViewport({scale,rotation:rot}); const canvas=document.createElement('canvas'); canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
  const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport:vp,intent:'print'}).promise;
  const anns=state.annotations.filter(a=>a.page===pageNum);
  // Annotation coordinates are normalized to the displayed rotated page.
  for(const a of anns){
    if(a.type==='stamp'&&a.src){await new Promise(resolve=>{const img=new Image();img.onload=()=>{ctx.drawImage(img,a.rect.x*canvas.width,a.rect.y*canvas.height,a.rect.w*canvas.width,a.rect.h*canvas.height);resolve();};img.onerror=resolve;img.src=a.src;});}
    else drawAnnotation(ctx,a,canvas.width,canvas.height);
  }
  return canvas.toDataURL('image/png');
}
async function printPdf(){
  if(printing)return; if(!state.pdfDoc)return toast('Open a PDF first.'); if(!requirePermission('print'))return;
  printing=true; const surface=ensureSurface(); surface.hidden=false;
  toast('Preparing print preview…',5000);
  try{
    const scale=window.devicePixelRatio>1?1.75:1.5;
    for(let i=1;i<=state.numPages;i++){
      const src=await renderPrintPage(i,scale); const sheet=document.createElement('div');sheet.className='mukorob-print-page';
      const img=document.createElement('img');img.src=src;img.alt=`Page ${i}`;sheet.appendChild(img);surface.appendChild(sheet);
    }
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const cleanup=()=>{surface.innerHTML='';surface.hidden=true;window.removeEventListener('afterprint',cleanup);printing=false;};
    window.addEventListener('afterprint',cleanup,{once:true});
    await writeAudit('print',{file:state.fileName,edited:P.hasWorkingEdits()});
    // Critical fix: no iframe, no new tab/window. Print the current Mukorob document context.
    window.print();
    setTimeout(()=>{if(printing)cleanup();},120000);
  }catch(err){console.error(err);surface.hidden=true;surface.innerHTML='';printing=false;toast('Print preparation failed. Please try again.');}
}
function wire(){
  ['#btnPrint','#btnPrintMobile','#toolPrint'].forEach(sel=>$(sel)?.addEventListener('click',e=>{e.stopImmediatePropagation();$('#toolsMenu')&&(sel==='#toolPrint'?$('#toolsMenu').hidden=true:null);printPdf();},true));
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'&&state.pdfDoc){e.preventDefault();e.stopImmediatePropagation();printPdf();}},true);
  window.MukorobPrint={printPdf};
}
window.addEventListener('DOMContentLoaded',wire);
