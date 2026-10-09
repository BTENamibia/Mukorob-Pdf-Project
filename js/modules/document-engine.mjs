/* Independent PDF workflow operations. All outputs are new PDF copies. */
export function pageIndices(input, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Open a PDF first.');
  if (!String(input || '').trim() || String(input).trim().toLowerCase() === 'all') return Array.from({length:count}, (_, i) => i);
  const pages = new Set();
  for (const part of String(input).split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers such as 1, 3-5, or all.');
    const start = Number(match[1]), end = Number(match[2] || start);
    if (start < 1 || end < start || end > count) throw new Error('Page range is outside this document.');
    for (let n=start; n<=end; n++) pages.add(n-1);
  }
  return [...pages];
}

export function visiblePoint(x, y, width, height, rotation=0) {
  switch (((rotation % 360)+360)%360) {
    case 90: return {x:width-y, y:x};
    case 180: return {x:width-x, y:height-y};
    case 270: return {x:y, y:height-x};
    default: return {x, y:height-y};
  }
}

export async function exportWorkingPdf(lib, bytes, rotations, annotations) {
  const doc=await lib.PDFDocument.load(bytes);
  const font=annotations.some(a=>a.type==='signature')?await doc.embedFont(lib.StandardFonts.HelveticaOblique):null;
  const regular=annotations.some(a=>a.type==='note'&&a.text)?await doc.embedFont(lib.StandardFonts.Helvetica):null;
  const images=new Map();
  for(const [index,page] of doc.getPages().entries()) {
    const r=rotations.get(index+1);if(typeof r==='number')page.setRotation(lib.degrees(r));
    const rotation=page.getRotation().angle,{width,height}=page.getSize();
    const swapped=Math.abs(rotation%180)===90,W=swapped?height:width,H=swapped?width:height;
    const point=(x,y)=>visiblePoint(x*W,y*H,width,height,rotation);
    for(const a of annotations.filter(a=>a.page===index+1)) {
      const hex=/^#[0-9a-f]{6}$/i.test(a.color||'')?a.color:'#0B4F8A';
      const color=lib.rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
      if(a.type==='ink') {
        for(let i=1;i<(a.points||[]).length;i++)page.drawLine({start:point(a.points[i-1].x,a.points[i-1].y),end:point(a.points[i].x,a.points[i].y),thickness:2,color});
        continue;
      }
      const rect=a.rect;if(!rect)continue;
      const anchor=point(rect.x,rect.y+rect.h),w=rect.w*W,h=rect.h*H,rotate=lib.degrees(rotation);
      if(a.type==='highlight')page.drawRectangle({...anchor,width:w,height:h,rotate,color,opacity:.35});
      else if(a.type==='signature') {
        const text=a.text||'Signature';const size=Math.min(Math.max(1,h*.72),w/font.widthOfTextAtSize(text,1));
        page.drawText(text,{...point(rect.x,rect.y+rect.h*.78),font,size,rotate,color});
      }else if(a.type==='note') {
        page.drawRectangle({...point(rect.x,rect.y+10/H),width:10,height:10,rotate,color});
        if(a.text)page.drawText(a.text.slice(0,90),{...point(rect.x+14/W,rect.y+10/H),size:8,font:regular,rotate,color});
      }else if(a.type==='stamp'&&a.src) {
        let image=images.get(a.src);
        if(!image){const match=a.src.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);if(!match)throw new Error('Unsupported stamp image.');
          const data=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));image=match[1].toLowerCase()==='png'?await doc.embedPng(data):await doc.embedJpg(data);images.set(a.src,image);}
        page.drawImage(image,{...anchor,width:w,height:h,rotate});
      }
    }
  }
  return doc.save();
}

export async function decoratePdf(lib, bytes, {pages='all', watermark='', numbering=false, start=1}={}) {
  if (!watermark.trim() && !numbering) throw new Error('Enter a watermark or enable page numbers.');
  if (!Number.isInteger(start) || start < 1) throw new Error('Starting number must be a positive integer.');
  const doc = await lib.PDFDocument.load(bytes), font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const indices = pageIndices(pages, doc.getPageCount());
  indices.forEach((index, sequence) => {
    const page = doc.getPage(index), {width,height} = page.getSize(), rotation = page.getRotation().angle;
    const swapped = Math.abs(rotation % 180) === 90, W = swapped ? height : width, H = swapped ? width : height;
    if (watermark.trim()) {
      const text = watermark.trim();
      const size = Math.min(48, W * .75 / font.widthOfTextAtSize(text, 1));
      const p = visiblePoint((W-font.widthOfTextAtSize(text,size))/2, H/2, width,height,rotation);
      page.drawText(text, {...p,font,size,rotate:lib.degrees(rotation),opacity:.22,color:lib.rgb(.04,.31,.54)});
    }
    if (numbering) {
      const text = String(start + sequence), size=11;
      const p = visiblePoint((W-font.widthOfTextAtSize(text,size))/2, H-24, width,height,rotation);
      page.drawText(text,{...p,font,size,rotate:lib.degrees(rotation),color:lib.rgb(.04,.1,.2)});
    }
  });
  return doc.save();
}

export async function imagesToPdf(lib, images) {
  if (!images.length) throw new Error('Choose at least one PNG or JPEG image.');
  const doc = await lib.PDFDocument.create();
  for (const image of images) {
    const embedded = image.type === 'image/png' ? await doc.embedPng(image.bytes) : image.type === 'image/jpeg' ? await doc.embedJpg(image.bytes) : null;
    if (!embedded) throw new Error('Only PNG and JPEG images are supported.');
    const landscape = embedded.width > embedded.height;
    const [width,height] = landscape ? [841.89,595.28] : [595.28,841.89];
    const scale = Math.min((width-48)/embedded.width,(height-48)/embedded.height);
    const w=embedded.width*scale,h=embedded.height*scale;
    doc.addPage([width,height]).drawImage(embedded,{x:(width-w)/2,y:(height-h)/2,width:w,height:h});
  }
  doc.setCreator('Mukorob PDF · Bradz Trading Enterprises CC');
  return doc.save();
}

export function formSchema(lib, doc) {
  return doc.getForm().getFields().map(field => {
    const name=field.getName(), readonly=field.isReadOnly();
    if (field instanceof lib.PDFTextField) return {name,type:'text',value:field.getText()||'',readonly,maxLength:field.getMaxLength()};
    if (field instanceof lib.PDFCheckBox) return {name,type:'checkbox',value:field.isChecked(),readonly};
    if (field instanceof lib.PDFDropdown || field instanceof lib.PDFRadioGroup || field instanceof lib.PDFOptionList) {
      return {name,type:'choice',value:field.getSelected(),options:field.getOptions(),readonly,multiple:field instanceof lib.PDFOptionList && field.isMultiselect()};
    }
    return {name,type:'unsupported',readonly:true};
  });
}

export async function fillForm(lib, bytes, values, flatten=false) {
  const doc = await lib.PDFDocument.load(bytes), form=doc.getForm();
  for (const item of formSchema(lib,doc)) {
    if (item.readonly || !(item.name in values)) continue;
    const field=form.getField(item.name), value=values[item.name];
    if (item.type==='text') field.setText(String(value));
    else if (item.type==='checkbox') value ? field.check() : field.uncheck();
    else if (item.type==='choice') { if (value && (!Array.isArray(value) || value.length)) field.select(value); else field.clear(); }
  }
  form.updateFieldAppearances(await doc.embedFont(lib.StandardFonts.Helvetica));
  if (flatten) form.flatten();
  return doc.save();
}
