import {test,expect,openTestPdf} from './browser-fixtures.mjs';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('pdf-lib');
async function fixture(count=12){const doc=await lib.PDFDocument.create();for(let i=0;i<count;i++){const p=doc.addPage(i%2?[800,600]:[600,800]);p.drawText('Mukorob zoom test page '+(i+1),{x:35,y:500,size:18});for(let k=0;k<100;k++)p.drawText('Bradz Trading Enterprises CC - sample text '+k,{x:35,y:480-k*4,size:7});}return doc.save();}
async function settled(page){await expect.poll(()=>page.evaluate(()=>{const s=window.MukorobApp.state;return !s.zoomPending&&s.pageEls.filter(p=>p.rendering).length===0;}),{timeout:20000}).toBe(true);}
test('rapid zoom has immediate preview, retains bitmap and sharpens only nearby pages',async({page},info)=>{
 await openTestPdf(page,await fixture());await settled(page);
 const result=await page.evaluate(()=>{
  const A=window.MukorobApp,p=A.state.pageEls[0];const original=p.canvas;const before=performance.now();
  for(let i=0;i<15;i++)A.setScale(i%2?1.1:1.2);
  A.setScale(1.5);
  return {ms:performance.now()-before,kept:p.canvas===original,width:parseFloat(p.wrap.style.width),scale:A.state.scale};
 });
 expect(result.kept).toBe(true);expect(result.scale).toBe(1.5);expect(result.width).toBe(900);expect(result.ms).toBeLessThan(500);
 await settled(page);
 const details=await page.evaluate(()=>window.MukorobApp.state.pageEls.map(p=>({key:p.renderKey,rendered:p.rendered,pixels:p.canvas?p.canvas.width*p.canvas.height:0})));
 expect(details.filter(p=>p.rendered).length).toBeLessThan(6);expect(Math.max(...details.map(p=>p.pixels))).toBeLessThanOrEqual(info.project.name==='mobile'?6_010_000:12_020_000);
 console.log(info.project.name+' rapid zoom preview: '+result.ms.toFixed(1)+'ms');
});
test('zoom input, Ctrl wheel, mixed page sizes and hand tool work',async({page},info)=>{
 await openTestPdf(page,await fixture(3));await settled(page);
 const input=page.locator(info.project.name==='mobile'?'#zoomPercentMobile':'#zoomPercent');
 await input.fill('200');await input.press('Enter');await settled(page);
 if(process.env.MUKOROB_SCREENSHOTS)await page.screenshot({path:`/tmp/mukorob-zoom-${info.project.name}.png`});
 expect(await page.evaluate(()=>window.MukorobApp.state.scale)).toBe(2);
 await page.locator('#viewer').dispatchEvent('wheel',{ctrlKey:true,deltaY:-100,clientX:190,clientY:240});
 expect(await page.evaluate(()=>window.MukorobApp.state.scale)).toBeGreaterThan(2);await settled(page);
 await page.evaluate(async()=>{const A=window.MukorobApp;A.setScale(1);await A.renderPage(2,true);});await settled(page);
 expect(await page.locator('.pdf-page').nth(1).evaluate(el=>parseFloat(el.style.width))).toBe(800);
 await page.locator(info.project.name==='mobile'?'#btnHandMobile':'#btnHandTool').click();
 await expect(page.locator('#viewer')).toHaveClass(/hand-mode/);
 if(info.project.name==='desktop'){
  await page.evaluate(()=>window.MukorobApp.setScale(2));await settled(page);
  const rect=await page.locator('#viewer').boundingBox();await page.mouse.move(rect.x+150,rect.y+200);await page.mouse.down();await page.mouse.move(rect.x+100,rect.y+100);await page.mouse.up();
  expect(await page.locator('#viewer').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 }
});
test('zoom preserves a page point and no stale render survives close',async({page})=>{
 await openTestPdf(page,await fixture());await settled(page);
 const drift=await page.evaluate(()=>{const A=window.MukorobApp,v=document.querySelector('#viewer'),p=A.state.pageEls[0].wrap;v.scrollTop=150;const r=p.getBoundingClientRect(),vr=v.getBoundingClientRect(),y=vr.top+200,x=vr.left+vr.width/2,fy=(y-r.top)/r.height,fx=(x-r.left)/r.width;A.setScale(A.state.scale*1.5,{x,y});const after=p.getBoundingClientRect();return Math.abs(after.top+fy*after.height-y)+Math.abs(after.left+fx*after.width-x);});
 expect(drift).toBeLessThan(3);
 await page.evaluate(async()=>{const A=window.MukorobApp;A.setScale(3);await A.closeDocument();});await page.waitForTimeout(300);await expect(page.locator('.pdf-page')).toHaveCount(0);
});
test('combine and extract save copies, validate ranges and keep original open',async({page})=>{
 const bytes=await fixture(2);await openTestPdf(page,bytes);
 await page.locator('#btnTools').click();await page.locator('#toolDocumentTools').click();await page.locator('#toolExtractCopy').click();
 await page.getByLabel('Pages to extract (all, 1, 3-5)').fill('3');await page.locator('#btnExtractCopy').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('outside');
 await page.getByLabel('Pages to extract (all, 1, 3-5)').fill('2');await page.locator('#btnExtractCopy').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('copy saved');
 let saved=await page.evaluate(()=>window.__saved);let out=await lib.PDFDocument.load(new Uint8Array(saved.bytes));expect(out.getPageCount()).toBe(1);expect(out.getPage(0).getWidth()).toBe(800);
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('#btnTools').click();await page.locator('#toolDocumentTools').click();await page.locator('#toolCombinePdfs').click();
 await page.getByLabel('Choose PDFs to combine').setInputFiles([{name:'one.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)},{name:'two.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)}]);
 await page.getByRole('button',{name:'Move up',exact:true}).nth(1).click();await page.locator('#btnCombineCopy').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('copy saved');
 saved=await page.evaluate(()=>window.__saved);out=await lib.PDFDocument.load(new Uint8Array(saved.bytes));expect(out.getPageCount()).toBe(4);expect(await page.evaluate(()=>window.MukorobApp.state.numPages)).toBe(2);
});

test('pinch zoom, superseded rendering and annotation geometry survive repeated changes',async({page})=>{
 await openTestPdf(page,await fixture(4));await settled(page);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async()=>{
  const A=window.MukorobApp,s=A.state,pages=document.querySelector('#pagesContainer');
  s.annotations=[{page:1,type:'highlight',color:'#ffff00',rect:{x:.2,y:.3,w:.2,h:.1}}];
  const original=JSON.stringify(s.annotations);window.__annotationOriginal=original;
  const event=(type,touches)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:touches});pages.dispatchEvent(e);};
  event('touchstart',[{clientX:110,clientY:250},{clientX:210,clientY:250}]);
  event('touchmove',[{clientX:90,clientY:250},{clientX:230,clientY:250}]);
  event('touchend',[]);
  window.__pinched=s.scale;
  const jobs=[];for(const scale of [1,2,3,1.8,1.6]){A.setScale(scale);jobs.push(A.renderPage(1,true));}await Promise.all(jobs);
 });
 await settled(page);
 expect(await page.evaluate(()=>window.__pinched)).toBeGreaterThan(.6);
 expect(await page.evaluate(()=>JSON.stringify(window.MukorobApp.state.annotations)===window.__annotationOriginal)).toBe(true);
 expect(await page.evaluate(()=>window.MukorobApp.state.pageEls[0].renderKey)).toBe('1.6:0');
 expect(await page.locator('.pdf-page').first().locator('.text-layer span').count()).toBeGreaterThan(50);
 expect(errors).toEqual([]);
});
