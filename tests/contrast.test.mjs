// Theme contrast regression guard for Orga-naes.html
//
// Encodes the contrast contract proven by the 2026-09-12 live audits (the
// Daylight audit that found accent-as-12px-text at 4.09:1, and the
// planned-vs-text-dim collision that measured ΔE 1.8). Scanning the real DOM
// is a manual/preview activity; this test enforces the same math on the
// token definitions in the built artifact, so a palette edit that breaks a
// floor fails `npm test` immediately.
//
// What it checks, per preset (midnight-cyan, amber-crt, phosphor-green,
// monochrome inherit the dark :root status tokens; daylight fully overrides):
//
//   1. Text floors (WCAG 4.5:1)     — text, text-dim, accent, danger,
//                                     ongoing (due-soon chips are small text)
//                                     against card / sub-bg / bg surfaces.
//   2. UI floors (WCAG 3.0:1)       — status dots + accent against card.
//   3. White-Pair floor (4.5:1)     — accent-contrast against accent
//                                     (DESIGN.md White-Pair Rule).
//   4. Status distinguishability    — every status hue ≥ ΔE 12 (CIELAB) from
//                                     text-dim and from each other. The
//                                     planned-gray bug measured 1.8–5.5; the
//                                     fixed palette's worst is 18.7.
//   5. CSS ↔ JS preset sync         — the `#pf-root.pf-theme-light` block in
//                                     the stylesheet and THEME_PRESETS.daylight
//                                     in the JS must define identical values.
//                                     They are two doors to one truth; drift
//                                     between them = boot default differs from
//                                     the applied preset.
//
// When this test fails: fix the token value in src/styles/02-tokens.css AND
// src/js/36-theme-presets.js (in lockstep), rebuild. Do not weaken the floors.
//
// Run: node tests/contrast.test.mjs [path-to-html]

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const argPath = process.argv[2];
const file = argPath
  ? resolve(process.cwd(), argPath)
  : fileURLToPath(new URL('../Orga-naes.html', import.meta.url));
const src = readFileSync(file, 'utf8');

const fail = [];

// ---------- color math ----------

const hex2rgb = h => {
  const m = h.replace('#', '');
  return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16));
};

// WCAG relative luminance
const lum = ([r, g, b]) => {
  const f = c => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
  const L1 = lum(hex2rgb(a)), L2 = lum(hex2rgb(b));
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
};

// CIELAB ΔE76 — perceptual color difference (what "looks like the same color" means)
const dE = (a, b) => {
  const rgb2lab = h => {
    const [r, g, b] = hex2rgb(h).map(v => v / 255).map(c => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92));
    let X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const g2 = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = g2(X), fy = g2(Y), fz = g2(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const A = rgb2lab(a), B = rgb2lab(b);
  return Math.sqrt(A.map((v, i) => (v - B[i]) ** 2).reduce((s, x) => s + x, 0));
};

// ---------- parse token scopes from the artifact ----------

function parseBlock(body) {
  const map = {};
  // Matches both CSS format (`--bg: #eef1f5`) and JS THEME_PRESETS format
  // ('--bg':'#eef1f5') — quotes optional on either side. Group 1 includes
  // the leading dashes.
  for (const m of body.matchAll(/(['"]?--[a-z0-9-]+['"]?)\s*:\s*['"]?#([0-9a-fA-F]{6})['"]?/g)) map[m[1].replace(/['"]/g, '')] = '#' + m[2].toLowerCase();
  return map;
}

// Dark baseline: the token block that defines --planned but is not the light theme.
// (Lives on :root in 02-tokens.css; all dark presets inherit its status hues.)
const cssBlocks = [...src.matchAll(/([.#:a-zA-Z0-9\s,-]+)\{([^{}]*)\}/g)];
let darkBase = null, lightBase = null;
for (const [, sel, body] of cssBlocks) {
  if (!/--planned\s*:/i.test(body)) continue;
  const s = sel.trim();
  if (/pf-theme-light/.test(s)) { lightBase = parseBlock(body); }
  else if (!darkBase && /(:root|#pf-root)\s*$/.test(s)) { darkBase = parseBlock(body); }
}
if (!darkBase) fail.push('[parse] dark :root token block (defining --planned) not found in artifact CSS');
if (!lightBase) fail.push('[parse] #pf-root.pf-theme-light token block not found in artifact CSS');

// Per-preset overrides from THEME_PRESETS in the JS.
const presets = {};
const presetSrc = src.match(/const\s+THEME_PRESETS\s*=\s*{([\s\S]*?)\n\s*};/);
if (!presetSrc) {
  fail.push('[parse] THEME_PRESETS object not found in artifact JS');
} else {
  for (const m of presetSrc[1].matchAll(/'?([a-z-]+)'?:\s*{([^}]*)}/g)) presets[m[1]] = parseBlock(m[2]);
}
for (const required of ['midnight-cyan', 'amber-crt', 'phosphor-green', 'monochrome', 'daylight']) {
  if (!presets[required]) fail.push(`[parse] THEME_PRESETS.${required} missing from artifact JS`);
}

// ---------- build effective token maps per preset ----------

const STATUSES = ['--planned', '--ongoing', '--waiting', '--completed', '--danger'];
const TEXT_FLOOR = 4.5, UI_FLOOR = 3.0, DISTINGUISH_FLOOR = 12;

function effective(presetName) {
  // daylight's CSS home is .pf-theme-light; JS applies the same values over it.
  const base = presetName === 'daylight' ? { ...lightBase } : { ...darkBase };
  return { ...base, ...(presets[presetName] || {}) };
}

// ---------- checks per preset ----------

const presetNames = ['midnight-cyan', 'amber-crt', 'phosphor-green', 'monochrome', 'daylight'];
let pairsChecked = 0;

for (const name of presetNames) {
  if (!presets[name] || !darkBase || !lightBase) continue;
  const t = effective(name);
  const need = (...keys) => keys.every(k => t[k]);
  const ctx = `[${name}]`;

  if (!need('--text', '--text-dim', '--accent', '--accent-contrast', '--card', '--bg', '--sub-bg', ...STATUSES)) {
    fail.push(`${ctx} incomplete token set — cannot evaluate contrast contract`);
    continue;
  }

  // 1) Text floors: every color used as (small) text against its real surfaces.
  const textPairs = [
    ['--text', '--card', 'main text on cards'],
    ['--text', '--bg', 'main text on page bg'],
    ['--text-dim', '--card', 'dim text on cards (labels, counters)'],
    ['--text-dim', '--bg', 'dim text on page bg'],
    ['--text-dim', '--sub-bg', 'dim text on subtask bg'],
    ['--accent', '--bg', 'accent as text (list titles) on page bg'],
    ['--accent', '--card', 'accent as text on cards'],
    ['--danger', '--card', 'danger text (delete ×) on cards'],
    ['--ongoing', '--sub-bg', 'due-soon chip text on subtask bg'],
  ];
  for (const [fg, bg, why] of textPairs) {
    pairsChecked++;
    const r = contrast(t[fg], t[bg]);
    if (r < TEXT_FLOOR) fail.push(`${ctx} text contrast ${fg} on ${bg} (${why}) = ${r.toFixed(2)}:1 < ${TEXT_FLOOR}:1`);
  }

  // 2) White-Pair: text painted on accent backgrounds must clear 4.5.
  pairsChecked++;
  {
    const r = contrast(t['--accent-contrast'], t['--accent']);
    if (r < TEXT_FLOOR) fail.push(`${ctx} White-Pair --accent-contrast on --accent = ${r.toFixed(2)}:1 < ${TEXT_FLOOR}:1`);
  }

  // 3) UI floors: status dots + accent glyphs against cards (3.0:1).
  for (const fg of [...STATUSES, '--accent']) {
    pairsChecked++;
    const r = contrast(t[fg], t['--card']);
    if (r < UI_FLOOR) fail.push(`${ctx} UI contrast ${fg} on --card (dot/icon) = ${r.toFixed(2)}:1 < ${UI_FLOOR}:1`);
  }

  // 4) Status distinguishability: ΔE from text-dim and between statuses.
  for (const s of STATUSES) {
    pairsChecked++;
    const d = dE(t[s], t['--text-dim']);
    if (d < DISTINGUISH_FLOOR) fail.push(`${ctx} status ${s} is indistinguishable from --text-dim (ΔE ${d.toFixed(1)} < ${DISTINGUISH_FLOOR})`);
  }
  for (let i = 0; i < STATUSES.length; i++) {
    for (let j = i + 1; j < STATUSES.length; j++) {
      pairsChecked++;
      const d = dE(t[STATUSES[i]], t[STATUSES[j]]);
      if (d < DISTINGUISH_FLOOR) fail.push(`${ctx} statuses ${STATUSES[i]} vs ${STATUSES[j]} collide (ΔE ${d.toFixed(1)} < ${DISTINGUISH_FLOOR})`);
    }
  }
}

// 5) CSS ↔ JS sync: the boot default (.pf-theme-light) must equal the JS preset.
if (lightBase && presets.daylight) {
  for (const [k, v] of Object.entries(presets.daylight)) {
    pairsChecked++;
    if ((lightBase[k] || '').toLowerCase() !== v.toLowerCase()) {
      fail.push(`[sync] --${k.replace('--', '')}: JS daylight preset has ${v} but CSS .pf-theme-light defines ${lightBase[k] || 'nothing'} — update both definitions in lockstep`);
    }
  }
}

// ---------- result ----------

if (fail.length) {
  console.error('FAILURES:', fail);
  process.exit(1);
}
console.log(`OK — contrast holds: ${presetNames.length} presets × ${pairsChecked / presetNames.length | 0} checks (text 4.5:1, UI 3.0:1, White-Pair, status ΔE ≥ ${DISTINGUISH_FLOOR}, CSS↔JS sync)`);
