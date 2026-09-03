# ECTLogger - AI Coding Agent Instructions

## Project Overview

ECTLogger is a real-time radio net logging application for Emergency Communications Teams (ECT) and SKYWARN spotter nets. Full-stack app: **Python 3.13+ FastAPI async backend** + **React TypeScript frontend**. Target deployment: Debian Trixie.

## Planning and Collaboration Rules

- Treat every user question as requiring a direct answer — never treat questions as rhetorical.
- **Answer questions before making code changes.**
- Before implementing a feature or significant change, present:
  - A clear plan of action
  - Any open questions that affect implementation
  - Risks, concerns, or tradeoffs
- For large changes, get alignment on the plan before writing code.
- Prefer cohesive refactors over layered quick fixes.

## UI Design Reference

**Before adding any new UI element, read [`docs/DESIGN.md`](../docs/DESIGN.md).**

Key rules enforced there:
- All `<Fab>` components use the default `large` size (56 px). Never set `size="medium"` or `size="small"` on a FAB.
- All `<Tabs>` use `variant="scrollable" scrollButtons={false}` with responsive `minWidth`/`px` sx props, plus a touch swipe handler on the wrapping `<Paper>`.
- Icon color conventions for toolbar buttons are fixed — check the table before picking a color.
- Identical controls must look identical across pages (symmetry and uniformity principle).
- Minimum touch target 44 × 44 px for primary actions.
- Card footer actions always use the shared `<CardActionButton>` (icon + one-word label), never a bare `<IconButton>`. Net and schedule cards split `<CardActions>` into a staff-gated management group and a view-only standard group; the standard group must never contain a mutating action. Order each group neutral → destructive → primary CTA last. `<CardActions>` is a wrapping flex row with `justifyContent: 'space-between'` so the groups share one row on wide cards (management left, standard right) and stack left-aligned when narrow — do not hardcode `flexDirection: 'column'` or a breakpoint. It must also carry `disableSpacing`, or MUI's sibling `margin-left: 8px` offsets the second group. See DESIGN.md "Card Action Buttons".
- In `ChangelogNotification.tsx`, every changelog item gets identical typography and an identical tinted background box. Item text is always `variant="body2"` at the default weight — never bold and never a conditional `fontWeight`. The ONLY thing `userImpact` changes visually is whether the "User Impact" chip is appended. Do NOT make the background or the text weight conditional.
- In `MaintenanceBanner.tsx`: always use `variant="filled"` on `<Alert>` (the standard variant is nearly invisible in dark mode), never wrap in `<Collapse>` (clips text), and poll at 10 s not 60 s. Uses `severity="error"` (red — a blocker). `UpdateAvailableBanner.tsx` follows the same layout/polling pattern but uses `severity="warning"` (yellow — a brief, non-blocking interruption). See DESIGN.md "Sitewide Alert Banners" for full rules and the color hierarchy.

**Before adding new development patterns, read [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md).**

It covers: file structure, migration template, AppSettings singleton pattern, deployment commands, and environment details.

---

## Architecture

### Backend (`backend/app/`)
- **FastAPI** with async/await using `AsyncSession` from SQLAlchemy
- **Entry point**: `main.py` - app init, CORS, rate limiting, WebSocket `ConnectionManager`, routers
- **Config**: `config.py` - Pydantic `Settings` reads from `backend/.env`
- **Database**: `database.py` - async SQLAlchemy (SQLite default, supports PostgreSQL/MySQL)
- **Auth**: Magic link email + OAuth2 → JWT tokens stored client-side

### Frontend (`frontend/src/`)
- **React 18** + TypeScript + Material-UI (MUI) + Vite
- **API client**: `services/api.ts` - Axios with JWT interceptor (auto-redirects on 401)
- **Auth state**: `contexts/AuthContext.tsx` - token in localStorage
- **Routing**: `App.tsx` - `PrivateRoute` wrapper for authenticated routes

### WebSocket (`main.py`)
- Endpoint: `WS /ws/nets/{net_id}?token=<jwt>`
- `ConnectionManager` tracks connections per net, broadcasts to all clients
- Server-originated types (a route handler calls `manager.broadcast` after a DB write): `check_in`, `status_change`, `check_in_deleted`, `hand_raised_changed`, `net_started`, `net_lobby_opened`, `net_status_change`, `net_pause_change`, `role_change`, `can_hear_changed`, `chat_message`, `chat_reaction`, `chat_image`, `traffic_logged`, `traffic_log_changed`, `ping`
- Client-originated types relayed verbatim by `main.py` (the server neither generates nor validates these): `active_speaker`, `active_frequency`, `bulk_check_in_status`
  - `check_in` was client-relayed until 2026-08-30: the checking-in operator's own browser sent it to notify everyone else after its REST call succeeded. A hiccup on *that one client's* socket at the wrong moment silently broke live sync for every other viewer while the system chat message (already server-broadcast) kept arriving fine — reported as the activity log bursting with new check-ins while the main table never moved. `check_ins.py::create_check_in` now broadcasts it directly, in line with how update/delete already did.
  - `bulk_check_in_status` (`data: {active: boolean}`) is a deliberate exception to preferring server-broadcast: `BulkCheckIn.tsx` sends it while its window is open (renewed every 8s) purely to drive the "check-ins may arrive in bursts" notice below the check-in table — cosmetic presence, not real check-in data, so client-relay is an acceptable pattern here. `useNetWebSocket.ts` self-clears the notice ~20s after the last renewal in case the sender's tab vanishes without sending `active: false`.
- Frontend connects when viewing active net, receives real-time updates
- Full table with emitting file per type: [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) "WebSocket"

## Domain Concepts

- **Net**: Radio session with lifecycle: DRAFT → SCHEDULED → ACTIVE → CLOSED
- **Check-in**: Station logging into active net (callsign, frequency, status)
- **Recheck**: Same callsign re-checking updates existing record (no duplicates)
- **Frequency**: Radio freq/mode or digital talkgroup - nets can have multiple
- **NetRole**: Per-net roles (NCS, Logger, Relay) separate from global `UserRole`

## Development

```bash
# Full stack (Windows)
.\start.ps1

# Full stack (Linux/macOS)  
./start.sh

# Backend only
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend only
cd frontend && npm run dev
```

**URLs**: Frontend :3000 | Backend :8000 | API Docs :8000/docs

## Code Patterns

### Adding API Endpoints
1. Define Pydantic schemas in `schemas.py` with `Field()` validation
2. Add route in `routers/*.py` with `Depends(get_current_user)` and `Depends(get_db)`
3. Add client method in `frontend/src/services/api.ts`

### Database Queries
Always async with eager loading to avoid lazy-load errors:
```python
result = await db.execute(
    select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
)
```

### Permission Checks
```python
if not await check_net_permission(db, net, user, required_roles=["ncs", "logger"]):
    raise HTTPException(status_code=403, detail="Permission denied")
```

## File Structure

- Models: singular (`User`, `Net`, `CheckIn`)
- Pages: PascalCase (`NetView.tsx`, `CreateNet.tsx`)  
- API routes: `/check-ins/nets/{net_id}/check-ins`

## Code Comments

**Always add clear comments** to improve maintainability:

- **Section headers**: Use `// ========== SECTION NAME ==========` for major UI sections (tables, forms, modals)
- **Conditional rendering**: Comment what triggers the condition (e.g., `{/* Shows when detached */}`)
- **Complex logic**: Explain business rules, especially permission checks and state transitions
- **API endpoints**: Document expected request/response in docstrings
- **Duplicate structures**: When similar code exists in multiple places (e.g., mobile vs desktop views), clearly label each instance

Example for repeated UI components:
```tsx
{/* ========== CHECK-IN LIST TABLE 1: Desktop Inline (attached) ========== */}
{/* This table displays when check-in list is NOT detached, on medium+ screens */}
<Table>...</Table>

{/* ========== CHECK-IN LIST TABLE 2: Mobile View ========== */}
{/* This table displays on small screens (xs) only */}
<Table>...</Table>
```

## Engineering Principles

- **DRY** — Don't Repeat Yourself. Extract shared logic rather than duplicating it.
- **SOLID** — Follow single-responsibility, open/closed, and dependency-inversion principles.
- **KISS** — Keep solutions simple, explicit, and maintainable. Favor clarity over cleverness.
- Favor clear architecture and extensibility over short-term shortcuts.
- Preserve architectural consistency — new code should match the patterns already established in the codebase.

## Root-Cause Policy

- Never patch symptoms. Always research and identify the root cause before implementing a fix.
- Resolve root causes thoroughly, even when the correct fix is more invasive than a quick workaround.
- Maintain a foundation-first mindset — a stable codebase matters more than shipping fast.

## Environment Setup

Copy `.env.example` to `backend/.env`:
- `SECRET_KEY` - JWT signing key (required)
- `SMTP_*` - Email config for magic links
- `DATABASE_URL` - defaults to `sqlite:///./ectlogger.db`

## Git Workflow

**IMPORTANT: Always commit and push changes to GitHub before deploying to any server.**

### Documentation Requirements

When adding or changing features, **always update relevant documentation**:
- `README.md` — Update feature list if adding new user-facing functionality
- `docs/USER-GUIDE.md` — Document how users interact with the feature
- `docs/CHANGELOG.md` — Add entry describing the change
- `docs/DEVELOPMENT.md` — Update if adding new technical patterns or APIs

### GitHub Pages / Jekyll Rules

All `.md` files in this repo are rendered by Jekyll via GitHub Pages. Jekyll processes Markdown through the Liquid template engine **before** converting it to HTML, which means any `{{` or `}}` sequence in a doc file is parsed as a Liquid variable — even inside backtick code spans.

**Never write bare `{{` or `}}` in docs.** This includes:
- JSX `sx` props: `sx={{ ... }}`
- Object literals: `{ key: { nested: value } }`
- Any double-brace construct in inline code or fenced code blocks

**Alternatives when documenting code patterns:**
- Describe the pattern in plain English instead of quoting JSX verbatim.
- If literal code is needed, wrap the block in `{% raw %}` / `{% endraw %}` tags — Jekyll strips these before rendering; they are invisible in the final output. (Note: they appear as literal text on GitHub.com's plain markdown view, so prefer plain-English descriptions in roadmap/changelog files and reserve `{% raw %}` for technical reference docs like DESIGN.md.)
- For single occurrences, split the braces with a zero-width space or describe the intent without the literal syntax.

This rule applies to: `docs/`, `README.md`, `CLAUDE.md`, and any other `.md` committed to the repo root or subdirectories.

### Changelog Notification (User-Impacting Changes)

When making **user-impacting changes** (new features, workflow changes, UI changes), update the in-app changelog:

1. Edit `frontend/src/changelog.json` — this is the **single source of truth**. The in-app `ChangelogNotification.tsx` dialog AND the backend `whats_new_service.py` daily digest email both read from this file, so they never drift apart.
2. **Always run `date` in the terminal first** to determine today's local date (default timezone: America/New_York, UTC-5 EST / UTC-4 EDT).
3. **Check whether today's date already has an entry** in `entries`. If it does, **add items to the existing sections** — do NOT create a new entry. Only create a new entry when no entry exists for today's date.
4. The top-level `version` and the entry's `version` field use format `YYYY.MM.DD`. The badge fires whenever the top-level `version` string changes from the value the user last saw. **Bump the suffix** (`b`, `c`, ...) any time you add changelog items to a version the user has already seen — i.e., the badge has already appeared and been cleared for the current version. Do not bump on every commit; only bump when users need to be notified of new content they haven't seen yet.
5. **Use only these four section titles and matching types — no others:**
   - `"New Features"` + `"type": "feature"`
   - `"Improvements"` + `"type": "improvement"`
   - `"Bug Fixes"` + `"type": "bugfix"`
   - `"Branding"` + `"type": "branding"`
   Put the feature name in the item text, not in the section title.
6. Each entry's `sections` array: `{ title, type, items: [{ text, userImpact? }] }`. Mark `userImpact: true` on items that directly affect user workflow.

### Changelog Item Format

Every changelog item must follow this pattern — no exceptions:

```
Category: Short label — Full sentence explaining what changed and why the user benefits.
```

**Rules:**

- **Category is always required.** Use the area of the app or scope the change affects: `Mobile`, `Profile`, `Archived Nets`, `Net View`, `Schedule`, `Admin`, `Check-in`, `Changelog PDF`, etc. Never write an item without a category prefix.
- **Use a colon** (not an em-dash) to separate the category from the label. `Profile: Net history` not `Profile — Net history`.
- **Always include the why.** The sentence after the dash answers: what can the user now do, or what problem went away? If it only says what changed technically and not why it helps, rewrite it.
- **Write for operators, not developers.** Forbidden terms: "drill-down", "component", "endpoint", "schema", "refactor", "overflow", "boolean flag", "modal". Use plain language: "your past nets", "the list narrows", "you can now jump to".
- **Group related changes under one item** when they serve the same user goal. Three UI changes that all help the user find past nets belong together, not as three separate entries.

### What NOT to log (as important as the format)

The changelog is a summary of what changed **for the user**, not a record of what we did. Three rules keep an entry readable:

1. **Never log a defect we introduced and fixed before it reached users.** If a redesign broke hover colors, dark mode, and a layout, and all three were fixed in the same release cycle, the net effect on the user is zero. Listing them reads as "we broke five things" and buries the changes that actually matter. They belong in git history. Only log a bug that users could actually hit in a released version.
2. **One user goal = one item**, no matter how many commits, files, or days it took. Labels on card buttons, splitting the staff row, and the wide-card layout are one item ("Redesigned card buttons"), not three.
3. **Nothing the user cannot perceive.** No "Under the Hood", no dependency bumps, no internal cleanups, no changelog-about-the-changelog. If you cannot finish the sentence "so you can now..." or "so that problem is gone", leave it out.

Before writing an entry, read it back as a user: if a reader would skim it, consolidate. An entry of 20+ items for one piece of work always means rules 1-3 were skipped. For reference, the 2026-07-28 UI/UX overhaul was written up as 24 items across two entries and consolidated down to 9 in one.

**In `CHANGELOG.md`**, the bold portion wraps the `Category: Label`, and a ` — ` separates it from the explanatory sentence:

```
* **Category: Label** — Sentence explaining the benefit.
```

**In `changelog.json`**, the entire item is one plain string in the same format:

```
"Category: Label — sentence explaining the benefit."
```

Both files must be updated together and must tell the same story.

Users see a red badge on the info icon (lower-left) until they view the changelog. The badge only reappears when the top-level `version` string changes, so only bump it when deploying user-facing changes. Subscribed users (Profile → "What's New emails") also receive a consolidated 8 AM email digest the morning after a release.

### Development Workflow
1. Make changes locally
2. Test locally if possible
3. **Update documentation** (README, USER-GUIDE, CHANGELOG as appropriate)
4. **Commit and push to GitHub**:
   ```bash
   git add -A
   git commit -m "Brief description of changes"
   git push origin main
   ```
4. Deploy to beta via `git pull`
5. Test on beta
6. **For a backend change whose correctness depends on an assumption about existing data** (uniqueness, non-null, at-most-one-row, etc.) — not every change, see below — **run it against beta's real database before promoting to prod**, not just fresh test fixtures
7. When confirmed working, deploy to production via `git pull`

### Why This Matters
- Direct SCP to servers causes drift between repo and deployed code
- Production deploys via `git pull` - if repo is stale, wrong code gets deployed
- Keeps full history of changes for rollback if needed

### Real-Data Smoke Testing (Before Promoting a Data-Assumption Change to Prod)

Unit tests build their own fixtures, which means the developer controls the data shape — so a
test can only catch a bad assumption ("there's at most one active X per Y") if the developer
happens to construct a fixture that violates it. Production data routinely doesn't match a
clean mental model. **A pytest pass against synthetic fixtures is not evidence a data-shape
assumption is safe against production's actual rows.**

Concrete incident (2026-09-03): a new eligibility check used `scalar_one_or_none()` to test "does
an active NCS already exist on this net" — correct against every hand-built test fixture (which
never had more than one), but wrong against real data, where 18 production nets already had 2+
simultaneous active NCS roles (a legitimate pattern, not corrupt data — see net 15's multi-desk
SKYWARN exercise). `GET /nets/{id}` 500'd for all 18 nets for about 3.5 hours before a user report
caught it. Two unit tests with clean fixtures and a UI screenshot of one unrelated net had already
been called "tested on beta" — neither ever exercised the real duplicate-row shape sitting in
beta's own database the whole time.

**When to run this step**: any backend change to a function whose logic depends on how many rows
match a query, whether a field is ever null, or similar "this should always be true of the data"
assumptions — not routine feature work with no such assumption.

**How**: write a short throwaway script (see the pattern below) that imports the real function and
runs it against every relevant row already in beta's `ectlogger.db` (not a temp/in-memory test
DB), catching and reporting any exception instead of raising on first failure. Run it, read the
output, then discard the script — it doesn't need to become a permanent test suite member unless
the same assumption is worth guarding going forward with a real pytest case (do that too, as
happened here — see `backend/tests/test_ncs_auto_grant_gate.py`).

```python
# Adapt per-change: import the real function, iterate the real rows it touches,
# run it, and collect exceptions instead of stopping at the first one.
import asyncio, sys
sys.path.insert(0, "/home/bradb/ectlogger/backend")  # beta's actual backend path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.models import Net, NetRole                       # whatever the function touches
from app.permissions import is_eligible_for_ncs_auto_grant  # the function under test

async def main():
    engine = create_async_engine("sqlite+aiosqlite:////home/bradb/ectlogger/backend/ectlogger.db")
    errors = []
    async with AsyncSession(engine) as db:
        nets = (await db.execute(select(Net))).scalars().all()
        for net in nets:
            user_ids = (await db.execute(
                select(NetRole.user_id).where(NetRole.net_id == net.id).distinct()
            )).scalars().all()
            for user_id in user_ids:
                try:
                    await is_eligible_for_ncs_auto_grant(db, net, user_id)
                except Exception as e:
                    errors.append((net.id, net.name, user_id, repr(e)))
    print(f"{len(errors)} errors" if errors else "No errors.")
    for e in errors: print(e)

asyncio.run(main())
```

Run the same check against production's own database (read-only, no writes — it just calls the
function and reports exceptions) as part of the pre-deploy safety check, before restarting the
production service, since beta's copy can itself be stale (see "Refreshing beta's database from
production" below) and production can have rows beta doesn't have yet.

### Long-Running Feature Branches (Substantial Roadmap Items)

For a multi-phase roadmap feature (the kind with its own "Design questions to resolve" list and a multi-agent **Model:** line, e.g. Assisted Traffic Handling, MFA/TOTP, Teams), don't build directly on `main`:

1. **Create a dedicated branch** (`feature/<short-name>`) off `main` for the whole feature. All phases of the feature land as commits on this branch.
2. **Test on beta from the branch** until the feature is confirmed working there. Do not merge to `main` — and therefore never deploy to production — until beta confirms it.
3. **Merge to `main` and deploy to production only once beta confirms it.** This is the same beta-before-prod discipline already used for regular changes, just held at the branch level instead of per-commit.
4. **Changelog dates reflect the actual production release date, not the build date.** While work is happening on the feature branch (including on beta), do **not** add entries to `docs/CHANGELOG.md` or `frontend/src/changelog.json` yet. Write those entries when the branch is merged to `main` and deployed to production, dated (and versioned `YYYY.MM.DD`) for that actual deploy day — never backdated to whenever the commits were authored on the branch.
5. **Bug fixes made to get the feature shippable are not separate changelog items.** Any bug fixed while developing or stabilizing the feature branch — whether it's a defect the feature branch introduced or a pre-existing bug found along the way — gets folded into normal development and is not logged as its own changelog entry once the feature ships. Only the feature's user-facing capability is logged. (This extends the existing "never log a defect we introduced and fixed before it reached users" changelog rule to cover incidental bug fixes generally, not just self-introduced ones, for the duration of a feature branch.)

## Deployment Environments

### Production (app.ectlogger.us)
- **Host**: `ectlogger@app.ectlogger.us`
- **Python**: 3.11.2
- **Path**: `~/ectlogger`
- **Frontend**: Static files in `frontend/dist/` served by **Caddy**
- **Backend**: uvicorn on port 8001 (no auto-reload)
- **Reverse Proxy**: Caddy handles HTTPS, routes `/api/*` and `/ws/*` to backend
- **Service control**: passwordless sudo is configured for these exact commands:
  - `/usr/bin/systemctl restart ectlogger`
  - `/usr/bin/systemctl is-active ectlogger`
  - `/usr/bin/systemctl status ectlogger`
- **Pre-deploy safety check (required, every time)**: a production deploy restarts the backend,
  which drops in-flight WebSocket connections and briefly interrupts the API — never do this
  while a net is live or while a real user is actively on the site. Before touching production
  (merging to `main` with intent to deploy, or restarting the service), check both:
  ```bash
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && python3 -c \"
  import sqlite3
  conn = sqlite3.connect('backend/ectlogger.db')
  cur = conn.cursor()
  cur.execute(\\\"SELECT id, name, status FROM nets WHERE status IN ('active','lobby')\\\")
  print('Active/lobby nets:', cur.fetchall())
  cur.execute(\\\"SELECT callsign, last_active FROM users WHERE last_active > datetime('now', '-15 minutes') AND callsign != 'KC1JMH' ORDER BY last_active DESC\\\")
  print('Users active in last 15 min (excluding the developer):', cur.fetchall())
  \""
  ```
  `KC1JMH` is the developer's own account — its activity is this workflow running, not a real
  user, so it's excluded from the user-activity check (it's still caught by the active-net check
  if it's actually running a net). If the net query returns any rows, or the user query returns
  anyone else, hold off — deploy to beta only and confirm timing with the user before touching
  prod. This applies even to changes that were already approved/tested; approval to ship isn't
  approval to ship at any specific moment.

  **What each half of that check actually means.** The two queries answer different questions and
  neither replaces the other:
  - **Active/lobby nets** is the one that protects people *quietly watching a net*. Someone
    monitoring a net may click nothing for an hour and still be very much present, so a live net
    is a hard stop on its own, regardless of what `last_active` says about anyone.
  - **`last_active`** means "this operator did something deliberate", not "has a tab open".
    Automatic polls send `X-Background-Request: 1` and are deliberately excluded from it
    (`backend/app/dependencies.py`), so an idle tab parked on the dashboard no longer keeps a
    user looking permanently active. Before this, one real user (`W1CPR`) showed as
    active-within-the-minute continuously from the day they registered, which made this check
    useless — it was reporting an open browser tab, not a person. **Never "fix" a future version
    of this by stamping `last_active` on polled endpoints again**; add the header to any new poll
    instead.
- **Deploy from GitHub**:
  ```bash
  # 1. Pull latest from GitHub
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && git pull origin main"
  
  # 2. Build frontend (REQUIRED after any frontend change — git pull alone is not enough)
  #    Cap the Node heap: production is a 1.8 GB VPS with NO swap, and an
  #    unbounded build gets OOM-killed partway through (see the warning below).
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger/frontend && NODE_OPTIONS=--max-old-space-size=1024 npm run build"

  # 2b. ALWAYS confirm the build actually produced a page — a killed build is
  #     silent apart from the word "Killed" in the log.
  ssh ectlogger@app.ectlogger.us "ls ~/ectlogger/frontend/dist/index.html ~/ectlogger/frontend/dist/assets/"
  
  # 3. Restart backend (for backend changes and migrations)
  ssh ectlogger@app.ectlogger.us "sudo -n /usr/bin/systemctl restart ectlogger"
  
  # 4. Verify
  ssh ectlogger@app.ectlogger.us "sudo -n /usr/bin/systemctl is-active ectlogger"
  ssh ectlogger@app.ectlogger.us "sudo -n /usr/bin/systemctl status ectlogger"
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && git log --oneline -3"
  ```
- **Deploy verification**: after every deploy, confirm prod git log matches local with `ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && git log --oneline -3"`.
- **A killed frontend build takes the whole site down (happened 2026-09-03).** Production
  has 1880 MB RAM and **no swap**, and the bundle is ~2.9 MB unminified-chunk sized, so
  `npm run build` can be OOM-killed during "rendering chunks". Vite **empties `dist/`
  before it writes anything**, so a killed build leaves `dist/` with no `index.html` at
  all and Caddy serves nothing — a full outage, from a command whose only symptom was the
  single word `Killed` at the end of otherwise-normal build output. Always build with
  `NODE_OPTIONS=--max-old-space-size=1024` and always verify `dist/index.html` exists
  afterward. If a build is ever killed, **re-run it immediately** — the site is down until
  one completes. Never walk away from a production build without checking its last lines.

### Beta (ectbeta.lynwood.us)
- **Host**: `10.6.26.3` (`bradb@10.6.26.3`) — **NOT an SSH target.** This is the
  same LXC container this coding session already runs in, as the same user
  (`bradb`). Do not `ssh` here; it will fail (key not authorized) or, worse,
  loop back to this same session. Run every beta command directly, exactly
  like Alpha/Production commands but without the `ssh <host>` prefix. The
  address is listed only so it's recognizable in logs/configs — never dial it.
- **Python**: 3.13
- **Purpose**: Testing new features before production deployment
- **Note**: Deploy new/incomplete features to beta ONLY until tested and confirmed working
- **Path**: `/home/bradb/ectlogger`
- **Frontend**: `vite preview` serving a static build on port 3000 — **not** a dev server. No HMR, no live reload. Confirmed 2026-07-28 via `ps aux` (`vite preview --host 0.0.0.0 --port 3000`). `npm run build` is REQUIRED after every frontend change, exactly like production — a plain `git pull` is not enough for frontend changes to appear.
- **Backend**: uvicorn on port 8000 (with auto-reload)
- **Deploy from GitHub** (preferred):
  ```bash
  # First commit and push locally, then pull on beta
  # Note: beta is an LXC container on the same host — commands run directly, no SSH needed
  cd /home/bradb/ectlogger && git pull origin main

  # Build frontend (REQUIRED after any frontend change — git pull alone is not enough)
  cd /home/bradb/ectlogger/frontend && npm run build

  # Restart backend (passwordless sudo configured for these exact commands)
  sudo -n systemctl restart ectlogger
  sudo -n systemctl is-active ectlogger
  ```
- **Sudo**: passwordless sudo configured for `stop`, `start`, `restart`, `is-active`, `status` on the `ectlogger` service via `/etc/sudoers.d/ectlogger`. Use `sudo -n` (non-interactive).
- **Email**: two independent guards, and **both must stay in place**. `EMAIL_ENABLED=false` in `.env` makes every send a logged no-op before any connection is attempted, and `SMTP_HOST=127.0.0.1` makes connections fail anyway. Never set `EMAIL_ENABLED=true` on beta or alpha without the user explicitly asking — beta's database holds real user addresses. See `docs/DEVELOPMENT.md` "Enabling and disabling outbound email" for the temporary-enable procedure.
- **Database**: SQLite at `/home/bradb/ectlogger/backend/ectlogger.db`

#### Refreshing beta's database from production

Beta has held a copy of production's database since 2026-08-11 (see `docs/DEVELOPMENT.md` if it
documents the original sync). It drifts further behind with every real production net, so
real-data smoke testing (above) against beta can silently miss rows that only exist in
production. Refresh it occasionally — there's no fixed schedule, just do it when beta feels stale
or before testing a change where recent data matters:

```bash
# 1. Back up beta's current DB first (never overwrite without a restorable copy)
cp /home/bradb/ectlogger/backend/ectlogger.db \
   /home/bradb/ectlogger/backend/ectlogger.db.bak-$(date +%Y%m%d)

# 2. Copy production's DB down (small SQLite file, ~1MB as of 2026-09-03)
scp ectlogger@app.ectlogger.us:~/ectlogger/backend/ectlogger.db \
    /home/bradb/ectlogger/backend/ectlogger.db

# 3. Restart beta's backend so it picks up the new file
sudo -n systemctl restart ectlogger
sudo -n systemctl is-active ectlogger
```

**This carries real user PII to a second host** — same tradeoff already accepted for beta since
2026-08-11, not a new one, but worth remembering each time. `EMAIL_ENABLED=false` /
`SMTP_HOST=127.0.0.1` in beta's `.env` live outside the DB file, so a DB-only copy never touches
them — but never set `EMAIL_ENABLED=true` on beta regardless (see the Email note above). Don't
automate this on a cron/timer without the user asking for it explicitly — it's a manual,
occasional refresh, not standing infrastructure, per the same "confirm before recurring
actions that touch shared/production-derived state" judgment as any other production-adjacent
change.

### Alpha (10.6.26.6)
- **Host**: `bradb@10.6.26.6`
- **Python**: 3.13
- **Path**: `/home/bradb/ectlogger`
- **Purpose**: Feature testing before beta
- **Frontend**: documented as Vite dev server on port 3000, but beta's identical-sounding entry turned out to actually be `vite preview` (static build) — alpha was unreachable (`No route to host`) when this was checked 2026-07-28, so this line is unverified. Confirm with `ps aux | grep vite` before assuming HMR works here; if it's also `vite preview`, `npm run build` is required after frontend changes.
- **Backend**: uvicorn on port 8000 (with auto-reload)

### Local Development
- Local machine is the IDE with SSH access to the 3 environments above
- No servers run locally; all testing done on alpha/beta/production

## Database Migrations

Migrations are individual Python scripts in `backend/migrations/`. Run each one separately:

```bash
# On production (needs venv for some migrations)
ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && python3 backend/migrations/006_add_netrole_active_frequency.py"

# If migration uses SQLAlchemy, activate venv first
ssh ectlogger@app.ectlogger.us "cd ~/ectlogger/backend && source venv/bin/activate && python migrations/010_add_template_ics309.py"

# On beta
ssh bradb@10.6.26.3 "cd /home/bradb/ectlogger && python3 backend/migrations/006_add_netrole_active_frequency.py"
```

**Note**: `migrate.sh` is for URL configuration, NOT database migrations. Don't use it for schema changes.

Fresh installations don't need migrations - they get the current schema from `models.py`.

## Always/Never Memory Protocol

This file (`copilot-instructions.md`) is the agent's persistent memory for this project.

- If the user says to **always** or **never** do something, treat it as an instruction to update this file with that rule.
- If an instruction is not written here, assume it may be forgotten in future sessions.
- Capture always/never rules as clear, testable directives.

## Definition of Done

A change is complete when:

- It solves the validated root cause (not just the symptom).
- The implementation follows DRY, SOLID, and KISS principles.
- User-facing behavior is clear and appropriate for the audience (net operators, NCS, ECT staff).
- Related documentation is updated (`README.md`, `USER-GUIDE.md`, `CHANGELOG.md` as applicable).
- If user-impacting: `ChangelogNotification.tsx` version is bumped and an entry is added.
- Changes are committed and pushed to GitHub before being deployed to any server.

---

## Baseline additions (from agents-baseline)

The following sections were appended from the cross-project
`agents-baseline` standard. Some may duplicate rules already present
above — prune or merge as you review.

### Phase / Milestone Completion Guardrail

Never mark a phase, milestone, or roadmap item "complete" without:

1. Reading the full requirement section top-to-bottom.
2. Checking for "pending", "planned", or "deferred" — if any remain,
   the phase is **not** complete.
3. Verifying each requirement: code exists, tests pass, docs match.
4. Asking the user "Ready to mark X complete?" before flipping the flag.
5. If in doubt, leave it "in progress" and summarize done vs pending.

This is a learned rule — phases tend to get auto-completed prematurely
on multi-part work. The guardrail is a deliberate checkpoint.

### Regression Check Policy

- **Before every commit**, mentally run `git diff --stat`. If deletions
  outnumber additions, or any single file is shrinking by more than ~50
  lines, **explicitly audit** that no shipped behavior is being removed.
- A single commit removing **200+ lines** from one file requires a
  written justification in the commit body.
- Before any large file rewrite, list the named features / API routes /
  exported functions present in that file, then confirm each one
  survives. Cross-reference against the Feature Registry.
- Run the full local test/lint suite after any multi-file change.
- After pushing, watch CI. A regression that goes green locally but red
  in CI is still a regression — fix forward, don't disable the check.

### Implementation Discipline

- Only make changes that are directly requested or clearly necessary.
- Don't add features, refactor code, or make "improvements" beyond scope.
- Don't add docstrings, comments, or type annotations to code you
  didn't change.
- Don't add error handling for scenarios that can't happen. Validate at
  system boundaries only.
- Don't create helpers or abstractions for one-time operations.

### Subagent Usage

- Prefer subagents (e.g., `Explore`) for read-only multi-step research
  to avoid cluttering the main conversation. Safe to call in parallel.
- Specify thoroughness explicitly (quick / medium / thorough).
- Subagents are stateless — give them complete context in the prompt
  and tell them exactly what to return.

### Validate Locally Before Pushing

- CI ping-pong (push → wait → fix → push) is the slowest feedback loop.
- If a toolchain is missing locally, install it once rather than
  firefighting per CI run.
- Symptom of falling into the trap: "fix one error, push, new error,
  fix, push" cycle. Stop and audit holistically.

### Output style defaults

- No emoji in code, comments, commit messages, or generated docs unless
  explicitly requested.
- No em-dashes in source code or generated text — use commas, periods,
  or parentheses.

### Feature Registry

Maintain a compact checklist of shipped user-facing features keyed to
their primary implementation files. Before any large refactor, verify
every row touching the affected file column is preserved. File paths
reflect the post-Milestone-0.4 split (backend router facades, frontend
`components/<page>/` + `hooks/`) — see `docs/DEVELOPMENT.md` for the
split patterns themselves.

| Feature | Key file(s) | Key identifiers |
|---|---|---|
| Net lifecycle (draft→scheduled→lobby→active→closed→archived, or draft/scheduled→cancelled) | `backend/app/routers/nets_core.py`, `nets_export.py`; `frontend/src/pages/NetView.tsx`, `hooks/useNetData.ts` | `NetStatus` enum (includes `CANCELLED`), `POST /nets/{id}/start`, `/close`, `/archive`, `/cancel`, `/restore` |
| Net cancellation (soft, reversible) | `backend/app/routers/nets_export.py::cancel_net`/`restore_net`; `backend/app/ncs_reminder_service.py::_is_cancelled_occurrence`; `frontend/src/pages/Dashboard.tsx` (Cancel/Delete dialog, Archived Nets list) | Cancelling a draft/scheduled net sets `NetStatus.CANCELLED` + `cancelled_at`/`cancel_reason` instead of deleting the row (was `DELETE /nets/{id}`, which made the reminder scheduler see "no net for this slot" and silently recreate it — reminder email included). Shows in Archived Nets tagged "Cancelled"; `Restore` returns it to Scheduled (if `scheduled_start_time` set) or Draft. `_is_cancelled_occurrence` gates all four reminder/auto-create loops in `ncs_reminder_service.py` so a cancelled occurrence is never recreated or reminded about |
| Manual "Create Net" from a schedule | `backend/app/routers/templates_subscriptions.py::create_net_from_template` | `POST /templates/{id}/create-net`; copies `net_frequencies` — regressed once (2026-07) when this import broke silently, see `test_templates.py`. A cancelled occurrence for the slot is not treated as "already exists" — a manual click here creates a fresh net for it |
| Automatic scheduled net creation | `backend/app/ncs_reminder_service.py::_get_or_create_scheduled_net` | Background job; catches its own exceptions and returns `None` on failure — check logs, not just HTTP responses, when debugging |
| Auto-open lobby before scheduled start | `backend/app/net_start.py`; `backend/app/ncs_reminder_service.py::_check_and_auto_open_lobbies`/`_find_lobby_candidates`; `routers/nets_core.py::start_net` (no-scheduled-time branch); `routers/templates_subscriptions.py::create_net_from_template` (one-time start-time override) | `auto_lobby_minutes` on both `NetTemplate` and `Net` (null = off, `0` = enabled with no offset). Recurring schedules, and a one-time net given a start time, use the background job. Ad-Hoc, and a one-time net left with no start time, are honored directly on manual Start instead - there's no time to count down from either way. The one-time start-time field (`CreateNetFromTemplateRequest.scheduled_start_time`) is independent of the lobby toggle; filling it in is what switches which of the two behaviors applies. Background job matches DRAFT and SCHEDULED nets, not just SCHEDULED. Interacts with `_find_stale_nets` (an auto-opened lobby nobody attended must still be archived) and with `send_net_start_notifications` (silent for a background auto-open, sent immediately for any manual Start) |
| Check-in CRUD + recheck dedup | `backend/app/routers/check_ins.py`; `frontend/src/components/netview/CheckInTable.tsx`, `CheckInMobileList.tsx`, `checkInActions.ts` | Unified desktop/detached table (was 3 near-duplicate tables pre-0.4) |
| NCS staff / rotation management | `backend/app/routers/ncs_rotation.py`, `ncs_schedule.py`; `frontend/src/components/NCSStaffModal.tsx` (parent) + `components/ncs-staff/*Tab.tsx` | `NCSRotationMember`, `TemplateStaff`, drag-reorder via `/ncs-rotation/members/reorder` |
| Schedule/template creation | `backend/app/routers/templates_core.py`, `templates_merge.py`, `templates_topics.py`; `frontend/src/pages/CreateSchedule.tsx` + `components/create-schedule/`, shared `components/forms/` | `NetTemplate`, `schedule_type`/`schedule_config` (local-time recurrence rule, see Date & Time Handling) |
| Net creation (ad hoc) | `frontend/src/pages/CreateNet.tsx` + `components/create-net/` | Shares 4 form panels with CreateSchedule via `components/forms/` |
| Template subscriptions / email digest | `backend/app/routers/templates_subscriptions.py`; `backend/app/email/digest.py` | `NetTemplateSubscription`, "What's New" opt-in |
| Chat (messages, reactions, images) | `backend/app/routers/chat.py`; `frontend/src/components/netview/` (chat side panel) | WebSocket `chat_message` type |
| Activity statistics / drill-downs | `backend/app/routers/statistics_user.py`, `statistics_net.py`, `statistics_global.py`, `statistics_geo.py`; `frontend/src/pages/Profile.tsx` + `components/profile/ActivityTab.tsx`, `DrillDownTable.tsx` | `DrillDownTable` unifies what were 2 near-duplicate paginated tables |
| Profile identity + settings | `frontend/src/pages/Profile.tsx` + `components/profile/ProfileTab.tsx`, `SettingsTab.tsx`, `ProfileAvatarSection.tsx` | Shared `formData`/`handleSubmit` stay in the parent page — the two tabs submit the same `PUT /users/me` |
| Admin panel (6 tabs) | `frontend/src/pages/Admin.tsx` + `components/admin/*Tab.tsx` | Users, settings, feature flags, maintenance banner, Ko-fi config, changelog |
| Auth (magic link + password fallback + OAuth-registered-but-unimplemented → JWT) | `backend/app/routers/auth.py`, `app/auth.py`; `backend/app/email/auth.py` | `create_magic_link_token`, `create_access_token`. Password login (`POST /auth/login`) accepts callsign or email, bcrypt-hashed, 5-attempt/15-min lockout. OAuth client registration exists but the callback exchange is a `501` stub -- not a working login path |
| Two-factor authentication (TOTP) | `backend/app/routers/auth.py` (`_resolve_mfa`, `/auth/mfa/*`), `app/auth.py` (TOTP/Fernet helpers), `app/dependencies.py::get_admin_user`; `frontend/src/components/profile/SecurityTab.tsx` | Optional for regular users, required for admins -- enforced both at login (`_resolve_mfa`) and on every admin-only route (`get_admin_user` checks `mfa_enabled`, not just role). `MFA_SETUP_REQUIRED_DETAIL` string must stay in sync between backend and `frontend/src/services/api.ts`. Recovery: another admin via `POST /users/{id}/mfa/reset`, or `backend/scripts/reset_admin_mfa.py` if none exists. See `docs/PASSWORD-MFA.md` |
| Email notifications (net lifecycle, reminders, logs) | `backend/app/email_service.py` (facade) + `app/email/{base,auth,net_lifecycle,reminders,net_logs,digest}.py` | `EmailService` facade class |
| WebSocket real-time updates | `backend/app/main.py::ConnectionManager`; `frontend/src/hooks/useNetWebSocket.ts` | Server-originated: `check_in`, `status_change`, `check_in_deleted`, `hand_raised_changed`, `net_started`/`net_lobby_opened`, `net_status_change`, `net_pause_change`, `role_change`, `can_hear_changed`, `chat_message`/`chat_reaction`/`chat_image`, `traffic_logged`, `traffic_log_changed`, `ping`. Client-relayed: `active_speaker`, `active_frequency`, `bulk_check_in_status`. `useNetWebSocket.ts` also runs a client-side liveness watchdog (last-message timestamp + visibilitychange check) that force-reconnects a socket that looks OPEN but has gone silent past 2 heartbeat intervals — the failure mode a purely close/error-driven reconnect can't see |
| Bulk check-in burst notice | `frontend/src/components/BulkCheckIn.tsx` (sends `bulk_check_in_status`, renewed every 8s while open); `frontend/src/hooks/useNetWebSocket.ts` (`setBulkCheckInActive`, ~20s self-clear); `frontend/src/pages/NetView.tsx` + `NetPaneWindow.tsx` (render the notice below the check-in table, both attached/detached/pop-out variants) | Purely cosmetic live presence -- tells every connected viewer why the check-in table may be moving in clumps while someone runs Bulk Add, instead of it looking broken (see the `check_in` client-relay history above) |
| Permission checks (owner/admin/co-manager/staff) | `backend/app/permissions.py` | `check_net_permission`, `check_template_permission` — used across nets/templates/check-ins routers. `check_net_permission` only honors an *active* `NetRole` (`is_active == True`) — stepping down to Standard via `toggle_self_net_role` actually revokes elevated access, not just the display |
| NCS attribution (who is shown as "the NCS") | `backend/app/utils.py::format_ncs_attribution` (the single rule); callers `routers/nets_core.py` (net list cards + `get_net`), `routers/nets_export.py` (ICS-309 `radio_operator`) | Resolves `NetResponse.ncs_callsign` / `ncs_name`: **every active NCS, oldest assignment first**, callsigns comma-joined. Two rules that must not regress: (1) filter `NetRole.is_active` — stepping down via `toggle_self_net_role` flips that flag instead of deleting the row, so an operator who stepped down must stop being credited; (2) order `assigned_at` **ASC**, never DESC — `_assign_duty_ncs` pre-assigns the rotation's scheduled pick ~24h before the net, so most-recent-wins meant *any* later grant outranked the person actually running it. All three sites used `assigned_at DESC LIMIT 1` with no `is_active` filter until 2026-09-03, which is why net 79's report/card/ICS-309 all credited Peter (an erroneous 13:53 grant) instead of Cory (scheduled, assigned 13:00) — the original user-reported bug. `ncs_name` is returned **only when there is exactly one** NCS: most accounts have no `name`, so joining names independently produced a shorter, misaligned list (net 15 rendered as 8 callsigns followed by 1 unrelated name; ICS-309 read "Peter / WO1J, NB1T, ..."). Regression tests: `backend/tests/test_ncs_attribution.py` |
| Backup NCS auto-grant | `backend/app/routers/check_ins.py::create_check_in` (grant block, after the auto-opened-lobby check); `permissions.py::is_eligible_for_ncs_auto_grant` (shared eligibility check) | An active co-manager (`TemplateStaff.is_co_manager`) or active `NCSRotationMember` for a net's template is eligible to become `NetRole("NCS")` the moment they check *themselves* into any occurrence, even off-week — no separate "claim" step. Eligibility does **not** depend on whether someone else already holds an active NCS role: a net can legitimately have many simultaneous active NCS (e.g. net 15, "GYX SKYWARN / Emergency Communications Exercise" — 8 different eligible staff each deliberately checked in as NCS within minutes of each other for their own desk). Restricted to self-check-in (`current_user.id == linked_user_id`); a staff-entered check-in (NCS/Logger logging someone in, e.g. by voice) never grants, always Standard. Scoped to template-based nets; ad hoc nets have no co-manager/rotation pool. `CheckInCreate.check_in_as_standard` gates the actual grant, and is **fail-safe**: it defaults to `True` (Standard) in the schema and the grant tests `is False`, so only an affirmative "Check in as NCS" request grants — an omitted field, an explicit `null`, or any caller that simply forgets all check in as a participant. Never reintroduce a `False`/falsy default here or gate the grant with `not check_in_as_standard`: it defaulted to `False` until 2026-09-03, which made *omitting* the field a request for NCS and left correctness resting on ~7 scattered frontend literals staying right. Three of them were still `false` (the initial `checkInForm` state, the post-start reset, and `checkInActions.ts`'s post-submit reset), so an eligible operator typing their **own** callsign into the inline check-in form was silently made NCS — the Dirigo failure through a different door. `NetResponse.current_user_ncs_eligible` (same helper) drives whether that NCS/Standard choice is even offered, unaffected by anyone else's current NCS status. They can also step down after the fact via the existing Acting as NCS/Standard toggle (`nets_roles.py::toggle_self_net_role`, requires an existing NCS role — cannot be used to gain NCS for the first time), which now actually changes backend permission thanks to the `is_active` fix above. `Claim NCS` (owner/admin-only recovery for orphaned nets) is intentionally unchanged/still narrow — the only recovery path on ad hoc nets. History: gated 2026-09-02 after the ME Dirigo Net incident (net 79, 2026-08-30, an off-week rotation member silently auto-granted NCS with no choice presented) by also blocking eligibility whenever anyone else was already active NCS; that block broke net 15's multi-desk pattern and crashed `GET /nets/{id}` outright for every net with 2+ active NCS rows (`scalar_one_or_none()` on a non-unique query, 18 nets on production) — removed 2026-09-03, since the actual incident is fully covered by the two default-to-Standard fixes above |
