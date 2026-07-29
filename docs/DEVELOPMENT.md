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
│   │   └── routers/             # See "Backend router-split (facade) pattern" below
│   │       ├── auth.py, users.py, check_ins.py, frequencies.py, chat.py,
│   │       │   settings.py, ncs_rotation.py, ncs_schedule.py, security.py,
│   │       │   geocode.py, contacts.py, feedback.py   # single-file routers
│   │       ├── nets.py            # facade — includes nets_{core,polls,export,roles}
│   │       ├── templates.py       # facade — includes templates_{core,merge,subscriptions,topics}
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
│   │   │   ├── netview/          # NetView.tsx's extracted dialogs/panels/tables
│   │   │   ├── profile/          # Profile.tsx's extracted tab components
│   │   │   └── scheduler/        # Scheduler.tsx's extracted pieces (ScheduleCard, ...)
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
│   └── USER-GUIDE.md
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

**The rule that prevents reminder/scheduling bugs:** `calculate_schedule_dates()` (in `routers/ncs_rotation.py`) projects *naive local* datetimes from the template rule. Any consumer that compares those projections against "now" must first convert with `template_local_to_utc(template, dt)` — never compare a naive local datetime against `datetime.utcnow()`. (This was the root cause of the June 2026 early/duplicate-reminder bug.)

**Current storage caveat (see ROADMAP — "UTC-aware datetime hardening"):** on SQLite, `DateTime(timezone=True)` does not actually persist an offset, so UTC instants are stored *naive by convention*. That is why several frontend call sites defensively append `'Z'` before parsing, and why backend boundary helpers return naive UTC. This convention is fragile and would break under PostgreSQL (`timestamptz` returns tz-aware values); the roadmap item tracks standardizing on tz-aware UTC end-to-end.

---

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
| `net_started` / `net_lobby_opened` | `routers/nets_core.py` — one call site picks between them based on whether the NCS opened the lobby or went straight live |
| `net_status_change` | `routers/nets_core.py` (net closed) and `routers/nets_export.py` (net archived/unarchived) |
| `net_pause_change` | `net_pause.py` |
| `role_change` | `routers/nets_roles.py` |
| `chat_message`, `chat_reaction`, `chat_image` | `routers/chat.py` |
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
