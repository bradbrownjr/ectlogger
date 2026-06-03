# ECTLogger UI Design Reference

This document records established UI patterns and conventions. When adding new
features, consult this file to determine where UI elements belong and how they
should behave.

---

## Net View Toolbar (NetView.tsx)

The per-net toolbar lives in the `Grid item md={4}` column on the right-hand
side of the net header. Because the check-in table and chat panel each occupy
fixed columns, the toolbar cannot expand horizontally. To accommodate a growing
button set, the toolbar is organized into **two stacked rows**.

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

## Icon Buttons

All toolbar buttons use `size="small"` with `variant="outlined"` (or
`variant="contained"` for the primary affirmative action in each context, such
as Start, Go Live, Check In, and Close Net). All icon buttons carry a `<Tooltip>`
so users can hover to reveal the function. Never add a toolbar icon without a
tooltip.

Color conventions:
- **Default MUI primary/success/error/warning** — standard affirmative,
  destructive, or warning actions
- **Green `#4caf50`** — CSV export
- **Dark green `#2e7d32`** — CSV import
- **Teal `#009688`** — ICS-309 export
- **Orange `#ff9800`** — statistics
- **Purple `#9c27b0`** — audio stream, role management

---

## What's New / Changelog (`frontend/src/changelog.json`)

Add an entry to the **current release version** object whenever a user-facing
change ships. Section `type` values:

| Type | When to use |
|---|---|
| `feature` | Brand-new capability |
| `improvement` | UX/performance improvement to existing functionality |
| `fix` | Bug fix |

Entries are shown in priority order: `feature` → `improvement` → `fix`.
Keep item text to 1–2 sentences focused on user impact. Avoid internal
implementation details.
