  // SUBSECTION: Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      const ae = document.activeElement; if (ae && ae.isContentEditable) return; if (!root.contains(ae) && ae !== document.body) return;
      e.preventDefault(); if (e.shiftKey) redo(); else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!root.classList.contains('pf-device-desktop')) return;
      const saveModal = document.createElement('div');
      saveModal.style.cssText = 'position:fixed;inset:0;z-index:calc(var(--z-drag) + 1);display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
      saveModal.innerHTML = '<div style="background:var(--card,#12161c);border:1px solid var(--card-border,#232a34);border-radius:var(--radius-overlay);padding:24px;min-width:260px;text-align:center;color:var(--text,#d7dde5);">' +
        '<div style="font-size: calc(var(--font-size-base) + 2px);font-weight:700;margin-bottom:16px;">Save</div>' +
        '<button id="_save-local" style="display:block;width:100%;padding:10px;margin-bottom:8px;border:none;border-radius:var(--radius-container);background:var(--accent,#2fd4ff);color:var(--accent-contrast,#04141b);font-size:var(--font-size-base);font-weight:600;cursor:pointer;">💾 Save to Local (JSON)</button>' +
        '<button id="_save-cloud" style="display:block;width:100%;padding:10px;margin-bottom:8px;border:none;border-radius:var(--radius-container);background:var(--accent,#2fd4ff);color:var(--accent-contrast,#04141b);font-size:var(--font-size-base);font-weight:600;cursor:pointer;">☁ Push to Cloud</button>' +
        '<button id="_save-cancel" style="display:block;width:100%;padding:10px;border:none;border-radius:var(--radius-container);background:transparent;color:var(--text-dim,#8b95a3);font-size: calc(var(--font-size-base) - 1px);cursor:pointer;">Cancel</button>' +
        '</div>';
      // Inside #pf-root so palette tokens resolve on every theme.
      document.getElementById('pf-root').appendChild(saveModal);
      _saveModalEl = saveModal;
      const _removeSaveModal = function() { saveModal.remove(); if (_saveModalEl === saveModal) _saveModalEl = null; };
      saveModal.querySelector('#_save-local').addEventListener('click', function() { _removeSaveModal(); document.getElementById('pf-export').click(); });
      saveModal.querySelector('#_save-cloud').addEventListener('click', function() { _removeSaveModal(); if (window._firebasePushManual) window._firebasePushManual(); else showToast('⚠ Sign in first to push', true); });
      saveModal.querySelector('#_save-cancel').addEventListener('click', function() { _removeSaveModal(); });
      saveModal.addEventListener('click', function(ev) { if (ev.target === saveModal) _removeSaveModal(); });
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); const sw = document.getElementById('pf-search-wrap'); const si = document.getElementById('pf-search'); sw.classList.add('pf-search-open'); si.focus(); si.select();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      const ae = document.activeElement; if (ae && ae.isContentEditable) return;
      e.preventDefault(); redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (!subMultiSelect.length && !splitMultiSelect.length) return;
      e.preventDefault();
      const clip = buildClipboardFromSelection();
      if (!clip || !clip.length) return;
      _taskClipboard = clip;
      const n = clip.length;
      clearSubSelect(); root.querySelectorAll('.pf-sub-select-bar').forEach(el => el.remove());
      splitMultiSelect = []; if (listViewActive) { renderSplitList(); renderSplitDetail(); }
      showToast((n > 1 ? n + ' tasks' : 'Task') + ' copied. Click a project to paste as main task(s), or a task to nest under it');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (!_taskClipboard || !_taskClipboard.length) return;
      e.preventDefault();
      _pasteArmed = true;
      root.classList.add('pf-paste-armed');
      showToast('Click a project to paste as main task(s), or a task to nest under it (Esc to cancel)');
    }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && root.classList.contains('pf-device-desktop')) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); closeAllModals(); openModal(shortcutsPanel, 'flex');
    }
    if (e.key === 'Escape') { handleEscape(); }
    if (e.key === 'Enter' && selectedProjectId) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); toggleExpand(selectedProjectId);
    }
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault(); document.getElementById('pf-new-project').click();
    }
    if (e.key === 'N' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      if (listViewActive && splitSelectedId) { const sel = projects.find(p => p.id === splitSelectedId); addProject(sel ? sel.category : null); }
      else { document.getElementById('pf-new-project').click(); }
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (listViewActive) return;
      const ae = document.activeElement; if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      const visible = projects.filter(p => matchesSearch(p) && !(p.category && collapsedCategories[p.category]));
      if (!visible.length) return;
      e.preventDefault();
      const sorted = visible.slice().sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);
      let idx = sorted.findIndex(p => p.id === selectedProjectId);
      if (idx < 0) idx = 0;
      const cur = sorted[idx];
      if (e.key === 'ArrowRight') { idx = (idx + 1) % sorted.length; }
      else if (e.key === 'ArrowLeft') { idx = (idx - 1 + sorted.length) % sorted.length; }
      else if (e.key === 'ArrowDown') {
        const below = sorted.filter(p => p.y > cur.y);
        if (below.length) { below.sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x)); idx = sorted.indexOf(below[0]); }
      } else if (e.key === 'ArrowUp') {
        const above = sorted.filter(p => p.y < cur.y);
        if (above.length) { above.sort((a, b) => Math.abs(a.x - cur.x) - Math.abs(b.x - cur.x)); idx = sorted.indexOf(above[0]); }
      }
      selectedProjectId = sorted[idx].id;
      renderSelection();
    }
  });

