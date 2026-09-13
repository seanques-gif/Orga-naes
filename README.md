# Orga-naes

[![CI](https://github.com/seanques-gif/Orga-naes/actions/workflows/ci.yml/badge.svg)](https://github.com/seanques-gif/Orga-naes/actions/workflows/ci.yml)

A personal project manager that lives entirely in **one HTML file**. No backend, no
accounts, no install — your data stays in your browser.

Vanilla JavaScript, HTML, and CSS. Zero npm dependencies.

## What it does

- **Canvas board + list view** for projects with nested subtasks (unlimited depth)
- **Notes** with @project cross-links, multi-select, and a recycle bin (30-day TTL) for anything deleted
- Task dependencies, comments, due dates, reminders, and a weekly planner
- Archive, trash, and a full undo/redo stack
- Five theme presets, a font picker (embedded fonts, custom Google Fonts), SVG icon chrome, keyboard shortcuts
- Offline-first PWA: installable, works with no network, updates wait for your click
- Import/export of JSON backups at any time

## Data & privacy

All data is stored locally in your browser (localStorage + IndexedDB). Nothing is sent
anywhere unless you turn on the **optional** cloud sync, which syncs per-user to your
own Firebase Realtime Database. Export produces a plain JSON file you own.

The Firebase web configuration included in the source is public client configuration by
design — it identifies the project, not a credential. Access control is enforced by
Realtime Database security rules.

## Build & test

Requires Node.js (any recent version).

```bash
npm run build   # reassembles src/ into the single-file Orga-naes.html
npm test        # six suites: design tokens, contrast, dates, CSP, functional (125), RTDB rules (141)
npm run verify  # determinism gate (artifact pin byte-matches a fresh build) + test
```

Source of truth is `src/` — never hand-edit `Orga-naes.html`; the build owns it.

## Run it

Serve the folder with any static server and open `Orga-naes.html`:

```bash
npx serve .
# → http://localhost:3000/Orga-naes.html
```

A server (not `file://`) is required for the service worker and installability.
Opening the file directly also works for casual use, minus PWA features.

## License

[MIT](LICENSE) © 2026 Sean Ques
