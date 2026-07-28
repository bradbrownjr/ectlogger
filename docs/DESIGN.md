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

### Branding

The application name is **ECTLogger** — no spaces, camel-cased. Always paired with the logo when rendered as a heading or in the nav bar; never the logo alone, never the name alone in primary headings.

The 📻 FM radio emoji is **retired from the UI** and reserved only for email subject lines (where it aids recognition in an inbox). Use the `AppLogo` component everywhere else.

---

## Typography

MUI's default Roboto font stack is used throughout. Do not override `fontFamily` or set explicit `fontWeight` on page-level headings — use the variant's defaults so all pages look consistent.

### Page heading standard

Every top-level page heading uses this pattern:

```
<Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
  <SomeIcon sx={{ fontSize: 32, color: 'text.primary' }} />
  Page Title
</Typography>
```

On mobile (`xs`) the variant drops to `h5`; the icon scales proportionally (24 px on mobile, 32 px on desktop).

| Page | Icon | Mobile label |
|---|---|---|
| Active Nets | `<CellTowerIcon sx={{ fontSize: 32, color: 'text.primary' }} />` | "Active" |
| Net Schedule | 📅 inline emoji | "Schedule" |
| Statistics | `<BarChartIcon sx={{ fontSize: 32, color: 'text.primary' }} />` | "Statistics" |

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

Saturated brand/semantic hues (MUI-style blue/orange/purple/green/red/teal
used for icon colors — e.g. `#1976d2`, `#ed6c02`, `#4caf50`) generally do
**not** need a second dark-mode variant; they already carry enough contrast
on a dark surface. It's specifically **neutral grays, near-black, and
near-white** chrome — backgrounds, borders, dividers, label text, hover
states — that break in the opposite theme and need explicit `isDarkMode`
handling.

### Reference implementation

`NetViewHeader.tsx`'s command bar (see "Net View Toolbar" below) — the
strip's background, top/bottom border, group divider, hover state, label
text, and neutral gray icons are all gated on `isDarkMode`; brand-hued icons
are left unconditional.

### Before shipping

Toggle dark mode and check the new UI in both modes before considering a
change done — do not assume a literal color "probably" works in the other
theme just because it looked right in whichever mode you happened to be
testing in.

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

```tsx
const touchStartX = useRef<number | null>(null);
const touchStartY = useRef<number | null>(null);

const handleTouchStart = (e: React.TouchEvent) => {
  touchStartX.current = e.touches[0].clientX;
  touchStartY.current = e.touches[0].clientY;
};

const handleTouchEnd = (e: React.TouchEvent) => {
  if (touchStartX.current === null || touchStartY.current === null) return;
  const deltaX = e.changedTouches[0].clientX - touchStartX.current;
  const deltaY = e.changedTouches[0].clientY - touchStartY.current;
  touchStartX.current = null;
  touchStartY.current = null;
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
  description itself) toggles an expanded description block below the title
  row. Collapsed by default on every page load.
- **Status/stat/frequency chip cluster** — `flex:0 0 auto; ml:auto`, right end
  of the row. Same chip set as before the redesign (status, edit-times pencil,
  countdown, duration, stations, rechecks, checked out, online, guests) **plus
  the frequency chips**, which moved here from their own row below the
  toolbar. This consolidation — not a separate chip row — is what lets the
  table/chat panel headers line up.

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

**Information group** (left) — Bulk add, Search, Map, Audio, Stats, Script,
Announcements, Notes, Topics, Website, Net info, Import, then the `More`
button for whatever didn't fit.

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

### Item rendering rules (`ChangelogNotification.tsx`)

Every changelog item renders with a tinted background box regardless of
`userImpact`. The `userImpact` flag controls two things only: bold text and the
"User Impact" chip. Do **not** make the background conditional on `userImpact` —
all items should have uniform visual treatment.

{% raw %}
```tsx
// Correct — background always applied
sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.08), borderRadius: 1, ... }}

// Wrong — creates inconsistent appearance for non-userImpact items
...(item.userImpact && { backgroundColor: ... })
```
{% endraw %}

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
