  // SUBSECTION: SVG Icon System (D10 — SVG chrome, emoji stays for user content)
  // Chrome icons are inline SVG (crisp at any scale, recolor via currentColor).
  // Emoji is kept wherever the USER author content: task titles, categories,
  // comments, the emoji picker, and transient toast prefixes.
  const PF_ICONS = {
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'undo': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    'redo': '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'star': '<path d="m12 3 2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.7z"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    'calendar-week': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3M8 18h3M14 15h3"/>',
    'planner': '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 2v4M15 2v4M4 9h16M8 13h8M8 17h5"/>',
    'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-4.5"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    'list': '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    'check-square': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 6-6"/>',
    'square': '<rect x="3" y="3" width="18" height="18" rx="2"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    'sort': '<path d="M11 5h10M11 9h7M11 14h10M11 18h7M4 7l2-2 2 2M6 5v12M4 19l2 2 2-2"/>',
    'reply': '<path d="M9 10 4 15l5 5"/><path d="M4 15h10a6 6 0 0 0 6-6V7"/>',
    'forward': '<path d="m15 10 5 5-5 5"/><path d="M20 15H10a6 6 0 0 1-6-6V7"/>',
    'folder': '<path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    'open': '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    'clipboard': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    'archive': '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    'trash': '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    'alert': '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/>',
    'file': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    'cloud': '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A4 4 0 0 0 6 19z"/>',
    'key': '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M17 7l3 3M14 10l2 2"/>',
    'exit': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    'palette': '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10.5" r="1"/><circle cx="15.5" cy="10.5" r="1"/><circle cx="12" cy="15.5" r="1"/>',
    'refresh': '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    'smiley': '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
    'message': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    'keyboard': '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>',
    'plus-badge': '<path d="M12 5v14M5 12h14"/>',
    'pencil': '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    'arrow-up': '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14m-6-6 6-6 6 6"/>'
  };
  function pfIcon(name, cls) {
    const body = PF_ICONS[name] || PF_ICONS['info'];
    return '<svg class="pf-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" aria-hidden="true"' +
      (name === 'star' ? ' stroke-linejoin="round"' : '') +
      ' stroke="currentColor" stroke-width="2" stroke-linecap="round">' + body + '</svg>';
  }
  window._pf = window._pf || {};
  window._pf.pfIcon = pfIcon;

  // Hydrate static chrome: any [data-ic] span gets its SVG; [data-ic-before]
  // section titles get the icon prepended. Runs immediately (this fragment is
  // the first in the IIFE, before any render) and is re-run safe.
  function hydrateIcons(scope) {
    scope.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = pfIcon(el.dataset.ic); });
    scope.querySelectorAll('[data-ic-before]').forEach(el => {
      el.insertAdjacentHTML('afterbegin', pfIcon(el.dataset.icBefore, 'pf-ic-title'));
    });
  }
  hydrateIcons(document);

  // Re-hydrate after DOMContentLoaded in case the script runs before the shell
  // is fully parsed (belt-and-suspenders; fragments execute after the markup).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { hydrateIcons(document); });
  }
