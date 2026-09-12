  // SUBSECTION: IndexedDB Mirror & Auto-Backup
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
      req.onerror = (e) => { if (typeof logError === 'function') logError('IndexedDB open (snapshots)', (e.target && e.target.error) || new Error('Failed to open snapshots DB')); resolve(null); };
    });
  }

  // Strips transient, non-content fields before comparing snapshots so that
  // merely viewing/expanding a project (which sets `expanded`, and can shift
  // `x`/`y` on the canvas) doesn't make the periodic auto-snapshot think real
  // data changed. Mirrors normalizeForSync() in the Firebase sync section,
  // which solves the identical problem for cloud conflict detection.
  function _snapshotNormalize(list) {
    if (!Array.isArray(list)) return list;
    return list.map(function(item) {
      if (!item || typeof item !== 'object') return item;
      const copy = Object.assign({}, item);
      delete copy.expanded;
      delete copy.x;
      delete copy.y;
      Object.keys(copy).forEach(function(key) {
        if (copy[key] === null || typeof copy[key] === 'undefined') delete copy[key];
      });
      if (Array.isArray(copy.subtasks)) copy.subtasks = _snapshotNormalize(copy.subtasks);
      return copy;
    });
  }
  let _lastIdbSnapshotHash = null;
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
  // Only writes a new snapshot when the actual project content differs from
  // the last one saved — skips false positives caused by transient UI state
  // (e.g. a project's `expanded` flag flipping just from clicking to view it).
  function _maybeSaveSnapshot() {
    if (!projects.length) return;
    const hash = JSON.stringify(_snapshotNormalize(projects));
    if (hash === _lastIdbSnapshotHash) return;
    _lastIdbSnapshotHash = hash;
    idbSaveSnapshot(JSON.parse(JSON.stringify(projects)));
  }
  function startIdbSnapshotBackup() {
    if (_autoBackupTimer) clearInterval(_autoBackupTimer);
    _autoBackupTimer = setInterval(_maybeSaveSnapshot, AUTO_BACKUP_INTERVAL);
    _maybeSaveSnapshot();
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

  // Wipes the auto-backup snapshot store. Without this, signing out or
  // switching accounts leaves the previous account's data sitting in this
  // (separate) IndexedDB database, and the very next page load sees an
  // empty `projects` and "recovers" it right back via recoverFromIDB()
  // above — silently undoing the sign-out on refresh.
  async function clearIdbSnapshots() {
    try {
      const db = await openIDB();
      if (!db) return;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
    } catch (e) {}
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

  const THEME_KEY = 'project-flow-theme';
  // Legacy class-based theme toggle retired in favour of the preset system
  // (see Theme Presets). loadTheme stays in the boot chain but only clears the
  // legacy classes so a previously-stored 'light'/'eye-care' can't fight presets.
  async function loadTheme() { root.classList.remove('pf-theme-light', 'pf-theme-eye-care'); }

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
  const notesPanel = document.getElementById('pf-notes-panel');
  const archivePanel = document.getElementById('pf-archive-panel');
  const trashPanel = document.getElementById('pf-trash-panel');
  const commentPanel = document.getElementById('pf-comment-panel');
  const colorModal = document.getElementById('pf-color-modal');
  const duelistPanel = document.getElementById('pf-duelist-panel');
  const snapshotsPanel = document.getElementById('pf-snapshots-panel');
  const copyModal = document.getElementById('pf-copy-modal');
  const errorPanel = document.getElementById('pf-error-panel');
  const ALL_MODALS = [duePanel, reminderPopover, categoryPopover, newProjectPopover, optionsPanel, shortcutsPanel, activityPanel, todayPanel, duelistPanel, calendarPanel, weeklyPanel, notesPanel, archivePanel, trashPanel, commentPanel, colorModal, snapshotsPanel, copyModal, errorPanel];
  function closeAllModals() { ALL_MODALS.forEach(m => { m.style.display = 'none'; }); modalBackdrop.style.display = 'none'; }
  function openModal(el, displayValue) { closeAllModals(); el.style.display = displayValue; modalBackdrop.style.display = 'block'; _markOverlayOpen('modals'); }
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
      return '<tr class="' + rowCls + ' pf-due-row-clickable" data-project-id="' + it.projectId + '" data-title="' + escapeHtml(it.title) + '" title="Click to open"><td>' + escapeHtml(it.title) + path + '</td><td>' + formatDateShort(it.dueAt) + '</td></tr>';
    }).join('');
    tbody.querySelectorAll('tr[data-project-id]').forEach(row => {
      row.addEventListener('click', () => {
        jumpToTask(row.dataset.projectId, row.dataset.title);
      });
    });
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

  const CATEGORY_COLORS = ['#7b68ee', '#f0a742', '#3fc27a', '#4fb8d6', '#e0503f', '#d968c9']; // fixed user-facing palette; [0] mirrors the classic accent
