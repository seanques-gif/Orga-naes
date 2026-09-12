  // SUBSECTION: Theme Presets
  // Mission Control ships five console variants. Each recolors the core tokens
  // only; status colors, layout, type, radius, and elevation are theme-invariant.
  const THEME_PRESETS = {
    'midnight-cyan': { '--bg':'#0a0d11','--card':'#12161c','--card-hover':'#171c24','--card-border':'#232a34','--sub-bg':'#0e1218','--sub-border':'#232a34','--accent':'#2fd4ff','--accent-contrast':'#04141b','--text':'#d7dde5','--text-dim':'#8b95a3','--header-bg':'#0d1116','--toast-bg':'#141a22','--hover-border':'#2f3a47' },
    'amber-crt': { '--bg':'#0c0a06','--card':'#171208','--card-hover':'#1f180c','--card-border':'#3a2e14','--sub-bg':'#120e08','--sub-border':'#3a2e14','--accent':'#ffb454','--accent-contrast':'#1a1206','--text':'#f6e7cf','--text-dim':'#b89b6e','--header-bg':'#0f0c07','--toast-bg':'#1f180c','--hover-border':'#4a3a1c' },
    'phosphor-green': { '--bg':'#04100a','--card':'#08180f','--card-hover':'#0b2116','--card-border':'#163a24','--sub-bg':'#06120c','--sub-border':'#163a24','--accent':'#3ddc97','--accent-contrast':'#04160d','--text':'#d6f5e4','--text-dim':'#6fa98c','--header-bg':'#061410','--toast-bg':'#0b2116','--hover-border':'#1f4a30' },
    monochrome: { '--bg':'#0b0b0c','--card':'#141416','--card-hover':'#1b1b1e','--card-border':'#2c2c30','--sub-bg':'#101012','--sub-border':'#2c2c30','--accent':'#d7dde5','--accent-contrast':'#101012','--text':'#e6e8ea','--text-dim':'#8f9296','--header-bg':'#0e0e10','--toast-bg':'#1b1b1e','--hover-border':'#3a3a3e' },
    daylight: { '--bg':'#eef1f5','--card':'#ffffff','--card-hover':'#f3f6f9','--card-border':'#d3dbe4','--sub-bg':'#f6f8fa','--sub-border':'#dfe6ee','--accent':'#0a7499','--accent-contrast':'#ffffff','--text':'#12202c','--text-dim':'#5a6b7b','--header-bg':'#ffffff','--toast-bg':'#12202c','--hover-border':'#a9b8c7','--planned':'#4a5d8a','--ongoing':'#9a5d00','--completed':'#0f7a4a','--waiting':'#6a4fd0','--danger':'#c0392b' }
  };
  const THEME_BTN_IDS = ['pf-theme-auto','pf-theme-midnight-cyan','pf-theme-amber-crt','pf-theme-phosphor-green','pf-theme-monochrome','pf-theme-daylight'];
  const CONSOLE_INK = '#04141b'; // the dark ink the White-Pair runtime falls back to
  function highlightActiveThemeBtn(name) {
    THEME_BTN_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const active = (id === 'pf-theme-' + name);
        el.style.outline = active ? '2px solid var(--accent)' : '';
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
  }
  function applyThemePreset(name) {
    root.classList.remove('pf-theme-light');
    const vars = THEME_PRESETS[name];
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
      // White-Pair Rule enforcement: every preset's --accent-contrast must be
      // readable against its --accent (WCAG AA 4.5:1). Hand-tuned values are kept
      // when they pass; otherwise the better of console ink / white wins.
      if (vars['--accent']) {
        const m = /^#([0-9a-fA-F]{6})$/.exec(vars['--accent']);
        if (m) {
          const chan = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          const lum = h => { h = h.replace('#', ''); return 0.2126 * chan(parseInt(h.slice(0, 2), 16)) + 0.7152 * chan(parseInt(h.slice(2, 4), 16)) + 0.0722 * chan(parseInt(h.slice(4, 6), 16)); };
          const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
          const acc = m[0];
          const derived = ratio(acc, CONSOLE_INK) >= ratio(acc, '#ffffff') ? CONSOLE_INK : '#ffffff';
          const em = vars['--accent-contrast'] ? /^#([0-9a-fA-F]{6})$/.exec(vars['--accent-contrast']) : null;
          const finalContrast = (em && ratio(acc, em[0]) >= 4.5) ? em[0] : derived;
          root.style.setProperty('--accent-contrast', finalContrast);
        }
      }
    }
    safeSet('project-flow-theme-preset', name, false);
    highlightActiveThemeBtn(name);
    showToast('Theme: ' + name.charAt(0).toUpperCase() + name.slice(1));
  }
  function clearThemeVars() {
    const allKeys = new Set();
    Object.values(THEME_PRESETS).forEach(preset => Object.keys(preset).forEach(k => allKeys.add(k)));
    allKeys.forEach(k => root.style.removeProperty(k));
  }
  function clearThemePreset() {
    clearThemeVars();
    localStorage.removeItem('project-flow-theme-preset');
  }
