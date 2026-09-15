/* Mukorob PDF v0.7.1 — encrypted local-data backup and browser migration.
   Purpose: move a trusted Mukorob local database from one browser/device to another
   without exposing password hashes, recovery hashes, documents or annotations as
   readable backup JSON. This is a migration bridge, not a replacement for the
   future central Mukorob Auth service.
*/
(() => {
  const APP = () => window.MukorobApp;
  const DB = () => window.MukorobDB;
  const VERSION = '0.7.1';
  const PBKDF2_ITERATIONS = 250000;

  const b64 = (bytes) => {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
    return btoa(s);
  };
  const fromB64 = (s) => {
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  async function serialise(value) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof ArrayBuffer) return { __mkType: 'ArrayBuffer', data: b64(value) };
    if (ArrayBuffer.isView(value)) return { __mkType: 'TypedArray', ctor: value.constructor.name, data: b64(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) };
    if (value instanceof Blob) return { __mkType: 'Blob', mime: value.type, data: b64(await value.arrayBuffer()) };
    if (value instanceof Date) return { __mkType: 'Date', data: value.toISOString() };
    if (Array.isArray(value)) return Promise.all(value.map(serialise));
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = await serialise(v);
      return out;
    }
    return null;
  }

  function deserialise(value) {
    if (!value || typeof value !== 'object') return value;
    if (value.__mkType === 'ArrayBuffer') return fromB64(value.data).buffer;
    if (value.__mkType === 'Blob') return new Blob([fromB64(value.data)], { type: value.mime || 'application/octet-stream' });
    if (value.__mkType === 'Date') return new Date(value.data);
    if (value.__mkType === 'TypedArray') {
      const bytes = fromB64(value.data);
      const Ctor = globalThis[value.ctor];
      return typeof Ctor === 'function' ? new Ctor(bytes.buffer) : bytes;
    }
    if (Array.isArray(value)) return value.map(deserialise);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserialise(v);
    return out;
  }

  async function deriveKey(password, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function collectDatabase() {
    const stores = await DB().stores();
    const data = {};
    for (const store of stores) data[store] = await DB().getAll(store);
    return { schema: 3, stores: data };
  }

  async function createBackup(password) {
    if (!APP()?.state?.auth?.user || APP().state.auth.user.role !== 'superadmin') throw new Error('Super Admin authentication required.');
    if (!password || password.length < 12) throw new Error('Backup password must be at least 12 characters.');
    const payload = {
      format: 'mukorob-local-backup',
      version: VERSION,
      createdAt: new Date().toISOString(),
      note: 'Encrypted Mukorob PDF local database backup. The session token is intentionally not included.',
      database: await collectDatabase()
    };
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return JSON.stringify({
      format: 'mukorob-local-backup',
      version: VERSION,
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: b64(salt),
      iv: b64(iv),
      ciphertext: b64(ciphertext)
    });
  }

  async function restoreBackup(text, password) {
    if (!APP()?.state?.auth?.user || APP().state.auth.user.role !== 'superadmin') throw new Error('Super Admin authentication required.');
    const envelope = JSON.parse(text);
    if (envelope.format !== 'mukorob-local-backup') throw new Error('This is not a Mukorob backup file.');
    if (!envelope.salt || !envelope.iv || !envelope.ciphertext) throw new Error('Backup file is incomplete.');
    const key = await deriveKey(password, fromB64(envelope.salt));
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.ciphertext));
    } catch (_) {
      throw new Error('Backup password is incorrect or the backup file is damaged.');
    }
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (payload.format !== 'mukorob-local-backup' || !payload.database?.stores) throw new Error('Invalid Mukorob backup payload.');

    const existingUsers = await DB().getAll('users');
    const importedUsers = payload.database.stores.users || [];
    if (existingUsers.length && importedUsers.length) {
      const ok = confirm(`Chrome already contains ${existingUsers.length} user account(s). Restore will merge the backup and replace records with matching IDs. Continue?`);
      if (!ok) throw new Error('Restore cancelled.');
    }

    const importedCounts = {};
    for (const [store, rows] of Object.entries(payload.database.stores)) {
      if (!Array.isArray(rows)) continue;
      importedCounts[store] = 0;
      for (const raw of rows) {
        const row = deserialise(raw);
        try {
          await DB().put(store, row);
          importedCounts[store]++;
        } catch (err) {
          console.warn(`[Mukorob migration] Could not restore ${store} record`, err);
        }
      }
    }

    try { await APP().writeAudit('local-backup-restored', { version: envelope.version, stores: importedCounts }); } catch (_) {}
    return importedCounts;
  }

  function download(text, filename) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function addStyles() {
    if ($('#mkMigrationStyles')) return;
    const s = document.createElement('style'); s.id = 'mkMigrationStyles';
    s.textContent = `
      #mkMigrationBtn{display:none}
      #mkMigrationPanel{position:fixed;z-index:10050;right:20px;top:72px;width:min(430px,calc(100vw - 40px));background:var(--panel,#101820);border:1px solid rgba(255,255,255,.14);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.45);padding:20px;color:inherit}
      #mkMigrationPanel h3{margin:0 0 7px;font-size:18px} #mkMigrationPanel p{font-size:13px;line-height:1.5;opacity:.8}
      #mkMigrationPanel label{display:block;font-size:12px;margin:12px 0 6px;opacity:.85} #mkMigrationPanel input{width:100%;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit}
      #mkMigrationPanel .mk-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap} #mkMigrationPanel button{padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:inherit;cursor:pointer}
      #mkMigrationPanel .mk-primary{background:var(--accent,#E2A321);color:#111;border-color:transparent;font-weight:700} #mkMigrationStatus{font-size:12px;margin-top:10px;min-height:18px}
    `;
    document.head.appendChild(s);
  }

  function ensureUI() {
    addStyles();
    if (!document.querySelector('#mkMigrationBtn')) {
      const btn = document.createElement('button');
      btn.id = 'mkMigrationBtn'; btn.className = 'icon-btn'; btn.title = 'Backup & migration'; btn.textContent = '⇅';
      const admin = document.querySelector('#btnAdmin');
      admin?.parentElement?.insertBefore(btn, admin);
      btn.addEventListener('click', () => { if (APP()?.state?.auth?.user?.role === 'superadmin') $('#mkMigrationPanel').hidden = !$('#mkMigrationPanel').hidden; else APP()?.toast('Sign in as Super Admin to use backup and migration.'); });
    }
    if (!document.querySelector('#mkMigrationPanel')) {
      const panel = document.createElement('section');
      panel.id = 'mkMigrationPanel'; panel.hidden = true;
      panel.innerHTML = `
        <h3>Backup &amp; Migration</h3>
        <p>Creates an encrypted backup of Mukorob's local database so it can be moved from Avast Browser to Chrome without recreating your users. The current browser session token is never exported.</p>
        <label for="mkBackupPassword">Backup password</label>
        <input id="mkBackupPassword" type="password" autocomplete="new-password" placeholder="At least 12 characters">
        <div class="mk-row"><button class="mk-primary" id="mkCreateBackup">Create encrypted backup</button><button id="mkChooseRestore">Restore backup</button><button id="mkMigrationClose">Close</button></div>
        <input id="mkRestoreFile" type="file" accept="application/json,.json" hidden>
        <div id="mkMigrationStatus" aria-live="polite"></div>`;
      document.body.appendChild(panel);
      $('#mkMigrationClose').addEventListener('click', () => { panel.hidden = true; });
      $('#mkCreateBackup').addEventListener('click', async () => {
        const status = $('#mkMigrationStatus'), password = $('#mkBackupPassword').value;
        status.textContent = 'Creating encrypted backup…';
        try {
          const text = await createBackup(password);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          download(text, `Mukorob-PDF-Backup-${stamp}.mkb.json`);
          status.textContent = 'Backup created. Store it somewhere secure and separate from the browser.';
        } catch (err) { status.textContent = err.message; }
      });
      $('#mkChooseRestore').addEventListener('click', () => $('#mkRestoreFile').click());
      $('#mkRestoreFile').addEventListener('change', async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const password = $('#mkBackupPassword').value, status = $('#mkMigrationStatus');
        if (!password) { status.textContent = 'Enter the backup password first.'; e.target.value=''; return; }
        if (!confirm('Restore this Mukorob backup into the current browser? This can replace records with matching IDs. Continue only if this backup is trusted.')) { e.target.value=''; return; }
        status.textContent = 'Restoring…';
        try {
          const counts = await restoreBackup(await file.text(), password);
          status.textContent = `Restore complete: ${Object.values(counts).reduce((a,b)=>a+b,0)} records imported. Reload Mukorob PDF now.`;
          setTimeout(() => location.reload(), 1800);
        } catch (err) { status.textContent = err.message; }
        e.target.value='';
      });
    }
  }

  function refreshVisibility() {
    const admin = APP()?.state?.auth?.user?.role === 'superadmin';
    const btn = document.querySelector('#mkMigrationBtn');
    if (btn) btn.style.display = admin ? '' : 'none';
    const panel = document.querySelector('#mkMigrationPanel');
    if (!admin && panel) panel.hidden = true;
  }

  window.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => {
      if (!window.MukorobApp) return;
      clearInterval(wait); ensureUI(); refreshVisibility();
      setInterval(refreshVisibility, 1000);
    }, 25);
  });
})();
