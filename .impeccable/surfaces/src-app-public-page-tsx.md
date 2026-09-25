---
version: 1
slug: "src-app-public-page-tsx"
primary_target: "src/app/(public)/page.tsx"
related_targets: ["src/app/(auth)/login/page.tsx","src/app/admin/layout.tsx"]
---

# Platform screens (Home, Sign in, admin shell)

## Scope and mode

Operate. Home `/` (events list first, then a short organiser intro), Sign in `/login`, and the admin shell `/admin` (dashboard, Settings, Admins). Event pages `/events/[eventId]` are out of scope and keep Painted Lines (their own `--ev-*` world).

## Audience and job

- Spectators arriving at Home: find this weekend's event fast.
- Organisers: sign in, then manage events at a laptop, or on a phone courtside.
- Superadmin: occasional settings and accounts.

## Constraints

- iTala palette: navy, teal and lime; the mobile app's colour-role rule is not binding (user decision 26/09/2026).
- The logo mark from the mobile app's `favicon.png` sits on its own navy-black ground (`#0B0F18`), which the page ground matches exactly. Do not doctor the artwork.
- Test-pinned copy and roles stay: "Sign in to iTala Connect", "My events", "Platform settings", "Admins", `signed-in-as`, the Email and Password labels.
- NZ English, DD/MM/YYYY, no long dashes. WCAG 2.2 AA, 44 px targets, from 360 px.

## Direction contract

THESIS: The platform is the iTala network's on-air graphics package. Home runs the season like a broadcast rundown, and admin is the production truck behind it. Refuses the white-card SaaS dashboard with a left sidebar.

OWN-WORLD:
- Ground and surfaces: network ground `#0B0F18`, with bug plates on `#172033` and `#1F2A40` and hairline seams in `#243049`.
- Colour roles: teal `#12D7D0` is identity and the plate edges; lime `#C7F000` is reserved for LIVE pips and the one primary action per screen; ink is `#F4F8FF`, muted `#8B95B5`.
- Shapes: angled lower-third plates, with a single diagonal cut on the right end.
- Type: Saira, using its width axis for condensed caps on plates and normal width for body, with tabular figures.
- Motion and depth: no gradients, glow or glass. Motion is the lower-third wipe.

STORY: A parent opens Home, sees "On now" events bugged in lime at the top of the rundown, taps theirs, and lands on the event page. An organiser takes the Sign in plate straight into the production truck, where "My events" sits as a rundown with status bugs.

FIRST VIEWPORT:
- Phone, 390 px:
  - network bar: the logo mark tile, "iTala Connect", "Sign in";
  - a lower-third title plate: teal edge, "Events this season", the tagline on the strip beneath;
  - the rundown: bug rows with a date block (DD/MM), the event name in condensed caps, divisions, and a status bug (lime pip ON NOW, teal UP NEXT, muted FINAL);
  - the organiser plate below the fold.
- Desktop: the rundown in 8 columns, with the organiser plate as a side column.
- Primary action: the event rows; Sign in on Home.

FORM: Broadcast Package, candidate 1 of 7 (my pick, chosen over the rolled Season Program Guide), seed key a20866ff.
- Signature interaction: each page title plate wipes in once on load, left to right in 420 ms (clip reveal), then holds.
- The only repeating motion is the LIVE pip, off under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
