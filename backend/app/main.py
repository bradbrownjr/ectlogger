from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import init_db
from app.routers import auth, users, nets, check_ins, frequencies, templates, chat, ncs_rotation
from app.routers import settings as app_settings_router
from app.security import sanitize_html
from app.ncs_reminder_service import ncs_reminder_service
from typing import Dict, List
import json

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"])

app = FastAPI(title=settings.app_name, version="1.0.0")
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
print(f"ECTLogger Backend Starting")
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

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(nets.router)
app.include_router(check_ins.router)
app.include_router(frequencies.router)
app.include_router(templates.router)
app.include_router(chat.router)
app.include_router(app_settings_router.router)
app.include_router(ncs_rotation.router)


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
        """Get set of user IDs currently connected to this net"""
        if net_id not in self.active_connections:
            return set()
        return set(user_id for _, user_id in self.active_connections[net_id])
    
    async def broadcast(self, message: dict, net_id: int):
        if net_id in self.active_connections:
            for connection, _ in self.active_connections[net_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass


manager = ConnectionManager()


@app.websocket("/ws/nets/{net_id}")
async def websocket_endpoint(websocket: WebSocket, net_id: int, token: str = None):
    """WebSocket endpoint for real-time net updates - requires authentication"""
    from app.auth import verify_token
    from app.database import get_db
    from sqlalchemy import select
    from app.models import User
    
    # Verify JWT token
    if not token:
        await websocket.close(code=1008, reason="Authentication required")
        return
    
    try:
        payload = verify_token(token)
        user_id_str = payload.get("sub")
        
        if not user_id_str:
            await websocket.close(code=1008, reason="Invalid token")
            return
            
        user_id = int(user_id_str)
        
        # Verify user exists
        async for db in get_db():
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user or not user.is_active:
                await websocket.close(code=1008, reason="Invalid user")
                return
            break
    except Exception as e:
        await websocket.close(code=1008, reason="Authentication failed")
        return
    
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
                "user_id": user.id
            }, net_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, net_id)
    except Exception as e:
        manager.disconnect(websocket, net_id)


@app.on_event("startup")
async def startup_event():
    """Initialize database and background services on startup"""
    await init_db()
    # Start NCS reminder service
    await ncs_reminder_service.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup background services on shutdown"""
    await ncs_reminder_service.stop()


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.app_name} API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
