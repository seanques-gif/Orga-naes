    // SUBSECTION: Modal Helpers (Focus/Visibility)
    function getVisibleModal() {
      for (let i = 0; i < ALL_MODALS.length; i++) {
        if (ALL_MODALS[i] && ALL_MODALS[i].style.display !== 'none') return ALL_MODALS[i];
      }
      return null;
    }
    function isModalHeader(target, modal) {
      const firstChild = modal.children[0];
      if (!firstChild) return false;
      if (firstChild.contains(target)) return true;
      if (target.closest('.pf-panel-close')) return true;
      const rect = modal.getBoundingClientRect();
      const touchY = _modalStartY;
      return touchY < rect.top + 50;
    }
    document.addEventListener('touchstart', function(e) {
      if (root.classList.contains('pf-device-desktop')) return;
      const modal = getVisibleModal();
      if (!modal) return;
      if (!modal.contains(e.target) && e.target !== modalBackdrop) return;
      _modalStartX = e.touches[0].clientX;
      _modalStartY = e.touches[0].clientY;
      _modalEl = modal;
      if (!isModalHeader(e.target, modal)) { _modalActive = false; return; }
      _modalActive = true;
      _modalEl.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!_modalActive || !_modalEl) return;
      const dx = Math.abs(e.touches[0].clientX - _modalStartX);
      const dy = e.touches[0].clientY - _modalStartY;
      if (dx > 40) { _modalActive = false; _modalEl.style.transform = ''; _modalEl.style.opacity = ''; _modalEl.style.transition = ''; return; }
      if (dy < 0) return;
      const progress = Math.min(dy / 200, 1);
      _modalEl.style.transform = 'translate(-50%, calc(-50% + ' + dy + 'px))';
      _modalEl.style.opacity = (1 - progress * 0.4).toString();
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
      if (!_modalActive || !_modalEl) { _modalActive = false; return; }
      const dy = e.changedTouches[0].clientY - _modalStartY;
      if (dy > 80) {
        _modalEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        _modalEl.style.transform = 'translate(-50%, 100%)';
        _modalEl.style.opacity = '0';
        if (navigator.vibrate) navigator.vibrate(10);
        setTimeout(function() {
          _modalEl.style.transition = '';
          _modalEl.style.transform = '';
          _modalEl.style.opacity = '';
          closeAllModals();
          _modalEl = null;
        }, 200);
      } else {
        _modalEl.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        _modalEl.style.transform = '';
        _modalEl.style.opacity = '';
        setTimeout(function() { if (_modalEl) { _modalEl.style.transition = ''; } }, 200);
      }
      _modalActive = false;
    }, { passive: true });
  })();

  // #10 Pull-to-refresh (disabled)

  // #12 Haptic feedback extensions
  const _origCycleSubStatus = cycleSubStatus;
  cycleSubStatus = function(pid, sid, targetStatus) { if (navigator.vibrate) navigator.vibrate(10); _origCycleSubStatus(pid, sid, targetStatus); };
  const _origCycleProjectStatus = cycleProjectStatus;
  cycleProjectStatus = function(id, targetStatus) { if (navigator.vibrate) navigator.vibrate(10); _origCycleProjectStatus(id, targetStatus); };

  // #14 Export reminder (prompt weekly if no export in 7 days)
  (function() {
    const LAST_EXPORT_KEY = 'pf-last-export-time';
    const lastExport = parseInt(localStorage.getItem(LAST_EXPORT_KEY) || '0');
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastExport > sevenDays && projects.length > 0) {
      setTimeout(function() {
        showToast('💾 Reminder: Export a backup of your data (Options → Save & Import)');
      }, 5000);
    }
    const exportBtn = document.getElementById('pf-export');
    if (exportBtn) exportBtn.addEventListener('click', function() { localStorage.setItem(LAST_EXPORT_KEY, Date.now().toString()); });
  })();

  // Expose for Firebase sync
  window._pf = {
    getProjects: () => projects,
    setProjects: (p) => { projects = p; },
    getCategories: () => categories,
    setCategories: (c) => { categories = c; },
    renderSplitList: () => renderSplitList(),
    getArchive: () => archive,
    setArchive: (a) => { archive = a; saveArchive(); },
    getTrash: () => trash,
    setTrash: (t) => { trash = t; saveTrash(); },
    scheduleSave: () => scheduleSave(),
    saveCategories: () => saveCategories(),
    render: () => render(),
    showToast: (msg, isError, undoable, actionCallback, actionLabel) => showToast(msg, isError, undoable, actionCallback, actionLabel),
    logError: (context, err) => logError(context, err),
    snapshot: () => snapshot(),
    openIDB_KV: () => openIDB_KV(),
    getCategoryEmojis: () => categoryEmojis,
    setCategoryEmojis: (e) => { categoryEmojis = e; saveCatEmojis(); },
    stopAutoBackup: () => { if (_autoBackupTimer) { clearInterval(_autoBackupTimer); _autoBackupTimer = null; } },
    // Resets the account-scoped panels that clearLocalUserData() can't
    // reach directly (their arrays/objects live in this closure and
    // localStorage.removeItem() alone doesn't touch the in-memory copy
    // or re-render the panel). Without this, switching accounts leaves
    // the previous account's activity log, Today's Focus tasks, weekly
    // planner entries, reminders, and collapsed-category state visible
    // on screen even though projects/categories/archive/trash did clear.
    clearEphemeralState: () => {
      activityLog.length = 0;
      renderActivityList();
      todayTasks = [];
      todayDate = todayLocalStr();
      renderTodayList();
      weeklyData = {};
      renderWeeklyPanel();
      reminders = [];
      collapsedCategories = {};
    },
    escapeHtml: (s) => escapeHtml(s),
    todayLocalStr: () => todayLocalStr(),
    clearIdbSnapshots: () => clearIdbSnapshots(),
    // Lets code outside this IIFE (e.g. the Firebase sync conflict modal,
    // which isn't part of ALL_MODALS) add its own Escape-key dismissal
    // without this closure needing to know about that modal directly.
    // Position in this array no longer determines priority for tagged,
    // stackable overlays (see `key`/_markOverlayOpen in handleEscape) — the
    // conflict modal is tagged 'conflict' by the Firebase sync IIFE (via
    // markOverlayOpen below) at the moment it's actually shown, so Escape
    // correctly closes it first whenever it's opened on top of something
    // else (e.g. the project detail view), regardless of where this entry
    // sits in the list.
    registerEscDismissable: (entry) => { _escDismissables.unshift(entry); },
    // Lets code outside this closure (e.g. the sync conflict modal) record
    // the moment it opened, so handleEscape can tell it apart from other
    // stackable overlays that may already be open underneath it.
    markOverlayOpen: (key) => _markOverlayOpen(key),
    // The Firebase sync IIFE (pull success, push-then-close-options-panel,
    // etc.) runs outside this closure and previously called the bare
    // closeAllModals() global, which only exists in here — that's what
    // produced "closeAllModals is not defined" on push/pull.
    closeAllModals: () => closeAllModals(),
    errorLogAsText: () => errorLogAsText()
  };

  // Pull-to-refresh (disabled)

  // Scroll-to-top button
  (function() {
    const root = document.getElementById('pf-root');
    const btn = document.createElement('button');
    btn.className = 'pf-scroll-top';
    btn.innerHTML = '↑';
    btn.title = 'Scroll to top';
    root.appendChild(btn);
    btn.addEventListener('click', function() {
      const list = root.querySelector('.pf-split-list');
      if (list) list.scrollTo({ top: 0, behavior: 'smooth' });
    });
    let _scrollRaf = null;
    let _scrollTopTimer = null;
