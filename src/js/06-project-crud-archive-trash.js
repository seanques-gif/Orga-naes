  // SUBSECTION: Project CRUD, Archive & Trash
  function addProject(category) { snapshot(); const p = { id: uid(), title: 'New project', status: 'planned', x: 0, y: 0, expanded: true, createdAt: new Date().toISOString(), dueAt: null, completedAt: null, category: category || null, subtasks: [] }; projects.push(p); logActivity('Created project "New project"' + (category ? ' in ' + category : '')); scheduleSave(); autoArrangeProjects(true); if (listViewActive) { splitSelectedId = p.id; renderSplitList(); renderSplitDetail(); } focusEl('[data-title-id="' + p.id + '"]'); }
  const ARCHIVE_KEY = 'project-flow-archive';
  let archive = [];
  async function loadArchive() { try { const res = await safeGet(ARCHIVE_KEY, false); if (res && res.value) archive = JSON.parse(res.value); } catch (e) { archive = []; logError('Load archive', e); } }
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
        '<span style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);flex-shrink:0;">' + date + '</span>' +
        '<button class="pf-undo-btn" data-archive-restore="' + a.id + '" style="font-size: calc(var(--font-size-base) - 4px);padding:2px 8px;">Restore</button>' +
        '<button class="pf-undo-btn" data-archive-del="' + a.id + '" style="font-size: calc(var(--font-size-base) - 4px);padding:2px 8px;color:var(--danger);">Delete</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-archive-restore]').forEach(btn => { btn.addEventListener('click', () => restoreFromArchive(btn.dataset.archiveRestore)); });
    list.querySelectorAll('[data-archive-del]').forEach(btn => { btn.addEventListener('click', () => { if (!confirm('Permanently delete this item from archive?')) return; archive = archive.filter(a => a.id !== btn.dataset.archiveDel); saveArchive(); renderArchiveList(); }); });
  }

  const TRASH_KEY = 'project-flow-trash';
  let trash = [];
  async function loadTrash() { try { const res = await safeGet(TRASH_KEY, false); if (res && res.value) trash = JSON.parse(res.value); } catch (e) { trash = []; logError('Load trash', e); } purgeOldTrash(); }
  function saveTrash() { safeSet(TRASH_KEY, JSON.stringify(trash), false); }
  function purgeOldTrash() { const cutoff = Date.now() - TRASH_TTL_MS; const before = trash.length; trash = trash.filter(t => new Date(t.deletedAt).getTime() > cutoff); const purged = before - trash.length; if (purged > 0) { saveTrash(); showToast('🗑 ' + purged + ' item' + (purged > 1 ? 's' : '') + ' auto-removed from trash (older than 30 days)'); } }
  function trashProject(p) { trash.push({ ...JSON.parse(JSON.stringify(p)), kind: 'project', deletedAt: new Date().toISOString() }); saveTrash(); }
  // Unified recycle bin: projects, subtasks, and notes all land here with a
  // kind tag. Legacy entries (pre-bin projects) have no kind — treat as 'project'.
  function trashSubtask(project, node, parentArray, index, parentPath) {
    if (!project || !node) return;
    trash.push({ kind: 'subtask', id: node.id, title: node.title, node: JSON.parse(JSON.stringify(node)), projectId: project.id, projectTitle: project.title, parentPath: (parentPath || []).slice(), index: index, deletedAt: new Date().toISOString() });
    saveTrash();
  }
  function trashNote(note) {
    if (!note) return;
    trash.push({ kind: 'note', id: note.id, title: note.title, node: JSON.parse(JSON.stringify(note)), deletedAt: new Date().toISOString() });
    saveTrash();
  }
  function restoreFromTrash(id) {
    const idx = trash.findIndex(t => t.id === id);
    if (idx < 0) return;
    const item = trash.splice(idx, 1)[0];
    const kind = item.kind || 'project';
    if (kind === 'note') {
      // Notes restore through the notes module (it owns tombstone clearing + rendering).
      const note = item.node || { id: item.id, title: item.title, body: '', pinned: false };
      if (window._pf && typeof window._pf.adoptRestoredNote === 'function') {
        window._pf.adoptRestoredNote(note);
        showToast('"' + (note.title || 'Untitled') + '" restored');
      } else { trash.push(item); saveTrash(); showToast('⚠ Notes not ready — try again', true); return; }
    } else if (kind === 'subtask') {
      const restored = restoreSubtaskFromBin(item);
      if (!restored) { trash.push(item); saveTrash(); showToast('⚠ Its project no longer exists — restore the project first', true); return; }
      showToast('"' + (item.title || 'Subtask') + '" restored');
    } else {
      delete item.deletedAt; delete item.kind;
      projects.push(item);
      scheduleSave(); render();
      showToast('"' + item.title + '" restored');
    }
    saveTrash();
    renderTrashList();
  }
  // Re-attach a binned subtask: walk the stored parent path inside its project;
  // if the parent chain is gone, fall back to the project's root level.
  function restoreSubtaskFromBin(item) {
    const p = projects.find(x => x.id === item.projectId);
    if (!p) return false;
    if (!Array.isArray(p.subtasks)) p.subtasks = [];
    const node = item.node || { id: item.id, title: item.title, status: 'planned', subtasks: [] };
    let arr = p.subtasks;
    let valid = true;
    (item.parentPath || []).forEach(pid => {
      if (!valid) return;
      const parent = arr.find(s => s && s.id === pid);
      if (parent) { if (!Array.isArray(parent.subtasks)) parent.subtasks = []; arr = parent.subtasks; }
      else valid = false;
    });
    const at = Math.max(0, Math.min(item.index || 0, arr.length));
    arr.splice(at, 0, node);
    scheduleSave(); render();
    return true;
  }
  function permanentDeleteFromTrash(id) { trash = trash.filter(t => t.id !== id); saveTrash(); renderTrashList(); }
  let _trashedItems = null; let _trashUndoTimer = null;
  function emptyTrash() {
    if (!confirm('Permanently delete all ' + trash.length + ' item(s) in trash?')) return;
    _trashedItems = [...trash]; trash = []; saveTrash(); renderTrashList();
    if (_trashUndoTimer) clearTimeout(_trashUndoTimer);
    _trashUndoTimer = setTimeout(() => { _trashedItems = null; }, 8000);
    showToast('🗑 Trash emptied', false, false, () => {
      if (!_trashedItems) return;
      clearTimeout(_trashUndoTimer);
      trash = _trashedItems; _trashedItems = null; saveTrash(); renderTrashList();
      showToast('✓ Trash restored');
    }, 'Undo');
  }
  // Test/automation seam: the fake DOM can't click bin rows, so restore is
  // driven through the same function the Restore button calls.
  window._pf.restoreFromTrash = restoreFromTrash;
  function renderTrashList() {
    const list = document.getElementById('pf-trash-list');
    document.getElementById('pf-trash-count').textContent = trash.length ? '(' + trash.length + ')' : '';
    if (!trash.length) { list.innerHTML = '<div class="pf-activity-empty">Recycle bin is empty.</div>'; return; }
    const KIND_LABEL = { project: 'Project', subtask: 'Task', note: 'Note' };
    list.innerHTML = trash.map(t => {
      const days = Math.floor((Date.now() - new Date(t.deletedAt).getTime()) / (24*60*60*1000));
      const remaining = 30 - days;
      const kind = KIND_LABEL[t.kind || 'project'] || 'Project';
      const blankNote = t.kind === 'note' && !(t.title || '').trim();
      const displayTitle = blankNote ? 'Untitled' : escapeHtml(t.title || 'Untitled');
      const subtitle = t.kind === 'subtask' && t.projectTitle ? ' in ' + escapeHtml(t.projectTitle) : '';
      return '<div class="pf-activity-item" style="display:flex;align-items:center;gap:8px;">' +
        '<span class="pf-bin-kind" data-bin-kind="' + (t.kind || 'project') + '">' + kind + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + displayTitle + subtitle + '</span>' +
        '<span style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);flex-shrink:0;">' + remaining + 'd left</span>' +
        '<button class="pf-undo-btn" style="font-size: calc(var(--font-size-base) - 4px);padding:2px 6px;" data-trash-restore="' + t.id + '">Restore</button>' +
        '<button class="pf-undo-btn" style="font-size: calc(var(--font-size-base) - 4px);padding:2px 6px;color:var(--danger);" data-trash-del="' + t.id + '">×</button>' +
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
  function _statusMenuEscHandler(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeStatusMenu(); } }
  function closeStatusMenu() { if (_statusMenuEl) { _statusMenuEl.remove(); _statusMenuEl = null; document.removeEventListener('click', closeStatusMenu, true); document.removeEventListener('scroll', closeStatusMenu, true); window.removeEventListener('resize', closeStatusMenu); document.removeEventListener('keydown', _statusMenuEscHandler, true); } }
  let _statusMenuToken = 0;
  function openStatusMenu(anchorEl, currentStatus, onPick) {
    closeStatusMenu();
    const myToken = ++_statusMenuToken;
    const rect = anchorEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'pf-status-menu'; // 3B-3: recipe lives in 14-utilities.css
    STATUSES.forEach(function(st) {
      const item = document.createElement('div');
      item.textContent = STATUS_LABEL[st];
      const isCurrent = st === currentStatus;
      item.className = 'pf-status-menu-item' + (isCurrent ? ' pf-current' : '');
      const dot = document.createElement('span');
      dot.className = 'pf-status-dot'; // shape in CSS; color is dynamic
      dot.style.background = statusDotColor(st);
      dot.style.border = '1.5px solid ' + statusDotColor(st);
      item.prepend(dot);
      item.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); const stillCurrent = myToken === _statusMenuToken; closeStatusMenu(); if (!isCurrent && stillCurrent) onPick(st); });
      // hover styling now handled by .pf-status-menu-item:hover in CSS (3B-3)
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
      document.addEventListener('keydown', _statusMenuEscHandler, true);
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
          } else if (!childrenDone && s.status === 'completed') {
            s.status = 'ongoing'; s.completedAt = null;
            logActivity('"' + s.title + '" reverted to ongoing (no longer all subtasks complete)');
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
    // Reduced motion: celebration particles are decoration — skip entirely.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:var(--z-drag);pointer-events:none;';
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

