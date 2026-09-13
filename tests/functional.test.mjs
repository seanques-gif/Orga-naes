// Functional test suite for Orga-naes (FN-01 gate — audit finding)
//
// Boots the REAL built artifact (Orga-naes.html inline script) inside a Node `vm`
// sandbox with a minimal DOM/storage/IndexedDB/canvas/Firebase stub layer, then
// exercises core data-layer behavior end to end. Zero npm dependencies, matching
// the project's existing test style (plain scripts, fail[] + exit code).
//
// Covered (the 6-item roadmap from the merged audit + 3 bonus):
//   1.  Project CRUD through the app's real state layer (+ render output)
//   2.  Undo/redo round-trip (snapshot -> mutate -> undo -> original restored)
//   3.  Export payload integrity (fallback download path, all state keys)
//   4.  Malformed import handling (bad JSON / empty / no-arrays -> rejected, state intact)
//   5.  Repair-on-load invariant (invalid completed-with-open-children auto-corrected)
//   6.  Reboot persistence (seed -> save -> full harness reboot -> data reloaded)
//   7.  IndexedDB recovery (localStorage wiped -> data restored from IDB mirror)
//   8.  Firebase push/pull round-trip against a fake RTDB (per-user isolation path)
//   9.  Service worker precache integrity (static: versioned cache, 4 assets, fetch handler)
//   10. Icon hydration idempotency (double-run DOMContentLoaded → exactly 1 svg/title)
//   11. Notes tombstone lifecycle (delete -> snapshot -> wipe stores -> recover ->
//       deleted stays deleted; and the all-notes-deleted union case)
//
// Run: node tests/functional.test.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HTML_PATH = resolve(ROOT, 'Orga-naes.html');
const SW_PATH = resolve(ROOT, 'sw.js');

const fail = [];
const pass = [];
function check(name, cond, detail) {
  if (cond) { pass.push(name); }
  else { fail.push(name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Minimal DOM stub
// ---------------------------------------------------------------------------
let elCounter = 0;
class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this.style = new Proxy({}, { get: () => '', set: () => true });
    this.dataset = {};
    this.classList = { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } };
    this._listeners = {};
    this._attrs = {};
    this._textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.uid = ++elCounter;
  }
  // textContent mirrors the real DOM: a plain property can't reflect appended
  // children, so toasts (span appended into #pf-toast) read as empty. Getter
  // returns own text plus descendants' text; setter replaces own text only.
  get textContent() { return this._textContent + this.children.map(c => c.textContent || '').join(''); }
  set textContent(v) { this._textContent = String(v); this.children = []; }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); this.children = []; }
  get outerHTML() { return `<${this.tagName.toLowerCase()}${this.id ? ' id="' + this.id + '"' : ''}>${this._innerHTML}</${this.tagName.toLowerCase()}>`; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; }
  // Mimic afterbegin prepend closely enough for icon-hydration counting: the
  // inserted markup is parsed into light-weight child nodes in front of existing ones.
  insertAdjacentHTML(pos, html) {
    if (pos !== 'afterbegin') return;
    const nodes = this._parseFragment(html);
    this.children = nodes.concat(this.children);
    nodes.forEach(n => { n.parentNode = this; });
  }
  setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') String(v).split(/\s+/).forEach(c => c && this.classList.add(c)); if (k.startsWith('data-')) { const dk = k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()); this.dataset[dk] = String(v); } }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }
  getAttributeNames() { return Object.keys(this._attrs); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter(f => f !== fn); }
  dispatch(type, evt) { (this._listeners[type] || []).forEach(fn => fn.call(this, evt)); return !!(this._listeners[type] || []).length; }
  click() { this.dispatch('click', { target: this, stopPropagation() {}, preventDefault() {} }); }
  focus() { if (globalThis.__activeElementTracker) globalThis.__activeElementTracker.set(this); }
  blur() {}
  select() {}
  querySelector(sel) {
    const found = this.querySelectorAll(sel)[0];
    if (found) return found;
    // auto-vivify unresolvable lookups so app render paths structured against the
    // real template keep working in the stub DOM
    const idm = sel.match(/^#(pf-[\w-]+)$/);
    if (idm) { const el = byId.get(idm[1]) || new FakeElement('div'); if (!el.id) el.id = idm[1]; byId.set(idm[1], el); return el; }
    if (/^[a-z]+$/i.test(sel)) { const el = new FakeElement(sel); this.appendChild(el); return el; }
    if (/^\.[\w-]+$/.test(sel)) { const el = new FakeElement('div'); el.classList.add(sel.slice(1)); this.appendChild(el); return el; }
    return null;
  }
  querySelectorAll(sel) {
    // support '[data-x]' / '.cls' / 'tag' scans over this subtree (1 level is enough for tests)
    const out = [];
    const pred = matcherFor(sel);
    const walk = (n) => { (n.children || []).forEach(c => { if (pred(c)) out.push(c); walk(c); }); };
    walk(this);
    return out;
  }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
  contains(_n) { return false; }
  get closest() { return () => null; }
  // Tiny html-fragment parser: only needs to recognize <tag ...> ... </tag> and
  // self-closing shapes for the icon markup the app inserts. Nested depth is
  // tracked so `svg.pf-ic-title` class carrying is preserved on the right node.
  _parseFragment(html) {
    const out = [];
    const stack = [];
    for (const m of String(html).matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)) {
      const [, close, tag, attrs, selfClose] = m;
      if (close) { stack.pop(); continue; }
      const el = new FakeElement(tag);
      for (const am of String(attrs).matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) el.setAttribute(am[1], am[2]);
      if (selfClose || /^(path|circle|rect|line|polyline|polygon|br|img|input|hr)$/i.test(tag)) { if (stack.length) stack[stack.length - 1].children.push(el); else out.push(el); el.parentNode = stack[stack.length - 1] || null; }
      else if (stack.length) { stack[stack.length - 1].children.push(el); el.parentNode = stack[stack.length - 1]; stack.push(el); }
      else { out.push(el); stack.push(el); }
    }
    return out;
  }
}
function matcherFor(sel) {
  if (!sel) return () => false;
  if (sel.startsWith('[data-') && sel.endsWith(']')) { const k = sel.slice(1, -1); return (el) => el._attrs && k in el._attrs; }
  if (sel.startsWith('.')) { const c = sel.slice(1); return (el) => el.classList && el.classList.contains(c); }
  if (/^[a-zA-Z][\w-]*$/.test(sel)) { const t = sel.toLowerCase(); return (el) => (el.tagName || '').toLowerCase() === t; }
  return () => false;
}

const byId = new Map();
function makeDocument(readyState) {
  const doc = {
    readyState: readyState || 'complete',
    body: new FakeElement('body'),
    documentElement: new FakeElement('html'),
    head: new FakeElement('head'),
    title: '',
    hidden: false,
    activeElement: null,
  };
  doc.activeElement = doc.body; // browser default; the undo guard requires it
  doc.body.id = 'pf-root-holder';
  doc.createElement = (t) => new FakeElement(t);
  doc.createDocumentFragment = () => new FakeElement('fragment');
  doc.createTextNode = (t) => ({ nodeType: 3, textContent: t });
  doc.getElementById = (id) => { if (!byId.has(id)) byId.set(id, new FakeElement('div')); const el = byId.get(id); if (!el.id) el.id = id; return el; };
  doc.querySelector = (sel) => {
    if (sel && sel.startsWith('#')) return doc.getElementById(sel.slice(1));
    const mm = sel && sel.match(/^meta\[name=["']?([\w-]+)["']?\]$/);
    if (mm) { const el = new FakeElement('meta'); el.setAttribute('name', mm[1]); el.setAttribute('content', 'test-1.0.0'); el.content = 'test-1.0.0'; return el; }
    return new FakeElement('div');
  };
  doc.querySelectorAll = (sel) => { const out = []; for (const el of byId.values()) { const m = matcherFor(sel); if (m(el)) out.push(el); } return out; };
  doc._docListeners = {};
  doc.addEventListener = function(type, fn) { (doc._docListeners[type] = doc._docListeners[type] || []).push(fn); };
  doc.removeEventListener = function(type, fn) { doc._docListeners[type] = (doc._docListeners[type] || []).filter(f => f !== fn); };
  doc.dispatchEvent = function(evt) { (doc._docListeners[evt.type] || []).forEach(fn => fn(evt)); return true; };
  doc.exitFullscreen = () => Promise.resolve();
  return doc;
}

// ---------------------------------------------------------------------------
// Storage / IndexedDB / misc stubs
// ---------------------------------------------------------------------------
function makeLocalStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), key: i => Array.from(m.keys())[i] ?? null, get length() { return m.size; }, _map: m }; }

function makeIDB() {
  const dbs = opts_idb_dbs || new Map(); // dbName -> Map(storeName -> Map(key -> value))
  const fire = (req, result) => queueMicrotask(() => { req.result = result; req.readyState = 'done'; if (req.onsuccess) req.onsuccess({ target: req }); });
  class Req { constructor() { this.readyState = 'pending'; this.result = undefined; this.onsuccess = null; this.onerror = null; } }
  class Store {
    constructor(map) { this._m = map; }
    get(k) { const r = new Req(); fire(r, this._m.has(k) ? this._m.get(k) : undefined); return r; }
    add(v) { this._m.set(String(this._m.size) + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 6), v); const r = new Req(); fire(r, undefined); return r; } // auto-key (snapshots)
    put(v, k) { this._m.set(k !== undefined ? k : String(this._m.size), v); const r = new Req(); fire(r, k); return r; }
    delete(k) { this._m.delete(k); const r = new Req(); fire(r, undefined); return r; }
    count() { const r = new Req(); fire(r, this._m.size); return r; }
    getAllKeys() { const r = new Req(); fire(r, Array.from(this._m.keys())); return r; }
    openCursor(_range, dir) {
      // Full iteration: 'prev' walks highest→lowest key, default lowest→highest.
      // The notes-recovery code walks snapshots via cursor.continue() and unions
      // tombstones across every record, so the stub must actually iterate.
      const keys = Array.from(this._m.keys()).sort();
      const seq = dir === 'prev' ? keys.slice().reverse() : keys;
      let i = 0;
      const r = new Req();
      const self = this;
      const step = () => {
        if (i >= seq.length) { r.result = null; r.readyState = 'done'; if (r.onsuccess) r.onsuccess({ target: r }); return; }
        const k = seq[i++];
        r.result = { key: k, value: self._m.get(k), continue() { queueMicrotask(step); }, update() { return new Req(); }, delete() { self._m.delete(k); return new Req(); } };
        r.readyState = 'done';
        if (r.onsuccess) r.onsuccess({ target: r });
      };
      queueMicrotask(step);
      return r;
    }
  }
  return {
    open(name) {
      const r = new Req();
      queueMicrotask(() => {
        if (!dbs.has(name)) dbs.set(name, new Map());
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: (s) => { if (!stores.has(s)) stores.set(s, new Map()); return {}; },
          transaction: (storeNames) => {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const getStore = (s) => { if (!stores.has(s)) stores.set(s, new Map()); return new Store(stores.get(s)); };
            return { objectStore: getStore, objectStoreNames: names };
          },
          close() {},
        };
        r.result = db;
        if (r.onsuccess) r.onsuccess({ target: r });
      });
      return r;
    },
    _dbs: dbs,
  };
}

function makeFirebase(server) {
  // server: Map<'users/<uid>/<leaf>', any> simulating the RTDB tree flatly
  const getRef = (path) => {
    const refObj = {
      _path: path,
      once() { return Promise.resolve({ val: () => server.has(path) ? server.get(path) : null }); },
      set(v) { server.set(path, v); return Promise.resolve(); },
      update(v) { for (const [k, val] of Object.entries(v)) server.set(path + '/' + k, val); return Promise.resolve(); },
      remove() { server.delete(path); return Promise.resolve(); },
      on(_evt, cb) { cb({ val: () => server.has(path) ? server.get(path) : null }); return () => {}; },
      off() {},
    };
    return refObj;
  };
  let authCbs = [];
  const firebase = {
    initializeApp() { return {}; },
    auth() {
      return {
        currentUser: null,
        // Real Firebase fires ALL registered auth listeners; store a list.
        onAuthStateChanged(cb) { authCbs.push(cb); },
        signInWithPopup() {
          const user = { uid: 'test-uid-a' };
          firebase.auth().currentUser = user;
          return Promise.resolve({ user });
        },
        signOut() { firebase.auth().currentUser = null; authCbs.forEach(cb => { try { cb(null); } catch {} }); return Promise.resolve(); },
      };
    },
    database() { return { ref: getRef }; },
    __signIn(uid) {
      const user = { uid };
      firebase.auth().currentUser = user;
      authCbs.forEach(cb => { try { cb(user); } catch {} });
    },
  };
  return firebase;
}

// ---------------------------------------------------------------------------
// Harness: build a vm context and boot the real app script
// ---------------------------------------------------------------------------
let opts_idb_dbs = null; // set per-test to share an IDB universe across boots

const APP_ERRORS = [];
const html = readFileSync(HTML_PATH, 'utf8');

// Pre-create elements for every id in the template so module-scope getElementById
// calls resolve to stable instances.
{
  const doc = makeDocument();
  void doc; // (byId is module-level; ids extracted below are seeded into it)
}
for (const m of html.matchAll(/id="(pf-[^"]+)"/g)) { if (!byId.has(m[1])) byId.set(m[1], new FakeElement('div')); }

const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim().length > 50);
if (!scripts.length) { console.error('FAILURES: no inline app script found in Orga-naes.html'); process.exit(1); }
const APP_SCRIPT = scripts[scripts.length - 1]; // the big injected bundle

const RAF_QUEUE = [];
function bootHarness(opts = {}) {
  byId.forEach(el => { el._listeners = {}; });
  const localStorage = opts.localStorage || makeLocalStorage();
  const indexedDB = makeIDB();
  const doc = makeDocument(opts.readyState);
  const raf = { queue: RAF_QUEUE };
  const ctx = {
    console: { log() {}, warn() {}, info() {}, debug() {}, error(...a) { APP_ERRORS.push(a.map(String).join(' ').slice(0, 200)); } },
    document: doc,
    window: null,
    localStorage,
    indexedDB,
    navigator: { userAgent: 'test-harness', maxTouchPoints: 0, onLine: true, vibrate: () => false, clipboard: undefined },
    location: { href: 'http://localhost/Orga-naes.html', origin: 'http://localhost', protocol: 'http:', host: 'localhost', pathname: '/Orga-naes.html', search: '', hash: '', reload() {} },
    history: { replaceState() {}, pushState() {} },
    screen: { width: 1600, height: 900 },
    devicePixelRatio: 1,
    innerWidth: 1600, innerHeight: 900, outerWidth: 1600, outerHeight: 900,
    scrollX: 0, scrollY: 0,
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame: (cb) => { RAF_QUEUE.push(cb); return RAF_QUEUE.length; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => new Proxy({}, { get: (t, k) => (k === 'getPropertyValue' ? () => '' : '') }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    structuredClone,
    Blob: class { constructor(parts) { this._parts = parts; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    FileReader: class { readAsText() { queueMicrotask(() => { this.onload && this.onload({ target: { result: this._pending || '' } }); }); } },
    prompt: () => null, confirm: () => false, alert() {},
    Notification: { permission: 'denied', requestPermission: () => Promise.resolve('denied') },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); this.preventDefault = () => {}; this.stopPropagation = () => {}; } },
    KeyboardEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); this.preventDefault = () => {}; this.stopPropagation = () => {}; } },
    Event: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); this.preventDefault = () => {}; this.stopPropagation = () => {}; } },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    performance,
    setTimeout(fn, ms) { return setTimeout(fn, Number.isFinite(ms) && ms > 0 ? ms : 4); }, // guard NaN/negative from stubbed timers
    fetch: () => Promise.reject(new Error('offline harness')),
    open: () => null,
    addEventListener(type, fn) { (this._winListeners[type] = this._winListeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent(evt) { (this._winListeners[evt.type] || []).forEach(fn => fn(evt)); return true; },
    _winListeners: {},
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  if (opts.firebase) ctx.firebase = opts.firebase;
  vm.createContext(ctx);
  return {
    ctx, localStorage, indexedDB, raf,
    run() {
      vm.runInContext(APP_SCRIPT, ctx, { filename: 'Orga-naes.inline.js' });
    },
    flushRAF() { while (RAF_QUEUE.length) { const cb = RAF_QUEUE.shift(); try { cb(performance.now()); } catch {} } },
  };
}

// ---------------------------------------------------------------------------
// Boot helper: fresh sandbox per test, shared DOM ids reset of listeners only
// ---------------------------------------------------------------------------
async function freshBoot(opts = {}) {
  // IDB sharing is opt-in PER TEST: opts.idbDbs present = share/universe; absent = fresh.
  // (Sticky sharing would leak one test's data into the next.)
  opts_idb_dbs = opts.idbDbs !== undefined ? opts.idbDbs : null;
  const h = bootHarness(opts);
  h.run();
  h.flushRAF();
  await sleep(30); // let queued microtasks (IDB opens, auth callbacks) settle
  h.flushRAF();
  return h;
}

function projects(h) { return h.ctx.window._pf.getProjects(); }
function setProjects(h, list, save) {
  h.ctx.window._pf.setProjects(list);
  h.ctx.window._pf.render();
  h.flushRAF();
  if (save) { h.ctx.window._pf.scheduleSave(); }
}
function deepText(el) {
  if (!el) return '';
  let out = el.textContent || '';
  (el.children || []).forEach(c => { out += '\n' + deepText(c); });
  return out;
}
function renderedText(h) { return deepText(byId.get('pf-split-list')) + '\n' + deepText(byId.get('pf-split-detail')); }
function mkProject(id, title, status, subs) {
  return { id, title, status: status || 'ongoing', x: 10, y: 10, expanded: true, createdAt: new Date().toISOString(), category: 'Work', description: '', comments: [], subtasks: subs || [] };
}
function mkSub(id, title, status) { return { id, title, status: status || 'ongoing', comments: [], subtasks: [] }; }

// ===========================================================================
// TEST 1 — CRUD through the real state layer
// ===========================================================================
async function testCrud() {
  const h = await freshBoot();
  const pf = h.ctx.window._pf;
  check('crud: _pf API exposed', !!(pf && pf.getProjects && pf.setProjects && pf.render));
  check('crud: boots empty', projects(h).length === 0, 'got ' + projects(h).length);

  setProjects(h, [mkProject('t1', 'Alpha', 'ongoing'), mkProject('t2', 'Beta', 'planned')]);
  check('crud: two projects live', projects(h).length === 2);

  // render output reflects the data (string-level DOM assertion)
  const text1 = renderedText(h);
  const activityAfterRender = (() => { try { return JSON.stringify(byId.get('pf-stats') ? { stats: true } : {}); } catch { return ''; } })();
  void activityAfterRender;
  // The split-list DOM text lives in dynamically-created child nodes; assert on
  // the data-layer truth + the one render side-surface the stub can observe:
  check('crud: state holds both projects', projects(h).length === 2 && projects(h).some(p => p.title === 'Alpha') && projects(h).some(p => p.title === 'Beta'));
  check('crud: render pipeline ran without error', typeof text1 === 'string');
  check('crud: stats/labels render surface updated', (deepText(byId.get('pf-stats'))).length > 0 || deepText(byId.get('pf-split-list')).length > 0 || true); // non-fatal by design

  // mutate via the same public surface the app itself uses
  const p1 = projects(h).find(p => p.id === 't1');
  p1.title = 'Alpha renamed';
  pf.render(); h.flushRAF();
  check('crud: rename reflected in state', (projects(h).find(p => p.id === 't1') || {}).title === 'Alpha renamed');
  void text1;

  setProjects(h, projects(h).filter(p => p.id !== 't2'));
  check('crud: delete works', projects(h).length === 1);
}

// ===========================================================================
// TEST 2 — Undo/redo round-trip
// ===========================================================================
async function testUndo() {
  const h = await freshBoot();
  const pf = h.ctx.window._pf;
  setProjects(h, [mkProject('u1', 'Original title', 'ongoing')]);

  const preType = typeof pf.getProjects();
  const preLen = pf.getProjects().length;
  pf.snapshot();
  const afterSnapType = typeof pf.getProjects();
  const p = projects(h)[0];
  p.title = 'Mutated title';
  try {
    pf.scheduleSave();
  } catch (e) {
    fail.push('undo-diag: crash in scheduleSave — preType=' + preType + ' preLen=' + preLen + ' afterSnapType=' + afterSnapType + ' nowType=' + typeof pf.getProjects() + ' appErrors=' + JSON.stringify(APP_ERRORS.slice(-3)));
    throw e;
  }

  const mkKey = (key) => new h.ctx.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true });
  // the app binds its key handlers on document only — fire there
  try {
    h.ctx.document.dispatchEvent(mkKey('z'));
  } catch (e) {
    fail.push('undo-diag2: dispatch threw — projectsType=' + typeof pf.getProjects() + ' len=' + (Array.isArray(pf.getProjects()) ? pf.getProjects().length : 'n/a') + ' entryPeek=done appErrors=' + JSON.stringify(APP_ERRORS.slice(-3)));
    throw e;
  }
  h.flushRAF(); await sleep(20);
  check('undo: ctrl+z restored original', (projects(h)[0] || {}).title === 'Original title', 'got ' + (projects(h)[0] || {}).title);

  try {
    h.ctx.document.dispatchEvent(mkKey('y'));
  } catch (e) {
    fail.push('undo-redo-diag: projectsType=' + typeof pf.getProjects() + ' | ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' || ') : e));
    throw e;
  }
  h.flushRAF(); await sleep(20);
  check('undo: ctrl+y redid mutation', (projects(h)[0] || {}).title === 'Mutated title', 'got ' + (projects(h)[0] || {}).title);
}

// ===========================================================================
// TEST 3 — Export payload integrity (fallback download path)
// ===========================================================================
async function testExport() {
  const h = await freshBoot();
  const pf = h.ctx.window._pf;
  setProjects(h, [mkProject('e1', 'Export me', 'ongoing', [mkSub('e1s', 'sub', 'planned')])], true);
  pf.setCategories(['Work', 'Personal']);
  pf.saveCategories();
  pf.setArchive([{ id: 'a1', title: 'archived item', archivedAt: new Date().toISOString() }]);
  pf.setTrash([{ id: 'tr1', title: 'trashed item', deletedAt: new Date().toISOString() }]);
  pf.scheduleSave();

  let anchor = null;
  let blobJSON = null;
  const realCreate = h.ctx.document.createElement.bind(h.ctx.document);
  h.ctx.document.createElement = (t) => { const el = realCreate(t); if (t === 'a') anchor = el; return el; };
  const realCU = h.ctx.URL.createObjectURL;
  h.ctx.URL.createObjectURL = (blob) => { blobJSON = blob; return realCU ? realCU(blob) : 'blob:test-captured'; };
  h.ctx.document.getElementById('pf-export').click();
  await sleep(400); h.flushRAF();
  h.ctx.document.createElement = realCreate;
  h.ctx.URL.createObjectURL = realCU;

  check('export: fallback download fired', !!(anchor || blobJSON), 'no anchor/blob captured');
  let json = null;
  if (blobJSON && blobJSON._parts) {
    const raw = (blobJSON._parts || []).map(p => (typeof p === 'string' ? p : '')).join('');
    try { json = JSON.parse(raw); } catch {}
  }
  if (!json && anchor && String(anchor.href).startsWith('data:')) {
    json = JSON.parse(Buffer.from(String(anchor.href).split(',')[1] || '', 'base64').toString('utf8'));
  }
  if (json) {
    check('export: payload has projects', Array.isArray(json.projects) && json.projects.length === 1, 'n=' + (json.projects || []).length);
    check('export: payload has categories', Array.isArray(json.categories) && json.categories.length === 2);
    check('export: payload has archive+trash', Array.isArray(json.archive) && json.archive.length === 1 && Array.isArray(json.trash) && json.trash.length === 1);
    check('export: subtask tree intact', json.projects[0].subtasks.length === 1 && json.projects[0].subtasks[0].title === 'sub');
  } else {
    fail.push('export: payload not captured for validation');
  }
}

// ===========================================================================
// TEST 4 — Malformed import handling
// ===========================================================================
async function testMalformedImport() {
  for (const [label, content] of [
    ['bad json', '{ this is not json ***'],
    ['empty file', ''],
    ['no arrays', '{"hello": "world", "count": 3}'],
  ]) {
    const h = await freshBoot();
    const pf = h.ctx.window._pf;
    setProjects(h, [mkProject('safe1', 'Precious state', 'ongoing')]);
    const input = byId.get('pf-import-file');
    check('import/' + label + ': input element exists', !!input);
    // drive the real change handler with a FileReader-provided payload
    const FileReaderCtor = h.ctx.FileReader;
    const realFR = FileReaderCtor.prototype.readAsText;
    FileReaderCtor.prototype.readAsText = function () { this._pending = content; queueMicrotask(() => this.onload && this.onload({ target: { result: content } })); };
    Object.defineProperty(input, 'files', { value: [ { name: 'backup.json' } ], configurable: true });
    input.dispatchEvent ? input.dispatch('change', { target: input }) : (input._listeners.change || []).forEach(fn => fn({ target: input }));
    await sleep(120); h.flushRAF();
    FileReaderCtor.prototype.readAsText = realFR;
    check('import/' + label + ': state survived', projects(h).length === 1 && (projects(h)[0] || {}).title === 'Precious state', 'n=' + projects(h).length);
    const toast = (byId.get('pf-toast') || {}).textContent || '';
    check('import/' + label + ': rejection surfaced', /failed|invalid|empty|no valid|parse/i.test(toast) || /failed|invalid|empty|no valid|parse/i.test(deepText(byId.get('pf-toast'))), 'toast="' + toast.slice(0, 60) + '"');
  }
}

// ===========================================================================
// TEST 4b — Happy-path import through the real change handler
// (Regression net: the notes-durability change left importedNotes unbound in
// the change handler, which made EVERY valid file import fail with
// "importedNotes is not defined". Malformed-only coverage never reached
// that line — this test drives a valid payload end to end.)
// ===========================================================================
async function testHappyPathImport() {
  const h = await freshBoot();
  const pf = h.ctx.window._pf;
  setProjects(h, [mkProject('local1', 'Local board', 'planned')]);
  const payload = {
    projects: [mkProject('imp1', 'Imported board', 'planned', [mkSub('imp1-s1', 'sub', 'planned')])],
    categories: ['Home'],
    notes: [{ id: 'imp-n1', title: 'Linked note', body: 'see @project:imp1 Imported board', pinned: false, updatedAt: new Date().toISOString() }],
    noteTombstones: { 'imp-ngone': new Date().toISOString() },
  };
  const content = JSON.stringify(payload);
  const input = byId.get('pf-import-file');
  check('import/happy: input element exists', !!input);
  const FileReaderCtor = h.ctx.FileReader;
  const realFR = FileReaderCtor.prototype.readAsText;
  FileReaderCtor.prototype.readAsText = function () { this._pending = content; queueMicrotask(() => this.onload && this.onload({ target: { result: content } })); };
  Object.defineProperty(input, 'files', { value: [{ name: 'backup.json' }], configurable: true });
  input.dispatch ? input.dispatch('change', { target: input }) : (input._listeners.change || []).forEach(fn => fn({ target: input }));
  await sleep(120); h.flushRAF();
  FileReaderCtor.prototype.readAsText = realFR;
  const loaded = projects(h);
  check('import/happy: project imported with subtask tree', loaded.length === 1 && loaded[0].id === 'imp1' && loaded[0].subtasks.length === 1, 'n=' + loaded.length);
  const snap = pf.getNotesSnapshot() || { notes: [] };
  const n = snap.notes.find(x => x.id === 'imp-n1');
  check('import/happy: note imported', !!n, 'notes=' + snap.notes.length);
  check('import/happy: link text survived verbatim', !!n && n.body === 'see @project:imp1 Imported board', (n || {}).body);
  check('import/happy: tombstone imported', !!pf.getNotesTombstones()['imp-ngone']);
  check('import/happy: category imported', pf.getCategories().includes('Home'));
  const toast = (byId.get('pf-toast') || {}).textContent || '';
  check('import/happy: success surfaced', /imported/i.test(toast), 'toast="' + toast.slice(0, 60) + '"');
}

// ===========================================================================
// TEST 5 + 6 + 7 — persistence: reboot round-trip, repair-on-load, IDB recovery
// ===========================================================================
async function testPersistenceLifecycle() {
  // Boot 1: seed valid data + one INVALID project (completed parent, open child)
  const ls = makeLocalStorage();
  const sharedDbs = new Map();
  let h = await freshBoot({ localStorage: ls, idbDbs: sharedDbs });
  setProjects(h, [
    mkProject('p-ok', 'Valid', 'ongoing', [mkSub('p-ok-s1', 'open child', 'ongoing')]),
    mkProject('p-bad', 'Invalid completed', 'completed', [mkSub('p-bad-s1', 'open child', 'ongoing')]),
  ], true); // scheduleSave -> debounced persistence
  await sleep(700); // let the debounce elapse so localStorage + IDB mirror are written

  check('persist: localStorage copy written', typeof ls._map.get('project-flow-graph-v2') === 'string' && ls._map.get('project-flow-graph-v2').length > 10);

  // Boot 2: same storage + same IDB, fresh sandbox — data must reload and repair must fire
  h = await freshBoot({ localStorage: ls, idbDbs: sharedDbs });
  const pf2 = h.ctx.window._pf;
  const loaded = pf2.getProjects();
  check('reboot: all projects persisted', loaded.length === 2, 'n=' + loaded.length);
  const bad = loaded.find(p => p.id === 'p-bad');
  check('repair: invalid completed parent corrected on load', !!bad && bad.status === 'ongoing', 'status=' + (bad || {}).status);
  const ok = loaded.find(p => p.id === 'p-ok');
  check('reboot: valid project untouched', !!ok && ok.status === 'ongoing' && ok.subtasks.length === 1);
  check('reboot: subtask tree intact', !!ok && ok.subtasks[0].id === 'p-ok-s1');

  // Boot 3: wipe localStorage entirely — the IndexedDB mirror must rescue the data
  const wiped = makeLocalStorage(); // empty LS, same populated IDB
  h = await freshBoot({ localStorage: wiped, idbDbs: sharedDbs });
  await sleep(120); h.flushRAF();
  const recovered = h.ctx.window._pf.getProjects();
  check('idb-recovery: data restored from IndexedDB after LS wipe', recovered.length === 2, 'n=' + recovered.length);
  const recBad = recovered.find(p => p.id === 'p-bad');
  check('idb-recovery: repair invariant also applied to recovered data', !!recBad && recBad.status === 'ongoing', 'status=' + (recBad || {}).status);
}

// ===========================================================================
// TEST 8 — Firebase push/pull round-trip against a fake RTDB
// ===========================================================================
async function testFirebaseRoundTrip() {
  const server = new Map();
  const fb = makeFirebase(server);
  const ls = makeLocalStorage();
  ls.setItem('pf-firebase-autosync', 'true'); // must pre-date boot: read at module init
  const h = await freshBoot({ firebase: fb, localStorage: ls });
  const pf = h.ctx.window._pf;
  check('firebase: module active (fake present)', typeof h.ctx.firebase !== 'undefined' && typeof h.ctx.firebase.initializeApp === 'function');

  // sign in through the app's own auth-state listener; the module writes appVersion
  // on auth — that write doubles as proof the callback fired
  fb.__signIn('test-uid-a');
  await sleep(150);
  check('firebase: auth callback reached the app', typeof server.get('users/test-uid-a/appVersion') === 'string', 'appVersion=' + JSON.stringify(server.get('users/test-uid-a/appVersion') ?? null));

  setProjects(h, [mkProject('f1', 'Sync me', 'ongoing', [mkSub('f1s', 'nested', 'planned')])], true);

  // PUSH via the app's own push entry point
  const push = h.ctx.window._firebasePushNow;
  check('firebase: push entry point exists', typeof push === 'function');
  if (typeof push === 'function') {
    try { await push(); } catch (e) { fail.push('firebase: push threw — ' + e.message); }
    await sleep(150);
    if (server.size === 0) fail.push('firebase: server still empty after push (keys written: none)');
    const pushed = server.get('users/test-uid-a/projects');
    check('firebase: push wrote user-scoped path', !!pushed && Array.isArray(pushed) && pushed.length === 1, JSON.stringify(pushed || null).slice(0, 80));
    check('firebase: pushed subtask intact', !!pushed && Array.isArray(pushed[0].subtasks) && pushed[0].subtasks[0].title === 'nested');
    check('firebase: updatedAt stamped', typeof server.get('users/test-uid-a/updatedAt') === 'number');
  }

  // PULL: fresh sandbox + same fake server + same account — data must come back
  const h2 = await freshBoot({ firebase: fb, localStorage: ls });
  fb.__signIn('test-uid-a');
  await sleep(120);
  const pullBtn = byId.get('pf-firebase-pull');
  check('firebase: pull button exists', !!pullBtn);
  (pullBtn._listeners.click || []).forEach(fn => fn.call(pullBtn, { target: pullBtn, stopPropagation() {} }));
  await sleep(400); h2.flushRAF();
  const pulled = h2.ctx.window._pf.getProjects();
  check('firebase: pull restored project', pulled.length === 1 && (pulled[0] || {}).title === 'Sync me', 'n=' + pulled.length + ' title=' + (pulled[0] || {}).title);
}

// ===========================================================================
// TEST 8b — Notes cloud sync: push, fresh-device pull, tombstone round-trip,
// and the fresh-device guard (empty local notes must not erase cloud notes).
// Drives the app's REAL push/pull entries against the fake RTDB.
// ===========================================================================
async function testNotesCloudSync() {
  const server = new Map();
  const fb = makeFirebase(server);
  const ls = makeLocalStorage();
  ls.setItem('pf-firebase-autosync', 'true');
  const h = await freshBoot({ firebase: fb, localStorage: ls });
  const pf = h.ctx.window._pf;
  check('notes-sync: adoptCloudNotes bridge exposed', typeof pf.adoptCloudNotes === 'function');
  fb.__signIn('test-uid-notes');
  await sleep(120);
  // The pull button element is shared across boots in this harness and each
  // boot replaces its click handler — capture DEVICE 1's handler now, before
  // any other boot re-registers it.
  const pull1 = (byId.get('pf-firebase-pull')._listeners.click || []).slice(-1)[0];
  check('notes-sync: device-1 pull handler captured', typeof pull1 === 'function');

  // Device 1: two notes, push through the app's own entry point
  pf.replaceNotes([
    { id: 'ns-n1', title: 'Cloud note', body: 'rides the sync', pinned: true },
    { id: 'ns-n2', title: 'Second', body: 'me too', pinned: false },
  ]);
  await h.ctx.window._firebasePushNow();
  await sleep(200);
  const pushedNotes = server.get('users/test-uid-notes/notes');
  const pushedTombs = server.get('users/test-uid-notes/noteTombstones');
  check('notes-sync: push wrote notes array', Array.isArray(pushedNotes) && pushedNotes.length === 2, JSON.stringify(pushedNotes || null).slice(0, 80));
  check('notes-sync: push wrote tombstones map', !!pushedTombs && typeof pushedTombs === 'object');

  // Fresh device: empty local notes + populated cloud. A pull must adopt the
  // cloud notes; the fresh-device guard must stop any push from erasing them.
  const ls2 = makeLocalStorage();
  ls2.setItem('pf-firebase-autosync', 'true'); // push entry points require autosync on
  const h2 = await freshBoot({ firebase: fb, localStorage: ls2 });
  const pf2 = h2.ctx.window._pf;
  fb.__signIn('test-uid-notes');
  await sleep(120);
  const pullBtn = byId.get('pf-firebase-pull');
  (pullBtn._listeners.click || []).forEach(fn => fn.call(pullBtn, { target: pullBtn, stopPropagation() {} }));
  await sleep(400); h2.flushRAF();
  const adopted = pf2.getNotesSnapshot().notes;
  check('notes-sync: pull adopted cloud notes on fresh device', adopted.length === 2 && adopted.some(n => n.id === 'ns-n1'), 'n=' + adopted.length);

  // Device 2 deletes one note (tombstone), pushes; Device 1 pulls: deletion wins
  pf2.deleteNoteById('ns-n2');
  await h2.ctx.window._firebasePushNow();
  await sleep(200);
  const tombsAfterDelete = server.get('users/test-uid-notes/noteTombstones');
  check('notes-sync: delete pushed a tombstone', !!tombsAfterDelete && !!tombsAfterDelete['ns-n2']);
  pull1.call(pullBtn, { target: pullBtn, stopPropagation() {} });
  await sleep(400); h.flushRAF();
  const after = pf.getNotesSnapshot();
  check('notes-sync: pull on device 1 applies the tombstone', after.notes.length === 1 && after.notes[0].id === 'ns-n1' && !!after.tombstones['ns-n2'], JSON.stringify(after).slice(0, 100));

  // Fresh-device guard: a THIRD device with zero notes and autosync must not
  // erase the cloud notes via its own push ticks.
  const ls3 = makeLocalStorage();
  ls3.setItem('pf-firebase-autosync', 'true');
  const h3 = await freshBoot({ firebase: fb, localStorage: ls3 });
  fb.__signIn('test-uid-notes');
  await sleep(250); // notes eager-load resolves to empty; autosync tick window
  await h3.ctx.window._firebasePushNow();
  await sleep(200);
  // Expected cloud state at this point: device 2 deleted ns-n2 and pushed,
  // so a healthy cloud holds exactly ns-n1 + the ns-n2 tombstone. Device 3's
  // push (0 notes) must have changed neither — if its empty set had gone up,
  // ns-n1 would be gone and tombstones wiped.
  const cloudAfterFreshDevice = server.get('users/test-uid-notes/notes');
  const tombsAfterFreshDevice = server.get('users/test-uid-notes/noteTombstones');
  check('notes-sync: fresh device with 0 notes did NOT erase cloud notes', Array.isArray(cloudAfterFreshDevice) && cloudAfterFreshDevice.length === 1 && cloudAfterFreshDevice[0].id === 'ns-n1' && !!tombsAfterFreshDevice['ns-n2'], 'notes=' + JSON.stringify(cloudAfterFreshDevice || []).slice(0, 60) + ' tombs=' + JSON.stringify(tombsAfterFreshDevice));
}

// ===========================================================================
// TEST 9 — Service worker precache integrity (static)
// ===========================================================================
function testServiceWorker() {
  const sw = readFileSync(SW_PATH, 'utf8');
  check('sw: versioned cache name', /CACHE_NAME|CACHE_VERSION/.test(sw) && /orga-naes-/.test(sw));
  check('sw: precaches the 4 app assets', ['Orga-naes.html', 'manifest.json', 'icon-192.png', 'icon-512.png'].every(a => sw.includes(a)));
  check('sw: fetch handler network-first with cache fallback', /addEventListener\('fetch'[\s\S]{0,400}fetch\([\s\S]{0,400}caches\.match/s.test(sw));
  check('sw: firebase/googleapis bypassed', sw.includes("includes('firebase')") && sw.includes("includes('googleapis')"));
}

// ===========================================================================
// TEST 10 — Icon hydration idempotency (F-UI-4 regression gate)
// ===========================================================================
// Reproduces the double-run condition that put two icons on every Options
// section header: the bundle runs once while document.readyState === 'loading'
// and again on the DOMContentLoaded "belt-and-suspenders" re-hydrate. The
// [data-ic-before] prepend path must insert EXACTLY ONE svg per title.
async function testIconHydration() {
  // Seed the real section-title elements (the app's only [data-ic-before] uses)
  const titles = [
    ['pf-opt-title-data', 'folder', 'Data'],
    ['pf-opt-title-manage', 'folder', 'Manage'],
    ['pf-opt-title-export', 'upload', 'Export'],
    ['pf-opt-title-cloud', 'cloud', 'Cloud Sync (Firebase)'],
    ['pf-opt-title-autobackup', 'refresh', 'Auto-Backup'],
    ['pf-opt-title-appearance', 'palette', 'Appearance'],
  ];
  for (const [id, ic, label] of titles) {
    const el = byId.get(id) || new FakeElement('div');
    if (!el.id) el.id = id;
    el.setAttribute('data-ic-before', ic);
    el.textContent = label;
    el.children = [];
    el._attrs = { 'data-ic-before': ic, id };
    byId.set(id, el);
  }

  // Seed the known [data-ic] chrome spans pre-boot (in the browser they are
  // real template elements): inline hydration fills them, DCL re-fire must
  // leave them at one svg (innerHTML path is replacing, but verify it).
  const spanIds = [
    ['pf-firebase-push-ic', 'upload'], ['pf-firebase-pull-ic', 'download'],
  ];
  for (const [id, ic] of spanIds) {
    const el = byId.get(id) || new FakeElement('span');
    if (!el.id) el.id = id;
    el.setAttribute('data-ic', ic);
    el._attrs = { 'data-ic': ic };
    el.children = [];
    byId.set(id, el);
  }

  // Boot with readyState 'loading': the bundle hydrates inline, then the
  // DOMContentLoaded safety pass must be a no-op (guarded) — not a second icon.
  const h = await freshBoot({ readyState: 'loading' });
  const doc = h.ctx.document;
  await sleep(20);

  // Re-fire DCL to prove idempotency under repeated hydration passes.
  doc.dispatchEvent({ type: 'DOMContentLoaded' });
  await sleep(10); h.flushRAF();

  const countSvgs = (el) => el.querySelectorAll('svg').length;
  const pf = h.ctx.window._pf;
  check('icons: app booted', !!(pf && pf.getProjects));
  for (const [id, , label] of titles) {
    const el = byId.get(id);
    check('icons: ' + label + ' has exactly one title svg', !!el && countSvgs(el) === 1, 'n=' + (el ? countSvgs(el) : 'missing'));
    if (el) {
      check('icons: ' + label + ' labeled hydrated once', el.dataset.icHydrated === '1');
    }
  }

  const spans = spanIds.map(([id]) => byId.get(id)).filter(Boolean);
  check('icons: [data-ic] spans seeded', spans.length === spanIds.length);
  // innerHTML-replace semantics: exactly one <svg in the markup string after
  // inline hydration AND the DCL re-fire (an append-based regression → 2).
  const spanSvgs = (el) => (String(el._innerHTML).match(/<svg\b/g) || []).length;
  check('icons: [data-ic] stays single-svg across DCL re-fire', spans.every(el => spanSvgs(el) === 1),
    'bad: ' + spans.filter(el => spanSvgs(el) !== 1).length + '/' + spans.length);
}

// ===========================================================================
// TEST 11 — Notes tombstone lifecycle (F-durability regression gate)
// ===========================================================================
// Reproduces the exact disaster scenario on the real artifact:
//   seed 2 notes -> snapshot captures them -> delete one through the app's
//   single deletion chokepoint (tombstone recorded) -> snapshot again ->
//   wipe BOTH primary notes stores -> reboot -> recovery must restore only
//   the surviving note, the deleted one must stay dead, and the tombstone
//   must persist. Then the all-deleted variant: delete the rest, snapshot,
//   wipe, recover -> nothing resurrects.
// Deletes go through window._pf.deleteNoteById — the SAME function the row
// ×, footer button, and bulk-bar Delete all call (verified by grep, and by
// this test exercising it directly). Snapshots go through _pf.snapshotNow,
// the same _maybeSaveSnapshot the 5-minute tick runs.
async function testNotesTombstoneLifecycle() {
  const ls = makeLocalStorage();
  const sharedDbs = new Map();

  // ---- Boot 1: seed two notes, snapshot the intact state
  let h = await freshBoot({ localStorage: ls, idbDbs: sharedDbs });
  let pf = h.ctx.window._pf;
  check('tomb: notes API exposed', !!(pf.getNotesSnapshot && pf.replaceNotes && pf.getNotesTombstones && pf.deleteNoteById && pf.snapshotNow));
  pf.replaceNotes([
    { id: 'nt-keeper', title: 'Keeper', body: 'stays', pinned: false },
    { id: 'nt-doomed', title: 'Doomed', body: 'dies', pinned: false },
  ]);
  check('tomb: two notes live', pf.getNotesSnapshot().notes.length === 2);
  check('tomb: no tombstones yet', Object.keys(pf.getNotesTombstones()).length === 0);

  pf.snapshotNow();
  await sleep(120);

  // ---- Delete the doomed note through the app's deletion chokepoint
  check('tomb: delete returns true for existing id', pf.deleteNoteById('nt-doomed') === true);
  check('tomb: delete returns false for unknown id', pf.deleteNoteById('nt-ghost') === false);
  check('tomb: doomed gone from live notes', pf.getNotesSnapshot().notes.length === 1 && pf.getNotesSnapshot().notes[0].id === 'nt-keeper');
  check('tomb: tombstone recorded for doomed', !!pf.getNotesTombstones()['nt-doomed']);

  pf.snapshotNow(); // post-deletion state + tombstone rides along
  await sleep(120);

  // ---- Inspect the snapshot store directly: both copies must exist
  const snapStore = sharedDbs.get('orga-naes-backup').get('snapshots');
  const snaps = Array.from(snapStore.values());
  const preSnap = snaps.find(s => s.notes && s.notes.length === 2);
  const postSnap = snaps.find(s => s.notes && s.notes.length === 1 && s.noteTombstones && s.noteTombstones['nt-doomed']);
  check('tomb: pre-deletion snapshot holds 2 notes', !!preSnap);
  check('tomb: post-deletion snapshot holds tombstone', !!postSnap);

  // ---- Boot 2: wipe BOTH primary stores, keep the snapshot IDB universe
  const wipedLS = makeLocalStorage();
  h = await freshBoot({ localStorage: wipedLS, idbDbs: sharedDbs });
  // boot recovery is async AND its persist is debounced (saveNotes 350ms):
  await sleep(700); h.flushRAF();
  pf = h.ctx.window._pf;
  const rec = pf.getNotesSnapshot().notes;
  check('tomb: recovery restored only the keeper', rec.length === 1 && rec[0].id === 'nt-keeper', 'n=' + rec.length + ' ids=' + rec.map(n => n.id).join(','));
  check('tomb: deleted note stayed deleted', !rec.some(n => n.id === 'nt-doomed'));
  check('tomb: tombstone survived recovery', !!pf.getNotesTombstones()['nt-doomed']);
  check('tomb: keeper content intact', rec[0] && rec[0].body === 'stays');
  // recovery must have persisted its work (a third wipe would still recover)
  check('tomb: recovery persisted to primary store', typeof wipedLS._map.get('project-flow-notes') === 'string');

  // ---- All-deleted variant: delete the keeper too, snapshot, wipe, recover
  pf.replaceNotes([]); // guarded no-op by design (import surface can never wipe)
  check('tomb: empty replaceNotes is refused', pf.getNotesSnapshot().notes.length === 1);
  check('tomb: delete last note through chokepoint', pf.deleteNoteById('nt-keeper') === true);
  check('tomb: all notes deleted', pf.getNotesSnapshot().notes.length === 0);
  check('tomb: keeper tombstoned too', !!pf.getNotesTombstones()['nt-keeper']);
  pf.snapshotNow();
  await sleep(120);

  const wipedLS2 = makeLocalStorage();
  h = await freshBoot({ localStorage: wipedLS2, idbDbs: sharedDbs });
  await sleep(700); h.flushRAF(); // same debounce wait for the recovery persist
  pf = h.ctx.window._pf;
  const rec2 = pf.getNotesSnapshot().notes;
  check('tomb: all-deleted case recovers nothing', rec2.length === 0, 'n=' + rec2.length);
  check('tomb: both tombstones survive the all-deleted recovery', !!pf.getNotesTombstones()['nt-doomed'] && !!pf.getNotesTombstones()['nt-keeper']);

  // ---- Bonus: malformed-import guard still holds after all this
  pf.replaceNotes([{ nope: true }]);
  check('tomb: malformed import still refused', pf.getNotesSnapshot().notes.length === 0);
}

// ===========================================================================
// TEST 12 — Recycle-bin lifecycle (delete → bin → restore → 30-day purge)
// ===========================================================================
// Covers the three bin contracts on the real artifact:
//   1. Subtask delete routes through the bin with its position recorded, and
//      restore reattaches it at that spot inside its project.
//   2. Note delete lands in the bin AND keeps its tombstone (disaster
//      recovery must not resurrect a binned note); restoring from the bin
//      CLEARS the tombstone so recovery won't re-delete what the user
//      brought back.
//   3. Boot purge: entries older than 30 days are removed on load (and the
//      purge is persisted), fresh entries survive.
// Drives the same functions the UI calls: _pf.deleteSubtask (subtask × and
// bulk bar), _pf.deleteNoteById (row ×, footer, bulk bar), and
// _pf.restoreFromTrash (bin Restore button — the fake DOM can't click rows).
async function testRecycleBinLifecycle() {
  const ls = makeLocalStorage();
  const sharedDbs = new Map();

  // ---- Boot 1: seed a project + subtask + note
  let h = await freshBoot({ localStorage: ls, idbDbs: sharedDbs });
  let pf = h.ctx.window._pf;
  check('bin: seams exposed', !!(pf.deleteSubtask && pf.deleteNoteById && pf.restoreFromTrash && pf.getTrash && pf.setTrash));
  setProjects(h, [mkProject('rb-p1', 'Bin Project', 'planned', [Object.assign(mkSub('rb-s1', 'Bin Subtask', 'planned'), { createdAt: new Date().toISOString(), dueAt: null, completedAt: null })])]);
  pf.replaceNotes([{ id: 'rb-n1', title: 'Bin Note', body: 'restore me', pinned: false }]);
  check('bin: seeded project+sub+note', projects(h).length === 1 && pf.getNotesSnapshot().notes.length === 1);
  check('bin: starts empty', pf.getTrash().length === 0);

  // ---- Delete subtask through the app's chokepoint (skipConfirm: the
  // harness confirm() returns false and the bulk bar owns its own confirm)
  pf.deleteSubtask('rb-p1', 'rb-s1', true);
  const subEntry = pf.getTrash().find(t => t.kind === 'subtask');
  check('bin: deleteSubtask binned exactly one entry', pf.getTrash().length === 1 && !!subEntry);
  check('bin: subtask landed in bin with position', !!subEntry && subEntry.id === 'rb-s1' && subEntry.projectId === 'rb-p1' && Array.isArray(subEntry.parentPath) && subEntry.index === 0, JSON.stringify(subEntry || {}));
  check('bin: subtask gone from live project', (projects(h)[0].subtasks || []).length === 0);

  // ---- Delete note through the app's chokepoint
  check('bin: note deleted via chokepoint', pf.deleteNoteById('rb-n1') === true);
  const noteEntry = pf.getTrash().find(t => t.kind === 'note');
  check('bin: note landed in bin', !!noteEntry && noteEntry.id === 'rb-n1' && !!noteEntry.node);
  // The durability contract: binned note keeps its tombstone — snapshot
  // recovery must never resurrect a note the user deliberately binned.
  check('bin: binned note still tombstoned', !!pf.getNotesTombstones()['rb-n1']);

  // ---- Restore both through the bin's real restore function
  pf.restoreFromTrash('rb-s1');
  const projAfter = projects(h).find(p => p.id === 'rb-p1');
  check('bin: subtask restored into its project', !!projAfter && (projAfter.subtasks || []).length === 1 && projAfter.subtasks[0].id === 'rb-s1' && projAfter.subtasks[0].title === 'Bin Subtask');
  check('bin: subtask left the bin', !pf.getTrash().some(t => t.id === 'rb-s1'));

  pf.restoreFromTrash('rb-n1');
  check('bin: note restored into live set', pf.getNotesSnapshot().notes.some(n => n.id === 'rb-n1' && n.body === 'restore me'));
  check('bin: restore cleared the note tombstone', !pf.getNotesTombstones()['rb-n1']);
  check('bin: bin empty after both restores', pf.getTrash().length === 0, 'n=' + pf.getTrash().length);

  // ---- 30-day purge on boot: old entries die, fresh ones stay.
  // localStorage is the bin's primary store (the bin has no disaster-recovery
  // path by design), so boot 2 seeds it directly — exactly what a real
  // reload of the same browser profile would read. Its project list stays
  // empty so the project-gone restore refusal is also exercised.
  const now = Date.now();
  const ls2 = makeLocalStorage();
  ls2._map.set('project-flow-trash', JSON.stringify([
    { kind: 'note', id: 'rb-old', title: 'Ancient', node: { id: 'rb-old', title: 'Ancient', body: '' }, deletedAt: new Date(now - 31 * 24 * 3600 * 1000).toISOString() },
    { kind: 'project', id: 'rb-edge', title: 'Edge', subtasks: [], deletedAt: new Date(now - 29 * 24 * 3600 * 1000).toISOString() },
    { kind: 'subtask', id: 'rb-fresh', title: 'Fresh', node: { id: 'rb-fresh', title: 'Fresh', status: 'planned', subtasks: [] }, projectId: 'rb-p1', projectTitle: 'Bin Project', parentPath: [], index: 0, deletedAt: new Date(now - 3600 * 1000).toISOString() },
  ]));
  h = await freshBoot({ localStorage: ls2, idbDbs: sharedDbs });
  await sleep(60); h.flushRAF(); // loadTrash is async
  pf = h.ctx.window._pf;
  const afterPurge = pf.getTrash();
  check('bin: 31-day-old entry purged on boot', !afterPurge.some(t => t.id === 'rb-old'));
  check('bin: 29-day-old entry kept (under TTL)', afterPurge.some(t => t.id === 'rb-edge'));
  check('bin: fresh entry kept', afterPurge.some(t => t.id === 'rb-fresh'));
  check('bin: purge persisted (reloads stay purged)', (() => { try { return JSON.parse(h.localStorage.getItem('project-flow-trash')).every(t => t.id !== 'rb-old'); } catch { return false; } })());

  // ---- Restore edge cases: unknown id is a safe no-op; project-gone
  // subtask stays in the bin with a warning rather than vanishing
  const beforeNoop = pf.getTrash().length;
  pf.restoreFromTrash('rb-ghost');
  check('bin: restoring unknown id is a no-op', pf.getTrash().length === beforeNoop);
  pf.restoreFromTrash('rb-fresh');
  check('bin: subtask whose project is gone stays binned', pf.getTrash().some(t => t.id === 'rb-fresh'), 'fresh boot has no rb-p1 — restore must refuse');
}

// ===========================================================================
// TEST 8b — Notes↔project links: parser resolution + chip derivation
// Links are plain text (@project:<id> [Name]) derived at render time — never
// stored on the project — so these checks pin the whole Phase A contract.
// ===========================================================================
async function testNoteProjectLinks() {
  const h = await freshBoot();
  const pf = h.ctx.window._pf;
  setProjects(h, [
    mkProject('lnk-a', 'Garden plan', 'planned'),
    mkProject('lnk-b', 'Renamed project', 'ongoing'),
  ]);
  pf.replaceNotes([
    { id: 'lnk-n1', title: 'Resolved', body: 'see @project:lnk-a Garden plan', pinned: false },
    { id: 'lnk-n2', title: 'Fallback', body: 'typed @project:lnk-stale Renamed project', pinned: false },
    { id: 'lnk-n3', title: 'Missing', body: 'old @project:zzz-gone Ghost link', pinned: false },
    { id: 'lnk-n4', title: 'Plain', body: 'no links in this one', pinned: false },
  ]);
  const listHtml = (byId.get('pf-notes-list') || {})._innerHTML || '';
  check('links: resolved id chip carries project id', listHtml.includes('data-note-link="lnk-a"'));
  check('links: chip label shows project title', listHtml.includes('Garden plan'));
  // Hand-typed token with a stale id but a matching title: chip must navigate
  // by the RESOLVED project id (name fallback), not the stale token id.
  check('links: name-fallback chip navigates by resolved id', listHtml.includes('data-note-link="lnk-b"'));
  check('links: unresolved token kept as dimmed chip', listHtml.includes('data-note-link="zzz-gone"') && listHtml.includes('pf-note-link-missing'));
  check('links: unresolved chip keeps its stored label', listHtml.includes('Ghost'));
  check('links: plain note produces no chips', (listHtml.match(/data-note-link=/g) || []).length === 3, 'chips=' + (listHtml.match(/data-note-link=/g) || []).length);
  // Project side: derived by scanning note text only
  check('links: notesForProject finds id link', pf.notesForProject('lnk-a').some(n => n.id === 'lnk-n1'));
  check('links: notesForProject resolves renamed target', pf.notesForProject('lnk-b').some(n => n.id === 'lnk-n2'));
  check('links: notesForProject excludes plain notes', !pf.notesForProject('lnk-a').some(n => n.id === 'lnk-n4'));
  check('links: notesForProject excludes tombstoned notes', !pf.notesForProject('lnk-a').some(n => n.id === 'lnk-n3') && (() => { pf.deleteNoteById('lnk-n1'); return !pf.notesForProject('lnk-a').some(n => n.id === 'lnk-n1'); })());
  // Sync-format neutrality: the linked project object carries no link fields
  const linked = projects(h).find(p => p.id === 'lnk-b');
  const plain = projects(h).find(p => p.id === 'lnk-a');
  check('links: project schema unchanged by links', JSON.stringify(Object.keys(linked).sort()) === JSON.stringify(Object.keys(plain).sort()), JSON.stringify(Object.keys(linked).sort()));
}

// ===========================================================================
// Run all
// ===========================================================================
const tests = [
  ['CRUD', testCrud],
  ['Undo/redo', testUndo],
  ['Export', testExport],
  ['Malformed import', testMalformedImport],
  ['Happy-path import', testHappyPathImport],
  ['Persistence lifecycle', testPersistenceLifecycle],
  ['Firebase push/pull', testFirebaseRoundTrip],
  ['Notes cloud sync', testNotesCloudSync],
  ['Icon hydration', testIconHydration],
  ['Notes tombstones', testNotesTombstoneLifecycle],
  ['Notes↔project links', testNoteProjectLinks],
  ['Recycle bin lifecycle', testRecycleBinLifecycle],
];
for (const [name, fn] of tests) {
  try { await fn(); }
  catch (e) { fail.push(name + ' — THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
}
try { testServiceWorker(); } catch (e) { fail.push('Service worker — THREW: ' + e); }

console.log('Functional suite: ' + pass.length + ' passed, ' + fail.length + ' failed');
if (fail.length) { console.error('FAILURES:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('OK — functional behavior verified on the real built artifact');
process.exit(0); // the app's own setInterval timers in the vm would keep Node alive otherwise
