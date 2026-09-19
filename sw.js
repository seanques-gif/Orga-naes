// CACHE_VERSION is BUILD-OWNED (build.mjs): it is the first 16 hex chars of
// the artifact's sha256, so any change to the app changes this string and a
// new worker installs (with a fresh precache) on the next update check. It
// used to be hand-written and went stale for five days. Do not hand-edit:
// `npm run build` writes it, and the determinism gate + test suite both fail
// when it does not match the artifact.
const CACHE_VERSION = 'ee1618308c008740';
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

// NAVIGATION REQUESTS (the app HTML itself) — network-first.
//
// The old cache-first fetch handler is what made deployments stall: GitHub
// Pages can serve a stale response with old caching headers, so a user could
// keep booting yesterday's build indefinitely and only a manual cache clear
// (or DevTools "Update on reload") would break the loop. Also, when the HTML
// is served from cache the running page keeps the OLD service worker alive,
// so the "Update ready" pill never had a chance to appear — the update loop
// was invisible AND unbreakable from inside the app.
//
// Network-first fixes both: every reload gets the newest HTML the server has
// (keeping the SW script itself byte-identical so no new install is needed),
// and the cache is only used when the device is offline. A failed network
// response (5xx) falls back to cache too, so a broken deploy can't blank the
// app. Firebase/API calls are unaffected (excluded below, as before).
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Everything else (icons, manifest, same-origin assets): network-first with
  // cache fallback. Precached assets make offline launches work; a 5xx also
  // falls back to the cached copy so a partial deploy can't break the UI.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
