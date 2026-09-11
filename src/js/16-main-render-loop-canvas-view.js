    // SUBSECTION: Main Render Loop (Canvas View)
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
      root.classList.add('pf-detail-open'); _markOverlayOpen('detail');
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
  // Rebuilds the project list in split view; call after changes that affect list ordering/filtering.
