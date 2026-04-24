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
- Message types: `check_in_update`, `frequency_change`, `chat_message`, `online_users`
- Frontend connects when viewing active net, receives real-time updates

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

### Changelog Notification (User-Impacting Changes)

When making **user-impacting changes** (new features, workflow changes, UI changes), update the in-app changelog:

1. Edit `frontend/src/changelog.json` — this is the **single source of truth**. The in-app `ChangelogNotification.tsx` dialog AND the backend `whats_new_service.py` daily digest email both read from this file, so they never drift apart.
2. Increment the top-level `version` field (format: `YYYY.MM.DD` using the **author's local calendar date** at time of change, or `YYYY.MM.DDx` for multiple updates on same day, e.g., `2026.01.25b`). Dates are stored as fixed calendar labels and displayed as-written — no UTC conversion is applied.
   - **Always run `date` in the terminal before writing a changelog entry** to get the current UTC time, then convert to the author's local timezone (default: America/New_York, UTC-5 EST / UTC-4 EDT) to determine the correct calendar date.
3. Prepend a new object to the `entries` array with:
   - `version`: Same as the top-level `version`
   - `date`: ISO date string `YYYY-MM-DD`
   - `sections`: Array of `{ title, type: 'feature'|'improvement'|'bugfix', items: [{ text, userImpact? }] }`
   - Mark `userImpact: true` on items that directly affect user workflow

Users see a red badge on the info icon (lower-left) until they view the changelog. User-impacting items are highlighted in the dialog. The badge only reappears when the version string changes, so always bump the version when deploying user-facing changes. Subscribed users (Profile → "What's New emails") also receive a consolidated 8 AM email digest the morning after a release.

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
6. When confirmed working, deploy to production via `git pull`

### Why This Matters
- Direct SCP to servers causes drift between repo and deployed code
- Production deploys via `git pull` - if repo is stale, wrong code gets deployed
- Keeps full history of changes for rollback if needed

## Deployment Environments

### Production (app.ectlogger.us)
- **Host**: `ectlogger@app.ectlogger.us`
- **Python**: 3.11.2
- **Path**: `~/ectlogger`
- **Frontend**: Static files in `frontend/dist/` served by **Caddy**
- **Backend**: uvicorn on port 8001 (no auto-reload)
- **Reverse Proxy**: Caddy handles HTTPS, routes `/api/*` and `/ws/*` to backend
- **Deploy from GitHub**:
  ```bash
  # Pull latest from GitHub (preferred method)
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && git pull origin main"
  
  # Build frontend (required after frontend changes)
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger/frontend && npm run build"
  
  # Restart backend (requires interactive sudo password)
  ssh ectlogger@app.ectlogger.us
  sudo systemctl restart ectlogger
  ```
- **Backend restarts**: When the backend needs to be restarted, run `ssh ectlogger@app.ectlogger.us` in an **interactive** terminal (not as a one-liner), then run `sudo systemctl restart ectlogger` and leave the terminal active so the user can type their sudo password.

### Beta (ectbeta.lynwood.us)
- **Host**: `bradb@10.6.26.3`
- **Python**: 3.13
- **Purpose**: Testing new features before production deployment
- **Note**: Deploy new/incomplete features to beta ONLY until tested and confirmed working
- **Path**: `/home/bradb/ectlogger`
- **Frontend**: Vite dev server on port 3000
- **Backend**: uvicorn on port 8000 (with auto-reload)
- **Deploy from GitHub** (preferred):
  ```bash
  # First commit and push locally, then pull on beta
  ssh bradb@10.6.26.3 "cd /home/bradb/ectlogger && git pull origin main"
  
  # Restart service (requires interactive sudo password)
  ssh bradb@10.6.26.3
  sudo systemctl restart ectlogger
  ```
- **Backend restarts**: Run `ssh bradb@10.6.26.3` in an **interactive** terminal, then run `sudo systemctl restart ectlogger` and leave the terminal active so the user can type their sudo password.
- **Database**: SQLite at `/home/bradb/ectlogger/backend/ectlogger.db`

### Alpha (10.6.26.6)
- **Host**: `bradb@10.6.26.6`
- **Python**: 3.13
- **Path**: `/home/bradb/ectlogger`
- **Purpose**: Feature testing before beta
- **Frontend**: Vite dev server on port 3000
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
