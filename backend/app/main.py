from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.routers import auth, users, nets, check_ins, frequencies, templates, chat, ncs_rotation, security, statistics, geocode, contacts, feedback, can_hear, traffic
from app.routers import settings as app_settings_router
from app.security import sanitize_html
from app.ncs_reminder_service import ncs_reminder_service
from app.whats_new_service import whats_new_service
from app.traffic_reminder_service import traffic_reminder_service
from app.traffic.definitions import upsert_form_definitions
from typing import Dict, List, Optional
import asyncio
import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _is_primary_process() -> bool:
    """Return True only for the primary (public-facing) uvicorn process.

    We run two processes: port 8001 (public, via Caddy) and port 9999
    (localhost, internal).  Background services — email digests, NCS
    reminders — must only run from one of them or every timed job fires
    twice and every user gets duplicate emails.  We designate port 8001 as
    the primary; if we can't detect the port we default to True (safe: runs
    services rather than silently skipping them).
    """
    try:
        idx = sys.argv.index('--port')
        return sys.argv[idx + 1] != '9999'
    except (ValueError, IndexError):
        return True

async def _load_gravatar_setting(db):
    """Read app_settings.gravatar_enabled into the in-process cache at boot.

    Tolerates a database that predates migration 058 -- an instance that hasn't
    run it yet simply keeps the enabled default rather than failing to start.
    """
    from sqlalchemy import select as _select
    from app.models import AppSettings as _AppSettings
    from app.utils import set_gravatar_enabled as _set

    try:
        row = (await db.execute(_select(_AppSettings).limit(1))).scalar_one_or_none()
        if row is not None and row.gravatar_enabled is not None:
            _set(row.gravatar_enabled)
    except Exception as exc:  # pragma: no cover - startup resilience
        print(f"Could not load gravatar_enabled setting, defaulting to enabled: {exc}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup and shutdown lifecycle for the FastAPI application."""
    await init_db()
    async with AsyncSessionLocal() as db:
        await upsert_form_definitions(db)
        # Prime the Gravatar master switch. get_avatar_url() runs inside a
        # synchronous serializer with no DB session, so it reads an in-process
        # cache; this loads it once at boot and routers/settings.py refreshes
        # it whenever an admin saves.
        await _load_gravatar_setting(db)
    asyncio.create_task(_ws_heartbeat_loop())
    if _is_primary_process():
        # Only the primary process (port 8001) runs background services to
        # prevent duplicate emails from the secondary localhost process.
        await ncs_reminder_service.start()
        await whats_new_service.start()
        await traffic_reminder_service.start()
    else:
        print("Secondary process (port 9999): background services skipped.")
    yield
    await ncs_reminder_service.stop()
    await whats_new_service.stop()
    await traffic_reminder_service.stop()


# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"])

# Disable redirect_slashes to prevent 307 redirects that break HTTPS behind reverse proxy
app = FastAPI(title=settings.app_name, version="1.0.0", redirect_slashes=False, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration - Allow frontend URL from config
# This supports LAN IPs, localhost, and production domains
# Also allow requests from any origin on the same host (for LAN deployments)
allowed_origins = [
    settings.frontend_url,
    "http://localhost:3000",  # Fallback for local development
    "http://127.0.0.1:3000",  # Explicit localhost
]

# If frontend_url has an IP address, also allow that IP for backend (port 8000)
import re
if match := re.match(r'http://([0-9.]+):3000', settings.frontend_url):
    allowed_origins.append(f"http://{match.group(1)}:8000")

print(f"\n{'='*60}")
print("ECTLogger Backend Starting")
print(f"{'='*60}")
print(f"Log Level: {settings.log_level.upper()}")
print(f"CORS Origins: {', '.join(allowed_origins)}")
print(f"{'='*60}\n")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-New-Token"],
)

# Security middleware for request sanitization
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Add security headers and validate requests"""
    # Add security headers to response
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    return response

# Include routers with /api prefix for reverse proxy compatibility
# Caddy forwards /api/* to the backend, so all routes need this prefix
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(nets.router, prefix="/api")
app.include_router(check_ins.router, prefix="/api")
app.include_router(frequencies.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(app_settings_router.router, prefix="/api")
app.include_router(ncs_rotation.router, prefix="/api")
app.include_router(security.router, prefix="/api")
app.include_router(statistics.router, prefix="/api")
app.include_router(geocode.router, prefix="/api")
app.include_router(contacts.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")
app.include_router(can_hear.router, prefix="/api")
app.include_router(traffic.router, prefix="/api")

# Serve uploaded chat images from backend/data/chat_images
chat_images_dir = Path(__file__).resolve().parents[1] / "data" / "chat_images"
chat_images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/chat-images", StaticFiles(directory=str(chat_images_dir)), name="chat-images")

# Serve uploaded user avatars from backend/data/avatars
avatars_dir = Path(__file__).resolve().parents[1] / "data" / "avatars"
avatars_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/avatars", StaticFiles(directory=str(avatars_dir)), name="avatars")

# Serve the uploaded instance logo from backend/data/logo (Admin -> Branding)
logo_dir = Path(__file__).resolve().parents[1] / "data" / "logo"
logo_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/logo", StaticFiles(directory=str(logo_dir)), name="logo")


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[tuple[WebSocket, int]]] = {}  # (websocket, user_id)
    
    async def connect(self, websocket: WebSocket, net_id: int, user_id: int):
        await websocket.accept()
        if net_id not in self.active_connections:
            self.active_connections[net_id] = []
        self.active_connections[net_id].append((websocket, user_id))
    
    def disconnect(self, websocket: WebSocket, net_id: int):
        if net_id in self.active_connections:
            self.active_connections[net_id] = [
                (ws, uid) for ws, uid in self.active_connections[net_id] if ws != websocket
            ]
            if not self.active_connections[net_id]:
                del self.active_connections[net_id]
    
    def get_online_users(self, net_id: int) -> set[int]:
        """Get set of authenticated user IDs currently connected to this net (excludes guests)"""
        if net_id not in self.active_connections:
            return set()
        return set(user_id for _, user_id in self.active_connections[net_id] if user_id != 0)
    
    def get_guest_count(self, net_id: int) -> int:
        """Get count of unauthenticated (guest) WebSocket connections for a net"""
        if net_id not in self.active_connections:
            return 0
        return sum(1 for _, user_id in self.active_connections[net_id] if user_id == 0)
    
    async def broadcast(self, message: dict, net_id: int, guest_message: Optional[dict] = None):
        """Broadcast message to all connections for a net, cleaning up dead connections.

        If guest_message is given, unauthenticated connections (user_id == 0,
        the guest-viewer sentinel) receive it instead of message -- used to
        send a PII-redacted copy of a chat message to anonymous viewers."""
        if net_id not in self.active_connections:
            return

        dead_connections = []
        for connection, user_id in self.active_connections[net_id]:
            payload = guest_message if (guest_message is not None and user_id == 0) else message
            try:
                await connection.send_json(payload)
            except Exception as e:
                logger.warning("WebSocket send failed for user %s on net %s: %s", user_id, net_id, e)
                dead_connections.append(connection)
        
        # Clean up dead connections after iteration completes
        if dead_connections:
            self.active_connections[net_id] = [
                (ws, uid) for ws, uid in self.active_connections[net_id]
                if ws not in dead_connections
            ]
            if not self.active_connections[net_id]:
                del self.active_connections[net_id]


manager = ConnectionManager()


async def _ws_heartbeat_loop():
    """Ping all active WebSocket connections every 30 s.

    Serves two purposes: keeps the TCP session alive through proxies/firewalls
    that drop idle connections, and triggers cleanup of dead sockets via the
    existing error-handling path in ConnectionManager.broadcast().
    """
    while True:
        await asyncio.sleep(30)
        for net_id in list(manager.active_connections.keys()):
            await manager.broadcast({"type": "ping"}, net_id)


async def post_system_message(net_id: int, message: str, db_session=None):
    """Post a system message to chat and broadcast via WebSocket"""
    from app.database import AsyncSessionLocal
    from app.models import ChatMessage
    import datetime
    
    should_close = False
    if db_session is None:
        db_session = AsyncSessionLocal()
        should_close = True
    
    try:
        # Create system message
        chat_message = ChatMessage(
            net_id=net_id,
            user_id=None,  # System messages have no user
            message=message,
            is_system=True
        )
        db_session.add(chat_message)
        await db_session.commit()
        await db_session.refresh(chat_message)
        
        # Broadcast via WebSocket
        await manager.broadcast({
            "type": "chat_message",
            "data": {
                "id": chat_message.id,
                "net_id": chat_message.net_id,
                "user_id": None,
                "callsign": None,
                "message": chat_message.message,
                "is_system": True,
                "created_at": chat_message.created_at.isoformat() if hasattr(chat_message.created_at, 'isoformat') else str(chat_message.created_at)
            },
            "timestamp": datetime.datetime.utcnow().isoformat()
        }, net_id)
        
        return chat_message
    finally:
        if should_close:
            await db_session.close()


@app.websocket("/api/ws/nets/{net_id}")
async def websocket_endpoint(websocket: WebSocket, net_id: int, token: str = None):
    """WebSocket endpoint for real-time net updates - allows guests for viewing"""
    from app.auth import verify_token
    from app.database import get_db
    from sqlalchemy import select
    from app.models import User
    
    user_id = 0  # Default for guests
    
    # Verify JWT token if provided
    if token:
        try:
            payload = verify_token(token)
            user_id_str = payload.get("sub")
            
            if user_id_str:
                user_id = int(user_id_str)
                
                # Verify user exists
                async for db in get_db():
                    result = await db.execute(select(User).where(User.id == user_id))
                    user = result.scalar_one_or_none()
                    if not user or not user.is_active:
                        user_id = 0  # Fall back to guest
                    break
        except Exception:
            user_id = 0  # Fall back to guest on auth errors
    
    await manager.connect(websocket, net_id, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Sanitize message content
            if "data" in message and isinstance(message["data"], dict):
                for key in message["data"]:
                    if isinstance(message["data"][key], str):
                        message["data"][key] = sanitize_html(message["data"][key])
            
            # Broadcast message to all connected clients for this net
            await manager.broadcast({
                "type": message.get("type", "message"),
                "data": message.get("data"),
                "timestamp": message.get("timestamp"),
                "user_id": user_id
            }, net_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, net_id)
    except Exception:
        manager.disconnect(websocket, net_id)



@app.get("/api")
async def root():
    return {
        "message": f"Welcome to {settings.app_name} API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.backend_port, reload=True)
