/* Mukorob PDF — local-first IndexedDB layer. */
const MukorobDB = (() => {
  const DB_NAME = 'mukorob-pdf';
  const DB_VERSION = 4;
  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('recent')) db.createObjectStore('recent', { keyPath: 'hash' });
        if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations', { keyPath: 'hash' });
        if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'id' });
        // v0.6: user-scoped document stores. Legacy v0.5 stores are retained
        // for a one-time Super Admin migration and are no longer used by staff.
        if (!db.objectStoreNames.contains('recent_scoped')) db.createObjectStore('recent_scoped', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('annotations_scoped')) db.createObjectStore('annotations_scoped', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audit')) db.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(store, mode) { const db = await open(); return db.transaction(store, mode).objectStore(store); }
  async function get(store, key) { const s=await tx(store,'readonly'); return new Promise((resolve,reject)=>{const r=s.get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);}); }
  async function getAll(store) { const s=await tx(store,'readonly'); return new Promise((resolve,reject)=>{const r=s.getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);}); }
  async function put(store,value){const s=await tx(store,'readwrite');return new Promise((resolve,reject)=>{const r=s.put(value);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);});}
  async function del(store,key){const s=await tx(store,'readwrite');return new Promise((resolve,reject)=>{const r=s.delete(key);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);});}
  return {get,getAll,put,del};
})();
