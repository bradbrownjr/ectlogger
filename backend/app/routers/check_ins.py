from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, UTC
import json
import logging
from app.database import get_db
from app.models import CheckIn, Net, NetStatus, User, UserRole, StationStatus, NetRole, Contact, Frequency
from app.schemas import CheckInCreate, CheckInUpdate, CheckInResponse
from app.dependencies import get_current_user, get_current_user_optional
from app.utils import display_callsign
from app.permissions import check_net_permission, is_eligible_for_ncs_auto_grant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/check-ins", tags=["check-ins"])


# ========== SHARED CONTACT / USER LOOKUP HELPERS ==========
# Used by both create_check_in and update_check_in so a station's shared
# Contact row stays in sync no matter which path recorded the location.

async def _find_user_by_callsign(db: AsyncSession, callsign: str) -> Optional[User]:
    """Find the registered user who owns a callsign (amateur, GMRS, or one of
    the extra callsigns stored in the User.callsigns JSON list)."""
    result = await db.execute(
        select(User).where(
            (User.callsign == callsign) |
            (User.gmrs_callsign == callsign) |
            (User.callsigns.like(f'%"{callsign}"%'))
        )
    )
    return result.scalar_one_or_none()


async def _sync_contact_location(
    db: AsyncSession,
    callsign: str,
    name: Optional[str],
    location: Optional[str],
    skywarn_number: Optional[str],
    matching_user: Optional[User],
) -> None:
    """Create or update the shared Contact row for a callsign.

    Contacts are the app-wide callsign history used for lookups across every
    net, so both a new check-in and an edit to an existing one keep them
    current. The one exception is a registered user with location_awareness
    enabled: their location comes from live browser geolocation, so a
    hand-typed location must not overwrite their tracked history.

    Best-effort by design — a Contact failure must never fail the check-in
    itself, so the exception is logged and the Contact changes rolled back.
    The caller is expected to have already committed the check-in.
    """
    if matching_user and matching_user.location_awareness:
        return

    try:
        contact_result = await db.execute(
            select(Contact).where(Contact.callsign == callsign)
        )
        contact = contact_result.scalar_one_or_none()

        if contact:
            # Update contact with latest info (only if new values are non-empty)
            if name and name != contact.name:
                contact.name = name
            if location and location != contact.location:
                contact.location = location
            if skywarn_number and skywarn_number != contact.skywarn_number:
                contact.skywarn_number = skywarn_number
        else:
            # Create new contact from check-in data
            contact = Contact(
                callsign=callsign,
                name=name or None,
                location=location or None,
                skywarn_number=skywarn_number or None,
            )
            db.add(contact)

        await db.commit()
    except Exception:
        # Contact sync is best-effort — don't fail the check-in
        logger.exception("Failed to sync Contact record for callsign %s", callsign)
        await db.rollback()


@router.post("/nets/{net_id}/check-ins", response_model=CheckInResponse, status_code=status.HTTP_201_CREATED)
async def create_check_in(
    net_id: int,
    check_in_data: CheckInCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a check-in for a net"""
    import json
    
    # Verify net exists and is active, load frequencies
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Allow check-ins in both LOBBY (pre-net staging) and ACTIVE (official net) states
    if net.status not in (NetStatus.ACTIVE, NetStatus.LOBBY):
        raise HTTPException(status_code=400, detail="Net is not active")

    # When self check-in is disabled for this net, only NCS/logger/owner/admin
    # may add check-ins — regular participants must be logged by voice/staff.
    if net.self_checkin_enabled is False and not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Self check-in is disabled for this net. Please check in with Net Control.")

    # Validate and process frequency_id
    # First check if current user is NCS with a claimed frequency
    if check_in_data.frequency_id is None:
        ncs_role_result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.user_id == current_user.id,
                NetRole.role == "NCS"
            )
        )
        ncs_role = ncs_role_result.scalar_one_or_none()
        if ncs_role and ncs_role.active_frequency_id:
            check_in_data.frequency_id = ncs_role.active_frequency_id
            # Also set available_frequency_ids if not provided
            if not check_in_data.available_frequency_ids:
                check_in_data.available_frequency_ids = [ncs_role.active_frequency_id]
        elif net.active_frequency_id:
            check_in_data.frequency_id = net.active_frequency_id
            if not check_in_data.available_frequency_ids:
                check_in_data.available_frequency_ids = [net.active_frequency_id]
        elif net.frequencies and len(net.frequencies) == 1:
            # Auto-assign single frequency if no other frequency is active
            check_in_data.frequency_id = net.frequencies[0].id
            if not check_in_data.available_frequency_ids:
                check_in_data.available_frequency_ids = [net.frequencies[0].id]
    
    # Validate available_frequency_ids against net's prescribed frequencies
    available_freq_ids = check_in_data.available_frequency_ids or []
    if available_freq_ids:
        net_freq_ids = {f.id for f in net.frequencies}
        invalid_freqs = [fid for fid in available_freq_ids if fid not in net_freq_ids]
        if invalid_freqs:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid frequency IDs: {invalid_freqs}. Must be from net's prescribed frequencies."
            )
    
    # Check if this is a recheck (user previously checked in to this net)
    # Find the root (original) check-in for this callsign to use as parent_check_in_id,
    # and the latest row to know whether the station is currently still checked in.
    result = await db.execute(
        select(CheckIn).where(
            CheckIn.net_id == net_id,
            CheckIn.callsign == check_in_data.callsign,
        ).order_by(CheckIn.checked_in_at.asc())
    )
    existing_check_ins = result.scalars().all()
    root_check_in = next((ci for ci in existing_check_ins if ci.parent_check_in_id is None), None)
    is_recheck = root_check_in is not None

    # A recheck is only meaningful once the station has checked out — that's
    # the only way to leave a "current" row that isn't CHECKED_OUT. If the
    # station's latest row is still active, this is a duplicate check-in
    # attempt (self or NCS/logger re-adding someone already logged in), not
    # a recheck, so reject it instead of creating a second live row.
    if existing_check_ins and existing_check_ins[-1].status != StationStatus.CHECKED_OUT:
        raise HTTPException(
            status_code=400,
            detail=f"{check_in_data.callsign} is already checked in"
        )
    
    # Try to automatically link to existing user by callsign (amateur or GMRS)
    matching_user = await _find_user_by_callsign(db, check_in_data.callsign)
    linked_user_id = matching_user.id if matching_user else None
    
    # Every check-in — whether first or re-check — creates a new row.
    # Re-checks link back to the root (original) check-in via parent_check_in_id.
    available_frequencies_json = json.dumps(available_freq_ids)
    custom_fields_json = json.dumps(check_in_data.custom_fields) if check_in_data.custom_fields else '{}'

    if is_recheck:
        # Track location change for system message
        location_changed = (
            root_check_in.location
            and check_in_data.location
            and root_check_in.location != check_in_data.location
        )
        new_location = check_in_data.location or root_check_in.location

        check_in = CheckIn(
            net_id=net_id,
            user_id=linked_user_id,
            callsign=check_in_data.callsign,
            name=check_in_data.name or root_check_in.name,
            location=check_in_data.location or root_check_in.location,
            skywarn_number=check_in_data.skywarn_number,
            weather_observation=check_in_data.weather_observation,
            power_source=check_in_data.power_source,
            feedback=check_in_data.feedback,
            notes=check_in_data.notes,
            relayed_by=check_in_data.relayed_by.upper() if check_in_data.relayed_by else None,
            topic_response=check_in_data.topic_response,
            poll_response=check_in_data.poll_response,
            custom_fields=custom_fields_json,
            frequency_id=check_in_data.frequency_id,
            available_frequencies=available_frequencies_json,
            is_recheck=True,
            parent_check_in_id=root_check_in.id,
            checked_in_by_id=current_user.id,
            status=check_in_data.status or StationStatus.CHECKED_IN,
        )
    else:
        location_changed = False
        new_location = check_in_data.location

        check_in = CheckIn(
            net_id=net_id,
            user_id=linked_user_id,
            callsign=check_in_data.callsign,
            name=check_in_data.name,
            location=check_in_data.location,
            skywarn_number=check_in_data.skywarn_number,
            weather_observation=check_in_data.weather_observation,
            power_source=check_in_data.power_source,
            feedback=check_in_data.feedback,
            notes=check_in_data.notes,
            relayed_by=check_in_data.relayed_by.upper() if check_in_data.relayed_by else None,
            topic_response=check_in_data.topic_response,
            poll_response=check_in_data.poll_response,
            custom_fields=custom_fields_json,
            frequency_id=check_in_data.frequency_id,
            available_frequencies=available_frequencies_json,
            is_recheck=False,
            parent_check_in_id=None,
            checked_in_by_id=current_user.id,
            status=check_in_data.status or StationStatus.CHECKED_IN,
        )
    db.add(check_in)
    
    await db.commit()
    await db.refresh(check_in)

    # Build enriched suffix: "— 147.345 MHz FM (logged by KC1JMH)"
    freq_label = ""
    if check_in.frequency_id:
        freq_result = await db.execute(select(Frequency).where(Frequency.id == check_in.frequency_id))
        freq_obj = freq_result.scalar_one_or_none()
        if freq_obj:
            freq_label = f"{freq_obj.frequency} {freq_obj.mode}".strip() if freq_obj.frequency else freq_obj.mode
    logger_cs = display_callsign(current_user)
    if freq_label and logger_cs:
        ci_suffix = f" — {freq_label} (logged by {logger_cs})"
    elif freq_label:
        ci_suffix = f" — {freq_label}"
    elif logger_cs:
        ci_suffix = f" (logged by {logger_cs})"
    else:
        ci_suffix = ""

    # Post system message for check-in activity
    from app.main import post_system_message, manager as ws_manager
    if is_recheck:
        if location_changed:
            await post_system_message(net_id, f"{check_in_data.callsign} has rechecked from {new_location}{ci_suffix}", db)
        else:
            await post_system_message(net_id, f"{check_in_data.callsign} has rechecked{ci_suffix}", db)
    else:
        if check_in_data.location:
            await post_system_message(net_id, f"{check_in_data.callsign} has checked in from {check_in_data.location}{ci_suffix}", db)
        else:
            await post_system_message(net_id, f"{check_in_data.callsign} has checked in{ci_suffix}", db)

    # Broadcast the new check-in via WebSocket so every connected client
    # refreshes its check-in table -- server-originated, unlike the old
    # design which had the checking-in operator's own browser relay a
    # 'check_in' message to everyone else after the REST call succeeded. That
    # meant a brief hiccup on the *checking-in* client's socket (exactly the
    # kind of blip the zombie-connection watchdog in useNetWebSocket.ts now
    # guards against) silently broke live sync for every OTHER viewer, while
    # the system chat message above kept arriving fine since it was already
    # server-broadcast -- reported in production as the activity log
    # bursting with new check-ins while the main table never moved. Update
    # and delete already broadcast this way (see status_change and
    # check_in_deleted below); this brings create in line with them.
    await ws_manager.broadcast({
        "type": "check_in",
        "data": {
            "id": check_in.id,
            "net_id": net_id,
            "callsign": check_in.callsign,
        },
        "timestamp": datetime.now(UTC).isoformat()
    }, net_id)


    # Post system messages for poll/topic responses (if newly added)
    if check_in_data.topic_response and net.topic_of_week_enabled:
        # Only post if this is a new response (not on recheck with same answer)
        old_topic = root_check_in.topic_response if root_check_in else None
        if check_in_data.topic_response != old_topic:
            await post_system_message(net_id, f"{check_in_data.callsign} shared: {check_in_data.topic_response}", db)
    
    if check_in_data.poll_response and net.poll_enabled:
        # Only post if this is a new response (not on recheck with same answer)
        old_poll = root_check_in.poll_response if root_check_in else None
        if check_in_data.poll_response != old_poll:
            await post_system_message(net_id, f"{check_in_data.callsign} answered the poll: {check_in_data.poll_response}", db)
    
    # Auto-create or update the shared Contact record for callsign history.
    # Skipped only for a registered user who tracks location via browser
    # geolocation — see _sync_contact_location.
    await _sync_contact_location(
        db,
        callsign=check_in.callsign,
        name=check_in.name,
        location=check_in.location,
        skywarn_number=check_in.skywarn_number,
        matching_user=matching_user,
    )

    # ========== NCS ARRIVAL IN AN AUTO-OPENED LOBBY ==========
    # An automatically opened lobby stays silent until a human confirms the net
    # is really happening, so subscribers aren't told a net started that nobody
    # ran. The NCS checking in is that confirmation. The send is idempotent, so
    # a second NCS arriving does not re-notify. See app/net_start.py.
    if net.lobby_opened_automatically and net.status == NetStatus.LOBBY and linked_user_id:
        ncs_arrival = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.user_id == linked_user_id,
                NetRole.role == "NCS",
            )
        )
        if ncs_arrival.scalar_one_or_none():
            from app.net_start import send_net_start_notifications
            await send_net_start_notifications(db, net)

    # ========== AUTO-GRANT NCS ACCESS FOR CO-MANAGERS / ROTATION MEMBERS ==========
    # A co-manager or active NCS-rotation member should have the same net-level
    # privileges as the scheduled/on-duty NCS the moment they check themselves
    # in, so they can pick up the net if the assigned NCS is unavailable,
    # without a separate "claim" step. They can step back down to Standard at
    # any time via the existing Acting as NCS/Standard toggle
    # (toggle_self_net_role in nets_roles.py), which flips is_active rather
    # than deleting the row -- or decline it up front via check_in_as_standard
    # (the NCS/Standard choice on the check-in dialog, offered when
    # is_eligible_for_ncs_auto_grant is true for the current user).
    #
    # Restricted to self-check-in (current_user.id == linked_user_id): a
    # staff-entered check-in (radio traffic logged by NCS/Logger on someone
    # else's behalf) is never the eligible person's own choice, so it's always
    # treated as Standard -- they can promote themselves afterward if needed.
    #
    # Scoped to template-based nets only -- ad hoc nets have no co-manager or
    # rotation concept. Deliberately placed after the auto-opened-lobby check
    # above, using state from before this grant, so a co-manager's own check-in
    # doesn't itself count as "the NCS arrived" confirmation to subscribers --
    # only an already-assigned NCS does.
    if (
        linked_user_id
        and current_user.id == linked_user_id
        and not check_in_data.check_in_as_standard
    ):
        is_eligible = await is_eligible_for_ncs_auto_grant(db, net, linked_user_id)
        if is_eligible:
            db.add(NetRole(net_id=net_id, user_id=linked_user_id, role="NCS"))
            await db.commit()

            from app.main import manager as ws_manager, post_system_message
            await ws_manager.broadcast({
                "type": "role_change",
                "data": {
                    "net_id": net_id,
                    "user_id": linked_user_id,
                    "role": "NCS",
                    "removed": False,
                    "assigned_at": datetime.now(UTC).isoformat()
                },
                "timestamp": datetime.now(UTC).isoformat()
            }, net_id)
            await post_system_message(net_id, f"{display_callsign(matching_user)} has been granted NCS access (schedule co-manager/rotation)", db)

    # Re-fetch with user relationship loaded (needed for avatar_url in response)
    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in.id)
    )
    return CheckInResponse.from_orm(result.scalar_one())


@router.get("/nets/{net_id}/check-ins", response_model=List[CheckInResponse])
async def list_check_ins(
    net_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all check-ins for a net. Guests (no current_user) get free-text
    fields scrubbed of anything that looks like an email or phone number --
    see redact_contact_info."""
    result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.user))
        .where(CheckIn.net_id == net_id)
        .order_by(CheckIn.checked_in_at)
    )
    check_ins = result.scalars().all()

    redact = current_user is None
    return [CheckInResponse.from_orm(ci, redact=redact) for ci in check_ins]


@router.get("/check-ins/{check_in_id}", response_model=CheckInResponse)
async def get_check_in(
    check_in_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific check-in"""
    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()

    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")

    return CheckInResponse.from_orm(check_in, redact=current_user is None)


@router.put("/check-ins/{check_in_id}", response_model=CheckInResponse)
async def update_check_in(
    check_in_id: int,
    check_in_update: CheckInUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a check-in"""
    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Store old values for comparison
    old_topic_response = check_in.topic_response
    old_poll_response = check_in.poll_response
    
    # Get the net to check if poll/topic is enabled
    result = await db.execute(select(Net).where(Net.id == check_in.net_id))
    net = result.scalar_one_or_none()

    # Permission check: the check-in's own user may edit it (self check-out,
    # own topic/poll response), otherwise NCS/Logger/owner/admin only. This
    # endpoint had no permission check at all until this fix — any
    # authenticated user could edit any other station's check-in.
    is_own_check_in = check_in.user_id == current_user.id
    if not is_own_check_in and net and not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this check-in")

    # Update fields
    update_data = check_in_update.dict(exclude_unset=True)
    
    # Handle available_frequency_ids separately (needs JSON serialization)
    if 'available_frequency_ids' in update_data:
        check_in.available_frequencies = json.dumps(update_data.pop('available_frequency_ids'))
    
    # Handle custom_fields separately (needs JSON serialization)
    if 'custom_fields' in update_data:
        existing_custom = json.loads(check_in.custom_fields) if check_in.custom_fields else {}
        existing_custom.update(update_data.pop('custom_fields') or {})
        check_in.custom_fields = json.dumps(existing_custom)
    
    # Update remaining fields
    for field, value in update_data.items():
        setattr(check_in, field, value)
    
    # When checking out, mark ALL rows for this callsign in this net as checked out
    if check_in_update.status == StationStatus.CHECKED_OUT:
        checkout_time = check_in.checked_out_at or datetime.now(UTC)
        sibling_result = await db.execute(
            select(CheckIn).where(
                CheckIn.net_id == check_in.net_id,
                CheckIn.callsign == check_in.callsign,
                CheckIn.id != check_in.id,
            )
        )
        siblings = sibling_result.scalars().all()
        for sibling in siblings:
            sibling.status = StationStatus.CHECKED_OUT
            sibling.checked_out_at = checkout_time
    
    await db.commit()
    # Re-fetch with user relationship loaded (needed for avatar_url in response)
    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in.id)
    )
    check_in = result.scalar_one()

    # Keep the shared Contact record in sync when the location is edited here
    # (e.g. NCS correcting a station's location inline). Without this, a
    # correction only ever lived on this one check-in row and the station's
    # app-wide history kept the stale value.
    if 'location' in update_data:
        matching_user = await _find_user_by_callsign(db, check_in.callsign)
        await _sync_contact_location(
            db,
            callsign=check_in.callsign,
            name=check_in.name,
            location=check_in.location,
            skywarn_number=check_in.skywarn_number,
            matching_user=matching_user,
        )

    # Post system message for status changes
    from app.main import post_system_message
    if 'status' in check_in_update.dict(exclude_unset=True):
        status_text = check_in.status.replace('_', ' ').lower() if check_in.status else 'updated'
        await post_system_message(check_in.net_id, f"{check_in.callsign} is now {status_text}", db)
    
    # Post system messages for poll/topic responses (if newly added or changed)
    if net and net.topic_of_week_enabled and check_in.topic_response:
        if check_in.topic_response != old_topic_response:
            await post_system_message(check_in.net_id, f"{check_in.callsign} shared: {check_in.topic_response}", db)
    
    if net and net.poll_enabled and check_in.poll_response:
        if check_in.poll_response != old_poll_response:
            await post_system_message(check_in.net_id, f"{check_in.callsign} answered the poll: {check_in.poll_response}", db)
    
    # Broadcast status change via WebSocket
    from app.main import manager
    await manager.broadcast({
        "type": "status_change",
        "data": {
            "id": check_in.id,
            "net_id": check_in.net_id,
            "user_id": check_in.user_id,
            "status": check_in.status,
            "callsign": check_in.callsign,
            "updated_at": check_in.updated_at.isoformat() if hasattr(check_in.updated_at, 'isoformat') else str(check_in.updated_at)
        },
        "timestamp": datetime.now(UTC).isoformat()
    }, check_in.net_id)

    if 'status' in check_in_update.dict(exclude_unset=True):
        from app.net_pause import sync_net_pause_state
        await sync_net_pause_state(db, check_in.net_id)

    return CheckInResponse.from_orm(check_in)


@router.delete("/check-ins/{check_in_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_check_in(
    check_in_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a check-in"""
    result = await db.execute(
        select(CheckIn).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Check permissions: owner, admin, or NCS/Logger role on this net
    result = await db.execute(select(Net).where(Net.id == check_in.net_id))
    net = result.scalar_one_or_none()

    if not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Store net_id before deletion for broadcast
    net_id = check_in.net_id
    check_in_id = check_in.id
    
    await db.delete(check_in)
    await db.commit()
    
    # Broadcast deletion via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "check_in_deleted",
        "data": {
            "id": check_in_id,
            "net_id": net_id
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)

    from app.net_pause import sync_net_pause_state
    await sync_net_pause_state(db, net_id)

    return None


@router.post("/check-ins/{check_in_id}/toggle-hand", response_model=CheckInResponse)
async def toggle_hand_raised(
    check_in_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Toggle hand_raised status for a check-in.
    
    Permissions:
    - User can raise their own hand
    - Admin/owner/NCS/logger can raise/lower any participant's hand
    """
    result = await db.execute(
        select(CheckIn).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Get the net to check user permissions and determine roles
    result = await db.execute(select(Net).where(Net.id == check_in.net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check if user is authorized to toggle the hand
    is_owner = net.owner_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    is_own_check_in = check_in.user_id == current_user.id
    
    # Check if user is NCS or logger for this net
    is_ncs_or_logger = False
    if not (is_owner or is_admin):
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == check_in.net_id,
                NetRole.user_id == current_user.id,
                NetRole.role.in_(["NCS", "LOGGER"])
            )
        )
        is_ncs_or_logger = result.scalar_one_or_none() is not None
    
    # Permission check: allow if user is own, or is owner/admin/NCS/logger
    if not (is_own_check_in or is_owner or is_admin or is_ncs_or_logger):
        raise HTTPException(status_code=403, detail="Not authorized to toggle hand")
    
    # Toggle the hand_raised state
    check_in.hand_raised = not check_in.hand_raised
    await db.commit()
    # Re-fetch with user relationship loaded (needed for avatar_url in response)
    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in.id)
    )
    check_in = result.scalar_one()
    
    # Broadcast hand state change via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "hand_raised_changed",
        "data": {
            "id": check_in.id,
            "net_id": check_in.net_id,
            "callsign": check_in.callsign,
            "hand_raised": check_in.hand_raised,
            "updated_at": check_in.updated_at.isoformat() if hasattr(check_in.updated_at, 'isoformat') else str(check_in.updated_at)
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, check_in.net_id)
    
    return CheckInResponse.from_orm(check_in)
