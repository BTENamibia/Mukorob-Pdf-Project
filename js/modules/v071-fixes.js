/* Mukorob PDF v0.7.1 corrective layer.
   Keeps legacy core intact while making the user-facing rotation and
   signature/stamp interactions deterministic. */
const A = window.MukorobApp;

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function rectForDisplay(r,rot){
  const x=r.x,y=r.y,w=r.w,h=r.h;
  switch(((rot%360)+360)%360){
    case 90:return {x:1-(y+h),y:x,w:h,h:w};
    case 180:return {x:1-(x+w),y:1-(y+h),w,h};
    case 270:return {x:y,y:1-(x+w),w:h,h:w};
    default:return {x,y,w,h};
  }
}
function docPointFromDisplay(p,rot){
  switch(((rot%360)+360)%360){
    case 90:return {x:p.y,y:1-p.x};
    case 180:return {x:1-p.x,y:1-p.y};
    case 270:return {x:1-p.y,y:p.x};
    default:return p;
  }
}
function point(layer,e){const r=layer.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)};}
function removeCoreVisuals(layer){
  layer.querySelectorAll('.v071-core-signature,.stamp-annotation').forEach(n=>n.remove());
  layer.querySelectorAll('[style*="cursive"]').forEach(n=>n.remove());
}
function deleteAnnotation(a){
  const s=A.state,i=s.annotations.findIndex(x=>x.id===a.id); if(i<0)return;
  s.annotations.splice(i,1); s.undoStack.push({op:'remove',annotation:a}); s.redoStack=[];
  A.persistAnnotations(); A.drawAnnotationsForPage(a.page); A.toast((a.type==='signature'?'Signature':'Company stamp')+' deleted.');
  A.writeAudit('annotation-deleted',{file:s.fileName,page:a.page,type:a.type,id:a.id});
}
function interactive(pageNum,a,layer,w,h){
  const el=document.createElement('div'); el.className='v071-annotation-control selected'; el.dataset.annotationId=a.id;
  const d=rectForDisplay(a.rect,A.state.pageRotations?.get(pageNum)||0);
  Object.assign(el.style,{position:'absolute',left:d.x*w+'px',top:d.y*h+'px',width:d.w*w+'px',height:d.h*h+'px',touchAction:'none'});
  if(a.type==='signature'){
    const text=document.createElement('div'); text.className='v071-signature-visual'; text.textContent=a.text||'Signature'; text.style.color=a.color||'#0B4F8A'; el.appendChild(text);
  }else{
    const img=document.createElement('img'); img.src=a.src||''; img.alt='Company stamp'; img.draggable=false; img.className='v071-stamp-visual'; el.appendChild(img);
  }
  const del=document.createElement('button'); del.type='button'; del.className='v071-delete'; del.title='Delete'; del.setAttribute('aria-label','Delete '+a.type); del.textContent='×';
  const handle=document.createElement('span'); handle.className='v071-resize-handle'; handle.title='Resize';
  el.append(del,handle);
  let mode=null,start=null,base=null;
  const finish=()=>{if(mode){A.persistAnnotations();A.writeAudit('annotation-repositioned',{file:A.state.fileName,page:pageNum,type:a.type,id:a.id});}mode=null;start=null;base=null;};
  el.addEventListener('pointerdown',e=>{
    e.stopPropagation(); e.preventDefault();
    if(e.target===del){deleteAnnotation(a);return;}
    const rot=A.state.pageRotations?.get(pageNum)||0; start=point(layer,e); base={...a.rect}; mode=e.target===handle?'resize':'drag'; el.setPointerCapture?.(e.pointerId);
    A.state.selectedAnnotationId=a.id;
  });
  el.addEventListener('pointermove',e=>{
    if(!mode)return; const rot=A.state.pageRotations?.get(pageNum)||0,cur=point(layer,e);
    if(mode==='drag'){
      const ds=docPointFromDisplay(start,rot), dc=docPointFromDisplay(cur,rot);
      a.rect.x=clamp(base.x+(dc.x-ds.x),0,1-a.rect.w); a.rect.y=clamp(base.y+(dc.y-ds.y),0,1-a.rect.h);
    }else{
      const dd=docPointFromDisplay(cur,rot), ds=docPointFromDisplay(start,rot);
      a.rect.w=clamp(base.w+(dd.x-ds.x),.02,1-a.rect.x); a.rect.h=clamp(base.h+(dd.y-ds.y),.02,1-a.rect.y);
    }
    const nd=rectForDisplay(a.rect,rot); Object.assign(el.style,{left:nd.x*w+'px',top:nd.y*h+'px',width:nd.w*w+'px',height:nd.h*h+'px'});
  });
  el.addEventListener('pointerup',finish); el.addEventListener('pointercancel',finish);
  del.addEventListener('click',e=>{e.stopPropagation();deleteAnnotation(a);});
  layer.appendChild(el);
}
function decorate(pageNum){
  const s=A.state,p=s.pageEls[pageNum-1]; if(!p?.annotLayer||!p.canvas)return;
  removeCoreVisuals(p.annotLayer); p.annotLayer.querySelectorAll('.v071-annotation-control,.v07-annotation-control').forEach(n=>n.remove());
  const w=p.canvas.clientWidth||p.wrap.clientWidth,h=p.canvas.clientHeight||p.wrap.clientHeight;
  s.annotations.filter(a=>a.page===pageNum&&(a.type==='signature'||a.type==='stamp')).forEach(a=>interactive(pageNum,a,p.annotLayer,w,h));
}
function decorateAll(){A.state.pageEls.forEach((_,i)=>decorate(i+1));}
function addRotateBar(){
  if(document.getElementById('v071RotateBar'))return;
  const bar=document.createElement('div');bar.id='v071RotateBar';bar.innerHTML='<span>Rotate</span><button type="button" id="v071RotateLeft" aria-label="Rotate left">↶</button><button type="button" id="v071RotateRight" aria-label="Rotate right">↷</button>';
  document.body.appendChild(bar);
  const rotate=async delta=>{
    const s=A.state;if(!s.pdfDoc||!A.hasPermission('edit'))return;
    const n=s.currentPage,rot=s.pageRotations?.get(n)||0;
    if(!s.pageRotations)s.pageRotations=new Map(); s.pageRotations.set(n,((rot+delta)%360+360)%360);
    const p=s.pageEls[n-1]; if(p){p.rendered=false;p.canvas=null;p.annotLayer=null;p.textLayer=null;p.wrap.innerHTML='';}
    A.updateZoomControls(); A.renderPage(n,true); decorate(n);
    A.writeAudit('page-rotated',{file:s.fileName,page:n,delta,rotation:s.pageRotations.get(n)});
    A.toast('Page '+n+' rotated '+(delta<0?'left':'right')+'.');
  };
  bar.querySelector('#v071RotateLeft').addEventListener('click',()=>rotate(-90));bar.querySelector('#v071RotateRight').addEventListener('click',()=>rotate(90));
}
function panViewer(){
  const viewer=document.getElementById('viewer');if(!viewer||viewer.dataset.v071Pan)return;viewer.dataset.v071Pan='1';
  let drag=null;
  viewer.addEventListener('pointerdown',e=>{
    if(e.target.closest('.v071-annotation-control,.v07-annotation-control,.text-layer,button,input,select,textarea'))return;
    if(e.button!==0)return; drag={x:e.clientX,y:e.clientY,l:viewer.scrollLeft,t:viewer.scrollTop}; viewer.classList.add('v071-panning'); viewer.setPointerCapture?.(e.pointerId);
  });
  viewer.addEventListener('pointermove',e=>{if(!drag)return;viewer.scrollLeft=drag.l-(e.clientX-drag.x);viewer.scrollTop=drag.t-(e.clientY-drag.y);});
  const end=()=>{drag=null;viewer.classList.remove('v071-panning');};viewer.addEventListener('pointerup',end);viewer.addEventListener('pointercancel',end);
}
function brandingUI(){
  const modal=document.getElementById('adminPanel'); if(!modal||document.getElementById('v071Branding'))return;
  const sec=document.createElement('section');sec.id='v071Branding';sec.innerHTML='<h3>Logo spaces</h3><p class="hint">Configure each Mukorob PDF logo independently. PNG, JPG and WebP are supported.</p><div class="v071-logo-grid"><div><b>Top-left header logo</b><img id="v071LogoHeaderPreview"><input id="v071LogoHeader" type="file" accept="image/png,image/jpeg,image/webp"></div><div><b>Dashboard logo</b><img id="v071LogoDashboardPreview"><input id="v071LogoDashboard" type="file" accept="image/png,image/jpeg,image/webp"></div><div><b>Login background logo</b><img id="v071LogoLoginBgPreview"><input id="v071LogoLoginBg" type="file" accept="image/png,image/jpeg,image/webp"></div><div><b>Login icon logo</b><img id="v071LogoLoginIconPreview"><input id="v071LogoLoginIcon" type="file" accept="image/png,image/jpeg,image/webp"></div></div><button id="v071BrandingSave" class="primary-btn">Save logo spaces</button>';
  modal.prepend(sec);
  const s=A.state.settings;
  const vals={header:s.logo||'icons/icon-192.png',dashboard:s.dashboardLogo||s.logo||'icons/icon-192.png',loginBg:s.loginBackgroundLogo||s.logo||'icons/mukorob-pdf-logo.jpg',loginIcon:s.loginIconLogo||'icons/icon-192.png'};
  for(const [k,v] of Object.entries(vals)){document.getElementById('v071Logo'+({header:'Header',dashboard:'Dashboard',loginBg:'LoginBg',loginIcon:'LoginIcon'}[k])+'Preview').src=v;}
  const bind=(input,preview,key)=>document.getElementById(input).addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{document.getElementById(preview).src=r.result;document.getElementById(preview).dataset.value=r.result;};r.readAsDataURL(f);});
  bind('v071LogoHeader','v071LogoHeaderPreview','logo');bind('v071LogoDashboard','v071LogoDashboardPreview','dashboardLogo');bind('v071LogoLoginBg','v071LogoLoginBgPreview','loginBackgroundLogo');bind('v071LogoLoginIcon','v071LogoLoginIconPreview','loginIconLogo');
  document.getElementById('v071BrandingSave').addEventListener('click',async()=>{const map={logo:'v071LogoHeaderPreview',dashboardLogo:'v071LogoDashboardPreview',loginBackgroundLogo:'v071LogoLoginBgPreview',loginIconLogo:'v071LogoLoginIconPreview'};for(const[k,id]of Object.entries(map)){const v=document.getElementById(id).dataset.value;if(v)A.state.settings[k]=v;}await A.saveSettings();A.applySettings();applyLoginBranding();A.toast('Logo spaces saved.');});
}
function applyLoginBranding(){const s=A.state.settings;const bg=s.loginBackgroundLogo||s.logo;const icon=s.loginIconLogo||s.logo;document.querySelectorAll('#authModal .auth-brand img,#accessGate .auth-brand img').forEach(i=>{i.src=icon||'icons/icon-192.png';});const cards=document.querySelectorAll('#authModal .auth-card,#accessGate .auth-card');cards.forEach(c=>{if(bg)c.style.backgroundImage=`linear-gradient(rgba(5,18,36,.88),rgba(5,18,36,.94)),url("${bg}")`;});const d=document.querySelector('.empty-mark');if(d)d.src=s.dashboardLogo||s.logo||'icons/mukorob-pdf-logo.jpg';}
function mobileZoom(){const viewer=document.getElementById('viewer');if(!viewer||viewer.dataset.v071Zoom)return;viewer.dataset.v071Zoom='1';let initial=0,startScale=1;viewer.addEventListener('touchstart',e=>{if(e.touches.length===2){initial=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);startScale=A.state.scale;}} ,{passive:true});viewer.addEventListener('touchmove',e=>{if(e.touches.length!==2||!initial)return;const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(d>0){const factor=d/initial;A.state.scale=clamp(startScale*factor,.3,4);A.updateZoomControls();A.state.pageEls.forEach((p,i)=>{if(p.rendered){p.rendered=false;A.renderPage(i+1,true);}});}}, {passive:true});viewer.addEventListener('touchend',()=>{initial=0;},{passive:true});}
function forceSwUpdate(){if(!('serviceWorker' in navigator))return;navigator.serviceWorker.register('./sw.js?v=0.7.1-fix1',{updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{});reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller&&!sessionStorage.getItem('mk071-sw-reloaded')){sessionStorage.setItem('mk071-sw-reloaded','1');location.reload();}});});}).catch(()=>{});}
function wire(){
  addRotateBar();panViewer();mobileZoom();brandingUI();applyLoginBranding();forceSwUpdate();
  const s=A.state;
  const redraw=()=>setTimeout(decorateAll,50);
  document.addEventListener('mukorob:document-opened',redraw);document.addEventListener('mukorob:document-closed',redraw);
  const obs=new MutationObserver(()=>{if(!wire.busy){wire.busy=true;requestAnimationFrame(()=>{wire.busy=false;decorateAll();});}});obs.observe(document.getElementById('pagesContainer'),{subtree:true,childList:true});
  document.addEventListener('keydown',e=>{if((e.key==='Delete'||e.key==='Backspace')&&s.selectedAnnotationId){const a=s.annotations.find(x=>x.id===s.selectedAnnotationId);if(a&&(a.type==='signature'||a.type==='stamp'))deleteAnnotation(a);}});
}
window.addEventListener('DOMContentLoaded',wire);
