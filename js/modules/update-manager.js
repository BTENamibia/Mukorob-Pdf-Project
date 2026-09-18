/* Mukorob PDF — cross-browser/PWA/Windows update manager. */
(() => {
  const REPO_VERSION_URL = 'https://raw.githubusercontent.com/BTENamibia/Mukorob-Pdf-Project/main/VERSION.txt';
  const isWindowsLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  let currentVersion = '0.7.1';
  let latestVersion = null;
  let registration = null;
  let updateShown = false;

  const parseVersion = (v) => String(v || '').trim().replace(/^v/i, '');
  const parts = (v) => parseVersion(v).split('.').map(n => Number.parseInt(n, 10) || 0);
  const newer = (a, b) => {
    const A = parts(a), B = parts(b);
    for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] > B[i];
    return false;
  };

  async function readLocalVersion() {
    try {
      const r = await fetch('./VERSION.txt?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const v = parseVersion(await r.text());
        if (v) currentVersion = v;
      }
    } catch (_) {}
  }

  function styles() {
    if (document.querySelector('#mkUpdateStyles')) return;
    const s = document.createElement('style');
    s.id = 'mkUpdateStyles';
    s.textContent = `
      #mkUpdatePanel{position:fixed;z-index:20000;left:50%;top:18px;transform:translateX(-50%);width:min(560px,calc(100vw - 28px));box-sizing:border-box;background:var(--panel,#101820);color:inherit;border:1px solid rgba(255,255,255,.16);border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.48);padding:18px 20px}
      #mkUpdatePanel h3{margin:0 0 6px;font-size:17px}#mkUpdatePanel p{margin:6px 0;font-size:13px;line-height:1.5;opacity:.86}
      #mkUpdatePanel .mk-update-row{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap}
      #mkUpdatePanel button{border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:9px 13px;background:rgba(255,255,255,.07);color:inherit;cursor:pointer}
      #mkUpdatePanel .mk-update-primary{background:var(--accent,#E2A321);color:#111;font-weight:700}
    `;
    document.head.appendChild(s);
  }

  function showUpdate(v) {
    if (updateShown || !newer(v, currentVersion)) return;
    updateShown = true;
    styles();
    let panel = document.querySelector('#mkUpdatePanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'mkUpdatePanel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-live', 'polite');
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <h3>Mukorob PDF update available</h3>
      <p>You are using <strong>v${currentVersion}</strong>. A newer release, <strong>v${v}</strong>, is available.</p>
      <p>Your local users, documents, annotations and settings are not deleted by the update. Mukorob refreshes application files while keeping browser data in place.</p>
      ${isWindowsLocal ? '<p><strong>Windows:</strong> close this app and run <strong>Mukorob PDF Update</strong> from your Desktop or Start Menu. Then reopen Mukorob PDF.</p>' : ''}
      <div class="mk-update-row">
        <button id="mkUpdateLater">Later</button>
        <button id="mkUpdateNow" class="mk-update-primary">${isWindowsLocal ? "I updated — reload" : "Update now"}</button>
      </div>`;
    panel.querySelector('#mkUpdateLater').onclick = () => { panel.remove(); };
    panel.querySelector('#mkUpdateNow').onclick = async () => {
      const btn = panel.querySelector('#mkUpdateNow');
      btn.disabled = true;
      btn.textContent = 'Updating…';
      if (isWindowsLocal) {
        btn.disabled = false;
        btn.textContent = 'I updated — reload';
        return;
      }
      try { if (registration) await registration.update(); } catch (_) {}
      setTimeout(() => location.replace(location.pathname + '?mkUpdate=' + Date.now() + location.hash), 500);
    };
  }

  async function checkLatest() {
    try {
      const r = await fetch(REPO_VERSION_URL + '?_=' + Date.now(), { cache: 'no-store', mode: 'cors' });
      if (!r.ok) return;
      const v = parseVersion(await r.text());
      if (v) { latestVersion = v; showUpdate(v); }
    } catch (_) {
      // Offline/local-only use: do not interrupt the application.
    }
  }

  async function install() {
    await readLocalVersion();
    if ('serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.update();
        else registration = await navigator.serviceWorker.register('sw.js');
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // If the SW was replaced while the user is working, offer a controlled refresh.
          if (latestVersion && newer(latestVersion, currentVersion)) showUpdate(latestVersion);
        });
      } catch (_) {}
    }
    await checkLatest();
    // Recheck periodically so long-running Windows/PWA sessions do not stay stale.
    setInterval(checkLatest, 30 * 60 * 1000);
  }

  window.MukorobUpdate = {
    get currentVersion() { return currentVersion; },
    get latestVersion() { return latestVersion; },
    check: checkLatest
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
