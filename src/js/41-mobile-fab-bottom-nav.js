    // SUBSECTION: Mobile FAB & Bottom Nav
    function showFab() {
      fab.classList.add('pf-fab-visible');
      clearTimeout(_fabHideTimer);
      _fabHideTimer = setTimeout(function() { if (!fabOpen) fab.classList.remove('pf-fab-visible'); }, 2000);
    }
    document.addEventListener('scroll', function(e) {
      if (e.target && (e.target.classList && e.target.classList.contains('pf-split-list') || e.target.id === 'pf-split-list')) showFab();
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', function() { showFab(); }, { passive: true });
    function toggleFab() {
      fabOpen = !fabOpen;
      fab.classList.toggle('pf-fab-open', fabOpen);
      fabMenu.classList.toggle('pf-fab-menu-open', fabOpen);
      fabOverlay.classList.toggle('pf-fab-menu-open', fabOpen);
      const sortItem = fabMenu.querySelector('[data-fab="sort"]');
      const addItem = fabMenu.querySelector('[data-fab="add"]');
      if (sortItem) sortItem.style.display = root.classList.contains('pf-detail-open') ? 'none' : '';
      if (addItem) addItem.style.display = root.classList.contains('pf-detail-open') ? 'none' : '';
    }
    function closeFab() {
      fabOpen = false;
      fab.classList.remove('pf-fab-open');
      fabMenu.classList.remove('pf-fab-menu-open');
      fabOverlay.classList.remove('pf-fab-menu-open');
      if (window._navAutoHideRestart) window._navAutoHideRestart();
    }
    fab.addEventListener('click', toggleFab);
    fabOverlay.addEventListener('click', closeFab);
    fabMenu.querySelectorAll('.pf-fab-menu-item').forEach(item => {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = item.dataset.fab;
        if (action === 'sort') {
          if (root.classList.contains('pf-detail-open')) { closeFab(); return; }
          const modes = ['manual', 'name', 'status', 'due-cat', 'created'];
          const labels = ['Manual', 'Name', 'Status', 'Due Date', 'Newest'];
          const cur = modes.indexOf(splitSortMode);
          const next = (cur + 1) % modes.length;
          splitSortMode = modes[next];
          safeSet('project-flow-sort-mode', splitSortMode, false);
          renderSplitList();
          showToast('Sort: ' + labels[next]);
          return;
        }
        if (action !== 'search') closeFab();
        if (action === 'add') openNewProjectCategoryPicker();
        else if (action === 'search') {
          const searchItem = item;
          const rect = searchItem.getBoundingClientRect();
          const searchWrap = document.getElementById('pf-search-wrap');
          const searchInput = document.getElementById('pf-search');
          const bottomPos = window.innerHeight - rect.top - rect.height / 2 - 20;
          searchWrap.style.bottom = bottomPos + 'px';
          root.appendChild(searchWrap);
          closeFab();
          searchWrap.classList.add('pf-search-open');
          searchInput.focus();
          var searchOverlay = document.createElement('div');
          searchOverlay.style.cssText = 'position:fixed;inset:0;z-index:9499;background:transparent;';
          searchOverlay.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); _clearSearch(); searchOverlay.remove(); });
          searchOverlay.addEventListener('touchstart', function(e) { e.stopPropagation(); e.preventDefault(); _clearSearch(); searchOverlay.remove(); });
          root.appendChild(searchOverlay);
          searchWrap._searchOverlay = searchOverlay;
        }
        else if (action === 'expand') {
          if (root.classList.contains('pf-detail-open') && splitSelectedId) {
            const p = projects.find(pr => pr.id === splitSelectedId);
            if (p && p.subtasks && p.subtasks.length) {
              const allExpanded = (function check(list) { return list.every(s => (!s.subtasks || !s.subtasks.length || (s.expanded && check(s.subtasks)))); })(p.subtasks);
              (function setAll(list, val) { list.forEach(s => { s.expanded = val; if (s.subtasks && s.subtasks.length) setAll(s.subtasks, val); }); })(p.subtasks, !allExpanded);
              render();
              showToast(allExpanded ? 'Collapsed all tasks' : 'Expanded all tasks');
            }
          } else {
            const allCollapsed = categories.length > 0 && categories.every(c => splitCollapsedCats[c]);
            if (allCollapsed) { categories.forEach(c => { splitCollapsedCats[c] = false; }); }
            else { categories.forEach(c => { splitCollapsedCats[c] = true; }); }
            renderSplitList();
            showToast(allCollapsed ? 'Expanded all categories' : 'Collapsed all categories');
          }
        }
        else if (action === 'undo') undo();
        else if (action === 'redo') redo();
      });
    });
  })();

  // #11 Bottom navigation bar
  (function() {
    const bottomNav = document.getElementById('pf-bottom-nav');
    if (!bottomNav) return;
    const btns = bottomNav.querySelectorAll('.pf-bottom-nav-btn');
    let _activeNav = 'projects';
    let _navSuppressReset = false;
    function setActiveNav(nav) {
      _activeNav = nav;
      btns.forEach(b => b.classList.remove('pf-bottom-active'));
      btns.forEach(b => { if (b.dataset.nav === nav) b.classList.add('pf-bottom-active'); });
    }
    btns.forEach(btn => {
      btn.addEventListener('click', function() {
        const nav = btn.dataset.nav;
        _navSuppressReset = true;
        if (nav === 'projects') {
          _clearSearch();
          closeAllModals();
          if (root.classList.contains('pf-detail-open')) _goBackToProjects();
        } else if (nav === 'today') {
          closeAllModals(); renderTodayList(); openModal(todayPanel, 'flex');
        } else if (nav === 'duelist') {
          closeAllModals(); renderDueList(); openModal(duelistPanel, 'flex');
        } else if (nav === 'calendar') {
          closeAllModals(); renderCalendar(); openModal(calendarPanel, 'flex');
        } else if (nav === 'options') {
          closeAllModals(); openModal(optionsPanel, 'flex');
        }
        _navSuppressReset = false;
        setActiveNav(nav);
      });
    });
    // Reset active state when modals close externally (backdrop/X button)
    const _origCloseAll = closeAllModals;
    closeAllModals = function() { _origCloseAll(); if (!_navSuppressReset) setActiveNav('projects'); };

    // Auto-hide bottom nav and FAB after 1 second of inactivity
    const fab = document.querySelector('.pf-fab');
    let _navTimer = null;
    function hideNavAndFab() {
      bottomNav.classList.add('pf-nav-hidden');
      if (fab && !fab.classList.contains('pf-fab-open')) fab.classList.add('pf-fab-hidden');
    }
    function showNavAndFab() {
      bottomNav.classList.remove('pf-nav-hidden');
      if (fab) fab.classList.remove('pf-fab-hidden');
      clearTimeout(_navTimer);
      if (!_navPressed) _navTimer = setTimeout(hideNavAndFab, NAV_AUTO_HIDE_MS);
    }
    let _navPressed = false;
    bottomNav.addEventListener('touchstart', function() { _navPressed = true; clearTimeout(_navTimer); }, { passive: true });
    bottomNav.addEventListener('touchend', function() { _navPressed = false; _navTimer = setTimeout(hideNavAndFab, NAV_AUTO_HIDE_MS); }, { passive: true });
    window._navAutoHideRestart = function() {
      clearTimeout(_navTimer);
      _navTimer = setTimeout(hideNavAndFab, NAV_AUTO_HIDE_MS);
    };
    showNavAndFab();
    let _swipeStartY = 0;
    document.addEventListener('touchstart', function(e) { _swipeStartY = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', function(e) {
      const dy = e.changedTouches[0].clientY - _swipeStartY;
      if (Math.abs(dy) > 30) showNavAndFab();
    }, { passive: true });
  })();

  // #4 Swipe right to cycle status on subtasks
  (function() {
    let _swipeStartX = 0, _swipeStartY = 0, _swipeRow = null, _swipeMoved = false;
    document.addEventListener('touchstart', function(e) {
      const row = e.target.closest('.pf-subrow');
      if (!row || subMultiSelect.length > 0) return;
      _swipeRow = row;
      _swipeStartX = e.touches[0].clientX;
      _swipeStartY = e.touches[0].clientY;
      _swipeMoved = false;
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!_swipeRow) return;
      const dx = e.touches[0].clientX - _swipeStartX;
      const dy = e.touches[0].clientY - _swipeStartY;
      if (Math.abs(dy) > 30) { _swipeRow = null; return; }
      if (dx > 60 && !_swipeMoved) {
        _swipeMoved = true;
        if (root.classList.contains('pf-device-mobile') && root.classList.contains('pf-extend-open')) {
          root.classList.remove('pf-extend-open');
          splitDetail.querySelectorAll('.pf-sub-dates > .pf-ext-due').forEach(el => { el.style.minWidth = ''; });
          _swipeRow = null;
          return;
        }
        if (root.classList.contains('pf-device-mobile')) { _swipeRow = null; return; }
        if (root.classList.contains('pf-device-tablet')) {
          _swipeRow = null;
          const detailEl = document.getElementById('pf-split-detail');
          detailEl.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
          detailEl.style.transform = 'translateX(100%)';
          detailEl.style.opacity = '0';
          if (navigator.vibrate) navigator.vibrate(10);
          setTimeout(function() { detailEl.style.transition = ''; detailEl.style.transform = ''; detailEl.style.opacity = ''; _goBackToProjects(); }, 300);
          return;
        }
        const p = _swipeRow.__project;
        const sId = _swipeRow.__subId;
        if (p && sId) {
          if (navigator.vibrate) navigator.vibrate(15);
          cycleSubStatus(p.id, sId);
        }
        _swipeRow = null;
      }
      if (dx < -60 && !_swipeMoved && root.classList.contains('pf-device-mobile')) {
        _swipeMoved = true;
        if (navigator.vibrate) navigator.vibrate(10);
        root.classList.add('pf-extend-open');
        setTimeout(function() { _equalizeColumnWidths(); setTimeout(_equalizeColumnWidths, 250); }, 50);
        _swipeRow = null;
      }
    }, { passive: true });
    document.addEventListener('touchend', function() { _swipeRow = null; }, { passive: true });
  })();

  // #13 Swipe from left edge to go back (touch devices)
  (function() {
    let _backStartX = 0, _backStartY = 0, _backActive = false;
    const detailEl = document.getElementById('pf-split-detail');
    document.addEventListener('touchstart', function(e) {
      if (!root.classList.contains('pf-detail-open')) return;
      if (root.classList.contains('pf-device-desktop')) return;
      if (root.classList.contains('pf-extend-open')) return;
      const x = e.touches[0].clientX;
      const sw = window.innerWidth;
      if (x < sw * 0.05 || x > sw * 0.95) return;
      _backStartX = x;
      _backStartY = e.touches[0].clientY;
      _backActive = true;
      detailEl.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!_backActive) return;
      const dy = Math.abs(e.touches[0].clientY - _backStartY);
      if (dy > 40) { _backActive = false; detailEl.style.transform = ''; detailEl.style.opacity = ''; detailEl.style.transition = ''; return; }
      const dx = Math.max(0, e.touches[0].clientX - _backStartX);
      const progress = Math.min(dx / 150, 1);
      detailEl.style.transform = 'translateX(' + dx + 'px)';
      detailEl.style.opacity = (1 - progress * 0.4).toString();
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      if (!_backActive) { return; }
      const dx = e.changedTouches[0].clientX - _backStartX;
      if (dx > 80) {
        detailEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        detailEl.style.transform = 'translateX(100%)';
        detailEl.style.opacity = '0';
        if (navigator.vibrate) navigator.vibrate(10);
        setTimeout(function() {
          detailEl.style.transition = '';
          detailEl.style.transform = '';
          detailEl.style.opacity = '';
          _goBackToProjects();
        }, 200);
      } else {
        detailEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        detailEl.style.transform = '';
        detailEl.style.opacity = '';
        setTimeout(function() { detailEl.style.transition = ''; }, 200);
      }
      _backActive = false;
    }, { passive: true });
  })();

  // #14 Swipe down from modal header to close (touch devices)
  (function() {
    let _modalStartX = 0, _modalStartY = 0, _modalActive = false, _modalEl = null;
