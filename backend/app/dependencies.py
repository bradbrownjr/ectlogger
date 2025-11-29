from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from app.database import get_db
from app.models import User, UserRole
from app.auth import verify_token
from app.logger import logger
from app.security import get_client_ip

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    token = credentials.credentials
    client_ip = get_client_ip(request)
    logger.debug("AUTH", "Authenticating user from token")
    logger.debug("AUTH", f"Token: {token[:20]}...{token[-10:]}")
    
    payload = verify_token(token, client_ip)
    
    if payload is None:
        logger.auth_failure(f"Token verification failed", client_ip)
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
