from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, UTC
import json
import logging
from app.database import get_db
from app.services.callsign_people import find_user_by_callsign, follow_callsign_correction
from app.audit import record_net_event
from app.models import CheckIn, CoverageSite, FieldDefinition, Net, NetStatus, User, UserRole, StationStatus, NetRole, Contact, Frequency
from app.schemas import CheckInCreate, CheckInUpdate, CheckInResponse, ExpectedCodeResponse, VerifyIdentityRequest
from app.dependencies import get_current_user, get_current_user_optional
from app.utils import display_callsign, looks_like_email_or_url
from app.permissions import check_net_permission, is_eligible_for_logger_self_grant, is_eligible_for_ncs_auto_grant
from app.auth import decrypt_mfa_secret, current_totp_codes
from app.services.live_location import live_location_for_check_in
from app.services.net_blocks import blocked_on_net
from app.services.station_place import TRAVELING, is_home_position, keeps_saved_location, place_key, place_label

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/check-ins", tags=["check-ins"])


# ========== SPAM GUARD ==========
# Built-in check-in fields the guard can apply to -- matches BUILTIN_FIELDS
# in routers/settings.py. Custom fields are looked up by name directly.
_SPAM_GUARDABLE_BUILTIN_FIELDS = (
    'name', 'location', 'skywarn_number', 'weather_observation',
    'power_source', 'power', 'feedback', 'notes', 'relayed_by',
)


async def _enforce_spam_guard(db: AsyncSession, field_values: dict) -> None:
    """Rejects a submitted check-in field value that looks like a URL or
    email address, for whichever fields an admin has spam_guard_enabled on
    (Admin > Check-in Fields). `field_values` maps field name (built-in or
    custom) to its submitted value for this request only -- an unset field
    is simply absent, not None, so a partial update never re-checks values
    it didn't touch.

    This is enforced here, not only as the frontend's inline nudge
    (CheckInFormDialog.tsx), because a soft client-side warning does not
    stop a deliberate spammer -- nothing prevents a raw API call that skips
    the UI entirely. See app/utils.py::looks_like_email_or_url."""
    candidates = {k: v for k, v in field_values.items() if isinstance(v, str) and v}
    if not candidates:
        return
    result = await db.execute(
        select(FieldDefinition.name, FieldDefinition.label).where(
            FieldDefinition.spam_guard_enabled == True,  # noqa: E712
            FieldDefinition.name.in_(candidates.keys()),
        )
    )
    for name, label in result.all():
        if looks_like_email_or_url(candidates[name]):
            raise HTTPException(status_code=400, detail=f"{label} can't contain a link or email address")


# ========== SHARED CONTACT / USER LOOKUP HELPERS ==========
# Used by both create_check_in and update_check_in so a station's shared
# Contact row stays in sync no matter which path recorded the location.

async def _find_user_by_callsign(db: AsyncSession, callsign: str) -> Optional[User]:
    """The registered user who owns a callsign, extra and GMRS callsigns
    included (services/callsign_people.py::find_user_by_callsign). Schedule
    entries and credit roles match primary callsigns only
    (find_account_by_primary_callsign)."""
    return await find_user_by_callsign(db, callsign)


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


async def coverage_site_for_net(db: AsyncSession, net_id: int, site_id: int, user: User) -> CoverageSite:
    """The coverage site, or a 400 when it isn't one of this net's, or when
    it's a site only net staff can see (one the net doesn't support and
    nobody is at yet) and the user isn't net staff. Placing a station at a
    site puts that site in use, so staff decide which of an EMA's list
    becomes visible."""
    from app.routers.coverage_sites import checked_in_site_ids, may_see_every_site
    from app.services.site_coverage import coverage_site_in_use
    site = (await db.execute(
        select(CoverageSite).where(CoverageSite.id == site_id, CoverageSite.net_id == net_id)
    )).scalar_one_or_none()
    if site is None or site.site_type == 'infrastructure':
        raise HTTPException(status_code=400, detail="That site isn't one of this net's sites")
    if not coverage_site_in_use(site, await checked_in_site_ids(db, net_id)):
        net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
        if not await may_see_every_site(db, net, user):
            raise HTTPException(status_code=400, detail="That site isn't one of this net's sites")
    return site


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

    await _enforce_spam_guard(db, {
        'name': check_in_data.name,
        'location': check_in_data.location,
        'skywarn_number': check_in_data.skywarn_number,
        'weather_observation': check_in_data.weather_observation,
        'power_source': check_in_data.power_source,
        'power': check_in_data.power,
        'feedback': check_in_data.feedback,
        'notes': check_in_data.notes,
        'relayed_by': check_in_data.relayed_by,
        **(check_in_data.custom_fields or {}),
    })

    # Try to automatically link to existing user by callsign (amateur or GMRS).
    # Computed early (used below by the self-checkin-disabled gate, then again
    # by the recheck/creation logic and the self-grant block further down).
    matching_user = await _find_user_by_callsign(db, check_in_data.callsign)
    linked_user_id = matching_user.id if matching_user else None

    # When self check-in is disabled for this net, only NCS/logger/owner/admin
    # may add check-ins — regular participants must be logged by voice/staff.
    # Exception: a self-check-in explicitly requesting NCS or LOGGER
    # (self_role_choice) from someone actually eligible for that self-grant
    # (owner/co-manager/rotation member -- the same eligibility functions the
    # grant below uses) is let through despite holding no NetRole yet.
    # Otherwise the grant below can never be reached: the very check-in that
    # would trigger it is rejected by this same gate first, and an eligible
    # person with no role yet has no self-service way to get one -- someone
    # who already holds NCS/Logger has to grant it for them by hand. This is
    # exactly what happened on net 88 (2026-09-09): W1WNS was an eligible
    # co-manager, but self-check-in as Logger kept 403ing until AA1GM
    # manually assigned the NetRole.
    if net.self_checkin_enabled is False and not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        self_grant_requested = (
            linked_user_id == current_user.id
            and check_in_data.self_role_choice in ("ncs", "logger")
        )
        self_grant_eligible = self_grant_requested and (
            await is_eligible_for_ncs_auto_grant(db, net, current_user.id)
            if check_in_data.self_role_choice == "ncs"
            else await is_eligible_for_logger_self_grant(db, net, current_user.id)
        )
        if not self_grant_eligible:
            raise HTTPException(status_code=403, detail="Self check-in is disabled for this net. Please check in with Net Control.")

    # A station net control removed and blocked (routers/net_blocks.py)
    # can't check itself, or anyone else, back in: matched by callsign and
    # by account. Net control can still check it in by hand.
    blocked_callsigns, blocked_users = await blocked_on_net(db, net_id)
    if (blocked_callsigns or blocked_users) and (
        check_in_data.callsign.strip().upper() in blocked_callsigns
        or current_user.id in blocked_users
        or (linked_user_id is not None and linked_user_id in blocked_users)
    ) and not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Net control has removed this station from this net.")

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
    
    # ========== WHERE THE STATION IS ==========
    # The Site box sends one of the net's sites (whose name becomes the
    # operating position, as the can-hear dialog records it), a position
    # with no site ("Home", "Field Deployed"), or nothing. A Mobile status
    # means traveling. See services/station_place.py.
    status_in = check_in_data.status or StationStatus.CHECKED_IN
    if check_in_data.coverage_site_id is not None:
        site = await coverage_site_for_net(db, net_id, check_in_data.coverage_site_id, current_user)
        check_in_data.operating_position = site.name[:50]
    elif check_in_data.operating_position is not None:
        check_in_data.operating_position = check_in_data.operating_position.strip()[:50] or None

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
    latest_check_in = existing_check_ins[-1] if existing_check_ins else None
    live_check_ins = [ci for ci in existing_check_ins if ci.status != StationStatus.CHECKED_OUT]
    latest_live = live_check_ins[-1] if live_check_ins else None

    def _place_of(row):
        return place_key(row.coverage_site_id, row.operating_position, row.status)

    # A recheck with no place given is at the same place as before, the way
    # a blank location has always meant "same as before". Not after
    # traveling: a station arriving off the road is somewhere new.
    new_place = place_key(check_in_data.coverage_site_id, check_in_data.operating_position, status_in)
    if new_place is None and latest_check_in is not None and latest_check_in.status != StationStatus.MOBILE:
        check_in_data.coverage_site_id = latest_check_in.coverage_site_id
        check_in_data.operating_position = latest_check_in.operating_position
        new_place = place_key(check_in_data.coverage_site_id, check_in_data.operating_position, status_in)

    # Nobody can be in two places at once. A station still checked in that
    # is logged somewhere new has left where it was, though it may have
    # forgotten to check out, so its live rows are checked out below.
    old_place = _place_of(latest_live) if latest_live else None
    moved = latest_live is not None and new_place is not None and new_place != old_place

    # Otherwise a recheck is meaningful in two cases: the station has
    # checked out and is rechecking in later, or the station is still
    # checked in but is now being logged on a different frequency, e.g. a
    # coverage check on the repeater followed by a simplex net, where NCS
    # needs a timestamped record that the station was also reached on the
    # second frequency (both rows stay live: same place, two frequencies).
    # Anything else is a duplicate check-in attempt (self or NCS/logger
    # re-adding someone already logged in), so reject it instead of
    # creating a second live row.
    frequency_changed = (
        latest_check_in is not None
        and check_in_data.frequency_id is not None
        and check_in_data.frequency_id != latest_check_in.frequency_id
    )
    if latest_live and not frequency_changed and not moved:
        raise HTTPException(
            status_code=400,
            detail=f"{check_in_data.callsign} is already checked in"
        )

    # Location: what was typed; else, at the same place as last time, the
    # last location; else a site's own place (so the map pin and the chat
    # message show the shelter); else, at home, the station's saved town.
    location = (check_in_data.location or '').strip()
    if not location and latest_check_in is not None and new_place == _place_of(latest_check_in):
        location = latest_check_in.location or ''
    if not location and check_in_data.coverage_site_id is not None:
        place_site = await db.get(CoverageSite, check_in_data.coverage_site_id)
        if place_site is not None:
            from app.services.site_coverage import site_line
            location = site_line(place_site.name, place_site.location)[:200]
    if not location and is_home_position(check_in_data.operating_position):
        saved = (await db.execute(
            select(Contact.location).where(Contact.callsign == check_in_data.callsign)
        )).scalar_one_or_none()
        location = saved or ''

    # Every check-in — whether first or re-check — creates a new row.
    # Re-checks link back to the root (original) check-in via parent_check_in_id.
    available_frequencies_json = json.dumps(available_freq_ids)
    custom_fields_json = json.dumps(check_in_data.custom_fields) if check_in_data.custom_fields else '{}'

    if is_recheck:
        # Track location change for system message
        location_changed = bool(
            latest_check_in.location
            and location
            and latest_check_in.location != location
        )
        new_location = location

        check_in = CheckIn(
            net_id=net_id,
            user_id=linked_user_id,
            callsign=check_in_data.callsign,
            name=check_in_data.name or root_check_in.name,
            location=location,
            grid_square=live_location_for_check_in(matching_user, location),
            skywarn_number=check_in_data.skywarn_number,
            weather_observation=check_in_data.weather_observation,
            power_source=check_in_data.power_source,
            power=check_in_data.power,
            feedback=check_in_data.feedback,
            notes=check_in_data.notes,
            relayed_by=check_in_data.relayed_by.upper() if check_in_data.relayed_by else None,
            topic_response=check_in_data.topic_response,
            poll_response=check_in_data.poll_response,
            custom_fields=custom_fields_json,
            frequency_id=check_in_data.frequency_id,
            available_frequencies=available_frequencies_json,
            coverage_site_id=check_in_data.coverage_site_id,
            operating_position=check_in_data.operating_position,
            is_recheck=True,
            parent_check_in_id=root_check_in.id,
            checked_in_by_id=current_user.id,
            status=status_in,
        )
    else:
        location_changed = False
        new_location = location

        check_in = CheckIn(
            net_id=net_id,
            user_id=linked_user_id,
            callsign=check_in_data.callsign,
            name=check_in_data.name,
            location=location,
            grid_square=live_location_for_check_in(matching_user, location),
            skywarn_number=check_in_data.skywarn_number,
            weather_observation=check_in_data.weather_observation,
            power_source=check_in_data.power_source,
            power=check_in_data.power,
            feedback=check_in_data.feedback,
            notes=check_in_data.notes,
            relayed_by=check_in_data.relayed_by.upper() if check_in_data.relayed_by else None,
            topic_response=check_in_data.topic_response,
            poll_response=check_in_data.poll_response,
            custom_fields=custom_fields_json,
            frequency_id=check_in_data.frequency_id,
            available_frequencies=available_frequencies_json,
            coverage_site_id=check_in_data.coverage_site_id,
            operating_position=check_in_data.operating_position,
            is_recheck=False,
            parent_check_in_id=None,
            checked_in_by_id=current_user.id,
            status=status_in,
        )
    db.add(check_in)

    # Labels for the chat message, read before the moved rows change.
    moved_from_label = None
    if moved:
        site_names = dict((await db.execute(
            select(CoverageSite.id, CoverageSite.name).where(CoverageSite.net_id == net_id)
        )).all())
        moved_from_label = place_label(
            latest_live.coverage_site_id, latest_live.operating_position, latest_live.status, site_names,
        )
        moved_to_label = place_label(
            check_in_data.coverage_site_id, check_in_data.operating_position, status_in, site_names,
        )
        checkout_time = datetime.now(UTC)
        for row in live_check_ins:
            row.status = StationStatus.CHECKED_OUT
            row.checked_out_at = checkout_time

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
    if moved:
        moved_from = f"checked out of {moved_from_label}" if moved_from_label else "checked out of their earlier check-in"
        if new_place == TRAVELING:
            await post_system_message(net_id, f"{check_in_data.callsign} is traveling ({moved_from}){ci_suffix}", db)
        else:
            await post_system_message(net_id, f"{check_in_data.callsign} has rechecked from {moved_to_label} ({moved_from}){ci_suffix}", db)
    elif is_recheck:
        if location_changed:
            await post_system_message(net_id, f"{check_in_data.callsign} has rechecked from {new_location}{ci_suffix}", db)
        else:
            await post_system_message(net_id, f"{check_in_data.callsign} has rechecked{ci_suffix}", db)
    else:
        if location:
            await post_system_message(net_id, f"{check_in_data.callsign} has checked in from {location}{ci_suffix}", db)
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
    # geolocation — see _sync_contact_location. A station away from where
    # it usually is (at a site, traveling, deployed) keeps its saved town:
    # tonight's location must not become what its next net fills in.
    await _sync_contact_location(
        db,
        callsign=check_in.callsign,
        name=check_in.name,
        location=check_in.location if keeps_saved_location(
            check_in.coverage_site_id, check_in.operating_position, check_in.status) else None,
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

    # ========== AUTO-GRANT NCS/LOGGER ACCESS ON SELF-CHECK-IN ==========
    # A co-manager or active NCS-rotation member should have the same net-level
    # privileges as the scheduled/on-duty NCS the moment they check themselves
    # in, so they can pick up the net if the assigned NCS is unavailable,
    # without a separate "claim" step. The net's owner (or that same
    # co-manager/rotation pool) can likewise self-grant Logger -- e.g. opening
    # a lobby as Logger while waiting for the scheduled NCS to arrive (added
    # 2026-09-05 for exactly that workflow). Either can step back down at any
    # time via the existing Acting as NCS/Standard toggle (toggle_self_net_role
    # in nets_roles.py), which flips is_active rather than deleting the row --
    # or decline it up front via self_role_choice (the role choice on the
    # check-in dialog, offered when is_eligible_for_ncs_auto_grant and/or
    # is_eligible_for_logger_self_grant is true for the current user).
    #
    # Restricted to self-check-in (current_user.id == linked_user_id): a
    # staff-entered check-in (radio traffic logged by NCS/Logger on someone
    # else's behalf) is never the eligible person's own choice, so it's always
    # treated as Standard -- they can promote themselves afterward if needed
    # (e.g. via the check-in row's status dropdown).
    #
    # NCS eligibility is scoped to template-based nets only -- ad hoc nets
    # have no co-manager or rotation concept. Deliberately placed after the
    # auto-opened-lobby check above, using state from before this grant, so a
    # co-manager's own check-in doesn't itself count as "the NCS arrived"
    # confirmation to subscribers -- only an already-assigned NCS does.
    # Compared against the literal string, not truthiness: the grant must be
    # an affirmative, explicit request. An omitted field defaults to
    # 'standard' and nothing else is ever treated as a request.
    if linked_user_id and current_user.id == linked_user_id and check_in_data.self_role_choice in ("ncs", "logger"):
        role_name = "NCS" if check_in_data.self_role_choice == "ncs" else "LOGGER"
        is_eligible = (
            await is_eligible_for_ncs_auto_grant(db, net, linked_user_id)
            if role_name == "NCS"
            else await is_eligible_for_logger_self_grant(db, net, linked_user_id)
        )
        if is_eligible:
            db.add(NetRole(net_id=net_id, user_id=linked_user_id, role=role_name))
            await db.commit()

            from app.main import manager as ws_manager, post_system_message
            await ws_manager.broadcast({
                "type": "role_change",
                "data": {
                    "net_id": net_id,
                    "user_id": linked_user_id,
                    "role": role_name,
                    "removed": False,
                    "assigned_at": datetime.now(UTC).isoformat()
                },
                "timestamp": datetime.now(UTC).isoformat()
            }, net_id)
            grant_reason = "schedule co-manager/rotation" if role_name == "NCS" else "net owner/schedule co-manager/rotation"
            await post_system_message(net_id, f"{display_callsign(matching_user)} has been granted {role_name} access ({grant_reason})", db)

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

    await _enforce_spam_guard(db, {
        **{k: v for k, v in update_data.items() if k in _SPAM_GUARDABLE_BUILTIN_FIELDS},
        **(update_data.get('custom_fields') or {}),
    })

    # Handle available_frequency_ids separately (needs JSON serialization)
    if 'available_frequency_ids' in update_data:
        check_in.available_frequencies = json.dumps(update_data.pop('available_frequency_ids'))
    
    # Handle custom_fields separately (needs JSON serialization)
    if 'custom_fields' in update_data:
        existing_custom = json.loads(check_in.custom_fields) if check_in.custom_fields else {}
        existing_custom.update(update_data.pop('custom_fields') or {})
        check_in.custom_fields = json.dumps(existing_custom)
    
    old_callsign = check_in.callsign

    # The Site box: a site's name is its operating position, and a position
    # sent without a site ("Home") takes the row off any site. Same pairing
    # create_check_in and the can-hear dialog record.
    if update_data.get('coverage_site_id') is not None:
        site = await coverage_site_for_net(db, check_in.net_id, update_data['coverage_site_id'], current_user)
        update_data['operating_position'] = site.name[:50]
    elif 'operating_position' in update_data:
        update_data['operating_position'] = (update_data['operating_position'] or '').strip()[:50] or None
        update_data['coverage_site_id'] = None

    # Update remaining fields
    for field, value in update_data.items():
        setattr(check_in, field, value)

    # Corrected to Home with no location given: the station's saved town,
    # as create_check_in does. (Moving off a site clears the site's place.)
    if 'operating_position' in update_data and is_home_position(check_in.operating_position) \
            and not (check_in.location or '').strip():
        check_in.location = (await db.execute(
            select(Contact.location).where(Contact.callsign == check_in.callsign)
        )).scalar_one_or_none() or ''

    # A corrected callsign is a different station, so the row follows the new
    # callsign's account, the same lookup create_check_in does. Without this,
    # a row first logged with a typo stayed a guest row forever, and roles
    # could not be assigned from it (net 124, 2026-10-12: KB1JCZ corrected to
    # KB1JCX). Staff edits only: an operator editing their own row (a
    # portable suffix, say) must not detach it from their own account.
    roles_followed = False
    if check_in.callsign != old_callsign and not is_own_check_in:
        check_in.user = await _find_user_by_callsign(db, check_in.callsign)
        # A credit-only role (a station with no account marked NCS, say)
        # belongs to the corrected callsign too.
        await db.flush()
        # Onto an account, the credit becomes a real role only for an editor
        # who could give that role directly; anyone else's edit drops it.
        from app.permissions import can_manage_net_roles
        may_assign = check_in.user is not None and await can_manage_net_roles(db, net, current_user)
        roles_followed = await follow_callsign_correction(
            db, check_in.net_id, old_callsign, check_in.callsign, check_in.user, may_assign_roles=may_assign,
        )

    # An edited location keeps its grid square only if it is still the
    # station's live town; a hand-corrected location drops it, so hovering
    # never shows a grid for somewhere else.
    if 'location' in update_data:
        check_in.grid_square = live_location_for_check_in(check_in.user, check_in.location)
    
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
    # Not for a row away from the station's usual place (see create_check_in).
    if 'location' in update_data and keeps_saved_location(
        check_in.coverage_site_id, check_in.operating_position, check_in.status,
    ):
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

    if roles_followed:
        # Every viewer refetches its role lists on role_change.
        await manager.broadcast({
            "type": "role_change",
            "data": {"net_id": check_in.net_id, "callsign": check_in.callsign},
            "timestamp": datetime.now(UTC).isoformat(),
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

    record_net_event(db, "check_in.deleted", current_user, net, subject_user_id=check_in.user_id,
                     details={"station": check_in.callsign, "checked_in_at": check_in.checked_in_at})
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


async def _load_check_in_and_net_for_auth(db: AsyncSession, check_in_id: int, current_user: User):
    """Shared lookup + permission gate for the two authenticated-net endpoints
    below. Raises the appropriate HTTPException; otherwise returns (check_in, net)
    with check_in.user eager-loaded."""
    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")

    result = await db.execute(select(Net).where(Net.id == check_in.net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    if not await check_net_permission(db, net, current_user, ["NCS", "LOGGER"]):
        raise HTTPException(status_code=403, detail="Not authorized")

    if not net.authenticated:
        raise HTTPException(status_code=400, detail="This net is not an authenticated net")

    return check_in, net


@router.get("/check-ins/{check_in_id}/expected-code", response_model=ExpectedCodeResponse)
async def get_expected_code(
    check_in_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """NCS/Logger only. Returns the station's currently-valid TOTP code(s) so
    they can be compared to what the operator reads aloud over the air. The
    raw secret is decrypted server-side and never leaves this function."""
    check_in, _net = await _load_check_in_and_net_for_auth(db, check_in_id, current_user)

    if not check_in.user_id or not check_in.user or not check_in.user.mfa_enabled or not check_in.user.mfa_secret_encrypted:
        return ExpectedCodeResponse(enrolled=False)

    secret = decrypt_mfa_secret(check_in.user.mfa_secret_encrypted)
    if not secret:
        return ExpectedCodeResponse(enrolled=False)

    current_code, previous_code = current_totp_codes(secret)
    return ExpectedCodeResponse(enrolled=True, current_code=current_code, previous_code=previous_code)


@router.post("/check-ins/{check_in_id}/verify-identity", response_model=CheckInResponse)
async def verify_identity(
    check_in_id: int,
    payload: VerifyIdentityRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """NCS/Logger only. Records whether the station's live TOTP code matched
    what NCS was just shown. A reject (verified=False) clears any prior
    verification rather than merely leaving the dialog with no effect."""
    check_in, net = await _load_check_in_and_net_for_auth(db, check_in_id, current_user)

    check_in.identity_verified = payload.verified
    check_in.identity_verified_at = datetime.now(UTC) if payload.verified else None
    check_in.identity_verified_by_id = current_user.id if payload.verified else None
    await db.commit()

    result = await db.execute(
        select(CheckIn).options(selectinload(CheckIn.user)).where(CheckIn.id == check_in.id)
    )
    check_in = result.scalar_one()

    from app.main import manager
    import datetime as _datetime
    await manager.broadcast({
        "type": "identity_verified_changed",
        "data": {
            "id": check_in.id,
            "net_id": check_in.net_id,
            "callsign": check_in.callsign,
            "identity_verified": check_in.identity_verified,
        },
        "timestamp": _datetime.datetime.utcnow().isoformat()
    }, check_in.net_id)

    return CheckInResponse.from_orm(check_in)
