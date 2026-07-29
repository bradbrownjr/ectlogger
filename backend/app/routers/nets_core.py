import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.email_service import EmailService
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
from app.permissions import check_net_permission, is_admin
from app.schemas import (
    NetCreate,
    NetResponse,
    NetTemplateLinkRequest,
    NetUpdate,
    public_display_name,
)
from app.utils import display_callsign, format_time_for_net

router = APIRouter()


async def _send_net_start_notifications(db: AsyncSession, net: Net) -> None:
    """Email the net owner and template subscribers that the net is starting.

    Business rule (Milestone 0.7, W1BKW): exactly one "net starting" email is sent
    per net, at whichever transition first makes the net visible to check in -
    either LOBBY open (nets with a future scheduled_start_time) or ACTIVE (nets
    that skip the lobby because they're ad hoc or already past their scheduled
    time). Callers must ensure this is invoked from exactly one call site per
    net's lifecycle - see the LOBBY and ACTIVE branches in start_net(). go_live()
    must NOT call this; doing so would double-send for any net that used a lobby.
    """
    try:
        emails_to_notify = []
        unsubscribe_tokens = {}  # Map email -> unsubscribe_token

        # Add net owner (if they have notifications enabled)
        result = await db.execute(select(User).where(User.id == net.owner_id))
        owner = result.scalar_one_or_none()
        if owner and owner.email and owner.email_notifications and owner.notify_net_start:
            emails_to_notify.append(owner.email)
            if owner.unsubscribe_token:
                unsubscribe_tokens[owner.email] = owner.unsubscribe_token

        # If net was created from template, add all subscribers who want start notifications
        if net.template_id:
            from app.models import NetTemplateSubscription
            result = await db.execute(
                select(User)
                .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
                .where(NetTemplateSubscription.template_id == net.template_id)
                .where(User.email_notifications == True)
                .where(User.notify_net_start == True)
            )
            subscribers = result.scalars().all()
            for subscriber in subscribers:
                if subscriber.email and subscriber.email not in emails_to_notify:
                    emails_to_notify.append(subscriber.email)
                    if subscriber.unsubscribe_token:
                        unsubscribe_tokens[subscriber.email] = subscriber.unsubscribe_token

        # Send notifications
        if emails_to_notify:
            await EmailService.send_net_notification(emails_to_notify, net.name, net.id, unsubscribe_tokens)
    except Exception as e:
        print(f"Failed to send net start notification: {e}")


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
        mobile_priority_sort=net_data.mobile_priority_sort if net_data.mobile_priority_sort is not None else True,
        chat_grace_period_minutes=net_data.chat_grace_period_minutes,
        self_checkin_enabled=net_data.self_checkin_enabled if net_data.self_checkin_enabled is not None else True,
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
    status: NetStatus = None,
    include_archived: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """List nets with optional status filter, excludes archived by default (no auth required for guest access)"""
    query = select(Net).options(
        selectinload(Net.frequencies),
        selectinload(Net.owner)
    )
    
    if status:
        query = query.where(Net.status == status)
    elif not include_archived:
        # Exclude archived nets by default
        query = query.where(Net.status != NetStatus.ARCHIVED)
    
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
    compute_user_flags = current_user is not None and status == NetStatus.ARCHIVED and bool(net_ids)
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
    # For each net, find the most recently-assigned NCS user. The Net Manager
    # is the net's owner; the NCS is whoever is actually running the net on
    # the air, tracked via NetRole(role='NCS'). They are often different
    # people (e.g. a club's net manager schedules nets for other operators
    # to run). We surface both on the cards so users can tell them apart.
    ncs_by_net: dict = {}
    if net_ids:
        ncs_users_result = await db.execute(
            select(NetRole.net_id, User.callsign, User.name, NetRole.assigned_at)
            .join(User, User.id == NetRole.user_id)
            .where(NetRole.net_id.in_(net_ids))
            .where(NetRole.role == "NCS")
            .order_by(NetRole.assigned_at.desc())
        )
        for net_id_row, callsign, name, _assigned_at in ncs_users_result.fetchall():
            # First row per net wins (descending assigned_at => most recent)
            if net_id_row not in ncs_by_net:
                ncs_by_net[net_id_row] = (callsign, name)

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
            selectinload(Net.owner)
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

    # ========== CURRENT NCS ==========
    # Look up the most-recently-assigned NCS user for this net so the UI
    # can display the Net Manager (owner) and NCS as separate entities.
    current_ncs_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id)
        .where(NetRole.role == "NCS")
        .order_by(NetRole.assigned_at.desc())
        .limit(1)
    )
    current_ncs_row = current_ncs_result.first()
    ncs_callsign = current_ncs_row[0] if current_ncs_row else None
    ncs_name = current_ncs_row[1] if current_ncs_row else None

    return NetResponse.from_orm(
        net,
        owner_callsign=net.owner.callsign if net.owner else None,
        owner_name=public_display_name(net.owner.name if net.owner else None, current_user is not None),
        can_manage=can_manage,
        is_owner_or_ncs=is_owner_or_ncs,
        ncs_callsign=ncs_callsign,
        ncs_name=public_display_name(ncs_name, current_user is not None),
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
        if field == 'field_config' and value is not None:
            setattr(net, field, json.dumps(value))
        else:
            setattr(net, field, value)
    
    # Update frequencies if provided
    if net_update.frequency_ids is not None:
        result = await db.execute(
            select(Frequency).where(Frequency.id.in_(net_update.frequency_ids))
        )
        frequencies = result.scalars().all()
        net.frequencies = frequencies
    
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
    # was taken above: LOBBY open is the first moment subscribers should hear about
    # the net (giving them lead time before the official start), and straight-to-
    # ACTIVE nets (ad hoc, or already past their scheduled time) have no earlier
    # moment to notify at. go_live() (LOBBY -> ACTIVE) intentionally sends nothing -
    # see _send_net_start_notifications() docstring.
    await _send_net_start_notifications(db, net)

    return NetResponse.from_orm(net)


@router.post("/{net_id}/go-live", response_model=NetResponse)
async def go_live(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Transition a net from LOBBY to ACTIVE mode.

    Sends NO email. The subscriber "net starting" notification already went out
    when the lobby opened (see start_net() / _send_net_start_notifications()) -
    that is the whole point of Milestone 0.7 (W1BKW): subscribers get lead time
    at lobby-open instead of at go-live. Do not add a send here; that would
    double-notify every net that used a lobby.
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

    # No email send here by design - see docstring above.

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
    
    net.status = NetStatus.CLOSED
    net.closed_at = datetime.utcnow()

    # Finalize an in-progress pause (net closed while NCS was away) so
    # total_paused_seconds reflects the full paused window.
    if net.paused_at:
        from datetime import timezone as _timezone
        closed_at_aware = net.closed_at.replace(tzinfo=_timezone.utc) if net.closed_at.tzinfo is None else net.closed_at
        paused_at_aware = net.paused_at.replace(tzinfo=_timezone.utc) if net.paused_at.tzinfo is None else net.paused_at
        net.total_paused_seconds = (net.total_paused_seconds or 0) + int((closed_at_aware - paused_at_aware).total_seconds())
        net.paused_at = None

    # If started_at was never set (net closed from LOBBY without going ACTIVE),
    # backfill it from scheduled_start_time so duration stats are accurate.
    if not net.started_at:
        if net.scheduled_start_time:
            net.started_at = net.scheduled_start_time
        elif net.check_ins:
            times = [c.checked_in_at for c in net.check_ins if c.checked_in_at]
            if times:
                net.started_at = min(times)
    
    # Log topic to history if topic was used and template is set
    if net.topic_of_week_enabled and net.topic_of_week_prompt and net.template_id:
        from app.models import TopicHistory
        topic_entry = TopicHistory(
            template_id=net.template_id,
            topic=net.topic_of_week_prompt,
            used_date=datetime.utcnow(),
            net_id=net.id
        )
        db.add(topic_entry)
    
    await db.commit()
    
    # Broadcast net status change so all clients update immediately
    from app.main import post_system_message, manager
    await manager.broadcast({
        "type": "net_status_change",
        "data": {
            "net_id": net_id,
            "status": "closed",
            "closed_at": net.closed_at.isoformat() if net.closed_at else None
        }
    }, net_id)
    
    # Post system message for net close
    await post_system_message(net_id, f"Net has been closed by {display_callsign(current_user)}", db)
    
    # Get owner/NCS information
    result = await db.execute(
        select(User).where(User.id == net.owner_id)
    )
    owner = result.scalar_one_or_none()
    
    # Build frequency lookup map
    freq_map = {f.id: f for f in net.frequencies}
    
    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""
    
    # Prepare check-ins data for email
    check_ins_data = []
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        # Get available frequencies list
        available_freqs = []
        if check_in.available_frequencies:
            try:
                freq_ids = json.loads(check_in.available_frequencies)
                for fid in freq_ids:
                    if fid in freq_map:
                        available_freqs.append(format_freq(freq_map[fid]))
            except (json.JSONDecodeError, TypeError):
                pass
        
        check_ins_data.append({
            'time': format_time_for_net(check_in.checked_in_at, net.started_at, net.closed_at),
            'callsign': check_in.callsign,
            'name': check_in.name,
            'location': check_in.location,
            'frequencies': ', '.join(available_freqs) if available_freqs else '',
            'skywarn_number': check_in.skywarn_number or '',
            'weather_observation': check_in.weather_observation or '',
            'power_source': check_in.power_source or '',
            'power': check_in.power or '',
            'feedback': check_in.feedback or '',
            'notes': check_in.notes or '',
            'topic_response': check_in.topic_response or '',
            'poll_response': check_in.poll_response or '',
            'status': check_in.status.value if check_in.status else ''
        })
    
    # Get chat messages
    from app.models import ChatMessage
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    chat_messages_data = []
    for msg in result.scalars().all():
        chat_messages_data.append({
            'timestamp': format_time_for_net(msg.created_at, net.started_at, net.closed_at),
            'callsign': msg.user.callsign if msg.user and msg.user.callsign else ('System' if msg.is_system else 'Unknown'),
            'message': msg.message
        })
    
    # Build list of email recipients (owner + subscribers who want close notifications)
    # Store as list of (email, user) tuples to check preferences
    recipients_to_notify = []
    
    # Add owner if they have notifications enabled
    if owner and owner.email and owner.email_notifications and owner.notify_net_close:
        recipients_to_notify.append((owner.email, owner))
    
    # Add subscribers who want close notifications
    if net.template_id:
        from app.models import NetTemplateSubscription
        result = await db.execute(
            select(User)
            .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
            .where(NetTemplateSubscription.template_id == net.template_id)
            .where(User.email_notifications == True)
            .where(User.notify_net_close == True)
        )
        subscribers = result.scalars().all()
        existing_emails = {r[0] for r in recipients_to_notify}
        for subscriber in subscribers:
            if subscriber.email and subscriber.email not in existing_emails:
                recipients_to_notify.append((subscriber.email, subscriber))
    
    # Format frequencies for ICS-309
    freq_strings = []
    for freq in net.frequencies:
        if freq.frequency:
            freq_strings.append(f"{freq.frequency} {freq.mode or ''}".strip())
        elif freq.network:
            freq_strings.append(f"{freq.network} TG{freq.talkgroup or ''}")
    
    # Send log email to all recipients based on their preference
    # Use the most recently assigned NCS role; fall back to owner if none is recorded.
    ncs_role_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id, NetRole.role == "NCS")
        .order_by(NetRole.assigned_at.desc())
        .limit(1)
    )
    ncs_role_row = ncs_role_result.first()
    ncs_callsign = ncs_role_row[0] if ncs_role_row else (display_callsign(owner) if owner else "Unknown")
    ncs_name = ncs_role_row[1] if ncs_role_row else (owner.name or display_callsign(owner) if owner else "Unknown")
    
    for email, recipient in recipients_to_notify:
        try:
            email_service = EmailService()
            
            # Use ICS-309 if net has it enabled OR user prefers it
            use_ics309 = net.ics309_enabled or getattr(recipient, 'notify_ics309', False)
            
            # Get unsubscribe token for compliance
            unsub_token = getattr(recipient, 'unsubscribe_token', None)
            
            if use_ics309:
                await email_service.send_ics309_log(
                    email=email,
                    net_name=net.name,
                    net_description=net.description or "",
                    ncs_name=ncs_name,
                    ncs_callsign=ncs_callsign,
                    check_ins=check_ins_data,
                    started_at=net.started_at.strftime("%Y-%m-%d %H:%M:%S") if net.started_at else "N/A",
                    closed_at=net.closed_at.strftime("%Y-%m-%d %H:%M:%S") if net.closed_at else "N/A",
                    chat_messages=chat_messages_data if chat_messages_data else None,
                    frequencies=freq_strings,
                    unsubscribe_token=unsub_token
                )
            else:
                await email_service.send_net_log(
                    email=email,
                    net_name=net.name,
                    net_description=net.description or "",
                    ncs_name=ncs_name,
                    check_ins=check_ins_data,
                    started_at=net.started_at.strftime("%Y-%m-%d %H:%M:%S") if net.started_at else "N/A",
                    closed_at=net.closed_at.strftime("%Y-%m-%d %H:%M:%S") if net.closed_at else "N/A",
                    chat_messages=chat_messages_data if chat_messages_data else None,
                    field_config=json.loads(net.field_config) if isinstance(net.field_config, str) else net.field_config,
                    topic_of_week_enabled=net.topic_of_week_enabled,
                    topic_of_week_prompt=net.topic_of_week_prompt,
                    poll_enabled=net.poll_enabled,
                    poll_question=net.poll_question,
                    unsubscribe_token=unsub_token
                )
        except Exception as e:
            # Log error with traceback but don't fail the close operation
            import traceback
            print(f"Failed to send net log email to {email}: {e}\n{traceback.format_exc()}")
    
    return NetResponse.from_orm(net)

