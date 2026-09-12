    // SUBSECTION: Drag & Drop
  function clearIndicators() { canvas.querySelectorAll('.pf-drop-before, .pf-drop-after, .pf-drop-nest').forEach(el => { el.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); }); canvas.querySelectorAll('.pf-drop-root').forEach(el => el.classList.remove('pf-drop-root')); }
  function isDescendant(node, id) { if (!node.subtasks) return false; for (const c of node.subtasks) { if (c.id === id) return true; if (isDescendant(c, id)) return true; } return false; }
  function performMove(p, targetId, zone) {
    if (!draggingSubId || draggingProjectId !== p.id) { clearIndicators(); return; }
    const ids = _draggingSubIds.length ? _draggingSubIds : [draggingSubId];
    if (ids.includes(targetId)) { clearIndicators(); return; }
    const nodes = [];
    for (const id of ids) {
      const node = findSubNode(p.subtasks, id);
      if (!node) continue;
      if (targetId && isDescendant(node, targetId)) { clearIndicators(); return; }
      nodes.push(node);
    }
    if (!nodes.length) { clearIndicators(); return; }
    snapshot();
    ids.forEach(id => { const arr = findSubParentArray(p.subtasks, id); if (arr) { const idx = arr.findIndex(s => s.id === id); if (idx > -1) arr.splice(idx, 1); } });
    if (!targetId) { nodes.forEach(n => p.subtasks.push(n)); }
    else if (zone === 'nest') { const targetNode = findSubNode(p.subtasks, targetId); if (!targetNode.subtasks) targetNode.subtasks = []; nodes.forEach(n => targetNode.subtasks.push(n)); targetNode.expanded = true; }
    else { const destArr = findSubParentArray(p.subtasks, targetId); const tIdx = destArr.findIndex(s => s.id === targetId); destArr.splice(zone === 'before' ? tIdx : tIdx + 1, 0, ...nodes); }
    draggingSubId = null; draggingProjectId = null; _draggingSubIds = []; subMultiSelect = []; clearIndicators(); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); scheduleSave(); render();
  }

  function renderSubtaskRows(container, p, list, depth) { list.forEach(s => { const row = subtaskEl(p, s, depth); container.appendChild(row); if (s.expanded && s.subtasks && s.subtasks.length) { const nestedWrap = document.createElement('div'); nestedWrap.className = 'pf-sublist-nested'; const { color } = levelMarkerFor(depth + 1); nestedWrap.style.setProperty('--rail-color', color); container.appendChild(nestedWrap); renderSubtaskRows(nestedWrap, p, s.subtasks, depth + 1); const nestedAddBtn = document.createElement('button'); nestedAddBtn.className = 'pf-add-sub'; nestedAddBtn.textContent = '+ Add subtask'; nestedAddBtn.addEventListener('click', (e) => { e.stopPropagation(); addSubtask(p.id, s.id); }); nestedWrap.appendChild(nestedAddBtn); } }); }

  function subtaskEl(p, s, depth) {
    if (!s.subtasks) s.subtasks = []; const hasChildren = s.subtasks.length > 0; const isSearchMatch = searchTerm && s.title.toLowerCase().includes(searchTerm.toLowerCase()); const isStatusMatch = statusFilter && s.status === statusFilter; const row = document.createElement('div'); row.className = 'pf-subrow' + (s.status === 'completed' ? ' pf-sub-completed' : '') + (hasChildren ? ' pf-sub-has-children' : '') + (subMultiSelect.includes(s.id) ? ' pf-sub-selected' : '') + (isSearchMatch ? ' pf-sub-search-match' : '') + (isStatusMatch ? ' pf-sub-status-match' : ''); row.style.setProperty('--rail-color', levelMarkerFor(depth).color); if (s.createdAt) row.title = 'Created ' + formatDateTime(s.createdAt);
    const chevronHtml = hasChildren ? '<button class="pf-sub-chevron' + (s.expanded ? ' pf-sub-expanded' : '') + '" title="Show nested subtasks"><svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M3 1.5L7.5 5L3 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : '<span class="pf-sub-spacer"></span>';
    row.innerHTML = '<span class="pf-sub-handle" title="Drag to move">&#8942;&#8942;</span>' + chevronHtml + '<div class="pf-subrow-title" contenteditable="false" spellcheck="false" data-sub-title-id="' + s.id + '">' + escapeHtml(s.title) + '</div><span class="pf-sub-dates"></span>';
    const subDatesEl = row.querySelector('.pf-sub-dates');

    const addBtn = document.createElement('button'); addBtn.className = 'pf-sub-add'; addBtn.title = 'Add subtask under this'; addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'; addBtn.addEventListener('click', (e) => { e.stopPropagation(); addSubtask(p.id, s.id); }); subDatesEl.appendChild(addBtn);
    const editBtn = document.createElement('button'); editBtn.className = 'pf-sub-edit'; editBtn.title = 'Edit title'; editBtn.textContent = '✏️'; editBtn.addEventListener('click', (e) => { e.stopPropagation(); const t = row.querySelector('.pf-subrow-title'); t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }); subDatesEl.appendChild(editBtn);
    const delBtn = document.createElement('button'); delBtn.className = 'pf-sub-del'; delBtn.title = 'Delete subtask'; delBtn.textContent = '×'; delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSubtask(p.id, s.id); }); subDatesEl.appendChild(delBtn);
    const _hasBlockers = getUnresolvedBlockers(p, s).length > 0;
    const dotEl = document.createElement('span'); dotEl.className = 'pf-sub-dot' + (_hasBlockers ? ' pf-blocked' : ''); dotEl.title = _hasBlockers ? 'Blocked' : 'Set status'; dotEl.style.background = s.status === 'planned' ? 'transparent' : statusDotColor(s.status); dotEl.style.borderColor = statusDotColor(s.status); subDatesEl.appendChild(dotEl);
    if (s.status === 'completed' && s.completedAt) { const doneLabel = document.createElement('span'); doneLabel.className = 'pf-completed-date'; doneLabel.style.cursor = 'pointer'; doneLabel.title = 'Click to change completed date'; doneLabel.textContent = formatDateShort(s.completedAt.slice(0, 10)); doneLabel.addEventListener('click', (e) => { e.stopPropagation(); const input = document.createElement('input'); input.type = 'date'; input.className = 'pf-due-input'; input.value = s.completedAt.slice(0, 10); doneLabel.replaceWith(input); input.focus(); input.addEventListener('change', () => { snapshot(); s.completedAt = input.value ? input.value + 'T00:00:00.000Z' : new Date().toISOString(); scheduleSave(); render(); }); input.addEventListener('blur', () => { render(); }); }); subDatesEl.appendChild(doneLabel); } else { subDatesEl.appendChild(buildDueChip(s, (val) => { snapshot(); s.dueAt = val; scheduleSave(); render(); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); }, false)); }
    subDatesEl.appendChild(buildDependencyChip(p, s));
    const commentBtn = document.createElement('button'); commentBtn.className = 'pf-sub-comment' + (s.comments && s.comments.length ? ' pf-comment-set' : ''); commentBtn.title = s.comments && s.comments.length ? s.comments.length + ' comment(s)' : 'Add comment'; commentBtn.innerHTML = pfIcon('message'); commentBtn.style.whiteSpace = 'nowrap'; commentBtn.addEventListener('click', (e) => { e.stopPropagation(); openCommentPanel(p, s); }); subDatesEl.appendChild(commentBtn);
    const promoteBtn = document.createElement('button'); promoteBtn.className = 'pf-sub-promote'; promoteBtn.title = 'Promote to Project'; promoteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; promoteBtn.addEventListener('click', (e) => { e.stopPropagation(); promoteSubToProject(p, s); }); subDatesEl.appendChild(promoteBtn);

    row.dataset.subId = s.id;
    if (root.classList.contains('pf-device-mobile')) {
      // Calendar and comment icons in main row (visible without swiping)
      const dueIcon = document.createElement('span');
      dueIcon.classList.add('pf-ext-due', 'pf-ext-inline'); // 3B-3: recipe in 14-utilities.css
      (function refreshDueIcon() {
        let color = 'var(--text-dim, #8b95a3)'; let title = 'No due date';
        if (s.status === 'completed') { color = 'var(--completed)'; title = s.dueAt ? 'Completed, was due: ' + formatDateShort(s.dueAt) : 'Completed'; }
        else if (s.dueAt && s.status !== 'completed') {
          const today = new Date(); today.setHours(0,0,0,0);
          const d = new Date(s.dueAt + 'T00:00:00');
          const diff = Math.round((d - today) / 86400000);
          if (diff < 0) { color = 'var(--danger, #ef4444)'; title = 'Overdue: ' + formatDateShort(s.dueAt); }
          else if (diff === 0) { color = 'var(--ongoing,#ffb454)'; title = 'Due today'; }
          else if (diff === 1) { color = 'var(--ongoing,#eab308)'; title = 'Due tomorrow'; }
          else if (diff <= 7) { color = 'var(--ongoing,#3b82f6)'; title = 'Due this week: ' + formatDateShort(s.dueAt); }
          else { color = 'var(--text-dim,#8b95a3)'; title = 'Due: ' + formatDateShort(s.dueAt); }
        } else if (s.dueAt && s.status === 'completed') { color = 'var(--completed,#22c55e)'; title = 'Completed, was due: ' + formatDateShort(s.dueAt); }
        const dateText = s.dueAt ? formatDateShort(s.dueAt) : '';
        dueIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span class="pf-ext-due-text" style="font-size: calc(var(--font-size-base) - 4.5px);color:' + color + ';white-space:nowrap;margin-left:3px;">' + (dateText || '+ Due') + '</span>';
        dueIcon.title = title;
      })();
      dueIcon.addEventListener('click', (e) => { e.stopPropagation(); const input = document.createElement('input'); input.type = 'date'; input.className = 'pf-due-input'; input.value = s.dueAt || ''; input.style.position = 'absolute'; input.style.opacity = '0'; input.style.pointerEvents = 'none'; dueIcon.appendChild(input); input.focus(); try { input.showPicker && input.showPicker(); } catch(err){} input.addEventListener('change', () => { snapshot(); s.dueAt = input.value || null; scheduleSave(); render(); if (p._manualStatus) { delete p._manualStatus; } checkAllCompleted(p); }); input.addEventListener('blur', () => { input.remove(); }); });
      subDatesEl.appendChild(dueIcon);
      const cm = document.createElement('span'); cm.innerHTML = pfIcon('message'); cm.className = 'pf-ext-inline pf-ext-comment'; cm.style.fontSize = 'var(--font-size-base)'; cm.style.justifyContent = 'center'; if (s.comments && s.comments.length) cm.classList.add('pf-comment-set'); cm.title = s.comments && s.comments.length ? s.comments.length + ' comment(s)' : 'Add comment'; cm.addEventListener('click', (e) => { e.stopPropagation(); openCommentPanel(p, s); }); subDatesEl.appendChild(cm);
      // Extend-meta with dependency only (revealed on swipe)
      const extMeta = document.createElement('span');
      extMeta.className = 'pf-sub-extend-meta';
      const depChip = buildDependencyChip(p, s);
      depChip.style.display = 'inline-flex'; depChip.classList.add('pf-ext-dep'); depChip.style.justifyContent = 'center';
      extMeta.appendChild(depChip);
      const recurChip = buildRecurChip(s, (val) => { snapshot(); s.recurrence = val || null; scheduleSave(); render(); });
      recurChip.classList.add('pf-ext-recur'); recurChip.style.display = 'inline-flex';
      extMeta.appendChild(recurChip);
      const extEditBtn = document.createElement('button'); extEditBtn.className = 'pf-ext-edit pf-ext-chip'; extEditBtn.textContent = '✏️'; extEditBtn.title = 'Edit title'; // chip recipe in 14-utilities.css
      extEditBtn.addEventListener('click', (e) => { e.stopPropagation(); const t = row.querySelector('.pf-subrow-title'); t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); });
      extMeta.appendChild(extEditBtn);
      // stroke=currentColor + .pf-ext-chip color:var(--text) — was #ffffff, invisible in Daylight
      const extPromoteBtn = document.createElement('button'); extPromoteBtn.className = 'pf-ext-promote pf-ext-chip'; extPromoteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; extPromoteBtn.title = 'Promote to Project';
      extPromoteBtn.addEventListener('click', (e) => { e.stopPropagation(); promoteSubToProject(p, s); });
      extMeta.appendChild(extPromoteBtn);
      row.appendChild(extMeta);
    }
    const ctxBtn = document.createElement('button'); ctxBtn.className = 'pf-sub-ctx-btn'; ctxBtn.title = 'More actions'; ctxBtn.textContent = '⋮'; row.appendChild(ctxBtn);

    row.__project = p; row.__subId = s.id;
    row.querySelector('.pf-sub-handle').addEventListener('pointerdown', () => { dragHandleArmed = true; });
    row.querySelector('.pf-subrow-title').addEventListener('pointerdown', (e) => { const t = row.querySelector('.pf-subrow-title'); if (t.contentEditable === 'true') { e.stopPropagation(); return; } dragHandleArmed = true; });
    row.draggable = true;
    row.addEventListener('dragstart', (e) => { if (!dragHandleArmed) { e.preventDefault(); return; } e.stopPropagation(); dragHandleArmed = false; draggingSubId = s.id; draggingProjectId = p.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', s.id); } catch (err) {} if (subMultiSelect.length && subMultiSelect.includes(s.id)) { _draggingSubIds = subMultiSelect.slice(); } else { _draggingSubIds = [s.id]; } requestAnimationFrame(() => row.classList.add('pf-sub-dragging')); });
    row.addEventListener('click', (e) => { if (!_pasteArmed || !_taskClipboard || !_taskClipboard.length) return; if (e.target.closest('.pf-sub-add') || e.target.closest('.pf-sub-del') || e.target.closest('.pf-sub-dates') || e.target.closest('.pf-sub-ctx-btn')) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); pasteClipboardUnder(p, s); }, true);
    row.addEventListener('dragend', () => { row.classList.remove('pf-sub-dragging'); draggingSubId = null; draggingProjectId = null; clearIndicators(); });
    row.addEventListener('dragover', (e) => { if (!draggingSubId || draggingProjectId !== p.id || draggingSubId === s.id) return; e.preventDefault(); e.stopPropagation(); const rect = row.getBoundingClientRect(); const ratio = (e.clientY - rect.top) / rect.height; const zone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'nest'; clearIndicators(); row.classList.add('pf-drop-' + zone); row.dataset.dropZone = zone; });
    row.addEventListener('dragleave', (e) => { if (e.target === row) row.classList.remove('pf-drop-before', 'pf-drop-after', 'pf-drop-nest'); });
    row.addEventListener('drop', (e) => { if (!draggingSubId || draggingProjectId !== p.id || draggingSubId === s.id) return; e.preventDefault(); e.stopPropagation(); performMove(p, s.id, row.dataset.dropZone || 'after'); });
    if (hasChildren) { row.querySelector('.pf-sub-chevron').addEventListener('click', (e) => { e.stopPropagation(); toggleSubExpand(p.id, s.id); }); row.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) return; if (e.target.closest('.pf-sub-handle') || e.target.closest('.pf-sub-chevron') || e.target.closest('.pf-sub-dot') || e.target.closest('.pf-subrow-title') || e.target.closest('.pf-sub-add') || e.target.closest('.pf-sub-del') || e.target.closest('.pf-sub-dates')) return; toggleSubExpand(p.id, s.id); }); }
    row.querySelector('.pf-sub-dot').addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const _pid = p.id, _sid = s.id; openStatusMenu(e.currentTarget, s.status, (st) => cycleSubStatus(_pid, _sid, st)); });
    row.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) { if (e.target.closest('.pf-sub-add') || e.target.closest('.pf-sub-del') || e.target.closest('.pf-sub-dates')) return; e.stopPropagation(); const idx = subMultiSelect.indexOf(s.id); if (idx > -1) { subMultiSelect.splice(idx, 1); row.classList.remove('pf-sub-selected'); } else { subMultiSelect.push(s.id); row.classList.add('pf-sub-selected'); } renderSubSelectBar(p); } });
    row.querySelector('.pf-sub-ctx-btn').addEventListener('click', (e) => { e.stopPropagation(); const rect = e.target.getBoundingClientRect(); _showSubCtxMenu(rect.left, rect.bottom, p, s); });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'touch' || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return; _showSubCtxMenu(e.clientX, e.clientY, p, s); });
    let _subTitleClickTimer = null; let _subTitleTapCount = 0; let _subTitleTapTimer = null;
    const t = row.querySelector('.pf-subrow-title');
    t.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey) return; e.stopPropagation(); if (t.contentEditable === 'true') return; if (e.detail >= 2) return; if (window._splitSelectSuppressed) { window._splitSelectSuppressed = false; return; } if (subMultiSelect.length > 0) { const idx = subMultiSelect.indexOf(s.id); if (idx > -1) { subMultiSelect.splice(idx, 1); row.classList.remove('pf-sub-selected'); } else { subMultiSelect.push(s.id); row.classList.add('pf-sub-selected'); } renderSubSelectBar(p); return; } clearTimeout(_subTitleClickTimer); _subTitleClickTimer = setTimeout(() => { if (hasChildren) toggleSubExpand(p.id, s.id); }, 200); });
    t.addEventListener('dblclick', (e) => { e.stopPropagation(); clearTimeout(_subTitleClickTimer); clearTimeout(_subTitleTapTimer); _subTitleTapCount = 0; t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); });
    t.addEventListener('touchend', (e) => { if (t.contentEditable === 'true') return; _subTitleTapCount++; if (_subTitleTapCount === 2) { clearTimeout(_subTitleTapTimer); _subTitleTapCount = 0; e.preventDefault(); clearTimeout(_subTitleClickTimer); t.contentEditable = 'true'; t.focus(); const range = document.createRange(); range.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } else { clearTimeout(_subTitleTapTimer); _subTitleTapTimer = setTimeout(() => { _subTitleTapCount = 0; }, 350); } });
    t.addEventListener('blur', () => { const val = t.textContent.trim() || 'Untitled'; t.contentEditable = 'false'; if (val !== s.title) { _lastProjectId = p.id; snapshot(); s.title = val; scheduleSave(); } }); t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.textContent = s.title; t.blur(); } }); return row;
  }

  let dragProjectId = null; let dragHandleArmedProject = false;
  function clearProjectIndicators() { canvas.querySelectorAll('.pf-node-drop-before, .pf-node-drop-after').forEach(el => el.classList.remove('pf-node-drop-before', 'pf-node-drop-after')); }

  function makeDraggable(el, p) {
    el.draggable = true;
    const handle = el.querySelector('.pf-drag-handle');
    handle.addEventListener('pointerdown', () => { dragHandleArmedProject = true; });
    el.addEventListener('dragstart', (e) => { if (!dragHandleArmedProject) { e.preventDefault(); return; } dragHandleArmedProject = false; dragProjectId = p.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch (err) {} requestAnimationFrame(() => { el.classList.add('pf-dragging'); canvas.querySelectorAll('.pf-node').forEach(n => { if (n.dataset.id !== p.id) n.classList.add('pf-drop-target'); }); }); });
    el.addEventListener('dragend', () => { el.classList.remove('pf-dragging'); dragProjectId = null; clearProjectIndicators(); canvas.querySelectorAll('.pf-drop-target').forEach(n => n.classList.remove('pf-drop-target')); });
    el.addEventListener('dragover', (e) => { if (!dragProjectId || dragProjectId === p.id) return; e.preventDefault(); e.stopPropagation(); clearProjectIndicators(); const idx = projects.findIndex(pr => pr.id === p.id); const isFirst = idx === 0 || projects.findIndex(pr => pr.id === dragProjectId) === idx - 1 && idx === 1; const rect = el.getBoundingClientRect(); const zone = (idx === 0 && (e.clientX - rect.left) / rect.width < 0.3) ? 'before' : 'after'; el.classList.add('pf-node-drop-' + zone); el.dataset.dropZone = zone; });
    el.addEventListener('dragleave', () => { el.classList.remove('pf-node-drop-before', 'pf-node-drop-after'); });
    el.addEventListener('drop', (e) => { if (!dragProjectId || dragProjectId === p.id) return; e.preventDefault(); e.stopPropagation(); const zone = el.dataset.dropZone || 'after'; snapshot(); const src = projects.find(pr => pr.id === dragProjectId); if (src && src.category !== p.category) { src.category = p.category; } const srcIdx = projects.findIndex(pr => pr.id === dragProjectId); projects.splice(srcIdx, 1); const destIdx = projects.findIndex(pr => pr.id === p.id); projects.splice(zone === 'before' ? destIdx : destIdx + 1, 0, src); dragProjectId = null; clearProjectIndicators(); scheduleSave(); autoArrangeProjects(true); });

  }
  let autoScrollInterval = null;
  canvasWrap.addEventListener('dragover', (e) => {
    const rect = canvasWrap.getBoundingClientRect();
    const edge = 40, speed = 12;
    let dx = 0, dy = 0;
    if (e.clientX - rect.left < edge) dx = -speed;
    else if (rect.right - e.clientX < edge) dx = speed;
    if (e.clientY - rect.top < edge) dy = -speed;
    else if (rect.bottom - e.clientY < edge) dy = speed;
    if (dx || dy) {
      if (!autoScrollInterval) autoScrollInterval = setInterval(() => { canvasWrap.scrollLeft += dx; canvasWrap.scrollTop += dy; }, 16);
    } else { clearInterval(autoScrollInterval); autoScrollInterval = null; }
  });
  canvasWrap.addEventListener('dragleave', () => { clearInterval(autoScrollInterval); autoScrollInterval = null; });
  canvasWrap.addEventListener('drop', () => { clearInterval(autoScrollInterval); autoScrollInterval = null; });
  document.addEventListener('dragend', () => { clearInterval(autoScrollInterval); autoScrollInterval = null; });

  function makeResizable(el, p) { const MIN_W = 190, MIN_H = 140; const grip = el.querySelector('.pf-node-resize'); let resizing = false, moved = false, startX, startY, startW, startH; grip.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); resizing = true; moved = false; startX = e.clientX; startY = e.clientY; const z = typeof zoomLevel !== 'undefined' ? zoomLevel : 1; startW = el.offsetWidth; startH = el.offsetHeight; grip.setPointerCapture(e.pointerId); }); grip.addEventListener('pointermove', (e) => { if (!resizing) return; const z = typeof zoomLevel !== 'undefined' ? zoomLevel : 1; const dx = (e.clientX - startX) / z, dy = (e.clientY - startY) / z; if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) { moved = true; snapshot(); el.style.maxWidth = 'none'; } if (!moved) return; const newW = Math.max(MIN_W, startW + dx); const newH = Math.max(MIN_H, startH + dy); p.width = newW; el.style.width = newW + 'px'; if (p.expanded) { p.height = newH; el.style.height = newH + 'px'; el.style.display = 'flex'; el.style.flexDirection = 'column'; const sl = el.querySelector('.pf-sublist'); if (sl) { sl.style.flex = '1 1 auto'; sl.style.overflowY = 'auto'; sl.style.minHeight = '0'; } } }); function end() { if (!resizing) return; resizing = false; if (moved) { scheduleSave(); autoArrangeProjects(true); } } grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end); grip.addEventListener('dblclick', (e) => { e.stopPropagation(); snapshot(); p.height = null; p.width = null; scheduleSave(); autoArrangeProjects(true); }); }
