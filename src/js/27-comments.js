    // SUBSECTION: Comments
  function openCommentPanel(p, s) {
    commentTarget = { project: p, sub: s };
    if (!s.comments) s.comments = [];
    document.getElementById('pf-comment-task-name').textContent = s.title;
    renderComments();
    openModal(commentPanel, 'flex');
    document.getElementById('pf-comment-input').focus();
  }
  function renderComments() {
    const listEl = document.getElementById('pf-comment-list');
    if (!commentTarget || !commentTarget.sub.comments.length) { listEl.innerHTML = '<div class="pf-comment-empty">No comments yet.</div>'; return; }
    listEl.innerHTML = commentTarget.sub.comments.map((c, i) => '<div class="pf-comment-item">' + escapeHtml(c.text) + '<span class="pf-comment-time">' + formatDateTime(c.time) + '</span><span class="pf-comment-actions"><button class="pf-comment-edit" data-idx="' + i + '">✏️</button><button class="pf-comment-del" data-idx="' + i + '">🗑️</button></span></div>').join('');
    listEl.querySelectorAll('.pf-comment-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const newText = prompt('Edit comment:', commentTarget.sub.comments[idx].text);
        if (newText !== null && newText.trim()) { _lastProjectId = commentTarget.project.id; snapshot(); commentTarget.sub.comments[idx].text = newText.trim(); scheduleSave(); renderComments(); render(); }
      });
    });
    listEl.querySelectorAll('.pf-comment-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (!confirm('Delete this comment?')) return;
        _lastProjectId = commentTarget.project.id; snapshot(); commentTarget.sub.comments.splice(idx, 1); scheduleSave(); renderComments(); render();
      });
    });
    listEl.scrollTop = listEl.scrollHeight;
  }
  function addComment() {
    const input = document.getElementById('pf-comment-input');
    const text = input.value.trim(); if (!text || !commentTarget) return;
    snapshot();
    commentTarget.sub.comments.push({ text: text, time: new Date().toISOString() });
    input.value = '';
    scheduleSave(); renderComments(); render();
  }
  document.getElementById('pf-comment-add').addEventListener('click', addComment);
  document.getElementById('pf-comment-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } });

  let colorTarget = null;
  const colorModalPicker = document.getElementById('pf-color-modal-picker');
  const colorPalette = document.getElementById('pf-color-palette');
  const PRESET_COLORS = ['#e0503f','#e67e22','#f1c40f','#27ae60','#2ecc71','#1abc9c','#3498db','#2980b9','#7b68ee','#9b59b6','#e84393','#fd79a8','#636e72','#b2bec3','#fdcb6e','#00cec9'];
  let selectedColor = null;
