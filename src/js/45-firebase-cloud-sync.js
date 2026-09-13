// ============================================================
// SECTION: FIREBASE CLOUD SYNC
// ============================================================
(function() {
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
  let _fbListenerUserRef = null;
  let _fbListenerCatRef = null;
  let _fbAutosync = localStorage.getItem('pf-firebase-autosync') === 'true';
  autosyncCb.checked = _fbAutosync;

  function userRef() { return db.ref('users/' + _fbUser.uid + '/projects'); }
  function catRef() { return db.ref('users/' + _fbUser.uid + '/categories'); }
  function archiveRef() { return db.ref('users/' + _fbUser.uid + '/archive'); }
  function trashRef() { return db.ref('users/' + _fbUser.uid + '/trash'); }
  function notesRef() { return db.ref('users/' + _fbUser.uid + '/notes'); }
  function noteTombstonesRef() { return db.ref('users/' + _fbUser.uid + '/noteTombstones'); }

  const LAST_UID_KEY = 'pf-firebase-last-uid';
  // Set whenever clearLocalUserData() wipes the local cache (sign-out or a
  // detected account switch), cleared only once a pull has actually
  // repopulated it. This is deliberately independent of LAST_UID_KEY: a
  // same-account re-login also needs a forced pull after sign-out (local
  // data was just cleared regardless of whose account it is), and uid
  // comparison alone can't tell you that.
  const NEEDS_PULL_KEY = 'pf-firebase-needs-pull';

  // Normalizes a Firebase-shaped subtasks value into a real, fully-formed
  // JS array recursively. Firebase Realtime Database stores arrays as
  // sparse objects (or omits the field entirely) once there are gaps or
  // it's empty, so a project pulled straight from `.val()` can have
  // `subtasks` as `undefined` or a plain object instead of an array.
  // Every pull path MUST run projects through this before handing them to
  // the rest of the app — code elsewhere (render, renderStats,
  // validateAndRepair, etc.) calls `.forEach()` on `p.subtasks` and
  // `s.subtasks` unconditionally, and throws "Cannot read properties of
  // undefined (reading 'forEach')" otherwise. This used to only exist
  // inside _doPull(); the account-switch and hourly auto-pull paths were
  // missing it entirely.
  function fixSubtasks(list) {
    if (!list) return [];
    if (!Array.isArray(list)) list = Object.values(list);
    return list.filter(Boolean).map(function(s) {
      if (s.subtasks) s.subtasks = fixSubtasks(s.subtasks);
      else s.subtasks = [];
      return s;
    });
  }
  function fixProjects(val) {
    if (!val) return [];
    var arr = Array.isArray(val) ? val : Object.values(val);
    return arr.filter(Boolean).map(function(p) {
      if (p && p.subtasks) p.subtasks = fixSubtasks(p.subtasks);
      if (p && !p.subtasks) p.subtasks = [];
      p.expanded = false;
      return p;
    });
  }

  // Three normalizations needed before ANY local/remote equality check or hash:
  //
  // 1. `expanded` (project- and subtask-level) is transient canvas UI state —
  //    fixProjects() always forces it to false on data pulled from the cloud,
  //    while local keeps the user's real expand/collapse state. Comparing raw
  //    JSON made an open card look like a "change" on every listener event
  //    (including the echo of the user's own push), which then got treated as
  //    an incoming update and silently collapsed whatever was open.
  //
  // 2. Firebase Realtime Database treats any field set to `null` as "delete
  //    this key" — it is never actually written. Locally, an empty due date
  //    or completed date is always stored as an explicit `null`; after a
  //    round trip through Firebase that same field comes back simply absent
  //    (`undefined`) rather than `null`. JSON.stringify(null) !== JSON.
  //    stringify(undefined), so every project/subtask with an empty date
  //    field looked permanently "changed" no matter which side you picked —
  //    the conflict could never actually resolve.
  //
  // 3. `x`/`y` (canvas position) are auto-computed layout, not user content —
  //    autoArrangeProjects() recalculates them from each device's own
  //    canvas width/zoom any time cards resize, overlap, get filtered by
  //    search, etc (see its many call sites), and it always calls
  //    scheduleSave() when it does. That included simply clicking a card to
  //    expand it — the resulting reflow shifted x/y on that card (and often
  //    others below it in the same row), which then registered as a real,
  //    syncable "modification" and could pop the conflict modal even though
  //    the user only looked at something. Since position is recomputed
  //    per-device anyway (a value that fits one screen's width is meaningless
  //    on another's), it should never be part of the sync diff.
  //
  // Deleting `expanded`, `x`/`y`, and any null-valued key (recursively) from
  // both sides before comparing makes local's explicit null and remote's
  // missing key collapse into the same "absent" shape, so only real content
  // differences remain.
  function normalizeForSync(list) {
    if (!Array.isArray(list)) return list;
    return list.map(function(item) {
      if (!item || typeof item !== 'object') return item;
      var copy = Object.assign({}, item);
      delete copy.expanded;
      delete copy.x;
      delete copy.y;
      Object.keys(copy).forEach(function(key) {
        if (copy[key] === null || typeof copy[key] === 'undefined') delete copy[key];
      });
      // An empty blockedBy array is equivalent to no dependency at all — but
      // some render/init code has historically written blockedBy: [] onto a
      // subtask just to give it a default, with no real edit involved. If we
      // compared that raw, an untouched subtask could look "changed" purely
      // because it was rendered once. Normalize the empty-array case away so
      // only an actual dependency (non-empty blockedBy) counts as a change.
      if (Array.isArray(copy.blockedBy) && copy.blockedBy.length === 0) delete copy.blockedBy;
      if (Array.isArray(copy.subtasks)) copy.subtasks = normalizeForSync(copy.subtasks);
      return copy;
    });
  }

  // Storage key constants (duplicated from main IIFE scope for cross-IIFE access)
  const STORE_KEY        = 'project-flow-graph-v2';
  const CATEGORIES_KEY   = 'project-flow-categories';
  // Notes' localStorage keys (owned by the notes module, 46) — listed here so
  // clearLocalUserData() removes them on account switch. Values must match 46-notes.js.
  const NOTES_LOCAL_KEY      = 'project-flow-notes';
  const NOTES_TOMB_LOCAL_KEY = 'project-flow-notes-tombstones';
  const CAT_EMOJI_KEY    = 'project-flow-cat-emojis';
  const ARCHIVE_KEY      = 'project-flow-archive';
  const TRASH_KEY        = 'project-flow-trash';
  const ACTIVITY_KEY     = 'project-flow-activity';
  const TODAY_KEY        = 'project-flow-today';
  const WEEKLY_KEY       = 'project-flow-weekly';
  const REMINDERS_KEY    = 'project-flow-reminders';
  const COLLAPSED_CAT_KEY = 'project-flow-collapsed-categories';
  // Debounce constant used by the autosync push hook below
  const PUSH_DEBOUNCE_MS = 3000;

  // Wipes the local-first cache (projects/categories/archive/trash + related
  // caches) so the next account to sign in doesn't inherit the previous
  // account's data. Does NOT touch device-only prefs (theme, size, etc).
  function clearLocalUserData() {
    localStorage.setItem(NEEDS_PULL_KEY, '1');
    const keysToClear = [STORE_KEY, CATEGORIES_KEY, CAT_EMOJI_KEY, ARCHIVE_KEY, TRASH_KEY,
     'pf-firebase-last-sync-time', ACTIVITY_KEY, TODAY_KEY, WEEKLY_KEY,
     REMINDERS_KEY, COLLAPSED_CAT_KEY,
     // Notes join the cloud (Phase C follow-up): they must switch accounts
     // with everything else, or account B would silently inherit account A's
     // notes (both localStorage and the IndexedDB mirror are cleared below).
     NOTES_LOCAL_KEY, NOTES_TOMB_LOCAL_KEY];
    keysToClear.forEach(function(k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    // safeSet() mirrors every write into the IndexedDB fallback store, and
    // safeGet() falls back to reading from it whenever the localStorage key
    // is missing. Clearing only localStorage above isn't enough — without
    // this, a later load can silently resurrect the previous account's
    // data from IndexedDB. Delete the mirrored entries directly.
    // Wrapped in try/catch: this must never throw synchronously and abort
    // the in-memory clear + render below — a previous bug (calling an
    // out-of-scope openIDB_KV) did exactly that, silently leaving the old
    // account's data on screen after sign-out/account-switch.
    try {
      window._pf.openIDB_KV().then(function(db) {
        if (!db) return;
        try {
          const tx = db.transaction('kv', 'readwrite');
          const store = tx.objectStore('kv');
          keysToClear.forEach(function(k) { try { store.delete(k); } catch (e) {} });
        } catch (e) {}
      }).catch(function(e) {});
    } catch (e) {}
    // Also wipe the separate auto-backup snapshot store — see the comment
    // on clearIdbSnapshots() for why this is required, not optional.
    try { window._pf.clearIdbSnapshots(); } catch (e) {}
    if (window._pf) {
      if (window._pf.setProjects) window._pf.setProjects([]);
      if (window._pf.setCategories) window._pf.setCategories([]);
      if (window._pf.setArchive) window._pf.setArchive([]);
      if (window._pf.setTrash) window._pf.setTrash([]);
      if (window._pf.clearEphemeralState) window._pf.clearEphemeralState();
      if (window._pf.render) window._pf.render();
      if (window._pf.renderSplitList) window._pf.renderSplitList();
    }
    _lastSyncTime = 0;
  }

  let _switchingAccount = false;
  let _pendingSwitchUser = null;

  function setSignedIn(user) {
    _fbUser = user;
    statusEl.textContent = '✓ Signed in as ' + (user.displayName || user.email);
    statusEl.style.color = 'var(--completed)';
    signinBtn.style.display = 'none';
    signoutBtn.style.display = '';
    pushBtn.disabled = false;
    pullBtn.disabled = false;
    if (!window._pfLoaded) { setTimeout(function() { setSignedIn(user); }, 500); return; }

    // Force a fresh pull whenever either: (a) this is a different account
    // than was last cached — its local data belongs to someone else — or
    // (b) NEEDS_PULL_KEY is set, meaning the local cache was wiped by a
    // sign-out and hasn't been repopulated yet, even if it's the *same*
    // account signing back in. Relying on uid comparison alone missed
    // that second case entirely.
    const lastUid = localStorage.getItem(LAST_UID_KEY);
    const needsPull = localStorage.getItem(NEEDS_PULL_KEY) === '1';
    if (needsPull || (lastUid && lastUid !== user.uid)) {
      if (_switchingAccount) {
        // A previous switch is still pulling data; remember this user and
        // re-run once that pull finishes so the two pulls can't interleave.
        _pendingSwitchUser = user;
        return;
      }
      _switchingAccount = true;
      stopListener(); // tear down the previous account's realtime listener first —
                       // otherwise it can keep firing against the old account's data
                       // after we've already switched to the new one
      try { clearLocalUserData(); } catch (e) {}
      window._pf.snapshot && window._pf.snapshot();
      Promise.all([
        userRef().once('value'),
        catRef().once('value'),
        archiveRef().once('value'),
        trashRef().once('value'),
        notesRef().once('value'),
        noteTombstonesRef().once('value')
      ]).then(function(results) {
        const projVal = results[0].val();
        const catVal = results[1].val();
        const archVal = results[2].val();
        const trashVal = results[3].val();
        const notesVal = results[4].val();
        const tombVal = results[5].val();
        // Always persist, even when the field is empty/falsy (a newer
        // account can legitimately have no archive/trash/categories yet).
        // clearLocalUserData() above only wiped localStorage + the
        // IndexedDB mirror; if we skip these calls on falsy values, the
        // corresponding save*() never fires, nothing overwrites the
        // mirror, and the next safeGet() falls back to it — silently
        // resurrecting the previous account's data.
        window._pf.setCategories(catVal ? (Array.isArray(catVal) ? catVal : Object.values(catVal)) : []);
        window._pf.saveCategories();
        window._pf.setProjects(fixProjects(projVal));
        window._pf.setArchive(fixProjects(archVal));
        window._pf.setTrash(fixProjects(trashVal));
        // Same rule for notes: always persist the incoming account's set —
        // empty included — mirroring how setArchive/setTrash behave above.
        const incomingNotes = notesVal ? (Array.isArray(notesVal) ? notesVal.filter(Boolean) : Object.values(notesVal).filter(Boolean)) : [];
        window._pf.adoptCloudNotes(incomingNotes, (tombVal && typeof tombVal === 'object') ? tombVal : {});
        _notesPulledThisSession = true;
        _lastPushedNotesHash = JSON.stringify(incomingNotes) + '|' + JSON.stringify((tombVal && typeof tombVal === 'object') ? tombVal : {});
        // Fresh account's data just silently replaced local state — reset push
        // bookkeeping to match it so the next autosync tick doesn't diff against
        // the previous account's stale baseline.
        resetPushBookkeeping(window._pf.getProjects(), window._pf.getCategories(), window._pf.getArchive(), window._pf.getTrash());
        window._pf.scheduleSave(); window._pf.render(); window._pf.renderSplitList();
        updateLastSync();
        localStorage.removeItem(NEEDS_PULL_KEY);
        window._pf.showToast('☁ Loaded ' + (user.displayName || user.email) + '\u2019s data');
      }).catch(function(err) {
        window._pf.showToast('⚠ Failed to load ' + (user.displayName || user.email) + '\u2019s data: ' + (err && err.message ? err.message : 'unknown error'), true);
        if (window._pf.logError) window._pf.logError('Firebase account-switch load', err);
      }).finally(function() {
        _switchingAccount = false;
        localStorage.setItem(LAST_UID_KEY, user.uid);
        if (_fbAutosync) startListener();
        if (_pendingSwitchUser && _pendingSwitchUser.uid !== user.uid) {
          const next = _pendingSwitchUser;
          _pendingSwitchUser = null;
          setSignedIn(next);
        } else {
          _pendingSwitchUser = null;
        }
      });
      return;
    }
    localStorage.setItem(LAST_UID_KEY, user.uid);

    // Auto-pull if device hasn't synced in over 1 hour (skip on page refresh)
    const isReload = performance && performance.navigation && performance.navigation.type === 1 || (performance.getEntriesByType && performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].type === 'reload');
    if (isReload) return;
    const lastSync = parseInt(localStorage.getItem('pf-firebase-last-sync-time') || '0');
    const elapsed = Date.now() - lastSync;
    if (_fbAutosync && elapsed > 3600000) {
      db.ref('users/' + user.uid + '/updatedAt').once('value').then(function(snap) {
        const remoteTime = snap.val() || 0;
        if (remoteTime > lastSync) {
          if (window._pf && window._pf.snapshot) window._pf.snapshot();
          Promise.all([
            userRef().once('value'),
            catRef().once('value'),
            archiveRef().once('value'),
            trashRef().once('value'),
            notesRef().once('value'),
            noteTombstonesRef().once('value')
          ]).then(function(results) {
            const projVal = results[0].val();
            const catVal = results[1].val();
            const archVal = results[2].val();
            const trashVal = results[3].val();
            const notesVal = results[4].val();
            const tombVal = results[5].val();
            if (catVal) { window._pf.setCategories(Array.isArray(catVal) ? catVal : Object.values(catVal)); window._pf.saveCategories(); }
            if (projVal) { window._pf.setProjects(fixProjects(projVal)); }
            if (archVal) window._pf.setArchive(fixProjects(archVal));
            if (trashVal) window._pf.setTrash(fixProjects(trashVal));
            // Notes adopt the cloud set when the cloud actually has one;
            // an empty cloud leaves local notes alone (background adoption
            // must not wipe notes the user can see right now) — the next
            // push tick uploads them instead.
            const bgNotes = notesVal ? (Array.isArray(notesVal) ? notesVal.filter(Boolean) : Object.values(notesVal).filter(Boolean)) : [];
            const bgTombs = (tombVal && typeof tombVal === 'object') ? tombVal : {};
            if (bgNotes.length > 0 || Object.keys(bgTombs).length > 0) {
              window._pf.adoptCloudNotes(bgNotes, bgTombs);
              _notesPulledThisSession = true;
              _lastPushedNotesHash = JSON.stringify(bgNotes) + '|' + JSON.stringify(bgTombs);
            }
            // Silent background adoption of remote data — reset bookkeeping so
            // this doesn't masquerade as unpushed local edits on the next tick.
            resetPushBookkeeping(window._pf.getProjects(), window._pf.getCategories(), window._pf.getArchive(), window._pf.getTrash());
            window._pf.scheduleSave(); window._pf.render(); window._pf.renderSplitList();
            updateLastSync();
            localStorage.removeItem(NEEDS_PULL_KEY);
            window._pf.showToast('☁ Auto-pulled latest data from cloud');
          }).catch(function(err) {
            window._pf.showToast('⚠ Auto-pull failed: ' + (err && err.message ? err.message : 'unknown error'), true);
            if (window._pf.logError) window._pf.logError('Firebase auto-pull', err);
          });
        }
      }).catch(function(err) {
        if (window._pf.logError) window._pf.logError('Firebase auto-pull check', err);
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
    // Without this, Google silently reuses whatever account is already
    // cached in the browser/OS session instead of showing the account
    // chooser — on iOS Safari especially, this means sign-in always
    // lands on the same account with no way to pick a different one.
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(provider).catch(function(err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        auth.signInWithRedirect(provider);
      } else {
        alert('Sign-in failed: ' + err.message);
        if (window._pf && window._pf.logError) window._pf.logError('Firebase sign-in', err);
      }
    });
  });

  function _doSignout() {
    if (!confirm('Sign out? Your local data on this device will be cleared until you sign back in.')) return;
    if (window._pf && window._pf.stopAutoBackup) window._pf.stopAutoBackup();
    auth.signOut().then(function() {
      try { clearLocalUserData(); } catch (e) {}
      // Deliberately NOT clearing LAST_UID_KEY here. Its whole purpose is
      // to survive the sign-out so the *next* setSignedIn() can tell "this
      // is a different account than was last cached" and force a clear +
      // fresh pull. Wiping it here defeats that check on the very next
      // login, which is exactly what caused account-switch auto-pull to
      // silently stop working (falling through to the much weaker
      // idle->1hr auto-pull heuristic instead).
      window._pf.showToast('🚪 Signed out');
    }).catch(function(err) {
      window._pf.showToast('⚠ Sign out failed: ' + err.message, true);
      if (window._pf.logError) window._pf.logError('Firebase sign out', err);
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

  // Uses the same path as the Ctrl+S "Push to Cloud" button (_firebasePushManual)
  // rather than a separate direct write. The old inline version here skipped
  // categoryEmojis, had no real conflict diff (just a timestamp-newer confirm),
  // and no "already up to date" short-circuit — all of which the Ctrl+S path
  // already handles correctly, so this button now goes through it instead of
  // duplicating (and drifting from) that logic.
  pushBtn.addEventListener('click', function() {
    if (!_fbUser) return;
    window._firebasePushManual();
  });

  function _doPull() {
    if (!_fbUser) { window._pf.showToast('⚠ Sign in first to pull', true); return; }
    window._pf.showToast('☁ Checking cloud data...');
    // Notes must finish their async boot load before the notesMatch
    // comparison below, or a pull issued right after open would see
    // null and skip notes adoption entirely.
    const notesSettled = (window._pf && typeof window._pf.notesReady === 'function' && window._pf.notesReady.then) ? window._pf.notesReady : Promise.resolve();
    notesSettled.then(function() { return Promise.all([
      userRef().once('value'),
      catRef().once('value'),
      archiveRef().once('value'),
      trashRef().once('value'),
      notesRef().once('value'),
      noteTombstonesRef().once('value')
    ]).then(function(results) {
      const projVal = results[0].val();
      const catVal = results[1].val();
      const archVal = results[2].val();
      const trashVal = results[3].val();
      const notesVal = results[4].val();
      const tombVal = results[5].val();
      if (!projVal && !catVal && !notesVal) { window._pf.showToast('⚠ No data found in cloud', true); return; }

      const remoteProjects = fixProjects(projVal);
      const localProjects = window._pf.getProjects();
      const localStr = JSON.stringify(normalizeForSync(localProjects));
      const remoteStr = JSON.stringify(normalizeForSync(remoteProjects));

      const remoteCategories = catVal ? (Array.isArray(catVal) ? catVal : Object.values(catVal)).filter(Boolean) : [];
      const remoteArchive = fixProjects(archVal);
      const remoteTrash = fixProjects(trashVal);
      // Notes: RTDB stores the array as an index-keyed map; normalize back to
      // an array in index order for a plain structural comparison.
      const remoteNotes = notesVal ? (Array.isArray(notesVal) ? notesVal.filter(Boolean) : Object.values(notesVal).filter(Boolean)) : [];
      const remoteNoteTombstones = (tombVal && typeof tombVal === 'object') ? tombVal : {};
      const localNotesSnap = (window._pf.getNotesSnapshot && window._pf.getNotesSnapshot()) || null;
      const notesMatch = !!localNotesSnap
        && JSON.stringify(localNotesSnap.notes) === JSON.stringify(remoteNotes)
        && JSON.stringify(localNotesSnap.tombstones) === JSON.stringify(remoteNoteTombstones);
      const catsMatch = JSON.stringify(remoteCategories) === JSON.stringify(window._pf.getCategories() || []);
      const archMatch = JSON.stringify(normalizeForSync(remoteArchive)) === JSON.stringify(normalizeForSync(window._pf.getArchive() || []));
      const trashMatch = JSON.stringify(normalizeForSync(remoteTrash)) === JSON.stringify(normalizeForSync(window._pf.getTrash() || []));

      db.ref('users/' + _fbUser.uid + '/categoryEmojis').once('value').then(function(emojiSnap) {
        if (emojiSnap.val()) window._pf.setCategoryEmojis(emojiSnap.val());
      });

      if (remoteStr === localStr && catsMatch && archMatch && trashMatch && notesMatch) {
        window._pf.showToast('✅ Local data already matches the cloud');
        localStorage.removeItem(NEEDS_PULL_KEY);
        window._pf.closeAllModals();
        return;
      }

      if (remoteStr !== localStr) {
        // Projects differ from what's on this device — show the same
        // local-vs-cloud comparison the realtime listener uses instead of
        // silently overwriting. The user picks which side to keep.
        // "Keep Remote" also needs categories/archive/trash, which aren't
        // otherwise available to that handler — stash them here.
        if (window._pf && window._pf.snapshot) window._pf.snapshot();
        _pendingPullExtras = { categories: remoteCategories, archive: remoteArchive, trash: remoteTrash, notes: remoteNotes, noteTombstones: remoteNoteTombstones };
        showConflictModal(localProjects, remoteProjects);
        localStorage.removeItem(NEEDS_PULL_KEY);
        return;
      }

      // Projects match, but categories/archive/trash don't — there's
      // nothing for the project-comparison modal to show here, so just
      // pull in whichever of these differ and say exactly what changed,
      // rather than reporting "already up to date" while quietly leaving
      // them stale (the bug this replaces).
      const updated = [];
      if (!catsMatch) { window._pf.setCategories(remoteCategories); window._pf.saveCategories(); updated.push('categories'); }
      if (!archMatch) { window._pf.setArchive(remoteArchive); updated.push('archive'); }
      if (!trashMatch) { window._pf.setTrash(remoteTrash); updated.push('trash'); }
      if (!notesMatch && localNotesSnap) {
        // Cloud has notes and they differ → adopt them wholesale (tombstones
        // union inside replaceNotes decides deletions). Cloud empty + local
        // notes present is a legit fresh-cloud state: leave it to the next
        // push tick, which uploads the local set (fresh-device guard permits
        // it because localHasNotes is true).
        if (remoteNotes.length > 0 || Object.keys(remoteNoteTombstones).length > 0) {
          window._pf.replaceNotes(remoteNotes, remoteNoteTombstones);
          _notesPulledThisSession = true;
          // Bookkeeping: the adopted set is now the baseline — without this,
          // _lastPushedNotesHash stays stale and the next tick re-pushes the
          // just-pulled set back up as if it were a local edit.
          _lastPushedNotesHash = JSON.stringify(pfSnapNotes()) + '|' + JSON.stringify(pfSnapTombs());
          updated.push('notes');
        } else {
          _lastPushedNotesHash = '';
        }
      }
      // Projects didn't change, but categories may have — resync bookkeeping
      // against what's now actually on both sides so a stale _lastPushedCatHash
      // doesn't cause a redundant categories re-push on the next autosync tick.
      resetPushBookkeeping(window._pf.getProjects(), window._pf.getCategories(), window._pf.getArchive(), window._pf.getTrash());
      window._pf.scheduleSave(); window._pf.render(); window._pf.renderSplitList();
      updateLastSync();
      localStorage.removeItem(NEEDS_PULL_KEY);
      window._pf.showToast('⬇ Updated from cloud: ' + updated.join(', '));
      window._pf.closeAllModals();
    }).catch(function(err) {
      window._pf.showToast('⚠ Pull failed: ' + (err.message || err), true);
      if (window._pf.logError) window._pf.logError('Firebase pull', err);
    });
    });
  }
  pullBtn.addEventListener('click', _doPull);
  pullBtn.addEventListener('touchend', function(e) { e.preventDefault(); _doPull(); });

  // Subscribes to remote changes and either applies them or presents a conflict decision.
  function startListener() {
    if (_fbListener || !_fbUser) return;
    if (!window._pfLoaded) { setTimeout(startListener, 500); return; }
    if (!_lastPushedSnapshot) _lastPushedSnapshot = JSON.stringify(normalizeForSync(window._pf.getProjects()));
    _fbListenerUserRef = userRef();
    _fbListener = _fbListenerUserRef.on('value', function(snap) {
      const val = snap.val();
      if (!val) return;
      const remote = fixProjects(val);
      const localStr = JSON.stringify(normalizeForSync(window._pf.getProjects()));
      const remoteStr = JSON.stringify(normalizeForSync(remote));
      if (remoteStr !== localStr) {
        const localProjects = JSON.parse(localStr);
        const localChanged = localStr !== _lastPushedSnapshot;
        if (localChanged && _lastPushedSnapshot && _lastPushedSnapshot !== remoteStr) {
          showConflictModal(localProjects, remote);
        } else {
          // Snapshot the incoming remote's normalized shape BEFORE scheduleSave()/
          // render() run — scheduleSave() calls autoUpdateStatuses(), which can
          // mutate this same object (setProjects() assigns it by reference) to
          // correct a project's status/completedAt. Resetting bookkeeping from
          // that post-mutation state would make it look like the correction
          // already matches the cloud, when it was only ever applied locally —
          // so the correction would never actually get pushed up.
          const preMutationRemote = JSON.parse(JSON.stringify(remote));
          window._pf.setProjects(remote);
          window._pf.scheduleSave(); window._pf.render();
          updateLastSync();
          // Reset all push bookkeeping (not just the snapshot) to what was just
          // silently adopted — otherwise the next autosync tick diffs against a
          // stale pre-listener baseline and can echo a partial write back up.
          resetPushBookkeeping(preMutationRemote, window._pf.getCategories());
          window._pf.showToast('☁ Synced from cloud');
        }
      }
    });
    _fbListenerCatRef = catRef();
    _fbListenerCatRef.on('value', function(snap) {
      const val = snap.val();
      if (!val) return;
      const remote = Array.isArray(val) ? val : Object.values(val);
      if (JSON.stringify(remote) !== JSON.stringify(window._pf.getCategories())) {
        window._pf.setCategories(remote);
        window._pf.saveCategories(); window._pf.render();
      }
    });
  }

  function stopListener() {
    // Detach using the refs captured at attach time — NOT userRef()/catRef()
    // recomputed from the current _fbUser, which may already be null or
    // pointing at a different account by the time this runs.
    if (_fbListenerUserRef && _fbListener) _fbListenerUserRef.off('value', _fbListener);
    if (_fbListenerCatRef) _fbListenerCatRef.off('value');
    _fbListener = null;
    _fbListenerUserRef = null;
    _fbListenerCatRef = null;
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
      // Route through pushSelective() rather than writing directly, so
      // _lastPushedSnapshot/_lastPushedHash/_lastPushedIdOrder/_lastPushedCatHash
      // stay in sync — a direct write here left them stale and could cause
      // a false conflict-modal trigger on the next listener event.
      pushSelective();
      window._pf.showToast('☁ Offline changes synced');
    }
  });

  // Selective sync: track last pushed state, only push changed projects
  let _lastPushedHash = {};
  let _lastPushedIdOrder = [];
  function hashProject(p) { return JSON.stringify(normalizeForSync([p])[0]); }
  function buildHashMap(projects) {
    const map = {};
    projects.forEach(p => { map[p.id] = hashProject(p); });
    return map;
  }

  // Resets push-tracking bookkeeping to match projects/categories that were just
  // silently adopted from the cloud (auto-pull, account switch, realtime listener,
  // deliberate full push, etc). Without this the next autosync tick diffs against
  // a stale pre-pull baseline and can echo a partial/incorrect write back up, or
  // spuriously trigger the conflict modal.
  // archive/trash are optional: pass them whenever the call site actually knows
  // both sides now match (e.g. after writing/adopting them); omit them when this
  // call site only touched projects/categories, so their bookkeeping is left as
  // whatever it already correctly was rather than being guessed at.
  function resetPushBookkeeping(projects, categories, archive, trash) {
    _lastPushedHash = buildHashMap(projects);
    _lastPushedIdOrder = projects.map(p => p.id);
    _lastPushedCatHash = JSON.stringify(categories);
    _lastPushedSnapshot = JSON.stringify(normalizeForSync(projects));
    if (typeof archive !== 'undefined') _lastPushedArchiveHash = JSON.stringify(normalizeForSync(archive));
    if (typeof trash !== 'undefined') _lastPushedTrashHash = JSON.stringify(normalizeForSync(trash));
    const notesSnap = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    _lastPushedNotesHash = notesSnap ? (JSON.stringify(notesSnap.notes) + '|' + JSON.stringify(notesSnap.tombstones)) : '';
  }

  // Pushes only changed project records where possible; deletions or reordering fall back to a full project write
  // (index-keyed partial updates can't safely represent an order change on their own).
  function pushSelective() {
    try { _pushSelectiveInner(); } catch (err) { window._pf.showToast('⚠ Push failed: ' + (err.message || err), true); logError('Firebase push', err); }
  }
  function _pushSelectiveInner() {
    const projects = window._pf.getProjects();
    const categories = window._pf.getCategories();
    const currentHash = buildHashMap(projects);
    const currentIdOrder = projects.map(p => p.id);
    const orderChanged = JSON.stringify(currentIdOrder) !== JSON.stringify(_lastPushedIdOrder);
    const updates = {};
    let hasChanges = false;

    // Detect changed/new projects
    projects.forEach((p, i) => {
      if (_lastPushedHash[p.id] !== currentHash[p.id]) {
        updates['users/' + _fbUser.uid + '/projects/' + i] = JSON.parse(JSON.stringify(p));
        hasChanges = true;
      }
    });

    // Detect deleted projects (in old hash but not current). Comparing
    // counts alone (oldIds.length > projects.length) misses a delete+add
    // in the same window that leaves the count unchanged — check the
    // actual id sets instead.
    const currentIds = new Set(projects.map(p => p.id));
    const oldIds = Object.keys(_lastPushedHash);
    const hasDeletion = oldIds.some(id => !currentIds.has(id));
    if (hasDeletion || orderChanged) {
      // Full push needed when projects removed (index shift) or reordered — partial index-keyed
      // updates would otherwise leave unchanged projects at their old cloud position.
      userRef().set(JSON.parse(JSON.stringify(projects)));
      hasChanges = true;
    } else if (hasChanges) {
      db.ref('users/' + _fbUser.uid).update(updates);
    }
    _lastPushedIdOrder = currentIdOrder;

    // Always sync categories and emojis (small data)
    const catHash = JSON.stringify(categories);
    const catChanged = catHash !== _lastPushedCatHash;
    if (catChanged) {
      catRef().set(JSON.parse(JSON.stringify(categories)));
      _lastPushedCatHash = catHash;
    }
    try { db.ref('users/' + _fbUser.uid + '/categoryEmojis').set(JSON.parse(JSON.stringify(window._pf.getCategoryEmojis()))); } catch(e) { logError('Firebase push (categoryEmojis)', e); }

    try { pushNotesIfNeeded().catch(function(e) { logError('Firebase push (notes)', e); }); } catch(e) { logError('Firebase push (notes)', e); }

    if (hasChanges || catChanged) {
      db.ref('users/' + _fbUser.uid + '/updatedAt').set(Date.now());
      _lastPushedHash = currentHash;
      updateLastSync();
    }
    _lastPushedSnapshot = JSON.stringify(normalizeForSync(projects));
  }
  let _lastPushedCatHash = '';
  let _lastPushedArchiveHash = '';
  let _lastPushedTrashHash = '';
  let _lastPushedNotesHash = '';
  // Flipped once this session has adopted notes FROM the cloud (pull,
  // realtime listener, or Keep Remote). Until then, a device whose local
  // notes are empty must never push that emptiness up — it would erase the
  // cloud notes before the first pull had a chance to bring them down.
  let _notesPulledThisSession = false;

  // Notes sync (Phase C follow-up): notes ride the cloud as one flat JSON
  // payload plus a tombstones map — same full-set pattern as archive/trash
  // (bulk, low-velocity, no realtime listener). The fresh-device guard above
  // makes an empty local set a no-op against a populated cloud.
  function pfSnapNotes() {
    const s = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    return s ? s.notes : [];
  }
  function pfSnapTombs() {
    const s = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    return s ? s.tombstones : {};
  }
  function pushNotesIfNeeded() {
    const notesSnap = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    if (!notesSnap) return Promise.resolve();
    const notesHash = JSON.stringify(notesSnap.notes) + '|' + JSON.stringify(notesSnap.tombstones);
    if (notesHash === _lastPushedNotesHash) return Promise.resolve();
    const localHasNotes = notesSnap.notes.length > 0 || Object.keys(notesSnap.tombstones).length > 0;
    return notesRef().once('value').then(function(snap) {
      const remoteNotes = snap.val();
      const remoteCount = remoteNotes ? (Array.isArray(remoteNotes) ? remoteNotes.filter(Boolean).length : Object.keys(remoteNotes).length) : 0;
      if (!localHasNotes && remoteCount > 0 && !_notesPulledThisSession) {
        _lastPushedNotesHash = notesHash; // remember so we don't retry every tick
        return undefined;
      }
      return Promise.all([
        notesRef().set(JSON.parse(JSON.stringify(notesSnap.notes))),
        noteTombstonesRef().set(JSON.parse(JSON.stringify(notesSnap.tombstones)))
      ]).then(function() { _lastPushedNotesHash = notesHash; });
    });
  }

  // Performs a deliberate full cloud save of projects, categories, archive, and trash.
  function pushWithTimestamp() {
    const projects = window._pf.getProjects();
    resetPushBookkeeping(projects, window._pf.getCategories(), window._pf.getArchive(), window._pf.getTrash());
    const writePromise = Promise.all([
      userRef().set(JSON.parse(JSON.stringify(projects))),
      catRef().set(JSON.parse(JSON.stringify(window._pf.getCategories()))),
      db.ref('users/' + _fbUser.uid + '/categoryEmojis').set(JSON.parse(JSON.stringify(window._pf.getCategoryEmojis()))),
      archiveRef().set(JSON.parse(JSON.stringify(window._pf.getArchive()))),
      trashRef().set(JSON.parse(JSON.stringify(window._pf.getTrash()))),
      pushNotesIfNeeded().catch(function(e) { logError('Firebase push (notes)', e); }),
      db.ref('users/' + _fbUser.uid + '/updatedAt').set(Date.now())
    ]);
    writePromise.then(function() { updateLastSync(); });
    return writePromise;
  }

  // Hook into scheduleSave to push on every change when autosync is on (debounced)
  let _fbPushTimer = null;
  window._firebasePull = function() { if (pullBtn) pullBtn.click(); };
  window._firebasePush = function() {
    if (!_fbAutosync || !_fbUser) return;
    if (!window._pfLoaded) return;
    if (!navigator.onLine) { _fbOfflineQueue = true; return; }
    clearTimeout(_fbPushTimer);
    _fbPushTimer = setTimeout(function() {
      pushSelective();
    }, PUSH_DEBOUNCE_MS);
  };
  window._firebasePushNow = function() {
    if (!_fbAutosync || !_fbUser) return;
    if (!window._pfLoaded) return;
    if (!navigator.onLine) { _fbOfflineQueue = true; return; }
    clearTimeout(_fbPushTimer);
    pushSelective();
  };
  // Manual "Push to Cloud" (Ctrl+S dialog): only requires being signed in — must work even with autosync off.
  window._firebasePushManual = function() {
    if (!_fbUser) { window._pf.showToast('⚠ Sign in first to push', true); return; }
    if (!navigator.onLine) { window._pf.showToast('⚠ You are offline. Will sync when back online', true); _fbOfflineQueue = true; return; }
    clearTimeout(_fbPushTimer);
    // Fast path: if local data hasn't moved since our own last known-good push,
    // we already know we match the cloud — no need to ask it. Skipping the round
    // trip here isn't just an optimization: it avoids a real race where pressing
    // this again right after a push (e.g. right after "Keep Local & Push") reads
    // the cloud before that write has finished landing, sees the old value, and
    // pops a phantom conflict for data that's actually identical.
    // All four tracked slices must match — checking only projects/categories
    // would let a genuine archive/trash divergence slip past unsynced.
    const localSnapshotNow = JSON.stringify(normalizeForSync(window._pf.getProjects()));
    const localCatHashNow = JSON.stringify(window._pf.getCategories());
    const localArchiveHashNow = JSON.stringify(normalizeForSync(window._pf.getArchive() || []));
    const localTrashHashNow = JSON.stringify(normalizeForSync(window._pf.getTrash() || []));
    const notesSnapNow = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    const localNotesHashNow = notesSnapNow ? (JSON.stringify(notesSnapNow.notes) + '|' + JSON.stringify(notesSnapNow.tombstones)) : '';
    if (localSnapshotNow === _lastPushedSnapshot && localCatHashNow === _lastPushedCatHash &&
        localArchiveHashNow === _lastPushedArchiveHash && localTrashHashNow === _lastPushedTrashHash &&
        localNotesHashNow === _lastPushedNotesHash) {
      window._pf.showToast('✅ Already up to date with cloud');
      return;
    }
    window._pf.showToast('☁ Checking cloud data...');
    Promise.all([
      userRef().once('value'),
      catRef().once('value'),
      archiveRef().once('value'),
      trashRef().once('value'),
      notesRef().once('value'),
      noteTombstonesRef().once('value')
    ]).then(function(results) {
      const projVal = results[0].val();
      const catVal = results[1].val();
      const archVal = results[2].val();
      const trashVal = results[3].val();
      const notesVal = results[4].val();
      const tombVal = results[5].val();
      const remoteProjects = fixProjects(projVal);
      const localProjects = window._pf.getProjects();
      const localStr = JSON.stringify(normalizeForSync(localProjects));
      const remoteStr = JSON.stringify(normalizeForSync(remoteProjects));

      const remoteCategories = catVal ? (Array.isArray(catVal) ? catVal : Object.values(catVal)).filter(Boolean) : [];
      const remoteArchive = fixProjects(archVal);
      const remoteTrash = fixProjects(trashVal);
      const remoteNotes = notesVal ? (Array.isArray(notesVal) ? notesVal.filter(Boolean) : Object.values(notesVal).filter(Boolean)) : [];
      const remoteNoteTombstones = (tombVal && typeof tombVal === 'object') ? tombVal : {};
      const localNotesSnap = (window._pf.getNotesSnapshot && window._pf.getNotesSnapshot()) || null;
      const notesMatch = !!localNotesSnap
        && JSON.stringify(localNotesSnap.notes) === JSON.stringify(remoteNotes)
        && JSON.stringify(localNotesSnap.tombstones) === JSON.stringify(remoteNoteTombstones);
      const catsMatch = JSON.stringify(remoteCategories) === JSON.stringify(window._pf.getCategories() || []);
      const archMatch = JSON.stringify(normalizeForSync(remoteArchive)) === JSON.stringify(normalizeForSync(window._pf.getArchive() || []));
      const trashMatch = JSON.stringify(normalizeForSync(remoteTrash)) === JSON.stringify(normalizeForSync(window._pf.getTrash() || []));
      const fullMatch = remoteStr === localStr && catsMatch && archMatch && trashMatch && notesMatch;

      if (projVal && fullMatch) {
        window._pf.showToast('✅ Already up to date with cloud');
        return;
      }

      if (!projVal || remoteStr === localStr) {
        // Nothing in the cloud yet, or projects already match this device
        // (though categories/archive/trash may not — pushWithTimestamp()
        // sends all of it, so this still resolves that divergence too).
        pushWithTimestamp().then(function() {
          window._pf.showToast('☁ Pushed to cloud');
        }).catch(function(err) {
          window._pf.showToast('❌ Push failed: ' + (err && err.message ? err.message : 'unknown error'), true);
          if (window._pf.logError) window._pf.logError('Firebase push', err);
        });
        return;
      }

      // Cloud has different project data than this device — probably
      // edited on another device since the last sync. Show the same
      // local-vs-cloud comparison instead of silently overwriting it.
      if (window._pf && window._pf.snapshot) window._pf.snapshot();
      _pendingPullExtras = { categories: remoteCategories, archive: remoteArchive, trash: remoteTrash, notes: remoteNotes, noteTombstones: remoteNoteTombstones };
      showConflictModal(localProjects, remoteProjects);
    }).catch(function(err) {
      window._pf.showToast('⚠ Failed to check cloud data: ' + (err && err.message ? err.message : 'unknown error'), true);
      if (window._pf.logError) window._pf.logError('Firebase check cloud data', err);
    });
  };
  if (typeof window.fsAutoSaveHook === 'undefined' || !window.fsAutoSaveHook) window.fsAutoSaveHook = window._firebasePush;
  else {
    const _prevHook = window.fsAutoSaveHook;
    window.fsAutoSaveHook = function() { _prevHook(); window._firebasePush(); };
  }

  // #13 Auto-backup to Firebase (once per day, keeps last 7 backups)
  function autoBackupToFirebase() {
    if (!_fbUser) return;
    const today = window._pf.todayLocalStr();
    const lastBackup = localStorage.getItem('pf-firebase-last-backup');
    if (lastBackup === today) return;
    const backupRef = db.ref('users/' + _fbUser.uid + '/backups/' + today);
    const notesSnap = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    backupRef.set({
      projects: JSON.parse(JSON.stringify(window._pf.getProjects())),
      categories: JSON.parse(JSON.stringify(window._pf.getCategories())),
      // Notes ride the daily cloud backup too (null when notes haven't
      // loaded — mirrors buildFullBackupPayload's omit-not-empty[] rule).
      notes: notesSnap ? JSON.parse(JSON.stringify(notesSnap.notes)) : null,
      noteTombstones: notesSnap ? JSON.parse(JSON.stringify(notesSnap.tombstones)) : null,
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
    backupsList.innerHTML = '<div style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);padding:6px;">Loading backups...</div>';
    db.ref('users/' + _fbUser.uid + '/backups').once('value').then(function(snap) {
      const val = snap.val();
      if (!val) { backupsList.innerHTML = '<div style="font-size: calc(var(--font-size-base) - 4px);color:var(--text-dim);padding:6px;">No backups found.</div>'; return; }
      const keys = Object.keys(val).sort().reverse();
      backupsList.innerHTML = keys.map(function(k) {
        const b = val[k];
        const projCount = b.projects ? (Array.isArray(b.projects) ? b.projects.length : Object.keys(b.projects).length) : 0;
        const date = new Date(b.timestamp || 0);
        const label = k + ' &middot; ' + projCount + ' projects &middot; ' + date.toLocaleTimeString();
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px;border-bottom:1px solid var(--card-border);gap:8px;">' +
          '<span style="font-size: calc(var(--font-size-base) - 4px);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</span>' +
          '<button class="pf-undo-btn pf-backup-restore-btn" data-backup-key="' + k + '" style="font-size: calc(var(--font-size-base) - 5px);padding:3px 8px;flex-shrink:0;">Restore</button></div>';
      }).join('');
      backupsList.querySelectorAll('.pf-backup-restore-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const key = btn.dataset.backupKey;
          if (!confirm('Restore backup from ' + key + '? This will overwrite your current data.')) return;
          window._pf.snapshot();
          const b = val[key];
          if (b.projects) {
            const p = Array.isArray(b.projects) ? b.projects : Object.values(b.projects);
            window._pf.setProjects(p);
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

  // Conflict modal logic
  let _lastPushedSnapshot = '';
  let _pendingRemote = null;
  // Populated only when the conflict modal was opened from a manual Pull
  // (which also fetched categories/archive/trash alongside projects) so
  // "Keep Remote" can apply all of it, not just projects. Left null when
  // the modal was opened from the realtime listener or a manual Push,
  // neither of which have this extra data on hand.
  let _pendingPullExtras = null;
  // Closes the modal without applying either side — the Escape-key
  // equivalent of Cancel. Safe to leave unresolved: the same conflict
  // will simply be re-detected and re-shown on the next sync/listener
  // event, since neither local nor cloud data was touched.
  function dismissConflictModal() {
    document.getElementById('pf-conflict-modal').classList.remove('pf-conflict-open');
    _pendingRemote = null;
    _pendingPullExtras = null;
  }
  if (window._pf && window._pf.registerEscDismissable) {
    window._pf.registerEscDismissable({
      key: 'conflict',
      check: () => document.getElementById('pf-conflict-modal').classList.contains('pf-conflict-open'),
      run: dismissConflictModal
    });
  }
  // Presents local versus cloud state; the user explicitly chooses which version wins.
  function showConflictModal(local, remote) {
    _pendingRemote = remote;
    const modal = document.getElementById('pf-conflict-modal');
    const localEl = document.getElementById('pf-conflict-local');
    const remoteEl = document.getElementById('pf-conflict-remote');
    const diffDetails = {};
    function countChanges(list) {
      let tasks = 0, completed = 0, ongoing = 0;
      list.forEach(p => { if (p.subtasks) p.subtasks.forEach(function walk(s) { tasks++; if (s.status === 'completed') completed++; if (s.status === 'ongoing') ongoing++; if (s.subtasks) s.subtasks.forEach(walk); }); });
      return { projects: list.length, tasks, completed, ongoing };
    }
    const localStats = countChanges(local);
    const remoteStats = countChanges(remote);
    const localMore = localStats.tasks > remoteStats.tasks || localStats.completed > remoteStats.completed;
    const remoteMore = remoteStats.tasks > localStats.tasks || remoteStats.completed > localStats.completed;
    const localBadge = localMore ? ' ⭐ More changes' : '';
    const remoteBadge = remoteMore ? ' ⭐ More changes' : '';
    function findDiffs(localList, remoteList) {
      // Reuse the same normalization used for the top-level sync decision:
      // strip transient `expanded` state, and treat a `null` field the same
      // as a missing one (Firebase deletes any key set to `null`, so an
      // empty due date always comes back from the cloud as an absent key,
      // not `null` — comparing them raw made every empty-due-date subtask
      // look permanently "changed").
      function forDiff(p) {
        if (!p || typeof p !== 'object') return p;
        return normalizeForSync([p])[0];
      }
      // Walks two subtask trees (by id) to describe what changed below a
      // modified project — not just how many subtasks differ, but which
      // ones and which fields, since "2 changed" alone isn't actionable.
      function fieldLabel(key, val) {
        if (key === 'status') return { label: 'status', val: val };
        if (key === 'title') return { label: 'title', val: '"' + val + '"' };
        if (key === 'dueAt') return { label: 'due date', val: val ? new Date(val).toLocaleDateString() : 'none' };
        // completedAt is tracked (see the fields list below) because the app's
        // auto-status-correction logic (checkAllCompleted/autoUpdateStatuses)
        // can silently rewrite it independent of any field a user edited
        // directly. Leaving it untracked meant a project could be flagged
        // "Modified (in both, but different)" with literally nothing shown
        // in the diff — which is confusing and looks like a false positive
        // even when the underlying mismatch is real.
        if (key === 'completedAt') return { label: 'completed on', val: val ? new Date(val).toLocaleDateString() : 'not completed' };
        return null; // other fields (createdAt, expanded, id) are noise, not worth naming
      }
      function diffSubtasks(localSubs, remoteSubs) {
        const entries = []; // { title, kind: 'local-only'|'cloud-only'|'changed', fields: [{label, from, to}] }
        const lMap = {}; (localSubs || []).forEach(s => { lMap[s.id] = s; });
        const rMap = {}; (remoteSubs || []).forEach(s => { rMap[s.id] = s; });
        // A subtask only in remote doesn't exist locally yet — from the
        // local device's point of view that's "cloud-only", not "added"
        // (added/removed has no fixed side and was being read backwards:
        // a subtask the user just created locally, never pushed, showed
        // up as "(removed)" here even though nothing was removed).
        (remoteSubs || []).forEach(s => { if (!lMap[s.id]) entries.push({ title: s.title || 'Untitled', kind: 'cloud-only' }); });
        (localSubs || []).forEach(s => {
          const r = rMap[s.id];
          if (!r) { entries.push({ title: s.title || 'Untitled', kind: 'local-only' }); return; }
          const fields = [];
          ['title', 'status', 'dueAt', 'completedAt'].forEach(function(key) {
            // Normalize null/undefined/'' to the same sentinel before comparing —
            // Firebase strips `null` fields on write, so a local `dueAt: null`
            // and a remote missing `dueAt` key are the same "no due date", not a
            // real change. Empty string is included too: it's another "empty"
            // representation that fieldLabel() below renders identically to
            // null/undefined, so it must be treated the same way going in.
            function norm(v) {
              if (v === null || typeof v === 'undefined' || v === '') return null;
              if (key === 'title' && typeof v === 'string') return v.trim();
              return v;
            }
            const sVal = norm(s[key]);
            const rVal = norm(r[key]);
            const from = fieldLabel(key, sVal);
            const to = fieldLabel(key, rVal);
            // Compare the rendered label, not the raw value. This is the real
            // safeguard: even if some other falsy variant slips past norm(),
            // two values that display identically (e.g. both show as "none")
            // can never be reported as a "changed" field — which previously
            // produced unresolvable phantom conflicts like "due date: none → none".
            if (from && to && JSON.stringify(from.val) !== JSON.stringify(to.val)) {
              fields.push({ label: from.label, from: from.val, to: to.val });
            }
          });
          if (fields.length) entries.push({ title: s.title || 'Untitled', kind: 'changed', fields: fields });
          entries.push.apply(entries, diffSubtasks(s.subtasks, r.subtasks));
        });
        return entries;
      }
      const localMap = {}; localList.forEach(p => { localMap[p.id] = p; });
      const remoteMap = {}; remoteList.forEach(p => { remoteMap[p.id] = p; });
      const added = remoteList.filter(p => !localMap[p.id]);
      const removed = localList.filter(p => !remoteMap[p.id]);
      const changed = localList.filter(p => remoteMap[p.id] && JSON.stringify(forDiff(p)) !== JSON.stringify(forDiff(remoteMap[p.id])));
      // Attach a subtask diff + whether the project's own fields (title,
      // status, due date, etc.) changed, for display in the modal.
      changed.forEach(p => {
        const r = remoteMap[p.id];
        const lShallow = forDiff(Object.assign({}, p, { subtasks: [] }));
        const rShallow = forDiff(Object.assign({}, r, { subtasks: [] }));
        diffDetails[p.id] = {
          ownFields: JSON.stringify(lShallow) !== JSON.stringify(rShallow),
          subtaskEntries: diffSubtasks(p.subtasks, r.subtasks)
        };
      });
      return { added, removed, changed };
    }
    const diffs = findDiffs(local, remote);
    // Different projects can share the same title — most commonly several
    // untitled cards all still called "New project". Listing bare titles
    // then makes unrelated entries in different sections (or even the same
    // section) look like duplicates or contradictions. When a title repeats
    // within the full diff, tag each occurrence with a short id fragment so
    // it's clear they're distinct projects.
    const allDiffed = diffs.changed.concat(diffs.added, diffs.removed);
    const titleCounts = {};
    allDiffed.forEach(p => { const t = p.title || 'Untitled'; titleCounts[t] = (titleCounts[t] || 0) + 1; });
    function labelFor(p) {
      const t = p.title || 'Untitled';
      const esc = window._pf.escapeHtml(t);
      let label = esc;
      if (titleCounts[t] > 1 && p.id) label += ' <span style="opacity:0.6;">(#' + window._pf.escapeHtml(p.id.slice(-4)) + ')</span>';
      const details = diffDetails[p.id] || {};
      if (details.ownFields) label += ' <span style="opacity:0.6;">(details changed)</span>';
      const entries = details.subtaskEntries;
      if (entries && entries.length) {
        const shown = entries.slice(0, 4).map(function(e) {
          const et = window._pf.escapeHtml(e.title);
          if (e.kind === 'local-only') return '&nbsp;&nbsp;+ ' + et + ' <span style="opacity:0.6;">(new, local only)</span>';
          if (e.kind === 'cloud-only') return '&nbsp;&nbsp;− ' + et + ' <span style="opacity:0.6;">(cloud only)</span>';
          const fieldStr = e.fields.map(function(f) {
            return f.label + ': ' + window._pf.escapeHtml(String(f.from)) + ' → ' + window._pf.escapeHtml(String(f.to));
          }).join(', ');
          return '&nbsp;&nbsp;~ ' + et + ' <span style="opacity:0.6;">(' + fieldStr + ')</span>';
        });
        const more = entries.length > 4 ? '<br>&nbsp;&nbsp;…+' + (entries.length - 4) + ' more' : '';
        label += '<br>' + shown.join('<br>') + more;
      }
      return label;
    }
    let diffHtml = '';
    // Ownership first: what each side has that the other doesn't. A project
    // only in cloud is cloud-only; a project only local is local-only.
    // Skip a section entirely when it has nothing in it.
    if (diffs.removed.length) diffHtml += '<b>Local has (not in cloud): ' + diffs.removed.length + ':</b><br>' + diffs.removed.slice(0, 3).map(p => '• ' + labelFor(p)).join('<br>') + '<br>';
    if (diffs.added.length) diffHtml += '<b>Cloud has (not in local): ' + diffs.added.length + ':</b><br>' + diffs.added.slice(0, 3).map(p => '• ' + labelFor(p)).join('<br>') + '<br>';
    // Projects that exist on both sides but differ aren't "owned" by either
    // side, so they get their own section rather than being duplicated into
    // both blocks above — shown once, with what changed underneath.
    if (diffs.changed.length) diffHtml += '<b>Modified (in both, but different): ' + diffs.changed.length + ':</b><br>' + diffs.changed.slice(0, 5).map(p => '• ' + labelFor(p)).join('<br>') + (diffs.changed.length > 5 ? '<br>…+' + (diffs.changed.length - 5) + ' more' : '') + '<br>';
    if (!diffHtml) diffHtml = 'Minor differences detected';
    localEl.innerHTML = '<b>Local:</b> ' + local.length + ' projects · ' + localStats.tasks + ' tasks · ' + localStats.completed + ' done' + (localBadge ? '<br><span style="color:var(--accent);font-weight:700;">' + localBadge + '</span>' : '');
    remoteEl.innerHTML = '<b>Cloud:</b> ' + remote.length + ' projects · ' + remoteStats.tasks + ' tasks · ' + remoteStats.completed + ' done' + (remoteBadge ? '<br><span style="color:var(--accent);font-weight:700;">' + remoteBadge + '</span>' : '') + '<br><br>' + diffHtml;
    modal.classList.add('pf-conflict-open');
    if (window._pf && window._pf.markOverlayOpen) window._pf.markOverlayOpen('conflict');
  }
  document.getElementById('pf-conflict-keep-local').addEventListener('click', function() {
    // Overwriting the cloud can permanently discard changes that only
    // exist there (e.g. edits made on another device). Confirm first,
    // matching the pattern used elsewhere (backup restore) for
    // destructive, one-way actions.
    if (!confirm('This will overwrite the cloud with your local data. Any cloud-only changes will be lost. Continue?')) return;
    dismissConflictModal();
    pushWithTimestamp().then(function() {
      window._pf.showToast('✅ Kept local data & pushed to cloud');
      window._pf.closeAllModals();
    }).catch(function(err) {
      window._pf.showToast('❌ Push failed: ' + (err && err.message ? err.message : 'unknown error'), true);
      if (window._pf.logError) window._pf.logError('Firebase conflict push', err);
    });
  });
  document.getElementById('pf-conflict-keep-remote').addEventListener('click', function() {
    // Applying cloud data overwrites whatever is only on this device
    // (local-only projects, unsynced edits). Confirm first, same as
    // Keep Local, so neither side of this decision is a single misclick.
    if (!confirm('This will replace your local data with the cloud version. Any local-only changes will be lost. Continue?')) return;
    const remoteToApply = _pendingRemote;
    const extrasToApply = _pendingPullExtras;
    dismissConflictModal();
    if (remoteToApply) {
      const categoriesToApply = (extrasToApply && extrasToApply.categories) ? extrasToApply.categories : window._pf.getCategories();
      const archiveToApply = (extrasToApply && extrasToApply.archive) ? extrasToApply.archive : window._pf.getArchive();
      const trashToApply = (extrasToApply && extrasToApply.trash) ? extrasToApply.trash : window._pf.getTrash();
      // Snapshot exactly what the cloud actually has, BEFORE adopting it locally.
      // setProjects() below assigns this same array into the live `projects`
      // reference, and scheduleSave()/render() that follow can immediately
      // mutate it in place — scheduleSave() runs autoUpdateStatuses(), which
      // silently "corrects" a project's status/completedAt if its subtasks
      // don't match it, and render() can trigger a layout pass too. Capturing
      // the baseline from the (already-mutated) same reference afterwards made
      // bookkeeping think that correction already matched the cloud, when it
      // was actually only ever applied locally — so pushSelective() never sent
      // it up, and the next check found a real, unsynced difference and
      // reopened the conflict modal. Cloning here, before any of that runs,
      // means a real correction shows up as a real diff and actually gets
      // pushed.
      const preMutationProjects = JSON.parse(JSON.stringify(remoteToApply));

      window._pf.setProjects(remoteToApply);
      if (extrasToApply) {
        if (extrasToApply.categories) { window._pf.setCategories(extrasToApply.categories); window._pf.saveCategories(); }
        window._pf.setArchive(extrasToApply.archive);
        window._pf.setTrash(extrasToApply.trash);
        if (extrasToApply.notes) {
          window._pf.adoptCloudNotes(extrasToApply.notes, extrasToApply.noteTombstones || {});
          _notesPulledThisSession = true;
          _lastPushedNotesHash = JSON.stringify(extrasToApply.notes) + '|' + JSON.stringify(extrasToApply.noteTombstones || {});
        }
      }
      window._pf.scheduleSave(); window._pf.render(); window._pf.renderSplitList();
      resetPushBookkeeping(preMutationProjects, categoriesToApply, archiveToApply, trashToApply);
      updateLastSync();
      window._pf.showToast('☁ Using cloud data');
      // scheduleSave() above runs autoUpdateStatuses() synchronously (before its
      // own debounced localStorage write), so if it "corrected" a project's
      // status/completedAt, that correction already exists in the live
      // `projects` array right now — it just hasn't reached the cloud yet.
      // Left alone, that only happens via the normal autosync hook, which is
      // debounced twice (scheduleSave's 350ms, then pushSelective's own
      // PUSH_DEBOUNCE_MS on top) — a window of a few seconds where local and
      // cloud genuinely differ. A manual push (Ctrl+S) inside that window reads
      // the still-stale cloud value and reopens this same conflict modal for
      // data that's about to reconcile itself anyway. Pushing immediately here
      // (bypassing the debounce) closes that window instead of waiting it out.
      if (_fbAutosync && _fbUser) {
        clearTimeout(_fbPushTimer);
        pushSelective();
      }
      window._pf.closeAllModals();
    }
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
  if (_fbUser) db.ref('users/' + _fbUser.uid + '/appVersion').set(APP_VERSION);
  auth.onAuthStateChanged(function(u) { if (u) db.ref('users/' + u.uid + '/appVersion').set(APP_VERSION); });
})();
