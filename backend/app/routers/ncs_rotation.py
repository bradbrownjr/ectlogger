from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
import json
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models import (
    Net, NetCallsignRole, NetRole, NetStatus, NetTemplate, NCSRotationMember, NCSScheduleOverride, TeamInvite, User,
    NetTemplateSubscription, TemplateStaff
)
from app.services.callsign_people import (
    Person,
    callsigns_with_accounts,
    check_invite_budget,
    claim_and_queue_notices,
    duty_ncs_role,
    normalize_callsign,
    record_invite,
    rename_placeholder,
    resolve_person,
)
from app.schemas import (
    NCSRotationMemberCreate, NCSRotationMemberResponse, NCSRotationMemberReorder,
    NCSScheduleOverrideCreate, NCSScheduleOverrideResponse,
    NCSScheduleEntry, NCSScheduleResponse,
    TemplateStaffCreate, TemplateStaffResponse,
    public_display_name,
)
from app.dependencies import get_current_user, get_current_user_optional
from app.email_service import EmailService
from app.config import settings
from app.logger import logger
from app.permissions import can_manage_schedule_team, check_template_permission
from app.routers.ncs_schedule import (
    calculate_schedule_dates,
    compute_anchored_ncs_schedule,
    ncs_schedule_load_options,
    stamp_rotation_anchor,
    template_utc_to_local,
)

router = APIRouter(prefix="/templates/{template_id}/ncs-rotation", tags=["ncs-rotation"])


def _entries_for_viewer(entries: List[NCSScheduleEntry], signed_in: bool) -> List[NCSScheduleEntry]:
    """The schedule endpoints are public; a guest sees first names only.

    compute_anchored_ncs_schedule stays viewer-agnostic because the reminder
    service uses it too, so the redaction happens here, on the way out.
    """
    return [
        e.model_copy(update={
            "user_name": public_display_name(e.user_name, signed_in),
            # Whether the operator has an account is for signed-in viewers only.
            "has_account": e.has_account or not signed_in,
        })
        for e in entries
    ]


class TemplateStaffUpdateRequest(BaseModel):
    """PATCH payload for template staff updates.

    The last three apply to a callsign-only entry: ``callsign`` corrects a
    typo, ``link`` gives the entry to the account that now holds its
    callsign, and ``invite_email`` (re)sends a sign-up invite."""
    is_active: Optional[bool] = None
    is_co_manager: Optional[bool] = None
    callsign: Optional[str] = None
    link: Optional[bool] = None
    invite_email: Optional[EmailStr] = None


# ========== CALLSIGN-ONLY ENTRIES ==========
# Staff and rotation entries may name an operator who has no account yet;
# services/callsign_people.py holds the rules. These helpers are the router's
# side of it: the extra fields a signed-in viewer sees, the invite, and the
# typo/link edits a manager makes.

async def _placeholder_flags(db: AsyncSession, template_id: int, rows) -> tuple:
    """(callsigns that now have an account, callsigns this schedule invited)
    for the callsign-only rows in `rows`."""
    callsigns = {r.callsign for r in rows if r.user_id is None and r.callsign}
    if not callsigns:
        return set(), set()
    available = await callsigns_with_accounts(db, callsigns)
    invited_result = await db.execute(
        select(TeamInvite.callsign).where(TeamInvite.template_id == template_id, TeamInvite.callsign.in_(callsigns))
    )
    return available, set(invited_result.scalars().all())


async def _require_team_manager(db: AsyncSession, template: NetTemplate, user: User, action: str) -> None:
    """403 unless the user is the schedule's manager, a co-manager or an
    admin (permissions.can_manage_schedule_team)."""
    if not await can_manage_schedule_team(db, template, user):
        raise HTTPException(
            status_code=403,
            detail=f"Only the schedule's manager or a co-manager can {action}",
        )


async def _queue_invite(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    template: NetTemplate,
    callsign: str,
    email: str,
    inviter: User,
) -> None:
    """Record and send a sign-up invite for a callsign-only entry. Commits.
    Managers only: an invite is what lets an account take over the entry by
    itself, so it carries the same trust as linking by hand."""
    from app.utils import display_callsign

    await _require_team_manager(db, template, inviter, "send invites")
    await check_invite_budget(db, inviter, email)
    await record_invite(db, template.id, callsign, email, inviter)
    await db.commit()
    background_tasks.add_task(
        EmailService.send_team_invite,
        to_email=email,
        callsign=callsign,
        schedule_name=template.name,
        inviter_display=display_callsign(inviter) or "A net manager",
        login_url=f"{settings.frontend_url}/login",
    )
    logger.info("NCS_ROTATION", f"Queued team invite for {callsign} on template {template.id} by user {inviter.id}")


async def _edit_placeholder(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    template: NetTemplate,
    callsign: str,
    current_user: User,
    new_callsign: Optional[str] = None,
    link: Optional[bool] = None,
) -> None:
    """Apply a typo fix or link to every entry for `callsign` on this
    schedule. A corrected callsign that belongs to an account is linked to it
    straight away, the same as `link`. Linking (either way) is for the
    schedule's manager, a co-manager or an admin: it gives an account the
    entries' place on the team and their NCS credit. Commits."""
    from app.services.callsign_people import find_active_user_by_callsign

    target = normalize_callsign(new_callsign) if new_callsign is not None else callsign
    account = await find_active_user_by_callsign(db, target)
    if link and account is None:
        raise HTTPException(status_code=400, detail=f"{target} doesn't have an account yet")
    if account is not None:
        await _require_team_manager(db, template, current_user, "link an operator to an account")
    if new_callsign is not None:
        await rename_placeholder(db, template.id, callsign, target)
        await db.commit()
    if account is not None:
        await claim_and_queue_notices(
            db, account, background_tasks, template_id=template.id, callsign=target, linked_by=current_user,
        )


async def get_template_or_404(template_id: int, db: AsyncSession) -> NetTemplate:
    """Get template or raise 404"""
    result = await db.execute(
        select(NetTemplate)
        .options(
            *ncs_schedule_load_options(),
            selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.original_user),
            selectinload(NetTemplate.staff).selectinload(TemplateStaff.user),
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


# check_template_permission is now in app.permissions (canonical DB-query version)


async def resync_pending_duty_ncs(
    db: AsyncSession,
    template_id: int,
    background_tasks: Optional[BackgroundTasks] = None,
) -> None:
    """Recompute the duty NCS for any not-yet-started net still tied to this
    template, now that the roster underneath it has just changed.

    _assign_duty_ncs (ncs_reminder_service.py) stamps a NetRole(NCS,
    auto_assigned=True) exactly once, at auto-create time (~24h before the
    net starts). Nothing previously revisited that net if the roster was
    edited afterward, so a correction made in that window never reached a
    net that already existed -- it stayed staffed by whoever the rotation
    picked before the edit, permanently. Call this from every route that
    calls stamp_rotation_anchor (add/remove/reorder/clear/merge) so the
    correction actually lands.

    Only DRAFT/SCHEDULED nets with a future scheduled_start_time are
    touched; once the lobby is open a human is expected to be involved, not
    an automatic reassignment. If any NCS NetRole on a net is human-authored
    (starting the net, self-check-in, or a manual assign -- auto_assigned is
    False), that net is skipped entirely: the existing role is left alone
    and no auto-assigned duplicate is added alongside it. Only when every
    NCS NetRole present is itself auto_assigned does this replace it with
    the freshly computed pick.

    Reloads the template fresh, like _assign_duty_ncs, so this is safe to
    call regardless of what the caller has eager-loaded.
    """
    tpl_result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.rotation_members),
            selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.replacement_user),
            selectinload(NetTemplate.fifth_week_user),
        )
        .where(NetTemplate.id == template_id)
    )
    template = tpl_result.scalar_one_or_none()
    if not template or template.schedule_type == 'ad_hoc' or not template.rotation_members:
        return

    now = datetime.utcnow()
    nets_result = await db.execute(
        select(Net).where(
            Net.template_id == template_id,
            Net.status.in_([NetStatus.DRAFT, NetStatus.SCHEDULED]),
            Net.scheduled_start_time.isnot(None),
            Net.scheduled_start_time > now,
        )
    )
    pending_nets = nets_result.scalars().all()
    if not pending_nets:
        return

    config = json.loads(template.schedule_config) if template.schedule_config else {}
    net_time = config.get('time', '19:00')
    scheduler_url = f"{settings.frontend_url}/scheduler"

    for net in pending_nets:
        local_dt = template_utc_to_local(template, net.scheduled_start_time)
        schedule = compute_anchored_ncs_schedule(
            template, [local_dt], template.rotation_members, template.schedule_overrides,
        )
        entry = schedule[0] if schedule else None
        new_role = duty_ncs_role(net.id, entry)
        new_user_id = new_role.user_id if isinstance(new_role, NetRole) else None
        new_identity = (new_user_id, new_role.callsign if isinstance(new_role, NetCallsignRole) else None)

        # The duty NCS is a NetRole for an account, or a credit-only
        # NetCallsignRole for a callsign with no account; either may be the
        # one to replace.
        existing_roles = (await db.execute(
            select(NetRole).where(NetRole.net_id == net.id, NetRole.role == "NCS")
        )).scalars().all()
        existing_callsign_roles = (await db.execute(
            select(NetCallsignRole).where(NetCallsignRole.net_id == net.id, NetCallsignRole.role == "NCS")
        )).scalars().all()

        # A human already made an explicit choice for this net (assigned a
        # role, started it, or self-checked in) -- never overwrite that with
        # a roster edit, and never add a second NCS alongside it.
        if any(not r.auto_assigned for r in [*existing_roles, *existing_callsign_roles]):
            continue

        old_user_id = existing_roles[0].user_id if existing_roles else None
        old_identity = (old_user_id, existing_callsign_roles[0].callsign if existing_callsign_roles else None)

        if old_identity == new_identity:
            continue

        for existing in [*existing_roles, *existing_callsign_roles]:
            await db.delete(existing)
        if new_role is not None:
            db.add(new_role)
        await db.commit()

        logger.info(
            "NCS_ROTATION",
            f"Resynced duty NCS for net {net.id} ({template.name}): {old_identity} -> {new_identity}",
        )

        if background_tasks is None:
            continue

        net_date = local_dt.strftime('%A, %B %d, %Y')

        for user_id, is_new in ((old_user_id, False), (new_user_id, True)):
            if user_id is None:
                continue
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if not user or not user.email:
                continue
            background_tasks.add_task(
                EmailService.send_ncs_duty_correction,
                to_email=user.email,
                recipient_name=user.name or user.callsign,
                recipient_callsign=user.callsign,
                net_name=template.name,
                net_date=net_date,
                net_time=net_time,
                is_new_assignment=is_new,
                scheduler_url=scheduler_url,
                unsubscribe_token=user.unsubscribe_token,
            )


@router.get("/members", response_model=List[NCSRotationMemberResponse])
async def list_rotation_members(
    template_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all NCS rotation members for a template"""
    template = await get_template_or_404(template_id, db)
    available, _invited = await _placeholder_flags(db, template_id, template.rotation_members)

    return [
        NCSRotationMemberResponse.from_orm_with_user(
            member, current_user is not None, account_available=member.callsign in available,
        )
        for member in sorted(template.rotation_members, key=lambda m: m.position)
    ]


@router.post("/members", response_model=NCSRotationMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_rotation_member(
    template_id: int,
    member_data: NCSRotationMemberCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add an operator to the NCS rotation: an account, or a callsign with
    no account yet (see services/callsign_people.py)."""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    person = await resolve_person(db, member_data.user_id, member_data.callsign)

    # Check if already in rotation
    for existing in template.rotation_members:
        if (person.user_id is not None and existing.user_id == person.user_id) or (
            person.callsign is not None and existing.user_id is None and existing.callsign == person.callsign
        ):
            raise HTTPException(status_code=400, detail="Already in the rotation")
    
    # Get next position
    max_position = max([m.position for m in template.rotation_members], default=0)
    
    member = NCSRotationMember(
        template_id=template_id,
        user_id=person.user_id,
        callsign=person.callsign,
        position=max_position + 1
    )
    db.add(member)
    # Roster composition changed -- restart the rotation from this point.
    stamp_rotation_anchor(template)
    await db.commit()
    await resync_pending_duty_ncs(db, template_id, background_tasks)
    if person.callsign and member_data.invite_email:
        await _queue_invite(db, background_tasks, template, person.callsign, member_data.invite_email, current_user)

    # Reload with user relationship
    result = await db.execute(
        select(NCSRotationMember)
        .options(selectinload(NCSRotationMember.user))
        .where(NCSRotationMember.id == member.id)
    )
    member = result.scalar_one()
    
    return NCSRotationMemberResponse.from_orm_with_user(member, True)


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_rotation_member(
    template_id: int,
    member_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a user from the NCS rotation"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.execute(
        select(NCSRotationMember).where(
            NCSRotationMember.id == member_id,
            NCSRotationMember.template_id == template_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Clean up any overrides that reference this operator (as original or
    # replacement). Matched by callsign for a callsign-only entry: comparing
    # a NULL user_id would match every callsign-only swap instead.
    if member.user_id is not None:
        refers_to_member = (
            (NCSScheduleOverride.original_user_id == member.user_id) |
            (NCSScheduleOverride.replacement_user_id == member.user_id)
        )
    else:
        refers_to_member = (
            (NCSScheduleOverride.original_callsign == member.callsign) |
            (NCSScheduleOverride.replacement_callsign == member.callsign)
        )
    await db.execute(
        delete(NCSScheduleOverride).where(
            NCSScheduleOverride.template_id == template_id,
            refers_to_member,
        )
    )
    
    await db.delete(member)
    # Roster composition changed -- restart the rotation from this point.
    stamp_rotation_anchor(template)
    await db.commit()
    await resync_pending_duty_ncs(db, template_id, background_tasks)


@router.delete("/members", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_rotation_members(
    template_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove all users from the NCS rotation (clear the entire rotation)"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Delete all overrides for this template
    await db.execute(
        delete(NCSScheduleOverride).where(
            NCSScheduleOverride.template_id == template_id
        )
    )
    
    # Delete all rotation members for this template
    await db.execute(
        delete(NCSRotationMember).where(
            NCSRotationMember.template_id == template_id
        )
    )
    
    # Roster composition changed -- whoever is added back starts the cycle fresh.
    stamp_rotation_anchor(template)
    await db.commit()
    await resync_pending_duty_ncs(db, template_id, background_tasks)


class NCSRotationMemberUpdateRequest(BaseModel):
    is_active: Optional[bool] = None
    # Callsign-only entries (see TemplateStaffUpdateRequest).
    callsign: Optional[str] = None
    link: Optional[bool] = None


@router.patch("/members/{member_id}", response_model=NCSRotationMemberResponse)
async def update_rotation_member(
    template_id: int,
    member_id: int,
    update: NCSRotationMemberUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Toggle a rotation member's active status (skip/include them in the
    computed schedule) without removing them from the roster. The frontend's
    NCS Rotation list switch (StaffRotationTab.tsx) called this route as a
    PUT before it existed here -- every toggle 405'd and failed silently."""
    template = await get_template_or_404(template_id, db)

    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    result = await db.execute(
        select(NCSRotationMember).where(
            NCSRotationMember.id == member_id,
            NCSRotationMember.template_id == template_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if update.is_active is None and update.callsign is None and not update.link:
        raise HTTPException(status_code=400, detail="No update fields provided")
    if (update.callsign is not None or update.link) and member.user_id is not None:
        raise HTTPException(status_code=400, detail="Only an operator without an account can be relinked")

    if update.callsign is not None or update.link:
        await _edit_placeholder(
            db, background_tasks, template, member.callsign, current_user,
            new_callsign=update.callsign, link=update.link,
        )
    if update.is_active is not None:
        member.is_active = update.is_active
        # Roster composition (who's actually cycling) changed -- restart from here.
        stamp_rotation_anchor(template)
        await db.commit()
    await resync_pending_duty_ncs(db, template_id, background_tasks)

    result = await db.execute(
        select(NCSRotationMember)
        .options(selectinload(NCSRotationMember.user))
        .where(NCSRotationMember.id == member.id)
    )
    member = result.scalar_one()

    return NCSRotationMemberResponse.from_orm_with_user(member, True)


@router.put("/members/reorder", response_model=List[NCSRotationMemberResponse])
async def reorder_rotation_members(
    template_id: int,
    reorder_data: NCSRotationMemberReorder,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder the NCS rotation by providing member IDs in desired order"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Update positions
    for i, member_id in enumerate(reorder_data.member_ids, start=1):
        result = await db.execute(
            select(NCSRotationMember).where(
                NCSRotationMember.id == member_id,
                NCSRotationMember.template_id == template_id
            )
        )
        member = result.scalar_one_or_none()
        if member:
            member.position = i
    
    # Roster order changed -- the next occurrence belongs to the new position 1.
    stamp_rotation_anchor(template)
    await db.commit()
    await resync_pending_duty_ncs(db, template_id, background_tasks)

    # Reload and return
    template = await get_template_or_404(template_id, db)
    return [
        NCSRotationMemberResponse.from_orm_with_user(member, True)
        for member in sorted(template.rotation_members, key=lambda m: m.position)
    ]


@router.get("/schedule", response_model=NCSScheduleResponse)
async def get_ncs_schedule(
    template_id: int,
    months_ahead: int = 6,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get the computed NCS schedule for upcoming months"""
    template = await get_template_or_404(template_id, db)
    
    # Calculate schedule dates
    start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    dates = calculate_schedule_dates(template, start_date, months_ahead)

    # Compute schedule with overrides, anchored to the schedule's first occurrence
    # so the rotation advances week-over-week instead of resetting to position 1.
    schedule = compute_anchored_ncs_schedule(
        template,
        dates,
        template.rotation_members,
        template.schedule_overrides
    )

    return NCSScheduleResponse(
        template_id=template_id,
        fifth_week_user_id=template.fifth_week_user_id,
        fifth_week_user_callsign=(
            template.fifth_week_user.callsign if template.fifth_week_user else template.fifth_week_callsign
        ),
        fifth_week_user_name=public_display_name(
            template.fifth_week_user.name if template.fifth_week_user else None,
            current_user is not None,
        ),
        fifth_week_has_account=template.fifth_week_callsign is None or current_user is None,
        schedule=_entries_for_viewer(schedule, current_user is not None),
        rotation_members=[
            NCSRotationMemberResponse.from_orm_with_user(m, current_user is not None)
            for m in sorted(template.rotation_members, key=lambda m: m.position)
        ]
    )


@router.get("/next", response_model=Optional[NCSScheduleEntry])
async def get_next_ncs(
    template_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get the NCS for the next scheduled net"""
    template = await get_template_or_404(template_id, db)
    
    # Calculate just the next few dates
    start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    dates = calculate_schedule_dates(template, start_date, months_ahead=1)
    
    if not dates:
        return None

    # Compute the next assignment anchored to the schedule's first occurrence so the
    # rotation advances instead of always returning position 1.
    schedule = compute_anchored_ncs_schedule(
        template,
        dates[:1],  # Just the next one
        template.rotation_members,
        template.schedule_overrides
    )

    return _entries_for_viewer(schedule, current_user is not None)[0] if schedule else None


@router.post("/overrides", response_model=NCSScheduleOverrideResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule_override(
    template_id: int,
    override_data: NCSScheduleOverrideCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a swap/override for a specific date"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Calculate who was originally scheduled. This must use the *anchored* calculation:
    # compute_ncs_schedule on a single-date list always starts its rotation counter at
    # zero, so it reported the current position-1 member as "originally scheduled" for
    # every swap regardless of the date, recording a wrong name in the audit trail and
    # in the cancellation notice below.
    dates = [override_data.scheduled_date]
    schedule = compute_anchored_ncs_schedule(
        template, dates, template.rotation_members, []  # No overrides for original calc
    )
    original_user_id = schedule[0].user_id if schedule else None
    original_callsign = (
        schedule[0].user_callsign if schedule and schedule[0].user_id is None else None
    )
    # No replacement at all cancels the net; otherwise the replacement is an
    # account or a callsign with no account yet.
    is_cancellation = override_data.replacement_user_id is None and not override_data.replacement_callsign
    replacement = (
        Person(None, None) if is_cancellation
        else await resolve_person(db, override_data.replacement_user_id, override_data.replacement_callsign)
    )
    
    # Check if override already exists for this date
    result = await db.execute(
        select(NCSScheduleOverride).where(
            NCSScheduleOverride.template_id == template_id,
            NCSScheduleOverride.scheduled_date == override_data.scheduled_date
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Update existing override
        existing.replacement_user_id = replacement.user_id
        existing.replacement_callsign = replacement.callsign
        existing.reason = override_data.reason
        existing.original_user_id = original_user_id
        existing.original_callsign = original_callsign
        override = existing
    else:
        # Create new override
        override = NCSScheduleOverride(
            template_id=template_id,
            scheduled_date=override_data.scheduled_date,
            original_user_id=original_user_id,
            original_callsign=original_callsign,
            replacement_user_id=replacement.user_id,
            replacement_callsign=replacement.callsign,
            reason=override_data.reason,
            created_by_id=current_user.id
        )
        db.add(override)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(NCSScheduleOverride)
        .options(
            selectinload(NCSScheduleOverride.original_user),
            selectinload(NCSScheduleOverride.replacement_user)
        )
        .where(NCSScheduleOverride.id == override.id)
    )
    override = result.scalar_one()
    
    # Send cancellation notifications if this is a cancellation (no replacement)
    if is_cancellation:
        # Get original NCS user if exists
        original_user = None
        if original_user_id:
            result = await db.execute(select(User).where(User.id == original_user_id))
            original_user = result.scalar_one_or_none()
        
        # Get all subscribers
        result = await db.execute(
            select(NetTemplateSubscription)
            .options(selectinload(NetTemplateSubscription.user))
            .where(NetTemplateSubscription.template_id == template_id)
        )
        subscriptions = result.scalars().all()
        
        # Parse schedule config for time
        config = json.loads(template.schedule_config) if template.schedule_config else {}
        net_time = config.get('time', '19:00')
        
        # Format date nicely
        net_date = override_data.scheduled_date.strftime('%A, %B %d, %Y')
        scheduler_url = f"{settings.frontend_url}/scheduler"
        
        # Send notification to original NCS
        if original_user and original_user.email:
            background_tasks.add_task(
                EmailService.send_net_cancellation,
                to_email=original_user.email,
                recipient_name=original_user.name or original_user.callsign,
                recipient_callsign=original_user.callsign,
                net_name=template.name,
                net_date=net_date,
                net_time=net_time,
                reason=override_data.reason,
                is_ncs=True,
                scheduler_url=scheduler_url,
                unsubscribe_token=original_user.unsubscribe_token
            )
            logger.info("NCS_ROTATION", f"Queued cancellation notice to NCS {original_user.callsign}")
        
        # Send notification to all subscribers (except original NCS who already got one)
        for sub in subscriptions:
            if sub.user and sub.user.email and sub.user_id != original_user_id:
                background_tasks.add_task(
                    EmailService.send_net_cancellation,
                    to_email=sub.user.email,
                    recipient_name=sub.user.name or sub.user.callsign,
                    recipient_callsign=sub.user.callsign,
                    net_name=template.name,
                    net_date=net_date,
                    net_time=net_time,
                    reason=override_data.reason,
                    is_ncs=False,
                    scheduler_url=scheduler_url,
                    unsubscribe_token=sub.user.unsubscribe_token
                )
        
        subscriber_count = len([s for s in subscriptions if s.user_id != original_user_id])
        if subscriber_count > 0:
            logger.info("NCS_ROTATION", f"Queued cancellation notice to {subscriber_count} subscribers")
    
    return NCSScheduleOverrideResponse.from_orm_with_users(override, True)


@router.delete("/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_override(
    template_id: int,
    override_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a schedule override (revert to normal rotation)"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.execute(
        select(NCSScheduleOverride).where(
            NCSScheduleOverride.id == override_id,
            NCSScheduleOverride.template_id == template_id
        )
    )
    override = result.scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")
    
    await db.delete(override)
    await db.commit()


@router.get("/overrides", response_model=List[NCSScheduleOverrideResponse])
async def list_schedule_overrides(
    template_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all schedule overrides for a template"""
    template = await get_template_or_404(template_id, db)
    
    return [
        NCSScheduleOverrideResponse.from_orm_with_users(override, current_user is not None)
        for override in template.schedule_overrides
    ]


# ========================================
# Template Staff Endpoints (separate from rotation)
# ========================================

@router.get("/staff", response_model=List[TemplateStaffResponse])
async def list_template_staff(
    template_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all staff members who can run nets from this template"""
    template = await get_template_or_404(template_id, db)
    available, invited = await _placeholder_flags(db, template_id, template.staff)

    return [
        TemplateStaffResponse.from_orm_with_user(
            staff, current_user is not None,
            account_available=staff.callsign in available, invited=staff.callsign in invited,
        )
        for staff in template.staff
    ]


@router.post("/staff", response_model=TemplateStaffResponse, status_code=status.HTTP_201_CREATED)
async def add_template_staff(
    template_id: int,
    staff_data: TemplateStaffCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add an operator to the template staff (people who can run nets): an
    account, or a callsign with no account yet, optionally with an address
    to invite them at. A callsign-only entry grants nothing until that
    operator signs up (services/callsign_people.py)."""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    person = await resolve_person(db, staff_data.user_id, staff_data.callsign)
    if person.callsign and staff_data.invite_email:
        await _require_team_manager(db, template, current_user, "send invites")

    # Check if already staff
    for existing in template.staff:
        if (person.user_id is not None and existing.user_id == person.user_id) or (
            person.callsign is not None and existing.user_id is None and existing.callsign == person.callsign
        ):
            raise HTTPException(status_code=400, detail="Already on the staff list")
    
    staff = TemplateStaff(
        template_id=template_id,
        user_id=person.user_id,
        callsign=person.callsign,
    )
    db.add(staff)
    await db.commit()
    invited = False
    if person.callsign and staff_data.invite_email:
        await _queue_invite(db, background_tasks, template, person.callsign, staff_data.invite_email, current_user)
        invited = True
    
    # Reload with user relationship
    result = await db.execute(
        select(TemplateStaff)
        .options(selectinload(TemplateStaff.user))
        .where(TemplateStaff.id == staff.id)
    )
    staff = result.scalar_one()
    
    return TemplateStaffResponse.from_orm_with_user(staff, True, invited=invited)


@router.delete("/staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_template_staff(
    template_id: int,
    staff_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a user from the template staff"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.execute(
        select(TemplateStaff).where(
            TemplateStaff.id == staff_id,
            TemplateStaff.template_id == template_id
        )
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    
    await db.delete(staff)
    await db.commit()


@router.patch("/staff/{staff_id}", response_model=TemplateStaffResponse)
async def update_template_staff(
    template_id: int,
    staff_id: int,
    background_tasks: BackgroundTasks,
    update: Optional[TemplateStaffUpdateRequest] = Body(None),
    is_active: Optional[bool] = Query(None),
    is_co_manager: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a staff member's active status or co-manager flag"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.execute(
        select(TemplateStaff)
        .options(selectinload(TemplateStaff.user))
        .where(
            TemplateStaff.id == staff_id,
            TemplateStaff.template_id == template_id
        )
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    
    # Body values are the canonical input for PATCH; query params are kept
    # as backwards-compatible fallback for older clients.
    next_is_active = update.is_active if (update is not None and update.is_active is not None) else is_active
    next_is_co_manager = update.is_co_manager if (update is not None and update.is_co_manager is not None) else is_co_manager

    new_callsign = update.callsign if update is not None else None
    link = bool(update.link) if update is not None else False
    invite_email = update.invite_email if update is not None else None

    if next_is_active is None and next_is_co_manager is None and new_callsign is None and not link and not invite_email:
        raise HTTPException(status_code=400, detail="No update fields provided")
    if (new_callsign is not None or link or invite_email) and staff.user_id is not None:
        raise HTTPException(status_code=400, detail="Only an operator without an account can be relinked or invited")

    # Co-manager is a schedule-ownership tier, and a callsign-only entry
    # carries its flags to whoever takes the callsign over. Making one a
    # co-manager would hand that tier to anyone who signs up with the
    # callsign, so it waits until the operator has an account.
    if next_is_co_manager and staff.user_id is None:
        raise HTTPException(status_code=400, detail="An operator needs an account before they can be a co-manager")
    # Co-manager is the ownership tier; plain staff could grant it (to
    # themselves, too) until 2026-10-19.
    if next_is_co_manager is not None and bool(next_is_co_manager) != bool(staff.is_co_manager):
        await _require_team_manager(db, template, current_user, "change who is a co-manager")

    staff_row_id = staff.id
    if next_is_active is not None:
        staff.is_active = next_is_active
    if next_is_co_manager is not None:
        staff.is_co_manager = next_is_co_manager
    await db.commit()

    edit_target = None
    if new_callsign is not None or link:
        edit_target = normalize_callsign(new_callsign) if new_callsign is not None else staff.callsign
        await _edit_placeholder(db, background_tasks, template, staff.callsign, current_user,
                                new_callsign=new_callsign, link=link)
        await resync_pending_duty_ncs(db, template_id, background_tasks)

    result = await db.execute(
        select(TemplateStaff).options(selectinload(TemplateStaff.user)).where(TemplateStaff.id == staff_row_id)
    )
    staff = result.scalar_one_or_none()
    if staff is None and edit_target is not None:
        # The entry merged into one already on the list: the account's own
        # row when it was linked to an account already on staff, else the
        # callsign-only row a typo fix landed on. Answer with that one.
        from app.services.callsign_people import find_active_user_by_callsign
        account = await find_active_user_by_callsign(db, edit_target)
        survivor = select(TemplateStaff).options(selectinload(TemplateStaff.user)).where(
            TemplateStaff.template_id == template_id,
            (TemplateStaff.user_id == account.id) if account is not None
            else ((TemplateStaff.user_id.is_(None)) & (TemplateStaff.callsign == edit_target)),
        )
        staff = (await db.execute(survivor.limit(1))).scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=409, detail="That entry was merged into one already on the staff list")
    if invite_email and staff.user_id is None:
        await _queue_invite(db, background_tasks, template, staff.callsign, invite_email, current_user)
    available, invited = await _placeholder_flags(db, template_id, [staff])

    return TemplateStaffResponse.from_orm_with_user(
        staff, True, account_available=staff.callsign in available, invited=staff.callsign in invited,
    )
