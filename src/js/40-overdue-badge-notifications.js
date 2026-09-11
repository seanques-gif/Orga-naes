  // SUBSECTION: Overdue Badge & Notifications
  function updateOverdueBadge() {
    const badge = document.getElementById('pf-bottom-badge');
    const desktopBadge = document.getElementById('pf-desktop-badge');
    const today = new Date(); today.setHours(0,0,0,0);
    let count = 0;
    projects.forEach(p => {
      if (p.dueAt && p.status !== 'completed') { const d = new Date(p.dueAt + 'T00:00:00'); if (d < today) count++; }
      (function walk(list) { list.forEach(s => { if (s.dueAt && s.status !== 'completed') { const d = new Date(s.dueAt + 'T00:00:00'); if (d < today) count++; } if (s.subtasks && s.subtasks.length) walk(s.subtasks); }); })(p.subtasks || []);
    });
    const label = count > 99 ? '99+' : count;
    if (badge) { if (count > 0) { badge.textContent = label; badge.style.display = 'flex'; } else { badge.style.display = 'none'; } }
    if (desktopBadge) { if (count > 0) { desktopBadge.textContent = label; desktopBadge.style.display = 'flex'; } else { desktopBadge.style.display = 'none'; } }
  }
  const _origRender = render;
  let _renderRafId = null;
  render = function() { if (_renderRafId) return; _renderRafId = requestAnimationFrame(() => { _renderRafId = null; _origRender(); (window.requestIdleCallback || setTimeout)(function() { updateOverdueBadge(); saveToday(); }, {timeout: 200}); }); };
  updateOverdueBadge();

  // Floating action button (expandable)
  (function() {
    const fab = document.getElementById('pf-fab');
    const fabMenu = document.getElementById('pf-fab-menu');
    const fabOverlay = document.getElementById('pf-fab-overlay');
    if (!fab || !fabMenu) return;
    let fabOpen = false;
    let _fabHideTimer = null;
