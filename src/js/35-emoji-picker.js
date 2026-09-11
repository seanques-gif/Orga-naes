  // SUBSECTION: Emoji Picker
  const PROJECT_EMOJIS = ['📋','🚀','💡','🎯','🔥','⚡','🌟','💎','🎨','📦','🔧','📱','🌍','🏠','📚','🎮','🧪','💰','❤️','🏆'];
  function showEmojiPicker(p, anchorEl) {
    _closeCtx();
    const picker = document.createElement('div');
    picker.className = 'pf-emoji-picker';
    picker.style.position = 'fixed';
    const rect = anchorEl.getBoundingClientRect();
    picker.style.left = rect.left + 'px'; picker.style.top = (rect.bottom + 4) + 'px';
    PROJECT_EMOJIS.forEach(em => {
      const s = document.createElement('span');
      s.textContent = em;
      s.addEventListener('click', (e) => { e.stopPropagation(); _lastProjectId = p.id; snapshot(); p.emoji = em; scheduleSave(); render(); _closeCtx(); });
      picker.appendChild(s);
    });
    const clearBtn = document.createElement('span');
    clearBtn.textContent = '✕';
    clearBtn.style.color = 'var(--danger)';
    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); snapshot(); p.emoji = ''; scheduleSave(); render(); _closeCtx(); });
    picker.appendChild(clearBtn);
    root.appendChild(picker);
    _ctxEl = picker;
  }

