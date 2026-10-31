# ECTLogger Development Guide

## Project Structure

```
ectlogger/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, rate limiting, WebSocket, routers
│   │   ├── config.py            # Pydantic Settings (reads backend/.env)
│   │   ├── database.py          # Async SQLAlchemy session factory
│   │   ├── models.py            # All SQLAlchemy ORM models
│   │   ├── schemas.py           # All Pydantic request/response schemas
│   │   ├── auth.py              # JWT creation and verification
│   │   ├── dependencies.py      # FastAPI dependency functions (get_current_user, etc.)
│   │   ├── permissions.py       # check_net_permission, check_template_permission
│   │   ├── security.py          # Input sanitization, rate-limit helpers
│   │   ├── session_config.py    # Session rolling-renewal logic
│   │   ├── email_service.py     # EmailService facade — assembles email/*.py
│   │   ├── email/               # base, auth, net_lifecycle, reminders, net_logs, digest
│   │   ├── ncs_reminder_service.py  # Background NCS reminder scheduler
│   │   ├── whats_new_service.py     # Background "What's New" digest scheduler
│   │   ├── logger.py            # Structured application logger
│   │   ├── utils.py             # Shared utility functions
│   │   ├── traffic/              # Assisted Traffic Handling domain logic (not a router —
│   │   │                         # reused by the traffic routers, ICS-309 export, and stats)
│   │   │   ├── definitions.py    # Startup upsert of form_definitions from definitions/*.json
│   │   │   ├── definitions/      # manifest.json, radiogram.json, ics213.json, arl_messages.json
│   │   │   ├── nts_text.py       # normalize_nts_text, count_nts_check (NTS_SUBSTITUTIONS)
│   │   │   ├── radiogram.py, ics213.py, formatters.py  # per-form-type formatting/parsing
│   │   │   ├── arl.py            # ARL numbered-message catalog loader
│   │   │   ├── promote.py        # Form.field_values -> promoted columns (subject, precedence, ...)
│   │   │   ├── log.py            # append_entry (chain-of-custody), derive_disposition,
│   │   │   │                     #   compute_net_traffic_counts (shared by the summary endpoint
│   │   │   │                     #   and the net-close email)
│   │   │   ├── visibility.py     # form_visibility_clause — the D3 visibility WHERE clause
│   │   │   └── ics309.py         # Metadata-only ICS-309 row builder (never the message body)
│   │   └── routers/             # See "Backend router-split (facade) pattern" below
│   │       ├── auth.py, users.py, check_ins.py, frequencies.py, chat.py,
│   │       │   settings.py, ncs_rotation.py, ncs_schedule.py, security.py,
│   │       │   geocode.py, contacts.py, feedback.py   # single-file routers
│   │       ├── nets.py            # facade — includes nets_{core,polls,export,roles}
│   │       ├── templates.py       # facade — includes templates_{core,merge,subscriptions,topics}
│   │       ├── traffic.py         # facade — includes traffic_{definitions,forms,export}
│   │       │                      # (traffic_log.py — chain-of-custody append endpoint,
│   │       │                      # inbox, import, reminders — is a later phase, not registered yet)
│   │       └── statistics.py      # facade — includes statistics_{global,net,user,geo}
│   ├── migrations/              # Sequentially numbered Python migration scripts (sqlite3 direct)
│   │                             # — see "Migration content guidelines" in migrations/README.md
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/           # See "Frontend component-split pattern" below
│   │   │   ├── UserAvatar.tsx, Navbar.tsx, ...      # standalone shared components
│   │   │   ├── admin/            # Admin.tsx's extracted tab components
│   │   │   ├── create-net/       # CreateNet.tsx's extracted tab components
│   │   │   ├── create-schedule/  # CreateSchedule.tsx's extracted tab components
│   │   │   ├── dashboard/        # Dashboard.tsx's extracted pieces (NetCard, ...)
│   │   │   ├── forms/            # Shared form panels (used by CreateNet + CreateSchedule)
│   │   │   ├── ncs-staff/        # NCSStaffModal.tsx's extracted tab components
│   │   │   ├── netview/          # NetView.tsx's extracted dialogs/panels/tables, incl. TrafficPanel.tsx
│   │   │   ├── profile/          # Profile.tsx's extracted tab components
│   │   │   ├── scheduler/        # Scheduler.tsx's extracted pieces (ScheduleCard, ...)
│   │   │   └── traffic/          # pages/Traffic.tsx's extracted components (FormRenderer,
│   │   │                         # RadiogramAssist, TrafficTable, TrafficDetail, ...)
│   │   ├── hooks/                # useLocalStorage, useDialog, useApiData, useSortableTable,
│   │   │                         # useFavorites, useNetData, useNetWebSocket, useUserStats
│   │   ├── contexts/             # React contexts (AuthContext, ThemeContext, LocationContext)
│   │   ├── pages/                # Full-page components (one file per route) — the "smart"
│   │   │                         # controller that owns page-level state and data fetching
│   │   ├── services/
│   │   │   └── api.ts            # Axios client, all API call functions
│   │   ├── utils/                # dateUtils, pdfExport, userDisplay, apiErrors, etc.
│   │   ├── App.tsx               # Router, theme, global layout
│   │   ├── changelog.json        # Single source of truth for What's New content
│   │   └── main.tsx              # React entry point
│   └── public/
│       └── maintenance.html     # Static maintenance page (no JS framework)
├── docs/                        # All documentation
│   ├── DESIGN.md                # UI patterns and conventions — read before adding UI
│   ├── CHANGELOG.md             # Human-readable changelog
│   ├── ROADMAP.md               # Canonical feature roadmap
│   ├── PRODUCTION-DEPLOYMENT.md
│   ├── QUICKSTART.md
│   ├── start/ operators/ net-control/   # The documentation site's audience paths
│   ├── net-managers/ admins/ reference/ about/
│   └── img/                     # Figures, regenerated by scripts/docs-screenshots/run.sh
├── backend/.env                 # Local config (gitignored); copy from .env.example
├── run.sh                       # Consolidated operational script (start/update/maintenance)
├── start.sh                     # Still what install.sh, install-service.sh and the systemd unit run
├── update.sh                    # Still invoked by run.sh --update
├── install.sh                   # One-time installation
├── configure.sh                 # One-time Caddy/env configuration
└── install-service.sh           # One-time systemd service installation
```

---

## Backend router-split (facade) pattern

Three routers outgrew a single file (`nets.py` at 2,207 lines, `templates.py` at
1,349, `statistics.py` at 1,022) and were split during Milestone 0.4. The split
files use a **facade**: the original filename becomes a thin file that only
imports and assembles sub-routers, so every route keeps its original URL and
import path (`from app.routers.nets import router` still works) — nothing
outside `routers/` needs to know the file was split.

```python
# routers/nets.py (facade — the whole file, give or take)
from fastapi import APIRouter
from app.routers.nets_core import router as nets_core_router
from app.routers.nets_polls import router as nets_polls_router
from app.routers.nets_export import router as nets_export_router
from app.routers.nets_roles import router as nets_roles_router

router = APIRouter(prefix="/nets", tags=["nets"])
router.include_router(nets_core_router)
router.include_router(nets_polls_router)
router.include_router(nets_export_router)
router.include_router(nets_roles_router)
```

**Adding a new endpoint to a split router:** add it to the sub-file whose
theme matches (e.g. a new net-export format goes in `nets_export.py`, not
`nets.py`). The facade needs no change unless you're adding a whole new
sub-router file.

**The trap that bit us once already:** anything that used to live in the
monolithic file (module-level tables, helper functions) and got imported
cross-file via `from app.routers.nets import X` breaks silently the moment
`nets.py` becomes a facade — `X` isn't defined there anymore, and Python
raises `ImportError` only when that code path actually *runs*, not at import
time or in a route-table diff. This is exactly what happened to
`net_frequencies` (defined in `app.models`, not `app.routers.nets`) after the
2026-07-04 split — see the "Post-split verification checklist" below, which
exists specifically to catch this.

## Frontend component-split pattern

Large pages (`NetView.tsx` was 5,410 lines, `Admin.tsx` 3,215) were split
during Milestone 0.4 into a `pages/<Page>.tsx` (kept as the "smart" page
controller — owns page-level state, data fetching, and permission logic) plus
`components/<page-kebab-case>/<Piece>.tsx` (the extracted, mostly-presentational
pieces) and `hooks/use<Thing>.ts` (extracted data-fetching effects).

**Deciding what to extract, and how self-contained to make it:**

- **Duplicated JSX blocks** (e.g. NetView's mobile/desktop/detached check-in
  tables) are the highest-value, lowest-risk extraction — unify them into one
  parameterized component so future edits can't silently drift between copies.
- **A tab/section whose state and handlers nothing else touches** (e.g.
  Profile.tsx's Activity tab, NCSStaffModal's swap dialog) should become a
  **fully self-contained component**: it calls its own hooks (`useAuth()`,
  `useNavigate()`, a data-fetching hook) and takes few or even zero props.
  Verify this by grepping the parent for every piece of that tab's state —
  if nothing outside the tab's own render function reads it, it's safe to
  localize.
- **A tab/section whose handlers ripple into other tabs' state** (e.g.
  NCSStaffModal's roster tab — removing a staffer also updates the rotation
  list and schedule entries) should **stay a thin presentational component**:
  keep the state and handlers in the parent page, pass them down as props.
  Forcing self-containment here would mean duplicating the cross-cutting
  logic or inventing a shared store — not worth it for a one-off page.
- **Purely visual, per-render UI state with no cross-component reader** (e.g.
  a drag-and-drop hover highlight) can be localized into a child component
  even when the *mutation* it triggers stays a parent-owned prop — the child
  just computes what to pass to that prop.
- Don't force a shared sub-component onto pieces that only *look* similar.
  NCSStaffModal's roster tab has three list variants (schedule staff, net
  rotation duty, plain net-role list) that share a presentational shape but
  differ enough in business logic that one forced shared component would
  obscure more than it saves — it stayed as one file with three branches.

**Verifying an extraction preserves behavior exactly:** read the target block
fully first, then extract with content copied verbatim (only type-annotation
changes allowed). After wiring up the new import, diff old vs. new with
whitespace/indentation normalized and confirm zero unexplained differences
before committing. `tsc --noEmit` must stay clean throughout.

**Where an extracted piece lives** — the point of splitting is reuse, not just
smaller files, so give each piece a home based on its reuse scope:

- **App-wide** → `hooks/` and the `components/` root: `useLocalStorage`,
  `useDialog`, `useApiData`, `useSortableTable`, `UserAvatar`.
- **Shared between specific pages** → also the `components/` root, named for
  the function rather than the page: `useFavorites` (Dashboard + Scheduler),
  `components/forms/` (the panels CreateNet and CreateSchedule would otherwise
  near-duplicate, which is exactly how those two pages used to drift apart).
- **Page-local** → a page subfolder (`components/netview/`,
  `components/admin/`). Local until a second consumer appears; promoting to
  the `components/` root later is a rename, not a rewrite.

Confirm a reuse fit at extraction time rather than assuming one — don't force
a premature abstraction (KISS).

**On file size:** the working target is roughly 800 lines per page or router,
but that number is a *proxy* for "a smaller model can edit this without
collateral damage," not a goal in itself. `NetView.tsx` stopped at ~2,289 lines
and `NCSStaffModal.tsx` at ~1,008 by deliberate decision: every duplicated or
real-time-risky surface had been extracted, and what remained was
page-controller glue (lifecycle handlers, each tied to a different already
extracted dialog) with a wide, heterogeneous dependency set and no clean seam.
Forcing those under 800 would have traded a legible line count for an
illegible boundary. Judge each file on whether its risky and duplicated
surfaces are extracted, not on the raw number.

## Post-split verification checklist

Whichever kind of split you're doing, after moving code out of a file:

1. **Route-table / component-render diff** confirms the *shape* survived
   (same endpoints registered, same JSX renders) — necessary but not
   sufficient.
2. **Grep the whole repo for cross-file imports of the old file**, not just
   the thing you moved:
   ```bash
   grep -rn "from app.routers.nets import\|from app\.routers\.templates import" backend/
   grep -rn "from '../pages/NetView'\|from '../pages/Profile'" frontend/src/
   ```
   Anything that imports a name from the split file that isn't actually
   *defined* in the new facade/thinned page will raise `ImportError` (backend)
   or a `tsc` error (frontend) — but only backend `ImportError`s are lazy
   (deferred until the function actually runs), which is why they slip past
   route-table diffing and can ship silently. `tsc --noEmit` catches the
   frontend equivalent immediately, so this step matters most on the backend.
3. **Add or confirm test coverage for the code path you touched.** A route
   that's registered but never exercised by a test can carry an `ImportError`
   in its body indefinitely — route-table diffing and manual click-throughs
   of the pages you're actively changing won't catch a regression in a
   feature you didn't think to re-test. If no test calls the endpoint/service
   method, add one before considering the split done.

---

## Net and schedule reports

The report layout itself is in `docs/DESIGN.md` "Reports". The mechanics
behind it:

- **The screen follows the theme; only the export is light.** Every PDF and
  PNG goes through `utils/pdfExport.ts`, which copies the element into a
  hidden same-origin iframe (every stylesheet copied in), recolors the copy
  for paper and captures that. Nothing on screen changes during an export,
  so a dark-mode user never sees the page flash white. A PDF's frame is the
  width of a US Letter page inside its margins (`PAPER_PX_PER_MM`, matched to
  the 780 px print views), and the frame's width is its viewport, so the
  page's own breakpoints lay the copy out for paper: a phone and a desktop
  export the same document. A PNG's frame is the element's own width.
  Where the copy is a different width from the screen, each Leaflet map is
  captured as it stands and swapped in as a picture (a map can't re-lay
  itself out in a copy), and each Recharts chart is resized through its SVG
  viewBox, enlarged by at most 1.6x. Before 2026-10-04 the copy was laid out
  at the screen's width and printed on A4, so a phone exported a long strip
  of phone-width pages.
- **Steering the copy.** An element can carry `data-export-hide` (left out),
  `data-export-show="<display>"` (hidden on screen, shown in the export), or
  `data-export-colors` (a JSON map of screen colors to print colors, applied
  to text, fills, borders, gradients and SVG fill/stroke inside it).
  `ReportPaper` uses the last to turn a dark-mode accent back into the logo's
  print color. The light pass also removes the dark map-tile class from the
  copy, repaints grey dark surfaces white, turns light text dark (dimmed
  secondary text to grey), and dark mode's translucent white rules to light
  grey.

- **Logo accent colors** are computed by `backend/app/logo_accent.py` from
  the file a `logo_url` points at, cached per path and modification time, and
  returned as `logo_accent_colors` on `NetResponse`, `NetTemplateResponse` and
  `GET /statistics/templates/{id}`. They are not stored: a net copies its
  schedule's `logo_url` string at creation, so a stored color would need
  copying at every creation path, and would go stale if a logo file were ever
  replaced by hand. Deriving from the file covers every logo ever uploaded
  with no backfill. A new response that shows a logo on a report should call
  `logo_accent_colors(logo_url)` the same way.
- **Page footers**: `exportToPdf` takes `pageFooter`, a label drawn with
  "Page X of Y" on every page after the pages are cut. It reserves a band at
  the bottom of each page, so the slicing accounts for it. jsPDF draws it, so
  it is in Helvetica, not the page font.
- **Social-media images**: `SocialSummaryImages` renders off-screen for the
  length of an Export PNG run. It measures page one (masthead, figures,
  graphs) and a continuation page with the real DOM, then gives the list as
  many 32 px rows per column as fit under a 1140 px page cap, so the final
  image (margins trimmed by `exportToPng`'s `trim`, plus the 32 px credit
  footer) stays within 4:5. Each page carries `data-social-page`, and
  `NetReport` captures them in order, then the map.
- **One net report**: the per-net statistics page has no PDF or PNG layout
  of its own. Its Export PDF and Export PNG open `/nets/{id}/report?export=pdf`
  or `?export=png`, and `NetReport` exports once the data and map tiles are ready (10 s cap on the tiles), then
  drops the parameter from the address.

---

## Who is credited as NCS

`services/ncs_attribution.py::load_ncs_rows` is the only answer to "who ran
this net", for the net card, report, ICS-309, closing email, schedule history
and the schedule's NCS leaderboard. Never count `NetRole` rows for credit
directly: until 2026-10-28 the leaderboard did, and scored stepped-down NCS
and rotation picks who never turned up.

- **Before and during a net, every active NCS is shown**, so the card names
  who is on duty. **Once it has ended** (`CLOSED`/`ARCHIVED`), an NCS counts
  only if they took part (`took_part_in`): a check-in under their account or
  callsign, a check-in they logged (`checked_in_by_id`), or a chat message.
- **Closing asks when that leaves nobody.** `ncs_needed` (someone checked in,
  nobody credited) gates `POST /nets/{id}/close` and `/send-log` through
  `nets_core.py::_settle_ncs`; the answer is a check-in id
  (`ncs_check_in_id`), recorded by `record_ncs_from_check_in` as a `NetRole`
  or, with no account, a `NetCallsignRole`. Only checked-in stations can be
  named, the same rule as `/callsign-roles`.
- **Auto-close can't ask**, so it holds the log, emails the managers once
  (`net_log_hold.ask_who_ran`), and sets `Net.log_hold_send_at` (migration
  093); `send_due_held_logs` sends it 24 hours later as it stands. A hold net
  control chose never sends itself.
- **No credit reads "Not recorded"** (`NCS_NOT_RECORDED`), never the net
  manager: the old fallback credited someone who may not have run it.

## Check-in maps

Every check-in map in the app plots from one pipeline:
`hooks/useMappedCheckIns.ts` parses each station's location (GPS, Maidenhead,
UTM and MGRS locally via `utils/locationParser.ts`; street addresses geocoded
through `backend/app/routers/geocode.py`) and returns `mapped`, `unmapped` and
`loading`. The consumers are `components/CheckInMap.tsx` (the live map, which
passes `enabled: open` because it stays mounted while closed),
`pages/NetReport.tsx` and `pages/NetStatistics.tsx`. The report and statistics
pages additionally share `utils/dualMap.ts`, which decides whether outliers
justify the cluster/overview split.

**How a station is drawn** is decided in `utils/checkInMarkers.ts`: the status
and role palette, the role split (`getMarkerRoleIds`), and each map's legend
(`buildMarkerLegend`, which lists only the colors actually on that map). The
palette is keyed to the real `StationStatus` vocabulary from
`backend/app/models.py` and nothing else -- both of the per-page copies it
replaced colored invented statuses ('TACTICAL', 'MONITORING', 'priority') and
so sent real ones to a default color. It is deliberately DOM-free so it can be
unit tested; the Leaflet icon factory lives next door in
`utils/checkInMarkerIcon.ts`, which needs `window`. The live map keeps its own
CSS-rotated marker *shape* (the report and statistics pins are SVG in an `img`
because html2canvas captures those reliably and inline SVG unreliably) but
draws it in the shared colors.

**Which stations get mapped is decided in the hook, never in a page.** Two
rules live there: checked-out stations *are* plotted (they took part in the
net, and the map is a record of participation), and there is *no* cap on how
many addresses get geocoded (rate limiting is serialized and cached
server-side). Both exist because these three files each carried their own copy
of the loop until 2026-09-18, and the copies drifted: the report silently
dropped checked-out stations while the other two kept them, so the same net's
report and statistics pages reported different station counts for the same map
(net 95: 10 vs 11), and the statistics page still had a 10-address geocode cap
that had already been found and removed elsewhere. A new map surface consumes
the hook; it does not filter `checkIns` on its way in.

### Live location: town plus grid

With location awareness on, `LocationContext.tsx` sends `PUT /users/me/location`
the grid square and the coordinates rounded to 2 decimal places (about 1 km).
The server reverse-geocodes them (`routers/geocode.py::reverse_geocode_town`,
sharing one rate limiter with the forward search: Nominatim allows 1 request
per second for the whole app) into `users.live_location_town`, formatted
`Town, ST` for the US, Canada, Australia and Mexico and `Town, Country`
elsewhere (`format_town`).

`services/live_location.py` is the one freshness rule (1 hour). Callsign lookup
fills in the town, or the grid if the lookup failed. A check-in keeps the grid in
`check_ins.grid_square` only when its location is that station's fresh live town
(`live_location_for_check_in`), decided server-side on create and on every
location edit, never accepted from a client, so the hover in
`components/netview/CheckInLocation.tsx` can never show a grid for somewhere
else. `useMappedCheckIns` maps `grid_square` ahead of `location`, so swapping the
grid for a town costs the map no precision.

---

## Stations, rechecks and logged contacts

Every check-in, recheck included, is its own `CheckIn` row, because each is a
timestamped event the ICS-309 and CSV export list. Everything that reads the
log as stations goes through one key and one grouping:

- **`services/station_place.py::station_place_key`** is `CALLSIGN|place`,
  where place is the site (`site:<id>`), `traveling`, the operating position,
  or else the lower-cased location. The frontend mirror is
  `utils/stationPlace.ts::stationPlaceKey`; keep the two in step
  (`tests/test_station_place.py`, `stationPlace.test.ts`).
- **`services/station_rows.py::group_station_rows`** turns a net's rows into
  one entry per key: `row` (newest), `rows` (oldest first, the timeline),
  `worked` (channels checked in on), `listed` (`available_frequencies` not yet
  worked) and `offline`. The check-in list, mobile list and report use the
  mirror `utils/stationRows.ts` (`groupStationRows`, `visibleStationRows`);
  the closing email uses the Python one. Statistics pages still count rows
  their own way and must not be switched to this grouping.
- **`StationChannelMark`** (migration 098) records a channel going offline for
  a station at its place, one row per outage, with `restored_at` closing it.
  A channel is never removed from a station, only marked
  (`routers/channel_marks.py`, NCS/Logger while the log is open).
- **Coverage saves are station-scoped.** Can-hear, outside contacts and
  repeater access are reconciled across `station_row_ids(db, check_in)`, every
  row at that station's place, so the dialog shows the same report from any
  of them. Before this, each row kept its own set and a recheck row looked
  empty (Known Issue #10).

**A logged check-in is two-way contact.** `site_coverage.check_in_contacts`
turns each check-in logged by someone else into a contact between the
station's row and the logger's own row live at that moment (matched on
`user_id == checked_in_by_id`), on the check-in's frequency. Self check-ins,
rows with no frequency or no recorded time, and a logger with no live row are
skipped. `station_reach` builds the directed edges from those plus can-hear
reports, keyed by station place, and `CanHearReportResponse.two_way` /
`two_way_by_check_in` come from it, so the coverage table, map and site
rollup agree.

**A time nobody wrote down.** While a log is held (closed with
`log_held_since`), `CheckInCreate.checked_in_at` sets a check-in's time from a
paper log, refused outside the net's own window. With no time the row gets
`time_not_recorded=True` (migration 097) and the net's close as
`checked_in_at` so it sorts last. Print its time with
`utils.check_in_time_for_net` (backend) or `netLog.ts::checkInTimeText`; both
print nothing for it, and time-based statistics leave it out.

**In person is remembered.** `CheckIn.in_person` (migration 099) is set from
status by the model's `@validates('status')` hook: In person sets it, Checked
out keeps it, anything else clears it. Checking out overwrites `status`, and
"no frequency" also matches radio check-ins logged without one (net 10 has
dozens), so neither can stand in for it. `build_ics309_rows` skips these rows;
they still count as taking part everywhere else. Tests:
`backend/tests/test_held_log_time.py`, `test_checkin_frequency_edit.py`, `test_check_in_contacts.py`,
`test_station_rows.py`.

## Coverage by site

A coverage drill with sites (an ARES SET) answers "which places can reach
each other", on top of the station-to-station `CanHearReport` rows. Migration
`083_coverage_sites.py` adds:

- `CoverageSite` (per net): `site_type` is `office`, `shelter`, `pod`,
  `staging`, `hospital`, `other` or `infrastructure`. Offices and shelters can be `is_primary` (what every
  other site is graded against). Infrastructure is a repeater or node: never
  primary, never a place a check-in is at, and the only type with a
  `frequency_id`. `routers/coverage_sites.py::save_coverage_sites` enforces
  all three rather than trusting the client.
- `CheckIn.coverage_site_id`: the site is stored per check-in **row**, not
  per callsign, so a team that checks out and rechecks from another shelter
  keeps each visit's results apart. Results are saved per station **place**
  (see "Stations, rechecks and logged contacts" below), not per row. `create_check_in` fills an empty location from
  `site_line()` so the station still geocodes.
- `CoverageAccess` (one row per reporter check-in and infrastructure site:
  reached, note) and `CoverageContact` (stations reached that never checked
  in, with county and state). Both are saved as whole sets per reporter, like
  can-hear reports, under the same `may_report_coverage_for` rule.
- `coverage_excluded_frequency_ids` (JSON list on `Net` and `NetTemplate`):
  repeaters and talkgroups left out of coverage reports. Saving a can-hear
  report or contact on one is a 400 (`validate_coverage_frequency`).

`services/site_coverage.py::build_site_coverage` is the one rollup, computed
at read time and never stored. Reports are grouped onto nodes (`site:{id}`,
or `station:{CALLSIGN}` for a check-in with no site), and each site's reach to
each primary is `two_way`, `relay` (one hop through a node both reached
two-way, on any frequency), `one_way` or `none`. The live panel
(`GET /nets/{id}/site-coverage`), the net report, and the closing email
(`describe_site_coverage`) all read it, so they cannot disagree. Frontend:
`hooks/useSiteCoverage.ts` fetches sites, contacts, access and the summary
together and refreshes on `can_hear_changed`; `SiteLocationField` is the
check-in Location box on every check-in form; `CanHearDialog` follows
late-loading contacts and access until the user edits that section, or Save
would erase what was already recorded. Tests:
`backend/tests/test_site_coverage.py`, `frontend/src/utils/coverageSites.test.ts`.

### Imported site lists and who sees them

An emergency management agency's shelter and POD lists arrive as
spreadsheets, laid out differently by each agency, and are **not public**: a
published list of possible shelters sends people to ones that aren't open.
Migration `085_coverage_site_details.py` adds `address`, `latitude`,
`longitude`, `notes`, `details` (the sheet's other columns, label to value,
JSON as Text) and `is_supported` (default true, so sites typed before it stay
public).

- **One visibility rule**, `services/site_coverage.py::coverage_site_in_use`:
  a site is in use when it is supported, primary, infrastructure, or has a
  check-in. `routers/coverage_sites.py::_site_list` gives net staff
  (`may_see_every_site` = `may_run_drill` or `may_edit_net`) every site with
  its notes and details, and everyone else (guests included) the sites in use
  with `notes`/`details` nulled. `load_site_coverage` filters to sites in use
  before the rollup, for everyone, so the panel, report and closing email
  never list an unused site. Never return `address`/`notes`/`details` from
  any other public read.
- **Placing a station at a site** (`check_ins.py::coverage_site_for_net`,
  shared by create, update, and the can-hear save's operating position):
  only net staff may use a site that isn't in use yet, and doing so puts it
  in use.
- **Reading the file**: `POST /nets/{id}/coverage-sites/read-file`
  (`may_edit_net`) returns rows of text and saves nothing; the column mapping
  happens in the browser (`utils/siteImport.ts`,
  `components/forms/ImportSitesDialog.tsx`) and the result goes through the
  ordinary `PUT`. xlsx is read with openpyxl `read_only=True,
  data_only=True` (cached values, formulas never evaluated), and
  `defusedxml` must be installed: openpyxl only guards against XML entity
  expansion attacks when it is, so the endpoint imports it and fails closed.
  Caps: 5 MB, 2,000 rows, 40 columns, 500 sites per net.
- **Drafts**: `utils/siteDrafts.ts` keeps the loaded name and place beside the
  editable one-line text, so an imported name containing a comma survives a
  save without being re-split. An import matches existing sites on name plus
  place, ignoring case (the backend refuses two sites with the same pair).
- Tests: `backend/tests/test_site_import.py`,
  `frontend/src/utils/siteImport.test.ts`.

## Drill plans

An exercise plan on one net (`DrillPlan`, `DrillObjective`, `DrillEvent`;
migration `084_drill_plans.py`; `routers/drill_plans.py`). One plan per net,
`net_id` unique. `PUT /nets/{id}/drill-plan` replaces the plan's objectives
and schedule rows, keeping rows sent with an `id`, like coverage sites.

- **Permissions** are two net actions: writing and rating the plan is
  `may_edit_net`; reading it and sending its messages is `may_run_drill`
  (`NetActions.run_drill`: managers, active NCS/Logger/Relay, schedule
  staff). Reads are deliberately not public: the schedule and the prepared
  messages are for the people running the drill.
- **A prepared message is ICS-213 field values on a row** (`DrillEvent.message`,
  JSON). `POST .../events/{id}/send` files it through
  `traffic_forms.file_form`, the same function behind `POST /traffic/forms`,
  as a `TrafficTestCategory.DRILL` form with the plan's exercise name as the
  incident name and the text wrapped by `app/traffic/exercise.py::mark_exercise_text`.
  The row keeps `form_id`; its status (`form_status`, `sent_at`) is read from
  that form's chain of custody on every read, never stored. A sent row's
  message can no longer be changed by a save.
- **Sites**: `DrillEvent.site_id` is the row's site (its packet, its sender),
  null for every site. Removing a coverage site clears it, since SQLite does
  not enforce the `SET NULL`.
- **Frontend**: `pages/DrillPlan.tsx` (`/nets/:netId/drill-plan`, opened in
  its own tab from the toolbar's Drill plan button when `has_drill_plan`,
  which only `get_net` fills in), `components/drill/DrillPlanEditor.tsx`,
  `components/drill/DrillPlanPrintView.tsx` (plan and site packets, captured
  by `utils/pdfExport.ts`), rules in `utils/drillPlan.ts`. The page polls
  every 30 s with `BACKGROUND_REQUEST_CONFIG` instead of a WebSocket event.
- **Teams**: this and coverage sites were built ahead of the Teams module;
  `docs/concepts/TEAM-MANAGEMENT-NOTES.md` "Built Ahead of Teams" says how
  each table migrates.

Tests: `backend/tests/test_drill_plans.py`, `frontend/src/utils/drillPlan.test.ts`.

## Participants-only nets and blocking a station

`Net.participants_only` (and `NetTemplate.participants_only`, copied by
`build_net_from_template` like every shared column; migration 090) is a
**label, not a gate**. Self check-in stays open because a drill's volunteers
aren't known until the day. The net view shows `ParticipantsOnlyChip`, and
`CheckInFormDialog` and the check-in prompt say who the net is for.

The enforcement is `NetBlock` (`routers/net_blocks.py`, rule
`permissions.may_block_station`, sent as `NetActions.block_station`):

- `POST /nets/{id}/blocks {check_in_id}` deletes every check-in under that
  callsign on the net, records the block, and applies the net-wide chat mute
  through `chat.apply_net_mute` / `announce_net_mute` (the same helpers the
  shift-click mute uses, so the activity log and the repeated-mute alert see
  it). Each removed row is broadcast as `check_in_deleted`.
- `create_check_in` refuses a blocked callsign, or any check-in from or for a
  blocked account, unless the submitter passes
  `check_net_permission(..., ["NCS", "LOGGER"])`: net control can still check
  the station in by hand. `services/net_blocks.py::blocked_on_net` is the
  one lookup.
- `DELETE /nets/{id}/blocks/{block_id}` lifts the block and the chat mute;
  the removed rows stay removed.

Blocks are per net, like `ChatNetMute`. The app offers **Remove and block**
in the delete prompt (`hooks/useDeleteCheckInPrompt.tsx`, awaited by
`checkInActions.ts::handleDeleteCheckIn`), and lists blocks with Unblock on
the Net info card. Tests: `backend/tests/test_net_blocks.py`.

## Check-in fields and profile values

A net turns its check-in fields on and off (`net.field_config`). Every
frontend path that builds a check-in payload passes it through
`utils/checkInFields.ts::withOnlyShownFields`, and callsign lookup fills
only shown fields. A value in a hidden field is one the NCS can't see or
clear, so it must never be sent: on 2026-09-29 a spotter number holding a
link was auto-filled into a hidden field, the spam guard rejected it, and
the form (which keeps its values after a failed save) refused every later
check-in too.

**Never type out the list of fields again.** Every form, the check-in list,
the phone list and inline edit go through
`utils/checkInFields.ts::DETAIL_FIELDS` (Spotter # through Notes;
Name and Location stay hand-placed because Site sits between them), and
the report's check-in log goes through `logColumns`. On the server, the
Export CSV, the closing email's table and CSV, and the ICS-309 email's
check-in CSV go through `services/check_in_columns.py`
(`net_log_fields`, `field_value`, `format_frequency`). A log shows a field
when the net turned it on and at least one check-in filled it in. Until
2026-10-29 each of these listed the fields by hand: Feedback had no box
anywhere, and the exports dropped custom fields such as FLDIGI (N1KWG's
net). The Export CSV keeps fixed built-in column names because the CSV
import matches on them; only custom-field columns and Frequency vary.

Profile values that get copied into check-ins are checked when the profile
is saved (`schemas.py::UserUpdate`): Name and Location reject a link or
email, and a spotter number must pass `utils.py::normalize_spotter_number`
(letters, digits, hyphens, spaces, up to 20; no per-state format, because
each NWS office assigns its own). The spotter rule sits on the Create/Update
schemas only, never on `CheckInBase`/`ContactBase`, because their Response
subclasses would then fail to read stored rows that predate the rule.

Admin field locks are one JSON list, `User.locked_fields`, drawn from
`models.py::LOCKABLE_USER_FIELDS` (migration 079 replaced the three
`*_locked` booleans). `update_my_profile` refuses a *change* to a locked
field, comparing through `_profile_value` so the Profile form's
whole-object resubmission of an unchanged value never trips it. A new
self-editable profile field should be added to `LOCKABLE_USER_FIELDS`, the
Edit User dialog, and `_LOCKED_FIELD_LABELS` together.

## UI Design Reference

Before adding any new UI element, read **[docs/DESIGN.md](DESIGN.md)**. It covers:
- Floating Action Button sizing and positioning rules
- Tab scrollability and swipe-to-switch pattern
- Icon color conventions for toolbar buttons
- Card action buttons (`CardActionButton`, management/standard row split,
  severity ordering, and the required `disableSpacing` on `CardActions`)
- Mobile touch targets and responsive breakpoints
- Net View toolbar row structure

---

## Starting the App

```bash
# Full stack — Linux/macOS
./run.sh                 # Interactive (prompts for update check)
./run.sh --service       # Systemd / headless mode
./start.sh               # What the installers and ectlogger.service still use

# Full stack — Windows
.\start.ps1

# Backend only
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend only
cd frontend && npm run dev
```

**URLs**: Frontend :3000 | Backend :8000 | API Docs :8000/docs

---

## Running the Test Suite

Run these checks before every commit (CI enforces the same steps on push to main).

**Backend (pytest):**

```bash
cd backend
pip install -r requirements.txt -r requirements-test.txt  # first time only
pytest
```

**Frontend (typecheck + lint + build):**

```bash
cd frontend
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint — must exit 0 (warnings are OK, errors are not)
npm run build       # vite build — confirms the bundle compiles
```

CI runs both jobs on every push via `.github/workflows/ci.yml`.

---

## Adding API Endpoints

1. Define Pydantic schemas in `schemas.py` with `Field()` validation
2. Add route in `routers/*.py` with `Depends(get_current_user)` and `Depends(get_db)`
3. Add client method in `frontend/src/services/api.ts`

Pattern for async DB queries (always eager-load to avoid lazy-load errors):
```python
result = await db.execute(
    select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
)
net = result.scalar_one_or_none()
```

Permission check helper:
```python
if not await check_net_permission(db, net, user, required_roles=["NCS", "LOGGER"]):
    raise HTTPException(status_code=403, detail="Permission denied")
```

**Repeatable query params (`status=a&status=b`).** A route can accept a list via
`status: Optional[List[NetStatus]] = Query(None)` — FastAPI parses both a single value and
repeated keys into a list, so existing single-status callers keep working unchanged. The catch
is on the frontend: axios's default array serialization (v1.x) turns `params: { status: ['a',
'b'] }` into `status[]=a&status[]=b`, which FastAPI does *not* bind to `List[...]` (it needs
bare repeated `status=a&status=b`). Build a `URLSearchParams` and `.append()` each value instead
of passing a plain array — axios passes a `URLSearchParams` instance through untouched. See
`netApi.listArchived` in `services/api.ts` (fetches both `archived` and `cancelled` nets this
way) and `list_nets` in `routers/nets_core.py`.

**Guest-readable net data.** A net's view and report pages are intentionally usable with no
account (see `docs/net-managers/reports-and-exports.md`, "This page needs no sign-in to view"), so
a GET that feeds either page should use `Depends(get_current_user_optional)` (`current_user:
Optional[User]`), not `Depends(get_current_user)`, unless the data is genuinely staff-only. When
a response includes free text a user typed (a check-in field, a chat message, an assembled
ICS-309 log entry), pass it through `redact_contact_info` (`app/utils.py`) whenever
`current_user is None` — it strips anything that looks like an email or phone number. A
callsign and licensee name are not redacted; both are already public via the FCC ULS. The
frontend's axios response interceptor (`services/api.ts`) only logs a user out on a 401 if a
token was actually being sent — a guest hitting a login-required resource should fail that one
request quietly, not get bounced off a page they're allowed to be on.

---

## Activity log

`models.AuditEvent` (migration 088) is the admin-only record of who did what, from
where: Admin > Activity, served by `routers/audit.py`. Write to it with
`app/audit.py::record_event`, or `record_net_event` / `record_schedule_event`, which
tag the net's or schedule's id and name for you.

- **Log anything that destroys a record, changes who may do what, or touches an
  account's sign-in.** Not routine net activity: check-ins and chat are already the
  net's own record. A new endpoint in one of those categories is not done until it
  writes an event.
- **Call it before the commit that makes the change, never after.** It only adds the
  row to the session, so a refused or rolled-back change leaves no event, and a
  committed change always has one.
- **Pass `actor=None` for the scheduler** (auto-close, auto-archive); the tab shows
  "Automatic".
- **Record changes as `details={"changes": {field: [old, new]}}`**, built with
  `field_changes(obj, new_values, fields)` before applying them. It drops fields
  that didn't change, so a form that resubmits every field logs nothing on an
  unchanged save.
- **The IP address and browser come from a context variable** that
  `main.py::security_middleware` sets from `security.get_client_ip`, so no route
  needs a `Request` parameter for it.
- **Every action needs a label** in `frontend/src/utils/activityLog.ts`.
  `tests/test_activity_log_labels.py` scans the backend for `record_*event(db,
  "<action>"` and fails on any action without one.
- **Retention:** `AuditPruneService` blanks `ip`/`user_agent` after 365 days and
  deletes rows after 3 years (`AUDIT_IP_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`;
  decided 2026-10-23, CNIL deliberation 2021-122 as the reference).
- **Deleting an account calls `forget_user`**, which clears its id from every event
  and keeps the labels. SQLite gives the next new account the highest id after a
  delete, which would otherwise inherit the deleted account's history.

### Changing an account's email

Every change of `User.email` goes through
`services/account_email.py::apply_email_change`. A magic-link account is found by
`(oauth_provider, oauth_id)` before email (`routers/auth.py::get_or_create_user`),
and `oauth_id` holds the address it signed up with. Setting only `User.email` leaves
a link sent to the old address still signing in to the account. Self-service changes
(`POST /auth/email-change/request`, then `/confirm` from the link) send a 24-hour
signed token to the new address. The token carries the old address, which makes it
single-use. Both steps refuse while an admin's Email padlock is on.

### Backup sign-in addresses

An account signs in with its primary address (`User.email`, where all mail goes)
or any of up to `MAX_BACKUP_EMAILS` (3) backups in `user_emails`
(`models.UserEmail`, migration 092). Rules, all in `services/account_email.py`:

- **Find an account by address with `find_user_by_email`**, never `User.email`
  alone: magic link (`get_or_create_user`), the banned check in
  `_send_magic_link`, password login, admin invite and contact invite all use it.
  **Check an address is free with `email_in_use`**, which covers both columns. No
  database constraint spans the two tables, so these two functions are the
  constraint.
- **`oauth_id` only ever holds the primary.** `get_or_create_user` updates it
  only when the address signed in with is the primary. A backup written there
  would keep matching the `(oauth_provider, oauth_id)` lookup after it was removed.
- A backup row exists only once confirmed: the pending state is the 24-hour token
  (`create_backup_email_token`, salt `backup-email`) emailed to it, and confirming
  is idempotent. Make primary swaps the row with `User.email`
  (`make_backup_primary`), so no address is dropped.
- Request, remove and make primary need the two-factor code when enabled
  (`routers/auth.py::_require_mfa_code`, shared with email change) and honour the
  Email padlock. Each is logged (`user.backup_email_*`) and emailed to every
  address on the account (`notify_sign_in_address_change`), plus the removed one.
- Backups get security notices only: failed-sign-in alerts and password changes
  go to `account_addresses(user)`; net logs, reminders and digests stay on
  `User.email`.
- `delete_user` deletes the rows explicitly; SQLite doesn't enforce the CASCADE.

### Merging accounts

`services/account_merge.py::merge_accounts(db, source, target)` folds a second
account into an original one (Admin > Users > Merge into, `POST
/users/{target}/merge`, preview at `GET /users/{target}/merge-preview`). It does not
hard-code tables: `user_columns()` reads every foreign key to `users.id` from the
models, so a new table is merged with no change. For each column it first deletes
the source rows the target already has an equivalent of (same values on the other
columns of any unique constraint, or of a `SOFT_UNIQUE` key for the tables that
hold one row per account without a constraint), then repoints the rest. The
activity log's `actor_user_id`/`subject_user_id` and the `mentioned_user_ids` JSON
on chat messages have no foreign key and are handled by name;
`tests/test_account_merge.py` fails if any other column that looks like an account
id lacks a foreign key. Blank profile fields on the target are filled from the
source (`FILLED_FIELDS`); passwords and two-factor never move. The source's
addresses become target backups (the 3-address limit applies to self-service adds
only), then the source is deleted. The endpoint needs a fresh admin TOTP code,
refuses a banned account and the admin's own, and logs `user.merged` with what
moved. Checked against a copy of production's database before shipping: 600
merges, no errors, no reference left behind.

`services/account_duplicates.py::find_possible_duplicates` (`GET /users/duplicates`,
the Users tab's **Possible duplicates** chip) finds the pairs to merge. Strong
matches flag a pair: same email ignoring case, an exact shared callsign
(primary/additional/previous), a callsign inside the other's email local part, or a
full name of two words or more. Weak matches only add a reason to a flagged pair:
a callsign that differs by /suffix (club station accounts such as WS1EC/HF) and a
shared `auth.signed_in` IP. The rule was set from production's accounts on
2026-10-27: first-name matches flagged 16 pairs of mostly different people, and
/suffix alone flagged the WS1EC station accounts; with the rule above it finds 5
pairs, all real. Fetched with the users list but not on its 30 s background poll.

**Account ids can be reused, so every token that names one is dated.** `users`
has no `AUTOINCREMENT`, so SQLite gives the next new account the highest id again
once that account is deleted or merged away. A sign-in token carries only `sub`
(the id), so before 2026-10-28 a browser still signed in to the old account would
have opened the new one. `create_access_token` now adds `iat`, and
`auth.py::token_issued_to` refuses a token issued before the account's
`created_at` (to the second). Every route, the optional-auth routes and the net
WebSocket resolve the account through `dependencies.py::user_from_token_payload`,
so never look a token's `sub` up directly. A token from before `iat` is dated
from its `exp` less the session lifetime and is replaced (same expiry, with
`iat`) through `X-New-Token` on its next request. Backup-address links are
checked the same way from their signing time. The email-change link didn't
need it: it carries the address being replaced, which a different account
doesn't have. Production had no reused id when this shipped.

### Security alerts and IP locations

`app/security_alerts.py` emails on patterns in the activity log, with thresholds in
`AppSettings.signin_alert_*` / `mute_alert_*` (migration 089, Admin > Security).

- **`check_failed_sign_ins(db, user, mfa)`** runs after an `auth.password_failed` or
  `auth.mfa_failed` event is committed. It counts both actions for the account in
  the window and emails the owner and every admin. A two-factor failure (`mfa=True`)
  alerts on the first, since the password was right.
- **`check_mutes(db, muted)`** runs after a personal or net-wide mute is committed,
  counts *different* people, and emails admins only. Never the muted station: a
  net-wide mute is a shadow mute.
- **Throttling is an event too.** Each alert writes `alert.failed_sign_ins` /
  `alert.muted_often` for the subject, and no second alert goes out while one exists
  inside the window. No separate state table.
- **Personal mutes are logged with `private=True`**, which drops the actor, IP and
  browser (the tab shows "Another station"). The muter is stored only as
  `audit.private_actor_code(user_id)`, an HMAC of the id under `SECRET_KEY`, so
  distinct people can be counted without naming anyone (Brad, 2026-10-23). Net-wide
  mutes are staff moderation and keep their actor; `check_mutes` turns that actor
  into the same code so one person counts once across both kinds.

`app/geoip.py` gives every event a `location` ("City, Region, CC") at write time from
DB-IP's IP to City Lite `.mmdb` (CC BY 4.0, read with `maxminddb`). The lookup is
local, so no address leaves the server. The file lives at `backend/data/geoip/`
(gitignored, `GEOIP_DB_PATH` overrides) and `AuditPruneService` refreshes it when it
is over 32 days old, unless `GEOIP_AUTO_DOWNLOAD=false`. A missing file means blank
locations, never an error. The license requires the "IP Geolocation by DB-IP" link
wherever locations are shown (`geoip.ATTRIBUTION_HTML`, and the caption under the
Activity tab). Pruning clears `location` together with `ip`.

---

## Database Migrations

Migrations are individual Python scripts in `backend/migrations/`. They use
`sqlite3` directly — no Alembic. The naming convention is `NNN_description.py`.

```bash
# Run on beta
ssh bradb@10.6.26.3 "cd /home/bradb/ectlogger && python3 backend/migrations/034_add_maintenance_banner.py"

# Run on production (activate venv first if the script imports SQLAlchemy)
ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && python3 backend/migrations/034_add_maintenance_banner.py"
```

Fresh installations do not run migrations — they get the current schema from `models.py` at startup.

Migration template:
```python
import sqlite3, os

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(my_table)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'new_column' not in columns:
            cursor.execute("ALTER TABLE my_table ADD COLUMN new_column TEXT")
        conn.commit()
        print("Migration NNN complete.")
    except Exception as e:
        conn.rollback(); raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
```

---

## AppSettings Singleton

Global settings live in a single `app_settings` row (id=1). Add new settings by:
1. Adding columns to `AppSettings` in `models.py`
2. Adding fields to `AppSettingsResponse` and `AppSettingsUpdate` in `schemas.py`
3. Updating `_build_settings_response()` and the `update_settings` handler in `routers/settings.py`
4. Writing a migration

Public settings (readable without auth) get a dedicated endpoint in `settings.py`;
admin-only settings go through the standard `GET /settings` / `PUT /settings` pair.

### Settings needed outside a request (in-process cache)

`gravatar_enabled` is read by `utils.get_avatar_url()`, which is called from
`UserResponse.from_orm()` — a **synchronous** serializer with no database session.
It therefore can't query `app_settings` at call time. The pattern used:

1. `utils.py` holds a module-level flag with `set_gravatar_enabled()` / `gravatar_is_enabled()`.
2. `main.py`'s lifespan primes it once at startup (`_load_gravatar_setting`), tolerating
   a database that predates the migration so an un-migrated instance still boots.
3. `routers/settings.py` calls the setter whenever an admin saves, so the cache
   never drifts from the stored value.

Use this only for settings genuinely needed outside request scope. It is per-process,
so a multi-process deployment updates the saving process immediately and the others on
their next restart — acceptable for a cosmetic switch, **not** acceptable for anything
security-relevant. Anything enforcing permissions must be read from the database inside
the request.

### Avatars and Gravatar

`get_avatar_url()` returns a Gravatar URL **without checking whether the image exists**.
This is deliberate and should not be "fixed" back:

- The old existence probe issued a blocking `urllib` HTTP HEAD to gravatar.com per user,
  ~150-200 ms each, on all twelve endpoints returning `UserResponse` — including
  `/users/me`, which every authenticated page load hits. 66 users measured at 6.3 s.
- Because it was synchronous inside async handlers, it stalled the event loop for every
  other request while waiting.
- It was also unnecessary. Gravatar is designed for direct client-side embedding, with
  the `d=` parameter choosing the fallback. `d=404` makes Gravatar answer 404 when a user
  has no image, and MUI's `<Avatar>` renders its children (the user's initial) on **any**
  load failure — 404, ad-blocker, offline, DNS failure, or CSP violation alike.

So the browser already does this job: in parallel, cached, always current, with no
server-side TTL to go stale. Caching the probe server-side would have reintroduced a
staleness problem that not probing avoids entirely.

**CSP warning:** the HTML document is served by Caddy with no CSP today. The CSP set in
`main.py` applies only to API responses and has no `img-src`. If a CSP is ever added to
the served frontend, it must include `img-src https://www.gravatar.com` or every avatar
silently degrades to initials.

Admins can disable Gravatar entirely (Admin → Security → Profile Photos), which stops any
Gravatar URL reaching a browser — for isolated or privacy-restricted deployments.
Uploaded photos are served locally and are unaffected.

---

## Theming

Named color themes live in `frontend/src/theme/themes.ts` — a `THEMES` record
mapping a key (e.g. `'ocean'`) to a `{ name, light, dark }` definition, each
variant a flat `{ primary, secondary, background, paper }` hex set. `App.tsx`'s
`getDesignTokens(mode, themeKey)` reads from this constant instead of
hardcoding colors; everything else (typography, component overrides) is
shared across all themes.

**Resolution hierarchy**, computed in `ThemedApp` (`App.tsx`, mounted inside
`AuthProvider` specifically so it can read `useAuth().user`):
1. `user.theme` — the authenticated user's personal pick (`PUT /users/me`).
2. else the system default, fetched once from the public `GET /settings/theme`
   endpoint (`app_settings.default_theme`, admin-editable via Admin → Branding).
3. else `DEFAULT_THEME_KEY` (`'ectlogger-blue'`) as an offline/pre-fetch fallback.

Both `user.theme` (nullable) and `app_settings.default_theme` are validated
server-side against `VALID_THEME_KEYS` in `schemas.py` — keep that tuple in
sync with `THEMES`'s keys, plus the always-valid `'custom'` key (below).

**To add a new curated theme**: add one entry to `THEMES` (pick two accent
hues from a source palette, hand-tune a light/dark background pair) and add
its key to `VALID_THEME_KEYS` in `backend/app/schemas.py`. No migration,
endpoint, or component change is needed — `ThemeSwatchPicker.tsx` (shared by
Profile → Settings and Admin → Branding) renders `THEMES` generically.

### Branding (custom theme, custom logo, default appearance)

Unlike the curated `THEMES`, per-instance branding is admin-defined data, not
code, so it lives entirely in `app_settings` (Admin → Branding tab,
`AdminBrandingTab.tsx`):

- `default_color_mode` (`'light'`/`'dark'`) — only affects a browser's very
  first visit (no `themeMode` key in `localStorage` yet, tracked via a ref
  captured before the persist-effect in `ThemedApp` can write one); once a
  visitor toggles, their own browser's choice always wins from then on.
- `custom_theme_json` — a single admin-defined theme (not per-user-created),
  stored as JSON matching `CustomTheme` in `schemas.py` (mirrors
  `ThemeDefinition`'s shape: a name plus a light and a dark palette). Injected
  at runtime as the `'custom'` key wherever `THEMES` is rendered
  (`ThemeSwatchPicker`) or resolved (`getDesignTokens` in `App.tsx`) — it is
  never added to the static `THEMES` constant itself. `'custom'` is always
  accepted by `VALID_THEME_KEYS` even before an admin has configured one;
  selecting it with nothing configured just falls back to the default theme.
- `custom_logo_url` — path to an uploaded logo, served from `LOGO_DIR`
  (`app/utils.py`, mounted at `/api/logo` in `main.py`) via
  `POST`/`DELETE /settings/logo` (admin-only, modeled directly on
  `routers/users.py`'s avatar upload: Pillow resize/EXIF-transpose for
  raster formats, a light sanity check for SVG). `AppLogo.tsx` reads it from
  `ThemeContext` and renders an `<img>` in place of the built-in SVG
  wherever the component is used, with a small neutral backing circle for
  the `variant="nav"` case so an arbitrary uploaded image stays visible
  against any active theme's primary-colored AppBar.

---

## Date & Time Handling

ECTLogger deals with two fundamentally different kinds of time, and they are stored differently **on purpose**:

**1. Concrete net instances — stored in UTC.**
`Net.scheduled_start_time` (and `started_at`, `closed_at`, etc.) are absolute instants. They are stored in UTC and rendered in each viewer's local time:

- Manual creation converts the picker value with `new Date(...).toISOString()` (`CreateNet.tsx`).
- Template-created nets convert local → UTC before storage (`routers/templates.py`).
- The frontend renders with a per-user local/UTC choice (`formatDateTime(..., user.prefer_utc)` in `Dashboard.tsx`).

This is what makes multi-timezone nets correct: the net happens at one instant, and a viewer in any zone sees it converted to their own clock.

**2. Recurring schedule templates — stored as a local-time recurrence rule + IANA zone.**
`NetTemplate.schedule_config` holds `time` (e.g. `"19:00"`), `timezone` (e.g. `"America/New_York"`), and day/week fields. This is a *rule*, not a timestamp, and it must stay in local time.

> **Why not UTC?** A recurring rule like "every Thursday at 7 PM Eastern" cannot be expressed as a fixed UTC time, because daylight saving moves it twice a year (23:00 UTC in summer, 00:00 UTC in winter). Collapsing the rule to a single UTC offset would silently shift every net by an hour across a DST boundary. Storing local-time + IANA zone and converting **each computed occurrence** to UTC is exactly how the iCalendar standard handles this (RFC 5545: `DTSTART` + `TZID` + `RRULE`).

**The rule that prevents reminder/scheduling bugs:** `calculate_schedule_dates()` (in `routers/ncs_schedule.py`) projects *naive local* datetimes from the template rule. Any consumer that compares those projections against "now" must first convert with `template_local_to_utc(template, dt)` — never compare a naive local datetime against `datetime.utcnow()`. (This was the root cause of the June 2026 early/duplicate-reminder bug.)

**NCS rotation is computed, not stored — and its anchor moves when the roster is edited.**
There is no "whose turn is next" pointer anywhere in the database. `routers/ncs_schedule.py::compute_ncs_schedule()` replays every occurrence from an anchor date forward, incrementing a counter once per occurrence, and assigns `active_members[counter % len(active_members)]`. `get_rotation_anchor_date()` picks that anchor from one of two sources:

1. `NetTemplate.rotation_anchor_date` when set — stamped by `stamp_rotation_anchor()` from every route that changes the rotation's membership or order (add member, remove member, clear all, reorder, and the rotation-move step of a template merge).
2. `NetTemplate.created_at` when it is null — the original behavior, so any template whose roster has not been edited since migration 061 computes exactly as it always did.

**Why the anchor has to move.** Both the divisor (`len(active_members)`) and the position-to-operator mapping change the moment a roster is edited, but a creation-date anchor does not. The result is a permanent phase offset between the order a manager just arranged and the order the arithmetic produces — it never self-corrects, so the only remedy was a manual per-occurrence swap, forever. Re-anchoring at the edit makes the first occurrence *after* the edit belong to position 1 and the cycle continue normally from there.

**Two different flooring rules, deliberately.** A `created_at` anchor is floored to local midnight, so a template created after that evening's net still counts that same-day occurrence as its first. A `rotation_anchor_date` is used at its exact time, so an edit made after tonight's net already ran cannot retroactively claim that net. Anything new that mutates rotation membership or order must call `stamp_rotation_anchor()` in the same transaction, or it reintroduces the offset.

**A roster edit alone does not touch a net that already exists — `resync_pending_duty_ncs()` is what does.** `_assign_duty_ncs()` (`ncs_reminder_service.py`) stamps a `NetRole(role="NCS", auto_assigned=True)` exactly once, when a net is auto-created ~24h ahead of its scheduled time. Re-anchoring the rotation fixes every *future* computed occurrence, but a net created before the edit already has its `NetRole` committed, and nothing revisits it — reported by Joel Huntress (AA1GM) as a net launching with the pre-fix NCS still staffed. `resync_pending_duty_ncs()` (`routers/ncs_rotation.py`) closes that gap: every route that calls `stamp_rotation_anchor()` also calls this afterward, and it recomputes the duty NCS for any DRAFT/SCHEDULED net (future `scheduled_start_time`, not yet in LOBBY/ACTIVE) belonging to the template. It only ever replaces a `NetRole` that is itself `auto_assigned=True` — if a human has assigned, started, or self-checked-into that net's NCS slot (`auto_assigned=False`), the net is skipped entirely rather than overwritten or duplicated. When the resync changes who's staffed, both the outgoing and incoming operator get a "schedule correction" email (`EmailService.send_ncs_duty_correction`).

Swaps (`POST`/`DELETE .../ncs-rotation/overrides`) call it too, since 2026-10-19: a net's staff are managed only on its schedule (the net's Staff dialog and Edit Net's Net Staff tab are read-only with `NCSStaffModal.tsx::ScheduleStaffButton`), so a swap is the one way to change who runs a net that already exists. **The resync reads the rotation and swaps with their own queries, never off the template.** The calling route has usually loaded the template already, and sessions keep objects across commits (`expire_on_commit=False`), so `template.rotation_members` / `.schedule_overrides` were still the lists from before the edit: removing the on-duty member through the API left them on duty (`tests/test_ncs_duty_resync.py`). Don't "fix" this with `populate_existing` on the template query either; that resets relationships the caller still uses and raises `MissingGreenlet`.

**Reminder windows must be one-sided, not ±tolerance:** `NCSReminderService._in_reminder_window()` (`ncs_reminder_service.py`) accepts `reminder_hours - catch_up_hours <= hours_until <= reminder_hours` — never earlier than the target lead time, only late enough to survive a missed poll tick. A symmetric `abs(hours_until - reminder_hours) <= catch_up_hours` window (the pre-2026-07-31 shape) fires on the *first* tick anywhere in that range, which in practice meant "1 hour" reminders consistently went out ~90 minutes before start, verified against real production sends. Any new reminder tier should reuse this helper rather than reintroducing a symmetric window.

**Comparing against a stored net instant:** helpers that do arithmetic on `Net.scheduled_start_time` must not assume it is naive. SQLite returns naive values, PostgreSQL returns tz-aware ones, and mixing the two raises `TypeError: can't compare offset-naive and offset-aware datetimes`. Normalize both sides first — `app/net_start.py::_as_naive_utc` is the pattern (auto-lobby's fire-time math uses it).

**Current storage caveat (see ROADMAP — "UTC-aware datetime hardening"):** on SQLite, `DateTime(timezone=True)` does not actually persist an offset, so UTC instants are stored *naive by convention*. That is why several frontend call sites defensively append `'Z'` before parsing, and why backend boundary helpers return naive UTC. This convention is fragile and would break under PostgreSQL (`timestamptz` returns tz-aware values); the roadmap item tracks standardizing on tz-aware UTC end-to-end.

---

## Schedule calendar

The Schedule page's **Calendar view** (`components/scheduler/ScheduleCalendar.tsx`) reads one endpoint, `GET /api/templates/calendar?start=&end=` (`routers/templates_calendar.py`), which returns every occurrence starting in the window. The merge itself lives in `app/services/schedule_occurrences.py::get_occurrences`, shared with the RSS feed (`/feed/schedule.xml`) so the two can never disagree about which nets are on. The feed filters out cancelled and finished occurrences; the calendar keeps them.

**Two sources, and the seam is now.**

- **Real `Net` rows** cover the past and any upcoming slot the scheduler has already created (about 24 hours ahead). Each is dated by `scheduled_start_time`, else `started_at`, else `created_at`, and carries its status, check-in count, and NCS from `services/ncs_attribution.py::load_ncs_attribution` (the same single rule the net list uses, see `format_ncs_attribution`).
- **Projections** come from each active daily/weekly/monthly schedule, **only from the current moment forward**. Never project into the past: a projection on a past date asserts a net was held that may have been cancelled, and names an NCS who never served. `calculate_schedule_dates` cannot look backwards anyway; do not "enable" earlier months by backdating its start date. Past months come from real rows alone.

**A real row always beats a projection for the same slot**, matched on the scheduler's own ±5 minute window (`ncs_reminder_service._get_or_create_scheduled_net`). Using the scheduler's rule rather than a looser same-day match means the calendar never hides a slot the scheduler would go on to fill with a second net. Two real rows in one slot are both shown: that is real duplicate data, not a projection collision (production had four such pairs when this shipped, e.g. nets 84/85).

**Cancelled has two sources and both render struck through**, never omitted: a `Net` with `NetStatus.CANCELLED`, and an NCS override with `replacement_user_id=None` on a projected date.

**Cost.** `compute_anchored_ncs_schedule` replays every occurrence from the rotation anchor to the window's end, so it runs once per schedule per request for the whole window, never per occurrence. The endpoint caps the window at 62 days (a month grid is 42) and paging at one year ahead. Against beta's copy of production the slowest month took 70 ms.

**Display timezone: the viewer's browser zone, deliberately.** The endpoint returns tz-aware UTC and `utils/calendarGrid.ts` places each occurrence on the viewer's own local day, because the question the calendar answers is "am I free that evening". This matches the page's existing "Times in <zone>" label. It is the opposite of reports and the planned Assignment Board, which use the net's zone; the divergence is intended, not an inconsistency bug. `resolve_display_tz` was considered and rejected: most accounts have no `timezone` on file, so it would mean UTC for nearly everyone.

**Where an occurrence goes.** Nets of a recurring or one-time schedule go on the grid. Nets with no schedule, or whose schedule is ad-hoc or not loaded (inactive), are listed below the grid as "Ad-hoc nets" for that month, so nothing held that month is left out. The page's filter hides a schedule's nets wherever they would go. The details popover reuses the page's own `renderScheduleCard`, so its buttons carry the same permission rules as the card view.

**Naming.** When calendar export or a subscribable feed is built (roadmap Phases 2-3), call it **iCalendar** or **Calendar Feed** in labels and `ical_feed.py` in code. Never "ICS file": ICS means Incident Command System here (ICS-309 ships today).

---

## Subscribe links and returning after sign-in

A schedule's subscribe link is `/subscribe/<schedule id>` (`pages/SubscribeToSchedule.tsx`;
the path is built only by `utils/subscribeLink.ts`). The page is public and reads the
schedule through `GET /templates/<id>`, which takes optional auth and returns exactly
what the public list returns: both go through `_template_response_for_viewer` in
`routers/templates_core.py`, so a guest can never see more from one than from the other.

Two rules to keep:

- **Opening the link never subscribes anyone.** Subscribing is a click on the page, by a
  signed-in user, through the existing `POST /templates/<id>/subscribe`. A link that
  subscribed on load would let a crafted URL, or a chat app's link preview, subscribe
  somebody without their say.
- **The return path stays inside the site.** A signed-out visitor goes to
  `/login?redirect=/subscribe/<id>`. Password sign-in navigates there directly; the
  magic-link request carries it as `redirect`, and `email/auth.py` puts it on the emailed
  link, where `VerifyMagicLink.tsx` already honoured it for net-start emails. Because it
  ends up in an email, `utils.py::safe_redirect_path` accepts only a path starting with a
  single `/` (the schema rejects anything else with a 422), and
  `frontend/src/utils/redirectPath.ts` applies the same test on the way back in. Any new
  "sign in and come back" flow should reuse this parameter instead of adding another.

No web-server rule is needed: Caddy's catch-all serves `index.html` for any path that is
not one of its proxied prefixes. A social-media preview of the link is therefore the
generic site preview, not the net's own name and logo.

Tests: `backend/tests/test_subscribe_link.py`, `frontend/src/utils/redirectPath.test.ts`.

## Operators without an account (callsign-only entries)

A schedule's staff list (`TemplateStaff`), rotation (`NCSRotationMember`), swaps
(`NCSScheduleOverride.original_callsign`/`replacement_callsign`) and fifth-week pick
(`NetTemplate.fifth_week_callsign`) can name a callsign that has no account yet:
`user_id` is NULL and `callsign` holds the normalized callsign (migration 081, which
rebuilds the two tables because SQLite cannot drop NOT NULL in place). A guest
check-in's NCS/Logger/Relay credit lives in its own table, `NetCallsignRole`. Everything
that names a person goes through `services/callsign_people.py`; the frontend's
counterparts are `utils/staffPeople.ts` (schedule people) and `utils/stationRoles.ts`
(net roles on the check-in list).

Rules to keep:

- **A callsign-only entry grants nothing.** Permission checks compare `user_id` with the
  signed-in account, and NULL never equals an id. The trap is the other direction:
  SQLAlchemy turns `col == None` into `IS NULL`, which matches *every* callsign-only row,
  so `permissions.py::is_active_template_staff` returns False for a None user id before
  querying. Never compare one of these columns to a value that can be None.
- **`NetCallsignRole` is never mixed into `GET /nets/{id}/roles`.** That list is what the
  frontend and about 160 backend call sites use to decide what someone may do. Callsign
  roles have their own endpoints (`/nets/{id}/callsign-roles`) and are merged only for
  display (`stationRoles.ts::mergeStationRoles`) and attribution
  (`services/ncs_attribution.py`, the one place that answers "who was NCS").
- **Never match two people on `user_id` alone**, on either side. Two callsign-only rows
  both have `user_id: null`. Use `samePerson` / `personKey` (`staffPeople.ts`) or
  `roleMatchesCheckIn` (`stationRoles.ts`).
- **Who has an account is for signed-in viewers.** The staff, rotation and schedule
  reads are public; for a guest `has_account` / `fifth_week_has_account` are always
  true and `invited` / `account_available` false, and the Staff dialog hides the
  chips. `user_id` is still null on those rows, so this is presentation, not a secret.
  `invited`, `account_available` and `available_account_name`/`_email` (masked) go
  only to team managers (`can_manage_schedule_team`), who are the ones who act on them.
- **Schedule entries match primary callsigns only**
  (`callsign_people.py::find_account_by_primary_callsign`), never extra or GMRS
  callsigns: those aren't unique and anyone can type one, so matching them let a
  stranger list a real operator's callsign as an extra and be resolved as staff on
  add, offered for Link, or linked by a typo fix. Check-ins still link on any callsign
  (`find_user_by_callsign`), but their credit roles are promoted only onto a primary.
- **A typed callsign proves nothing, so taking over is per schedule and gated.**
  `claim_callsign_placeholders` runs on sign-up (`auth.py::get_or_create_user`,
  `contacts.py` invite, admin create) and when an account's *primary* callsign actually
  changes (`PUT /users/me`, admin update); extra and GMRS callsigns are never matched.
  For each schedule naming the callsign, the entries are taken over only if the account
  signed in with the address *that schedule* invited it at (`TeamInvite`, latest per
  schedule and callsign), or a manager links it (`PATCH .../staff/{id}` with
  `link: true`). Otherwise a `held` `CallsignClaim` is written once (which is also what
  stops the manager being emailed again) and the row reports `account_available`.
  Before 2026-10-19 any profile edit took the entries over, which made a stranger
  schedule staff, and so able to make themselves co-manager, in one step.
- **Trust-level team changes need a manager.** Linking (including a typo fix onto an
  account's callsign), sending invites and changing co-manager go through
  `permissions.py::can_manage_schedule_team` (admin, schedule manager, active
  co-manager); plain staff pass `check_template_permission` for everything else.
- **Reversible.** A `linked` claim's `rows` JSON lists every row converted, so
  `revert_callsign_claim` replays it backwards and clears co-manager; callers then run
  `resync_pending_duty_ncs` so duty roles assigned in the window go back to the
  callsign. Ban and delete revert all of an account's claims, and ban moves the primary
  callsign to `User.banned_callsign` (it is unique) so the real operator can set it;
  unban restores it only if still free. A reverted claim is never
  re-taken automatically by that account; inactive accounts never claim, resolve or
  show as available.
- **Correcting a check-in's callsign onto an account** turns its credit into a real
  `NetRole` only when the editor passes `can_manage_net_roles`; otherwise the credit is
  dropped. A callsign role can only be given to a callsign checked in to that net.
- Invitations are one `TeamInvite` row per send: `INVITES_PER_DAY` (25) per inviter and
  `INVITES_PER_ADDRESS_PER_DAY` (3) per mailbox (`name+tag@` counts as `name@`), both
  checked before the entry is added. An invite is used up (`used_at`) once its
  entries are linked, so it never vouches for a later account at the same address
  (an admin deleting the first one, say). Deleting an account also deletes its
  `CallsignClaim` rows: SQLite reuses the id. Public responses never carry an email
  address or `invited`.

Tests: `backend/tests/test_callsign_placeholders.py`, `frontend/src/utils/staffPeople.test.ts`,
`frontend/src/utils/stationRoles.test.ts`, `frontend/src/components/netview/checkInSort.test.ts`.

## Training sessions

Help > Training (`frontend/src/components/TrainingDialog.tsx`) lists the live training
sessions an admin has posted. Documented for admins in `docs/admins/training-sessions.md`.

- **Table:** `training_sessions` (`models.TrainingSession`, migration 095): title,
  `starts_at`, optional `ends_at`, location, `online_url`, Markdown `details`, and
  `created_by_id` (a foreign key to users, `SET NULL`, so account merge picks it up).
  Times are naive UTC like every other stored instant; the schema turns the app's
  `...Z` string into naive UTC, the dialog turns it back into the viewer's clock.
- **Reads:** `GET /training/sessions` is open to guests (`get_current_user_optional`).
  A session is listed until `ends_at` passes, or until two hours after `starts_at` when
  it has no end (`OPEN_ENDED_SESSION_HOURS`), soonest first. Nothing is stored about
  "over": the filter runs on every read, so there is no cleanup job for sessions.
- **The online link is withheld from guests.** A signed-out response has
  `online_url: null` and `has_online_link: true`, so the dialog can say "Sign in to
  see the online meeting link" without a Zoom room ever being served to the open web.
  `online_url` must be an `http://` or `https://` link (schema validator), because the
  dialog renders it as a button; never relax that to other schemes.
- **Writes** (`POST`, `PUT`, `DELETE /training/sessions`) use `get_admin_user`, so they
  need the Admin role and enrolled MFA, like the rest of the admin panel. The dialog
  shows its edit controls from `user.role === 'admin'`, which follows "View as Regular
  User". A response never includes who posted a session.
- **Audit events:** `training.session_created`, `training.session_changed` (with
  `details.changes` from `field_changes`, nothing logged for an unchanged save) and
  `training.session_deleted`, labelled in `utils/activityLog.ts`.
- **The banner** (`components/TrainingBanner.tsx`, mounted in `App.tsx` under the
  update banner) announces the soonest session the viewer hasn't closed
  (`utils/trainingSessions.ts::pickBannerSession`), starting at local midnight
  `TRAINING_BANNER_LEAD_DAYS` (7) days before the session's date (`bannerStartsAt`).
  Midnight, not the session's time of day: a visitor who only comes for an evening
  net the week before would otherwise reach the site just before the banner appears
  (Brad, 2026-10-30). It shows only on the pages in
  `isTrainingBannerPage` (the top bar's main pages), never in a net or on a form. It
  reads the same list with `BACKGROUND_REQUEST_CONFIG` on load and every 30 minutes,
  so an open tab never counts as activity. Fixed purple, one shade per mode; see
  DESIGN.md "Sitewide Alert Banners".
- **Closing the banner** is saved per account: `POST /training/sessions/{id}/dismiss-banner`
  writes a `training_banner_dismissals` row (migration 096, unique per user and
  session), and the list returns `banner_dismissed` for the signed-in viewer. Brad
  asked for per-account so a closed announcement doesn't come back on another device
  (2026-10-30). The rows are deleted once their session is over or removed
  (`_prune_dismissals`, run on every dismiss, post and delete; SQLite doesn't enforce
  the CASCADE), and with the account on user delete. A guest's closes live in
  `localStorage` (`STORAGE_KEYS.TRAINING_BANNER_CLOSED`), trimmed to listed sessions.
- Tests: `backend/tests/test_training_sessions.py`, `frontend/src/utils/trainingSessions.test.ts`.

---

## Backups

Encrypted backups of the database, `backend/data/` and both `.env` files.
User-facing docs: `docs/admins/backups.md` (admin panel) and
`docs/self-hosting/backups.md` (restore, CLI, SFTP drop point).

| Piece | File |
|---|---|
| Key handling (age X25519, passphrase-wrapped) | `backend/app/backup/keys.py` |
| Build / verify / unpack one archive; `describe()` is the one check report the CLI and the admin panel show | `backend/app/backup/archive.py` |
| SECRET_KEY-derived Fernet keys, importable before any `.env` exists, so verify can test a backup's own `SECRET_KEY` against its two-factor secrets | `backend/app/derived_keys.py` |
| Retention (newest per day/week/month) | `backend/app/backup/retention.py` |
| Schedule and overdue rules (pure) | `backend/app/backup/schedule.py` |
| SFTP and S3 targets | `backend/app/backup/targets.py` |
| One run end to end, lock, alerts | `backend/app/backup/runner.py` |
| Web-service loop (overdue alert; `BACKUP_SCHEDULER=internal`) | `backend/app/backup/monitor.py` |
| Admin API | `backend/app/routers/backups.py` |
| CLI (cron, restore, setup) | `backend/scripts/backup.py` |
| Admin tab | `frontend/src/components/admin/AdminBackupsTab.tsx`, `components/admin/backups/` |

Design decisions worth keeping:

- **The web service never builds, uploads or decrypts a backup in its own
  process.** "Back up now" and "Check" start `scripts/backup.py`
  (`backup/process.py`), so cron and the admin panel share one code path and
  one `fcntl` lock (`backups/.backup.lock`). "Is one running?" is answered by
  the lock, never by a `running` row, which a killed process leaves behind.
- **Backups are encrypted to a public key; the passphrase is never stored.**
  `backup_settings.key_wrapped_identity` is the age private key wrapped with
  the passphrase (age's scrypt mode), and the same file sits beside the
  backups as `ectlogger-backup-key-<fp>.age`, so the stock `age` CLI can
  restore without ECTLogger. pyrage's passphrase mode is in-memory only,
  fine for a key and not for a backup; its recipient mode streams (measured
  flat at about 10 MB RSS for a 300 MB file). Verify therefore needs the
  passphrase typed in; it goes to the CLI on stdin, never argv.
- **The overdue alert runs in the web service, not cron**, because a missing
  cron entry is one of the failures it exists to catch.
- **SFTP host keys are pinned** (`backup_targets.trusted_host_key`); an
  untrusted or changed key refuses the connection and returns the fingerprint
  for an admin to confirm. Changing a target's host or port clears the pin.
- **Remote pruning is off by default** per target: a drop point the app can
  delete from is one an intruder on this server can delete from.
- The CLI's setup commands call `init_db()` (with `app.models` imported
  first, or `create_all` sees no tables) because `install.sh` runs them before
  the service has ever started. Writing that test is what found `init_db()`
  crashing on an empty SQLite database (fixed 2026-09-28,
  `tests/test_app_startup.py::test_init_db_builds_a_fresh_database`).
- Tests: `backend/tests/test_backups.py` (the stock-`age` interop test skips
  unless `age` is on `PATH`).

## Background polling and `last_active`

Any request the app makes on a timer must be marked as a background request, and any
frequent poll should stop while the tab is hidden.

**Mark the request.** Spread `BACKGROUND_REQUEST_CONFIG` (`frontend/src/services/api.ts`)
into the axios call, which sets `X-Background-Request: 1`. The backend
(`backend/app/dependencies.py`) skips its `last_active` bookkeeping for those requests, so
that timestamp keeps meaning "this operator did something", not "this operator has a tab
open". Use it only for interval-driven calls — never for one caused by a click, a
navigation, or a form submit. The header is bookkeeping only and must never influence
authorization; `tests/test_last_active.py` pins that, along with the requirement that only
the exact value `1` counts.

**The catch-up after a WebSocket reconnect is background too.** A reconnect happens on its
own (a dropped connection, a sleeping device waking, the stale-connection watchdog), so
`useNetWebSocket.ts::resyncAfterReconnect` calls each loader with `background = true`, and
every `netResync` listener (chat, activity log, traffic panel, traffic detail, inbox badge)
does the same. The loaders take an optional `background` argument that defaults to off.
Until 2026-10-24 that refetch counted as activity: a tab left open overnight on an archived
net, on a laptop waking every ~15 minutes, kept its user showing as active and held up a
production deploy for three hours.

**Pause it while hidden.** Use `useVisibilityAwareInterval`
(`frontend/src/hooks/useVisibilityAwareInterval.ts`) instead of a bare `setInterval`. Browsers
throttle timers in hidden tabs but don't stop them, so a plain interval keeps hitting the
backend all night for nobody. The hook clears the interval when the tab is hidden and refetches
immediately on return, so what the operator sees when they come back is fresh either way.

**Never do this to the net WebSocket.** An NCS with the net in a background tab still needs
live events; only polling pauses.

Why this exists: the navbar traffic-inbox badge polls every 60s from every page, and every
authenticated request used to stamp `last_active`. One real user therefore showed as
active-within-the-minute continuously from the day they registered — a tab left open, not a
person at the keyboard — which silently defeated the pre-deploy "is anyone using prod right
now" safety check. Note the net-view "Online" indicator is unaffected either way: it comes from
live WebSocket connections (`ConnectionManager.get_online_users`), not from `last_active`.

## WebSocket

Endpoint: `WS /api/ws/nets/{net_id}?token=<jwt>`

`ConnectionManager` in `main.py` tracks connections per net and broadcasts to every
socket on that net. Every message has the shape `type` / `data` / `timestamp`, plus a
`user_id` on relayed messages.

Messages come from two directions, which is easy to miss when tracing a bug:

**Server-originated** — a route handler calls `manager.broadcast(...)` after a database
write. These are the authoritative events:

| Type | Emitted by |
|---|---|
| `status_change` | `routers/check_ins.py` — a station's status changed |
| `check_in_deleted` | `routers/check_ins.py` |
| `hand_raised_changed` | `routers/check_ins.py` |
| `net_started` / `net_lobby_opened` | `routers/nets_core.py` — one call site picks between them based on whether the NCS opened the lobby or went straight live. `net_lobby_opened` is also emitted by `app/net_start.py::auto_open_lobby` for a scheduler-opened lobby, where `started_by` is `null` because no human opened it. Both are handled in `hooks/useNetWebSocket.ts` |
| `net_status_change` | `routers/nets_core.py` (net closed) and `routers/nets_export.py` (net archived/unarchived) |
| `net_pause_change` | `net_pause.py` |
| `role_change` | `routers/nets_roles.py` |
| `can_hear_changed` | `routers/can_hear.py`, `routers/coverage_sites.py` — a "who can this station hear?" report, a net's coverage sites, an outside contact, or a repeater/node result was saved |
| `chat_message`, `chat_message_edited`, `chat_reaction`, `chat_image` | `routers/chat.py` — `chat_message_edited` carries the whole updated message (same shape as `chat_message`), so `Chat.tsx` replaces its copy by id instead of patching fields |
| `chat_net_mute_changed` | `routers/chat.py` — a staff member applied or lifted a net-wide chat mute (`data.active` true/false); keeps every already-open tab's mute banner/manage list live instead of only updating on next page load. Separate from `chat_message`'s own per-connection `only_for_user_ids` restriction, which is what actually keeps a net-wide-muted author's message off the wire to other viewers in the first place |
| `identity_verified_changed` | `routers/check_ins.py` — NCS/Logger confirmed or rejected a station's TOTP match on an authenticated net (`data.identity_verified` true/false); keeps every viewer's padlock icon live |
| `traffic_logged` | `routers/traffic_forms.py` — a form was filed on this net (`net_id` set); the per-net Traffic panel refetches its list and summary. Only fires when the form has a net; a standalone form has no connection group to notify |
| `traffic_log_changed` | `routers/traffic_log.py` — a chain-of-custody hop was appended to a form on this net (`net_id` set); the Traffic panel and the inbox badge refetch. Same not-fired-for-standalone-forms rule as `traffic_logged` |
| `off_net_log_changed` | `routers/off_net_log.py` — an off-net log entry was added, changed, reviewed or deleted. Carries only `net_id`, never entry content, so it is safe for guest connections; `OffNetLogDialog.tsx` refetches what the viewer may see |
| `ping` | `main.py` keepalive |

**Client-originated (relayed)** — the socket handler in `main.py` sanitizes whatever a
client sends and rebroadcasts it verbatim to the net, defaulting the type to `message`.
The server does not generate or validate these; they are peer-to-peer nudges telling
other clients to refetch:

| Type | Sent by | Effect on receivers |
|---|---|---|
| `check_in` | `components/netview/checkInActions.ts` | refetch the check-in list |
| `active_speaker` | `checkInActions.ts` | highlight the speaking station |
| `active_frequency` | `checkInActions.ts` | refetch the net |

Because relayed events are client-generated, a client that never sends one (or drops
offline mid-action) leaves other clients stale until their next poll or refetch. Do not
treat them as guaranteed delivery of a state change — the REST write is the source of
truth, and the relay is only a hint to go read it.

`useNetWebSocket.ts` is the single frontend consumer and handles both sets.

**Guest connections and PII.** The WS endpoint accepts connections with no `token`
(`user_id` becomes the guest sentinel `0`) so an anonymous viewer gets live updates on a
publicly-shared net, same as the REST reads. `ConnectionManager.broadcast` takes an optional
`guest_message` — when given, connections with `user_id == 0` receive it instead of `message`.
`chat.py::create_message` is the one caller today: it sends the raw chat text to authenticated
connections and a copy scrubbed by `redact_contact_info` (see `app/utils.py`) to guests, so a
live guest can't see a phone number or email arrive in real time that the REST `GET
/chat/nets/{id}/messages` would have redacted. Any future server-originated message type that
carries free text a user typed (not just structured state) needs the same treatment.

### Reconnect and resync

Broadcasts are fire-and-forget. `ConnectionManager` sends to whoever is connected at
that instant and keeps no per-client history, so **every event emitted while a client
is disconnected is lost to that client permanently.** Nothing replays it.

This matters more than it sounds. A reconnected socket looks healthy, so a stale page
shows no symptom — the operator sees a normal-looking net that is quietly missing
check-ins, status changes, chat, and traffic. For ARES and SKYWARN deployments, where
a link dropping mid-net is routine, a silently stale log is the worst available
failure mode.

`useNetWebSocket.ts` therefore does three things:

1. **Reconnects indefinitely.** Exponential backoff (3s, 6s, 12s … capped at 30s) with
   no attempt ceiling. It previously gave up after 10 tries (~3.75 minutes), which left
   a dead page that still looked live. The effect cleanup stops retries when the page
   or net goes away, which is the only thing that should stop them.
2. **Reconnects immediately on the browser's `online` event**, cancelling any pending
   backoff, so a link that returns doesn't wait out a 30-second timer.
3. **Resyncs on every reconnect but not the first connect.** `hasConnectedRef`
   distinguishes them — the initial mount already fetches through `useNetData`, so
   resyncing there would just double every request.

The resync refetches net, check-ins, roles, stats, and can-hear reports directly, then
dispatches a **`netResync`** window `CustomEvent` with `detail: { netId }`.

**`netResync` is the contract for any panel that owns its own data.** Panels that fetch
independently can't be refreshed from the hook, so they listen for this event — the
same relay convention already used for `newChatMessage` and `trafficLogged`. Current
listeners:

| Listener | Refetches |
|---|---|
| `components/Chat.tsx` | the message thread |
| `components/ActivityLog.tsx` | the net's system/activity messages |
| `components/netview/TrafficPanel.tsx` | the per-net traffic list and summary |
| `components/traffic/TrafficDetail.tsx` | the open form's chain-of-custody timeline |
| `hooks/useTrafficInbox.ts` | the inbox badge count |

**If you add a panel that fetches its own data and updates from a WebSocket event, add
a `netResync` listener at the same time.** A panel that handles live events but ignores
resync is exactly the silent-hole bug this section exists to prevent. Filter on
`detail.netId` where the panel is net-scoped; refetch unconditionally where it isn't
(the inbox badge, an open form detail). Refetch wholesale rather than reasoning about
what was missed — every list involved dedupes by id, so a full refetch merges cleanly
and is far easier to get right than a diff.

**Do not "optimize" this into an incremental catch-up** (fetch only what is newer than
the last known id). Chat supports deletion and reactions, and check-ins can be deleted
and edited, so an incremental fetch would silently never remove a deleted message or
apply an edit made during the outage. The full refetch is a correctness requirement,
not laziness.

### Frontend build-version detection

A tab left open across a deploy keeps running the JS it loaded with — nothing tells it
a new build exists, and content-hashed asset filenames mean a stale tab can't even
fetch the new bundle by accident. Left alone this produces two symptoms: bug reports
that turn out to be an old client, and (worse) admin metrics skewed by old clients
missing newer instrumentation, e.g. the `X-Background-Request` header did not exist
before 2026-08-11, so any tab still running pre-that-date JS stamps `last_active` on
every background poll and never stops looking "active."

**How it works:**

1. `vite.config.ts` computes `getBuildId()` — the short git commit SHA, **not** a
   timestamp. A backend-only deploy that rebuilds the frontend from an unchanged
   commit must produce the identical id, or every deploy would falsely tell open tabs
   a new frontend shipped when nothing about the frontend actually changed.
2. The id is embedded in the JS bundle via `define: { __BUILD_ID__ }` (that tab's own
   version, fixed at load time) and separately written to `dist/version.json` by the
   `write-version-file` plugin's `closeBundle` hook (the server's *current* version,
   fetched fresh on every poll). These must stay two different mechanisms — embedding
   the server's current id in the same hashed bundle a stale tab is running would
   never update.
3. `hooks/useBuildVersion.ts` fetches `/version.json` with `cache: 'no-store'` — this
   depends on production sending `Cache-Control: no-cache` on non-hashed static files
   (Caddyfile), otherwise a browser-cached copy of `version.json` itself defeats the
   check. Polls via `useVisibilityAwareInterval` (5 minutes; a stale build is never as
   time-critical as the 10s maintenance banner, and this never auto-reloads, so there's
   no benefit to a tighter interval).
4. `components/UpdateAvailableBanner.tsx` shows a dismissible `info` banner with a
   Reload button when the ids differ. **Never auto-reload** — an operator mid check-in
   entry would lose it. Dismissal is keyed to the build id it was shown for, so the
   *next* deploy shows the banner again even if a previous one was dismissed.

Chat and the activity log are two panels rendering the same endpoint, so both refetch
it on resync. They cannot share state — a popped-out panel is a real `window.open`
document with its own React root (`usePoppedOutWindow.ts`), so no context spans them.
`chatApi.list` therefore coalesces concurrent in-flight requests per net in
`api/chat.ts`, handing each caller its own copy of the array. Deliberately scoped to
that one call; a blanket GET cache would change behavior for callers that legitimately
expect an independent read.

**What this does not do:** it does not let anyone keep working while disconnected.
Writes attempted offline fail, the optimistic status paint rolls back, and the change
is discarded rather than queued. Durable offline operation is a separate roadmap item
(see ROADMAP.md, "Offline-Capable Web Client") and needs client-generated IDs, an
IndexedDB queue, and a conflict rule before it is safe.

---

## Enabling and disabling outbound email

`EMAIL_ENABLED` in `backend/.env` is the master send switch. It defaults to
`true`, so production and fresh installs behave normally without setting it.

**To disable sending** (the correct state for alpha and beta):

```bash
# in backend/.env
EMAIL_ENABLED=false
```

then restart the backend (`sudo -n systemctl restart ectlogger`). Every send
becomes a no-op: `_send_suppressed()` in `app/email/base.py` logs the intended
recipient and subject and returns, and the caller carries on as if delivery
succeeded. Nothing raises, so net closes, user creation, and the reminder
service all behave exactly as they do in production.

Confirm it is off by watching the log during an action that sends mail:

```bash
journalctl -u ectlogger -f | grep EMAIL
# expect: [EMAIL] Suppressed email to someone@example.com (EMAIL_ENABLED=false): <subject>
```

**To temporarily enable sending on a test instance** — for example to verify a
new template actually renders in a mail client — set `EMAIL_ENABLED=true`,
point the `SMTP_*` settings at a real relay, restart, run the one action you
need, then **set it back to `false` and restart again**. While it is on, that
instance will mail whatever real addresses its database holds; beta's database
contains real user rows, so prefer a net or template whose only subscriber is
your own address.

**A test instance that must really send mail** (the Teams instance, where
invitations, sign-in links and notices are what is being tested) runs with
`EMAIL_ENABLED=true` plus a recipient allowlist instead:

```bash
# in backend/.env
EMAIL_ENABLED=true
EMAIL_RECIPIENT_ALLOWLIST=bradbrownjr+*@gmail.com,bradbrownjr@gmail.com
```

Patterns are comma-separated shell-style globs, matched case-insensitively by
`_recipient_allowed()` in `app/email/base.py`. A recipient matching none of them
is suppressed and logged exactly like `EMAIL_ENABLED=false`, with the reason
`not in EMAIL_RECIPIENT_ALLOWLIST`. Empty (the default) allows everyone, so
production never sets it. Pair it with a database of test fixtures rather than
a copy of production: the allowlist is the last line, not the only one.

Why this exists as well as the SMTP setting: beta has long pointed `SMTP_HOST`
at `127.0.0.1` so connections are refused. That works, but it is failure-based
protection — the message is fully composed and the real recipient list resolved
before anything stops it, and a single `SMTP_HOST` edit would start delivering
to real users with nothing else in the way. `EMAIL_ENABLED=false` stops the
send before any connection is attempted and is independent of SMTP config, so
the two together are belt and braces. Keep both in place on alpha and beta.

---

## Changelog (user-facing)

`frontend/src/changelog.json` is the **single source of truth**. Both the
in-app `ChangelogNotification.tsx` dialog and the `whats_new_service.py` digest
email read from this file. See [docs/DESIGN.md](DESIGN.md) for entry format rules.

Always run `date` before writing a changelog entry. Today's date (America/New_York):

```bash
date
```

---

## Deployment

See `docs/PRODUCTION-DEPLOYMENT.md` for full deploy steps.

Quick reference:
```bash
# Push, pull on prod, build frontend, restart
git push origin main
ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && git pull origin main"
ssh ectlogger@app.ectlogger.us "cd ~/ectlogger/frontend && npm run build"
ssh ectlogger@app.ectlogger.us "sudo -n /usr/bin/systemctl restart ectlogger"
ssh ectlogger@app.ectlogger.us "sudo -n /usr/bin/systemctl is-active ectlogger"
```

Passwordless sudo on production covers only: `restart ectlogger`, `is-active ectlogger`,
`status ectlogger`, `journalctl -u ectlogger *`, and Fail2Ban client commands.
Any other sudo operation (daemon-reload, service file edit) requires the ectlogger
account password.

---

## Environments

| Name | Host | Python | Notes |
|---|---|---|---|
| Production | `ectlogger@app.ectlogger.us` | 3.11.2 | Caddy, static build, port 8001 |
| Beta | `bradb@10.6.26.3` | 3.13 | Backend: uvicorn port 8000, auto-reload. Frontend: `vite preview` (static build) port 3000 — not a dev server, `npm run build` required after frontend changes |
| Alpha | `bradb@10.6.26.6` | 3.13 | Feature testing before beta; frontend serving mode unverified — check with `ps aux \| grep vite` before assuming HMR |

---

## Documentation site (ectlogger.us)

**The scheme, the voice, the figure rules, and the information architecture
live in [`docs/DOC-STYLE.md`](DOC-STYLE.md).** Read that before writing or
changing a page. This section is the build and the commands only.

The public site is built by GitHub Pages from `main`. There is no staging
site: whatever is on `main` is live within about a minute of the push. Layouts
live in `_layouts/`, the sidebar in `_data/nav.yml`, styles in
`assets/css/site.css`, and the pages themselves under `docs/`.

### Layouts

| Layout | Used by | What it adds |
|---|---|---|
| `shell` | Nothing directly | The document, header, footer, theme toggle. Every other layout inherits from it |
| `default` | The site root and anything outside `docs/` | A single content card |
| `docs` | Everything under `docs/`, by a default in `_config.yml` | Sidebar, search, breadcrumb, previous/next, page metadata footer |
| `landing` | `index.md` only | Full-bleed marketing sections, no card |

### Page front matter

Every new page under `docs/` carries this block. The fields after `summary`
come from ISO/IEC/IEEE 26514 document control, and the layout renders them in
a footer line so a reader can see how old a page is without digging.

```yaml
---
title: Checking in
summary: One sentence, shown under the title, in search results, and as the page description.
audience: Operators
kind: How-to
owner: KC1JMH
revised: 2026-09-18
review_by: 2027-09-18
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/checking-in/
---
```

- **`kind`** is the Diataxis type and is one of **Tutorial**, **How-to**,
  **Reference**, or **Explanation**. A page does not mix modes. See
  [`DOC-STYLE.md`](DOC-STYLE.md) section 2 for the shape each one takes.
- **`permalink`** is optional where the file path already produces the right
  URL (`permalink: pretty` is set site-wide), but writing it explicitly means
  moving the file never silently breaks the sidebar.
- **`revised`** is a real review date, not the date of the last typo fix.
- **`review_by`** is when that page is next due a read, normally a year after
  `revised`.

### Checking the site before you commit

```bash
python3 scripts/check-docs.py
```

It verifies internal links, that every referenced figure exists on disk, that
every figure has alt text, that front matter is complete and `kind` is one of
the four valid values, that no page contains a bare Liquid brace, and that
every page is reachable from `_data/nav.yml`. It exits non-zero on any
problem, so it is safe to put in front of a commit. Run it after any
documentation change, and after a capture run, since a renamed shot id leaves
a page pointing at a figure that no longer exists.

### Regenerating the figures

```bash
scripts/docs-screenshots/run.sh                    # everything
scripts/docs-screenshots/run.sh --section admins   # one path
scripts/docs-screenshots/run.sh --only fields-table
```

That script reseeds the demo database, starts the demo backend on port 8100,
and runs `scripts/docs-screenshots/capture.mjs` against the demo frontend on
port 3100. Neither port is ever beta's. Each audience path keeps its own
requests in `scripts/docs-screenshots/requests/<path>.yml`; the field
reference is `scripts/docs-screenshots/README.md`.

`scripts/docs-screenshots/inspect.mjs` prints every visible `aria-label`,
button, table, and dialog on a page, which is how to find a selector rather
than guessing one from the source:

```bash
node scripts/docs-screenshots/inspect.mjs /nets/1 --as W1PINE --wait-for 'table:visible tbody tr'
node scripts/docs-screenshots/inspect.mjs /nets/1 --as W1PINE --ancestors 'span[aria-label="Bulk add multiple check-ins"]'
```

Seeded demo data: net 1 is the active ARES net (14 check-ins, every station
status, two active NCS, custom fields), net 2 is scheduled, net 3 is closed
with a full log. `W1PINE` is NCS, `K1COVE` Logger, `N1LAKE` Relay, `KC1HILL` a
participant, `W1DEMO` the admin.

### Example callsigns, names, and organizations

Every worked example, screenshot, and speed-entry sample uses the roster
below, and nothing else. Do not invent a callsign. The reasoning is in
[`DOC-STYLE.md`](DOC-STYLE.md) section 6.

| Callsign | Name | Stands in for |
|---|---|---|
| `W1PINE` | Alex Reed | Net Control, and the schedule owner through most of the guide |
| `K1COVE` | Dana Whitfield | Logger |
| `N1LAKE` | Marcus Ellery | Relay |
| `KC1HILL` | Priya Nandan | A regular participant; the "you" of the operator path |
| `W1PORT` | Joan Alderman | Second net control on a multi-frequency net |
| `N1ROVE` | Chris Baumann | Mobile station, for the status and location examples |
| `K1CAMP` | Terry Osgood | Shelter station, for the traffic examples |
| `W2FERN`, `N2OAKS`, `K3BASE`, `W1MILL`, `N1BIRD` | (filler) | Table filler, enough rows for a realistic log |
| `N0CALL` | (none) | Reserved for "not configured yet" examples only |

Organizations: **Example County ARES**, **Example County SKYWARN**, and the
**Tuesday Evening Club Net**. Locations stay real New England towns, because
the map pages need addresses that actually geocode and a town name is not
personal information.
