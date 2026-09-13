    // SUBSECTION: Notes — standalone note-taking (top-bar Notes view)
  // Notes are intentionally NOT part of the projects graph: they persist
  // under their own storage key, so export/import of projects is unaffected.
  // Autosave follows the scheduleSave debounce idiom (350ms trailing edge).
  const NOTES_KEY = 'project-flow-notes';
  const NOTES_TOMB_KEY = 'project-flow-notes-tombstones';
  let notes = [];
  // Deletion tombstones: { id, at }. Deliberately deleted notes must stay
  // deleted when snapshot recovery resurrects an older copy that still
  // contains them. Pruned to the most recent 200.
  let noteTombstones = {};
  let notesLoaded = false;
  let activeNoteId = null;
  let notesSearch = '';
  let notesSaveTimer = null;
  let notesSelection = [];   // multi-select ids, in click order
  let lastClickedNoteId = null; // shift-range anchor

  const notesPanelEl = document.getElementById('pf-notes-panel');
  const notesListEl = document.getElementById('pf-notes-list');
  const notesEditorEmptyEl = document.getElementById('pf-notes-editor-empty');
  const notesEditorMainEl = document.getElementById('pf-notes-editor-main');
  const noteTitleEl = document.getElementById('pf-note-title');
  const noteBodyEl = document.getElementById('pf-note-body');
  const noteCountEl = document.getElementById('pf-note-count');
  const notePinLabelEl = document.getElementById('pf-note-pin-label');

  function noteById(id) { return notes.find(n => n.id === id); }

  // ===== Notes↔project links (NEXT-PLAN Phase A) =====
  // Links are plain text tokens in the note body — @project:<id> — derived at
  // render time, never stored separately, so they ride existing persistence
  // (sync, export/import, snapshots, tombstones, recycle bin) for free.
  // Resolution: exact id first; fall back to a stored name in the token
  // ("@project:<id> Name"), so hand-typed or renamed links keep working.
  var NOTE_LINK_RE = /@project:([A-Za-z0-9_-]+)(?:\s+([^@\n]*))?/g;
  function parseNoteLinks(body) {
    var out = [];
    if (!body) return out;
    var m;
    NOTE_LINK_RE.lastIndex = 0;
    while ((m = NOTE_LINK_RE.exec(body)) !== null) {
      var token = m[0], id = m[1], label = (m[2] || '').trim();
      var target = (window._pf.getProjects() || []).find(p => p.id === id);
      var byName = null;
      if (!target && label) {
        var q = label.toLowerCase();
        byName = (window._pf.getProjects() || []).find(p => (p.title || '').toLowerCase() === q) || null;
      }
      out.push({ id: id, label: label || (target ? target.title : ''), token: token,
        project: target || byName, missing: !(target || byName) });
    }
    return out;
  }
  function noteLinks(n) { return n ? parseNoteLinks(n.body) : []; }
  function noteLinkChipsHtml(n) {
    var links = noteLinks(n);
    if (!links.length) return '';
    var chips = links.map(function(l) {
      var cls = l.missing ? 'pf-note-link-chip pf-note-link-missing' : 'pf-note-link-chip';
      return '<button class="' + cls + '" data-note-link="' + escapeHtml(l.id) + '" title="' +
        (l.missing ? 'Project not found (link kept)' : 'Open project: ' + escapeHtml(l.project.title)) + '">' +
        pfIcon('link', 'pf-note-link-ic') + escapeHtml(l.label || l.project && l.project.title || l.id) + '</button>';
    }).join('');
    return '<div class="pf-note-links">' + chips + '</div>';
  }
  // Bridge: notes → project detail (shared IIFE scope keeps this tiny).
  function openProjectFromNote(id) {
    var p = (window._pf.getProjects() || []).find(pr => pr.id === id);
    if (!p) { showToast('Project not found', true); return; }
    closeAllModals();
    if (typeof window._splitSelect === 'function') window._splitSelect(p.id, null);
  }
  // Project-side: linked notes for a project id, used by the detail pane.
  window._pf.notesForProject = function(projectId) {
    return notes.filter(function(n) { return !noteTombstones[n.id] && noteLinks(n).some(function(l) { return l.id === projectId; }); });
  };
  // Project-side navigation seam: open Notes view on a specific note (wired in slice 2).
  window._pf.openNoteFromProject = function(noteId) {
    openNotesPanel();
    setTimeout(function() { selectNote(noteId); }, 0);
  };

  async function loadNotes() {
    if (notesLoaded) return;
    try { const res = await safeGet(NOTES_KEY, false); if (res && res.value) notes = JSON.parse(res.value); } catch (e) { notes = []; logError('Load notes', e); }
    try { const res2 = await safeGet(NOTES_TOMB_KEY, false); if (res2 && res2.value) noteTombstones = JSON.parse(res2.value) || {}; } catch (e) { noteTombstones = {}; }
    notesLoaded = true;
  }
  function saveTombstones() { safeSet(NOTES_TOMB_KEY, JSON.stringify(noteTombstones), false); }
  function recordNoteTombstone(id) {
    if (!id) return;
    noteTombstones[id] = new Date().toISOString();
    const ids = Object.keys(noteTombstones);
    if (ids.length > 200) {
      ids.sort((a, b) => noteTombstones[a].localeCompare(noteTombstones[b]));
      ids.slice(0, ids.length - 200).forEach(k => delete noteTombstones[k]);
    }
    saveTombstones();
  }
  function isTombstoned(id) { return Object.prototype.hasOwnProperty.call(noteTombstones, id); }
  function saveNotes() {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(async () => {
      const res = await safeSet(NOTES_KEY, JSON.stringify(notes), false);
      if (!res) { showToast('⚠ Note save failed', true); logError('Save notes', new Error('safeSet failed')); }
      // Nudge the auto-snapshot so a fresh copy lands within seconds of an
      // edit, not at the next 5-minute tick.
      if (typeof _maybeSaveSnapshot === 'function') { try { _maybeSaveSnapshot(); } catch (e) {} }
    }, 350);
  }

  function fmtNoteDate(iso) {
    if (!iso) return '';
    try { const d = new Date(iso); if (isNaN(d.getTime())) return ''; return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function noteMatches(n) {
    if (!notesSearch) return true;
    const t = notesSearch.toLowerCase();
    return (n.title || '').toLowerCase().includes(t) || (n.body || '').toLowerCase().includes(t);
  }

  function renderNotesList() {
    const visible = notes.filter(noteMatches).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!visible.length) {
      notesListEl.innerHTML = '<div class="pf-notes-list-empty">' + (notes.length ? 'No notes match.' : 'No notes yet.') + '</div>';
      return;
    }
    notesListEl.innerHTML = visible.map(n => {
      const sel = n.id === activeNoteId ? ' pf-notes-item-active' : '';
      const checked = notesSelection.indexOf(n.id) !== -1;
      const pin = n.pinned ? ' <svg class="pf-ic pf-notes-pin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.7z"/></svg>' : '';
      const preview = (n.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Empty note';
      return '<div class="pf-notes-item' + sel + (checked ? ' pf-notes-item-checked' : '') + '" data-note-id="' + n.id + '">' +
        '<span class="pf-notes-check" data-note-check="' + n.id + '" role="checkbox" aria-checked="' + checked + '" tabindex="0" title="Select" aria-label="Select note: ' + escapeHtml(n.title || 'Untitled') + '"></span>' +
        '<div class="pf-notes-item-main">' +
        '<div class="pf-notes-item-title">' + escapeHtml(n.title || 'Untitled') + pin +
          '<button class="pf-notes-item-del" data-note-del="' + n.id + '" title="Delete note" aria-label="Delete note: ' + escapeHtml(n.title || 'Untitled') + '">' + pfIcon('trash', 'pf-notes-del-ic') + '</button>' +
        '</div>' +
        '<div class="pf-notes-item-preview">' + escapeHtml(preview) + '</div>' +
        noteLinkChipsHtml(n) +
        '<div class="pf-notes-item-date">' + fmtNoteDate(n.updatedAt) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
    notesListEl.querySelectorAll('[data-note-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.getAttribute('data-note-id');
        if (e.target.closest('[data-note-del]')) return; // delete button handles itself
        if (e.target.closest('[data-note-check]')) return; // checkbox handles itself
        if (e.target.closest('[data-note-link]')) { openProjectFromNote(e.target.closest('[data-note-link]').getAttribute('data-note-link')); return; }
        if (e.ctrlKey || e.metaKey) { // ctrl/cmd-click on the row toggles selection too
          const idx = notesSelection.indexOf(id);
          if (idx === -1) notesSelection.push(id); else notesSelection.splice(idx, 1);
          lastClickedNoteId = id;
          renderNotesList();
          return;
        }
        selectNote(id);
      });
    });
    notesListEl.querySelectorAll('[data-note-check]').forEach(el => {
      const toggle = (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-note-check');
        const idx = notesSelection.indexOf(id);
        if (e.shiftKey && notesSelection.length && lastClickedNoteId) {
          // shift-click: range select over the *visible* order
          const ids = [...notesListEl.querySelectorAll('[data-note-check]')].map(x => x.getAttribute('data-note-check'));
          const a = ids.indexOf(lastClickedNoteId), b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) if (notesSelection.indexOf(ids[i]) === -1) notesSelection.push(ids[i]);
          }
        } else if (idx === -1) { notesSelection.push(id); }
        else { notesSelection.splice(idx, 1); }
        lastClickedNoteId = id;
        renderNotesList();
        renderNotesSelBar();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(e); } });
    });
    notesListEl.querySelectorAll('[data-note-del]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-note-del');
        const n = noteById(id);
        if (!n) return;
        if (!confirm('Move note "' + (n.title || 'Untitled') + '" to the Recycle Bin?')) return;
        deleteNoteById(id); // Undo toast comes from the chokepoint
      });
    });
    renderNotesSelBar();
  }

  function renderNotesSelBar() {
    let bar = document.getElementById('pf-notes-selbar');
    if (!notesSelection.length) { if (bar) bar.remove(); return; }
    const pins = notesSelection.filter(id => { const n = noteById(id); return n && n.pinned; }).length;
    const bodies = notesSelection.map(id => { const n = noteById(id); return n ? ((n.title ? n.title + '\n\n' : '') + (n.body || '')).trim() : ''; }).filter(Boolean);
    const allText = bodies.join('\n\n---\n\n');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'pf-notes-selbar';
      bar.id = 'pf-notes-selbar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Selected notes actions');
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-note-action]');
        if (!btn) return;
        const action = btn.dataset.noteAction;
        if (action === 'pin') {
          const anyUnpinned = notesSelection.some(id => { const n = noteById(id); return n && !n.pinned; });
          notesSelection.forEach(id => { const n = noteById(id); if (n) n.pinned = anyUnpinned; });
          saveNotes(); renderNotesList(); showToast(anyUnpinned ? '✓ Pinned ' + notesSelection.length : '✓ Unpinned ' + notesSelection.length);
        } else if (action === 'copy') {
          copyTextToClipboard(allText, notesSelection.length + (notesSelection.length === 1 ? ' note' : ' notes') + ' copied');
        } else if (action === 'delete') {
          if (!confirm('Move ' + notesSelection.length + ' note' + (notesSelection.length === 1 ? '' : 's') + ' to the Recycle Bin?')) return;
          const ids = notesSelection.slice();
          ids.forEach(id => deleteNoteById(id, { silent: true }));
          notesSelection = [];
          renderNotesList(); renderNotesEditor();
          showToast('Moved ' + ids.length + ' note' + (ids.length === 1 ? '' : 's') + ' to Recycle Bin', false, false, () => {
            ids.forEach(id => { if (typeof window._pf.restoreFromTrash === 'function') window._pf.restoreFromTrash(id); });
          }, 'Undo');
        } else if (action === 'clear') {
          notesSelection = []; renderNotesList();
        }
      });
      notesPanelEl.appendChild(bar);
    }
    bar.innerHTML = '<span class="pf-notes-sel-count">' + notesSelection.length + ' selected</span>' +
      '<span class="pf-notes-sel-sep"></span>' +
      '<button class="pf-selbar-btn" data-note-action="pin">' + (pins < notesSelection.length ? 'Pin' : 'Unpin') + '</button>' +
      '<button class="pf-selbar-btn" data-note-action="copy">Copy</button>' +
      '<button class="pf-selbar-btn" data-note-action="delete" style="color:var(--danger);">Delete</button>' +
      '<button class="pf-selbar-btn pf-selbar-close" data-note-action="clear" title="Clear selection">✕</button>' +
      '<span class="pf-notes-sel-hint">Ctrl-click for one-by-one · Shift-click for a range</span>';
    bar.setAttribute('aria-label', notesSelection.length + ' notes selected');
  }

  function copyTextToClipboard(text, msg) {
    if (!text) { showToast('Nothing to copy', true); return; }
    const doFallback = () => {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        showToast('✓ ' + msg);
      } catch (e) { showToast('⚠ Copy failed', true); logError('Copy notes', e); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('✓ ' + msg), doFallback);
    } else doFallback();
  }

  noteBodyEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      indentSelection(e.shiftKey);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      toggleCheckboxLines();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      toggleCheckedLines();
    }
  });

  // live-refresh the view when switching modes after edits
  noteBodyEl.addEventListener('input', renderNoteView);

  function renderNotesEditor() {
    const n = noteById(activeNoteId);
    if (!n) {
      notesEditorEmptyEl.style.display = 'flex';
      notesEditorMainEl.style.display = 'none';
      noteViewMode = 'edit';
      renderNoteView();
      return;
    }
    notesEditorEmptyEl.style.display = 'none';
    notesEditorMainEl.style.display = 'flex';
    if (noteTitleEl.value !== (n.title || '')) noteTitleEl.value = n.title || '';
    if (noteBodyEl.value !== (n.body || '')) noteBodyEl.value = n.body || '';
    notePinLabelEl.textContent = n.pinned ? 'Unpin' : 'Pin';
    document.getElementById('pf-note-pin').title = n.pinned ? 'Unpin from top' : 'Pin to top';
    updateNoteCount();
    renderNoteView();
  }

  function updateNoteCount() {
    const body = noteBodyEl.value;
    const words = body.trim() ? body.trim().split(/\s+/).length : 0;
    noteCountEl.textContent = words + (words === 1 ? ' word · ' : ' words · ') + body.length + ' chars';
  }

  function selectNote(id) {
    activeNoteId = id;
    renderNotesList();
    renderNotesEditor();
    if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) notesPanelEl.classList.add('pf-notes-mobile-edit');
  }

  function newNote() {
    const n = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', body: '', pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    notes.unshift(n);
    noteViewMode = 'edit';
    saveNotes();
    activeNoteId = n.id;
    renderNotesList();
    renderNotesEditor();
    noteTitleEl.focus();
  }

  // Single deletion chokepoint: bin + tombstone + remove + persist + re-render.
  // Every delete path (row ×, footer button, bulk bar) funnels through here,
  // as do automated tests — one code path means one place for the durability
  // contract to live. Notes land in the recycle bin (30-day TTL); the
  // tombstone still records the deletion so snapshot recovery can't
  // resurrect a note the user deliberately binned. The toast carries an
  // Undo button (restore-from-bin is the undo — same function the bin's
  // Restore button calls). Pass { silent: true } to suppress it (bulk
  // batches show one restore-all toast instead).
  function deleteNoteById(id, opts) {
    const n = noteById(id);
    if (!n) return false;
    notes = notes.filter(x => x.id !== id);
    notesSelection = notesSelection.filter(x => x !== id);
    if (activeNoteId === id) activeNoteId = null;
    if (typeof trashNote === 'function') trashNote(n); // recycle bin (06)
    recordNoteTombstone(id);
    saveNotes();
    renderNotesList();
    renderNotesEditor();
    renderNotesSelBar();
    if (!(opts && opts.silent)) {
      const label = n.title || 'Untitled';
      showToast('"' + label + '" moved to Recycle Bin', false, false, () => {
        if (typeof window._pf.restoreFromTrash === 'function') window._pf.restoreFromTrash(id);
      }, 'Undo');
    }
    return true;
  }
  window._pf.deleteNoteById = deleteNoteById;

  function deleteActiveNote() {
    if (!noteById(activeNoteId)) return;
    if (!confirm('Move this note to the Recycle Bin?')) return;
    deleteNoteById(activeNoteId); // Undo toast comes from the chokepoint
  }

  function togglePin() {
    const n = noteById(activeNoteId);
    if (!n) return;
    n.pinned = !n.pinned;
    n.updatedAt = new Date().toISOString();
    saveNotes();
    renderNotesList();
    renderNotesEditor();
  }

  async function copyActiveNote() {
    const n = noteById(activeNoteId);
    if (!n) return;
    const text = ((n.title ? n.title + '\n\n' : '') + (n.body || '')).trim();
    if (!text) { showToast('Nothing to copy', true); return; }
    try {
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text); copied = true; } catch (clipErr) { /* permission/context rejection: fall through to execCommand */ }
      }
      if (!copied) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      showToast('✓ Note copied');
    } catch (e) { showToast('⚠ Copy failed', true); logError('Copy note', e); }
  }

  function commitNoteField() {
    const n = noteById(activeNoteId);
    if (!n) return;
    const title = noteTitleEl.value.replace(/\s+/g, ' ').trim().slice(0, 120);
    const body = noteBodyEl.value.slice(0, 100000);
    if (title !== (n.title || '') || body !== (n.body || '')) {
      n.title = title; n.body = body; n.updatedAt = new Date().toISOString();
      saveNotes();
      renderNotesList();
    }
  }

  function openNotesPanel() {
    loadNotes().then(() => {
      notesSelection = [];
      lastClickedNoteId = null;
      renderNotesList();
      renderNotesEditor();
      openModal(notesPanelEl, 'flex');
    });
  }

  document.getElementById('pf-notes-btn').addEventListener('click', openNotesPanel);
  document.getElementById('pf-note-new').addEventListener('click', newNote);
  document.getElementById('pf-note-del').addEventListener('click', deleteActiveNote);
  document.getElementById('pf-note-pin').addEventListener('click', togglePin);
  document.getElementById('pf-note-copy').addEventListener('click', copyActiveNote);
  document.getElementById('pf-note-list').addEventListener('click', () => toggleCheckboxLines());
  document.getElementById('pf-note-view').addEventListener('click', toggleNoteView);
  document.getElementById('pf-notes-search').addEventListener('input', (e) => { notesSearch = e.target.value.trim(); renderNotesList(); });
  noteTitleEl.addEventListener('input', () => { clearTimeout(notesSaveTimer); notesSaveTimer = setTimeout(commitNoteField, 350); });
  noteTitleEl.addEventListener('blur', commitNoteField);
  noteBodyEl.addEventListener('input', () => { updateNoteCount(); clearTimeout(notesSaveTimer); notesSaveTimer = setTimeout(commitNoteField, 350); });
  noteBodyEl.addEventListener('blur', commitNoteField);

  // ===== @-mention popup (Phase A slice 2): type @ in the body to link a project
  let mentionPopEl = null, mentionItems = [], mentionIdx = 0, mentionStart = -1;
  function closeMentionPopup() { if (mentionPopEl) { mentionPopEl.remove(); mentionPopEl = null; } }
  function mentionQueryAtCaret() {
    const pos = noteBodyEl.selectionStart;
    const m = noteBodyEl.value.slice(0, pos).match(/(?:^|\s)@([A-Za-z0-9_-]*)$/);
    return m ? { q: m[1], start: pos - m[1].length - 1 } : null;
  }
  function buildMentionPop() {
    mentionPopEl = document.createElement('div');
    mentionPopEl.className = 'pf-mention-pop';
    mentionPopEl.id = 'pf-mention-pop';
    notesPanelEl.appendChild(mentionPopEl);
    const tr = noteBodyEl.getBoundingClientRect(), pr = notesPanelEl.getBoundingClientRect();
    mentionPopEl.style.left = Math.max(8, tr.left - pr.left) + 'px';
    mentionPopEl.style.top = (tr.bottom - pr.top - 4) + 'px';
  }
  function renderMentionPopup() {
    const st = mentionQueryAtCaret();
    if (!st) { closeMentionPopup(); return; }
    const q = st.q.toLowerCase();
    mentionItems = (window._pf.getProjects() || []).filter(p => (p.title || '').toLowerCase().indexOf(q) !== -1).slice(0, 6);
    mentionStart = st.start;
    if (mentionIdx >= mentionItems.length) mentionIdx = Math.max(0, mentionItems.length - 1);
    if (!mentionPopEl) buildMentionPop();
    mentionPopEl.innerHTML = mentionItems.length
      ? mentionItems.map((p, i) => '<button type="button" class="pf-mention-item' + (i === mentionIdx ? ' pf-mention-active' : '') + '" data-mention-i="' + i + '">' + pfIcon('folder', 'pf-mention-ic') + escapeHtml(p.title || 'Untitled') + '</button>').join('')
      : '<div class="pf-mention-empty">No matching project</div>';
    mentionPopEl.querySelectorAll('[data-mention-i]').forEach(el => {
      el.addEventListener('mousedown', (ev) => { ev.preventDefault(); insertMention(mentionItems[+el.dataset.mentionI]); });
    });
  }
  function insertMention(p) {
    if (!p) { closeMentionPopup(); return; }
    const pos = noteBodyEl.selectionStart;
    const before = noteBodyEl.value.slice(0, mentionStart), after = noteBodyEl.value.slice(pos);
    const ins = '@project:' + p.id + ' ' + (p.title || '') + ' ';
    noteBodyEl.value = before + ins + after;
    const np = (before + ins).length;
    noteBodyEl.focus();
    noteBodyEl.setSelectionRange(np, np);
    closeMentionPopup();
    noteBodyEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
  noteBodyEl.addEventListener('input', renderMentionPopup);
  noteBodyEl.addEventListener('keydown', (e) => {
    if (!mentionPopEl) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx = Math.min(mentionIdx + 1, mentionItems.length - 1); renderMentionPopup(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx = Math.max(mentionIdx - 1, 0); renderMentionPopup(); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && mentionItems.length) { e.preventDefault(); insertMention(mentionItems[mentionIdx]); }
    else if (e.key === 'Escape') { closeMentionPopup(); e.stopPropagation(); }
  });
  noteBodyEl.addEventListener('blur', () => { setTimeout(closeMentionPopup, 150); });
  window._pf.registerEscDismissable({ check: () => !!mentionPopEl, run: closeMentionPopup });

  // ===== Editor enrichment: indent, checkboxes, checklist view =====
  const INDENT = '  '; // two spaces per level
  const CHECK_RE = /^(\s*)(\[ \]|\[x\])\s+/i;
  let noteViewMode = 'edit';

  function getSelectionLines(ta) {
    const v = ta.value;
    const start = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = v.indexOf('\n', ta.selectionEnd);
    if (end === -1) end = v.length;
    return { start, end };
  }

  function applyToSelectionLines(fn) {
    const { start, end } = getSelectionLines(noteBodyEl);
    const v = noteBodyEl.value;
    const lines = v.slice(start, end).split('\n').map(fn);
    const next = v.slice(0, start) + lines.join('\n') + v.slice(end);
    noteBodyEl.value = next;
    // restore selection spanning the same lines
    noteBodyEl.selectionStart = start;
    noteBodyEl.selectionEnd = start + lines.join('\n').length;
    noteBodyEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function indentSelection(outdent) {
    applyToSelectionLines((line) => {
      if (outdent) return line.replace(/^ {1,2}|^\t/, '');
      return line ? INDENT + line : line;
    });
  }

  function toggleCheckboxLines() {
    const { start, end } = getSelectionLines(noteBodyEl);
    const lines = noteBodyEl.value.slice(start, end).split('\n');
    const hasBox = (l) => /^\s*(\[ \]|\[x\])\s/i.test(l);
    // if any selected line lacks a checkbox, add to all that lack one; else remove all
    const anyMissing = lines.some(l => !hasBox(l));
    applyToSelectionLines((line) => {
      if (anyMissing) {
        if (hasBox(line) || !line.trim()) return line;
        const indent = line.match(/^\s*/)[0];
        return indent + '[ ] ' + line.slice(indent.length);
      }
      return line.replace(CHECK_RE, '$1');
    });
    noteBodyEl.focus();
  }

  function toggleCheckedLines() {
    applyToSelectionLines((line) => {
      if (/^\s*\[ \]/.test(line)) return line.replace('[ ]', '[x]');
      if (/^\s*\[x\]/i.test(line)) return line.replace(/\[x\]/i, '[ ]');
      return line;
    });
  }

  function toggleNoteView() {
    commitNoteField();
    noteViewMode = noteViewMode === 'edit' ? 'view' : 'edit';
    renderNoteView();
  }

  function renderNoteView() {
    const n = noteById(activeNoteId);
    const isView = noteViewMode === 'view' && n;
    document.getElementById('pf-note-view-label').textContent = isView ? 'Edit' : 'View';
    noteBodyEl.style.display = isView ? 'none' : '';
    const pv = document.getElementById('pf-note-preview');
    pv.style.display = isView ? '' : 'none';
    if (!isView) return;
    // render lines: checkbox -> interactive; indentation -> padding; everything escaped
    const lines = (n.body || '').split('\n');
    pv.innerHTML = lines.map((line, idx) => {
      const esc = escapeHtml(line);
      const indent = line.match(/^\s*/)[0].length;
      const m = line.match(/^\s*\[( |x)\]\s+(.*)$/i);
      if (m) {
        return '<div class="pf-note-line pf-note-checkline' + (m[1].toLowerCase() === 'x' ? ' pf-note-done' : '') + '" style="padding-left:' + (indent * 9) + 'px">' +
          '<span class="pf-note-cbox" role="checkbox" aria-checked="' + (m[1].toLowerCase() === 'x') + '" tabindex="0" data-line="' + idx + '" aria-label="' + escapeHtml(m[2] || 'item') + '"></span>' +
          '<span class="pf-note-line-text">' + escapeHtml(m[2] || '') + '</span></div>';
      }
      if (!line.trim()) return '<div class="pf-note-line pf-note-blank">&nbsp;</div>';
      return '<div class="pf-note-line" style="padding-left:' + (indent * 9) + 'px">' + esc + '</div>';
    }).join('');
  }

  // preview checkbox flips the source line and re-renders
  document.getElementById('pf-note-preview').addEventListener('click', (e) => {
    const box = e.target.closest('[data-line]');
    if (!box) return;
    flipLineCheckbox(Number(box.getAttribute('data-line')));
  });
  document.getElementById('pf-note-preview').addEventListener('keydown', (e) => {
    const box = e.target.closest('[data-line]');
    if (!box) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipLineCheckbox(Number(box.getAttribute('data-line'))); }
  });

  function flipLineCheckbox(idx) {
    const n = noteById(activeNoteId);
    if (!n) return;
    const lines = (n.body || '').split('\n');
    if (idx < 0 || idx >= lines.length) return;
    const line = lines[idx];
    if (/^\s*\[ \]/.test(line)) lines[idx] = line.replace('[ ]', '[x]');
    else if (/^\s*\[x\]/i.test(line)) lines[idx] = line.replace(/\[x\]/i, '[ ]');
    else return;
    n.body = lines.join('\n');
    n.updatedAt = new Date().toISOString();
    noteBodyEl.value = n.body; // keep the (hidden) textarea in sync so a later blur-commit can't clobber the flip
    saveNotes();
    renderNoteView();
    renderNotesList(); // preview text in list may change
  }

  // ===== Backup integration =====
  // Notes ride in auto-snapshots and full export/import. getNotesSnapshot
  // returns null until notes have loaded (never report a boot-time empty
  // array as real data); restoreNotesSnapshot only accepts notes when the
  // primary store yielded nothing at boot (keeps recovery one-way).
  let notesLoadedEmpty = false; // primary store read succeeded but had no notes

  window._pf.getNotesSnapshot = function() {
    if (!notesLoaded) return null;
    return { notes: notes.slice(), tombstones: Object.assign({}, noteTombstones) };
  };
  window._pf.restoreNotesSnapshot = function(snapNotes, snapTombstones) {
    if (!Array.isArray(snapNotes)) return;
    // Union tombstones: a deletion recorded in ANY copy (live or snapshot)
    // must win, or recovery would resurrect notes the user deleted after
    // that snapshot was taken.
    if (snapTombstones && typeof snapTombstones === 'object') {
      Object.keys(snapTombstones).forEach(k => { if (!isTombstoned(k) || (noteTombstones[k] || '') < (snapTombstones[k] || '')) noteTombstones[k] = snapTombstones[k]; });
      saveTombstones();
    }
    if (notesLoaded && notes.length) return; // live data exists; recovery is only for loss
    notes = snapNotes.filter(n => n && typeof n === 'object' && typeof n.id === 'string' && !isTombstoned(n.id))
      .map(n => ({ id: n.id, title: String(n.title || '').slice(0, 120), body: String(n.body || '').slice(0, 100000), pinned: !!n.pinned, createdAt: n.createdAt || new Date().toISOString(), updatedAt: n.updatedAt || new Date().toISOString() }));
    notesLoaded = true;
    notesLoadedEmpty = false;
    saveNotes();
  };
  window._pf.clearNotesRuntime = function() {
    notes = []; notesLoaded = true; notesLoadedEmpty = false; activeNoteId = null; notesSelection = [];
    renderNotesList(); renderNotesEditor();
  };

  window._pf.getNotesTombstones = function() { return Object.assign({}, noteTombstones); };

  // Recycle-bin bridge (06): a binned note re-enters the live set. Clearing
  // the tombstone matters — otherwise boot recovery would immediately
  // re-delete what the user just restored.
  window._pf.adoptRestoredNote = function(note) {
    if (!note || typeof note.id !== 'string') return;
    delete noteTombstones[note.id];
    saveTombstones();
    if (!noteById(note.id)) {
      notes.push(note);
      saveNotes();
    }
    notesLoaded = true;
    renderNotesList();
  };

  // Eager load at boot: guarantees the 5-minute snapshot tick and manual
  // exports see real notes data instead of the pre-load null/[].
  (function eagerLoadNotes() {
    loadNotes().then(() => {
      notesLoadedEmpty = notes.length === 0;
      // Primary store yielded nothing at boot — try snapshot recovery before
      // declaring the notes truly gone. Runs regardless of project state.
      if (notesLoadedEmpty && window._pf && typeof window._pf.recoverNotesFromSnapshot === 'function') {
        window._pf.recoverNotesFromSnapshot().then((n) => {
          if (n > 0) showToast('♻️ Recovered ' + n + ' note' + (n === 1 ? '' : 's') + ' from backup');
        });
      }
    });
  })();

  // Import bridge: replace the in-memory set (merge already done by caller),
  // persist, and refresh any open UI.
  window._pf.replaceNotes = function(nextNotes, incomingTombstones) {
    if (!Array.isArray(nextNotes)) return;
    const clean = nextNotes.filter(n => n && typeof n === 'object' && typeof n.id === 'string');
    if (!clean.length) return; // never let a malformed import wipe real notes
    // Union incoming tombstones (newest wins), then drop imported notes that
    // are tombstoned — a deletion recorded anywhere must win everywhere.
    if (incomingTombstones && typeof incomingTombstones === 'object') {
      Object.keys(incomingTombstones).forEach(k => { if (!isTombstoned(k) || (noteTombstones[k] || '') < (incomingTombstones[k] || '')) noteTombstones[k] = incomingTombstones[k]; });
    }
    const visible = clean.filter(n => !isTombstoned(n.id));
    if (!visible.length && clean.length) { saveTombstones(); return; }
    // An import that omits a locally-present note means the user deleted it
    // in the other copy — tombstone the difference so the deletion survives.
    const importedIds = new Set(visible.map(n => n.id));
    notes.filter(n => !importedIds.has(n.id)).forEach(n => recordNoteTombstone(n.id));
    notes = visible;
    notesLoaded = true;
    if (activeNoteId && !noteById(activeNoteId)) activeNoteId = null;
    saveTombstones();
    saveNotes();
    renderNotesList();
    renderNotesEditor();
  };
