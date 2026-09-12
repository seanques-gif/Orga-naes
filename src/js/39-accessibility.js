  // SUBSECTION: Accessibility
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'Orga-naes Project Manager');
  (function applyAria() {
    const toolbar = root.querySelector('.pf-toolbar');
    if (toolbar) { toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Project actions'); }
    const splitView = root.querySelector('.pf-split-view');
    if (splitView) splitView.setAttribute('role', 'main');
    const splitList = root.querySelector('.pf-split-list');
    if (splitList) { splitList.setAttribute('role', 'listbox'); splitList.setAttribute('aria-label', 'Project list'); }
    const newBtn = document.getElementById('pf-new-project');
    if (newBtn) newBtn.setAttribute('aria-label', 'Create new project');
    const undoB = document.getElementById('pf-undo');
    if (undoB) undoB.setAttribute('aria-label', 'Undo');
    const redoB = document.getElementById('pf-redo');
    if (redoB) redoB.setAttribute('aria-label', 'Redo');
    const searchI = document.getElementById('pf-search');
    if (searchI) { searchI.setAttribute('aria-label', 'Search projects'); searchI.setAttribute('role', 'searchbox'); }
  })();

  window._pfLoaded = false;
  loadSize().then(loadTheme).then(loadReminder).then(loadCategories).then(loadCatEmojis).then(loadCollapsedCategories).then(load).then(loadWeekly).then(loadBacklog).then(loadDismissed).then(async () => {
    window._pfLoaded = true;
    let mode = 'focus';
    setViewMode('focus');
    // Restore theme preset
    try { const tp = localStorage.getItem('project-flow-theme-preset'); if (tp === 'auto') applyAutoTheme(); else if (tp && THEME_PRESETS[tp]) applyThemePreset(tp); else highlightActiveThemeBtn('midnight-cyan'); } catch(e) {}
    // Motivational quote in empty state
    const emptyEl = document.getElementById('pf-empty');
    if (emptyEl && !projects.length) { emptyEl.innerHTML = '<b>' + QUOTES[Math.floor(Math.random() * QUOTES.length)] + '</b><br><br>Click <b>+ New project</b> to get started.'; }
    // Weekly Planner data is now loaded (see loadWeekly() above) even
    // though the panel itself hasn't been opened — run one sync pass now
    // so overdue rollover/pruning/auto-add are already current by the
    // time the user opens it, instead of waiting for the first edit.
    syncWeeklyWithTasks();
    // Start particles in card mode
    if (mode === 'card') startParticles();
  });

  // Long-press multi-select + touch drag reorder (all devices)
  (function longPressAndDrag() {
    let holdTimer = null, targetEl = null, startX = 0, startY = 0; let _holdFiredSelect = false;
    let _lastPointerX = 0, _lastPointerY = 0;
    let dragActive = false, dragGhost = null, dragStartEl = null, lastDropTarget = null;
    const HOLD_DELAY = 400;
    const IGNORE = '.pf-sub-add, .pf-sub-del, .pf-sub-dot, .pf-sub-edit, .pf-sub-dates, .pf-sub-ctx-btn, .pf-split-list-ctx, .pf-split-list-edit, .pf-badge, .pf-node-del, .pf-chevron, .pf-sub-chevron, [contenteditable="true"]';

    let _suppressNextClick = false;
    document.addEventListener('click', function(e) {
      if (_suppressNextClick) { _suppressNextClick = false; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);

    function doSelect(subRow, listItem) {
      _suppressNextClick = true;
      window._splitSelectSuppressed = true;
      if (navigator.vibrate) navigator.vibrate(30);
      if (subRow && subRow.__subId) {
        const id = subRow.__subId;
        const p = subRow.__project;
        const idx = subMultiSelect.indexOf(id);
        if (idx > -1) { subMultiSelect.splice(idx, 1); subRow.classList.remove('pf-sub-selected'); }
        else { subMultiSelect.push(id); subRow.classList.add('pf-sub-selected'); }
        if (p) renderSubSelectBar(p);
      } else if (listItem && (listItem.dataset.projectId || listItem.dataset.id)) {
        const id = listItem.dataset.projectId || listItem.dataset.id;
        const idx = splitMultiSelect.indexOf(id);
        if (idx > -1) { splitMultiSelect.splice(idx, 1); listItem.classList.remove('pf-split-selected'); }
        else { splitMultiSelect.push(id); listItem.classList.add('pf-split-selected'); }
        if (splitMultiSelect.length === 0) splitSelectedId = null;
        else if (splitMultiSelect.length === 1) splitSelectedId = splitMultiSelect[0];
      }
    }

    function isInMultiSelect() { return splitMultiSelect.length > 0 || subMultiSelect.length > 0; }

    function isItemSelected(subRow, listItem) {
      if (subRow && subRow.__subId) return subMultiSelect.includes(subRow.__subId);
      if (listItem) return splitMultiSelect.includes(listItem.dataset.projectId || listItem.dataset.id || '');
      return false;
    }

    function cleanupDrag() {
      if (dragGhost) { dragGhost.remove(); dragGhost = null; }
      if (lastDropTarget) { lastDropTarget.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); }
      dragStartEl = null; dragActive = false; lastDropTarget = null;
    }

    // Prevent native long-press on touch targets
    document.addEventListener('contextmenu', function(e) {
      if (e.target.closest('.pf-subrow') || e.target.closest('.pf-split-list-item')) {
        e.preventDefault();
      }
    });

    // Pointer events for ALL devices (desktop, tablet, mobile)
    // Gesture: long-press without move = select. long-press + drag = move.
    // When in multi-select: long-press + drag a selected item = move selected items.
    let _pointerCount = 0;
    document.addEventListener('pointerdown', function(e) {
      _pointerCount++;
      if (_pointerCount > 1) { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } return; }
      if (e.button !== 0) return;
      const subRow = e.target.closest('.pf-subrow');
      const listItem = e.target.closest('.pf-split-list-item');
      if (!subRow && !listItem) return;
      if (e.target.closest(IGNORE)) return;
      targetEl = subRow || listItem;
      startX = e.clientX;
      startY = e.clientY;
      _lastPointerX = e.clientX;
      _lastPointerY = e.clientY;
      dragStartEl = null; dragActive = false; _holdFiredSelect = false;

      if (isInMultiSelect() && isItemSelected(subRow, listItem)) {
        // Selected item: arm for drag immediately (drag starts after 50px movement)
        e.preventDefault();
        dragStartEl = targetEl;
      } else if (isInMultiSelect()) {
        // Unselected item while in multi-select: do nothing (tap handles toggle)
        return;
      } else {
        // Not in multi-select: long-press = select + arm for drag in one gesture
        holdTimer = setTimeout(() => {
          holdTimer = null;
          doSelect(subRow, listItem);
          if (navigator.vibrate) navigator.vibrate(30);
          _holdFiredSelect = true;
          dragStartEl = targetEl;
          startX = _lastPointerX;
          startY = _lastPointerY;
          showToast('✓ Selected. Drag to move, or tap others to multi-select');
        }, HOLD_DELAY);
      }
    });

    document.addEventListener('pointermove', function(e) {
      _lastPointerX = e.clientX;
      _lastPointerY = e.clientY;
      if (holdTimer) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 15) { clearTimeout(holdTimer); holdTimer = null; }
      }
      if (!dragStartEl) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragActive && Math.abs(dx) + Math.abs(dy) < 50) return;
      if (!dragActive) {
        dragActive = true;
        dragStartEl.style.opacity = '0.4';
        const titleEl = dragStartEl.querySelector('.pf-subrow-title') || dragStartEl.querySelector('.pf-split-list-title');
        const label = titleEl ? titleEl.textContent.trim() : 'Moving...';
        const count = subMultiSelect.length > 1 ? subMultiSelect.length : (splitMultiSelect.length > 1 ? splitMultiSelect.length : 1);
        dragGhost = document.createElement('div');
        dragGhost.style.cssText = 'position:fixed;pointer-events:none;z-index:var(--z-drag);transform:translate(10px,-50%);padding:8px 14px;background:var(--card,#12161c);color:var(--text,#d7dde5);border:1px solid var(--accent,#2fd4ff);border-radius:var(--radius-container,6px);font-size: calc(var(--font-size-base) - 2px);font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.4);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
        dragGhost.textContent = count > 1 ? count + ' items' : label;
        // Appended inside #pf-root so palette tokens (--card/--text/--accent)
        // resolve; position:fixed keeps placement viewport-relative.
        document.getElementById('pf-root').appendChild(dragGhost);
      }
      dragGhost.style.left = e.clientX + 'px';
      dragGhost.style.top = e.clientY + 'px';
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const dropRow = target ? (target.closest('.pf-subrow') || target.closest('.pf-sublist') || target.closest('.pf-split-list-item') || target.closest('.pf-split-list-cat')) : null;
      if (lastDropTarget && lastDropTarget !== dropRow) { lastDropTarget.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); lastDropTarget.style.outline = ''; }
      if (dropRow && dropRow !== dragStartEl) {
        if (dropRow.classList.contains('pf-subrow')) {
          const rect = dropRow.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'nest';
          dropRow.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest');
          dropRow.classList.add('pf-drop-' + zone);
          dropRow.dataset.dropZone = zone;
        } else if (dropRow.classList.contains('pf-split-list-item')) {
          const rect = dropRow.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const zone = ratio < 0.5 ? 'before' : 'after';
          dropRow.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest');
          dropRow.classList.add('pf-drop-' + zone);
          dropRow.dataset.dropZone = zone;
        } else if (dropRow.classList.contains('pf-split-list-cat')) {
          dropRow.style.outline = '2px solid var(--accent)';
          dropRow.style.outlineOffset = '-2px';
        }
      }
      lastDropTarget = dropRow;
    });

    document.addEventListener('pointerup', function() {
      _pointerCount = Math.max(0, _pointerCount - 1);
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      setTimeout(() => { _suppressNextClick = false; window._splitSelectSuppressed = false; }, 0);
      if (dragStartEl && !dragActive) {
        // Armed but didn't drag — only toggle if hold didn't already select
        dragStartEl.style.opacity = '';
        if (!_holdFiredSelect) {
          const subRow = dragStartEl.classList.contains('pf-subrow') ? dragStartEl : dragStartEl.closest('.pf-subrow');
          const listItem = dragStartEl.classList.contains('pf-split-list-item') ? dragStartEl : dragStartEl.closest('.pf-split-list-item');
          doSelect(subRow, listItem);
        }
        _holdFiredSelect = false;
        cleanupDrag();
        targetEl = null;
        return;
      }
      if (dragStartEl && dragActive) {
        dragStartEl.style.opacity = '';
        const target = lastDropTarget;
        if (target && target.classList.contains('pf-subrow') && target !== dragStartEl && target.__subId && target.__project) {
          const p = target.__project;
          const zone = target.dataset.dropZone || 'after';
          if (dragStartEl.__subId && dragStartEl.__project && dragStartEl.__project.id === p.id) {
            draggingSubId = dragStartEl.__subId;
            draggingProjectId = p.id;
            _draggingSubIds = subMultiSelect.length ? subMultiSelect.slice() : [dragStartEl.__subId];
            performMove(p, target.__subId, zone);
          }
          target.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest');
        } else if (target && target.classList.contains('pf-sublist') && target.__project) {
          const p = target.__project;
          if (dragStartEl.__subId && dragStartEl.__project && dragStartEl.__project.id === p.id) {
            draggingSubId = dragStartEl.__subId;
            draggingProjectId = p.id;
            _draggingSubIds = subMultiSelect.length ? subMultiSelect.slice() : [dragStartEl.__subId];
            performMove(p, null, null);
          }
        } else if (target && target.classList.contains('pf-split-list-item') && target !== dragStartEl) {
          // Reorder projects in list view
          const srcId = dragStartEl.dataset.projectId || dragStartEl.dataset.id;
          const destId = target.dataset.projectId || target.dataset.id;
          if (srcId && destId && srcId !== destId) {
            snapshot();
            const destProj = projects.find(p => p.id === destId);
            const destCat = destProj ? destProj.category : null;
            const idsToMove = splitMultiSelect.length ? splitMultiSelect.slice() : [srcId];
            const movedProjects = [];
            idsToMove.forEach(id => {
              const idx = projects.findIndex(p => p.id === id);
              if (idx > -1) { const mp = projects.splice(idx, 1)[0]; mp.category = destCat; movedProjects.push(mp); }
            });
            const destIdx = projects.findIndex(p => p.id === destId);
            const insertIdx = (target.dataset.dropZone === 'before') ? destIdx : destIdx + 1;
            projects.splice(insertIdx, 0, ...movedProjects);
            splitMultiSelect = [];
            splitSortMode = 'manual'; safeSet('project-flow-sort-mode', 'manual', false);
            scheduleSave(); renderSplitList(); renderSplitDetail();
          }
          target.classList.remove('pf-drop-before', 'pf-drop-after');
        } else if (target && target.classList.contains('pf-split-list-cat')) {
          // Move projects to target category
          const catName = target.dataset.catName || null;
          const destCat = (catName === '__uncategorized__') ? null : catName;
          const srcId = dragStartEl.dataset.projectId || dragStartEl.dataset.id;
          if (srcId) {
            snapshot();
            const idsToMove = splitMultiSelect.length ? splitMultiSelect.slice() : [srcId];
            idsToMove.forEach(id => {
              const proj = projects.find(p => p.id === id);
              if (proj) proj.category = destCat;
            });
            splitMultiSelect = [];
            scheduleSave(); renderSplitList(); renderSplitDetail();
          }
          target.style.outline = '';
        }
      }
      cleanupDrag();
      targetEl = null;
    });

    document.addEventListener('pointercancel', function(e) {
      _pointerCount = Math.max(0, _pointerCount - 1);
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (dragStartEl) dragStartEl.style.opacity = '';
      cleanupDrag();
      targetEl = null;
    });
  })();

  // Force-blur any active editable title/description when clicking outside of it.
  // Some browsers (notably Safari/iOS) don't automatically blur a focused
  // contenteditable element when the click target isn't itself focusable,
  // which left a blinking caret "stuck" in the last-edited field even when
  // clicking on unrelated, non-interactive parts of the UI (e.g. toolbar gaps).
  document.addEventListener('pointerdown', function(e) {
    const active = document.activeElement;
    if (active && active.isContentEditable && active !== e.target && !(e.target.closest && e.target.closest('[contenteditable="true"]') === active)) {
      active.blur();
    }
  }, true);

  // Prevent iOS auto-zoom on contenteditable focus
  const vpMeta = document.querySelector('meta[name="viewport"]');
  document.addEventListener('focusin', function(e) {
    if (e.target && (e.target.contentEditable === 'true' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      vpMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
  });
  document.addEventListener('focusout', function() {
    vpMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  });

  // Update overdue badge on bottom nav
