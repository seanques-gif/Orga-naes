# Orga-naes — AI Handoff Document

**Project:** Orga-naes — single-file vanilla JS personal project manager PWA
**Phase:** ALL DONE — redesign shipped (0→4), audit GO, NEXT-PLAN COMPLETE (A notes↔project linking, B render chunking, C security: strict rules LIVE in production + CSP + SRI). Released 2026-09-13. Remaining owner-side only: GitHub security toggles (Secret scanning/Push protection/Dependabot), optional localhost sign-in key referrer fix, optional junk-node console cleanup.
**Last updated:** 2026-09-13 (eleventh pass: security close + PWA update flow + font system) — see eleventh-pass entry below.

**Eleventh pass (2026-09-13 afternoon/evening):** Phase C finished and verified against production: strict .validate rules published to the live RTDB (owner ran the full walkthrough: scratch rehearsal, export backup, publish, incognito stranger-test showed Permission denied, user1↔user2 isolation confirmed); C2 CSP (hash-pinned inline script, locked origins, 25-check gate) and C3 SRI (all three Firebase bundles pinned, `scripts/gen-sri.mjs` for version bumps) shipped (239d73b, b61cd85). Export-replay gate added to the rules suite (production JSON replays against the validator, 141 checks). PWA update flow fixed (bdd6405): `skipWaiting()` removed — updates now wait and the pill asks first; pill hidden-state uses the `hidden` attribute + `[hidden]{display:none!important}` so it can never render as stray text (the original bug report). Git history rewritten three times to scrub AI attribution, personal email, and Claude co-author trailers (files byte-identical, proven by tree-diffs + determinism pin); Golden Rule #7 in AGENTS.md bans attribution footers permanently. Font system arc (61b8faf, 2a0371b, 72e4152, 2b8069e, bdfe608): Appearance Font picker (per-device persistence), custom Google Fonts on demand (css2-API existence oracle, weight ladder, cache-safe sheet polling — three browser gotchas documented in REDESIGN-FINDINGS.md), the three UI fonts embedded as base64 latin woff2 (zero-network typography, artifact 683 KB → 1.23 MB), bundle trimmed to actually-used weights (Mono 500 dropped, phantom 300/800 literals fixed), Inter made the shipped default with IBM Plex as "Console classic". Full battery at close: 291 checks green (25 CSP + 125 functional + 141 rules), determinism pin intact, backups + tags per change, all pushed.

**Tenth pass (Phase C1 owner tooling):** owner found the markdown runbook too technical, so the walkthrough became an interactive local guide — `WALKTHROUGH-GUIDE.html` (11 checkbox steps with progress bar, click-to-copy chips, per-step green/red outcomes, localStorage memory, troubleshooting section) plus `npm run serve` (`scripts/serve.mjs`, committed `f692ebd`) because Google sign-in refuses file:// pages. The guide has a magic button that builds `Orga-naes-scratch-test.html` (config-swap of the real app via one regex — never touches the real file); the built copy is gitignored (scratch config keys). Guide tested live: patcher simulated against the real app (single exact match, parses as JS, rest byte-identical), messy-paste cleaning covers all 7 config fields, two paste-parser bugs found and fixed during testing. Old SHADOW-TEST-RUNBOOK.md kept as printable reference with a pointer to the guide. Discovered mid-session: the owner had ALREADY created the scratch project and manually built a practice copy (kept; measurementId line harmless — analytics only).

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


## Eleventh pass — Phase C1 shipped & production-verified (2026-09-13)

- Notes cloud sync shipped (owner decision); sync module + rules + shadow tests + functional round-trip (125 assertions).
- Strict RTDB `.validate` rules: generated, 75-check shadow suite in npm test, scratch-project rehearsal all green.
- Production export replay gate: replayed the real 956KB export against the rules pre-publish — caught 5 unmodeled fields (project color/description/dueAt, subtask timeLogged/timerStart); generator extended (`f6e5bb5`); export replay now permanent in the suite.
- Owner published production rules and confirmed incognito `users.json` -> Permission denied on the REAL database. C1 CLOSED (SEC-06 + public-read exposure closed).
- Owner tooling: `npm run serve` zero-dep static server, WALKTHROUGH-GUIDE.html (local), practice-copy patcher; all local-only files gitignored.
- Remaining Phase C: C2 CSP, C3 SRI, C4 ledger sweep. One-time Google Cloud key restriction blocked localhost sign-in on the real project (auth/requests-from-referer-...-are-blocked) — fix: allow `http://localhost:8080/*` or set None in Cloud Console -> APIs & Services -> Credentials (owner action, ~5 min propagation).


## Twelfth pass — C2 + C3 shipped, Phase C complete (2026-09-13)

- C2 CSP: build.mjs generates the policy and pins the inline script by sha256 (no unsafe-inline for scripts); origins locked to audited set; tests/csp.test.mjs wired into npm test; live-verified zero violations.
- C3 SRI: sha384 integrity + crossorigin on all three gstatic bundles; scripts/gen-sri.mjs helper documents the version-bump procedure; template + artifact both gated.
- Isolation matrix: 66-check user1<->user2 cross-account proof added to the rules suite (owner-requested), 141 total.
- npm test total: tokens + contrast + dates + CSP(25) + functional(125) + rules(141).
- Phase C COMPLETE: C1 rules production-verified (owner stranger test), C2 CSP, C3 SRI. Remaining owner items only: GitHub secret-scanning/push-protection toggles, optional stray-node cleanup in console, sign-in key localhost allowlist in Google Cloud Credentials (or set None).
