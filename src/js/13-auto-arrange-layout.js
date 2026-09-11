    // SUBSECTION: Auto-Arrange & Layout
  function autoArrangeProjects(skipSnapshot) {
    const GAP = 32, START_X = 24; let START_Y = 40;
    const z = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;
    const bw = ((canvasWrap && canvasWrap.clientWidth) || 1400) / z;
    if (!skipSnapshot) snapshot();
    render();
    const groupKeys = categories.concat([null]);
    let y = START_Y;
    groupKeys.forEach(catName => {
      const group = projects.filter(p => (p.category || null) === catName && matchesSearch(p));
      if (!group.length) return;
      if (catName && collapsedCategories[catName]) {
        group.forEach(p => { p.x = START_X; p.y = y; });
        const visibleCount = group.length;
        y += 30 + visibleCount * 38 + 16 + GAP;
        return;
      }
      const cards = group.map(p => canvas.querySelector('.pf-node[data-id="' + p.id + '"]')).filter(Boolean);
      let x = START_X, rowH = 0;
      cards.forEach((cardEl, i) => {
        const proj = group[i];
        const w = Math.ceil(cardEl.offsetWidth || 244);
        const h = Math.ceil(cardEl.offsetHeight || 90) + 8;
        if (x > START_X && x + w > bw - START_X) { x = START_X; y += rowH + GAP; rowH = 0; }
        proj.x = x; proj.y = y;
        x += w + GAP;
        if (h > rowH) rowH = h;
      });
      y += rowH + GAP + (catName ? 30 : 0);
    });
    scheduleSave();
    render();
    renderCategoryZones();
  }

  function renderCategoryZones() {
    const zonesLayer = document.getElementById('pf-category-zones');
    if (!zonesLayer) return;
    zonesLayer.innerHTML = '';
    const groups = {};
    projects.forEach(p => {
      if (!p.category) return;
      if (!matchesSearch(p)) return;
      const collapsed = !!collapsedCategories[p.category];
      const el = canvas.querySelector('.pf-node[data-id="' + p.id + '"]');
      const w = (!collapsed && el) ? (el.offsetWidth || 244) : 244;
      const h = (!collapsed && el) ? (el.offsetHeight || 90) : 90;
      if (!groups[p.category]) groups[p.category] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const g = groups[p.category];
      g.minX = Math.min(g.minX, p.x); g.minY = Math.min(g.minY, p.y);
      g.maxX = Math.max(g.maxX, p.x + w); g.maxY = Math.max(g.maxY, p.y + h);
    });
    const PAD = 20;
    Object.keys(groups).forEach(name => {
      const g = groups[name]; const color = categoryColor(name);
      const collapsed = !!collapsedCategories[name];
      const zone = document.createElement('div');
      zone.className = 'pf-category-zone' + (collapsed ? ' pf-category-zone-collapsed' : '');
      zone.style.left = (g.minX - PAD) + 'px';
      zone.style.top = (g.minY - PAD - 12) + 'px';
      const collapsedWidth = Math.max(360, (canvasWrap.clientWidth / (typeof zoomLevel !== 'undefined' ? zoomLevel : 1)) - 80);
      zone.style.width = collapsed ? collapsedWidth + 'px' : (g.maxX - g.minX + PAD * 2) + 'px';
      const catProjects = projects.filter(p => p.category === name && matchesSearch(p));
      zone.style.height = collapsed ? (30 + catProjects.length * 38 + 16) + 'px' : (g.maxY - g.minY + PAD * 2 + 12) + 'px';
      zone.style.borderColor = color;
      const label = document.createElement('button');
      label.className = 'pf-category-zone-label';
      label.type = 'button';
      label.innerHTML = (collapsed ? '&#9656;' : '&#9662;') + ' ' + escapeHtml(name) + (collapsed ? ' <span style="font-size: calc(var(--font-size-base) - 4px);opacity:0.7;">(' + catProjects.length + ' project' + (catProjects.length !== 1 ? 's' : '') + ')</span>' : '');
      label.style.background = color;
      label.style.color = '#fff';
      label.style.pointerEvents = 'auto';
      label.title = collapsed ? 'Expand category' : 'Collapse category';
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!listViewActive) return;
        collapsedCategories[name] = !collapsedCategories[name];
        saveCollapsedCategories();
        autoArrangeProjects();
      });
      label.addEventListener('dragover', (e) => { if (!dragProjectId) return; e.preventDefault(); e.stopPropagation(); label.style.outline = '2px solid #fff'; label.style.outlineOffset = '2px'; });
      label.addEventListener('dragleave', () => { label.style.outline = ''; label.style.outlineOffset = ''; });
      label.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); label.style.outline = ''; label.style.outlineOffset = ''; if (!dragProjectId) return; const src = projects.find(pr => pr.id === dragProjectId); if (!src) return; if (src.category === name) return; snapshot(); src.category = name; dragProjectId = null; clearProjectIndicators(); scheduleSave(); autoArrangeProjects(true); });
      zone.appendChild(label);
      if (collapsed) {
        const list = document.createElement('div');
        list.style.cssText = 'padding: 8px 12px; display: flex; flex-direction: column; gap: 6px;';
        catProjects.forEach(p => {
          const treeCount = countTree(p.subtasks);
          const progressText = treeCount.total ? treeCount.done + '/' + treeCount.total : '';
          const dueText = p.dueAt || '';
          const isCompleted = p.status === 'completed';
          const item = document.createElement('div');
          item.style.cssText = 'font-size: calc(var(--font-size-base) - 1px); color: var(--text); padding: 6px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.15s; background: var(--card); border: 1px solid var(--card-border);' + (isCompleted ? 'opacity:0.5;text-decoration:line-through;' : '');
          item.innerHTML = '<span class="pf-list-dot" style="width:8px;height:8px;border-radius:50%;background:' + (p.color || 'var(--' + p.status + ')') + ';flex-shrink:0;cursor:pointer;border:1.5px solid ' + (p.color || 'var(--' + p.status + ')') + ';" title="Set status"></span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">' + escapeHtml(p.title) + '</span>' +
            (progressText ? '<span style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);flex-shrink:0;">' + progressText + '</span>' : '') +
            '<span style="font-size: calc(var(--font-size-base) - 4px);color:var(--' + p.status + ');flex-shrink:0;padding:2px 6px;border-radius:6px;background:var(--' + p.status + '-bg);">' + STATUS_LABEL[p.status] + '</span>' +
            (dueText ? '<span style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);flex-shrink:0;">' + dueText + '</span>' : '');
          item.addEventListener('mouseenter', () => { item.style.borderColor = 'var(--hover-border)'; });
          item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--card-border)'; });
          item.querySelector('.pf-list-dot').addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); const _pid = p.id; openStatusMenu(e.currentTarget, p.status, (st) => { snapshot(); const proj = projects.find(pr => pr.id === _pid); if (!proj) return; const oldStatus = proj.status; proj.status = st; if (proj.status === oldStatus) return; proj._manualStatus = true; proj.completedAt = proj.status === 'completed' ? new Date().toISOString() : null; logActivity('"' + proj.title + '" status: ' + STATUS_LABEL[oldStatus] + ' → ' + STATUS_LABEL[proj.status]); scheduleSave(); renderCategoryZones(); }); });
          item.addEventListener('click', (e) => { e.stopPropagation(); collapsedCategories[name] = false; saveCollapsedCategories(); p.expanded = true; scheduleSave(); autoArrangeProjects(true); });
          list.appendChild(item);
        });
        zone.appendChild(list);
      }
      zonesLayer.appendChild(zone);
    });
  }

  let searchTerm = '';
  let dueFilter = 'all';
  let selectedProjectId = null;
  let _taskClipboard = null; let _pasteArmed = false;
