  // SUBSECTION: Subtask Tree Helpers
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
  function cycleSubStatus(projectId, subId, targetStatus) { snapshot(); const p = projects.find(p => p.id === projectId); const s = findSubNode(p.subtasks, subId); if (s.status !== 'completed' && (targetStatus || 'completed') === 'completed' && getUnresolvedBlockers(p, s).length > 0) { showToast('🚫 Blocked: complete dependencies first', true); return; } const oldStatus = s.status; s.status = targetStatus || STATUSES[(STATUSES.indexOf(s.status) + 1) % STATUSES.length]; if (s.status === oldStatus) return; if (navigator.vibrate) navigator.vibrate(10); s.completedAt = s.status === 'completed' ? new Date().toISOString() : null; logActivity('"' + s.title + '" in "' + p.title + '": ' + STATUS_LABEL[oldStatus] + ' → ' + STATUS_LABEL[s.status]); scheduleSave(); render(); _flashStatusTransition('[data-sub-id="' + subId + '"]'); animateProgressRing(projectId, s.status === 'completed'); if (s.status === 'completed') { onTaskCompleted(false); setTimeout(() => { if (handleRecurrence(s)) { scheduleSave(); render(); showToast('🔁 "' + s.title + '" reset for next cycle'); } }, 1200); } if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); }
  function deleteSubtask(projectId, subId, skipConfirm) {
    const p = projects.find(p => p.id === projectId);
    const s = findSubNode(p.subtasks, subId);
    if (!skipConfirm && !confirm('Delete subtask "' + (s ? s.title : '') + '"?')) return;
    snapshot();
    const arr = findSubParentArray(p.subtasks, subId);
    // Recycle bin: record where it lived so restore can put it back.
    const indexPath = (function trace(list, path) { for (let i = 0; i < list.length; i++) { const item = list[i]; if (item.id === subId) return { path: path, index: i }; if (item.subtasks && item.subtasks.length) { const hit = trace(item.subtasks, path.concat(item.id)); if (hit) return hit; } } return null; })(p.subtasks, []);
    const parentIds = indexPath ? indexPath.path : [];
    if (typeof trashSubtask === 'function' && s) trashSubtask(p, s, arr, indexPath ? indexPath.index : 0, parentIds);
    if (arr) { const idx = arr.findIndex(s => s.id === subId); if (idx > -1) arr.splice(idx, 1); }
    (function cleanBlockedBy(list) { list.forEach(t => { if (t.blockedBy) t.blockedBy = t.blockedBy.filter(bid => bid !== subId); if (t.subtasks && t.subtasks.length) cleanBlockedBy(t.subtasks); }); })(p.subtasks);
    if (p._manualStatus) { delete p._manualStatus; }
    checkAllCompleted(p); scheduleSave(); render();
    if (!skipConfirm) showToast('Moved to recycle bin');
  }
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
        row.className = 'pf-due-row'; // 3B-3: recipe in 14-utilities.css (was cssText)
        row.innerHTML = '<span class="pf-status-dot" style="background:var(--' + pr.status + ')"></span>' +
          '<span class="pf-ellip-flex" style="font-size: calc(var(--font-size-base) - 2px);">' + escapeHtml(pr.title) + '</span>' +
          '<span class="pf-metric pf-hint pf-shrink-0">' + countLabel + '</span>';
        row.addEventListener('mouseenter', () => { row.style.borderColor = 'var(--hover-border)'; });
        row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--card-border)'; });
        row.addEventListener('click', () => { closeAllModals(); copySubtasksToProject(sourceProject, subtaskIds, pr.id); clearSubSelect(); root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove()); });
        list.appendChild(row);
      });
    }
    openModal(copyModal, 'flex');
  }

  function focusEl(selector) { requestAnimationFrame(() => { let el = canvas.querySelector(selector) || root.querySelector(selector); if (el) { el.contentEditable = 'true'; el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } }); }
  function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function highlightMatch(escaped, term) { if (!term) return escaped; const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'); return escaped.replace(re, '<mark style="background:var(--accent);color:var(--accent-contrast,#fff);border-radius:2px;padding:0 2px;">$1</mark>'); }
  function formatTime(sec) { const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60); if (d > 0) return d + 'd ' + h + 'h ' + m + 'm'; if (h > 0) return h + 'h ' + m + 'm'; return m + 'm'; }
  function toggleTimer(p, s) { _lastProjectId = p.id; snapshot(); if (s.timerStart) { s.timeLogged = (s.timeLogged || 0) + Math.floor((Date.now() - s.timerStart) / 1000); s.timerStart = null; } else { s.timerStart = Date.now(); } scheduleSave(); render(); }

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
      const icon = pfIcon('refresh', 'pf-recur-ic');
      btn.innerHTML = cur && cur.value ? icon + cur.label.replace('🔁 ', '') : icon;
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
    if (isNaN(d)) return todayLocalStr();
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
    return localDateStr(d);
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

