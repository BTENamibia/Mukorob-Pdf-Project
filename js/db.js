/* Mukorob PDF — local-first IndexedDB layer. */
const MukorobDB = (() => {
  const DB_NAME = 'mukorob-pdf';
  // v0.7.x expands the schema without deleting or replacing existing stores.
  // Existing v0.5/v0.6/v0.7 user data remains in place during upgrade.
  const DB_VERSION = 3;
  let dbPromise = null;

  const STORE_DEFS = {
    settings: { keyPath: 'key' },
    recent: { keyPath: 'hash' },
    annotations: { keyPath: 'hash' },
    users: { keyPath: 'id' },
    recent_scoped: { keyPath: 'id' },
    annotations_scoped: { keyPath: 'id' },
    drafts: { keyPath: 'id' },
    audit: { keyPath: 'id', autoIncrement: true },
    'audit-log': { keyPath: 'auditId' },
    'user-documents': { keyPath: 'docId' },
    'document-shares': { keyPath: 'shareId' }
  };

  function ensureStores(db) {
    for (const [name, options] of Object.entries(STORE_DEFS)) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
    }
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => ensureStores(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => console.warn('[MukorobDB] Database upgrade is blocked by another open tab.');
    });
    return dbPromise;
  }

  async function tx(store, mode) {
    const db = await open();
    if (!db.objectStoreNames.contains(store)) throw new Error(`Unknown Mukorob store: ${store}`);
    return db.transaction(store, mode).objectStore(store);
  }

  async function get(store, key) {
    const s = await tx(store, 'readonly');
    return new Promise((resolve, reject) => {
      const r = s.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }

  async function getAll(store) {
    const s = await tx(store, 'readonly');
    return new Promise((resolve, reject) => {
      const r = s.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  async function put(store, value) {
    const s = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = s.put(value);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async function del(store, key) {
    const s = await tx(store, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = s.delete(key);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async function stores() {
    const db = await open();
    return Array.from(db.objectStoreNames);
  }

  return { get, getAll, put, del, stores };
})();
