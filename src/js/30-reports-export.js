  // ============================================================
  // SUBSECTION: Reports & Export
  function collectReportRows() {
    const rows = [];
    function walkSubs(list, projectTitle, depth) {
      list.forEach(s => {
        rows.push({ project: projectTitle, task: s.title, status: STATUS_LABEL[s.status], due: s.dueAt || '', completed: s.completedAt ? formatDateShort(s.completedAt.slice(0, 10)) : '', depth: depth, comments: (s.comments ? s.comments.length : 0) });
        if (s.subtasks && s.subtasks.length) walkSubs(s.subtasks, projectTitle, depth + 1);
      });
    }
    projects.forEach(p => {
      rows.push({ project: p.title, task: '', status: STATUS_LABEL[p.status], due: p.dueAt || '', completed: p.completedAt ? formatDateShort(p.completedAt.slice(0, 10)) : '', depth: 0, comments: 0, category: p.category || '' });
      walkSubs(p.subtasks, p.title, 1);
    });
    return rows;
  }
  document.getElementById('pf-export-csv').addEventListener('click', () => {
    _exitMultiSelectMode();
    const rows = collectReportRows();
    const header = 'Project,Task,Status,Due Date,Completed,Category,Comments\n';
    const csv = header + rows.map(r => [r.project, r.task, r.status, r.due, r.completed, r.category || '', r.comments].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'project-flow-report.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('CSV exported.');
  });
  document.getElementById('pf-export-pdf').addEventListener('click', () => {
    _exitMultiSelectMode();
    const rows = collectReportRows();
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Organeas Report</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}h1{font-size:18px;margin-bottom:10px;}table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}th{background:#f5f5f5;font-weight:600;}tr:nth-child(even){background:#fafafa;}.project-row{background:#eef;font-weight:600;}</style></head><body><h1>Project Flow Report</h1><p>Generated: ' + new Date().toLocaleString() + '</p><table><thead><tr><th>Project</th><th>Task</th><th>Status</th><th>Due Date</th><th>Completed</th><th>Comments</th></tr></thead><tbody>' + rows.map(r => '<tr class="' + (r.task === '' ? 'project-row' : '') + '"><td>' + escapeHtml(r.project) + '</td><td>' + '&nbsp;'.repeat(r.depth * 4) + escapeHtml(r.task) + '</td><td>' + escapeHtml(r.status) + '</td><td>' + escapeHtml(r.due) + '</td><td>' + escapeHtml(r.completed) + '</td><td>' + r.comments + '</td></tr>').join('') + '</tbody></table></body></html>';
    const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); setTimeout(() => { if (w) w.print(); URL.revokeObjectURL(url); }, 500);
  });
  let zoomLevel = 1;
  const zoomLevelEl = document.getElementById('pf-zoom-level');
  function applyZoom() { canvas.style.transform = 'scale(' + zoomLevel + ')'; canvas.style.width = '2200px'; canvas.style.height = '1600px'; zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%'; autoArrangeProjects(true); }
  document.getElementById('pf-zoom-in').addEventListener('click', () => { zoomLevel = Math.min(2, zoomLevel + 0.1); applyZoom(); });
  document.getElementById('pf-zoom-out').addEventListener('click', () => { zoomLevel = Math.max(0.4, zoomLevel - 0.1); applyZoom(); });
  document.getElementById('pf-zoom-reset').addEventListener('click', () => { zoomLevel = 1; applyZoom(); });
  canvasWrap.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomLevel = Math.min(2, Math.max(0.4, zoomLevel + (e.deltaY < 0 ? 0.05 : -0.05))); applyZoom(); } }, { passive: false });


  const fontSizeInput = document.getElementById('pf-font-size');
  const fontSizeVal = document.getElementById('pf-font-size-val');
  // Device-specific keys: desktop and mobile (and tablet) each remember their own value.
