    // SUBSECTION: Calendar View
  function renderCalendar() {
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const grid = document.getElementById('pf-cal-grid');
    const monthLabel = document.getElementById('pf-cal-month');
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    monthLabel.textContent = monthNames[calMonth] + ' ' + calYear;
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr = todayLocalStr();
    const dueMap = collectDueMap();
    let html = DAYS.map(d => '<div style="text-align:center;font-size: calc(var(--font-size-base) - 4px);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);padding:8px 0;border-bottom:1px solid var(--sub-border);">' + d + '</div>').join('');
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === calSelectedDate;
      const items = dueMap[dateStr] || [];
      const hasItems = items.length > 0;
      const dayClass = 'pf-cal-day' + (isToday ? ' pf-cal-day-today' : '') + (isSelected ? ' pf-cal-day-selected' : '');
      html += '<div class="' + dayClass + '" data-cal-date="' + dateStr + '">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;"><span class="pf-cal-day-num">' + d + '</span></div>';
      if (hasItems) {
        html += '<div class="pf-cal-day-dots">';
        items.forEach(item => {
          const col = item.status === 'completed' ? 'var(--completed)' : item.status === 'ongoing' ? 'var(--ongoing)' : item.status === 'waiting' ? 'var(--waiting)' : 'var(--planned)';
          html += '<span class="pf-cal-day-dot" style="background:' + col + '"></span>';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.pf-cal-day').forEach(el => {
      el.addEventListener('click', () => { calSelectedDate = el.dataset.calDate; renderCalendar(); renderCalDetail(); });
    });
    if (calSelectedDate) renderCalDetail();
  }
  function renderCalDetail() {
    const titleEl = document.getElementById('pf-cal-detail-title');
    const listEl = document.getElementById('pf-cal-detail-list');
    if (!calSelectedDate) { titleEl.textContent = 'Select a date'; listEl.innerHTML = '<div class="pf-activity-empty">Click a date to see tasks.</div>'; return; }
    const dueMap = collectDueMap();
    const items = (dueMap[calSelectedDate] || []).slice().sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '') || a.title.localeCompare(b.title));
    const d = new Date(calSelectedDate + 'T00:00:00');
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    titleEl.textContent = dayNames[d.getDay()] + ', ' + calSelectedDate;
    if (!items.length) { listEl.innerHTML = '<div class="pf-activity-empty">No tasks due on this date.</div>'; return; }
    listEl.innerHTML = items.map((item, i) => {
      const col = item.status === 'completed' ? 'var(--completed)' : item.status === 'ongoing' ? 'var(--ongoing)' : 'var(--planned)';
      const statusLabel = STATUS_LABEL[item.status] || 'Planned';
      return '<div class="pf-activity-item pf-cal-task-item" data-cal-project="' + (item.projectId || '') + '">' +
        '<span class="pf-cal-task-dot" style="background:' + col + '"></span>' +
        '<span class="pf-cal-task-title">' + escapeHtml(item.title) + '</span>' +
        '</div>';
    }).join('');
    listEl.querySelectorAll('.pf-cal-task-item').forEach(el => {
      el.addEventListener('click', () => {
        const projectId = el.dataset.calProject;
        if (!projectId) return;
        const p = projects.find(pr => pr.id === projectId);
        if (!p) return;
        const taskTitle = el.querySelector('.pf-cal-task-title').textContent.trim();
        closeAllModals();
        _calendarReturnOnEsc = true;
        if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Calendar');
        if (!listViewActive) { document.getElementById('pf-collapse-cats').click(); }
        splitSelectedId = projectId; splitMultiSelect = [];
        searchTerm = taskTitle;
        _searchAutoCollapseId = null;
        renderSplitList(); renderSplitDetail();
        root.classList.add('pf-detail-open'); _markOverlayOpen('detail');
        if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
        searchTerm = '';
        const active = splitList.querySelector('.pf-split-active'); if (active) active.scrollIntoView({ block: 'nearest' });
      });
    });
  }
  document.getElementById('pf-calendar-btn').addEventListener('click', () => { closeAllModals(); renderCalendar(); openModal(calendarPanel, 'flex'); });
  document.getElementById('pf-cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  document.getElementById('pf-cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  document.getElementById('pf-cal-today-btn').addEventListener('click', () => { calMonth = new Date().getMonth(); calYear = new Date().getFullYear(); renderCalendar(); });
  document.getElementById('pf-today-clear-btn').addEventListener('click', () => { if (!todayTasks.length) return; clearToday(); });
  document.getElementById('pf-today-carry-btn').addEventListener('click', carryOverToday);
  document.getElementById('pf-today-due-btn').addEventListener('click', function() {
    const d = new Date(); const now = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    let added = 0;
    projects.forEach(p => {
      if (p.dueAt === now && p.status !== 'completed' && !todayTasks.find(t => t.sourceId === p.id)) {
        todayTasks.push({ id: uid(), title: p.title, sourceId: p.id, sourceType: 'project', done: false });
        added++;
      }
      (function walk(subs) {
        subs.forEach(s => {
          if (s.dueAt === now && s.status !== 'completed' && !todayTasks.find(t => t.sourceId === s.id)) {
            todayTasks.push({ id: uid(), title: s.title, sourceId: s.id, sourceType: 'subtask', done: false });
            added++;
          }
          if (s.subtasks && s.subtasks.length) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });
    if (!added) { showToast('No tasks due today'); return; }
    saveToday(); renderTodayList(); showToast(added + ' task' + (added > 1 ? 's' : '') + ' due today added');
  });
  document.getElementById('pf-today-overdue-btn').addEventListener('click', function() {
    const today = new Date(); today.setHours(0,0,0,0);
    let added = 0;
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') {
        const d = new Date(p.dueAt + 'T00:00:00');
        if (d < today && !todayTasks.find(t => t.sourceId === p.id)) {
          todayTasks.push({ id: uid(), title: p.title, sourceId: p.id, sourceType: 'project', done: false });
          added++;
        }
      }
      (function walk(subs) {
        subs.forEach(s => {
          if (s.dueAt && s.status !== 'completed') {
            const d = new Date(s.dueAt + 'T00:00:00');
            if (d < today && !todayTasks.find(t => t.sourceId === s.id)) {
              todayTasks.push({ id: uid(), title: s.title, sourceId: s.id, sourceType: 'subtask', done: false });
              added++;
            }
          }
          if (s.subtasks && s.subtasks.length) walk(s.subtasks);
        });
      })(p.subtasks || []);
    });
    if (!added) { showToast('No overdue tasks to add'); return; }
    saveToday(); renderTodayList(); showToast(added + ' overdue task' + (added > 1 ? 's' : '') + ' added');
  });
  loadToday();

  const WEEKLY_KEY = 'project-flow-weekly';
  let weeklyData = {};
  let weekOffset = 0;
