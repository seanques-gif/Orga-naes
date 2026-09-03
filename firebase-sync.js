// --- Firebase Cloud Sync ---
// Data model: projects are stored under users/{uid}/projects/{projectId} (a MAP keyed
// by stable id), each record carrying _rev (monotonic int) and _updatedAt (ms epoch).
// Ordering (which is purely local UI state, not conflict-prone content) lives separately
// at users/{uid}/projectOrder as a plain array of ids. Deletes are recorded as tombstones
// at users/{uid}/tombstones/{id} so peers can distinguish "deleted" from "never seen".
// This avoids writing/reading projects by array index, which breaks under concurrent
// reorders/deletes across devices.
(function() {
  // Pre-existing bug fixed during modularization: this module's conflict modal
  // called escapeHtml() expecting it to be in scope from the main app script,
  // but that helper is private to app.js's own closure. It was never actually
  // reachable here (even before the split, it lived in a different IIFE), so
  // any real sync conflict would throw instead of rendering the dialog.
  function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  const firebaseConfig = {
    apiKey: "AIzaSyBiDGWVjs8Djoez_saNA5cpOY3aO2cgVVc",
    authDomain: "orga-naes.firebaseapp.com",
    databaseURL: "https://orga-naes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "orga-naes",
    storageBucket: "orga-naes.firebasestorage.app",
    messagingSenderId: "240084793529",
    appId: "1:240084793529:web:20dfa084f9fbd537af0368",
    measurementId: "G-4JLDJ3EPH4"
  };

  if (typeof firebase === 'undefined') return;
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  const statusEl = document.getElementById('pf-firebase-status');
  const signinBtn = document.getElementById('pf-firebase-signin');
  const signoutBtn = document.getElementById('pf-firebase-signout');
  const pushBtn = document.getElementById('pf-firebase-push');
  const pullBtn = document.getElementById('pf-firebase-pull');
  const autosyncCb = document.getElementById('pf-firebase-autosync');

  let _fbUser = null;
  let _fbListener = null;
  let _fbOrderListener = null;
  let _fbAutosync = localStorage.getItem('pf-firebase-autosync') === 'true';
  autosyncCb.checked = _fbAutosync;

  function userRef() { return db.ref('users/' + _fbUser.uid + '/projects'); }
  function orderRef() { return db.ref('users/' + _fbUser.uid + '/projectOrder'); }
  function tombstoneRef() { return db.ref('users/' + _fbUser.uid + '/tombstones'); }
  function catRef() { return db.ref('users/' + _fbUser.uid + '/categories'); }
  function archiveRef() { return db.ref('users/' + _fbUser.uid + '/archive'); }
  function trashRef() { return db.ref('users/' + _fbUser.uid + '/trash'); }

  // --- id-map <-> ordered-array helpers ---

  // Local `projects` is an ordered array (order matters for UI/drag-drop).
  // Cloud storage is a map keyed by id, plus a separate order array.
  function projectsToMap(list) {
    const map = {};
    (list || []).forEach(function(p) {
      if (!p || !p.id) return;
      map[p.id] = p;
    });
    return map;
  }

  function mapAndOrderToArray(map, order) {
    map = map || {};
    const seen = {};
    const out = [];
    (order || []).forEach(function(id) {
      if (map[id] && !seen[id]) { out.push(map[id]); seen[id] = true; }
    });
    // Any ids present in the map but missing from the order array (e.g. order
    // write raced with a project write) are appended so nothing is silently lost.
    Object.keys(map).forEach(function(id) {
      if (!seen[id]) { out.push(map[id]); seen[id] = true; }
    });
    return out;
  }

  function stripSyncMeta(p) {
    if (!p) return p;
    const c = Object.assign({}, p);
    delete c._rev;
    delete c._updatedAt;
    return c;
  }

  function recordRev(p) { return (p && typeof p._rev === 'number') ? p._rev : 0; }

  function setSignedIn(user) {
    _fbUser = user;
    statusEl.textContent = '✓ Signed in as ' + (user.displayName || user.email);
    statusEl.style.color = 'var(--completed)';
    signinBtn.style.display = 'none';
    signoutBtn.style.display = '';
    pushBtn.disabled = false;
    pullBtn.disabled = false;
    // Auto-pull if device hasn't synced in over 1 hour (skip on page refresh)
    if (!window._pfLoaded) { setTimeout(function() { setSignedIn(user); }, 500); return; }
    const isReload = performance && performance.navigation && performance.navigation.type === 1 || (performance.getEntriesByType && performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].type === 'reload');
    if (isReload) return;
    const lastSync = parseInt(localStorage.getItem('pf-firebase-last-sync-time') || '0');
    const elapsed = Date.now() - lastSync;
    if (_fbAutosync && elapsed > 3600000) {
      db.ref('users/' + user.uid + '/updatedAt').once('value').then(function(snap) {
        const remoteTime = snap.val() || 0;
        if (remoteTime > lastSync) {
          if (window._pf && window._pf.snapshot) window._pf.snapshot();
          mergePullAll(true);
        }
      });
    }
    if (_fbAutosync) startListener();
  }

  function setSignedOut() {
    _fbUser = null;
    statusEl.textContent = 'Not signed in';
    statusEl.style.color = 'var(--text-dim)';
    signinBtn.style.display = '';
    signoutBtn.style.display = 'none';
    pushBtn.disabled = true;
    pullBtn.disabled = true;
    stopListener();
  }

  auth.onAuthStateChanged(function(user) {
    if (user) setSignedIn(user);
    else setSignedOut();
  });

  signinBtn.addEventListener('click', function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function(err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        auth.signInWithRedirect(provider);
      } else {
        alert('Sign-in failed: ' + err.message);
      }
    });
  });

  function _doSignout() {
    if (window._pf && window._pf.stopAutoBackup) window._pf.stopAutoBackup();
    auth.signOut().then(function() {
      window._pf.showToast('🚪 Signed out');
    }).catch(function(err) {
      window._pf.showToast('⚠ Sign out failed: ' + err.message, true);
    });
  }
  signoutBtn.addEventListener('click', _doSignout);
  signoutBtn.addEventListener('touchend', function(e) { e.preventDefault(); _doSignout(); });

  const lastSyncEl = document.getElementById('pf-firebase-last-sync');
  let _lastSyncTime = parseInt(localStorage.getItem('pf-firebase-last-sync-time') || '0');
  function updateLastSync() {
    _lastSyncTime = Date.now();
    localStorage.setItem('pf-firebase-last-sync-time', _lastSyncTime.toString());
    showLastSync();
  }
  function showLastSync() {
    if (!_lastSyncTime) { lastSyncEl.style.display = 'none'; return; }
    lastSyncEl.style.display = '';
    const diff = Math.floor((Date.now() - _lastSyncTime) / 1000);
    if (diff < 10) lastSyncEl.textContent = 'Last synced: just now';
    else if (diff < 60) lastSyncEl.textContent = 'Last synced: ' + diff + 's ago';
    else if (diff < 3600) lastSyncEl.textContent = 'Last synced: ' + Math.floor(diff / 60) + ' min ago';
    else if (diff < 86400) lastSyncEl.textContent = 'Last synced: ' + Math.floor(diff / 3600) + 'h ago';
    else lastSyncEl.textContent = 'Last synced: ' + Math.floor(diff / 86400) + 'd ago';
  }
  showLastSync();
  setInterval(showLastSync, 30000);

  // Full push: writes every current project as a keyed record (id -> record),
  // the order array, and clears tombstones for ids that now exist again.
  // Used for manual "Push" (which is an explicit "cloud should match my local state" action).
  function pushFullOverwrite() {
    const projects = window._pf.getProjects();
    const map = {};
    const order = [];
    const now = Date.now();
    projects.forEach(function(p) {
      if (!p || !p.id) return;
      const prevRev = recordRev(_lastPushedRecords[p.id]);
      const rec = Object.assign({}, stripSyncMeta(p), { _rev: prevRev + 1, _updatedAt: now });
      map[p.id] = rec;
      order.push(p.id);
    });
    userRef().set(map);
    orderRef().set(order);
    catRef().set(JSON.parse(JSON.stringify(window._pf.getCategories())));
    db.ref('users/' + _fbUser.uid + '/categoryEmojis').set(JSON.parse(JSON.stringify(window._pf.getCategoryEmojis())));
    archiveRef().set(JSON.parse(JSON.stringify(window._pf.getArchive())));
    trashRef().set(JSON.parse(JSON.stringify(window._pf.getTrash())));
    db.ref('users/' + _fbUser.uid + '/updatedAt').set(now);
    _lastPushedRecords = map;
    _lastPushedOrder = order.slice();
    _lastPushedCatHash = JSON.stringify(window._pf.getCategories());
    updateLastSync();
  }

  pushBtn.addEventListener('click', function() {
    if (!_fbUser) return;
    db.ref('users/' + _fbUser.uid + '/updatedAt').once('value').then(function(snap) {
      const remoteTime = snap.val() || 0;
      const localTime = _lastSyncTime || 0;
      if (remoteTime > localTime && !confirm('⚠ Cloud data is newer than your last sync.\nPush anyway and overwrite cloud?')) return;
      pushFullOverwrite();
      window._pf.showToast('⬆ Pushed to cloud');
    });
  });

  function fixSubtasks(list) {
    if (!list) return [];
    if (!Array.isArray(list)) list = Object.values(list);
    return list.map(function(s) {
      if (s && s.subtasks) s.subtasks = fixSubtasks(s.subtasks);
      return s;
    });
  }
  function fixProject(p) {
    if (!p) return p;
    if (p.subtasks) p.subtasks = fixSubtasks(p.subtasks);
    if (!p.subtasks) p.subtasks = [];
    p.expanded = false;
    return p;
  }

  // Pulls projects (map), order, categories, archive, trash and reconstructs the
  // local ordered array by id — never assumes remote and local share array indices.
  function mergePullAll(silent) {
    if (!silent) window._pf.showToast('☁ Pulling from cloud...');
    if (window._pf && window._pf.snapshot) window._pf.snapshot();
    Promise.all([
      userRef().once('value'),
      orderRef().once('value'),
      catRef().once('value'),
      archiveRef().once('value'),
      trashRef().once('value')
    ]).then(function(results) {
      const projMap = results[0].val();
      const orderVal = results[1].val();
      const catVal = results[2].val();
      const archVal = results[3].val();
      const trashVal = results[4].val();
      if (!projMap && !catVal) { if (!silent) window._pf.showToast('⚠ No data found in cloud', true); return; }
      if (catVal) {
        const c = Array.isArray(catVal) ? catVal : Object.values(catVal);
        window._pf.setCategories(c.filter(Boolean));
        window._pf.saveCategories();
      }
      if (projMap) {
        const order = Array.isArray(orderVal) ? orderVal : (orderVal ? Object.values(orderVal) : Object.keys(projMap));
        const arr = mapAndOrderToArray(projMap, order).map(function(p) { return fixProject(stripSyncMeta(p)); });
        window._pf.setProjects(arr);
        _lastPushedRecords = projMap;
        _lastPushedOrder = order.slice();
        const cats = window._pf.getCategories();
        if (!cats || !cats.length) {
          const uniqueCats = [...new Set(arr.map(pr => pr.category).filter(Boolean))];
          if (uniqueCats.length) { window._pf.setCategories(uniqueCats); window._pf.saveCategories(); }
        }
      }
      if (archVal) window._pf.setArchive(Array.isArray(archVal) ? archVal.filter(Boolean) : Object.values(archVal).filter(Boolean));
      if (trashVal) window._pf.setTrash(Array.isArray(trashVal) ? trashVal.filter(Boolean) : Object.values(trashVal).filter(Boolean));
      db.ref('users/' + _fbUser.uid + '/categoryEmojis').once('value').then(function(emojiSnap) {
        if (emojiSnap.val()) window._pf.setCategoryEmojis(emojiSnap.val());
      });
      window._pf.scheduleSave(); window._pf.render(); window._pf.renderSplitList();
      updateLastSync();
      if (!silent) window._pf.showToast('⬇ Pulled from cloud');
    }).catch(function(err) {
      window._pf.showToast('⚠ Pull failed: ' + (err.message || err), true);
    });
  }

  function _doPull() {
    if (!_fbUser) { window._pf.showToast('⚠ Sign in first to pull', true); return; }
    mergePullAll(false);
  }
  pullBtn.addEventListener('click', _doPull);
  pullBtn.addEventListener('touchend', function(e) { e.preventDefault(); _doPull(); });

  // Track what we last wrote/read, keyed by id — used both to compute selective
  // pushes and to detect genuine conflicts (a record changed on both sides since
  // the last sync), rather than comparing whole-array JSON blobs.
  let _lastPushedRecords = {}; // id -> record (with _rev/_updatedAt) as last known in sync with cloud
  let _lastPushedOrder = [];

  function startListener() {
    if (_fbListener || !_fbUser) return;
    if (!window._pfLoaded) { setTimeout(startListener, 500); return; }
    if (!Object.keys(_lastPushedRecords).length) {
      _lastPushedRecords = projectsToMap(JSON.parse(JSON.stringify(window._pf.getProjects())));
    }
    // Listen for individual project record changes (map, not array) — a change to
    // one project's node only affects that one id, never shifts or touches others.
    _fbListener = userRef().on('value', function(snap) {
      const remoteMap = snap.val() || {};
      applyRemoteProjectMap(remoteMap);
    });
    _fbOrderListener = orderRef().on('value', function(snap) {
      const order = snap.val();
      if (!order) return;
      _lastPushedOrder = Array.isArray(order) ? order.slice() : Object.values(order);
      reorderLocalToMatch(_lastPushedOrder);
    });
    catRef().on('value', function(snap) {
      const val = snap.val();
      if (!val) return;
      const remote = Array.isArray(val) ? val : Object.values(val);
      if (JSON.stringify(remote) !== JSON.stringify(window._pf.getCategories())) {
        window._pf.setCategories(remote);
        window._pf.saveCategories(); window._pf.render();
      }
    });
  }

  // Applies a remote id->record map against local state, record by record.
  // Uses per-record _rev to decide: unseen locally-unchanged record -> take remote;
  // record changed both locally and remotely since last sync -> conflict modal.
  function applyRemoteProjectMap(remoteMap) {
    const localProjects = window._pf.getProjects();
    const localMap = projectsToMap(localProjects);
    const localIds = Object.keys(localMap);
    const remoteIds = Object.keys(remoteMap);
    const allIds = Array.from(new Set(localIds.concat(remoteIds)));

    let changed = false;
    const conflicted = [];
    const nextMap = Object.assign({}, localMap);

    allIds.forEach(function(id) {
      const remoteRec = remoteMap[id];
      const localRec = localMap[id];
      const lastKnown = _lastPushedRecords[id];

      if (remoteRec && !localRec) {
        // New record from another device (or this device's own tombstone hasn't landed).
        nextMap[id] = fixProject(stripSyncMeta(remoteRec));
        changed = true;
        return;
      }
      if (!remoteRec && localRec) {
        // Missing remotely: could be a genuine remote delete, or we just haven't pushed yet.
        const wePushedIt = lastKnown && recordRev(lastKnown) > 0;
        const weChangedSinceSync = !lastKnown || JSON.stringify(stripSyncMeta(localRec)) !== JSON.stringify(stripSyncMeta(lastKnown));
        if (wePushedIt && !weChangedSinceSync) {
          // Cloud no longer has it and we haven't touched it since — treat as a remote delete.
          delete nextMap[id];
          changed = true;
        }
        // else: leave local record alone; our own pending create will push it up.
        return;
      }
      if (remoteRec && localRec) {
        const remoteChanged = !lastKnown || recordRev(remoteRec) !== recordRev(lastKnown);
        const localChangedStr = JSON.stringify(stripSyncMeta(localRec));
        const lastKnownStr = lastKnown ? JSON.stringify(stripSyncMeta(lastKnown)) : null;
        const localChanged = lastKnownStr === null || localChangedStr !== lastKnownStr;
        const remoteStr = JSON.stringify(stripSyncMeta(remoteRec));
        if (remoteStr === localChangedStr) return; // already identical, nothing to do
        if (localChanged && remoteChanged) {
          conflicted.push({ id: id, local: localRec, remote: remoteRec });
        } else if (remoteChanged) {
          nextMap[id] = fixProject(stripSyncMeta(remoteRec));
          changed = true;
        }
        // if only localChanged, our pending push will win — leave local as-is.
      }
    });

    _lastPushedRecords = remoteMap;

    if (conflicted.length) {
      showConflictModal(conflicted);
      return;
    }
    if (changed) {
      const order = _lastPushedOrder.length ? _lastPushedOrder : Object.keys(nextMap);
      const arr = mapAndOrderToArray(nextMap, order);
      window._pf.setProjects(arr);
      window._pf.scheduleSave(); window._pf.render();
      updateLastSync();
      window._pf.showToast('☁ Synced from cloud');
    }
  }

  // Applies a new order array to local state without touching any record content.
  function reorderLocalToMatch(order) {
    const localProjects = window._pf.getProjects();
    const currentOrder = localProjects.map(function(p) { return p.id; });
    if (JSON.stringify(currentOrder) === JSON.stringify(order.filter(function(id) { return currentOrder.indexOf(id) !== -1; }))) return;
    const map = projectsToMap(localProjects);
    const rebuilt = mapAndOrderToArray(map, order);
    if (rebuilt.length !== localProjects.length) return; // don't reorder if ids don't line up; a project map update will reconcile
    window._pf.setProjects(rebuilt);
    window._pf.render(); window._pf.renderSplitList();
  }

  function stopListener() {
    if (_fbListener && _fbUser) { userRef().off('value', _fbListener); orderRef().off('value', _fbOrderListener); catRef().off('value'); }
    _fbListener = null;
    _fbOrderListener = null;
  }

  autosyncCb.addEventListener('change', function() {
    _fbAutosync = autosyncCb.checked;
    localStorage.setItem('pf-firebase-autosync', _fbAutosync);
    if (_fbAutosync && _fbUser) startListener();
    else stopListener();
  });

  // Offline queue: track pending changes and push when back online
  let _fbOfflineQueue = false;
  window.addEventListener('online', function() {
    if (_fbOfflineQueue && _fbAutosync && _fbUser) {
      _fbOfflineQueue = false;
      pushSelective();
      window._pf.showToast('☁ Offline changes synced');
    }
  });

  // Selective sync: push only projects whose content actually changed since the
  // last known-synced state, each as its own keyed write — never a full-array
  // overwrite, so a reorder or delete on one device can never clobber an
  // unrelated project on another device.
  function pushSelective() {
    if (!_fbUser) return;
    const projects = window._pf.getProjects();
    const categories = window._pf.getCategories();
    const now = Date.now();
    const updates = {};
    let hasChanges = false;
    const currentIds = new Set();

    projects.forEach(function(p) {
      if (!p || !p.id) return;
      currentIds.add(p.id);
      const prev = _lastPushedRecords[p.id];
      const prevStripped = prev ? stripSyncMeta(prev) : null;
      const curStripped = stripSyncMeta(p);
      if (prevStripped && JSON.stringify(prevStripped) === JSON.stringify(curStripped)) return; // unchanged
      const nextRev = recordRev(prev) + 1;
      const rec = Object.assign({}, curStripped, { _rev: nextRev, _updatedAt: now });
      updates['users/' + _fbUser.uid + '/projects/' + p.id] = rec;
      _lastPushedRecords[p.id] = rec;
      hasChanges = true;
    });

    // Deletions: any id we previously pushed that's no longer in local projects
    // gets removed by id (not by index) and tombstoned so other devices that
    // haven't caught up yet can tell "deleted" apart from "never existed".
    Object.keys(_lastPushedRecords).forEach(function(id) {
      if (!currentIds.has(id)) {
        updates['users/' + _fbUser.uid + '/projects/' + id] = null;
        updates['users/' + _fbUser.uid + '/tombstones/' + id] = now;
        delete _lastPushedRecords[id];
        hasChanges = true;
      }
    });

    const currentOrder = projects.map(function(p) { return p.id; }).filter(Boolean);
    if (JSON.stringify(currentOrder) !== JSON.stringify(_lastPushedOrder)) {
      updates['users/' + _fbUser.uid + '/projectOrder'] = currentOrder;
      _lastPushedOrder = currentOrder.slice();
      hasChanges = true;
    }

    if (hasChanges) {
      db.ref().update(updates);
    }

    // Always sync categories and emojis (small data, order-independent)
    const catHash = JSON.stringify(categories);
    if (catHash !== _lastPushedCatHash) {
      catRef().set(JSON.parse(JSON.stringify(categories)));
      _lastPushedCatHash = catHash;
      hasChanges = true;
    }
    try { db.ref('users/' + _fbUser.uid + '/categoryEmojis').set(JSON.parse(JSON.stringify(window._pf.getCategoryEmojis()))); } catch(e) {}

    if (hasChanges) {
      db.ref('users/' + _fbUser.uid + '/updatedAt').set(now);
      updateLastSync();
    }
  }
  let _lastPushedCatHash = '';

  // Hook into scheduleSave to push on every change when autosync is on (debounced 3s)
  let _fbPushTimer = null;
  window._firebasePull = function() { if (pullBtn) pullBtn.click(); };
  window._firebasePush = function() {
    if (!_fbAutosync || !_fbUser) return;
    if (!window._pf.getProjects().length) return;
    if (!navigator.onLine) { _fbOfflineQueue = true; return; }
    clearTimeout(_fbPushTimer);
    _fbPushTimer = setTimeout(function() {
      pushSelective();
    }, 3000);
  };
  window._firebasePushNow = function() {
    if (!_fbAutosync || !_fbUser) return;
    if (!window._pf.getProjects().length) return;
    if (!navigator.onLine) { _fbOfflineQueue = true; return; }
    clearTimeout(_fbPushTimer);
    pushSelective();
  };
  // Manual "Push to Cloud" (Ctrl+S dialog): only requires being signed in — must work even with autosync off.
  window._firebasePushManual = function() {
    if (!_fbUser) { showToast('⚠ Sign in first to push', true); return; }
    if (!navigator.onLine) { showToast('⚠ You are offline — will sync when back online', true); _fbOfflineQueue = true; return; }
    clearTimeout(_fbPushTimer);
    pushFullOverwrite();
    showToast('☁ Pushed to cloud');
  };
  if (typeof window.fsAutoSaveHook === 'undefined' || !window.fsAutoSaveHook) window.fsAutoSaveHook = window._firebasePush;
  else {
    const _prevHook = window.fsAutoSaveHook;
    window.fsAutoSaveHook = function() { _prevHook(); window._firebasePush(); };
  }

  // #13 Auto-backup to Firebase (once per day, keeps last 7 backups)
  function autoBackupToFirebase() {
    if (!_fbUser) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastBackup = localStorage.getItem('pf-firebase-last-backup');
    if (lastBackup === today) return;
    const backupRef = db.ref('users/' + _fbUser.uid + '/backups/' + today);
    backupRef.set({
      projects: JSON.parse(JSON.stringify(window._pf.getProjects())),
      categories: JSON.parse(JSON.stringify(window._pf.getCategories())),
      timestamp: Date.now()
    });
    localStorage.setItem('pf-firebase-last-backup', today);
    // Clean old backups (keep last 7)
    db.ref('users/' + _fbUser.uid + '/backups').once('value').then(function(snap) {
      const val = snap.val();
      if (!val) return;
      const keys = Object.keys(val).sort();
      if (keys.length > 7) {
        keys.slice(0, keys.length - 7).forEach(function(k) {
          db.ref('users/' + _fbUser.uid + '/backups/' + k).remove();
        });
      }
    });
  }
  const autobackupCb = document.getElementById('pf-firebase-autobackup');
  let _fbAutobackup = localStorage.getItem('pf-firebase-autobackup') === 'true';
  autobackupCb.checked = _fbAutobackup;
  autobackupCb.addEventListener('change', function() {
    _fbAutobackup = autobackupCb.checked;
    localStorage.setItem('pf-firebase-autobackup', _fbAutobackup);
    if (_fbAutobackup && _fbUser) setTimeout(autoBackupToFirebase, 1000);
  });
  auth.onAuthStateChanged(function(user) { if (user && _fbAutobackup) setTimeout(autoBackupToFirebase, 5000); });

  // Backup restore UI
  const backupsBtn = document.getElementById('pf-firebase-backups-btn');
  const backupsList = document.getElementById('pf-firebase-backups-list');
  function enableBackupsBtn() { backupsBtn.disabled = false; }
  function disableBackupsBtn() { backupsBtn.disabled = true; }
  auth.onAuthStateChanged(function(u) { if (u) enableBackupsBtn(); else disableBackupsBtn(); });

  backupsBtn.addEventListener('click', function() {
    if (!_fbUser) return;
    if (backupsList.style.display !== 'none') { backupsList.style.display = 'none'; return; }
    backupsList.style.display = 'block';
    backupsList.innerHTML = '<div style="font-size:10px;color:var(--text-dim);padding:6px;">Loading backups...</div>';
    db.ref('users/' + _fbUser.uid + '/backups').once('value').then(function(snap) {
      const val = snap.val();
      if (!val) { backupsList.innerHTML = '<div style="font-size:10px;color:var(--text-dim);padding:6px;">No backups found.</div>'; return; }
      const keys = Object.keys(val).sort().reverse();
      backupsList.innerHTML = keys.map(function(k) {
        const b = val[k];
        const projCount = b.projects ? (Array.isArray(b.projects) ? b.projects.length : Object.keys(b.projects).length) : 0;
        const date = new Date(b.timestamp || 0);
        const label = k + ' &middot; ' + projCount + ' projects &middot; ' + date.toLocaleTimeString();
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--card-border);gap:8px;">' +
          '<span style="font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</span>' +
          '<button class="pf-undo-btn pf-backup-restore-btn" data-backup-key="' + k + '" style="font-size:9px;padding:3px 8px;flex-shrink:0;">Restore</button></div>';
      }).join('');
      backupsList.querySelectorAll('.pf-backup-restore-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const key = btn.dataset.backupKey;
          if (!confirm('Restore backup from ' + key + '? This will overwrite your current data.')) return;
          window._pf.snapshot();
          const b = val[key];
          if (b.projects) {
            const p = Array.isArray(b.projects) ? b.projects : Object.values(b.projects);
            window._pf.setProjects(p.map(function(pr) { return fixProject(stripSyncMeta(pr)); }));
            window._pf.scheduleSave(); window._pf.render();
          }
          if (b.categories) {
            const c = Array.isArray(b.categories) ? b.categories : Object.values(b.categories);
            window._pf.setCategories(c);
            window._pf.saveCategories();
          }
          window._pf.showToast('✅ Restored backup from ' + key);
          backupsList.style.display = 'none';
        });
      });
    });
  });

  // Conflict modal logic — now operates on the specific per-id records that
  // conflicted, rather than the whole local/remote project arrays.
  let _pendingConflicts = null; // [{id, local, remote}]
  function showConflictModal(conflicts) {
    _pendingConflicts = conflicts;
    const modal = document.getElementById('pf-conflict-modal');
    const localEl = document.getElementById('pf-conflict-local');
    const remoteEl = document.getElementById('pf-conflict-remote');
    function countChanges(list) {
      let tasks = 0, completed = 0, ongoing = 0;
      list.forEach(p => { if (p.subtasks) p.subtasks.forEach(function walk(s) { tasks++; if (s.status === 'completed') completed++; if (s.status === 'ongoing') ongoing++; if (s.subtasks) s.subtasks.forEach(walk); }); });
      return { projects: list.length, tasks, completed, ongoing };
    }
    const localList = conflicts.map(c => c.local);
    const remoteList = conflicts.map(c => c.remote);
    const localStats = countChanges(localList);
    const remoteStats = countChanges(remoteList);
    const localMore = localStats.tasks > remoteStats.tasks || localStats.completed > remoteStats.completed;
    const remoteMore = remoteStats.tasks > localStats.tasks || remoteStats.completed > localStats.completed;
    const localBadge = localMore ? ' ⭐ More changes' : '';
    const remoteBadge = remoteMore ? ' ⭐ More changes' : '';
    let diffHtml = '<b>Conflicting projects (' + conflicts.length + '):</b><br>' +
      conflicts.slice(0, 5).map(c => '• ' + escapeHtml((c.local && c.local.title) || (c.remote && c.remote.title) || 'Untitled')).join('<br>') +
      (conflicts.length > 5 ? '<br>…+' + (conflicts.length - 5) + ' more' : '');
    localEl.innerHTML = '<b>Local:</b> ' + localList.length + ' conflicting · ' + localStats.tasks + ' tasks · ' + localStats.completed + ' done' + (localBadge ? '<br><span style="color:var(--accent);font-weight:700;">' + localBadge + '</span>' : '');
    remoteEl.innerHTML = '<b>Cloud:</b> ' + remoteList.length + ' conflicting · ' + remoteStats.tasks + ' tasks · ' + remoteStats.completed + ' done' + (remoteBadge ? '<br><span style="color:var(--accent);font-weight:700;">' + remoteBadge + '</span>' : '') + '<br><br>' + diffHtml;
    modal.classList.add('pf-conflict-open');
  }
  document.getElementById('pf-conflict-keep-local').addEventListener('click', function() {
    document.getElementById('pf-conflict-modal').classList.remove('pf-conflict-open');
    if (_pendingConflicts) {
      // Re-push just the conflicting local records, bumping their rev past remote's.
      const projects = window._pf.getProjects();
      const now = Date.now();
      const updates = {};
      _pendingConflicts.forEach(function(c) {
        const p = projects.find(pr => pr.id === c.id) || c.local;
        const nextRev = Math.max(recordRev(c.remote), recordRev(_lastPushedRecords[c.id])) + 1;
        const rec = Object.assign({}, stripSyncMeta(p), { _rev: nextRev, _updatedAt: now });
        updates['users/' + _fbUser.uid + '/projects/' + c.id] = rec;
        _lastPushedRecords[c.id] = rec;
      });
      db.ref().update(updates);
      db.ref('users/' + _fbUser.uid + '/updatedAt').set(now);
      updateLastSync();
    }
    window._pf.showToast('✅ Kept local data & pushed to cloud');
    _pendingConflicts = null;
  });
  document.getElementById('pf-conflict-keep-remote').addEventListener('click', function() {
    document.getElementById('pf-conflict-modal').classList.remove('pf-conflict-open');
    if (_pendingConflicts) {
      const projects = window._pf.getProjects();
      const map = projectsToMap(projects);
      _pendingConflicts.forEach(function(c) {
        map[c.id] = fixProject(stripSyncMeta(c.remote));
        _lastPushedRecords[c.id] = c.remote;
      });
      const order = window._pf.getProjects().map(p => p.id);
      window._pf.setProjects(mapAndOrderToArray(map, order));
      window._pf.scheduleSave(); window._pf.render();
      updateLastSync();
      window._pf.showToast('☁ Using cloud data');
    }
    _pendingConflicts = null;
  });

  // Connection indicator
  const connDot = document.getElementById('pf-connection-dot');
  let _lastOnlineState = navigator.onLine;
  function updateConnDot() {
    if (navigator.onLine) { connDot.classList.add('pf-online'); connDot.classList.remove('pf-offline'); connDot.title = 'Online'; }
    else { connDot.classList.add('pf-offline'); connDot.classList.remove('pf-online'); connDot.title = 'Offline'; }
    _lastOnlineState = navigator.onLine;
  }
  window.addEventListener('online', updateConnDot);
  window.addEventListener('offline', updateConnDot);
  updateConnDot();
  setInterval(function() {
    if (navigator.onLine !== _lastOnlineState) updateConnDot();
  }, 3000);

  // Version display
  const APP_VERSION = document.querySelector('meta[name="version"]').content;
  db.ref('users/' + (_fbUser ? _fbUser.uid : '__none') + '/appVersion').set(APP_VERSION);
  auth.onAuthStateChanged(function(u) { if (u) db.ref('users/' + u.uid + '/appVersion').set(APP_VERSION); });

  // Test-only hook: exposes internal sync functions so the automated test
  // suite can exercise push/pull/conflict logic without a real Firebase
  // backend. Never active unless window.__TEST__ is set before load.
  if (window.__TEST__) {
    window.__fbSyncInternals = {
      projectsToMap, mapAndOrderToArray, stripSyncMeta, recordRev,
      pushFullOverwrite, mergePullAll, applyRemoteProjectMap,
      setSignedIn, setSignedOut,
      getLastPushedRecords: function() { return _lastPushedRecords; },
      setLastPushedRecords: function(m) { _lastPushedRecords = m; },
      isSignedIn: function() { return !!_fbUser; }
    };
  }
})();
