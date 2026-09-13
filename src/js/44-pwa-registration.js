// ============================================================
// SECTION: PWA REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  const _pfUpdatePill = document.getElementById('pf-update-pill');
  let _pfPendingWorker = null;
  let _pfReloading = false;
  function _pfActivateUpdate() {
    if (!_pfPendingWorker) return;
    _pfPendingWorker.postMessage('skipWaiting');
  }
  function _pfShowUpdatePill() {
    if (!_pfUpdatePill) return;
    // hidden attribute = CSS-independent safety (browsers hide it even if
    // app styles fail to load mid-update); the class then animates it in.
    _pfUpdatePill.hidden = false;
    _pfUpdatePill.classList.add('pf-update-pill-show');
  }
  if (_pfUpdatePill) {
    _pfUpdatePill.addEventListener('click', _pfActivateUpdate);
    _pfUpdatePill.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _pfActivateUpdate(); } });
  }
  navigator.serviceWorker.register('./sw.js').then(function(reg) {
    // A worker may already be waiting from a previous session (pill was
    // missed/dismissed) — surface it again on boot instead of losing it.
    if (reg.waiting && navigator.serviceWorker.controller) {
      _pfPendingWorker = reg.waiting;
      _pfShowUpdatePill();
    }
    reg.addEventListener('updatefound', function() {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', function() {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          _pfPendingWorker = newWorker;
          _pfShowUpdatePill();
          window._pf.showToast('🔄 New version available', false, false, _pfActivateUpdate, 'Refresh');
        }
      });
    });
  }).catch(function() {});
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (_pfReloading) return;
    _pfReloading = true;
    window.location.reload();
  });
}

