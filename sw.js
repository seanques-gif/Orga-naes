const CACHE_VERSION = '2026-09-13-0002';
const CACHE_NAME = 'orga-naes-' + CACHE_VERSION;
const ASSETS = [
  './Orga-naes.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      Promise.all(
        ASSETS.map((url) =>
          c.add(url).catch((err) => {
            // Don't let one missing/failed asset abort the entire install —
            // addAll() is all-or-nothing and a single 404 would otherwise
            // leave the service worker permanently stuck at "installing",
            // which shows as the app hanging on its launch icon.
            console.warn('[sw] failed to precache', url, err);
          })
        )
      )
    )
  );
  // No self.skipWaiting() here (removed 2026-09-13): a new worker must NOT
  // hijack a running session mid-edit. It waits; the user approves via the
  // "Update ready" pill / toast, which posts 'skipWaiting' explicitly.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis')) return;
  e.respondWith(
    fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return resp;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
