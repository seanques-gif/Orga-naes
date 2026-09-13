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

  // Font family picker (Appearance): '' = default Inter (embedded, iOS-like),
  // 'plex' = console classic IBM Plex, 'system' = platform UI stack, 'custom'
  // = any Google Fonts family typed by the user (loaded on demand). Applied
  // through the --font-sans token so every component follows; choice persists
  // per device like the size/scale sliders. Legacy saved value 'inter' (from
  // when Inter was opt-in) resolves to the same look: the token default is
  // now Inter, and unknown values simply clear the override.
  const FONTFAM_KEY = () => 'project-flow-font-family-' + currentDeviceSuffix();
  const FONTCUSTOM_KEY = () => 'project-flow-font-custom-' + currentDeviceSuffix();
  const FONT_STACKS = {
    plex: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    system: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  };
  const fontSel = document.getElementById('pf-font-family');
  const fontCustom = document.getElementById('pf-font-custom');
  // Google Fonts families are letters, digits, spaces, and a small punctuation
  // set (e.g. "PT Sans", "Playfair Display", "Fraunces 72pt"). The CSS2 API
  // accepts both spaces and + separators; keep + so a URL fragment pasted by
  // mistake still resolves. Anything outside this set is rejected outright.
  const FONT_NAME_RE = /^[A-Za-z0-9 +.'\u00C0-\u024F-]{1,60}$/;
  function cssEscapeName(name) {
    return name.trim().replace(/["'\\]/g, '');
  }
  function gfontUrl(family, suffix) {
    return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + suffix;
  }
  function loadLinkOnce(link, url) {
    return new Promise((resolve, reject) => {
      let done = false, sheetPoll = null, timeout = null;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearInterval(sheetPoll);
        clearTimeout(timeout);
        if (ok) resolve();
        else reject(new Error('stylesheet failed'));
      };
      link.onload = () => finish(true);
      link.onerror = () => finish(false);
      // A stylesheet served from the HTTP cache can apply synchronously and
      // never fire onload/onerror (observed in Chromium) — poll the applied
      // sheet as ground truth alongside the events.
      sheetPoll = setInterval(() => { if (link.sheet) finish(true); }, 50);
      timeout = setTimeout(() => finish(!!link.sheet), 8000);
      link.href = url;
      if (link.sheet) finish(true);
    });
  }
  // Existence oracle: the css2 API answers 200 for a known family/weight
  // combo and 400 for an unknown one (or out-of-range weights). fetch works
  // cross-origin here (the API is CORS-open), and unlike FontFaceSet probing
  // it is not racy: no dependence on when @font-face rules register.
  async function css2Ok(family, suffix) {
    try { const r = await fetch(gfontUrl(family, suffix)); return r.ok; } catch (e) { return false; }
  }
  // Weight ladder: families define different weight ranges (Lora starts at
  // 400, some display faces ship 400 only), and the css2 API rejects the
  // WHOLE request if any requested weight is out of range. Try the rich set
  // first, fall back to the classic pair, then to the bare family.
  const WEIGHT_LADDER = [':wght@400;500;600;700', ':wght@400;700', ''];
  async function injectGoogleFont(family) {
    for (const suffix of WEIGHT_LADDER) {
      if (!(await css2Ok(family, suffix))) continue;
      const link = document.getElementById('pf-gfont-dynamic');
      const el = link || (() => { const l = document.createElement('link'); l.id = 'pf-gfont-dynamic'; l.rel = 'stylesheet'; document.head.appendChild(l); return l; })();
      try { await loadLinkOnce(el, gfontUrl(family, suffix)); } catch (e) { continue; }
      // Warm the faces; glyphs arrive whenever ready (font-display: swap
      // shows the fallback until then, same as the boot-time font link).
      document.fonts.load("16px '" + cssEscapeName(family) + "'").catch(() => {});
      return true;
    }
    return false;
  }
  function applyFontFamily(v) {
    if (v && FONT_STACKS[v]) root.style.setProperty('--font-sans', FONT_STACKS[v]);
    else if (v !== 'custom') root.style.removeProperty('--font-sans');
  }
  async function applyCustomFont(name, persist) {
    const family = String(name || '').trim();
    if (!family) { showToast('Type a font family name first.', true); return false; }
    if (!FONT_NAME_RE.test(family)) { showToast('That does not look like a Google Fonts family name.', true); return false; }
    const ok = await injectGoogleFont(family);
    if (!ok) { showToast('Could not load "' + family + '". Check the name on fonts.google.com.', true); return false; }
    root.style.setProperty('--font-sans', "'" + cssEscapeName(family) + "', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
    if (persist) safeSet(FONTCUSTOM_KEY(), family, false);
    showToast('Font applied: ' + family + '.');
    return true;
  }
  function showHideCustomRow() {
    if (fontCustom) fontCustom.style.display = (fontSel && fontSel.value === 'custom') ? '' : 'none';
  }
  if (fontSel) {
    fontSel.addEventListener('change', async () => {
      showHideCustomRow();
      if (fontSel.value === 'custom') {
        if (fontCustom) { fontCustom.focus(); if (!fontCustom.value) fontCustom.placeholder = 'Family name, e.g. Nunito, Lora'; }
        return;
      }
      applyFontFamily(fontSel.value);
      safeSet(FONTFAM_KEY(), fontSel.value, false);
    });
    if (fontCustom) {
      const commitCustom = async () => {
        const ok = await applyCustomFont(fontCustom.value, true);
        if (ok) safeSet(FONTFAM_KEY(), 'custom', false);
      };
      fontCustom.addEventListener('change', commitCustom);
      fontCustom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitCustom(); } });
    }
    (async function loadFontFamily() {
      try {
        const res = await safeGet(FONTFAM_KEY(), false);
        if (res && res.value !== undefined) {
          if (res.value === 'inter') {
            // Legacy: 'inter' was the opt-in value before Inter became the
            // default. It now means the same as '' (token default); normalize
            // so the select does not sit blank on an unmatched stored value.
            fontSel.value = '';
            applyFontFamily('');
            safeSet(FONTFAM_KEY(), '', false);
            return;
          }
          fontSel.value = res.value;
          showHideCustomRow();
          if (res.value === 'custom' && fontCustom) {
            const saved = await safeGet(FONTCUSTOM_KEY(), false);
            if (saved && saved.value) { fontCustom.value = saved.value; await applyCustomFont(saved.value, false); }
            else fontSel.value = '';
          } else applyFontFamily(res.value);
        }
      } catch (e) {}
    })();
  }

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
