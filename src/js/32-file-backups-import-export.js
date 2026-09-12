  // SUBSECTION: File Backups & Import/Export
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
    const json = JSON.stringify(Object.assign(buildFullBackupPayload(), { backupAt: new Date().toISOString() }), null, 2);
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
      } catch (err) { showToast('Backup folder error, using download.', true); autoBackupDirHandle = null; logError('Auto-backup to folder', err); }
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
        if (err.name !== 'AbortError') { showToast('Could not select folder.', true); logError('Auto-backup folder picker', err); }
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
    catch (e) { logError('Import JSON parse', e); return { error: 'Failed to parse JSON: ' + e.message }; }
  }

  function extractImportData(parsed) {
    let data = null, importedCategories = [], importedCollapsed = {};
    let importedTrash = null, importedToday = null, importedWeekly = null, importedReminders = null, importedEmojis = null, importedNotes = null;
    if (Array.isArray(parsed)) {
      data = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed.projects)) { data = parsed.projects; }
      else { for (const key of Object.keys(parsed)) { if (Array.isArray(parsed[key])) { data = parsed[key]; break; } } }
      if (Array.isArray(parsed.categories)) importedCategories = parsed.categories;
      if (parsed.collapsedCategories && typeof parsed.collapsedCategories === 'object') importedCollapsed = parsed.collapsedCategories;
      if (Array.isArray(parsed.archive)) { archive = parsed.archive; saveArchive(); }
      if (Array.isArray(parsed.trash)) importedTrash = parsed.trash;
      if (parsed.today && typeof parsed.today === 'object') importedToday = parsed.today;
      if (parsed.weeklyData && typeof parsed.weeklyData === 'object') importedWeekly = parsed.weeklyData;
      if (Array.isArray(parsed.reminders)) importedReminders = parsed.reminders;
      if (parsed.categoryEmojis && typeof parsed.categoryEmojis === 'object') importedEmojis = parsed.categoryEmojis;
      if (Array.isArray(parsed.notes)) importedNotes = parsed.notes;
    }
    return { data, importedCategories, importedCollapsed, importedTrash, importedToday, importedWeekly, importedReminders, importedEmojis, importedNotes };
  }

  // Fills in safe defaults for missing/malformed fields on an imported project or subtask so a
  // damaged or hand-edited backup can't break rendering, sync, or the undo stack. Recurses into subtasks.
  function sanitizeImportedNode(node, seenIds) {
    if (!node || typeof node !== 'object') node = {};
    if (typeof node.id !== 'string' || !node.id || seenIds.has(node.id)) node.id = uid();
    seenIds.add(node.id);
    if (typeof node.title !== 'string' || !node.title.trim()) node.title = 'Untitled';
    if (!STATUSES.includes(node.status)) node.status = 'planned';
    if (node.category != null && typeof node.category !== 'string') node.category = null;
    if (node.dueAt != null && typeof node.dueAt !== 'string') node.dueAt = null;
    if (node.createdAt != null && typeof node.createdAt !== 'string') node.createdAt = null;
    if (node.completedAt != null && typeof node.completedAt !== 'string') node.completedAt = null;
    if (!Array.isArray(node.subtasks)) node.subtasks = [];
    node.subtasks = node.subtasks.map(s => sanitizeImportedNode(s, seenIds));
    return node;
  }
  function sanitizeImportedProjects(data) {
    const seenIds = new Set();
    return (Array.isArray(data) ? data : []).filter(p => p != null).map(p => sanitizeImportedNode(p, seenIds));
  }

  function applyImportData(data, importedCategories, importedCollapsed, importedTrash, importedToday, importedWeekly, importedReminders, importedEmojis, importedNotes) {
    snapshot();
    projects = sanitizeImportedProjects(data);
    projects.forEach(p => { p.expanded = false; });
    const fromProjects = projects.map(p => p.category).filter(Boolean);
    const safeImportedCategories = (Array.isArray(importedCategories) ? importedCategories : []).filter(c => typeof c === 'string');
    categories = Array.from(new Set(categories.concat(safeImportedCategories, fromProjects)));
    collapsedCategories = Object.assign({}, collapsedCategories, importedCollapsed);
    saveCategories(); saveCollapsedCategories(); scheduleSave(); autoArrangeProjects(true);
    let restoredExtras = 0;
    if (Array.isArray(importedTrash)) { trash = importedTrash; saveTrash(); renderTrashList(); restoredExtras++; }
    if (importedToday && Array.isArray(importedToday.tasks)) { todayTasks = importedToday.tasks; todayDate = typeof importedToday.date === 'string' ? importedToday.date : todayLocalStr(); saveToday(); renderTodayList(); restoredExtras++; }
    if (importedWeekly) { weeklyData = importedWeekly; saveWeekly(); renderWeeklyPanel(); restoredExtras++; }
    if (Array.isArray(importedReminders)) { reminders = importedReminders; saveReminders(); restoredExtras++; }
    if (importedEmojis) { categoryEmojis = importedEmojis; saveCatEmojis(); restoredExtras++; }
    if (importedNotes) {
      // Merge by id (imported wins on conflict), preserving any local notes.
      const byId = {};
      (window._pf && Array.isArray(window._pf.getNotesSnapshot) ? window._pf.getNotesSnapshot() || [] : []).forEach(n => { byId[n.id] = n; });
      importedNotes.filter(n => n && typeof n === 'object' && typeof n.id === 'string').forEach(n => { byId[n.id] = n; });
      const merged = Object.values(byId);
      if (window._pf && typeof window._pf.replaceNotes === 'function') { window._pf.replaceNotes(merged); restoredExtras++; }
    }
    showToast('Imported ' + projects.length + ' projects' + (categories.length ? ' and ' + categories.length + ' categories' : '') + (restoredExtras ? ' (plus trash/today/weekly/reminders/notes from backup)' : ''));
  }

  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const { parsed, error } = parseImportJson(String(e.target.result || ''));
      if (error) { showToast(error, true); importInput.value = ''; return; }
      try {
        const { data, importedCategories, importedCollapsed, importedTrash, importedToday, importedWeekly, importedReminders, importedEmojis } = extractImportData(parsed);
        if (data && data.length > 0) { applyImportData(data, importedCategories, importedCollapsed, importedTrash, importedToday, importedWeekly, importedReminders, importedEmojis, importedNotes); }
        else { showToast('No valid project arrays found in JSON.', true); }
      } catch (err) { showToast('Import failed: ' + err.message, true); logError('Import', err); }
    };
    reader.onerror = () => { showToast('Could not read that file.', true); };
    reader.readAsText(file);
    importInput.value = '';
  });



