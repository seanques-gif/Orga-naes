    // SUBSECTION: Split/List View
  function renderSplitList() {
    splitList.innerHTML = '';
    const sortBar = document.createElement('div');
    sortBar.className = 'pf-split-sort';
    sortBar.innerHTML = '<button id="pf-split-collapse-all" class="pf-split-collapse-btn" title="Collapse/Expand all categories">▾ All</button>' +
      '<button id="pf-split-hide-completed" class="pf-split-collapse-btn' + (showCompletedProjects ? ' pf-split-toggle-active' : '') + '" title="Show completed projects">' + pfIcon(showCompletedProjects ? 'check-square' : 'square') + ' Completed</button>' +
      '<span class="pf-split-sort-label">Sort:</span><select id="pf-split-sort-sel"><option value="manual">Manual</option><option value="name">Name</option><option value="status">Status</option><option value="due-cat">Due Date</option><option value="created">Newest</option></select>';
    splitList.appendChild(sortBar);
    sortBar.querySelector('select').value = splitSortMode;
    sortBar.querySelector('select').addEventListener('change', (e) => { splitSortMode = e.target.value; safeSet('project-flow-sort-mode', splitSortMode, false); renderSplitList(); });
    sortBar.querySelector('#pf-split-hide-completed').addEventListener('click', () => { showCompletedProjects = !showCompletedProjects; safeSet('project-flow-hide-completed', String(showCompletedProjects), false); renderSplitList(); });
    const collapseBtn = sortBar.querySelector('#pf-split-collapse-all');
    const allCollapsed = categories.length > 0 && categories.every(c => splitCollapsedCats[c]);
    collapseBtn.textContent = allCollapsed ? '▸ All' : '▾ All';
    collapseBtn.addEventListener('click', () => {
      if (allCollapsed) { categories.forEach(c => { splitCollapsedCats[c] = false; }); }
      else { categories.forEach(c => { splitCollapsedCats[c] = true; }); }
      renderSplitList();
    });
    if (splitMultiSelect.length >= 1) {
      const bar = document.createElement('div');
      bar.className = 'pf-split-delete-bar';
      bar.innerHTML = '<span>' + splitMultiSelect.length + ' selected</span><button data-action="cycle">Set status</button><button data-action="archive">' + pfIcon('archive') + ' Archive</button><button data-action="delete">Delete selected</button><button data-action="clear">✕ Clear</button>';
      bar.querySelector('[data-action="cycle"]').addEventListener('click', (e) => { openStatusMenu(e.currentTarget, null, (st) => _splitCycleSelected(st)); });
      bar.querySelector('[data-action="archive"]').addEventListener('click', () => {
        snapshot();
        const count = splitMultiSelect.length;
        splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) { archiveProject(pr); logActivity('Archived project "' + pr.title + '"'); } });
        projects = projects.filter(pr => !splitMultiSelect.includes(pr.id));
        splitMultiSelect = []; splitSelectedId = null;
        scheduleSave(); renderSplitList(); renderSplitDetail();
        showToast('📦 Archived ' + count + ' project' + (count === 1 ? '' : 's'));
      });
      bar.querySelector('[data-action="delete"]').addEventListener('click', () => { _splitDeleteSelected(); });
      bar.querySelector('[data-action="clear"]').addEventListener('click', () => { splitMultiSelect = []; splitSelectedId = null; renderSplitList(); renderSplitDetail(); });
      splitList.appendChild(bar);
    }
    if (_splitCatMultiSelect.length >= 1) {
      const bar = document.createElement('div');
      bar.className = 'pf-split-delete-bar';
      bar.innerHTML = '<span>' + _splitCatMultiSelect.length + ' categor' + (_splitCatMultiSelect.length === 1 ? 'y' : 'ies') + ' selected</span><button id="_splitCatDelBtn">Delete selected</button>';
      splitList.appendChild(bar);
      bar.querySelector('#_splitCatDelBtn').addEventListener('click', () => {
        snapshot();
        _splitCatMultiSelect.forEach(cat => {
          categories = categories.filter(c => c !== cat);
          projects.forEach(p => { if (p.category === cat) p.category = null; });
        });
        _splitCatMultiSelect = [];
        saveCategories(); scheduleSave(); renderCategoryList(); render();
      });
    }
    const grouped = {};
    sortProjects(projects.filter(p => matchesSearch(p) && (showCompletedProjects || p.status !== 'completed'))).forEach(p => { const cat = p.category || '__uncategorized__'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(p); });
    // Include any categories from projects not in the categories array
    const extraCats = Object.keys(grouped).filter(c => c !== '__uncategorized__' && !categories.includes(c));
    if (extraCats.length) { categories.push(...extraCats); saveCategories(); }
    const catOrder = categories.concat(grouped['__uncategorized__'] ? ['__uncategorized__'] : []);
    catOrder.forEach(cat => {
      const group = grouped[cat] || [];

      const catLabel = document.createElement('div');
      catLabel.className = 'pf-split-list-cat';
      if (_splitCatMultiSelect.includes(cat)) { catLabel.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'; catLabel.style.color = 'var(--accent)'; }
      const catEmoji = categoryEmojis[cat] || '';
      catLabel.textContent = (catEmoji ? catEmoji + ' ' : '') + (cat === '__uncategorized__' ? 'Uncategorized' : cat) + ' (' + group.length + ')';
      catLabel.style.cursor = 'pointer';
      const _catColor = cat === '__uncategorized__' ? 'var(--text-dim)' : categoryColor(cat);
      catLabel.style.borderLeft = 'none';
      catLabel.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (cat === '__uncategorized__') return;
          const idx = _splitCatMultiSelect.indexOf(cat);
          if (idx > -1) _splitCatMultiSelect.splice(idx, 1); else _splitCatMultiSelect.push(cat);
          renderSplitList();
          return;
        }
        _splitCatMultiSelect = [];
        splitCollapsedCats[cat] = !splitCollapsedCats[cat]; renderSplitList();
      });
      if (cat !== '__uncategorized__') {
        catLabel.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation(); _closeCtx();
          const menu = document.createElement('div');
          menu.className = 'pf-ctx-menu';
          menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
          const emojiItem = document.createElement('div');
          emojiItem.className = 'pf-ctx-menu-item';
          emojiItem.innerHTML = pfIcon('smiley') + ' Set Emoji';
          emojiItem.addEventListener('click', (ev) => {
            ev.stopPropagation(); _closeCtx();
            const emoji = prompt('Enter an emoji for "' + cat + '":', categoryEmojis[cat] || '');
            if (emoji === null) return;
            if (emoji.trim() === '') { delete categoryEmojis[cat]; } else { categoryEmojis[cat] = emoji.trim(); }
            saveCatEmojis(); renderSplitList();
          });
          menu.appendChild(emojiItem);
          const renItem = document.createElement('div');
          renItem.className = 'pf-ctx-menu-item';
          renItem.innerHTML = pfIcon('pencil') + ' Rename Category';
          renItem.addEventListener('click', (ev) => {
            ev.stopPropagation(); _closeCtx();
            const newName = prompt('Rename category:', cat);
            if (!newName || newName.trim() === '' || newName.trim() === cat) return;
            const trimmed = newName.trim();
            if (categories.includes(trimmed)) { showToast('Category "' + trimmed + '" already exists'); return; }
            snapshot();
            const idx = categories.indexOf(cat);
            if (idx > -1) categories[idx] = trimmed;
            projects.forEach(p => { if (p.category === cat) p.category = trimmed; });
            if (splitCollapsedCats[cat]) { splitCollapsedCats[trimmed] = true; delete splitCollapsedCats[cat]; }
            if (categoryEmojis[cat]) { categoryEmojis[trimmed] = categoryEmojis[cat]; delete categoryEmojis[cat]; saveCatEmojis(); }
            saveCategories(); scheduleSave(); render(); renderSplitList();
          });
          menu.appendChild(renItem);
          const delItem = document.createElement('div');
          delItem.className = 'pf-ctx-menu-item pf-ctx-danger';
          delItem.innerHTML = pfIcon('trash') + ' Delete Category';
          delItem.addEventListener('click', (ev) => {
            ev.stopPropagation(); _closeCtx(); snapshot();
            if (!confirm('Delete category "' + cat + '"? Projects will become uncategorized.')) return;
            categories = categories.filter(c => c !== cat);
            projects.forEach(p => { if (p.category === cat) p.category = null; });
            saveCategories(); scheduleSave(); renderCategoryList(); render();
          });
          menu.appendChild(delItem);
          root.appendChild(menu);
          _positionCtxMenu(menu);
          _ctxEl = menu;
        });
      }
      const catAddBtn = document.createElement('button');
      catAddBtn.textContent = '+';
      catAddBtn.title = 'New project in ' + (cat === '__uncategorized__' ? 'Uncategorized' : cat);
      catAddBtn.className = 'pf-cat-add'; // 3B-3: recipe in 14-utilities.css
      catAddBtn.addEventListener('mouseenter', () => { catAddBtn.style.color = 'var(--accent)'; });
      catAddBtn.addEventListener('mouseleave', () => { catAddBtn.style.color = 'var(--text-dim)'; });
      catAddBtn.addEventListener('click', (e) => { e.stopPropagation(); addProject(cat === '__uncategorized__' ? null : cat); });
      catLabel.style.display = 'flex'; catLabel.style.alignItems = 'center';
      if (cat !== '__uncategorized__') {
        catLabel.draggable = true;
        catLabel.dataset.catName = cat;
        catLabel.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-category', cat); catLabel.style.opacity = '0.4'; });
        catLabel.addEventListener('dragend', () => { catLabel.style.opacity = ''; splitList.querySelectorAll('.pf-split-list-cat').forEach(el => { el.style.borderBottom = ''; el.style.borderTop = ''; }); });
      }
      catLabel.addEventListener('dragover', (e) => {
        e.preventDefault();
        const catData = e.dataTransfer.types.includes('text/x-category');
        if (catData && cat !== '__uncategorized__') {
          e.dataTransfer.dropEffect = 'move';
          splitList.querySelectorAll('.pf-split-list-cat').forEach(el => { el.style.borderTop = ''; });
          catLabel.style.borderTop = '3px solid var(--accent)';
        } else {
          e.dataTransfer.dropEffect = 'move';
          catLabel.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)';
        }
      });
      catLabel.addEventListener('dragleave', () => { catLabel.style.background = ''; catLabel.style.borderTop = ''; });
      catLabel.addEventListener('drop', (e) => {
        e.preventDefault(); catLabel.style.background = ''; catLabel.style.borderTop = '';
        const draggedCat = e.dataTransfer.getData('text/x-category');
        if (draggedCat && cat !== '__uncategorized__') {
          const fromIdx = categories.indexOf(draggedCat);
          const toIdx = categories.indexOf(cat);
          if (fromIdx > -1 && toIdx > -1 && fromIdx !== toIdx) {
            categories.splice(fromIdx, 1);
            categories.splice(toIdx, 0, draggedCat);
            saveCategories(); renderSplitList(); render();
          }
          return;
        }
        const srcId = e.dataTransfer.getData('text/plain'); if (!srcId) return; const p = projects.find(pr => pr.id === srcId); if (!p) return; const newCat = cat === '__uncategorized__' ? null : cat; if (p.category === newCat) return; snapshot(); p.category = newCat; scheduleSave(); renderSplitList(); renderSplitDetail();
      });
      const _isCollapsed = !!splitCollapsedCats[cat];
      const txt = catLabel.textContent + (_isCollapsed ? ' ▸' : ' ▾'); catLabel.textContent = '';
      const catLabelText = document.createElement('span');
      catLabelText.textContent = txt;
      catLabelText.className = 'pf-ellip-flex'; // 3B-3
      catAddBtn.style.marginRight = '0';
      catAddBtn.style.marginLeft = '4px';
      catLabel.appendChild(catLabelText);
      catLabel.appendChild(catAddBtn);
      splitList.appendChild(catLabel);
      const catItemsWrap = document.createElement('div');
      catItemsWrap.className = 'pf-cat-items-wrap' + (_isCollapsed ? ' pf-collapsed' : '');
      if (!group.length && !_isCollapsed) {
        const hint = document.createElement('div');
        hint.className = 'pf-empty-hint'; // 3B-3
        hint.textContent = 'No projects in this category';
        catItemsWrap.appendChild(hint);
      }
      let idx = 0;
      group.forEach(p => {
        const item = document.createElement('div');
        const isActive = p.id === splitSelectedId && splitMultiSelect.length <= 1;
        const isMulti = splitMultiSelect.includes(p.id);
        item.className = 'pf-split-list-item' + (isActive ? ' pf-split-active' : '') + (isMulti ? ' pf-split-selected' : '') + (p.status === 'completed' ? ' pf-list-completed' : '');
        item.style.animationDelay = (Math.min(idx, 20) * 15) + 'ms';
        idx++;
        item.setAttribute('onclick', '_splitSelect("' + p.id + '", event)');
        item.addEventListener('dblclick', (e) => { e.stopPropagation(); _inlineRename(item, p); });
        if (!window.matchMedia('(pointer: coarse)').matches) item.draggable = true;
        item.dataset.projectId = p.id;
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          const ids = splitMultiSelect.length && splitMultiSelect.includes(p.id) ? splitMultiSelect : [p.id];
          e.dataTransfer.setData('text/plain', ids.join(','));
          splitList.querySelectorAll('.pf-split-list-item').forEach(el => { if (ids.includes(el.dataset.projectId)) el.classList.add('pf-dragging'); });
        });
        item.addEventListener('dragend', () => { splitList.querySelectorAll('.pf-split-list-item').forEach(el => el.classList.remove('pf-dragging')); splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove()); });
        item.addEventListener('dragover', (e) => {
          e.preventDefault(); e.dataTransfer.dropEffect = 'move';
          splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove());
          const indicator = document.createElement('div');
          indicator.className = 'pf-split-drop-indicator';
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY < midY) { item.parentNode.insertBefore(indicator, item); }
          else { item.parentNode.insertBefore(indicator, item.nextSibling); }
        });
        item.addEventListener('dragleave', (e) => { if (!item.contains(e.relatedTarget)) { splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove()); } });
        item.addEventListener('drop', (e) => {
          e.preventDefault();
          splitList.querySelectorAll('.pf-split-drop-indicator').forEach(el => el.remove());
          const raw = e.dataTransfer.getData('text/plain'); if (!raw) return;
          const ids = raw.split(',').filter(id => id && id !== p.id);
          if (!ids.length) return;
          snapshot();
          const newCat = cat === '__uncategorized__' ? null : cat;
          const moved = [];
          ids.forEach(id => { const src = projects.find(pr => pr.id === id); if (src) { src.category = newCat; moved.push(src); } });
          projects = projects.filter(pr => !ids.includes(pr.id));
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          let destIdx = projects.findIndex(pr => pr.id === p.id);
          if (e.clientY >= midY) destIdx++;
          projects.splice(destIdx, 0, ...moved);
          splitMultiSelect = [];
          scheduleSave(); renderSplitList(); renderSplitDetail();
          moved.forEach(m => { const el = splitList.querySelector('[data-project-id="' + m.id + '"]'); if (el) { el.classList.add('pf-drop-settling'); el.addEventListener('animationend', () => el.classList.remove('pf-drop-settling'), { once: true }); } });
        });
        const tc = countTree(p.subtasks);
        const pct = tc.total ? tc.done / tc.total : 0;
        const pctLabel = Math.round(pct * 100);
        const r = 8, circ = 2 * Math.PI * r, offset = circ * (1 - pct);
        const progressHtml = tc.total ? '<svg class="pf-progress-ring" width="20" height="20" viewBox="0 0 20 20" title="' + pctLabel + '% complete"><circle cx="10" cy="10" r="' + r + '" fill="none" stroke="var(--card-border)" stroke-width="2.5"/><circle cx="10" cy="10" r="' + r + '" fill="none" stroke="var(--' + (p.status === 'waiting' ? 'accent' : p.status) + ')" stroke-width="2.5" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 10 10)"/></svg><span class="pf-split-list-progress" title="' + pctLabel + '% complete">' + tc.done + '/' + tc.total + '</span>' : '';
        let dueHtml = '<span class="pf-split-list-due"></span>';
        if (p.dueAt) {
          const now = new Date(); now.setHours(0,0,0,0);
          const due = new Date(p.dueAt + 'T00:00:00');
          const isOverdue = due < now && p.status !== 'completed';
          dueHtml = '<span class="pf-split-list-due' + (isOverdue ? ' pf-overdue' : '') + '">' + formatDateShort(p.dueAt) + '</span>';
        }
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (window.matchMedia('(pointer: coarse)').matches) return; _showCtxMenu(e.clientX, e.clientY, p); });
        item.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); _inlineRename(item, p); });
        item.addEventListener('click', (e) => { if (e.target.closest('.pf-split-list-edit')) { e.stopPropagation(); _inlineRename(item, p); } });

        if (p.dueAt) { const td = new Date(); td.setHours(0,0,0,0); if (p.dueAt === td.toISOString().slice(0,10) && p.status !== 'completed') item.classList.add('pf-due-today'); }
        const emojiIcon = p.emoji || '';
        item.innerHTML = (emojiIcon ? '<span class="pf-emoji-btn" style="font-size: calc(var(--font-size-base) - 1px);">' + emojiIcon + '</span>' : '') +
          '<span class="pf-split-list-title" title="' + escapeHtml(p.title) + '">' + (searchTerm ? highlightMatch(escapeHtml(p.title), searchTerm) : escapeHtml(p.title)) + '</span>' +
          progressHtml +
          '<button class="pf-split-list-edit" title="Rename">✏️</button>' +
          '<button class="pf-split-list-move pf-move-up" title="Move up">▲</button>' +
          '<button class="pf-split-list-move pf-move-down" title="Move down">▼</button>' +
          '<button class="pf-split-list-ctx" title="More actions">⋮</button>';
        item.querySelector('.pf-move-up').addEventListener('click', (e) => { e.stopPropagation(); const idx = projects.findIndex(pr => pr.id === p.id); if (idx <= 0) return; snapshot(); projects.splice(idx - 1, 0, projects.splice(idx, 1)[0]); scheduleSave(); renderSplitList(); });
        item.querySelector('.pf-move-down').addEventListener('click', (e) => { e.stopPropagation(); const idx = projects.findIndex(pr => pr.id === p.id); if (idx >= projects.length - 1) return; snapshot(); projects.splice(idx + 1, 0, projects.splice(idx, 1)[0]); scheduleSave(); renderSplitList(); });
        item.querySelector('.pf-split-list-ctx').addEventListener('click', (e) => { e.stopPropagation(); const rect = e.target.getBoundingClientRect(); _showCtxMenu(rect.left, rect.top, p); });
        catItemsWrap.appendChild(item);
      });
      splitList.appendChild(catItemsWrap);
    });
    // Virtual scrolling: hide off-screen items when list is large
    _virtualizeList();
  }
  let _splitVirtualCleanup = null;
  function _virtualizeList() {
    if (_splitVirtualCleanup) { _splitVirtualCleanup(); _splitVirtualCleanup = null; }
    const items = splitList.querySelectorAll('.pf-split-list-item');
    if (items.length <= 50) return;
    const ITEM_H = 40, BUFFER = 10;
    const topSpacer = document.createElement('div'); topSpacer.className = 'pf-virt-spacer-top';
    const botSpacer = document.createElement('div'); botSpacer.className = 'pf-virt-spacer-bot';
    // Convert items to array with original positions
    const allItems = Array.from(items);
    const parents = allItems.map(el => el.parentNode);
    const nexts = allItems.map(el => el.nextSibling);
    function applyVirtual() {
      const scrollTop = splitList.scrollTop;
      const viewH = splitList.clientHeight;
      const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
      const endIdx = Math.min(allItems.length, Math.ceil((scrollTop + viewH) / ITEM_H) + BUFFER);
      allItems.forEach((el, i) => {
        if (el.closest('.pf-collapsed')) { el.style.display = ''; return; }
        if (i >= startIdx && i < endIdx) { el.style.display = ''; }
        else { el.style.display = 'none'; }
      });
    }
    applyVirtual();
    let _vScrollTimer = null;
    function onScroll() { if (_vScrollTimer) return; _vScrollTimer = setTimeout(() => { _vScrollTimer = null; applyVirtual(); }, 100); }
    splitList.addEventListener('scroll', onScroll);
    _splitVirtualCleanup = () => { splitList.removeEventListener('scroll', onScroll); if (_vScrollTimer) clearTimeout(_vScrollTimer); };
  }

  let _ctxEl = null;
