/* Mukorob PDF — reliable cross-browser/PWA/Windows update manager. */
(() => {
  const REPO_VERSION_URL = 'https://raw.githubusercontent.com/BTENamibia/Mukorob-Pdf-Project/main/VERSION.txt';
  const isWindowsLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  let currentVersion = '0.7.3';
  let latestVersion = null;
  let registration = null;
  let updateShown = false;
  let updateInProgress = false;

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

  function reloadAfterUpdate() {
    const url = new URL(location.href);
    url.searchParams.set('mkUpdate', Date.now());
    location.replace(url.href);
  }

  async function waitForControllerChange(timeoutMs = 15000) {
    if (!('serviceWorker' in navigator)) return false;
    if (navigator.serviceWorker.controller) {
      // Wait for the newly installed worker to take control. sw.js uses skipWaiting/clientsClaim.
      return await new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          navigator.serviceWorker.removeEventListener('controllerchange', onChange);
          clearTimeout(timer);
          resolve(value);
        };
        const onChange = () => finish(true);
        const timer = setTimeout(() => finish(false), timeoutMs);
        navigator.serviceWorker.addEventListener('controllerchange', onChange);
      });
    }
    return true;
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
      if (updateInProgress) return;
      updateInProgress = true;
      const btn = panel.querySelector('#mkUpdateNow');
      btn.disabled = true;
      btn.textContent = 'Downloading update…';

      if (isWindowsLocal) {
        btn.disabled = false;
        btn.textContent = 'I updated — reload';
        updateInProgress = false;
        return;
      }

      try {
        if (!registration) registration = await navigator.serviceWorker.getRegistration();
        if (!registration) registration = await navigator.serviceWorker.register('sw.js');
        if (registration) {
          btn.textContent = 'Installing update…';
          await registration.update();

          // A waiting worker can occur in browsers/PWAs that do not activate immediately.
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          const controlled = await waitForControllerChange(15000);
          if (controlled || !navigator.serviceWorker.controller) {
            btn.textContent = 'Reloading…';
            reloadAfterUpdate();
            return;
          }
        }
      } catch (_) {
        // Fall through to a cache-busting reload. The SW will retry installation on next load.
      }

      btn.textContent = 'Refreshing…';
      setTimeout(reloadAfterUpdate, 300);
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
          // A completed SW replacement is handled by the update flow; avoid duplicate prompts.
          if (!updateInProgress && latestVersion && newer(latestVersion, currentVersion)) showUpdate(latestVersion);
        });
      } catch (_) {}
    }
    await checkLatest();
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