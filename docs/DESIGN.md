# ECTLogger UI Design Reference

This document records established UI patterns, conventions, and design principles.
Consult it before adding new UI elements so the app stays visually coherent.

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

## Floating Action Buttons (FABs)

FABs appear at the bottom-right of pages that have primary creation/navigation actions.

### Sizing
All FABs use the MUI default size (`large`, 56 px). Do **not** set `size="medium"`
or `size="small"` on any FAB — this was a prior inconsistency that has been
corrected. The default large size gives a consistent 56 px touch target across
the app.

```tsx
// Correct
<Fab color="primary" aria-label="create net" sx={{ position: 'fixed', bottom: 16, right: 16 }}>
  <AddIcon />
</Fab>

// Wrong — do not mix explicit size on some but not others
<Fab size="medium" ...>
```

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

## Net View Toolbar (NetView.tsx)

The per-net toolbar lives in the `Grid item md={4}` column on the right-hand
side of the net header. It is organized into **two stacked rows**.

### Row 1 — Net Operations

Contains buttons that change the **state** of the net or the **user's
participation** in it. These are time-sensitive, action-oriented controls.

| Button | Condition |
|---|---|
| Start Net | `canStartNet` && status is draft/scheduled |
| Topic/Poll warning | `needsTopicPollConfig()` && same condition |
| Edit net settings | `canManage` && status is draft/scheduled or active/lobby |
| Assign/manage roles | `canManage` && status is draft/scheduled or active/lobby |
| Bulk check-in | `canManage` && active/lobby && check-ins exist |
| Search check-ins | Check-ins exist |
| View map | Check-ins exist |
| Listen to audio | Check-ins exist && `net.stream_url` set |
| Net statistics | Check-ins exist |
| View net script | Check-ins exist && `net.script` set |
| Announcements | Check-ins exist && `net.announcements` set |
| Prior topics | Check-ins exist && `net.template_id` set |
| Net/Club website | `net.info_url` set |
| View net info | Non-manager view (no canManage active/lobby) |
| Claim NCS | `canManage` && active/lobby && no NCS assigned |
| Check in / Check out | Authenticated user && active/lobby |
| Go Live | `canManage` && status is lobby |
| Close net | `canManage` && active/lobby |

### Row 2 — Net Functions

Contains buttons that act on **data** — exporting, importing, generating
reports, and lifecycle transitions (archive, delete). These are lower-urgency
and appear below the operational row.

| Button | Condition |
|---|---|
| Export CSV | Status is closed or archived |
| Import CSV | `canManage` && status is active, lobby, closed, or archived |
| Download ICS-309 | Status is closed or archived |
| Generate PDF Report | Status is closed or archived |
| Archive net | `canManage` && status is closed |
| Delete net (admin) | `isAdmin` && status is closed |
| Unarchive net | `canManage` && status is archived |
| Delete net (manager) | `canManage` && status is draft or archived |

### Decision rule for new buttons

> **Ask: does this button change what the net is doing right now, or does it
> act on the net's data?**
>
> - **Operational action** (start, stop, check in, manage who's on the net,
>   navigate to a live view) → **Row 1**
> - **Data action** (export, import, generate a report, archive, delete) →
>   **Row 2**

Row 2 is visually absent for draft/scheduled nets (no data actions apply) and
collapses to just the Import button for active/lobby nets where the manager has
no export yet available.

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
```tsx
<Paper sx={{ p: { xs: 2, sm: 4 } }}>
```

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
