// Design-token regression guard for Orga-naes.html
//
// Enforces the three rules documented in DESIGN.md so they cannot silently
// regress (the same class of drift the 2026-09 dark-theme rework introduced):
//
//   1. One-Root Rule       — no absolute px font sizes; all text derives
//                            from var(--font-size-base). (Display Scale
//                            scales nothing otherwise.)
//   2. Tint-Through-Token  — accent/status/danger washes use
//                            color-mix(in srgb, var(--token) N%, transparent),
//                            never hardcoded rgb/rgba triplets of the old
//                            palette. Neutral black/white rgba (shadows,
//                            washes) and the two documented --grid-dot
//                            definitions are allowed.
//   3. White-Pair Rule     — text on a background of var(--accent) must read
//                            var(--accent-contrast), never a literal #fff.
//
// When this test fails: fix the drift in Orga-naes.html (consume the token),
// do not weaken the test. If a genuinely new literal is required (e.g. a new
// fixed palette like the confetti colors), extend an explicit exception here
// with a comment explaining why.
//
// Run: node tests/design-tokens.test.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

// Optional: node tests/design-tokens.test.mjs [path-to-html]
// (defaults to ../Orga-naes.html; a second path lets you check a draft copy)
const argPath = process.argv[2];
const file = argPath
  ? resolve(process.cwd(), argPath)
  : fileURLToPath(new URL('../Orga-naes.html', import.meta.url));
const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

const fail = [];

// Colors that must always be consumed via their token. Includes the
// pre-rework palette (catches its return) AND current token values (catches
// anyone hardcoding today's colors inline, which breaks the next retheme).
const GUARDED_HEX = [
  '7b68ee', '9580ff', '7f6df2',          // legacy accents/depth0
  'f5b84d', 'e0a850', 'd9820f',          // amber/ongoing
  'ef4444', 'e0503f',                    // danger
  '22a35e', '2ea343', '4dd88a', '22c55e', // green/completed
  '7c3aed', 'a78bfa',                    // waiting/purple
  '4ecdc4',                              // orphan teal (removed)
  '1e9fc2', '5fb3c7',                    // teal depth3 family
  // Mission Control palette + presets (current) — keep them token-only too.
  '2fd4ff', 'ffb454', '3ddc97', 'b39dff', 'ff5c5c', '4fd1c5', '7c8794',
  '0a0d11', '12161c', '171c24', '232a34', '0e1218', '0d1116', '141a22',
  'd7dde5', '8b95a3', '2f3a47', '04141b',
  '0a7ea4', 'eef1f5', 'f3f6f9', 'd3dbe4', 'f6f8fa', 'dfe6ee', '12202c',
  '5a6b7b', 'a9b8c7', 'b06a00', '0f7a4a', '6a4fd0', 'c0392b', '1f7f92', '6b7a89',
  '0c0a06', '171208', '1f180c', '3a2e14', '120e08', 'f6e7cf', 'b89b6e', '0f0c07', '4a3a1c',
  '04100a', '08180f', '0b2116', '163a24', '06120c', 'd6f5e4', '6fa98c', '061410', '1f4a30',
  '0b0b0c', '141416', '1b1b1e', '2c2c30', '101012', 'e6e8ea', '8f9296', '0e0e10', '3a3a3e'
];
const GUARDED_HEX_SRC = '#(?:' + GUARDED_HEX.join('|') + ')\\b';

// ---------- 1) One-Root Rule: absolute px font sizes ----------

// The HTML report export builds a STANDALONE document (blob URL, new window):
// app tokens like --font-size-base are undefined there, so its inline
// stylesheet legitimately uses absolute px and non-token colors.
const STANDALONE_REPORT_SRC = /const html = '<!DOCTYPE html>/;
const FONT_PX_RE = /font-size\s*:\s*\d+(\.\d+)?px/i;  // exception: PDF export ~6279 uses literal px
const FONT_SHORTHAND_RE = /\bfont\s*:\s*\d+(\.\d+)?px/i;  // `font: 14px ...` shorthand

lines.forEach((line, i) => {
  // Explicit exception: standalone PDF report (line ~6281) uses literal px
  if (line.includes('Project Flow Report')) return;
  if (STANDALONE_REPORT_SRC.test(line)) return; // report template: standalone doc, tokens unavailable
  const m = line.match(FONT_PX_RE) || line.match(FONT_SHORTHAND_RE);
  if (m) fail.push(`[One-Root] line ${i + 1}: absolute font size "${m[0].trim()}" — use calc(var(--font-size-base) ± Npx), var(--font-size-base), or max(floor, var(--font-size-base))`);
});

// Sanity: the token must exist and be driven by the options UI.
if (!/--font-size-base\s*:\s*clamp\(/.test(src)) fail.push('[One-Root] --font-size-base clamp() definition missing');
if (!/setProperty\('--font-size-base'/.test(src)) fail.push('[One-Root] options UI no longer writes --font-size-base (Display Scale broken?)');

// ---------- 2) Tint-Through-Token: hardcoded rgb triplets & palette hexes ----------

// Neutral rgba washes/shadows are theme-invariant by design (DESIGN.md shadow
// vocabulary): black under dark themes, white washes over any theme.
const NEUTRAL_RGB_SRC = /rgba\(\s*(?:0|255)\s*,\s*(?:0|255)\s*,\s*(?:0|255)\s*,/i.source;
const RGBA_SRC = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,/i.source;
const RGB_SRC = /[^a-zA-Z(]rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+/i.source;

// A custom-property definition may legitimately hold an rgba VALUE
// (`--grid-dot: rgba(20,16,50,0.05)` in the light/eye-care theme blocks).
const TOKEN_RGBA_DEF_SRC = /'?--[a-z0-9-]+'?\s*:\s*['"]?rgba\(/i.source;

// Fixed color palettes (array literals of hex strings, e.g. confetti()).
const PALETTE_ARRAY_SRC = /=\s*\[\s*'#[0-9a-fA-F]{3,8}'/i.source;

// var(--token, #fallback) — the fallback literal is allowed.
const FALLBACK_SRC = /var\(\s*--[a-z0-9-]+\s*,[^)]*\)/gi.source;

// Strip allowed positions, then scan for drift.
function stripAllowedPositions(line) {
  let t = line.replace(new RegExp(FALLBACK_SRC, 'g'), 'var(--token,fallback)');
  // Fixed color palettes (array literals of hex strings, e.g. confetti() and
  // CATEGORY_COLORS): user-facing fixed choice-sets. Mask any bracketed
  // array that contains hex string literals — in one pass, all elements.
  t = t.replace(/\[[^\]]*\]/g, seg => /'#[0-9a-fA-F]{3,8}'/i.test(seg) ? '[palette]' : seg);
  // Named constant definitions are definitions, not usage:
  // const ACCENT_FALLBACK = '#7b68ee';
  t = t.replace(/const\s+[A-Z][A-Z0-9_]*\s*=\s*['"]#[0-9a-fA-F]{3,8}['"]/gi, 'const CONST=#x');
  // <input type="color" ... value="#7b68ee">: the HTML spec requires a
  // concrete hex here; var() is invalid as a color-input value. The picker
  // default intentionally mirrors the classic accent.
  t = t.replace(/type="color"[^>]*value="#[0-9a-fA-F]{3,8}"/gi, 'type="color" value="#x"');
  // <meta name="theme-color" content="#0a0d11">: a browser chrome color; the
  // spec requires a concrete literal (no var()), and it must mirror --bg.
  t = t.replace(/name="theme-color"[^>]*content="#[0-9a-fA-F]{3,8}"/gi, 'name="theme-color" content="#x"');
  t = t.replace(/'?\s*--[a-z0-9-]+'?\s*:\s*['"]?#[0-9a-fA-F]{3,8}/gi, '--def:#x'); // token definitions
  return t;
}

lines.forEach((line, i) => {
  if (STANDALONE_REPORT_SRC.test(line)) return; // report template: standalone doc, tokens unavailable
  const isNeutral = new RegExp(NEUTRAL_RGB_SRC, 'i').test(line);
  const isTokenDef = new RegExp(TOKEN_RGBA_DEF_SRC, 'i').test(line);

  if (!isNeutral && !isTokenDef) {
    const m = line.match(new RegExp(RGBA_SRC, 'i'));
    if (m) fail.push(`[Tint-Through-Token] line ${i + 1}: hardcoded rgba "${m[0].trim()}" — use color-mix(in srgb, var(--token) N%, transparent)`);
  }

  if (!/rgba\(/i.test(line)) {
    const m = line.match(new RegExp(RGB_SRC, 'i'));
    if (m) fail.push(`[Tint-Through-Token] line ${i + 1}: hardcoded rgb() "${m[0].trim()}" — consume the token instead`);
  }

  const stripped = stripAllowedPositions(line);
  const m = stripped.match(new RegExp(GUARDED_HEX_SRC, 'i'));
  if (m) fail.push(`[Tint-Through-Token] line ${i + 1}: literal color "${m[0]}" — consume var(--accent/--danger/--ongoing/...) instead`);
});

// ---------- 3) White-Pair Rule: accent background + literal text color ----------

// Scan leaf CSS blocks (innermost {...}) inside <style> regions, plus inline
// styles (style="..." attributes and .style.cssText='...' strings in JS).
const ACCENT_BG_RE = /background(?:-color)?\s*:[^;]*var\(\s*--accent\b/i;
const LITERAL_TEXT_COLOR_RE = /(^|[^-\w])color\s*:\s*(#[0-9a-fA-F]{3,8}|white\b|\brgb)/i;
const CONTRAST_COLOR_RE = /[^-\w]color\s*:\s*var\(\s*--accent-contrast\b/i;

function checkWhitePair(block, context) {
  if (!ACCENT_BG_RE.test(block)) return;
  const cm = block.match(LITERAL_TEXT_COLOR_RE);
  if (!cm) return;
  // Allowed: the text color reads the pairing token (with or without fallback).
  if (CONTRAST_COLOR_RE.test(block)) return;
  fail.push(`[White-Pair] ${context}: text color "${cm[2].trim()}" on a var(--accent) background — use var(--accent-contrast, ...)`);
}

for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
  const css = m[1];
  for (const b of css.matchAll(/\{[^{}]*\}/g)) checkWhitePair(b[0], 'style block');
}
for (const m of src.matchAll(/style\s*=\s*"([^"]*)"/gi)) checkWhitePair(m[1], `inline style @${src.slice(0, m.index).split('\n').length}:${m[1].slice(0, 40)}…`);
for (const m of src.matchAll(/\.style\.cssText\s*=\s*'([^']*)'/g)) checkWhitePair(m[1], `cssText @${src.slice(0, m.index).split('\n').length}`);

// ---------- result ----------

if (fail.length) {
  console.error('FAILURES:', fail);
  process.exit(1);
}
console.log('OK — design tokens hold: One-Root (no px font sizes), Tint-Through-Token (no hardcoded palette literals), White-Pair (accent text uses --accent-contrast)');
