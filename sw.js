/* Mukorob PDF v0.9.2 — bounded installation and fresh navigation. */
const RELEASE = '0.9.2';
const CACHE_NAME = 'mukorob-pdf-v0.9.2-update-recovery';
const APP_SHELL = ['./','./index.html','./manifest.webmanifest','./css/app.css','./js/app.js','./js/app-core.js','./js/modules/print.js','./js/modules/annotations.js','./js/modules/organizer.js','./js/modules/autosave.js','./js/modules/data-migration.js','./js/modules/testing.js','./js/modules/v071-brand-auth.js','./js/modules/update-manager.js','./js/modules/supabase-auth.js','./js/db.js','./recover.html','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./vendor/pdf-lib.min.js','./VERSION.txt','./icons/mukorob-official-blue.jpg','./icons/mukorob-blue-192.png','./icons/mukorob-blue-512.png','./icons/mukorob-blue-180.png','./icons/mukorob-blue-32.png','./icons/mukorob-blue-maskable-512.png','./js/modules/document-tools.js','./js/modules/document-engine.mjs','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'];
const scope = new URL('./', self.location.href);
const shellKey = new URL('index.html', scope).href;
async function cached(key) {
  try { return await (await caches.open(CACHE_NAME)).match(key); } catch (_) { return null; }
}
async function remember(key, response) {
  // A quota/storage failure must never turn a successful download into ERR_FAILED.
  try { await (await caches.open(CACHE_NAME)).put(key, response.clone()); } catch (_) {}
}
function offlinePage() {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mukorob PDF — reconnect</title><style>body{background:#071b32;color:#f4f7fc;font:16px system-ui;max-width:520px;margin:15vh auto;padding:24px;line-height:1.6}button,a{color:inherit}button{background:#0759b5;border:0;border-radius:8px;padding:14px;font:inherit}</style><h1>Mukorob PDF needs to reconnect</h1><p>The app files could not be loaded. Your saved PDFs, accounts, drafts and settings remain on this device.</p><p>Connect to the internet, then try again.</p><button id="retry" onclick="location.reload()">Try again</button><p><a href="${new URL('recover.html',scope).href}">Repair the app update</a></p><footer>Developed by Bradz Trading Enterprises CC</footer></html>`, {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
async function fresh(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = new URL(typeof request === 'string' ? request : request.url, scope);
    url.searchParams.set('mkRelease', RELEASE);
    return await fetch(url.href, {cache:'no-store', signal:controller.signal});
  } finally { clearTimeout(timer); }
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  // Third-party CDN requests must never hold worker activation open.
  await Promise.all(APP_SHELL.filter(path => !path.startsWith('https:')).map(async path => {
    const response = await fresh(new URL(path, scope).href);
    if (!response.ok) throw new Error('Update download failed: ' + path);
    await cache.put(new URL(path, scope).href, response);
  }));
  await self.skipWaiting();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({version:RELEASE});
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  const current = await caches.open(CACHE_NAME);
  for (const key of await caches.keys()) {
    if (!key.startsWith('mukorob-pdf-') || key === CACHE_NAME) continue;
    const old = await caches.open(key);
    // Preserve previously cached PDF libraries for offline reading.
    for (const request of await old.keys()) {
      if (new URL(request.url).origin !== scope.origin && !(await current.match(request))) {
        const response = await old.match(request);
        if (response) await current.put(request, response);
      }
    }
    await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const same = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  const navigation = same && event.request.mode === 'navigate';
  const applicationFile = same && /\.(?:html|js|mjs|css|txt|webmanifest|png|jpg)$/.test(url.pathname);
  if (navigation || applicationFile) {
    event.respondWith((async () => {
      const appLaunch = navigation && (url.pathname === scope.pathname || url.pathname === new URL(shellKey).pathname);
      const key = appLaunch ? shellKey : url.origin + url.pathname;
      try {
        const response = await fresh(event.request);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        await remember(key, response);
        return response;
      } catch (_) {
        return (await cached(key)) || (navigation ? offlinePage() : Response.error());
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const saved = await cached(event.request);
    if (saved) return saved;
    try {
      const response = await fetch(event.request);
      if (response.ok && (same || APP_SHELL.includes(event.request.url))) await remember(event.request, response);
      return response;
    } catch (_) { return Response.error(); }
  })());
});
