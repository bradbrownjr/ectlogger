from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, nullslast
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageOps
from app.database import get_db
from app.models import User, UserRole, Contact
from app.schemas import UserResponse, UserUpdate, AdminUserCreate, CallsignLookupResponse, UserDirectoryEntry, UserPopupResponse
from app.dependencies import get_current_user, get_current_user_optional, get_admin_user

AVATAR_DIR = Path(__file__).resolve().parents[2] / "data" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_MAX_DIM = 256
AVATAR_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile"""
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_my_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's profile"""
    import json
    
    for field, value in user_update.dict(exclude_unset=True).items():
        # Handle callsigns JSON field
        if field == 'callsigns' and value is not None:
            setattr(current_user, field, json.dumps(value))
        else:
            setattr(current_user, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That callsign is already in use by another account."
        )
    await db.refresh(current_user)
    return UserResponse.from_orm(current_user)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a profile avatar image. Replaces any existing upload.
    Accepted: PNG, JPEG, WebP. Max 2 MB. Resized to 256×256 max."""
    if file.content_type not in AVATAR_ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPEG, or WebP.")

    file_bytes = await file.read()
    if len(file_bytes) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 2 MB).")

    try:
        pil_image = Image.open(BytesIO(file_bytes))
        pil_image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image.") from exc

    # Physically rotate pixels to match EXIF orientation so portrait/landscape
    # mobile photos are stored upright rather than sideways.
    pil_image = ImageOps.exif_transpose(pil_image)

    # Convert palette/transparent modes before JPEG save
    if pil_image.mode in {"RGBA", "LA", "P"}:
        pil_image = pil_image.convert("RGB")

    pil_image.thumbnail((AVATAR_MAX_DIM, AVATAR_MAX_DIM), Image.Resampling.LANCZOS)

    dest = AVATAR_DIR / f"{current_user.id}.jpg"
    pil_image.save(str(dest), format="JPEG", quality=90)

    current_user.avatar_url = f"/api/avatars/{current_user.id}.jpg"
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.from_orm(current_user)


@router.delete("/me/avatar", response_model=UserResponse)
async def delete_my_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove custom profile avatar, reverting to Gravatar."""
    dest = AVATAR_DIR / f"{current_user.id}.jpg"
    if dest.exists():
        dest.unlink()
    current_user.avatar_url = None
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.from_orm(current_user)


@router.put("/me/location")
async def update_my_location(
    location_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's live location (grid square).
    
    Called automatically when location_awareness is enabled and GPS position updates.
    This allows NCS to see the user's current location when checking them in.
    Stored separately from the user's default location so GPS doesn't overwrite manual entry.
    """
    from datetime import datetime, UTC
    location = location_data.get('location', '')
    if location:
        current_user.live_location = location.upper()
        current_user.live_location_updated = datetime.now(UTC)
    else:
        # Empty string clears the GPS-derived location so the static profile
        # default takes over in callsign lookups.
        current_user.live_location = None
        current_user.live_location_updated = None
    await db.commit()
    return {"status": "ok", "live_location": current_user.live_location}


@router.get("", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only)"""
    result = await db.execute(
        select(User).order_by(nullslast(User.last_active.desc())).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return [UserResponse.from_orm(user) for user in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Create/invite a new user (admin only)"""
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Create the user - they can log in via magic link
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        callsign=user_data.callsign,
        role=user_data.role,
        is_active=True,
        oauth_provider="magic_link",  # Will use magic link auth
        oauth_id=user_data.email,  # Use email as oauth_id for magic link users
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return UserResponse.from_orm(new_user)


@router.get("/directory", response_model=List[UserDirectoryEntry])
async def list_user_directory(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Minimal user directory for staff/rotation pickers.

    Returns only id, callsign, and name for active users. Available to any
    authenticated user so non-admin schedule managers can add staff or NCS
    rotation members. Excludes email, role, notification preferences, and
    activity timestamps to avoid leaking PII through the picker UI.
    """
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.callsign)
    )
    users = result.scalars().all()
    return [
        UserDirectoryEntry(id=u.id, callsign=u.callsign, name=u.name)
        for u in users
    ]


@router.get("/{user_id}/popup", response_model=UserPopupResponse)
async def get_user_popup(
    user_id: int,
    net_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Public-facing user profile summary for the 'Who is this?' popup.
    No authentication required. Returns callsign, name, avatar, check-in stats,
    recent nets, and most-attended nets. Optionally includes the user's role in
    a specific net when net_id is provided."""
    import json
    from sqlalchemy.orm import selectinload
    from app.models import CheckIn, NetRole
    from app.utils import get_avatar_url

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Collect all callsigns associated with this user
    user_callsigns = [user.callsign] if user.callsign else []
    if getattr(user, 'gmrs_callsign', None):
        user_callsigns.append(user.gmrs_callsign)
    try:
        additional = json.loads(user.callsigns) if user.callsigns else []
        user_callsigns.extend(additional)
    except Exception:
        pass

    # Fetch all check-ins for this user's callsigns, newest first
    ci_result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.net))
        .where(CheckIn.callsign.in_(user_callsigns))
        .order_by(CheckIn.checked_in_at.desc())
    )
    check_ins = ci_result.scalars().all()

    total_check_ins = len(check_ins)

    # Aggregate per-net stats
    net_data: dict = {}
    for ci in check_ins:
        if ci.net_id not in net_data:
            net_data[ci.net_id] = {
                "net_id": ci.net_id,
                "net_name": ci.net.name if ci.net else "Unknown",
                "date": ci.checked_in_at,
                "check_in_count": 0,
            }
        net_data[ci.net_id]["check_in_count"] += 1

    unique_nets = len(net_data)

    # Recent nets: 5 most recently attended (by individual instance)
    recent_nets = sorted(net_data.values(), key=lambda x: x["date"], reverse=True)[:5]

    # Top nets: group individual instances by net name so recurring nets
    # accumulate across sessions (e.g. "Office Hours Tech Net" = 8x, not 1x each)
    by_name: dict = {}
    for entry in net_data.values():
        name = entry["net_name"]
        if name not in by_name:
            by_name[name] = {"net_id": entry["net_id"], "net_name": name,
                             "date": entry["date"], "check_in_count": 0}
        by_name[name]["check_in_count"] += entry["check_in_count"]
    top_nets = sorted(by_name.values(), key=lambda x: x["check_in_count"], reverse=True)[:5]

    # Net role for the specified net (if provided)
    net_role = None
    if net_id:
        role_result = await db.execute(
            select(NetRole).where(NetRole.net_id == net_id, NetRole.user_id == user_id)
        )
        role_obj = role_result.scalar_one_or_none()
        if role_obj:
            net_role = role_obj.role

    avatar_url = get_avatar_url(user.email, user.avatar_url)

    return UserPopupResponse(
        user_id=user.id,
        callsign=user.callsign or "",
        name=user.name,
        avatar_url=avatar_url,
        net_role=net_role,
        total_check_ins=total_check_ins,
        unique_nets=unique_nets,
        recent_nets=recent_nets,
        top_nets=top_nets,
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get user by ID"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse.from_orm(user)


@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    role: UserRole,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user role (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = role
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.put("/{user_id}/ban", response_model=UserResponse)
async def ban_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Ban/deactivate user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.put("/{user_id}/unban", response_model=UserResponse)
async def unban_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Unban/activate user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.put("/{user_id}/schedule-bypass", response_model=UserResponse)
async def set_schedule_age_bypass(
    user_id: int,
    grant: bool,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Grant or revoke early schedule-creation access for a user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.schedule_age_bypass = grant
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.get("/lookup/{callsign}", response_model=CallsignLookupResponse)
async def lookup_by_callsign(
    callsign: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Look up station info by callsign for check-in auto-fill.
    
    Priority: User account > Contact record.
    Returns limited info (name, location, skywarn_number) with source indicator.
    Future: QRZ lookup as tertiary source (roadmap).
    """
    callsign_upper = callsign.upper()
    
    # Priority 1: Look up registered user by primary callsign, GMRS callsign, or additional callsigns
    result = await db.execute(
        select(User).where(
            (User.callsign == callsign_upper) | 
            (User.gmrs_callsign == callsign_upper) |
            (User.callsigns.like(f'%"{callsign_upper}"%'))
        )
    )
    user = result.scalar_one_or_none()
    
    if user:
        # Prefer live GPS location if available and recent (within 1 hour), otherwise use static default
        from datetime import datetime, UTC, timedelta
        location = None
        if user.live_location and user.live_location_updated:
            age = datetime.now(UTC) - user.live_location_updated.replace(tzinfo=UTC)
            if age < timedelta(hours=1):
                location = user.live_location
        
        # Fall back to static default location if no recent live location
        if not location:
            location = user.location
        
        return CallsignLookupResponse(
            name=user.name,
            location=location,
            skywarn_number=user.skywarn_number,
            source='user'
        )
    
    # Priority 2: Look up contact record (from check-in history)
    contact_result = await db.execute(
        select(Contact).where(Contact.callsign == callsign_upper)
    )
    contact = contact_result.scalar_one_or_none()
    
    if contact:
        return CallsignLookupResponse(
            name=contact.name,
            location=contact.location,
            skywarn_number=contact.skywarn_number,
            source='contact'
        )
    
    # No match found — return empty response (future: QRZ lookup here)
    return CallsignLookupResponse()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.delete(user)
    await db.commit()
    return None


@router.post("/email-all", status_code=status.HTTP_200_OK)
async def email_all_users(
    email_data: dict,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a platform notice email to all users with email notifications enabled (admin only)"""
    from app.email_service import EmailService
    from jinja2 import Template
    
    subject = email_data.get('subject', '').strip()
    message = email_data.get('message', '').strip()
    
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message are required")
    
    # Get all active users with email notifications enabled
    result = await db.execute(
        select(User).where(
            User.is_active == True,
            User.email_notifications == True
        )
    )
    users = result.scalars().all()
    
    if not users:
        raise HTTPException(status_code=400, detail="No users with email notifications enabled")
    
    # Create HTML email template
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .message { white-space: pre-wrap; background-color: white; padding: 15px; border-radius: 4px; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>{{ subject }}</h2>
            </div>
            <div class="content">
                <div class="message">{{ message }}</div>
            </div>
            <div class="footer">
                <p>This is a platform notice from ECTLogger.</p>
                <p>You're receiving this because you have email notifications enabled.</p>
            </div>
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(subject=subject, message=message)
    
    # Send emails
    sent_count = 0
    failed_count = 0
    
    for user in users:
        try:
            await EmailService.send_email(user.email, f"[ECTLogger] {subject}", html_content)
            sent_count += 1
        except Exception as e:
            failed_count += 1
            # Log error but continue sending to other users
            print(f"Failed to send email to {user.email}: {e}")
    
    return {
        "sent": sent_count,
        "failed": failed_count,
        "total_recipients": len(users)
    }

