from fastapi import Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app.models import User, UserRole
from app.auth import verify_token, create_access_token
from app.logger import logger
from app.security import get_client_ip
from app.session_config import get_session_config

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

# ========== BACKGROUND REQUEST MARKER ==========
# Header the frontend sets on requests it makes on a timer rather than because
# the operator did something (see frontend/src/services/api.ts's
# BACKGROUND_REQUEST_CONFIG).
#
# Why: `last_active` is meant to answer "is this person using ECTLogger right
# now" -- it orders the admin user list, and it gates whether production is
# safe to restart. But the navbar's traffic-inbox badge polls every 60s from
# every page, so any logged-in browser tab kept open kept stamping
# `last_active` forever. One user had shown as "active a minute ago",
# continuously, since the day they registered: a tab left open, not a person
# at the keyboard. Requests that arrive on a timer therefore no longer count
# as activity.
#
# Someone quietly watching a live net is still genuinely present even though
# they may click nothing for an hour -- that case is covered by checking for
# nets in active/lobby status, not by this timestamp.
BACKGROUND_REQUEST_HEADER = "X-Background-Request"


def is_background_request(request: Request) -> bool:
    """True when this request was made by a client-side timer, not by the
    operator doing something. Trusted only for activity bookkeeping -- it must
    never be allowed to influence authorization."""
    return request.headers.get(BACKGROUND_REQUEST_HEADER) == "1"


async def get_current_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    token = credentials.credentials
    client_ip = get_client_ip(request)
    logger.debug("AUTH", "Authenticating user from token")
    logger.debug("AUTH", f"Token: {token[:20]}...{token[-10:]}")
    
    payload = verify_token(token, client_ip)
    
    if payload is None:
        logger.auth_failure("Token verification failed", client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    logger.debug("AUTH", f"Token verified, payload: {payload}")
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        logger.auth_failure("No 'sub' claim in token payload", client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    # Convert subject from string to int
    try:
        user_id = int(user_id_str)
        logger.debug("AUTH", f"User ID from token: {user_id}")
    except (ValueError, TypeError):
        logger.auth_failure(f"Invalid user ID format: {user_id_str}", client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    # Update last_active timestamp for online tracking. Automatic polls are
    # excluded so an idle open tab doesn't read as someone using the app --
    # see BACKGROUND_REQUEST_HEADER above.
    if not is_background_request(request):
        user.last_active = datetime.now(timezone.utc)
        await db.commit()

    # Rolling refresh: if enabled and fewer than 7 days remain, issue a new
    # token so active users never have to re-authenticate.
    lifetime_days, rolling_renewal = await get_session_config(db)
    exp = payload.get("exp")
    if rolling_renewal and exp and (exp - datetime.now(timezone.utc).timestamp()) < 7 * 24 * 60 * 60:
        new_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(days=lifetime_days),
        )
        response.headers["X-New-Token"] = new_token

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Get current user if authenticated, otherwise return None (for guest access)"""
    if credentials is None:
        return None
    
    try:
        token = credentials.credentials
        payload = verify_token(token)
        
        if payload is None:
            return None
        
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError):
            return None
        
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if user is None or not user.is_active:
            return None
        
        return user
    except Exception:
        return None


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_role(required_role: UserRole):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != required_role and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. {required_role.value} role required."
            )
        return current_user
    return role_checker


async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
