    // SUBSECTION: Task Detail View (Split Detail)
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
    } catch (e) { logError('renderSplitDetail', e); splitDetail.innerHTML = '<div class="pf-empty" style="display:block;">Error rendering project. Check console for details.</div>'; }
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
      if (subMultiSelect.length) { clearSubSelect(); root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove()); return; }
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
  const THEME_PRESET_BTNS = ['midnight-cyan', 'amber-crt', 'phosphor-green', 'monochrome', 'daylight'];
  THEME_PRESET_BTNS.forEach(function(name) {
    const el = document.getElementById('pf-theme-' + name);
    if (el) el.addEventListener('click', function() { clearThemePreset(); applyThemePreset(name); });
  });
  document.getElementById('pf-theme-auto').addEventListener('click', function() {
    clearThemePreset();
    applyAutoTheme();
    showToast('Theme: Auto (follows system)');
  });
  function applyAutoTheme() {
    clearThemeVars();
    const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    applyThemePreset(isLight ? 'daylight' : 'midnight-cyan');
    localStorage.setItem('project-flow-theme-preset', 'auto'); // re-stamp after safeSet
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (localStorage.getItem('project-flow-theme-preset') === 'auto') applyAutoTheme();
  });

  const activityLog = [];
  const ACTIVITY_KEY = 'project-flow-activity';
