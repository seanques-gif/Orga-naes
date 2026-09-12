    // SUBSECTION: Context Menu
  function _closeCtx() { if (_ctxEl) { _ctxEl.remove(); _ctxEl = null; } const bd = document.getElementById('pf-ctx-backdrop'); if (bd) bd.style.display = 'none'; }
  function _positionCtxMenu(menu) {
    let backdrop = document.getElementById('pf-ctx-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div'); backdrop.id = 'pf-ctx-backdrop'; document.getElementById('pf-root').appendChild(backdrop);
      backdrop.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); _closeCtx(); });
      backdrop.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); });
      backdrop.addEventListener('touchstart', function(e) { e.preventDefault(); e.stopPropagation(); _closeCtx(); });
    }
    backdrop.style.display = 'block';
    const maxH = window.innerHeight - 16;
    menu.style.maxHeight = maxH + 'px';
    menu.style.overflowY = 'auto';
    void menu.offsetHeight;
    const rect = menu.getBoundingClientRect();
    const menuH = Math.min(rect.height, maxH);
    const menuW = rect.width;
    let clickY = parseInt(menu.style.top) || rect.top;
    let clickX = parseInt(menu.style.left) || rect.left;
    const midScreen = window.innerHeight / 2;
    let newTop, newLeft;
    if (clickY > midScreen) {
      newTop = clickY - menuH;
    } else {
      newTop = clickY;
    }
    newLeft = clickX;
    if (newLeft + menuW > window.innerWidth - 8) newLeft = window.innerWidth - menuW - 8;
    if (newLeft < 8) newLeft = 8;
    if (newTop + menuH > window.innerHeight - 8) newTop = window.innerHeight - menuH - 8;
    if (newTop < 8) newTop = 8;
    menu.style.left = newLeft + 'px';
    menu.style.top = newTop + 'px';
  }
  document.addEventListener('pointerdown', (e) => {
    if (_ctxEl && !_ctxEl.contains(e.target)) { e.preventDefault(); e.stopPropagation(); _closeCtx(); }
  }, true);
  document.addEventListener('contextmenu', _closeCtx);
  // Escape handling for _ctxEl and the multi-select bars now lives entirely
  // in handleEscape() / _escDismissables (see the Escape Dismissable Stack
  // subsection) — this used to be a second, independent keydown listener
  // that duplicated that logic and could race with it.

  splitList.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.pf-split-list-item')) return;
    e.preventDefault();
    e.stopPropagation();
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'pf-ctx-menu';
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    const addItem = document.createElement('div');
    addItem.className = 'pf-ctx-menu-item';
    addItem.innerHTML = pfIcon('plus-badge') + ' Add Project';
    addItem.addEventListener('click', (ev) => { ev.stopPropagation(); _closeCtx(); openNewProjectCategoryPicker(); });
    menu.appendChild(addItem);
    const addCatItem = document.createElement('div');
    addCatItem.className = 'pf-ctx-menu-item';
    addCatItem.innerHTML = pfIcon('folder') + ' Add Category';
    addCatItem.addEventListener('click', (ev) => {
      ev.stopPropagation(); _closeCtx();
      const name = prompt('New category name:');
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (categories.includes(trimmed)) { showToast('Category already exists.', true); return; }
      categories.push(trimmed); saveCategories(); renderCategoryList(); render();
    });
    menu.appendChild(addCatItem);
    root.appendChild(menu);
    _positionCtxMenu(menu);
    _ctxEl = menu;
  });
  window._showCtxMenu = function(x, y, p) {
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'pf-ctx-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    if (splitMultiSelect.length > 1 && splitMultiSelect.includes(p.id)) {
      const count = splitMultiSelect.length;
      const header = document.createElement('div');
      header.className = 'pf-ctx-menu-item';
      header.style.cssText = 'font-weight:700;opacity:0.6;cursor:default;pointer-events:none;';
      header.textContent = count + ' projects selected';
      menu.appendChild(header);
      const sep = document.createElement('div'); sep.className = 'pf-ctx-menu-sep'; menu.appendChild(sep);
      STATUSES.forEach(st => {
        const el = document.createElement('div');
        el.className = 'pf-ctx-menu-item';
        el.textContent = '→ Set all ' + STATUS_LABEL[st];
        el.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); snapshot(); splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) { pr.status = st; pr.completedAt = st === 'completed' ? new Date().toISOString() : null; } }); splitMultiSelect = []; scheduleSave(); render(); if (listViewActive) { renderSplitList(); renderSplitDetail(); } showToast('✓ Set ' + count + ' projects to ' + STATUS_LABEL[st]); });
        menu.appendChild(el);
      });
      const sep2 = document.createElement('div'); sep2.className = 'pf-ctx-menu-sep'; menu.appendChild(sep2);
      const archiveAll = document.createElement('div');
      archiveAll.className = 'pf-ctx-menu-item';
      archiveAll.innerHTML = pfIcon('archive') + ' Archive all';
      archiveAll.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); snapshot(); splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) archiveProject(pr); }); projects = projects.filter(pr => !splitMultiSelect.includes(pr.id)); splitMultiSelect = []; splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('📦 Archived ' + count + ' projects'); });
      menu.appendChild(archiveAll);
      const delAll = document.createElement('div');
      delAll.className = 'pf-ctx-menu-item pf-ctx-danger';
      delAll.innerHTML = pfIcon('trash') + ' Delete all';
      delAll.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); if (!confirm('Delete ' + count + ' projects?')) return; snapshot(); splitMultiSelect.forEach(id => { const pr = projects.find(pr => pr.id === id); if (pr) trashProject(pr); }); projects = projects.filter(pr => !splitMultiSelect.includes(pr.id)); splitMultiSelect = []; splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('🗑 Deleted ' + count + ' projects'); });
      menu.appendChild(delAll);
      root.appendChild(menu);
      _positionCtxMenu(menu);
      _ctxEl = menu;
      return;
    }
    const statusNext = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
    const items = [
      // Non-clickable info line showing when this project was created.
      // Uses the existing p.createdAt field (already saved on every
      // project) and the existing formatDateTime() helper.
      ...(p.createdAt ? [{ icon: 'calendar', label: 'Created ' + formatDateTime(p.createdAt), info: true }, { sep: true }] : []),
      { icon: 'pencil', label: 'Rename', action: () => { const item = splitList.querySelector('[data-project-id="' + p.id + '"]'); if (item) _inlineRename(item, p); } },
      { icon: 'star', label: 'Add to Today', action: () => { addToToday(p.title, p.id, 'project'); } },
      { icon: 'bell', label: 'Set Reminder', action: () => { promptReminder(p.id, p.title, 'project'); } },
      { label: '→ ' + STATUS_LABEL[statusNext], action: () => { _lastProjectId = p.id; snapshot(); p.status = statusNext; p.completedAt = p.status === 'completed' ? new Date().toISOString() : null; scheduleSave(); render(); } },
      { icon: 'clipboard', label: 'Duplicate', action: () => { snapshot(); const dup = JSON.parse(JSON.stringify(p)); dup.id = uid(); dup.title += ' (copy)'; projects.push(dup); scheduleSave(); renderSplitList(); } },
    ];

    items.push({ sep: true });
    items.push({ icon: 'refresh', label: 'Repeat: ' + (p.recurrence || 'None'), cycling: true, action: () => { const opts = [null,'daily','weekdays','weekly','biweekly','monthly','quarterly','yearly']; const labels = ['None','Daily','Weekdays','Weekly','Biweekly','Monthly','Quarterly','Yearly']; const cur = opts.indexOf(p.recurrence || null); const next = (cur + 1) % opts.length; snapshot(); p.recurrence = opts[next]; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('Repeat: ' + labels[next]); return 'Repeat: ' + labels[next]; } });
    items.push({ icon: 'smiley', label: 'Set Emoji', action: () => { const el = root.querySelector('[data-project-id="' + p.id + '"]') || root.querySelector('.pf-split-active'); if (el) showEmojiPicker(p, el); } });
    items.push({ icon: 'archive', label: 'Archive', action: () => { snapshot(); archiveProject(p); logActivity('Archived project "' + p.title + '"'); projects = projects.filter(pr => pr.id !== p.id); if (splitSelectedId === p.id) splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('"' + p.title + '" archived', false, true); } });
    items.push({ icon: 'trash', label: 'Delete', danger: true, action: () => { snapshot(); trashProject(p); logActivity('Trashed project "' + p.title + '"'); projects = projects.filter(pr => pr.id !== p.id); if (splitSelectedId === p.id) splitSelectedId = null; scheduleSave(); renderSplitList(); renderSplitDetail(); showToast('"' + p.title + '" moved to trash', false, true); } });
    items.forEach(it => {
      if (it.sep) { const s = document.createElement('div'); s.className = 'pf-ctx-menu-sep'; menu.appendChild(s); return; }
      const el = document.createElement('div');
      // Non-clickable info line (e.g. "Created ..."): dimmed text, no
      // hover highlight, no click action — search "it.info" to adjust.
      el.className = 'pf-ctx-menu-item' + (it.danger ? ' pf-ctx-danger' : '') + (it.info ? ' pf-ctx-info' : '');
      // SVG ink stays markup (trusted, from pfIcon); the label is added as a
      // text node so dynamic labels can never inject HTML.
      el.innerHTML = pfIcon(it.icon || 'info');
      el.appendChild(document.createTextNode(' ' + it.label));
      if (it.info) { menu.appendChild(el); return; }
      if (it.cycling) {
        el.addEventListener('click', (e) => { e.stopPropagation(); const next = it.action(); el.innerHTML = pfIcon(it.icon || 'info'); el.appendChild(document.createTextNode(' ' + next)); });
      } else {
        el.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); it.action(); });
      }
      menu.appendChild(el);
    });
    root.appendChild(menu);
    _positionCtxMenu(menu);
    _ctxEl = menu;
  };

  function _showSubCtxMenu(x, y, p, s) {
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'pf-ctx-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const statusNext = STATUSES[(STATUSES.indexOf(s.status) + 1) % STATUSES.length];
    const isMobile = root.classList.contains('pf-device-mobile');
    const items = [
      // Non-clickable info line showing when this task/subtask was
      // created. Applies to both — in this app, a top-level "task" inside
      // a project is really just a depth-0 subtask, so this one menu
      // covers both cases. Uses the existing s.createdAt field.
      ...(s.createdAt ? [{ icon: 'calendar', label: 'Created ' + formatDateTime(s.createdAt), info: true }, { sep: true }] : []),
      ...(!isMobile ? [{ icon: 'pencil', label: 'Edit Title', action: () => { const row = root.querySelector('[data-sub-title-id="' + s.id + '"]'); if (row) { row.contentEditable = 'true'; row.focus(); const range = document.createRange(); range.selectNodeContents(row); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } } }] : []),
      { icon: 'star', label: 'Add to Today', action: () => { addToToday(s.title, s.id, 'subtask'); } },
      { icon: 'bell', label: 'Set Reminder', action: () => { promptReminder(s.id, s.title, 'subtask'); } },
      { label: '→ ' + STATUS_LABEL[statusNext], action: () => { _lastProjectId = p.id; snapshot(); s.status = statusNext; s.completedAt = s.status === 'completed' ? new Date().toISOString() : null; scheduleSave(); render(); } },
      ...(!isMobile ? [{ icon: 'link', label: 'Dependencies', action: () => { const chip = root.querySelector('[data-sub-id="' + s.id + '"] .pf-dep-chip'); if (chip) chip.click(); else { const row = root.querySelector('[data-sub-id="' + s.id + '"]'); if (row) { const tempChip = buildDependencyChip(p, s); tempChip.style.position = 'absolute'; tempChip.style.opacity = '0'; row.appendChild(tempChip); tempChip.click(); } } } }] : []),
      ...(!isMobile ? [{ icon: 'arrow-up', label: 'Promote to Project', action: () => { promoteSubToProject(p, s); } }] : []),
      { icon: 'clipboard', label: 'Copy to Project…', action: () => { openCopyToProjectModal(p, [s.id]); } },
      { icon: 'file', label: 'Copy (paste with Ctrl+V)', action: () => { _taskClipboard = [s]; showToast('Task copied. Click a project to paste as main task, or a task to nest under it'); } },
      ...(!isMobile ? [{ icon: 'refresh', label: 'Repeat: ' + (s.recurrence || 'None'), cycling: true, action: () => { const opts = [null,'daily','weekdays','weekly','biweekly','monthly','quarterly','yearly']; const labels = ['None','Daily','Weekdays','Weekly','Biweekly','Monthly','Quarterly','Yearly']; const cur = opts.indexOf(s.recurrence || null); const next = (cur + 1) % opts.length; snapshot(); s.recurrence = opts[next]; scheduleSave(); renderSplitDetail(); showToast('Repeat: ' + labels[next]); return 'Repeat: ' + labels[next]; } }] : []),
      { sep: true },
      { icon: 'trash', label: 'Delete', danger: true, action: () => { deleteSubtask(p.id, s.id); } },
    ];
    items.forEach(it => {
      if (it.sep) { const sep = document.createElement('div'); sep.className = 'pf-ctx-menu-sep'; menu.appendChild(sep); return; }
      const el = document.createElement('div');
      // Non-clickable info line (e.g. "Created ..."): dimmed text, no
      // hover highlight, no click action — search "it.info" to adjust.
      el.className = 'pf-ctx-menu-item' + (it.danger ? ' pf-ctx-danger' : '') + (it.info ? ' pf-ctx-info' : '');
      // SVG ink stays markup (trusted, from pfIcon); the label is added as a
      // text node so dynamic labels can never inject HTML.
      el.innerHTML = pfIcon(it.icon || 'info');
      el.appendChild(document.createTextNode(' ' + it.label));
      if (it.info) { menu.appendChild(el); return; }
      if (it.cycling) {
        el.addEventListener('click', (e) => { e.stopPropagation(); const next = it.action(); el.innerHTML = pfIcon(it.icon || 'info'); el.appendChild(document.createTextNode(' ' + next)); });
      } else {
        el.addEventListener('click', (e) => { e.stopPropagation(); _closeCtx(); it.action(); });
      }
      menu.appendChild(el);
    });
    root.appendChild(menu);
    _positionCtxMenu(menu);
    _ctxEl = menu;
  }

  function _inlineRename(item, p) {
    clearTimeout(_splitSelectTimer);
    item.style.animation = 'none';
    const titleEl = item.querySelector('.pf-split-list-title');
    if (!titleEl) return;
    titleEl.contentEditable = 'true';
    titleEl.focus();
    const range = document.createRange(); range.selectNodeContents(titleEl);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const finish = () => {
      titleEl.contentEditable = 'false';
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== p.title) { snapshot(); p.title = newTitle; scheduleSave(); }
      renderSplitList();
    };
    titleEl.addEventListener('blur', finish, { once: true });
    titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } if (e.key === 'Escape') { titleEl.textContent = p.title; titleEl.blur(); } });
  }

  function _goBackToProjects() {
    root.classList.remove('pf-detail-open');
    root.classList.remove('pf-mobile-detail-open');
    splitSelectedId = null;
    renderSplitList(); renderSplitDetail();
    document.getElementById('pf-toolbar-back').style.display = 'none';
  }

  let _searchAutoCollapseId = null;
  let _completedCollapseId = null;
  // Rebuilds the selected project's detail pane in split view.
