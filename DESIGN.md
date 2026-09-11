---
name: Orga-naes
description: Personal Project Manager — a local-first operations console for nested planning
colors:
  accent: "#2fd4ff"
  accent-contrast: "#04141b"
  bg: "#0a0d11"
  card: "#12161c"
  card-hover: "#171c24"
  card-border: "#232a34"
  sub-bg: "#0e1218"
  header-bg: "#0d1116"
  text: "#d7dde5"
  text-dim: "#8b95a3"
  status-planned: "#7c8794"
  status-ongoing: "#ffb454"
  status-completed: "#3ddc97"
  status-waiting: "#b39dff"
  danger: "#ff5c5c"
typography:
  display:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 600
    fontSize: "calc(clamp(11px, 1.8vw, 14px) + 2px)"
    lineHeight: 1.2
  title:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 600
    fontSize: "clamp(11px, 1.8vw, 14px)"
    lineHeight: 1.35
  body:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 400
    fontSize: "clamp(11px, 1.8vw, 14px)"
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, 'SFMono-Regular', Consolas, monospace"
    fontWeight: 500
    fontSize: "calc(clamp(11px, 1.8vw, 14px) - 2px)"
    lineHeight: 1.3
  metric:
    fontFamily: "IBM Plex Mono, ui-monospace, 'SFMono-Regular', Consolas, monospace"
    fontWeight: 500
    fontSize: "clamp(11px, 1.8vw, 14px)"
    lineHeight: 1.2
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  pill: "100px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-contrast}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  button-ghost:
    backgroundColor: "{colors.sub-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  chip-status:
    backgroundColor: "color-mix(in srgb, var(--status) 12%, transparent)"
    textColor: "var(--status)"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input-field:
    backgroundColor: "{colors.sub-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
---

# Design System: Orga-naes

## Overview

**Creative North Star: "The Mission Console"**

Orga-naes is an operations console for one operator. It reads like a piece of
equipment built for long shifts: near-black instrument panels, hairline rules that
map where every datum lives, a single cyan signal that means "this is live," and
machine-set type for anything you count. Nothing glows for decoration. The console
earns trust by being legible at 6am and at midnight, on a phone held one-handed and
a desktop with forty projects open.

This replaces the previous "Night Workshop" world (preserved in
`DESIGN-v1-night-workshop.md` as the anti-reference). The workshop was warm and
toolbox-like; the console is cooler and more precise. The change is **presentation
only** — the single-file build, offline behavior, data model, and the recursive
nested-task engine are untouched (see `PRODUCT.md` and `REDESIGN-FINDINGS.md`).

**Key Characteristics:**
- Near-black cool-tinted surfaces, never pure `#000`; separation by 1px hairline,
  not shadow (Flat-At-Rest).
- One **cyan signal** accent with a dark ink partner; semantic statuses carry color.
- **Sans for meaning, mono for measurement** — every number, count, date, key, and
  meta label is IBM Plex Mono with `tabular-nums`, so columns don't shift.
- Sharper geometry: 4px workhorse radius, 6px containers, pills only for status.
- Dense by design, restful at rest: interaction adds an accent ring or lift, never
  a resting shadow.
- Mechanical motion: fast, interruptible, critically damped.

## Colors

The console floor is near-black and cool. Color is rationed: four status lights
plus one signal accent. All values are CSS custom properties on `#pf-root`, so the
five presets recolor the same rules without touching layout, type, or radius.

### Primary
- **Signal Cyan** (`#2fd4ff`, `--accent`): the interactive voice — primary buttons,
  active nav, focus rings, selection rails, drop edges. Always paired with
  **Console Ink** (`#04141b`, `--accent-contrast`) as its text color. Presets recolor
  it; the contrast partner always comes from `--accent-contrast`.

### Secondary (status system — semantic, never decorative)
- **Standby Gray** (`#7c8794`, `--planned`): dormant work.
- **Amber** (`#ffb454`, `--ongoing`): work in motion.
- **Phosphor** (`#3ddc97`, `--completed`): finished work.
- **Violet** (`#b39dff`, `--waiting`): blocked/parked; kept distinct from cyan.
- **Alert** (`#ff5c5c`, `--danger`): overdue and destructive only. Raised from the
  old `#e05555`, which failed AA as text on the panel (**F3**).

### Neutral
- **Floor** (`#0a0d11`, `--bg`): app background.
- **Console** (`#0d1116`, `--header-bg`): toolbar strip.
- **Panel** (`#12161c`, `--card`): cards and raised containers.
- **Well** (`#0e1218`, `--sub-bg`): inputs and sub-surfaces, sunk *below* panel.
- **Hairline** (`#232a34`, `--card-border` / `--sub-border`): all resting borders.
- **Body Text** (`#d7dde5`, `--text`): cool near-white.
- **Dim** (`#8b95a3`, `--text-dim`): true secondary. The old `#d0d0d0` sat only
  1.13× from body text and flattened hierarchy (**F14**); this restores it.

### Named Rules
**The White-Pair Rule.** Any element whose background is `--accent` takes its text
from `--accent-contrast`. `applyThemePreset` still verifies WCAG AA and substitutes
the stronger of ink/white when a preset partner fails. Hardcoded `#fff` next to
`background: var(--accent)` is a defect.

**The Tint-Through-Token Rule.** Every accent/status/danger wash is
`color-mix(in srgb, var(--token) N%, transparent)`, N between 4% and 60%. No
hardcoded RGB triplets of a palette color; tints follow the active preset.

**The Semantic Fence.** Status colors appear only in their semantic role (rail,
dot, badge, metric text). Never as decoration or hover washes.

**The Measurement Rule.** Any number the user reads — counts, progress, XP, level,
dates, durations, shortcut keys — is set in `--font-mono` with
`font-variant-numeric: tabular-nums`. Prose stays in `--font-sans`.

## Typography

**Display/Query Font:** IBM Plex Sans · **Data/Label Font:** IBM Plex Mono.
Loaded via the existing Google Fonts `<link>` (single-file, no build); system
fallbacks retained so offline first paint still reads.

**Character.** Plex is engineered, slightly technical, and humanist enough not to
feel like a terminal. The pairing is the identity: **sans carries meaning, mono
carries measurement.** Hierarchy comes from the sans/mono switch and weight, not
from dimming — one root, explicit steps.

### Hierarchy
- **Display** (Sans 600, root + 2px, 1.2): modal/panel headings, the level chip. Scarce.
- **Title** (Sans 600, root, 1.35): project and task names, section headers.
- **Body** (Sans 400, root, 1.45): descriptions and row text.
- **Label** (Mono 500, root − 2px, 1.3): toolbar buttons, chips, meta, the mobile
  nav captions. Functional floor is 9px, never below.
- **Metric** (Mono 500, root, 1.2): counts, progress, dates, XP.

### Named Rules
**The One-Root Rule (carried over).** Every size derives from
`--font-size-base: clamp(11px, 1.8vw, 14px)` via the ladder above (plus the 9px
mobile floor). No absolute px for text; the Display Scale control drives the whole UI.

## Type Scale

Named steps replace the ad-hoc fractional sizes (26 variants incl. half-pixels, **F16**):

| Token | Value | Use |
|---|---|---|
| `--fs-display` | `calc(var(--font-size-base) + 2px)` | headings, level chip |
| `--fs-title` | `var(--font-size-base)` | project/task names |
| `--fs-body` | `var(--font-size-base)` | prose, rows |
| `--fs-label` | `calc(var(--font-size-base) - 2px)` | toolbar, chips, meta |
| `--fs-micro` | `calc(var(--font-size-base) - 4px)` | dense meta, captions |

Exceptions only: the 9px mobile floor and the standalone PDF export (literal px,
token-free by design). Half-pixel steps are retired.

## Layout

Same two shells, cooler skin. **Desktop:** strip toolbar over a split view — list
rail beside the detail board, a 4px divider that shows the signal on grab.
**Mobile** (≤600px): the rail collapses; fixed bottom bar (5 items, 48px targets)
with the FAB above it; detail slides over full-width.

Density is intentional (rows 32–40px, panels padded 12–16px). Breakpoints unchanged:
900 / 600 / 500, plus `pointer: coarse`, portrait, and `display-mode: standalone`.
A print stylesheet linearizes to paper.

## Spacing

One 2px-base scale replaces the 25+ ad-hoc paddings (**F10**):

`--space-xxs 2` · `--space-xs 4` · `--space-sm 6` · `--space-md 8` ·
`--space-lg 12` · `--space-xl 16` · `--space-xxl 24`

Component spacing uses scale steps only; off-grid (`3/5/7/9px`) values are retired.
Controls pad `4px 12px`; rows pad `--space-sm --space-lg`.

## Elevation & Depth

**Flat-then-lift.** At rest the console is hairlines and tonal layering
(Floor → Console → Panel → Well). Shadows are feedback only (**F12** retires the
resting shadows on `.pf-node`, `.pf-split-list-dot`, zoom controls, FAB/menu).

### Shadow Vocabulary
- **Hover lift** (`0 6px 18px rgba(0,0,0,0.45)`): cards/menus on hover or appear.
- **Carried weight** (`0 20px 50px rgba(0,0,0,0.55)`): modals and drag ghosts.
- **Signal edge** (`inset 0 ±2px 0 0 var(--accent)`, `±4px 0 0 0 var(--accent)`): drop positions.
- **Focus/active ring** (preferred over shadow): `0 0 0 2px var(--accent)` or an
  inset 1px accent ring.

**The Flat-At-Rest Rule (carried over).** No resting box-shadow on cards, rows, or
buttons. Visible shadow ⇒ the element is interacting, floating, or dragged.

## Shapes

Two workhorse radii and a pill:

| Token | Value | Use |
|---|---|---|
| `--radius-control` | `4px` | buttons, inputs, chips, list rows, small controls |
| `--radius-container` | `6px` | cards, nodes, panels' inner blocks |
| `--radius-overlay` | `10px` | modals, large overlays, dropdowns |
| `--radius-pill` | `100px` | status chips, badges, update pill only |

The 5/7/8/12/14/16/20/24px drift (**F8**) is retired. Borders are 1px solid
hairline; dashed accent outlines (2px, offset −2px) only for paste-armed/nest states.

## Z-Index

A named ladder replaces the `99999…9200` sprawl (**F9**):

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | canvas content |
| `--z-sticky` | 10 | toolbar, sticky headers |
| `--z-float` | 60 | panels, modals, backdrop |
| `--z-menu` | 100 | context menus, popovers, pickers |
| `--z-toast` | 200 | toasts, drop indicators |
| `--z-chrome` | 9000 | FAB, bottom nav, scroll-top |
| `--z-transient` | 9002 | connection/error dots, update pill |
| `--z-drag` | 9999 | drag ghosts (topmost, pointer-none) |

New layers must join this scale, not invent a number.

## Components

### Buttons
- **Shape:** `--radius-control` (4px), compact (`4px 12px`; `4px 8px` for meta rows).
- **Primary:** Signal Cyan bg + Console Ink text — sparing (view jumps, undo, save).
- **Ghost:** Well bg, hairline border, Body Text; hover brightens border and tints
  `color-mix(var(--accent) 10%)`.
- **Hover / Focus:** 150ms `--ease-console`; focus = 2px accent ring, offset 1px;
  active tints `color-mix(var(--accent) 15%)` and presses on pointer-down.

### Chips / Badges
- 100px pill, `--font-mono` label, status text on `color-mix(var(--status) 12%)`.
- Status chips carry dot + count; XP/level chip uses accent tint 15%; unread badge
  is a signal disc with ink 9px numerals.

### Cards / Containers (project nodes)
- `--radius-container` (6px), Panel bg. Selected = 2px accent ring; hover =
  hairline → `--hover-border` + Hover lift. No resting shadow.
- **Signature anatomy (unchanged):** 4px status rail → drag handle → title row with
  due/recur chips → nested subtask rows (Well bg, own rails, indent) → footer meta.
  Drop targets swap to ±4px accent edge lines.

### Panels / Overlays
- **One recipe** for all of `.pf-options-panel` / `.pf-activity-panel` /
  `.pf-category-popover` / `.pf-comment-panel` / `.pf-shortcuts-panel` (**F11**):
  Panel bg, hairline border, `--radius-overlay`, Carried-weight shadow, 16px pad,
  700 Sans heading at `--fs-display`. No per-panel drift.

### Inputs / Fields
- Well bg, 1px hairline, `--radius-control`, compact padding. Focus shifts border to
  accent (no glow). Date inputs keep native dark scheme. Errors are inline Alert text.

### Navigation
- **Desktop:** toolbar of icon buttons, mono tooltips; active view = accent tint.
- **Mobile:** fixed bottom bar, 5 items, icon over mono caption; active = accent +
  `color-mix(accent 15%)`. Options slides in as a right drawer with mono section labels.

### Signature Component: The Status Rail
Every project and subtask keeps its 4–7px left rail encoding pipeline state
(Standby → Amber → Phosphor → Violet), echoed by list borders, calendar dots, and
filter chips. New work-item components must include the rail.

## Motion

**Personality: mechanical.** Fast, precise, interruptible — a console responding,
not easing. One curve plus springs.

- **Easing:** `--ease-console: cubic-bezier(0.16, 1, 0.3, 1)` for state/appear.
- **Durations:** press 100ms · state 150ms · surface/overlay 200ms · **max 300ms**.
- **Springs** (gesture/drag/sheet): critically damped `damping 1.0`, `response 0.3`
  by default; add bounce (`damping 0.8`) **only** on momentum release (flick/throw).
- **Response:** press feedback on pointer-down; drags track 1:1 with grab offset.
- **Interruptible:** transitions/springs that retarget from the current value —
  no keyframe entrances for user-triggered motion (**F17**). Keyframes reserved for
  infinite/status indicators (blink, pulse).
- **Asymmetry:** deliberate actions animate slower; system responses snap.
- **Origin:** popovers/menus scale from their trigger (`transform-origin`), never center.

### Named Rules
**The Reduced-Motion Rule (new, mandatory).** `prefers-reduced-motion: reduce`
replaces movement with short opacity cross-fades; springs and slides collapse;
status changes keep color/opacity. Closes **F1**.

**The Hover-Gate Rule (new).** All `:hover` motion sits behind
`@media (hover: hover) and (pointer: fine)`. Closes **F2**.

## Presets

Five console variants replace the ten (**F6**); each recolors tokens only:

| Preset | Accent | Character |
|---|---|---|
| **Midnight Cyan** (default) | `#2fd4ff` | the base console |
| **Amber CRT** | `#ffb454` | warm phosphor terminal |
| **Phosphor Green** | `#3ddc97` | monochrome-green scope |
| **Monochrome** | `#c9d1d9` | grayscale, signal = light |
| **Daylight** | light base | the one light console |

Each preset's `--accent-contrast` is verified against `--accent` at AA (White-Pair
runtime check retained). `pf-theme-light` / eye-care class variants are folded into
Daylight where applicable.

## Accessibility

- AA minimum: every token pairing verified in dark **and** Daylight; the two known
  failures (**F3** danger text, **F4** light accent text) are resolved by the values
  above and re-checked in 3D.
- Visible focus ring on all interactive elements (2px accent, offset) — 13/90
  coverage gaps closed in 3D.
- Reduced-motion (**F1**) and hover-gating (**F2**) mandatory.
- Skip-link, ARIA roles, and touch-target floor (≥32px, 40px where practical) retained.

## Do's and Don'ts

### Do:
- **Do** take every color from `#pf-root` tokens; presets recolor only tokens.
- **Do** pair `--accent` backgrounds with `--accent-contrast`; build tints with `color-mix`.
- **Do** set all numbers in `--font-mono` with `tabular-nums`.
- **Do** use the spacing, radius, z-index, and type scales — no off-scale values.
- **Do** keep interactions ≤300ms, gated by reduced-motion and hover-gate.
- **Do** verify both shells (mobile bottom-nav + desktop split) and ≥1 preset.

### Don't:
- **Don't** hardcode palette RGB/hexes inline — consume the token.
- **Don't** put white text on an accent background, or `#fff` on success surfaces.
- **Don't** add resting shadows (Flat-At-Rest).
- **Don't** use status colors decoratively or invent a sixth status.
- **Don't** re-introduce half-pixel font sizes or `z-index` literals outside the scale.
- **Don't** break the single-file constraint, offline-first behavior, the nested-task
  engine, or mobile/desktop parity for a visual gain.

## Migration Notes (from `REDESIGN-FINDINGS.md`)

- **3A** swaps the token block + type + presets; update `tests/design-tokens.test.mjs`
  `GUARDED_HEX` to guard both the retired and the new palettes.
- **3B** peels the 281 inline `style=""` / 311 `.style` assignments into classes while
  unifying the Panel/Pill/Card recipes (**F7/F11/F13**).
- **3C** applies the spacing/radius/z scales and retires resting shadows.
- **3D** closes F1/F2/F3/F4 and focus coverage.
- **3E** adopts the motion vocabulary and resolves F5/F17; `review-animations` verdict required.
- **3F** re-runs the mechanical detector and refreshes this file if it drifts.
