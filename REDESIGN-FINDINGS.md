# Orga-naes Redesign — Phase 1 Findings

Read-only diagnosis of `Orga-naes.html` (8,677 lines) against the Mission Control
redesign brief and the five skills (impeccable, taste, review-animations,
apple-design, redesign-skill). Evidence is `file:line`. No code changed.

Baseline commit: `a3dff27` (tag `released-baseline-2026-09-10`).
Status: findings only — the Phase 2 spec (`DESIGN.md` v2) resolves these.

---

## Blocking (a11y / motion standards)

### F1 — No `prefers-reduced-motion` handling anywhere
Evidence: 0 occurrences of `prefers-reduced-motion` in the file.
All 18 keyframe animations + 74 transitions run regardless of the OS setting.
`review-animations` Standard 8 and `apple-design` §14 both make this a block.
**Fix phase:** 3D/3E — add a reduced-motion block; movement → opacity cross-fade.

### F2 — No hover gating
Evidence: 0 `@media (hover: hover)` queries vs 77 `:hover` rules.
Touch devices inherit hover motion that can stick. Standard 8.
**Fix phase:** 3D.

### F3 — Danger text fails AA on dark card
Evidence: `--danger:#e05555` on `--card:#303030` = **3.52:1** (needs 4.5:1).
Danger is used as *text* (overdue labels, destructive buttons, error context),
not just as a border/dot. Measured in the report above.
**Fix phase:** 3A — lift danger (Mission Control `#ff5c5c`) and re-verify.

### F4 — Light-theme accent text fails AA
Evidence: `--accent:#7b68ee` on `--card:#ffffff` = **4.15:1**.
Active split-list title uses `color: var(--accent)`
(`#pf-root .pf-split-list-item.pf-split-active .pf-split-list-title`, ~line 468/825).
**Fix phase:** 3A/3D.

### F5 — `ease-in` and `transition: all`
Evidence:
- `#pf-root .pf-item-removing { animation: pf-slide-out 0.2s ease-in forwards; }` — line 796. `ease-in` on a UI exit delays the watched moment (Standard 3, block).
- `transition: all 0.15s` on `.pf-split-collapse-btn` — line 910. Unbounded property animation (Standard 7).
**Fix phase:** 3E.

---

## Structure / maintainability

### F6 — Palette sprawl (181 distinct colors; ~54 hardcoded hex lines)
Evidence: 330 hex occurrences, **183 distinct**; ~54 lines carry a raw hex that is
not a token definition. Much of the count is 10 preset objects × ~15 tokens each.
**Implication:** collapsing presets to ~5 variants (approved decision) roughly halves
the color surface and is the single biggest de-risking move for retheming.
**Fix phase:** 3A.

### F7 — Inline-style density blocks component work
Evidence: **281** `style="…"` attributes + **311** `.style.* =` assignments.
Component recipes cannot be unified while styles live inline; every reskin is a
scavenger hunt. This is the real reason design skills stall on this file.
**Fix phase:** 3B (peel to classes while reskinning).

### F8 — Radius drift
Evidence (counts): `6px`×79 but also `5px`×11, `8px`×12, `12px`×5, `14px`×3,
`16px`×6, `10px`×2, `7px`×2, `20px`, `24px`×2, `999px`.
DESIGN.md declares 6 / 8 / pill; reality has ~10 values.
**Fix phase:** 3A/3C — lock 4px workhorse + 6px container + pill.

### F9 — z-index sprawl (no scale)
Evidence: `99999`, `10001`, `10000`, `9999`×3, `9499`, `9300`, `9200`, `9000`–`9003`,
`8999`, `300`, `200`×4, `100`, `99`, `60`×8.
No documented layer system; collisions are latent.
**Fix phase:** 3C — define and apply a named z-scale.

### F10 — No spacing scale
Evidence: padding has **25+ distinct** values (`6px 8px`×15, `2px 7px`×12,
`5px 12px`×11, …); gap uses `6px`×37, `8px`×24, `4px`×14, `10px`×9 plus off-grid
`3px`, `5px`, `7px`. Rhythm is close to a 2px grid but not enforced.
**Fix phase:** 3C.

### F11 — Duplicated panel/container recipes
Evidence: `.pf-options-panel`, `.pf-activity-panel`, `.pf-category-popover`,
`.pf-comment-panel`, `.pf-shortcuts-panel` each re-declare
`border-radius:16px` + `box-shadow: 0 20px 50px rgba(0,0,0,0.5)` and near-identical
padding/heading styles (lines 1126, 1258, ~1310, ~1364, ~1338). 17 separate
`border-radius:100px` pill recipes.
**Fix phase:** 3B — one Panel and one Pill recipe.

### F12 — Resting shadows violate Flat-At-Rest
Evidence: `box-shadow` on resting `.pf-node` (933), `.pf-split-list-dot` (833),
`.pf-zoom-controls` (394), static FAB/menu items (168, 184, 206).
DESIGN.md Flat-At-Rest says shadows only on interaction/float/drag.
**Fix phase:** 3B/3C.

### F13 — Font stack duplicated 19×
Evidence: the full `-apple-system, BlinkMacSystemFont, 'Nunito', …` stack is
repeated 19 times instead of inheriting from `#pf-root`.
**Fix phase:** 3B.

---

## Typography

### F14 — Hierarchy is flattened (secondary ≈ primary)
Evidence: dark theme `--text:#dcddde` (9.70:1) vs `--text-dim:#d0d0d0` (8.56:1) —
ratio between them **1.13×**, i.e. both read as "bright white." DESIGN.md calls
`--text-dim` "deliberately bright"; consequence is weak scan hierarchy on a dense board.
**Fix phase:** 3A — Mission Control `--text-dim:#8b95a3` restores real separation.

### F15 — No tabular numerals
Evidence: 0 `tabular-nums`. Counts/progress/XP/dates are proportional, so digits
shift width between renders in a data-dense UI (taste + apple-design §15).
**Fix phase:** 3A — Plex Mono + `font-variant-numeric: tabular-nums`.

### F16 — No clean type scale (fractional steps)
Evidence: 26 distinct `font-size` expressions including half-pixel steps
(`-4.5px`×9, `-2.5px`, `-1.5px`, `-3.5px`, `-5.5px`). One-Root holds (good), but the
scale itself is ad-hoc rather than a named ladder.
**Fix phase:** 3A — define explicit type tokens (display/title/body/label/meta).

---

## Motion

### F17 — Entrance animations are keyframes (not interruptible)
Evidence: `pf-slide-in`, `pf-slide-out`, `pf-list-slide`, `pf-view-fade`,
`pf-subrow-in`, `pf-expand` used for appear/disappear. Keyframes restart from zero
and cannot be retargeted mid-flight (Standard 6; apple-design §3).
**Fix phase:** 3E — transitions/springs for anything user-triggered.

### F18 — No `will-change`, mixed durations
Evidence: 0 `will-change`; durations mostly `0.15s` (good, matches DESIGN) but
`0.6s`×2 and `0.35s`×3 appear. 1 `cubic-bezier`, rest generic `ease-out`.
**Fix phase:** 3E — adopt one custom curve + spring vocabulary.

---

## Dead / vestigial (cleanup, non-blocking)

- `pf-theme-eyecare` (JS, line ~6662) vs `.pf-theme-eye-care` (CSS, line 304) — spelling mismatch; eye-care class is never applied by `applyThemePreset`.
- `#pf-due-panel` / `renderDuePanel` retained in `ALL_MODALS` but no open path (user view is `#pf-duelist-panel`).
- `#pf-collapse-cats` has no click listener, yet `.click()` is called (5066/5222/5723).
- `#pf-theme-toggle` hidden; theming lives in the options panel.
- `setViewMode` (4760) always writes `'focus'`; `.pf-card-mode` styling is unreachable.

**Fix phase:** 3B/3F decide keep-or-remove (they are behavior-neutral today).

---

## What the audit says about the plan

- **The token swap (3A) is the right first lever** — the app is ~90% token-driven,
  so a new token block + 5 presets + type tokens lands most of Mission Control
  with minimal structural edits.
- **F7 (inline styles) is the real blocker** for the component-unification phase,
  not the tokens. Budget most of 3B for it.
- **F1/F2/F5/F17 are hard `review-animations` blocks** and must be closed in 3D/3E
  before motion is considered done.
- **F3/F4 are the only true AA failures**; both are resolved by the Mission Control
  token values and re-checked in 3D.

## Suggested order into Phase 2
`DESIGN.md` v2 must specify, at minimum: token map (incl. danger fix, text-dim fix),
type ladder + tabular-nums rule, radius/space/z scales, one Panel/Pill/Card recipe,
and the motion curve/spring vocabulary. Then stop for approval before 3A.

---

## review-animations verdict (Phase 3E, 2026-09-11)

Scope: the Phase 3E motion pass. Evidence re-verified in `src/` at verdict time;
build + tests green (`npm run build && npm test`, design-token guard + date utils).

| Finding | Before | After | Why |
|---------|--------|-------|-----|
| F1 | 0 `prefers-reduced-motion` | `src/styles/15-a11y.css:6` reduced-motion block | Standard 8 — reduced-motion now handled in one place |
| F2 | 0 hover gating vs 77 `:hover` rules | `@media (hover: hover) and (pointer: fine)` gates (e.g. `.pf-badge`, `.pf-subrow`) | Standard 8 — touch devices no longer inherit sticky hover motion |
| F5 | `.pf-item-removing` used `ease-in` on a UI exit | rule deleted (rule was dead — no removal path animates items) | Standard 3 — `ease-in` on UI is a block; deletion preferred over fixing a vestigial animation |
| F5 | `transition: all` on `.pf-split-collapse-btn` | specific properties (`color`, `border-color`, `background`) with `var(--dur-state) var(--ease-console)` | Standard 7 — unbounded `all` animates unintended properties off-GPU |
| F17 | `.pf-split-list-item`/`.pf-subrow` entrance keyframes re-fired on every data render | deleted | Standard 6/1 — per-render entrances flickered on every change; nothing entered for the user |
| F17 | `pf-view-fade` keyframe entrance | `@starting-style` + transition (`08-components-categories.css`) | Standard 6 — transitions retarget from current state; keyframes restart from zero |
| F17 | dead keyframes `pf-slide-in`, `pf-slide-out`, `pf-view-fade`, `pf-subrow-in` | deleted | Remedial hierarchy step 1 — delete vestigial motion |
| F18 | 1 token curve + 74 generic-easing transitions | two tokens (`--ease-console`, `--ease-out-strong`) applied to all in-scope motion; 0 bare `ease`/`ease-in` left in `src/` | Standard 3 + cohesion — one authored vocabulary, no built-in weak easings |
| — | 9 remaining literal `cubic-bezier`/`ease` values (handoff list) | tokenized this pass: `01-chrome` search float, scroll-top, `.pf-node` max-width, `.pf-badge`, `.pf-sub-comment`, `.pf-sub-dot`, mobile node slide + ext-due expand, `11-multi-select` select-bar | Token changes now propagate everywhere in-scope |
| — | 4 stragglers found by final sweep (not on handoff list) | tokenized: `.pf-split-list-status` (ease → console), `.pf-progress-ring` stroke-dashoffset (material curve → out-strong), `pf-tooltip-in` (literal → out-strong), `pf-save-shake` (ease → out-strong) | Same 300ms-color / entrance / attention patterns already standardized |
| — | `.pf-ctx-menu` scale entrance | `transform-origin: top left` + `var(--ease-out-strong)` | Standard 5 — trigger-anchored origin, not center |

### Tier 1 — Block

None. All four hard blocks (F1/F2/F5/F17) are closed in source. Escalation triggers
swept clean in `src/`: no `transition: all`, no `ease-in`, no `scale(0)`, no keyframe
restarts on rapidly-triggered UI (toast/ctx-menu now enter via token-eased keyframes
with correct origins; select-bar uses `pf-selbar-in 0.16s var(--ease-out-strong)`).

### Tier 2 — Approve with findings

- **`.pf-fab`, `.pf-bottom-nav`, `.pf-update-pill` keep literal `cubic-bezier(0.16, 1, 0.3, 1)`**
  (`src/styles/01-chrome.css:21,76,94,97`). Correct as-is: these elements sit outside
  `#pf-root`, so `var(--ease-*)` would resolve to nothing and kill the transition
  silently. Findings: literals defeat future token retuning; if the curve changes,
  these must be edited by hand. Fix belongs to 3B-3 (peel inline styles and re-home
  this family inside a scoped root).
- ~~**`11-multi-select-bulk-actions.js` select-bar hardcodes `background:rgba(24,21,38,0.97)`**~~
  **FIXED 2026-09-11:** full recipe peeled from cssText into the
  `#pf-root .pf-sub-select-bar` class; background is now
  `color-mix(in srgb, var(--card) 97%, transparent)`. Verified live: white pill on
  Daylight, dark `--card` ink on Midnight Cyan, entrance animation unchanged.
  Live-reproduced on Daylight before the fix (dark pill, illegible buttons),
  live-verified after.
- **Layout-property transitions survive by design**: `.pf-node` `max-width` (0.2s),
  `.pf-ext-due` `min-width/padding/border` (0.25s), `.pf-cat-items-wrap` `max-height`
  (0.3s). Standard 7 would flag these; all are low-frequency reveal/collapse transitions
  with no GPU substitute for their layout effect. Accepted with the caveat that none
  should be added to high-frequency paths.

### Tier 3 — Approved

- Short 100–150ms color/background state transitions intentionally left on default
  easing — the curve is imperceptible at that duration.
- `.pf-node` hover `translateY(-1px)` — GPU-only, gated, acceptable.
- `pf-status-flash` (0.35s, includes `box-shadow`) — paint-only, brief, error/status
  feedback on rare events.
- `pf-offline-blink` infinite — justified status indicator.
- `pf-save-shake` 0.4s — rare error feedback, now on `var(--ease-out-strong)`.
- `pf-drop-indicator-pulse` infinite during drag — transient, drag-scoped, justified.

**Verdict: APPROVE** (with findings). Phase 3E motion is complete; both carry-over
items are now CLOSED: select-bar rgba fixed (2026-09-11, peeled into
`.pf-sub-select-bar`) and FAB-family literals tokenized (2026-09-11, motion tokens
moved to `:root` — they are theme-independent, so out-of-root chrome resolves them;
zero cubic-bezier literals remain outside the two token definitions).

**Verification at verdict time:** `npm run build` + `npm test` green; `cubic-bezier`
search over `src/` returns only the two token definitions; zero bare `ease`/`ease-in`
in `src/`; live preview confirms `.pf-fab`/`.pf-bottom-nav` compute the token curve.
(Verdict-time note: the original audit required out-of-root selectors to stay literal
per the then-#pf-root-only token scope; the `:root` move supersedes that rule —
see HANDOFF.md "Token scope rule (UPDATED)".)


---

## impeccable audit — Phase 3F (2026-09-11)

Detector: `impeccable detect --json Orga-naes.html` — 58 raw findings, all verified
in context (live computed-style probes + source reading). After fixes and
false-positive resolution: **3 real defects (fixed during this audit), rest
accepted with evidence.**

### Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | 0 AA failures across 6 themes (3D automated audit); detector contrast hits are static-analysis false positives (real pairing ~13:1) |
| 2 | Performance | 3 | GPU-only transforms dominate; 3 accepted paint-only flashes; layout-property collapse transitions accepted with caveat |
| 3 | Theming | 4 | Full token system + guard-enforced tints; the one real hole (undefined --panel token) fixed this pass |
| 4 | Responsive Design | 3 | Fluid clamp type, 5 breakpoints, no horizontal overflow; 3 sub-24px desktop sort-bar targets flagged P3 |
| 5 | Implementation Integrity | 4 | Coherent Mission Control system end-to-end; drift findings were 3 isolated defects, all fixed |
| **Total** | | **18/20** | **Excellent (minor polish)** |

### Implementation Integrity Verdict

**PASS.** The implementation expresses a coherent, product-specific system:
one cyan signal on near-black consoles, mono digits for measurement, a single
authored motion curve, named z-ladder, 4/6/10/pill radii — all enforced by the
design-token guard test. The detector's design-system-* classes found only 3
genuine drift sites (all legacy literals surviving the retheme), fixed here;
everything else was verified as token indirection the static analyzer cannot
resolve, or documented exceptions.

### Executive Summary

- Audit Health Score: **18/20** (Excellent — minor polish)
- Issues: 3 × P1 (**all fixed during audit**), 0 × P2, 5 × P3 (accepted/documented)
- Detector raw counts: low-contrast 17 (false positives), gpt-thin-border-wide-shadow 20 (advisory; hairline+carried-shadow is the authored Mission Control recipe for held elements), design-system-color 15 → 14 (one real: update pill), radius 2 → 1 (9px sublist fixed; 2px mark is the documented inline-marker exception), font 1 (false positive: Arial only inside the exported HTML *report artifact*, not app UI), pulsing-dot 1 (justified status indicator), dark-glow 1 (the signal-ring token, by design), cramped-padding 1 (split-detail; the detail node inside provides the actual inset — visual verified).

### Fixed during audit (P1)

1. **Update pill rendered legacy ink on every theme** — `var(--panel, #1e1e2e)`:
   `--panel` was never a token, so the pill always fell back to Night-Workshop
   purple-dark. → `var(--toast-bg, #141a22)`, fallbacks re-aligned to Midnight; accent
   fallbacks `#7b68ee→#2fd4ff` (01-chrome.css).
2. **Body-appended surfaces lost #pf-root theming** — Ctrl+S save modal and both
   drag ghosts (39-accessibility, 25-weekly-planner) appended to document.body,
   where palette tokens don't resolve: modal rendered old purple ink (white
   text on Daylight), ghosts rendered unstyled/hardcoded. → re-parented into
   #pf-root (position:fixed keeps viewport placement) + tokens/honest fallbacks.
3. **Off-scale 9px sublist radius** → `var(--radius-overlay)` (3C straggler).

Plus: online connection dot hardcoded #4ade80 → `var(--completed, #4ade80)`
(offline side already used --danger; system-health now semantic).

### Accepted exceptions (P3, documented)

- **17 contrast findings**: detector pairs literal #000000 text with dark bg —
  it cannot resolve var()/color-mix tokens. Real values: #d7dde5 on #0a0d11
  ≈ 13.4:1. 3D's rendered-render audit already proved 0 AA failures.
- **20 hairline+shadow advisories**: the hairline edge + --shadow-carried combo
  is the authored recipe for held/floating surfaces (modals, menus); rest stays flat.
- **Category color presets + confetti palette** (06/27 JS): user-content color
  pickers and celebratory particles — intentionally outside the chrome palette.
- **HTML report export** (30): standalone artifact for sharing, system font
  deliberate — not app chrome.
- **Print sheet** (90-print): black-on-white is the point of print.
- **3 desktop sort-bar buttons < 24px tall** (search toggle 24×23, collapse btns
  ~20px): dense-console aesthetic; mobile variants carry min-height 24px+.
  Only worth revisiting if touch mis-taps show up in real use.

### Positive findings

- The design-token guard test caught real drift twice this phase (select-bar
  comment, Tint-Through-Token) — automation earning its keep.
- Detector + live verification complement each other: every real finding this
  pass was a *rendering-context* bug (undefined token, wrong append parent) —
  exactly the class static analysis can see but eyeballs miss on the default theme.
- Zero console errors across all preview sessions.

### Recommended actions

No impeccable fix-commands warranted — no open P0/P1/P2. Proceed to **Phase 4
(verify & ship)**: screenshot matrix, reduced-motion pass, PWA offline check,
manual smoke test. Re-run this audit only if Phase 4 turns up visual regressions.

---

## Phase 4 — screenshot matrix + reduced-motion (2026-09-11)

### Matrix results

| Surface | Midnight Cyan | Amber CRT | Phosphor Green | Monochrome | Daylight |
|---------|--------------|-----------|----------------|------------|----------|
| Desktop/tablet band (906×888), seeded data, list view | ✅ captured | ✅ | ✅ | ✅ | ✅ |
| Project detail (badges, due chips, icon chips, progress ring) | ✅ | via panel shot | — | — | — |
| Options panel (SVG icons, section headers) | — | ✅ captured | — | — | — |

- All five presets fully re-ink: toolbar, sort bar, category groups, progress
  ring, badges, chips. Zero legacy (Night-Workshop/purple) artifacts in any capture.
- Phone shell (≤640px) verified **structurally** (class-forced probe): bottom
  nav `flex`, FAB `flex`, toolbar `none`, update pill docked bottom, no horizontal
  overflow. Not visually captured — the preview window is fixed-width and iframe
  boots jam the preview bridge.
- >1400px full-desktop band verified by source (media query is max-width-gated;
  above it the split view + toolbar layout is the default, which is what the
  captures show at 906px desktop class).

### Reduced-motion

- CSS `prefers-reduced-motion` block verified live in the built file (all
  animations/transitions collapse to 0.01ms, iteration 1).
- **Two real gaps found & fixed:** the particle background and the confetti
  celebration are rAF canvas loops — invisible to the CSS media query and
  previously ran regardless. Both now early-return when
  `(prefers-reduced-motion: reduce)` matches. Also fixed a stale comment
  (particle accent fallback claimed white; corrected to Midnight Cyan).

### Honest gaps (need a real browser, listed for the local-run checklist)

1. Visual captures at true >1400px and phone widths (resize a real window;
   the class-forced probe covers layout, not pixel detail).
2. `prefers-reduced-motion: reduce` enabled in DevTools rendering panel, then
   click-through: confirm zero motion AND zero particles/confetti.
3. Touch interaction pass on a real device (the preview has no touch: device
   class detection is touch-gated by design).
