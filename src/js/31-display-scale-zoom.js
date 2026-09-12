  // SUBSECTION: Display Scale & Zoom
  function currentDeviceSuffix() {
    if (root.classList.contains('pf-device-mobile')) return 'mobile';
    if (root.classList.contains('pf-device-tablet')) return 'tablet';
    return 'desktop';
  }
  function FONT_SIZE_KEY() { return 'project-flow-font-size-' + currentDeviceSuffix(); }
  function SCALE_KEY() { return 'project-flow-display-scale-' + currentDeviceSuffix(); }

  fontSizeInput.addEventListener('input', (e) => { const v = e.target.value + 'px'; root.style.setProperty('--font-size-base', v); fontSizeVal.textContent = v; safeSet(FONT_SIZE_KEY(), e.target.value, false); });
  async function loadFontSize() { try { const res = await safeGet(FONT_SIZE_KEY(), false); if (res && res.value) { root.style.setProperty('--font-size-base', res.value + 'px'); fontSizeInput.value = res.value; fontSizeVal.textContent = res.value + 'px'; } } catch (e) {} }
  loadFontSize();

  // Display Scale
  const scaleInput = document.getElementById('pf-display-scale');
  const scaleVal = document.getElementById('pf-display-scale-val');
  function applyScale(v) {
    const basePx = 15 * (v / 100);
    root.style.setProperty('--font-size-base', basePx + 'px');
    root.style.setProperty('--pf-scale', v / 100);
    fontSizeInput.value = Math.round(basePx);
    scaleVal.textContent = v + '%';
  }
  scaleInput.addEventListener('input', (e) => { applyScale(e.target.value); safeSet(SCALE_KEY(), e.target.value, false); });
  document.getElementById('pf-display-scale-reset').addEventListener('click', () => { scaleInput.value = '100'; applyScale(100); safeSet(SCALE_KEY(), '100', false); });
  async function loadScale() { try { const res = await safeGet(SCALE_KEY(), false); if (res && res.value) { scaleInput.value = res.value; applyScale(res.value); } } catch (e) {} }
  loadScale();

  // Re-apply the correct device's saved size if the device class changes later
  // (e.g. resizing a desktop browser window, or rotating/switching device type).
  let _pfLastDeviceSuffix = currentDeviceSuffix();
  window.addEventListener('resize', () => {
    const suffix = currentDeviceSuffix();
    if (suffix !== _pfLastDeviceSuffix) {
      _pfLastDeviceSuffix = suffix;
      loadFontSize();
      loadScale();
    }
  });

  // Single source of truth for what a "full backup" contains — used by both
  // manual Export and the auto-backup-to-folder path. Previously each built
  // its own object with only { projects, categories, collapsedCategories,
  // archive }, silently leaving trash, Today's Focus, the Weekly Planner,
  // reminders, and category emoji colors out of every backup file.
  function buildFullBackupPayload() {
    const payload = {
      projects: projects,
      categories: categories,
      collapsedCategories: collapsedCategories,
      archive: archive,
      trash: trash,
      today: { date: todayDate, tasks: todayTasks },
      weeklyData: weeklyData,
      reminders: reminders,
      categoryEmojis: categoryEmojis
    };
    // Notes are part of a full backup. getNotesSnapshot returns null before
    // the notes module loads (boot race) — omit rather than write [].
    const notesSnap = (window._pf && typeof window._pf.getNotesSnapshot === 'function') ? window._pf.getNotesSnapshot() : null;
    if (notesSnap) { payload.notes = notesSnap.notes; payload.noteTombstones = notesSnap.tombstones; }
    return payload;
  }

  document.getElementById('pf-export').addEventListener('click', async () => {
    _exitMultiSelectMode();
    const json = JSON.stringify(buildFullBackupPayload(), null, 2);
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: 'project-flow.json', types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        showToast('Exported successfully.');
      } catch (err) { if (err.name !== 'AbortError') { showToast('Export failed: ' + err.message, true); logError('Export', err); } }
    } else {
      const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'project-flow.json'; a.click(); URL.revokeObjectURL(url);
    }
  });

  const AUTOBACKUP_KEY = 'project-flow-autobackup';
  const AUTOBACKUP_LAST_KEY = 'project-flow-autobackup-last';
  let autoBackupInterval = 0;
  let autoBackupTimer = null;
  let autoBackupDirHandle = null;
