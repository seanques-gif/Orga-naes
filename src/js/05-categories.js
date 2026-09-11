  // SUBSECTION: Categories
  function categoryColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
  }
  function saveCategories() { safeSet(CATEGORIES_KEY, JSON.stringify(categories), false); }
  async function loadCategories() {
    try { const res = await safeGet(CATEGORIES_KEY, false); categories = res && res.value ? JSON.parse(res.value) : []; }
    catch (e) { categories = []; logError('Load categories', e); }
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
      '<button class="pf-category-move" data-cat-up="' + i + '" title="Move up" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size: calc(var(--font-size-base) - 3px);padding:0 2px;"' + (i === 0 ? ' disabled style="opacity:0.3;background:transparent;border:none;font-size: calc(var(--font-size-base) - 3px);padding:0 2px;"' : '') + '>▲</button>' +
      '<button class="pf-category-move" data-cat-down="' + i + '" title="Move down" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size: calc(var(--font-size-base) - 3px);padding:0 2px;"' + (i === categories.length - 1 ? ' disabled style="opacity:0.3;background:transparent;border:none;font-size: calc(var(--font-size-base) - 3px);padding:0 2px;"' : '') + '>▼</button>' +
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
      logError('Load projects (main store corrupt, falling back to legacy)', e);
      try { const legacy = await safeGet('project-flow-graph', false); if (legacy && legacy.value) { const flat = JSON.parse(legacy.value); const tops = flat.filter(n => !n.parentId); projects = tops.map(t => ({ id: t.id, title: t.title, status: t.status, x: t.x, y: t.y, expanded: false, subtasks: flat.filter(c => c.parentId === t.id).map(c => ({ id: c.id, title: c.title, status: c.status })) })); } } catch (e2) { projects = []; logError('Load projects (legacy fallback also failed — data may be lost)', e2); }
    }
    if (!projects.length) { await recoverFromIDB(); }
    const result = validateAndRepair(projects);
    projects = result.projects;
    if (result.repaired > 0) { scheduleSave(); showToast('🔧 Auto-repaired ' + result.repaired + ' data issue' + (result.repaired > 1 ? 's' : '')); }
    projects.forEach(p => { p.expanded = false; }); render();
    startIdbSnapshotBackup();
    loadToday();
  }

  // Persists current projects locally, then triggers optional debounced cloud sync via fsAutoSaveHook.
  function scheduleSave() { autoUpdateStatuses(); invalidateSearchCache(); if (!hasStorage()) { saveEl.textContent = '⚠ No storage'; saveEl.className = 'pf-save pf-save-fail'; return; } syncWeeklyWithTasks(); saveEl.textContent = 'Saving…'; saveEl.className = 'pf-save'; clearTimeout(saveTimer); saveTimer = setTimeout(async () => { const res = await safeSet(STORE_KEY, JSON.stringify(projects), false); if (res) { localStorage.setItem('pf-last-save-time', Date.now().toString()); saveEl.textContent = '✓ Saved'; saveEl.className = 'pf-save pf-save-ok'; setTimeout(() => { if (saveEl.textContent === '✓ Saved') { saveEl.textContent = ''; saveEl.className = 'pf-save'; } }, 1500); if (typeof fsAutoSaveHook === 'function') fsAutoSaveHook(); } else { saveEl.textContent = '✗ Save failed'; saveEl.className = 'pf-save pf-save-fail'; } }, 350); }
