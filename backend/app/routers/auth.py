from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole
from app.schemas import Token, UserResponse, MagicLinkRequest, MagicLinkVerify
from app.auth import create_access_token, create_magic_link_token, verify_magic_link_token
from app.email_service import EmailService
from app.config import settings
from app.logger import logger
from app.security import get_client_ip
from datetime import timedelta
import secrets

router = APIRouter(prefix="/auth", tags=["authentication"])


def generate_unsubscribe_token() -> str:
    """Generate a secure random token for email unsubscribe links"""
    return secrets.token_hex(32)  # 64 character hex string


# OAuth Configuration
oauth = OAuth()

if settings.google_client_id:
    oauth.register(
        name='google',
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )

if settings.microsoft_client_id:
    oauth.register(
        name='microsoft',
        client_id=settings.microsoft_client_id,
        client_secret=settings.microsoft_client_secret,
        server_metadata_url='https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )

if settings.github_client_id:
    oauth.register(
        name='github',
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        authorize_url='https://github.com/login/oauth/authorize',
        authorize_params=None,
        access_token_url='https://github.com/login/oauth/access_token',
        access_token_params=None,
        client_kwargs={'scope': 'user:email'}
    )


async def get_or_create_user(db: AsyncSession, email: str, name: str, provider: str, provider_id: str) -> User:
    """Get existing user or create new one"""
    # Check if user exists by OAuth ID
    result = await db.execute(
        select(User).where(User.oauth_provider == provider, User.oauth_id == provider_id)
    )
    user = result.scalar_one_or_none()
    
    if user:
        # Ensure user has an unsubscribe token (for users created before this feature)
        if not user.unsubscribe_token:
            user.unsubscribe_token = generate_unsubscribe_token()
            await db.commit()
            await db.refresh(user)
        return user
    
    # Check if user exists by email
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user:
        # Update OAuth info
        user.oauth_provider = provider
        user.oauth_id = provider_id
        # Ensure user has an unsubscribe token
        if not user.unsubscribe_token:
            user.unsubscribe_token = generate_unsubscribe_token()
        await db.commit()
        await db.refresh(user)
        return user
    
    # Check if this is the first user - make them admin
    result = await db.execute(select(User))
    user_count = len(result.scalars().all())
    
    # Create new user with unsubscribe token
    user = User(
        email=email,
        name=name,
        oauth_provider=provider,
        oauth_id=provider_id,
        role=UserRole.ADMIN if user_count == 0 else UserRole.USER,
        unsubscribe_token=generate_unsubscribe_token()
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    if user.role == UserRole.ADMIN:
        logger.info("API", f"First user created as admin: {email}")
    
    return user


@router.post("/magic-link/request")
async def request_magic_link(
    request: MagicLinkRequest,
    req: Request,
    db: AsyncSession = Depends(get_db)
):
    """Request a magic link to sign in via email"""
    client_ip = get_client_ip(req)
    logger.info("API", f"Magic link request received for {request.email}", ip=client_ip)
    
    # Check if user exists and is banned
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()
    if existing_user and not existing_user.is_active:
        logger.banned_access(request.email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator."
        )
    
    try:
        token = create_magic_link_token(request.email)
        logger.debug("API", "Token generated successfully")
        
        await EmailService.send_magic_link(request.email, token, settings.magic_link_expire_days)
        
        logger.info("API", f"Magic link sent successfully to {request.email}")
        return {
            "message": "Magic link sent to your email",
            "expires_in_days": settings.magic_link_expire_days
        }
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error("API", f"Failed to send magic link: {type(e).__name__}: {str(e)}")
        logger.debug("API", f"Full traceback:\n{error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {str(e)}"
        )


@router.post("/magic-link/verify", response_model=Token)
async def verify_magic_link(
    request: MagicLinkVerify,
    req: Request,
    db: AsyncSession = Depends(get_db)
):
    """Verify magic link token and sign in"""
    client_ip = get_client_ip(req)
    logger.info("API", "Magic link verification request received", ip=client_ip)
    logger.debug("API", f"Token: {request.token[:20]}...{request.token[-10:]} (truncated)", ip=client_ip)
    
    email = verify_magic_link_token(request.token)
    
    if not email:
        logger.auth_failure("Invalid or expired magic link token", client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired magic link"
        )
    
    logger.debug("API", f"Token valid for email: {email}", ip=client_ip)
    
    # Get or create user
    user = await get_or_create_user(db, email, email, "email", email)
    
    # Check if user is banned (is_active = False)
    if not user.is_active:
        logger.banned_access(user.email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been locked. Please contact an administrator for assistance."
        )
    
    logger.auth_success(user.email, client_ip)
    
    # Create access token (sub must be string per JWT spec)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    
    logger.debug("API", "Access token created successfully", ip=client_ip)
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.get("/oauth/{provider}")
async def oauth_login(provider: str):
    """Redirect to OAuth provider"""
    if provider not in ['google', 'microsoft', 'github']:
        raise HTTPException(status_code=400, detail="Invalid OAuth provider")
    
    redirect_uri = f"{settings.frontend_url}/auth/callback/{provider}"
    
    # This would typically use the OAuth library to generate the auth URL
    # For simplicity, return the redirect URL structure
    return {
        "auth_url": f"/auth/oauth/{provider}/authorize",
        "redirect_uri": redirect_uri
    }


@router.get("/oauth/{provider}/callback", response_model=Token)
async def oauth_callback(
    provider: str,
    code: str,
    db: AsyncSession = Depends(get_db)
):
    """Handle OAuth callback and create/login user"""
    # Note: In a real implementation, you would:
    # 1. Exchange code for access token with the OAuth provider
    # 2. Fetch user info from the provider
    # 3. Create or update user in database
    
    # This is a simplified version
    # You'll need to implement the actual OAuth flow using authlib
    
    raise HTTPException(
        status_code=501,
        detail="OAuth callback implementation requires full OAuth flow setup"
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current authenticated user information"""
    return UserResponse.from_orm(current_user)


@router.get("/unsubscribe")
async def unsubscribe_from_emails(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    One-click email unsubscribe endpoint.
    Disables all email notifications for the user with the matching token.
    This endpoint does not require authentication for CAN-SPAM compliance.
    """
    if not token:
        raise HTTPException(status_code=400, detail="Unsubscribe token is required")
    
    # Find user by unsubscribe token
    result = await db.execute(
        select(User).where(User.unsubscribe_token == token)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or expired unsubscribe token")
    
    # Disable email notifications
    user.email_notifications = False
    await db.commit()
    
    logger.info("API", f"User {user.email} unsubscribed from emails via one-click link")
    
    return {
        "success": True,
        "message": "You have been unsubscribed from all email notifications.",
        "email": user.email
    }


@router.post("/resubscribe")
async def resubscribe_to_emails(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Re-enable email notifications for a user.
    Used from the unsubscribe landing page if user wants to undo.
    """
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")
    
    # Find user by unsubscribe token
    result = await db.execute(
        select(User).where(User.unsubscribe_token == token)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Invalid token")
    
    # Re-enable email notifications
    user.email_notifications = True
    await db.commit()
    
    logger.info("API", f"User {user.email} re-subscribed to emails")
    
    return {
        "success": True,
        "message": "Email notifications have been re-enabled.",
        "email": user.email
    }

