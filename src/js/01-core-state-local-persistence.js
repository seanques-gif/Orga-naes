  // ============================================================
  // SECTION: CORE STATE & LOCAL PERSISTENCE
  // ============================================================
(function() {
  const STATUSES = ['planned', 'ongoing', 'waiting', 'completed'];
  const STATUS_LABEL = { planned: 'Planned', ongoing: 'Ongoing', waiting: 'Waiting', completed: 'Completed' };
  const STORE_KEY = 'project-flow-graph-v2';

  // Named constants (no magic numbers)
  const LONG_PRESS_MS = 600;
  const NAV_AUTO_HIDE_MS = 1500;
  const PUSH_DEBOUNCE_MS = 3000;
  const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const UNDO_STACK_MAX = 100;

  // Throttle utility — trailing-edge, skips if already pending
  function throttle(fn, ms) { let pending = false; return function() { if (pending) return; pending = true; setTimeout(() => { fn(); pending = false; }, ms); }; }

  const canvas = document.getElementById('pf-canvas');
  const canvasWrap = document.getElementById('pf-canvas-wrap');
  const root = document.getElementById('pf-root');

  // Device detection
  (function detectDevice() {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const w = screen.width;
    let device = 'desktop';
    if (hasTouch && w <= 600) device = 'mobile';
    else if (hasTouch && w <= 1400) device = 'tablet';
    root.classList.add('pf-device-' + device);
    window.addEventListener('resize', throttle(() => {
      root.classList.remove('pf-device-mobile', 'pf-device-tablet', 'pf-device-desktop');
      const vw = window.innerWidth;
      if (hasTouch && vw <= 600) root.classList.add('pf-device-mobile');
      else if (hasTouch && vw <= 1400) root.classList.add('pf-device-tablet');
      else root.classList.add('pf-device-desktop');
    }, 200));
  })();

  const statsEl = document.getElementById('pf-stats');
  const saveEl = document.getElementById('pf-save');
  const emptyEl = document.getElementById('pf-empty');

  let projects = [];
  let categories = [];
  let collapsedCategories = {};
  let saveTimer = null;
  let undoStack = [];
  let redoStack = [];
  let _lastProjectId = null; // tracks last-interacted project for per-project undo snapshots
  const undoBtn = document.getElementById('pf-undo');
  const redoBtn = document.getElementById('pf-redo');

  function updateHistoryButtons() { undoBtn.disabled = undoStack.length === 0; redoBtn.disabled = redoStack.length === 0; }
  function cloneProjects(data) { if (typeof structuredClone === 'function') return structuredClone(data); return JSON.parse(JSON.stringify(data)); }
  // Per-project undo: store only the touched project when possible (saves ~90% memory)
  // Structural changes (add/delete/reorder) still store the full array.
  function snapshot() {
    const pid = _lastProjectId;
    _lastProjectId = null;
    if (pid && projects.some(p => p.id === pid)) {
      const idx = projects.findIndex(p => p.id === pid);
      undoStack.push({ _pp: true, idx: idx, id: pid, data: cloneProjects(projects[idx]) });
    } else {
      undoStack.push({ _pp: false, data: cloneProjects(projects) });
    }
    if (undoStack.length > UNDO_STACK_MAX) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(cloneProjects(projects)); // always store full for redo safety
    if (redoStack.length > UNDO_STACK_MAX) redoStack.shift();
    const entry = undoStack.pop();
    if (entry._pp) {
      const curIdx = projects.findIndex(p => p.id === entry.id);
      if (curIdx > -1) projects[curIdx] = entry.data;
      else projects.splice(Math.min(entry.idx, projects.length), 0, entry.data); // project was added; re-insert
    } else {
      projects = entry.data;
    }
    _completedCollapseId = null;
    updateHistoryButtons(); scheduleSave(); render();
    if (listViewActive) { renderSplitList(); renderSplitDetail(); }
    if (window._firebasePushNow) window._firebasePushNow();
    showToast('↩ Undo (' + undoStack.length + ' left)');
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(cloneProjects(projects));
    if (undoStack.length > UNDO_STACK_MAX) undoStack.shift();
    const entry = redoStack.pop();
    if (entry._pp) {
      const curIdx = projects.findIndex(p => p.id === entry.id);
      if (curIdx > -1) projects[curIdx] = entry.data;
      else projects.splice(Math.min(entry.idx, projects.length), 0, entry.data);
    } else {
      projects = entry.data;
    }
    _completedCollapseId = null;
    updateHistoryButtons(); scheduleSave(); render();
    if (listViewActive) { renderSplitList(); renderSplitDetail(); }
    if (window._firebasePushNow) window._firebasePushNow();
    showToast('↪ Redo (' + redoStack.length + ' left)');
  }

  let _longPressTimer = null;
  let _longPressTarget = null;
  root.addEventListener('touchstart', (e) => {
    const node = e.target.closest('.pf-node');
    if (!node) return;
    _longPressTarget = node;
    _longPressTimer = setTimeout(() => {
      const touch = e.changedTouches[0];
      const evt = new MouseEvent('contextmenu', { bubbles: true, clientX: touch.clientX, clientY: touch.clientY });
      node.dispatchEvent(evt);
      _longPressTarget = null;
    }, LONG_PRESS_MS);
  }, { passive: true });
  root.addEventListener('touchend', () => { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });
  root.addEventListener('touchmove', () => { if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; } });

  root.addEventListener('paste', (e) => {
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      if (ae.isContentEditable) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const selection = window.getSelection();
        if (selection.rangeCount) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
  });

  let _saveModalEl = null;
