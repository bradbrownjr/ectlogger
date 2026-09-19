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
├── start.sh                     # Deprecated — use run.sh
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

---

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
./run                    # Interactive (prompts for update check)
./run --service          # Systemd / headless mode

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
if not await check_net_permission(db, net, user, required_roles=["ncs", "logger"]):
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

**Reminder windows must be one-sided, not ±tolerance:** `NCSReminderService._in_reminder_window()` (`ncs_reminder_service.py`) accepts `reminder_hours - catch_up_hours <= hours_until <= reminder_hours` — never earlier than the target lead time, only late enough to survive a missed poll tick. A symmetric `abs(hours_until - reminder_hours) <= catch_up_hours` window (the pre-2026-07-31 shape) fires on the *first* tick anywhere in that range, which in practice meant "1 hour" reminders consistently went out ~90 minutes before start, verified against real production sends. Any new reminder tier should reuse this helper rather than reintroducing a symmetric window.

**Comparing against a stored net instant:** helpers that do arithmetic on `Net.scheduled_start_time` must not assume it is naive. SQLite returns naive values, PostgreSQL returns tz-aware ones, and mixing the two raises `TypeError: can't compare offset-naive and offset-aware datetimes`. Normalize both sides first — `app/net_start.py::_as_naive_utc` is the pattern (auto-lobby's fire-time math uses it).

**Current storage caveat (see ROADMAP — "UTC-aware datetime hardening"):** on SQLite, `DateTime(timezone=True)` does not actually persist an offset, so UTC instants are stored *naive by convention*. That is why several frontend call sites defensively append `'Z'` before parsing, and why backend boundary helpers return naive UTC. This convention is fragile and would break under PostgreSQL (`timestamptz` returns tz-aware values); the roadmap item tracks standardizing on tz-aware UTC end-to-end.

---

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
| `can_hear_changed` | `routers/can_hear.py` — a "who can this station hear?" report was saved |
| `chat_message`, `chat_message_edited`, `chat_reaction`, `chat_image` | `routers/chat.py` — `chat_message_edited` carries the whole updated message (same shape as `chat_message`), so `Chat.tsx` replaces its copy by id instead of patching fields |
| `chat_net_mute_changed` | `routers/chat.py` — a staff member applied or lifted a net-wide chat mute (`data.active` true/false); keeps every already-open tab's mute banner/manage list live instead of only updating on next page load. Separate from `chat_message`'s own per-connection `only_for_user_ids` restriction, which is what actually keeps a net-wide-muted author's message off the wire to other viewers in the first place |
| `identity_verified_changed` | `routers/check_ins.py` — NCS/Logger confirmed or rejected a station's TOTP match on an authenticated net (`data.identity_verified` true/false); keeps every viewer's padlock icon live |
| `traffic_logged` | `routers/traffic_forms.py` — a form was filed on this net (`net_id` set); the per-net Traffic panel refetches its list and summary. Only fires when the form has a net; a standalone form has no connection group to notify |
| `traffic_log_changed` | `routers/traffic_log.py` — a chain-of-custody hop was appended to a form on this net (`net_id` set); the Traffic panel and the inbox badge refetch. Same not-fired-for-standalone-forms rule as `traffic_logged` |
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

The public site is built by GitHub Pages from `main`. There is no staging
site: whatever is on `main` is live within about a minute of the push. Layouts
live in `_layouts/`, the sidebar in `_data/nav.yml`, styles in
`assets/css/site.css`, and the pages themselves under `docs/`.

Full plan, including the audience split and the standards it was built
against: the Documentation & Help Site Overhaul item in
[ROADMAP.md](ROADMAP.md).

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
  **Reference**, or **Explanation**. It is not decoration: a page does not mix
  modes. A tutorial has exactly one path with no choices in it, a how-to
  assumes you know what you want and gets you there, reference is complete and
  scannable with no narrative, and explanation is allowed to be discursive.
  The 1,084-line user guide this site replaced was one document trying to be
  all four at once, which is why it served nobody.
- **`permalink`** is optional where the file path already produces the right
  URL (`permalink: pretty` is set site-wide), but writing it explicitly means
  moving the file never silently breaks the sidebar.
- **`revised`** is a real review date, not the date of the last typo fix.
- **`review_by`** is when that page is next due a read, normally a year after
  `revised`. It exists so "is the documentation still accurate" turns into a
  bounded, listable task: pages past their date, in order. Bump both together
  when you genuinely re-read a page, and neither for a typo fix.

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

### Figures

Screenshots are **generated, never hand-captured**. Each audience path keeps
its own figure requests in `scripts/docs-screenshots/requests/<path>.yml`, and
the command is `scripts/docs-screenshots/run.sh` (add `--section <path>` or
`--only <shot-id>` to narrow it). That script reseeds the demo database,
starts the demo backend on port 8100, and then runs
`scripts/docs-screenshots/capture.mjs`. Adding a figure means adding a
manifest entry, not opening an image editor: a hand-annotated PNG cannot be
regenerated, which is how the site ended up with eight-month-old screenshots
of a UI that had been redesigned twice. The field reference is
`scripts/docs-screenshots/README.md`.

Rules that are not negotiable:

- **Captures run against the seeded demo instance, never beta and never
  production.** Beta holds a copy of production's database, real names and
  email addresses included. A screenshot of it is a privacy incident.
- **Annotations are drawn at capture time.** A figure that tells the reader
  where to click gets a bright red box (`#e53935`) around the target, or a red
  underline where a box would swallow half the screen. The target is declared
  in the manifest as a selector, so it follows the control when the layout
  changes instead of pointing at empty space.
- **No instruction may exist only inside an image** (WCAG 1.4.5). The prose
  names the control by its label, and the alt text carries the same
  instruction in words. A red box is invisible to a screen reader.
- **Light mode only**, except for the one figure that exists to show the dark
  theme.

### Example callsigns, names, and organizations

Every worked example, screenshot, and speed-entry sample uses the roster
below, and nothing else. Do not invent a callsign for a new page.

**The rule: every example callsign carries a four-letter suffix.** The FCC's
sequential call sign system tops out at a three-letter suffix (1x3 and 2x3
being the longest forms it issues), so a four-letter suffix is structurally
unassignable in perpetuity. This is the same reasoning behind `N0CALL`, the
placeholder WSJT-X and Direwolf ship as their default. It means no screenshot
can put words in a real licensee's mouth, and a ham reading closely recognizes
the shape as a placeholder without it looking wrong.

The guide this site replaced used `KC1ABC`, `N1XYZ`, and `W1DEF`, every one of
which is a callsign the FCC can issue and may already have issued.

| Callsign | Name | Stands in for |
|---|---|---|
| `W1PINE` | Alex Reed | Net Control, and the schedule owner through most of the guide |
| `K1COVE` | Dana Whitfield | Logger |
| `N1LAKE` | Marcus Ellery | Relay |
| `KC1HILL` | Priya Nandan | A regular participant; the "you" of the operator path |
| `W1PORT` | Joan Alderman | Second net control on a multi-frequency net |
| `N1ROVE` | Chris Baumann | Mobile station, for the status and location examples |
| `K1CAMP` | Terry Osgood | Shelter station, for the traffic examples |
| `W2FERN`, `N2OAKS`, `K3BASE`, `W1MILL`, `N1BIRD` | — | Table filler, enough rows for a realistic log |
| `N0CALL` | — | Reserved for "not configured yet" examples only |

Organizations: **Example County ARES**, **Example County SKYWARN**, and the
**Tuesday Evening Club Net**. Named so they cannot be mistaken for a real
group or tread on anyone's mark.

Locations stay real New England towns, because the map pages need addresses
that actually geocode and a town name is not personal information.

### Voice

The site is written the way a sysop writes to other operators: practical,
specific, never breathless.

- "You" for the reader-operator. "We" sparingly, for the project.
- Sentence case for headings, buttons, and labels. Protocol literals keep
  their real casing: callsigns, `ICS-309`, `WXOBS`, `@MAINE`.
- **Contractions are normal, in moderation.** Measured against KC1JMH's own
  prose, the natural rate is roughly one contraction per seventy words:
  the retired `docs/USER-GUIDE.md` ran 1.6%, `docs/CHANGELOG.md` 1.0%. Writing them all
  out reads stiff and stops sounding like a person; leaning on them reads
  chatty. Neither extreme is the voice. Write the way you would say it to
  another operator and the rate takes care of itself.
- **Em-dashes, written as the real character.** This is a deliberate exception
  to the baseline "no em-dashes in generated text" rule in
  `.github/copilot-instructions.md`, and it applies to `docs/` path pages only,
  not to source, comments, or commit messages. KC1JMH's own prose is full of
  them (the retired `docs/USER-GUIDE.md` had 240, `docs/CHANGELOG.md` has 352) and the
  changelog's own mandated item format is built around one, so a site written
  without them would read less like the person it is supposed to sound like,
  not more. Four of the paths were first drafted with ` -- ` and normalized on
  2026-09-19; keep new pages consistent with the rest of the site.
- **Always give the why.** A sentence that says what a control does without
  saying what problem it solves gets rewritten.
- Expand an acronym on first use per page, then use it freely. Assume the
  reader knows amateur radio. Do not assume they know ARES, RRI, or ICS.
- Be honest about limits, where the reader will hit them, not in a footnote.
- No developer vocabulary. The changelog's forbidden-terms list applies here
  too: no "component", "endpoint", "modal", "boolean", "refactor".
- **No emoji in body copy.** They stay in exactly two places, where they are
  load-bearing: the roadmap's type tags and the changelog.
- How-to pages get numbered steps, one action per step, imperative mood, and
  the outcome stated before the steps. Explanation pages keep the long, dense,
  technically specific register; that is where it belongs.

### Reusable HTML in a page

Markdown is converted with Kramdown, so raw HTML passes through. The site
stylesheet defines three things worth reaching for:

```html
<div class="callout">
  <span class="callout-label">Note</span>
  <p>Body.</p>
</div>
```

`callout` also takes `warning` and `danger`. The label word is required: a
callout must never rely on its color to say what it is (WCAG 1.4.1).

```html
<figure>
  <img src="/docs/img/operators/check-in-dialog.png"
       alt="The check-in dialog, with the Check In button outlined in red at the bottom right.">
  <figcaption>The check-in dialog. Only the callsign is required.</figcaption>
</figure>
```

Add `class="control-figure"` for a partial capture of a single control, so it
renders at its own size instead of stretched to the column width.

### Never do this

- **Never document a feature that is not in production.** A page describing an
  unshipped feature is a bug. Feature-branch work gets its pages written on
  that branch and merged with it.
- **Never take "just one" screenshot from beta.**
- **Never write bare double braces in a page**, per the GitHub Pages rule in
  `.github/copilot-instructions.md`. Liquid is switched off for page content
  in `_config.yml`, which covers most of it, but the search index and the
  layouts do process Liquid.
