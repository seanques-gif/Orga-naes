  // SUBSECTION: Error Log
  // Centralized silent-failure surfacing. Route meaningful catch blocks (sync/push/pull,
  // import/export, render failures, IndexedDB) through logError() so they show up here
  // instead of vanishing into the console. Piggybacks on the ACTIVITY_KEY/safeSet pattern.
  const ERROR_KEY = 'project-flow-errors';
  const ERROR_LOG_MAX = 200;
  let errorLog = [];
  let unreadErrorCount = 0;
  // UX-03: screen-reader announcer for newly logged errors (role="alert"
  // in the template). Throttled so a burst or crash-loop can't flood
  // assistive tech; the error log itself remains the complete record.
  const _srAnnouncer = document.getElementById('pf-sr-announcer');
  let _lastSrAnnounce = 0;
  function announceError(context) {
    try {
      if (!_srAnnouncer) return;
      const now = Date.now();
      if (now - _lastSrAnnounce < 2000) return;
      _lastSrAnnounce = now;
      _srAnnouncer.textContent = 'Error logged: ' + context;
    } catch (_) { /* announcer must never break error logging */ }
  }
  function logError(context, err) {
    try {
      const message = err && err.message ? err.message : String(err == null ? 'Unknown error' : err);
      const stack = err && err.stack ? String(err.stack) : '';
      const entry = { time: new Date().toISOString(), context: String(context || 'Unknown'), message: message, stack: stack };
      errorLog.unshift(entry);
      if (errorLog.length > ERROR_LOG_MAX) errorLog.length = ERROR_LOG_MAX;
      unreadErrorCount++;
      updateErrorBadge();
      announceError(entry.context);
      safeSet(ERROR_KEY, JSON.stringify(errorLog), false);
      console.error('[Orga-naes] ' + context + ':', err);
    } catch (loggingFailure) {
      // Never let the error logger itself throw.
      console.error('[Orga-naes] logError failed:', loggingFailure);
    }
  }
  function updateErrorBadge() {
    const dots = [document.getElementById('pf-error-dot-desktop'), document.getElementById('pf-error-dot-mobile'), document.getElementById('pf-error-dot-btn')];
    dots.forEach(dot => {
      if (!dot) return;
      if (unreadErrorCount > 0) { dot.textContent = unreadErrorCount > 99 ? '99+' : String(unreadErrorCount); dot.style.display = 'flex'; }
      else { dot.style.display = 'none'; }
    });
  }
  function renderErrorList() {
    const listEl = document.getElementById('pf-error-list');
    const countEl = document.getElementById('pf-error-count');
    countEl.textContent = errorLog.length ? '(' + errorLog.length + ')' : '';
    if (!errorLog.length) { listEl.innerHTML = '<div class="pf-activity-empty">No errors logged. 🎉</div>'; return; }
    listEl.innerHTML = errorLog.map(e => '<div class="pf-activity-item pf-error-item"><span class="pf-activity-time">' + formatDateTime(e.time) + '</span><div class="pf-error-ctx">' + escapeHtml(e.context) + '</div><div class="pf-error-msg">' + escapeHtml(e.message) + '</div></div>').join('');
  }
  // Shared plain-text rendering for both Copy and Export, so what you
  // paste into a bug report matches what you get in the downloaded file.
  function errorLogAsText() {
    if (!errorLog.length) return 'No errors logged.';
    return errorLog.map(e => '[' + formatDateTime(e.time) + '] ' + e.context + ': ' + e.message).join('\n');
  }
  document.getElementById('pf-error-btn').addEventListener('click', () => {
    _exitMultiSelectMode();
    closeAllModals(); renderErrorList(); openModal(errorPanel, 'flex');
    unreadErrorCount = 0; updateErrorBadge();
  });
  document.getElementById('pf-error-copy-btn').addEventListener('click', async () => {
    if (!errorLog.length) { showToast('Nothing to copy (log is empty)'); return; }
    const text = errorLogAsText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        try { ta.select(); document.execCommand('copy'); } finally { ta.remove(); }
      }
      showToast('📋 Error log copied');
    } catch (err) {
      showToast('⚠ Copy failed: ' + (err && err.message ? err.message : 'unknown error'), true);
      logError('Copy error log', err);
    }
  });
  document.getElementById('pf-error-export-btn').addEventListener('click', () => {
    if (!errorLog.length) { showToast('Nothing to export (log is empty)'); return; }
    const blob = new Blob([errorLogAsText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = 'orga-naes-error-log-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('⬇ Error log exported');
  });
  document.getElementById('pf-error-clear-btn').addEventListener('click', () => {
    if (!confirm('Clear the error log?')) return;
    errorLog = []; unreadErrorCount = 0; updateErrorBadge(); renderErrorList();
    safeSet(ERROR_KEY, JSON.stringify(errorLog), false);
  });
  (async function loadErrorLog() { try { const res = await safeGet(ERROR_KEY, false); if (res && res.value) { errorLog = JSON.parse(res.value) || []; } } catch (e) {} })();
  // Global handlers: catch anything that slips past the try/catch blocks entirely.
  window.addEventListener('error', function(event) {
    logError('Uncaught error', event && event.error ? event.error : new Error(event && event.message ? event.message : 'Unknown window error'));
  });
  window.addEventListener('unhandledrejection', function(event) {
    logError('Unhandled promise rejection', event && event.reason ? event.reason : new Error('Unknown rejection'));
  });

  const TODAY_KEY = 'project-flow-today';
  let todayTasks = [];
  let todayDate = '';
