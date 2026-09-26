---
name: iTala Connect
description: Basketball tournament and league scheduler. Two scoped worlds - public event pages are painted in the organiser's own colours (Painted Lines); platform screens run as the iTala network's on-air package (Broadcast Package).
colors:
  # Event pages (Painted Lines): default event theme, replaced per event through --ev-*
  ev-accent: "#FFCC00"
  ev-on-accent: "#000000"
  ev-bg: "#0D0D0D"
  ev-text: "#E0E0E0"
  ev-muted: "#888888"
  ev-heading: "#FFFFFF"
  rule: "color-mix(in srgb, #888888 38%, #0D0D0D)"
  floor-tint: "color-mix(in srgb, #FFCC00 5%, #0D0D0D)"
  paint-band: "color-mix(in srgb, #FFCC00 13%, #0D0D0D)"
  paint-faded: "color-mix(in srgb, #FFCC00 55%, #0D0D0D)"
  # Platform screens (Broadcast Package): fixed iTala values, exposed as --brand-*
  platform-ground: "#0B0F18"
  platform-plate: "#172033"
  platform-plate-raised: "#1F2A40"
  platform-seam: "#243049"
  platform-ink: "#F4F8FF"
  platform-muted: "#8B95B5"
  platform-teal: "#12D7D0"
  platform-on-teal: "#0B0F18"
  platform-lime: "#C7F000"
  platform-on-lime: "#0B0F18"
  platform-danger: "#FF7A7A"
  platform-lime-hover: "#D8FF3A"
  platform-teal-hover: "#45E6E0"
  platform-raised-hover: "#2A3752"
typography:
  # Event pages (Painted Lines)
  display:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 9vw, 5rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.005em"
  score:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "min(15cqi, 5.5rem)"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.01em"
  court-name:
    fontFamily: "Big Shoulders Stencil, Big Shoulders, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.04em"
  title:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "0.03em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  team-name:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.25
  label:
    fontFamily: "Big Shoulders, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.05em"
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.02em"
  # Platform screens (Broadcast Package): Saira variable, width axis via font-stretch
  platform-plate-title:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 6vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 78"
  platform-heading:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    fontVariation: "'wdth' 80"
  platform-wordmark:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  platform-bug-name:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 85"
  platform-date:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
    fontVariation: "'wdth' 75"
  platform-button:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 800
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 85"
  platform-nav:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 80"
  platform-strip:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 85"
  platform-label:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 80"
  platform-status:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 80"
  platform-body:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  platform-meta:
    fontFamily: "Saira, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  paint: "2px"
  dot: "50%"
  platform-square: "0"
spacing:
  # Event pages
  line: "2px"
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "2rem"
  xl: "2.5rem"
  xxl: "3rem"
  gutter-phone: "1rem"
  gutter-wide: "2rem"
  measure: "85rem"
  touch: "2.75rem"
  # Platform screens
  platform-cut: "0.9rem"
  platform-panel-cut: "1.25rem"
  platform-measure: "76rem"
  platform-bar: "3.75rem"
  platform-row-gap: "0.375rem"
  platform-section: "2rem"
  platform-column-gap: "2.5rem"
  platform-date-block: "4.75rem"
  platform-field: "3rem"
  platform-action-gap: "0.75rem"
  platform-calendar: "24rem"
components:
  # Event pages
  tab:
    textColor: "{colors.ev-muted}"
    typography: "{typography.title}"
    height: "2.75rem"
    padding: "0 0.875rem"
  tab-active:
    textColor: "{colors.ev-heading}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ev-text}"
    rounded: "{rounded.paint}"
    height: "2.75rem"
    padding: "0 0.875rem"
  finder-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ev-heading}"
    rounded: "{rounded.paint}"
    height: "3rem"
    padding: "0 1rem"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.ev-text}"
    height: "2.75rem"
    padding: "0"
  grid-cell:
    backgroundColor: "{colors.ev-bg}"
    textColor: "{colors.ev-text}"
    rounded: "{rounded.paint}"
    padding: "0.5rem 0.625rem 0.75rem"
  grid-cell-on-court:
    backgroundColor: "{colors.paint-band}"
  status-tag-on-court:
    backgroundColor: "{colors.ev-accent}"
    textColor: "{colors.ev-on-accent}"
    padding: "0 0.375rem"
  score-input:
    backgroundColor: "{colors.ev-bg}"
    textColor: "{colors.ev-heading}"
    rounded: "{rounded.paint}"
    width: "3.75rem"
    height: "2.75rem"
    padding: "0 0.375rem"
  # Platform screens
  platform-button-live:
    backgroundColor: "{colors.platform-lime}"
    textColor: "{colors.platform-on-lime}"
    typography: "{typography.platform-button}"
    rounded: "{rounded.platform-square}"
    height: "2.75rem"
    padding: "0 1.9rem 0 1rem"
  platform-button-live-hover:
    backgroundColor: "{colors.platform-lime-hover}"
  platform-button-teal:
    backgroundColor: "{colors.platform-teal}"
    textColor: "{colors.platform-on-teal}"
    typography: "{typography.platform-button}"
    rounded: "{rounded.platform-square}"
    height: "2.75rem"
    padding: "0 1.9rem 0 1rem"
  platform-button-teal-hover:
    backgroundColor: "{colors.platform-teal-hover}"
  platform-button-quiet:
    backgroundColor: "{colors.platform-plate-raised}"
    textColor: "{colors.platform-ink}"
    typography: "{typography.platform-button}"
    rounded: "{rounded.platform-square}"
    height: "2.75rem"
    padding: "0 1.9rem 0 1rem"
  platform-button-quiet-hover:
    backgroundColor: "{colors.platform-raised-hover}"
  platform-title-plate:
    backgroundColor: "{colors.platform-plate}"
    textColor: "{colors.platform-ink}"
    typography: "{typography.platform-plate-title}"
    padding: "0.5rem 2.15rem 0.5rem 1rem"
  platform-title-strip:
    backgroundColor: "{colors.platform-plate-raised}"
    textColor: "{colors.platform-teal}"
    typography: "{typography.platform-strip}"
    padding: "0.25rem 1.775rem 0.25rem 0.875rem"
  platform-event-bug:
    backgroundColor: "{colors.platform-plate}"
    textColor: "{colors.platform-ink}"
    height: "4.5rem"
  platform-event-bug-hover:
    backgroundColor: "{colors.platform-plate-raised}"
  platform-date-block:
    backgroundColor: "{colors.platform-plate-raised}"
    textColor: "{colors.platform-ink}"
    typography: "{typography.platform-date}"
    width: "4.75rem"
  platform-date-block-hover:
    backgroundColor: "{colors.platform-teal}"
    textColor: "{colors.platform-on-teal}"
  platform-status-on-now:
    backgroundColor: "{colors.platform-lime}"
    textColor: "{colors.platform-on-lime}"
    typography: "{typography.platform-status}"
    padding: "0.25rem 0.625rem"
  platform-status-upcoming:
    backgroundColor: "transparent"
    textColor: "{colors.platform-teal}"
    typography: "{typography.platform-status}"
    padding: "0.25rem 0.625rem"
  platform-status-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.platform-muted}"
    typography: "{typography.platform-status}"
    padding: "0.25rem 0.625rem"
  platform-nav-link:
    textColor: "{colors.platform-muted}"
    typography: "{typography.platform-nav}"
    height: "2.75rem"
    padding: "0 0.75rem"
  platform-nav-link-active:
    textColor: "{colors.platform-ink}"
  platform-input:
    backgroundColor: "{colors.platform-ground}"
    textColor: "{colors.platform-ink}"
    rounded: "{rounded.platform-square}"
    height: "3rem"
    padding: "0 0.875rem"
  platform-panel:
    backgroundColor: "{colors.platform-plate}"
    textColor: "{colors.platform-ink}"
    padding: "1.5rem 1.5rem 1.75rem"
  # Platform admin workspace (Phase 3b)
  platform-danger-action:
    backgroundColor: "transparent"
    textColor: "{colors.platform-danger}"
    height: "2.75rem"
    padding: "0.5rem 0.75rem"
  platform-dialog:
    backgroundColor: "{colors.platform-plate}"
    textColor: "{colors.platform-ink}"
    rounded: "{rounded.platform-square}"
    width: "42rem"
    padding: "1.5rem"
  platform-calendar-day:
    backgroundColor: "transparent"
    textColor: "{colors.platform-ink}"
    height: "2.75rem"
  platform-calendar-day-hover:
    backgroundColor: "{colors.platform-plate-raised}"
  platform-calendar-day-selected:
    backgroundColor: "{colors.platform-teal}"
    textColor: "{colors.platform-on-teal}"
  platform-date-chip:
    backgroundColor: "transparent"
    textColor: "{colors.platform-ink}"
    rounded: "{rounded.platform-square}"
    height: "2.75rem"
    padding: "0.5rem"
  platform-workspace-notice:
    backgroundColor: "transparent"
    textColor: "{colors.platform-ink}"
    padding: "1rem"
---

# Design System: iTala Connect

## Overview

iTala Connect has **two scoped visual worlds**. Each owns its routes, its tokens and its fonts, and the two never mix.

| World | Where | Tokens | Fonts |
| --- | --- | --- | --- |
| **Painted Lines** | Public event pages, a published event at `/events/[eventId]` and its tabs | Organiser colours only: `--ev-*`, `--div`, `--on-div` (frontmatter keys without a `platform-` prefix) | Big Shoulders, Big Shoulders Stencil, Archivo (`src/app/event-fonts.ts`) |
| **Broadcast Package** | Platform screens: Home `/`, Sign in `/login`, the admin shell `/admin` (Dashboard, Settings, Admins), and the 404 pages | iTala colours: `--brand-*` in `src/app/globals.css` (frontmatter keys prefixed `platform-`) | Saira with its width axis (`src/app/platform-fonts.ts`) |

**The Two Worlds Rule.** Brand tokens never apply inside an event page. The only iTala element on an event page is the small "Powered by iTala Connect" footer, and even that is painted in the event's own tokens (Muted Ink over a Quiet Rule), never in `--brand-*`. Event tokens never appear on a platform screen. When `/events/[eventId]` has no published event to show, the route renders the platform "Event not found" screen: there is no organiser palette to paint, so it is a platform screen, not an event page.

Prototype routes (`src/app/prototype/**`) and their lime sample-data banner are review chrome and belong to neither world.

### Decision history
- **25/09/2026:** Painted Lines documented for public event pages. Platform screens were left undecided, with `--brand-*` as Phase 1 placeholders.
- **26/09/2026:** the user chose **Broadcast Package** (candidate 1 of 7, seed a20866ff) over the rolled Season Program Guide for the platform screens. Direction contract: `.impeccable/surfaces/src-app-public-page-tsx.md`. Finish review verdict: ship.
- **26/09/2026:** the iTala mobile app's colour-role rule was declared **not binding** on iTala Connect. The platform sets its own colour law instead: **teal is identity and plate edges; lime means only LIVE pips and the one primary action on a screen.**
- **26/09/2026:** the logo mark `public/brand/itala-mark.png` is the mobile app's `favicon.png` (196 by 196) copied unchanged. It is the iTala mark on its own ground, `#0B0F18`, which equals the platform ground, so the mark sits on the page seamlessly. Its provenance is embedded in the file's PNG text metadata. It is not a transparent cut-out; do not describe or treat it as one.
- **26/09/2026:** the Phase 3b admin workspace (league import, event editor, new event, dashboard event actions) was recorded as an ordinary extension of Broadcast Package: action rows, the danger text action, the confirmation dialog, the players dialog, the multi-date calendar picker, editor collapsible sections and workspace notices. Finish review disposition: ship, after action-row targets reached 2.75rem and the unsaved-changes guard moved to the confirmation dialog.

### Event pages: Painted Lines

**Creative North Star: "Painted Lines"**

The public event page is the organiser's gym floor. The organiser's background colour is the floor, and their accent colour is the line paint. Every structure on the page is a flat painted line at court weight (2 px), and each court is drawn as a real court (FIBA proportions, centre line, centre circle, keys filled with a division-colour tint) carrying its live game: team names on each half, big score numerals, the court number stencilled above it. Space separates sections, not boxes. There is no glow, no gradient, no shadow and no wood-grain costume.

Inside an event page every colour comes from the organiser's five event colours (`--ev-accent`, `--ev-bg`, `--ev-text`, `--ev-muted`, `--ev-heading`), the derived `--ev-on-accent`, and per-element division colours (`--div`, `--on-div`). The hex values in the frontmatter's event keys are the **default event theme** a new event starts with, not a brand palette; another organiser's page will carry completely different values through the same tokens, including light floors (see `.impeccable/review/mobile-light-4courts.png` and `desktop-light-owner.png`).

The page is dense but calm: answer first (time, court, teams, score), readable at a glance in a bright gym on a mid-range phone, working from 360 px wide with 44 px touch targets. Copy is NZ English, dates DD/MM/YYYY ("Fri 25/09/2026"), times "7:00 pm", in the event's time zone.

**Key Characteristics:**
- Organiser colours only, applied as paint on the organiser's floor.
- Constant 2 px paint lines; quiet 1 px rules for secondary separation.
- State carried by stroke and by words: solid is on court, dashed is up next, a closed baseline tick is final.
- Tall condensed athletic lettering (Big Shoulders) for numerals and headings, stencil cut for court numbers, Archivo for names and body.
- One moving mark (the "now" line) plus a brief paint-in when a score changes.

### Platform screens: Broadcast Package

**Platform North Star: "Broadcast Package"**

The platform is the iTala network's on-air graphics package. Home runs the season like a broadcast rundown, and admin is the production truck behind it. Every page opens with a lower-third title plate that wipes in once; events and admin rows are bug plates on a navy-black network ground, each cut on a single diagonal at its right end. Depth is three tonal steps of navy separated by hairline seams, never shadow, glow, gradient or glass. It deliberately is not a white-card SaaS dashboard with a left sidebar.

Colour is rationed. Teal is the network's identity: the key block ahead of each title plate, the top edge of every date block, the current nav underline, focus, and secondary actions. Lime is air time: it marks an event that is on now, with a pulsing pip, and the one primary action on a screen. Everything else is ink and muted ink on navy.

Copy is NZ English, dates DD/MM/YYYY, and "iTala" keeps its own casing even inside capitalised plates.

**Key Characteristics:**
- Network ground `platform-ground`, plates on two navy steps, 1 px seams.
- Angled plates with one diagonal cut on the right end; panels cut on the bottom-right corner; no rounded corners.
- Teal is identity and plate edges; lime is only LIVE and the one primary action.
- Saira throughout: condensed caps (width 75% to 85%) on plates, normal width for reading, tabular figures everywhere.
- One signature motion (the title plate wipe) and one repeating motion (the LIVE pip).

## Colors

### Event pages: palette character
The palette is whatever the organiser chose; the system defines roles and the derived mixes, never fixed hues.

#### Primary
- **Line Paint** (`--ev-accent`, default Court Yellow, see `ev-accent`): court lines, the active tab and day over-paint, the "your team" underline, the on-court dot, the now line and its tag, the final baseline tick, focus outlines, text selection. Also exposed locally as `--paint`.
- **Paint Contrast** (`--ev-on-accent`, see `ev-on-accent`): text sitting on solid paint (the on-court status tag, the now tag, selected text). Computed by `readableOn()` as black or white, whichever has the higher WCAG contrast against the accent; never chosen by hand.

#### Neutral
- **Floor** (`--ev-bg`, default Night Floor): the page ground and the fill of every grid cell and input.
- **Body Ink** (`--ev-text`, default Chalk Grey): body copy, team names in cells, chip labels.
- **Muted Ink** (`--ev-muted`, default Bench Grey): dates, statuses, legends, grid hours, station terms, filtered-out games, the "Powered by iTala Connect" footer.
- **Heading Ink** (`--ev-heading`, default White): event name, section titles, court names, team names on the court, score numerals, times in stations.

#### Derived paint (computed from the live tokens with `color-mix` in sRGB)
- **Quiet Rule** (`rule`, `--ev-muted` 38% into `--ev-bg`): 1 px station and grid-hour rules, the tab sideline, the footer rule, final and awaiting-score cell borders, filtered-out cells.
- **Floor Tint** (`floor-tint`, `--ev-accent` 5% into `--ev-bg`): the court's playing surface and the lettering patches that stop lines crossing names and scores.
- **Paint Band** (`paint-band`, `--ev-accent` 13% into `--ev-bg`): the hour in progress across the day grid, and the fill of on-court cells.
- **Faded Paint** (`paint-faded`, `--ev-accent` 55% into `--ev-bg`): dashed up-next cell borders, court lines once a court is final or empty, the scrollbar thumb.
- **Filter Tint** (`--ev-accent` 9% into `--ev-bg`): fill of cells matching the chosen team.

#### Division colours
Each division carries an organiser-chosen `--div` with a computed `--on-div`, set per element by `divisionVars()`. Used for the court keys (`--div` 34% into `--ev-bg`), square swatches beside division names, chip borders (`--div` 70% into `--ev-bg`), chip hover (16%) and the selected chip fill (solid `--div` with `--on-div` text). Semis and finals use Line Paint as their swatch. An invalid colour falls back to the default accent.

#### Named Rules
**The Organiser's Paint Rule.** Inside an event page every colour is an `--ev-*` token, a division token, or a `color-mix` of them. No hex literals, no Tailwind colour utilities, and no `--brand-*` token ever applies there.

**The Never Colour Alone Rule.** Every state that has a colour also has words and a stroke pattern ("On court", "Final", "Awaiting score", "Up next"). A division is named next to its swatch. An organiser palette with poor contrast must still read.

### Platform screens: palette character
A fixed night-broadcast palette from the iTala logo: navy grounds, one teal identity colour, one lime signal colour. Every value is a `--brand-*` custom property on `:root` (also mapped to Tailwind as `brand-*` colours); the frontmatter's `platform-*` keys carry the same values.

#### Primary
- **Network Teal** (`platform-teal`, `--brand-accent`, also `--brand-focus`): identity and plate edges. The key block ahead of each title plate, the heading key and fact ticks on the organiser plate, the 3 px top edge of every date block (and its full fill on hover and focus), the current nav underline, the "Connect" in the wordmark, the title plate's sub-strip text, Upcoming and Published status outlines, secondary buttons ("Organiser sign in"), the focus ring, caret, form accent and text selection.
- **On Teal** (`platform-on-teal`, `--brand-accent-text`): text on a solid teal fill (teal buttons, a lit date block, selected text).

#### Secondary
- **Air Lime** (`platform-lime`, `--brand-live`): only two uses. The "On now" status bug with its LIVE pip, and the one primary action on a screen ("Sign in" on the sign-in form, "See published events" on the 404 pages).
- **On Lime** (`platform-on-lime`, `--brand-live-text`): text and the pip on solid lime.

#### Neutral
- **Network Ground** (`platform-ground`, `--brand-bg`): the page, the sticky network bar, input fills, the tile behind event logos. Equal to the ground of the iTala mark.
- **Bug Plate** (`platform-plate`, `--brand-surface`): title plates, event bugs, table rows, the organiser plate, the sign-in panel, placeholders and empty states.
- **Raised Plate** (`platform-plate-raised`, `--brand-raised`): date blocks, the title sub-strip, quiet buttons, notices, hovered event bugs.
- **Seam** (`platform-seam`, `--brand-border`): 1 px hairlines (network bar base, section label rules, status bug outlines, notices), resting input underline, scrollbar thumb.
- **Ink** (`platform-ink`, `--brand-text`): headings, event names, body copy, the signed-in name.
- **Muted Ink** (`platform-muted`, `--brand-muted`): nav links at rest, section labels, field labels, table headers, meta lines, ledes, Finished and Draft status bugs, the role after the signed-in name.
- **Alert Red** (`platform-danger`, `--brand-danger`): sign-in errors, invalid input underlines, the outline of load-error notices.

#### Hover steps
`platform-lime-hover`, `platform-teal-hover` and `platform-raised-hover` are the one lighter step each button fill takes on hover.

#### Named Rules
**The Teal Is Identity Rule.** Teal marks who is speaking: plate edges, keys, the current place, focus and secondary actions. It never signals live.

**The Lime Is Air Time Rule.** Lime means only a LIVE pip ("On now") and the one primary action on a screen. At most one lime button per screen; many screens (Home, Dashboard, Settings, Admins) have none. Lime is never a decoration, a heading colour or a hover.

**The Words Carry State Rule.** Every status bug says its state in words ("On now", "Upcoming", "Finished", "Dates TBC", "Published", "Draft", "Active", "Disabled"). Colour and the pip only reinforce them.

## Typography

### Event pages
**Display Font:** Big Shoulders (with system-ui, sans-serif)
**Stencil Font:** Big Shoulders Stencil (with Big Shoulders, system-ui)
**Body Font:** Archivo (with system-ui, sans-serif)

All three are self-hosted through `next/font` (`src/app/event-fonts.ts`) as `--font-ev-display`, `--font-ev-stencil` and `--font-ev-body`, so the CSP's `font-src 'self'` holds.

**Character:** Tall, condensed athletic signage for numbers and headings, like scoreboard and gym-wall lettering, against a plain, sturdy grotesque that keeps long team names legible at small sizes.

#### Hierarchy
- **Display** (800, clamp(2.5rem, 9vw, 5rem), 0.92, uppercase, balanced): the event name, once per page.
- **Score** (800, min(15cqi, 5.5rem), 1, tabular): the numerals on each half of a drawn court. Container-query sized so the court scales as one piece.
- **Court name** (stencil 800, 1.75rem, 0.04em, uppercase): "Court 1" above each drawn court; 1.125rem and 0.05em in the day grid header.
- **Headline** (800, 1.5rem, 1.1, 0.01em, uppercase): section titles such as "Tonight's games". The team-finder answer uses 2rem at line-height 1.
- **Title** (700, 1.125rem, 0.03em, uppercase): event tabs. The finder toggle uses 800 at 1.25rem.
- **Body** (Archivo 400, 1rem, 1.5): running text, empty states (1.0625rem, muted).
- **Team name** (Archivo 500, 0.9375rem, 1.25): grid cells and stations, hyphenating only when one word cannot fit; 700 with the paint underline for the spectator's team. On the drawn court, 700 at clamp(0.875rem, 4.3cqi, 1.3rem), centred and balanced.
- **Label** (Big Shoulders 700, 0.875rem, 0.05em, uppercase): station terms ("Final", "Up next").
- **Small** (Archivo 600, 0.8125rem): legends, grid hours, footer; cell labels and statuses at 0.75rem.

#### Named Rules
**The Tabular Numerals Rule.** Every score, time and date uses `font-variant-numeric: tabular-nums` so live changes never shift the layout.

**The Stencil Is For Courts Rule.** Big Shoulders Stencil marks court numbers only, like a floor stencil. It is never used for headings, scores or body.

### Platform screens
**Display and Body Font:** Saira (with system-ui, sans-serif), one self-hosted variable file loaded with its `wdth` axis through `next/font` as `--font-platform` (`src/app/platform-fonts.ts`). Platform routes only; never loaded on event pages.

**Character:** A squared, technical sans that reads like on-air lower-thirds when condensed and capitalised, and like a calm interface face at normal width. One family, two widths, set with `font-stretch`.

#### Hierarchy
- **Plate title** (800, width 78%, clamp(1.75rem, 6vw, 3rem), 1.05, 0.01em, uppercase, balanced): the page title inside the lower-third plate, one per page.
- **Heading** (800, width 80%, 1.5rem, 1.1, uppercase): headings inside panels, such as the organiser plate.
- **Wordmark** (800, normal width, 1.3125rem, -0.01em): "iTala" in the network bar; "Connect" beside it in teal at 700, width 75%, 0.9375rem, 0.08em, uppercase.
- **Bug name** (800, width 85%, 1.125rem, 1.15, 0.01em, uppercase, wraps anywhere): event names in the rundown and dashboard.
- **Date numeral** (800, width 75%, 1.375rem, 1, tabular): "11/09" in date blocks, with the year beneath at 600, 0.75rem, muted.
- **Button** (800, width 85%, 0.9375rem, 0.06em, uppercase).
- **Nav** (700, width 80%, 0.9375rem, 0.06em, uppercase): network bar links.
- **Strip** (700, width 85%, 0.875rem, 0.1em, uppercase, teal): the tagline or subtitle on the strip beneath a title plate.
- **Label** (700, width 80%, 0.8125rem, 0.1em, uppercase, muted): section labels (0.12em, with a seam rule running to the edge), field labels, table headers.
- **Status** (800, width 80%, 0.75rem, 0.1em, uppercase): status bugs and the "Not built yet" tag.
- **Body** (400, normal width, 1rem; ledes 1.55 and at most 62ch; organiser facts 1.45).
- **Meta** (400, 0.875rem, muted): the divisions and date range under an event name; the organiser plate's small print.

#### Named Rules
**The Two Widths Rule.** Condensed caps (width 75% to 85%) are for plates, names, labels, buttons and nav. Reading text (body, ledes, meta, inputs, notices) stays at normal width and sentence case.

**The Brand Casing Rule.** "iTala" keeps its own casing inside capitalised plates ("SIGN IN TO iTala CONNECT"); it is never set as "ITALA".

**The Platform Tabular Rule.** The platform body sets `font-variant-numeric: tabular-nums`, so every date and count lines up.

## Layout

### Event pages
A single centred column capped at 85rem, with a 1rem side gutter on phones and 2rem from 48rem up. The event name, tabs and content share that measure. Sections stack with space (2.5rem between main sections, 2rem between courts, 1.5rem above the layout), never inside cards.

- **Phones (below 40rem):** courts stack one per row; with three or more courts they become a horizontal snap rail at 88% width each so the page stays short. The day grid keeps two courts in view without sideways scroll (3.5rem hour gutter, 8.25rem minimum columns) and scrolls inside itself beyond that, never the page. Below 24rem cell padding and names tighten. The team finder collapses behind a full-width outlined toggle.
- **40rem and up:** courts sit side by side (auto-fit, minimum 20rem each).
- **68rem and up:** a 19rem sticky sidebar holds the team finder beside the main column (3rem gap).
- **Day grid:** time-proportional rows in 5-minute steps (an hour is 6.75rem tall), a sticky hour gutter, one column per court (minimum 10.5rem). Rows grow when names wrap, so nothing is cut off.
- **Touch:** every interactive element is at least 2.75rem (44 px) tall.

### Platform screens
A centred column capped at 76rem, with a 1rem gutter on phones and 2rem from 48rem up. A sticky network bar (at least 3.75rem, ground fill, 1 px seam beneath) holds the mark and wordmark, the section nav, and the signed-in admin with Sign out, or Sign in. Each page opens with its title plate (1.75rem above, 1.5rem below); sections follow at 2rem, and rows in a rundown or table are separate plates 0.375rem apart.

- **Home:** from 64rem, an 8 : 4 grid (side column at least 18rem, 2.5rem gap) with the rundown on the left and the organiser plate as a side column, both starting on the same top edge. Below 64rem the organiser plate follows the rundown.
- **Event bug row:** a 4.75rem date block, the name and meta, then the status bug. Below 30rem the date block narrows to 4.25rem and the status bug drops under the name.
- **Phones (below 40rem):** the network bar becomes a grid. Row 1 is the mark and the account control; row 2 is the nav as a horizontal strip that scrolls inside itself; row 3 is the signed-in name and role, never truncated. Signed out, the strip would only repeat the logo link, so it is hidden.
- **Admin tables:** scroll inside their own labelled region (minimum 32rem wide, 19rem on phones and for the dashboard rundown), never the page.
- **Forms and notices:** at most 26rem wide. Ledes at most 62ch; placeholders at most 44rem.
- **Touch:** buttons, nav links and the brand link are at least 2.75rem tall; inputs 3rem; event bugs 4.5rem.

## Elevation & Depth

### Event pages
Flat. There are no shadows anywhere in this world. Depth is expressed as paint on a floor: tonal tints of the accent mixed into the floor (Floor Tint, Paint Band) and stroke weight. Layering exists only where sticky or overlapping elements need an opaque floor behind them (the sticky hour gutter, lettering patches on the court).

#### Named Rules
**The Flat Paint Rule.** No box-shadow, no glow, no gradient, no texture. If something needs emphasis, give it heavier paint or a tint, not a lift.

**The Floor Patch Rule.** Lettering that sits on a drawn court sits on a patch of Floor Tint, so painted lines never cross a name or a score.

### Platform screens
Flat, with tonal stacking. Depth is three navy steps: Network Ground, then Bug Plate, then Raised Plate for the element that sits on a plate (date blocks, sub-strips, quiet buttons, notices) or for a hovered row. Hairline Seams separate the bar and label sections. There are no shadows, glows, gradients, blurs or glass. The sticky network bar is opaque ground so content passes under it cleanly. A modal dialog is a Bug Plate over a flat scrim of black at 75% opacity; the scrim dims, it never blurs, and the dialog takes no shadow.

#### Named Rules
**The Three Steps Rule.** Ground, plate, raised plate. A new surface takes the next step up from what it sits on; it never gets a shadow.

**The Own Ground Rule.** The iTala mark ships on its own `#0B0F18` ground and is placed directly on Network Ground, where the two are the same colour. Do not doctor the artwork, recolour it, or sit it on a plate where its ground would show as a square.

## Shapes

### Event pages
Lines, not surfaces. Structure is drawn with strokes at a constant weight: 2 px paint (`--line`) for court lines, tab and day over-paint, chip and toggle outlines, active cells and the now line; 1 px Quiet Rule for secondary separation. Heavier strokes are reserved: 3 px for the chosen team's cells and the focus outline, 4 px for the active tab and the final tick on grid cells, 6 px for the final baseline tick on a drawn court. Court SVG lines use non-scaling strokes so the weight holds at any size.

Corners are nearly square (2px) on every outlined element. Circles appear only where the court has them: the centre circle, the on-court dot, the feed mark. Swatches are hard squares. The drawn court keeps FIBA proportions (28 by 15).

#### Named Rules
**The Two Pixel Rule.** Paint is 2 px. Anything thicker is a deliberate state signal from the list above, never decoration.

**The Stroke Carries State Rule.** Solid paint is on court. Dashed paint (7 on, 5 off on the court; CSS dashed on cells) is up next. A closed baseline tick is final. Faded paint is a court that has finished or has no more games. Awaiting score is a quiet 1 px outline with no tick.

### Platform screens
Angled lower-third plates. Buttons, title plates, sub-strips and event bugs are square on three corners and cut on a single diagonal at the right end (`platform-cut`, drawn with `clip-path`). Larger panels (the organiser plate, the sign-in panel, placeholders) cut only the bottom-right corner (`platform-panel-cut`). The teal key ahead of a title plate repeats the same diagonal at a smaller scale (0.9rem wide with a 0.45rem cut; 0.6rem and 0.3rem as a heading key), and organiser facts are marked with a 0.75rem teal tick cut on the same slant. Corners are otherwise square; the only circle is the LIVE pip.

Borders are secondary: a 3 px teal top edge on date blocks, a 3 px teal underline on the current nav link, a 2 px underline on inputs, and 1 px seams on status bugs and notices.

#### Named Rules
**The One Cut Rule.** Every plate has exactly one diagonal, on the right end (or the bottom-right corner for panels). Never a left cut, a double cut, or a rounded corner.

**The Inside Focus Rule.** A clipped plate would cut off an outside focus ring, so focusable plates (event bugs) draw the 3 px teal ring inside (-3px offset).

## Components

### Event pages
Components are painted outlines on the floor: confident, legible from arm's length, and quiet until something is live.

#### Buttons
- **Outlined toggle** (the phone "Find your team" control): full width, 3rem tall, 2 px paint outline, 2px corners, transparent fill, heading-ink Big Shoulders 800 uppercase. A drawn chevron (two paint strokes, not a glyph) turns up over 200ms while open.
- **Text button** ("Change team" and similar): no box, body ink at 600, a 2 px paint underline offset 0.3em; heading ink on hover.
- There is no filled primary button on the public page.

#### Chips
- **Team chip:** 2.75rem tall, 2px corners, transparent fill, 2 px outline in the division colour (70% into the floor), Archivo 500.
- **Hover:** a 16% division tint fill.
- **Selected** (`aria-pressed`): solid division colour with `--on-div` text at 700.
- Chips are grouped by division under a legend with the division's square swatch.

#### Navigation
- **Event tabs:** Big Shoulders 700 uppercase in muted ink over a 2 px Quiet Rule sideline. Hover lifts to body ink; the current tab is heading ink with a 4 px paint over-paint on the sideline. Tabs live in the URL.
- **Day strip:** dates in muted small type with a 2 px transparent underline; the chosen day is heading ink with a 2 px paint underline. "Tonight" sits above today's date in paint-coloured Big Shoulders as part of the date label.

#### Inputs / Fields
- **Score input** (event owners only): 3.75rem wide, 2.75rem tall, 1 px muted outline, 2px corners, floor fill, right-aligned Big Shoulders 700 numerals.
- **Invalid:** outline switches to body ink and dashed, so the error does not rely on colour.
- **Focus:** the shared focus outline (3 px solid paint, 3 px offset).

#### Drawn court (signature)
The court panel: stencil court name on the left, status words on the right ("On court, started 7:00 pm" with a paint dot, or the next start time), then an SVG court with Floor Tint surface, paint lines and division-tinted keys. Team names sit near the top of each half, big score numerals between the key and the half-court line, and the spectator's team is underlined in 3 px paint. The centre circle carries a paint dot while on court, and the start time while the court waits. Below the baseline, stations list Final (or Awaiting score), Up next or Then as term and game rows on 1 px rules.

#### Day grid cell
An outlined game on the time grid: floor fill, 2px corners, division swatch and label, then two team rows with Big Shoulders numerals. Up next is dashed Faded Paint; on court is solid paint over Paint Band with an "On court" tag in solid paint; final and awaiting score are 1 px Quiet Rule, and final adds a 2.25rem, 4 px paint tick at the bottom left. With a team filter, matching cells take 3 px paint in their own pattern and the rest fall back to Quiet Rule and muted ink.

#### Now line
The one moving mark: a 2 px paint line across the day grid at the current time, running under the cells, with a solid paint tag in the hour gutter showing "Now" and the time. It eases to its new position over 900ms. The hour in progress is banded in Paint Band.

#### Footer
"Powered by iTala Connect" in Muted Ink at 0.8125rem over a 1 px Quiet Rule, at the page measure. It is the only iTala element on an event page and uses event tokens only.

#### Motion
One easing, `cubic-bezier(0.16, 1, 0.3, 1)`. Colour transitions 160ms, chevron 200ms, score paint-in 520ms (clips up from the floor), now line 900ms. All of it is off under `prefers-reduced-motion`.

### Platform screens
Components are broadcast graphics: cut plates on navy, capitalised and condensed, quiet until something is on air.

#### Buttons
- **Shape:** an angled plate, 2.75rem tall, square corners, one right-end diagonal cut; padding 1rem on the left and 1rem plus the cut on the right. Saira 800, width 85%, uppercase, no wrap.
- **Live (primary):** Air Lime with On Lime text; hover steps to `platform-lime-hover`. The one primary action on a screen ("Sign in", "See published events"). Shows "Signing in..." and 70% opacity with a progress cursor while pending.
- **Teal (secondary):** Network Teal with On Teal text; hover steps to `platform-teal-hover`. Used for "Organiser sign in" on the organiser plate.
- **Quiet:** Raised Plate with Ink text; hover steps to `platform-raised-hover`. Network bar account actions ("Sign in", "Sign out").
- **Focus:** the global 3 px teal outline at 2px offset. Colour transitions 150ms on the platform easing.

#### Status bugs (chips)
- **Style:** a small square-cornered bug, 1 px Seam outline, Muted Ink, Saira 800 width 80% at 0.75rem, 0.1em, uppercase.
- **On now:** solid Air Lime fill and outline, On Lime text, preceded by the LIVE pip (a 0.5rem circle in the text colour, pulsing to 35% opacity over 1.6s).
- **Upcoming / Published / Active:** transparent with a teal outline and teal text.
- **Finished / Draft / Disabled:** the quiet default. Undated events show no bug; their date block already says TBC.

#### Cards / Containers
- **Panels** (organiser plate, sign-in form, placeholders): Bug Plate fill, square corners with the bottom-right corner cut 1.25rem, padding 1.5rem (1.75rem at the base), 1rem to 1.25rem internal gap. No border, no shadow.
- **Empty state:** a plain Bug Plate strip with muted body text (1.25rem by 1rem padding).
- **Notice:** Raised Plate with a 1 px Seam, Ink text at 0.9375rem, at most 26rem wide. Load errors use a transparent fill with a 1 px Alert Red outline and Ink text.

#### Inputs / Fields
- **Style:** 3rem tall, Network Ground fill, no box, a 2 px Seam underline; label above in the muted Label style.
- **Hover:** the underline lifts to Muted Ink.
- **Focus:** a 2 px teal outline at 0 offset plus a teal underline.
- **Error:** the underline turns Alert Red, `aria-invalid` is set, and the message appears in Alert Red at 600 in a live region that takes no space while empty.

#### Navigation
- **Network bar:** sticky, Network Ground with a 1 px Seam beneath. The iTala mark (40 by 40) and wordmark link home; nav links follow (Events for everyone, then Dashboard, Settings and Admins by role); the signed-in name and role, or Sign in, sit at the far end.
- **Nav link:** Saira 700 width 80%, uppercase, Muted Ink, 2.75rem tall with a transparent 3 px underline. Hover lifts to Ink; the current page (`aria-current`) is Ink with a teal underline.
- **Phones:** see Layout; the nav becomes a strip that scrolls inside itself.

#### Title plate (signature)
The lower-third that opens every platform page: a teal key block, then the page title on a Bug Plate in condensed caps, each cut on the right-end diagonal; beneath it, indented to clear the key, a Raised Plate sub-strip carrying the tagline or subtitle in teal ("Record. Track. Elevate.", "Organisers only. Fans never need an account."). The title is the page's `h1`. The plate wipes in once on load, left to right over 420ms as a clip reveal, and the sub-strip follows 120ms later; then both hold.

#### Event bug row
The rundown row for an event on Home (a link to the event page) and the Dashboard (table semantics, bug looks): a Raised Plate date block with a 3 px teal top edge ("11/09" over "/2026", or "TBC"), the event's logo on a ground tile when it has one, the name in condensed caps with the divisions and date range beneath in Meta, then the status bug. The row is a Bug Plate cut on the right end. On hover and focus the row steps to Raised Plate and the date block lights solid teal with On Teal text.

#### Tables
Admin tables keep real table semantics inside a scrollable, labelled region. Headers use the muted Label style; each row's cells are Bug Plate strips separated by 0.375rem of ground, first column at 700.

#### Action rows
The admin workspace groups the actions for a form, a team, a division or a dialog in one row: a wrapping flex row, vertically centred, 0.75rem apart (`platform-action-gap`), 1rem above and 1.5rem below. Every link and button in a row is at least 2.75rem tall and wraps its label rather than truncating, so a long action never forces sideways scroll at 360 px. The row leads with its filled plate (lime only when it is the screen's one primary action, such as "Save draft" or "Create event"; teal for a retry or a dialog's go-ahead; quiet for add, open and month actions), followed by any danger text action. When a league being imported is already linked, lime moves to "Open existing event" and "Create anyway" drops to quiet, so the one primary action is always the safe one.

#### Danger text action
Destructive actions outside a dialog ("Delete", "Remove team", "Remove division", "Remove" on a player row) are text, not plates: Alert Red, underlined with a 0.2em offset, 0.5rem by 0.75rem padding, at least 2.75rem tall. Each carries its target in screen-reader text ("Delete Harbour League"). Deleting an event, or removing a team or division, asks through the confirmation dialog first; editor removals only land when the draft is saved.

**The Red Is Words Rule.** A destructive action outside a dialog is Alert Red underlined text, never a filled plate.

#### Confirmation dialog
A native modal `dialog`, labelled by its title: Bug Plate fill, a 1 px teal edge, square corners, 1.5rem padding, at most 42rem wide (never wider than the viewport less 2rem), at most 85dvh tall with its own scroll. The title is a 1.5rem heading written as the question ("Discard unsaved changes?", "Remove Harbour Hawks?"); the message states the consequence in body text ("This can't be undone."). The action row puts **Cancel** first as a quiet plate that takes focus, then the go-ahead as a teal plate named for the act ("Delete event", "Continue"). While the action runs both buttons are disabled, the go-ahead reads "Please wait…" and Escape does nothing; otherwise Escape is Cancel. Closing any admin dialog, whichever way, gives focus back to the control that opened it (the shared `useModal`); when the confirmed action removed that control (Remove team, Remove division), focus goes to the first control of the nearest part of the page still there. The control a dialog starts on is marked `data-autofocus`. A go-ahead that was disabled while it ran gets focus back when the action is refused.

The same dialog is the unsaved-changes guard in the event editor: in-app links, Sign out and browser Back all ask "Discard unsaved changes?" before edits are lost, and reload or closing the tab falls back to the browser's own prompt. Forms that stay on the page (the editor itself, the players dialog) opt out with `data-keeps-page`.

**The Safe Choice First Rule.** In a confirmation dialog Cancel comes first and takes focus; the go-ahead is teal and names the act. A confirm is never lime.

#### Players dialog
The same dialog frame, titled "Players · [team]". Each player is a row of a Number field (4.5rem) and a Player name field in the platform field style, with a danger "Remove" text action at the row end; below 40rem the number narrows to 4rem and Remove drops beneath the name, aligned right. The action row holds "Add player" (quiet) and "Done" (teal). The first name field takes focus; edits apply to the draft on Done and are discarded on Cancel or Escape.

#### Multi-date calendar picker
Event dates are chosen on a month calendar at most 24rem wide (`platform-calendar`), headed "Event dates (n selected)". Previous and Next are quiet plates either side of the month name, which is announced politely as it changes. Weekday initials sit above a seven-column grid of day buttons: 2.75rem tall, tabular numerals, transparent at rest, Raised Plate on hover, and solid teal with On Teal text when chosen (`aria-pressed`), each labelled with its full DD/MM/YYYY date. Arrow keys move focus by a day or a week. Each chosen date is repeated below as a square chip (1 px Seam outline, 2.75rem tall, "02/10/2026 · Remove") that removes it, so the selection can be read and changed without the grid.

#### Editor collapsible sections
The event editor is a stack of native disclosure sections ("Event details", "Divisions (n)"). Each opens under a 1 px Seam rule with 1.5rem above and 1.25rem of padding; its summary is a 1.5rem condensed heading at least 2.75rem tall. Division sections nest inside with the same rule, and each team sits above a 1 px Seam line with 1rem of padding. Sections start open, each section's open state is remembered for the browser session, and "Expand all" and "Collapse all" sit in the editor's action row.

#### Workspace notices
Inside the admin workspace a notice is a 1 px teal outline with no fill, 1rem padding and Ink body text that wraps anywhere, running the width of its form. It carries status after an action ("Saved", announced as a status), a league link ("Linked to iTala mobile: Harbour League (2026)"), the read-only note on a published event, the event-colour contrast warning, and pending image clean-up with its own action row. Load failures keep the Alert Red outline.

#### Rules editor
The Rules section (E-70) holds the old toolbar and nothing more: **Bold**, **Italic**, **Underline**, **Heading 2**, **Heading 3**, **Bullet list** and **Numbered list**.
- **Toolbar:** a labelled toolbar ("Rules formatting") of toggle buttons (`aria-pressed`), 2.75rem tall, on Raised Plate. A pressed tool is solid teal with On Teal text, and stays teal on hover (the teal hover step). The toolbar is one tab stop: arrow keys, Home and End move between the tools, and Tab returns to the last one used. Clicking a tool with the mouse leaves the cursor in the text, so the next key types there. Bold, Italic and Underline also answer Control+B, I and U (Command on a Mac).
- **Writing area:** a multi-line text box labelled "Event rules" (clicking the label puts the cursor in it), on Network Ground with a 1 px Seam, at least 12rem tall. Focus draws the 2 px teal outline. A numbered list keeps its starting number ("3. " starts at 3) on the event page too.
- **Saving:** rules save with the rest of the event (Save or Save draft), cleaned to the allow-list on the way in and again on the event page (E-71). Rules with no text are stored as none, so the page says "No rules."
- Tiptap's own style injection is off (CSP), so its few layout rules live in the workspace stylesheet.

#### Event images
The Images section (E-15 to E-18) comes before Rules.
- **Slots:** **Event logo** and **Major sponsor** each have a preview (on Raised Plate, so transparent logos show), **Upload** or **Replace** (a quiet plate that opens the file picker; its hidden input keeps the focus ring on the plate), and a danger **Remove**. **Minor sponsors** are a grid of thumbnails, each with Remove (naming it for screen readers), plus **Add minor sponsors** (several at once).
- **Behaviour:** images save as soon as they upload, unlike the rest of the editor, and the section says so. The browser checks the file (PNG, JPEG or WebP up to 5 MB) and resizes it to at most 1600 px before sending.
- **Focus:** Remove takes the image and its button away, so focus moves to that slot's upload control.
- **Status:** one polite status line under the section reads "Uploading logo…", "Uploading 2 of 3…", "Logo saved.", "2 minor sponsors added." or "Upload failed: {reason}" (in Alert Red).

#### Platform settings
Superadmin only (S-01, S-02). Two sections under the title plate, each a Seam-topped section with a section heading.
- **Platform sponsors:** **Primary sponsors** ("Full size on every event page.") and **Secondary sponsors** ("Half size on every event page."), each a thumbnail grid like minor sponsors, with **Add primary sponsors** or **Add secondary sponsors** (several at once, the same picker plate as event images). Each Remove is named "Remove primary sponsor 2" and so on, starting with its visible word. After a removal, focus moves to that tier's Add control. One polite status line reads "Uploading 1 of 2…", "2 secondary sponsors added.", "Primary sponsor removed." or the reason in Alert Red.
- **Default rules:** the rules editor labelled "Default rules", starting from the stored template or, when there is none, the built-in iTala rules (the note then adds "These are the built-in rules."). **Save default rules** is the live button; it stays focusable while it saves. "Unsaved changes" sits beside it, and leaving with unsaved edits asks first, as in the event editor.

#### Round robin and playoff dialogs
Once an event is published, each division's action row reads **+ Add team**, **+ Round robin**, **+ Playoff** (quiet plates, each carrying the division name in screen-reader text), then the danger **Remove division**. The pre-publish **Custom games/team** setting leaves the card and lives in the round robin dialog (E-21).
- **Frame:** the confirmation dialog's frame, titled "Add round robin · [division]" or "Add playoff · [division]". Cancel comes first as a quiet plate; the go-ahead is teal and names the act ("Add games", "Add playoff"), reading "Adding…" while it runs.
- **Round robin:** the old editor's sentence ("4 teams. A full round robin is 6 games (3 per team). Matchups already on the schedule are skipped, and new games take whatever slots are still free."), the **Custom games/team** check, and when ticked a **Games per team** field whose range note ("Between 1 and 3. Leave the box unticked for a full round robin.") is its description, not part of its label.
- **Playoff:** one field, "How many teams advance to the playoff bracket? (max N)", starting at min(N, 4), with a note on where the games go.
- **Saving first:** like Publish, an addition saves unsaved edits first, so it uses what is on screen.
- **Outcome:** the dialog turns into its result ("4 games added. 1 could not fit and is in the Unscheduled row.", "3 playoff games added!") as a status with a teal **Done** that takes focus and is described by the result, so the outcome is seen and heard wherever the organiser is on the page. Existing games the event's days, hours or courts no longer fit go to Unscheduled first (as the old editor did), and the result says how many. A division with too few teams, or an event with no dates, gets the reason and only **Close**.

#### Schedule drag and drop
The published event's schedule grid moves games by drag and drop (E-45).
- **Move handle:** each game card ends in an action row of **Move** (a six-dot grip in Muted Ink, then the word, `cursor: grab`) and **Edit** (underlined text). Both are at least 2.75rem tall and carry the matchup in screen-reader text ("Move Hawks vs Owls"). Only the handle starts a drag: a mouse drags at once, touch needs a press and hold (250 ms), so a swipe on a card still scrolls the table on a phone.
- **Keyboard:** Space or Enter picks the game up, arrow keys step one cell at a time (across courts, through the times, on into the next day, and up into the Unscheduled row and its games), Space or Enter drops, and Escape or Tab cancels, so leaving the grid never moves a game. Focus stays on the game's Move button, in its new cell after a drop.
- **Drop target:** the cell, Unscheduled game or Unscheduled row under the game gets a 2 px teal outline drawn inside its edge (the current place, The Teal Is Identity Rule).
- **Lifted card:** the dragged card keeps its look on Raised Plate with a 2 px teal outline; no shadow. It lands instantly: no drop animation and no keyboard glide, because platform screens have no motion beyond colour transitions.
- **Outcome:** the card shows in its new place at once and settles when the save returns; a refused save puts it back. Dragging and Edit wait while a move saves.
- **Schedule notice:** the result sits in a notice pinned to the foot of the viewport while the schedule is on screen (`position: sticky`): Raised Plate, 1 px teal outline (Alert Red when refused), at most 40rem wide, with a **Dismiss** text action that hands focus back to the game. It clears when the next drag starts, so it never sits over drop targets. It names the move ("Moved Hawks vs Owls (Open) to Sat 03/10/2026 10:00 am, Court 1.") and adds a **Rest warning:** line for each team left with two games under 2 hours apart. The warning never blocks the move. "Saving…" shows while the save runs.

#### Motion
One easing, `cubic-bezier(0.16, 1, 0.3, 1)`. Colour transitions 150ms (nav links, buttons, rows, date blocks, input underlines). The title plate wipe (420ms, sub-strip delayed 120ms) is the signature and runs once. The LIVE pip (1.6s ease-in-out, infinite) is the only repeating motion. Under `prefers-reduced-motion` the wipe, the pip and every transition are off.

## Do's and Don'ts

### Both worlds:
- **Do** keep the worlds apart: `--ev-*` and division tokens inside event pages, `--brand-*` on platform screens, and never one in the other.
- **Do** write dates as DD/MM/YYYY and times as "7:00 pm", in NZ English, with "-" as the only dash.
- **Do** keep touch targets at least 2.75rem, make wide grids and tables scroll inside themselves, and check the layout at 360 px.
- **Don't** add shadows, glows, gradients, blurs, glass or textures in either world.

### Event pages - Do:
- **Do** read every colour on an event page from `--ev-*`, `--div` or `--on-div`, deriving tints with `color-mix(in srgb, ... , var(--ev-bg))`.
- **Do** draw structure with 2 px paint lines and separate sections with space.
- **Do** pair every state with words and a stroke pattern: solid on court, dashed up next, baseline tick for final.
- **Do** use Big Shoulders for numerals and headings, the stencil cut for court numbers only, Archivo for names and body, all with tabular numerals for scores and times.
- **Do** put lettering that crosses court lines on a Floor Tint patch.
- **Do** check a new surface against a second organiser palette, including a light floor, before calling it done.

### Event pages - Don't:
- **Don't** use `--brand-*` tokens, iTala logo colours or hard-coded hex values inside an event page; the only iTala element is the "Powered by iTala Connect" footer, painted in event tokens.
- **Don't** add wood grain or other court costume.
- **Don't** put games or sections in filled cards or panels; a game is an outline on the floor.
- **Don't** add another moving mark beyond the now line and the score paint-in.
- **Don't** show a game clock, period or quarter; the mobile app owns those.
- **Don't** round corners beyond 2px, except the circles a court actually has.

### Platform screens - Do:
- **Do** open every platform page with a title plate (teal key, plate, sub-strip) as its `h1`.
- **Do** keep teal for identity and plate edges, and lime for the LIVE pip and at most one primary action per screen.
- **Do** cut plates on one right-end diagonal (0.9rem) and panels on the bottom-right corner (1.25rem).
- **Do** stack surfaces ground, plate, raised plate, with 1 px seams where a line is needed.
- **Do** set plates, names, labels, buttons and nav in condensed Saira caps, and reading text at normal width.
- **Do** say every status in words on its bug; colour only reinforces it.
- **Do** keep "iTala" in its own casing inside capitalised plates.
- **Do** place the iTala mark directly on Network Ground, unaltered.
- **Do** keep every link and button in an action row at least 2.75rem tall, wrapping rather than truncating.
- **Do** ask through the confirmation dialog, Cancel first, before an event, team or division is removed or unsaved edits are lost.
- **Do** repeat every chosen calendar date as a removable chip beneath the calendar.

### Platform screens - Don't:
- **Don't** use lime for headings, decoration, hovers or a second button on the same screen.
- **Don't** build white cards, a left sidebar, or rounded corners; the only circle is the LIVE pip.
- **Don't** add motion beyond the one-time title plate wipe, the LIVE pip and 150ms colour transitions.
- **Don't** describe or treat the iTala mark as transparent, or recolour, crop or re-ground it.
- **Don't** apply the iTala mobile app's colour-role rule here; it was declared not binding on 26/09/2026.
- **Don't** put a destructive action on a filled plate, or make a dialog's go-ahead lime.
- **Don't** use the browser's native confirm prompt for in-app questions; the only native prompt left is the reload and close-tab fallback.
