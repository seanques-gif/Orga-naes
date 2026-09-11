    // SUBSECTION: Search
  function invalidateSearchCache() { _searchCache = {}; _searchCacheKey = ''; }
  function matchesSearch(p) {
    const cacheKey = searchTerm + '|' + statusFilter + '|' + dueFilter;
    if (cacheKey !== _searchCacheKey) { _searchCache = {}; _searchCacheKey = cacheKey; }
    if (_searchCache.hasOwnProperty(p.id)) return _searchCache[p.id];
    const result = _matchesSearchInner(p);
    _searchCache[p.id] = result;
    return result;
  }
  function _matchesSearchInner(p) {
    if (!matchesDueFilter(p)) return false;
    if (statusFilter) {
      const hasStatus = p.status === statusFilter || (function walk(list) { for (const s of list) { if (s.status === statusFilter) return true; if (s.subtasks && s.subtasks.length && walk(s.subtasks)) return true; } return false; })(p.subtasks);
      if (!hasStatus) return false;
    }
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    if (p.title.toLowerCase().includes(q)) return true;
    if (p.description && p.description.toLowerCase().includes(q)) return true;
    if (p.category && p.category.toLowerCase().includes(q)) return true;
    if (p.status.toLowerCase().includes(q)) return true;
    function walkSubs(list) { for (const s of list) { if (s.title.toLowerCase().includes(q)) return true; if (s.description && s.description.toLowerCase().includes(q)) return true; if (s.comments && s.comments.length && s.comments.some(c => (c.text || c).toLowerCase().includes(q))) return true; if (s.subtasks && s.subtasks.length && walkSubs(s.subtasks)) return true; } return false; }
    if (walkSubs(p.subtasks)) return true;
    return false;
  }
  function renderOverdueBanner() {
    const banner = document.getElementById('pf-overdue-banner');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueItems = [];
    function walk(list, projectTitle) { list.forEach(s => { if (s.dueAt && s.status !== 'completed') { const d = new Date(s.dueAt + 'T00:00:00'); if (d < today) overdueItems.push({ title: s.title, project: projectTitle }); } if (s.subtasks && s.subtasks.length) walk(s.subtasks, projectTitle); }); }
    projects.forEach(p => { if (p.dueAt && p.status !== 'completed') { const d = new Date(p.dueAt + 'T00:00:00'); if (d < today) overdueItems.push({ title: p.title, project: null }); } walk(p.subtasks, p.title); });
    if (!overdueItems.length) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
    banner.innerHTML = '<span class="pf-overdue-banner-icon">⚠️</span><span class="pf-overdue-banner-text">' + overdueItems.length + ' overdue item' + (overdueItems.length > 1 ? 's' : '') + ': ' + overdueItems.slice(0, 3).map(i => '<b>' + escapeHtml(i.title) + '</b>').join(', ') + (overdueItems.length > 3 ? ' and ' + (overdueItems.length - 3) + ' more' : '') + '</span><button class="pf-overdue-banner-dismiss" title="Dismiss">×</button>';
    banner.querySelector('.pf-overdue-banner-dismiss').addEventListener('click', () => { banner.style.display = 'none'; });
  }
  let _arranging = false;
  function detectOverlap() {
    const nodes = Array.from(canvas.querySelectorAll('.pf-node')).filter(n => n.style.display !== 'none');
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]; const ax = a.offsetLeft, ay = a.offsetTop, aw = a.offsetWidth, ah = a.offsetHeight;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]; const bx = b.offsetLeft, by = b.offsetTop, bw = b.offsetWidth, bh = b.offsetHeight;
        if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) return true;
      }
    }
    return false;
  }
  let _updatingStatuses = false;
  function autoUpdateStatuses() {
    if (_updatingStatuses) return;
    _updatingStatuses = true;
    projects.forEach(p => {
      if (!p.subtasks || !p.subtasks.length) return;
      const hasAnyDone = (function check(list) { return list.some(s => s.status === 'completed' || s.status === 'ongoing' || s.status === 'waiting' || s.dueAt || (s.subtasks && s.subtasks.length && check(s.subtasks))); })(p.subtasks);
      const allDone = (function check(list) { return list.every(s => s.status === 'completed' && (!s.subtasks || !s.subtasks.length || check(s.subtasks))); })(p.subtasks);
      if (allDone && p.status !== 'completed') { p.status = 'completed'; p.completedAt = new Date().toISOString(); }
      else if (!allDone && p.status === 'completed' && !p._manualStatus) { p.status = hasAnyDone ? 'ongoing' : 'planned'; p.completedAt = null; }
      else if (!allDone && hasAnyDone && p.status === 'planned' && !p._manualStatus) { p.status = 'ongoing'; }
    });
    _updatingStatuses = false;
  }
  // Rebuilds the primary canvas from the current in-memory project state.
