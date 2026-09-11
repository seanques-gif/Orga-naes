    // SUBSECTION: Weekly Planner
  function getWeekStart(offset) {
    const d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (offset * 7));
    return d;
  }
  function localDateStr(d) { const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+day; }
  function todayLocalStr() { return localDateStr(new Date()); }
  function daysAgoLocalStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d); }
  function weekDateStr(d) { return localDateStr(d); }
  async function loadWeekly() {
    try { const res = await safeGet(WEEKLY_KEY, false); if (res && res.value) weeklyData = JSON.parse(res.value); } catch (e) { weeklyData = {}; logError('Load weekly planner', e); }
  }
  function saveWeekly() { safeSet(WEEKLY_KEY, JSON.stringify(weeklyData), false); }

  // Backlog — a dedicated, unstructured holding area for unfinished/past-due
  // Weekly Planner tasks, manually arranged from here into day columns.
  // Deliberately kept as its own top-level key/array rather than a special
  // entry inside weeklyData: weeklyData's keys are assumed to be day strings
  // everywhere (relocation, pruning, and rollover in syncWeeklyWithTasks all
  // iterate Object.keys(weeklyData) and treat every entry as a day array), so
  // a 'backlog' property there would get silently swept up by that logic
  // (e.g. relocated back onto a task's due date the moment syncWeeklyWithTasks
  // ran, undoing the whole point of a manual holding area). A separate key
  // avoids that entirely and keeps existing weekly-planner logic untouched.
  const BACKLOG_KEY = 'project-flow-backlog';
  let backlogData = [];
  async function loadBacklog() {
    try { const res = await safeGet(BACKLOG_KEY, false); if (res && res.value) backlogData = JSON.parse(res.value); } catch (e) { backlogData = []; logError('Load backlog', e); }
  }
  function saveBacklog() { safeSet(BACKLOG_KEY, JSON.stringify(backlogData), false); }

  // Dismissal tracking — clicking '×' on a linked planner entry (one with a
  // sourceId) should behave like "I don't want to see this occurrence again"
  // rather than "add it right back on the next sync pass", which is what
  // plain removal from weeklyData/backlogData would otherwise do since the
  // source task's dueAt is untouched. Keyed by `sourceId|dueAt` (not just
  // sourceId) so that if the user later changes the task's actual due date,
  // that's a *new* occurrence the dismissal shouldn't suppress — the old key
  // simply stops matching and is garbage-collected in sync step 2 below.
  const DISMISSED_KEY = 'project-flow-dismissed-weekly';
  let dismissedOccurrences = {}; // { [sourceId + '|' + dueAt]: true }
  async function loadDismissed() {
    try { const res = await safeGet(DISMISSED_KEY, false); if (res && res.value) dismissedOccurrences = JSON.parse(res.value); } catch (e) { dismissedOccurrences = {}; logError('Load dismissed', e); }
  }
  function saveDismissed() { safeSet(DISMISSED_KEY, JSON.stringify(dismissedOccurrences), false); }
  function dismissalKey(sourceId, dueAt) { return sourceId + '|' + dueAt; }
  function dismissOccurrence(sourceId, dueAt) {
    if (!sourceId || !dueAt) return;
    dismissedOccurrences[dismissalKey(sourceId, dueAt)] = true;
    saveDismissed();
  }
  function undismissOccurrence(sourceId, dueAt) {
    if (!sourceId || !dueAt) return;
    delete dismissedOccurrences[dismissalKey(sourceId, dueAt)];
    saveDismissed();
  }
  // Snapshot/undo for destructive Weekly Planner edits (delete task, clear
  // day, clear week). Separate from the main projects undo stack (snapshot/
  // undo/redo above) since weeklyData isn't part of `projects` and isn't
  // covered by that stack at all — this is a single-level undo, surfaced
  // via the same toast "Undo" action pattern used elsewhere.
  // Covers both weeklyData and backlogData in one snapshot — several
  // actions (move to/from backlog, Auto-arrange) touch both at once, so a
  // single combined undo keeps them consistent instead of only rolling
  // back half the change. Also tracks any source task dueAt changes made
  // while a snapshot is open (see _weeklyUndoDueAtReverts below): moving a
  // task to a different day updates the linked task's real dueAt via the
  // main project snapshot()/scheduleSave() — a separate undo stack from
  // this one — so without reverting it too, undoing here would put the
  // planner entry back but leave the task's actual due date pointing at
  // wherever it was moved to, which the next sync pass would then use to
  // silently re-add the "undone" entry right back.
  let _weeklyUndoSnapshot = null;
  let _backlogUndoSnapshot = null;
  let _weeklyUndoDueAtReverts = null;
  let _dismissedUndoSnapshot = null;
  function weeklySnapshot() {
    _weeklyUndoSnapshot = JSON.parse(JSON.stringify(weeklyData));
    _backlogUndoSnapshot = JSON.parse(JSON.stringify(backlogData));
    _dismissedUndoSnapshot = JSON.parse(JSON.stringify(dismissedOccurrences));
    _weeklyUndoDueAtReverts = [];
  }
  function weeklyUndo() {
    if (!_weeklyUndoSnapshot) return;
    weeklyData = _weeklyUndoSnapshot;
    backlogData = _backlogUndoSnapshot || [];
    dismissedOccurrences = _dismissedUndoSnapshot || {};
    const dueAtReverts = _weeklyUndoDueAtReverts;
    _weeklyUndoSnapshot = null;
    _backlogUndoSnapshot = null;
    _dismissedUndoSnapshot = null;
    _weeklyUndoDueAtReverts = null;
    saveWeekly();
    saveBacklog();
    saveDismissed();
    if (dueAtReverts && dueAtReverts.length) {
      dueAtReverts.forEach(({ node, prevDueAt }) => { node.dueAt = prevDueAt; });
      scheduleSave();
      render();
    }
    renderWeeklyPanel();
  }
  // Moves (or reorders) a weekly task. targetTaskId + insertBefore describe
  // where within the destination day to place it — omit targetTaskId to
  // append at the end. Shared by the native HTML5 drag/drop handlers
  // (mouse, see renderWeeklyPanel below) and the touch/pen long-press-drag
  // handler (weeklyTouchDragSupport) so both gestures move a task the same
  // way instead of duplicating this logic.
  function moveWeeklyTask(taskId, fromDay, toDay, targetTaskId, insertBefore) {
    const fromArr = weeklyData[fromDay] || [];
    const idx = fromArr.findIndex(x => x.id === taskId);
    if (idx < 0) return;
    const task = fromArr.splice(idx, 1)[0];
    if (!weeklyData[toDay]) weeklyData[toDay] = [];
    const targetArr = weeklyData[toDay];
    let insertAt = targetArr.length;
    if (targetTaskId) {
      // Recompute the target's index now, after the splice above — if
      // fromDay === toDay this is the same array and may have shifted.
      const tIdx = targetArr.findIndex(x => x.id === targetTaskId);
      if (tIdx >= 0) insertAt = insertBefore ? tIdx : tIdx + 1;
    }
    targetArr.splice(insertAt, 0, task);
    if (fromDay !== toDay && task.sourceId) {
      const srcProject = projects.find(pr => pr.id === task.sourceId || (pr.subtasks && findSubNode(pr.subtasks, task.sourceId)));
      if (srcProject) {
        const node = srcProject.id === task.sourceId ? srcProject : findSubNode(srcProject.subtasks, task.sourceId);
        if (node) {
          if (_weeklyUndoDueAtReverts) _weeklyUndoDueAtReverts.push({ node, prevDueAt: node.dueAt });
          snapshot(); node.dueAt = toDay; scheduleSave(); render();
        }
      }
    }
    saveWeekly();
    renderWeeklyPanel();
  }
  // Touch/pen equivalent of the native HTML5 drag/drop wired up in
  // renderWeeklyPanel below. Native HTML5 DnD (draggable=true, dragstart/
  // dragover/drop) never fires on touch input at all, so without this a
  // task could only be reordered or moved between days with a mouse —
  // dead on phones/tablets, which this app's own CSS (bottom nav, FAB,
  // pf-device-mobile) clearly expects to be a first-class target. Uses a
  // long-press (so a normal scroll/tap through the day column isn't
  // mistaken for a drag) followed by a floating clone that tracks the
  // finger; drop target is resolved with elementFromPoint since touch
  // events don't carry their own drop target the way mouse dragover does.
  // Ends by calling the same moveWeeklyTask() the mouse path uses, so both
  // gestures move a task identically.
  let _wtd = null;
  function weeklyTouchDragSupport(row, t, ds) {
    let pressTimer = null;
    let startX = 0, startY = 0;
    let dragging = false;
    const LONG_PRESS_MS = 300;
    const MOVE_CANCEL_PX = 10;
    row.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX; startY = touch.clientY;
      dragging = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { dragging = true; _startWeeklyTouchDrag(row, t, ds, touch); }, LONG_PRESS_MS);
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      if (!dragging) {
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - startX) > MOVE_CANCEL_PX || Math.abs(touch.clientY - startY) > MOVE_CANCEL_PX) clearTimeout(pressTimer);
        return;
      }
      e.preventDefault();
      _updateWeeklyTouchDrag(e.touches[0]);
    }, { passive: false });
    row.addEventListener('touchend', (e) => {
      clearTimeout(pressTimer);
      if (dragging) { e.preventDefault(); _endWeeklyTouchDrag(); dragging = false; }
    });
    row.addEventListener('touchcancel', () => {
      clearTimeout(pressTimer);
      if (dragging) { _cancelWeeklyTouchDrag(); dragging = false; }
    });
  }
  // Fallback for any touch sequence that ends without the row's own
  // touchend/touchcancel firing (e.g. the OS intercepts the gesture, or a
  // second touch starts mid-drag) — without this the ghost clone and its
  // 0.3 opacity on the source row could be stranded indefinitely.
  document.addEventListener('touchcancel', () => { if (_wtd) _cancelWeeklyTouchDrag(); }, { passive: true });
  document.addEventListener('touchend', () => { if (_wtd) _cancelWeeklyTouchDrag(); }, { passive: true });
  function _clearWeeklyDragVisuals() {
    document.querySelectorAll('.pf-week-task').forEach(r => { r.style.borderTop = ''; r.style.borderBottom = ''; });
    document.querySelectorAll('.pf-week-col').forEach(c => { c.classList.remove('pf-week-col-dragover'); c.classList.remove('pf-week-col-dragover-blocked'); });
  }
  function _startWeeklyTouchDrag(row, t, ds, touch) {
    if (navigator.vibrate) navigator.vibrate(15);
    const rect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.zIndex = '99999';
    ghost.style.opacity = '0.9';
    ghost.style.pointerEvents = 'none';
    ghost.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    // Inside #pf-root so the cloned row keeps its #pf-root-scoped styling.
    document.getElementById('pf-root').appendChild(ghost);
    row.style.opacity = '0.3';
    _wtd = { taskId: t.id, fromDay: ds, ghost, sourceRow: row, offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top, targetDay: null, targetTaskId: null, insertBefore: false, blocked: false };
  }
  function _updateWeeklyTouchDrag(touch) {
    if (!_wtd) return;
    _wtd.ghost.style.left = (touch.clientX - _wtd.offsetX) + 'px';
    _wtd.ghost.style.top = (touch.clientY - _wtd.offsetY) + 'px';
    _wtd.ghost.style.display = 'none';
    const under = document.elementFromPoint(touch.clientX, touch.clientY);
    _wtd.ghost.style.display = '';
    _clearWeeklyDragVisuals();
    const targetCol = under && under.closest('.pf-week-col');
    if (!targetCol) { _wtd.targetDay = null; _wtd.targetTaskId = null; _wtd.blocked = false; return; }
    const colDay = targetCol.dataset.day;
    if (colDay < todayLocalStr()) {
      // Finished week — mark visually blocked and refuse it as a drop
      // target; a past-day entry would just get rolled forward to today
      // by syncWeeklyWithTasks on the next save anyway.
      targetCol.classList.add('pf-week-col-dragover-blocked');
      _wtd.targetDay = null;
      _wtd.targetTaskId = null;
      _wtd.blocked = true;
      return;
    }
    _wtd.blocked = false;
    targetCol.classList.add('pf-week-col-dragover');
    _wtd.targetDay = colDay;
    const targetRow = under.closest('.pf-week-task');
    if (targetRow && targetRow.dataset.taskId !== _wtd.taskId) {
      const rect = targetRow.getBoundingClientRect();
      const before = (touch.clientY - rect.top) < rect.height / 2;
      targetRow.style.borderTop = before ? '2px solid var(--accent)' : '';
      targetRow.style.borderBottom = before ? '' : '2px solid var(--accent)';
      _wtd.targetTaskId = targetRow.dataset.taskId;
      _wtd.insertBefore = before;
    } else {
      _wtd.targetTaskId = null;
      _wtd.insertBefore = false;
    }
  }
  function _endWeeklyTouchDrag() {
    if (!_wtd) return;
    const { taskId, fromDay, targetDay, targetTaskId, insertBefore, ghost, sourceRow, blocked } = _wtd;
    ghost.remove();
    sourceRow.style.opacity = '';
    _clearWeeklyDragVisuals();
    _wtd = null;
    if (targetDay && !(targetDay === fromDay && targetTaskId === taskId)) moveWeeklyTask(taskId, fromDay, targetDay, targetTaskId, insertBefore);
    else if (blocked) showToast("Can't move tasks to a finished week — they'd just roll forward to today", true);
  }
  function _cancelWeeklyTouchDrag() {
    if (!_wtd) return;
    if (_wtd.ghost && _wtd.ghost.isConnected) _wtd.ghost.remove();
    if (_wtd.sourceRow) _wtd.sourceRow.style.opacity = '';
    _clearWeeklyDragVisuals();
    _wtd = null;
  }
  // Single housekeeping pass that keeps the Weekly Planner in sync with
  // task state, called from scheduleSave() after every mutation (and now
  // also runs from app boot — see loadWeekly() in the startup chain — so
  // it's live even before the planner has ever been opened this session):
  //  1. Relocates entries whose linked task's due date has changed since
  //     the entry was added, so editing a due date directly on the task
  //     moves its Weekly Planner entry too.
  //  2. Prunes entries whose linked task has since been completed, or whose
  //     linked task no longer exists in `projects` at all (archived or
  //     trashed) — either way the task is gone from the active view.
  //  3. Rolls any entry still sitting on a day before today forward onto
  //     today, so a missed day doesn't just silently fall out of view.
  //     This only moves the *planner* entry — it never touches the linked
  //     task's real due date, so the Overdue badge/Due List elsewhere keep
  //     reflecting the task's actual due date honestly.
  //  4. Adds an entry for any project/subtask with a due date (any week,
  //     not just the one currently open) that doesn't have one yet — this
  //     also covers a recurring task's due date bumping forward, since
  //     that just looks like "a due date changed" from here.
  // Steps 2 and 4 used to be two separate full scans of the projects tree;
  // merged into one walk (building a single id → node map) since this now
  // runs on every save rather than only while the planner is open.
  function syncWeeklyWithTasks() {
    const nodeById = new Map();
    const dueNodes = [];
    projects.forEach(p => {
      nodeById.set(p.id, p);
      if (p.dueAt && p.status !== 'completed') dueNodes.push({ dueAt: p.dueAt, title: p.title, sourceId: p.id, sourceType: 'project', projectTitle: null });
      (function walk(subs) {
        subs.forEach(s => {
          nodeById.set(s.id, s);
          if (s.dueAt && s.status !== 'completed') dueNodes.push({ dueAt: s.dueAt, title: s.title, sourceId: s.id, sourceType: 'subtask', projectTitle: p.title });
          if (s.subtasks) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });

    let changed = false;

    // 1. Relocate entries whose linked task's due date has changed since
    //    the entry was added — e.g. editing the due date directly on the
    //    task (rather than dragging the planner entry, which already
    //    updates dueAt the other direction via moveWeeklyTask) previously
    //    left the old planner entry stuck on the original day.
    const relocations = [];
    Object.keys(weeklyData).forEach(ds => {
      weeklyData[ds].forEach(t => {
        if (!t.sourceId) return;
        const node = nodeById.get(t.sourceId);
        if (node && node.dueAt && node.dueAt !== ds) relocations.push({ from: ds, task: t, to: node.dueAt });
      });
    });
    relocations.forEach(({ from, task, to }) => {
      weeklyData[from] = weeklyData[from].filter(t => t !== task);
      if (!weeklyData[from].length) delete weeklyData[from];
      if (!weeklyData[to]) weeklyData[to] = [];
      weeklyData[to].push(task);
      changed = true;
    });

    // 2. Prune completed. Applies to the Backlog too — a source task can be
    //    completed/archived/trashed directly (not through its planner
    //    entry) while sitting in the Backlog, and without this it would
    //    stay there forever since nothing else ever revisits backlogData.
    Object.keys(weeklyData).forEach(ds => {
      const before = weeklyData[ds].length;
      weeklyData[ds] = weeklyData[ds].filter(t => {
        if (!t.sourceId) return true;
        const node = nodeById.get(t.sourceId);
        // node is undefined once its source task has been archived or
        // trashed (both remove it from `projects` entirely) — treat that
        // the same as "completed" instead of keeping the entry forever.
        return !!node && node.status !== 'completed';
      });
      if (weeklyData[ds].length !== before) changed = true;
      if (!weeklyData[ds].length) delete weeklyData[ds];
    });
    {
      const beforeBacklog = backlogData.length;
      backlogData = backlogData.filter(t => {
        if (!t.sourceId) return true;
        const node = nodeById.get(t.sourceId);
        return !!node && node.status !== 'completed';
      });
      if (backlogData.length !== beforeBacklog) { saveBacklog(); if (weeklyPanel && weeklyPanel.style.display !== 'none') renderWeeklyPanel(); }
    }
    // 2b. Garbage-collect stale dismissal keys. A dismissal is only ever
    //     meant to suppress the exact occurrence (sourceId + dueAt) that was
    //     active when '×' was clicked — once that's no longer the source
    //     task's current due date (the user edited it, or it's since been
    //     completed/archived/trashed and node is gone), the key can never
    //     match anything step 4 checks again, so drop it now rather than
    //     letting dismissedOccurrences grow forever.
    {
      let dismissedChanged = false;
      Object.keys(dismissedOccurrences).forEach(key => {
        const sep = key.lastIndexOf('|');
        const sourceId = key.slice(0, sep);
        const dueAt = key.slice(sep + 1);
        const node = nodeById.get(sourceId);
        if (!node || node.dueAt !== dueAt) { delete dismissedOccurrences[key]; dismissedChanged = true; }
      });
      if (dismissedChanged) saveDismissed();
    }

    // 3. Carry overdue entries into the Backlog instead of dumping them
    //    onto today. Unlike the old auto-roll-to-today behavior, this
    //    leaves them unscheduled so the user can manually sort them (or use
    //    Auto-arrange) rather than having today silently pile up. Dedupe by
    //    sourceId against what's already in the backlog so a repeated sync
    //    pass doesn't create duplicate chips for the same source task.
    const todayStr = todayLocalStr();
    let carriedCount = 0;
    let backlogChanged = false;
    const backlogSourceIds = new Set(backlogData.filter(t => t.sourceId).map(t => t.sourceId));
    Object.keys(weeklyData).forEach(ds => {
      if (ds >= todayStr) return;
      const stale = weeklyData[ds];
      if (!stale || !stale.length) { delete weeklyData[ds]; return; }
      stale.forEach(t => {
        if (t.sourceId && backlogSourceIds.has(t.sourceId)) return; // already backlogged
        backlogData.push(t);
        if (t.sourceId) backlogSourceIds.add(t.sourceId);
        carriedCount++;
      });
      delete weeklyData[ds];
      changed = true;
      backlogChanged = true;
    });
    if (backlogChanged) saveBacklog();

    // 4. Add missing due-date entries. A source already sitting in the
    //    Backlog (moved there by step 3 above, or manually dragged there)
    //    still counts as "has an entry" — otherwise this pass doesn't see
    //    it (it only scans weeklyData) and re-adds a fresh duplicate right
    //    back onto the day it was just carried off of.
    const existingSourceIds = new Set();
    Object.values(weeklyData).forEach(arr => arr.forEach(t => { if (t.sourceId) existingSourceIds.add(t.sourceId); }));
    backlogData.forEach(t => { if (t.sourceId) existingSourceIds.add(t.sourceId); });
    dueNodes.forEach(({ dueAt, title, sourceId, sourceType, projectTitle }) => {
      if (existingSourceIds.has(sourceId)) return;
      // Skip occurrences the user explicitly dismissed via '×' — as long as
      // the task's dueAt hasn't moved since (a dueAt change is a new
      // occurrence, and dismissedOccurrences won't contain a key for it, so
      // it's re-added normally; the stale key for the old dueAt was already
      // swept up in step 2b above).
      if (dismissedOccurrences[dismissalKey(sourceId, dueAt)]) return;
      addToWeekDay(dueAt, title, sourceId, sourceType, projectTitle); existingSourceIds.add(sourceId); changed = true;
    });

    if (changed) {
      saveWeekly();
      if (weeklyPanel && weeklyPanel.style.display !== 'none') renderWeeklyPanel();
      if (carriedCount) showToast('📥 Moved ' + carriedCount + ' overdue planner task' + (carriedCount > 1 ? 's' : '') + ' to Backlog');
    }
  }
  function addToWeekDay(dayStr, title, sourceId, sourceType, projectTitle) {
    if (!weeklyData[dayStr]) weeklyData[dayStr] = [];
    if (sourceId && weeklyData[dayStr].some(t => t.sourceId === sourceId)) return;
    weeklyData[dayStr].push({ id: uid(), title, sourceId: sourceId || null, sourceType: sourceType || null, done: false, projectTitle: projectTitle || null });
    saveWeekly();
  }
  function jumpToTask(projectId, taskTitle) {
    const p = projects.find(pr => pr.id === projectId);
    if (!p) { showToast('Source task no longer exists', true); return; }
    closeAllModals();
    _weeklyReturnOnEsc = true;
    if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Weekly Planner');
    if (!listViewActive) { document.getElementById('pf-collapse-cats').click(); }
    splitSelectedId = projectId; splitMultiSelect = [];
    searchTerm = taskTitle;
    _searchAutoCollapseId = null;
    renderSplitList(); renderSplitDetail();
    root.classList.add('pf-detail-open'); _markOverlayOpen('detail');
    if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
    searchTerm = '';
    const active = splitList.querySelector('.pf-split-active'); if (active) active.scrollIntoView({ block: 'nearest' });
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
    const todayStr = todayLocalStr();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const ds = weekDateStr(d);
      const isToday = ds === todayStr;
      const col = document.createElement('div');
      col.className = 'pf-week-col' + (isToday ? ' pf-week-col-today' : '');
      col.dataset.day = ds;
      const header = document.createElement('div');
      header.className = 'pf-week-col-header';
      const tasksForBadge = weeklyData[ds] || [];
      const badgeHtml = tasksForBadge.length ? '<span class="pf-week-day-badge">' + tasksForBadge.length + '</span>' : '';
      const clearDayHtml = tasksForBadge.length ? '<span class="pf-week-day-clear" data-day="' + ds + '" title="Clear this day">🗑</span>' : '';
      header.innerHTML = clearDayHtml + badgeHtml + '<div class="pf-week-col-daynum">' + d.getDate() + '</div>' + DAYS[i];
      col.appendChild(header);
      const dayClearBtn = header.querySelector('.pf-week-day-clear');
      if (dayClearBtn) {
        dayClearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const n = (weeklyData[ds] || []).length;
          if (!n) return;
          if (!confirm('Remove all ' + n + ' task' + (n > 1 ? 's' : '') + ' from ' + DAYS[i] + '?')) return;
          weeklySnapshot();
          delete weeklyData[ds];
          saveWeekly(); renderWeeklyPanel();
          showToast('Cleared ' + DAYS[i], false, false, weeklyUndo, 'Undo');
        });
      }
      const tasks = weeklyData[ds] || [];
      if (!tasks.length) {
        const empty = document.createElement('div');
        empty.className = 'pf-week-empty';
        empty.textContent = 'Nothing scheduled';
        col.appendChild(empty);
      }
      tasks.forEach((t, idx) => {
        const srcProject = t.sourceId ? projects.find(pr => pr.id === t.sourceId || (pr.subtasks && (function findIn(subs) { return subs.some(s => s.id === t.sourceId || (s.subtasks && findIn(s.subtasks))); })(pr.subtasks))) : null;
        const accentColor = srcProject && srcProject.color ? srcProject.color : null;
        const row = document.createElement('div');
        row.draggable = true;
        row.dataset.taskId = t.id;
        row.dataset.day = ds;
        row.title = t.title + (t.projectTitle ? ' — ' + t.projectTitle : '') + (t.sourceId ? ' (click to open)' : '') + ' • Drag to Backlog to remove, or check it off';
        row.className = 'pf-week-task' + (accentColor ? ' pf-week-task-accent' : '') + (t.done ? ' pf-week-task-done' : '');
        if (accentColor) row.style.setProperty('--pf-task-accent', accentColor);
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = t.done;
        check.className = 'pf-week-task-check';
        check.addEventListener('change', () => {
          t.done = check.checked;
          if (t.done) {
            weeklyData[ds] = (weeklyData[ds] || []).filter(x => x.id !== t.id);
            saveWeekly(); renderWeeklyPanel();
            showToast('"' + t.title + '" completed and removed from planner');
            return;
          }
          saveWeekly(); renderWeeklyPanel();
        });
        const titleWrap = document.createElement('div');
        titleWrap.className = 'pf-week-task-title-wrap' + (t.sourceId ? ' pf-clickable' : '');
        const titleSpan = document.createElement('span');
        titleSpan.className = 'pf-week-task-title';
        titleSpan.textContent = t.title;
        titleWrap.appendChild(titleSpan);
        if (t.projectTitle) {
          const projSpan = document.createElement('div');
          projSpan.className = 'pf-week-task-project';
          projSpan.textContent = t.projectTitle;
          titleWrap.appendChild(projSpan);
        }
        if (t.sourceId) {
          titleWrap.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = srcProject ? srcProject.id : t.sourceId;
            jumpToTask(projectId, t.title);
          });
        }
        row.appendChild(check);
        row.appendChild(titleWrap);
        row.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/weekly-task', JSON.stringify({ id: t.id, fromDay: ds })); row.style.opacity = '0.4'; });
        row.addEventListener('dragend', () => { row.style.opacity = ''; row.style.borderTop = ''; row.style.borderBottom = ''; });
        // Per-row dragover/drop lets a task be reordered within the same
        // day (dropped above/below a sibling), not just moved between days.
        // stopPropagation keeps the column's own drop handler (which just
        // appends to the end) from also firing for these in-list drops.
        row.addEventListener('dragover', (e) => {
          e.preventDefault(); e.stopPropagation();
          if (ds < todayStr) { e.dataTransfer.dropEffect = 'none'; row.style.borderTop = ''; row.style.borderBottom = ''; col.classList.add('pf-week-col-dragover-blocked'); return; }
          e.dataTransfer.dropEffect = 'move';
          col.querySelectorAll('.pf-week-task').forEach(r => { if (r !== row) { r.style.borderTop = ''; r.style.borderBottom = ''; } });
          const rect = row.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          row.style.borderTop = before ? '2px solid var(--accent)' : '';
          row.style.borderBottom = before ? '' : '2px solid var(--accent)';
        });
        row.addEventListener('dragleave', () => { row.style.borderTop = ''; row.style.borderBottom = ''; col.classList.remove('pf-week-col-dragover-blocked'); });
        row.addEventListener('drop', (e) => {
          e.preventDefault(); e.stopPropagation();
          col.classList.remove('pf-week-col-dragover');
          col.classList.remove('pf-week-col-dragover-blocked');
          const before = row.style.borderTop !== '';
          row.style.borderTop = ''; row.style.borderBottom = '';
          if (ds < todayStr) { showToast("Can't move tasks to a finished week — they'd just roll forward to today", true); return; }
          const backlogRaw = e.dataTransfer.getData('application/backlog-task');
          if (backlogRaw) { const { id } = JSON.parse(backlogRaw); moveBacklogTaskToDay(id, ds); renderWeeklyPanel(); return; }
          const raw = e.dataTransfer.getData('application/weekly-task');
          if (!raw) return;
          const { id, fromDay } = JSON.parse(raw);
          if (id === t.id) return;
          moveWeeklyTask(id, fromDay, ds, t.id, before);
        });
        col.appendChild(row);
        weeklyTouchDragSupport(row, t, ds);
      });
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add task';
      addBtn.className = 'pf-week-add-btn';
      addBtn.addEventListener('click', () => {
        const title = prompt('Task name:');
        if (!title || !title.trim()) return;
        if (!weeklyData[ds]) weeklyData[ds] = [];
        weeklyData[ds].push({ id: uid(), title: title.trim(), sourceId: null, sourceType: null, done: false });
        saveWeekly(); renderWeeklyPanel();
      });
      col.appendChild(addBtn);
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (ds < todayStr) { e.dataTransfer.dropEffect = 'none'; col.classList.add('pf-week-col-dragover-blocked'); return; }
        col.classList.add('pf-week-col-dragover');
      });
      col.addEventListener('dragleave', () => { col.classList.remove('pf-week-col-dragover'); col.classList.remove('pf-week-col-dragover-blocked'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('pf-week-col-dragover');
        col.classList.remove('pf-week-col-dragover-blocked');
        if (ds < todayStr) {
          if (e.dataTransfer.getData('application/weekly-task') || e.dataTransfer.getData('application/backlog-task') || e.dataTransfer.getData('text/plain')) showToast("Can't move tasks to a finished week — they'd just roll forward to today", true);
          return;
        }
        const backlogRaw = e.dataTransfer.getData('application/backlog-task');
        if (backlogRaw) {
          const { id } = JSON.parse(backlogRaw);
          moveBacklogTaskToDay(id, ds);
          renderWeeklyPanel();
          return;
        }
        const raw = e.dataTransfer.getData('application/weekly-task');
        if (raw) {
          const { id, fromDay } = JSON.parse(raw);
          // Dropped on the column background (not on a specific row) —
          // send it to the end of this day's list, whether that's this
          // same day (a reorder-to-last) or a different one (a move).
          // Skip when the task is already the last item in this same day —
          // that's a true no-op and would otherwise trigger a pointless
          // saveWeekly()+renderWeeklyPanel() flicker mid-drag.
          const dayList = weeklyData[ds] || [];
          const isAlreadyLastInSameDay = fromDay === ds && dayList.length && dayList[dayList.length - 1].id === id;
          if (!isAlreadyLastInSameDay) moveWeeklyTask(id, fromDay, ds, null, false);
          return;
        }
        const projectId = e.dataTransfer.getData('text/plain');
        if (projectId) {
          const p = projects.find(pr => pr.id === projectId);
          if (p) { addToWeekDay(ds, p.title, p.id, 'project', null); renderWeeklyPanel(); }
        }
      });
      grid.appendChild(col);
    }
    renderBacklogSection(start);
  }
  // Renders the Backlog strip beneath the day grid. weekStart is the Monday
  // of the currently-viewed week (from renderWeeklyPanel), used by
  // Auto-arrange to know which days it's allowed to spread into.
  function renderBacklogSection(weekStart) {
    const list = document.getElementById('pf-week-backlog-list');
    const countEl = document.getElementById('pf-week-backlog-count');
    const arrangeBtn = document.getElementById('pf-backlog-arrange-btn');
    if (!list) return;
    list.innerHTML = '';
    countEl.textContent = backlogData.length ? '(' + backlogData.length + ')' : '';
    arrangeBtn.disabled = !backlogData.length;
    if (!backlogData.length) {
      const empty = document.createElement('div');
      empty.className = 'pf-week-backlog-empty';
      empty.textContent = 'Nothing in backlog — overdue planner tasks land here to be sorted manually.';
      list.appendChild(empty);
    }
    backlogData.forEach(t => {
      const srcProject = t.sourceId ? projects.find(pr => pr.id === t.sourceId || (pr.subtasks && (function findIn(subs) { return subs.some(s => s.id === t.sourceId || (s.subtasks && findIn(s.subtasks))); })(pr.subtasks))) : null;
      const accentColor = srcProject && srcProject.color ? srcProject.color : null;
      const chip = document.createElement('div');
      chip.draggable = true;
      chip.dataset.taskId = t.id;
      chip.className = 'pf-week-backlog-chip' + (accentColor ? ' pf-week-backlog-chip-accent' : '');
      if (accentColor) chip.style.setProperty('--pf-task-accent', accentColor);
      chip.title = t.title + (t.projectTitle ? ' — ' + t.projectTitle : '') + (t.sourceId ? ' (click to open)' : '');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'pf-week-backlog-chip-check';
      check.addEventListener('change', () => {
        backlogData = backlogData.filter(x => x.id !== t.id);
        saveBacklog(); renderBacklogSection(weekStart);
        showToast('"' + t.title + '" completed and removed from backlog');
      });
      const titleWrap = document.createElement('div');
      titleWrap.className = 'pf-week-backlog-chip-title-wrap' + (t.sourceId ? ' pf-clickable' : '');
      const titleSpan = document.createElement('div');
      titleSpan.className = 'pf-week-backlog-chip-title';
      titleSpan.textContent = t.title;
      titleWrap.appendChild(titleSpan);
      if (t.projectTitle) {
        const projSpan = document.createElement('div');
        projSpan.className = 'pf-week-backlog-chip-project';
        projSpan.textContent = t.projectTitle;
        titleWrap.appendChild(projSpan);
      }
      if (t.sourceId) {
        titleWrap.addEventListener('click', (e) => {
          e.stopPropagation();
          const projectId = srcProject ? srcProject.id : t.sourceId;
          jumpToTask(projectId, t.title);
        });
      }
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.className = 'pf-week-backlog-chip-del';
      delBtn.addEventListener('click', () => {
        weeklySnapshot();
        backlogData = backlogData.filter(x => x.id !== t.id);
        // Same dismissal suppression as the day-column delete button — key
        // it off the source task's *current* dueAt (not the day it was
        // carried from), since that's the value step 4 of syncWeeklyWithTasks
        // actually re-checks against on the next pass.
        if (t.sourceId) {
          const node = srcProject ? (srcProject.id === t.sourceId ? srcProject : findSubNode(srcProject.subtasks, t.sourceId)) : null;
          if (node && node.dueAt) dismissOccurrence(t.sourceId, node.dueAt);
        }
        saveBacklog(); renderBacklogSection(weekStart);
        showToast('Removed "' + t.title + '" from backlog', false, false, weeklyUndo, 'Undo');
      });
      chip.appendChild(check);
      chip.appendChild(titleWrap);
      chip.appendChild(delBtn);
      chip.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/backlog-task', JSON.stringify({ id: t.id })); chip.style.opacity = '0.4'; });
      chip.addEventListener('dragend', () => { chip.style.opacity = ''; });
      list.appendChild(chip);
    });
  }
  // Moves a task already sitting on a day column into the Backlog, removing
  // it from weeklyData. Shared by the Backlog drop handler below.
  function moveWeeklyTaskToBacklog(taskId, fromDay) {
    const fromArr = weeklyData[fromDay] || [];
    const idx = fromArr.findIndex(x => x.id === taskId);
    if (idx < 0) return;
    const task = fromArr.splice(idx, 1)[0];
    if (!fromArr.length) delete weeklyData[fromDay];
    backlogData.push(task);
    saveWeekly(); saveBacklog();
    renderWeeklyPanel();
  }
  // Moves a backlog chip onto a specific day column (used by both the
  // native drag/drop below and Auto-arrange).
  function moveBacklogTaskToDay(taskId, toDay) {
    const idx = backlogData.findIndex(x => x.id === taskId);
    if (idx < 0) return;
    const task = backlogData.splice(idx, 1)[0];
    if (!weeklyData[toDay]) weeklyData[toDay] = [];
    weeklyData[toDay].push(task);
    if (task.sourceId) {
      const srcProject = projects.find(pr => pr.id === task.sourceId || (pr.subtasks && findSubNode(pr.subtasks, task.sourceId)));
      if (srcProject) {
        const node = srcProject.id === task.sourceId ? srcProject : findSubNode(srcProject.subtasks, task.sourceId);
        if (node) {
          if (_weeklyUndoDueAtReverts) _weeklyUndoDueAtReverts.push({ node, prevDueAt: node.dueAt });
          snapshot(); node.dueAt = toDay; scheduleSave(); render();
        }
      }
    }
    saveWeekly(); saveBacklog();
  }
  const backlogList = document.getElementById('pf-week-backlog-list');
  backlogList.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('application/weekly-task')) { e.dataTransfer.dropEffect = 'none'; return; }
    e.dataTransfer.dropEffect = 'move';
    backlogList.classList.add('pf-week-col-dragover');
  });
  backlogList.addEventListener('dragleave', () => { backlogList.classList.remove('pf-week-col-dragover'); });
  backlogList.addEventListener('drop', (e) => {
    e.preventDefault();
    backlogList.classList.remove('pf-week-col-dragover');
    const raw = e.dataTransfer.getData('application/weekly-task');
    if (!raw) return;
    const { id, fromDay } = JSON.parse(raw);
    moveWeeklyTaskToBacklog(id, fromDay);
  });
  // Auto-arrange: spreads every backlog task across the remaining days of
  // the currently-viewed week (today onward if this is the current week,
  // otherwise the whole week), placing each on whichever of those days
  // currently has the fewest planner tasks — a simple load-balance so
  // carried-forward tasks don't all pile onto one day.
  // Note: this operates purely on the live backlogData array and knows
  // nothing about dismissedOccurrences. Dismissal only suppresses re-adding
  // a task via sync step 4 (see loadDismissed/dismissOccurrence above); it
  // does not protect a task from being picked up here if it's back in
  // backlogData (e.g. the user dragged it in again). That's intentional,
  // not a gap — don't add a dismissal check here to "fix" it.
  document.getElementById('pf-backlog-arrange-btn').addEventListener('click', () => {
    if (!backlogData.length) return;
    const start = getWeekStart(weekOffset);
    const todayStr = todayLocalStr();
    const candidateDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const ds = weekDateStr(d);
      if (ds >= todayStr) candidateDays.push(ds);
    }
    if (!candidateDays.length) { showToast("Can't auto-arrange into a finished week — switch to the current or a future week", true); return; }
    weeklySnapshot();
    const toPlace = backlogData.slice();
    toPlace.forEach(t => {
      let best = candidateDays[0];
      let bestCount = (weeklyData[best] || []).length;
      candidateDays.forEach(ds => {
        const n = (weeklyData[ds] || []).length;
        if (n < bestCount) { best = ds; bestCount = n; }
      });
      moveBacklogTaskToDay(t.id, best);
    });
    renderWeeklyPanel();
    showToast('↻ Arranged ' + toPlace.length + ' backlog task' + (toPlace.length > 1 ? 's' : '') + ' across the week', false, false, weeklyUndo, 'Undo');
  });
  document.getElementById('pf-weekly-btn').addEventListener('click', () => { Promise.all([loadWeekly(), loadBacklog(), loadDismissed()]).then(() => { renderWeeklyPanel(); openModal(weeklyPanel, 'flex'); }); });
  document.getElementById('pf-week-prev').addEventListener('click', () => { weekOffset--; renderWeeklyPanel(); });
  document.getElementById('pf-week-next').addEventListener('click', () => { weekOffset++; renderWeeklyPanel(); });
  document.getElementById('pf-week-today').addEventListener('click', () => { weekOffset = 0; renderWeeklyPanel(); });

  const REMINDERS_KEY = 'project-flow-reminders';
  let reminders = [];
  async function loadReminders() { try { const res = await safeGet(REMINDERS_KEY, false); if (res && res.value) reminders = JSON.parse(res.value); } catch (e) { reminders = []; logError('Load reminders', e); } }
