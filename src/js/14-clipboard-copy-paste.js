    // SUBSECTION: Clipboard (Copy/Paste)
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
    clearSubSelect(); splitMultiSelect = []; root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove());
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
    clearSubSelect(); splitMultiSelect = []; root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove());
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
