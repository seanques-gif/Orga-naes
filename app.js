(function() {
  const STATUSES = ['planned', 'ongoing', 'waiting', 'completed'];
  const STATUS_LABEL = { planned: 'Planned', ongoing: 'Ongoing', waiting: 'Waiting', completed: 'Completed' };
  const STORE_KEY = 'project-flow-graph-v2';

  const canvas = document.getElementById('pf-canvas');
  const canvasWrap = document.getElementById('pf-canvas-wrap');
  const root = document.getElementById('pf-root');

  // Device detection
  (function detectDevice() {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const w = screen.width;
    let device = 'desktop';
    if (hasTouch && w <= 600) device = 'mobile';
    else if (hasTouch && w <= 1400) device = 'tablet';
    root.classList.add('pf-device-' + device);
    window.addEventListener('resize', () => {
      root.classList.remove('pf-device-mobile', 'pf-device-tablet', 'pf-device-desktop');
      const vw = window.innerWidth;
      if (hasTouch && vw <= 600) root.classList.add('pf-device-mobile');
      else if (hasTouch && vw <= 1400) root.classList.add('pf-device-tablet');
      else root.classList.add('pf-device-desktop');
    });
  })();

  const statsEl = document.getElementById('pf-stats');
  const saveEl = document.getElementById('pf-save');
  const emptyEl = document.getElementById('pf-empty');

  let projects = [];
  let categories = [];
  let collapsedCategories = {};
  let saveTimer = null;
  let undoStack = [];
  let redoStack = [];
  const undoBtn = document.getElementById('pf-undo');
  const redoBtn = document.getElementById('pf-redo');

  function updateHistoryButtons() { undoBtn.disabled = undoStack.length === 0; redoBtn.disabled = redoStack.length === 0; }
  function cloneProjects(data) { if (typeof structuredClone === 'function') return structuredClone(data); return JSON.parse(JSON.stringify(data)); }
  function snapshot() { undoStack.push(cloneProjects(projects)); if (undoStack.length > 100) undoStack.shift(); redoStack = []; updateHistoryButtons(); }
  function undo() { if (!undoStack.length) return; redoStack.push(cloneProjects(projects)); if (redoStack.length > 100) redoStack.shift(); projects = undoStack.pop(); _completedCollapseId = null; updateHistoryButtons(); scheduleSave(); render(); if (listViewActive) { renderSplitList(); renderSplitDetail(); } if (window._firebasePushNow) window._firebasePushNow(); showToast('↩ Undo (' + undoStack.length + ' left)'); }
  function redo() { if (!redoStack.length) return; undoStack.push(cloneProjects(projects)); if (undoStack.length > 100) undoStack.shift(); projects = redoStack.pop(); _completedCollapseId = null; updateHistoryButtons(); scheduleSave(); render(); if (listViewActive) { renderSplitList(); renderSplitDetail(); } if (window._firebasePushNow) window._firebasePushNow(); showToast('↪ Redo (' + redoStack.length + ' left)'); }

  let _longPressTimer = null;
  let _longPressTarget = null;
  root.addEventListener('touchstart', (e) => {
    const node = e.target.closest('.pf-node');
    if (!node) return;
    _longPressTarget = node;
    _longPressTimer = setTimeout(() => {
      const touch = e.changedTouches[0];
      const evt = new MouseEvent('contextmenu', { bubbles: true, clientX: touch.clientX, clientY: touch.clientY });
      node.dispatchEvent(evt);
      _longPressTarget = null;
    }, 600);
  }, { passive: true });
  root.addEventListener('touchend', () => { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });
  root.addEventListener('touchmove', () => { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });

  root.addEventListener('paste', (e) => {
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      if (ae.isContentEditable) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const selection = window.getSelection();
        if (selection.rangeCount) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
  });

  let _saveModalEl = null;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      const ae = document.activeElement; if (ae && ae.isContentEditable) return; if (!root.contains(ae) && ae !== document.body) return;
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!root.classList.contains('pf-device-desktop')) return;
      const saveModal = document.createElement('div');
      saveModal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
      saveModal.innerHTML = '<div style="background:var(--card,#2a2a3e);border:1px solid var(--card-border,#3a3a5e);border-radius:12px;padding:24px;min-width:260px;text-align:center;color:var(--text,#fff);">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:16px;">Save</div>' +
        '<button id="_save-local" style="display:block;width:100%;padding:10px;margin-bottom:8px;border:none;border-radius:8px;background:var(--accent,#7b68ee);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">💾 Save to Local (JSON)</button>' +
        '<button id="_save-cloud" style="display:block;width:100%;padding:10px;margin-bottom:8px;border:none;border-radius:8px;background:#4ade80;color:#000;font-size:14px;font-weight:600;cursor:pointer;">☁ Push to Cloud</button>' +
        '<button id="_save-cancel" style="display:block;width:100%;padding:10px;border:none;border-radius:8px;background:transparent;color:var(--text-dim,#aaa);font-size:13px;cursor:pointer;">Cancel</button>' +
        '</div>';
      document.body.appendChild(saveModal);
      _saveModalEl = saveModal;
      const _removeSaveModal = function() { saveModal.remove(); if (_saveModalEl === saveModal) _saveModalEl = null; };
      saveModal.querySelector('#_save-local').addEventListener('click', function() { _removeSaveModal(); document.getElementById('pf-export').click(); });
      saveModal.querySelector('#_save-cloud').addEventListener('click', function() { _removeSaveModal(); if (window._firebasePushManual) window._firebasePushManual(); else showToast('⚠ Sign in first to push', true); });
      saveModal.querySelector('#_save-cancel').addEventListener('click', function() { _removeSaveModal(); });
      saveModal.addEventListener('click', function(ev) { if (ev.target === saveModal) _removeSaveModal(); });
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); const sw = document.getElementById('pf-search-wrap'); const si = document.getElementById('pf-search'); sw.classList.add('pf-search-open'); si.focus(); si.select();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      const ae = document.activeElement; if (ae && ae.isContentEditable) return;
      e.preventDefault(); redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (!subMultiSelect.length && !splitMultiSelect.length) return;
      e.preventDefault();
      const clip = buildClipboardFromSelection();
      if (!clip || !clip.length) return;
      _taskClipboard = clip;
      const n = clip.length;
      clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove();
      splitMultiSelect = []; if (listViewActive) { renderSplitList(); renderSplitDetail(); }
      showToast((n > 1 ? n + ' tasks' : 'Task') + ' copied — click a project to paste as main task(s), or a task to nest under it');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (!_taskClipboard || !_taskClipboard.length) return;
      e.preventDefault();
      _pasteArmed = true;
      root.classList.add('pf-paste-armed');
      showToast('Click a project to paste as main task(s), or a task to nest under it — Esc to cancel');
    }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && root.classList.contains('pf-device-desktop')) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); closeAllModals(); openModal(shortcutsPanel, 'flex');
    }
    if (e.key === 'Escape') { handleEscape(); }
    if (e.key === 'Enter' && selectedProjectId) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); toggleExpand(selectedProjectId);
    }
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); document.getElementById('pf-new-project').click();
    }
    if (e.key === 'N' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (listViewActive && splitSelectedId) { const sel = projects.find(p => p.id === splitSelectedId); addProject(sel ? sel.category : null); }
      else { document.getElementById('pf-new-project').click(); }
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (listViewActive) return;
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      const visible = projects.filter(p => matchesSearch(p) && !(p.category && collapsedCategories[p.category]));
      if (!visible.length) return;
      e.preventDefault();
      const sorted = visible.slice().sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);
      let idx = sorted.findIndex(p => p.id === selectedProjectId);
      if (idx < 0) idx = 0;
      const cur = sorted[idx];
      if (e.key === 'ArrowRight') { idx = (idx + 1) % sorted.length; }
      else if (e.key === 'ArrowLeft') { idx = (idx - 1 + sorted.length) % sorted.length; }
      else if (e.key === 'ArrowDown') {
        const below = sorted.filter(p => p.y > cur.y);
        if (below.length) { below.sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x)); idx = sorted.indexOf(below[0]); }
      } else if (e.key === 'ArrowUp') {
        const above = sorted.filter(p => p.y < cur.y);
        if (above.length) { above.sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x)); idx = sorted.indexOf(above[0]); }
      }
      selectedProjectId = sorted[idx].id;
      renderSelection();
    }
  });

  // --- Escape Dismissable Stack ---
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
  const _escDismissables = [
    { check: () => _pasteArmed, run: () => { _pasteArmed = false; root.classList.remove('pf-paste-armed'); showToast('Paste canceled'); } },
    { check: () => !!_saveModalEl, run: () => { if (_saveModalEl) { _saveModalEl.remove(); _saveModalEl = null; } } },
    { check: () => !!root.querySelector('.pf-ctx-menu'), run: () => { const m = root.querySelector('.pf-ctx-menu'); if (m) m.remove(); if (typeof _closeCtx === 'function') _closeCtx(); } },
    { check: () => !!root.querySelector('.pf-dep-dropdown'), run: () => { const dd = root.querySelector('.pf-dep-dropdown'); if (dd) dd.remove(); } },
    { check: () => _splitCatMultiSelect.length, run: () => { _splitCatMultiSelect = []; renderSplitList(); } },
    { check: () => splitMultiSelect.length, run: () => { splitMultiSelect = []; renderSplitList(); renderSplitDetail(); } },
    { check: () => todayPanel && todayPanel.style.display !== 'none', run: () => { closeAllModals(); } },
    { check: () => duelistPanel && duelistPanel.style.display !== 'none', run: () => { closeAllModals(); } },
    { check: () => calendarPanel && calendarPanel.style.display !== 'none', run: () => { closeAllModals(); } },
    { check: () => _duelistReturnOnEsc, run: () => { _duelistReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderDueList(); openModal(duelistPanel, 'flex'); showToast('Press Esc to exit Tasks by Due Date'); } },
    { check: () => _todayReturnOnEsc, run: () => { _todayReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderTodayList(); openModal(todayPanel, 'flex'); showToast('Press Esc to exit Today\'s Focus'); } },
    { check: () => _calendarReturnOnEsc, run: () => { _calendarReturnOnEsc = false; if (searchTerm) _clearSearch(); _refreshView(); renderCalendar(); openModal(calendarPanel, 'flex'); showToast('Press Esc to exit Calendar'); } },
    { check: () => subMultiSelect.length, run: () => { clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove(); } },
    { check: () => root.classList.contains('pf-detail-open'), run: () => { _goBackToProjects(); } },
    { check: () => searchTerm || searchWrap.classList.contains('pf-search-open'), run: () => { _clearSearch(); _refreshView(); } },
    { check: () => true, run: () => { closeAllModals(); } }
  ];
  function handleEscape() {
    for (const d of _escDismissables) { if (d.check()) { d.run(); return; } }
  }
  function _exitMultiSelectMode() {
    if (_splitCatMultiSelect.length) { _splitCatMultiSelect = []; renderSplitList(); }
    if (splitMultiSelect.length) { splitMultiSelect = []; renderSplitList(); renderSplitDetail(); }
    if (subMultiSelect.length) { clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove(); }
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
  function showToast(msg, isError, undoable) {
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
    }
    toastEl.className = 'pf-toast pf-toast-show' + (isError ? ' pf-toast-error' : '');
    toastTimer = setTimeout(() => { toastEl.classList.remove('pf-toast-show'); }, undoable ? 5000 : 2600);
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
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
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
    if (hasStorage()) { try { localStorage.setItem(key, value); _checkStorageQuota(); lsOk = true; } catch (e) {} }
    try { const db = await openIDB_KV(); if (db) { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put({ key: key, value: value }); } } catch (e) {}
    if (!lsOk) { showToast('⚠ localStorage full — saved to IndexedDB fallback', true); }
    return true;
  }

  // --- IndexedDB Mirror & Auto-Backup ---
  const IDB_NAME = 'orga-naes-backup';
  const IDB_STORE = 'snapshots';
  const AUTO_BACKUP_INTERVAL = 5 * 60 * 1000;
  let _idb = null;

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (_idb) { resolve(_idb); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true }); };
      req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
      req.onerror = () => resolve(null);
    });
  }

  async function idbSaveSnapshot(data) {
    const db = await openIDB();
    if (!db) return;
    const snapshot = { timestamp: new Date().toISOString(), projects: data };
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add(snapshot);
    tx.oncomplete = () => {
      const tx2 = db.transaction(IDB_STORE, 'readwrite');
      const store2 = tx2.objectStore(IDB_STORE);
      const countReq = store2.count();
      countReq.onsuccess = () => {
        if (countReq.result > 50) {
          const cur = store2.openCursor();
          let toDelete = countReq.result - 50;
          cur.onsuccess = (e) => { const c = e.target.result; if (c && toDelete > 0) { c.delete(); toDelete--; c.continue(); } };
        }
      };
    };
  }

  async function idbGetLatest() {
    const db = await openIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor(null, 'prev');
      req.onsuccess = (e) => { const c = e.target.result; resolve(c ? c.value : null); };
      req.onerror = () => resolve(null);
    });
  }

  function triggerFileBackup() {
    if (!projects.length) return;
    const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = 'orga-naes-backup-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Backup saved');
  }

  let _autoBackupTimer = null;
  function startIdbSnapshotBackup() {
    if (_autoBackupTimer) clearInterval(_autoBackupTimer);
    _autoBackupTimer = setInterval(() => {
      if (projects.length) idbSaveSnapshot(JSON.parse(JSON.stringify(projects)));
    }, AUTO_BACKUP_INTERVAL);
    idbSaveSnapshot(JSON.parse(JSON.stringify(projects)));
  }

  async function recoverFromIDB() {
    const snap = await idbGetLatest();
    if (snap && snap.projects && snap.projects.length) {
      projects = snap.projects;
      scheduleSave();
      render();
      showToast('♻️ Recovered from backup (' + new Date(snap.timestamp).toLocaleString() + ')');
      return true;
    }
    return false;
  }

  function uid() { return 'n' + Math.random().toString(36).slice(2, 10); }

  const SIZE_KEY = 'project-flow-size'; const resizeHandle = document.getElementById('pf-resize-handle');
  (function initResize() {
    let resizing = false, startX, startY, startW, startH;
    resizeHandle.addEventListener('pointerdown', (e) => { e.preventDefault(); resizing = true; const rect = root.getBoundingClientRect(); startX = e.clientX; startY = e.clientY; startW = rect.width; startH = rect.height; root.classList.add('pf-resizing'); resizeHandle.setPointerCapture(e.pointerId); });
    resizeHandle.addEventListener('pointermove', (e) => { if (!resizing) return; root.style.width = Math.max(340, startW + (e.clientX - startX)) + 'px'; root.style.height = Math.max(320, startH + (e.clientY - startY)) + 'px'; });
    function endResize() { if (!resizing) return; resizing = false; root.classList.remove('pf-resizing'); safeSet(SIZE_KEY, JSON.stringify({ w: root.offsetWidth, h: root.offsetHeight }), false); renderCategoryZones(); }
    resizeHandle.addEventListener('pointerup', endResize); resizeHandle.addEventListener('pointercancel', endResize);
  })();

  async function loadSize() { root.style.width = '100vw'; root.style.height = '100vh'; }

  const THEME_KEY = 'project-flow-theme'; const themeBtn = document.getElementById('pf-theme-toggle');
  const THEMES = ['dark', 'light', 'eye-care'];
  const THEME_ICONS = { dark: '🌙', light: '☀️', 'eye-care': '👁' };
  function applyTheme(theme) { root.classList.remove('pf-theme-light', 'pf-theme-eye-care'); if (theme === 'light') root.classList.add('pf-theme-light'); else if (theme === 'eye-care') root.classList.add('pf-theme-eye-care'); themeBtn.innerHTML = THEME_ICONS[theme] || THEME_ICONS.dark; themeBtn.title = 'Theme: ' + theme; }
  themeBtn.addEventListener('click', () => { let cur = 'dark'; if (root.classList.contains('pf-theme-light')) cur = 'light'; else if (root.classList.contains('pf-theme-eye-care')) cur = 'eye-care'; const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]; applyTheme(next); safeSet(THEME_KEY, next, false); });
  async function loadTheme() { try { const res = await safeGet(THEME_KEY, false); const t = res && res.value ? res.value : 'dark'; applyTheme(THEMES.includes(t) ? t : 'dark'); } catch (e) { applyTheme('dark'); } }

  const REMINDER_KEY = 'project-flow-reminder-days';
  const CATEGORIES_KEY = 'project-flow-categories';
  const CAT_EMOJI_KEY = 'project-flow-cat-emojis';
  let categoryEmojis = {};
  async function loadCatEmojis() { try { const res = await safeGet(CAT_EMOJI_KEY, false); if (res && res.value) categoryEmojis = JSON.parse(res.value); } catch (e) { categoryEmojis = {}; } }
  function saveCatEmojis() { safeSet(CAT_EMOJI_KEY, JSON.stringify(categoryEmojis), false); }
  const modalBackdrop = document.getElementById('pf-modal-backdrop');
  const duePanel = document.getElementById('pf-due-panel');
  const duePanelClose = document.getElementById('pf-due-panel-close');
  const reminderBtn = document.getElementById('pf-reminder-btn');
  const reminderPopover = document.getElementById('pf-reminder-popover');
  const reminderInput = document.getElementById('pf-reminder-days');
  const categoryBtn = document.getElementById('pf-category-btn');
  const categoryPopover = document.getElementById('pf-category-popover');
  const newProjectPopover = document.getElementById('pf-new-project-popover');
  const newProjectCatList = document.getElementById('pf-new-project-cat-list');
  const categoryListEl = document.getElementById('pf-category-list');
  const categoryAddInput = document.getElementById('pf-category-add-input');

  const optionsPanel = document.getElementById('pf-options-panel');
  const shortcutsPanel = document.getElementById('pf-shortcuts-panel');
  const activityPanel = document.getElementById('pf-activity-panel');
  const todayPanel = document.getElementById('pf-today-panel');
  const calendarPanel = document.getElementById('pf-calendar-panel');
  const weeklyPanel = document.getElementById('pf-weekly-panel');
  const archivePanel = document.getElementById('pf-archive-panel');
  const trashPanel = document.getElementById('pf-trash-panel');
  const commentPanel = document.getElementById('pf-comment-panel');
  const colorModal = document.getElementById('pf-color-modal');
  const duelistPanel = document.getElementById('pf-duelist-panel');
  const snapshotsPanel = document.getElementById('pf-snapshots-panel');
  const copyModal = document.getElementById('pf-copy-modal');
  const ALL_MODALS = [duePanel, reminderPopover, categoryPopover, newProjectPopover, optionsPanel, shortcutsPanel, activityPanel, todayPanel, duelistPanel, calendarPanel, weeklyPanel, archivePanel, trashPanel, commentPanel, colorModal, snapshotsPanel, copyModal];
  function closeAllModals() { ALL_MODALS.forEach(m => { m.style.display = 'none'; }); modalBackdrop.style.display = 'none'; }
  function openModal(el, displayValue) { closeAllModals(); el.style.display = displayValue; modalBackdrop.style.display = 'block'; }
  modalBackdrop.addEventListener('click', closeAllModals);

  ALL_MODALS.forEach(panel => {
    if (!panel || panel.querySelector('.pf-panel-close')) return;
    const btn = document.createElement('button');
    btn.className = 'pf-panel-close';
    btn.title = 'Close';
    btn.innerHTML = '×';
    btn.addEventListener('click', (e) => { e.stopPropagation(); closeAllModals(); });
    panel.style.position = 'relative';
    panel.insertBefore(btn, panel.firstChild);
  });

  function collectDueItems() {
    const items = [];
    function walk(list, projectTitle, projectId) {
      list.forEach(s => {
        if (s.dueAt && s.status !== 'completed') {
          items.push({ id: s.id, projectId: projectId, title: s.title, dueAt: s.dueAt, projectTitle: projectTitle, isProject: false });
        }
        if (s.subtasks && s.subtasks.length) walk(s.subtasks, projectTitle, projectId);
      });
    }
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') {
        items.push({ id: p.id, projectId: p.id, title: p.title, dueAt: p.dueAt, projectTitle: null, isProject: true });
      }
      walk(p.subtasks, p.title, p.id);
    });
    items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return items;
  }

  function renderDuePanel() {
    const tbody = document.getElementById('pf-due-table-body');
    if (!tbody) return;
    const items = collectDueItems();
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="pf-due-empty">No upcoming due dates. Set one from any task\u2019s calendar icon.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(it => {
      const cls = dueStatusClass(it.dueAt, false);
      const rowCls = cls === 'pf-due-overdue' ? 'pf-due-row-overdue' : (cls === 'pf-due-soon' ? 'pf-due-row-soon' : '');
      const path = it.projectTitle ? '<span class="pf-due-path">' + escapeHtml(it.projectTitle) + '</span>' : '';
      return '<tr class="' + rowCls + '"><td>' + escapeHtml(it.title) + path + '</td><td>' + formatDateShort(it.dueAt) + '</td></tr>';
    }).join('');
  }

  if (duePanelClose) duePanelClose.addEventListener('click', closeAllModals);

  reminderBtn.addEventListener('click', () => {
    _exitMultiSelectMode();
    const showing = reminderPopover.style.display !== 'none';
    if (showing) { closeAllModals(); } else { reminderInput.value = reminderDays; openModal(reminderPopover, 'block'); }
  });
  document.getElementById('pf-reminder-cancel').addEventListener('click', closeAllModals);
  document.getElementById('pf-reminder-save').addEventListener('click', () => {
    const val = Math.max(0, Math.min(60, parseInt(reminderInput.value, 10) || 0));
    reminderDays = val;
    closeAllModals();
    safeSet(REMINDER_KEY, String(val), false);
    render();
    showToast('Reminder set to ' + val + ' day(s) before due date.');
  });
  async function loadReminder() {
    try {
      const res = await safeGet(REMINDER_KEY, false);
      reminderDays = res && res.value ? parseInt(res.value, 10) : 2;
    } catch (e) { reminderDays = 2; }
  }

  const CATEGORY_COLORS = ['#7b68ee', '#f0a742', '#3fc27a', '#4fb8d6', '#e0503f', '#d968c9'];
  function categoryColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
  }
  function saveCategories() { safeSet(CATEGORIES_KEY, JSON.stringify(categories), false); }
  async function loadCategories() {
    try { const res = await safeGet(CATEGORIES_KEY, false); categories = res && res.value ? JSON.parse(res.value) : []; }
    catch (e) { categories = []; }
  }
  const COLLAPSED_CAT_KEY = 'project-flow-collapsed-categories';
  function saveCollapsedCategories() { safeSet(COLLAPSED_CAT_KEY, JSON.stringify(collapsedCategories), false); }
  async function loadCollapsedCategories() {
    try { const res = await safeGet(COLLAPSED_CAT_KEY, false); collapsedCategories = res && res.value ? JSON.parse(res.value) : {}; }
    catch (e) { collapsedCategories = {}; }
  }
  function renderCategoryList() {
    if (!categories.length) { categoryListEl.innerHTML = '<div class="pf-category-empty">No categories yet. Add one below.</div>'; return; }
    categoryListEl.innerHTML = categories.map((c, i) =>
      '<div class="pf-category-row" data-cat-idx="' + i + '">' +
      '<button class="pf-category-move" data-cat-up="' + i + '" title="Move up" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;padding:0 2px;"' + (i === 0 ? ' disabled style="opacity:0.3;background:transparent;border:none;font-size:11px;padding:0 2px;"' : '') + '>▲</button>' +
      '<button class="pf-category-move" data-cat-down="' + i + '" title="Move down" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;padding:0 2px;"' + (i === categories.length - 1 ? ' disabled style="opacity:0.3;background:transparent;border:none;font-size:11px;padding:0 2px;"' : '') + '>▼</button>' +
      '<span class="pf-category-swatch" style="background:' + categoryColor(c) + '"></span>' +
      '<span class="pf-category-name">' + escapeHtml(c) + '</span>' +
      '<button class="pf-category-del" data-cat-del="' + escapeHtml(c) + '" title="Delete category">\u00d7</button></div>'
    ).join('');
    categoryListEl.querySelectorAll('[data-cat-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.catDel;
        snapshot();
        categories = categories.filter(c => c !== name);
        projects.forEach(p => { if (p.category === name) p.category = null; });
        saveCategories();
        scheduleSave();
        renderCategoryList();
        render();
      });
    });
    categoryListEl.querySelectorAll('[data-cat-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.catUp);
        if (i === 0) return;
        [categories[i - 1], categories[i]] = [categories[i], categories[i - 1]];
        saveCategories(); renderCategoryList(); render();
      });
    });
    categoryListEl.querySelectorAll('[data-cat-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.catDown);
        if (i >= categories.length - 1) return;
        [categories[i], categories[i + 1]] = [categories[i + 1], categories[i]];
        saveCategories(); renderCategoryList(); render();
      });
    });
  }
  function addCategory() {
    const name = categoryAddInput.value.trim();
    if (!name) return;
    if (categories.includes(name)) { showToast('Category already exists.', true); return; }
    categories.push(name);
    saveCategories();
    categoryAddInput.value = '';
    renderCategoryList();
    render();
  }
  categoryBtn.addEventListener('click', () => {
    _exitMultiSelectMode();
    const showing = categoryPopover.style.display !== 'none';
    if (showing) { closeAllModals(); renderSplitList(); } else { renderCategoryList(); openModal(categoryPopover, 'flex'); }
  });
  document.getElementById('pf-category-add-btn').addEventListener('click', addCategory);
  categoryAddInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } });

  function openNewProjectCategoryPicker() {
    const opts = ['Uncategorized'].concat(categories);
    newProjectCatList.innerHTML = opts.map(name => {
      const dot = name === 'Uncategorized'
        ? '<span class="pf-category-swatch" style="background:transparent;border:1px solid var(--card-border)"></span>'
        : '<span class="pf-category-swatch" style="background:' + categoryColor(name) + '"></span>';
      return '<div class="pf-cat-option" data-new-cat="' + escapeHtml(name) + '" style="cursor:pointer; padding:8px 6px;">' + dot + '<span class="pf-category-name">' + escapeHtml(name) + '</span></div>';
    }).join('');
    newProjectCatList.querySelectorAll('[data-new-cat]').forEach(row => {
      row.addEventListener('click', () => {
        const val = row.dataset.newCat;
        closeAllModals();
        addProject(val === 'Uncategorized' ? null : val);
      });
    });
    openModal(newProjectPopover, 'flex');
  }
  const newProjectCatInput = document.getElementById('pf-new-project-cat-input');
  function addCategoryFromNewProject() {
    const name = newProjectCatInput.value.trim();
    if (!name || categories.includes(name)) { newProjectCatInput.value = ''; return; }
    categories.push(name); saveCategories(); newProjectCatInput.value = '';
    openNewProjectCategoryPicker();
    renderSplitList();
  }
  document.getElementById('pf-new-project-cat-add').addEventListener('click', addCategoryFromNewProject);
  newProjectCatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCategoryFromNewProject(); } });

  let openCatDropdown = null;
  function closeCatDropdown() { if (openCatDropdown) { openCatDropdown.remove(); openCatDropdown = null; } }
  document.addEventListener('click', closeCatDropdown);
  function buildCategoryChip(p) {
    const chip = document.createElement('button');
    chip.className = 'pf-cat-chip';
    chip.type = 'button';
    if (p.category) {
      chip.innerHTML = '<span class="pf-cat-dot" style="background:' + categoryColor(p.category) + '"></span>' + escapeHtml(p.category);
    } else {
      chip.textContent = '+ Category';
    }
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCatDropdown();
      const dd = document.createElement('div');
      dd.className = 'pf-cat-dropdown';
      const rect = chip.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      dd.style.left = (rect.left - rootRect.left) + 'px';
      dd.style.top = (rect.bottom - rootRect.top + 4) + 'px';
      const opts = ['(none)'].concat(categories);
      dd.innerHTML = opts.map(name => {
        const dot = name === '(none)' ? '<span class="pf-cat-dot" style="background:transparent;border:1px solid var(--card-border)"></span>' : '<span class="pf-cat-dot" style="background:' + categoryColor(name) + '"></span>';
        return '<div class="pf-cat-option" data-cat-opt="' + escapeHtml(name) + '">' + dot + escapeHtml(name) + '</div>';
      }).join('');
      root.appendChild(dd);
      openCatDropdown = dd;
      dd.querySelectorAll('[data-cat-opt]').forEach(opt => {
        opt.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const val = opt.dataset.catOpt;
          snapshot();
          p.category = val === '(none)' ? null : val;
          scheduleSave();
          closeCatDropdown();
          render();
        });
      });
    });
    return chip;
  }


  function validateAndRepair(list) {
    let repaired = 0;
    const seenIds = new Set();
    function fixSubtasks(subs, depth) {
      if (!Array.isArray(subs)) return [];
      return subs.filter(Boolean).map(s => {
        if (!s || typeof s !== 'object') { repaired++; return null; }
        if (!s.id || seenIds.has(s.id)) { s.id = uid(); repaired++; }
        seenIds.add(s.id);
        if (!s.title || typeof s.title !== 'string') { s.title = s.title ? String(s.title) : 'Untitled'; repaired++; }
        if (!STATUSES.includes(s.status)) { s.status = 'planned'; repaired++; }
        if (!Array.isArray(s.subtasks)) { s.subtasks = []; }
        if (s.dueAt && isNaN(Date.parse(s.dueAt))) { s.dueAt = null; repaired++; }
        if (s.completedAt && isNaN(Date.parse(s.completedAt))) { s.completedAt = null; repaired++; }
        if (s.createdAt && isNaN(Date.parse(s.createdAt))) { s.createdAt = null; repaired++; }
        s.subtasks = fixSubtasks(s.subtasks, depth + 1).filter(Boolean);
        if (typeof s.expanded === 'undefined') s.expanded = false;
        return s;
      }).filter(Boolean);
    }
    const cleaned = list.filter(Boolean).map(p => {
      if (!p || typeof p !== 'object') { repaired++; return null; }
      if (!p.id || seenIds.has(p.id)) { p.id = uid(); repaired++; }
      seenIds.add(p.id);
      if (!p.title || typeof p.title !== 'string') { p.title = p.title ? String(p.title) : 'Untitled'; repaired++; }
      if (!STATUSES.includes(p.status)) { p.status = 'planned'; repaired++; }
      if (typeof p.x !== 'number') p.x = 0;
      if (typeof p.y !== 'number') p.y = 0;
      if (!Array.isArray(p.subtasks)) { p.subtasks = []; repaired++; }
      if (p.dueAt && isNaN(Date.parse(p.dueAt))) { p.dueAt = null; repaired++; }
      if (p.completedAt && isNaN(Date.parse(p.completedAt))) { p.completedAt = null; repaired++; }
      if (p.createdAt && isNaN(Date.parse(p.createdAt))) { p.createdAt = null; repaired++; }
      if (p.category && typeof p.category !== 'string') { p.category = null; repaired++; }
      p.subtasks = fixSubtasks(p.subtasks, 0);
      if (typeof p.expanded === 'undefined') p.expanded = false;
      // Self-heal projects whose stored status no longer matches their actual subtask completeness
      // (e.g. left stuck as "completed" by an older version of the app after a task was added back in).
      if (p.subtasks.length) {
        const allDone = (function check(list) { return list.every(s => s.status === 'completed' && (!s.subtasks || !s.subtasks.length || check(s.subtasks))); })(p.subtasks);
        if (allDone && p.status !== 'completed') { p.status = 'completed'; if (!p.completedAt) p.completedAt = new Date().toISOString(); delete p._manualStatus; repaired++; }
        else if (!allDone && p.status === 'completed') { p.status = 'ongoing'; p.completedAt = null; delete p._manualStatus; repaired++; }
      }
      return p;
    }).filter(Boolean);
    const allIds = new Set();
    (function collectIds(list) { list.forEach(p => { allIds.add(p.id); if (p.subtasks) (function walk(subs) { subs.forEach(s => { allIds.add(s.id); if (s.subtasks) walk(s.subtasks); }); })(p.subtasks); }); })(cleaned);
    (function cleanDeps(list) { list.forEach(p => { if (p.subtasks) (function walk(subs) { subs.forEach(s => { if (s.blockedBy) { const before = s.blockedBy.length; s.blockedBy = s.blockedBy.filter(id => allIds.has(id)); if (s.blockedBy.length < before) repaired += before - s.blockedBy.length; } if (s.subtasks) walk(s.subtasks); }); })(p.subtasks); }); })(cleaned);
    return { projects: cleaned, repaired };
  }

  async function load() {
    try { const res = await safeGet(STORE_KEY, false); if (res && res.value) projects = JSON.parse(res.value); } catch (e) {
      try { const legacy = await safeGet('project-flow-graph', false); if (legacy && legacy.value) { const flat = JSON.parse(legacy.value); const tops = flat.filter(n => !n.parentId); projects = tops.map(t => ({ id: t.id, title: t.title, status: t.status, x: t.x, y: t.y, expanded: false, subtasks: flat.filter(c => c.parentId === t.id).map(c => ({ id: c.id, title: c.title, status: c.status })) })); } } catch (e2) { projects = []; }
    }
    if (!projects.length) { await recoverFromIDB(); }
    const result = validateAndRepair(projects);
    projects = result.projects;
    if (result.repaired > 0) { scheduleSave(); showToast('🔧 Auto-repaired ' + result.repaired + ' data issue' + (result.repaired > 1 ? 's' : '')); }
    projects.forEach(p => { p.expanded = false; }); render();
    startIdbSnapshotBackup();
    loadToday();
  }

  function scheduleSave() { autoUpdateStatuses(); invalidateSearchCache(); if (!hasStorage()) { saveEl.textContent = '⚠ No storage'; saveEl.className = 'pf-save pf-save-fail'; return; } saveEl.textContent = 'Saving…'; saveEl.className = 'pf-save'; clearTimeout(saveTimer); saveTimer = setTimeout(async () => { const res = await safeSet(STORE_KEY, JSON.stringify(projects), false); if (res) { localStorage.setItem('pf-last-save-time', Date.now().toString()); saveEl.textContent = '✓ Saved'; saveEl.className = 'pf-save pf-save-ok'; setTimeout(() => { if (saveEl.textContent === '✓ Saved') { saveEl.textContent = ''; saveEl.className = 'pf-save'; } }, 1500); if (typeof fsAutoSaveHook === 'function') fsAutoSaveHook(); } else { saveEl.textContent = '✗ Save failed'; saveEl.className = 'pf-save pf-save-fail'; } }, 350); }
  function addProject(category) { snapshot(); const p = { id: uid(), title: 'New project', status: 'planned', x: 0, y: 0, expanded: true, createdAt: new Date().toISOString(), dueAt: null, completedAt: null, category: category || null, subtasks: [] }; projects.push(p); logActivity('Created project "New project"' + (category ? ' in ' + category : '')); scheduleSave(); autoArrangeProjects(true); if (listViewActive) { splitSelectedId = p.id; renderSplitList(); renderSplitDetail(); } focusEl('[data-title-id="' + p.id + '"]'); }
  const ARCHIVE_KEY = 'project-flow-archive';
  let archive = [];
  async function loadArchive() { try { const res = await safeGet(ARCHIVE_KEY, false); if (res && res.value) archive = JSON.parse(res.value); } catch (e) { archive = []; } }
  function saveArchive() { safeSet(ARCHIVE_KEY, JSON.stringify(archive), false); }
  function archiveProject(p) { archive = archive.filter(a => a.id !== p.id); archive.push({ ...JSON.parse(JSON.stringify(p)), archivedAt: new Date().toISOString() }); saveArchive(); }
  function restoreFromArchive(id) { const idx = archive.findIndex(a => a.id === id); if (idx < 0) return; const item = archive.splice(idx, 1)[0]; delete item.archivedAt; projects.push(item); saveArchive(); scheduleSave(); render(); renderArchiveList(); showToast('"' + item.title + '" restored'); }
  function renderArchiveList() {
    const list = document.getElementById('pf-archive-list');
    document.getElementById('pf-archive-count').textContent = archive.length ? '(' + archive.length + ')' : '';
    if (!archive.length) { list.innerHTML = '<div class="pf-activity-empty">Archive is empty.</div>'; return; }
    list.innerHTML = archive.map(a => {
      const date = a.archivedAt ? formatDateShort(a.archivedAt.slice(0, 10)) : '';
      return '<div class="pf-activity-item" style="display:flex;align-items:center;gap:8px;">' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(a.title) + '</span>' +
        '<span style="font-size:10px;color:var(--text-dim);flex-shrink:0;">' + date + '</span>' +
        '<button class="pf-undo-btn" data-archive-restore="' + a.id + '" style="font-size:10px;padding:2px 8px;">Restore</button>' +
        '<button class="pf-undo-btn" data-archive-del="' + a.id + '" style="font-size:10px;padding:2px 8px;color:var(--danger);">Delete</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-archive-restore]').forEach(btn => { btn.addEventListener('click', () => restoreFromArchive(btn.dataset.archiveRestore)); });
    list.querySelectorAll('[data-archive-del]').forEach(btn => { btn.addEventListener('click', () => { if (!confirm('Permanently delete this item from archive?')) return; archive = archive.filter(a => a.id !== btn.dataset.archiveDel); saveArchive(); renderArchiveList(); }); });
  }

  const TRASH_KEY = 'project-flow-trash';
  let trash = [];
  async function loadTrash() { try { const res = await safeGet(TRASH_KEY, false); if (res && res.value) trash = JSON.parse(res.value); } catch (e) { trash = []; } purgeOldTrash(); }
  function saveTrash() { safeSet(TRASH_KEY, JSON.stringify(trash), false); }
  function purgeOldTrash() { const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; const before = trash.length; trash = trash.filter(t => new Date(t.deletedAt).getTime() > cutoff); const purged = before - trash.length; if (purged > 0) { saveTrash(); showToast('🗑 ' + purged + ' item' + (purged > 1 ? 's' : '') + ' auto-removed from trash (older than 30 days)'); } }
  function trashProject(p) { trash.push({ ...JSON.parse(JSON.stringify(p)), deletedAt: new Date().toISOString() }); saveTrash(); }
  function restoreFromTrash(id) { const idx = trash.findIndex(t => t.id === id); if (idx < 0) return; const item = trash.splice(idx, 1)[0]; delete item.deletedAt; projects.push(item); saveTrash(); scheduleSave(); render(); renderTrashList(); showToast('"' + item.title + '" restored'); }
  function permanentDeleteFromTrash(id) { trash = trash.filter(t => t.id !== id); saveTrash(); renderTrashList(); }
  let _trashedItems = null; let _trashUndoTimer = null;
  function emptyTrash() {
    if (!confirm('Permanently delete all ' + trash.length + ' item(s) in trash?')) return;
    _trashedItems = [...trash]; trash = []; saveTrash(); renderTrashList();
    showToast('🗑 Trash emptied — <a href="#" id="pf-trash-undo-link" style="color:var(--accent);text-decoration:underline;">Undo (10s)</a>');
    if (_trashUndoTimer) clearTimeout(_trashUndoTimer);
    _trashUndoTimer = setTimeout(() => { _trashedItems = null; }, 10000);
    setTimeout(() => {
      const link = document.getElementById('pf-trash-undo-link');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); if (_trashedItems) { trash = _trashedItems; _trashedItems = null; saveTrash(); renderTrashList(); showToast('✓ Trash restored'); } });
    }, 50);
  }
  function renderTrashList() {
    const list = document.getElementById('pf-trash-list');
    document.getElementById('pf-trash-count').textContent = trash.length ? '(' + trash.length + ')' : '';
    if (!trash.length) { list.innerHTML = '<div class="pf-activity-empty">Trash is empty.</div>'; return; }
    list.innerHTML = trash.map(t => {
      const days = Math.floor((Date.now() - new Date(t.deletedAt).getTime()) / (24*60*60*1000));
      const remaining = 30 - days;
      return '<div class="pf-activity-item" style="display:flex;align-items:center;gap:8px;">' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(t.title) + '</span>' +
        '<span style="font-size:9px;color:var(--text-dim);flex-shrink:0;">' + remaining + 'd left</span>' +
        '<button class="pf-undo-btn" style="font-size:10px;padding:2px 6px;" data-trash-restore="' + t.id + '">Restore</button>' +
        '<button class="pf-undo-btn" style="font-size:10px;padding:2px 6px;color:var(--danger);" data-trash-del="' + t.id + '">×</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-trash-restore]').forEach(btn => { btn.addEventListener('click', () => restoreFromTrash(btn.dataset.trashRestore)); });
    list.querySelectorAll('[data-trash-del]').forEach(btn => { btn.addEventListener('click', () => { if (confirm('Permanently delete?')) permanentDeleteFromTrash(btn.dataset.trashDel); }); });
  }
  function deleteProject(id) { const p = projects.find(p => p.id === id); if (!p) return; if (!confirm('Delete project "' + p.title + '"?')) return; snapshot(); logActivity('Trashed project "' + p.title + '"'); trashProject(p); projects = projects.filter(p => p.id !== id); if (splitSelectedId === id) splitSelectedId = null; scheduleSave(); render(); showToast('\"' + p.title + '\" moved to trash'); }
  function toggleExpand(id) { const p = projects.find(p => p.id === id); p.expanded = !p.expanded; render(); autoArrangeProjects(); }
  function animateProgressRing(projectId, isComplete) {
    setTimeout(() => {
      const item = document.querySelector('[data-id="' + projectId + '"] .pf-progress-ring') || document.querySelector('[data-project-id="' + projectId + '"] .pf-progress-ring');
      if (!item) return;
      item.classList.remove('pf-ring-pulse', 'pf-ring-complete');
      void item.offsetWidth;
      item.classList.add(isComplete ? 'pf-ring-complete' : 'pf-ring-pulse');
      setTimeout(() => item.classList.remove('pf-ring-pulse', 'pf-ring-complete'), 900);
    }, 50);
  }
  function _flashStatusTransition(selector) { requestAnimationFrame(() => { const el = document.querySelector(selector); if (el) { el.classList.remove('pf-status-transitioning'); void el.offsetWidth; el.classList.add('pf-status-transitioning'); el.addEventListener('animationend', () => el.classList.remove('pf-status-transitioning'), { once: true }); } }); }
  function cycleProjectStatus(id, targetStatus) { snapshot(); const p = projects.find(p => p.id === id); const oldStatus = p.status; p.status = targetStatus || STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length]; if (p.status === oldStatus) return; if (navigator.vibrate) navigator.vibrate(10); p._manualStatus = true; p.completedAt = p.status === 'completed' ? new Date().toISOString() : null; logActivity('"' + p.title + '" status: ' + STATUS_LABEL[oldStatus] + ' → ' + STATUS_LABEL[p.status]); scheduleSave(); render(); _flashStatusTransition('[data-id="' + id + '"]'); if (p.status === 'completed') { if (p.subtasks && p.subtasks.length) confetti(); onTaskCompleted(true); setTimeout(() => { if (handleRecurrence(p)) { scheduleSave(); render(); showToast('🔁 "' + p.title + '" reset for next cycle'); } }, 1200); } }
  let _statusMenuEl = null;
  function closeStatusMenu() { if (_statusMenuEl) { _statusMenuEl.remove(); _statusMenuEl = null; document.removeEventListener('click', closeStatusMenu, true); document.removeEventListener('scroll', closeStatusMenu, true); window.removeEventListener('resize', closeStatusMenu); } }
  let _statusMenuToken = 0;
  function openStatusMenu(anchorEl, currentStatus, onPick) {
    closeStatusMenu();
    const myToken = ++_statusMenuToken;
    const rect = anchorEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'pf-status-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:var(--card);border:1px solid var(--card-border);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.35);padding:4px;min-width:140px;font-size:12px;';
    STATUSES.forEach(function(st) {
      const item = document.createElement('div');
      item.textContent = STATUS_LABEL[st];
      const isCurrent = st === currentStatus;
      item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;color:var(--text);' + (isCurrent ? 'background:color-mix(in srgb, var(--accent) 18%, transparent);font-weight:700;' : '');
      const dot = document.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + statusDotColor(st) + ';border:1.5px solid ' + statusDotColor(st) + ';';
      item.prepend(dot);
      item.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); const stillCurrent = myToken === _statusMenuToken; closeStatusMenu(); if (!isCurrent && stillCurrent) onPick(st); });
      item.addEventListener('mouseenter', function() { if (!isCurrent) item.style.background = 'var(--card-hover)'; });
      item.addEventListener('mouseleave', function() { if (!isCurrent) item.style.background = ''; });
      menu.appendChild(item);
    });
    document.getElementById('pf-root').appendChild(menu);
    _statusMenuEl = menu;
    const mRect = menu.getBoundingClientRect();
    let top = rect.bottom + 4, left = rect.left;
    if (left + mRect.width > window.innerWidth - 8) left = window.innerWidth - mRect.width - 8;
    if (top + mRect.height > window.innerHeight - 8) top = rect.top - mRect.height - 4;
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.left = Math.max(8, left) + 'px';
    setTimeout(function() {
      document.addEventListener('click', closeStatusMenu, true);
      document.addEventListener('scroll', closeStatusMenu, true);
      window.addEventListener('resize', closeStatusMenu);
    }, 0);
  }
  function checkAllCompleted(p) {
    if (!p.subtasks || !p.subtasks.length) return;
    // Auto-complete parent subtasks when all their children are done
    (function autoCompleteParents(list) {
      list.forEach(s => {
        if (s.subtasks && s.subtasks.length) {
          autoCompleteParents(s.subtasks);
          const childrenDone = s.subtasks.every(c => c.status === 'completed');
          if (childrenDone && s.status !== 'completed') {
            s.status = 'completed'; s.completedAt = new Date().toISOString();
            logActivity('"' + s.title + '" auto-completed (all subtasks done)');
          }
        }
      });
    })(p.subtasks);
    // Auto-complete project when all top-level subtasks are done
    const allDone = (function check(list) { return list.every(s => s.status === 'completed' && (!s.subtasks || !s.subtasks.length || check(s.subtasks))); })(p.subtasks);
    if (allDone) {
      if (p.status !== 'completed') { p.status = 'completed'; p.completedAt = new Date().toISOString(); delete p._manualStatus; logActivity('"' + p.title + '" auto-completed (all subtasks done)'); scheduleSave(); render(); onTaskCompleted(true); }
      confetti();
    } else if (p.status === 'completed' && !p._manualStatus) {
      // A previously-completed project with at least one incomplete subtask is back in progress.
      p.status = 'ongoing';
      p.completedAt = null;
      logActivity('"' + p.title + '" reverted to ' + STATUS_LABEL[p.status] + ' (no longer all subtasks complete)');
      scheduleSave(); render();
    } else if (p.status === 'planned') {
      // Auto-set project to ongoing if any subtask has progress
      const hasProgress = (function check(list) {
        return list.some(s => s.status === 'ongoing' || s.status === 'waiting' || s.dueAt || (s.subtasks && s.subtasks.length && check(s.subtasks)));
      })(p.subtasks);
      if (hasProgress) { p.status = 'ongoing'; logActivity('"' + p.title + '" auto-set to ongoing'); scheduleSave(); render(); }
    }
  }
  function confetti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#9580ff','#f5b84d','#4dd88a','#ff7b6b','#5cc8e8','#a78bfa','#fff'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: -20 - Math.random() * 80,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
      vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4,
      rot: Math.random() * 360, vr: (Math.random() - 0.5) * 12,
      color: colors[Math.floor(Math.random() * colors.length)], opacity: 1
    }));
    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.vr;
        if (frame > 60) p.opacity -= 0.015;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 120) requestAnimationFrame(draw);
      else canvas.remove();
    }
    requestAnimationFrame(draw);
  }

  function findSubNode(list, id) { for (const item of list) { if (item.id === id) return item; if (item.subtasks && item.subtasks.length) { const found = findSubNode(item.subtasks, id); if (found) return found; } } return null; }
  function findSubParentArray(list, id) { for (const item of list) { if (item.id === id) return list; if (item.subtasks && item.subtasks.length) { const found = findSubParentArray(item.subtasks, id); if (found) return found; } } return null; }
  function deepCloneSubtree(node) { const clone = { id: uid(), title: node.title, status: node.status || 'planned', expanded: false, createdAt: new Date().toISOString(), dueAt: node.dueAt || null, completedAt: node.completedAt || null, recurrence: node.recurrence || null, subtasks: (node.subtasks || []).map(deepCloneSubtree) }; return clone; }
  function copySubtasksToProject(sourceProject, subtaskIds, targetProjectId) {
    const targetProject = projects.find(pr => pr.id === targetProjectId);
    if (!targetProject) return;
    let nodes = subtaskIds.map(id => findSubNode(sourceProject.subtasks, id)).filter(Boolean);
    // Drop any selected node whose ancestor is also selected — the ancestor's copy already includes it.
    const idSet = new Set(subtaskIds);
    nodes = nodes.filter(n => !nodes.some(other => other !== n && idSet.has(other.id) && isDescendant(other, n.id)));
    if (!nodes.length) return;
    snapshot();
    const clones = nodes.map(deepCloneSubtree);
    if (!targetProject.subtasks) targetProject.subtasks = [];
    clones.forEach(c => targetProject.subtasks.push(c));
    targetProject.expanded = true;
    if (targetProject._manualStatus) { delete targetProject._manualStatus; }
    checkAllCompleted(targetProject);
    logActivity('Copied ' + nodes.length + ' task(s) from "' + sourceProject.title + '" to "' + targetProject.title + '"');
    scheduleSave(); autoArrangeProjects(true); render();
    showToast((nodes.length > 1 ? nodes.length + ' tasks' : '"' + nodes[0].title + '"') + ' copied to "' + targetProject.title + '"', false, true);
  }
  function countTree(list) { let done = 0, total = 0; list.forEach(s => { total++; if (s.status === 'completed') done++; if (s.subtasks && s.subtasks.length) { const c = countTree(s.subtasks); done += c.done; total += c.total; } }); return { done, total }; }

  function addSubtask(projectId, parentSubId) { snapshot(); const p = projects.find(p => p.id === projectId); let targetArr; if (!parentSubId) { p.expanded = true; targetArr = p.subtasks; } else { const parentNode = findSubNode(p.subtasks, parentSubId); parentNode.expanded = true; if (!parentNode.subtasks) parentNode.subtasks = []; targetArr = parentNode.subtasks; } const s = { id: uid(), title: 'New subtask', status: 'planned', expanded: false, subtasks: [], createdAt: new Date().toISOString(), dueAt: null, completedAt: null }; targetArr.push(s); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); scheduleSave(); autoArrangeProjects(true); focusEl('[data-sub-title-id="' + s.id + '"]'); }
  function toggleSubExpand(projectId, subId) { const p = projects.find(p => p.id === projectId); const s = findSubNode(p.subtasks, subId); s.expanded = !s.expanded; render(); autoArrangeProjects(); }
  function cycleSubStatus(projectId, subId, targetStatus) { snapshot(); const p = projects.find(p => p.id === projectId); const s = findSubNode(p.subtasks, subId); if (s.status !== 'completed' && (targetStatus || 'completed') === 'completed' && getUnresolvedBlockers(p, s).length > 0) { showToast('🚫 Blocked — complete dependencies first', true); return; } const oldStatus = s.status; s.status = targetStatus || STATUSES[(STATUSES.indexOf(s.status) + 1) % STATUSES.length]; if (s.status === oldStatus) return; if (navigator.vibrate) navigator.vibrate(10); s.completedAt = s.status === 'completed' ? new Date().toISOString() : null; logActivity('"' + s.title + '" in "' + p.title + '": ' + STATUS_LABEL[oldStatus] + ' → ' + STATUS_LABEL[s.status]); scheduleSave(); render(); _flashStatusTransition('[data-sub-id="' + subId + '"]'); animateProgressRing(projectId, s.status === 'completed'); if (s.status === 'completed') { onTaskCompleted(false); setTimeout(() => { if (handleRecurrence(s)) { scheduleSave(); render(); showToast('🔁 "' + s.title + '" reset for next cycle'); } }, 1200); } if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); }
  function deleteSubtask(projectId, subId) { const p = projects.find(p => p.id === projectId); const s = findSubNode(p.subtasks, subId); if (!confirm('Delete subtask "' + (s ? s.title : '') + '"?')) return; snapshot(); const arr = findSubParentArray(p.subtasks, subId); if (arr) { const idx = arr.findIndex(s => s.id === subId); if (idx > -1) arr.splice(idx, 1); } (function cleanBlockedBy(list) { list.forEach(t => { if (t.blockedBy) t.blockedBy = t.blockedBy.filter(bid => bid !== subId); if (t.subtasks && t.subtasks.length) cleanBlockedBy(t.subtasks); }); })(p.subtasks); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); scheduleSave(); render(); }
  function promoteSubToProject(parentProject, sub) {
    snapshot();
    const newProj = { id: uid(), title: sub.title, status: sub.status || 'planned', x: 0, y: 0, expanded: true, createdAt: new Date().toISOString(), dueAt: sub.dueAt || null, completedAt: sub.completedAt || null, category: parentProject.category || null, subtasks: sub.subtasks ? JSON.parse(JSON.stringify(sub.subtasks)) : [] };
    projects.push(newProj);
    const arr = findSubParentArray(parentProject.subtasks, sub.id);
    if (arr) { const idx = arr.findIndex(s => s.id === sub.id); if (idx > -1) arr.splice(idx, 1); }
    if (parentProject._manualStatus) { delete parentProject._manualStatus; }
    checkAllCompleted(parentProject);
    logActivity('Promoted "' + sub.title + '" to project from "' + parentProject.title + '"');
    scheduleSave(); render();
    if (listViewActive) { splitSelectedId = newProj.id; renderSplitList(); renderSplitDetail(); }
    showToast('"' + sub.title + '" promoted to project', false, true);
  }

  function openCopyToProjectModal(sourceProject, subtaskIds) {
    const list = document.getElementById('pf-copy-modal-list');
    const title = document.getElementById('pf-copy-modal-title');
    title.textContent = 'Copy ' + (subtaskIds.length > 1 ? subtaskIds.length + ' Tasks' : 'Task') + ' to Project';
    list.innerHTML = '';
    const others = projects.filter(pr => pr.id !== sourceProject.id);
    if (!others.length) {
      list.innerHTML = '<div class="pf-activity-empty">No other projects to copy to.</div>';
    } else {
      others.forEach(pr => {
        const treeCount = countTree(pr.subtasks || []);
        const countLabel = treeCount.total ? (treeCount.done + '/' + treeCount.total + ' done') : 'No subtasks yet';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;border:1px solid var(--card-border);margin-bottom:4px;background:var(--card);cursor:pointer;transition:border-color 0.15s,transform 0.1s;';
        row.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--' + pr.status + ');flex-shrink:0;"></span>' +
          '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(pr.title) + '</span>' +
          '<span style="color:var(--text-dim);font-size:10px;flex-shrink:0;">' + countLabel + '</span>';
        row.addEventListener('mouseenter', () => { row.style.borderColor = 'var(--hover-border)'; });
        row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--card-border)'; });
        row.addEventListener('click', () => { closeAllModals(); copySubtasksToProject(sourceProject, subtaskIds, pr.id); clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove(); });
        list.appendChild(row);
      });
    }
    openModal(copyModal, 'flex');
  }

  function focusEl(selector) { requestAnimationFrame(() => { let el = canvas.querySelector(selector) || root.querySelector(selector); if (el) { el.contentEditable = 'true'; el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } }); }
  function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function highlightMatch(escaped, term) { if (!term) return escaped; const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'); return escaped.replace(re, '<mark style="background:var(--accent);color:#fff;border-radius:2px;padding:0 2px;">$1</mark>'); }
  function formatTime(sec) { const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60); if (d > 0) return d + 'd ' + h + 'h ' + m + 'm'; if (h > 0) return h + 'h ' + m + 'm'; return m + 'm'; }
  function toggleTimer(p, s) { snapshot(); if (s.timerStart) { s.timeLogged = (s.timeLogged || 0) + Math.floor((Date.now() - s.timerStart) / 1000); s.timerStart = null; } else { s.timerStart = Date.now(); } scheduleSave(); render(); }

  const LEVEL_MARKERS = ['\u25CF', '\u25C6', '\u25B6', '\u25B8']; const LEVEL_COLORS = ['var(--depth0)', 'var(--depth1)', 'var(--depth2)', 'var(--depth3)'];
  function levelMarkerFor(depth) { return { marker: LEVEL_MARKERS[Math.min(depth, LEVEL_MARKERS.length - 1)], color: LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)] }; }
  function statusDotColor(status) { return status === 'planned' ? 'var(--planned)' : status === 'ongoing' ? 'var(--ongoing)' : status === 'waiting' ? 'var(--waiting)' : 'var(--completed)'; }
  function formatDateShort(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return null; const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); const yy = String(d.getFullYear()).slice(-2); return mm + '/' + dd + '/' + yy; }
  function formatDateTime(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  let reminderDays = 2;
  function dueStatusClass(iso, isCompleted) { if (!iso || isCompleted) return ''; const today = new Date(); today.setHours(0, 0, 0, 0); const d = new Date(iso + 'T00:00:00'); const diffDays = Math.round((d - today) / 86400000); if (diffDays < 0) return 'pf-due-overdue'; if (diffDays <= reminderDays) return 'pf-due-soon'; return ''; }

  function buildDueChip(node, onCommit, iconOnly) {
    const wrap = document.createElement('span'); wrap.className = 'pf-due-wrap';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pf-due-chip' + (iconOnly ? ' pf-due-icon-only' : '');
    const input = document.createElement('input'); input.type = 'date'; input.className = 'pf-due-input'; input.value = node.dueAt || ''; input.style.display = 'none';
    function refreshBtn() { const label = formatDateShort(node.dueAt); if (iconOnly) { btn.textContent = label || '…'; btn.title = label ? ('Due ' + label) : 'Set due date'; } else { btn.textContent = label ? label : '+ Due'; } btn.className = 'pf-due-chip' + (iconOnly ? ' pf-due-icon-only' : '') + (label ? ' pf-due-set' : '') + ' ' + dueStatusClass(node.dueAt, node.status === 'completed'); }
    refreshBtn();
    btn.addEventListener('click', (e) => { e.stopPropagation(); btn.style.display = 'none'; input.style.display = 'inline-block'; input.focus(); try { input.showPicker && input.showPicker(); } catch (err) {} });
    input.addEventListener('pointerdown', (e) => e.stopPropagation()); input.addEventListener('click', (e) => e.stopPropagation()); input.addEventListener('keydown', (e) => e.stopPropagation());
    function commit() { const val = input.value || null; input.style.display = 'none'; btn.style.display = 'inline-flex'; if (val !== node.dueAt) { onCommit(val); } else { refreshBtn(); } }
    input.addEventListener('change', commit); input.addEventListener('blur', commit);
    wrap.appendChild(btn); wrap.appendChild(input); return wrap;
  }

  const RECUR_OPTIONS = [
    { value: null, label: 'None' },
    { value: 'daily', label: '🔁 Daily' },
    { value: 'weekly', label: '🔁 Weekly' },
    { value: 'biweekly', label: '🔁 Every 2 weeks' },
    { value: 'monthly', label: '🔁 Monthly' }
  ];

  function buildRecurChip(node, onCommit) {
    const btn = document.createElement('button');
    btn.type = 'button';
    function refresh() {
      const cur = RECUR_OPTIONS.find(o => o.value === node.recurrence);
      btn.textContent = cur && cur.value ? cur.label : '🔁';
      btn.className = 'pf-recur-chip' + (node.recurrence ? ' pf-recur-set' : '');
      btn.title = node.recurrence ? ('Repeats: ' + (cur ? cur.label.replace('🔁 ', '') : node.recurrence)) : 'Set repeat';
    }
    refresh();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = root.querySelector('.pf-recur-dropdown');
      if (existing) { existing.remove(); return; }
      const dd = document.createElement('div');
      dd.className = 'pf-recur-dropdown';
      const rect = btn.getBoundingClientRect();
      dd.style.position = 'fixed';
      dd.style.left = rect.left + 'px';
      dd.style.top = (rect.bottom + 4) + 'px';
      RECUR_OPTIONS.forEach(opt => {
        const b = document.createElement('button');
        b.textContent = opt.label;
        if (node.recurrence === opt.value) b.className = 'pf-recur-active';
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          dd.remove();
          if (node.recurrence !== opt.value) { onCommit(opt.value); }
        });
        dd.appendChild(b);
      });
      root.appendChild(dd);
      const closeDD = (ev) => { if (!dd.contains(ev.target) && ev.target !== btn) { dd.remove(); document.removeEventListener('pointerdown', closeDD); } };
      setTimeout(() => document.addEventListener('pointerdown', closeDD), 0);
    });
    return btn;
  }

  function advanceDueDate(iso, interval) {
    const d = iso ? new Date(iso + 'T00:00:00') : new Date();
    if (isNaN(d)) return new Date().toISOString().slice(0, 10);
    switch (interval) {
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekdays':
        d.setDate(d.getDate() + 1);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        break;
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'biweekly': d.setDate(d.getDate() + 14); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
      case 'quarterly': d.setMonth(d.getMonth() + 3); break;
      case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    }
    return d.toISOString().slice(0, 10);
  }

  function handleRecurrence(node) {
    if (!node.recurrence) return false;
    node.status = 'planned';
    node.completedAt = null;
    node.dueAt = advanceDueDate(node.dueAt, node.recurrence);
    if (node.subtasks && node.subtasks.length) {
      (function resetSubs(list) { list.forEach(s => { s.status = 'planned'; s.completedAt = null; if (s.subtasks) resetSubs(s.subtasks); }); })(node.subtasks);
    }
    logActivity('🔁 "' + node.title + '" recurring → next due ' + formatDateShort(node.dueAt));
    return true;
  }

  // --- Task Dependencies ---
  function getAllSubtasksFlat(subtasks) {
    const result = [];
    (function walk(list) { list.forEach(s => { result.push(s); if (s.subtasks && s.subtasks.length) walk(s.subtasks); }); })(subtasks);
    return result;
  }
  function getUnresolvedBlockers(project, subtask) {
    if (!subtask.blockedBy || !subtask.blockedBy.length) return [];
    const allSubs = getAllSubtasksFlat(project.subtasks);
    return subtask.blockedBy.map(id => allSubs.find(s => s.id === id)).filter(s => s && s.status !== 'completed');
  }
  function buildDependencyChip(project, subtask) {
    const btn = document.createElement('button');
    btn.type = 'button';
    function refresh() {
      if (!subtask.blockedBy) subtask.blockedBy = [];
      const count = subtask.blockedBy.length;
      const unresolved = getUnresolvedBlockers(project, subtask);
      btn.textContent = '🔗' + (count ? ' ' + count : '');
      btn.className = 'pf-dep-chip' + (unresolved.length ? ' pf-dep-blocked' : (count ? ' pf-dep-set' : ''));
      btn.title = unresolved.length ? ('Blocked by ' + unresolved.length + ' task(s)') : (count ? (count + ' dependency/ies') : 'Add dependency');
    }
    refresh();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = root.querySelector('.pf-dep-dropdown');
      if (existing) { existing.remove(); return; }
      const dd = document.createElement('div');
      dd.className = 'pf-dep-dropdown';
      dd.style.left = '50%';
      dd.style.top = '50%';
      dd.style.transform = 'translate(-50%, -50%)';
      dd.style.position = 'fixed';
      const allSubs = getAllSubtasksFlat(project.subtasks).filter(s => s.id !== subtask.id);
      if (!allSubs.length) { dd.innerHTML = '<span style="padding:8px;font-size:12px;color:var(--text-dim)">No other subtasks</span>'; }
      else {
        allSubs.forEach(s => {
          const lbl = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = (subtask.blockedBy || []).includes(s.id);
          const txt = document.createElement('span');
          txt.textContent = s.title;
          txt.style.overflow = 'hidden'; txt.style.textOverflow = 'ellipsis'; txt.style.whiteSpace = 'nowrap';
          const dot = document.createElement('span');
          dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:var(--' + s.status + ');flex-shrink:0;';
          lbl.appendChild(cb); lbl.appendChild(dot); lbl.appendChild(txt);
          cb.addEventListener('change', () => {
            snapshot();
            if (!subtask.blockedBy) subtask.blockedBy = [];
            if (cb.checked) { if (!subtask.blockedBy.includes(s.id)) subtask.blockedBy.push(s.id); }
            else { subtask.blockedBy = subtask.blockedBy.filter(id => id !== s.id); }
            scheduleSave(); refresh(); render();
          });
          dd.appendChild(lbl);
        });
      }
      root.appendChild(dd);
      const closeDD = (ev) => { if (!dd.contains(ev.target) && ev.target !== btn) { dd.remove(); document.removeEventListener('pointerdown', closeDD); document.removeEventListener('keydown', closeDDKey); } };
      const closeDDKey = (ev) => { if (ev.key === 'Escape') { ev.stopImmediatePropagation(); dd.remove(); document.removeEventListener('pointerdown', closeDD); document.removeEventListener('keydown', closeDDKey); } };
      setTimeout(() => { document.addEventListener('pointerdown', closeDD); document.addEventListener('keydown', closeDDKey); }, 0);
    });
    return btn;
  }

  let statusFilter = '';
  function renderStats() { const counts = { planned: 0, ongoing: 0, waiting: 0, completed: 0 }; function tally(list) { list.forEach(s => { if (counts[s.status] !== undefined) counts[s.status]++; if (s.subtasks && s.subtasks.length) tally(s.subtasks); }); } projects.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; tally(p.subtasks); }); const streakHtml = _streak.count > 0 ? '<span class="pf-streak-badge">🔥 ' + _streak.count + '</span>' : ''; const freezeHtml = '<span class="pf-freeze-badge" title="Streak freezes (replenish weekly)">❄️ ' + _streakFreezes + '</span>'; const xpLvl = Math.floor(_xp / 100) + 1; const xpHtml = '<span class="pf-xp-badge">⭐ Lv.' + xpLvl + '</span>'; statsEl.innerHTML = STATUSES.map(s => '<span class="pf-stat' + (statusFilter === s ? ' pf-stat-active' : '') + '" data-status-filter="' + s + '" style="background:var(--' + s + '-bg); color:var(--' + s + ');cursor:pointer;' + (statusFilter === s ? 'outline:2px solid var(--' + s + ');outline-offset:1px;' : '') + '"><span class="pf-swatch" style="background:var(--' + s + ')"></span>' + STATUS_LABEL[s] + ' ' + counts[s] + '</span>').join('') + streakHtml + freezeHtml + xpHtml; statsEl.querySelectorAll('[data-status-filter]').forEach(el => { el.addEventListener('click', () => { const clicked = el.dataset.statusFilter; statusFilter = statusFilter === clicked ? '' : clicked; render(); }); }); }

  function projectEl(p) {
    const div = document.createElement('div'); div.className = 'pf-node' + (p.expanded ? ' pf-expanded' : ''); div.style.left = p.x + 'px'; div.style.top = p.y + 'px'; div.style.width = p.width ? (p.width + 'px') : ''; div.style.maxWidth = p.width ? 'none' : ''; div.dataset.id = p.id; if (p.createdAt) div.title = 'Created ' + formatDateTime(p.createdAt);
    const treeCount = countTree(p.subtasks); const countLabel = treeCount.total ? (treeCount.done + '/' + treeCount.total + ' done') : 'No subtasks yet';
    div.innerHTML = '<div class="pf-node-header"><span class="pf-drag-handle" title="Drag to move">&#8942;&#8942;</span><button class="pf-chevron" title="Show subtasks"><svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M3 1.5L7.5 5L3 8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="pf-node-title" contenteditable="false" spellcheck="false" data-title-id="' + p.id + '">' + escapeHtml(p.title) + '</div><span class="pf-header-meta"></span><span class="pf-badge" style="background:var(--' + p.status + '-bg); color:var(--' + p.status + ')">' + STATUS_LABEL[p.status] + '</span><button class="pf-node-del" title="Delete project">×</button></div><div class="pf-node-desc-row"><div class="pf-node-desc" contenteditable="true" spellcheck="false" data-desc-id="' + p.id + '">' + escapeHtml(p.description || '') + '</div><span class="pf-count">' + countLabel + '</span></div><div class="pf-sublist"></div><div class="pf-node-resize" title="Drag to resize • double-click to auto-fit"><svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M9.5 1.5L1.5 9.5M9.5 5.5L5.5 9.5M9.5 9.5L9.5 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div>';
    if (p.color) { div.style.borderColor = p.color; div.style.boxShadow = '0 0 0 1px ' + p.color + '22, 0 2px 10px rgba(0,0,0,0.25)'; }
    const descRow = div.querySelector('.pf-node-desc-row');
    const colorBtn = document.createElement('button'); colorBtn.className = 'pf-color-btn'; colorBtn.title = 'Card color'; colorBtn.style.background = p.color || 'transparent'; colorBtn.style.borderColor = p.color || 'var(--card-border)';
    colorBtn.addEventListener('click', (e) => { e.stopPropagation(); openColorModal(p); });
    descRow.appendChild(colorBtn);
    const headerMeta = div.querySelector('.pf-header-meta');
    headerMeta.appendChild(buildCategoryChip(p));
    if (p.status === 'completed' && p.completedAt) { const doneLabel = document.createElement('span'); doneLabel.className = 'pf-completed-date'; doneLabel.style.cursor = 'pointer'; doneLabel.title = 'Click to change completed date'; doneLabel.textContent = formatDateShort(p.completedAt.slice(0, 10)); doneLabel.addEventListener('click', (e) => { e.stopPropagation(); const input = document.createElement('input'); input.type = 'date'; input.className = 'pf-due-input'; input.value = p.completedAt.slice(0, 10); doneLabel.replaceWith(input); input.focus(); input.addEventListener('change', () => { snapshot(); p.completedAt = input.value ? input.value + 'T00:00:00.000Z' : new Date().toISOString(); scheduleSave(); render(); }); input.addEventListener('blur', () => { render(); }); }); headerMeta.appendChild(doneLabel); } else { headerMeta.appendChild(buildDueChip(p, (val) => { snapshot(); p.dueAt = val; scheduleSave(); render(); }, false)); }
    headerMeta.appendChild(buildRecurChip(p, (val) => { snapshot(); p.recurrence = val || null; scheduleSave(); render(); }));

    if (p.expanded && p.height) { div.style.height = p.height + 'px'; div.style.display = 'flex'; div.style.flexDirection = 'column'; div.querySelector('.pf-node-header').style.flexShrink = '0'; const descRow = div.querySelector('.pf-node-desc-row'); if (descRow) descRow.style.flexShrink = '0'; const sl = div.querySelector('.pf-sublist'); sl.style.flex = '1 1 auto'; sl.style.overflowY = 'auto'; sl.style.minHeight = '0'; }
    const sublist = div.querySelector('.pf-sublist'); if (p.expanded) { renderSubtaskRows(sublist, p, p.subtasks, 0); }
    sublist.__project = p; sublist.addEventListener('dragover', (e) => { if (!draggingSubId || draggingProjectId !== p.id) return; e.preventDefault(); clearIndicators(); sublist.classList.add('pf-drop-root'); }); sublist.addEventListener('dragleave', (e) => { if (e.target === sublist) sublist.classList.remove('pf-drop-root'); }); sublist.addEventListener('drop', (e) => { if (!draggingSubId || draggingProjectId !== p.id) return; e.preventDefault(); performMove(p, null, null); });
    const addBtn = document.createElement('button'); addBtn.className = 'pf-add-sub'; addBtn.textContent = '+ Add subtask'; addBtn.addEventListener('click', (e) => { e.stopPropagation(); addSubtask(p.id, null); }); sublist.appendChild(addBtn);
    div.querySelector('.pf-chevron').addEventListener('click', (e) => { e.stopPropagation(); if (listViewActive) { const allExpanded = (function check(list) { return list.every(s => (!s.subtasks || !s.subtasks.length || (s.expanded && check(s.subtasks)))); })(p.subtasks); (function setAll(list, val) { list.forEach(s => { s.expanded = val; if (s.subtasks && s.subtasks.length) setAll(s.subtasks, val); }); })(p.subtasks, !allExpanded); render(); } else { toggleExpand(p.id); } }); div.querySelector('.pf-node-del').addEventListener('click', (e) => { e.stopPropagation(); deleteProject(p.id); }); div.querySelector('.pf-badge').addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openStatusMenu(e.currentTarget, p.status, (st) => cycleProjectStatus(p.id, st)); });
    div.querySelector('.pf-node-header').addEventListener('pointerdown', (e) => { if (e.target.closest('.pf-node-del') || e.target.closest('.pf-chevron') || e.target.closest('.pf-badge') || e.target.closest('.pf-header-meta')) return; const titleEl2 = e.target.closest('.pf-node-title'); if (titleEl2 && titleEl2.contentEditable === 'true') return; dragHandleArmedProject = true; });
    const nodeHeaderEl = div.querySelector('.pf-node-header');
    nodeHeaderEl.addEventListener('dragover', (e) => { if (!draggingSubId || draggingProjectId === p.id) return; e.preventDefault(); e.stopPropagation(); nodeHeaderEl.classList.add('pf-drop-copy-target'); });
    nodeHeaderEl.addEventListener('dragleave', (e) => { if (e.target === nodeHeaderEl) nodeHeaderEl.classList.remove('pf-drop-copy-target'); });
    nodeHeaderEl.addEventListener('drop', (e) => {
      if (!draggingSubId || draggingProjectId === p.id) return;
      e.preventDefault(); e.stopPropagation();
      nodeHeaderEl.classList.remove('pf-drop-copy-target');
      const sourceProject = projects.find(pr => pr.id === draggingProjectId);
      const ids = _draggingSubIds.length ? _draggingSubIds.slice() : [draggingSubId];
      draggingSubId = null; draggingProjectId = null; _draggingSubIds = []; clearIndicators();
      if (sourceProject) { copySubtasksToProject(sourceProject, ids, p.id); clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove(); }
    });
    const titleEl = div.querySelector('.pf-node-title'); let titleClickCount = 0; let titleClickTimer = null; let _titleTapCount = 0; let _titleTapTimer = null;
    titleEl.addEventListener('pointerdown', (e) => { if (titleEl.contentEditable === 'true') e.stopPropagation(); });
    titleEl.addEventListener('click', (e) => { e.stopPropagation(); if (titleEl.contentEditable === 'true') return; titleClickCount++; if (titleClickCount === 1) { titleClickTimer = setTimeout(() => { titleClickCount = 0; if (!listViewActive) toggleExpand(p.id); }, 200); } else if (titleClickCount === 2) { clearTimeout(titleClickTimer); titleClickCount = 0; titleEl.contentEditable = 'true'; titleEl.focus(); const range = document.createRange(); range.selectNodeContents(titleEl); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } });
    titleEl.addEventListener('touchend', (e) => { if (titleEl.contentEditable === 'true') return; _titleTapCount++; if (_titleTapCount === 2) { clearTimeout(_titleTapTimer); _titleTapCount = 0; e.preventDefault(); clearTimeout(titleClickTimer); titleClickCount = 0; titleEl.contentEditable = 'true'; titleEl.focus(); const range = document.createRange(); range.selectNodeContents(titleEl); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } else { clearTimeout(_titleTapTimer); _titleTapTimer = setTimeout(() => { _titleTapCount = 0; }, 350); } });
    titleEl.addEventListener('blur', () => { titleEl.contentEditable = 'false'; const val = titleEl.textContent.trim() || 'Untitled'; if (val !== p.title) { snapshot(); p.title = val; scheduleSave(); } }); titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
    const descEl = div.querySelector('.pf-node-desc'); descEl.addEventListener('pointerdown', (e) => e.stopPropagation()); descEl.addEventListener('click', (e) => e.stopPropagation()); descEl.addEventListener('blur', () => { const val = descEl.textContent.trim(); if (val !== (p.description || '')) { snapshot(); p.description = val || ''; scheduleSave(); } }); descEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); descEl.blur(); } });
    div.querySelector('.pf-node-header').addEventListener('click', (e) => { if (_pasteArmed && _taskClipboard && _taskClipboard.length) { if (e.target.closest('.pf-node-del')) return; e.preventDefault(); e.stopPropagation(); pasteClipboardAsMain(p); return; } if (e.target.closest('.pf-node-title') || e.target.closest('.pf-node-del') || e.target.closest('.pf-chevron') || e.target.closest('.pf-badge') || e.target.closest('.pf-header-meta')) return; toggleExpand(p.id); }, true);
    makeDraggable(div, p); makeResizable(div, p); return div;
  }

  let subMultiSelect = [];
  function clearSubSelect() { subMultiSelect = []; root.querySelectorAll('.pf-sub-selected').forEach(el => el.classList.remove('pf-sub-selected')); }
  function subSelectOwnerProject(id) { return projects.find(pr => pr.subtasks && findSubNode(pr.subtasks, id)); }
  function subSelectProjectIds() { const ids = new Set(); subMultiSelect.forEach(id => { const pr = subSelectOwnerProject(id); if (pr) ids.add(pr.id); }); return ids; }
  function renderSubSelectBar(p) {
    const existing = root.querySelector('.pf-sub-select-bar');
    if (existing) existing.remove();
    if (subMultiSelect.length < 1) return;
    const sublist = root.querySelector('.pf-node[data-id="' + p.id + '"] .pf-sublist');
    if (!sublist) return;
    const projectIds = subSelectProjectIds();
    const spansMultiple = projectIds.size > 1;
    const bar = document.createElement('div');
    bar.className = 'pf-sub-select-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(123,104,238,0.1);border:1px solid var(--accent);border-radius:6px;margin:6px 0;flex-wrap:wrap;';
    bar.innerHTML = '<span style="font-size:11px;color:var(--text-dim);">' + subMultiSelect.length + ' selected' + (spansMultiple ? ' (' + projectIds.size + ' projects)' : '') + '</span>' +
      '<button class="pf-undo-btn" data-sub-action="cycle" style="font-size:10px;padding:3px 8px;">Set Status</button>' +
      '<button class="pf-undo-btn" data-sub-action="due" style="font-size:10px;padding:3px 8px;">Set Due</button>' +
      '<button class="pf-undo-btn" data-sub-action="copy" style="font-size:10px;padding:3px 8px;"' + (spansMultiple ? ' title="Copy to… only works from a single project — narrow your selection to one project"' : '') + '>Copy to…</button>' +
      '<button class="pf-undo-btn" data-sub-action="copy-clip" style="font-size:10px;padding:3px 8px;" title="Ctrl+C">📄 Copy</button>' +
      '<button class="pf-undo-btn" data-sub-action="delete" style="font-size:10px;padding:3px 8px;color:var(--danger);">Delete</button>' +
      '<button class="pf-undo-btn" data-sub-action="clear" style="font-size:10px;padding:3px 6px;">✕</button>';
    bar.querySelector('[data-sub-action="copy"]').addEventListener('click', (e) => { e.stopPropagation(); if (spansMultiple) { showToast('⚠ "Copy to…" needs a single-project selection — narrow your selection first', true); return; } openCopyToProjectModal(p, subMultiSelect.slice()); });
    bar.querySelector('[data-sub-action="copy-clip"]').addEventListener('click', (e) => { e.stopPropagation(); const clip = buildClipboardFromSelection(); if (!clip || !clip.length) return; _taskClipboard = clip; showToast((clip.length > 1 ? clip.length + ' tasks' : 'Task') + ' copied — click a project to paste as main task(s), or a task to nest under it'); });
    bar.querySelector('[data-sub-action="cycle"]').addEventListener('click', (e) => { e.stopPropagation(); openStatusMenu(e.currentTarget, null, (st) => { try { snapshot(); const touched = new Set(); subMultiSelect.forEach(id => { const owner = subSelectOwnerProject(id); if (!owner) return; const s = findSubNode(owner.subtasks, id); if (s) { s.status = st; s.completedAt = st === 'completed' ? new Date().toISOString() : null; touched.add(owner); } }); scheduleSave(); render(); touched.forEach(pr => checkAllCompleted(pr)); requestAnimationFrame(() => renderSubSelectBar(p)); } catch (err) { console.error('[Orga-naes] Bulk set status failed:', err); showToast('⚠ Set status failed — see console', true); } }); });
    bar.querySelector('[data-sub-action="due"]').addEventListener('click', (e) => { e.stopPropagation(); const input = document.createElement('input'); input.type = 'date'; input.style.cssText = 'position:absolute;z-index:100;'; bar.appendChild(input); input.focus(); try { input.showPicker && input.showPicker(); } catch (err) {} function commit() { const val = input.value || null; snapshot(); const touched = new Set(); subMultiSelect.forEach(id => { const owner = subSelectOwnerProject(id); if (!owner) return; const s = findSubNode(owner.subtasks, id); if (s) { s.dueAt = val; touched.add(owner); } }); clearSubSelect(); scheduleSave(); render(); touched.forEach(pr => { if (pr._manualStatus) { delete pr._manualStatus; } checkAllCompleted(pr); }); } input.addEventListener('change', commit); input.addEventListener('blur', () => { input.remove(); }); });
    bar.querySelector('[data-sub-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); if (!confirm('Delete ' + subMultiSelect.length + ' subtask(s)?')) return; snapshot(); subMultiSelect.forEach(id => { const owner = subSelectOwnerProject(id); if (!owner) return; const arr = findSubParentArray(owner.subtasks, id); if (arr) { const idx = arr.findIndex(s => s.id === id); if (idx > -1) arr.splice(idx, 1); } }); clearSubSelect(); scheduleSave(); render(); });
    bar.querySelector('[data-sub-action="clear"]').addEventListener('click', (e) => { e.stopPropagation(); clearSubSelect(); const existing2 = root.querySelector('.pf-sub-select-bar'); if (existing2) existing2.remove(); });
    sublist.insertBefore(bar, sublist.firstChild);
  }
  let draggingSubId = null; let draggingProjectId = null; let dragHandleArmed = false; let _draggingSubIds = [];
  function clearIndicators() { canvas.querySelectorAll('.pf-drop-before, .pf-drop-after, .pf-drop-nest').forEach(el => { el.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); }); canvas.querySelectorAll('.pf-drop-root').forEach(el => el.classList.remove('pf-drop-root')); }
  function isDescendant(node, id) { if (!node.subtasks) return false; for (const c of node.subtasks) { if (c.id === id) return true; if (isDescendant(c, id)) return true; } return false; }
  function performMove(p, targetId, zone) {
    if (!draggingSubId || draggingProjectId !== p.id) { clearIndicators(); return; }
    const ids = _draggingSubIds.length ? _draggingSubIds : [draggingSubId];
    if (ids.includes(targetId)) { clearIndicators(); return; }
    const nodes = [];
    for (const id of ids) {
      const node = findSubNode(p.subtasks, id);
      if (!node) continue;
      if (targetId && isDescendant(node, targetId)) { clearIndicators(); return; }
      nodes.push(node);
    }
    if (!nodes.length) { clearIndicators(); return; }
    snapshot();
    ids.forEach(id => { const arr = findSubParentArray(p.subtasks, id); if (arr) { const idx = arr.findIndex(s => s.id === id); if (idx > -1) arr.splice(idx, 1); } });
    if (!targetId) { nodes.forEach(n => p.subtasks.push(n)); }
    else if (zone === 'nest') { const targetNode = findSubNode(p.subtasks, targetId); if (!targetNode.subtasks) targetNode.subtasks = []; nodes.forEach(n => targetNode.subtasks.push(n)); targetNode.expanded = true; }
    else { const destArr = findSubParentArray(p.subtasks, targetId); const tIdx = destArr.findIndex(s => s.id === targetId); destArr.splice(zone === 'before' ? tIdx : tIdx + 1, 0, ...nodes); }
    draggingSubId = null; draggingProjectId = null; _draggingSubIds = []; subMultiSelect = []; clearIndicators(); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); scheduleSave(); render();
  }

  function renderSubtaskRows(container, p, list, depth) { list.forEach(s => { const row = subtaskEl(p, s, depth); container.appendChild(row); if (s.expanded && s.subtasks && s.subtasks.length) { const nestedWrap = document.createElement('div'); nestedWrap.className = 'pf-sublist-nested'; const { color } = levelMarkerFor(depth + 1); nestedWrap.style.setProperty('--rail-color', color); container.appendChild(nestedWrap); renderSubtaskRows(nestedWrap, p, s.subtasks, depth + 1); const nestedAddBtn = document.createElement('button'); nestedAddBtn.className = 'pf-add-sub'; nestedAddBtn.textContent = '+ Add subtask'; nestedAddBtn.addEventListener('click', (e) => { e.stopPropagation(); addSubtask(p.id, s.id); }); nestedWrap.appendChild(nestedAddBtn); } }); }

  function subtaskEl(p, s, depth) {
    if (!s.subtasks) s.subtasks = []; const hasChildren = s.subtasks.length > 0; const isSearchMatch = searchTerm && s.title.toLowerCase().includes(searchTerm.toLowerCase()); const isStatusMatch = statusFilter && s.status === statusFilter; const row = document.createElement('div'); row.className = 'pf-subrow' + (s.status === 'completed' ? ' pf-sub-completed' : '') + (hasChildren ? ' pf-sub-has-children' : '') + (subMultiSelect.includes(s.id) ? ' pf-sub-selected' : '') + (isSearchMatch ? ' pf-sub-search-match' : '') + (isStatusMatch ? ' pf-sub-status-match' : ''); row.style.setProperty('--rail-color', levelMarkerFor(depth).color); if (s.createdAt) row.title = 'Created ' + formatDateTime(s.createdAt);
    const chevronHtml = hasChildren ? '<button class="pf-sub-chevron' + (s.expanded ? ' pf-sub-expanded' : '') + '" title="Show nested subtasks"><svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M3 1.5L7.5 5L3 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : '<span class="pf-sub-spacer"></span>';
    row.innerHTML = '<span class="pf-sub-handle" title="Drag to move">&#8942;&#8942;</span>' + chevronHtml + '<div class="pf-subrow-title" contenteditable="false" spellcheck="false" data-sub-title-id="' + s.id + '">' + escapeHtml(s.title) + '</div><span class="pf-sub-dates"></span>';
    const subDatesEl = row.querySelector('.pf-sub-dates');

    const addBtn = document.createElement('button'); addBtn.className = 'pf-sub-add'; addBtn.title = 'Add subtask under this'; addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'; addBtn.addEventListener('click', (e) => { e.stopPropagation(); addSubtask(p.id, s.id); }); subDatesEl.appendChild(addBtn);
    const editBtn = document.createElement('button'); editBtn.className = 'pf-sub-edit'; editBtn.title = 'Edit title'; editBtn.textContent = '✏️'; editBtn.addEventListener('click', (e) => { e.stopPropagation(); const t = row.querySelector('.pf-subrow-title'); t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }); subDatesEl.appendChild(editBtn);
    const delBtn = document.createElement('button'); delBtn.className = 'pf-sub-del'; delBtn.title = 'Delete subtask'; delBtn.textContent = '×'; delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSubtask(p.id, s.id); }); subDatesEl.appendChild(delBtn);
    const _hasBlockers = getUnresolvedBlockers(p, s).length > 0;
    const dotEl = document.createElement('span'); dotEl.className = 'pf-sub-dot' + (_hasBlockers ? ' pf-blocked' : ''); dotEl.title = _hasBlockers ? 'Blocked' : 'Set status'; dotEl.style.background = s.status === 'planned' ? 'transparent' : statusDotColor(s.status); dotEl.style.borderColor = statusDotColor(s.status); subDatesEl.appendChild(dotEl);
    if (s.status === 'completed' && s.completedAt) { const doneLabel = document.createElement('span'); doneLabel.className = 'pf-completed-date'; doneLabel.style.cursor = 'pointer'; doneLabel.title = 'Click to change completed date'; doneLabel.textContent = formatDateShort(s.completedAt.slice(0, 10)); doneLabel.addEventListener('click', (e) => { e.stopPropagation(); const input = document.createElement('input'); input.type = 'date'; input.className = 'pf-due-input'; input.value = s.completedAt.slice(0, 10); doneLabel.replaceWith(input); input.focus(); input.addEventListener('change', () => { snapshot(); s.completedAt = input.value ? input.value + 'T00:00:00.000Z' : new Date().toISOString(); scheduleSave(); render(); }); input.addEventListener('blur', () => { render(); }); }); subDatesEl.appendChild(doneLabel); } else { subDatesEl.appendChild(buildDueChip(s, (val) => { snapshot(); s.dueAt = val; scheduleSave(); render(); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); }, false)); }
    subDatesEl.appendChild(buildDependencyChip(p, s));
    const commentBtn = document.createElement('button'); commentBtn.className = 'pf-sub-comment'; commentBtn.title = s.comments && s.comments.length ? s.comments.length + ' comment(s)' : 'Add comment'; commentBtn.textContent = '💬'; commentBtn.style.whiteSpace = 'nowrap'; if (s.comments && s.comments.length) { commentBtn.style.opacity = '1'; commentBtn.style.color = 'var(--text)'; } commentBtn.addEventListener('click', (e) => { e.stopPropagation(); openCommentPanel(p, s); }); subDatesEl.appendChild(commentBtn);
    const promoteBtn = document.createElement('button'); promoteBtn.className = 'pf-sub-promote'; promoteBtn.title = 'Promote to Project'; promoteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; promoteBtn.addEventListener('click', (e) => { e.stopPropagation(); promoteSubToProject(p, s); }); subDatesEl.appendChild(promoteBtn);

    row.dataset.subId = s.id;
    if (root.classList.contains('pf-device-mobile')) {
      // Calendar and comment icons in main row (visible without swiping)
      const dueIcon = document.createElement('span');
      dueIcon.classList.add('pf-ext-due');
      dueIcon.style.cssText = 'cursor:pointer;display:inline-flex;align-items:center;';
      (function refreshDueIcon() {
        let color = 'rgba(255,255,255,0.3)'; let title = 'No due date';
        if (s.status === 'completed') { color = '#22c55e'; title = s.dueAt ? 'Completed, was due: ' + formatDateShort(s.dueAt) : 'Completed'; }
        else if (s.dueAt && s.status !== 'completed') {
          const today = new Date(); today.setHours(0,0,0,0);
          const d = new Date(s.dueAt + 'T00:00:00');
          const diff = Math.round((d - today) / 86400000);
          if (diff < 0) { color = '#ef4444'; title = 'Overdue: ' + formatDateShort(s.dueAt); }
          else if (diff === 0) { color = '#f97316'; title = 'Due today'; }
          else if (diff === 1) { color = '#eab308'; title = 'Due tomorrow'; }
          else if (diff <= 7) { color = '#3b82f6'; title = 'Due this week: ' + formatDateShort(s.dueAt); }
          else { color = 'rgba(255,255,255,0.3)'; title = 'Due: ' + formatDateShort(s.dueAt); }
        } else if (s.dueAt && s.status === 'completed') { color = '#22c55e'; title = 'Completed, was due: ' + formatDateShort(s.dueAt); }
        const dateText = s.dueAt ? formatDateShort(s.dueAt) : '';
        dueIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span class="pf-ext-due-text" style="font-size:9.5px;color:' + color + ';white-space:nowrap;margin-left:3px;">' + (dateText || '+ Due') + '</span>';
        dueIcon.title = title;
      })();
      dueIcon.addEventListener('click', (e) => { e.stopPropagation(); const input = document.createElement('input'); input.type = 'date'; input.className = 'pf-due-input'; input.value = s.dueAt || ''; input.style.position = 'absolute'; input.style.opacity = '0'; input.style.pointerEvents = 'none'; dueIcon.appendChild(input); input.focus(); try { input.showPicker && input.showPicker(); } catch(err){} input.addEventListener('change', () => { snapshot(); s.dueAt = input.value || null; scheduleSave(); render(); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); }); input.addEventListener('blur', () => { input.remove(); }); });
      subDatesEl.appendChild(dueIcon);
      const cm = document.createElement('span'); cm.textContent = '💬'; cm.style.cssText = 'cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:14px;'; cm.classList.add('pf-ext-comment'); cm.title = s.comments && s.comments.length ? s.comments.length + ' comment(s)' : 'Add comment'; if (!s.comments || !s.comments.length) cm.style.opacity = '0.4'; cm.addEventListener('click', (e) => { e.stopPropagation(); openCommentPanel(p, s); }); subDatesEl.appendChild(cm);
      // Extend-meta with dependency only (revealed on swipe)
      const extMeta = document.createElement('span');
      extMeta.className = 'pf-sub-extend-meta';
      const depChip = buildDependencyChip(p, s);
      depChip.style.display = 'inline-flex'; depChip.classList.add('pf-ext-dep'); depChip.style.justifyContent = 'center';
      extMeta.appendChild(depChip);
      const recurChip = buildRecurChip(s, (val) => { snapshot(); s.recurrence = val || null; scheduleSave(); render(); });
      recurChip.classList.add('pf-ext-recur'); recurChip.style.display = 'inline-flex';
      extMeta.appendChild(recurChip);
      const extEditBtn = document.createElement('button'); extEditBtn.className = 'pf-ext-edit'; extEditBtn.textContent = '✏️'; extEditBtn.title = 'Edit title'; extEditBtn.style.cssText = 'background:transparent;border:1px solid var(--card-border);border-radius:100px;padding:2px 7px;cursor:pointer;font-size:9.5px;display:inline-flex;align-items:center;justify-content:center;';
      extEditBtn.addEventListener('click', (e) => { e.stopPropagation(); const t = row.querySelector('.pf-subrow-title'); t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); });
      extMeta.appendChild(extEditBtn);
      const extPromoteBtn = document.createElement('button'); extPromoteBtn.className = 'pf-ext-promote'; extPromoteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; extPromoteBtn.title = 'Promote to Project'; extPromoteBtn.style.cssText = 'background:transparent;border:1px solid var(--card-border);border-radius:100px;padding:2px 7px;cursor:pointer;font-size:9.5px;display:inline-flex;align-items:center;justify-content:center;';
      extPromoteBtn.addEventListener('click', (e) => { e.stopPropagation(); promoteSubToProject(p, s); });
      extMeta.appendChild(extPromoteBtn);
      row.appendChild(extMeta);
    }
    const ctxBtn = document.createElement('button'); ctxBtn.className = 'pf-sub-ctx-btn'; ctxBtn.title = 'More actions'; ctxBtn.textContent = '⋮'; row.appendChild(ctxBtn);

    row.__project = p; row.__subId = s.id;
    row.querySelector('.pf-sub-handle').addEventListener('pointerdown', () => { dragHandleArmed = true; });
    row.querySelector('.pf-subrow-title').addEventListener('pointerdown', (e) => { const t = row.querySelector('.pf-subrow-title'); if (t.contentEditable === 'true') { e.stopPropagation(); return; } dragHandleArmed = true; });
    row.draggable = true;
    row.addEventListener('dragstart', (e) => { if (!dragHandleArmed) { e.preventDefault(); return; } e.stopPropagation(); dragHandleArmed = false; draggingSubId = s.id; draggingProjectId = p.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', s.id); } catch (err) {} if (subMultiSelect.length && subMultiSelect.includes(s.id)) { _draggingSubIds = subMultiSelect.slice(); } else { _draggingSubIds = [s.id]; } requestAnimationFrame(() => row.classList.add('pf-sub-dragging')); });
    row.addEventListener('click', (e) => { if (!_pasteArmed || !_taskClipboard || !_taskClipboard.length) return; if (e.target.closest('.pf-sub-add') || e.target.closest('.pf-sub-del') || e.target.closest('.pf-sub-dates') || e.target.closest('.pf-sub-ctx-btn')) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); pasteClipboardUnder(p, s); }, true);
    row.addEventListener('dragend', () => { row.classList.remove('pf-sub-dragging'); draggingSubId = null; draggingProjectId = null; clearIndicators(); });
    row.addEventListener('dragover', (e) => { if (!draggingSubId || draggingProjectId !== p.id || draggingSubId === s.id) return; e.preventDefault(); e.stopPropagation(); const rect = row.getBoundingClientRect(); const ratio = (e.clientY - rect.top) / rect.height; const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'nest'; clearIndicators(); row.classList.add('pf-drop-' + zone); row.dataset.dropZone = zone; });
    row.addEventListener('dragleave', (e) => { if (e.target === row) row.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); });
    row.addEventListener('drop', (e) => { if (!draggingSubId || draggingProjectId !== p.id || draggingSubId === s.id) return; e.preventDefault(); e.stopPropagation(); performMove(p, s.id, row.dataset.dropZone || 'after'); });
    if (hasChildren) { row.querySelector('.pf-sub-chevron').addEventListener('click', (e) => { e.stopPropagation(); toggleSubExpand(p.id, s.id); }); row.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) return; if (e.target.closest('.pf-sub-handle') || e.target.closest('.pf-sub-chevron') || e.target.closest('.pf-sub-dot') || e.target.closest('.pf-subrow-title') || e.target.closest('.pf-sub-add') || e.target.closest('.pf-sub-del') || e.target.closest('.pf-sub-dates')) return; toggleSubExpand(p.id, s.id); }); }
    row.querySelector('.pf-sub-dot').addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const _pid = p.id, _sid = s.id; openStatusMenu(e.currentTarget, s.status, (st) => cycleSubStatus(_pid, _sid, st)); });
    row.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) { if (e.target.closest('.pf-sub-add') || e.target.closest('.pf-sub-del') || e.target.closest('.pf-sub-dates')) return; e.stopPropagation(); const idx = subMultiSelect.indexOf(s.id); if (idx > -1) { subMultiSelect.splice(idx, 1); row.classList.remove('pf-sub-selected'); } else { subMultiSelect.push(s.id); row.classList.add('pf-sub-selected'); } renderSubSelectBar(p); } });
    row.querySelector('.pf-sub-ctx-btn').addEventListener('click', (e) => { e.stopPropagation(); const rect = e.target.getBoundingClientRect(); _showSubCtxMenu(rect.left, rect.bottom, p, s); });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'touch' || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return; _showSubCtxMenu(e.clientX, e.clientY, p, s); });
    let _subTitleClickTimer = null; let _subTitleTapCount = 0; let _subTitleTapTimer = null;
    const t = row.querySelector('.pf-subrow-title');
    t.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) return; e.stopPropagation(); if (t.contentEditable === 'true') return; if (e.detail >= 2) return; if (window._splitSelectSuppressed) { window._splitSelectSuppressed = false; return; } if (subMultiSelect.length > 0) { const idx = subMultiSelect.indexOf(s.id); if (idx > -1) { subMultiSelect.splice(idx, 1); row.classList.remove('pf-sub-selected'); } else { subMultiSelect.push(s.id); row.classList.add('pf-sub-selected'); } renderSubSelectBar(p); return; } clearTimeout(_subTitleClickTimer); _subTitleClickTimer = setTimeout(() => { if (hasChildren) toggleSubExpand(p.id, s.id); }, 200); });
    t.addEventListener('dblclick', (e) => { e.stopPropagation(); clearTimeout(_subTitleClickTimer); clearTimeout(_subTitleTapTimer); _subTitleTapCount = 0; t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); });
    t.addEventListener('touchend', (e) => { if (t.contentEditable === 'true') return; _subTitleTapCount++; if (_subTitleTapCount === 2) { clearTimeout(_subTitleTapTimer); _subTitleTapCount = 0; e.preventDefault(); clearTimeout(_subTitleClickTimer); t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } else { clearTimeout(_subTitleTapTimer); _subTitleTapTimer = setTimeout(() => { _subTitleTapCount = 0; }, 350); } });
    t.addEventListener('blur', () => { const val = t.textContent.trim() || 'Untitled'; t.contentEditable = 'false'; if (val !== s.title) { snapshot(); s.title = val; scheduleSave(); } }); t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.textContent = s.title; t.blur(); } }); return row;
  }

  let dragProjectId = null; let dragHandleArmedProject = false;
  function clearProjectIndicators() { canvas.querySelectorAll('.pf-node-drop-before, .pf-node-drop-after').forEach(el => el.classList.remove('pf-node-drop-before', 'pf-node-drop-after')); }

  function makeDraggable(el, p) {
    el.draggable = true;
    const handle = el.querySelector('.pf-drag-handle');
    handle.addEventListener('pointerdown', () => { dragHandleArmedProject = true; });
    el.addEventListener('dragstart', (e) => { if (!dragHandleArmedProject) { e.preventDefault(); return; } dragHandleArmedProject = false; dragProjectId = p.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch (err) {} requestAnimationFrame(() => { el.classList.add('pf-dragging'); canvas.querySelectorAll('.pf-node').forEach(n => { if (n.dataset.id !== p.id) n.classList.add('pf-drop-target'); }); }); });
    el.addEventListener('dragend', () => { el.classList.remove('pf-dragging'); dragProjectId = null; clearProjectIndicators(); canvas.querySelectorAll('.pf-drop-target').forEach(n => n.classList.remove('pf-drop-target')); });
    el.addEventListener('dragover', (e) => { if (!dragProjectId || dragProjectId === p.id) return; e.preventDefault(); e.stopPropagation(); clearProjectIndicators(); const idx = projects.findIndex(pr => pr.id === p.id); const isFirst = idx === 0 || projects.findIndex(pr => pr.id === dragProjectId) === idx - 1 && idx === 1; const rect = el.getBoundingClientRect(); const zone = (idx === 0 && (e.clientX - rect.left) / rect.width < 0.3) ? 'before' : 'after'; el.classList.add('pf-node-drop-' + zone); el.dataset.dropZone = zone; });
    el.addEventListener('dragleave', () => { el.classList.remove('pf-node-drop-before', 'pf-node-drop-after'); });
    el.addEventListener('drop', (e) => { if (!dragProjectId || dragProjectId === p.id) return; e.preventDefault(); e.stopPropagation(); const zone = el.dataset.dropZone || 'after'; snapshot(); const src = projects.find(pr => pr.id === dragProjectId); if (src && src.category !== p.category) { src.category = p.category; } const srcIdx = projects.findIndex(pr => pr.id === dragProjectId); projects.splice(srcIdx, 1); const destIdx = projects.findIndex(pr => pr.id === p.id); projects.splice(zone === 'before' ? destIdx : destIdx + 1, 0, src); dragProjectId = null; clearProjectIndicators(); scheduleSave(); autoArrangeProjects(true); });

  }
  let autoScrollInterval = null;
  canvasWrap.addEventListener('dragover', (e) => {
    const rect = canvasWrap.getBoundingClientRect();
    const edge = 40, speed = 12;
    let dx = 0, dy = 0;
    if (e.clientX - rect.left < edge) dx = -speed;
    else if (rect.right - e.clientX < edge) dx = speed;
    if (e.clientY - rect.top < edge) dy = -speed;
    else if (rect.bottom - e.clientY < edge) dy = speed;
    if (dx || dy) {
      if (!autoScrollInterval) autoScrollInterval = setInterval(() => { canvasWrap.scrollLeft += dx; canvasWrap.scrollTop += dy; }, 16);
    } else { clearInterval(autoScrollInterval); autoScrollInterval = null; }
  });
  canvasWrap.addEventListener('dragleave', () => { clearInterval(autoScrollInterval); autoScrollInterval = null; });
  canvasWrap.addEventListener('drop', () => { clearInterval(autoScrollInterval); autoScrollInterval = null; });
  document.addEventListener('dragend', () => { clearInterval(autoScrollInterval); autoScrollInterval = null; });

  function makeResizable(el, p) { const MIN_W = 190, MIN_H = 140; const grip = el.querySelector('.pf-node-resize'); let resizing = false, moved = false, startX, startY, startW, startH; grip.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); resizing = true; moved = false; startX = e.clientX; startY = e.clientY; const z = typeof zoomLevel !== 'undefined' ? zoomLevel : 1; startW = el.offsetWidth; startH = el.offsetHeight; grip.setPointerCapture(e.pointerId); }); grip.addEventListener('pointermove', (e) => { if (!resizing) return; const z = typeof zoomLevel !== 'undefined' ? zoomLevel : 1; const dx = (e.clientX - startX) / z, dy = (e.clientY - startY) / z; if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) { moved = true; snapshot(); el.style.maxWidth = 'none'; } if (!moved) return; const newW = Math.max(MIN_W, startW + dx); const newH = Math.max(MIN_H, startH + dy); p.width = newW; el.style.width = newW + 'px'; if (p.expanded) { p.height = newH; el.style.height = newH + 'px'; el.style.display = 'flex'; el.style.flexDirection = 'column'; const sl = el.querySelector('.pf-sublist'); if (sl) { sl.style.flex = '1 1 auto'; sl.style.overflowY = 'auto'; sl.style.minHeight = '0'; } } }); function end() { if (!resizing) return; resizing = false; if (moved) { scheduleSave(); autoArrangeProjects(true); } } grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end); grip.addEventListener('dblclick', (e) => { e.stopPropagation(); snapshot(); p.height = null; p.width = null; scheduleSave(); autoArrangeProjects(true); }); }
  function autoArrangeProjects(skipSnapshot) {
    const GAP = 32, START_X = 24; let START_Y = 40;
    const z = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;
    const bw = ((canvasWrap && canvasWrap.clientWidth) || 1400) / z;
    if (!skipSnapshot) snapshot();
    render();
    const groupKeys = categories.concat([null]);
    let y = START_Y;
    groupKeys.forEach(catName => {
      const group = projects.filter(p => (p.category || null) === catName && matchesSearch(p));
      if (!group.length) return;
      if (catName && collapsedCategories[catName]) {
        group.forEach(p => { p.x = START_X; p.y = y; });
        const visibleCount = group.length;
        y += 30 + visibleCount * 38 + 16 + GAP;
        return;
      }
      const cards = group.map(p => canvas.querySelector('.pf-node[data-id="' + p.id + '"]')).filter(Boolean);
      let x = START_X, rowH = 0;
      cards.forEach((cardEl, i) => {
        const proj = group[i];
        const w = Math.ceil(cardEl.offsetWidth || 244);
        const h = Math.ceil(cardEl.offsetHeight || 90) + 8;
        if (x > START_X && x + w > bw - START_X) { x = START_X; y += rowH + GAP; rowH = 0; }
        proj.x = x; proj.y = y;
        x += w + GAP;
        if (h > rowH) rowH = h;
      });
      y += rowH + GAP + (catName ? 30 : 0);
    });
    scheduleSave();
    render();
    renderCategoryZones();
  }

  function renderCategoryZones() {
    const zonesLayer = document.getElementById('pf-category-zones');
    if (!zonesLayer) return;
    zonesLayer.innerHTML = '';
    const groups = {};
    projects.forEach(p => {
      if (!p.category) return;
      if (!matchesSearch(p)) return;
      const collapsed = !!collapsedCategories[p.category];
      const el = canvas.querySelector('.pf-node[data-id="' + p.id + '"]');
      const w = (!collapsed && el) ? (el.offsetWidth || 244) : 244;
      const h = (!collapsed && el) ? (el.offsetHeight || 90) : 90;
      if (!groups[p.category]) groups[p.category] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const g = groups[p.category];
      g.minX = Math.min(g.minX, p.x); g.minY = Math.min(g.minY, p.y);
      g.maxX = Math.max(g.maxX, p.x + w); g.maxY = Math.max(g.maxY, p.y + h);
    });
    const PAD = 20;
    Object.keys(groups).forEach(name => {
      const g = groups[name]; const color = categoryColor(name);
      const collapsed = !!collapsedCategories[name];
      const zone = document.createElement('div');
      zone.className = 'pf-category-zone' + (collapsed ? ' pf-category-zone-collapsed' : '');
      zone.style.left = (g.minX - PAD) + 'px';
      zone.style.top = (g.minY - PAD - 12) + 'px';
      const collapsedWidth = Math.max(360, (canvasWrap.clientWidth / (typeof zoomLevel !== 'undefined' ? zoomLevel : 1)) - 80);
      zone.style.width = collapsed ? collapsedWidth + 'px' : (g.maxX - g.minX + PAD * 2) + 'px';
      const catProjects = projects.filter(p => p.category === name && matchesSearch(p));
      zone.style.height = collapsed ? (30 + catProjects.length * 38 + 16) + 'px' : (g.maxY - g.minY + PAD * 2 + 12) + 'px';
      zone.style.borderColor = color;
      const label = document.createElement('button');
      label.className = 'pf-category-zone-label';
      label.type = 'button';
      label.innerHTML = (collapsed ? '&#9656;' : '&#9662;') + ' ' + escapeHtml(name) + (collapsed ? ' <span style="font-size:10px;opacity:0.7;">(' + catProjects.length + ' project' + (catProjects.length !== 1 ? 's' : '') + ')</span>' : '');
      label.style.background = color;
      label.style.color = '#fff';
      label.style.pointerEvents = 'auto';
      label.title = collapsed ? 'Expand category' : 'Collapse category';
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!listViewActive) return;
        collapsedCategories[name] = !collapsedCategories[name];
        saveCollapsedCategories();
        autoArrangeProjects();
      });
      label.addEventListener('dragover', (e) => { if (!dragProjectId) return; e.preventDefault(); e.stopPropagation(); label.style.outline = '2px solid #fff'; label.style.outlineOffset = '2px'; });
      label.addEventListener('dragleave', () => { label.style.outline = ''; label.style.outlineOffset = ''; });
      label.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); label.style.outline = ''; label.style.outlineOffset = ''; if (!dragProjectId) return; const src = projects.find(pr => pr.id === dragProjectId); if (!src) return; if (src.category === name) return; snapshot(); src.category = name; dragProjectId = null; clearProjectIndicators(); scheduleSave(); autoArrangeProjects(true); });
      zone.appendChild(label);
      if (collapsed) {
        const list = document.createElement('div');
        list.style.cssText = 'padding: 8px 12px; display: flex; flex-direction: column; gap: 6px;';
        catProjects.forEach(p => {
          const treeCount = countTree(p.subtasks);
          const progressText = treeCount.total ? treeCount.done + '/' + treeCount.total : '';
          const dueText = p.dueAt || '';
          const isCompleted = p.status === 'completed';
          const item = document.createElement('div');
          item.style.cssText = 'font-size: 13px; color: var(--text); padding: 6px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.15s; background: var(--card); border: 1px solid var(--card-border);' + (isCompleted ? 'opacity:0.5;text-decoration:line-through;' : '');
          item.innerHTML = '<span class="pf-list-dot" style="width:8px;height:8px;border-radius:50%;background:' + (p.color || 'var(--' + p.status + ')') + ';flex-shrink:0;cursor:pointer;border:1.5px solid ' + (p.color || 'var(--' + p.status + ')') + ';" title="Set status"></span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">' + escapeHtml(p.title) + '</span>' +
            (progressText ? '<span style="font-size:10px;color:var(--text-dim);flex-shrink:0;">' + progressText + '</span>' : '') +
            '<span style="font-size:10px;color:var(--' + p.status + ');flex-shrink:0;padding:2px 6px;border-radius:6px;background:var(--' + p.status + '-bg);">' + STATUS_LABEL[p.status] + '</span>' +
            (dueText ? '<span style="font-size:10px;color:var(--text-dim);flex-shrink:0;">' + dueText + '</span>' : '');
          item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--hover-border)'; });
          item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--card-border)'; });
          item.querySelector('.pf-list-dot').addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const _pid = p.id; openStatusMenu(e.currentTarget, p.status, (st) => { snapshot(); const proj = projects.find(pr => pr.id === _pid); if (!proj) return; const oldStatus = proj.status; proj.status = st; if (proj.status === oldStatus) return; proj._manualStatus = true; proj.completedAt = proj.status === 'completed' ? new Date().toISOString() : null; logActivity('"' + proj.title + '" status: ' + STATUS_LABEL[oldStatus] + ' → ' + STATUS_LABEL[proj.status]); scheduleSave(); renderCategoryZones(); }); });
          item.addEventListener('click', (e) => { e.stopPropagation(); collapsedCategories[name] = false; saveCollapsedCategories(); p.expanded = true; scheduleSave(); autoArrangeProjects(true); });
          list.appendChild(item);
        });
        zone.appendChild(list);
      }
      zonesLayer.appendChild(zone);
    });
  }

  let searchTerm = '';
  let dueFilter = 'all';
  let selectedProjectId = null;
  let _taskClipboard = null; let _pasteArmed = false;
  function pruneCloneToSelection(node, idSet) {
    const clone = { id: uid(), title: node.title, status: node.status || 'planned', expanded: false, createdAt: new Date().toISOString(), dueAt: node.dueAt || null, completedAt: node.completedAt || null, recurrence: node.recurrence || null, subtasks: [] };
    const anySelectedBelow = (node.subtasks || []).some(c => idSet.has(c.id) || nodeHasSelectedDescendant(c, idSet));
    if (!anySelectedBelow) {
      // Nothing under this node was individually selected: this node was selected on its own, so copy its whole branch as-is.
      clone.subtasks = (node.subtasks || []).map(deepCloneSubtree);
      return clone;
    }
    (node.subtasks || []).forEach(child => {
      if (idSet.has(child.id)) {
        // Child explicitly selected: include it in full (with all its own descendants), regardless of grandchild selection.
        clone.subtasks.push(deepCloneSubtree(child));
      } else if (nodeHasSelectedDescendant(child, idSet)) {
        // Child not selected itself, but something under it is: keep it as a pass-through container, pruned to only the selected branches.
        clone.subtasks.push(pruneCloneToSelection(child, idSet));
      }
      // else: unselected sibling with nothing selected underneath — dropped entirely.
    });
    return clone;
  }
  function nodeHasSelectedDescendant(node, idSet) {
    if (!node.subtasks) return false;
    return node.subtasks.some(c => idSet.has(c.id) || nodeHasSelectedDescendant(c, idSet));
  }
  function buildClipboardFromSelection() {
    // Manually-selected subtasks always win: copy exactly what's selected, nothing more.
    if (subMultiSelect.length) {
      const idSet = new Set(subMultiSelect);
      const byProject = new Map();
      subMultiSelect.forEach(id => {
        const owner = subSelectOwnerProject(id);
        if (!owner) return;
        if (!byProject.has(owner.id)) byProject.set(owner.id, { project: owner, nodes: [] });
        const node = findSubNode(owner.subtasks, id);
        if (node) byProject.get(owner.id).nodes.push(node);
      });
      const out = [];
      byProject.forEach(({ nodes }) => {
        // Keep only the "top" selected nodes — drop any selected node whose ancestor is also selected, since the ancestor's pruned clone already carries it.
        const roots = nodes.filter(n => !nodes.some(other => other !== n && idSet.has(other.id) && isDescendant(other, n.id)));
        roots.forEach(n => out.push(pruneCloneToSelection(n, idSet)));
      });
      return out;
    }
    // No subtasks manually selected: selected main task(s) copy in full, with all nested subtasks.
    if (splitMultiSelect.length) {
      return splitMultiSelect.map(id => projects.find(pr => pr.id === id)).filter(Boolean).map(pr => ({ id: pr.id, title: pr.title, status: pr.status, dueAt: pr.dueAt, completedAt: pr.completedAt, recurrence: pr.recurrence, subtasks: pr.subtasks || [] }));
    }
    return null;
  }
  function pasteClipboardAsMain(targetProject) {
    if (!_taskClipboard || !_taskClipboard.length) return;
    snapshot();
    const clones = _taskClipboard.map(deepCloneSubtree);
    if (!targetProject.subtasks) targetProject.subtasks = [];
    clones.forEach(c => targetProject.subtasks.push(c));
    targetProject.expanded = true;
    if (targetProject._manualStatus) { delete targetProject._manualStatus; }
    checkAllCompleted(targetProject);
    logActivity('Copied ' + clones.length + ' task(s) to "' + targetProject.title + '"');
    scheduleSave(); autoArrangeProjects(true); render();
    showToast((clones.length > 1 ? clones.length + ' tasks' : '"' + clones[0].title + '"') + ' copied to "' + targetProject.title + '"', false, true);
    _pasteArmed = false; root.classList.remove('pf-paste-armed');
    clearSubSelect(); splitMultiSelect = []; const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove();
  }
  function pasteClipboardUnder(targetProject, targetSub) {
    if (!_taskClipboard || !_taskClipboard.length) return;
    const nodes = _taskClipboard;
    if (nodes.some(n => n.id === targetSub.id || isDescendant(n, targetSub.id))) {
      showToast('⚠ Can\'t paste a task under itself or its own child', true);
      return;
    }
    snapshot();
    const clones = nodes.map(deepCloneSubtree);
    if (!targetSub.subtasks) targetSub.subtasks = [];
    clones.forEach(c => targetSub.subtasks.push(c));
    targetSub.expanded = true;
    if (targetProject._manualStatus) { delete targetProject._manualStatus; }
    checkAllCompleted(targetProject);
    logActivity('Copied ' + clones.length + ' task(s) under "' + targetSub.title + '"');
    scheduleSave(); autoArrangeProjects(true); render();
    showToast((clones.length > 1 ? clones.length + ' tasks' : '"' + clones[0].title + '"') + ' pasted under "' + targetSub.title + '"', false, true);
    _pasteArmed = false; root.classList.remove('pf-paste-armed');
    clearSubSelect(); splitMultiSelect = []; const bar2 = root.querySelector('.pf-sub-select-bar'); if (bar2) bar2.remove();
  }
  function renderSelection() {
    canvas.querySelectorAll('.pf-node').forEach(n => {
      n.classList.remove('pf-node-selected');
      const p = projects.find(pr => pr.id === n.dataset.id);
      if (p && p.color) { n.style.borderColor = p.color; n.style.boxShadow = '0 0 0 1px ' + p.color + '22, 0 2px 10px rgba(0,0,0,0.25)'; }
      else { n.style.borderColor = ''; n.style.boxShadow = ''; }
    });
    if (selectedProjectId) {
      const el = canvas.querySelector('.pf-node[data-id="' + selectedProjectId + '"]');
      if (el) { el.classList.add('pf-node-selected'); const isLight = root.classList.contains('pf-theme-light'); const selColor = isLight ? '#000000' : '#ffffff'; el.style.borderColor = selColor; el.style.boxShadow = '0 0 0 2px ' + selColor + ', 0 2px 10px rgba(0,0,0,0.25)'; }
    }
  }
  function matchesDueFilter(p) {
    if (dueFilter === 'all') return true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const startOfNextWeek = new Date(endOfWeek); startOfNextWeek.setDate(startOfNextWeek.getDate() + 1);
    const endOfNextWeek = new Date(startOfNextWeek); endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    function hasDue(node) {
      if (node.dueAt && node.status !== 'completed') {
        const d = new Date(node.dueAt + 'T00:00:00');
        if (dueFilter === 'overdue' && d < today) return true;
        if (dueFilter === 'today' && d.getTime() === today.getTime()) return true;
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        if (dueFilter === 'tomorrow' && d.getTime() === tomorrow.getTime()) return true;
        if (dueFilter === 'week' && d >= today && d <= endOfWeek) return true;
        if (dueFilter === 'nextweek' && d >= startOfNextWeek && d <= endOfNextWeek) return true;
        if (dueFilter === 'month') { const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0); endOfMonth.setHours(23,59,59,999); if (d >= today && d <= endOfMonth) return true; }
      }
      if (node.subtasks) { for (const s of node.subtasks) { if (hasDue(s)) return true; } }
      return false;
    }
    if (dueFilter === 'nodue') { return !p.dueAt && (!p.subtasks || !p.subtasks.some(function check(s) { return s.dueAt || (s.subtasks && s.subtasks.some(check)); })); }
    return hasDue(p);
  }
  let _searchCache = {}; let _searchCacheKey = '';
  function invalidateSearchCache() { _searchCache = {}; _searchCacheKey = ''; }
  function matchesSearch(p) {
    const cacheKey = searchTerm + '|' + statusFilter + '|' + dueFilter;
    if (cacheKey !== _searchCacheKey) { _searchCache = {}; _searchCacheKey = cacheKey; }
    if (_searchCache.hasOwnProperty(p.id)) return _searchCache[p.id];
    const result = _matchesSearchInner(p);
    _searchCache[p.id] = result;
    return result;
  }
  function _matchesSearchInner(p) {
    if (!matchesDueFilter(p)) return false;
    if (statusFilter) {
      const hasStatus = p.status === statusFilter || (function walk(list) { for (const s of list) { if (s.status === statusFilter) return true; if (s.subtasks && s.subtasks.length && walk(s.subtasks)) return true; } return false; })(p.subtasks);
      if (!hasStatus) return false;
    }
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    if (p.title.toLowerCase().includes(q)) return true;
    if (p.description && p.description.toLowerCase().includes(q)) return true;
    if (p.category && p.category.toLowerCase().includes(q)) return true;
    if (p.status.toLowerCase().includes(q)) return true;
    function walkSubs(list) { for (const s of list) { if (s.title.toLowerCase().includes(q)) return true; if (s.description && s.description.toLowerCase().includes(q)) return true; if (s.comments && s.comments.length && s.comments.some(c => (c.text || c).toLowerCase().includes(q))) return true; if (s.subtasks && s.subtasks.length && walkSubs(s.subtasks)) return true; } return false; }
    if (walkSubs(p.subtasks)) return true;
    return false;
  }
  function renderOverdueBanner() {
    const banner = document.getElementById('pf-overdue-banner');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueItems = [];
    function walk(list, projectTitle) { list.forEach(s => { if (s.dueAt && s.status !== 'completed') { const d = new Date(s.dueAt + 'T00:00:00'); if (d < today) overdueItems.push({ title: s.title, project: projectTitle }); } if (s.subtasks && s.subtasks.length) walk(s.subtasks, projectTitle); }); }
    projects.forEach(p => { if (p.dueAt && p.status !== 'completed') { const d = new Date(p.dueAt + 'T00:00:00'); if (d < today) overdueItems.push({ title: p.title, project: null }); } walk(p.subtasks, p.title); });
    if (!overdueItems.length) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
    banner.innerHTML = '<span class="pf-overdue-banner-icon">⚠️</span><span class="pf-overdue-banner-text">' + overdueItems.length + ' overdue item' + (overdueItems.length > 1 ? 's' : '') + ': ' + overdueItems.slice(0, 3).map(i => '<b>' + escapeHtml(i.title) + '</b>').join(', ') + (overdueItems.length > 3 ? ' and ' + (overdueItems.length - 3) + ' more' : '') + '</span><button class="pf-overdue-banner-dismiss" title="Dismiss">×</button>';
    banner.querySelector('.pf-overdue-banner-dismiss').addEventListener('click', () => { banner.style.display = 'none'; });
  }
  let _arranging = false;
  function detectOverlap() {
    const nodes = Array.from(canvas.querySelectorAll('.pf-node')).filter(n => n.style.display !== 'none');
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]; const ax = a.offsetLeft, ay = a.offsetTop, aw = a.offsetWidth, ah = a.offsetHeight;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]; const bx = b.offsetLeft, by = b.offsetTop, bw = b.offsetWidth, bh = b.offsetHeight;
        if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) return true;
      }
    }
    return false;
  }
  let _updatingStatuses = false;
  function autoUpdateStatuses() {
    if (_updatingStatuses) return;
    _updatingStatuses = true;
    projects.forEach(p => {
      if (!p.subtasks || !p.subtasks.length) return;
      const hasAnyDone = (function check(list) { return list.some(s => s.status === 'completed' || s.status === 'ongoing' || s.status === 'waiting' || s.dueAt || (s.subtasks && s.subtasks.length && check(s.subtasks))); })(p.subtasks);
      const allDone = (function check(list) { return list.every(s => s.status === 'completed' && (!s.subtasks || !s.subtasks.length || check(s.subtasks))); })(p.subtasks);
      if (allDone && p.status !== 'completed') { p.status = 'completed'; p.completedAt = new Date().toISOString(); }
      else if (!allDone && p.status === 'completed' && !p._manualStatus) { p.status = hasAnyDone ? 'ongoing' : 'planned'; p.completedAt = null; }
      else if (!allDone && hasAnyDone && p.status === 'planned' && !p._manualStatus) { p.status = 'ongoing'; }
    });
    _updatingStatuses = false;
  }
  function render() {
    autoPopulateToday();
    if (calendarPanel.style.display !== 'none') { renderCalendar(); }
    if (listViewActive) {
      renderStats(); renderDuePanel(); renderOverdueBanner(); renderSplitList(); renderSplitDetail();
      document.getElementById('pf-export').disabled = !projects.length;
      return;
    }
    if (!listViewActive) { canvas.querySelectorAll('.pf-node').forEach(n => n.remove()); if (!projects.length) { emptyEl.style.display = 'block'; } else { emptyEl.style.display = 'none'; projects.forEach(p => { const el = projectEl(p); if (p.category && collapsedCategories[p.category]) el.style.display = 'none'; else if (!matchesSearch(p)) el.style.display = 'none'; canvas.appendChild(el); }); } } document.getElementById('pf-export').disabled = !projects.length; renderStats(); renderDuePanel(); renderCategoryZones(); renderOverdueBanner(); if (!_arranging && detectOverlap()) { _arranging = true; autoArrangeProjects(true); _arranging = false; }
  }
  const searchInput = document.getElementById('pf-search');
  const searchWrap = document.getElementById('pf-search-wrap');
  const searchToggle = document.getElementById('pf-search-toggle');
  searchToggle.addEventListener('click', () => {
    searchWrap.classList.toggle('pf-search-open');
    if (searchWrap.classList.contains('pf-search-open')) { searchInput.focus(); }
    else { searchInput.value = ''; searchTerm = ''; searchWrap.classList.remove('pf-has-value'); if (listViewActive) { renderSplitList(); renderSplitDetail(); } else { autoArrangeProjects(true); } }
  });
  searchInput.addEventListener('blur', () => { if (!searchInput.value) searchWrap.classList.remove('pf-search-open'); });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { searchInput.value = ''; searchTerm = ''; searchWrap.classList.remove('pf-has-value', 'pf-search-open'); searchInput.blur(); if (listViewActive) { renderSplitList(); renderSplitDetail(); } else { autoArrangeProjects(true); } } });
  searchInput.addEventListener('input', (e) => { searchTerm = e.target.value.trim(); _searchAutoCollapseId = null; searchWrap.classList.toggle('pf-has-value', !!searchTerm); if (listViewActive) { renderSplitList(); renderSplitDetail(); } else { autoArrangeProjects(true); } });
  document.getElementById('pf-search-clear').addEventListener('click', () => { searchInput.value = ''; searchTerm = ''; searchWrap.classList.remove('pf-has-value'); searchWrap.classList.remove('pf-search-open'); if (listViewActive) { renderSplitList(); renderSplitDetail(); } else { autoArrangeProjects(true); } });
  document.getElementById('pf-search-close').addEventListener('click', () => { searchInput.value = ''; searchTerm = ''; searchWrap.classList.remove('pf-has-value', 'pf-search-open'); searchInput.blur(); if (listViewActive) { renderSplitList(); renderSplitDetail(); } else { autoArrangeProjects(true); } });
  document.getElementById('pf-due-filter').addEventListener('change', (e) => { dueFilter = e.target.value; autoArrangeProjects(true); });

  document.getElementById('pf-new-project').addEventListener('click', openNewProjectCategoryPicker);
  document.getElementById('pf-undo').addEventListener('click', undo);
  document.getElementById('pf-redo').addEventListener('click', redo);
  document.getElementById('pf-arrange').addEventListener('click', autoArrangeProjects);
  const toggleAllBtn = document.getElementById('pf-toggle-all');
  toggleAllBtn.addEventListener('click', () => {
    if (listViewActive) {
      const allExpanded = projects.every(p => (function check(list) { return list.every(s => (!s.subtasks || !s.subtasks.length || (s.expanded && check(s.subtasks)))); })(p.subtasks));
      projects.forEach(p => { (function setAll(list, val) { list.forEach(s => { s.expanded = val; if (s.subtasks && s.subtasks.length) setAll(s.subtasks, val); }); })(p.subtasks, !allExpanded); });
      render();
      toggleAllBtn.innerHTML = allExpanded ? '📖' : '📕'; toggleAllBtn.title = allExpanded ? 'Expand all' : 'Collapse all';
    } else {
      snapshot(); const allExpanded = projects.every(p => p.expanded); projects.forEach(p => { p.expanded = !allExpanded; }); scheduleSave(); render(); requestAnimationFrame(() => { requestAnimationFrame(() => { autoArrangeProjects(true); }); }); toggleAllBtn.innerHTML = allExpanded ? '📖' : '📕'; toggleAllBtn.title = allExpanded ? 'Expand all' : 'Collapse all';
    }
  });
  document.getElementById('pf-autofit-all').addEventListener('click', () => { snapshot(); projects.forEach(p => { p.height = null; p.width = null; }); scheduleSave(); autoArrangeProjects(true); });
  const collapseCatsBtn = document.getElementById('pf-collapse-cats');
  let listViewActive = true;
  const splitView = document.getElementById('pf-split-view');
  const splitList = document.getElementById('pf-split-list');
  const splitDetail = document.getElementById('pf-split-detail');
  let splitSelectedId = null;
  let splitMultiSelect = [];
  let splitCollapsedCats = {};
  let _splitCatMultiSelect = [];

  let _splitSelectTimer = null;
  window._splitSelectSuppressed = false;
  window._splitSelect = function(id, ev) {
    if (window._splitSelectSuppressed) { window._splitSelectSuppressed = false; return; }
    if (ev && ev.target.closest('.pf-split-list-edit')) return;
    if (ev && ev.target.closest('.pf-split-list-ctx')) return;
    if (ev && ev.detail >= 2) return;
    if ((ev && (ev.ctrlKey || ev.metaKey)) || splitMultiSelect.length > 0) {
      const idx = splitMultiSelect.indexOf(id);
      if (idx > -1) splitMultiSelect.splice(idx, 1); else splitMultiSelect.push(id);
      if (splitMultiSelect.length === 0) splitSelectedId = null;
      else if (splitMultiSelect.length === 1) splitSelectedId = splitMultiSelect[0];
      renderSplitList(); renderSplitDetail();
      return;
    }
    clearTimeout(_splitSelectTimer);
    _splitSelectTimer = setTimeout(() => {
      splitMultiSelect = [];
      splitSelectedId = id;
      renderSplitList(); renderSplitDetail();
      root.classList.add('pf-detail-open');
      if (window.innerWidth <= 1024 && 'ontouchstart' in window) root.classList.add('pf-mobile-detail-open');
      if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = '';
    }, 200);
  };
  window._splitCycleSelected = function(targetStatus) {
    if (!splitMultiSelect.length) return;
    snapshot();
    splitMultiSelect.forEach(id => {
      const p = projects.find(pr => pr.id === id);
      if (!p) return;
      const oldStatus = p.status;
      p.status = targetStatus || STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      if (p.status === oldStatus) return;
      p._manualStatus = true;
      p.completedAt = p.status === 'completed' ? new Date().toISOString() : null;
      logActivity('"' + p.title + '" status: ' + STATUS_LABEL[oldStatus] + ' → ' + STATUS_LABEL[p.status]);
    });
    scheduleSave(); renderSplitList(); renderSplitDetail();
  };
  window._splitDeleteSelected = function() {
    if (!splitMultiSelect.length) return;
    if (!confirm('Delete ' + splitMultiSelect.length + ' project(s)?')) return;
    snapshot();
    const count = splitMultiSelect.length;
    splitMultiSelect.forEach(id => { const p = projects.find(pr => pr.id === id); if (p) { logActivity('Trashed project "' + p.title + '"'); trashProject(p); } });
    projects = projects.filter(p => !splitMultiSelect.includes(p.id));
    splitMultiSelect = [];
    splitSelectedId = null;
    scheduleSave();
    renderSplitList(); renderSplitDetail();
    showToast(count + ' project(s) moved to trash', false, true);
  };
  let splitSortMode = 'due-cat';
  (async function loadSortMode() { try { const res = await safeGet('project-flow-sort-mode', false); if (res && res.value) splitSortMode = res.value; } catch (e) {} })();
  let showCompletedProjects = false;
  (async function loadHideCompleted() { try { const res = await safeGet('project-flow-hide-completed', false); if (res && res.value) showCompletedProjects = res.value === 'true'; } catch (e) {} })();
  function sortProjects(list) {
    const sorted = splitSortMode === 'manual' ? list : list.slice().sort((a, b) => {
      if (splitSortMode === 'name') return a.title.localeCompare(b.title);
      if (splitSortMode === 'status') return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
      if (splitSortMode === 'due-cat' || splitSortMode === 'due') {
        function earliestDue(p) { let earliest = p.dueAt || null; (function walk(list) { list.forEach(s => { if (s.dueAt && s.status !== 'completed' && (!earliest || s.dueAt < earliest)) earliest = s.dueAt; if (s.subtasks && s.subtasks.length) walk(s.subtasks); }); })(p.subtasks || []); return earliest || '9999'; }
        return earliestDue(a).localeCompare(earliestDue(b));
      }
      if (splitSortMode === 'created') return (b.createdAt || '').localeCompare(a.createdAt || '');
      return 0;
    });
    const active = sorted.filter(p => p.status !== 'completed');
    const completed = sorted.filter(p => p.status === 'completed');
    return active.concat(completed);
  }
  function renderSplitList() {
    splitList.innerHTML = '';
    const sortBar = document.createElement('div');
    sortBar.className = 'pf-split-sort';
    sortBar.innerHTML = '<button id="pf-split-collapse-all" class="pf-split-collapse-btn" title="Collapse/Expand all categories">▾ All</button>' +
      '<button id="pf-split-hide-completed" class="pf-split-collapse-btn' + (showCompletedProjects ? ' pf-split-toggle-active' : '') + '" title="Show completed projects">' + (showCompletedProjects ? '☑' : '☐') + ' Completed</button>' +
      '<span class="pf-split-sort-label">Sort:</span><select id="pf-split-sort-sel"><option value="manual">Manual</option><option value="name">Name</option><option value="status">Status</option><option value="due-cat">Due Date</option><option value="created">Newest</option></select>';
    splitList.appendChild(sortBar);
    sortBar.querySelector('select').value = splitSortMode;
    sortBar.querySelector('select').addEventListener('change', (e) => { splitSortMode = e.target.value; safeSet('project-flow-sort-mode', splitSortMode, false); renderSplitList(); });
    sortBar.querySelector('#pf-split-hide-completed').addEventListener('click', () => { showCompletedProjects = !showCompletedProjects; safeSet('project-flow-hide-completed', String(showCompletedProjects), false); renderSplitList(); });
    const collapseBtn = sortBar.querySelector('#pf-split-collapse-all');
    const allCollapsed = categories.length > 0 && categories.every(c => splitCollapsedCats[c]);
    collapseBtn.textContent = allCollapsed ? '▸ All' : '▾ All';
    collapseBtn.addEventListener('click', () => {
      if (allCollapsed) { categories.forEach(c => { splitCollapsedCats[c] = false; }); }
      else { categories.forEach(c => { splitCollapsedCats[c] = true; }); }
      renderSplitList();
    });
    if (splitMultiSelect.length >= 1) {
      const bar = document.createElement('div');
      bar.className = 'pf-split-delete-bar';
      bar.innerHTML = '<span>' + splitMultiSelect.length + ' selected</span><button data-action="cycle">Set status</button><button data-action="archive">📦 Archive</button><button data-action="delete">Delete selected</button><button data-action="clear">✕ Clear</button>';
      bar.querySelector('[data-action="cycle"]').addEventListener('click', (e) => { openStatusMenu(e.currentTarget, null, (st) => _splitCycleSelected(st)); });
      bar.querySelector('[data-action="archive"]').addEventListener('click', () => {
        snapshot();
        const count = splitMultiSelect.length;
        splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) { archiveProject(pr); logActivity('Archived project "' + pr.title + '"'); } });
        projects = projects.filter(pr => !splitMultiSelect.includes(pr.id));
        splitMultiSelect = []; splitSelectedId = null;
        scheduleSave(); renderSplitList(); renderSplitDetail();
        showToast('📦 Archived ' + count + ' project' + (count === 1 ? '' : 's'));
      });
      bar.querySelector('[data-action="delete"]').addEventListener('click', () => { _splitDeleteSelected(); });
      bar.querySelector('[data-action="clear"]').addEventListener('click', () => { splitMultiSelect = []; splitSelectedId = null; renderSplitList(); renderSplitDetail(); });
      splitList.appendChild(bar);
    }
    if (_splitCatMultiSelect.length >= 1) {
      const bar = document.createElement('div');
      bar.className = 'pf-split-delete-bar';
      bar.innerHTML = '<span>' + _splitCatMultiSelect.length + ' categor' + (_splitCatMultiSelect.length === 1 ? 'y' : 'ies') + ' selected</span><button id="_splitCatDelBtn">Delete selected</button>';
      splitList.appendChild(bar);
      bar.querySelector('#_splitCatDelBtn').addEventListener('click', () => {
        snapshot();
        _splitCatMultiSelect.forEach(cat => {
          categories = categories.filter(c => c !== cat);
          projects.forEach(p => { if (p.category === cat) p.category = null; });
        });
        _splitCatMultiSelect = [];
        saveCategories(); scheduleSave(); renderCategoryList(); render();
      });
    }
    const grouped = {};
    sortProjects(projects.filter(p => matchesSearch(p) && (showCompletedProjects || p.status !== 'completed'))).forEach(p => { const cat = p.category || '__uncategorized__'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(p); });
    // Include any categories from projects not in the categories array
    const extraCats = Object.keys(grouped).filter(c => c !== '__uncategorized__' && !categories.includes(c));
    if (extraCats.length) { categories.push(...extraCats); saveCategories(); }
    const catOrder = categories.concat(grouped['__uncategorized__'] ? ['__uncategorized__'] : []);
    catOrder.forEach(cat => {
      const group = grouped[cat] || [];

      const catLabel = document.createElement('div');
      catLabel.className = 'pf-split-list-cat';
      if (_splitCatMultiSelect.includes(cat)) { catLabel.style.background = 'rgba(123,104,238,0.15)'; catLabel.style.color = 'var(--accent)'; }
      const catEmoji = categoryEmojis[cat] || '';
      catLabel.textContent = (catEmoji ? catEmoji + ' ' : '') + (cat === '__uncategorized__' ? 'Uncategorized' : cat) + ' (' + group.length + ')';
      catLabel.style.cursor = 'pointer';
      const _catColor = cat === '__uncategorized__' ? 'var(--text-dim)' : categoryColor(cat);
      catLabel.style.borderLeft = 'none';
      catLabel.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (cat === '__uncategorized__') return;
          const idx = _splitCatMultiSelect.indexOf(cat);
          if (idx > -1) _splitCatMultiSelect.splice(idx, 1); else _splitCatMultiSelect.push(cat);
          renderSplitList();
          return;
        }
        _splitCatMultiSelect = [];
        splitCollapsedCats[cat] = !splitCollapsedCats[cat]; renderSplitList();
      });
      if (cat !== '__uncategorized__') {
        catLabel.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation(); _closeCtx();
          const menu = document.createElement('div');
          menu.className = 'pf-ctx-menu';
          menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
          const emojiItem = document.createElement('div');
          emojiItem.className = 'pf-ctx-menu-item';
          emojiItem.textContent = '😀 Set Emoji';
          emojiItem.addEventListener('click', (ev) => {
            ev.stopPropagation(); _closeCtx();
            const emoji = prompt('Enter an emoji for "' + cat + '":', categoryEmojis[cat] || '');
            if (emoji === null) return;
            if (emoji.trim() === '') { delete categoryEmojis[cat]; } else { categoryEmojis[cat] = emoji.trim(); }
            saveCatEmojis(); renderSplitList();
          });
          menu.appendChild(emojiItem);
          const renItem = document.createElement('div');
          renItem.className = 'pf-ctx-menu-item';
          renItem.textContent = '✏️ Rename Category';
          renItem.addEventListener('click', (ev) => {
            ev.stopPropagation(); _closeCtx();
            const newName = prompt('Rename category:', cat);
            if (!newName || newName.trim() === '' || newName.trim() === cat) return;
            const trimmed = newName.trim();
            if (categories.includes(trimmed)) { showToast('Category "' + trimmed + '" already exists'); return; }
            snapshot();
            const idx = categories.indexOf(cat);
            if (idx > -1) categories[idx] = trimmed;
            projects.forEach(p => { if (p.category === cat) p.category = trimmed; });
            if (splitCollapsedCats[cat]) { splitCollapsedCats[trimmed] = true; delete splitCollapsedCats[cat]; }
            if (categoryEmojis[cat]) { categoryEmojis[trimmed] = categoryEmojis[cat]; delete categoryEmojis[cat]; saveCatEmojis(); }
            saveCategories(); scheduleSave(); render();
          });
          menu.appendChild(renItem);
          const delItem = document.createElement('div');
          delItem.className = 'pf-ctx-menu-item pf-ctx-danger';
          delItem.textContent = '🗑 Delete Category';
          delItem.addEventListener('click', (ev) => {
            ev.stopPropagation(); _closeCtx(); snapshot();
            if (!confirm('Delete category "' + cat + '"? Projects will become uncategorized.')) return;
            categories = categories.filter(c => c !== cat);
            projects.forEach(p => { if (p.category === cat) p.category = null; });
            saveCategories(); scheduleSave(); renderCategoryList(); render();
          });
          menu.appendChild(delItem);
          root.appendChild(menu);
          _positionCtxMenu(menu);
          _ctxEl = menu;
        });
      }
      const catAddBtn = document.createElement('button');
      catAddBtn.textContent = '+';
      catAddBtn.title = 'New project in ' + (cat === '__uncategorized__' ? 'Uncategorized' : cat);
      catAddBtn.style.cssText = 'background:transparent;border:none;color:var(--text-dim);font-size:16px;font-weight:700;cursor:pointer;margin-right:4px;padding:0 2px;border-radius:6px;line-height:1;';
      catAddBtn.addEventListener('mouseenter', () => { catAddBtn.style.color = 'var(--accent)'; });
      catAddBtn.addEventListener('mouseleave', () => { catAddBtn.style.color = 'var(--text-dim)'; });
      catAddBtn.addEventListener('click', (e) => { e.stopPropagation(); addProject(cat === '__uncategorized__' ? null : cat); });
      catLabel.style.display = 'flex'; catLabel.style.alignItems = 'center';
      if (cat !== '__uncategorized__') {
        catLabel.draggable = true;
        catLabel.dataset.catName = cat;
        catLabel.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-category', cat); catLabel.style.opacity = '0.4'; });
        catLabel.addEventListener('dragend', () => { catLabel.style.opacity = ''; splitList.querySelectorAll('.pf-split-list-cat').forEach(el => { el.style.borderBottom = ''; el.style.borderTop = ''; }); });
      }
      catLabel.addEventListener('dragover', (e) => {
        e.preventDefault();
        const catData = e.dataTransfer.types.includes('text/x-category');
        if (catData && cat !== '__uncategorized__') {
          e.dataTransfer.dropEffect = 'move';
          splitList.querySelectorAll('.pf-split-list-cat').forEach(el => { el.style.borderTop = ''; });
          catLabel.style.borderTop = '3px solid var(--accent)';
        } else {
          e.dataTransfer.dropEffect = 'move';
          catLabel.style.background = 'rgba(123,104,238,0.15)';
        }
      });
      catLabel.addEventListener('dragleave', () => { catLabel.style.background = ''; catLabel.style.borderTop = ''; });
      catLabel.addEventListener('drop', (e) => {
        e.preventDefault(); catLabel.style.background = ''; catLabel.style.borderTop = '';
        const draggedCat = e.dataTransfer.getData('text/x-category');
        if (draggedCat && cat !== '__uncategorized__') {
          const fromIdx = categories.indexOf(draggedCat);
          const toIdx = categories.indexOf(cat);
          if (fromIdx > -1 && toIdx > -1 && fromIdx !== toIdx) {
            categories.splice(fromIdx, 1);
            categories.splice(toIdx, 0, draggedCat);
            saveCategories(); renderSplitList(); render();
          }
          return;
        }
        const srcId = e.dataTransfer.getData('text/plain'); if (!srcId) return; const p = projects.find(pr => pr.id === srcId); if (!p) return; const newCat = cat === '__uncategorized__' ? null : cat; if (p.category === newCat) return; snapshot(); p.category = newCat; scheduleSave(); renderSplitList(); renderSplitDetail();
      });
      const _isCollapsed = !!splitCollapsedCats[cat];
      const txt = catLabel.textContent + (_isCollapsed ? ' ▸' : ' ▾'); catLabel.textContent = '';
      const catLabelText = document.createElement('span');
      catLabelText.textContent = txt;
      catLabelText.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      catAddBtn.style.marginRight = '0';
      catAddBtn.style.marginLeft = '4px';
      catLabel.appendChild(catLabelText);
      catLabel.appendChild(catAddBtn);
      splitList.appendChild(catLabel);
      const catItemsWrap = document.createElement('div');
      catItemsWrap.className = 'pf-cat-items-wrap' + (_isCollapsed ? ' pf-collapsed' : '');
      if (!group.length && !_isCollapsed) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:var(--text-dim);padding:8px 16px;font-style:italic;opacity:0.7;';
        hint.textContent = 'No projects in this category';
        catItemsWrap.appendChild(hint);
      }
      let idx = 0;
      group.forEach(p => {
        const item = document.createElement('div');
        const isActive = p.id === splitSelectedId && splitMultiSelect.length <= 1;
        const isMulti = splitMultiSelect.includes(p.id);
        item.className = 'pf-split-list-item' + (isActive ? ' pf-split-active' : '') + (isMulti ? ' pf-split-selected' : '') + (p.status === 'completed' ? ' pf-list-completed' : '');
        item.style.animationDelay = (Math.min(idx, 20) * 15) + 'ms';
        idx++;
        item.setAttribute('onclick', '_splitSelect("' + p.id + '", event)');
        item.addEventListener('dblclick', (e) => { e.stopPropagation(); _inlineRename(item, p); });
        if (!window.matchMedia('(pointer: coarse)').matches) item.draggable = true;
        item.dataset.projectId = p.id;
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          const ids = splitMultiSelect.length && splitMultiSelect.includes(p.id) ? splitMultiSelect : [p.id];
          e.dataTransfer.setData('text/plain', ids.join(','));
          splitList.querySelectorAll('.pf-split-list-item').forEach(el => { if (ids.includes(el.dataset.projectId)) el.classList.add('pf-dragging'); });
        });
        item.addEventListener('dragend', () => { splitList.querySelectorAll('.pf-split-list-item').forEach(el => el.classList.remove('pf-dragging')); splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove()); });
        item.addEventListener('dragover', (e) => {
          e.preventDefault(); e.dataTransfer.dropEffect = 'move';
          splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove());
          const indicator = document.createElement('div');
          indicator.className = 'pf-split-drop-indicator';
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) { item.parentNode.insertBefore(indicator, item); }
          else { item.parentNode.insertBefore(indicator, item.nextSibling); }
        });
        item.addEventListener('dragleave', (e) => { if (!item.contains(e.relatedTarget)) { splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove()); } });
        item.addEventListener('drop', (e) => {
          e.preventDefault();
          splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove());
          const raw = e.dataTransfer.getData('text/plain'); if (!raw) return;
          const ids = raw.split(',').filter(id => id && id !== p.id);
          if (!ids.length) return;
          snapshot();
          const newCat = cat === '__uncategorized__' ? null : cat;
          const moved = [];
          ids.forEach(id => { const src = projects.find(pr => pr.id === id); if (src) { src.category = newCat; moved.push(src); } });
          projects = projects.filter(pr => !ids.includes(pr.id));
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          let destIdx = projects.findIndex(pr => pr.id === p.id);
          if (e.clientY >= midY) destIdx++;
          projects.splice(destIdx, 0, ...moved);
          splitMultiSelect = [];
          scheduleSave(); renderSplitList(); renderSplitDetail();
          moved.forEach(m => { const el = splitList.querySelector('[data-project-id="' + m.id + '"]'); if (el) { el.classList.add('pf-drop-settling'); el.addEventListener('animationend', () => el.classList.remove('pf-drop-settling'), { once: true }); } });
        });
        const tc = countTree(p.subtasks);
        const pct = tc.total ? tc.done / tc.total : 0;
        const pctLabel = Math.round(pct * 100);
        const r = 8, circ = 2 * Math.PI * r, offset = circ * (1 - pct);
        const progressHtml = tc.total ? '<svg class="pf-progress-ring" width="20" height="20" viewBox="0 0 20 20" title="' + pctLabel + '% complete"><circle cx="10" cy="10" r="' + r + '" fill="none" stroke="var(--card-border)" stroke-width="2.5"/><circle cx="10" cy="10" r="' + r + '" fill="none" stroke="var(--' + (p.status === 'waiting' ? 'accent' : p.status) + ')" stroke-width="2.5" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 10 10)"/></svg><span class="pf-split-list-progress" title="' + pctLabel + '% complete">' + tc.done + '/' + tc.total + '</span>' : '';
        let dueHtml = '<span class="pf-split-list-due"></span>';
        if (p.dueAt) {
          const now = new Date(); now.setHours(0,0,0,0);
          const due = new Date(p.dueAt + 'T00:00:00');
          const isOverdue = due < now && p.status !== 'completed';
          dueHtml = '<span class="pf-split-list-due' + (isOverdue ? ' pf-overdue' : '') + '">' + formatDateShort(p.dueAt) + '</span>';
        }
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (window.matchMedia('(pointer: coarse)').matches) return; _showCtxMenu(e.clientX, e.clientY, p); });
        item.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); _inlineRename(item, p); });
        item.addEventListener('click', (e) => { if (e.target.closest('.pf-split-list-edit')) { e.stopPropagation(); _inlineRename(item, p); } });

        if (p.dueAt) { const td = new Date(); td.setHours(0,0,0,0); if (p.dueAt === td.toISOString().slice(0,10) && p.status !== 'completed') item.classList.add('pf-due-today'); }
        const emojiIcon = p.emoji || '';
        item.innerHTML = (emojiIcon ? '<span class="pf-emoji-btn" style="font-size:13px;">' + emojiIcon + '</span>' : '') +
          '<span class="pf-split-list-title" title="' + escapeHtml(p.title) + '">' + (searchTerm ? highlightMatch(escapeHtml(p.title), searchTerm) : escapeHtml(p.title)) + '</span>' +
          progressHtml +
          '<button class="pf-split-list-edit" title="Rename">✏️</button>' +
          '<button class="pf-split-list-move pf-move-up" title="Move up">▲</button>' +
          '<button class="pf-split-list-move pf-move-down" title="Move down">▼</button>' +
          '<button class="pf-split-list-ctx" title="More actions">⋮</button>';
        item.querySelector('.pf-move-up').addEventListener('click', (e) => { e.stopPropagation(); const idx = projects.findIndex(pr => pr.id === p.id); if (idx <= 0) return; snapshot(); projects.splice(idx - 1, 0, projects.splice(idx, 1)[0]); scheduleSave(); renderSplitList(); });
        item.querySelector('.pf-move-down').addEventListener('click', (e) => { e.stopPropagation(); const idx = projects.findIndex(pr => pr.id === p.id); if (idx >= projects.length - 1) return; snapshot(); projects.splice(idx + 1, 0, projects.splice(idx, 1)[0]); scheduleSave(); renderSplitList(); });
        item.querySelector('.pf-split-list-ctx').addEventListener('click', (e) => { e.stopPropagation(); const rect = e.target.getBoundingClientRect(); _showCtxMenu(rect.left, rect.top, p); });
        catItemsWrap.appendChild(item);
      });
      splitList.appendChild(catItemsWrap);
    });
    // Virtual scrolling: hide off-screen items when list is large
    _virtualizeList();
  }
  let _splitVirtualCleanup = null;
  function _virtualizeList() {
    if (_splitVirtualCleanup) { _splitVirtualCleanup(); _splitVirtualCleanup = null; }
    const items = splitList.querySelectorAll('.pf-split-list-item');
    if (items.length <= 50) return;
    const ITEM_H = 40, BUFFER = 10;
    const topSpacer = document.createElement('div'); topSpacer.className = 'pf-virt-spacer-top';
    const botSpacer = document.createElement('div'); botSpacer.className = 'pf-virt-spacer-bot';
    // Convert items to array with original positions
    const allItems = Array.from(items);
    const parents = allItems.map(el => el.parentNode);
    const nexts = allItems.map(el => el.nextSibling);
    function applyVirtual() {
      const scrollTop = splitList.scrollTop;
      const viewH = splitList.clientHeight;
      const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
      const endIdx = Math.min(allItems.length, Math.ceil((scrollTop + viewH) / ITEM_H) + BUFFER);
      allItems.forEach((el, i) => {
        if (el.closest('.pf-collapsed')) { el.style.display = ''; return; }
        if (i >= startIdx && i < endIdx) { el.style.display = ''; }
        else { el.style.display = 'none'; }
      });
    }
    applyVirtual();
    let _vScrollTimer = null;
    function onScroll() { if (_vScrollTimer) return; _vScrollTimer = setTimeout(() => { _vScrollTimer = null; applyVirtual(); }, 100); }
    splitList.addEventListener('scroll', onScroll);
    _splitVirtualCleanup = () => { splitList.removeEventListener('scroll', onScroll); if (_vScrollTimer) clearTimeout(_vScrollTimer); };
  }

  let _ctxEl = null;
  function _closeCtx() { if (_ctxEl) { _ctxEl.remove(); _ctxEl = null; } const bd = document.getElementById('pf-ctx-backdrop'); if (bd) bd.style.display = 'none'; }
  function _positionCtxMenu(menu) {
    let backdrop = document.getElementById('pf-ctx-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div'); backdrop.id = 'pf-ctx-backdrop'; document.getElementById('pf-root').appendChild(backdrop);
      backdrop.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); _closeCtx(); });
      backdrop.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); });
      backdrop.addEventListener('touchstart', function(e) { e.preventDefault(); e.stopPropagation(); _closeCtx(); });
    }
    backdrop.style.display = 'block';
    const maxH = window.innerHeight - 16;
    menu.style.maxHeight = maxH + 'px';
    menu.style.overflowY = 'auto';
    void menu.offsetHeight;
    const rect = menu.getBoundingClientRect();
    const menuH = Math.min(rect.height, maxH);
    const menuW = rect.width;
    let clickY = parseInt(menu.style.top) || rect.top;
    let clickX = parseInt(menu.style.left) || rect.left;
    const midScreen = window.innerHeight / 2;
    let newTop, newLeft;
    if (clickY > midScreen) {
      newTop = clickY - menuH;
    } else {
      newTop = clickY;
    }
    newLeft = clickX;
    if (newLeft + menuW > window.innerWidth - 8) newLeft = window.innerWidth - menuW - 8;
    if (newLeft < 8) newLeft = 8;
    if (newTop + menuH > window.innerHeight - 8) newTop = window.innerHeight - menuH - 8;
    if (newTop < 8) newTop = 8;
    menu.style.left = newLeft + 'px';
    menu.style.top = newTop + 'px';
  }
  document.addEventListener('pointerdown', (e) => {
    if (_ctxEl && !_ctxEl.contains(e.target)) { e.preventDefault(); e.stopPropagation(); _closeCtx(); }
  }, true);
  document.addEventListener('contextmenu', _closeCtx);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _ctxEl) { _closeCtx(); e.stopImmediatePropagation(); return; } if (e.key === 'Escape' && (subMultiSelect.length > 0 || splitMultiSelect.length > 0)) { clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove(); splitMultiSelect = []; splitSelectedId = null; renderSplitList(); renderSplitDetail(); e.stopImmediatePropagation(); } });

  splitList.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.pf-split-list-item')) return;
    e.preventDefault();
    e.stopPropagation();
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'pf-ctx-menu';
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    const addItem = document.createElement('div');
    addItem.className = 'pf-ctx-menu-item';
    addItem.textContent = '➕ Add Project';
    addItem.addEventListener('click', (ev) => { ev.stopPropagation(); _closeCtx(); openNewProjectCategoryPicker(); });
    menu.appendChild(addItem);
    const addCatItem = document.createElement('div');
    addCatItem.className = 'pf-ctx-menu-item';
    addCatItem.textContent = '📁 Add Category';
    addCatItem.addEventListener('click', (ev) => {
      ev.stopPropagation(); _closeCtx();
      const name = prompt('New category name:');
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (categories.includes(trimmed)) { showToast('Category already exists.', true); return; }
      categories.push(trimmed); saveCategories(); renderCategoryList(); render();
    });
    menu.appendChild(addCatItem);
    root.appendChild(menu);
    _positionCtxMenu(menu);
    _ctxEl = menu;
  });
  window._showCtxMenu = function(x, y, p) {
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'pf-ctx-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    if (splitMultiSelect.length > 1 && splitMultiSelect.includes(p.id)) {
      const count = splitMultiSelect.length;
      const header = document.createElement('div');
      header.className = 'pf-ctx-menu-item';
      header.style.cssText = 'font-weight:700;opacity:0.6;cursor:default;pointer-events:none;';
      header.textContent = count + ' projects selected';
      menu.appendChild(header);
      const sep = document.createElement('div'); sep.className = 'pf-ctx-menu-sep'; menu.appendChild(sep);
      STATUSES.forEach(st => {
        const el = document.createElement('div');
        el.className = 'pf-ctx-menu-item';
        el.textContent = '→ Set all ' + STATUS_LABEL[st];
        el.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); snapshot(); splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) { pr.status = st; pr.completedAt = st === 'completed' ? new Date().toISOString() : null; } }); splitMultiSelect = []; scheduleSave(); render(); if (listViewActive) { renderSplitList(); renderSplitDetail(); } showToast('✓ Set ' + count + ' projects to ' + STATUS_LABEL[st]); });
        menu.appendChild(el);
      });
      const sep2 = document.createElement('div'); sep2.className = 'pf-ctx-menu-sep'; menu.appendChild(sep2);
      const archiveAll = document.createElement('div');
      archiveAll.className = 'pf-ctx-menu-item';
      archiveAll.textContent = '📦 Archive all';
      archiveAll.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); snapshot(); splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) archiveProject(pr); }); projects = projects.filter(pr => !splitMultiSelect.includes(pr.id)); splitMultiSelect = []; splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('📦 Archived ' + count + ' projects'); });
      menu.appendChild(archiveAll);
      const delAll = document.createElement('div');
      delAll.className = 'pf-ctx-menu-item pf-ctx-danger';
      delAll.textContent = '🗑 Delete all';
      delAll.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); if (!confirm('Delete ' + count + ' projects?')) return; snapshot(); splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) trashProject(pr); }); projects = projects.filter(pr => !splitMultiSelect.includes(pr.id)); splitMultiSelect = []; splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('🗑 Deleted ' + count + ' projects'); });
      menu.appendChild(delAll);
      root.appendChild(menu);
      _positionCtxMenu(menu);
      _ctxEl = menu;
      return;
    }
    const statusNext = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
    const items = [
      // Non-clickable info line showing when this project was created.
      // Uses the existing p.createdAt field (already saved on every
      // project) and the existing formatDateTime() helper.
      ...(p.createdAt ? [{ label: '📅 Created ' + formatDateTime(p.createdAt), info: true }, { sep: true }] : []),
      { label: '✏️ Rename', action: () => { const item = splitList.querySelector('[data-project-id="' + p.id + '"]'); if (item) _inlineRename(item, p); } },
      { label: '⭐ Add to Today', action: () => { addToToday(p.title, p.id, 'project'); } },
      { label: '⏰ Set Reminder', action: () => { promptReminder(p.id, p.title, 'project'); } },
      { label: '→ ' + STATUS_LABEL[statusNext], action: () => { snapshot(); p.status = statusNext; p.completedAt = p.status === 'completed' ? new Date().toISOString() : null; scheduleSave(); render(); } },
      { label: '📋 Duplicate', action: () => { snapshot(); const dup = JSON.parse(JSON.stringify(p)); dup.id = uid(); dup.title += ' (copy)'; projects.push(dup); scheduleSave(); renderSplitList(); } },
    ];

    items.push({ sep: true });
    items.push({ label: '🔁 Repeat: ' + (p.recurrence || 'None'), cycling: true, action: () => { const opts = [null,'daily','weekdays','weekly','biweekly','monthly','quarterly','yearly']; const labels = ['None','Daily','Weekdays','Weekly','Biweekly','Monthly','Quarterly','Yearly']; const cur = opts.indexOf(p.recurrence || null); const next = (cur + 1) % opts.length; snapshot(); p.recurrence = opts[next]; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('Repeat: ' + labels[next]); return '🔁 Repeat: ' + labels[next]; } });
    items.push({ label: '😀 Set Emoji', action: () => { const el = root.querySelector('[data-project-id="' + p.id + '"]') || root.querySelector('.pf-split-active'); if (el) showEmojiPicker(p, el); } });
    items.push({ label: '📦 Archive', action: () => { snapshot(); archiveProject(p); logActivity('Archived project "' + p.title + '"'); projects = projects.filter(pr => pr.id !== p.id); if (splitSelectedId === p.id) splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('"' + p.title + '" archived', false, true); } });
    items.push({ label: '🗑 Delete', danger: true, action: () => { snapshot(); trashProject(p); logActivity('Trashed project "' + p.title + '"'); projects = projects.filter(pr => pr.id !== p.id); if (splitSelectedId === p.id) splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('"' + p.title + '" moved to trash', false, true); } });
    items.forEach(it => {
      if (it.sep) { const s = document.createElement('div'); s.className = 'pf-ctx-menu-sep'; menu.appendChild(s); return; }
      const el = document.createElement('div');
      // Non-clickable info line (e.g. "Created ..."): dimmed text, no
      // hover highlight, no click action — search "it.info" to adjust.
      el.className = 'pf-ctx-menu-item' + (it.danger ? ' pf-ctx-danger' : '') + (it.info ? ' pf-ctx-info' : '');
      el.textContent = it.label;
      if (it.info) { menu.appendChild(el); return; }
      if (it.cycling) {
        el.addEventListener('click', (e) => { e.stopPropagation(); el.textContent = it.action(); });
      } else {
        el.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); it.action(); });
      }
      menu.appendChild(el);
    });
    root.appendChild(menu);
    _positionCtxMenu(menu);
    _ctxEl = menu;
  };

  function _showSubCtxMenu(x, y, p, s) {
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'pf-ctx-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const statusNext = STATUSES[(STATUSES.indexOf(s.status) + 1) % STATUSES.length];
    const isMobile = root.classList.contains('pf-device-mobile');
    const items = [
      // Non-clickable info line showing when this task/subtask was
      // created. Applies to both — in this app, a top-level "task" inside
      // a project is really just a depth-0 subtask, so this one menu
      // covers both cases. Uses the existing s.createdAt field.
      ...(s.createdAt ? [{ label: '📅 Created ' + formatDateTime(s.createdAt), info: true }, { sep: true }] : []),
      ...(!isMobile ? [{ label: '✏️ Edit Title', action: () => { const row = root.querySelector('[data-sub-title-id="' + s.id + '"]'); if (row) { row.contentEditable = 'true'; row.focus(); const range = document.createRange(); range.selectNodeContents(row); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } } }] : []),
      { label: '⭐ Add to Today', action: () => { addToToday(s.title, s.id, 'subtask'); } },
      { label: '⏰ Set Reminder', action: () => { promptReminder(s.id, s.title, 'subtask'); } },
      { label: '→ ' + STATUS_LABEL[statusNext], action: () => { snapshot(); s.status = statusNext; s.completedAt = s.status === 'completed' ? new Date().toISOString() : null; scheduleSave(); render(); } },
      ...(!isMobile ? [{ label: '🔗 Dependencies', action: () => { const chip = root.querySelector('[data-sub-id="' + s.id + '"] .pf-dep-chip'); if (chip) chip.click(); else { const row = root.querySelector('[data-sub-id="' + s.id + '"]'); if (row) { const tempChip = buildDependencyChip(p, s); tempChip.style.position = 'absolute'; tempChip.style.opacity = '0'; row.appendChild(tempChip); tempChip.click(); } } } }] : []),
      ...(!isMobile ? [{ label: '⬆ Promote to Project', action: () => { promoteSubToProject(p, s); } }] : []),
      { label: '📋 Copy to Project…', action: () => { openCopyToProjectModal(p, [s.id]); } },
      { label: '📄 Copy (paste with Ctrl+V)', action: () => { _taskClipboard = [s]; showToast('Task copied — click a project to paste as main task, or a task to nest under it'); } },
      ...(!isMobile ? [{ label: '🔁 Repeat: ' + (s.recurrence || 'None'), cycling: true, action: () => { const opts = [null,'daily','weekdays','weekly','biweekly','monthly','quarterly','yearly']; const labels = ['None','Daily','Weekdays','Weekly','Biweekly','Monthly','Quarterly','Yearly']; const cur = opts.indexOf(s.recurrence || null); const next = (cur + 1) % opts.length; snapshot(); s.recurrence = opts[next]; scheduleSave(); renderSplitDetail(); showToast('Repeat: ' + labels[next]); return '🔁 Repeat: ' + labels[next]; } }] : []),
      { sep: true },
      { label: '🗑 Delete', danger: true, action: () => { deleteSubtask(p.id, s.id); } },
    ];
    items.forEach(it => {
      if (it.sep) { const sep = document.createElement('div'); sep.className = 'pf-ctx-menu-sep'; menu.appendChild(sep); return; }
      const el = document.createElement('div');
      // Non-clickable info line (e.g. "Created ..."): dimmed text, no
      // hover highlight, no click action — search "it.info" to adjust.
      el.className = 'pf-ctx-menu-item' + (it.danger ? ' pf-ctx-danger' : '') + (it.info ? ' pf-ctx-info' : '');
      el.textContent = it.label;
      if (it.info) { menu.appendChild(el); return; }
      if (it.cycling) {
        el.addEventListener('click', (e) => { e.stopPropagation(); el.textContent = it.action(); });
      } else {
        el.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); it.action(); });
      }
      menu.appendChild(el);
    });
    root.appendChild(menu);
    _positionCtxMenu(menu);
    _ctxEl = menu;
  }

  function _inlineRename(item, p) {
    clearTimeout(_splitSelectTimer);
    item.style.animation = 'none';
    const titleEl = item.querySelector('.pf-split-list-title');
    if (!titleEl) return;
    titleEl.contentEditable = 'true';
    titleEl.focus();
    const range = document.createRange(); range.selectNodeContents(titleEl);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const finish = () => {
      titleEl.contentEditable = 'false';
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== p.title) { snapshot(); p.title = newTitle; scheduleSave(); }
      renderSplitList();
    };
    titleEl.addEventListener('blur', finish, { once: true });
    titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } if (e.key === 'Escape') { titleEl.textContent = p.title; titleEl.blur(); } });
  }

  function _goBackToProjects() {
    root.classList.remove('pf-detail-open');
    root.classList.remove('pf-mobile-detail-open');
    splitSelectedId = null;
    renderSplitList(); renderSplitDetail();
    document.getElementById('pf-toolbar-back').style.display = 'none';
  }

  let _searchAutoCollapseId = null;
  let _completedCollapseId = null;
  function renderSplitDetail() {
    splitDetail.innerHTML = '';
    if (!splitSelectedId) { splitDetail.innerHTML += '<div class="pf-empty" style="display:block;">Select a project from the list to view details.</div>'; _completedCollapseId = null; return; }
    const p = projects.find(pr => pr.id === splitSelectedId);
    if (!p) { splitDetail.innerHTML = '<div class="pf-empty" style="display:block;">Project not found.</div>'; return; }
    if (searchTerm && !matchesSearch(p)) { splitDetail.innerHTML = '<div class="pf-empty" style="display:block;">No matching results.</div>'; return; }
    p.expanded = true;
    if (_completedCollapseId !== splitSelectedId) { _completedCollapseId = splitSelectedId; (function collapseCompleted(list) { list.forEach(s => { if (s.status === 'completed') { s.expanded = false; } if (s.subtasks && s.subtasks.length) collapseCompleted(s.subtasks); }); })(p.subtasks || []); }
    if (searchTerm && _searchAutoCollapseId !== splitSelectedId) { _searchAutoCollapseId = splitSelectedId; const q = searchTerm.toLowerCase(); (function collapseAndExpand(list) { let anyMatch = false; list.forEach(s => { const childMatch = s.subtasks && s.subtasks.length && collapseAndExpand(s.subtasks); const selfMatch = s.title.toLowerCase().includes(q); if (selfMatch || childMatch) { s.expanded = true; anyMatch = true; } else { s.expanded = false; } }); return anyMatch; })(p.subtasks || []); }
    try {
      const el = projectEl(p);
      el.style.cssText = 'position: relative; left: auto; top: auto; width: 100%; min-width: 0; max-width: 100%;';
      splitDetail.appendChild(el);
    } catch (e) { console.error('[Orga-naes] renderSplitDetail failed:', e); splitDetail.innerHTML = '<div class="pf-empty" style="display:block;">Error rendering project. Check console for details.</div>'; }
    if (subMultiSelect.length > 0) renderSubSelectBar(p);
    requestAnimationFrame(() => { requestAnimationFrame(_equalizeColumnWidths); });
  }

  function _equalizeColumnWidths() {
    function equalize(els) {
      if (!els.length) return;
      els.forEach(el => { el.style.minWidth = ''; });
      let max = 0;
      els.forEach(el => { const w = el.getBoundingClientRect().width; if (w > max) max = w; });
      if (max > 0) { const px = Math.ceil(max) + 'px'; els.forEach(el => { el.style.minWidth = px; }); }
    }
    if (root.classList.contains('pf-device-mobile')) {
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-sub-add'));
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-sub-dot'));
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-ext-due'));
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-ext-comment'));
    } else {
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-sub-add'));
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-sub-dot'));
      const dueEls = splitDetail.querySelectorAll('.pf-sub-dates .pf-due-chip, .pf-sub-dates > .pf-completed-date');
      equalize(dueEls);
      splitDetail.querySelectorAll('.pf-sub-dates > .pf-due-wrap').forEach(w => { const chip = w.querySelector('.pf-due-chip'); if (chip) w.style.minWidth = chip.style.minWidth; });
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-dep-chip'));
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-sub-comment'));
    }
    if (root.classList.contains('pf-extend-open')) {
      equalize(splitDetail.querySelectorAll('.pf-sub-dates > .pf-ext-due'));
      equalize(splitDetail.querySelectorAll('.pf-ext-dep'));
    }
  }

  const splitDivider = document.getElementById('pf-split-divider');
  let splitDragging = false;
  splitDivider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitDragging = true;
    splitDivider.classList.add('pf-dragging');
    splitDivider.setPointerCapture(e.pointerId);
  });
  splitDivider.addEventListener('pointermove', (e) => {
    if (!splitDragging) return;
    const rect = splitView.getBoundingClientRect();
    const newWidth = Math.min(Math.floor(rect.width * 0.7), Math.max(180, e.clientX - rect.left));
    splitList.style.width = newWidth + 'px';
  });
  splitDivider.addEventListener('pointerup', (e) => {
    if (!splitDragging) return;
    splitDragging = false;
    splitDivider.classList.remove('pf-dragging');
    splitDivider.releasePointerCapture(e.pointerId);
    safeSet('project-flow-split-width', splitList.style.width, false);
  });
  (async function loadSplitWidth() { try { const res = await safeGet('project-flow-split-width', false); if (res && res.value) splitList.style.width = res.value; } catch (e) {} })();

  splitList.setAttribute('tabindex', '0');
  splitList.addEventListener('keydown', (e) => {
    if (!listViewActive) return;
    const grouped = {};
    sortProjects(projects.filter(p => matchesSearch(p) && (showCompletedProjects || p.status !== 'completed'))).forEach(p => { const cat = p.category || '__uncategorized__'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(p); });
    const catOrder = categories.concat(grouped['__uncategorized__'] ? ['__uncategorized__'] : []);
    const items = [];
    catOrder.forEach(cat => { const group = grouped[cat]; if (!group || !group.length) return; if (splitCollapsedCats[cat]) return; group.forEach(p => items.push(p)); });
    if (!items.length) return;
    const curIdx = items.findIndex(p => p.id === splitSelectedId);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = curIdx < items.length - 1 ? curIdx + 1 : 0;
      splitSelectedId = items[next].id; splitMultiSelect = []; renderSplitList(); renderSplitDetail();
      const el = splitList.querySelector('.pf-split-active'); if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = curIdx > 0 ? curIdx - 1 : items.length - 1;
      splitSelectedId = items[prev].id; splitMultiSelect = []; renderSplitList(); renderSplitDetail();
      const el = splitList.querySelector('.pf-split-active'); if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (splitSelectedId) renderSplitDetail();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (subMultiSelect.length) { clearSubSelect(); const bar = root.querySelector('.pf-sub-select-bar'); if (bar) bar.remove(); return; }
      if (splitMultiSelect.length) { splitMultiSelect = []; renderSplitList(); renderSplitDetail(); }
    } else if (e.key === 'Delete') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (_splitCatMultiSelect.length) {
        snapshot();
        _splitCatMultiSelect.forEach(cat => {
          categories = categories.filter(c => c !== cat);
          projects.forEach(p => { if (p.category === cat) p.category = null; });
        });
        _splitCatMultiSelect = [];
        saveCategories(); scheduleSave(); renderCategoryList(); render();
        return;
      }
      const ids = splitMultiSelect.length ? splitMultiSelect : (splitSelectedId ? [splitSelectedId] : []);
      if (!ids.length) return;
      snapshot();
      ids.forEach(id => { const p = projects.find(pr => pr.id === id); if (p) { logActivity('Trashed project "' + p.title + '"'); trashProject(p); } });
      projects = projects.filter(p => !ids.includes(p.id));
      splitMultiSelect = []; splitSelectedId = null;
      scheduleSave(); renderSplitList(); renderSplitDetail();
      showToast(ids.length + ' project(s) moved to trash', false, true);
    }
  });

  const VIEW_MODE_KEY = 'project-flow-view-mode';
  function setViewMode(mode) {
    safeSet(VIEW_MODE_KEY, 'focus', false);
    root.classList.remove('pf-card-mode');
    listViewActive = true;
    stopParticles();
    renderSplitList();
    renderSplitDetail();
  }

  document.getElementById('pf-options-btn').addEventListener('click', () => {
    const showing = optionsPanel.style.display !== 'none';
    if (showing) { closeAllModals(); } else { openModal(optionsPanel, 'flex'); }
  });
  document.getElementById('pf-toolbar-back').addEventListener('click', () => { _goBackToProjects(); });
  document.getElementById('pf-options-btn-desktop').addEventListener('click', () => {
    const showing = optionsPanel.style.display !== 'none';
    if (showing) { closeAllModals(); } else { openModal(optionsPanel, 'flex'); }
  });
  document.getElementById('pf-shortcuts-btn').addEventListener('click', () => {
    closeAllModals(); openModal(shortcutsPanel, 'flex');
  });
  document.getElementById('pf-shortcuts-hint').addEventListener('click', () => {
    closeAllModals(); openModal(shortcutsPanel, 'flex');
  });
  document.getElementById('pf-theme-cyberpunk').addEventListener('click', () => { clearThemePreset(); applyThemePreset('cyberpunk'); });
  document.getElementById('pf-theme-forest').addEventListener('click', () => { clearThemePreset(); applyThemePreset('forest'); });
  document.getElementById('pf-theme-ocean').addEventListener('click', () => { clearThemePreset(); applyThemePreset('ocean'); });
  document.getElementById('pf-theme-onyx').addEventListener('click', () => { clearThemePreset(); applyThemePreset('onyx'); });
  document.getElementById('pf-theme-light-rose').addEventListener('click', () => { clearThemePreset(); applyThemePreset('light-rose'); });
  document.getElementById('pf-theme-light-sky').addEventListener('click', () => { clearThemePreset(); applyThemePreset('light-sky'); });
  document.getElementById('pf-theme-light-mint').addEventListener('click', () => { clearThemePreset(); applyThemePreset('light-mint'); });
  document.getElementById('pf-theme-light-sand').addEventListener('click', () => { clearThemePreset(); applyThemePreset('light-sand'); });
  document.getElementById('pf-theme-auto').addEventListener('click', function() {
    localStorage.setItem('project-flow-theme-preset', 'auto');
    applyAutoTheme();
    showToast('Theme: Auto (follows system)');
  });
  function applyAutoTheme() {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      applyThemePreset('light-rose');
    } else {
      applyThemePreset('pf-dark');
    }
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (localStorage.getItem('project-flow-theme-preset') === 'auto') applyAutoTheme();
  });
  document.getElementById('pf-theme-pf-dark').addEventListener('click', () => { clearThemePreset(); applyThemePreset('pf-dark'); });
  document.getElementById('pf-theme-pf-light').addEventListener('click', () => { clearThemePreset(); applyThemePreset('pf-light'); });

  const activityLog = [];
  const ACTIVITY_KEY = 'project-flow-activity';
  function logActivity(msg) {
    const entry = { time: new Date().toISOString(), msg: msg };
    activityLog.unshift(entry);
    if (activityLog.length > 50) activityLog.pop();
    safeSet(ACTIVITY_KEY, JSON.stringify(activityLog), false);
  }
  function renderActivityList() {
    const listEl = document.getElementById('pf-activity-list');
    if (!activityLog.length) { listEl.innerHTML = '<div class="pf-activity-empty">No activity yet.</div>'; return; }
    listEl.innerHTML = activityLog.map(e => '<div class="pf-activity-item"><span class="pf-activity-time">' + formatDateTime(e.time) + '</span>' + escapeHtml(e.msg) + '</div>').join('');
  }
  document.getElementById('pf-activity-btn').addEventListener('click', () => {
    _exitMultiSelectMode();
    closeAllModals(); renderActivityList(); openModal(activityPanel, 'flex');
  });
  document.getElementById('pf-archive-btn').addEventListener('click', () => {
    _exitMultiSelectMode();
    closeAllModals(); renderArchiveList(); openModal(archivePanel, 'flex');
  });
  document.getElementById('pf-trash-btn').addEventListener('click', () => {
    _exitMultiSelectMode();
    closeAllModals(); renderTrashList(); openModal(trashPanel, 'flex');
  });
  async function idbGetAllSnapshots() {
    const db = await openIDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }
  async function renderSnapshotsList() {
    const list = document.getElementById('pf-snapshots-list');
    const countEl = document.getElementById('pf-snapshots-count');
    const snaps = await idbGetAllSnapshots();
    snaps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    countEl.textContent = '(' + snaps.length + ')';
    if (!snaps.length) { list.innerHTML = '<div class="pf-activity-empty">No snapshots yet. Snapshots are auto-saved every 5 minutes.</div>'; return; }
    list.innerHTML = snaps.map((snap, i) => {
      const d = new Date(snap.timestamp);
      const projCount = Array.isArray(snap.projects) ? snap.projects.length : 0;
      let taskCount = 0;
      if (Array.isArray(snap.projects)) snap.projects.forEach(p => { if (p.subtasks) (function count(s) { s.forEach(t => { taskCount++; if (t.subtasks) count(t.subtasks); }); })(p.subtasks); });
      const timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const isLatest = i === 0 ? ' <span style="color:var(--accent);font-weight:700;font-size:10px;">LATEST</span>' : '';
      return '<div class="pf-activity-item" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text);">' + timeStr + isLatest + '</div>' +
          '<div style="font-size:10px;color:var(--text-dim);">' + projCount + ' projects · ' + taskCount + ' tasks</div>' +
        '</div>' +
        '<button class="pf-undo-btn" data-snap-idx="' + i + '" style="font-size:11px;padding:4px 10px;white-space:nowrap;">Restore</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-snap-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.snapIdx);
        const snap = snaps[idx];
        if (!snap || !snap.projects) return;
        if (!confirm('Restore snapshot from ' + new Date(snap.timestamp).toLocaleString() + '?\n\nThis will replace your current data. (You can undo with Ctrl+Z)')) return;
        snapshot();
        const result = validateAndRepair(snap.projects);
        projects = result.projects;
        scheduleSave(); render();
        if (listViewActive) { renderSplitList(); renderSplitDetail(); }
        closeAllModals();
        showToast('♻️ Restored snapshot from ' + new Date(snap.timestamp).toLocaleTimeString());
      });
    });
  }
  document.getElementById('pf-snapshots-btn').addEventListener('click', () => {
    _exitMultiSelectMode();
    closeAllModals(); renderSnapshotsList(); openModal(snapshotsPanel, 'flex');
  });
  document.getElementById('pf-trash-empty-btn').addEventListener('click', emptyTrash);
  (async function loadActivity() { try { const res = await safeGet(ACTIVITY_KEY, false); if (res && res.value) { const parsed = JSON.parse(res.value); activityLog.push(...parsed); } } catch (e) {} })();
  loadArchive();
  loadTrash();

  const TODAY_KEY = 'project-flow-today';
  let todayTasks = [];
  let todayDate = '';
  function autoPopulateToday() {
    const now = new Date().toISOString().slice(0, 10);
    projects.forEach(p => {
      if (p.dueAt === now && p.status !== 'completed' && !todayTasks.find(t => t.sourceId === p.id)) {
        todayTasks.push({ id: uid(), title: p.title, sourceId: p.id, sourceType: 'project', done: false });
      }
      if (p.subtasks && p.subtasks.length) {
        (function walkSubs(subs) {
          subs.forEach(s => {
            if (s.dueAt === now && s.status !== 'completed' && !todayTasks.find(t => t.sourceId === s.id)) {
              todayTasks.push({ id: uid(), title: s.title, sourceId: s.id, sourceType: 'subtask', done: false });
            }
            if (s.subtasks && s.subtasks.length) walkSubs(s.subtasks);
          });
        })(p.subtasks);
      }
    });
    saveToday();
  }
  async function loadToday() {
    try {
      const res = await safeGet(TODAY_KEY, false);
      if (res && res.value) {
        const data = JSON.parse(res.value);
        const now = new Date().toISOString().slice(0, 10);
        if (data.date === now) { todayTasks = data.tasks || []; todayDate = data.date; }
        else { todayTasks = []; todayDate = now; }
      } else { todayDate = new Date().toISOString().slice(0, 10); }
    } catch (e) { todayTasks = []; todayDate = new Date().toISOString().slice(0, 10); }
    autoPopulateToday();
  }
  function saveToday() { safeSet(TODAY_KEY, JSON.stringify({ date: todayDate, tasks: todayTasks }), false); }
  function addToToday(title, sourceId, sourceType) {
    if (todayTasks.find(t => t.sourceId === sourceId)) { showToast('Already in Today'); return; }
    todayTasks.push({ id: uid(), title: title, sourceId: sourceId, sourceType: sourceType, done: false });
    saveToday(); showToast('Added to Today\'s Focus');
  }
  function toggleTodayDone(id) {
    const t = todayTasks.find(t => t.id === id); if (t) t.done = !t.done;
    saveToday(); renderTodayList();
  }
  function removeTodayTask(id) { todayTasks = todayTasks.filter(t => t.id !== id); saveToday(); renderTodayList(); }
  function clearToday() { todayTasks = []; saveToday(); renderTodayList(); }
  function carryOverToday() {
    todayTasks = todayTasks.filter(t => !t.done);
    todayDate = new Date().toISOString().slice(0, 10);
    saveToday(); renderTodayList(); showToast('Incomplete tasks carried over');
  }
  function renderTodayList() {
    const list = document.getElementById('pf-today-list');
    document.getElementById('pf-today-date').textContent = todayDate;
    if (!todayTasks.length) { list.innerHTML = '<div class="pf-activity-empty">No tasks for today. Add from project context menu or ⭐ button.</div>'; return; }
    const sorted = todayTasks.filter(t => !t.done).concat(todayTasks.filter(t => t.done));
    list.innerHTML = sorted.map((t, i) => {
      return '<div class="pf-activity-item pf-today-item" draggable="true" data-today-id="' + t.id + '" style="display:flex;align-items:center;gap:8px;' + (t.done ? 'opacity:0.5;' : '') + '">' +
        '<span style="font-size:10px;color:var(--text-dim);min-width:16px;flex-shrink:0;">#' + (i + 1) + '</span>' +
        '<button class="pf-undo-btn" style="font-size:12px;padding:0 4px;" data-today-toggle="' + t.id + '">' + (t.done ? '✓' : '○') + '</button>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:normal;word-break:break-word;' + (t.done ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(t.title) + '</span>' +
        '<button class="pf-undo-btn" style="font-size:10px;padding:0 4px;color:var(--text-dim);" data-today-del="' + t.id + '">×</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-today-toggle]').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); toggleTodayDone(btn.dataset.todayToggle); }); });
    list.querySelectorAll('[data-today-del]').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); removeTodayTask(btn.dataset.todayDel); }); });
    list.querySelectorAll('.pf-today-item').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const t = todayTasks.find(tk => tk.id === item.dataset.todayId);
        if (!t || !t.sourceId) return;
        let projectId = null;
        if (t.sourceType === 'project') { projectId = t.sourceId; }
        else { projects.forEach(p => { if (findSubNode(p.subtasks, t.sourceId)) projectId = p.id; }); }
        if (!projectId) return;
        closeAllModals();
        _todayReturnOnEsc = true;
        if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Today\'s Focus');
        if (!listViewActive) { document.getElementById('pf-collapse-cats').click(); }
        splitSelectedId = projectId; splitMultiSelect = [];
        searchTerm = t.title;
        _searchAutoCollapseId = null;
        renderSplitList(); renderSplitDetail();
        root.classList.add('pf-detail-open');
        if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
        searchTerm = '';
        const el = splitList.querySelector('.pf-split-active'); if (el) el.scrollIntoView({ block: 'nearest' });
      });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.dataset.todayId); item.style.opacity = '0.4'; });
      item.addEventListener('dragend', () => { item.style.opacity = ''; });
      item.addEventListener('dragover', (e) => { e.preventDefault(); item.style.borderTop = '2px solid var(--accent)'; });
      item.addEventListener('dragleave', () => { item.style.borderTop = ''; });
      item.addEventListener('drop', (e) => { e.preventDefault(); item.style.borderTop = ''; const srcId = e.dataTransfer.getData('text/plain'); if (srcId === item.dataset.todayId) return; const srcIdx = todayTasks.findIndex(t => t.id === srcId); const destIdx = todayTasks.findIndex(t => t.id === item.dataset.todayId); const src = todayTasks.splice(srcIdx, 1)[0]; todayTasks.splice(destIdx, 0, src); saveToday(); renderTodayList(); });
    });
  }
  document.getElementById('pf-today-btn').addEventListener('click', () => { closeAllModals(); renderTodayList(); openModal(todayPanel, 'flex'); });

  let _duelistReturnOnEsc = false;
  let _todayReturnOnEsc = false;
  let _calendarReturnOnEsc = false;
  function renderDueList() {
    const list = document.getElementById('pf-duelist-list');
    const items = [];
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') items.push({ title: p.title, dueAt: p.dueAt, project: null, status: p.status, projectId: p.id, subTitle: null });
      (function walk(subs, projTitle, projId) {
        subs.forEach(s => {
          if (s.dueAt && s.status !== 'completed') items.push({ title: s.title, dueAt: s.dueAt, project: projTitle, status: s.status, projectId: projId, subTitle: s.title });
          if (s.subtasks && s.subtasks.length) walk(s.subtasks, projTitle, projId);
        });
      })(p.subtasks || [], p.title, p.id);
    });
    items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    if (!items.length) { list.innerHTML = '<div class="pf-activity-empty">No tasks with due dates.</div>'; return; }
    const today = new Date(); today.setHours(0,0,0,0);
    list.innerHTML = '';
    items.forEach(it => {
      const d = new Date(it.dueAt + 'T00:00:00');
      const isOverdue = d < today;
      const isToday = d.getTime() === today.getTime();
      const cls = isOverdue ? 'color:var(--danger);font-weight:600;' : isToday ? 'color:var(--accent);font-weight:600;' : '';
      const path = it.project ? ' <span style="color:var(--text-dim);font-size:10px;">— ' + escapeHtml(it.project) + '</span>' : '';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;border:1px solid var(--card-border);margin-bottom:4px;background:var(--card);cursor:pointer;transition:border-color 0.15s,transform 0.1s;';
      row.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--' + it.status + ');flex-shrink:0;"></span>' +
        '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(it.title) + path + '</span>' +
        '<span style="font-size:11px;flex-shrink:0;' + cls + '">' + it.dueAt + '</span>';
      row.addEventListener('mouseenter', () => { row.style.borderColor = 'var(--accent)'; row.style.transform = 'translateX(2px)'; });
      row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--card-border)'; row.style.transform = ''; });
      row.addEventListener('click', () => {
        closeAllModals();
        _duelistReturnOnEsc = true;
        if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Tasks by Due Date');
        if (listViewActive) {
          splitSelectedId = it.projectId;
          splitMultiSelect = [];
          searchTerm = it.subTitle || it.title;
          _searchAutoCollapseId = null;
          renderSplitList(); renderSplitDetail();
          root.classList.add('pf-detail-open');
          if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
          searchTerm = '';
        } else {
          autoArrangeProjects(true);
        }
      });
      list.appendChild(row);
    });
  }
  document.getElementById('pf-duelist-btn').addEventListener('click', () => { closeAllModals(); renderDueList(); openModal(duelistPanel, 'flex'); });

  let calMonth = new Date().getMonth(), calYear = new Date().getFullYear();
  function collectDueMap() {
    const map = {};
    projects.forEach(p => {
      if (p.dueAt) { if (!map[p.dueAt]) map[p.dueAt] = []; map[p.dueAt].push({ title: p.title, status: p.status, color: p.color, projectId: p.id, dueAt: p.dueAt }); }
      (function walk(subs) {
        subs.forEach(s => {
          if (s.dueAt) { if (!map[s.dueAt]) map[s.dueAt] = []; map[s.dueAt].push({ title: s.title, status: s.status, projectId: p.id, dueAt: s.dueAt }); }
          if (s.subtasks && s.subtasks.length) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });
    return map;
  }
  let calSelectedDate = null;
  function renderCalendar() {
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const grid = document.getElementById('pf-cal-grid');
    const monthLabel = document.getElementById('pf-cal-month');
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    monthLabel.textContent = monthNames[calMonth] + ' ' + calYear;
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueMap = collectDueMap();
    let html = DAYS.map(d => '<div style="text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);padding:8px 0;border-bottom:1px solid var(--sub-border);">' + d + '</div>').join('');
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === calSelectedDate;
      const items = dueMap[dateStr] || [];
      const hasItems = items.length > 0;
      const borderCol = isSelected ? 'var(--accent)' : isToday ? 'var(--ongoing)' : 'var(--card-border)';
      const bgCol = isSelected ? 'rgba(123,104,238,0.15)' : isToday ? 'rgba(245,184,77,0.08)' : 'transparent';
      html += '<div class="pf-cal-day" data-cal-date="' + dateStr + '" style="min-height:44px;padding:4px;border-radius:6px;border:1px solid ' + borderCol + ';background:' + bgCol + ';overflow:hidden;cursor:pointer;transition:background 0.12s,border-color 0.12s;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;"><span style="font-size:11px;font-weight:' + (isToday || isSelected ? '700' : '500') + ';color:' + (isSelected ? 'var(--accent)' : isToday ? 'var(--ongoing)' : 'var(--text)') + ';">' + d + '</span></div>';
      if (hasItems) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:2px;">';
        items.forEach(item => {
          const col = item.status === 'completed' ? 'var(--completed)' : item.status === 'ongoing' ? 'var(--ongoing)' : item.status === 'waiting' ? 'var(--waiting)' : 'var(--planned)';
          html += '<span style="width:6px;height:6px;border-radius:50%;background:' + col + ';flex-shrink:0;"></span>';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.pf-cal-day').forEach(el => {
      el.addEventListener('click', () => { calSelectedDate = el.dataset.calDate; renderCalendar(); renderCalDetail(); });
    });
    if (calSelectedDate) renderCalDetail();
  }
  function renderCalDetail() {
    const titleEl = document.getElementById('pf-cal-detail-title');
    const listEl = document.getElementById('pf-cal-detail-list');
    if (!calSelectedDate) { titleEl.textContent = 'Select a date'; listEl.innerHTML = '<div class="pf-activity-empty">Click a date to see tasks.</div>'; return; }
    const dueMap = collectDueMap();
    const items = (dueMap[calSelectedDate] || []).slice().sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '') || a.title.localeCompare(b.title));
    const d = new Date(calSelectedDate + 'T00:00:00');
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    titleEl.textContent = dayNames[d.getDay()] + ', ' + calSelectedDate;
    if (!items.length) { listEl.innerHTML = '<div class="pf-activity-empty">No tasks due on this date.</div>'; return; }
    listEl.innerHTML = items.map((item, i) => {
      const col = item.status === 'completed' ? 'var(--completed)' : item.status === 'ongoing' ? 'var(--ongoing)' : 'var(--planned)';
      const statusLabel = STATUS_LABEL[item.status] || 'Planned';
      return '<div class="pf-activity-item pf-cal-task-item" data-cal-project="' + (item.projectId || '') + '" style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:4px;border-radius:6px;background:var(--card);border:1px solid var(--card-border);cursor:pointer;transition:border-color 0.15s;" onmouseenter="this.style.borderColor=\'var(--hover-border)\'" onmouseleave="this.style.borderColor=\'var(--card-border)\'">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0;"></span>' +
        '<span style="flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.title) + '</span>' +
        '</div>';
    }).join('');
    listEl.querySelectorAll('.pf-cal-task-item').forEach(el => {
      el.addEventListener('click', () => {
        const projectId = el.dataset.calProject;
        if (!projectId) return;
        const p = projects.find(pr => pr.id === projectId);
        if (!p) return;
        const taskTitle = el.querySelector('span[style*="flex:1"]').textContent.trim();
        closeAllModals();
        _calendarReturnOnEsc = true;
        if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Calendar');
        if (!listViewActive) { document.getElementById('pf-collapse-cats').click(); }
        splitSelectedId = projectId; splitMultiSelect = [];
        searchTerm = taskTitle;
        _searchAutoCollapseId = null;
        renderSplitList(); renderSplitDetail();
        root.classList.add('pf-detail-open');
        if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
        searchTerm = '';
        const active = splitList.querySelector('.pf-split-active'); if (active) active.scrollIntoView({ block: 'nearest' });
      });
    });
  }
  document.getElementById('pf-calendar-btn').addEventListener('click', () => { closeAllModals(); renderCalendar(); openModal(calendarPanel, 'flex'); });
  document.getElementById('pf-cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  document.getElementById('pf-cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  document.getElementById('pf-cal-today-btn').addEventListener('click', () => { calMonth = new Date().getMonth(); calYear = new Date().getFullYear(); renderCalendar(); });
  document.getElementById('pf-today-clear-btn').addEventListener('click', () => { if (!todayTasks.length) return; clearToday(); });
  document.getElementById('pf-today-carry-btn').addEventListener('click', carryOverToday);
  document.getElementById('pf-today-due-btn').addEventListener('click', function() {
    const d = new Date(); const now = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    let added = 0;
    projects.forEach(p => {
      if (p.dueAt === now && p.status !== 'completed' && !todayTasks.find(t => t.sourceId === p.id)) {
        todayTasks.push({ id: uid(), title: p.title, sourceId: p.id, sourceType: 'project', done: false });
        added++;
      }
      (function walk(subs) {
        subs.forEach(s => {
          if (s.dueAt === now && s.status !== 'completed' && !todayTasks.find(t => t.sourceId === s.id)) {
            todayTasks.push({ id: uid(), title: s.title, sourceId: s.id, sourceType: 'subtask', done: false });
            added++;
          }
          if (s.subtasks && s.subtasks.length) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });
    if (!added) { showToast('No tasks due today'); return; }
    saveToday(); renderTodayList(); showToast(added + ' task' + (added > 1 ? 's' : '') + ' due today added');
  });
  document.getElementById('pf-today-overdue-btn').addEventListener('click', function() {
    const today = new Date(); today.setHours(0,0,0,0);
    let added = 0;
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') {
        const d = new Date(p.dueAt + 'T00:00:00');
        if (d < today && !todayTasks.find(t => t.sourceId === p.id)) {
          todayTasks.push({ id: uid(), title: p.title, sourceId: p.id, sourceType: 'project', done: false });
          added++;
        }
      }
      (function walk(subs) {
        subs.forEach(s => {
          if (s.dueAt && s.status !== 'completed') {
            const d = new Date(s.dueAt + 'T00:00:00');
            if (d < today && !todayTasks.find(t => t.sourceId === s.id)) {
              todayTasks.push({ id: uid(), title: s.title, sourceId: s.id, sourceType: 'subtask', done: false });
              added++;
            }
          }
          if (s.subtasks && s.subtasks.length) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });
    if (!added) { showToast('No overdue tasks to add'); return; }
    saveToday(); renderTodayList(); showToast(added + ' overdue task' + (added > 1 ? 's' : '') + ' added');
  });
  loadToday();

  const WEEKLY_KEY = 'project-flow-weekly';
  let weeklyData = {};
  let weekOffset = 0;
  function getWeekStart(offset) {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay() + 1 + (offset * 7));
    return d;
  }
  function weekDateStr(d) { return d.toISOString().slice(0, 10); }
  async function loadWeekly() {
    try { const res = await safeGet(WEEKLY_KEY, false); if (res && res.value) weeklyData = JSON.parse(res.value); } catch (e) { weeklyData = {}; }
  }
  function saveWeekly() { safeSet(WEEKLY_KEY, JSON.stringify(weeklyData), false); }
  function addToWeekDay(dayStr, title, sourceId, sourceType) {
    if (!weeklyData[dayStr]) weeklyData[dayStr] = [];
    if (weeklyData[dayStr].some(t => t.sourceId === sourceId)) return;
    weeklyData[dayStr].push({ id: uid(), title, sourceId, sourceType, done: false });
    saveWeekly();
  }
  function autoFillWeekly() {
    const start = getWeekStart(weekOffset);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const ds = weekDateStr(d);
      projects.forEach(p => {
        if (p.dueAt === ds && p.status !== 'completed') addToWeekDay(ds, p.title, p.id, 'project');
        (function walk(subs) { subs.forEach(s => { if (s.dueAt === ds && s.status !== 'completed') addToWeekDay(ds, s.title, s.id, 'subtask'); if (s.subtasks) walk(s.subtasks); }); })(p.subtasks || []);
      });
    }
    saveWeekly();
    renderWeeklyPanel();
    showToast('Week auto-filled from due dates.');
  }
  function renderWeeklyPanel() {
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const grid = document.getElementById('pf-week-grid');
    const label = document.getElementById('pf-week-label');
    const start = getWeekStart(weekOffset);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    label.textContent = monthNames[start.getMonth()] + ' ' + start.getDate() + ' – ' + monthNames[end.getMonth()] + ' ' + end.getDate() + ', ' + end.getFullYear();
    grid.innerHTML = '';
    const todayStr = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const ds = weekDateStr(d);
      const isToday = ds === todayStr;
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;border-radius:6px;background:' + (isToday ? 'rgba(149,128,255,0.06)' : 'var(--sub-bg)') + ';border:1.5px solid ' + (isToday ? 'var(--accent)' : 'var(--sub-border)') + ';padding:10px 8px;min-height:140px;overflow-y:auto;transition:border-color 0.2s,box-shadow 0.2s;' + (isToday ? 'box-shadow:0 0 12px rgba(149,128,255,0.15);' : '');
      const header = document.createElement('div');
      header.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;text-align:center;margin-bottom:8px;padding:4px 0 6px;border-bottom:1px solid ' + (isToday ? 'rgba(149,128,255,0.3)' : 'var(--sub-border)') + ';color:' + (isToday ? 'var(--accent)' : 'var(--text-dim)') + ';';
      header.innerHTML = '<div style="font-size:18px;font-weight:800;color:' + (isToday ? 'var(--accent)' : 'var(--text)') + ';line-height:1;margin-bottom:2px;">' + d.getDate() + '</div>' + DAYS[i];
      col.appendChild(header);
      const tasks = weeklyData[ds] || [];
      tasks.forEach((t, idx) => {
        const row = document.createElement('div');
        row.draggable = true;
        row.dataset.taskId = t.id;
        row.dataset.day = ds;
        row.style.cssText = 'font-size:12px;padding:6px 8px;border-radius:6px;background:var(--card);border:1px solid var(--card-border);margin-bottom:5px;display:flex;align-items:center;gap:6px;cursor:grab;transition:border-color 0.15s,transform 0.1s,box-shadow 0.15s;' + (t.done ? 'opacity:0.5;text-decoration:line-through;' : '');
        row.addEventListener('mouseenter', () => { if (!t.done) { row.style.borderColor = 'var(--hover-border)'; row.style.transform = 'translateY(-1px)'; row.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'; } });
        row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--card-border)'; row.style.transform = ''; row.style.boxShadow = ''; });
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = t.done;
        check.style.cssText = 'margin:0;cursor:pointer;flex-shrink:0;';
        check.addEventListener('change', () => { t.done = check.checked; saveWeekly(); renderWeeklyPanel(); });
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        titleSpan.textContent = t.title;
        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);font-size:14px;cursor:pointer;padding:0 2px;line-height:1;';
        delBtn.addEventListener('click', () => { weeklyData[ds] = weeklyData[ds].filter(x => x.id !== t.id); saveWeekly(); renderWeeklyPanel(); });
        row.appendChild(check);
        row.appendChild(titleSpan);
        row.appendChild(delBtn);
        row.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/weekly-task', JSON.stringify({ id: t.id, fromDay: ds })); row.style.opacity = '0.4'; });
        row.addEventListener('dragend', () => { row.style.opacity = ''; });
        col.appendChild(row);
      });
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add task';
      addBtn.style.cssText = 'font-size:11px;background:none;border:1px dashed var(--sub-border);color:var(--text-dim);cursor:pointer;padding:6px 8px;text-align:center;margin-top:auto;border-radius:6px;transition:border-color 0.15s,color 0.15s,background 0.15s;';
      addBtn.addEventListener('mouseenter', () => { addBtn.style.borderColor = 'var(--accent)'; addBtn.style.color = 'var(--accent)'; addBtn.style.background = 'rgba(149,128,255,0.06)'; });
      addBtn.addEventListener('mouseleave', () => { addBtn.style.borderColor = 'var(--sub-border)'; addBtn.style.color = 'var(--text-dim)'; addBtn.style.background = 'none'; });
      addBtn.addEventListener('click', () => {
        const title = prompt('Task name:');
        if (!title || !title.trim()) return;
        if (!weeklyData[ds]) weeklyData[ds] = [];
        weeklyData[ds].push({ id: uid(), title: title.trim(), sourceId: null, sourceType: null, done: false });
        saveWeekly(); renderWeeklyPanel();
      });
      col.appendChild(addBtn);
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.style.borderColor = 'var(--accent)'; });
      col.addEventListener('dragleave', () => { col.style.borderColor = isToday ? 'var(--accent)' : 'var(--sub-border)'; });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.style.borderColor = isToday ? 'var(--accent)' : 'var(--sub-border)';
        const raw = e.dataTransfer.getData('application/weekly-task');
        if (raw) {
          const { id, fromDay } = JSON.parse(raw);
          if (fromDay === ds) return;
          const fromArr = weeklyData[fromDay] || [];
          const taskIdx = fromArr.findIndex(x => x.id === id);
          if (taskIdx < 0) return;
          const task = fromArr.splice(taskIdx, 1)[0];
          if (!weeklyData[ds]) weeklyData[ds] = [];
          weeklyData[ds].push(task);
          saveWeekly(); renderWeeklyPanel();
          return;
        }
        const projectId = e.dataTransfer.getData('text/plain');
        if (projectId) {
          const p = projects.find(pr => pr.id === projectId);
          if (p) { addToWeekDay(ds, p.title, p.id, 'project'); renderWeeklyPanel(); }
        }
      });
      grid.appendChild(col);
    }
  }
  document.getElementById('pf-weekly-btn').addEventListener('click', () => { loadWeekly().then(() => { renderWeeklyPanel(); openModal(weeklyPanel, 'flex'); }); });
  document.getElementById('pf-week-prev').addEventListener('click', () => { weekOffset--; renderWeeklyPanel(); });
  document.getElementById('pf-week-next').addEventListener('click', () => { weekOffset++; renderWeeklyPanel(); });
  document.getElementById('pf-week-today').addEventListener('click', () => { weekOffset = 0; renderWeeklyPanel(); });
  document.getElementById('pf-week-auto').addEventListener('click', () => { autoFillWeekly(); });

  const REMINDERS_KEY = 'project-flow-reminders';
  let reminders = [];
  async function loadReminders() { try { const res = await safeGet(REMINDERS_KEY, false); if (res && res.value) reminders = JSON.parse(res.value); } catch (e) { reminders = []; } }
  function saveReminders() { safeSet(REMINDERS_KEY, JSON.stringify(reminders), false); }
  function promptReminder(sourceId, title, sourceType) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:200;padding:16px;border-radius:6px;border:1px solid var(--card-border);background:var(--card);color:var(--text);box-shadow:0 12px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:10px;min-width:260px;';
    const now = new Date(); now.setMinutes(now.getMinutes() + 30);
    let rYear = now.getFullYear(), rMonth = now.getMonth() + 1, rDay = now.getDate(), rHour = now.getHours(), rMin = now.getMinutes(), rAmpm = now.getHours() >= 12 ? 'PM' : 'AM';
    rHour = rHour % 12 || 12;
    function padZ(n) { return String(n).padStart(2, '0'); }
    function renderRemindDialog() {
      wrap.innerHTML = '<div style="font-size:13px;font-weight:600;">⏰ Set Reminder</div>' +
        '<div style="font-size:11px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(title) + '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;justify-content:center;">' +
          '<div class="pf-remind-scroll" data-field="year" style="text-align:center;"><div class="pf-remind-val" style="font-size:16px;font-weight:600;color:var(--text);padding:6px 8px;">' + rYear + '</div><div style="font-size:9px;color:var(--text-dim);">Year</div></div>' +
          '<span style="font-size:16px;color:var(--text-dim);">-</span>' +
          '<div class="pf-remind-scroll" data-field="month" style="text-align:center;"><div class="pf-remind-val" style="font-size:16px;font-weight:600;color:var(--text);padding:6px 8px;">' + padZ(rMonth) + '</div><div style="font-size:9px;color:var(--text-dim);">Month</div></div>' +
          '<span style="font-size:16px;color:var(--text-dim);">-</span>' +
          '<div class="pf-remind-scroll" data-field="day" style="text-align:center;"><div class="pf-remind-val" style="font-size:16px;font-weight:600;color:var(--text);padding:6px 8px;">' + padZ(rDay) + '</div><div style="font-size:9px;color:var(--text-dim);">Day</div></div>' +
          '<span style="font-size:16px;color:var(--text-dim);margin:0 6px;">|</span>' +
          '<div class="pf-remind-scroll" data-field="hour" style="text-align:center;"><div class="pf-remind-val" style="font-size:16px;font-weight:600;color:var(--text);padding:6px 8px;">' + rHour + '</div><div style="font-size:9px;color:var(--text-dim);">Hour</div></div>' +
          '<span style="font-size:16px;color:var(--text-dim);">:</span>' +
          '<div class="pf-remind-scroll" data-field="min" style="text-align:center;"><div class="pf-remind-val" style="font-size:16px;font-weight:600;color:var(--text);padding:6px 8px;">' + padZ(rMin) + '</div><div style="font-size:9px;color:var(--text-dim);">Min</div></div>' +
          '<div class="pf-remind-scroll" data-field="ampm" style="text-align:center;"><div class="pf-remind-val" style="font-size:14px;font-weight:600;color:var(--accent);padding:6px 6px;">' + rAmpm + '</div><div style="font-size:9px;color:var(--text-dim);">AM/PM</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;"><button id="pf-remind-ok" class="pf-undo-btn" style="flex:1;padding:6px;">Set</button><button id="pf-remind-cancel" class="pf-undo-btn" style="flex:1;padding:6px;">Cancel</button></div>';
      wrap.querySelectorAll('.pf-remind-scroll').forEach(el => {
        el.style.cursor = 'ns-resize';
        el.style.userSelect = 'none';
        el.style.borderRadius = '6px';
        el.style.padding = '2px 4px';
        el.style.transition = 'background 0.12s';
        el.addEventListener('mouseenter', () => { el.style.background = 'rgba(123,104,238,0.1)'; });
        el.addEventListener('mouseleave', () => { el.style.background = ''; });
        el.addEventListener('wheel', (ev) => { ev.preventDefault(); const dir = ev.deltaY < 0 ? 1 : -1; adjustField(el.dataset.field, dir); });
        el.addEventListener('dblclick', () => {
          const valEl = el.querySelector('.pf-remind-val');
          const field = el.dataset.field;
          const input = document.createElement('input'); input.type = 'number'; input.value = field === 'year' ? rYear : field === 'month' ? rMonth : field === 'day' ? rDay : field === 'hour' ? rHour : rMin;
          input.style.cssText = 'width:40px;font-size:14px;text-align:center;padding:4px;border-radius:6px;border:1px solid var(--accent);background:var(--sub-bg);color:var(--text);outline:none;';
          if (field === 'year') input.style.width = '56px';
          valEl.replaceWith(input); input.focus(); input.select();
          function commit() {
            let v = parseInt(input.value, 10) || 0;
            if (field === 'year') { rYear = Math.max(2024, v); }
            else if (field === 'month') { rMonth = Math.max(1, Math.min(12, v)); }
            else if (field === 'day') { const max = new Date(rYear, rMonth, 0).getDate(); rDay = Math.max(1, Math.min(max, v)); }
            else if (field === 'hour') { rHour = Math.max(1, Math.min(12, v)); }
            else { rMin = Math.max(0, Math.min(59, v)); }
            renderRemindDialog();
          }
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') renderRemindDialog(); });
        });
      });
      wrap.querySelector('#pf-remind-ok').addEventListener('click', confirmReminder);
      wrap.querySelector('#pf-remind-cancel').addEventListener('click', () => { wrap.remove(); });
    }
    function adjustField(field, dir) {
      if (field === 'year') { rYear += dir; if (rYear < 2024) rYear = 2024; }
      else if (field === 'month') { rMonth += dir; if (rMonth > 12) rMonth = 1; if (rMonth < 1) rMonth = 12; }
      else if (field === 'day') { const max = new Date(rYear, rMonth, 0).getDate(); rDay += dir; if (rDay > max) rDay = 1; if (rDay < 1) rDay = max; }
      else if (field === 'hour') { rHour += dir; if (rHour > 12) rHour = 1; if (rHour < 1) rHour = 12; }
      else if (field === 'min') { rMin += dir * 10; if (rMin >= 60) rMin = 0; if (rMin < 0) rMin = 50; }
      else if (field === 'ampm') { rAmpm = rAmpm === 'AM' ? 'PM' : 'AM'; }
      renderRemindDialog();
    }
    function confirmReminder() {
      let h24 = rHour % 12; if (rAmpm === 'PM') h24 += 12;
      const remindAt = new Date(rYear, rMonth - 1, rDay, h24, rMin).getTime();
      if (remindAt > Date.now()) {
        reminders.push({ id: uid(), sourceId: sourceId, title: title, sourceType: sourceType, remindAt: remindAt });
        saveReminders(); showToast('⏰ Reminder set for ' + new Date(remindAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      } else { showToast('Reminder must be in the future', true); }
      wrap.remove();
    }
    root.appendChild(wrap);
    renderRemindDialog();
  }
  function checkReminders() {
    const now = Date.now();
    const fired = [];
    reminders.forEach(r => {
      if (r.remindAt <= now) {
        fired.push(r);
        if (Notification.permission === 'granted') { new Notification('⏰ Reminder: ' + r.title); }
        else { showToast('⏰ Reminder: ' + r.title); }
      }
    });
    if (fired.length) { reminders = reminders.filter(r => !fired.includes(r)); saveReminders(); }
  }
  loadReminders();
  if ('Notification' in window && Notification.permission === 'default') { Notification.requestPermission(); }
  setInterval(checkReminders, 30000);
  setTimeout(checkReminders, 2000);

  let commentTarget = null;
  function openCommentPanel(p, s) {
    commentTarget = { project: p, sub: s };
    if (!s.comments) s.comments = [];
    document.getElementById('pf-comment-task-name').textContent = s.title;
    renderComments();
    openModal(commentPanel, 'flex');
    document.getElementById('pf-comment-input').focus();
  }
  function renderComments() {
    const listEl = document.getElementById('pf-comment-list');
    if (!commentTarget || !commentTarget.sub.comments.length) { listEl.innerHTML = '<div class="pf-comment-empty">No comments yet.</div>'; return; }
    listEl.innerHTML = commentTarget.sub.comments.map((c, i) => '<div class="pf-comment-item">' + escapeHtml(c.text) + '<span class="pf-comment-time">' + formatDateTime(c.time) + '</span><span class="pf-comment-actions"><button class="pf-comment-edit" data-idx="' + i + '">✏️</button><button class="pf-comment-del" data-idx="' + i + '">🗑️</button></span></div>').join('');
    listEl.querySelectorAll('.pf-comment-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const newText = prompt('Edit comment:', commentTarget.sub.comments[idx].text);
        if (newText !== null && newText.trim()) { snapshot(); commentTarget.sub.comments[idx].text = newText.trim(); scheduleSave(); renderComments(); render(); }
      });
    });
    listEl.querySelectorAll('.pf-comment-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (!confirm('Delete this comment?')) return;
        snapshot(); commentTarget.sub.comments.splice(idx, 1); scheduleSave(); renderComments(); render();
      });
    });
    listEl.scrollTop = listEl.scrollHeight;
  }
  function addComment() {
    const input = document.getElementById('pf-comment-input');
    const text = input.value.trim(); if (!text || !commentTarget) return;
    snapshot();
    commentTarget.sub.comments.push({ text: text, time: new Date().toISOString() });
    input.value = '';
    scheduleSave(); renderComments(); render();
  }
  document.getElementById('pf-comment-add').addEventListener('click', addComment);
  document.getElementById('pf-comment-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } });

  let colorTarget = null;
  const colorModalPicker = document.getElementById('pf-color-modal-picker');
  const colorPalette = document.getElementById('pf-color-palette');
  const PRESET_COLORS = ['#e0503f','#e67e22','#f1c40f','#27ae60','#2ecc71','#1abc9c','#3498db','#2980b9','#7b68ee','#9b59b6','#e84393','#fd79a8','#636e72','#b2bec3','#fdcb6e','#00cec9'];
  let selectedColor = null;
  function renderPalette() {
    colorPalette.innerHTML = PRESET_COLORS.map(c => '<div class="pf-color-swatch' + (selectedColor === c ? ' pf-swatch-selected' : '') + '" data-color="' + c + '" style="background:' + c + '"></div>').join('');
    colorPalette.querySelectorAll('.pf-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => { selectedColor = sw.dataset.color; colorModalPicker.value = selectedColor; renderPalette(); });
    });
  }
  colorModalPicker.addEventListener('input', (e) => { selectedColor = e.target.value; renderPalette(); });
  function openColorModal(p) {
    colorTarget = p;
    selectedColor = p.color || '#7b68ee';
    colorModalPicker.value = selectedColor;
    renderPalette();
    openModal(colorModal, 'flex');
  }
  document.getElementById('pf-color-modal-ok').addEventListener('click', () => {
    if (!colorTarget) return;
    snapshot(); colorTarget.color = selectedColor; scheduleSave(); closeAllModals(); render(); autoArrangeProjects(true);
  });
  document.getElementById('pf-color-modal-clear').addEventListener('click', () => {
    if (!colorTarget) return;
    snapshot(); colorTarget.color = null; scheduleSave(); closeAllModals(); render(); autoArrangeProjects(true);
  });
  document.getElementById('pf-color-modal-cancel').addEventListener('click', () => { closeAllModals(); });

  function collectReportRows() {
    const rows = [];
    function walkSubs(list, projectTitle, depth) {
      list.forEach(s => {
        rows.push({ project: projectTitle, task: s.title, status: STATUS_LABEL[s.status], due: s.dueAt || '', completed: s.completedAt ? formatDateShort(s.completedAt.slice(0, 10)) : '', depth: depth, comments: (s.comments ? s.comments.length : 0) });
        if (s.subtasks && s.subtasks.length) walkSubs(s.subtasks, projectTitle, depth + 1);
      });
    }
    projects.forEach(p => {
      rows.push({ project: p.title, task: '', status: STATUS_LABEL[p.status], due: p.dueAt || '', completed: p.completedAt ? formatDateShort(p.completedAt.slice(0, 10)) : '', depth: 0, comments: 0, category: p.category || '' });
      walkSubs(p.subtasks, p.title, 1);
    });
    return rows;
  }
  document.getElementById('pf-export-csv').addEventListener('click', () => {
    _exitMultiSelectMode();
    const rows = collectReportRows();
    const header = 'Project,Task,Status,Due Date,Completed,Category,Comments\n';
    const csv = header + rows.map(r => [r.project, r.task, r.status, r.due, r.completed, r.category || '', r.comments].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'project-flow-report.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('CSV exported.');
  });
  document.getElementById('pf-export-pdf').addEventListener('click', () => {
    _exitMultiSelectMode();
    const rows = collectReportRows();
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Organeas Report</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}h1{font-size:18px;margin-bottom:10px;}table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}th{background:#f5f5f5;font-weight:600;}tr:nth-child(even){background:#fafafa;}.project-row{background:#eef;font-weight:600;}</style></head><body><h1>Project Flow Report</h1><p>Generated: ' + new Date().toLocaleString() + '</p><table><thead><tr><th>Project</th><th>Task</th><th>Status</th><th>Due Date</th><th>Completed</th><th>Comments</th></tr></thead><tbody>' + rows.map(r => '<tr class="' + (r.task === '' ? 'project-row' : '') + '"><td>' + escapeHtml(r.project) + '</td><td>' + '&nbsp;'.repeat(r.depth * 4) + escapeHtml(r.task) + '</td><td>' + escapeHtml(r.status) + '</td><td>' + escapeHtml(r.due) + '</td><td>' + escapeHtml(r.completed) + '</td><td>' + r.comments + '</td></tr>').join('') + '</tbody></table></body></html>';
    const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); setTimeout(() => { if (w) w.print(); URL.revokeObjectURL(url); }, 500);
  });
  let zoomLevel = 1;
  const zoomLevelEl = document.getElementById('pf-zoom-level');
  function applyZoom() { canvas.style.transform = 'scale(' + zoomLevel + ')'; canvas.style.width = '2200px'; canvas.style.height = '1600px'; zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%'; autoArrangeProjects(true); }
  document.getElementById('pf-zoom-in').addEventListener('click', () => { zoomLevel = Math.min(2, zoomLevel + 0.1); applyZoom(); });
  document.getElementById('pf-zoom-out').addEventListener('click', () => { zoomLevel = Math.max(0.4, zoomLevel - 0.1); applyZoom(); });
  document.getElementById('pf-zoom-reset').addEventListener('click', () => { zoomLevel = 1; applyZoom(); });
  canvasWrap.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomLevel = Math.min(2, Math.max(0.4, zoomLevel + (e.deltaY < 0 ? 0.05 : -0.05))); applyZoom(); } }, { passive: false });


  const fontSizeInput = document.getElementById('pf-font-size');
  const fontSizeVal = document.getElementById('pf-font-size-val');
  // Device-specific keys: desktop and mobile (and tablet) each remember their own value.
  function currentDeviceSuffix() {
    if (root.classList.contains('pf-device-mobile')) return 'mobile';
    if (root.classList.contains('pf-device-tablet')) return 'tablet';
    return 'desktop';
  }
  function FONT_SIZE_KEY() { return 'project-flow-font-size-' + currentDeviceSuffix(); }
  function SCALE_KEY() { return 'project-flow-display-scale-' + currentDeviceSuffix(); }

  fontSizeInput.addEventListener('input', (e) => { const v = e.target.value + 'px'; root.style.setProperty('--font-size-base', v); fontSizeVal.textContent = v; safeSet(FONT_SIZE_KEY(), e.target.value, false); });
  async function loadFontSize() { try { const res = await safeGet(FONT_SIZE_KEY(), false); if (res && res.value) { root.style.setProperty('--font-size-base', res.value + 'px'); fontSizeInput.value = res.value; fontSizeVal.textContent = res.value + 'px'; } } catch (e) {} }
  loadFontSize();

  // Display Scale
  const scaleInput = document.getElementById('pf-display-scale');
  const scaleVal = document.getElementById('pf-display-scale-val');
  function applyScale(v) {
    const basePx = 15 * (v / 100);
    root.style.setProperty('--font-size-base', basePx + 'px');
    root.style.setProperty('--pf-scale', v / 100);
    fontSizeInput.value = Math.round(basePx);
    scaleVal.textContent = v + '%';
  }
  scaleInput.addEventListener('input', (e) => { applyScale(e.target.value); safeSet(SCALE_KEY(), e.target.value, false); });
  document.getElementById('pf-display-scale-reset').addEventListener('click', () => { scaleInput.value = '100'; applyScale(100); safeSet(SCALE_KEY(), '100', false); });
  async function loadScale() { try { const res = await safeGet(SCALE_KEY(), false); if (res && res.value) { scaleInput.value = res.value; applyScale(res.value); } } catch (e) {} }
  loadScale();

  // Re-apply the correct device's saved size if the device class changes later
  // (e.g. resizing a desktop browser window, or rotating/switching device type).
  let _pfLastDeviceSuffix = currentDeviceSuffix();
  window.addEventListener('resize', () => {
    const suffix = currentDeviceSuffix();
    if (suffix !== _pfLastDeviceSuffix) {
      _pfLastDeviceSuffix = suffix;
      loadFontSize();
      loadScale();
    }
  });

  document.getElementById('pf-export').addEventListener('click', async () => {
    _exitMultiSelectMode();
    const json = JSON.stringify({ projects: projects, categories: categories, collapsedCategories: collapsedCategories, archive: archive }, null, 2);
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: 'project-flow.json', types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        showToast('Exported successfully.');
      } catch (err) { if (err.name !== 'AbortError') showToast('Export failed: ' + err.message, true); }
    } else {
      const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'project-flow.json'; a.click(); URL.revokeObjectURL(url);
    }
  });

  const AUTOBACKUP_KEY = 'project-flow-autobackup';
  const AUTOBACKUP_LAST_KEY = 'project-flow-autobackup-last';
  let autoBackupInterval = 0;
  let autoBackupTimer = null;
  let autoBackupDirHandle = null;
  function saveBackupHandle(handle) {
    const req = indexedDB.open('project-flow-db', 1);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore('handles'); };
    req.onsuccess = (e) => { const db = e.target.result; const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(handle, 'backupDir'); };
  }
  async function loadBackupHandle() {
    return new Promise((resolve) => {
      const req = indexedDB.open('project-flow-db', 1);
      req.onupgradeneeded = (e) => { e.target.result.createObjectStore('handles'); };
      req.onsuccess = (e) => { const db = e.target.result; const tx = db.transaction('handles', 'readonly'); const get = tx.objectStore('handles').get('backupDir'); get.onsuccess = () => resolve(get.result || null); get.onerror = () => resolve(null); };
      req.onerror = () => resolve(null);
    });
  }
  async function doAutoBackup() {
    if (!projects.length) return;
    const json = JSON.stringify({ projects, categories, collapsedCategories, archive, backupAt: new Date().toISOString() }, null, 2);
    const filename = 'project-flow-backup-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.json';
    if (autoBackupDirHandle) {
      try {
        const perm = await autoBackupDirHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const req = await autoBackupDirHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') { autoBackupDirHandle = null; doFallbackDownload(json, filename); return; }
        }
        const fileHandle = await autoBackupDirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        safeSet(AUTOBACKUP_LAST_KEY, new Date().toISOString(), false);
        showToast('Auto-backup saved to folder.');
        return;
      } catch (err) { showToast('Backup folder error, using download.', true); autoBackupDirHandle = null; }
    }
    doFallbackDownload(json, filename);
  }
  function doFallbackDownload(json, filename) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    safeSet(AUTOBACKUP_LAST_KEY, new Date().toISOString(), false);
    showToast('Auto-backup saved.');
  }
  function startAutoBackup() {
    clearInterval(autoBackupTimer);
    if (autoBackupInterval <= 0) return;
    autoBackupTimer = setInterval(doAutoBackup, autoBackupInterval * 60 * 1000);
  }
  (async function loadAutoBackup() {
    try { const res = await safeGet(AUTOBACKUP_KEY, false); if (res && res.value) autoBackupInterval = parseInt(res.value, 10) || 0; } catch (e) {}
    const abInput = document.getElementById('pf-autobackup-min');
    const abDirBtn = document.getElementById('pf-autobackup-dir');
    const abPathEl = document.getElementById('pf-autobackup-path');
    abInput.value = autoBackupInterval;
    abInput.addEventListener('change', () => {
      autoBackupInterval = Math.max(0, Math.min(120, parseInt(abInput.value, 10) || 0));
      abInput.value = autoBackupInterval;
      safeSet(AUTOBACKUP_KEY, String(autoBackupInterval), false);
      startAutoBackup();
      showToast(autoBackupInterval ? 'Auto-backup every ' + autoBackupInterval + ' min' : 'Auto-backup off');
    });
    loadBackupHandle().then(handle => {
      if (handle) { autoBackupDirHandle = handle; abPathEl.textContent = '📂 ' + handle.name; }
    });
    if (!window.showDirectoryPicker) { abDirBtn.style.display = 'none'; }
    abDirBtn.addEventListener('click', async () => {
      try {
        autoBackupDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        saveBackupHandle(autoBackupDirHandle);
        abPathEl.textContent = '📂 ' + autoBackupDirHandle.name;
        showToast('Backup folder set: ' + autoBackupDirHandle.name);
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Could not select folder.', true);
      }
    });
    startAutoBackup();
  })();

  window.addEventListener('beforeunload', () => {
    // Force immediate save to localStorage before page unloads
    try { localStorage.setItem(STORE_KEY, JSON.stringify(projects)); } catch (e) {}
    try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories)); } catch (e) {}
    try { localStorage.setItem('project-flow-cat-emojis', JSON.stringify(categoryEmojis)); } catch(e) {}
  });

  const importInput = document.getElementById('pf-import-file');
  document.getElementById('pf-import').addEventListener('click', () => { _exitMultiSelectMode(); closeAllModals(); importInput.click(); });
  function parseImportJson(raw) {
    raw = raw.replace(/^\uFEFF/, '').trim();
    if (!raw) return { error: 'That file is empty.' };
    try { return { parsed: JSON.parse(raw) }; }
    catch (e) { return { error: 'Failed to parse JSON: ' + e.message }; }
  }

  function extractImportData(parsed) {
    let data = null, importedCategories = [], importedCollapsed = {};
    if (Array.isArray(parsed)) {
      data = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed.projects)) { data = parsed.projects; }
      else { for (const key of Object.keys(parsed)) { if (Array.isArray(parsed[key])) { data = parsed[key]; break; } } }
      if (Array.isArray(parsed.categories)) importedCategories = parsed.categories;
      if (parsed.collapsedCategories && typeof parsed.collapsedCategories === 'object') importedCollapsed = parsed.collapsedCategories;
      if (Array.isArray(parsed.archive)) { archive = parsed.archive; saveArchive(); }
    }
    return { data, importedCategories, importedCollapsed };
  }

  function applyImportData(data, importedCategories, importedCollapsed) {
    snapshot();
    projects = data;
    projects.forEach(p => { p.expanded = false; });
    const fromProjects = projects.map(p => p.category).filter(Boolean);
    categories = Array.from(new Set(categories.concat(importedCategories, fromProjects)));
    collapsedCategories = Object.assign({}, collapsedCategories, importedCollapsed);
    saveCategories(); saveCollapsedCategories(); scheduleSave(); autoArrangeProjects(true);
    showToast('Imported ' + data.length + ' projects' + (categories.length ? ' and ' + categories.length + ' categories' : ''));
  }

  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const { parsed, error } = parseImportJson(String(e.target.result || ''));
      if (error) { showToast(error, true); importInput.value = ''; return; }
      try {
        const { data, importedCategories, importedCollapsed } = extractImportData(parsed);
        if (data && data.length > 0) { applyImportData(data, importedCategories, importedCollapsed); }
        else { showToast('No valid project arrays found in JSON.', true); }
      } catch (err) { showToast('Import failed: ' + err.message, true); }
    };
    reader.onerror = () => { showToast('Could not read that file.', true); };
    reader.readAsText(file);
    importInput.value = '';
  });



  // --- Gamification: Streak, XP, Milestones, Freezes ---
  let _streak = { count: 0, lastDate: '' };
  let _xp = 0;
  let _totalCompletions = 0;
  let _streakFreezes = 2;
  let _freezeWeek = '';
  const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
  function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); dt.setDate(diff); return dt.toISOString().slice(0, 10); }
  (function loadGamification() {
    try { const s = localStorage.getItem('project-flow-streak'); if (s) _streak = JSON.parse(s); } catch(e) {}
    try { const x = localStorage.getItem('project-flow-xp'); if (x) _xp = parseInt(x, 10) || 0; } catch(e) {}
    try { const m = localStorage.getItem('project-flow-milestones'); if (m) _totalCompletions = parseInt(m, 10) || 0; } catch(e) {}
    try { const f = localStorage.getItem('project-flow-streak-freezes'); if (f) { const parsed = JSON.parse(f); _streakFreezes = parsed.count; _freezeWeek = parsed.week; } } catch(e) {}
    const thisWeek = getMonday(new Date());
    if (_freezeWeek !== thisWeek) { _streakFreezes = 2; _freezeWeek = thisWeek; saveGamification(); }
  })();
  function saveGamification() {
    localStorage.setItem('project-flow-streak', JSON.stringify(_streak));
    localStorage.setItem('project-flow-xp', String(_xp));
    localStorage.setItem('project-flow-milestones', String(_totalCompletions));
    localStorage.setItem('project-flow-streak-freezes', JSON.stringify({ count: _streakFreezes, week: _freezeWeek }));
  }
  function onTaskCompleted(isProject) {
    const today = new Date().toISOString().slice(0, 10);
    if (_streak.lastDate === today) { /* already counted */ }
    else if (_streak.lastDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10)) { _streak.count++; _streak.lastDate = today; }
    else {
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
      if (_streak.lastDate === twoDaysAgo && _streakFreezes > 0 && _streak.count > 0) {
        _streakFreezes--;
        _streak.count++;
        _streak.lastDate = today;
        showToast('❄️ Streak freeze used! ' + _streakFreezes + ' remaining');
      } else {
        _streak.count = 1; _streak.lastDate = today;
      }
    }
    const xpGain = isProject ? 25 : 10;
    const oldLvl = Math.floor(_xp / 100) + 1;
    _xp += xpGain;
    const newLvl = Math.floor(_xp / 100) + 1;
    if (newLvl > oldLvl) showToast('⭐ Level up! You\'re now Level ' + newLvl + '!');
    _totalCompletions++;
    if (MILESTONES.includes(_totalCompletions)) { setTimeout(() => showToast('🏆 ' + _totalCompletions + ' tasks completed! Amazing work!'), 800); confetti(); }
    saveGamification(); renderStats();
  }

  // --- Motivational Quotes ---
  const QUOTES = [
    '"The secret of getting ahead is getting started." — Mark Twain',
    '"Done is better than perfect." — Sheryl Sandberg',
    '"Small steps every day lead to big results."',
    '"Focus on progress, not perfection."',
    '"Your future self will thank you."',
    '"Great things are done by a series of small things."',
    '"Start where you are. Use what you have. Do what you can."',
    '"The only way to do great work is to love what you do." — Steve Jobs'
  ];

  // --- Emoji Picker for Projects ---
  const PROJECT_EMOJIS = ['📋','🚀','💡','🎯','🔥','⚡','🌟','💎','🎨','📦','🔧','📱','🌍','🏠','📚','🎮','🧪','💰','❤️','🏆'];
  function showEmojiPicker(p, anchorEl) {
    _closeCtx();
    const picker = document.createElement('div');
    picker.className = 'pf-emoji-picker';
    picker.style.position = 'fixed';
    const rect = anchorEl.getBoundingClientRect();
    picker.style.left = rect.left + 'px'; picker.style.top = (rect.bottom + 4) + 'px';
    PROJECT_EMOJIS.forEach(em => {
      const s = document.createElement('span');
      s.textContent = em;
      s.addEventListener('click', (e) => { e.stopPropagation(); snapshot(); p.emoji = em; scheduleSave(); render(); _closeCtx(); });
      picker.appendChild(s);
    });
    const clearBtn = document.createElement('span');
    clearBtn.textContent = '✕';
    clearBtn.style.color = 'var(--danger)';
    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); snapshot(); p.emoji = ''; scheduleSave(); render(); _closeCtx(); });
    picker.appendChild(clearBtn);
    root.appendChild(picker);
    _ctxEl = picker;
  }

  // --- Theme Presets ---
  const THEME_PRESETS = {
    cyberpunk: { '--bg':'#0d0221','--card':'#1a0a3e','--card-border':'#3d1a6e','--sub-bg':'#130330','--sub-border':'#2d1055','--accent':'#ff00ff','--text':'#00ffff','--text-dim':'#6ecfcf','--header-bg':'#0f0329','--toast-bg':'#1a0a3e','--hover-border':'#ff00ff' },
    forest: { '--bg':'#1a2e1a','--card':'#243524','--card-border':'#3d5a3d','--sub-bg':'#1e2e1e','--sub-border':'#3a5530','--accent':'#7bc67b','--text':'#ffffff','--text-dim':'#b0b0b0','--header-bg':'#1c2c1c','--toast-bg':'#243524','--hover-border':'#7bc67b' },
    ocean: { '--bg':'#0a1628','--card':'#132238','--card-border':'#1e3a5f','--sub-bg':'#0e1c30','--sub-border':'#1a3050','--accent':'#00b4d8','--text':'#caf0f8','--text-dim':'#7fb8cc','--header-bg':'#0c1a2e','--toast-bg':'#132238','--hover-border':'#00b4d8' },
    'light-rose': { '--bg':'#fff5f5','--card':'#ffffff','--card-border':'#f0d4d4','--sub-bg':'#fff9f9','--sub-border':'#f5e0e0','--accent':'#e84393','--text':'#2d1f2f','--text-dim':'#8c6b7a','--header-bg':'#ffffff','--toast-bg':'#2d1f2f','--hover-border':'#e84393' },
    'light-sky': { '--bg':'#f0f7ff','--card':'#ffffff','--card-border':'#d0e3f7','--sub-bg':'#f5faff','--sub-border':'#dceaf5','--accent':'#2563eb','--text':'#1e293b','--text-dim':'#64748b','--header-bg':'#ffffff','--toast-bg':'#1e293b','--hover-border':'#2563eb' },
    'light-mint': { '--bg':'#f0fdf4','--card':'#ffffff','--card-border':'#bbf7d0','--sub-bg':'#f5fef7','--sub-border':'#d1fae5','--accent':'#059669','--text':'#14332a','--text-dim':'#4b7c6f','--header-bg':'#ffffff','--toast-bg':'#14332a','--hover-border':'#059669' },
    'light-sand': { '--bg':'#fefcf3','--card':'#ffffff','--card-border':'#ede5d0','--sub-bg':'#fdfbf5','--sub-border':'#f0ead8','--accent':'#b45309','--text':'#3d2e1a','--text-dim':'#8b7355','--header-bg':'#ffffff','--toast-bg':'#3d2e1a','--hover-border':'#b45309' },
    'pf-dark': { '--bg':'#1a1e2a','--card':'#242a38','--card-border':'#4a4568','--sub-bg':'#1f2230','--sub-border':'#3f3c5a','--accent':'#9580ff','--text':'#f2f4f8','--text-dim':'#a8b0c4','--header-bg':'#1e2233','--toast-bg':'#2a2740','--hover-border':'#6e64a0' },
    'pf-light': { '--bg':'#f6f6fb','--card':'#ffffff','--card-border':'#e6e4f0','--sub-bg':'#fbfaff','--sub-border':'#ece9f7','--accent':'#7b68ee','--text':'#211f33','--text-dim':'#6f6c85','--header-bg':'#ffffff','--toast-bg':'#2a2740','--hover-border':'#c9c3ea' },
    onyx: { '--bg':'#0a0a0a','--card':'#161616','--card-border':'#2b2b2b','--sub-bg':'#101010','--sub-border':'#242424','--accent':'#a3a3a3','--accent-contrast':'#0a0a0a','--text':'#e8e8e8','--text-dim':'#8a8a8a','--header-bg':'#0d0d0d','--toast-bg':'#1c1c1c','--hover-border':'#4a4a4a','--waiting':'#7a94ad','--waiting-bg':'rgba(122,148,173,0.10)','--depth0':'#a3a3a3' }
  };
  const THEME_BTN_IDS = ['pf-theme-pf-dark','pf-theme-cyberpunk','pf-theme-forest','pf-theme-ocean','pf-theme-onyx','pf-theme-light-rose','pf-theme-light-sky','pf-theme-light-mint','pf-theme-light-sand','pf-theme-pf-light'];
  function highlightActiveThemeBtn(name) {
    THEME_BTN_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.outline = (id === 'pf-theme-' + name) ? '2px solid var(--accent)' : '';
    });
  }
  function applyThemePreset(name) {
    root.classList.remove('pf-theme-light', 'pf-theme-eyecare');
    const vars = THEME_PRESETS[name];
    if (vars) { Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v)); }
    safeSet('project-flow-theme-preset', name, false);
    highlightActiveThemeBtn(name);
    showToast('Theme: ' + name.charAt(0).toUpperCase() + name.slice(1));
  }
  function clearThemePreset() {
    const allKeys = new Set();
    Object.values(THEME_PRESETS).forEach(preset => Object.keys(preset).forEach(k => allKeys.add(k)));
    allKeys.forEach(k => root.style.removeProperty(k));
    localStorage.removeItem('project-flow-theme-preset');
  }

  // --- Particle Background ---
  let _particleAnim = null;
  function startParticles() {
    let pc = document.getElementById('pf-particles');
    if (!pc) { pc = document.createElement('canvas'); pc.id = 'pf-particles'; pc.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0.35;'; document.getElementById('pf-canvas-wrap').prepend(pc); }
    const ctx = pc.getContext('2d');
    const particles = Array.from({ length: 30 }, () => ({ x: Math.random() * 2200, y: Math.random() * 1600, vy: -0.2 - Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.2, r: 1.5 + Math.random() * 1.5 }));
    function draw() {
      pc.width = pc.parentElement.clientWidth; pc.height = pc.parentElement.clientHeight;
      ctx.clearRect(0, 0, pc.width, pc.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = pc.height + 10; p.x = Math.random() * pc.width; }
        if (p.x < 0) p.x = pc.width; if (p.x > pc.width) p.x = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(149,128,255,0.6)'; ctx.fill();
      });
      _particleAnim = requestAnimationFrame(draw);
    }
    draw();
  }
  function stopParticles() { if (_particleAnim) { cancelAnimationFrame(_particleAnim); _particleAnim = null; } }

  // --- Pause particles when tab hidden (Feature 12) ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopParticles(); }
    else { if (root.classList.contains('pf-card-mode')) startParticles(); }
  });

  // --- Accessibility (Feature 11) ---
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Orga-naes Project Manager');
  (function applyAria() {
    const toolbar = root.querySelector('.pf-toolbar');
    if (toolbar) { toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Project actions'); }
    const splitView = root.querySelector('.pf-split-view');
    if (splitView) splitView.setAttribute('role', 'main');
    const splitList = root.querySelector('.pf-split-list');
    if (splitList) { splitList.setAttribute('role', 'listbox'); splitList.setAttribute('aria-label', 'Project list'); }
    const newBtn = document.getElementById('pf-new-project');
    if (newBtn) newBtn.setAttribute('aria-label', 'Create new project');
    const undoB = document.getElementById('pf-undo');
    if (undoB) undoB.setAttribute('aria-label', 'Undo');
    const redoB = document.getElementById('pf-redo');
    if (redoB) redoB.setAttribute('aria-label', 'Redo');
    const searchI = document.getElementById('pf-search');
    if (searchI) { searchI.setAttribute('aria-label', 'Search projects'); searchI.setAttribute('role', 'searchbox'); }
  })();

  window._pfLoaded = false;
  loadSize().then(loadTheme).then(loadReminder).then(loadCategories).then(loadCatEmojis).then(loadCollapsedCategories).then(load).then(async () => {
    window._pfLoaded = true;
    let mode = 'focus';
    setViewMode('focus');
    // Restore theme preset
    try { const tp = localStorage.getItem('project-flow-theme-preset'); if (tp === 'auto') applyAutoTheme(); else if (tp && THEME_PRESETS[tp]) applyThemePreset(tp); } catch(e) {}
    // Motivational quote in empty state
    const emptyEl = document.getElementById('pf-empty');
    if (emptyEl && !projects.length) { emptyEl.innerHTML = '<b>' + QUOTES[Math.floor(Math.random() * QUOTES.length)] + '</b><br><br>Click <b>+ New project</b> to get started.'; }
    // Start particles in card mode
    if (mode === 'card') startParticles();
  });

  // Long-press multi-select + touch drag reorder (all devices)
  (function longPressAndDrag() {
    let holdTimer = null, targetEl = null, startX = 0, startY = 0; let _holdFiredSelect = false;
    let _lastPointerX = 0, _lastPointerY = 0;
    let dragActive = false, dragGhost = null, dragStartEl = null, lastDropTarget = null;
    const HOLD_DELAY = 400;
    const IGNORE = '.pf-sub-add, .pf-sub-del, .pf-sub-dot, .pf-sub-edit, .pf-sub-dates, .pf-sub-ctx-btn, .pf-split-list-ctx, .pf-split-list-edit, .pf-badge, .pf-node-del, .pf-chevron, .pf-sub-chevron, [contenteditable="true"]';

    let _suppressNextClick = false;
    document.addEventListener('click', function(e) {
      if (_suppressNextClick) { _suppressNextClick = false; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);

    function doSelect(subRow, listItem) {
      _suppressNextClick = true;
      window._splitSelectSuppressed = true;
      if (navigator.vibrate) navigator.vibrate(30);
      if (subRow && subRow.__subId) {
        const id = subRow.__subId;
        const p = subRow.__project;
        const idx = subMultiSelect.indexOf(id);
        if (idx > -1) { subMultiSelect.splice(idx, 1); subRow.classList.remove('pf-sub-selected'); }
        else { subMultiSelect.push(id); subRow.classList.add('pf-sub-selected'); }
        if (p) renderSubSelectBar(p);
      } else if (listItem && (listItem.dataset.projectId || listItem.dataset.id)) {
        const id = listItem.dataset.projectId || listItem.dataset.id;
        const idx = splitMultiSelect.indexOf(id);
        if (idx > -1) { splitMultiSelect.splice(idx, 1); listItem.classList.remove('pf-split-selected'); }
        else { splitMultiSelect.push(id); listItem.classList.add('pf-split-selected'); }
        if (splitMultiSelect.length === 0) splitSelectedId = null;
        else if (splitMultiSelect.length === 1) splitSelectedId = splitMultiSelect[0];
      }
    }

    function isInMultiSelect() { return splitMultiSelect.length > 0 || subMultiSelect.length > 0; }

    function isItemSelected(subRow, listItem) {
      if (subRow && subRow.__subId) return subMultiSelect.includes(subRow.__subId);
      if (listItem) return splitMultiSelect.includes(listItem.dataset.projectId || listItem.dataset.id || '');
      return false;
    }

    function cleanupDrag() {
      if (dragGhost) { dragGhost.remove(); dragGhost = null; }
      if (lastDropTarget) { lastDropTarget.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); }
      dragStartEl = null; dragActive = false; lastDropTarget = null;
    }

    // Prevent native long-press on touch targets
    document.addEventListener('contextmenu', function(e) {
      if (e.target.closest('.pf-subrow') || e.target.closest('.pf-split-list-item')) {
        e.preventDefault();
      }
    });

    // Pointer events for ALL devices (desktop, tablet, mobile)
    // Gesture: long-press without move = select. long-press + drag = move.
    // When in multi-select: long-press + drag a selected item = move selected items.
    let _pointerCount = 0;
    document.addEventListener('pointerdown', function(e) {
      _pointerCount++;
      if (_pointerCount > 1) { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } return; }
      if (e.button !== 0) return;
      const subRow = e.target.closest('.pf-subrow');
      const listItem = e.target.closest('.pf-split-list-item');
      if (!subRow && !listItem) return;
      if (e.target.closest(IGNORE)) return;
      targetEl = subRow || listItem;
      startX = e.clientX;
      startY = e.clientY;
      _lastPointerX = e.clientX;
      _lastPointerY = e.clientY;
      dragStartEl = null; dragActive = false; _holdFiredSelect = false;

      if (isInMultiSelect() && isItemSelected(subRow, listItem)) {
        // Selected item: arm for drag immediately (drag starts after 50px movement)
        e.preventDefault();
        dragStartEl = targetEl;
      } else if (isInMultiSelect()) {
        // Unselected item while in multi-select: do nothing (tap handles toggle)
        return;
      } else {
        // Not in multi-select: long-press = select + arm for drag in one gesture
        holdTimer = setTimeout(() => {
          holdTimer = null;
          doSelect(subRow, listItem);
          if (navigator.vibrate) navigator.vibrate(30);
          _holdFiredSelect = true;
          dragStartEl = targetEl;
          startX = _lastPointerX;
          startY = _lastPointerY;
          showToast('✓ Selected — drag to move, or tap others to multi-select');
        }, HOLD_DELAY);
      }
    });

    document.addEventListener('pointermove', function(e) {
      _lastPointerX = e.clientX;
      _lastPointerY = e.clientY;
      if (holdTimer) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 15) { clearTimeout(holdTimer); holdTimer = null; }
      }
      if (!dragStartEl) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragActive && Math.abs(dx) + Math.abs(dy) < 50) return;
      if (!dragActive) {
        dragActive = true;
        dragStartEl.style.opacity = '0.4';
        const titleEl = dragStartEl.querySelector('.pf-subrow-title') || dragStartEl.querySelector('.pf-split-list-title');
        const label = titleEl ? titleEl.textContent.trim() : 'Moving...';
        const count = subMultiSelect.length > 1 ? subMultiSelect.length : (splitMultiSelect.length > 1 ? splitMultiSelect.length : 1);
        dragGhost = document.createElement('div');
        dragGhost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;transform:translate(10px,-50%);padding:8px 14px;background:#363636;color:#e0e0e0;border:1px solid var(--accent);border-radius:6px;font-size:12px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.4);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
        dragGhost.textContent = count > 1 ? count + ' items' : label;
        document.body.appendChild(dragGhost);
      }
      dragGhost.style.left = e.clientX + 'px';
      dragGhost.style.top = e.clientY + 'px';
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const dropRow = target ? (target.closest('.pf-subrow') || target.closest('.pf-sublist') || target.closest('.pf-split-list-item') || target.closest('.pf-split-list-cat')) : null;
      if (lastDropTarget && lastDropTarget !== dropRow) { lastDropTarget.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); lastDropTarget.style.outline = ''; }
      if (dropRow && dropRow !== dragStartEl) {
        if (dropRow.classList.contains('pf-subrow')) {
          const rect = dropRow.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'nest';
          dropRow.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest');
          dropRow.classList.add('pf-drop-' + zone);
          dropRow.dataset.dropZone = zone;
        } else if (dropRow.classList.contains('pf-split-list-item')) {
          const rect = dropRow.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const zone = ratio < 0.5 ? 'before' : 'after';
          dropRow.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest');
          dropRow.classList.add('pf-drop-' + zone);
          dropRow.dataset.dropZone = zone;
        } else if (dropRow.classList.contains('pf-split-list-cat')) {
          dropRow.style.outline = '2px solid var(--accent)';
          dropRow.style.outlineOffset = '-2px';
        }
      }
      lastDropTarget = dropRow;
    });

    document.addEventListener('pointerup', function() {
      _pointerCount = Math.max(0, _pointerCount - 1);
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      setTimeout(() => { _suppressNextClick = false; window._splitSelectSuppressed = false; }, 0);
      if (dragStartEl && !dragActive) {
        // Armed but didn't drag — only toggle if hold didn't already select
        dragStartEl.style.opacity = '';
        if (!_holdFiredSelect) {
          const subRow = dragStartEl.classList.contains('pf-subrow') ? dragStartEl : dragStartEl.closest('.pf-subrow');
          const listItem = dragStartEl.classList.contains('pf-split-list-item') ? dragStartEl : dragStartEl.closest('.pf-split-list-item');
          doSelect(subRow, listItem);
        }
        _holdFiredSelect = false;
        cleanupDrag();
        targetEl = null;
        return;
      }
      if (dragStartEl && dragActive) {
        dragStartEl.style.opacity = '';
        const target = lastDropTarget;
        if (target && target.classList.contains('pf-subrow') && target !== dragStartEl && target.__subId && target.__project) {
          const p = target.__project;
          const zone = target.dataset.dropZone || 'after';
          if (dragStartEl.__subId && dragStartEl.__project && dragStartEl.__project.id === p.id) {
            draggingSubId = dragStartEl.__subId;
            draggingProjectId = p.id;
            _draggingSubIds = subMultiSelect.length ? subMultiSelect.slice() : [dragStartEl.__subId];
            performMove(p, target.__subId, zone);
          }
          target.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest');
        } else if (target && target.classList.contains('pf-sublist') && target.__project) {
          const p = target.__project;
          if (dragStartEl.__subId && dragStartEl.__project && dragStartEl.__project.id === p.id) {
            draggingSubId = dragStartEl.__subId;
            draggingProjectId = p.id;
            _draggingSubIds = subMultiSelect.length ? subMultiSelect.slice() : [dragStartEl.__subId];
            performMove(p, null, null);
          }
        } else if (target && target.classList.contains('pf-split-list-item') && target !== dragStartEl) {
          // Reorder projects in list view
          const srcId = dragStartEl.dataset.projectId || dragStartEl.dataset.id;
          const destId = target.dataset.projectId || target.dataset.id;
          if (srcId && destId && srcId !== destId) {
            snapshot();
            const destProj = projects.find(p => p.id === destId);
            const destCat = destProj ? destProj.category : null;
            const idsToMove = splitMultiSelect.length ? splitMultiSelect.slice() : [srcId];
            const movedProjects = [];
            idsToMove.forEach(id => {
              const idx = projects.findIndex(p => p.id === id);
              if (idx > -1) { const mp = projects.splice(idx, 1)[0]; mp.category = destCat; movedProjects.push(mp); }
            });
            const destIdx = projects.findIndex(p => p.id === destId);
            const insertIdx = (target.dataset.dropZone === 'before') ? destIdx : destIdx + 1;
            projects.splice(insertIdx, 0, ...movedProjects);
            splitMultiSelect = [];
            splitSortMode = 'manual'; safeSet('project-flow-sort-mode', 'manual', false);
            scheduleSave(); renderSplitList(); renderSplitDetail();
          }
          target.classList.remove('pf-drop-before', 'pf-drop-after');
        } else if (target && target.classList.contains('pf-split-list-cat')) {
          // Move projects to target category
          const catName = target.dataset.catName || null;
          const destCat = (catName === '__uncategorized__') ? null : catName;
          const srcId = dragStartEl.dataset.projectId || dragStartEl.dataset.id;
          if (srcId) {
            snapshot();
            const idsToMove = splitMultiSelect.length ? splitMultiSelect.slice() : [srcId];
            idsToMove.forEach(id => {
              const proj = projects.find(p => p.id === id);
              if (proj) proj.category = destCat;
            });
            splitMultiSelect = [];
            scheduleSave(); renderSplitList(); renderSplitDetail();
          }
          target.style.outline = '';
        }
      }
      cleanupDrag();
      targetEl = null;
    });

    document.addEventListener('pointercancel', function(e) {
      _pointerCount = Math.max(0, _pointerCount - 1);
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (dragStartEl) dragStartEl.style.opacity = '';
      cleanupDrag();
      targetEl = null;
    });
  })();

  // Force-blur any active editable title/description when clicking outside of it.
  // Some browsers (notably Safari/iOS) don't automatically blur a focused
  // contenteditable element when the click target isn't itself focusable,
  // which left a blinking caret "stuck" in the last-edited field even when
  // clicking on unrelated, non-interactive parts of the UI (e.g. toolbar gaps).
  document.addEventListener('pointerdown', function(e) {
    const active = document.activeElement;
    if (active && active.isContentEditable && active !== e.target && !(e.target.closest && e.target.closest('[contenteditable="true"]') === active)) {
      active.blur();
    }
  }, true);

  // Prevent iOS auto-zoom on contenteditable focus
  const vpMeta = document.querySelector('meta[name="viewport"]');
  document.addEventListener('focusin', function(e) {
    if (e.target && (e.target.contentEditable === 'true' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      vpMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
  });
  document.addEventListener('focusout', function() {
    vpMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  });

  // Update overdue badge on bottom nav
  function updateOverdueBadge() {
    const badge = document.getElementById('pf-bottom-badge');
    const desktopBadge = document.getElementById('pf-desktop-badge');
    const today = new Date(); today.setHours(0,0,0,0);
    let count = 0;
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') { const d = new Date(p.dueAt + 'T00:00:00'); if (d < today) count++; }
      (function walk(list) { list.forEach(s => { if (s.dueAt && s.status !== 'completed') { const d = new Date(s.dueAt + 'T00:00:00'); if (d < today) count++; } if (s.subtasks && s.subtasks.length) walk(s.subtasks); }); })(p.subtasks || []);
    });
    const label = count > 99 ? '99+' : count;
    if (badge) { if (count > 0) { badge.textContent = label; badge.style.display = 'flex'; } else { badge.style.display = 'none'; } }
    if (desktopBadge) { if (count > 0) { desktopBadge.textContent = label; desktopBadge.style.display = 'flex'; } else { desktopBadge.style.display = 'none'; } }
  }
  const _origRender = render;
  let _renderRafId = null;
  render = function() { if (_renderRafId) return; _renderRafId = requestAnimationFrame(() => { _renderRafId = null; _origRender(); (window.requestIdleCallback || setTimeout)(function() { updateOverdueBadge(); saveToday(); }, {timeout: 200}); }); };
  updateOverdueBadge();

  // Floating action button (expandable)
  (function() {
    const fab = document.getElementById('pf-fab');
    const fabMenu = document.getElementById('pf-fab-menu');
    const fabOverlay = document.getElementById('pf-fab-overlay');
    if (!fab || !fabMenu) return;
    let fabOpen = false;
    let _fabHideTimer = null;
    function showFab() {
      fab.classList.add('pf-fab-visible');
      clearTimeout(_fabHideTimer);
      _fabHideTimer = setTimeout(function() { if (!fabOpen) fab.classList.remove('pf-fab-visible'); }, 2000);
    }
    document.addEventListener('scroll', function(e) {
      if (e.target && (e.target.classList && e.target.classList.contains('pf-split-list') || e.target.id === 'pf-split-list')) showFab();
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', function() { showFab(); }, { passive: true });
    function toggleFab() {
      fabOpen = !fabOpen;
      fab.classList.toggle('pf-fab-open', fabOpen);
      fabMenu.classList.toggle('pf-fab-menu-open', fabOpen);
      fabOverlay.classList.toggle('pf-fab-menu-open', fabOpen);
      const sortItem = fabMenu.querySelector('[data-fab="sort"]');
      const addItem = fabMenu.querySelector('[data-fab="add"]');
      if (sortItem) sortItem.style.display = root.classList.contains('pf-detail-open') ? 'none' : '';
      if (addItem) addItem.style.display = root.classList.contains('pf-detail-open') ? 'none' : '';
    }
    function closeFab() {
      fabOpen = false;
      fab.classList.remove('pf-fab-open');
      fabMenu.classList.remove('pf-fab-menu-open');
      fabOverlay.classList.remove('pf-fab-menu-open');
      if (window._navAutoHideRestart) window._navAutoHideRestart();
    }
    fab.addEventListener('click', toggleFab);
    fabOverlay.addEventListener('click', closeFab);
    fabMenu.querySelectorAll('.pf-fab-menu-item').forEach(item => {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = item.dataset.fab;
        if (action === 'sort') {
          if (root.classList.contains('pf-detail-open')) { closeFab(); return; }
          const modes = ['manual', 'name', 'status', 'due-cat', 'created'];
          const labels = ['Manual', 'Name', 'Status', 'Due Date', 'Newest'];
          const cur = modes.indexOf(splitSortMode);
          const next = (cur + 1) % modes.length;
          splitSortMode = modes[next];
          safeSet('project-flow-sort-mode', splitSortMode, false);
          renderSplitList();
          showToast('Sort: ' + labels[next]);
          return;
        }
        if (action !== 'search') closeFab();
        if (action === 'add') openNewProjectCategoryPicker();
        else if (action === 'search') {
          const searchItem = item;
          const rect = searchItem.getBoundingClientRect();
          const searchWrap = document.getElementById('pf-search-wrap');
          const searchInput = document.getElementById('pf-search');
          const bottomPos = window.innerHeight - rect.top - rect.height / 2 - 20;
          searchWrap.style.bottom = bottomPos + 'px';
          root.appendChild(searchWrap);
          closeFab();
          searchWrap.classList.add('pf-search-open');
          searchInput.focus();
          var searchOverlay = document.createElement('div');
          searchOverlay.style.cssText = 'position:fixed;inset:0;z-index:9499;background:transparent;';
          searchOverlay.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); _clearSearch(); searchOverlay.remove(); });
          searchOverlay.addEventListener('touchstart', function(e) { e.stopPropagation(); e.preventDefault(); _clearSearch(); searchOverlay.remove(); });
          root.appendChild(searchOverlay);
          searchWrap._searchOverlay = searchOverlay;
        }
        else if (action === 'expand') {
          if (root.classList.contains('pf-detail-open') && splitSelectedId) {
            const p = projects.find(pr => pr.id === splitSelectedId);
            if (p && p.subtasks && p.subtasks.length) {
              const allExpanded = (function check(list) { return list.every(s => (!s.subtasks || !s.subtasks.length || (s.expanded && check(s.subtasks)))); })(p.subtasks);
              (function setAll(list, val) { list.forEach(s => { s.expanded = val; if (s.subtasks && s.subtasks.length) setAll(s.subtasks, val); }); })(p.subtasks, !allExpanded);
              render();
              showToast(allExpanded ? 'Collapsed all tasks' : 'Expanded all tasks');
            }
          } else {
            const allCollapsed = categories.length > 0 && categories.every(c => splitCollapsedCats[c]);
            if (allCollapsed) { categories.forEach(c => { splitCollapsedCats[c] = false; }); }
            else { categories.forEach(c => { splitCollapsedCats[c] = true; }); }
            renderSplitList();
            showToast(allCollapsed ? 'Expanded all categories' : 'Collapsed all categories');
          }
        }
        else if (action === 'undo') undo();
        else if (action === 'redo') redo();
      });
    });
  })();

  // #11 Bottom navigation bar
  (function() {
    const bottomNav = document.getElementById('pf-bottom-nav');
    if (!bottomNav) return;
    const btns = bottomNav.querySelectorAll('.pf-bottom-nav-btn');
    let _activeNav = 'projects';
    let _navSuppressReset = false;
    function setActiveNav(nav) {
      _activeNav = nav;
      btns.forEach(b => b.classList.remove('pf-bottom-active'));
      btns.forEach(b => { if (b.dataset.nav === nav) b.classList.add('pf-bottom-active'); });
    }
    btns.forEach(btn => {
      btn.addEventListener('click', function() {
        const nav = btn.dataset.nav;
        _navSuppressReset = true;
        if (nav === 'projects') {
          _clearSearch();
          closeAllModals();
          if (root.classList.contains('pf-detail-open')) _goBackToProjects();
        } else if (nav === 'today') {
          closeAllModals(); renderTodayList(); openModal(todayPanel, 'flex');
        } else if (nav === 'duelist') {
          closeAllModals(); renderDueList(); openModal(duelistPanel, 'flex');
        } else if (nav === 'calendar') {
          closeAllModals(); renderCalendar(); openModal(calendarPanel, 'flex');
        } else if (nav === 'options') {
          closeAllModals(); openModal(optionsPanel, 'flex');
        }
        _navSuppressReset = false;
        setActiveNav(nav);
      });
    });
    // Reset active state when modals close externally (backdrop/X button)
    const _origCloseAll = closeAllModals;
    closeAllModals = function() { _origCloseAll(); if (!_navSuppressReset) setActiveNav('projects'); };

    // Auto-hide bottom nav and FAB after 1 second of inactivity
    const fab = document.querySelector('.pf-fab');
    let _navTimer = null;
    function hideNavAndFab() {
      bottomNav.classList.add('pf-nav-hidden');
      if (fab && !fab.classList.contains('pf-fab-open')) fab.classList.add('pf-fab-hidden');
    }
    function showNavAndFab() {
      bottomNav.classList.remove('pf-nav-hidden');
      if (fab) fab.classList.remove('pf-fab-hidden');
      clearTimeout(_navTimer);
      if (!_navPressed) _navTimer = setTimeout(hideNavAndFab, 1500);
    }
    let _navPressed = false;
    bottomNav.addEventListener('touchstart', function() { _navPressed = true; clearTimeout(_navTimer); }, { passive: true });
    bottomNav.addEventListener('touchend', function() { _navPressed = false; _navTimer = setTimeout(hideNavAndFab, 1500); }, { passive: true });
    window._navAutoHideRestart = function() {
      clearTimeout(_navTimer);
      _navTimer = setTimeout(hideNavAndFab, 1500);
    };
    showNavAndFab();
    let _swipeStartY = 0;
    document.addEventListener('touchstart', function(e) { _swipeStartY = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', function(e) {
      const dy = e.changedTouches[0].clientY - _swipeStartY;
      if (Math.abs(dy) > 30) showNavAndFab();
    }, { passive: true });
  })();

  // #4 Swipe right to cycle status on subtasks
  (function() {
    let _swipeStartX = 0, _swipeStartY = 0, _swipeRow = null, _swipeMoved = false;
    document.addEventListener('touchstart', function(e) {
      const row = e.target.closest('.pf-subrow');
      if (!row || subMultiSelect.length > 0) return;
      _swipeRow = row;
      _swipeStartX = e.touches[0].clientX;
      _swipeStartY = e.touches[0].clientY;
      _swipeMoved = false;
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!_swipeRow) return;
      const dx = e.touches[0].clientX - _swipeStartX;
      const dy = e.touches[0].clientY - _swipeStartY;
      if (Math.abs(dy) > 30) { _swipeRow = null; return; }
      if (dx > 60 && !_swipeMoved) {
        _swipeMoved = true;
        if (root.classList.contains('pf-device-mobile') && root.classList.contains('pf-extend-open')) {
          root.classList.remove('pf-extend-open');
          splitDetail.querySelectorAll('.pf-sub-dates > .pf-ext-due').forEach(el => { el.style.minWidth = ''; });
          _swipeRow = null;
          return;
        }
        if (root.classList.contains('pf-device-mobile')) { _swipeRow = null; return; }
        if (root.classList.contains('pf-device-tablet')) {
          _swipeRow = null;
          const detailEl = document.getElementById('pf-split-detail');
          detailEl.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
          detailEl.style.transform = 'translateX(100%)';
          detailEl.style.opacity = '0';
          if (navigator.vibrate) navigator.vibrate(10);
          setTimeout(function() { detailEl.style.transition = ''; detailEl.style.transform = ''; detailEl.style.opacity = ''; _goBackToProjects(); }, 300);
          return;
        }
        const p = _swipeRow.__project;
        const sId = _swipeRow.__subId;
        if (p && sId) {
          if (navigator.vibrate) navigator.vibrate(15);
          cycleSubStatus(p.id, sId);
        }
        _swipeRow = null;
      }
      if (dx < -60 && !_swipeMoved && root.classList.contains('pf-device-mobile')) {
        _swipeMoved = true;
        if (navigator.vibrate) navigator.vibrate(10);
        root.classList.add('pf-extend-open');
        setTimeout(function() { _equalizeColumnWidths(); setTimeout(_equalizeColumnWidths, 250); }, 50);
        _swipeRow = null;
      }
    }, { passive: true });
    document.addEventListener('touchend', function() { _swipeRow = null; }, { passive: true });
  })();

  // #13 Swipe from left edge to go back (touch devices)
  (function() {
    let _backStartX = 0, _backStartY = 0, _backActive = false;
    const detailEl = document.getElementById('pf-split-detail');
    document.addEventListener('touchstart', function(e) {
      if (!root.classList.contains('pf-detail-open')) return;
      if (root.classList.contains('pf-device-desktop')) return;
      if (root.classList.contains('pf-extend-open')) return;
      const x = e.touches[0].clientX;
      const sw = window.innerWidth;
      if (x < sw * 0.05 || x > sw * 0.95) return;
      _backStartX = x;
      _backStartY = e.touches[0].clientY;
      _backActive = true;
      detailEl.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!_backActive) return;
      const dy = Math.abs(e.touches[0].clientY - _backStartY);
      if (dy > 40) { _backActive = false; detailEl.style.transform = ''; detailEl.style.opacity = ''; detailEl.style.transition = ''; return; }
      const dx = Math.max(0, e.touches[0].clientX - _backStartX);
      const progress = Math.min(dx / 150, 1);
      detailEl.style.transform = 'translateX(' + dx + 'px)';
      detailEl.style.opacity = (1 - progress * 0.4).toString();
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      if (!_backActive) { return; }
      const dx = e.changedTouches[0].clientX - _backStartX;
      if (dx > 80) {
        detailEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        detailEl.style.transform = 'translateX(100%)';
        detailEl.style.opacity = '0';
        if (navigator.vibrate) navigator.vibrate(10);
        setTimeout(function() {
          detailEl.style.transition = '';
          detailEl.style.transform = '';
          detailEl.style.opacity = '';
          _goBackToProjects();
        }, 200);
      } else {
        detailEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        detailEl.style.transform = '';
        detailEl.style.opacity = '';
        setTimeout(function() { detailEl.style.transition = ''; }, 200);
      }
      _backActive = false;
    }, { passive: true });
  })();

  // #14 Swipe down from modal header to close (touch devices)
  (function() {
    let _modalStartX = 0, _modalStartY = 0, _modalActive = false, _modalEl = null;
    function getVisibleModal() {
      for (let i = 0; i < ALL_MODALS.length; i++) {
        if (ALL_MODALS[i] && ALL_MODALS[i].style.display !== 'none') return ALL_MODALS[i];
      }
      return null;
    }
    function isModalHeader(target, modal) {
      const firstChild = modal.children[0];
      if (!firstChild) return false;
      if (firstChild.contains(target)) return true;
      if (target.closest('.pf-panel-close')) return true;
      const rect = modal.getBoundingClientRect();
      const touchY = _modalStartY;
      return touchY < rect.top + 50;
    }
    document.addEventListener('touchstart', function(e) {
      if (root.classList.contains('pf-device-desktop')) return;
      const modal = getVisibleModal();
      if (!modal) return;
      if (!modal.contains(e.target) && e.target !== modalBackdrop) return;
      _modalStartX = e.touches[0].clientX;
      _modalStartY = e.touches[0].clientY;
      _modalEl = modal;
      if (!isModalHeader(e.target, modal)) { _modalActive = false; return; }
      _modalActive = true;
      _modalEl.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!_modalActive || !_modalEl) return;
      const dx = Math.abs(e.touches[0].clientX - _modalStartX);
      const dy = e.touches[0].clientY - _modalStartY;
      if (dx > 40) { _modalActive = false; _modalEl.style.transform = ''; _modalEl.style.opacity = ''; _modalEl.style.transition = ''; return; }
      if (dy < 0) return;
      const progress = Math.min(dy / 200, 1);
      _modalEl.style.transform = 'translate(-50%, calc(-50% + ' + dy + 'px))';
      _modalEl.style.opacity = (1 - progress * 0.4).toString();
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      if (!_modalActive || !_modalEl) { _modalActive = false; return; }
      const dy = e.changedTouches[0].clientY - _modalStartY;
      if (dy > 80) {
        _modalEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        _modalEl.style.transform = 'translate(-50%, 100%)';
        _modalEl.style.opacity = '0';
        if (navigator.vibrate) navigator.vibrate(10);
        setTimeout(function() {
          _modalEl.style.transition = '';
          _modalEl.style.transform = '';
          _modalEl.style.opacity = '';
          closeAllModals();
          _modalEl = null;
        }, 200);
      } else {
        _modalEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        _modalEl.style.transform = '';
        _modalEl.style.opacity = '';
        setTimeout(function() { if (_modalEl) { _modalEl.style.transition = ''; } }, 200);
      }
      _modalActive = false;
    }, { passive: true });
  })();

  // #10 Pull-to-refresh (disabled)

  // #12 Haptic feedback extensions
  const _origCycleSubStatus = cycleSubStatus;
  cycleSubStatus = function(pid, sid, targetStatus) { if (navigator.vibrate) navigator.vibrate(10); _origCycleSubStatus(pid, sid, targetStatus); };
  const _origCycleProjectStatus = cycleProjectStatus;
  cycleProjectStatus = function(id, targetStatus) { if (navigator.vibrate) navigator.vibrate(10); _origCycleProjectStatus(id, targetStatus); };

  // #14 Export reminder (prompt weekly if no export in 7 days)
  (function() {
    const LAST_EXPORT_KEY = 'pf-last-export-time';
    const lastExport = parseInt(localStorage.getItem(LAST_EXPORT_KEY) || '0');
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastExport > sevenDays && projects.length > 0) {
      setTimeout(function() {
        showToast('💾 Reminder: Export a backup of your data (Options → Save & Import)');
      }, 5000);
    }
    const exportBtn = document.getElementById('pf-export');
    if (exportBtn) exportBtn.addEventListener('click', function() { localStorage.setItem(LAST_EXPORT_KEY, Date.now().toString()); });
  })();

  // Expose for Firebase sync
  window._pf = {
    getProjects: () => projects,
    setProjects: (p) => { projects = p; },
    getCategories: () => categories,
    setCategories: (c) => { categories = c; },
    renderSplitList: () => renderSplitList(),
    getArchive: () => archive,
    setArchive: (a) => { archive = a; saveArchive(); },
    getTrash: () => trash,
    setTrash: (t) => { trash = t; saveTrash(); },
    scheduleSave: () => scheduleSave(),
    saveCategories: () => saveCategories(),
    render: () => render(),
    showToast: (msg) => showToast(msg),
    snapshot: () => snapshot(),
    getCategoryEmojis: () => categoryEmojis,
    setCategoryEmojis: (e) => { categoryEmojis = e; saveCatEmojis(); },
    stopAutoBackup: () => { if (_autoBackupTimer) { clearInterval(_autoBackupTimer); _autoBackupTimer = null; } }
  };

  // Test-only hook: exposes import internals for the automated test suite.
  // Never active unless window.__TEST__ is set before load.
  if (window.__TEST__) {
    window.__appInternals = {
      STORE_KEY, parseImportJson, extractImportData, applyImportData
    };
  }

  // Pull-to-refresh (disabled)

  // Scroll-to-top button
  (function() {
    const root = document.getElementById('pf-root');
    const btn = document.createElement('button');
    btn.className = 'pf-scroll-top';
    btn.innerHTML = '↑';
    btn.title = 'Scroll to top';
    root.appendChild(btn);
    btn.addEventListener('click', function() {
      const list = root.querySelector('.pf-split-list');
      if (list) list.scrollTo({ top: 0, behavior: 'smooth' });
    });
    let _scrollRaf = null;
    let _scrollTopTimer = null;
    function checkScroll() {
      const list = root.querySelector('.pf-split-list');
      if (!list) return;
      if (list.scrollTop > 400) {
        btn.classList.add('pf-visible');
        clearTimeout(_scrollTopTimer);
        _scrollTopTimer = setTimeout(function() { btn.classList.remove('pf-visible'); }, 1500);
      } else {
        btn.classList.remove('pf-visible');
      }
    }
    let _hasScrolled = false;
    function checkOverscroll() {}
    const _scrollInterval = setInterval(function() {
      const list = root.querySelector('.pf-split-list');
      if (list && !list._scrollTopBound) {
        list._scrollTopBound = true;
        list.addEventListener('scroll', function() {
          _hasScrolled = true;
          if (_scrollRaf) return;
          _scrollRaf = requestAnimationFrame(function() { _scrollRaf = null; checkScroll(); checkOverscroll(list); });
        }, { passive: true });
        clearInterval(_scrollInterval);
      }
    }, 500);
  })();

})();

