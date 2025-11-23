from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth
from app.database import get_db
from app.models import User, UserRole
from app.schemas import Token, UserResponse, MagicLinkRequest, MagicLinkVerify
from app.auth import create_access_token, create_magic_link_token, verify_magic_link_token
from app.email_service import EmailService
from app.config import settings
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["authentication"])

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
        return user
    
    # Check if user exists by email
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user:
        # Update OAuth info
        user.oauth_provider = provider
        user.oauth_id = provider_id
        await db.commit()
        await db.refresh(user)
        return user
    
    # Create new user
    user = User(
        email=email,
        name=name,
        oauth_provider=provider,
        oauth_id=provider_id,
        role=UserRole.USER
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/magic-link/request")
async def request_magic_link(
    request: MagicLinkRequest,
    db: AsyncSession = Depends(get_db)
):
    """Request a magic link to sign in via email"""
    print(f"\n[API] Magic link request received for {request.email}")
    
    try:
        token = create_magic_link_token(request.email)
        print(f"[API] Token generated successfully")
        
        await EmailService.send_magic_link(request.email, token, settings.magic_link_expire_days)
        
        print(f"[API] Magic link request completed successfully")
        return {
            "message": "Magic link sent to your email",
            "expires_in_days": settings.magic_link_expire_days
        }
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"\n{'='*60}")
        print(f"[ERROR] API ERROR: Failed to send magic link")
        print(f"{'='*60}")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print(f"\nFull traceback:")
        print(error_details)
        print(f"{'='*60}\n")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {str(e)}"
        )


@router.post("/magic-link/verify", response_model=Token)
async def verify_magic_link(
    request: MagicLinkVerify,
    db: AsyncSession = Depends(get_db)
):
    """Verify magic link token and sign in"""
    print(f"\n[API] Magic link verification request received")
    print(f"[API] Token: {request.token[:20]}...{request.token[-10:]} (truncated)")
    
    email = verify_magic_link_token(request.token)
    
    if not email:
        print(f"[ERROR] Invalid or expired token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired magic link"
        )
    
    print(f"[API] Token valid for email: {email}")
    
    # Get or create user
    user = await get_or_create_user(db, email, email, "email", email)
    print(f"[API] User retrieved/created: {user.email} (ID: {user.id})")
    
    # Create access token (sub must be string per JWT spec)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    
    print(f"[API] Access token created, verification complete")
    
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
    current_user: User = Depends(get_db)
):
    """Get current authenticated user information"""
    return UserResponse.from_orm(current_user)
