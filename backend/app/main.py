from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import init_db
from app.routers import auth, users, nets, check_ins, frequencies
from app.security import sanitize_html
from typing import Dict, List
import json

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"])

app = FastAPI(title=settings.app_name, version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "https://*.app.github.dev"  # Allow GitHub Codespaces
    ],
    allow_origin_regex=r"https://.*\.app\.github\.dev",  # Codespaces pattern
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


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, net_id: int):
        await websocket.accept()
        if net_id not in self.active_connections:
            self.active_connections[net_id] = []
        self.active_connections[net_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, net_id: int):
        if net_id in self.active_connections:
            self.active_connections[net_id].remove(websocket)
            if not self.active_connections[net_id]:
                del self.active_connections[net_id]
    
    async def broadcast(self, message: dict, net_id: int):
        if net_id in self.active_connections:
            for connection in self.active_connections[net_id]:
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
        user_email = payload.get("sub")
        
        # Verify user exists
        async for db in get_db():
            result = await db.execute(select(User).where(User.email == user_email))
            user = result.scalar_one_or_none()
            if not user or not user.is_active:
                await websocket.close(code=1008, reason="Invalid user")
                return
            break
    except Exception as e:
        await websocket.close(code=1008, reason="Authentication failed")
        return
    
    await manager.connect(websocket, net_id)
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
    """Initialize database on startup"""
    await init_db()


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
