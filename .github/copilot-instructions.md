# ECTLogger - AI Coding Agent Instructions

## Project Overview

ECTLogger is a real-time radio net logging application for Emergency Communications Teams (ECT) and SKYWARN spotter nets. Full-stack app: **Python 3.13+ FastAPI async backend** + **React TypeScript frontend**. Target deployment: Debian Trixie.

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

## Environment Setup

Copy `.env.example` to `backend/.env`:
- `SECRET_KEY` - JWT signing key (required)
- `SMTP_*` - Email config for magic links
- `DATABASE_URL` - defaults to `sqlite:///./ectlogger.db`

## Deployment Environments

### Production (app.ectlogger.us)
- **Host**: `ectlogger@app.ectlogger.us`
- **Python**: 3.11.2
- **Path**: `~/ectlogger`
- **Deploy from GitHub**:
  ```bash
  # Pull latest from GitHub (preferred method)
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger && git pull origin main"
  
  # Build frontend
  ssh ectlogger@app.ectlogger.us "cd ~/ectlogger/frontend && npm run build"
  
  # Restart backend (requires interactive sudo)
  ssh ectlogger@app.ectlogger.us
  sudo systemctl restart ectlogger
  ```

### Beta (ectbeta.lynwood.us)
- **Host**: `bradb@10.6.26.3`
- **Python**: 3.13
- **Purpose**: Testing new features before production deployment
- **Note**: Deploy new/incomplete features to beta ONLY until tested and confirmed working
- **Path**: `/home/bradb/ectlogger`
- **Deploy manually** (for rapid iteration without committing):
  ```bash
  # Copy backend files
  scp backend/app/routers/*.py bradb@10.6.26.3:/home/bradb/ectlogger/backend/app/routers/
  
  # Copy frontend files
  scp frontend/src/pages/*.tsx bradb@10.6.26.3:/home/bradb/ectlogger/frontend/src/pages/
  
  # Build frontend
  ssh bradb@10.6.26.3 "cd /home/bradb/ectlogger/frontend && npm run build"
  
  # Restart backend (requires sudo)
  sudo systemctl restart ectlogger
  ```
- **Database**: SQLite at `/home/bradb/ectlogger/backend/ectlogger.db`

### Alpha (10.6.26.6)
- **Host**: `bradb@10.6.26.6`
- **Python**: 3.13
- **Path**: `/home/bradb/ectlogger`
- **Purpose**: Feature testing before beta

### Local Development
- **Frontend**: `http://localhost:3000` (Vite dev server)
- **Backend**: `http://localhost:8000` (uvicorn)
- **API Docs**: `http://localhost:8000/docs`

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
