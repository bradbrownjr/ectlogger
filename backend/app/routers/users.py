from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, nullslast, and_, func
from sqlalchemy.orm import aliased
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from io import BytesIO
from PIL import Image, ImageOps
from app.database import get_db
from app.models import User, UserRole, Contact, NetRole, CanHearReport, CheckIn, Frequency, net_frequencies
from app.audit import record_event, field_changes, forget_user, user_label
from app.services.account_email import apply_email_change
from app.schemas import LiveLocationUpdate, UserResponse, UserUpdate, AdminUserCreate, AdminUserUpdate, CallsignLookupResponse, UserDirectoryEntry, UserPopupResponse, CoverageStationResponse, AdminPasswordResetResult
from app.dependencies import get_current_user, get_current_user_optional, get_admin_user
from app.auth import generate_temporary_password, hash_password
from app.email_service import EmailService
from app.logger import logger
from app.utils import AVATAR_DIR, user_callsigns
from app.services.live_location import live_location_display
from app.services.callsign_people import claim_and_queue_notices, find_user_by_callsign, revert_all_claims, revert_callsign_claim
from app.band_utils import band_from_frequency_string

AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
AVATAR_MAX_DIM = 256
AVATAR_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}

router = APIRouter(prefix="/users", tags=["users"])


# ========== ADMIN FIELD LOCKS ==========
# How each lockable field reads in the 403 a locked user sees.
_LOCKED_FIELD_LABELS = {
    'name': 'name',
    'callsign': 'callsign',
    'email': 'email',
    'gmrs_callsign': 'GMRS callsign',
    'callsigns': 'additional callsigns',
    'location': 'default location',
    'skywarn_number': 'spotter number',
    'website_url': 'website',
}


def callsign_taken_message(callsign: str) -> str:
    """What an operator sees when their callsign already has an account."""
    return (f"{callsign} already has an account here, probably one you made with a different email address. "
            "Sign in with that address instead, or ask an administrator to move this address onto it. "
            "The administrators have been told.")


def _profile_value(field: str, value):
    """Comparable form of a profile field, so a locked field that is
    re-submitted unchanged never trips the lock: the Profile form always
    submits the whole object, so a lock must block a *change*, not the
    field's presence. Callsigns compare case-insensitively, blank equals
    unset, and the callsigns list ignores order."""
    import json

    if field == 'callsigns':
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                value = []
        return sorted(cs.upper() for cs in (value or []) if cs)
    if field in ('callsign', 'gmrs_callsign'):
        return (value or '').upper()
    return value or None


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile"""
    return UserResponse.from_orm(current_user)


# The profile fields find_user_by_callsign matches a station on; changing any
# of them can make an account the owner of a callsign-only staff or rotation
# entry (services/callsign_people.py).


# Profile fields worth a line in the activity log when a user changes them:
# who they say they are, and what others see. Preferences (theme, sort
# order, notification switches) are not.
_AUDITED_PROFILE_FIELDS = (
    'name', 'callsign', 'gmrs_callsign', 'callsigns', 'location',
    'skywarn_number', 'website_url', 'sms_gateway',
)


@router.put("/me", response_model=UserResponse)
async def update_my_profile(
    user_update: UserUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's profile"""
    import json

    update_data = user_update.dict(exclude_unset=True)

    # Admin-set padlocks (Admin Users "Edit User" dialog) block a *change* to
    # the field, not merely its presence in the payload -- the frontend form
    # always submits the whole object, so a locked-but-unchanged field must
    # not trip this or every other field would become unsaveable too.
    for field in current_user.get_locked_fields():
        if field in update_data and _profile_value(field, update_data[field]) != _profile_value(field, getattr(current_user, field, None)):
            label = _LOCKED_FIELD_LABELS.get(field, field)
            raise HTTPException(status_code=403, detail=f"Your {label} has been locked by an administrator and can't be changed here.")

    # A primary callsign another account holds is almost always the same
    # operator, signed up again with a different email address. Say so, never
    # reveal the other address, and tell the admins, who can see both.
    new_callsign = update_data.get('callsign')
    if new_callsign and new_callsign.upper() != (current_user.callsign or '').upper():
        holder = (await db.execute(
            select(User).where(func.upper(User.callsign) == new_callsign.upper(), User.id != current_user.id).limit(1)
        )).scalar_one_or_none()
        if holder is not None:
            from app.security_alerts import check_callsign_taken
            await check_callsign_taken(db, current_user, holder, new_callsign.upper())
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=callsign_taken_message(new_callsign.upper()))

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

    primary_before = (current_user.callsign or '').upper()
    # The form sends every field on every save; only real changes are logged.
    changes = field_changes(current_user, update_data, _AUDITED_PROFILE_FIELDS)
    if changes:
        record_event(db, "user.profile_changed", current_user, target_type="user",
                     target_id=current_user.id, target_label=user_label(current_user),
                     details={"changes": changes})
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
    # A new primary callsign may already be on a schedule's staff or rotation
    # (added before this operator signed up): take over what that schedule
    # invited this address for, and hold the rest for its manager. Only on a
    # real change: the profile form sends every field on every save, and a
    # held claim must not email the manager again each time.
    if (current_user.callsign or '').upper() != primary_before and current_user.callsign:
        await claim_and_queue_notices(db, current_user, background_tasks)
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
    record_event(db, "user.avatar_changed", current_user, target_type="user",
                 target_id=current_user.id, target_label=user_label(current_user))
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
    record_event(db, "user.avatar_removed", current_user, target_type="user",
                 target_id=current_user.id, target_label=user_label(current_user))
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.from_orm(current_user)


@router.put("/me/location")
async def update_my_location(
    location_data: LiveLocationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's live location (grid square, plus the town it is in).

    Called automatically when location_awareness is enabled and GPS position updates.
    This allows NCS to see the user's current location when checking them in.
    Stored separately from the user's default location so GPS doesn't overwrite manual entry.
    The town is reverse-geocoded from the (already rounded) coordinates so net
    control can read "Waterboro, ME" on the air instead of a grid square.
    """
    from datetime import datetime, UTC
    from app.routers.geocode import reverse_geocode_town
    if location_data.location:
        current_user.live_location = location_data.location.upper()
        current_user.live_location_updated = datetime.now(UTC)
        current_user.live_location_town = (
            await reverse_geocode_town(location_data.lat, location_data.lon)
            if location_data.lat is not None and location_data.lon is not None
            else None
        )
    else:
        # Empty string clears the GPS-derived location so the static profile
        # default takes over in callsign lookups.
        current_user.live_location = None
        current_user.live_location_updated = None
        current_user.live_location_town = None
    await db.commit()
    return {
        "status": "ok",
        "live_location": current_user.live_location,
        "live_location_town": current_user.live_location_town,
    }


@router.get("/me/can-hear-coverage", response_model=List[CoverageStationResponse])
async def get_my_can_hear_coverage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Personal propagation coverage rollup (Phase 5 of the "Can hear"
    inter-station propagation logging feature - see routers/can_hear.py for
    the data model; its roadmap item was pruned when the feature shipped).

    Returns, for every (station, band) the current user has personally
    reported hearing while operating from home, a MAX(reported_at) "last
    heard" rollup, a confirmation count (distinct nets), and the location
    tied to the most recent report - the data the Profile page's Coverage
    map plots. Grouped by band as well as callsign because the same station
    heard on 2m and on 40m is two different propagation data points (see
    band_utils.py) - a station worked on both bands appears as two rows.

    Privacy: this is scoped, by construction, to reports whose reporter
    check-in belongs to current_user - i.e. what the caller's own station
    heard, whoever typed it in. Because the query is inherently scoped this
    way, no separate access-control layer is needed; auth via
    get_current_user is the only gate. Do NOT widen this query to "all
    reports for nets the user attended" - that would surface what other
    stations heard, which is exactly the cross-station privacy leak the
    roadmap's Phase 5 "privacy line" warns against.

    Who entered the report is deliberately NOT a filter. Until 2026-10-20
    this also required reported_by_user_id == current_user.id, so a station
    whose reception NCS/Logger/Relay logged by voice (the common case, and
    what the Coverage tab's own empty-state text promises) never got a map
    at all. The roadmap's rule was "reports where the viewer was the
    reporting station", which the reporter check-in clause already is.
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
    limit: Optional[int] = None,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only). Unlimited unless `limit` is given: the
    Admin Users tab filters and counts this list in the browser, so a cap
    hides accounts from it outright. It defaulted to 100 until 2026-09-28,
    when production had 118 accounts and the 18 least recently active could
    not be found by any filter."""
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
        .limit(limit)  # None means no limit
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
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Create/invite a new user (admin only)"""
    # Check if user already exists (case-insensitive: see app.utils.normalize_email)
    result = await db.execute(select(User).where(func.lower(User.email) == user_data.email))
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
    await db.flush()
    record_event(db, "user.created_by_admin", current_user, target_type="user",
                 target_id=new_user.id, target_label=user_label(new_user))
    await db.commit()
    await db.refresh(new_user)
    if new_user.callsign:
        await claim_and_queue_notices(db, new_user, background_tasks)
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

    callsigns = user_callsigns(user)

    # Fetch all check-ins for this user's callsigns, newest first
    ci_result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.net))
        .where(CheckIn.callsign.in_(callsigns))
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
        website_url=user.website_url,
        net_role=net_role,
        total_check_ins=total_check_ins,
        unique_nets=unique_nets,
        recent_nets=recent_nets,
        top_nets=top_nets,
    )


@router.get("/callsign/{callsign}/popup", response_model=UserPopupResponse)
async def get_user_popup_by_callsign(
    callsign: str,
    db: AsyncSession = Depends(get_db)
):
    """'Who is this?' popup for a check-in with no linked account (guest, or
    NCS/Logger-entered by voice). Same public/unauthenticated shape as
    GET /{user_id}/popup, sourced from the Contact table (auto-populated on a
    callsign's first check-in) plus check-ins matched directly by callsign
    instead of by a User's set of aliases. 404 if the callsign has never
    checked into any net -- same "unknown identity" behavior as an unknown
    user_id, not a new enumeration surface. No net_role: a guest/accountless
    callsign can never hold a NetRole (NCS/Logger grants require an account --
    see permissions.py's is_eligible_for_ncs_auto_grant)."""
    from sqlalchemy.orm import selectinload
    from app.models import CheckIn
    from app.utils import get_avatar_url

    callsign_upper = callsign.upper()

    contact_result = await db.execute(select(Contact).where(Contact.callsign == callsign_upper))
    contact = contact_result.scalar_one_or_none()

    ci_result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.net))
        .where(CheckIn.callsign == callsign_upper)
        .order_by(CheckIn.checked_in_at.desc())
    )
    check_ins = ci_result.scalars().all()

    if not contact and not check_ins:
        raise HTTPException(status_code=404, detail="Callsign not found")

    total_check_ins = len(check_ins)

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
    recent_nets = sorted(net_data.values(), key=lambda x: x["date"], reverse=True)[:5]

    by_name: dict = {}
    for entry in net_data.values():
        name = entry["net_name"]
        if name not in by_name:
            by_name[name] = {"net_id": entry["net_id"], "net_name": name,
                             "date": entry["date"], "check_in_count": 0}
        by_name[name]["check_in_count"] += entry["check_in_count"]
    top_nets = sorted(by_name.values(), key=lambda x: x["check_in_count"], reverse=True)[:5]

    avatar_url = get_avatar_url(contact.email, None) if contact else None

    return UserPopupResponse(
        user_id=None,
        callsign=callsign_upper,
        name=contact.name if contact else None,
        avatar_url=avatar_url,
        website_url=None,
        net_role=None,
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


@router.put("/{user_id}", response_model=UserResponse)
async def admin_update_user(
    user_id: int,
    user_update: AdminUserUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Edit another user's name, callsign, email, and/or role (admin only).

    Recovery path for an account that lost access to its sign-up email, or
    a callsign/name that needs correcting -- the alternative was previously
    only deleting and recreating the account, which loses check-in history
    and role assignments. Mirrors update_my_profile's previous_callsigns
    bookkeeping on a callsign change. Every changed field is written to
    the activity log as one "user.admin_edited" event (app/audit.py).
    An email change notifies both the old and new address.

    Also edits the rest of the profile fields (GMRS callsign, additional
    callsigns, location, spotter number, website) and accepts
    locked_fields: the list of LOCKABLE_USER_FIELDS the user's own
    PUT /users/me may no longer change (so fixing a spammy value doesn't
    just get typed right back in). Enforced in update_my_profile; this
    endpoint itself is never subject to a lock -- an admin can always edit
    a locked field, and can change the locks in the same request as the
    edit.
    """
    import json

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.dict(exclude_unset=True)
    if not update_data:
        return UserResponse.from_orm(user)

    # Pre-check collisions on the two unique columns before mutating, so the
    # 409 can name the specific field that conflicts -- a bare IntegrityError
    # can't tell which of email/callsign collided (see update_my_profile).
    if update_data.get('email') and update_data['email'] != user.email:
        existing = await db.execute(
            select(User.id).where(func.lower(User.email) == update_data['email'], User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="That email is already in use by another account.")

    if update_data.get('callsign') and update_data['callsign'] != user.callsign:
        existing = await db.execute(
            select(User.id).where(User.callsign == update_data['callsign'], User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="That callsign is already in use by another account.")

    if update_data.get('gmrs_callsign') and update_data['gmrs_callsign'] != user.gmrs_callsign:
        existing = await db.execute(
            select(User.id).where(User.gmrs_callsign == update_data['gmrs_callsign'], User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="That GMRS callsign is already in use by another account.")

    # The two JSON-list columns are stored as text, so the audit log and the
    # change check below compare their encoded form.
    for field in ('callsigns', 'locked_fields'):
        if field in update_data:
            update_data[field] = json.dumps(update_data[field] or [])

    if 'callsign' in update_data:
        new_callsign = update_data['callsign']
        old_callsign = user.callsign
        if old_callsign and new_callsign and old_callsign.upper() != new_callsign.upper():
            try:
                prev = json.loads(user.previous_callsigns) if user.previous_callsigns else []
            except (json.JSONDecodeError, TypeError):
                prev = []
            if old_callsign.upper() not in [cs.upper() for cs in prev]:
                prev.append(old_callsign.upper())
                user.previous_callsigns = json.dumps(prev)

    old_email = user.email
    changes = field_changes(user, update_data, (
        'name', 'callsign', 'email', 'role', 'gmrs_callsign', 'callsigns',
        'location', 'skywarn_number', 'website_url', 'locked_fields',
    ))
    changed_fields: List[str] = list(changes)
    if changes:
        record_event(db, "user.admin_edited", current_user, target_type="user",
                     target_id=user.id, target_label=user_label(user),
                     details={"changes": changes})
    for field in changed_fields:
        if field == 'email':
            apply_email_change(user, update_data[field])
        else:
            setattr(user, field, update_data[field])

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email or callsign is already in use by another account."
        )
    await db.refresh(user)

    if 'email' in changed_fields and old_email and user.email:
        await EmailService.send_email_change_notice(old_email, user.email, by_admin=True)
    if 'callsign' in changed_fields and user.callsign:
        await claim_and_queue_notices(db, user, background_tasks)
        await db.refresh(user)

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
    
    if user.role != role:
        record_event(db, "user.role_changed", current_user, target_type="user", target_id=user.id,
                     target_label=user_label(user), details={"changes": {"role": [user.role.value, role.value]}})
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
    
    record_event(db, "user.banned", current_user, target_type="user", target_id=user.id,
                 target_label=user_label(user))
    user.is_active = False
    # Free the primary callsign, so the real operator can set it on their
    # own account (it is a unique column). Unban puts it back if still free.
    if user.callsign:
        user.banned_callsign = user.callsign
        user.callsign = None
    # A banned account gives back every staff, rotation and role entry it
    # took over by callsign; they become callsign-only again, waiting for
    # the real operator (services/callsign_people.py).
    template_ids = await revert_all_claims(db, user, current_user)
    await db.commit()
    await _resync_after_revert(db, template_ids)
    if template_ids:
        logger.warning("CALLSIGN_CLAIM", f"Ban of user {user.id} reverted its claims on schedules {sorted(template_ids)}")
    await db.refresh(user)
    return UserResponse.from_orm(user)


async def _resync_after_revert(db: AsyncSession, template_ids) -> None:
    """Re-pick the duty NCS on each schedule's upcoming nets after claims were
    reverted, so a role the account was auto-assigned while it held a
    rotation slot goes back to the callsign as well."""
    from app.routers.ncs_rotation import resync_pending_duty_ncs
    for template_id in template_ids:
        await resync_pending_duty_ncs(db, template_id)


@router.get("/{user_id}/callsign-claims")
async def list_callsign_claims(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """The schedules where this account took over (or is waiting to take
    over) entries for its callsign (admin only): what to check when a
    schedule manager reports someone signed up with a callsign that isn't
    theirs."""
    import json
    from app.models import CallsignClaim, NetTemplate

    rows = (await db.execute(
        select(CallsignClaim, NetTemplate.name)
        .outerjoin(NetTemplate, NetTemplate.id == CallsignClaim.template_id)
        .where(CallsignClaim.user_id == user_id)
        .order_by(CallsignClaim.claimed_at.desc())
    )).all()
    return [
        {
            "id": c.id,
            "callsign": c.callsign,
            "schedule_name": name,
            "status": c.status,
            "claimed_at": c.claimed_at,
            "via_invite": c.via_invite,
            "linked_by_manager": c.linked_by_id is not None,
            "reverted_at": c.reverted_at,
            "entries": len(json.loads(c.rows or "[]")),
        }
        for c, name in rows
    ]


@router.post("/{user_id}/callsign-claims/{claim_id}/revert")
async def revert_user_callsign_claim(
    user_id: int,
    claim_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Give back what one claim took over (admin only). The entries become
    callsign-only again, and this account can't take them back by editing
    its profile; banning it reverts every claim at once."""
    from app.models import CallsignClaim

    claim = (await db.execute(
        select(CallsignClaim).where(CallsignClaim.id == claim_id, CallsignClaim.user_id == user_id)
    )).scalar_one_or_none()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.reverted_at is not None:
        raise HTTPException(status_code=400, detail="Already reverted")
    restored = await revert_callsign_claim(db, claim, current_user)
    record_event(db, "user.callsign_claim_reverted", current_user, target_type="user", target_id=user_id,
                 target_label=claim.callsign, template_id=claim.template_id,
                 details={"callsign": claim.callsign, "entries": restored})
    await db.commit()
    if claim.template_id:
        await _resync_after_revert(db, [claim.template_id])
    return {"restored": restored}


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
    
    record_event(db, "user.unbanned", current_user, target_type="user", target_id=user.id,
                 target_label=user_label(user) or user.banned_callsign)
    user.is_active = True
    # Give back the callsign the ban freed, unless the real operator has
    # since taken it; then it stays on banned_callsign for the admin to see.
    if user.banned_callsign and not user.callsign:
        taken = (await db.execute(
            select(User.id).where(func.upper(User.callsign) == user.banned_callsign.upper()).limit(1)
        )).scalar_one_or_none()
        if taken is None:
            user.callsign = user.banned_callsign
            user.banned_callsign = None
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
    record_event(db, "user.password_reset_by_admin", current_user, target_type="user", target_id=user.id,
                 target_label=user_label(user))
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
    record_event(db, "user.mfa_reset_by_admin", current_user, target_type="user", target_id=user.id,
                 target_label=user_label(user))
    await db.commit()

    return {"success": True, "message": "Two-factor authentication reset. The user will need to re-enroll."}


@router.put("/{user_id}/schedule-bypass", response_model=UserResponse)
async def set_schedule_age_bypass(
    user_id: int,
    grant: bool,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Grant or revoke early schedule-creation access for a user (admin only).

    A new grant emails the user, since they usually asked for it from the
    "Request early access" button (templates_core.py::request_early_access)
    and would otherwise not know to try again.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    newly_granted = grant and not user.schedule_age_bypass
    if bool(user.schedule_age_bypass) != grant:
        record_event(db, "user.early_access_granted" if grant else "user.early_access_revoked", current_user,
                     target_type="user", target_id=user.id, target_label=user_label(user))
    user.schedule_age_bypass = grant
    await db.commit()
    await db.refresh(user)

    if newly_granted and user.email:
        try:
            await EmailService.send_early_access_granted(user.email)
        except Exception as e:
            logger.error("USERS", f"Failed to send early access notice to {user.email}: {e}")

    return UserResponse.from_orm(user)


@router.get("/lookup/{callsign}", response_model=CallsignLookupResponse)
async def lookup_by_callsign(
    callsign: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Look up station info by callsign for check-in auto-fill.

    Each field comes from the account if it has one (location: a fresh live
    GPS town first, then the profile), else from the Contact record, which
    holds what net control last entered for the callsign. The account used to
    win outright, so a station whose profile has no location came up blank
    every week however often net control typed its town (N1UB, N1WSD,
    2026-10-25). Future: QRZ lookup as tertiary source (roadmap).
    """
    callsign_upper = callsign.strip().upper()
    user = await find_user_by_callsign(db, callsign_upper)
    contact = (await db.execute(
        select(Contact).where(Contact.callsign == callsign_upper)
    )).scalar_one_or_none()

    if user is None and contact is None:
        # No match found (future: QRZ lookup here)
        return CallsignLookupResponse()

    def pick(account_value, contact_field):
        return account_value or (getattr(contact, contact_field) if contact else None)

    return CallsignLookupResponse(
        name=pick(user.name if user else None, 'name'),
        location=pick((live_location_display(user) or user.location) if user else None, 'location'),
        skywarn_number=pick(user.skywarn_number if user else None, 'skywarn_number'),
        source='user' if user else 'contact',
    )


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

    # Give back any team entries it took over by callsign first: SQLite
    # doesn't enforce the foreign keys, so they would otherwise keep pointing
    # at a user id that no longer exists.
    template_ids = await revert_all_claims(db, user, current_user)
    # And drop its claim records: SQLite reuses the id, and a later account
    # given it would inherit them (a reverted claim blocks taking over).
    from sqlalchemy import delete as sql_delete
    from app.models import CallsignClaim
    await db.execute(sql_delete(CallsignClaim).where(CallsignClaim.user_id == user.id))
    await db.flush()
    await forget_user(db, user.id)
    record_event(db, "user.deleted", current_user, target_type="user", target_label=user_label(user),
                 details={"email": user.email, "callsign": user.callsign or user.banned_callsign})
    await db.delete(user)
    await db.commit()
    await _resync_after_revert(db, template_ids)
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

    record_event(db, "admin.emailed_all_users", current_user,
                 details={"subject": subject, "recipients": len(users)})
    await db.commit()

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

