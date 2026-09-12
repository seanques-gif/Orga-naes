# Orga-naes — AI Handoff Document

**Project:** Orga-naes — single-file vanilla JS personal project manager PWA
**Phase:** ALL DONE — redesign shipped (0→4), pre-release audit closed with verdict **GO**, FN-01 test gate built and cleared, 3B-3 done-as-scoped, clean-clone reproducibility verified. **The only remaining release actions are owner actions: `git push -u origin main` (parked until the owner authorizes) and post-push GitHub settings (Secret scanning, Push protection, Dependabot).** Authoritative audit record: `AUDIT-CANONICAL.md` (supersedes all intermediate audit merges). Known post-ship candidates (non-blocking): list-render chunking for very large datasets; `skipWaiting()` auto-reload policy; CSP design; SRI/self-host SDK; RTDB `.validate` rules.
**Last updated:** 2026-09-12 (post-ship session, sixth pass) — REDESIGN SHIPPED, audit GO, FN-01 gate cleared. Post-ship UI sweeps (all via the chained change loop, all live-verified): white-alpha hover family + empty states (`132d703`), sort-bar clip (`e66e4eb`), light-theme sweep + 6-preset contrast battery (`d0c817a`), double-icon hydration bug + regression test TEST 10 (suite 43→58, `5b2d6df`/`c1e2195`), theme active-state indication (`9262352`), emoji-chrome census → SVG everywhere (`56985c1`/`ef8e395`/`434ba80`/`89262f2`), subtask icon legibility (`4d1172f`), global 12px icon floor proven by 5-theme × 3-zoom matrix (`0ad901a`), user-eye polish pass with real-input verification — sort-bar label wrap fixed at 220px pane floor, flows re-proven with genuine clicks (`0498b24`), contrast-audit session — planned-status color was ΔE 1.8 from dim text (fixed: `#4a5d8a`/`#5878a8`, `7e896c2`), Daylight accent failed WCAG as 12px text at 4.09:1 (fixed: `#0a7499`, `fd636f2`), dark presets scanned clean, and the whole contract is now a permanent test — `tests/contrast.test.mjs`, 34 checks × 5 presets in `npm test` (text 4.5:1, UI 3.0:1, White-Pair, status ΔE ≥ 12, CSS↔JS sync; proven to fail on both shipped bugs, `33f8478`), glyph legibility pass — the New Project "+" read as "−" (10px sans vertical bar dissolved; now mono/700 14px floor, `8d1ef05`), full glyph sweep fixed the 6px-at-60% "?" hint and phone zoom controls plus a duplicate-`class` template bug that silently dropped `pf-zoom-btn-sm` (`d5abf14`). Tooling: `.gitattributes` LF policy (`8dd4648`), sha256 artifact pin + zero-write `npm run verify` determinism gate (`95bcfc1`), clean-clone byte-identical re-proven through the gate, change loop documented in AGENTS.md + change-loop skill (`c901c83`). Full details: `REDESIGN-FINDINGS.md` §F-UI-5. **Sixth pass — Notes + durability + recycle bin (§F-UI-6):** standalone Notes view with multi-select, checkbox/indent editing and checklist View mode (`6c14509`→`9c08b27`); a cascade bug where the Notes commit wiped 131 lines of `14-utilities.css` (icon sizing) was caught by owner screenshot and repaired (`60e0492`); notes now ride auto-snapshots with boot recovery (newest-with-notes walk) and deletion tombstones so deliberate deletes survive disaster recovery (`bea67ca`/`44d8ba9`/`0218a44`); the project-only Trash became a **unified Recycle Bin** — projects, subtasks (previously hard-deleted), and notes, kind chips, 30-day boot purge, restore-in-place for subtasks, tombstone cleared on note restore (`f31d73f`); regression TEST 12 covers the full bin lifecycle, tamper-proven (`3257da1`). Functional suite 58 → **99 assertions**. **Seventh pass — Undo toasts (§F-UI-7):** single note and subtask deletes now carry an Undo button on the toast (5s window) that calls `restoreFromTrash` directly, inheriting the full durability contract (position reattach, tombstone cleared) so deletes reverse without opening the bin (`f406421`); bulk deletes get one batch toast with bulk undo, toasts live inside the deletion chokepoints, and `fmtNoteDate` now guards missing timestamps on imported notes. All committed locally; **nothing pushed**.

---

## Quick start

1. Read this entire file first.
2. Read `AGENTS.md` for build rules.
3. Read `REDESIGN-PLAN.md` for full context.
4. Read `DESIGN.md` for the Mission Control design spec.
5. Run `npm run verify` to confirm current state is green (build + all three test suites).
6. For the audit/release record, read `AUDIT-CANONICAL.md` — it is the single source of truth; the other audit-*.md files in the repo root are superseded history (gitignored).

## Pre-release audit (2026-09-12) — CLOSED, verdict GO

Three independent passes (agent live-probes + GLM static review + cross-verification) reconciled into **`AUDIT-CANONICAL.md`** — read that file for the final findings register, owner-decisions record, and reproducible verification commands. Headlines: secret sweep clean (Firebase web config is public client config; RTDB rules `"$uid === auth.uid"` owner-published and verified against all 17 client paths, anonymous read → 401; `project-flow.json` never in history). FN-01 (no functional tests) was ruled a release gate by the owner and CLEARED; REDO-01 (redo crash) found by the new suite and fixed; UX-01 (narrow-desktop list squeeze) and UX-03 (aria-live) fixed; commit-email exposure accepted by owner (PRV-01, rides with the push). Deferred LOWs: CSP design (SEC-04), SRI/self-host (SEC-05/08), import schema + `.validate` (SEC-03/06). `LICENSE` (MIT), `README.md`, `SECURITY.md` shipped in `4e64f10`.

---

## Project rules (non-negotiable)

- **Source of truth is `src/`.** Edit files under `src/` only.
- **Never hand-edit `Orga-naes.html`.** It is generated by `node build.mjs`.
- After ANY change to `src/`, run: `npm run build`
- Then verify: `npm test` (both must stay green).
- The shipped artifact must remain **one file** (`Orga-naes.html`), **vanilla JS**,
  with **no framework and no runtime build step**.
- JS modules are **ordered fragments inside one IIFE** (NOT ES modules).
  They share one scope and order matters. See `src/order.json`.
- Builds are **byte-deterministic**: a no-op change must reproduce `Orga-naes.html` exactly.

---

## Architecture

```
src/
  template.html           HTML shell with 3 injection tokens
  order.json              concatenation order for CSS + JS fragments
  styles/                 15 CSS modules (01-chrome through 90-print)
  js/                     46 JS modules (00-svg-icons through 46-notes; 45-firebase stays last)
build.mjs                 zero-dep Node build (concat + inject → Orga-naes.html)
Orga-naes.html            generated build output (never edit directly)
tests/
  design-tokens.test.mjs   design-rule guard (reads built file)
  date-utils.test.mjs      date logic
  functional.test.mjs      99-assertion functional gate, 12 tests (vm harness boots
                           the real built artifact: CRUD, undo/redo, export,
                           malformed import, persistence lifecycle, Firebase
                           push/pull vs fake RTDB, SW statics, icon hydration,
                           notes tombstone recovery, recycle-bin lifecycle)
```

**Workflow:** edit `src/` → `npm run build` → `npm test` → open `Orga-naes.html`

---

## Design world: Mission Control

- Near-black cool panels, one cyan signal (#2fd4ff), monospace for measurement.
- 5 presets: Midnight Cyan, Amber CRT, Phosphor Green, Monochrome, Daylight.
- Fonts: IBM Plex Sans (meaning) + IBM Plex Mono (measurement).
- Anti-reference: Night Workshop (preserved in `DESIGN-v1-night-workshop.md`).

---

## Token scope rule (UPDATED 2026-09-11)

Motion tokens (`--ease-console`, `--ease-out-strong`, `--dur-*`) now live on `:root` alongside the shape/spacing/z scales (in `src/styles/02-tokens.css`). They are theme-independent — presets never override them — so they resolve EVERYWHERE, including fixed chrome outside `#pf-root` (`.pf-bottom-nav`, `.pf-fab`, `.pf-fab-menu-item`, `.pf-update-pill`, `.pf-connection-dot`, `.pf-error-dot`, `.pf-fab-overlay`) and body-appended elements (drag ghosts, save modal, confetti canvas).

**Rule:** `var(--ease-*)` / `var(--dur-*)` are safe on any selector. The remaining `#pf-root`-scoped layers are palette and type: presets retheme by overriding tokens on `#pf-root`, so those must not be read from `:root`. The old warning ("out-of-root elements must stay literal") is retired — the FAB family was the last consumer and is now tokenized (`01-chrome.css`, zero cubic-bezier literals outside the two token definitions).

---

## What's been done (through this session)

### Phase 0–2.5 (all complete)
- Baseline frozen, diagnostics, design spec, source modularization.
- `npm run verify` passes (build + tests green).

### Phase 3A — Token + type layer ✅
- Mission Control palette in `02-tokens.css`.
- Daylight preset class `#pf-root.pf-theme-light`.
- 5 theme presets in `src/js/36-theme-presets.js`.
- Legacy class-based theme toggle retired from `04-indexeddb-mirror-auto-backup.js`.
- Google Fonts link for IBM Plex Sans + Mono in `src/template.html`.

### Phase 3B-1 — Measurement Rule ✅
- `src/styles/12-metrics.css` — Plex Mono + `tabular-nums` on all numeric readouts.
- `.pf-metric` utility class.

### Phase 3B-2 — Unify panel recipes ✅
- `src/styles/13-overlays.css` — unified overlay panel recipe (shared bg/border/radius-overlay/shadow).
- Stripped duplicates from 8 panels.
- `.pf-conflict-box` moved from `90-print.css`.

### Phase 3B-3 — Inline style peel ✅ DONE-AS-SCOPED (2026-09-12, `c2ebb07` + `350aaab`)
- **Template: 129 → 32.** ~97 static style attributes peeled into semantic, token-driven classes in `14-utilities.css` (utilities, panel chrome, button variants, calendar/today/weekly/firebase internals; panel geometries → id rules). The 32 remaining are JS-toggled `display:none` boot-hiding that `openModal`/`closeAllModals` and badge/banner reveals depend on — structurally required to stay inline.
- **JS-side triaged, not blindly peeled:** ~230 assignments are legitimate dynamic work (drag geometry, resize, display/opacity fades, transitions) and stay. ~75 duplicated recipe strings (status menu, due-rows ×3, status dots, ext chips, category controls) extracted to `14-utilities.css`; the CSS `:hover` rule also replaced the status menu's JS mouseenter/mouseleave dance. ~15 unique one-offs (drag ghost, overlays) documented as legitimate inline.
- **Daylight bug fixed en route:** promote-to-project SVG used `stroke="#ffffff"` on a transparent chip — invisible in light themes; now `currentColor` + `.pf-ext-chip { color: var(--text) }`.
- Sanctioned exceptions (documented in REDESIGN-PLAN.md): `#fff` on user-picked category colors (13-auto-arrange), black-alpha elevation shadows in overlays.

### Phase 3D — States & a11y ✅
- `src/styles/15-a11y.css` — reduced-motion, hover-gate, focus-visible, reduced-transparency.
- **0 AA failures across all 6 themes** (verified via automated contrast audit).
- Daylight preset fixed: status/danger colors darkened for AA.

### Phase 3E — Motion ✅ COMPLETE 2026-09-11 (review-animations verdict: APPROVE with findings)

#### Motion tokens (defined in `02-tokens.css:38-43`)
```css
--ease-console: cubic-bezier(0.16, 1, 0.3, 1);
--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
--dur-press: 100ms;
--dur-state: 150ms;
--dur-surface: 200ms;
```

#### Completed fixes
| Fix | File:line | What |
|-----|-----------|------|
| F5: transition:all | `08-components-categories.css:142` | → specific properties |
| F5: ease-in removed | `08-components-categories.css` | Dead `.pf-item-removing` rule deleted |
| F17: per-render animations removed | `08-components-categories.css:11-13` | `.pf-split-list-item` + `.pf-subrow` entrance animations deleted (flickered on every data change) |
| F17: view entrance interruptible | `08-components-categories.css:18-25` | Keyframe → `@starting-style` + transition |
| 5 dead keyframes/rules deleted | `08` + `09` | `pf-slide-in`, `pf-slide-out`, `pf-view-fade`, `pf-subrow-in`, `.pf-item-removing` |
| Context menu origin + easing | `08-components-categories.css:100-101` | `transform-origin: top left` + `var(--ease-out-strong)` |
| Category collapse | `08-components-categories.css:117` | `ease` → `var(--ease-console)` |
| Drop indicator | `09-components-selection-panels.css:245` | `ease` → `var(--ease-out-strong)` |
| Drop settle | `09-components-selection-panels.css:249` | `ease-out` → `var(--ease-console)` |
| Sublist expand | `09-components-selection-panels.css:107` | `ease-out` → `var(--ease-console)` |
| Ring pulse/complete | `08-components-categories.css:28-29` | `ease` → `var(--ease-out-strong)` |
| Split-collapse-btn | `08-components-categories.css:142` | `transition: all` → specific |
| Phone list-slide | `07-responsive-phone.css:61` | → `var(--dur-surface) var(--ease-console)` |
| Detail slide | `08-components-categories.css:152` | → `var(--dur-surface) var(--ease-console)` |
| Detail transition | `08-components-categories.css:149` | → `var(--dur-surface) var(--ease-console)` |
| Subrow transition | `09-components-selection-panels.css:129` | → tokenized |
| Status flash ×3 | `09-components-selection-panels.css:132-134` | → `var(--ease-out-strong)` |

#### Remaining easing swaps — DONE (2026-09-11)
All 9 from the list below were tokenized, plus 4 stragglers found by final sweep:
`.pf-split-list-status` (ease→console), `.pf-progress-ring` stroke-dashoffset
(material curve→out-strong), `pf-tooltip-in` (literal→out-strong), `pf-save-shake`
(ease→out-strong). Post-sweep state: the only `cubic-bezier` literals left in `src/`
are the two token definitions (`02-tokens.css:39-40`) and 4 rules on the FAB family
(`01-chrome.css:21,76,94,97` — `.pf-fab`, `.pf-bottom-nav`, `.pf-update-pill`,
all OUTSIDE `#pf-root` — RESOLVED 2026-09-11: motion tokens moved to `:root` (theme-independent), the 4 rules now use `var(--ease-console)`, and zero cubic-bezier literals remain outside the token definitions).
Zero bare `ease`/`ease-in` remain in `src/`.

<details><summary>Original swap list (all applied)</summary>

| # | File:line | Current | Target |
|---|-----------|---------|--------|
| 1 | `01-chrome.css:134` | `cubic-bezier(0.16, 1, 0.3, 1)` literal | `var(--ease-out-strong)` — entrance, not console curve |
| 2 | `08-components-categories.css:120` | `transition: opacity 0.25s ease, transform 0.25s ease` | `var(--ease-out-strong)` — scroll-top button |
| 3 | `08-components-categories.css:165` | `max-width 0.2s ease` on `.pf-node` | `var(--ease-console)` |
| 4 | `09-components-selection-panels.css:95` | `background 0.3s ease, color 0.3s ease` on `.pf-badge` | `var(--ease-console)` |
| 5 | `09-components-selection-panels.css:145` | `background 0.3s ease, border-color 0.3s ease, color 0.3s ease` on `.pf-sub-comment` | `var(--ease-console)` |
| 6 | `09-components-selection-panels.css:148` | `background 0.3s ease, border-color 0.3s ease` on `.pf-sub-dot` | `var(--ease-console)` |
| 7 | `04-responsive-mobile-icons.css:27` | `transition: transform 0.25s ease` | `var(--ease-console)` |
| 8 | `04-responsive-mobile-icons.css:41` | `transition: min-width 0.25s ease, padding 0.25s ease, border-color 0.25s ease, border 0.25s ease` | `var(--ease-console)` |
| 9 | `11-multi-select-bulk-actions.js:21` | literal `cubic-bezier(0.23, 1, 0.32, 1)` in inline cssText | `var(--ease-out-strong)` — JS inline, var() resolves from #pf-root ancestor |

</details>

#### After swaps: verification
```bash
npm run build        # regenerate Orga-naes.html
npm test             # all three suites (design-tokens + date-utils + functional gate)
```

#### After verification: write review-animations verdict — DONE
Verdict written 2026-09-11 at the bottom of `REDESIGN-FINDINGS.md`: **APPROVE**
(with findings; Tier 1 empty). Carry-over into 3B-3: (a) FAB-family literal beziers
(cannot be tokenized while outside `#pf-root`). Item (b) — select-bar hardcoded
rgba background — FIXED 2026-09-11: recipe peeled into `.pf-sub-select-bar` class,
background now `color-mix(in srgb, var(--card) 97%, transparent)`; verified live
(white pill on Daylight, dark ink on Midnight Cyan). Motion smoke test passed on
all surfaces (search float, cat collapse, detail slide, ctx menu, 5 themes).

Original skill format reference (verdict already written):
<details><summary>review-animations verdict format</summary>

The `review-animations` skill requires a findings table and Block/Approve verdict.
Format:
```
## review-animations verdict

| Finding | Before | After | Why |
|---------|--------|-------|-----|
| F1 ...  | ...    | ...   | ... |

### Tier 1 — Block
- ...

### Tier 2 — Approve with findings
- ...

### Tier 3 — Approved
- ...

**Verdict: APPROVE** (with findings) or **BLOCK** (list what must be fixed)
```

Key findings for the verdict:
- Short state transitions (100–150ms color/bg) intentionally left on default easing — curve is imperceptible at that duration
- `.pf-node` hover uses `transform: translateY(-1px)` — GPU-only, acceptable
- `pf-status-flash` includes `box-shadow` animation — paint-only, brief, acceptable
- `pf-offline-blink` is infinite — justified as a status indicator
- `pf-save-shake` is 0.4s — error feedback, rare, acceptable
- `pf-drop-indicator-pulse` is infinite during drag — transient, justified
- `11-multi-select-bulk-actions.js:21` has `background:rgba(24,21,38,0.97)` hardcoded in JS inline — wrong on Daylight theme. Flag but fix in 3B-3.
- Several entrances use literal cubic-bezier values instead of var() references — they work but defeat token changes. Low priority.

</details>

---

## Remaining phases after 3E

| Phase | Scope | Notes |
|-------|-------|-------|
| **3B-3 rest** | Peel remaining inline styles → classes | ✅ DONE-AS-SCOPED 2026-09-12 — see Phase 3B-3 section above. Select-bar violation was already fixed (2026-09-11). |
| **3B-4** | Replace emoji-as-icons with SVG | ✅ DONE 2026-09-11: D10 resolved — SVG chrome, emoji stays user content. Sprite + `pfIcon()` in `src/js/00-svg-icons.js` (first JS fragment); static markup hydrates via `[data-ic]` / `[data-ic-before]`; `.pf-ic` sizes to `1em`, ink = `currentColor`. Converted: toolbar, options panel, FAB menu, bottom nav, both ctx menus, sort bar, recur chip, dep/comment chips. Known remaining: transient toast prefixes kept by design; FAB trigger `+` and scroll-top `↑` ASCII glyphs kept; mobile-swipe ext-comment uses the same converted path. NOTE: `42-modal-helpers` now publishes `window._pf` via `Object.assign` so the icon export survives. |
| **3C** | Spacing/radius/z-index scales, retire resting shadows | ✅ DONE 2026-09-11: `--space-*` + `--z-*` tokens (on `:root`, shared with body-level elements), z-ladder 0 literals, radii → 4/6/10/pill (+50% circles, 2px mark exception), F12 resting shadows retired (hover lift kept). |
| **3F** | Polish: impeccable detector, design.json sidecar | ✅ DONE 2026-09-11: 56 detector findings audited — 3 real fixes (update-pill undefined `--panel` → `--toast-bg`; body-appended save modal + drag ghosts re-parented into `#pf-root` so palette tokens resolve; sublist 9px → `--radius-overlay`), online dot → `var(--completed)`. `.impeccable/design.json` regenerated for Mission Control (rules include Token-Scope + SVG-Chrome). Remaining detector hits are static-analysis false positives (contrast can't see tokens) or accepted exceptions (confetti palette, HTML report export, print sheet, `#000` selection ring). |
| **4** | Verify & ship | ✅ COMPLETE 2026-09-12: screenshot matrix + reduced-motion (`2ed562f`), INP/perf 42-project stress (`58dc947`), all-flows smoke test + update-pill a11y (`66f9d26`), PWA offline runtime-verified (`d93e9a9`), redesign-shipped commit. Plus post-ship close-out: audit GO, FN-01 gate cleared, REDO-01/UX-01/UX-03 fixed, clean-clone PASS, 3B-3 done-as-scoped. |

---

## Key files reference

| File | Role |
|------|------|
| `src/styles/02-tokens.css` | All design tokens (palette, motion, type, shape) on `#pf-root` |
| `src/styles/08-components-categories.css` | List items, categories, ctx menu, progress ring, detail panel, canvas |
| `src/styles/09-components-selection-panels.css` | Nodes, subrows, badges, selection, drag-drop, status flash |
| `src/styles/15-a11y.css` | Reduced-motion, hover-gate, focus-visible, reduced-transparency |
| `src/js/36-theme-presets.js` | 5 presets, CONSOLE_INK, White-Pair runtime |
| `src/styles/14-utilities.css` | 3B-3 peeled classes (template slice 1 + JS recipe slice 2) + sr-only utility consumer classes |
| `tests/functional.test.mjs` | FN-01 functional gate — boots the real built artifact in a vm sandbox |
| `AUDIT-CANONICAL.md` | Authoritative pre-release audit record (GO; supersedes audit-merged/hybrid/findings) |
| `tests/design-tokens.test.mjs` | Enforces One-Root, Tint-Through-Token, White-Pair, GUARDED_HEX |

---

## Rollback

- Released baseline: `git checkout released-baseline-2026-09-10 -- .`
- Released snapshot: `Orga-naes-backup-2026-09-10_195638`
- WIP snapshot: `Orga-naes-wip-backup-2026-09-10_195822.zip`
- Byte-parity check: `npm run verify` (now enforces it — `Orga-naes.html.sha256` pins
  the artifact; verify fails on any drift between pin, committed artifact, and src/).
  Recovery if verify fails on a legit change: `npm run build` (refreshes the pin), commit both.
  Recovery if verify fails and you trust only the committed state: `git checkout -- .`
