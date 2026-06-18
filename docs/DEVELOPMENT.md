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
│   │   ├── security.py          # Input sanitization, rate-limit helpers
│   │   ├── session_config.py    # Session rolling-renewal logic
│   │   ├── email_service.py     # Magic link, net notification, digest emails
│   │   ├── ncs_reminder_service.py  # Background NCS reminder scheduler
│   │   ├── whats_new_service.py     # Background "What's New" digest scheduler
│   │   ├── logger.py            # Structured application logger
│   │   ├── utils.py             # Shared utility functions
│   │   ├── routers/
│   │   │   ├── auth.py          # /auth — magic link, OAuth, JWT
│   │   │   ├── users.py         # /users — profile, admin user management
│   │   │   ├── nets.py          # /nets — net lifecycle, roles, invitations
│   │   │   ├── check_ins.py     # /check-ins — check-in CRUD
│   │   │   ├── frequencies.py   # /frequencies — global frequency library
│   │   │   ├── templates.py     # /templates — net schedule templates
│   │   │   ├── chat.py          # /chat — chat messages and images
│   │   │   ├── settings.py      # /settings — AppSettings singleton, field definitions
│   │   │   ├── ncs_rotation.py  # /ncs-rotation — rotation scheduling
│   │   │   ├── security.py      # /security — Fail2Ban integration
│   │   │   ├── statistics.py    # /statistics — platform, user, schedule stats
│   │   │   ├── geocode.py       # /geocode — grid square lookup
│   │   │   └── contacts.py      # /contacts — address book
│   │   └── services/            # Non-router service classes
│   ├── migrations/              # 034 numbered Python migration scripts (sqlite3 direct)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable components (Navbar, UserAvatar, etc.)
│   │   ├── contexts/            # React contexts (AuthContext, ThemeContext, LocationContext)
│   │   ├── pages/               # Full-page components (one file per route)
│   │   ├── services/
│   │   │   └── api.ts           # Axios client, all API call functions
│   │   ├── utils/               # dateUtils, pdfExport, userDisplay, etc.
│   │   ├── App.tsx              # Router, theme, global layout
│   │   ├── changelog.json       # Single source of truth for What's New content
│   │   └── main.tsx             # React entry point
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

## UI Design Reference

Before adding any new UI element, read **[docs/DESIGN.md](DESIGN.md)**. It covers:
- Floating Action Button sizing and positioning rules
- Tab scrollability and swipe-to-switch pattern
- Icon color conventions for toolbar buttons
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

`ConnectionManager` in `main.py` tracks connections per net. Message types:
`check_in_update`, `frequency_change`, `chat_message`, `online_users`, `net_started`,
`active_speaker`, `check_in_deleted`, `role_change`, `active_frequency`.

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
| Beta | `bradb@10.6.26.3` | 3.13 | Vite dev server, port 8000, auto-reload |
| Alpha | `bradb@10.6.26.6` | 3.13 | Feature testing before beta |
