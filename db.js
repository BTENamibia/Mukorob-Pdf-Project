/* Mukorob PDF — local-first IndexedDB layer (root compatibility copy). */
const MukorobDB = (() => {
  const DB_NAME='mukorob-pdf'; const DB_VERSION=3; let dbPromise=null;
  const STORE_DEFS={settings:{keyPath:'key'},recent:{keyPath:'hash'},annotations:{keyPath:'hash'},users:{keyPath:'id'},recent_scoped:{keyPath:'id'},annotations_scoped:{keyPath:'id'},drafts:{keyPath:'id'},audit:{keyPath:'id',autoIncrement:true},'audit-log':{keyPath:'auditId'},'user-documents':{keyPath:'docId'},'document-shares':{keyPath:'shareId'}};
  function open(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;for(const [name,opt] of Object.entries(STORE_DEFS))if(!db.objectStoreNames.contains(name))db.createObjectStore(name,opt);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>{dbPromise=null;reject(req.error);};});return dbPromise;}
  async function tx(store,mode){const db=await open();if(!db.objectStoreNames.contains(store))throw new Error('Unknown Mukorob store: '+store);return db.transaction(store,mode).objectStore(store);}
  async function get(store,key){const s=await tx(store,'readonly');return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}
  async function getAll(store){const s=await tx(store,'readonly');return new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
  async function put(store,v){const s=await tx(store,'readwrite');return new Promise((res,rej)=>{const r=s.put(v);r.onsuccess=()=>res(true);r.onerror=()=>rej(r.error);});}
  async function del(store,key){const s=await tx(store,'readwrite');return new Promise((res,rej)=>{const r=s.delete(key);r.onsuccess=()=>res(true);r.onerror=()=>rej(r.error);});}
  async function stores(){const db=await open();return Array.from(db.objectStoreNames);}
  return {get,getAll,put,del,stores};
})();
