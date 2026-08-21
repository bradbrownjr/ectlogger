# Public Service Event Support — Design Notes

Last updated: 2026-08-19

This document locks the vocabulary, data model, API surface, frontend surface, and build
sequence for the **Public Service Event Support** roadmap item. It exists because public
service events — marathons, bicycle rides, dog sled races, parades — are a different kind of
net from the ARES exercises and SKYWARN spotter nets ECTLogger was built for, and the
difference is structural rather than cosmetic.

Related references:

- [docs/ROADMAP.md](../ROADMAP.md) > Milestone 1 > Public Service Event Support — the scope
  and phasing this document builds on.
- [docs/DEVELOPMENT.md](../DEVELOPMENT.md) — router-facade pattern, frontend component-split
  pattern, migration template, Date & Time Handling.
- [docs/DESIGN.md](../DESIGN.md) — read before building any UI listed in section 5.
- [docs/concepts/TEAM-MANAGEMENT-NOTES.md](TEAM-MANAGEMENT-NOTES.md) — the neighboring
  module. Section 9 below states the binding boundary between the two.

---

## 0. Positioning constraint (binding on everything below)

In a weather or emergency net, a station is a person: one operator, one callsign, one
check-in row, and the callsign column identifies both the licensee and the station.

In a public service event, a **station is a place**. "AID 3" is a folding table at mile 14
that exists from 06:30 to 16:00 and is worked by whoever is standing there. Over a
fourteen-hour bike ride, three different licensed operators may sit at it. Over a four-day
sled race, a dozen might.

Two consequences shape every decision in this document:

1. **The position and the operator are separate facts, and both must be recorded.** The
   position is what the net calls on the air. The operator is who gets credit for the work
   and who is legally responsible for the transmission — FCC 97.119 permits tactical calls
   but still requires each station to identify with its own FCC callsign every ten minutes
   and at the end of each communication. A log that records only one of the two is either
   useless for credit or non-compliant as a record.
2. **The event manager is a distinct user with distinct needs.** They are not running the
   net; they are staffing it. Their work happens weeks before the event (define positions,
   recruit, assign, chase gaps), on the morning of (who showed up, who did not), and after
   (hours, mileage, forms). None of that surface exists today.

ECTLogger does not become a general volunteer-management platform. It manages the
communications positions of an event and the operators who staff them.

---

## 1. Vocabulary — and the words that are already taken

Five candidate words are already spent in this codebase and must not be reused. This is not
style preference; each one already means something specific to existing code or existing
users:

| Word | Already means | Where |
|---|---|---|
| coverage | RF propagation, station-to-station "can hear" reports | `CanHearReport` (`models.py:399`), `netview/CoveragePanel.tsx`, `profile/CoverageTab.tsx`, `NetReport.tsx:1454`, the `?tab=coverage` query param |
| tactical callsign | a **per-person** alias list, not a position | `User.callsigns` (`models.py:99`), labeled "tactical" in `profile/ProfileTab.tsx:126` |
| operating position | Home / Field Deployed RF classifier | `CheckIn.operating_position` (`models.py:376`), set only from `CanHearDialog.tsx` |
| staff | the NCS eligibility pool for a schedule | `TemplateStaff` (`models.py:729`) |
| position (as a column) | rotation sort order, an integer | `NCSRotationMember.position` (`models.py:757`) |

The chosen nouns are **Post** and **Shift**. A post is the place a person is assigned to
stand and operate; a shift is a block of time someone covers it. Both are unused in this
codebase, and both are the words volunteers actually use at these events.

| Concept | Model | Table | API | UI label |
|---|---|---|---|---|
| Post on the reusable event plan | `EventPost` | `event_posts` | `/templates/{template_id}/posts` | Event Posts |
| Post on one net | `NetPost` | `net_posts` | `/nets/{net_id}/posts` | Post |
| The tactical string itself | `NetPost.designator` | column | — | Post Designator |
| A staffing time block | `NetPostShift` | `net_post_shifts` | `/nets/{net_id}/posts/{post_id}/shifts` | Shift |
| Notification deduplication | `NetPostReminderLog` | `net_post_reminder_logs` | — | — |
| The planning grid | — | — | `/nets/:netId/posts` | Assignment Board |
| Unstaffed intervals | computed, no table | — | `GET /nets/{net_id}/posts/gaps` | Staffing Gaps |

**Never use a bare `post` identifier in backend code.** Always `net_post` or `event_post` —
`post_system_message` already exists at `main.py:243`, and a bare `post` reads as the HTTP
verb in review.

### 1.1 Resolving the `User.callsigns` collision

`User.callsigns` is a JSON list of a person's secondary callsigns, and the Profile UI
currently invites users to put tactical calls in it. That is a problem, because check-in
auto-linking searches it (`check_ins.py:107-118`): a user who listed "AID3" in their profile
would be auto-linked to every check-in at that post, on every net, forever, and would collect
another operator's statistics.

Three actions, of which the second is binding:

1. **Relabel.** `profile/ProfileTab.tsx:120-126` reads "Add other callsigns you use (Amateur
   Radio, GMRS, tactical, etc.)". Drop "tactical" and retitle to **Alias Callsigns**, helper
   text "secondary licenses, GMRS, club calls". The field is a person alias list and never a
   post.
2. **Precedence rule (binding).** In `check_ins.py:107-118`, if the submitted callsign
   case-insensitively equals a `net_posts.designator` row for this net, the post branch
   resolves it and the alias auto-link is **not attempted**. This costs one indexed lookup
   that Phase 1 already performs.
3. **Advisory warning** in the post editor when a new designator matches any user's alias.
   Warn, never block — designators are event-scoped and a manager must not be blocked by a
   stranger's profile.

---

## 2. Decisions

### D1 — An event is a `NetTemplate` plus one `Net` per operational period

No new top-level `Event` entity. `NetTemplate` is the reusable **event plan** ("Mount
Washington Century"), carrying the post list year over year. `Net` is **one ICS operational
period**. A four-day sled race is four nets from one template.

This reuses the entire existing scheduler, subscription, permission, notification, and
reporting stack rather than building a parallel one. It also matches ICS practice, where the
operational period is the unit that assignment lists and communications plans are written
for.

The cost is real and is recorded here rather than hidden: for a multi-day event, "the event"
exists only as several nets sharing a `template_id`. There is no single object to hang an
event-wide roster or budget on. A cross-net series view is Phase 6, built as a query over
`Net.template_id`, not a new table. If that proves insufficient in practice, extracting an
`Event` entity later is a migration, not a redesign, because the plan already lives on the
template.

### D2 — Shifts are materialized rows, not a computed rotation

This deliberately diverges from the NCS rotation, and the reason matters.

The NCS rotation stores no assignment rows at all (`routers/ncs_schedule.py:148-292`). That
is correct **there**, because NCS duty is a one-dimensional problem with a generating
function: one duty slot per occurrence, occurrences produced by `dateutil.rrule`, assignee is
elapsed-occurrence-index modulo active-member-count, and exceptions are sparse
`NCSScheduleOverride` rows. State is tiny and always re-derivable, and editing the roster
correctly re-flows the whole future.

An event is a two-dimensional sparse assignment with **no generating function**:

- Shift boundaries differ per post. Aid stations open at 06:30, SWEEP starts at 11:00,
  COMMAND runs the full fourteen hours. No recurrence rule emits that.
- Every assignment is individually negotiated. There is no rotation order to advance.
- Every assignment carries mutable state that cannot be recomputed from anything:
  accepted or declined, responded-at, signed-in-at, signed-out-at, mileage, no-show. A
  computed model has nowhere to put these.
- **Accountability is a safety requirement.** "Who was on AID 3 at 13:42" must stay
  answerable after the plan has been edited. A computed schedule can only answer "who is on
  AID 3 at 13:42 according to the current plan", which is a different question and the wrong
  one after the fact.

Gap detection also gets cheaper. `ncs_reminder_service.py::_is_occurrence_staffed`
(`:296-345`) carries a long defensive docstring precisely because the computed model made
"is this staffed?" expensive and untrustworthy. With materialized shifts the same question is
one indexed range query.

**Decision: materialize `NetPostShift` rows.** `EventPost.default_shift_pattern` seeds them
through a bulk-create endpoint but never governs them afterward. The template proposes; the
net owns the truth.

### D3 — The check-in row carries the operator's FCC callsign, and references the post

When AID 3 is worked by K1ABC from 08:00 to 12:00 and W1XYZ from 12:00 to 16:00, that is
**two root check-in rows**, each with `callsign` set to that operator's own FCC callsign, both
carrying `net_post_id` and `post_designator = "AID 3"`.

Rejected: putting the tactical string in `callsign` with a separate `operator_user_id` FK.

**Why the FCC callsign must be in the `callsign` column — operator credit.** The statistics
layer is callsign-string keyed, not user-id keyed. `statistics_user.py:150-155` selects
check-ins where `CheckIn.callsign` is in the user's callsign set (assembled at `:117-129`
from primary, GMRS, alias, and previous callsigns), and `statistics_net.py:115-143` groups
top operators on `checkin.callsign`. Putting the operator's real call in that column makes
credit work with **zero changes to the statistics layer**. The rejected alternative would
give an operator no credit at all until both files were rewritten — and worse, would hand
every hour ever worked at "AID3" to whichever user happened to list it as an alias.

**Why it must not be the tactical string — recheck corruption.** Recheck dedup keys on
`net_id` plus `callsign` string equality (`check_ins.py:83-105`), and on a match it reuses the
root row's `name` and `location` (`:126-149`). With the tactical string in `callsign`, W1XYZ
arriving at 12:03 would be classified as a **recheck of AID 3**, would silently inherit
K1ABC's name and location into their own row, and would announce "AID 3 has rechecked" in
chat (`:190-200`). That is data corruption, and it rules the alternative out on engineering
grounds independent of the legal argument.

**Why it is also the correct record.** FCC 97.119 permits tactical calls but makes the
FCC-assigned callsign the identifier of record. Storing the licensee in the identifying
column and the tactical designator as an ancillary label preserves that relationship. Every
line of the resulting log names a licensee.

Related behavior that follows:

- The existing rejection of a second live check-in for an already-checked-in callsign
  (`check_ins.py:96-105`) is untouched and now correctly means "K1ABC is already checked in".
- Contact auto-create (`check_ins.py:230-250`) fires only when no user is linked. Today
  "AID3" creates a permanent phantom `Contact` that pollutes autocomplete on every event.
  Under this design, an unregistered but licensed volunteer creates a genuine contact on
  their real callsign, which is desirable and feeds the existing invite flow. Add one guard:
  skip contact auto-create when the submitted callsign matches a post designator for the net.
- ICS-309 `from_station` for check-in rows (`nets_export.py:304`) renders `AID 3 / K1ABC` when
  a designator is present, and byte-identically to today when it is not. That is literally how
  a paper ICS-309 is filled out at these events. The second `from_station` at `:315` is the
  chat-message row and is **not** affected.

### D4 — Unlicensed volunteers get a shift, never a check-in

An unlicensed volunteer — a SAG driver, a race official being shadowed, a rest-stop captain —
produces a `NetPostShift` and appears on the assignment board, the live board, the
sign-in/sign-out accountability record, and the hours report. They do **not** get a
`CheckIn` row, because they are not operating a station.

This keeps the amateur log an accurate radio log, keeps the `^[A-Z0-9/]+$` callsign contract
intact, and still satisfies the safety requirement of knowing where every volunteer is —
because that requirement is served by the shift sign-in board, not by the radio log.

If an unlicensed volunteer transmits on a non-amateur service, `volunteer_callsign` holds
that identifier and a check-in is created under it. `User.gmrs_callsign` (`models.py:98`)
already precedents non-amateur identifiers in this log.

The known cost: the live post board and the check-in list will disagree about who is
physically present. The board is the authority on presence; the log is the authority on
transmission. The UI must not blur them.

### D5 — Two tables for posts, not one with two nullable foreign keys

`EventPost` (template-scoped) and `NetPost` (net-scoped) are separate tables with the same
shape. This matches the plan/instance split the codebase already uses
(`net_template_frequencies` versus `net_frequencies`, `TemplateStaff` versus `NetRole`), and
it keeps every foreign key non-nullable.

The decisive reason is that the net-side row must be an **immutable snapshot**. Renaming
"AID 3" to "AID 3 (Elm St)" on next year's plan must not rewrite last year's log, which is an
ICS record that may already have been filed with an emergency management agency.

### D6 — Overlapping shifts at one post are a warning, never an error

Two operators legitimately overlap during a handoff, and during training a new volunteer
shadows an experienced one. `min_operators` on the post carries the actual staffing
requirement; overlap carries none. The API returns overlap as a warning in the response body
and never a 400.

---

## 3. Locked data model

### 3.1 New enums

Added to `backend/app/models.py` near `StationStatus` (`:49-58`).

`PostCategory` — presentational (icon, grouping, ICS-205 sort order) except `SHADOW`, which
activates the `shadows_role` field:

`NET_CONTROL`, `COMMAND`, `START_FINISH`, `AID`, `CHECKPOINT`, `MEDICAL`, `TRANSPORT`,
`SWEEP`, `SHADOW`, `COURSE`, `LOGISTICS`, `OTHER`.

`ShiftStatus` — behavioral. Gap detection counts `OFFERED`, `ACCEPTED`, and `ON_DUTY` as
covering:

`UNFILLED`, `OFFERED`, `ACCEPTED`, `DECLINED`, `ON_DUTY`, `RELIEVED`, `NO_SHOW`, `CANCELLED`.

### 3.2 `net_posts` — a post on one net (Phase 1)

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK, index | |
| `net_id` | FK `nets.id` CASCADE, not null, index | |
| `source_post_id` | FK `event_posts.id` SET NULL, nullable | added Phase 4 |
| `designator` | String(32), not null | "AID 3" — spaces are legal here |
| `short_name` | String(16), nullable | "A3", for grid row labels |
| `description` | String(500), nullable | |
| `category` | Enum `PostCategory`, not null, default `OTHER` | |
| `sort_order` | Integer, not null, default 100 | |
| `location_text` | String(255), nullable | "Mile 8, Rt 3 and Elm" |
| `grid_square` | String(12), nullable | feeds the existing `CheckInMap` |
| `latitude` / `longitude` | Float, nullable | |
| `frequency_id` | FK `frequencies.id` SET NULL, nullable | ICS-205 primary |
| `alt_frequency_id` | FK `frequencies.id` SET NULL, nullable | ICS-205 alternate |
| `min_operators` | Integer, not null, default 1 | gap detection threshold |
| `requires_license` | Boolean, not null, default true | false permits an unlicensed volunteer |
| `shadows_role` | String(120), nullable | "Race Director", for `SHADOW` |
| `is_active` | Boolean, not null, default true | |
| `opened_at` / `closed_at` | DateTime(tz), nullable | first sign-in / post secured |
| `notes` | Text, nullable | |
| `created_at` / `updated_at` | DateTime(tz) | |

Constraints: unique on `(net_id, designator)` — this is what makes check-in resolution
deterministic and cheap. Index on `(net_id, sort_order)`.

Two foreign keys to `frequencies` means both relationships need explicit `foreign_keys=[...]`,
for the same reason `NCSScheduleOverride` does at `models.py:781-786`. Add
`Net.posts` alongside `can_hear_reports` (`models.py:215`) with
`cascade="all, delete-orphan"`.

### 3.3 `event_posts` — a post on the reusable plan (Phase 4)

Same columns as `net_posts`, with `template_id` (FK `net_templates.id` CASCADE, not null,
index) replacing `net_id`, without `source_post_id` / `opened_at` / `closed_at`, plus:

- `default_shift_pattern` — Text, nullable. JSON array of shift blocks expressed as **minute
  offsets from net start**, each with a label, a start offset, and an end offset. Offsets
  rather than absolute times, so the same plan works whether this year's race starts at 07:00
  or 08:30.

Unique on `(template_id, designator)`; index on `(template_id, sort_order)`.
`NetTemplate.posts` relationship added next to `staff` and `rotation_members`
(`models.py:270-272`).

### 3.4 `net_post_shifts` — the core table (Phase 2)

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK, index | |
| `net_post_id` | FK `net_posts.id` CASCADE, not null, index | |
| `user_id` | FK `users.id` SET NULL, nullable, index | see the two meanings below |
| `volunteer_name` | String(120), nullable | used when `user_id` is null |
| `volunteer_callsign` | String(20), nullable | FCC or GMRS call of an unregistered licensee |
| `volunteer_contact` | String(255), nullable | phone/email for day-of. PII — see section 10 |
| `is_licensed` | Boolean, not null, default true | |
| `starts_at` | DateTime(tz), not null, index | stored UTC |
| `ends_at` | DateTime(tz), not null | stored UTC |
| `status` | Enum `ShiftStatus`, not null, default `UNFILLED`, index | |
| `role_label` | String(50), nullable | "NCS", "Logger", "Shadow" — free text like `NetRole.role` |
| `responded_at` | DateTime(tz), nullable | accept/decline timestamp |
| `signed_in_at` / `signed_out_at` | DateTime(tz), nullable | |
| `signed_in_by_id` / `signed_out_by_id` | FK `users.id` SET NULL, nullable | mirrors `CheckIn.checked_in_by_id` |
| `check_in_id` | FK `check_ins.id` SET NULL, nullable | the check-in this sign-in created |
| `mileage` | Float, nullable | post-event reporting |
| `hours_override` | Float, nullable | manual correction for hour reporting |
| `notes` | Text, nullable | |
| `created_by_id` | FK `users.id` SET NULL, nullable | |
| `created_at` / `updated_at` | DateTime(tz) | |

Indexes on `(net_post_id, starts_at)` and `(user_id, starts_at)`. **No unique constraint on
the time window** — see D6.

Five foreign keys to `users` means all five relationships need explicit `foreign_keys=[...]`.

`user_id` being null carries **two distinct meanings**, disambiguated by `status`: with
status `UNFILLED` it is a planned gap; with any other status it is an unregistered person
carried inline via `volunteer_name` and `volunteer_callsign`.

### 3.5 `net_post_reminder_logs` — send deduplication (Phase 4)

Direct analog of `NCSReminderLog` (`models.py:788-802`): `shift_id` (FK CASCADE, not null),
`user_id` (FK CASCADE, nullable — null for manager-directed gap digests), `net_id` (FK
CASCADE, not null, index — for gap alerts not tied to one shift), `reminder_type` String(24),
`sent_at`.

Reminder types: `offer`, `24h`, `1h`, `gap_7d`, `gap_48h`, `gap_12h`, `no_show`,
`relief_due`.

The key is `(shift_id, user_id, reminder_type)` rather than `NCSReminderLog`'s
`(template_id, user_id, scheduled_date, type)`, because shifts are materialized and the row
id **is** the occurrence key. That simplification is a direct dividend of D2.

Unlike `NCSReminderLog`, add a real `UniqueConstraint` so the table is an atomic cross-process
lock, in the style of `WhatsNewSendLog` (`models.py:833-838`) whose docstring explains why
that matters under multiple uvicorn workers.

### 3.6 Additive columns on `check_ins` (Phase 1)

Inserted after `operating_position` (`models.py:376`):

- `net_post_id` — FK `net_posts.id` SET NULL, nullable, index.
- `post_designator` — String(32), nullable. A denormalized snapshot of the designator at log
  time.

The denormalization is deliberate. It survives post deletion, preserves the historical string
through a later rename, and keeps every export a single-table read — both
`nets_export.py:39-138` and `:246-350` iterate `net.check_ins` without joins. This is the same
reasoning by which `CheckIn.relayed_by` stores a callsign string rather than a foreign key.

`CheckIn.operating_position` stays fully independent. It is an RF classifier set from
`CanHearDialog.tsx`, and auto-setting it from a post assignment would corrupt propagation
reporting.

### 3.7 Migrations

Hand-numbered raw-sqlite3 scripts per `backend/migrations/README.md`, schema-only, guarded
with `PRAGMA table_info` as `060_add_traffic_log_handled_by.py` does. Highest existing is
`060_`.

- `061_add_net_posts.py` — create `net_posts` and its indexes; add `net_post_id` and
  `post_designator` to `check_ins`.
- `062_add_net_post_shifts.py`
- `063_add_event_posts.py`
- `064_add_post_reminders.py` — `net_post_reminder_logs` and `users.notify_shift_assignment`.

All additive. No data rewrite in any of them.

---

## 4. API surface

New routers, included into the existing facades rather than claiming new top-level prefixes.
`ncs_rotation.py` already precedents a nested `/templates/{template_id}/ncs-rotation` prefix.

**`backend/app/routers/nets_posts.py`** — included into the `nets.py` facade
(`routers/nets.py:17-21`):

- `GET|POST /nets/{net_id}/posts`, `PUT|DELETE /nets/{net_id}/posts/{post_id}`
- `PUT /nets/{net_id}/posts/reorder` — takes an ordered id list and writes `sort_order` by
  enumeration, copying `ncs_rotation.py:188-222` exactly, including the per-id scoping query
  that prevents cross-net writes
- `GET|POST /nets/{net_id}/posts/{post_id}/shifts`,
  `PUT|DELETE /nets/{net_id}/posts/{post_id}/shifts/{shift_id}`
- `POST /nets/{net_id}/posts/shifts/bulk` — apply a shift pattern across selected posts
- `GET /nets/{net_id}/posts/gaps?bucket=15`
- `POST /nets/{net_id}/posts/{post_id}/shifts/{shift_id}/sign-in` and `.../sign-out`

**`backend/app/routers/templates_posts.py`** — included into the `templates.py` facade:
CRUD and reorder for `event_posts` under `/templates/{template_id}/posts`, plus
`GET /templates/{template_id}/posts/hours` for cross-event hours on one plan.

**`backend/app/routers/nets_posts_export.py`** — `/nets/{net_id}/export/ics204`,
`/nets/{net_id}/export/ics205` (both `format=csv|json`), `/nets/{net_id}/posts/hours`.

**Unauthenticated:** `GET /shifts/respond` — tokenized accept/decline from an offer email.
See section 6.

**Permissions.** Net-scoped endpoints use `check_net_permission` (`permissions.py:45`);
template-scoped endpoints use `check_template_permission` (`:218`). Every handler resolves
its parent through an eager-loading `get_net_or_404` / `get_template_or_404` helper in the
style of `ncs_rotation.py:40-60`, to avoid N+1 queries when rendering a grid.

**Pure logic modules.** `backend/app/events/gaps.py` holds `compute_staffing_gaps(posts,
shifts, window_start, window_end, bucket_minutes)` with no FastAPI and no database imports,
following the convention `routers/ncs_schedule.py:1-7` states explicitly — extracted so it
can be unit-tested without a running database. It sweeps buckets counting shifts in a
covering status and emits merged intervals where the count is below the post's
`min_operators`.

---

## 5. Frontend surface

Read [docs/DESIGN.md](../DESIGN.md) before building any of this.

### 5.1 Assignment Board — a page, not a modal

`frontend/src/pages/EventPosts.tsx` at route `/nets/:netId/posts`, following the
`pages/Traffic.tsx` precedent that a domain gets its own page. A forty-row by fourteen-hour
grid does not belong in a dialog.

It adopts the `NCSStaffModal.tsx` data pattern — parent owns all state and a single
`fetchData()`, children under `components/event-posts/` are presentational, and visible tabs
are permission-gated. Two sub-tabs: **Posts** (define, edit, reorder) and **Shifts** (the
grid). Launchers sit alongside the existing NCS Staff buttons at `pages/Scheduler.tsx:715`
and `pages/Dashboard.tsx:1121`, plus a NetView toolbar button.

### 5.2 The station-by-time grid

`components/event-posts/PostShiftGrid.tsx`, built with CSS Grid.

**Do not add a calendar or gantt library.** `frontend/package.json` carries only
`date-fns@^3.2.0` and no calendar dependency. Every candidate (FullCalendar,
react-big-calendar, dhtmlx) is 100 to 400 kB, week/month-oriented rather than
resource-oriented, and would fight MUI theming — for a layout that is roughly sixty lines of
CSS.

- Rows are posts sorted by `sort_order`, grouped by category with sticky group headers. The
  row-header column is `position: sticky; left: 0`.
- Columns are fixed-width time buckets, default 30 minutes with a 15/30/60 selector. The axis
  spans the earliest shift start (or the net's scheduled start) to the latest shift end,
  rounded out to the bucket, and is **computed server-side in the net's timezone** — see the
  DST risk in section 10.
- Shifts render in a single absolutely-positioned overlay layer rather than per cell, placed
  by `differenceInMinutes` from `date-fns`. A background layer beneath draws gap hatching from
  the gaps endpoint and a "now" rule.
- Chip color encodes `ShiftStatus`; the chip shows callsign and name with the existing
  `UserAvatar.tsx`.

Interaction follows conventions this codebase already committed to. Click-drag across empty
cells opens the assign dialog prefilled with the post and a snapped time range. Reassigning
between posts uses native HTML5 drag-and-drop, matching
`components/ncs-staff/NCSStaffRotationTab.tsx:159-169`, with the optimistic-splice-then-refetch-on-failure
handling from `NCSStaffModal.tsx:577-593`. Arrow buttons and keyboard move/resize on a focused
chip are **required, not optional** — the rotation tab already established that drag-and-drop
must always have a button fallback, and a fourteen-hour grid without keyboard support is
unusable. On mobile (`hooks/useLayoutTier.ts`) the grid collapses to a per-post accordion of
shift cards; the grid is a desk-planning tool and the phone view is a reading tool.

Companion components: `PostRow.tsx`, `ShiftChip.tsx`, `AssignShiftDialog.tsx`,
`PostEditorTab.tsx`, `PostGapPanel.tsx`, `BulkShiftDialog.tsx`.

### 5.3 Live Post Board — a NetView side panel

`components/netview/PostBoardPanel.tsx`, registered exactly like `CoveragePanel` and
`TrafficPanel` in `NetViewSidePanels.tsx` — docked at `:304`/`:331`, floating at `:462`/`:500`
— with its own key in `utils/localStorageKeys.ts` and the same minimized/detached handling
described in the comment at `NetViewSidePanels.tsx:34-38`.

One row per post: designator, on-duty operator with avatar, shift clock ("2:14 remaining"),
relief-due badge, last-heard timestamp, sign-in and sign-out buttons, and a red **UNMANNED**
badge when `min_operators` is unmet right now. Unmanned posts sort first.

Live updates ride the existing net WebSocket as a new `post_board_update` message broadcast
through `manager.broadcast`, and must be included in the reconnect resync path documented in
DEVELOPMENT.md.

### 5.4 Check-in surfaces

The check-in dialog gains a **Post** autocomplete to the left of Callsign. Selecting a post
prefills the callsign from the shift covering the current time (status `ON_DUTY` preferred,
then `ACCEPTED`); where several overlap, offer a two-item choice; where no shift exists, the
callsign is simply typed. The logger types "AID 3" and K1ABC's call appears — the NCS never
has to know who is currently sitting there.

Rows render the designator first and the callsign second, tactical bold and primary: **AID 3**
followed by K1ABC. Tactical-first reading, FCC-correct storage. Touch points:
`components/netview/CheckInFormDialog.tsx`, `CheckInTable.tsx`, `CheckInMobileList.tsx`, and
the inline add row in `pages/NetView.tsx`.

A single shared render helper produces the "designator then callsign, or callsign alone"
string, so no surface can drift.

---

## 6. Notifications

`backend/app/event_post_reminder_service.py`, class `EventPostReminderService` with a module
singleton, `start()` and `stop()` wired into the `main.py` `lifespan()` alongside
`ncs_reminder_service` and `traffic_reminder_service`, polling every minute.

**Copy `_in_reminder_window` from `ncs_reminder_service.py:53-66` verbatim. Do not refactor
the existing services to share it in the same phase.** Its one-sided design is documented as
the fix for one-hour reminders firing ninety minutes early in production, and that comment
must survive.

| Step | Trigger | Type | Recipient |
|---|---|---|---|
| Assignment offers | manager publishes; shifts move `UNFILLED` to `OFFERED` | `offer` | assignee |
| Shift reminders | 24h and 1h before `starts_at`, status `OFFERED` or `ACCEPTED` | `24h`, `1h` | assignee |
| Staffing gap digest | 7d / 48h / 12h before net start, any post has a gap | `gap_7d`, `gap_48h`, `gap_12h` | net owner and co-managers |
| No-show flag | 15 min past `starts_at`, not signed in, status `ACCEPTED` | `no_show` | manager; also sets status and broadcasts |
| Relief due | 15 min before `ends_at` | `relief_due` | on-duty operator and incoming relief |

The gap digest is the direct analog of `_is_occurrence_staffed` (`:296-345`) — same purpose,
never let an unstaffed thing proceed silently — but one indexed query instead of a full
schedule recomputation, because shifts are materialized.

**Cross-service deduplication is mandatory.** An operator who is also the on-duty NCS must get
one "starting soon" email, not three. Extend the `ONE_HOUR_REMINDER_TYPES` mechanism
(`ncs_reminder_service.py:44-50`, `_already_reminded_1h` at `:651-670`) to consult
`NCSReminderLog` before sending a shift `1h` reminder. Precedence, enforced by loop order as
the existing comment prescribes: NCS duty, then shift assignment, then template staff, then
subscriber. Additionally dedupe on `(user_id, net_id, reminder_type)` so a volunteer holding
three consecutive shifts gets one reminder rather than three.

**Accept and decline without login.** Offer emails carry tokenized links built the way
`email/base.py` builds its unsubscribe URL, hitting `GET /shifts/respond` with a token and an
action, landing on `frontend/src/pages/ShiftResponse.tsx` modeled on `pages/Unsubscribe.tsx`.
Volunteers who will not create an account are exactly the volunteers a manager most needs to
hear back from. Tokens are single-use with a short expiry, and the endpoint confirms the
action on a landing page rather than mutating on a bare GET from an email scanner.

**Emails** live in `backend/app/email/events.py`, sibling of `reminders.py`, dispatched
through the `EmailService` facade. House rules from `email/reminders.py:8-135` apply: flat
scalar and list kwargs only, never ORM objects; inline-CSS `jinja2.Template`; urgency
branching for the 1-hour case; `get_unsubscribe_footer` on every send.

New preference `User.notify_shift_assignment`, placed with the other `notify_*` columns
(`models.py:124-131`), defaulting on for the same reason `notify_traffic_reminder` documents
at `:130` — it is an operational obligation, not a passive preference.

---

## 7. Sign-in, sign-out, and the NetRole bridge

Sign-in sets `signed_in_at`, `status = ON_DUTY`, and `signed_in_by_id`; for a licensed
operator it creates the linked check-in through the same path as normal check-in creation
(with `net_post_id` and `post_designator` set) and stores its id on the shift; it sets
`net_post.opened_at` if this is the first. Sign-out sets `signed_out_at`,
`status = RELIEVED`, and closes the linked check-in.

The assigned user may sign themselves in and out. NCS, logger, and the net owner may sign
**anyone** in or out — accountability requires the ability to log for a volunteer whose phone
is dead, so this is not optional.

**The bridge:** signing in to a `NET_CONTROL`-category post also creates or reactivates a
`NetRole(role='NCS', is_active=True)` (`models.py:323-338`). Without this, a marathon staffed
entirely through the post board would look permanently NCS-less to the net pause logic and
would auto-pause itself.

---

## 8. Exports and reporting

New `backend/app/events/` package, mirroring `backend/app/traffic/`.

- **ICS-204 (Assignment List)** — `events/ics204.py` exposes one dict builder shaped as the
  single source of truth, the way `_build_ics309_data` (`nets_export.py:246`) is, so CSV and
  PDF cannot drift. Incident name from the net; operational period from the net's start and
  close (falling back to scheduled start plus the planned window); one resource block per post
  with designator, location, category, assigned personnel per shift with names, callsigns and
  times, primary and alternate frequency, and special instructions from notes.
- **ICS-205 (Incident Radio Communications Plan)** — `events/ics205.py`, derived from each
  post's primary and alternate frequency joined to `Frequency`, whose existing `frequency`,
  `mode`, `network` and `talkgroup` fields (`models.py:305-312`) and `band` property
  (`:317-323`) already map onto the ICS-205 channel row, unioned with the net's own
  frequencies.
- **ICS-217** — skipped. It is the same frequency catalog at instance scope with no post
  relationship; adding it invites a whole comms-resource inventory. Parked in Phase 6.

ICS-204, ICS-205 and ICS-217 have zero hits in the codebase today, so the namespace is free.

PDF rendering uses `components/events/print/ICS204PrintView.tsx` and `ICS205PrintView.tsx` fed
by the JSON format and rendered through `utils/pdfExport.ts::exportElementToPdf` (`:315`) —
the exact mechanism `ICS309PrintView.tsx` uses today.

Roster and hours CSV are client-side, following the `CoveragePanel.tsx:127-152` precedent
where a shared row-builder feeds both the on-screen table and the download so they cannot
disagree. `components/event-posts/rosterRows.ts` exports `buildRosterRows` and
`buildHoursRows`.

**Hours per operator** sums the signed-in-to-signed-out duration, preferring `hours_override`
when set, grouped by user and falling back to `volunteer_callsign` then `volunteer_name`, with
total mileage and shift count. This is the hour-reporting feeder — but ECTLogger emits
per-event numbers only. See section 9.

Changes to existing exports (Phase 1): the check-in `from_station` in `_build_ics309_data`
(`nets_export.py:304`) becomes designator-and-callsign when a designator is present; the
net CSV gains a `Post` column between Callsign and Name (`:74-80` headers, `:96-118` rows);
CSV import (`services/csv_import.py:157`) accepts an optional `Post` header matched
case-insensitively to a designator, with unknown values collected as **warnings** to honor
that module's partial-parse philosophy. `pages/NetReport.tsx` gains a **Posts and Staffing**
section at `?tab=posts` carrying the per-post timeline, the hours and mileage table, the
sign-in audit trail, and gap history.

---

## 9. Boundary against Team Management

This is the single largest scope risk, because hours, contact details, rosters, and volunteer
records all look like the Teams module
([TEAM-MANAGEMENT-NOTES.md](TEAM-MANAGEMENT-NOTES.md)).

> **Events own per-event posts, shifts, sign-in and sign-out, and the hours produced by one
> event. Teams owns people, long-term membership, training records, and cross-event ARRL Form
> 2 and EMA rollups.**

Concretely:

- **Do not create a `volunteers` or `people` table.** Unregistered people live inline on
  `net_post_shifts`. If they later register, `Contact.user_id` already links them.
- Reuse `TemplateStaff` as the pool of registered users offerable for shifts, and `Contact`
  for known unregistered callsigns.
- Events export hours **for one event**. Teams sums them across events and produces the form.

Every new noun proposed for this feature should be tested against that sentence before it is
given a table.

---

## 10. Risks

**The `CheckIn.callsign` semantics change.** Every reader of that column changes meaning.
Audit and triage all of these before Phase 1 merges: `statistics_user.py:150`,
`statistics_net.py:115-143`, `nets_export.py:81-118` and `:304`, `check_ins.py:83-105`
(dedup), `:107-118` (auto-link), `:190-200` (system messages), `:230-250` (contact
auto-create), `services/csv_import.py:157`, `netview/CoverageReport.tsx`,
`components/SearchCheckIns.tsx`, `components/BulkCheckIn.tsx`. Mitigation: purely additive
columns, no data rewrite, and one shared render helper.

**Legacy tactical strings already in `callsign`.** They must render byte-identically forever,
and **a closed net's log is never rewritten** — it is an ICS record that may already have been
filed. The affected population is smaller than it looks: `CheckInBase.callsign`
(`schemas.py:762`) enforces `^[A-Z0-9/]+$` with `min_length=3, max_length=20`, so "AID 3" with
a space is a 422 on create today. Only rows written through `CheckInUpdate` (`schemas.py:813`,
which has no pattern and `max_length=50`) or CSV import could contain one. **That
inconsistency is itself a bug and Phase 1 closes it**, guarding the length reduction by
checking for existing over-length rows first. Adoption of historical strings is an opt-in,
human-confirmed tool in Phase 6, never a silent backfill.

**DST.** A fourteen-hour event crossing the November fallback produces a **twenty-five-hour
column axis**, and a naive minute-difference over stored UTC silently duplicates an hour.
Store UTC, compute the axis server-side in the net's timezone, and write a DST-crossing test
for both `compute_staffing_gaps` and the axis builder. This is the same class of bug the
comment at `ncs_reminder_service.py:53-66` documents having already been paid for once.

**Multi-day usability.** `_get_or_create_scheduled_net` only auto-creates roughly 24 hours
ahead — far too late for a three-day race planned six weeks out. Phase 4 must expose
"materialize the next N operational periods now", and Phase 6 must add carry-forward of a
roster between periods. Without both, the sled race that motivated this feature cannot use it.

**PII.** `volunteer_contact` holds phone numbers and email addresses for people who never
created an account and never consented to one. Strip it from every response unless the caller
holds NCS, logger, or manager permission; enforce that in the response schema rather than
per-router; and never emit it in participant-visible exports.

**Grid performance.** Forty posts by fourteen hours at fifteen-minute buckets is 2,240 cells,
and re-rendering per drag frame will stutter on the field laptops this is for. Memoize rows,
keep chips in the single overlay layer rather than per cell, and throttle drag preview to
`requestAnimationFrame`.

**A fourth polling service in `lifespan()`.** Fine at current scale, but worth noting.
Consolidating the reminder services into one scheduler tick should be its own roadmap item,
not smuggled into this feature.

---

## 11. Open questions

1. **Tokenized accept and decline without login** (section 6) — a large response-rate win
   from occasional volunteers, against a new unauthenticated mutation endpoint. Mitigations
   are known; the tradeoff needs an explicit call.
2. **Does a post's assigned frequency override the check-in's frequency, or only prefill it?**
   Leaning prefill, mirroring the existing prefill cascade at `check_ins.py:47-70`. Override
   would make ICS-205 and the log agree by construction, at the cost of hiding reality when
   someone works a different frequency.
3. **Whose timezone renders the Assignment Board?** Everywhere else the app renders in the
   viewer's preference. Recommending the **net's** timezone here, because staffing grids are
   read by a crowd standing in one place and a per-viewer axis means two managers on the phone
   see different column headers. This is a deliberate inconsistency and needs sign-off.
4. **Who is an event manager?** Reusing `check_template_permission` is cheapest but means
   every rotation member can edit the assignment plan. A distinct role is more correct and
   more work.
5. **Multi-day events** (D1) — confirm net-per-operational-period holds up before Phase 4
   builds the template-side plan on that assumption.

---

## 12. Phased build plan

Each phase is independently shippable. **Phase 1 alone satisfies the original request.**

### Phase 1 — Posts on a net, and honest operator credit

Define posts on a net, pick one when checking in, log the operator's real callsign, see who is
on which post, and export as designator-and-callsign. Migration `061_`.

### Phase 2 — Shifts, Assignment Board, gap detection

`net_post_shifts`, `events/gaps.py`, the grid page and its dialogs. Migration `062_`.

### Phase 3 — Live board, sign-in and sign-out, day-of accountability

The NetView panel, the sign-in endpoints, the `NetRole` bridge, and a `post_board_enabled`
opt-in toggle so ordinary weekly nets are untouched.

### Phase 4 — Reusable event plans and notifications

`event_posts` with default shift patterns, copy-on-create across **all three** net-creation
paths (`create_net_from_template` after its frequency copy, `clone_net`, and
`_get_or_create_scheduled_net`), the reminder service, and tokenized accept/decline.
Migrations `063_` and `064_`.

### Phase 5 — ICS-204, ICS-205, and hours reporting

The two builders, their print views, roster and hours CSV, and the Posts and Staffing section
of the net report.

### Phase 6 — Multi-day series, adoption, polish

Event-series rollup across nets sharing a template, carry-forward of a roster between
operational periods, the opt-in legacy adoption tool, per-post equipment checklists, and
ICS-217 if still wanted.
