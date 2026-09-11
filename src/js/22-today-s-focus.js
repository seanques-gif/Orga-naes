    // SUBSECTION: Today's Focus
  function autoPopulateToday() {
    const now = todayLocalStr();
    projects.forEach(p => {
      if (p.dueAt === now && p.status !== 'completed' && !todayTasks.find(t => t.sourceId === p.id)) {
        todayTasks.push({ id: uid(), title: p.title, sourceId: p.id, sourceType: 'project', done: false });
      }
      if (p.subtasks && p.subtasks.length) {
        (function walkSubs(subs) {
          subs.forEach(s => {
            if (s.dueAt === now && s.status !== 'completed' && !todayTasks.find(t => t.sourceId === s.id)) {
              todayTasks.push({ id: uid(), title: s.title, sourceId: s.id, sourceType: 'subtask', done: false });
            }
            if (s.subtasks && s.subtasks.length) walkSubs(s.subtasks);
          });
        })(p.subtasks);
      }
    });
    saveToday();
  }
  async function loadToday() {
    try {
      const res = await safeGet(TODAY_KEY, false);
      if (res && res.value) {
        const data = JSON.parse(res.value);
        const now = todayLocalStr();
        if (data.date === now) { todayTasks = data.tasks || []; todayDate = data.date; }
        else { todayTasks = []; todayDate = now; }
      } else { todayDate = todayLocalStr(); }
    } catch (e) { todayTasks = []; todayDate = todayLocalStr(); logError('Load today', e); }
    autoPopulateToday();
  }
  function saveToday() { safeSet(TODAY_KEY, JSON.stringify({ date: todayDate, tasks: todayTasks }), false); }
  function addToToday(title, sourceId, sourceType) {
    if (todayTasks.find(t => t.sourceId === sourceId)) { showToast('Already in Today'); return; }
    todayTasks.push({ id: uid(), title: title, sourceId: sourceId, sourceType: sourceType, done: false });
    saveToday(); showToast('Added to Today\'s Focus');
  }
  function toggleTodayDone(id) {
    const t = todayTasks.find(t => t.id === id); if (t) t.done = !t.done;
    saveToday(); renderTodayList();
  }
  function removeTodayTask(id) { todayTasks = todayTasks.filter(t => t.id !== id); saveToday(); renderTodayList(); }
  function clearToday() { todayTasks = []; saveToday(); renderTodayList(); }
  function carryOverToday() {
    todayTasks = todayTasks.filter(t => !t.done);
    todayDate = todayLocalStr();
    saveToday(); renderTodayList(); showToast('Incomplete tasks carried over');
  }
  function renderTodayList() {
    const list = document.getElementById('pf-today-list');
    document.getElementById('pf-today-date').textContent = todayDate;
    if (!todayTasks.length) { list.innerHTML = '<div class="pf-activity-empty">No tasks for today. Add from project context menu or ⭐ button.</div>'; return; }
    const sorted = todayTasks.filter(t => !t.done).concat(todayTasks.filter(t => t.done));
    list.innerHTML = sorted.map((t, i) => {
      return '<div class="pf-activity-item pf-today-item" draggable="true" data-today-id="' + t.id + '" style="display:flex;align-items:center;gap:8px;' + (t.done ? 'opacity:0.5;' : '') + '">' +
        '<span style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);min-width:16px;flex-shrink:0;">#' + (i + 1) + '</span>' +
        '<button class="pf-undo-btn" style="font-size: calc(var(--font-size-base) - 2px);padding:0 4px;" data-today-toggle="' + t.id + '">' + (t.done ? '✓' : '○') + '</button>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:normal;word-break:break-word;' + (t.done ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(t.title) + '</span>' +
        '<button class="pf-undo-btn" style="font-size: calc(var(--font-size-base) - 4px);padding:0 4px;color:var(--text-dim);" data-today-del="' + t.id + '">×</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-today-toggle]').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); toggleTodayDone(btn.dataset.todayToggle); }); });
    list.querySelectorAll('[data-today-del]').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); removeTodayTask(btn.dataset.todayDel); }); });
    list.querySelectorAll('.pf-today-item').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const t = todayTasks.find(tk => tk.id === item.dataset.todayId);
        if (!t || !t.sourceId) return;
        let projectId = null;
        if (t.sourceType === 'project') { projectId = t.sourceId; }
        else { projects.forEach(p => { if (findSubNode(p.subtasks, t.sourceId)) projectId = p.id; }); }
        if (!projectId) return;
        closeAllModals();
        _todayReturnOnEsc = true;
        if (!root.classList.contains('pf-device-mobile') && !root.classList.contains('pf-device-tablet')) showToast('Press Esc to go back to Today\'s Focus');
        if (!listViewActive) { document.getElementById('pf-collapse-cats').click(); }
        splitSelectedId = projectId; splitMultiSelect = [];
        searchTerm = t.title;
        _searchAutoCollapseId = null;
        renderSplitList(); renderSplitDetail();
        root.classList.add('pf-detail-open'); _markOverlayOpen('detail');
        if (root.classList.contains('pf-device-mobile') || root.classList.contains('pf-device-tablet')) { root.classList.add('pf-mobile-detail-open'); if (root.classList.contains('pf-device-mobile')) document.getElementById('pf-toolbar-back').style.display = ''; }
        searchTerm = '';
        const el = splitList.querySelector('.pf-split-active'); if (el) el.scrollIntoView({ block: 'nearest' });
      });
      item.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.dataset.todayId); item.style.opacity = '0.4'; });
      item.addEventListener('dragend', () => { item.style.opacity = ''; });
      item.addEventListener('dragover', (e) => { e.preventDefault(); item.style.borderTop = '2px solid var(--accent)'; });
      item.addEventListener('dragleave', () => { item.style.borderTop = ''; });
      item.addEventListener('drop', (e) => { e.preventDefault(); item.style.borderTop = ''; const srcId = e.dataTransfer.getData('text/plain'); if (srcId === item.dataset.todayId) return; const srcIdx = todayTasks.findIndex(t => t.id === srcId); const destIdx = todayTasks.findIndex(t => t.id === item.dataset.todayId); const src = todayTasks.splice(srcIdx, 1)[0]; todayTasks.splice(destIdx, 0, src); saveToday(); renderTodayList(); });
    });
  }
  document.getElementById('pf-today-btn').addEventListener('click', () => { closeAllModals(); renderTodayList(); openModal(todayPanel, 'flex'); });

  let _duelistReturnOnEsc = false;
  let _todayReturnOnEsc = false;
  let _calendarReturnOnEsc = false;
  let _weeklyReturnOnEsc = false;
