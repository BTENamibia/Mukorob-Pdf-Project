/* Mukorob PDF — reliable cross-browser/PWA/Windows update manager. */
(() => {
  const REPO_VERSION_URL = 'https://raw.githubusercontent.com/BTENamibia/Mukorob-Pdf-Project/main/VERSION.txt';
  const isWindowsLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  const currentVersion = document.querySelector('meta[name="mukorob-version"]')?.content || '0.8.0';
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

  async function hostedVersion() {
    const r = await fetch('./VERSION.txt?mkCheck=' + Date.now(), {cache:'no-store', signal:AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error('The update could not be downloaded. Check your connection and retry.');
    return parseVersion(await r.text());
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
    const url = new URL('./index.html', location.href);
    url.searchParams.set('mkUpdate', Date.now());
    location.replace(url.href);
  }

  async function workerVersion(worker) {
    if (!worker) return null;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {channel.port1.close(); resolve(null);}, 1500);
      channel.port1.onmessage = e => {clearTimeout(timer); channel.port1.close(); resolve(e.data?.version);};
      worker.postMessage({type:'GET_VERSION'}, [channel.port2]);
    });
  }

  async function activateUpdate(v) {
    registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
    await registration.update();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      registration.waiting?.postMessage({type:'SKIP_WAITING'});
      const installed = await workerVersion(navigator.serviceWorker.controller);
      if (installed && !newer(v, installed)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Installation has not finished. Check your connection, then try Update now again.');
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

      try {
        const hosted = await hostedVersion();
        if (newer(v, hosted)) throw new Error('This app address is still serving an older release. Please retry after publication finishes.');
        await window.MukorobAutosave?.flush();
        if (!isWindowsLocal && 'serviceWorker' in navigator) {
          btn.textContent = 'Installing update…';
          await activateUpdate(v);
        }
        btn.textContent = 'Reloading…';
        reloadAfterUpdate();
      } catch (error) {
        let status = panel.querySelector('[role="status"]');
        if (!status) {status = document.createElement('p'); status.setAttribute('role','status'); panel.appendChild(status);}
        status.textContent = error.message || 'Update failed. Check your connection and retry.';
        btn.disabled = false;
        btn.textContent = isWindowsLocal ? 'I updated — reload' : 'Update now';
        updateInProgress = false;
      }
    };
  }

  async function checkLatest() {
    try {
      const r = await fetch(REPO_VERSION_URL + '?_=' + Date.now(), { cache: 'no-store', mode: 'cors', signal:AbortSignal.timeout(10000) });
      if (!r.ok) return;
      const v = parseVersion(await r.text());
      if (v) { latestVersion = v; showUpdate(v); }
    } catch (_) {
      // Offline/local-only use: do not interrupt the application.
    }
  }

  async function install() {
    if ('serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.getRegistration();
        registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
        registration.update().catch(() => {});
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