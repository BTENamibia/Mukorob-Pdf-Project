/* Responsive PDF navigation. Developed by Bradz Trading Enterprises CC. */
const A=window.MukorobApp,viewer=document.querySelector('#viewer');
const inputs=[...document.querySelectorAll('.zoom-percent')];
for(const input of inputs){
  const restore=()=>input.value=Math.round(A.state.scale*100);
  input.addEventListener('change',()=>{const value=Number(input.value);if(value>=30&&value<=400)A.setScale(value/100);else A.toast('Enter a zoom percentage from 30 to 400.');restore();});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){input.dispatchEvent(new Event('change'));input.blur();}if(e.key==='Escape'){restore();input.blur();e.stopPropagation();}});
}
viewer.addEventListener('wheel',e=>{
  if(!A.state.pdfDoc||!(e.ctrlKey||e.metaKey))return;
  e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewer.clientHeight:1);
  A.setScale(A.state.scale*Math.exp(-Math.max(-120,Math.min(120,delta))*.002),{x:e.clientX,y:e.clientY});
},{passive:false});
let hand=false,drag=null;
const buttons=[...document.querySelectorAll('.hand-tool')];
function selectHand(value){hand=value;viewer.classList.toggle('hand-mode',hand);buttons.forEach(b=>b.setAttribute('aria-pressed',String(hand)));}
buttons.forEach(b=>b.addEventListener('click',()=>selectHand(!hand)));
viewer.addEventListener('pointerdown',e=>{
  if(!hand||!A.state.pdfDoc||e.button!==0||e.pointerType==='touch'||!e.target.closest('.pdf-page'))return;
  e.preventDefault();e.stopPropagation();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewer.scrollLeft,top:viewer.scrollTop};viewer.setPointerCapture(e.pointerId);viewer.classList.add('hand-dragging');
},true);
viewer.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;viewer.scrollLeft=drag.left+drag.x-e.clientX;viewer.scrollTop=drag.top+drag.y-e.clientY;});
const end=()=>{drag=null;viewer.classList.remove('hand-dragging');};
viewer.addEventListener('pointerup',end);viewer.addEventListener('pointercancel',end);viewer.addEventListener('lostpointercapture',end);
window.addEventListener('mukorob:document-closed',()=>{end();selectHand(false);});
