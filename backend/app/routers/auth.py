import base64
import io
import json

import qrcode
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.session_config import get_session_config
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole, Contact
from app.schemas import (
    Token, UserResponse, MagicLinkRequest, MagicLinkVerify,
    PasswordLoginRequest, LoginResult, PasswordSetRequest,
    MfaSetupStartResult, MfaSetupConfirmRequest, MfaSetupConfirmResult,
    MfaReplaceStartRequest, MfaDisableRequest,
)
from app.auth import (
    create_access_token, create_magic_link_token, verify_magic_link_token,
    hash_password, verify_password, encrypt_mfa_secret, decrypt_mfa_secret,
    generate_totp_secret, totp_provisioning_uri, verify_totp_code,
    generate_backup_codes, hash_backup_code,
    MAX_FAILED_PASSWORD_ATTEMPTS, PASSWORD_LOCKOUT_MINUTES,
)
from app.email_service import EmailService
from app.config import settings
from app.logger import logger
from app.security import get_client_ip
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets

router = APIRouter(prefix="/auth", tags=["authentication"])
_limiter = Limiter(key_func=get_remote_address)

GENERIC_LOGIN_ERROR = "Incorrect callsign/email or password"


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
    
    # Check if a contact with this email exists — auto-populate name, callsign, location
    contact_result = await db.execute(
        select(Contact).where(Contact.email == email)
    )
    contact = contact_result.scalar_one_or_none()
    
    # Create new user with unsubscribe token
    user = User(
        email=email,
        name=contact.name if contact and contact.name else name,
        callsign=contact.callsign if contact else None,
        location=contact.location if contact else None,
        skywarn_number=contact.skywarn_number if contact else None,
        oauth_provider=provider,
        oauth_id=provider_id,
        role=UserRole.ADMIN if user_count == 0 else UserRole.USER,
        unsubscribe_token=generate_unsubscribe_token()
    )
    db.add(user)
    await db.flush()
    
    # Link the contact to the new user
    if contact and not contact.user_id:
        contact.user_id = user.id
    
    await db.commit()
    await db.refresh(user)
    
    if contact:
        logger.info("API", f"New user auto-populated from contact: {email} (callsign={contact.callsign})")
    if user.role == UserRole.ADMIN:
        logger.info("API", f"First user created as admin: {email}")
    
    return user


async def _find_by_identifier(db: AsyncSession, identifier: str) -> Optional[User]:
    """Login identifier can be either a callsign or an email, disambiguated
    by the presence of "@" -- shared by password login."""
    identifier = identifier.strip()
    if "@" in identifier:
        result = await db.execute(select(User).where(User.email == identifier.lower()))
    else:
        result = await db.execute(select(User).where(User.callsign == identifier.upper()))
    return result.scalar_one_or_none()


async def _consume_backup_code(db: AsyncSession, user: User, code: str) -> bool:
    """Single-use: removes the matching hash from mfa_backup_codes and
    commits. Returns False (no side effect) if the code doesn't match."""
    if not user.mfa_backup_codes:
        return False
    code_hash = hash_backup_code(code)
    codes = json.loads(user.mfa_backup_codes)
    if code_hash not in codes:
        return False
    codes.remove(code_hash)
    user.mfa_backup_codes = json.dumps(codes)
    await db.commit()
    return True


async def _resolve_mfa(db: AsyncSession, user: User, totp_code: Optional[str]) -> str:
    """Shared by password login and magic-link verify, since MFA has to be
    checked no matter which first factor was used.

    Returns "ok" / "mfa_required" / "mfa_setup_required". MFA is mandatory
    for admins (an unenrolled admin gets mfa_setup_required, never "ok").
    For everyone else it's opt-in, but once a user has enrolled it, it IS
    enforced at login -- an "optional" second factor a user turned on but
    that's silently skipped would be worse than not offering it.
    """
    if user.role == UserRole.ADMIN and not user.mfa_enabled:
        return "mfa_setup_required"
    if not user.mfa_enabled:
        return "ok"

    secret = decrypt_mfa_secret(user.mfa_secret_encrypted) if user.mfa_secret_encrypted else None
    if not secret:
        # secret_key was rotated, or the row is corrupt. For an admin this
        # must still block access (force re-enrollment); for a non-admin
        # there's nothing left to verify against, so don't lock them out of
        # their own account over an operational key rotation.
        return "mfa_setup_required" if user.role == UserRole.ADMIN else "ok"

    if totp_code and (verify_totp_code(secret, totp_code) or await _consume_backup_code(db, user, totp_code)):
        return "ok"
    return "mfa_required"


def _require_non_admin_mfa_self_service(user: User):
    """Admins can't disable or replace their own MFA -- that would defeat
    "MFA mandatory for admins" trivially. Recovery is another admin using
    the admin reset endpoint, or scripts/reset_admin_mfa.py as a last
    resort if no other admin exists."""
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin MFA can't be self-managed this way. Ask another admin to reset it, "
                   "or use the server-side recovery script if none is available."
        )


def _mfa_qr_data_uri(otpauth_url: str) -> str:
    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@router.post("/magic-link/request")
@_limiter.limit("5/hour")
async def request_magic_link(
    request: Request,
    payload: MagicLinkRequest,
    db: AsyncSession = Depends(get_db)
):
    """Request a magic link to sign in via email"""
    client_ip = get_client_ip(request)
    logger.info("API", f"Magic link request received for {payload.email}", ip=client_ip)

    # Check if user exists and is banned
    result = await db.execute(select(User).where(User.email == payload.email))
    existing_user = result.scalar_one_or_none()
    if existing_user and not existing_user.is_active:
        logger.banned_access(payload.email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator."
        )

    try:
        token = create_magic_link_token(payload.email)
        logger.debug("API", "Token generated successfully")

        await EmailService.send_magic_link(payload.email, token, settings.magic_link_expire_days)

        logger.info("API", f"Magic link sent successfully to {payload.email}")
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


@router.post("/magic-link/verify", response_model=LoginResult)
@_limiter.limit("20/minute")
async def verify_magic_link(
    request: Request,
    payload: MagicLinkVerify,
    db: AsyncSession = Depends(get_db)
):
    """Verify magic link token and sign in. If the account is an admin
    without MFA satisfied yet, the single-use token is deliberately NOT
    consumed here -- resubmit the same token with totp_code filled in."""
    client_ip = get_client_ip(request)
    logger.info("API", "Magic link verification request received", ip=client_ip)
    logger.debug("API", f"Token: {payload.token[:20]}...{payload.token[-10:]} (truncated)", ip=client_ip)

    email = verify_magic_link_token(payload.token)

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

    mfa_status = await _resolve_mfa(db, user, payload.totp_code)
    if mfa_status == "mfa_required":
        logger.auth_failure("Magic link valid, MFA code required", client_ip, email=user.email)
        return LoginResult(login_status="mfa_required")

    logger.auth_success(user.email, client_ip)

    # Create access token using admin-configured lifetime
    lifetime_days, _ = await get_session_config(db)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(days=lifetime_days)
    )

    logger.debug("API", "Access token created successfully", ip=client_ip)

    return LoginResult(
        login_status=mfa_status,  # "ok" or "mfa_setup_required"
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.post("/login", response_model=LoginResult)
@_limiter.limit("10/minute")
async def password_login(
    request: Request,
    payload: PasswordLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Password fallback for when magic-link email can't be delivered or
    retrieved. Accepts a callsign or email as the identifier. Errors are
    deliberately generic (no distinction between "no such account", "no
    password set", and "wrong password") to avoid account enumeration."""
    client_ip = get_client_ip(request)
    user = await _find_by_identifier(db, payload.identifier)

    if user and not user.is_active:
        logger.banned_access(user.email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator."
        )

    # SQLite drops tzinfo on round-trip even for a DateTime(timezone=True)
    # column, so a value read back is naive and needs it reattached before
    # comparing against an aware "now" (same pattern as net_pause.py and
    # traffic_reminder_service.py).
    locked_until = user.password_locked_until if user else None
    if locked_until and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until and locked_until > datetime.now(timezone.utc):
        logger.auth_failure("Password login blocked (account locked)", client_ip, email=user.email)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again in a few minutes."
        )

    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        if user:
            user.failed_password_attempts = (user.failed_password_attempts or 0) + 1
            if user.failed_password_attempts >= MAX_FAILED_PASSWORD_ATTEMPTS:
                user.password_locked_until = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_LOCKOUT_MINUTES)
            await db.commit()
        logger.auth_failure("Invalid password login", client_ip, email=payload.identifier)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    user.failed_password_attempts = 0
    user.password_locked_until = None
    await db.commit()

    mfa_status = await _resolve_mfa(db, user, payload.totp_code)
    if mfa_status == "mfa_required":
        logger.auth_failure("Password valid, MFA code required", client_ip, email=user.email)
        return LoginResult(login_status="mfa_required")

    logger.auth_success(user.email, client_ip)
    lifetime_days, _ = await get_session_config(db)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(days=lifetime_days)
    )
    return LoginResult(
        login_status=mfa_status,  # "ok" or "mfa_setup_required"
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.post("/password/set")
async def set_password(
    payload: PasswordSetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Self-service set/change password. current_password is required only
    when the account already has one set."""
    if current_user.password_hash:
        if not payload.current_password or not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.failed_password_attempts = 0
    current_user.password_locked_until = None
    await db.commit()

    if current_user.email:
        await EmailService.send_password_changed(current_user.email)

    return {"success": True, "message": "Password updated."}


@router.post("/mfa/setup/start", response_model=MfaSetupStartResult)
async def mfa_setup_start(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mints a new secret and persists it immediately (not yet enabled), so
    the flow survives a page refresh mid-enrollment. Call setup/confirm with
    a real code from the authenticator app to activate it."""
    if current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is already enabled. Use the replace flow to change authenticator.")

    secret = generate_totp_secret()
    current_user.mfa_secret_encrypted = encrypt_mfa_secret(secret)
    await db.commit()

    otpauth_url = totp_provisioning_uri(secret, current_user.callsign or current_user.email)
    return MfaSetupStartResult(secret=secret, otpauth_url=otpauth_url, qr_code_data_uri=_mfa_qr_data_uri(otpauth_url))


@router.post("/mfa/setup/confirm", response_model=MfaSetupConfirmResult)
async def mfa_setup_confirm(
    payload: MfaSetupConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is already enabled.")
    if not current_user.mfa_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start MFA setup first.")

    secret = decrypt_mfa_secret(current_user.mfa_secret_encrypted)
    if not secret or not verify_totp_code(secret, payload.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect verification code.")

    codes = generate_backup_codes()
    current_user.mfa_backup_codes = json.dumps([hash_backup_code(c) for c in codes])
    current_user.mfa_enabled = True
    await db.commit()

    return MfaSetupConfirmResult(backup_codes=codes)


@router.post("/mfa/replace/start", response_model=MfaSetupStartResult)
async def mfa_replace_start(
    payload: MfaReplaceStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Replace a lost authenticator, proven by account password rather than
    a TOTP code from the (lost) old device. Staged in mfa_pending_secret_encrypted
    until confirmed, so an abandoned attempt never strands a working secret."""
    _require_non_admin_mfa_self_service(current_user)
    if not current_user.password_hash or not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    secret = generate_totp_secret()
    current_user.mfa_pending_secret_encrypted = encrypt_mfa_secret(secret)
    await db.commit()

    otpauth_url = totp_provisioning_uri(secret, current_user.callsign or current_user.email)
    return MfaSetupStartResult(secret=secret, otpauth_url=otpauth_url, qr_code_data_uri=_mfa_qr_data_uri(otpauth_url))


@router.post("/mfa/replace/confirm", response_model=MfaSetupConfirmResult)
async def mfa_replace_confirm(
    payload: MfaSetupConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    _require_non_admin_mfa_self_service(current_user)
    if not current_user.mfa_pending_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start the replacement flow first.")

    secret = decrypt_mfa_secret(current_user.mfa_pending_secret_encrypted)
    if not secret or not verify_totp_code(secret, payload.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect verification code.")

    codes = generate_backup_codes()
    current_user.mfa_secret_encrypted = current_user.mfa_pending_secret_encrypted
    current_user.mfa_pending_secret_encrypted = None
    current_user.mfa_backup_codes = json.dumps([hash_backup_code(c) for c in codes])
    current_user.mfa_enabled = True
    await db.commit()

    return MfaSetupConfirmResult(backup_codes=codes)


@router.post("/mfa/disable")
async def mfa_disable(
    payload: MfaDisableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    _require_non_admin_mfa_self_service(current_user)
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled.")
    if not current_user.password_hash or not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    current_user.mfa_enabled = False
    current_user.mfa_secret_encrypted = None
    current_user.mfa_backup_codes = None
    current_user.mfa_pending_secret_encrypted = None
    await db.commit()

    return {"success": True, "message": "Two-factor authentication disabled."}


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
    list: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    One-click email unsubscribe endpoint.

    By default disables ALL email notifications for the user with the matching token
    (CAN-SPAM compliant master unsubscribe).

    Pass ``?list=<name>`` to opt out of a specific email category instead of the
    master switch. Supported per-list values:
      - ``whats_new`` -> clears notify_whats_new only

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

    # Per-list opt-out: only clear the named preference, leave master + others alone
    if list == "whats_new":
        user.notify_whats_new = False
        await db.commit()
        logger.info("API", f"User {user.email} unsubscribed from What's New emails via one-click link")
        return {
            "success": True,
            "list": "whats_new",
            "message": "You have been unsubscribed from What's New in ECTLogger emails.",
            "email": user.email,
        }

    # Default: master unsubscribe from all email notifications
    user.email_notifications = False
    await db.commit()

    logger.info("API", f"User {user.email} unsubscribed from emails via one-click link")

    return {
        "success": True,
        "list": None,
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

