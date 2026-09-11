    // SUBSECTION: Multi-Select & Bulk Actions
  function clearSubSelect() { subMultiSelect = []; root.querySelectorAll('.pf-sub-selected').forEach(el => el.classList.remove('pf-sub-selected')); }
  function subSelectOwnerProject(id) { return projects.find(pr => pr.subtasks && findSubNode(pr.subtasks, id)); }
  function subSelectProjectIds() { const ids = new Set(); subMultiSelect.forEach(id => { const pr = subSelectOwnerProject(id); if (pr) ids.add(pr.id); }); return ids; }
  function renderSubSelectBar(p) {
    // Remove any existing bar(s) defensively — guards against duplicates if
    // this fires twice before a prior removal has committed to the DOM.
    root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove());
    if (subMultiSelect.length < 1) return;
    const sublist = root.querySelector('.pf-node[data-id="' + p.id + '"] .pf-sublist');
    if (!sublist) return;
    const projectIds = subSelectProjectIds();
    const spansMultiple = projectIds.size > 1;
    const bar = document.createElement('div');
    bar.className = 'pf-sub-select-bar';
    // All bar styling lives in the `.pf-sub-select-bar` recipe
    // (09-components-selection-panels.css) — token-driven so it themes
    // correctly on every preset, including Daylight. The bar is fixed to the
    // viewport (not sticky within the sublist) so it stays visible no matter
    // which ancestor is actually scrolling (list/detail/canvas all have
    // different scroll containers depending on layout mode).
    bar.innerHTML = '<span style="font-size: calc(var(--font-size-base) - 3px);color:var(--text-dim);white-space:nowrap;padding:0 4px 0 2px;flex-shrink:0;">' + subMultiSelect.length + ' selected' + (spansMultiple ? ' (' + projectIds.size + ')' : '') + '</span>' +
      '<span style="width:1px;align-self:stretch;background:var(--card-border);flex-shrink:0;"></span>' +
      '<button class="pf-selbar-btn" data-sub-action="cycle">Status</button>' +
      '<button class="pf-selbar-btn" data-sub-action="due">Due</button>' +
      '<button class="pf-selbar-btn" data-sub-action="copy"' + (spansMultiple ? ' title="Copy to… only works from a single project — narrow your selection to one project"' : '') + '>Copy to…</button>' +
      '<button class="pf-selbar-btn" data-sub-action="copy-clip" title="Ctrl+C">Copy</button>' +
      '<button class="pf-selbar-btn" data-sub-action="delete" style="color:var(--danger);">Delete</button>' +
      '<button class="pf-selbar-btn pf-selbar-close" data-sub-action="clear" title="Clear selection">✕</button>';
    // Single delegated listener instead of one per button — also means the
    // old bar's listeners don't need explicit teardown since the whole node
    // (and this one listener) is discarded together on removal.
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sub-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.subAction;
      if (action === 'copy') {
        if (spansMultiple) { showToast('⚠ "Copy to…" needs a single-project selection — narrow your selection first', true); return; }
        openCopyToProjectModal(p, subMultiSelect.slice());
      } else if (action === 'copy-clip') {
        const clip = buildClipboardFromSelection();
        if (!clip || !clip.length) return;
        _taskClipboard = clip;
        showToast((clip.length > 1 ? clip.length + ' tasks' : 'Task') + ' copied — click a project to paste as main task(s), or a task to nest under it');
      } else if (action === 'cycle') {
        openStatusMenu(btn, null, (st) => {
          try {
            snapshot();
            const touched = new Set();
            subMultiSelect.forEach(id => { const owner = subSelectOwnerProject(id); if (!owner) return; const s = findSubNode(owner.subtasks, id); if (s) { s.status = st; s.completedAt = st === 'completed' ? new Date().toISOString() : null; touched.add(owner); } });
            scheduleSave(); render(); touched.forEach(pr => checkAllCompleted(pr));
            requestAnimationFrame(() => renderSubSelectBar(p));
          } catch (err) { logError('Bulk set status', err); showToast('⚠ Set status failed — see console', true); }
        });
      } else if (action === 'due') {
        const input = document.createElement('input');
        input.type = 'date';
        // Positioned as an overlay centered on the bar itself (its fixed
        // ancestor), rather than left to default static flow.
        input.style.cssText = 'position:fixed;left:50%;bottom:calc(var(--selbar-bottom-offset, 78px) + env(safe-area-inset-bottom, 0px) + 48px);transform:translateX(-50%);z-index:9300;';
        root.appendChild(input);
        input.focus();
        try { input.showPicker && input.showPicker(); } catch (err) {}
        function commit() {
          const val = input.value || null;
          snapshot();
          const touched = new Set();
          subMultiSelect.forEach(id => { const owner = subSelectOwnerProject(id); if (!owner) return; const s = findSubNode(owner.subtasks, id); if (s) { s.dueAt = val; touched.add(owner); } });
          clearSubSelect(); scheduleSave(); render();
          touched.forEach(pr => { if (pr._manualStatus) { delete pr._manualStatus; } checkAllCompleted(pr); });
        }
        input.addEventListener('change', commit);
        input.addEventListener('blur', () => { input.remove(); });
      } else if (action === 'delete') {
        if (!confirm('Delete ' + subMultiSelect.length + ' subtask(s)?')) return;
        snapshot();
        subMultiSelect.forEach(id => { const owner = subSelectOwnerProject(id); if (!owner) return; const arr = findSubParentArray(owner.subtasks, id); if (arr) { const idx = arr.findIndex(s => s.id === id); if (idx > -1) arr.splice(idx, 1); } });
        clearSubSelect(); scheduleSave(); render();
      } else if (action === 'clear') {
        clearSubSelect();
        root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove());
      }
    });
    // Append to root (not into the scrolling sublist) so position:fixed is
    // relative to the viewport and the bar can't be scrolled out of view.
    root.appendChild(bar);
    // Basic focus management: move focus to the first action so keyboard/
    // screen-reader users landing here aren't stranded with no indication
    // the bar exists.
    // Don't steal focus on every render (that would yank focus away on
    // every tap while selecting) — just ensure the toolbar and its buttons
    // are reachable via keyboard nav (Tab) once the user is done selecting.
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', subMultiSelect.length + ' items selected');
  }
  let draggingSubId = null; let draggingProjectId = null; let dragHandleArmed = false; let _draggingSubIds = [];
