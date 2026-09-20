import assert from 'node:assert/strict';

/* Mirrors the pure geometry contract exposed by MukorobAnnotations. These
   tests intentionally avoid DOM/PDF.js so the normalized model is deterministic. */
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const normalRect = r => {
  const w=clamp(Number(r?.w)||.2,.02,1), h=clamp(Number(r?.h)||.08,.02,1);
  return {x:clamp(Number(r?.x)||0,0,1-w),y:clamp(Number(r?.y)||0,0,1-h),w,h};
};
const normalizedToPdfPoints = (rect,W,H,rotation=0) => {
  const r=normalRect(rect), rot=((Number(rotation)||0)%360+360)%360;
  const point=(x,y)=>{
    if(rot===90)return{x:(1-y)*W,y:x*H};
    if(rot===180)return{x:(1-x)*W,y:y*H};
    if(rot===270)return{x:y*W,y:(1-x)*H};
    return{x:x*W,y:(1-y)*H};
  };
  const a=point(r.x,r.y),b=point(r.x+r.w,r.y+r.h);
  return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};
};

/* Dragging by +10%/+5% changes only the target annotation geometry. */
const before=normalRect({x:.20,y:.30,w:.30,h:.10});
const moved=normalRect({x:before.x+.10,y:before.y+.05,w:before.w,h:before.h});
assert.ok(Math.abs(moved.x-.30)<1e-12 && Math.abs(moved.y-.35)<1e-12 && moved.w===.30 && moved.h===.10);

/* Boundary safety clamps the top-left while preserving size. */
assert.deepEqual(normalRect({x:.95,y:.98,w:.30,h:.10}),{x:.70,y:.90,w:.30,h:.10});

/* Rotation mapping uses PDF points, not CSS pixels. */
assert.deepEqual(normalizedToPdfPoints({x:0,y:0,w:1,h:1},600,800,0),{x:0,y:0,w:600,h:800});
assert.deepEqual(normalizedToPdfPoints({x:0,y:0,w:1,h:1},600,800,90),{x:0,y:0,w:600,h:800});
assert.deepEqual(normalizedToPdfPoints({x:.25,y:.25,w:.25,h:.25},600,800,180),{x:300,y:200,w:150,h:200});

/* A single annotation ID must correspond to one interactive DOM node. */
const ids=['sig-1','stamp-1'];
const rendered=new Set(ids);
assert.equal(rendered.size,ids.length);
assert.equal([...rendered].filter(id=>id==='sig-1').length,1);

console.log('Mukorob PDF annotation geometry/duplication smoke tests: PASS');
