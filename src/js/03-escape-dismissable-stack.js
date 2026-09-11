  // SUBSECTION: Escape Dismissable Stack
  function _returnSearchToToolbar() {
    const toolbar = document.querySelector('.pf-toolbar');
    if (toolbar && searchWrap.parentNode !== toolbar) toolbar.appendChild(searchWrap);
  }
  function _clearSearch() {
    searchInput.value = ''; searchTerm = '';
    searchWrap.classList.remove('pf-has-value', 'pf-search-open');
    if (searchWrap._searchOverlay) { searchWrap._searchOverlay.remove(); searchWrap._searchOverlay = null; }
    _returnSearchToToolbar();
    searchInput.blur();
  }
  function _refreshView() {
    if (listViewActive) { renderSplitList(); renderSplitDetail(); }
    else { autoArrangeProjects(true); }
  }
  // Foreground-first Escape support: a handful of overlay "kinds" (the
  // modal group, the project detail view, and — registered from outside
  // this closure — the sync conflict modal) can all be open at once,
  // stacked on top of each other in whatever order the user opened them.
  // Escape must always close whichever of those is actually on top, not
  // whichever happens to sit first in the fixed _escDismissables list
  // below. _markOverlayOpen() is called at every place one of these kinds
  // opens; handleEscape() then picks, among the tagged entries that are
  // still open, the one with the highest (most recent) stamp.
  //
  // That stamped comparison only decides ordering AMONG the tagged kinds
  // themselves, though — it says nothing about the small transient
  // floating elements below (context menus, dropdowns, the status menu,
  // multi-select bars, the paste-armed hint, the save dialog). Those are
  // rendered on top of literally everything else, including an open modal
  // or the detail view, the instant they appear, so they must always be
  // checked — and closed — before any tagged/stamped entry is even
  // considered, no matter which has the newer stamp. Likewise `search` and
  // the final catch-all are intentionally lower priority than the tagged
  // kinds (matching the original behavior), so they're checked last of all.
  //
  // Hence three tiers, checked in this order:
  //   1. untagged, non-`low` entries — always-topmost transient popovers
  //   2. `key`-tagged entries — stackable overlays, most-recent stamp wins
  //   3. `low`-tagged entries — search, then the closeAllModals() catch-all
  let _overlayCounter = 0;
  const _overlayStamps = {};
  function _markOverlayOpen(key) { _overlayStamps[key] = ++_overlayCounter; }
  const _escDismissables = [
    { check: () => _pasteArmed, run: () => { _pasteArmed = false; root.classList.remove('pf-paste-armed'); showToast('Paste canceled'); } },
    { check: () => !!_saveModalEl, run: () => { if (_saveModalEl) { _saveModalEl.remove(); _saveModalEl = null; } } },
    { check: () => !!_statusMenuEl, run: () => { closeStatusMenu(); } },
    { check: () => !!root.querySelector('.pf-ctx-menu'), run: () => { const m = root.querySelector('.pf-ctx-menu'); if (m) m.remove(); if (typeof _closeCtx === 'function') _closeCtx(); } },
    // Covers the emoji picker (and any other _ctxEl-tracked popover, e.g.
    // context menus opened before .pf-ctx-menu is queryable) — folded in
    // here so this goes through the one escape system instead of the old
    // standalone _ctxEl keydown listener that used to live near _closeCtx.
    { check: () => typeof _ctxEl !== 'undefined' && !!_ctxEl, run: () => { _closeCtx(); } },
    { check: () => !!root.querySelector('.pf-dep-dropdown'), run: () => { const dd = root.querySelector('.pf-dep-dropdown'); if (dd) dd.remove(); } },
    { check: () => _splitCatMultiSelect.length, run: () => { _splitCatMultiSelect = []; renderSplitList(); } },
    { check: () => splitMultiSelect.length, run: () => { splitMultiSelect = []; renderSplitList(); renderSplitDetail(); } },
    { key: 'modals', check: () => todayPanel && todayPanel.style.display !== 'none', run: () => { closeAllModals(); } },
    { key: 'modals', check: () => duelistPanel && duelistPanel.style.display !== 'none', run: () => { closeAllModals(); } },
    { key: 'modals', check: () => calendarPanel && calendarPanel.style.display !== 'none', run: () => { closeAllModals(); } },
    { check: () => _duelistReturnOnEsc, run: () => { _duelistReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderDueList(); openModal(duelistPanel, 'flex'); showToast('Press Esc to exit Tasks by Due Date'); } },
    { check: () => _weeklyReturnOnEsc, run: () => { _weeklyReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderWeeklyPanel(); openModal(weeklyPanel, 'flex'); showToast('Press Esc to exit Weekly Planner'); } },
    { check: () => _todayReturnOnEsc, run: () => { _todayReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderTodayList(); openModal(todayPanel, 'flex'); showToast('Press Esc to exit Today\'s Focus'); } },
    { check: () => _calendarReturnOnEsc, run: () => { _calendarReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderCalendar(); openModal(calendarPanel, 'flex'); showToast('Press Esc to exit Calendar'); } },
    { check: () => subMultiSelect.length, run: () => { clearSubSelect(); root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove()); } },
    { key: 'modals', check: () => ALL_MODALS.some(m => m && m.style.display !== 'none'), run: () => { closeAllModals(); } },
    { key: 'detail', check: () => root.classList.contains('pf-detail-open'), run: () => { _goBackToProjects(); } },
    { low: true, check: () => searchTerm || searchWrap.classList.contains('pf-search-open'), run: () => { _clearSearch(); _refreshView(); } },
    { low: true, check: () => true, run: () => { closeAllModals(); } }
  ];
  function handleEscape() {
    // Tier 1: always-topmost transient popovers, in their original order —
    // these sit visually above everything else the instant they're open,
    // so they must win over a modal/detail view underneath them regardless
    // of stamps.
    for (const d of _escDismissables) {
      if (!d.key && !d.low && d.check()) { d.run(); return; }
    }
    // Tier 2: tagged stackable overlays — the most recently opened one
    // wins, so e.g. a sync conflict modal opened on top of the detail view
    // closes before the detail view does, even though the detail-view
    // check sits earlier in the array above.
    let best = null;
    for (const d of _escDismissables) {
      if (d.key && d.check()) {
        const stamp = _overlayStamps[d.key] || 0;
        if (!best || stamp > best.stamp) best = { entry: d, stamp: stamp };
      }
    }
    if (best) { best.entry.run(); return; }
    // Tier 3: low-priority fallbacks (search, then the generic catch-all),
    // in their original order.
    for (const d of _escDismissables) {
      if (d.low && d.check()) { d.run(); return; }
    }
  }
  // Dev-only self-check: warns if a modal/panel/popover-like element exists
  // that isn't covered by ALL_MODALS (the generic Escape fallback) and isn't
  // one of the known exceptions handled by their own dedicated mechanism.
  // This is exactly the class of bug that let the sync conflict modal and
  // the status-cycle popup go without Escape support until someone noticed
  // by hand — this check exists so the next one doesn't need to be found
  // the same way. Console-only; never shown to end users.
  (function auditEscCoverage() {
    try {
      const KNOWN_EXCEPTIONS = [
        'pf-conflict-modal',   // registered via window._pf.registerEscDismissable (Firebase sync IIFE)
        'pf-search-wrap',      // covered by the searchTerm/pf-search-open check above
        'pf-emoji-picker',     // dynamic; covered by the _ctxEl check in _escDismissables
        'pf-status-menu',      // dynamic; registered via _statusMenuEl check above
        'pf-ctx-menu',         // dynamic; covered by the _ctxEl check + explicit check above
        'pf-dep-dropdown'      // dynamic; explicit check above
      ];
      const modalLikeEls = Array.from(document.querySelectorAll('[id^="pf-"]')).filter(function(el) {
        return /-(modal|panel|popover)$/.test(el.id);
      });
      const uncovered = modalLikeEls.filter(function(el) {
        return !ALL_MODALS.includes(el) && !KNOWN_EXCEPTIONS.includes(el.id);
      });
      if (uncovered.length) {
        console.warn('[Orga-naes] Escape-key audit: element(s) named like a modal/panel/popover aren\'t in ALL_MODALS and aren\'t a known exception — Escape may not close them. Add to ALL_MODALS, call window._pf.registerEscDismissable(), or add to KNOWN_EXCEPTIONS in auditEscCoverage() if handled elsewhere:', uncovered.map(function(el) { return '#' + el.id; }));
      }
    } catch (e) {}
  })();
  function _exitMultiSelectMode() {
    if (_splitCatMultiSelect.length) { _splitCatMultiSelect = []; renderSplitList(); }
    if (splitMultiSelect.length) { splitMultiSelect = []; renderSplitList(); renderSplitDetail(); }
    if (subMultiSelect.length) { clearSubSelect(); root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove()); }
  }

  let panActive = false, panStartX = 0, panStartY = 0, scrollStartX = 0, scrollStartY = 0;
  canvasWrap.addEventListener('pointerdown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
    e.preventDefault();
    panActive = true;
    panStartX = e.clientX; panStartY = e.clientY;
    scrollStartX = canvasWrap.scrollLeft; scrollStartY = canvasWrap.scrollTop;
    canvasWrap.style.cursor = 'grabbing';
    canvasWrap.setPointerCapture(e.pointerId);
  });
  canvasWrap.addEventListener('pointermove', (e) => {
    if (!panActive) return;
    canvasWrap.scrollLeft = scrollStartX - (e.clientX - panStartX);
    canvasWrap.scrollTop = scrollStartY - (e.clientY - panStartY);
  });
  canvasWrap.addEventListener('pointerup', (e) => {
    if (!panActive) return;
    panActive = false;
    canvasWrap.style.cursor = '';
    canvasWrap.releasePointerCapture(e.pointerId);
  });
  canvasWrap.addEventListener('pointercancel', (e) => {
    if (!panActive) return;
    panActive = false;
    canvasWrap.style.cursor = '';
  });

  const toastEl = document.getElementById('pf-toast'); let toastTimer = null;
  function showToast(msg, isError, undoable, actionCallback, actionLabel) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    toastEl.appendChild(span);
    if (undoable && undoStack.length) {
      const btn = document.createElement('button');
      btn.textContent = 'Undo';
      btn.className = 'pf-toast-undo';
      btn.addEventListener('click', () => { undo(); toastEl.classList.remove('pf-toast-show'); });
      toastEl.appendChild(btn);
    } else if (actionCallback) {
      const btn = document.createElement('button');
      btn.textContent = actionLabel || 'Refresh';
      btn.className = 'pf-toast-undo';
      btn.addEventListener('click', () => { actionCallback(); toastEl.classList.remove('pf-toast-show'); });
      toastEl.appendChild(btn);
    }
    toastEl.className = 'pf-toast pf-toast-show' + (isError ? ' pf-toast-error' : '');
    toastTimer = setTimeout(() => { toastEl.classList.remove('pf-toast-show'); }, undoable ? 5000 : (actionCallback ? 8000 : 2600));
  }
  function hasStorage() { try { localStorage.setItem('__test__', '1'); localStorage.removeItem('__test__'); return true; } catch (e) { return false; } }
  let _idbKV = null;
  function openIDB_KV() {
    return new Promise(resolve => {
      if (_idbKV) { resolve(_idbKV); return; }
      try {
        const req = indexedDB.open('orga-naes-kv', 1);
        req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' }); };
        req.onsuccess = (e) => { _idbKV = e.target.result; resolve(_idbKV); };
        req.onerror = (e) => { if (typeof logError === 'function') logError('IndexedDB open (kv)', (e.target && e.target.error) || new Error('Failed to open kv DB')); resolve(null); };
      } catch (e) { if (typeof logError === 'function') logError('IndexedDB open (kv)', e); resolve(null); }
    });
  }
  async function safeGet(key, shared) {
    if (hasStorage()) { try { const v = localStorage.getItem(key); if (v !== null) return { value: v }; } catch (e) {} }
    try { const db = await openIDB_KV(); if (!db) return null; return await new Promise(resolve => { const tx = db.transaction('kv','readonly'); const req = tx.objectStore('kv').get(key); req.onsuccess = () => resolve(req.result ? { value: req.result.value } : null); req.onerror = () => resolve(null); }); } catch (e) { return null; }
  }
  function _checkStorageQuota() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); total += k.length + (localStorage.getItem(k) || '').length; }
      const limitBytes = 5 * 1024 * 1024;
      if (total > limitBytes * 0.9) showToast('⚠ Storage nearly full (' + Math.round(total / 1024) + 'KB / ~5MB). Consider exporting and clearing old data.', true);
    } catch (e) {}
  }
  async function safeSet(key, value, shared) {
    let lsOk = false;
    let lsQuotaErr = false;
    if (hasStorage()) {
      try { localStorage.setItem(key, value); _checkStorageQuota(); lsOk = true; }
      catch (e) { lsQuotaErr = e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014; }
    }
    let idbOk = false;
    try { const db = await openIDB_KV(); if (db) { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put({ key: key, value: value }); idbOk = true; } } catch (e) { if (typeof logError === 'function') logError('IndexedDB write (' + key + ')', e); }
    if (!lsOk && !idbOk) { showToast('⚠ Storage full — data may not persist. Export your data soon.', true); if (typeof logError === 'function') logError('Storage write failed (' + key + ')', new Error('Both localStorage and IndexedDB unavailable')); }
    else if (!lsOk && idbOk) { showToast('⚠ localStorage full — using IndexedDB fallback', true); }
    else if (lsQuotaErr && idbOk) { /* both work, but LS hit quota on this write — silent */ }
    return true;
  }

