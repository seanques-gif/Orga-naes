const CACHE_VERSION = '2026-07-22-0100';
const CACHE_NAME = 'orga-naes-' + CACHE_VERSION;
const ASSETS = [
  './Orga-naes.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
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
