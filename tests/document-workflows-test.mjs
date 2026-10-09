import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pageIndices,visiblePoint,decoratePdf,imagesToPdf,formSchema,fillForm,exportWorkingPdf} from '../js/modules/document-engine.mjs';
const require=createRequire(import.meta.url), lib=require('pdf-lib');
const doc=await lib.PDFDocument.create();doc.addPage([600,800]);doc.addPage([800,600]).setRotation(lib.degrees(90));
const form=doc.getForm();const text=form.createTextField('Full name');text.addToPage(doc.getPage(0),{x:30,y:700,width:200,height:24});
const check=form.createCheckBox('Approved');check.addToPage(doc.getPage(0),{x:30,y:650,width:20,height:20});
const choice=form.createDropdown('Office');choice.addOptions(['Windhoek','Walvis Bay']);choice.addToPage(doc.getPage(0),{x:30,y:600,width:180,height:24});
const locked=form.createTextField('Reference');locked.setText('BTE-001');locked.enableReadOnly();locked.addToPage(doc.getPage(0),{x:30,y:550,width:180,height:24});
const bytes=await doc.save();
assert.deepEqual(pageIndices('1,2-2,1',2),[0,1]);assert.deepEqual(pageIndices('all',2),[0,1]);
for(const bad of ['0','3','2-1','1,,2','1.5','foo'])assert.throws(()=>pageIndices(bad,2));
assert.deepEqual(visiblePoint(10,20,600,800,90),{x:580,y:10});
const filled=await fillForm(lib,bytes,{'Full name':'Bradz Trading Enterprises CC',Approved:true,Office:'Windhoek',Reference:'changed'});
const reopened=await lib.PDFDocument.load(filled);assert.equal(reopened.getForm().getTextField('Full name').getText(),'Bradz Trading Enterprises CC');
assert.equal(reopened.getForm().getCheckBox('Approved').isChecked(),true);assert.deepEqual(reopened.getForm().getDropdown('Office').getSelected(),['Windhoek']);assert.equal(reopened.getForm().getTextField('Reference').getText(),'BTE-001');
assert.equal(formSchema(lib,reopened).length,4);
assert.equal((await lib.PDFDocument.load(await fillForm(lib,filled,{},true))).getForm().getFields().length,0);
assert.equal((await lib.PDFDocument.load(bytes)).getForm().getTextField('Full name').getText(),undefined,'source bytes remain unchanged');
const decorated=await lib.PDFDocument.load(await decoratePdf(lib,filled,{watermark:'BTE COPY',numbering:true,pages:'2',start:5}));
assert.equal(decorated.getPageCount(),2);assert.equal(decorated.getPage(1).getRotation().angle,90);assert.equal(decorated.getForm().getTextField('Full name').getText(),'Bradz Trading Enterprises CC');
await assert.rejects(()=>decoratePdf(lib,bytes,{numbering:true,start:0}));
const png=fs.readFileSync(new URL('../icons/mukorob-blue-192.png',import.meta.url));
const imagePdf=await lib.PDFDocument.load(await imagesToPdf(lib,[{type:'image/png',bytes:png},{type:'image/png',bytes:png}]));
assert.equal(imagePdf.getPageCount(),2);assert.equal(imagePdf.getCreator(),'Mukorob PDF · Bradz Trading Enterprises CC');
await assert.rejects(()=>imagesToPdf(lib,[]));await assert.rejects(()=>imagesToPdf(lib,[{type:'text/plain',bytes:png}]));
const contents=page=>{
 const c=page.node.Contents();const streams=c instanceof lib.PDFArray?c.asArray().map(x=>page.doc.context.lookup(x)):[c];
 return streams.map(s=>Buffer.from(lib.decodePDFRawStream(s).decode()).toString()).join('\n');
};
for(const rotation of [0,90,180,270]){
 const base=await lib.PDFDocument.create();base.addPage([600,800]);
 const annotations=[{page:1,type:'signature',text:'Bradz',rect:{x:.1,y:.2,w:.3,h:.1}},{page:1,type:'stamp',src:'data:image/png;base64,'+png.toString('base64'),rect:{x:.1,y:.2,w:.3,h:.1}},{page:1,type:'highlight',rect:{x:.1,y:.2,w:.3,h:.1}},{page:1,type:'ink',points:[{x:.1,y:.2},{x:.2,y:.3}]}];
 const out=await lib.PDFDocument.load(await exportWorkingPdf(lib,await base.save(),new Map([[1,rotation]]),annotations));
 assert.equal(out.getPage(0).getRotation().angle,rotation);const stream=contents(out.getPage(0));assert.match(stream,/Tj/);assert.match(stream,/Do/);assert.match(stream,/h\nf\n/);assert.match(stream,/ l\n/);
 const W=rotation%180?800:600,H=rotation%180?600:800,p=visiblePoint(.1*W,.2*H,600,800,rotation);
 assert.ok(stream.includes(`${p.x} ${p.y} m`),`ink point maps correctly at ${rotation} degrees`);
}
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url)));
for(const icon of manifest.icons){const data=fs.readFileSync(new URL('../'+icon.src,import.meta.url));assert.equal(data.subarray(1,4).toString(),'PNG');assert.equal(icon.sizes,`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`);}
console.log('Document workflows: form filling/flattening, images, decorations, all rotation exports and icon sizes PASS');
