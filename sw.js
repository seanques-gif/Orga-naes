// CACHE_VERSION is BUILD-OWNED (build.mjs): it is the first 16 hex chars of
// the artifact's sha256, so any change to the app changes this string and a
// new worker installs (with a fresh precache) on the next update check. It
// used to be hand-written and went stale for five days. Do not hand-edit:
// `npm run build` writes it, and the determinism gate + test suite both fail
// when it does not match the artifact.
const CACHE_VERSION = '619f17ab3dfc365b';
// RELEASE_MANIFEST is BUILD-OWNED like CACHE_VERSION: the full sha256 of the
// artifact this worker was built beside, and the revision that built it. It
// lives here because the artifact cannot contain its own hash, and sw.js is
// served beside the app, so the live page can settle its own identity by
// hashing its own bytes against `artifact` (window._pf.releaseVerify()).
// `head` is provenance — the build-time revision, one commit behind the
// release commit by construction — recorded once and only rewritten when it
// stops being an ancestor of the current HEAD. JSON on one line so the app
// parses it with JSON.parse. Check mode refuses a manifest whose artifact
// does not match the build, or whose head this repository cannot vouch for.
const RELEASE_MANIFEST = {"artifact":"619f17ab3dfc365b7ef2905c1e93ec66726cbdbdce6974f9540fd379c71308d3","head":"ec006743f13e1f792099db74af2e0a949f147fb1"};
const CACHE_NAME = 'orga-naes-' + CACHE_VERSION;
const ASSETS = [
  './Orga-naes.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Runtime cache-fill allowlist (AUD-10): only these paths may be written to
// Cache Storage at fetch time — exactly what ASSETS precaches. The pathname
// is compared, so a navigation to the app HTML under any query/hash stays
// fillable, while anything else (a stray same-origin path, a cross-origin
// script outside the firebase/googleapis bypass) still gets its normal
// network response — it just no longer accumulates in Cache Storage forever.
//
// ORDER MATTERS: this derives from ASSETS, so it must stay BELOW that
// declaration. Referencing it above makes the worker throw at startup
// (temporal dead zone), which leaves the app with no service worker at all
// — no offline boot and no update path — while every text-level check of
// the guard still passes. The suite now evaluates this file to catch that.
const FILLABLE = new Set(
  ASSETS.map((a) => new URL(a, self.registration.scope).pathname)
);
const fillable = (url) => {
  try { return FILLABLE.has(new URL(url).pathname); } catch { return false; }
};

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
          if (resp && resp.ok && fillable(e.request.url)) {
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
        if (resp && resp.ok && fillable(e.request.url)) {
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
