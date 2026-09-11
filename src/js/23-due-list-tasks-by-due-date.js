    // SUBSECTION: Due List (Tasks by Due Date)
  function renderDueList() {
    const list = document.getElementById('pf-duelist-list');
    const items = [];
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') items.push({ title: p.title, dueAt: p.dueAt, project: null, status: p.status, projectId: p.id, subTitle: null });
      (function walk(subs, projTitle, projId) {
        subs.forEach(s => {
          if (s.dueAt && s.status !== 'completed') items.push({ title: s.title, dueAt: s.dueAt, project: projTitle, status: s.status, projectId: projId, subTitle: s.title });
          if (s.subtasks && s.subtasks.length) walk(s.subtasks, projTitle, projId);
        });
      })(p.subtasks || [], p.title, p.id);
    });
    items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    if (!items.length) { list.innerHTML = '<div class="pf-activity-empty">No tasks with due dates.</div>'; return; }
    const today = new Date(); today.setHours(0,0,0,0);
    list.innerHTML = '';
    items.forEach(it => {
      const d = new Date(it.dueAt + 'T00:00:00');
      const isOverdue = d < today;
      const isToday = d.getTime() === today.getTime();
      const cls = isOverdue ? 'color:var(--danger);font-weight:600;' : isToday ? 'color:var(--accent);font-weight:600;' : '';
      const path = it.project ? ' <span style="color:var(--text-dim);font-size: calc(var(--font-size-base) - 4px);">— ' + escapeHtml(it.project) + '</span>' : '';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;border:1px solid var(--card-border);margin-bottom:4px;background:var(--card);cursor:pointer;transition:border-color 0.15s,transform 0.1s;';
      row.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--' + it.status + ');flex-shrink:0;"></span>' +
        '<span style="flex:1;font-size: calc(var(--font-size-base) - 2px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(it.title) + path + '</span>' +
        '<span style="font-size: calc(var(--font-size-base) - 3px);flex-shrink:0;' + cls + '">' + it.dueAt + '</span>';
      row.addEventListener('mouseenter', () => { row.style.borderColor = 'var(--accent)'; row.style.transform = 'translateX(2px)'; });
      row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--card-border)'; row.style.transform = ''; });
      row.addEventListener('click', () => {
        closeAllModals();
        _duelistReturnOnEsc = true;
        if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Tasks by Due Date');
        if (listViewActive) {
          splitSelectedId = it.projectId;
          splitMultiSelect = [];
          searchTerm = it.subTitle || it.title;
          _searchAutoCollapseId = null;
          renderSplitList(); renderSplitDetail();
          root.classList.add('pf-detail-open'); _markOverlayOpen('detail');
          if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
          searchTerm = '';
        } else {
          autoArrangeProjects(true);
        }
      });
      list.appendChild(row);
    });
  }
  document.getElementById('pf-duelist-btn').addEventListener('click', () => { closeAllModals(); renderDueList(); openModal(duelistPanel, 'flex'); });

  let calMonth = new Date().getMonth(), calYear = new Date().getFullYear();
  function collectDueMap() {
    const map = {};
    projects.forEach(p => {
      if (p.dueAt) { if (!map[p.dueAt]) map[p.dueAt] = []; map[p.dueAt].push({ title: p.title, status: p.status, color: p.color, projectId: p.id, dueAt: p.dueAt }); }
      (function walk(subs) {
        subs.forEach(s => {
          if (s.dueAt) { if (!map[s.dueAt]) map[s.dueAt] = []; map[s.dueAt].push({ title: s.title, status: s.status, projectId: p.id, dueAt: s.dueAt }); }
          if (s.subtasks && s.subtasks.length) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });
    return map;
  }
  let calSelectedDate = null;
