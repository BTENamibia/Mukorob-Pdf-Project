/* Mukorob PDF v0.7.1 — encrypted local-data backup and browser migration. */
(() => {
  const APP = () => window.MukorobApp;
  const DB = () => window.MukorobDB;
  const VERSION = '0.7.1';
  const ITERATIONS = 250000;
  const q = (s) => APP()?.$(s) || document.querySelector(s);
  const b64 = (bytes) => { const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let s=''; for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode(...u.subarray(i,i+0x8000)); return btoa(s); };
  const unb64 = (s) => { const r=atob(s),u=new Uint8Array(r.length); for(let i=0;i<r.length;i++)u[i]=r.charCodeAt(i); return u; };
  async function serialise(v){
    if(v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return v;
    if(v instanceof ArrayBuffer)return{__mkType:'ArrayBuffer',data:b64(v)};
    if(ArrayBuffer.isView(v))return{__mkType:'TypedArray',ctor:v.constructor.name,data:b64(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength))};
    if(v instanceof Blob)return{__mkType:'Blob',mime:v.type,data:b64(await v.arrayBuffer())};
    if(v instanceof Date)return{__mkType:'Date',data:v.toISOString()};
    if(Array.isArray(v))return Promise.all(v.map(serialise));
    if(typeof v==='object'){const o={};for(const[k,x]of Object.entries(v))o[k]=await serialise(x);return o;}
    return null;
  }
  function deserialise(v){
    if(!v||typeof v!=='object')return v;
    if(v.__mkType==='ArrayBuffer')return unb64(v.data).buffer;
    if(v.__mkType==='Blob')return new Blob([unb64(v.data)],{type:v.mime||'application/octet-stream'});
    if(v.__mkType==='Date')return new Date(v.data);
    if(v.__mkType==='TypedArray'){const u=unb64(v.data),C=globalThis[v.ctor];return typeof C==='function'?new C(u.buffer):u;}
    if(Array.isArray(v))return v.map(deserialise);
    const o={};for(const[k,x]of Object.entries(v))o[k]=deserialise(x);return o;
  }
  async function key(password,salt){const m=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},m,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function collect(){const out={};for(const store of await DB().stores())out[store]=await Promise.all((await DB().getAll(store)).map(serialise));return{schema:3,stores:out};}
  async function createBackup(password){
    if(APP()?.state?.auth?.user?.role!=='superadmin')throw new Error('Super Admin authentication required.');
    if(!password||password.length<12)throw new Error('Backup password must be at least 12 characters.');
    const payload={format:'mukorob-local-backup',version:VERSION,createdAt:new Date().toISOString(),database:await collect()};
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt),new TextEncoder().encode(JSON.stringify(payload)));
    return JSON.stringify({format:'mukorob-local-backup',version:VERSION,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-256-GCM',salt:b64(salt),iv:b64(iv),ciphertext:b64(cipher)});
  }
  async function restore(text,password,allowFirstRun=false){
    const users=await DB().getAll('users');
    if(!allowFirstRun && users.length===0) allowFirstRun=true;
    if(!allowFirstRun && APP()?.state?.auth?.user?.role!=='superadmin')throw new Error('Super Admin authentication required.');
    let env;try{env=JSON.parse(text);}catch(_){throw new Error('Backup file is not valid JSON.');}
    if(env.format!=='mukorob-local-backup'||!env.salt||!env.iv||!env.ciphertext)throw new Error('Invalid or incomplete Mukorob backup file.');
    let plain;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(env.iv)},await key(password,unb64(env.salt)),unb64(env.ciphertext));}catch(_){throw new Error('Backup password is incorrect or the backup file is damaged.');}
    let payload;try{payload=JSON.parse(new TextDecoder().decode(plain));}catch(_){throw new Error('Backup payload is unreadable.');}
    if(payload.format!=='mukorob-local-backup'||!payload.database?.stores)throw new Error('Invalid Mukorob backup payload.');
    const imported=payload.database.stores.users||[];
    if(users.length&&imported.length&&!confirm(`This browser already has ${users.length} user account(s). Matching IDs will be replaced. Continue?`))throw new Error('Restore cancelled.');
    const counts={};
    for(const[store,rows]of Object.entries(payload.database.stores)){
      if(!Array.isArray(rows))continue;counts[store]=0;
      for(const row of rows){try{await DB().put(store,deserialise(row));counts[store]++;}catch(e){console.warn('Mukorob restore skipped record',store,e);}}
    }
    try{await APP()?.writeAudit?.('local-backup-restored',{version:env.version,stores:counts});}catch(_){ }
    return counts;
  }
  function download(text,name){const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
  function styles(){if(document.querySelector('#mkMigrationStyles'))return;const s=document.createElement('style');s.id='mkMigrationStyles';s.textContent=`#mkMigrationBtn{display:none}#mkMigrationPanel{position:fixed;z-index:10050;right:20px;top:72px;width:min(440px,calc(100vw - 40px));background:var(--panel,#101820);border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.45);padding:20px;color:inherit}#mkMigrationPanel h3{margin:0 0 7px}#mkMigrationPanel p{font-size:13px;line-height:1.5;opacity:.82}#mkMigrationPanel label{display:block;font-size:12px;margin:12px 0 6px}#mkMigrationPanel input{width:100%;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit}#mkMigrationPanel .mk-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}#mkMigrationPanel button{padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:inherit;cursor:pointer}#mkMigrationPanel .mk-primary{background:var(--accent,#E2A321);color:#111;font-weight:700}#mkMigrationStatus{font-size:12px;margin-top:10px;min-height:18px}`;document.head.appendChild(s);}
  async function doRestore(file,password,status,firstRun=false){status.textContent='Restoring encrypted backup…';try{const c=await restore(await file.text(),password,firstRun);status.textContent=`Restore complete: ${Object.values(c).reduce((a,b)=>a+b,0)} records imported. Reloading…`;setTimeout(()=>location.reload(),1200);}catch(e){status.textContent=e.message;}}
  function ensureUI(){
    styles();
    if(!document.querySelector('#mkMigrationBtn')){const b=document.createElement('button');b.id='mkMigrationBtn';b.className='icon-btn';b.title='Backup & migration';b.textContent='⇅';const admin=document.querySelector('#btnAdmin');admin?.parentElement?.insertBefore(b,admin);b.onclick=()=>{if(APP()?.state?.auth?.user?.role==='superadmin'){q('#mkMigrationPanel').hidden=!q('#mkMigrationPanel').hidden;}else APP()?.toast?.('Sign in as Super Admin to use backup and migration.');};}
    if(!document.querySelector('#mkMigrationPanel')){const p=document.createElement('section');p.id='mkMigrationPanel';p.hidden=true;p.innerHTML=`<h3>Backup &amp; Migration</h3><p>Encrypted Mukorob local-data backup for safe browser migration. The active browser session token is never exported.</p><label>Backup password</label><input id="mkBackupPassword" type="password" autocomplete="new-password" placeholder="At least 12 characters"><div class="mk-row"><button class="mk-primary" id="mkCreateBackup">Create encrypted backup</button><button id="mkChooseRestore">Restore backup</button><button id="mkMigrationClose">Close</button></div><input id="mkRestoreFile" type="file" accept="application/json,.json" hidden><div id="mkMigrationStatus" aria-live="polite"></div>`;document.body.appendChild(p);
      q('#mkMigrationClose').onclick=()=>p.hidden=true;
      q('#mkCreateBackup').onclick=async()=>{const st=q('#mkMigrationStatus');try{const text=await createBackup(q('#mkBackupPassword').value);download(text,`Mukorob-PDF-Backup-${new Date().toISOString().replace(/[:.]/g,'-')}.mkb.json`);st.textContent='Encrypted backup created. Store it securely outside the browser.';}catch(e){st.textContent=e.message;}};
      q('#mkChooseRestore').onclick=()=>q('#mkRestoreFile').click();
      q('#mkRestoreFile').onchange=async e=>{const f=e.target.files?.[0],st=q('#mkMigrationStatus');if(!f)return;const pass=q('#mkBackupPassword').value;if(!pass){st.textContent='Enter the backup password first.';e.target.value='';return;}if(!confirm('Restore this trusted Mukorob backup into the current browser? Continue?')){e.target.value='';return;}await doRestore(f,pass,st,false);e.target.value='';};
    }
    // First-run migration path: Chrome may have zero users, so the owner must be able to restore the Avast backup without creating a replacement Super Admin.
    const bootstrap=document.querySelector('#bootstrapView');
    if(bootstrap&&!document.querySelector('#mkFirstRunRestore')){const wrap=document.createElement('div');wrap.id='mkFirstRunRestore';wrap.innerHTML=`<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)"><strong>Already have a Mukorob installation?</strong><p class="hint">Restore an encrypted backup from another browser instead of creating a new Super Admin.</p><label>Backup password<input id="mkFirstRunPassword" type="password" autocomplete="new-password" placeholder="Your backup password"></label><button class="text-btn" id="mkFirstRunChoose">Restore existing Mukorob backup</button><input id="mkFirstRunFile" type="file" accept="application/json,.json" hidden><p class="error" id="mkFirstRunStatus" hidden></p></div>`;bootstrap.appendChild(wrap);q('#mkFirstRunChoose').onclick=()=>q('#mkFirstRunFile').click();q('#mkFirstRunFile').onchange=async e=>{const f=e.target.files?.[0],st=q('#mkFirstRunStatus');if(!f)return;st.hidden=false;await doRestore(f,q('#mkFirstRunPassword').value,st,true);e.target.value='';};}
  }
  function visibility(){const admin=APP()?.state?.auth?.user?.role==='superadmin',b=document.querySelector('#mkMigrationBtn'),p=document.querySelector('#mkMigrationPanel');if(b)b.style.display=admin?'':'none';if(!admin&&p)p.hidden=true;}
  window.addEventListener('DOMContentLoaded',()=>{const t=setInterval(()=>{if(!window.MukorobApp)return;clearInterval(t);ensureUI();visibility();setInterval(visibility,1000);},25);});
})();
