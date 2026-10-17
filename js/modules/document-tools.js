import {decoratePdf, imagesToPdf, formSchema, fillForm, exportWorkingPdf, extractPdf, combinePdfs} from './document-engine.mjs';
const A=window.MukorobApp;
window.MukorobPdfEngine={exportWorkingPdf};
let busy=false;
const $=s=>document.querySelector(s);
function button(label, action, parent, id) {
  const b=document.createElement('button'); b.type='button'; b.textContent=label;
  if(id)b.id=id; b.addEventListener('click',action); parent.appendChild(b); return b;
}
function modal(title) {
  $('#documentToolsModal')?.remove();
  const backdrop=document.createElement('div'); backdrop.id='documentToolsModal'; backdrop.className='modal-backdrop';
  const card=document.createElement('section'); card.className='modal document-tools-modal'; card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true');
  const header=document.createElement('header');header.className='modal-head';
  const heading=document.createElement('h2');heading.id='documentToolsTitle';heading.textContent=title;card.setAttribute('aria-labelledby',heading.id);header.appendChild(heading);
  const close=button('Close',()=>{if(!busy){backdrop.remove();$('#btnDocumentTools')?.focus();}},header);close.className='text-btn';
  const body=document.createElement('div');body.className='modal-body document-tools-body';
  const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');
  card.append(header,body,status);backdrop.appendChild(card);document.body.appendChild(backdrop);
  backdrop.addEventListener('keydown',e=>{if(e.key==='Escape'&&!busy){e.preventDefault();close.click();}if(e.key==='Tab'){const nodes=[...card.querySelectorAll('button,input,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}});
  close.focus();return {body,status,backdrop};
}
function field(parent,label,type='text',value='') {
  const row=document.createElement('label');row.className='document-tool-field';
  const text=document.createElement('span');text.textContent=label;
  const input=document.createElement('input');input.type=type;
  if(type==='checkbox')input.checked=!!value;else input.value=value;
  row.append(text,input);parent.appendChild(row);return input;
}
async function run(view, task) {
  if(busy)return;busy=true;view.status.textContent='Preparing PDF…';view.body.setAttribute('aria-busy','true');
  const controls=[...view.body.querySelectorAll('button,input,select')];const disabled=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);
  try { const saved=await task();view.status.textContent=saved===false?'Save cancelled. Your document is unchanged.':'PDF copy saved. Your open document is unchanged.'; }
  catch(e){console.error('[Mukorob document tools]',e);view.status.textContent=/WinAnsi/.test(e.message)?'This text needs a Unicode font, which is not supported by these tools yet. Use Latin text.':e.message||'Could not prepare this PDF.';}
  finally {busy=false;controls.forEach((n,i)=>n.disabled=disabled[i]);view.body.removeAttribute('aria-busy');}
}
function canCopy() {
  if(!A.state.pdfDoc){A.toast('Open a PDF first.');return false;}
  return A.requirePermission('edit') && A.requirePermission('download');
}
async function workingBytes() {
  for(const a of A.state.annotations){const permission=a.type==='signature'?'signature':a.type==='stamp'?'stamp':'annotate';if(!A.hasPermission(permission))throw new Error('You do not have permission to export these annotations.');}
  return A.buildWorkingPdfBytes();
}
function name(suffix){return A.state.fileName.replace(/\.pdf$/i,'')+suffix+'.pdf';}
function openDecoration() {
  if(!canCopy())return;
  const v=modal('Watermarks & page numbers');
  const watermark=field(v.body,'Watermark text (optional)');watermark.maxLength=100;
  const pages=field(v.body,'Pages (all, 1, 3-5)','text','all');
  const numbers=field(v.body,'Add page numbers','checkbox',true);
  const start=field(v.body,'Starting number','number','1');start.min='1';
  button('Save PDF copy',()=>run(v,async()=>{
    if(!canCopy())throw new Error('Document access changed.');
    const outputName=name(' (watermarked)');
    const bytes=await decoratePdf(PDFLib,await workingBytes(),{watermark:watermark.value,pages:pages.value,numbering:numbers.checked,start:Number(start.value)});
    const saved=await A.saveBytesAs(bytes,outputName);if(saved)await A.writeAudit('decorate-pdf');return saved;
  }),v.body,'btnSaveDecorated');
}
function openImages() {
  if(!A.requirePermission('edit')||!A.requirePermission('download'))return;
  const v=modal('Create PDF from images');
  const input=field(v.body,'Choose PNG or JPEG images in page order','file');input.accept='image/png,image/jpeg';input.multiple=true;
  const list=document.createElement('ol');v.body.appendChild(list);
  input.addEventListener('change',()=>{list.replaceChildren();for(const f of input.files){const li=document.createElement('li');li.textContent=f.name;list.appendChild(li);}});
  button('Save new PDF',()=>run(v,async()=>{
    if(!A.requirePermission('edit')||!A.requirePermission('download'))throw new Error('Document access changed.');
    const images=[];for(const f of input.files)images.push({type:f.type,bytes:await f.arrayBuffer()});
    const saved=await A.saveBytesAs(await imagesToPdf(PDFLib,images),'Mukorob images.pdf');if(saved)await A.writeAudit('images-to-pdf',{count:images.length});return saved;
  }),v.body,'btnSaveImagePdf');
}
async function openForms() {
  if(!canCopy())return;
  const hash=A.state.fileHash, outputName=name(' (filled)');
  const v=modal('Fill PDF form');v.status.textContent='Reading form fields…';
  try {
    const bytes=await workingBytes();
    const doc=await PDFLib.PDFDocument.load(bytes), schema=formSchema(PDFLib,doc);
    if(!schema.length){v.status.textContent='This PDF has no interactive AcroForm fields. Scanned and XFA forms are not supported.';return;}
    const controls=new Map();
    for(const item of schema){
      if(item.type==='unsupported'){const p=document.createElement('p');p.textContent=item.name+' — unsupported field; retained in the saved copy.';v.body.appendChild(p);continue;}
      let input;
      if(item.type==='choice'){
        const row=document.createElement('label');row.className='document-tool-field';const text=document.createElement('span');text.textContent=item.name;
        input=document.createElement('select');input.multiple=item.multiple;
        if(!item.multiple){const opt=document.createElement('option');opt.value='';opt.textContent='Choose…';input.appendChild(opt);}
        for(const value of item.options){const opt=document.createElement('option');opt.value=value;opt.textContent=value;opt.selected=Array.isArray(item.value)?item.value.includes(value):item.value===value;input.appendChild(opt);}
        row.append(text,input);v.body.appendChild(row);
      }else {input=field(v.body,item.name,item.type,item.value);if(item.maxLength)input.maxLength=item.maxLength;}
      input.disabled=item.readonly;controls.set(item.name,{input,item});
    }
    const flatten=field(v.body,'Flatten fields in saved copy (cannot edit them later)','checkbox',false);
    v.status.textContent='Fill fields and save a new copy. Signature fields are retained; this does not digitally sign the PDF.';
    button('Save filled PDF',()=>run(v,async()=>{
      if(!canCopy()||A.state.fileHash!==hash)throw new Error('The open document changed. Reopen Fill PDF form.');
      const values=Object.create(null);for(const [key,{input,item}] of controls)values[key]=item.type==='checkbox'?input.checked:input.multiple?[...input.selectedOptions].map(o=>o.value):input.value;
      const saved=await A.saveBytesAs(await fillForm(PDFLib,bytes,values,flatten.checked),outputName);if(saved)await A.writeAudit('fill-form',{flatten:flatten.checked});return saved;
    }),v.body,'btnSaveFilledPdf');
  }catch(e){v.status.textContent=e.message||'Could not read this form.';}
}
function openExtract() {
  if(!canCopy())return;
  const v=modal('Extract pages to a new PDF');
  const pages=field(v.body,'Pages to extract (all, 1, 3-5)','text','all');
  const hint=document.createElement('p');hint.textContent='Rotations and annotations are included. Form values become fixed text in the copy.';v.body.appendChild(hint);
  button('Save selected pages',()=>run(v,async()=>{
    if(!canCopy())throw new Error('Document access changed.');
    const outputName=name(' (selected pages)');
    const bytes=await extractPdf(PDFLib,await workingBytes(),pages.value);
    return A.saveBytesAs(bytes,outputName);
  }),v.body,'btnExtractCopy');
}
function openCombine() {
  if(!A.requirePermission('edit')||!A.requirePermission('download'))return;
  const v=modal('Combine PDFs');let files=[];
  const input=field(v.body,'Choose PDFs to combine','file');input.accept='application/pdf';input.multiple=true;
  const list=document.createElement('ol');v.body.appendChild(list);
  function draw(){list.replaceChildren();files.forEach((file,i)=>{
    const li=document.createElement('li');const text=document.createElement('span');text.textContent=file.name+' ';li.appendChild(text);
    const up=button('Move up',()=>{[files[i-1],files[i]]=[files[i],files[i-1]];draw();},li);up.disabled=i===0;
    const down=button('Move down',()=>{[files[i+1],files[i]]=[files[i],files[i+1]];draw();},li);down.disabled=i===files.length-1;
    list.appendChild(li);
  });}
  input.addEventListener('change',()=>{files=[...input.files];draw();});
  const hint=document.createElement('p');hint.textContent='Files are combined in the listed order. Form values become fixed text in the new copy.';v.body.appendChild(hint);
  button('Save combined PDF',()=>run(v,async()=>{
    if(!A.requirePermission('edit')||!A.requirePermission('download'))throw new Error('Document access changed.');
    const documents=[];for(const file of files)documents.push(await file.arrayBuffer());
    return A.saveBytesAs(await combinePdfs(PDFLib,documents),'Mukorob combined.pdf');
  }),v.body,'btnCombineCopy');
}
function hub() {
  if(!A.requirePermission('edit'))return;
  const v=modal('Document tools');
  button('Create PDF from images',openImages,v.body,'toolImagesToPdf');
  button('Combine PDFs',openCombine,v.body,'toolCombinePdfs');
  const extract=button('Extract pages',openExtract,v.body,'toolExtractCopy');extract.disabled=!A.state.pdfDoc;
  const decoration=button('Watermarks & page numbers',openDecoration,v.body,'toolDecoratePdf');decoration.disabled=!A.state.pdfDoc;
  const forms=button('Fill PDF form',()=>openForms(),v.body,'toolFillForm');forms.disabled=!A.state.pdfDoc;
  const credit=document.createElement('p');credit.className='hint';credit.textContent='Developed by Bradz Trading Enterprises CC';v.body.appendChild(credit);
}
function wire(){
  const tools=$('#toolsMenu');button('Document tools…',()=>{tools.hidden=true;hub();},tools,'toolDocumentTools');
  const top=button('Document tools',hub,$('.topbar-actions'),'btnDocumentTools');top.className='text-btn';
}
window.addEventListener('DOMContentLoaded',wire);
