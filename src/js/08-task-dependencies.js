  // SUBSECTION: Task Dependencies
  function getAllSubtasksFlat(subtasks) {
    const result = [];
    (function walk(list) { list.forEach(s => { result.push(s); if (s.subtasks && s.subtasks.length) walk(s.subtasks); }); })(subtasks);
    return result;
  }
  function getUnresolvedBlockers(project, subtask) {
    if (!subtask.blockedBy || !subtask.blockedBy.length) return [];
    const allSubs = getAllSubtasksFlat(project.subtasks);
    return subtask.blockedBy.map(id => allSubs.find(s => s.id === id)).filter(s => s && s.status !== 'completed');
  }
  function buildDependencyChip(project, subtask) {
    const btn = document.createElement('button');
    btn.type = 'button';
    function refresh() {
      const count = subtask.blockedBy ? subtask.blockedBy.length : 0;
      const unresolved = getUnresolvedBlockers(project, subtask);
      btn.innerHTML = pfIcon('link');
      btn.className = 'pf-dep-chip' + (unresolved.length ? ' pf-dep-blocked' : (count ? ' pf-dep-set' : ''));
      btn.title = unresolved.length ? ('Blocked by ' + unresolved.length + ' task(s)') : (count ? (count + ' dependency/ies') : 'Add dependency');
    }
    refresh();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = root.querySelector('.pf-dep-dropdown');
      if (existing) { existing.remove(); return; }
      const dd = document.createElement('div');
      dd.className = 'pf-dep-dropdown';
      dd.style.left = '50%';
      dd.style.top = '50%';
      dd.style.transform = 'translate(-50%, -50%)';
      dd.style.position = 'fixed';
      const allSubs = getAllSubtasksFlat(project.subtasks).filter(s => s.id !== subtask.id);
      if (!allSubs.length) { dd.innerHTML = '<span style="padding:8px;font-size: calc(var(--font-size-base) - 2px);color:var(--text-dim)">No other subtasks</span>'; }
      else {
        allSubs.forEach(s => {
          const lbl = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = (subtask.blockedBy || []).includes(s.id);
          const txt = document.createElement('span');
          txt.textContent = s.title;
          txt.className = 'pf-ellip'; // 3B-3: was 3 inline props
          const dot = document.createElement('span');
          dot.className = 'pf-status-dot-sm'; // shape in CSS; color is dynamic
          dot.style.background = 'var(--' + s.status + ')';
          lbl.appendChild(cb); lbl.appendChild(dot); lbl.appendChild(txt);
          cb.addEventListener('change', () => {
            snapshot();
            if (!subtask.blockedBy) subtask.blockedBy = [];
            if (cb.checked) { if (!subtask.blockedBy.includes(s.id)) subtask.blockedBy.push(s.id); }
            else { subtask.blockedBy = subtask.blockedBy.filter(id => id !== s.id); }
            scheduleSave(); refresh(); render();
          });
          dd.appendChild(lbl);
        });
      }
      root.appendChild(dd);
      const closeDD = (ev) => { if (!dd.contains(ev.target) && ev.target !== btn) { dd.remove(); document.removeEventListener('pointerdown', closeDD); document.removeEventListener('keydown', closeDDKey); } };
      const closeDDKey = (ev) => { if (ev.key === 'Escape') { ev.stopImmediatePropagation(); dd.remove(); document.removeEventListener('pointerdown', closeDD); document.removeEventListener('keydown', closeDDKey); } };
      setTimeout(() => { document.addEventListener('pointerdown', closeDD); document.addEventListener('keydown', closeDDKey); }, 0);
    });
    return btn;
  }

