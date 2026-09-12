# Orga-naes — Full Redesign & Modernization Plan

Status legend: ✅ done · ⏳ in progress · ⬜ pending · 🔀 decision needed

Last updated: 2026-09-10
Baseline (released): commit `a3dff27` (`origin/main`), tag `released-baseline-2026-09-10`
Working state: uncommitted (src/, build tooling, docs, 3A + 3B-1/2/3 + 3D)

---

## 1. Goal

Give the app a **full visual redesign** (new visual world) while keeping every
feature, the nested-subtask engine, the data model, and the single-file/offline
product identity intact — and simultaneously fix the **tooling/maintainability**
pain so that AI-assisted ("vibe") coding with opencode is fast and reliable.

Two problems, solved together but kept as separate verifiable phases:

1. **Visual:** replace the incumbent "Night Workshop" look with a new world.
2. **Tooling:** split the 8,700-line single file into small source modules that
   build back into the *same single-file artifact*. No framework, no runtime build.

**Chosen world:** **Mission Control** — an operations console: near-black cool
panels, one cyan signal, monospace for measurement, mechanical motion.

---

## 2. Ground rules (do not violate)

From `PRODUCT.md` (hard constraints):

- **Single-file architecture** — shipped artifact is `Orga-naes.html`; no framework;
  vanilla JS; the end user needs no build step.
- **Offline-first PWA** — core features work with no network.
- **No required accounts** — cloud sync stays opt-in.
- **Mobile + desktop parity** — one codebase; regressions either way are defects.

**Must-not-change ledger** (regression contract):

- Data: `project-flow-graph-v2` schema; all localStorage/IndexedDB keys; JSON/CSV/PDF
  export + import; Firebase sync + conflict modal; PWA + `sw.js`.
- Nested subtasks: recursive `s.subtasks` render/drag/collapse/multi-select/promote/copy.
- Invariants: One-Root (`--font-size-base`), Tint-Through-Token (`color-mix`),
  White-Pair (`--accent-contrast`), Flat-At-Rest, PDF export literal px,
  Auto-theme behavior.
- About credit "Created by Sean Ques"; gamified-not-guilt personality.

---

## 3. Decisions log

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Framework migration? | **No** | Violates product identity; goal was tooling, not React |
| D2 | Source structure | **`src/` modules → build to one file** | Fixes tooling while preserving the artifact |
| D3 | Build tooling | **Zero-dependency Node (`build.mjs`)** | No npm/supply chain; matches vanilla ethos |
| D4 | JS module style | **Ordered fragments inside one IIFE** | Behavior-preserving (shared scope), unlike ESM |
| D5 | TypeScript? | **No (for now)** | Adds friction for vibe coding; can add to data layer later |
| D6 | Visual world | **Mission Control** | Full redesign, new world (user choice) |
| D7 | Theme presets | **5** (Midnight Cyan, Amber CRT, Phosphor Green, Monochrome, Daylight) | Coherent with new world; halves color surface |
| D8 | Fonts | **IBM Plex Sans + IBM Plex Mono** via Google Fonts `<link>` | Identity + single-file/no-build; system fallbacks |
| D9 | Accent | **Cyan `#2fd4ff`**, ink `#04141b` | Single saturated signal; AA-correct |
| D10 | Icon language | ✅ **SVG chrome, emoji for user content** (see §7) | Resolved in 3B-4 |

---

## 4. Architecture (Phase 2.5 result)

```
src/
  template.html     shell with 3 injection tokens (__ORGA_CSS_MAIN__ / __ORGA_CSS_PRINT__ / __ORGA_SCRIPT__)
  order.json        exact concatenation order for css + js fragments
  styles/           12 CSS modules (01-chrome … 11-calendar-weekly, 12-metrics, 90-print)
  js/               45 JS modules (01-core-state … 45-firebase-cloud-sync)
build.mjs           zero-dep Node build → Orga-naes.html
package.json        npm run build | test | verify
AGENTS.md           source-of-truth + build rules (agents read this automatically)
Orga-naes.html      generated, committed build output (never hand-edited)
tests/
  design-tokens.test.mjs   design-rule guard (reads the built file)
  date-utils.test.mjs      date logic
```

**How the build works:** `build.mjs` concatenates the CSS/JS fragments in
`src/order.json` order and injects them into `src/template.html`. The JS fragments
are all inside one `(function(){…})()` IIFE, so shared scope is preserved and order
matters. Builds are **byte-deterministic**: a no-op change reproduces the file exactly.

**Day-to-day workflow:** edit `src/` → `npm run build` → `npm test` → open
`Orga-naes.html` (or `npm run verify`).

---

## 5. Phase plan & status

### Phase 0 — Freeze & baseline ✅
- Backups: git tag `released-baseline-2026-09-10`; zip `Orga-naes-backup-2026-09-10_195638`;
  WIP zip `Orga-naes-wip-backup-2026-09-10_195822.zip` (uncommitted work).
- Surface inventory captured (≈60 surfaces; all panel/modal ids; CSS families).
- Before screenshots: `screenshots/before/`.
- `DESIGN-v1-night-workshop.md` kept as anti-reference.

### Phase 1 — Diagnose ✅
`REDESIGN-FINDINGS.md` — 18 findings with `file:line`. Headlines:
- **F1** no `prefers-reduced-motion`; **F2** no hover gating; **F3** danger text 3.52:1 (AA fail);
  **F4** light accent text 4.15:1; **F5** `ease-in` + `transition: all`.
- **F7** 281 inline `style=""` + 311 `.style` assignments (the real blocker).
- **F8/F9/F10** radius / z-index / spacing sprawl.
- **F11/F12** duplicated panel recipes; resting shadows.
- **F14** `--text` vs `--text-dim` only 1.13× apart; **F15** no tabular-nums.
- **F17** keyframe entrances (not interruptible).

### Phase 2 — Design spec ✅
`DESIGN.md` v2 (Mission Control): token map, type ladder, spacing/radius/z scales,
component recipes, motion vocabulary, reduced-motion + hover-gate rules, 5 presets,
migration notes. (Anti-reference preserved in `DESIGN-v1-night-workshop.md`.)

### Phase 2.5 — Source modularization ✅
- Extracted `Orga-naes.html` → `src/` (12 CSS + 45 JS + template + order.json).
- `build.mjs` reconstructs the file.
- **Parity gate: byte-identical** (SHA256 `8AD9C92A…`), tests green.
- Removed the one-time extractor so it can't clobber `src/`.

### Phase 3 — Mission Control redesign ⏳
| Sub | Scope | Status |
|---|---|---|
| **3A** | Token + type layer (palette, Daylight, Plex, 5 presets, retire legacy theme toggle) | ✅ |
| **3B-1** | Measurement Rule: Plex Mono + `tabular-nums` on all numeric readouts | ✅ |
| **3B-2** | Unify Panel / Pill / Card recipes (F11/F13) | ✅ |
| **3B-3** | Peel inline styles → classes (F7) | ⏳ **done-as-scoped 2026-09-12.** Template 129 → 32 (remainder = JS-toggled `display:none` boot-hiding that must stay inline). JS-side triaged: ~230 legitimate dynamic (drag/resize/display/opacity) keep; ~75 duplicated recipes extracted to `14-utilities.css` (status menu, due-rows, status dots, ext chips, category controls) incl. **Daylight fix: promote-icon `stroke="#ffffff"` → `currentColor`**; ~15 unique one-offs (drag ghost, overlays) documented as legitimate inline. Sanctioned exceptions: `#fff` on user-picked category colors (13-auto-arrange), black-alpha elevation shadows in overlays. |
| **3B-4** | Replace emoji-as-icons (F/decision) | ✅ D10 resolved: SVG chrome, emoji stays user-content |
| **3C** | Layout & scales: spacing scale, radius scale, z-index scale, retire resting shadows (F8/F9/F10/F12) | ✅ tokens on `:root`, z-ladder fully named (0 literals), radii converged (mark exception), F12 shadows retired; verified live |
| **3D** | States & a11y: reduced-motion, hover-gate, focus-visible, AA across presets (F1/F2/F3/F4) | ✅ (0 AA failures across 6 themes) |
| **3E** | Motion: one easing curve + springs; fix `ease-in`/keyframe entrances; `review-animations` verdict (F5/F17) | ✅ verdict written — APPROVE with findings (`REDESIGN-FINDINGS.md`) |
| **3F** | Polish: impeccable detector; refresh `.impeccable/design.json` sidecar | ✅ DONE 2026-09-11: detector 56 findings → 3 real defects fixed (update-pill `--panel` undefined token, body-appended save modal + drag ghosts losing `#pf-root` theming, off-scale 9px sublist radius), online dot tokenized; rest verified as false positives or accepted exceptions. Sidecar regenerated for Mission Control. |

### Phase 4 — Verify & ship ✅ COMPLETE 2026-09-12
- `npm test` green; detector clean.
- Before/after screenshots (desktop/tablet/phone × themes × reduced-motion). ✅
- INP/perf check ✅ (42-project stress: idle 60fps locked, list render 12.7ms, one documented ~55ms long task on full-app render); PWA offline check ✅ (runtime-verified on real localhost server: install, offline boot from cache, update flow + cache purge); manual smoke of every inventory surface ✅ (all flows on real UI paths, 2 themes; +1 a11y fix).
- Update `DESIGN.md` if drift; final commit ✅ this commit.

### Formal skill passes (pending, slot around 3B/3E) 🔀
Loaded so far: `impeccable` SKILL + `context` + `operate.md` + `craft-floor.md`,
`review-animations` SKILL + `STANDARDS.md`, `apple-design`, `redesign-skill`, partial `taste`.
Still to run properly:
- impeccable `critique` + `audit` (real workflow) and `document` (sidecar).
- `review-animations` **Block/Approve verdict** on the animation set.
  → Done 2026-09-11: **APPROVE with findings** (Tier 1 empty; FAB-family literals +
  select-bar rgba deferred to 3B-3). Verdict table lives at the bottom of `REDESIGN-FINDINGS.md`.
- Full read of `taste-skill` (88 KB, was truncated) + apply Operate-relevant rules.

---

## 6. Design quick-reference (as built)

**Tokens (dark base):** `--bg #0a0d11` · `--card #12161c` · `--card-border #232a34` ·
`--sub-bg #0e1218` · `--text #d7dde5` · `--text-dim #8b95a3` · `--accent #2fd4ff` ·
`--accent-contrast #04141b` · statuses planned `#7c8794` / ongoing `#ffb454` /
completed `#3ddc97` / waiting `#b39dff` / danger `#ff5c5c`.

**Type:** `--font-sans` IBM Plex Sans (meaning) · `--font-mono` IBM Plex Mono
(measurement). Root `--font-size-base: clamp(11px,1.8vw,14px)`.

**Target scales (to apply in 3C):** spacing 2/4/6/8/12/16/24 · radius
4/6/10/pill · z-index named ladder (sticky 10 → drag 9999).

---

## 7. Open decisions & next actions

1. ✅ **Icons (D10) — DONE in 3B-4:** SVG chrome via `src/js/00-svg-icons.js` sprite + `pfIcon()` helper (`data-ic` / `data-ic-before` hydration for static markup), emoji kept as user content (task titles, categories, picker, toast prefixes). Chrome emoji eliminated: toolbar, options panel, FAB menu, bottom nav, both context menus, sort bar, recur chip, dependency + comment chips.
   content (recommended) / replace all / defer.
2. 🔀 **Commit checkpoint:** Phase 2.5 + 3A + 3B-1 are green and uncommitted. A
   commit is the recommended safety net before 3B-2/3.
3. ⏭ **Next work:** 3B-2 (unify panel/pill/card recipes), then 3B-3 (inline styles).

---

## 8. Rollback / recovery

- Released baseline: `git checkout released-baseline-2026-09-10 -- .`
- Released snapshot: `C:\Development\Ongoing\Orga-naes-backup-2026-09-10_195638`
- Uncommitted-work snapshot: `C:\Development\Ongoing\Orga-naes-wip-backup-2026-09-10_195822.zip`
- Byte-parity check for the build: `npm run verify` (build + tests).

---

## 9. Non-goals

- No framework migration (D1) and no TS (D5) unless the product decision is revisited.
- No change to features, data model, storage keys, export/import formats, Firebase
  sync, nested-subtask engine, or PWA behavior.
- The standalone PDF export keeps literal px / token-free colors by design (it is a
  separate document with no `#pf-root`).
