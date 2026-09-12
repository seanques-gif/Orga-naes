# CANONICAL PRE-RELEASE AUDIT — Orga-naes
**Date:** 2026-09-12 · **Audit baseline commit:** `4e64f10` (all three audit passes ran against this artifact, byte-verified)
**Post-audit fixes (uncommitted):** `src/js/01-core-state-local-persistence.js` + rebuilt `Orga-naes.html` (redo crash), `package.json` (test wiring), `tests/functional.test.mjs` (new suite)
**Status:** This file is the single authoritative record. All intermediate merges are superseded (§7). Findings and verdicts below are final unless the owner reopens them.

---

## 0. VERDICT

**GO for public release.**

- **FN-01 (test coverage) — ruled a GATE by the owner, and the gate is CLEARED.** The owner ruled that the 6-item functional test suite must exist before release (§3). It was built the same day: 43 assertions across 6 functional areas + SW statics, green via `npm test`, running the real built artifact in a vm sandbox (§5).
- **No 🔴 CRITICAL or 🟠 HIGH findings remain open.**
- **UX-01 (narrow-desktop list squeeze) is FIXED** — `min-width: min(220px, 45vw)` floor applied to the desktop-class split list, rebuilt, and verified in the preview (list 132px→220px at 529px; title went from 5px-visible/truncated to fully readable). Uncommitted; include in the close-out commit.
- The suite's first run **caught a real crash bug** (REDO-01, §4) that two audits and the Phase 4 smoke test had missed — direct validation of the owner's gate ruling.

---

## 1. EXECUTIVE SUMMARY

- **App:** single-file vanilla-JS PWA (`src/` → `build.mjs` → `Orga-naes.html`, 586.8 KB after rebuild). Zero npm dependencies. MIT licensed. Optional Firebase RTDB cloud sync.
- **Audits:** three independent passes against the identical `4e64f10` artifact — Codebuff agent session (static + live probes + history forensics), GLM 5.3 Flash (deep static source read), plus cross-merge verification of every checkable claim. **All material security facts on which multiple audits touched are in agreement.**
- **Security posture:** no secrets (Firebase web config is public client config by design; RTDB rules `"$uid === auth.uid"` owner-published and verified against all 17 client `db.ref()` paths; anonymous read → 401). Zero dependencies → no SCA surface. No CSP (deferred LOW/design). History swept: no secrets ever committed.
- **Functionality posture:** persistence round-trip, repair-on-load invariant, import/export (incl. malformed input), undo, sync conflict flow all verified live and now by automated suite. One real crash bug found by the new suite and fixed (REDO-01).
- **Privacy:** commit history carries a personal Gmail identity on 126 commits — owner accepted, push as-is. `project-flow.json` (real data) never entered Git history.

---

## 2. FINAL FINDINGS REGISTER

Severity: 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW / ⚪ INFO. "Src" abbreviations: [A] Codebuff agent session, [G] GLM 5.3 Flash, [X] cross-merge review, [S] functional suite (new).

### Security & Privacy

| ID | Sev | Finding | Src | Status | Disposition |
|---|---|---|---|---|---|
| SEC-01 | ⚪ INFO | Firebase web config in source (`45-firebase-cloud-sync.js:5-14`) — apiKey etc. | A,G | **RESOLVED by design** | Public client config, documented (README, SECURITY.md). RTDB rules verified correct; live anonymous probe → 401. Do NOT rotate. Residual severity INFO (was inconsistently held at HIGH post-resolution in intermediate merges). |
| SEC-02 | 🟡→✅ | `escapeHtml` lacked quote-escaping in attribute contexts | G | **FIXED `4e64f10`** | Quote-replacement added; 31 call sites audited; hostile-payload probe inert. |
| SEC-03 | 🟢 LOW | Import schema validation could be stricter | A,G | DEFERRED | Self-XSS scope only (documented); hardened escape + parse guards in place. |
| SEC-04 | 🟡 MEDIUM | No CSP meta tag — needs designed inline-compatible policy | A,G | DEFERRED | Design task, not a flip; SECURITY.md invites it. |
| SEC-05 | 🟢 LOW | 3 Firebase CDN `<script>` tags lack SRI/`crossorigin` | G | DEFERRED | Add SRI or self-host (also improves offline first-load). |
| SEC-06 | 🟢 LOW | RTDB rules lack `.validate` shape constraints | G | DEFERRED | Rules isolate per-uid; self-data only. |
| SEC-07 | 🟢 LOW | `.gitignore` gaps: `backup.ps1`, `.claude/`, `.impeccable/`, `.freebuff/`, `screenshots/` | G,X | **ADOPT NOW** | Untracked today; one-line ignore prevents future accidents. (Calibration note: LOW — content of `backup.ps1` was read and contains no secrets; inflation to MEDIUM in intermediates rejected.) |
| SEC-08 | 🟢 LOW | SW runtime-caches Google Fonts | A | DEFERRED | Optional self-host. |
| PRV-01 | ⚪ INFO | Gmail identity on 126/187 commits; publishes with push | A,G | **ACCEPTED (owner)** | Push as-is; current config uses noreply going forward. Irreversible after first public push — decision recorded. |
| PRV-02 | 🟢 LOW | `project-flow.json` (real data) in repo dir | A | **CONTROL VERIFIED** | Never in history (`git log --all` empty); gitignored. |

### Licensing

| ID | Sev | Finding | Src | Status |
|---|---|---|---|---|
| LIC-01 | 🟠→✅ | No LICENSE / "All Rights Reserved" | G | **FIXED `4e64f10`** — MIT LICENSE; fonts OFL; Firebase SDK Apache-2.0; zero deps otherwise. |

### Functionality & Data Integrity

| ID | Sev | Finding | Src | Status | Disposition |
|---|---|---|---|---|---|
| FN-01 | 🔴→✅ | No functional/integration test automation (only 2 design/date test files) | A,G,S | **GATE RULED → CLEARED** | Owner ruled a release gate. Cleared by `tests/functional.test.mjs` (§5). Suite proved its worth immediately (REDO-01). |
| REDO-01 | 🔴→✅ | **`redo()` crash: Ctrl+Y after Ctrl+Z set `projects = undefined`** — undo pushed bare arrays onto `redoStack` / redo onto `undoStack` while both pops expected `{_pp,data}` entries; next `scheduleSave()` → `autoUpdateStatuses` crashed on `projects.forEach`; in-memory state corrupted until reload. Phase 4 smoke test exercised undo only, never redo — two audits also missed it. | S | **FIXED (uncommitted)** | `undo()`/`redo()` now push `{_pp:false, data: cloneProjects(projects)}` (matching the pop shape). Rebuilt; suite green (undo→redo→undo round-trip asserted); fix live-verified in preview via real Ctrl+Z/Ctrl+Y key events (restore 3→4, redo 4→3, zero console errors). |
| FN-02 | ⚪ INFO | 4-layer persistence could drift | A,G | VERIFIED SOUND | Logic sound; repair-on-load proven live; account-switch bookkeeping verified in source. |
| FN-03–FN-06 | ⚪ INFO | Undo/redo internals; import pipeline; PWA/SW; error handling | A,G | VERIFIED GOOD | Line-level citations in superseded docs all check out (~95% exact per claim scorecard). |

### UI/UX

| ID | Sev | Finding | Src | Status | Disposition |
|---|---|---|---|---|---|
| UX-01 | 🟡→✅ | Desktop-class devices ≤768px: split-list had no px floor → 132px at 529px viewport, titles unreadable; drill-down is touch-gated so never applies | A (live-measured) | **FIXED (uncommitted)** | `05-responsive-tablet.css`: desktop-class rule now `min-width: min(220px, 45vw)` (floor beats the 30% max-width legally in CSS; 45vw keeps detail ≥55%). Rebuilt; verified in preview at 529/600/700/768px + before/after A/B (title 5px truncated → 93px fully visible). |
| UX-02 | 🟢 LOW | 601 KB single file → parse cost | G | DEFERRED | Single-file distribution is the product's design goal. |
| UX-03 | 🟡 MEDIUM | No `aria-live` regions (toasts/sync/error changes unannounced to SRs) | G (catch), X (verified) | OPEN — post-release | Small mechanical fix; roles/labels/focus/Escape-stack otherwise verified present. |
| UX-04 | ⚪ INFO | Design-token discipline, touch instrumentation, empty states, keyboard docs | A,G | VERIFIED GOOD | Positive findings. |

### Release / Process

| ID | Finding | Status |
|---|---|---|
| REL-01 | AI-workflow docs tracked (`.github/skills/`, `AGENTS.md`) | Owner's call; harmless. |
| REL-02 | Zero deps, zero-external build | Strength — best-possible supply-chain posture. |
| REL-03 | Push to GitHub pending | Owner action: `git push -u origin main`; then enable Secret scanning, Push protection, Dependabot alerts. |
| REL-04 | Probe limitations (export-fallback interception, synthetic undo, search selector, vm bridge quirks) | Disclosed; each area independently covered — and the synthetic-undo limitation is now moot (suite asserts undo/redo round-trip). |

---

## 3. OWNER DECISIONS RECORD

| Decision | Ruling | Date |
|---|---|---|
| License | MIT — applied in `4e64f10` | 2026-09-11 |
| Commit identity (PRV-01) | Push as-is; no history rewrite | 2026-09-12 |
| RTDB rules (SEC-01) | Owner published `"$uid === auth.uid"` read+write; agent verified coverage | 2026-09-12 |
| **FN-01 test coverage** | **GATE — build the functional suite before release** (settles the GO/NO-GO churn; intermediate merges had flip-flopped this) | 2026-09-12 |
| FN-01 clearance | **CLEARED** — suite built, green, wired into `npm test` | 2026-09-12 |
| SEC-07 `.gitignore` | Adopt now (approved as part of close-out) | 2026-09-12 |

---

## 4. THE FUNCTIONAL SUITE (FN-01 clearance evidence)

**`tests/functional.test.mjs`** — zero-dependency Node runner (same conventions as the existing suites: `fail[]` + exit code, no framework). It builds a `vm` sandbox with DOM/storage/IndexedDB/canvas/Firebase stubs and boots the **real built `Orga-naes.html` script** — the artifact ships, not a paraphrase of it.

**Coverage (43 assertions, 6 areas + statics):**
1. **CRUD** — add/rename/complete/remove through the app's state API; render-side surface checked.
2. **Undo/redo round-trip** — snapshot → mutate → Ctrl+Z (restores) → Ctrl+Y (re-applies) → state identical; this is the test that caught REDO-01.
3. **Export** — `buildFullBackupPayload` path exercised; payload keys/shape asserted.
4. **Malformed import** — truncated JSON, wrong shapes, empty input: toasts, no crash, state untouched.
5. **Persistence lifecycle** — debounced save writes localStorage + IDB mirror; reboot 2 reloads all projects and fires repair-on-load (invalid `completed`-with-open-children → `ongoing`); boot 3 wipes localStorage and recovers from the IndexedDB mirror.
6. **Firebase push/pull** — fake RTDB + real app push entry point (`_firebasePushNow`): user-scoped path written, subtask tree intact, `updatedAt` stamped; second boot pulls the same data back.
7. **SW statics** — versioned cache name, 4 precached assets, network-first fetch, firebase/googleapis bypass.

**Run:** `npm test` (now runs all three suites) or `node tests/functional.test.mjs`.

---

## 5. POST-AUDIT CHANGES (all uncommitted at time of writing)

| File | Change | Why |
|---|---|---|
| `src/js/01-core-state-local-persistence.js` | 2 lines: undo/redo stack pushes wrapped in `{_pp:false, data: …}` | REDO-01 fix |
| `Orga-naes.html` | rebuilt | artifact owns the fix |
| `tests/functional.test.mjs` | new (605 lines) | FN-01 gate clearance |
| `package.json` | test script += functional suite | gate enforcement |

Recommended commit message: *"FN-01 gate: add functional test suite (43 assertions, boots real artifact); fix redo() crash it caught (undo/redo stack shape mismatch)."*

---

## 6. VERIFICATION COMMANDS

**Clean-clone verification: PASS (2026-09-12, HEAD `e3391d6`).** Fresh clone of the repo to a scratch dir (git-local clone, nothing pushed): contains exactly the publish set (gitignored local files absent), `npm run build` succeeds, `npm test` all green (43 functional + tokens + dates) with zero installs (no deps), and the in-clone rebuild is byte-identical (592,960 bytes) to the committed artifact. Index EOLs uniform LF (`git ls-files --eol`). A stranger can reproduce the artifact from the public content alone.

```bash
npm test                                   # all three suites, expect green
node tests/functional.test.mjs             # the gate suite alone

# Build integrity — in-memory rebuild byte-compares against the committed artifact
node -e "import('fs').then(({readFileSync})=>{const rd=p=>readFileSync(p,'utf8');const o=JSON.parse(rd('src/order.json'));const j=f=>f.map(rd).join('');const out=rd('src/template.html').replace('__ORGA_CSS_MAIN__',()=>j(o.cssMain)).replace('__ORGA_CSS_PRINT__',()=>j(o.cssPrint)).replace('__ORGA_SCRIPT__',()=>j(o.script));console.log(out===rd('Orga-naes.html')?'MATCH':'MISMATCH');});"

# Secret sweep (expect only the documented Firebase public config)
grep -rnoE "AIzaSy[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20}|sk-[a-zA-Z0-9]{20}|AKIA[A-Z0-9]{8}|BEGIN [A-Z ]*KEY" src/ sw.js manifest.json *.md *.mjs

# RTDB anonymous probe (expect Permission denied with the published rules)
curl -s "https://orga-naes-default-rtdb.asia-southeast1.firebasedatabase.app/.json"
```

---

## 7. SUPERSEDED DOCUMENTS

This file closes the merge chain. The following are retained as historical evidence only — **do not cite them; where they disagree with this file, this file governs** (they contain the FN-01 flip-flops, the SEC-01 residual-severity inconsistency, and provenance errors in both directions):

1. `audit-findings-report.md` — GLM 5.3 Flash / prior-session audit deliverable (primary source, unmodified)
2. `GLM 5.3 Flash - Audit report.md` — Codebuff agent session's consolidated report, renamed by the owner (primary source, unmodified)
3. `MERGED-AUDIT-FINDINGS.md` — cross-merge review (introduced the unified ID scheme + claim scorecard)
4. `audit-merged.md` — first merge (attribution errors)
5. `audit-hybrid.md` — second merge (FN-01 self-contradiction, verdict flip, residual defects)

Primary sources (1) and (2) remain valid as raw evidence; (3)–(5) are working drafts.

---

## 8. REMAINING ACTIONS

**Before `git push` (recommended, non-gating):**
1. UX-01 — one-line CSS floor for the narrow-desktop split list + rebuild.
2. Commit the §5 changes (FN-01 clearance + REDO-01 fix).
3. SEC-07 — extend `.gitignore` (`backup.ps1`, `.claude/`, `.impeccable/`, `.freebuff/`, `screenshots/`).

**After publish:** enable GitHub Secret scanning + Push protection + Dependabot alerts.

**Post-release backlog (priority order):** UX-03 `aria-live`; SEC-04 CSP design; SEC-05/SEC-08 SRI or self-host SDK/fonts; SEC-03/SEC-06 stricter import schema + `.validate` rules; bump `CACHE_VERSION` each release.
