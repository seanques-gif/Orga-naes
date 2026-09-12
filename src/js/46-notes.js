    // SUBSECTION: Notes — standalone note-taking (top-bar Notes view)
  // Notes are intentionally NOT part of the projects graph: they persist
  // under their own storage key, so export/import of projects is unaffected.
  // Autosave follows the scheduleSave debounce idiom (350ms trailing edge).
  const NOTES_KEY = 'project-flow-notes';
  let notes = [];
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

  async function loadNotes() {
    if (notesLoaded) return;
    try { const res = await safeGet(NOTES_KEY, false); if (res && res.value) notes = JSON.parse(res.value); } catch (e) { notes = []; logError('Load notes', e); }
    notesLoaded = true;
  }
  function saveNotes() {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(async () => {
      const res = await safeSet(NOTES_KEY, JSON.stringify(notes), false);
      if (!res) { showToast('⚠ Note save failed', true); logError('Save notes', new Error('safeSet failed')); }
    }, 350);
  }

  function fmtNoteDate(iso) {
    try { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
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
        '<div class="pf-notes-item-date">' + fmtNoteDate(n.updatedAt) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
    notesListEl.querySelectorAll('[data-note-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.getAttribute('data-note-id');
        if (e.target.closest('[data-note-del]')) return; // delete button handles itself
        if (e.target.closest('[data-note-check]')) return; // checkbox handles itself
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
        if (!confirm('Delete note "' + (n.title || 'Untitled') + '"? This cannot be undone.')) return;
        notes = notes.filter(x => x.id !== id);
        if (activeNoteId === id) activeNoteId = null;
        notesSelection = notesSelection.filter(x => x !== id);
        saveNotes();
        renderNotesList();
        renderNotesEditor();
        renderNotesSelBar();
        showToast('Note deleted');
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
          if (!confirm('Delete ' + notesSelection.length + ' note' + (notesSelection.length === 1 ? '' : 's') + '? This cannot be undone.')) return;
          const ids = notesSelection.slice();
          notes = notes.filter(x => ids.indexOf(x.id) === -1);
          if (ids.indexOf(activeNoteId) !== -1) activeNoteId = null;
          notesSelection = [];
          saveNotes(); renderNotesList(); renderNotesEditor();
          showToast('Deleted ' + ids.length + ' note' + (ids.length === 1 ? '' : 's'));
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

  function renderNotesEditor() {
    const n = noteById(activeNoteId);
    if (!n) {
      notesEditorEmptyEl.style.display = 'flex';
      notesEditorMainEl.style.display = 'none';
      return;
    }
    notesEditorEmptyEl.style.display = 'none';
    notesEditorMainEl.style.display = 'flex';
    if (noteTitleEl.value !== (n.title || '')) noteTitleEl.value = n.title || '';
    if (noteBodyEl.value !== (n.body || '')) noteBodyEl.value = n.body || '';
    notePinLabelEl.textContent = n.pinned ? 'Unpin' : 'Pin';
    document.getElementById('pf-note-pin').title = n.pinned ? 'Unpin from top' : 'Pin to top';
    updateNoteCount();
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
    saveNotes();
    activeNoteId = n.id;
    renderNotesList();
    renderNotesEditor();
    noteTitleEl.focus();
  }

  function deleteActiveNote() {
    const n = noteById(activeNoteId);
    if (!n) return;
    if (!confirm('Delete this note? This cannot be undone.')) return;
    notes = notes.filter(x => x.id !== activeNoteId);
    notesSelection = notesSelection.filter(x => x !== activeNoteId);
    activeNoteId = null;
    saveNotes();
    renderNotesList();
    renderNotesEditor();
    showToast('Note deleted');
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
  document.getElementById('pf-notes-search').addEventListener('input', (e) => { notesSearch = e.target.value.trim(); renderNotesList(); });
  noteTitleEl.addEventListener('input', () => { clearTimeout(notesSaveTimer); notesSaveTimer = setTimeout(commitNoteField, 350); });
  noteTitleEl.addEventListener('blur', commitNoteField);
  noteBodyEl.addEventListener('input', () => { updateNoteCount(); clearTimeout(notesSaveTimer); notesSaveTimer = setTimeout(commitNoteField, 350); });
  noteBodyEl.addEventListener('blur', commitNoteField);
