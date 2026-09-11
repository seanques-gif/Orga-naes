    // SUBSECTION: Activity Log
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
      const isLatest = i === 0 ? ' <span style="color:var(--accent);font-weight:700;font-size: calc(var(--font-size-base) - 4px);">LATEST</span>' : '';
      return '<div class="pf-activity-item" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size: calc(var(--font-size-base) - 2px);font-weight:600;color:var(--text);">' + timeStr + isLatest + '</div>' +
          '<div style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);">' + projCount + ' projects · ' + taskCount + ' tasks</div>' +
        '</div>' +
        '<button class="pf-undo-btn" data-snap-idx="' + i + '" style="font-size: calc(var(--font-size-base) - 3px);padding:4px 10px;white-space:nowrap;">Restore</button>' +
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
  (async function loadActivity() { try { const res = await safeGet(ACTIVITY_KEY, false); if (res && res.value) { const parsed = JSON.parse(res.value); activityLog.push(...parsed); } } catch (e) { logError('Load activity log', e); } })();
  loadArchive();
  loadTrash();

