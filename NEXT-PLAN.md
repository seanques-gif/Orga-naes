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
- Every change runs the chained change loop: one change → build → `npm test` → live-verify in the preview → commit. Then, and only then, the next change. Suite is now 99 assertions / 12 tests + the 5×34 contrast gate; it must stay green at every commit.
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

### Phase B — List-render chunking ✅ COMPLETE 2026-09-13
- B1 ✅ **Measured before:** warm baseline 10.3ms@42 / 62.8ms@126 / 156.2ms@250 (list build dominates, super-linear; cold-start@42 replicates the old ~55ms figure). Full tables in REDESIGN-FINDINGS.md Phase B section.
- B2 ✅ **Sliced:** category labels sync; list items append in ~6ms rAF slices above a 60-project threshold (`0b4a4af`). Below threshold: byte-identical classic path.
- B3 ✅ **Interaction priority + coalescing:** sync cost at 250 dropped 156→16ms (~85%); stale-chain token cancels superseded builds (burst-of-3 proof), bounding search-keystroke re-render cost.
- B4 ✅ **Measured after:** 188/250 rows correct with the completed-filter math exact; 42-project board unchanged (15.0 vs 14.8ms); full suite green (99/99, pin verified). Virtualization was already present (`_virtualizeList`) and still runs post-chunk.

### Phase A — Notes↔Project linking ⬜ (second: the feature)
- A1 ⬜ **Parser:** detect `@project:<id>` tokens in note bodies at render time; name-fallback resolution (N2).
- A2 ⬜ **Mention popup:** typing `@` in the note editor opens a filterable project picker; inserts `@project:<id> <name>`.
- A3 ⬜ **Note-side surface:** linked-project chip row on note cards + in the editor header, click → opens that project.
- A4 ⬜ **Project-side surface:** project detail gains a "Notes (n)" section listing linked notes, click → opens Notes view on that note.
- A5 ⬜ **Free-ride verification:** prove links survive sync push/pull, JSON export→import, snapshot recovery, and the recycle bin (they're body text — verify, don't assume).
- A6 ⬜ **Tests:** parser unit cases + a functional test (link appears both sides; rename fallback works; link to deleted project degrades gracefully).
- A7 ⬜ Record in REDESIGN-FINDINGS.md + HANDOFF.md; commit per slice.

> **STATUS: COMPLETE (2026-09-13).** All slices shipped and verified: parser + resolution (id-first, name fallback), @ mention popup, chips both sides, project-detail Notes(n), cross-navigation both ways. Durability free-ride proven live: file-import round-trip, snapshot recovery, recycle-bin + tombstone restore, sync-format neutrality. Two fallback defects fixed (chip nav + notesForProject) plus an import regression found and fixed during verification (unbound importedNotes crashed every valid file import; happy-path test added). Functional suite grew 99 -> 117 assertions, all green. Notes were local-first at Phase A close; on 2026-09-13 (mid-Phase-C, owner decision) notes JOINED the cloud sync — see Phase C addendum.

> **STATUS: C1 rules DRAFTED + SHADOW-TESTED (2026-09-13).** `database.rules.json` generated from a verified write-surface inventory; 43-check local shadow suite (rules evaluator + adversarial payloads + determinism gate) wired into npm test; committed `a14d83a`. Rules are NOT yet published to any Firebase project — the Console shadow test (scratch project first, then production + incognito 401 re-check) is the owner step. Full walkthrough: SHADOW-TEST-RUNBOOK.md (local-only).

### Phase C addendum — Notes cloud sync (shipped 2026-09-13, owner decision: "Yes, sync notes")

Notes joined the Firebase sync surface as `notes` (array) + `noteTombstones` (map), same full-set push pattern as archive/trash, no realtime listener (bulk, low-velocity data). Safety properties: fresh-device guard (a device with zero notes never nulls a populated cloud before its first pull), tombstone-union on every adoption (deletions win everywhere), account-switch now clears + replaces notes with the incoming account's set (was a cross-account leak), pull awaits `_pf.notesReady` (kills the boot-race skip), daily Firebase auto-backup carries notes too. RTDB rules extended (`notes`/`noteTombstones` user paths + inside `backups/$date`); shadow suite 43→58 checks; functional suite 117→125 (Notes cloud sync round-trip: push → fresh-device pull → tombstone propagation → fresh-device-no-erase guard). All suites green; owner's walkthrough steps 8–11 still gate the production rules publish (the notes rules ride along in the same file — no extra owner work).

## Phase C — Security backlog ⬜ (last: needs owner console access)
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
