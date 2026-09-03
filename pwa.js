// #11 PWA - Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(function(reg) {
    reg.addEventListener('updatefound', function() {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', function() {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          window._pf.showToast('🔄 New version available — tap to refresh', false, false);
          newWorker.postMessage('skipWaiting');
        }
      });
    });
  }).catch(function() {});
  navigator.serviceWorker.addEventListener('controllerchange', function() { window.location.reload(); });
}

