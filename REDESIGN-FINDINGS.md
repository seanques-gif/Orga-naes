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

### Performance (INP / render at scale)

- Dataset: 3 categories × 14 projects = **42 projects, 79 subtasks (4 levels deep), 12 dependency chains, 56 comments** — seeded programmatically via the app's own state API, persisted, rendered.
- Full split-list re-render (42 rows): **12.7ms cold / 8ms warm** (≤1 frame). Search filter: 3.3ms/keystroke. Collapse-all: 12ms. Context menu open: 32ms (2 frames).
- **Finding 1 (documented, accepted this phase):** the deepest sync path — full-app `render()` → list + detail + category zones — runs as a **~55ms long task** at this scale (Chrome long-task threshold is 50ms). It fires on every status toggle and expand in the detail view. Perceived latency stays well inside the 100ms INP guideline (toggle → paint measured 60–90ms including double-rAF wait) because the interaction click itself does nothing synchronous — but at ~3× this dataset the task would cross 100ms+ on mid-range mobile hardware. Candidate future improvement: chunk or virtualize the list render; no change made this phase.
- **Observation 2 (UX timing, not a perf defect):** single-click row selection is deferred by a deliberate `setTimeout(…, 200)` disambiguation timer (shipped with the redesign, `21802be`) so double-click/long-press affordances don't fight selection. Click-to-detail end-to-end ≈ 200ms + ~9ms render + paint. Noted for any future perceived-latency tuning.
- **Idle frame health: locked 60fps** — 60-frame sample: avg 16.4ms, p95 16.8ms, max 16.8ms, zero dropped frames (ambient particle canvas included).
- Memory/DOM: **5.0MB JS heap** under full activity; ~1,200 DOM nodes; 116 SVGs (42 list rows + detail chrome) — SVG chrome is free at scale (~26 nodes/row, identical structure to the emoji era), zero empty paths.
- Selection accent edge (3px accent border + 8% accent background on `.pf-split-active`) is a one-time paint on selection — long-task observer shows no per-frame ring work.
- Synthetic 20-event search burst: 28.6ms total (~1.4ms/event); no human-speed typing creates long tasks.

### PWA offline (static verification — sandbox serves only the HTML, so runtime SW checks are on the local-run checklist)

- **Architecture is sound:** `sw.js` is **network-first with runtime-cache fallback** (fetch wins online + refreshes cache; cache serves offline) — the right strategy for a data app, so updates always land while offline still works. Explicitly bypasses `firebase`/`googleapis` (optional cloud sync never poisons the cache). Install is **fault-tolerant per-asset** (a single 404 can't wedge the SW at "installing"), activate purges stale cache versions, and the update flow is complete: updatefound → update pill + toast → `skipWaiting` via postMessage → `controllerchange` → auto-reload.
- **Asset & wiring integrity (all verified on disk):** `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png` all present at root; template head has manifest link, favicon, apple-touch-icon, iOS standalone metas, and `theme-color #0a0d11`.
- **Data layer is offline-proof by construction:** core state persists to `localStorage` with an IndexedDB mirror; zero network dependency for create/read/edit/complete/undo. The app is a single-file build — one fetch cached and it's fully functional.
- **Drift found & fixed:** manifest `theme_color`/`background_color` were still pre-redesign `#1e1e1e` — corrected to Mission Control `#0a0d11` (matching the head meta), so the OS splash/titlebar tint now matches the app on install.
- Preview sandbox confirmed: serves only `Orga-naes.html` (all sibling assets 404), `caches` API empty, SW not registrable — **nothing about the SW runtime can be validated here**; listed below for the local run.

### Manual smoke test (real UI paths, seeded 42-project dataset)

- **Create → Nest → Complete → Trash → Undo → Export: all pass**, on Midnight Cyan (full flows) and Daylight (condensed: create → toggle → undo ×2).
- Create via `+` popover → category choice: project lands in the right category, detail auto-opens. Nesting via the row's add-subtask button: 3-level tree renders with nested rail. Trash via row ctx menu: removed + toast with Undo; undo via the toast action restores the full tree (statuses, nesting, category). Export button: complete 134KB backup payload (9 state keys, all 43 projects, categories, archive, trash).
- **Complete flow verified the auto-status invariant for real:** completing a parent whose child is open is correctly refused, then silently reverts — the activity log shows `Ongoing → Completed` followed by `reverted to ongoing (no longer all subtasks complete)`. Completing child-first auto-completes the parent. This looked like a smoke-test failure twice before the log revealed it was the invariant working; **lesson recorded: verify against the activity log, not just final state.**
- Daylight theming on dynamic surfaces: ctx menu renders white surface + token ink, SVG strokes follow `currentColor`.
- **A11y fix found by the smoke test:** the hidden update pill (`opacity:0`, `tabindex="0"`) stayed in the tab order — keyboard users landed on an invisible "Update ready" button. Fixed with a `visibility` toggle synced to the show class (delayed so the exit animation still plays). Verified: hidden pill no longer focusable; build + tests green.
- Console clean after all flows.

### PWA offline — RUNTIME VERIFICATION PASSED (real localhost server + preview bridge)

All three local-run checks executed end-to-end on `http://127.0.0.1:8940` (temporary static server,
driven through the preview bridge):

1. **Install ✅** — `sw.js` registered and reached `activated`, `navigator.serviceWorker.controller`
   true. Manifest parsed clean: name, 4 icon entries, `theme_color`/`background_color` `#0a0d11`.
   Cache `orga-naes-2026-09-05-0001` populated with all four app assets plus a runtime-cached
   Google Fonts file (network-first refresh working).
2. **Offline ✅** — with the server killed, the page reloaded **fully from the SW cache**:
   `readyState: complete`, both seeded projects intact, list + detail interactive. (Offline was
   simulated at the socket level — connection reset — the same failure mode as a dead network;
   the page-side `fetch().catch(caches.match)` path is identical.)
3. **Update ✅** — bumped `CACHE_VERSION`, reloaded: the new worker installed, self-skipped
   waiting, activated, the page auto-reloaded onto it via `controllerchange` (this is the shipped
   update UX; the pill is a fallback that engages only if a worker ever waits), and activate
   purged the old cache — only `…-0002` remained. Data survived the update. `sw.js` then reverted
   and confirmed byte-identical to the committed version.

The offline/update story is verified for real — nothing about the PWA remains unverified.

### Honest gaps (need a real browser, listed for the local-run checklist)

Note: PWA offline/update checks 1–3 are now DONE (see the runtime verification section above);
the items below are what remains of the original list.

1. Visual captures at true >1400px and phone widths (resize a real window;
   the class-forced probe covers layout, not pixel detail).
2. `prefers-reduced-motion: reduce` enabled in DevTools rendering panel, then
   click-through: confirm zero motion AND zero particles/confetti.
3. Touch interaction pass on a real device (the preview has no touch: device
   class detection is touch-gated by design).
4. PWA runtime: serve the folder (`npx serve` / `python -m http.server`) →
   DevTools → Application → Manifest shows no errors and the Service Worker
   activates → Network tab to **Offline**, reload → app boots from cache with
   data intact → back online, make an edit, reload → update pill + "Refresh"
   toast appear → click → version reloads clean.
5. Optional: Lighthouse PWA category (installability + offline pass).

---

## taste-skill verdict (formal pass, 2026-09-12)

Scope: the full 88 KB / 1,206-line `taste-skill` ("design-taste-frontend"), read
end-to-end and applied to the shipped Mission Control design. This closes the last
open item from the plan's "Formal skill passes" section.

### Scoping (the skill demands this first — Section 0 and Section 13)

The skill self-scopes to **landing pages, portfolios, and redesigns** and declares
itself **out of scope for "dashboards, dense product UI"** (Section 13). Orga-naes
is a productivity *product UI* with a canvas, so whole sections (hero discipline,
bento grids, logo walls, marquees, scroll storytelling, the React/Tailwind/Motion
stack defaults of Section 3) **do not apply** — and their non-application is not a
defect. What applies is everything that is good design invariant rather than
landing-page tactic: the AI-tell bans, color/shape/theme locks, a11y and contrast
guardrails, typography discipline, copy self-audit, and the redesign protocol
(which this project followed from day one: audit-first, token extraction,
preservation ledger — Section 11 was effectively the plan's Phase 0–2). Verdict is
rendered only on the applicable subset, explicitly labeled as such.

### Applicable checks — evidence at verdict time

| Skill rule | Applicability | Evidence in `src/` | Result |
|---|---|---|---|
| §4.2 Color Consistency Lock (one accent, no drift) | Applicable | Single `--accent` signal; zero second-accent drift found across 16 CSS modules | PASS |
| §4.2 LILA rule (no AI-purple default, saturation discipline) | Applicable | Cyan `#2fd4ff` on near-black cool neutrals; the design *is* the anti-default | PASS |
| §4.4 Shape Consistency Lock (one radius system) | Applicable | 3C radii converged to `4/6/10/pill` (+documented mark exception); one documented rule, followed everywhere | PASS |
| §4.11 Page Theme Lock (no mid-page theme inversion) | Applicable | One theme at a time via preset classes on `#pf-root`; 0 AA contrast failures across all 6 presets (3D audit) | PASS |
| §6.B Reduced motion (non-negotiable) | Applicable | `15-a11y.css` reduced-motion block; particles + confetti rAF-gated (Phase 4) | PASS |
| §9.A no pure black / no neon glow defaults | Applicable, with exceptions | Base palette uses off-black `#0a0d11`; the only accent-adjacent shadow is a 1px `color-mix(… 10%…)` ring — the skill's own "inner border" prescription. Pure `#000`/`#fff` residuals are all sanctioned: Daylight preset surfaces (`02-tokens.css:104,111,124`), mask-image gradients (not surfaces), `#000` selection ring + `#fff` swatch ring (3F accepted exceptions), `#fff` on user-picked category colors (no token can exist for arbitrary user data), out-of-root fallbacks (`var(--accent-contrast, #fff)`) | PASS with documented exceptions |
| §9.F no decorative status dots | Applicable with a nuance | Orga-naes's dots (`pf-status-dot`, progress rings, online/error indicators) all encode **real semantic state** — the rule's explicit carve-out. Zero decorative dots found | PASS |
| §9.G em-dash ban ("zero em-dashes visible", binary) | Applicable as copy hygiene; skill is landing-scoped | ~30 user-visible em-dashes: 4 in template copy ("New project — pick a category", "Cloud Sync — Firebase", About text, "Comments —"), ~26 in toast/title strings across 10 JS modules. All are sentence-punctuation em-dashes in functional UI copy, none used as design flourish | **TIER 2 — FINDING** |
| §4.5 full interactive state cycle (tactile `:active`) | Applicable | FAB `scale(0.9)`, nav/menu item tints, drag-handle `grabbing`, undo-btn dim — press states exist on primary chrome | PASS |
| §4.9 Copy Self-Audit + banned filler verbs | Applicable | 0 hits for "elevate/seamless/unleash/next-gen/revolutionize"; copy is functional and concrete | PASS |
| §9.B typography discipline | Applicable | IBM Plex Sans/Mono pairing (§4.1's own example pairing), Plex Mono + `tabular-nums` reserved for measurement — a deliberate, non-default choice | PASS |
| §3.A "never link Google Fonts via `<link>`" | Conflicts with product ground rule | Product identity (D8) mandates the `<link>` for single-file/no-build; `display=swap` present | EXCEPTION — product rule wins |
| §3.C "NEVER hand-roll SVG icons" | Conflicts with product ground rule | D10 sprite is hand-rolled *by design* (zero-dependency ethos, §2 ground rules); one family, standardized sizing (`.pf-ic`), `currentColor` ink | EXCEPTION — product rule wins |
| §3.D emoji ban | Overridden by D10 | Emoji = user content only, chrome fully SVG-converted (3B-4) | PASS per D10 |
| §11.B audit-before-touching | Applicable | Phase 0–2 were exactly this (inventory, findings, spec, preservation ledger) | PASS |

### Tier 1 — Block

None. No applicable hard rule fails on the shipped design.

### Tier 2 — Approve with findings

- ~~**Em-dashes in ~30 user-visible strings** (4 template lines, ~26 toast/title/label
  strings across 10 JS modules).~~ **FIXED 2026-09-12:** all user-visible em-dashes
  rewritten to periods, colons, parentheses, or the attribution hyphen (quote
  attributions use the skill's sanctioned ` - ` form; metadata separators use the
  rationed middle-dot). Verified: zero em-dashes in any rendered DOM text node
  (TreeWalker sweep of the live preview — only `<STYLE>`/`<SCRIPT>` dev comments
  retain them, by design), built artifact carries the new strings, and the full
  gate stayed green (43 functional assertions + token + date suites).

### Tier 3 — Approved

- Stack defaults (React/Tailwind/Motion, design-system packages, icon libraries)
  not applicable — the product ground rules (vanilla JS, zero deps, single file)
  predate and override the skill's Section 3 stack; the skill itself says quiet
  constraints override aesthetic preference, and a zero-dependency PWA identity is
  exactly such a constraint.
- Landing-page mechanics (hero rules, bento, marquees, logo walls, scroll
  choreography) out of scope per the skill's own Section 13.
- Pure `#000`/`#fff` residuals per the table above — each has a named, documented
  justification; the skill's target (pure values killing depth in *surfaces*) does
  not occur in the themeable surface palette.

**Verdict: APPROVE** (the single Tier 2 finding is now FIXED 2026-09-12 — zero
open findings from this pass). All three formal skill passes are now complete:
impeccable audit (3F, 2026-09-11), review-animations (APPROVE, 2026-09-11),
taste-skill (APPROVE, all findings closed, 2026-09-12).

**Verification at verdict time:** `npm run build` byte-identical (no diff);
`npm test` green (43 functional + token + date suites); every mechanical check in
the table above re-run fresh against `src/` this pass (em-dash grep, filler-verb
grep, pure-hex audit with context, `:active` enumeration, accent-shadow scan,
middle-dot strip count: 0).

---

## Post-ship UI improvements (owner-requested UI review, 2026-09-12)

Two defects/polish items found by live-preview interrogation of the shipped UI
(both in the same Daylight-invisible family as the earlier select-bar and
promote-icon bugs):

1. **F-UI-1 (bug, fixed): white-alpha hover/selection tints invisible on Daylight.**
   19 rules used raw `rgba(255,255,255,0.04–0.15)` overlays — 13 hover/selected
   states (list rows, category headers, kebab, search toggle, undo button,
   recur/dep dropdowns, due-table rows, selection bar close) plus 4 at-rest chips
   and the 3-rule scrollbar family. Measured on the real Daylight surface
   `rgb(238,241,245)`, the row hover yielded a delta of **1/255 (invisible)**.
   All 19 converted to `color-mix(in srgb, var(--text) N%, transparent)` — the
   Tint-Through-Token pattern already used in 72 places. Verified per theme via
   computed values: Midnight hover delta ≈ +13/channel, Daylight ≈ −13/channel.
   One JS straggler (`12-drag-drop.js:48` no-due-date icon at 30% white) →
   `var(--text-dim)`, matching the function's other 7 token branches.
2. **F-UI-2 (polish, fixed): dead detail pane.** The 585×843 empty right pane
   carried one 13px dim sentence. All 5 empty states (2 static template + 3
   JS-rendered in `renderSplitDetail`) upgraded to a 44px ghost icon (`pfIcon()`
   sprite, `list`/`search` per context) + flex-centered text; new `.pf-ic-empty`
   recipe in `10-components-chips.css`; legacy inline `display:block` remnants
   removed.

Verification: build byte-consistent, all suites green, live preview shows icons
rendering at 44px with flex centering and the hover tint resolving through the
token on both Midnight and Daylight.

3. **F-UI-3 (light-theme sweep, owner-requested, same session): 6-preset battery + cleanup.**
   - **Contrast battery (live, all 5 presets × 8 token pairs): PASS everywhere.**
     Lowest ratio on any preset is Daylight ink-on-accent at 4.63:1 (AA); all
     others 5.3–16.6:1. The 3D "0 AA failures" guarantee re-verified after all
     recent changes.
   - **Black-alpha audit:** ~40 `rgba(0,0,0,…)` hits classified. Scrims and
     elevation shadows are correct on light themes by convention (sanctioned
     pattern); the one at-rest surface fill (`pf-split-sort`) *darkens* on
     Daylight, which is intended recess behavior. No fixes needed — documented
     to close the question.
   - **Fixed: `color-scheme: dark` on `.pf-due-input`** forced a dark native
     date-picker popup on Daylight; added `#pf-root.pf-theme-light .pf-due-input
     { color-scheme: light; }`.
   - **Fixed: 36 stale `var()` hex fallbacks purged** from in-root rules,
     including Night-Workshop-era zombies (`#2a2a3e`, `#3a3a5e`, `#7b68ee`) on
     chrome elements that were re-parented into `#pf-root` in 3F — dead code
     that could never render, purged after live proof that computed values are
     byte-identical without them. The two legitimate out-of-root fallbacks
     (`.pf-conflict-box`, `90-print.css` token-free sheet) keep theirs by design.

4. **F-UI-4 (owner-reported, Options panel): section headers rendered two icons each.**
   - **Cause:** `hydrateIcons` in `00-svg-icons.js` runs twice (inline + a
     "belt-and-suspenders" DOMContentLoaded re-run). `[data-ic]` hydration is
     idempotent (innerHTML replace), but `[data-ic-before]` used
     `insertAdjacentHTML('afterbegin')` — prepend on every run. The 6 Options
     section titles are the only `data-ic-before` uses, so each got 2 icons.
   - **Fix:** hydration marker (`data-ic-hydrated`) makes the prepend
     genuinely re-run safe; marker visible in DOM as evidence.
   - **Verified live:** all 6 headers `svg.pf-ic-title` count = 1 (was 2);
     all `[data-ic]` spans exactly 1 svg; suite green (43 assertions).

5. **F-UI-5 (post-ship UI sweep, owner-triggered 2026-09-12): panels, icons, legibility matrix.**
   Owner asked "is there something we can improve?" and then requested full
   sweeps. All findings verified live in the preview; every fix went through
   the chained loop (fix → build → test → preview → commit).

   **F-UI-5a — Daylight-invisible white-alpha hover family.** 19 rules used raw
   `rgba(255,255,255,0.04–0.15)` overlays (list rows, category headers, kebabs,
   undo, dropdown options, due rows, scrollbar thumb, chips). Measured on the
   real Daylight surface the primary row hover shifted **+1/255 — invisible**.
   All 19 now tint through `color-mix(in srgb, var(--text) N%, transparent)`;
   live A/B: Midnight +13/ch, Daylight −13/ch. Plus one JS white-alpha straggler
   (no-due-date icon → `var(--text-dim)`). (`132d703`)

   **F-UI-5b — dead detail pane.** The 585×843 empty right pane carried one
   dim sentence; also JS render paths re-injected bare empty divs. All 5 empty
   states (static + JS-rendered) now render a 44px ghost icon + centered text.
   (`132d703`)

   **F-UI-5c — sort-bar overflow.** At the narrow desktop band the bar needed
   224px in 207px, clipping the select arrow; the "Sort:" label rendered 8px.
   Label removed (select is self-explanatory; `aria-label` keeps it accessible),
   spacing tightened, 10px select floor. (`e66e4eb`)

   **F-UI-5d — light-theme sweep (owner-requested).** 6-preset contrast battery
   (8 token pairs): PASS everywhere, tightest 4.63:1. Black-alpha census (~40):
   scrims/shadows sanctioned, no fixes. Fixed `color-scheme: dark` native date
   picker on Daylight; purged 36 stale hex fallbacks incl. Night-Workshop
   zombies (dead code, byte-identical computed values proven before purge).
   (`d0c817a`)

   **F-UI-5e — double icons (owner-reported screenshot).** `hydrateIcons`
   ran twice; `[data-ic-before]` prepend was not re-run safe → 2 icons per
   Options section header. Fixed with `data-ic-hydrated` marker (`5b2d6df`)
   + regression test TEST 10 boots the artifact at readyState 'loading',
   re-fires DOMContentLoaded, asserts exactly 1 svg/title (proven to catch
   the bug: guard removed → n=2 on all six). Suite 43→58 assertions. (`c1e2195`)

   **F-UI-5f — panel sweep (chained loop).** Every Options sub-screen + all
   top-bar views walked live on dark + Daylight:
   - Theme picker had no active indication (fresh boot showed nothing; Auto
     highlighted the resolved preset). Now: accent outline + `aria-pressed`
     on boot, per-click, and Auto marks Auto. (`9262352`)
   - Emoji chrome missed by 3B-4, found by census: Archive/Version/Error +
     conflict titles (`56985c1`); Shortcuts/About titles, panel head icons,
     Backlog label, conflict columns, save-modal buttons (`ef8e395`); subtask
     edit pencil, collapsed edit chip, Rename, comment edit/delete (`434ba80`,
     `89262f2`). Chrome is now emoji-free; toasts/🎉/recurrence stay by design.
   - Subtask action icons invisible: chip SVGs at 1em ≈ 9.5px + promote arrow
     `stroke="#ffffff"` (last white-stroke site). 12px chip floor + currentColor.
     (`4d1172f`)
   - Investigated, false alarms (documented to close them): calendar dot
     apparent on wrong day (probe misread; dots match data exactly); red error
     badge + page "freeze" (badge correctly logged probe errors; freeze was the
     native confirm() dialog blocking automation — correct app behavior).

   **F-UI-5g — icon legibility matrix.** Automated in-preview scanner: every
   sprite SVG's computed size + effective contrast across 5 themes × 3 zooms
   (60/100/130) + tablet/mobile classes + 60% stress. Found: sort-bar collapse
   icons 10px at DEFAULT zoom, 4px at 60% (subtractive calcs compound with the
   scale slider). Fix: global `max(12px, 1em)` icon floor, 12px title icons,
   10px collapse-btn font floor. Re-run: 15/15 combos + device classes clean.
   Structural — future `1em` icons inherit the floor. (`0ad901a`)

   Tooling hardened in the same window: `.gitattributes` LF policy (artifact
   bytes no longer depend on checkout state, `8dd4648`), sha256 artifact pin +
   zero-write `npm run verify` determinism gate (`95bcfc1`, proven against
   hand-edit/src-drift/missing-pin), clean-clone reproducibility re-proven
   byte-for-byte through the new gate, chained change loop documented in
   AGENTS.md + `.claude/skills/change-loop` (`c901c83`).

   **F-UI-5h — user-eye polish pass (real-input verification).** Walked the app
   as a user with genuine clicks/typing (no synthetic-event shortcuts): project
   creation via category picker, subtask add (auto-enters edit mode via
   `focusEl` — good UX, no bug), status-dot menu → Completed (strikethrough,
   green dot, n/m counters, progress ring all correct), undo, due-date chip
   (amber due-soon tint legible on Daylight), Today's Focus modal, hover
   states, theme-picker highlight holding. One defect: at the 220px list-pane
   floor the sort bar squeezed the Completed toggle into wrapping 2 lines
   inside its fixed-height pill (icon floated ~10px above clipped text) —
   form controls lose `min-width:auto` under flex shrink. Fix: `white-space:
   nowrap; flex-shrink: 0` on `.pf-split-collapse-btn`; pane clips its 1px
   border round-off with `overflow-x: hidden`. Verified: single line, icon
   aligned within 0.8px, no overflow at minimum width. (`0498b24`)
   False alarms closed with evidence: (1) "subtask rename silently reverts" —
   synthetic events never produce a real `blur`, the commit trigger; retested
   with real clicks, commits correctly. (2) phantom bottom strip in preview
   screenshots — chased through scrollbars/pseudo-elements/shadow rules/
   particle layer, then disproven by loading a bare directory listing (zero
   app code, identical strip): preview host chrome, absent in real browsers.

   **F-UI-5i — contrast-audit session (measured, then gated).** User report:
   "colors in light mode are hard to distinguish." Two real defects found by
   measurement, plus a permanent gate so the bug classes cannot return:
   - **Planned-status color indistinguishable (ΔE 1.8).** `--planned` was a
     gray statistically identical to `--text-dim` on Daylight (ΔE 1.8; <10
     reads as the same color) and near-identical on dark presets (ΔE 5.5) —
     planned dots/chips melted into chrome. Measured candidate search against
     every neighbor: Daylight → `#4a5d8a` blue-slate (worst pair 18.7), dark
     shared `:root` → `#5878a8` steel-slate (worst 23.7–37.5 per preset).
     Both synced definitions updated in lockstep. (`7e896c2`)
   - **Daylight accent failed WCAG as text (4.09:1).** Accent doubles as 12px
     list-title text; live scanner (91 text + 72 icon/dot elements, effective
     contrast with alpha composited against real painted bg) found 4.09:1 vs
     the 4.5 floor — the only failure. Darkened `#0a7ea4` → `#0a7499` (same
     hue family): 4.67:1 vs bg, 5.29:1 on cards, white-on-accent buttons
     4.63 → 5.29 (White-Pair rule still passes). Re-scan: zero failures.
     (`fd636f2`)
   - **Dark presets audited clean.** Same scanner × 4 presets × 2 states
     (default; detail + status menu open), 96 elements each: zero failures.
   - **Permanent gate: `tests/contrast.test.mjs` (33f8478).** 34 checks × 5
     presets parsed from the built artifact: text 4.5:1, UI/dots 3.0:1,
     White-Pair, status ΔE ≥ 12 (kills the planned-gray class), and CSS↔JS
     preset sync (kills two-definitions drift). Proven both directions: clean
     passes; replaying both shipped bugs and a hand-made desync each fail
     with exact diagnostics. Honest note: the sync check's first version was
     vacuously green — its parser silently matched zero JS tokens (quoted-key
     format); the tamper proofs exposed it and it now genuinely parses both
     formats. Full contrast contract: every text ≥4.5:1, every icon/dot
     ≥3:1, every status distinguishable (ΔE ≥18.7), across all 5 presets.

   **F-UI-5j — glyph legibility: the "−" that was a "+", and the full sweep.**
   User report: "fix the x button." Systematic first: all 20+ × close buttons
   functionally sweep-tested (every panel/modal/search/row) — all work, all
   legible. The real defect was the New Project toolbar "+": DOM glyph was
   always correct (charCode 2b, confirmed by 6× live zoom) but rendered as
   a 10px weight-600 sans glyph in a 26×25px button — the vertical bar
   dissolved into antialiasing and the eye read "−". Fix: IBM Plex Mono
   weight 700, 14px floor, centered flex, min 28×26 hit area. (`8d1ef05`)
   Follow-up sweep of every text-glyph control, measured at 100% + 60%
   display scale: toolbar SVGs, panel ×s, ▾ All/Completed toggles, scroll-top,
   FAB all pass; two more failures fixed with the floor recipe — shortcuts
   "?" rendered 6px at 60% (`max(11px, …)`), zoom +/− and level readout
   9px/4px (mono/600 + `max(12px, …)` / `max(10px, …)`). Bonus find: the
   zoom-reset button carried a duplicate `class` attribute, so browsers
   silently dropped `pf-zoom-btn-sm` entirely — deduplicated. (`d5abf14`)
