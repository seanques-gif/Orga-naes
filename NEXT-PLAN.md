# Orga-naes — Next Plan: Linking, Scale, Hardening

Status legend: ✅ done · ⏳ in progress · ⬜ pending · 🔀 decision needed

Last updated: 2026-09-13 — **DRAFTED** (post-release; nothing started).
Baseline (released): `origin/main` @ `93dfcc9` — the full redesign + audit + Notes + recycle bin are public; fresh-clone verify byte-identical.
Successor to: `REDESIGN-PLAN.md` (complete and released).

---

## 1. Goal

Three independent workstreams picked up from the redesign plan's recorded leftovers — each valuable alone, ordered smallest-risk first:

1. **List-render chunking (B)** — kill the documented ~55ms long task on full-app `render()` (REDESIGN-FINDINGS.md, perf check: crosses 100ms+ at ~3× the 42-project dataset on mid-range mobile). Smallest scope, zero user-visible change, pure win.
2. **Notes↔Project linking (A)** — the biggest post-ship feature request: notes stop being an island. Type `@` in a note, pick a project, and the link appears on both sides.
3. **Security backlog (C)** — close the audit's deferred LOWs: CSP (SEC-04), SRI on the CDN scripts (SEC-05/08), RTDB `.validate` rules (SEC-03/06). Needs owner-side Firebase console access for one step.

## 2. Ground rules (unchanged)

- Single-file artifact `Orga-naes.html`; no framework; zero-dependency build; offline-first; mobile+desktop parity.
- Must-not-change ledger from REDESIGN-PLAN.md §2 stands (schema, keys, export formats, sync, nested-subtask engine, PWA, invariants, About credit).
- Every change runs the chained change loop (AGENTS.md): one change → build → `npm test` → live-verify in the preview → commit. Suite is now 99 assertions / 12 tests + the 5×34 contrast gate; it must stay green at every commit.
- Phases are independent — any order works, but C changes how the artifact loads scripts and must re-verify **offline boot + cloud sync live** before its commit.

## 3. Decisions log (proposals — owner may override)

| # | Decision | Proposal | Why |
|---|---|---|---|
| N1 | Link syntax | `@project:<id>` in note body, typed via an `@`-mention popup; **derived at render time, never stored separately** | Links are plain text → they ride existing sync, export/import, snapshots, tombstones, and the recycle bin for free. Zero schema migration. |
| N2 | Rename resilience | Resolve links by id first, fall back to stored project name text | Hand-typed or legacy links keep working if ids are lost |
| N3 | Chunking strategy | Time-slice the existing `render()` (16-main-render-loop-canvas-view.js) into rAF-scheduled batches; virtualization explicitly deferred | Extends the render loop that already exists; no new dependency; virtualization only if profiling demands it |
| N4 | CSP delivery | `<meta http-equiv="Content-Security-Policy">` inside the artifact | Travels with the single file (works from file:// and any host); no server config needed |
| N5 | SDK supply chain | **SRI-only** (add `integrity` + `crossorigin` to the 3 `gstatic` compat SDKs); self-hosting deferred as a non-goal | ~300 KB of SDK would bloat the artifact; SRI pins the exact bytes and mitigates CDN compromise at zero size cost |
| N6 | `.validate` strictness | Strict: allow exactly the 8 known `users/$uid` children (projects, archive, categories, categoryEmojis, trash, backups, appVersion, updatedAt), typed + size-bounded; deny unknown keys | Matches the audit's intent; unknown-key denial has a documented exception path (owner edits rules) |

## 4. Phases

### Phase B — List-render chunking ⬜ (first: smallest, independent)
- B1 ⬜ **Measure before:** rebuild the 42-project perf fixture; record long-task profile at 42 / 126 / 250 synthetic projects (before-numbers into REDESIGN-FINDINGS.md).
- B2 ⬜ **Slice `render()`:** split list + detail + category zones into rAF-scheduled chunks inside the existing render loop; input arriving mid-render cancels superfluous chunks.
- B3 ⬜ **Interaction priority:** status-toggle and expand paths paint the touched row in frame 1; full re-render deferred behind it.
- B4 ⬜ **Measure after + regression note:** same fixture must show no long task > 50ms at 3× dataset; INP unchanged or better. (Vm-harness perf assertion explicitly out of scope — document the manual fixture instead.)

### Phase A — Notes↔Project linking ⬜ (second: the feature)
- A1 ⬜ **Parser:** detect `@project:<id>` tokens in note bodies at render time; name-fallback resolution (N2).
- A2 ⬜ **Mention popup:** typing `@` in the note editor opens a filterable project picker; inserts `@project:<id> <name>`.
- A3 ⬜ **Note-side surface:** linked-project chip row on note cards + in the editor header, click → opens that project.
- A4 ⬜ **Project-side surface:** project detail gains a "Notes (n)" section listing linked notes, click → opens Notes view on that note.
- A5 ⬜ **Free-ride verification:** prove links survive sync push/pull, JSON export→import, snapshot recovery, and the recycle bin (they're body text — verify, don't assume).
- A6 ⬜ **Tests:** parser unit cases + a functional test (link appears both sides; rename fallback works; link to deleted project degrades gracefully).
- A7 ⬜ Record in REDESIGN-FINDINGS.md + HANDOFF.md; commit per slice.

### Phase C — Security backlog ⬜ (last: needs owner console access)
- C1 ⬜ **RTDB `.validate` rules (SEC-03/06):** draft the strict rules JSON (N6); **shadow-test on a scratch Firebase project** against the real client's pushes before touching production rules; then publish + incognito re-verify 401 on `users.json`; record as an AUDIT-CANONICAL.md addendum.
- C2 ⬜ **CSP (SEC-04):** meta policy allowing `'self'` + `www.gstatic.com` (script), `'unsafe-inline'` styles (honest necessity: the app is built on inline styles — document why a nonce is impossible for static single-file HTML), `fonts.googleapis.com` + `fonts.gstatic.com`, Firebase websocket/connect origins. Iterate in the preview until **zero console violations**; then re-verify offline boot, install, and a live cloud-sync round-trip (CSP can break sync silently — that's the real risk).
- C3 ⬜ **SRI (SEC-05/08):** `integrity` + `crossorigin` on the three `gstatic` script tags; verify online boot; extend `tests/design-tokens.test.mjs` so any CDN script without `integrity` fails the suite; document the version-bump hash-rotation procedure.
- C4 ⬜ **Ledger:** AUDIT-CANONICAL.md addendum closes SEC-03/04/05/06/08; HANDOFF.md updated.

## 5. Risks & rollback

- **CSP is the risky one** — silent breakage of sync/fonts/offline. Mitigation: staged verification (console clean → sync round-trip → offline boot), single-commit revert path.
- **Strict `.validate` can brick sync** if a legit field is rejected. Mitigation: scratch-project shadow test with the real client before production publish.
- **Chunking can race state** if a chunk reads the DOM mid-mutation. Mitigation: chunks read from state only; the render loop already serializes.
- Rollback: `git checkout 93dfcc9 -- .` (released state) or the 2026-09-10 backup snapshot for pre-redesign.

## 6. Non-goals

- No framework, no TS, no virtualization library (hand-rolled only if B profiling demands), no rich-text notes, no service-worker `skipWaiting()` policy change (still awaiting owner decision), no self-hosted Firebase SDKs (N5), no cloud sync of notes.

## 7. Open decisions for the owner

1. 🔀 Approve/adjust N1–N6 (defaults above are what I'll build otherwise).
2. 🔀 Confirm phase order B → A → C, or pick your own (e.g. feature-first: A → B → C).
3. 🔀 For C1: provide (or approve creating) a scratch Firebase project for shadow-testing rules.
