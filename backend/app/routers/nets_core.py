import json
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import Image, ImageOps
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import (
    CheckIn,
    Frequency,
    Net,
    NetRole,
    NetStatus,
    NetTemplate,
    TemplateStaff,
    User,
    UserRole,
    net_frequencies,
)
from app.net_start import send_net_start_notifications
from app.permissions import (
    check_net_permission,
    is_admin,
    is_eligible_for_logger_self_grant,
    is_eligible_for_ncs_auto_grant,
)
from app.schemas import (
    NetCreate,
    NetResponse,
    NetTemplateLinkRequest,
    NetUpdate,
    public_display_name,
)
from app.services.net_closure import close_net_and_notify
from app.utils import NET_LOGO_DIR, display_callsign, format_ncs_attribution

# Same limits as the profile avatar upload (routers/users.py) -- square,
# cropped client-side, re-validated and re-resized here as a safety net.
NET_LOGO_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
NET_LOGO_MAX_DIM = 256
NET_LOGO_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}

router = APIRouter()


@router.post("/", response_model=NetResponse, status_code=status.HTTP_201_CREATED)
async def create_net(
    net_data: NetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new net"""
    import json
    
    net = Net(
        name=net_data.name,
        description=net_data.description,
        owner_id=current_user.id,
        status=NetStatus.DRAFT,
        field_config=json.dumps(net_data.field_config) if net_data.field_config else None,
        ics309_enabled=net_data.ics309_enabled or False,
        propagation_logging_enabled=net_data.propagation_logging_enabled or False,
        self_can_hear_enabled=net_data.self_can_hear_enabled if net_data.self_can_hear_enabled is not None else True,
        traffic_enabled=net_data.traffic_enabled or False,
        traffic_form_types=json.dumps(net_data.traffic_form_types) if net_data.traffic_form_types else None,
        traffic_strip_form_type=net_data.traffic_strip_form_type,
        traffic_strip_template=net_data.traffic_strip_template,
        mobile_priority_sort=net_data.mobile_priority_sort if net_data.mobile_priority_sort is not None else True,
        chat_grace_period_minutes=net_data.chat_grace_period_minutes,
        self_checkin_enabled=net_data.self_checkin_enabled if net_data.self_checkin_enabled is not None else True,
        auto_lobby_minutes=net_data.auto_lobby_minutes,
        topic_of_week_enabled=net_data.topic_of_week_enabled or False,
        topic_of_week_prompt=net_data.topic_of_week_prompt,
        poll_enabled=net_data.poll_enabled or False,
        poll_question=net_data.poll_question,
        scheduled_start_time=net_data.scheduled_start_time,
    )
    db.add(net)
    await db.flush()
    
    # Add frequencies using the association table directly to avoid lazy loading
    if net_data.frequency_ids:
        # Verify frequencies exist
        result = await db.execute(
            select(Frequency).where(Frequency.id.in_(net_data.frequency_ids))
        )
        frequencies = result.scalars().all()
        
        # Insert into association table directly
        for freq in frequencies:
            await db.execute(
                net_frequencies.insert().values(net_id=net.id, frequency_id=freq.id)
            )
    
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    # Auto-select single frequency as active
    if net.frequencies and len(net.frequencies) == 1:
        net.active_frequency_id = net.frequencies[0].id
        await db.commit()
    
    return NetResponse.from_orm(net)


@router.get("/", response_model=List[NetResponse])
async def list_nets(
    status: Optional[List[NetStatus]] = Query(None),
    include_archived: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """List nets with optional status filter (repeatable, e.g. ?status=archived&status=cancelled),
    excludes archived/cancelled by default (no auth required for guest access)"""
    query = select(Net).options(
        selectinload(Net.frequencies),
        selectinload(Net.owner),
        selectinload(Net.template)
    )

    if status:
        query = query.where(Net.status.in_(status))
    elif not include_archived:
        # Exclude archived and cancelled nets by default - both are terminal
        # "not on the active dashboard" states, findable instead via Archived Nets.
        query = query.where(Net.status.notin_([NetStatus.ARCHIVED, NetStatus.CANCELLED]))
    
    query = query.offset(skip).limit(limit).order_by(Net.created_at.desc())
    
    result = await db.execute(query)
    nets = result.scalars().all()
    
    # Get check-in counts for all nets in one query
    net_ids = [net.id for net in nets]
    if net_ids:
        count_result = await db.execute(
            select(CheckIn.net_id, func.count(CheckIn.id))
            .where(CheckIn.net_id.in_(net_ids))
            .group_by(CheckIn.net_id)
        )
        check_in_counts = dict(count_result.all())
    else:
        check_in_counts = {}
    
    # Get NCS roles for current user if authenticated
    user_ncs_net_ids = set()
    if current_user and net_ids:
        ncs_result = await db.execute(
            select(NetRole.net_id)
            .where(NetRole.net_id.in_(net_ids))
            .where(NetRole.user_id == current_user.id)
            .where(NetRole.role == "NCS")
        )
        user_ncs_net_ids = set(row[0] for row in ncs_result.fetchall())

    # For archived net requests, compute personal attendance flags
    user_attended_net_ids: set = set()
    compute_user_flags = current_user is not None and bool(status) and NetStatus.ARCHIVED in status and bool(net_ids)
    if compute_user_flags:
        user_callsigns = [current_user.callsign] if current_user.callsign else []
        if current_user.gmrs_callsign:
            user_callsigns.append(current_user.gmrs_callsign)
        try:
            additional = json.loads(current_user.callsigns) if current_user.callsigns else []
            user_callsigns.extend(additional)
        except Exception:
            pass
        if user_callsigns:
            attended_result = await db.execute(
                select(CheckIn.net_id).distinct()
                .where(CheckIn.net_id.in_(net_ids))
                .where(CheckIn.callsign.in_(user_callsigns))
            )
            user_attended_net_ids = set(row[0] for row in attended_result.fetchall())

    # ========== CURRENT NCS PER NET ==========
    # For each net, every *active* NCS, oldest assignment first. The Net
    # Manager is the net's owner; the NCS is whoever is actually running the
    # net on the air, tracked via NetRole(role='NCS'). They are often
    # different people (e.g. a club's net manager schedules nets for other
    # operators to run). We surface both on the cards so users can tell them
    # apart. Same all-of-them / is_active rules as get_net above -- see the
    # comment there for why a single most-recent row was wrong.
    ncs_by_net: dict = {}
    if net_ids:
        ncs_users_result = await db.execute(
            select(NetRole.net_id, User.callsign, User.name, NetRole.assigned_at)
            .join(User, User.id == NetRole.user_id)
            .where(NetRole.net_id.in_(net_ids))
            .where(NetRole.role == "NCS")
            .where(NetRole.is_active == True)  # noqa: E712
            .order_by(NetRole.assigned_at.asc())
        )
        accumulated: dict = {}
        for net_id_row, callsign, name, _assigned_at in ncs_users_result.fetchall():
            accumulated.setdefault(net_id_row, []).append((callsign, name))
        ncs_by_net = {
            nid: format_ncs_attribution(rows) for nid, rows in accumulated.items()
        }

    responses = []
    for net in nets:
        # Check if user can manage this net
        can_manage = False
        is_owner_or_ncs = False
        if current_user:
            is_owner = net.owner_id == current_user.id
            is_admin = current_user.role == UserRole.ADMIN
            is_ncs = net.id in user_ncs_net_ids
            is_owner_or_ncs = is_owner or is_ncs  # non-admin access; used by frontend simulation mode
            can_manage = is_owner_or_ncs or is_admin

        ncs_callsign, ncs_name = ncs_by_net.get(net.id, (None, None))
        user_attended = (net.id in user_attended_net_ids) if compute_user_flags else None
        user_ran = (net.owner_id == current_user.id) if compute_user_flags else None
        responses.append(NetResponse.from_orm(
            net,
            owner_callsign=net.owner.callsign if net.owner else None,
            owner_name=public_display_name(net.owner.name if net.owner else None, current_user is not None),
            check_in_count=check_in_counts.get(net.id, 0),
            can_manage=can_manage,
            is_owner_or_ncs=is_owner_or_ncs,
            ncs_callsign=ncs_callsign,
            ncs_name=public_display_name(ncs_name, current_user is not None),
            user_attended=user_attended,
            user_ran=user_ran,
            template_schedule_type=net.template.schedule_type if net.template else None,
        ))

    return responses


@router.get("/{net_id}", response_model=NetResponse)
async def get_net(
    net_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get net by ID"""
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.owner),
            selectinload(Net.template)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()

    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    # Compute can_manage for this user
    can_manage = False
    is_owner_or_ncs = False
    if current_user:
        is_owner = net.owner_id == current_user.id
        is_admin = current_user.role == UserRole.ADMIN
        # Check if user is NCS for this net
        ncs_result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.user_id == current_user.id,
                NetRole.role == "NCS"
            )
        )
        is_ncs = ncs_result.scalar_one_or_none() is not None
        # Active template staff can manage nets created from their template
        is_template_staff = False
        if not (is_owner or is_admin or is_ncs) and net.template_id:
            staff_result = await db.execute(
                select(TemplateStaff).where(
                    TemplateStaff.template_id == net.template_id,
                    TemplateStaff.user_id == current_user.id,
                    TemplateStaff.is_active == True,
                )
            )
            is_template_staff = staff_result.scalar_one_or_none() is not None
        is_owner_or_ncs = is_owner or is_ncs or is_template_staff  # non-admin access; used by frontend simulation mode
        can_manage = is_owner_or_ncs or is_admin

    # Would checking in right now auto-grant this user NCS? Drives the
    # NCS/Standard choice on the check-in prompt/dialog. Independent of
    # can_manage above -- an eligible co-manager/rotation member with no
    # NetRole here yet isn't a manager until they actually check in.
    current_user_ncs_eligible = False
    current_user_logger_eligible = False
    if current_user:
        current_user_ncs_eligible = await is_eligible_for_ncs_auto_grant(db, net, current_user.id)
        current_user_logger_eligible = await is_eligible_for_logger_self_grant(db, net, current_user.id)

    # ========== CURRENT NCS ==========
    # Every *active* NCS on this net, oldest assignment first, so the UI can
    # display the Net Manager (owner) and the NCS separately.
    #
    # All of them, not just one: a net legitimately can have several NCS at
    # once (net 15, "GYX SKYWARN / Emergency Communications Exercise", had 8
    # desks running simultaneously), and picking a single row misreported
    # those nets. It also actively misreported single-NCS rotation nets --
    # the rotation's scheduled pick is pre-assigned ~24h ahead by
    # _assign_duty_ncs, so ordering by assigned_at DESC meant *any* later
    # grant outranked the person actually running the net (net 79,
    # 2026-08-30: reported Peter, an erroneous 13:53 grant, instead of Cory,
    # the scheduled NCS assigned at 13:00).
    #
    # is_active is filtered because stepping down via the Acting as
    # NCS/Standard toggle (nets_roles.py::toggle_self_net_role) flips that
    # flag rather than deleting the row -- an operator who stepped down is
    # not the NCS any more.
    current_ncs_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id)
        .where(NetRole.role == "NCS")
        .where(NetRole.is_active == True)  # noqa: E712
        .order_by(NetRole.assigned_at.asc())
    )
    ncs_callsign, ncs_name = format_ncs_attribution(current_ncs_result.all())

    return NetResponse.from_orm(
        net,
        owner_callsign=net.owner.callsign if net.owner else None,
        owner_name=public_display_name(net.owner.name if net.owner else None, current_user is not None),
        can_manage=can_manage,
        is_owner_or_ncs=is_owner_or_ncs,
        current_user_ncs_eligible=current_user_ncs_eligible,
        current_user_logger_eligible=current_user_logger_eligible,
        ncs_callsign=ncs_callsign,
        ncs_name=public_display_name(ncs_name, current_user is not None),
        template_schedule_type=net.template.schedule_type if net.template else None,
    )


@router.get("/{net_id}/stats")
async def get_net_stats(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get net statistics including online users and check-in counts"""
    from app.main import manager
    from app.models import CheckIn
    
    # Verify net exists
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Get online user IDs (authenticated users only)
    online_user_ids = list(manager.get_online_users(net_id))
    
    # Get ALL check-ins (every row including re-checks)
    all_check_in_result = await db.execute(
        select(CheckIn).where(CheckIn.net_id == net_id)
    )
    all_check_ins = all_check_in_result.scalars().all()

    # Compute per-callsign stats
    # "latest" row per callsign = the row with the most recent checked_in_at
    latest_by_callsign: dict[str, CheckIn] = {}
    for ci in all_check_ins:
        callsign = ci.callsign
        if callsign not in latest_by_callsign or ci.checked_in_at > latest_by_callsign[callsign].checked_in_at:
            latest_by_callsign[callsign] = ci

    # unique_stations: callsigns whose latest row is NOT checked_out
    unique_stations = sum(
        1 for ci in latest_by_callsign.values()
        if not (ci.status and ci.status.value == 'checked_out')
    )
    # recheck_count: total rows with is_recheck=True
    recheck_count = sum(1 for ci in all_check_ins if ci.is_recheck)
    # checked_out_count: callsigns whose latest row IS checked_out
    checked_out_count = sum(
        1 for ci in latest_by_callsign.values()
        if ci.status and ci.status.value == 'checked_out'
    )
    # total_check_ins kept for backward compat (= total rows)
    total_check_ins = len(all_check_ins)
    
    # Count guest WebSocket viewers (unauthenticated connections)
    guest_count = manager.get_guest_count(net_id)
    
    return {
        "net_id": net_id,
        "online_user_ids": online_user_ids,
        "total_check_ins": total_check_ins,
        "unique_stations": unique_stations,
        "recheck_count": recheck_count,
        "checked_out_count": checked_out_count,
        "online_count": len(online_user_ids),
        "guest_count": guest_count
    }


@router.put("/{net_id}", response_model=NetResponse)
async def update_net(
    net_id: int,
    net_update: NetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update net details"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - owner, admin, or NCS can update
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        raise HTTPException(status_code=403, detail="Not authorized to update this net")
    
    # Update fields
    import json
    update_data = net_update.dict(exclude_unset=True, exclude={'frequency_ids'})
    for field, value in update_data.items():
        # Both of these travel the API as real JSON (dict / list of form_type
        # codes) but live in TEXT columns -- see schemas._parse_traffic_form_types
        # for the read side. An explicit empty list means "no restriction",
        # which is the same as null, so it's stored as null.
        if field in ('field_config', 'traffic_form_types') and value is not None:
            setattr(net, field, json.dumps(value) if value else None)
        else:
            setattr(net, field, value)
    
    # Update frequencies if provided
    if net_update.frequency_ids is not None:
        result = await db.execute(
            select(Frequency).where(Frequency.id.in_(net_update.frequency_ids))
        )
        frequencies = result.scalars().all()
        net.frequencies = frequencies

    # Record a topic set live by NCS into history right away, rather than
    # only at close -- see app/services/topic_history.py.
    if 'topic_of_week_prompt' in update_data or 'topic_of_week_enabled' in update_data:
        from app.services.topic_history import upsert_topic_history_from_net
        await upsert_topic_history_from_net(db, net)

    await db.commit()
    await db.refresh(net, ['frequencies'])

    return NetResponse.from_orm(net)


@router.post("/{net_id}/logo", response_model=NetResponse)
async def upload_net_logo(
    net_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload this net's logo image. Replaces any existing upload.
    Accepted: PNG, JPEG, WebP. Max 2 MB. Resized to 256x256 max."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        raise HTTPException(status_code=403, detail="Not authorized to update this net")

    if file.content_type not in NET_LOGO_ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPEG, or WebP.")

    file_bytes = await file.read()
    if len(file_bytes) > NET_LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 2 MB).")

    try:
        pil_image = Image.open(BytesIO(file_bytes))
        pil_image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image.") from exc

    pil_image = ImageOps.exif_transpose(pil_image)
    if pil_image.mode in {"RGBA", "LA", "P"}:
        pil_image = pil_image.convert("RGB")
    pil_image.thumbnail((NET_LOGO_MAX_DIM, NET_LOGO_MAX_DIM), Image.Resampling.LANCZOS)

    dest = NET_LOGO_DIR / f"net-{net.id}.jpg"
    pil_image.save(str(dest), format="JPEG", quality=90)

    net.logo_url = f"/api/net-logos/{dest.name}"
    await db.commit()
    await db.refresh(net, ['frequencies'])
    return NetResponse.from_orm(net)


@router.delete("/{net_id}/logo", response_model=NetResponse)
async def delete_net_logo(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove this net's uploaded logo."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        raise HTTPException(status_code=403, detail="Not authorized to update this net")

    dest = NET_LOGO_DIR / f"net-{net.id}.jpg"
    if dest.exists():
        dest.unlink()
    net.logo_url = None
    await db.commit()
    await db.refresh(net, ['frequencies'])
    return NetResponse.from_orm(net)


# ========== LINK / UNLINK NET TO A SCHEDULE (TEMPLATE) ==========
# Used when an NCS started an ad-hoc net (or a net under the wrong schedule)
# and later wants it counted against a recurring schedule's stats.
@router.put("/{net_id}/template", response_model=NetResponse)
async def link_net_to_template(
    net_id: int,
    link_data: NetTemplateLinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Attach a net to a schedule/template, or detach it (template_id=null).

    Permission rules:
    - Caller must be admin OR the net's owner (i.e. allowed to manage the net).
    - When attaching to a template, caller must also be admin OR the template's
      owner. This prevents arbitrary users from poisoning someone else's
      schedule statistics with unrelated nets.
    """
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    is_admin = current_user.role == UserRole.ADMIN
    if not (is_admin or net.owner_id == current_user.id):
        raise HTTPException(status_code=403, detail="Only the net owner or an admin can change this net's schedule")

    new_template_id = link_data.template_id

    if new_template_id is not None:
        template_result = await db.execute(
            select(NetTemplate).where(NetTemplate.id == new_template_id)
        )
        template = template_result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        if not (is_admin or template.owner_id == current_user.id):
            raise HTTPException(
                status_code=403,
                detail="Only the schedule owner or an admin can attach nets to this schedule",
            )

    net.template_id = new_template_id
    await db.commit()
    await db.refresh(net, ['frequencies'])

    return NetResponse.from_orm(net)


@router.post("/{net_id}/start", response_model=NetResponse)
async def start_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Start a net - enters LOBBY mode if before scheduled time, otherwise goes straight to ACTIVE.
    
    LOBBY mode allows check-ins and chat while showing a countdown to the official start time.
    Use the /go-live endpoint to transition from LOBBY to ACTIVE.
    """
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - owner, admin, NCS, or active template staff can start
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        # Also allow active template staff for nets created from their template
        if net.template_id:
            staff_result = await db.execute(
                select(TemplateStaff).where(
                    TemplateStaff.template_id == net.template_id,
                    TemplateStaff.user_id == current_user.id,
                    TemplateStaff.is_active == True,
                )
            )
            if not staff_result.scalar_one_or_none():
                raise HTTPException(status_code=403, detail="Not authorized to start this net")
        else:
            raise HTTPException(status_code=403, detail="Not authorized to start this net")
    
    if net.status == NetStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Net is already active")
    
    if net.status == NetStatus.LOBBY:
        raise HTTPException(status_code=400, detail="Net is already in lobby mode")
    
    # Determine if we should go to LOBBY or ACTIVE
    # Go to LOBBY if there's a scheduled_start_time in the future
    now = datetime.utcnow()
    go_to_lobby = False
    if net.scheduled_start_time:
        # Handle timezone-aware vs naive datetimes
        scheduled = net.scheduled_start_time
        if scheduled.tzinfo is not None:
            from datetime import timezone
            now = datetime.now(timezone.utc)
        if scheduled > now:
            go_to_lobby = True
    elif net.auto_lobby_minutes is not None:
        # Ad-hoc nets (and a one-time net with "open lobby now") have no
        # scheduled_start_time to count down from, so there's no offset to wait
        # for. "Enable lobby" here just means: don't skip straight to Active,
        # stage through Lobby first so Net Control clicks "Go Live" when ready.
        go_to_lobby = True

    if go_to_lobby:
        net.status = NetStatus.LOBBY
        # Don't set started_at yet - that's for when it goes ACTIVE
    else:
        net.status = NetStatus.ACTIVE
        net.started_at = datetime.utcnow()
    
    # Auto-select single frequency as active if not already set
    if not net.active_frequency_id and net.frequencies and len(net.frequencies) == 1:
        net.active_frequency_id = net.frequencies[0].id
    
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    # Assign NCS role to the user who starts the net (if not already assigned)
    existing_ncs = await db.execute(
        select(NetRole).where(
            NetRole.net_id == net_id,
            NetRole.user_id == current_user.id,
            NetRole.role == "NCS"
        )
    )
    if not existing_ncs.scalar_one_or_none():
        ncs_role = NetRole(net_id=net_id, user_id=current_user.id, role="NCS")
        db.add(ncs_role)
        await db.commit()
    
    # Auto-check-in the NCS
    from app.models import CheckIn, StationStatus
    ncs_check_in = CheckIn(
        net_id=net_id,
        user_id=current_user.id,
        callsign=display_callsign(current_user) or current_user.email.split('@')[0].upper(),
        name=current_user.name or '',
        location=current_user.location or '',
        status=StationStatus.CHECKED_IN,
        checked_in_by_id=current_user.id,
        is_recheck=False
    )
    db.add(ncs_check_in)
    await db.commit()
    
    # Post system message
    from app.main import post_system_message, manager
    if go_to_lobby:
        await post_system_message(net_id, f"Net lobby opened by {display_callsign(current_user)}. Official start at scheduled time.", db)
    else:
        await post_system_message(net_id, f"Net has been started by {display_callsign(current_user)}", db)
    
    # Broadcast event so all connected clients refresh
    await manager.broadcast({
        "type": "net_started" if not go_to_lobby else "net_lobby_opened",
        "data": {
            "net_id": net_id,
            "started_by": current_user.callsign or current_user.email,
            "status": net.status.value,
            "started_at": net.started_at.isoformat() if net.started_at else None,
            "scheduled_start_time": net.scheduled_start_time.isoformat() if net.scheduled_start_time else None
        }
    }, net_id)
    
    # Send the single "net starting" notification here, regardless of which branch
    # was taken above: a human opening the lobby is the first moment subscribers
    # should hear about the net (giving them lead time before the official start),
    # and straight-to-ACTIVE nets (ad hoc, or already past their scheduled time)
    # have no earlier moment to notify at. The send is idempotent, so the later
    # transitions that also call it are harmless - see app/net_start.py.
    await send_net_start_notifications(db, net)

    return NetResponse.from_orm(net)


@router.post("/{net_id}/go-live", response_model=NetResponse)
async def go_live(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Transition a net from LOBBY to ACTIVE mode.

    Normally sends no email: for a human-opened lobby the subscriber "net
    starting" notification already went out at lobby-open, which is the whole
    point of Milestone 0.7 (W1BKW) - subscribers get lead time instead of being
    told at go-live. The call below is a no-op in that case because the send is
    idempotent. It matters only for an automatically opened lobby, which stays
    silent until a human confirms the net is really happening.
    """
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - owner, admin, or NCS can go live
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        raise HTTPException(status_code=403, detail="Not authorized to start this net")
    
    if net.status != NetStatus.LOBBY:
        raise HTTPException(status_code=400, detail="Net must be in lobby mode to go live")
    
    net.status = NetStatus.ACTIVE
    net.started_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    # Post system message
    from app.main import post_system_message, manager
    await post_system_message(net_id, f"Net is now LIVE! Started by {display_callsign(current_user)}", db)
    
    # Broadcast net_started event
    await manager.broadcast({
        "type": "net_started",
        "data": {
            "net_id": net_id,
            "started_by": display_callsign(current_user),
            "status": "active",
            "started_at": net.started_at.isoformat() if net.started_at else None
        }
    }, net_id)

    # Idempotent: only actually sends for an auto-opened lobby that never
    # announced itself. See docstring above.
    await send_net_start_notifications(db, net)

    return NetResponse.from_orm(net)


@router.put("/{net_id}/active-frequency/{frequency_id}", response_model=NetResponse)
async def set_active_frequency(
    net_id: int,
    frequency_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set the active frequency for a net (NCS/Logger only)"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - NCS, Logger, or admin
    if not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Not authorized to change frequency")
    
    # Verify the frequency belongs to this net
    if frequency_id not in [f.id for f in net.frequencies]:
        raise HTTPException(status_code=400, detail="Frequency not associated with this net")
    
    net.active_frequency_id = frequency_id
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    # Post system message for frequency change
    from app.main import post_system_message
    active_freq = next((f for f in net.frequencies if f.id == frequency_id), None)
    if active_freq:
        freq_display = f"{active_freq.frequency} {active_freq.mode or ''}" if active_freq.frequency else f"{active_freq.network} TG{active_freq.talkgroup or ''}"
        await post_system_message(net_id, f"Active frequency changed to {freq_display.strip()}", db)
    
    return NetResponse.from_orm(net)


@router.delete("/{net_id}/active-frequency", response_model=NetResponse)
async def clear_active_frequency(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear the active frequency for a net (NCS/Logger only)"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - NCS, Logger, or admin
    if not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Not authorized to change frequency")
    
    net.active_frequency_id = None
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    return NetResponse.from_orm(net)


@router.post("/{net_id}/close", response_model=NetResponse)
async def close_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Close a net and send log to NCS"""
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins).selectinload(CheckIn.frequency)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Allow net closure by NCS, logger, or admin
    is_authorized = (
        net.owner_id == current_user.id or
        is_admin(current_user)
    )
    
    if not is_authorized:
        # Check if user is a logger for this net
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.user_id == current_user.id,
                NetRole.role.in_(["LOGGER", "NCS"])
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not authorized to close this net")
    
    if net.status == NetStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Net is already closed")
    
    # The close itself, the status broadcast, the system message and the
    # net-log email all live in services/net_closure.py so the CSV backfill
    # path can reuse them verbatim instead of growing a second copy.
    await close_net_and_notify(db, net, current_user)

    return NetResponse.from_orm(net)
