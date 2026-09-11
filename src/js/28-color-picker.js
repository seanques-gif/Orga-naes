    // SUBSECTION: Color Picker
  function renderPalette() {
    colorPalette.innerHTML = PRESET_COLORS.map(c => '<div class="pf-color-swatch' + (selectedColor === c ? ' pf-swatch-selected' : '') + '" data-color="' + c + '" style="background:' + c + '"></div>').join('');
    colorPalette.querySelectorAll('.pf-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => { selectedColor = sw.dataset.color; colorModalPicker.value = selectedColor; renderPalette(); });
    });
  }
  colorModalPicker.addEventListener('input', (e) => { selectedColor = e.target.value; renderPalette(); });
  function openColorModal(p) {
    colorTarget = p;
    selectedColor = p.color || CATEGORY_COLORS[0];
    colorModalPicker.value = selectedColor;
    renderPalette();
    openModal(colorModal, 'flex');
  }
  document.getElementById('pf-color-modal-ok').addEventListener('click', () => {
    if (!colorTarget) return;
    _lastProjectId = colorTarget.id; snapshot(); colorTarget.color = selectedColor; scheduleSave(); closeAllModals(); render(); autoArrangeProjects(true);
  });
  document.getElementById('pf-color-modal-clear').addEventListener('click', () => {
    if (!colorTarget) return;
    _lastProjectId = colorTarget.id; snapshot(); colorTarget.color = null; scheduleSave(); closeAllModals(); render(); autoArrangeProjects(true);
  });
  document.getElementById('pf-color-modal-cancel').addEventListener('click', () => { closeAllModals(); });

