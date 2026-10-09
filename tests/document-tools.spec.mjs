import {test,expect,openTestPdf} from './browser-fixtures.mjs';
import {createRequire} from 'node:module';import fs from 'node:fs';
const require=createRequire(import.meta.url),lib=require('pdf-lib');
async function fixture(){const doc=await lib.PDFDocument.create();doc.addPage([600,800]);doc.addPage([800,600]);const text=doc.getForm().createTextField('Full name');text.addToPage(doc.getPage(0),{x:30,y:700,width:250,height:24});return doc.save();}
async function tools(page){await page.locator('#btnTools').click();await page.locator('#toolDocumentTools').click();}
test('official logo renders and all reading themes remain usable',async({page},testInfo)=>{
 await openTestPdf(page,await fixture());
 await expect(page.locator('#brandLogo')).toHaveAttribute('src','icons/mukorob-official-blue.jpg');
 expect(await page.locator('#brandLogo').evaluate(img=>img.complete&&img.naturalWidth===1280)).toBe(true);
 for(const theme of ['dark','light','sepia','contrast']){
  await page.evaluate(t=>{const A=window.MukorobApp;A.state.settings.theme=t;A.applySettings();},theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  if(process.env.MUKOROB_SCREENSHOTS)await page.screenshot({path:`/tmp/mukorob-${testInfo.project.name}-${theme}.png`});
 }
 if(testInfo.project.name==='mobile'){
  await expect.poll(()=>page.locator('.pdf-page').first().evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBeLessThanOrEqual(393);
  expect(await page.locator('.pdf-page').first().evaluate(el=>el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
 }
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('#FFD34D');
 await tools(page);await expect(page.locator('#documentToolsModal')).toContainText('Bradz Trading Enterprises CC');
});
test('watermark and page numbering validates ranges and exports a copy',async({page})=>{
 await openTestPdf(page,await fixture());await tools(page);await page.locator('#toolDecoratePdf').click();
 await page.getByLabel('Watermark text (optional)').fill('BRADZ COPY');await page.getByLabel('Pages (all, 1, 3-5)').fill('3');
 await page.locator('#btnSaveDecorated').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('outside');
 await page.getByLabel('Pages (all, 1, 3-5)').fill('all');await page.locator('#btnSaveDecorated').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('copy saved');
 const saved=await page.evaluate(()=>window.__saved);expect((await lib.PDFDocument.load(new Uint8Array(saved.bytes))).getPageCount()).toBe(2);
 expect(await page.evaluate(()=>window.MukorobApp.state.fileName)).toBe('Fixture.pdf');
});
test('fillable forms save values and can flatten the exported copy',async({page})=>{
 await openTestPdf(page,await fixture());await tools(page);await page.locator('#toolFillForm').click();
 await page.getByLabel('Full name',{exact:true}).fill('Bradz Trading Enterprises CC');await page.locator('#btnSaveFilledPdf').click();
 await expect(page.locator('#documentToolsModal [role=status]')).toContainText('copy saved');
 let saved=await page.evaluate(()=>window.__saved);let doc=await lib.PDFDocument.load(new Uint8Array(saved.bytes));expect(doc.getForm().getTextField('Full name').getText()).toBe('Bradz Trading Enterprises CC');
 await page.getByLabel('Flatten fields in saved copy (cannot edit them later)').check();await page.locator('#btnSaveFilledPdf').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('copy saved');
 saved=await page.evaluate(()=>window.__saved);doc=await lib.PDFDocument.load(new Uint8Array(saved.bytes));expect(doc.getForm().getFields()).toHaveLength(0);
});
test('images create a new PDF without replacing the open document',async({page})=>{
 await openTestPdf(page,await fixture());await tools(page);await page.locator('#toolImagesToPdf').click();
 await page.getByLabel('Choose PNG or JPEG images in page order').setInputFiles({name:'Official.png',mimeType:'image/png',buffer:fs.readFileSync(new URL('../icons/mukorob-blue-192.png',import.meta.url))});
 await page.locator('#btnSaveImagePdf').click();await expect(page.locator('#documentToolsModal [role=status]')).toContainText('copy saved');
 const saved=await page.evaluate(()=>window.__saved);expect((await lib.PDFDocument.load(new Uint8Array(saved.bytes))).getPageCount()).toBe(1);expect(await page.evaluate(()=>window.MukorobApp.state.numPages)).toBe(2);
});
test('draft rotations recover after closing and reopening a PDF',async({page})=>{
 const bytes=await fixture();await openTestPdf(page,bytes);
 await page.evaluate(async()=>{const A=window.MukorobApp;A.state.pageRotations.set(1,90);await window.MukorobAutosave.flush();await A.closeDocument();});
 page.on('dialog',dialog=>dialog.accept());
 await page.evaluate(async data=>window.MukorobApp.openFile(new File([new Uint8Array(data)],'Fixture.pdf',{type:'application/pdf'})),Array.from(bytes));
 expect(await page.evaluate(()=>window.MukorobApp.state.pageRotations.get(1))).toBe(90);
});
test('Save As exports signature and rotation; print uses the same edited document',async({page})=>{
 await openTestPdf(page,await fixture());
 await page.evaluate(()=>{const A=window.MukorobApp;A.state.pageRotations.set(1,90);A.state.annotations=[{page:1,type:'signature',text:'Bradz',rect:{x:.1,y:.2,w:.3,h:.1}}];window.showSaveFilePicker=undefined;window.print=()=>{window.__printed=true;};});
 const downloadPromise=page.waitForEvent('download');await page.locator('#btnTools').click();await page.locator('#toolSaveAs').click();const download=await downloadPromise;
 const doc=await lib.PDFDocument.load(fs.readFileSync(await download.path()));expect(doc.getPage(0).getRotation().angle).toBe(90);expect(doc.getPage(0).node.Contents().size()).toBeGreaterThan(0);
 await page.evaluate(()=>window.MukorobPrint.printPdf());expect(await page.evaluate(()=>window.__printed)).toBe(true);await expect(page.locator('#mukorobPrintSurface img')).toHaveCount(2);
});

test('bundled PDF libraries open a document with external downloads blocked, including offline',async({page,context})=>{
 const baseURL=process.env.MUKOROB_BASE_URL||'http://127.0.0.1:4173';
 await page.route('https://cdnjs.cloudflare.com/**',route=>route.abort());
 await page.goto(baseURL);
 await page.waitForFunction(()=>window.MukorobTestHooks&&window.MukorobPdfEngine&&navigator.serviceWorker.controller);
 expect(await page.evaluate(()=>pdfjsLib.GlobalWorkerOptions.workerSrc)).toBe('vendor/pdf.worker.min.js');
 await context.setOffline(true);await page.reload();
 await page.waitForFunction(()=>window.MukorobTestHooks&&window.MukorobPdfEngine);
 await page.evaluate(async data=>{
  const A=window.MukorobApp;A.state.auth.user={id:'offline-test',fullName:'Bradz test',role:'superadmin',permissions:{}};
  document.querySelector('#authModal').hidden=true;document.querySelector('#accessGate').hidden=true;
  await A.openFile(new File([new Uint8Array(data)],'Offline.pdf',{type:'application/pdf'}));
 },Array.from(await fixture()));
 await expect(page.locator('.pdf-page')).toHaveCount(2);
 expect(await page.evaluate(()=>window.MukorobApp.state.pdfDoc.numPages)).toBe(2);
 await context.setOffline(false);
});
