# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (installable PWA — standalone display, offline-capable via service worker)

## Users

Primary user is the creator, Sean Ques — a personal daily-driver for tracking ongoing projects and tasks day to day. Secondary adoption (friends, teammates) is a future possibility, not a current commitment; the app must stay welcoming to a new user with zero onboarding, but no multi-user features are planned or promised.

## Product Purpose

Orga-naes ("Personal Project Manager") makes personal project tracking fast and rewarding: nested projects → tasks → subtasks with statuses, due dates, a weekly planner, calendar view, reminders, and XP/level gamification. Success means the owner actually keeps using it daily — capturing and advancing real work — instead of abandoning it like heavier tools.

## Positioning

A complete project manager in a single HTML file. Nothing to install, no build step, no server, no account: open the file (or the installed PWA) and everything works offline, with data in the browser's own storage. Neighboring task apps cannot truthfully claim zero-setup + local-first + gamified nested planning in one artifact. Cloud sync (Firebase, Google sign-in) exists purely as an opt-in enhancement for the owner's own devices.

## Operating Context

- Used across phone and desktop — same single-file codebase must serve touch and pointer equally.
- Data lives in localStorage; optional Firebase cloud sync keeps the owner's devices aligned.
- Backups via `backup.ps1` (git-archive zip per snapshot, 1 GB rolling cap) are part of the maintenance ritual.
- Version history, activity log, trash, and archive views are part of real data-recovery workflows, not decorative features.

## Capabilities and Constraints

Confirmed capabilities: projects with categories/colors, nested subtasks, status pipeline (planned / ongoing / waiting / completed), due dates + overdue handling, weekly planner with backlog and auto-arrange, calendar view, reminders, recurring tasks, search, XP/level gamification, CSV/JSON/PDF export, JSON import/export, Firebase sync (opt-in), 10 theme presets + light/eye-care variants, drag-and-drop reordering, keyboard shortcuts, PWA install with service worker.

Hard constraints for all future work:

- **Single-file architecture** — all features live in `Orga-naes.html`; no build step, no framework, vanilla JS.
- **Offline-first PWA** — core features work with no network; sync and install are enhancements, never requirements.
- **No required accounts** — sign-in/cloud is opt-in; managing projects must never demand an account.
- **Mobile + desktop parity** — one codebase; regressions against either form factor are defects.

Explicitly undecided (do not fabricate): success metrics beyond "owner keeps using it"; whether secondary audiences ever get sharing/collaboration.

## Brand Commitments

- Name: **Orga-naes** (manifest `name`/`short_name`); descriptor "Personal Project Manager".
- About-credit: "Created by Sean Ques" stays in the app.
- Personality: gamified and encouraging — momentum, progress, small wins; never corporate or guilt-driven.

## Evidence on Hand

- `manifest.json` + `icon-192.png` / `icon-512.png` (any + maskable) — real PWA packaging.
- `sw.js` — service worker for offline caching (not verifiable under static single-file preview servers; verify from the repo root or a real host).
- `tests/date-utils.test.mjs` — date logic has unit tests.
- `backup.ps1` — documented backup/restore ritual.
- Git history (178 commits) records steady feature work: weekly planner backlog, auto-arrange, drag/drop, emoji picker, due-date relocation.
- No user research, testimonials, benchmarks, or press exist. Future work must not invent them.

## Product Principles

1. **Local-first trust.** The user's data belongs in their browser; cloud features may invite, never gate.
2. **Friction dies at setup.** Zero install, zero account, zero build — value starts the moment the file opens.
3. **Momentum over guilt.** Gamification and status clarity reward progress; overdue states inform, they don't scold.
4. **Depth without clutter.** Nested planning, multiple views, dense information — but scannable on a phone one-handed as well as on a desktop.
5. **One file, no forks.** Architecture outranks convenience: if a feature can't live in `Orga-naes.html`, it needs a reason that beats the constraint.
