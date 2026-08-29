from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, nullslast, and_
from sqlalchemy.orm import aliased
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from io import BytesIO
from PIL import Image, ImageOps
from app.database import get_db
from app.models import User, UserRole, Contact, NetRole, CanHearReport, CheckIn, Frequency, net_frequencies
from app.schemas import UserResponse, UserUpdate, AdminUserCreate, CallsignLookupResponse, UserDirectoryEntry, UserPopupResponse, CoverageStationResponse, AdminPasswordResetResult
from app.dependencies import get_current_user, get_current_user_optional, get_admin_user
from app.auth import generate_temporary_password, hash_password
from app.email_service import EmailService
from app.utils import AVATAR_DIR
from app.band_utils import band_from_frequency_string

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
    
    update_data = user_update.dict(exclude_unset=True)

    # When the primary callsign changes, record the old one in previous_callsigns
    # so check-in history and statistics follow the user across callsign changes.
    if 'callsign' in update_data:
        new_callsign = update_data['callsign']
        old_callsign = current_user.callsign
        if old_callsign and new_callsign and old_callsign.upper() != new_callsign.upper():
            try:
                prev = json.loads(current_user.previous_callsigns) if current_user.previous_callsigns else []
            except (json.JSONDecodeError, TypeError):
                prev = []
            if old_callsign.upper() not in [cs.upper() for cs in prev]:
                prev.append(old_callsign.upper())
                current_user.previous_callsigns = json.dumps(prev)

    for field, value in update_data.items():
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


@router.get("/me/can-hear-coverage", response_model=List[CoverageStationResponse])
async def get_my_can_hear_coverage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Personal propagation coverage rollup (Phase 5 of the "Can hear"
    inter-station propagation logging feature - see docs/ROADMAP.md
    "Relaying & Propagation Mapping", "Last heard" and Phase 5 sections).

    Returns, for every (station, band) the current user has personally
    reported hearing while operating from home, a MAX(reported_at) "last
    heard" rollup, a confirmation count (distinct nets), and the location
    tied to the most recent report - the data the Profile page's Coverage
    map plots. Grouped by band as well as callsign because the same station
    heard on 2m and on 40m is two different propagation data points (see
    band_utils.py) - a station worked on both bands appears as two rows.

    Privacy: this is scoped, by construction, to
    CanHearReport.reported_by_user_id == current_user.id AND the reporter
    check-in's user_id == current_user.id - i.e. only reports the caller
    personally entered, about their own check-in. Because the query is
    inherently scoped this way, no separate access-control layer is needed;
    auth via get_current_user is the only gate. Do NOT widen this query to
    "all reports for nets the user attended" - that would surface other
    stations' can-hear reports the viewer did not personally make, which is
    exactly the cross-station privacy leak the roadmap's Phase 5 "privacy
    line" warns against.
    """
    ReporterCheckIn = aliased(CheckIn)
    HeardCheckIn = aliased(CheckIn)

    result = await db.execute(
        select(
            HeardCheckIn.callsign,
            CanHearReport.net_id,
            CanHearReport.reported_at,
            HeardCheckIn.location,
            CanHearReport.frequency_id,
            Frequency.frequency,
        )
        .select_from(CanHearReport)
        .join(ReporterCheckIn, CanHearReport.reporter_check_in_id == ReporterCheckIn.id)
        .join(HeardCheckIn, CanHearReport.heard_check_in_id == HeardCheckIn.id)
        .outerjoin(Frequency, CanHearReport.frequency_id == Frequency.id)
        .where(
            CanHearReport.reported_by_user_id == current_user.id,
            ReporterCheckIn.user_id == current_user.id,
            # operating_position is freeSolo text seeded with "Home" /
            # "Field Deployed" (see CanHearDialog.tsx's
            # OPERATING_POSITION_OPTIONS), not an enum, so match loosely
            # (case-insensitive substring) rather than requiring an exact
            # "Home" string - catches typed variants like "home station"
            # without matching "Field Deployed".
            ReporterCheckIn.operating_position.ilike('%home%'),
        )
    )
    rows = result.all()

    # A report with no specific frequency still happened on *some*
    # frequency - if the net's PACE plan has exactly one, that's
    # unambiguously what was used (see can_hear.py's same fallback for the
    # per-net coverage report). Look this up per net_id that needs it.
    net_ids_needing_fallback = {row.net_id for row in rows if row.frequency_id is None}
    sole_frequency_by_net: dict = {}
    if net_ids_needing_fallback:
        freq_result = await db.execute(
            select(net_frequencies.c.net_id, Frequency.frequency)
            .join(Frequency, net_frequencies.c.frequency_id == Frequency.id)
            .where(net_frequencies.c.net_id.in_(net_ids_needing_fallback))
        )
        freqs_by_net: dict = {}
        for net_id, freq_str in freq_result.all():
            freqs_by_net.setdefault(net_id, []).append(freq_str)
        sole_frequency_by_net = {
            net_id: freqs[0] for net_id, freqs in freqs_by_net.items() if len(freqs) == 1
        }

    # Roll up per (heard callsign, band) - not check-in id or user_id, see
    # ROADMAP.md "Last heard": manually-logged stations have no user_id, and
    # the same callsign appears in different check-in rows across different
    # nets - and not callsign alone, since the same station heard on 2m and
    # on 40m is two different propagation data points. Done in Python rather
    # than via a SQL window function. The roadmap's own volume argument (a
    # dense net tops out under 900 edges) means a single user's lifetime
    # report count is small, so this is simpler and more portable than a
    # window-function query, and matches this feature's "no
    # separately-maintained aggregate table" philosophy.
    by_key: dict = {}
    for callsign, net_id, reported_at, location, frequency_id, frequency_str in rows:
        if frequency_id is not None:
            band = band_from_frequency_string(frequency_str)
        else:
            band = band_from_frequency_string(sole_frequency_by_net.get(net_id))

        key = (callsign, band)
        entry = by_key.setdefault(key, {
            "net_ids": set(),
            "last_heard": reported_at,
            "location": location,
        })
        entry["net_ids"].add(net_id)
        # Location tracks whichever report is most recent - a station's
        # location can vary across nets (e.g. a mobile station), so the map
        # should reflect where they were most recently heard from.
        if reported_at >= entry["last_heard"]:
            entry["last_heard"] = reported_at
            entry["location"] = location

    stations = [
        CoverageStationResponse(
            callsign=callsign,
            band=band,
            last_heard=data["last_heard"],
            confirmation_count=len(data["net_ids"]),
            location=data["location"],
        )
        for (callsign, band), data in by_key.items()
    ]
    stations.sort(key=lambda s: s.last_heard, reverse=True)
    return stations


@router.get("", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only)"""
    # "Has this user ever held NCS on any net?" is computed live via an EXISTS
    # subquery rather than a denormalized column - at this app's scale (low
    # hundreds of users) a live join is simplest and always correct, with no
    # migration and no write-path drift risk.
    is_ncs_subquery = (
        select(NetRole.id)
        .where(and_(NetRole.user_id == User.id, NetRole.role == "NCS"))
        .exists()
        .label("is_ncs")
    )
    result = await db.execute(
        select(User, is_ncs_subquery)
        .order_by(nullslast(User.last_active.desc()))
        .offset(skip)
        .limit(limit)
    )
    responses = []
    for user, is_ncs in result.all():
        response = UserResponse.from_orm(user)
        response.is_ncs = bool(is_ncs)
        responses.append(response)
    return responses


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

    # Collect all callsigns associated with this user (current, aliases, and previous)
    user_callsigns = [user.callsign] if user.callsign else []
    if getattr(user, 'gmrs_callsign', None):
        user_callsigns.append(user.gmrs_callsign)
    try:
        additional = json.loads(user.callsigns) if user.callsigns else []
        user_callsigns.extend(additional)
    except Exception:
        pass
    try:
        previous = json.loads(user.previous_callsigns) if user.previous_callsigns else []
        user_callsigns.extend(previous)
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


@router.post("/{user_id}/password/reset", response_model=AdminPasswordResetResult)
async def admin_reset_password(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Issue a one-time temporary password for a user who's locked out and
    can't receive magic-link email (admin only). The password is returned
    once in this response and never logged or stored in the clear; the user
    only gets a "your password was changed" notice, not the password itself."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = generate_temporary_password()
    user.password_hash = hash_password(temp_password)
    user.failed_password_attempts = 0
    user.password_locked_until = None
    await db.commit()

    if user.email:
        await EmailService.send_password_changed(user.email)

    return AdminPasswordResetResult(temporary_password=temp_password)


@router.post("/{user_id}/mfa/reset")
async def admin_reset_mfa(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear a user's MFA enrollment so they can re-enroll from scratch
    (admin only) -- the recovery path for a lost device with no backup
    codes left. An admin can't reset their own MFA this way (that would
    trivially defeat "MFA mandatory for admins"); ask another admin, or use
    scripts/reset_admin_mfa.py if none is available."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Admins can't reset their own MFA this way. Ask another admin, "
                   "or use the server-side recovery script if none is available."
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.mfa_enabled = False
    user.mfa_secret_encrypted = None
    user.mfa_backup_codes = None
    user.mfa_pending_secret_encrypted = None
    await db.commit()

    return {"success": True, "message": "Two-factor authentication reset. The user will need to re-enroll."}


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

