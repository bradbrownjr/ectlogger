# ECTLogger UI Design Reference

This document records established UI patterns, conventions, and design principles.
Consult it before adding new UI elements so the app stays visually coherent.

---

## Logo

The official ECTLogger logo is a radar-ring circle with a Yagi antenna mast, green station check-in dots, and a bold green checkmark overlay. It represents stations checking into a net through an antenna — the core function of the application.

**Canonical SVG source:** `docs/assets/logo.svg`
**React component:** `frontend/src/components/AppLogo.tsx`
**Favicon:** `frontend/public/logo.svg`

### Usage

| Context | Component call | Notes |
|---|---|---|
| Navigation bar (blue AppBar) | `<AppLogo size={28} variant="nav" />` | White rings/antenna, bright green dots and checkmark |
| Login page heading | `<AppLogo size={40} variant="default" />` | Standard light-bg palette |
| Net Report print header | `<AppLogo size={48} variant="default" />` | Standard light-bg palette |
| Dark-mode cards / panels | `<AppLogo size={32} variant="dark" />` | Dark fill, adjusted ring/antenna colors |
| Email HTML bodies | Inline SVG at 28 px | Copy from `docs/assets/logo.svg`; email subjects keep the 📻 emoji |
| Printed Net Script | Inline SVG at 32 px | Embedded directly in the generated HTML string |

### Variants

- **`default`** — Light background. Dark green border (`#1a6b2e`), light green rings, gray antenna, two-tone green checkmark.
- **`nav`** — Blue or dark toolbar. White/translucent border and rings, white antenna, bright green (`#69f0ae`) dots and checkmark.
- **`dark`** — Dark-mode surface. Dark green border, very dark rings, blue-gray antenna, slightly lighter green checkmark.

### Do not

- Recolor the checkmark to anything other than green — it is the brand accent.
- Stretch the logo non-uniformly (always set equal `width` and `height`).
- Use `variant="default"` on the blue AppBar — use `variant="nav"` so it reads on a colored background.
- Replace the logo with the 📻 emoji anywhere in the UI — the emoji is reserved for email subject lines only.

---

## Core Principles

### Symmetry and Uniformity
Identical controls must look identical across every page. Before adding a new
interactive element, find the nearest existing analogue in the codebase and match
it — size, spacing, color, icon scale, and tooltip behavior.

Common failure modes to avoid:
- Mixed explicit `size` props on the same component type (e.g., some `Fab` with
  `size="medium"`, others defaulting to `large`)
- Icons rendered at `fontSize="small"` in one context and unsized in another
- Spacing that varies between similar card types
- Action buttons that appear at different vertical positions across pages

### Fixed-answer fields require a dropdown, radio group, or select — never free text

If a field's valid answers come from a known, closed list — and no other answer would
ever be correct — the input must be a `<Select>`/dropdown, a radio group, or an
autocomplete constrained to that list. It must never be a plain `TextField` backed only
by an advisory validator or a help-text popover explaining the valid values.

A validator that flags a bad value after the fact, or a "?" / help icon that shows the
operator what they're supposed to type, are not substitutes for a constrained input —
they let a typo or an invalid value through in the first place. This matters most where
the value feeds a machine-readable protocol or a downstream export: a mistyped code can
produce output that reads as wrong (or fails silently) for every recipient, which is a
correctness bug wearing a UI costume.

Example: the ARRL Radiogram's HX handling-instructions field (`HxCodeField.tsx`,
`RadiogramAssist.tsx`) has exactly seven valid codes (HXA–HXG); it was originally a free
`TextField` with a `validator: "hx_code"` and a help popover listing the codes as
reference text. That is exactly the pattern this rule forbids — it was replaced with a
dropdown of the seven codes (plus an inline numeric field for the three that take a
parameter). The general rule, not just this one field, is what to apply going forward.

This does not apply to fields where free text is genuinely open-ended (a name, a note, a
message body) or where the "valid" set is unbounded/local (e.g. a net/path name — see
`RelayMethod`'s `path_name` in the traffic-handling design, which is deliberately free
text because every deployment's local nets differ).

### Branding

The application name is **ECTLogger** — no spaces, camel-cased. Always paired with the logo when rendered as a heading or in the nav bar; never the logo alone, never the name alone in primary headings.

The 📻 FM radio emoji is **retired from the UI** and reserved only for email subject lines (where it aids recognition in an inbox). Use the `AppLogo` component everywhere else.

---

## Typography

MUI's default Roboto font stack is used throughout. Do not override `fontFamily` or set explicit `fontWeight` on page-level headings — use the variant's defaults so all pages look consistent.

### Page heading standard

Every top-level page heading uses this pattern:

{% raw %}
```tsx
<Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
  <SomeIcon sx={{ fontSize: 32, color: 'text.primary' }} />
  Page Title
</Typography>
```
{% endraw %}

On mobile (`xs`) the variant drops to `h5`; the icon scales proportionally (24 px on mobile, 32 px on desktop).

Each page icon carries `fontSize: 32` and `color: 'text.primary'` via its `sx` prop, as shown above.

| Page | Icon | Mobile label |
|---|---|---|
| Active Nets | `CellTowerIcon` | "Active" |
| Net Schedule | 📅 inline emoji | "Schedule" |
| Statistics | `BarChartIcon` | "Statistics" |

**Rules:**
- Never add `fontWeight="bold"` to a page `h4` heading — it makes that page visually heavier than its siblings.
- Never nest a heading inside a `<Box>` with a subtitle below it just to add an icon — use the flex Typography pattern above.
- Icons in page headings use `color: 'text.primary'`, not `color: 'primary.main'`, so they don't compete with action buttons.

### Type scale

| Role | Variant | Notes |
|---|---|---|
| Page title | `h4` (desktop) / `h5` (mobile) | With icon, flex row |
| Section title | `h5` or `h6` | No icon |
| Card title | `subtitle1` or `body1` with `fontWeight="medium"` | |
| Body / description | `body1` | Default weight |
| Caption / meta | `body2` or `caption` with `color="text.secondary"` | |
| Chip / badge label | `caption` | |

### Professional UI
- Every interactive element has a visible affordance (hover state, cursor change,
  or tooltip).
- Destructive actions (delete, ban) use `color="error"`. Affirmative actions use
  `color="primary"` or `color="success"`.
- Loading states are always indicated — never leave a button or section blank
  while data is fetching. Use `<CircularProgress size={20} />` inline in buttons,
  `<CircularProgress />` centered in content areas.
- Empty states always have a message. Never render a blank box.

### Thoughtful UX
- Primary action per page/section should be the most visually prominent element.
- Secondary and tertiary actions are visually subordinate.
- Confirmation dialogs are required before irreversible actions (delete, archive,
  ban). Do not ask for confirmation on reversible actions.
- Inline editing is preferred over dialog editing for single-field changes.
- Snackbar messages confirm success or explain failure. Duration: 4 s for success,
  persistent (no auto-hide) is not used — keep messages brief enough for 4–6 s.

---

## Theme & Dark Mode Compliance

Every custom color (background, border, divider, hover state, text) must
render correctly in both light and dark mode. The app's theme toggle flips
MUI's `palette.mode` at runtime — a component that hardcodes light-mode hex
values will look broken (invisible, low contrast, or jarring bright-on-dark)
the moment a user switches themes, even if it looked fine during development
in light mode. This was the root cause of the July 2026 net-view toolbar bug:
the command bar's chrome was hardcoded to light-mode hex, so it stayed a
bright light-gray strip with near-black text in dark mode instead of adapting.

### Preferred approach: theme tokens

For anything MUI already themes, use the token instead of a literal hex value
— it resolves automatically per mode, no conditional needed:

| Instead of | Use |
|---|---|
| `'#ffffff'` / `'#1e1e1e'` background | `'background.paper'` or `'background.default'` |
| `'#000000'` / near-black text | `'text.primary'` |
| Muted gray text | `'text.secondary'` |
| Light gray border | `'divider'` |

### When a token doesn't fit: `useTheme()` + `palette.mode`

Some UI (dense toolbars with per-item brand colors, tinted status chips)
needs values MUI doesn't expose as a token. Gate those explicitly:

{% raw %}
```tsx
const theme = useTheme();
const isDarkMode = theme.palette.mode === 'dark';

sx={{
  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#f7f8f9',
  borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#e4e6e9',
  color: isDarkMode ? '#e8eaed' : '#25282c',
}}
```
{% endraw %}

Saturated **semantic** hues — MUI's fixed warning/success/error/info palette
(e.g. `#ed6c02`, `#4caf50`) used to signal meaning ("this is destructive",
"this succeeded") — generally do **not** need a second dark-mode variant;
they already carry enough contrast on a dark surface. It's specifically
**neutral grays, near-black, and near-white** chrome — backgrounds, borders,
dividers, label text, hover states — that break in the opposite theme and
need explicit `isDarkMode` handling.

### Reference implementation

`NetViewHeader.tsx`'s command bar (see "Net View Toolbar" below) — the
strip's background, top/bottom border, group divider, hover state, and
neutral gray icons are all gated on `isDarkMode`; semantic-hued icons are
left unconditional.

### Before shipping

Toggle dark mode and check the new UI in both modes before considering a
change done — do not assume a literal color "probably" works in the other
theme just because it looked right in whichever mode you happened to be
testing in.

### Multi-theme compliance (named color themes)

The app also ships multiple named color themes (Profile → Settings; system
default in Admin → Themes — see `docs/DEVELOPMENT.md` "Theming"), not just
one fixed blue/pink palette with a dark variant. **A saturated hue meant to
read as "the app's brand color" is a different case from a semantic hue
above** — it must use the `primary.main` / `secondary.main` tokens (or
`theme.palette.primary.main` via `useTheme()`) instead of a literal hex, so
it follows whichever theme the viewer has selected. A hardcoded `#1976d2`
icon or link color is not a neutral choice anymore — it's specifically
*ectlogger-blue's* primary, and looks like a bug (a stray blue accent that
doesn't match anything else on screen) to a user running Forest, Ocean,
Sunset, or Berry. This is why the earlier example above no longer lists
`#1976d2` as a hardcode-safe brand hue — it used to be, before named themes
existed.

**Exception — printed, exported, and emailed HTML.** Net scripts
(`NetScript.tsx`), announcement printouts (`Announcements.tsx`,
`ScheduleAnnouncements.tsx`), and outbound email templates render a
standalone HTML string outside the app's React tree and MUI
`ThemeProvider` entirely — there is no theme to read at render time, and
arguably shouldn't be one: a printed net script or a digest email is a
fixed document, not a live view, so it intentionally keeps ECTLogger's
brand blue (`#1976d2`) regardless of the recipient's personal in-app theme
choice, the same way a PDF letterhead doesn't change per reader. Only the
in-app, on-screen rendering of that same content (e.g. the announcement
panel's on-screen heading color) needs to follow the active theme.

---

## Floating Action Buttons (FABs)

FABs appear at the bottom-right of pages that have primary creation/navigation actions.

### Sizing
All FABs use the MUI default size (`large`, 56 px). Do **not** set `size="medium"`
or `size="small"` on any FAB — this was a prior inconsistency that has been
corrected. The default large size gives a consistent 56 px touch target across
the app.

{% raw %}
```tsx
// Correct
<Fab color="primary" aria-label="create net" sx={{ position: 'fixed', bottom: 16, right: 16 }}>
  <AddIcon />
</Fab>

// Wrong — do not mix explicit size on some but not others
<Fab size="medium" ...>
```
{% endraw %}

### Positioning
FABs stack from right to left at `bottom: 16, right: 16`. Each subsequent FAB adds
64 px to `right` (56 px button + 8 px gap): 16 → 80 → 144 → 208.

### Color convention
| Role | color |
|---|---|
| Primary creation action (Create net, Create schedule) | `"primary"` |
| Secondary actions (Filter, Archive, Merge) | `"default"` |
| Active state (Filter is on) | `"primary"` |

### Tooltip
Every FAB must have a `<Tooltip>` with a concise label. The label should be a
verb phrase: "Create new net", "Filter nets", "View archived nets".

---

## Toolbar Icon Buttons

All toolbar buttons use `size="small"` with `variant="outlined"` (or
`variant="contained"` for the primary affirmative action in each context, such
as Start, Go Live, Check In, and Close Net). All icon buttons carry a `<Tooltip>`
so users can hover to reveal the function. Never add a toolbar icon without a tooltip.

Color conventions (all from MUI palette or literal hex):
| Color | Usage |
|---|---|
| Default MUI primary/success/error/warning | Standard affirmative, destructive, warning actions |
| `#4caf50` green | CSV export |
| `#2e7d32` dark green | CSV import |
| `#009688` teal | ICS-309 export |
| `#ff9800` orange | Statistics |
| `#9c27b0` purple | Audio stream, role management |

These conventions apply to the net view toolbar. Actions in a **card footer** use
`<CardActionButton>` instead — same colors, but always paired with a text label.
See Card Action Buttons below.

---

## Tooltip Positioning

Every `<Tooltip>` in the app gets its positioning behavior from a single
`MuiTooltip` theme default in `App.tsx` — never add per-instance `PopperProps`
or positioning `sx` overrides to work around a placement problem; fix (or
extend) the theme default instead, or the same problem resurfaces on the next
toolbar someone builds. Three things it enforces everywhere:

- **Tooltips never intercept the click meant for what they're covering.**
  `disableInteractive: true` gives every tooltip's popper `pointer-events:
  none`. Toolbars in this app pack icon-only buttons into dense rows (26 px
  desktop-dense, see the toolbar height exception above), so a tooltip
  routinely overlaps a neighboring button — without this, hovering one
  button's tooltip and moving to click made the cursor land on the
  tooltip's own (selectable) text instead of the button underneath. No
  tooltip in this app holds content worth hovering into (a link, a button),
  so there is no cost to always disabling that interactivity.
- **Tooltips stay below their anchor and inside the viewport.** `flip` is
  disabled (a tooltip never jumps above its button, which would cover the
  toolbar row itself) and `preventOverflow` runs with `altAxis: true` and
  `boundary: 'viewport'` — explicitly the browser viewport, not Popper's own
  default of "clippingParents". Toolbars here routinely clip their own
  overflow (the collapse ladder, a panel's icon row), and a `Tooltip`
  portals to `document.body` — it already renders outside that clipping
  visually, so leaving the boundary at its default squeezed the tooltip's
  computed position into that tiny clipped box instead of the actual
  screen.
- **Tooltips render correctly under NetView's short-viewport zoom.**
  NetView.tsx applies a CSS `zoom` to `<body>` to fit the logging panel on
  short screens (see "Net-Paused Indicator" area of this doc / `NetView.tsx`
  for the zoom logic itself). Popper.js has no notion of the non-standard
  `zoom` property — it only compensates for CSS `transform` scaling — so it
  measured the anchor's already-zoomed position and wrote that same number
  into the tooltip's own `top`/`left`, which the browser then zoomed a
  *second* time on paint, landing the tooltip almost exactly on top of its
  own anchor. The `compensateZoom` Popper modifier (in the same `App.tsx`
  theme default) divides the tooltip's computed position back up by the
  current zoom factor before it's written, undoing that double scaling. It
  no-ops everywhere zoom isn't active.

Per-instance `placement="top"` / `placement="right"` overrides (the check-in
status legend, `CheckInTable.tsx`'s status icons) are unaffected — an
explicit `placement` always wins over the theme default, as normal.

---

## Markdown Write/Preview Toggle

Net script, per-net notes, and schedule announcements are all markdown fields.
Every editor for these fields (the Create Net / Create Schedule form panels, and
the three floating net-view dialogs) offers a **Write / Preview** toggle so the
rendered output can be checked before saving.

- Rendering goes through the single shared component
  `frontend/src/components/shared/MarkdownRender.tsx` — never inline a second
  `ReactMarkdown` block. It wraps `react-markdown` + `remark-gfm` + `remark-breaks`
  and the delimiter-normalizing helper, and exposes two heading-style `variant`s
  (`bordered` for net script, `colored` for notes/announcements) matching the
  styles already established in the dialogs.
- The toggle is a `ToggleButtonGroup` (`size="small"`, `exclusive`), not a plain
  `IconButton` — its two states must both stay visible so the current mode is
  never ambiguous.
  - In the roomy Create Net / Create Schedule form panels
    (`NetScriptPanel.tsx`, `AnnouncementsPanel.tsx`), use text-labeled
    `ToggleButton`s ("Write" / "Preview") positioned top-right of the panel.
  - In the narrower floating dialogs (`NetScript.tsx`, `Announcements.tsx`,
    `ScheduleAnnouncements.tsx`), use icon-only `ToggleButton`s (`EditIcon` /
    `VisibilityIcon`, each wrapped in a `Tooltip`) inside the existing edit
    toolbar row, since horizontal space is tighter there. The toggle only
    appears while `editing` is true — Preview shows the live in-progress edit,
    not the last-saved value.
- Switching to Preview swaps out the formatting toolbar and textarea entirely
  (not a side-by-side split) — this matches the space-constrained dialogs and
  keeps behavior identical across all five editor locations.

---

## Tabs

### Scrollable tabs (required pattern)
All `<Tabs>` components must use `variant="scrollable"` with `scrollButtons={false}`.
This lets the tab bar scroll natively on touch/narrow viewports without visible
arrow buttons. Pair with responsive `minWidth` and `px` to shrink tabs before
overflow is needed.

{% raw %}
```tsx
<Tabs
  value={tabValue}
  onChange={(_, v) => setTabValue(v)}
  variant="scrollable"
  scrollButtons={false}
  sx={{
    borderBottom: 1,
    borderColor: 'divider',
    '& .MuiTab-root': { minWidth: { xs: 72, sm: 100 }, px: { xs: 1, sm: 2 } },
  }}
>
```
{% endraw %}

Admin uses `minWidth: { xs: 72, sm: 100 }` (6 tabs).
Profile uses `minWidth: { xs: 80, sm: 120 }` (3 tabs, more room per tab).
Adjust per tab count — fewer tabs can afford wider minWidth.

### Swipe-to-switch (required for pages with tabs)
Wrap the `<Paper>` containing the tabs in touch handlers so users can swipe
horizontally to advance or retreat tabs. Only horizontal swipes are captured;
vertical scrolls pass through.

Also skip the swipe entirely when the gesture starts inside a nested
horizontally-scrollable element — a wide `<TableContainer>` on a narrow
screen, or the `<Tabs>` scroller itself when tabs overflow. Without this
check, dragging that content sideways reads as "dominant X, >50px" just like
an intentional tab swipe and steals the gesture from native scrolling mid-drag
(regressed on Admin's Users tab in 2026-07: swiping the wide user table kept
flipping tabs, made worse by that tab's slow reload). Detect it by walking up
from `e.target` to the `Paper` boundary at `touchstart` looking for
`scrollWidth > clientWidth`.

```tsx
const touchStartX = useRef<number | null>(null);
const touchStartY = useRef<number | null>(null);
const touchOnScrollable = useRef(false);

const handleTouchStart = (e: React.TouchEvent) => {
  touchStartX.current = e.touches[0].clientX;
  touchStartY.current = e.touches[0].clientY;
  touchOnScrollable.current = false;
  let el = e.target as HTMLElement | null;
  while (el && el !== e.currentTarget) {
    if (el.scrollWidth > el.clientWidth) {
      touchOnScrollable.current = true;
      break;
    }
    el = el.parentElement;
  }
};

const handleTouchEnd = (e: React.TouchEvent) => {
  if (touchStartX.current === null || touchStartY.current === null) return;
  const deltaX = e.changedTouches[0].clientX - touchStartX.current;
  const deltaY = e.changedTouches[0].clientY - touchStartY.current;
  touchStartX.current = null;
  touchStartY.current = null;
  if (touchOnScrollable.current) return;
  if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;
  setTabValue(v => deltaX < 0 ? Math.min(v + 1, MAX_TAB_INDEX) : Math.max(v - 1, 0));
};

// On the Paper:
<Paper onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
```

---

## Net View Toolbar (NetViewHeader.tsx) — "Command Bar" (3a)

The per-net toolbar is a **full-width command bar** rendered as a sibling
above the check-in table / chat two-column body — not nested inside a `Grid
item`. This spans the entire page width so the check-in table header and the
Chat panel header land on the same top edge again.

### Title row

`display:flex; align-items:baseline; gap:10px`, above the command bar:

- **Net name** — `Typography variant="h5" component="h1"`, `flex:0 0 auto`,
  `white-space:nowrap`. Use the variant's default weight/size (do not
  hardcode a px value — see Typography rules above).
- **Description** — `flex:1 1 auto; min-width:40px`, ellipsis-truncated to
  one line, italic, `color:text.secondary`, prefixed `— `, dotted
  bottom border, `cursor:pointer`. Native `title` attribute carries the full
  text as a hover tooltip. Rendered only when `net.description` exists.
- **More / Hide toggle** — text button (info icon 16px + label), `12px/500`,
  `primary.main`, hover tint `rgba(25,118,210,.08)`. Clicking it (or the
  description itself) opens the full description in a **`Popover` anchored to
  the description element**, floating over the page. It must not render inline
  in normal flow — doing so pushed the command bar and the whole table/chat
  body down on expand and yanked them back up on collapse. Collapsed by
  default on every page load.
- **Status/stat/frequency chip cluster** — `flex:0 0 auto; ml:auto`, right end
  of the row. Status, countdown, duration, stations, rechecks, checked out,
  online, and guests, **plus the frequency chips**, which moved here from their
  own row below the toolbar. This consolidation — not a separate chip row — is
  what lets the table/chat panel headers line up. There is deliberately **no
  edit-times pencil here**: actual start/end time correction lives in the
  Basic Info tab of Edit net (active nets) and Net info (closed/archived), where
  it sits with the rest of the net's fields instead of hiding behind an
  unlabelled icon among read-only chips.
- On mobile the chip cluster **wraps** onto additional lines rather than forcing
  the page into horizontal scroll.

### Command bar

Full-bleed strip directly below the title row:
`display:flex; align-items:center; gap:1px; flex-wrap:nowrap; padding:3px 8px;
background:#f7f8f9; border-top/bottom:1px solid #e4e6e9`. Buttons are
borderless "application toolbar" buttons flush against each other (1px gap)
so 15 controls read as one calm strip instead of separate cards — no card
outline until hover (`background:#e6e9ec; border-color:#d3d7dc`). The icon
carries the action's color; the label stays near-black (`#25282c`). **Close
net** is the only emphasised item (red `#c62828` label text, weight 500 — not
a filled block). Every button keeps its Tooltip regardless of whether its
label is currently shown.

Two groups, separated by a `1px × 20px` vertical divider (shown whenever both
groups have at least one visible item):

**Information group** (left) — Bulk add, Search, Map, Coverage, Traffic, Audio,
Stats, Script, Announcements, Notes, Topics, Website, Net info, Import, then the
`More` button for whatever didn't fit. Traffic (`MailIcon`, the same envelope the
navbar uses for the Traffic section) opens the per-net traffic panel; it is an
Information item because the pane is a view of the net's traffic, with filing
happening in a dialog inside it — the same reasoning that puts Coverage here
despite its reporting action. Topics opens a read-only prior-topics list to
everyone (with a new-tab link to the originating net for each entry, so
browsing history doesn't lose your place in the currently-open net); the
"Add Historical Topic" control inside that dialog is staff-only
(`canManage`). Net info (a read-only render of the net's configuration
form — rotation, custom fields, ICS-309 settings) is staff-only outright
(`canManage && !isActiveOrLobby` — hidden while Edit net covers the same
ground) since it exposes editable-looking config that isn't meant for
standard/guest visitors. The `/nets/:netId/info` route itself (unlike
`/edit`) has no `PrivateRoute` wrapper, so direct-URL access is guarded in
`CreateNet.tsx`: if `net.can_manage` comes back `false` for the current
user (or lack thereof), info mode redirects to the net view instead of
rendering the form.

**Management group** (right) — Start net, Edit net, Roles, Claim NCS, Raise
hand (hidden for the acting NCS — doesn't make sense to raise a hand to get
your own attention), Step away, Role switch (labelled "Role: NCS" / "Role:
Standard" depending on current state — click to toggle), Check out, Check in, Go live, Close
net, Export, ICS-309, Report, Archive, Unarchive, Delete. Same visibility
conditions as before the redesign (see `NetViewHeader.tsx` — each button's
condition is unchanged, only the visual treatment and grouping moved), except
Step Away: if the acting NCS is the only currently-active NCS on the net,
clicking it shows a confirmation dialog warning that no one else is running
the net before letting it proceed (doesn't block the action, just warns).

**Active-state tinting** — some buttons carry a persistent tinted background
+ border (via `activeTone`) so their current state reads at a glance instead
of blending into the flush strip: primary (blue) for toggles like Search-open
or Role: NCS, warning (orange) for Return-from-away, success (green) for
Check in — the primary call-to-action for anyone not yet logged into the
net, including guests who might otherwise skim past a plain icon+label.
On hover, a tinted (`active`) button deepens its own tone's background
alpha instead of switching to the generic neutral hover gray — losing the
color on hover reads as the button turning "off." Untinted buttons still
get the plain neutral hover.

**Dark mode** — see "Theme & Dark Mode Compliance" above. The strip's
background, top/bottom border, group divider, hover state, label text, and
neutral gray icons (Script, Edit net, etc.) are all gated on `isDarkMode`;
brand-hued icons (blue/orange/purple/green/red/teal) are left unconditional.

### Collapse ladder — measured, not breakpoint-based

The bar never wraps (`flex-wrap:nowrap`, `flex:0 0 auto` on every child) and
is **not** capped to a fixed maximum width or fixed viewport breakpoints —
every item uses inline labelled space whenever the bar's actual measured
width allows it, all the way up to ultrawide monitors. Nothing is
permanently pinned to the `More` menu; Website/Net info/Import show inline
like everything else whenever there's room.

Implementation (`NetViewHeader.tsx`): a `ResizeObserver` on the bar tracks
its real rendered width (via `getBoundingClientRect()`, not
`ResizeObserver`'s `contentRect` — `NetView.tsx` applies a CSS `zoom` on
short viewports to fit the logging panel without scrolling, and `contentRect`
reports the pre-zoom layout width while `getBoundingClientRect()` reports the
actual post-zoom rendered width, the same basis the per-item widths use). A
hidden off-screen clone of every visible item (both labelled and icon-only
form) is measured the same way. Every item carries a `priority` (1 lowest–4
highest); `computeLayout()` is a pure function that, given the real widths
and the real available width: keeps everything labelled if it fits;
otherwise drops labels lowest-priority-first (one at a time, re-checking
after each) until it fits; otherwise moves items into the `More` menu,
again lowest-priority-first, until it fits. Priority 4 (Start net, Check in,
Go live, Close net — the single primary status CTA for whatever the net is
doing right now) never loses its label and never overflows.

On touch/mobile (`< 600px`) buttons use the "comfortable" 30px height instead
of the 26px desktop-dense height (still narrower than the general 44px
touch-target rule — an explicit, documented exception for this dense toolbar
context, matching the approved design handoff).

### Decision rule for new buttons

> **Ask: is this a read/view action, or does it change net state or user
> participation?**
>
> - **View action** (search, map, stats, script, notes, topics, website) →
>   **Information group**
> - **State/participation action** (start, check in/out, roles, close,
>   export, archive, delete) → **Management group**

---

## Side-Panel Dialogs Belong to the Page, Not the Panel

A dialog opened from a side panel (Traffic, Coverage, Map, Script,
Announcements) must be **mounted by the host page** — `NetView.tsx` or
`NetPaneWindow.tsx` — with the panel receiving only a callback that opens it.
`CheckInFormDialog`, `CanHearDialog`, `RoleAssignmentDialog`, and
`FileTrafficDialog` all follow this; none of them is mounted inside a panel.

The reason is structural, not stylistic. Every one of these panels renders
**twice** in the tree — a docked copy inside its column and a floating copy
in a `FloatingWindow` — chosen by a `dockedPref` boolean (gated on `isXlUp`
too for the left-column panels; see "Docked Pane Width Gating" below). That
switch can happen automatically — an ordinary window resize, or plugging a
laptop into a projector, can cross the left column's xl breakpoint — which
unmounts one subtree and mounts the other. Anything the panel owned goes
with it. A compose dialog owned by the Traffic panel took a half-typed
radiogram with it every time.

Two rules follow:

1. **Dialog state lives on the page.** The panel gets `onCompose`-style
   props. A host that mounts no dialog should not render the button at all,
   rather than rendering one that does nothing.
2. **Report results by event, not by callback.** The panel that opened a
   dialog may be a sibling, a floating window, or closed by the time the
   dialog finishes. Dispatch a `CustomEvent` on `window` the way
   `useNetWebSocket.ts` already does (`trafficLogged`, `newChatMessage`), and
   let whichever instance is mounted pick it up.

For in-place editing inside a panel — the Script and Announcements editors —
there is no dialog to hoist, so the buffer is mirrored into `sessionStorage`
by `useEditDraft.ts` instead, and cleared the moment editing ends. Any new
panel with an inline editor should use that hook rather than a bare
`useState` pair.

---

## Docked Pane Width Gating

NetView's docked panes live in two different columns, and only one of them
is width-gated:

- **Left column** (Script, Announcements, Schedule Announcements) is a
  *new* column that only exists at xl+ — below that there simply isn't
  room for a third side-by-side slot alongside the check-ins and the
  existing right column. Its `xxxDocked` booleans stay `xxxDockedPref &&
  isXlUp`, and the "dock to layout" buttons that offer it stay gated the
  same way (`isXlUp ? handler : undefined`) so they don't render a button
  that does nothing below xl.
- **Right column** (Chat, Map, Coverage, Traffic, Activity Log) is the
  *existing* column — the two-column layout (check-ins + right) has worked
  from md up since before any of this docked/floating machinery existed,
  proven daily by Chat and Activity Log, neither of which has ever carried
  a width gate. Map, Coverage, and Traffic dock into that same column
  alongside them, so their `xxxDocked` booleans are plain `xxxDockedPref` —
  **no width gate at all** — and their "dock to layout" handlers are always
  passed, unconditionally.

The rule for anything new: **the xl gate belongs to the left column only.**
A panel docking into the right column never needs one, because the column
it's joining already works at any width that shows two columns side by
side (md+).

## Docked Pane Stacking Order

The right column's stacking order is fixed, not first-open-wins: **Chat**
first, then whichever of **Map / Coverage / Traffic** are currently open, then
**Activity Log last, always** — see the `panes.push` call order in
`NetViewSidePanels.tsx`. Activity Log is the net's running record; an NCS
should find it in the same place — the bottom of the stack — regardless of
which on-demand panels happen to be open that session, rather than having it
shuffle around as panels are opened and closed.

A pane that legitimately wants to fill available vertical height (Chat, and
Activity Log when expanded) uses the normal shared flex-grow pool
(`useResizableSplit`'s per-pane weight, defaulting to an equal 1:1 share,
user-resizable via the drag handles between panes). A pane whose content is
typically short and has nothing useful to grow into — Traffic's list of
pending items is the current example — should instead size to its own
content by default (`flex: '0 1 auto'` rather than the weighted
`${weight} 1 0px`) so it doesn't force a slab of blank space below a
three-row table just because the column happens to be taller than that.
`useResizableSplit.ts`'s `hasExplicitWeight(key)` distinguishes "never
touched" from "resolved to the fallback", so a pane can default to
content-hugging while still rejoining the normal weighted pool the moment a
user deliberately drags it — see the `paneFlex()` helper in
`NetViewSidePanels.tsx` for the pattern to copy for the next sparse-content
panel.

---

## Card Grids

Use CSS Grid with `auto-fit` instead of MUI `Grid container/item` for card layouts.
`auto-fit` collapses empty column tracks, so a page with 2 cards shows 2 comfortably
wide columns instead of 2 narrow cards with an empty third slot.

{% raw %}
```tsx
<Box
  sx={{
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(max(300px, calc(100% / 6 - 20px)), 1fr))' },
    gap: { xs: 2, sm: 3 },
  }}
>
  {items.map(item => (
    <Box key={item.id} sx={{ display: 'flex' }}>
      <ItemCard item={item} />
    </Box>
  ))}
</Box>
```
{% endraw %}

The `max(300px, calc(100% / 6 - 20px))` formula has two regimes:
- **Below ~1920 px**: `300px` dominates — auto-fit adds columns as the viewport widens.
- **Above ~1920 px**: `100%/6 - 20px` dominates — the minimum grows to prevent a 7th
  column from ever fitting, capping the grid at 6 on ultrawide monitors.

Column behaviour:

| Viewport | Columns |
|---|---|
| < ~600 px | 1 (xs override forces single column) |
| ~600–900 px | 2 |
| ~900–1200 px | 3 |
| ~1200–1500 px | 4 |
| ~1500–1920 px | 5 |
| 1920 px+ (ultrawide) | 6 (capped) |
| Any width, fewer items than columns | Items expand to fill (no gap) |

Do **not** use `auto-fill` for card grids — it preserves empty tracks, creating the
same gap problem that `auto-fit` solves.

---

## Card Action Buttons (`CardActionButton.tsx`)

Every action in a net or schedule card's footer uses the shared
`<CardActionButton>` — never a bare `<IconButton>`. Icon-only card actions were
replaced because they forced users to hover for a tooltip to learn what each
button did, and their hit areas were too small to tap reliably on a phone.

### The component

`CardActionButton` wraps an MUI `Button` in a `Tooltip` and enforces three things:

- **A one-word label** next to the icon (`View`, `Staff`, `Stats`, `Edit`,
  `Start`, `Cancel`, `Delete`, `Archive`, `Export`, `Report`, `Email`, `Info`,
  `Create`, `Subscribe`, `Unsubscribe`). Spell labels out — `Unsubscribe`, not
  `Unsub`. There is room.
- **A 44 px minimum touch target on mobile** via `minHeight: { xs: 44, sm: 32 }`,
  satisfying the touch-target rule below. Desktop stays compact at 32 px.
- **A tooltip on every button**, defaulting to the label when no longer
  `tooltip` string is supplied.

Color rules:

- Pass `color` (an MUI palette key) only for **semantic** actions, where the icon
  *and* label should both be tinted — `error` for Cancel/Delete, `success` for
  Start, `primary` for View/Create.
- For a **category tint** (statistics orange, export green, staff purple), leave
  `color` unset so the label stays neutral, and tint the icon alone via `sx` on
  the icon element. This keeps the color conventions in the Toolbar Icon Buttons
  table intact without shouting a whole button in orange.

### Two action groups: management and standard

Both `NetCard.tsx` and `ScheduleCard.tsx` split `<CardActions>` into two groups.
This exists because cards with six or seven actions crammed into one wrapping row
broke unpredictably at card widths.

| Group | Contains | Who sees it |
|---|---|---|
| **Management** (first in DOM) | Mutating actions — Create, Edit, Cancel, Delete, Start, Email, Archive, Export, Report | Only users passing the card's `canManage` / `isOwnerOrAdmin` / `can_create_net` gate |
| **Standard** (second in DOM) | View-only actions — View, Staff, Stats, Info, Subscribe/Unsubscribe | Everyone, including guests |

Managers get their controls first — leading the row on a wide card, on the top
line on a narrow one — instead of hunting past the view-only buttons everyone
else sees. A standard user sees only the second group, which is why it must stay
view-only — never move a mutating action into it.

### Width-responsive: one row when wide, stacked when narrow

The groups are **not** permanently stacked. `<CardActions>` is a wrapping flex
row with `justifyContent: 'space-between'`, which yields both behaviours from one
declaration and no breakpoint or measurement:

- **Both groups fit on one line** (wide cards — e.g. a lone net stretching the
  full grid width): `space-between` pushes them to opposite edges. Management sits
  flush left, standard flush right, filling what would otherwise be dead space.
- **They no longer fit side by side**: each group wraps onto its own line. A lone
  item on a flex line is placed at that line's *start*, so the stacked groups stay
  left-aligned exactly as before.
- **Only one group rendered** (non-staff): it sits alone at the left.

Because the trigger is the card's own width, cards in a dense multi-column grid
stack while a full-width card on the same page shares one row.

Keep each inner group at the default `flex: 0 1 auto`. Setting `flex-shrink: 0`
makes a group overflow the card instead of wrapping internally on narrow
viewports; the default lets an over-wide group wrap its own buttons once it is
alone on a line.

### Ordering within a row: by severity

Order actions **neutral → destructive → primary call-to-action last**, so the
button a user reaches for most is not adjacent to the one that destroys the net:

- Net cards (draft/scheduled): `Email`, `Edit`, `Cancel`, `Start`
- Schedule cards: `Create`, `Edit`, `Delete`

Schedule cards lead with `Create` because it is the primary action and holds the
left-most position it occupied before the row split — muscle memory beats a
strict severity sort here.

### Required: `disableSpacing` on `CardActions`

MUI's `CardActions` ships a CSS rule that applies `margin-left: 8px` to every
sibling after the first, assuming a horizontal row of buttons. That margin lands
on the **second group's wrapper**, offsetting it from the first — visible as
8 px of misalignment when the groups are stacked.

Always pass `disableSpacing` and supply your own `gap`:

{% raw %}
```tsx
<CardActions
  disableSpacing
  sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 0.5 }}
>
  <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 0.5 }}>
    {/* management group */}
  </Box>
  <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 0.5 }}>
    {/* standard group */}
  </Box>
</CardActions>
```
{% endraw %}

Verify by computed style, not by eye, at more than one width — when stacked, both
groups must report the same `left`; when sharing a row, the standard group's
`right` must sit flush with the card's content edge.

---

## Mobile / Responsive

### Touch targets
Minimum interactive touch target: 44 × 44 px (Apple HIG / WCAG). MUI `size="small"`
buttons are 30 px — only acceptable in dense data tables where space is the constraint.
Never use `size="small"` for primary actions accessible from a net view.

### Breakpoints in use
The app uses MUI's default breakpoints (`xs: 0, sm: 600, md: 900, lg: 1200`).
- Mobile-first content layout: single column at `xs`, two or three columns from `md`.
- Hiding elements on mobile: prefer `display: { xs: 'none', md: 'block' }` over
  conditional rendering so the DOM structure stays stable.
- No horizontal scroll on body. Tables and code blocks may scroll within a
  constrained container (`overflowX: 'auto'`).

### Paper padding on mobile
Use responsive padding on `<Paper>` to reclaim space on small screens:
{% raw %}
```tsx
<Paper sx={{ p: { xs: 2, sm: 4 } }}>
```
{% endraw %}

---

## Sitewide Alert Banners (`MaintenanceBanner.tsx`)

### Color / visibility
Always use `variant="filled"` on the MUI `<Alert>`. The default standard variant
applies a very low-opacity tint for `severity="warning"` in dark mode — nearly
invisible on a dark background. `variant="filled"` gives a solid high-contrast
amber background in both themes.

```tsx
// Correct
<Alert variant="filled" severity="warning" ...>

// Wrong — invisible in dark mode
<Alert severity="warning" ...>
```

### Layout — no Collapse wrapper
Render the `<Alert>` directly inside the flex column; do **not** wrap it in MUI
`<Collapse>`. `Collapse` adds nested wrapper divs whose width does not automatically
stretch to fill the flex parent, causing the banner text to be clipped on pages
with wide content. The conditional `return null` pattern already handles show/hide.

{% raw %}
```tsx
// Correct — direct render, full flex width
if (!banner?.active || dismissed) return null;
return <Alert variant="filled" severity="warning" sx={{ borderRadius: 0 }} ...>;

// Wrong — Collapse wrapper clips text on some pages
return <Collapse in><Alert ...></Collapse>;
```
{% endraw %}

### Polling interval
The public `/api/settings/maintenance-banner` endpoint is lightweight and
unauthenticated. Poll every **10 seconds** so enable/disable changes are
reflected within one poll cycle rather than requiring a page reload. 60-second
intervals leave users staring at a stale banner state for up to a minute.

### Dismissed state reset
Clear the `dismissed` flag on both transitions — inactive→active AND active→inactive
— so re-enabling the banner after an admin disables it always shows it again without
a page reload.

---

## Net-Paused Indicator (`NetView.tsx`)

When a net has an assigned NCS but none are actively present (all
away/not checked in — see `backend/app/net_pause.py`), the net view shows:

- A `3px solid` border in `info.main` (blue) framing the entire browser
  viewport (`position: fixed; inset: 0`, `zIndex: theme.zIndex.appBar + 1`,
  `pointerEvents: 'none'`) — not just the net's `Paper` card — so it's
  visible above the navbar too, applied whenever `net.paused_at` is set.
- A persistent `Alert variant="filled" severity="info"` banner directly
  below the command bar (not dismissible — it reflects live state and
  clears itself the instant the condition resolves, so there's nothing for
  the user to dismiss).

Unlike `MaintenanceBanner`, this state is per-net and derived from
`net.paused_at`/`net.total_paused_seconds` (refreshed via the `net_pause_change`
WebSocket message), not polled — no interval needed since it's pushed live.

---

## What's New / Changelog (`frontend/src/changelog.json`)

Add an entry to the **current release version** object whenever a user-facing
change ships. Section `type` values:

| Type | When to use |
|---|---|
| `feature` | Brand-new capability |
| `improvement` | UX/performance improvement to existing functionality |
| `bugfix` | Bug fix |

Entries are shown in priority order: `feature` → `improvement` → `bugfix`.
Keep item text to 1–2 sentences focused on user impact. Avoid internal
implementation details.

The `whats_new_service.py` daily digest email reads the same file — do not
maintain a separate list.

### Entry length is a design constraint

An entry is read in a dialog, top to bottom, by someone who wants to get back
to their net. Length is the main thing that stops it being read at all, so what
gets left out matters as much as how items are worded:

- **Do not log a defect introduced and fixed before it reached users.** A
  redesign that broke hover colors and dark mode, both fixed in the same cycle,
  is a net change of zero for the user. Listing those fixes reads as a list of
  our mistakes and pushes the real changes off the screen. Log only bugs that
  users could hit in a released version.
- **One user goal is one item**, regardless of how many commits or days it took.
- **Omit anything the user cannot perceive** — internal cleanups, dependency
  bumps, changelog items about the changelog itself.
- **Prefer one merged entry over consecutive daily entries for the same piece of
  work.** A multi-day overhaul reads as one story; splitting it by date makes
  the reader reconstruct it themselves.

If an entry passes ~10 items for a single body of work, it needs consolidating.
Worked example: the 2026-07-28 UI/UX overhaul first landed as 24 items across
two dated entries, and was consolidated to 9 items in one — five self-inflicted
regressions dropped, three card-button items merged into one, two mobile items
merged, and two internal items removed.

### Item rendering rules (`ChangelogNotification.tsx`)

**Every item gets identical typography and an identical tinted background box.**
Item text is always `variant="body2"` at the default weight — never bold, never
a heavier `fontWeight`, and never conditional on `userImpact`. The single
permitted difference between items is the "User Impact" chip appended to the
text of flagged items.

`userImpact` therefore controls exactly one visual thing: whether that chip is
rendered. It also controls sort order (flagged items sort first), which is
behavior rather than styling.

Rationale: a flagged item is already marked twice — it sorts to the top and it
carries a chip. Weighting the text as well was a third signal, and because
flagged and unflagged items sit adjacent in the same list it read as a ragged
mix of bold and non-bold bullets rather than as emphasis. Uniform weight also
matches the PDF export in the same component, which has always rendered every
item at one weight with bold reserved for section headings.

{% raw %}
```tsx
// Correct — one weight for every item, background always applied
<Typography variant="body2">{item.text}{item.userImpact && <Chip label="User Impact" ... />}</Typography>
sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.08), borderRadius: 1, ... }}

// Wrong — ragged mix of weights down the list
sx={{ ...(item.userImpact && { fontWeight: 500 }) }}

// Wrong — inconsistent appearance for non-userImpact items
...(item.userImpact && { backgroundColor: ... })
```
{% endraw %}

The same rule governs the **Markdown** changelog: in `docs/CHANGELOG.md` every
item is `* **Category: Label** — sentence.`, where the bold wraps the
`Category: Label` and nothing else. Bold is structural there (it marks the
label segment of every item without exception), not a per-item emphasis — so
no item is ever fully bold and no item ever lacks the bold label.

---

## Paginated and Searchable Lists

Any list that may grow unbounded over time must be paginated and searchable.
Apply this standard whenever introducing a dialog, page, or panel that renders
user-generated records (topics, check-ins, logs, messages, templates, etc.).

### When to apply

Apply pagination and search when **any** of the following are true:

- The list has no natural upper bound (user-generated content that accumulates)
- The list is expected to exceed ~15 rows in normal use
- Rows contain freeform text that users will need to scan or find by keyword

Short, bounded lists (e.g., a fixed set of roles, a 3-item dropdown) do not
need this treatment.

### Layout rules

**Search bar:**

- Always-visible `TextField` with a `SearchIcon` start adornment
- `size="small"`, `fullWidth`, placed directly above the list
- Placeholder: `"Search [items]..."` (e.g., `"Search topics..."`)
- Client-side filtering on every keystroke; reset page to 1 on change
- Show a centered empty-state message when the filter returns no results,
  including the search term (e.g., `No topics match "foo".`)
- Hide the search bar entirely when the list is still loading or empty

**Pagination:**

- Page size: **25 rows** for dialog lists; 50 rows is acceptable for full-page
  tables where the user is actively browsing.
- Use MUI `Pagination` with `size="small"` and `color="primary"`
- Place pagination in the dialog footer (`DialogActions`) or at the bottom of
  the page section, left-aligned, with any footer actions (Close, Save) on the
  right.
- When only one page exists, replace the `Pagination` control with a plain
  result-count label (`"N topics"` or `"N matching 'query'"`).
- `pageCount` must be at least 1: `Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))`

**Row layout for timestamped records:**

When each row has a date/timestamp and a content field, place them on a single
horizontal line:

- Date: `Typography variant="body2" color="text.secondary"`, fixed width (e.g.,
  `width: 100`), `flexShrink: 0` so it never wraps
- Content: `Typography variant="body1"`, fills remaining space
- Container: `display: 'flex', alignItems: 'baseline', gap: 2`
- Rows separated by `Divider` (not padding-only), except after the last row

This keeps dates scannable in a left-anchored column while giving full width
to the content.

### Reference implementation

`frontend/src/components/TopicHistory.tsx` — dialog list with search, 25-row
pagination, and the date-left / content-right row layout.
