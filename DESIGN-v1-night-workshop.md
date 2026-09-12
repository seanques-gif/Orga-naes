---
name: Orga-naes
description: Personal Project Manager — gamified nested planning in a single dark-surface file
colors:
  accent: "#ffffff"
  accent-contrast: "#141414"
  bg: "#181818"
  card: "#303030"
  card-border: "#404040"
  sub-bg: "#2a2a2a"
  header-bg: "#252525"
  text: "#dcddde"
  text-dim: "#d0d0d0"
  status-planned: "#bbbbbb"
  status-ongoing: "#f0c070"
  status-completed: "#59c980"
  status-waiting: "#c4b5fa"
  danger: "#e05555"
typography:
  display:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 700
    fontSize: "calc(clamp(11px, 1.8vw, 14px) + 2px)"
    lineHeight: 1.2
  title:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 600
    fontSize: "clamp(11px, 1.8vw, 14px)"
    lineHeight: 1.35
  body:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 500
    fontSize: "clamp(11px, 1.8vw, 14px)"
    lineHeight: 1.45
  label:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 600
    fontSize: "calc(clamp(11px, 1.8vw, 14px) - 2px)"
    lineHeight: 1.3
rounded:
  sm: "5px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "100px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-contrast}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  button-ghost:
    backgroundColor: "{colors.sub-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  chip-status:
    backgroundColor: "{colors.sub-bg}"
    textColor: "{colors.status-ongoing}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
  input-field:
    backgroundColor: "{colors.sub-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
---

# Design System: Orga-naes

## Overview

**Creative North Star: "The Night Workshop"**

Orga-naes looks like a well-kept dark toolbox at night: deep neutral surfaces, thin hairline borders marking where every tool lives, and warm status lights — amber for work in progress, green for finished, violet for waiting — glowing softly against the dark. The accent light is pure white and rare; its scarcity is what makes it read as *the* interactive signal. Everything is in its place, everything does work, and progress is earned visibly.

The workshop is **focused + rewarding**: dense, efficient surfaces where every pixel has a job, with polish expressed through precision — aligned edges, consistent 6px rounding, instantaneous 0.15s feedback — rather than decoration. Gamification elements (XP badge, level chip, streak markers) are rendered as compact workshop instruments, never as confetti. This is a personal daily-driver (see PRODUCT.md): it must feel fast, trustworthy, and quietly motivating on a phone one-handed and on a desktop with forty projects open.

All values below are the **dark base theme** (the normative default). The app ships 9 additional theme presets plus light/eye-care variants that recolor the same CSS custom properties (`--bg`, `--card`, `--accent`, `--status-*`) — layout, type, radius, and elevation are theme-invariant.

**Key Characteristics:**
- Layered dark neutral surfaces separated by 1px hairline borders, not shadows
- One white accent + a dark ink counterpart; semantic status colors carry the color load
- Compressed type scale built on one fluid root (`clamp(11px, 1.8vw, 14px)`) in Nunito
- 6px workhorse radius with pill badges; corners stay quiet
- Interaction lifts: rest is flat, hover/active/drag adds shadow and accent tint
- Micro-transition grammar: 0.15s ease for state, 0.2–0.3s for surfaces

## Colors

A dark neutral workshop floor with four warm/cool status lights and a single white signal accent; everything tinted through CSS custom properties so all 10+ themes share one set of rules.

### Primary
- **Signal White** (#ffffff, `--accent`): The interactive voice — primary buttons, active nav states, focus rings, selection outlines, drop indicators, the left rail on the selected project. Always paired with **Workshop Ink** (#141414, `--accent-contrast`) as its text color. Theme presets recolor it (cyberpunk magenta, ocean cyan, forest green…); its contrast partner must always come from the `--accent-contrast` token.

### Secondary (status system — semantic, never decorative)
- **Planned Steel** (#bbbbbb, `--status-planned`): Dormant work; dimmed titles, hollow indicators.
- **Work Amber** (#f0c070, `--status-ongoing`): Projects in motion — the warm light of the workshop.
- **Done Green** (#59c980, `--status-completed`): Finished work; quiet, not celebratory.
- **Waiting Violet** (#c4b5fa, `--status-waiting`): Blocked/parked work; the cool light.
- **Alarm Red** (#e05555, `--danger`): Overdue and destructive actions only.

### Neutral
- **Floor** (#181818, `--bg`): App background; the darkest surface.
- **Header Slate** (#252525, `--header-bg`): Toolbar strip above the work area.
- **Bench** (#303030, `--card`): Project cards and raised containers; the primary work surface.
- **Drawer** (#2a2a2a, `--sub-bg`): Inputs, sub-surfaces, list rows inside cards.
- **Hairline** (#404040, `--card-border` / `--sub-border`): All resting borders — the structural drawing of the workshop.
- **Body Text** (#dcddde, `--text`): Primary reading color, slightly cool.
- **Bright Dim** (#d0d0d0, `--text-dim`): Secondary text; deliberately bright for dark-surface legibility.

### Named Rules
**The White-Pair Rule.** The accent is never used with white text by assumption. Any element that paints its background with `--accent` must take its text color from `--accent-contrast` (dark ink `#141414` on the white base). At runtime, `applyThemePreset` computes WCAG contrast: a preset's hand-tuned partner is kept only when it passes AA (≥4.5:1) against the accent; otherwise the stronger of ink/white is applied automatically. Hardcoded `color:#fff` next to `background:var(--accent)` is a defect.

**The Tint-Through-Token Rule.** Accent washes — focus glows, hover tints, active bars, delete-bar backgrounds — are always `color-mix(in srgb, var(--accent) N%, transparent)` with N between 3.5% and 60%. Never hardcode an accent RGB triplet; tints must follow the theme like the accent itself does.

**The Semantic Fence.** Status colors mean one thing each and appear only in their semantic role (badge, dot, rail, text). They are never repurposed as decoration or hover washes.

## Typography

**Display/Body Font:** Nunito (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto` fallback; loaded via Google Fonts, weight 400–700 + italic 400)

**Character:** Nunito's rounded terminals soften the dark surfaces into something approachable — a workshop, not a terminal. The scale is aggressively compressed: everything derives from one fluid root, and hierarchy is expressed through weight (500 body → 600 titles → 700 display/counts) and dimness rather than size jumps.

### Hierarchy
- **Display** (700, root + 2px, 1.2): Modal headings, counter totals, the XP/level chip. Scarce.
- **Title** (600, root, 1.35): Project and task names, panel headings.
- **Body** (500, root, 1.45): Descriptions, list rows, button text.
- **Label** (500–600, root − 2px, compact): Toolbar buttons, meta info, the 9px bottom-nav captions on mobile. The system tolerates very small functional text — it is a dense instrument panel — but never below 9px.

### Named Rules
**The One-Root Rule.** Every font size derives from `--font-size-base: clamp(11px, 1.8vw, 14px)` via the calc steps above (or its 9px mobile-floor exception). No absolute pixel sizes for text — verified exhaustively; the Display Scale control (60–140%) drives the base token, so it scales the entire UI, not a fraction of it.

## Layout

Two stable shells share one codebase. **Desktop:** a slim toolbar (4px vertical padding) over a split view — project list rail (~300px) beside the detail/board canvas, divided by a 4px draggable divider that glows accent on grab. **Mobile** (≤600px): the list rail collapses; navigation becomes a fixed bottom bar of 5 icon+label buttons (48px touch targets, badge support) with a floating action button above it, and detail panels slide over full-width.

Density is high by design: list rows ~32–40px, cards pad 10–16px internally, toolbar buttons hug at 4px/12px. Breakpoints: 900px (tablet squeeze of the split view), 600px (mobile shell + bottom nav), 500px (compact meta), plus `pointer: coarse` and portrait adjustments for touch ergonomics, and a `display-mode: standalone` block for installed-PWA chrome. A print stylesheet linearizes everything to white paper.

## Elevation & Depth

**Flat-then-lift.** At rest the workshop is drawn entirely with hairline borders — surfaces sit on the floor, distinguished by tonal layering (Floor → Header → Bench → Drawer) and 1px lines. Shadows exist only as *feedback*: the moment a surface responds to a pointer or carries draggable state, it lifts.

### Shadow Vocabulary
- **Hover lift** (`0 8px 24px rgba(0,0,0,0.35–0.4)`): Cards, toolbar toasts and menus on hover/appear.
- **Carried weight** (`0 20px 50px rgba(0,0,0,0.5)`): Modals, drag ghosts — things the user is "holding."
- **Signal edge** (`inset 0 ±2px 0 0 var(--accent)`, `±4px 0 0 0 var(--accent)`): Drop-position indicators; depth by accent line, not blur.

### Named Rules
**The Flat-At-Rest Rule.** No box-shadow on resting cards, rows, or buttons. If a shadow is visible, the element is interacting, floating, or being dragged — otherwise remove it.

## Shapes

One workhorse radius: **6px** on every interactive element (buttons, inputs, small chips, list rows) — rounded enough to feel friendly, sharp enough to feel like tools. Containers step up to **8px** (cards, modals 12–16px for the few large overlays), and **100px pills** are reserved for status chips, badges, and the update pill so they read as labels, not surfaces. Corners never mix scales within one component. Borders are 1px solid hairlines; dashed accent outlines (2px, offset −2px) appear only for paste-armed and nesting drop states.

## Components

### Buttons
- **Shape:** 6px radius; compact padding (4px 12px standard, 4px 8px for meta-row buttons)
- **Primary:** Signal White background (`{colors.accent}`) with Workshop Ink text (`{colors.accent-contrast}`) — used sparingly: Today/This Week jumps, undo, save actions
- **Ghost/Default:** Drawer background with hairline border and Body Text; hover brightens border to `--hover-border` and tints background via accent color-mix at 10–12%
- **Hover / Focus:** 0.15s ease; focus = 2px accent outline with offset; active buttons tint via `color-mix(var(--accent) 15%)`

### Chips / Badges
- **Style:** 100px pill, Drawer background, tinted status text (Work Amber on `color-mix(ongoing 10%)` etc.)
- **State:** Status chips carry dot + count (toolbar totals); XP/level chip uses accent tint at 15%; unread badge is a 16px accent-red disc with white 9px numerals

### Cards / Containers (project nodes)
- **Corner Style:** 8px radius
- **Background:** Bench (`{colors.card}`); selected = 2px white ring, hover = hairline brightens to `--hover-border` + Hover lift shadow + 1px translateY
- **Signature anatomy:** left status rail (4px, semantic color, 6px radius) → drag handle → title row with due/recur chips → nested subtask rows (Drawer background, their own 2px rails, indent nesting) → footer meta
- **Border:** 1px Hairline; drop targets swap to ±4px accent edge lines

### Inputs / Fields
- **Style:** Drawer background, 1px Hairline, 5px radius, compact vertical padding
- **Focus:** border shifts to accent (no glow); date inputs render dark-scheme natively
- **Error:** inline red text below the field in Alarm Red; destructive confirmations use a dedicated modal, never browser dialogs

### Navigation
- **Desktop:** toolbar strip of icon buttons with tooltips; active view = accent tint + bolder icon
- **Mobile:** fixed bottom bar, 5 items, icon over 9px label; active item takes accent color + 15% accent wash; the options panel slides in as a right-side drawer with sectioned headers (10px uppercase labels)

### Signature Component: The Status Rail
Every project and subtask carries a 4–7px colored rail on its left edge that encodes pipeline state (Planned Steel → Work Amber → Done Green → Waiting Violet). It is the app's most recognizable element: glance-level progress across a dense board, echoed by list-item borders, calendar dots, and filter chips. New components that represent work items must include their rail.

## Do's and Don'ts

### Do:
- **Do** take every color from the CSS custom properties on `#pf-root`; themes recolor only the tokens.
- **Do** pair `--accent` backgrounds with `--accent-contrast` text (White-Pair Rule) and build accent tints with `color-mix(in srgb, var(--accent) N%, transparent)` (Tint-Through-Token Rule).
- **Do** keep interactions at 0.15s ease and reserve 0.2–0.3s for surface/appear transitions.
- **Do** use 6px radius for controls, 8px for cards, pills only for chips/badges.
- **Do** verify changes in both shells (mobile bottom-nav layout + desktop split view) and in at least one preset beyond the default.

### Don't:
- **Don't** hardcode accent RGB triplets (the retired `rgba(123,104,238,…)` family) — tints must follow the active theme.
- **Don't** put white text on an accent background, or `#fff` on the green success/button surfaces.
- **Don't** add resting shadows to cards, rows, or buttons (Flat-At-Rest Rule).
- **Don't** use status colors decoratively, or invent a fifth status color without a semantic state.
- **Don't** break the single-file constraint (`Orga-naes.html`), the offline-first behavior, or mobile/desktop parity for a visual gain.
