from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from dateutil.rrule import rrule, DAILY, WEEKLY, MONTHLY
import json
from pydantic import BaseModel

from app.database import get_db
from app.models import (
    NetTemplate, NCSRotationMember, NCSScheduleOverride, User, NetTemplateSubscription, TemplateStaff
)
from app.schemas import (
    NCSRotationMemberCreate, NCSRotationMemberResponse, NCSRotationMemberReorder,
    NCSScheduleOverrideCreate, NCSScheduleOverrideResponse,
    NCSScheduleEntry, NCSScheduleResponse,
    TemplateStaffCreate, TemplateStaffResponse
)
from app.dependencies import get_current_user, get_current_user_optional
from app.email_service import EmailService
from app.config import settings
from app.logger import logger
from app.permissions import check_template_permission
from app.routers.ncs_schedule import (
    calculate_schedule_dates,
    compute_anchored_ncs_schedule,
    compute_ncs_schedule,
    get_rotation_anchor_date,
    is_fifth_occurrence,
    template_local_to_utc,
    template_utc_to_local,
)

router = APIRouter(prefix="/templates/{template_id}/ncs-rotation", tags=["ncs-rotation"])


class TemplateStaffUpdateRequest(BaseModel):
    """PATCH payload for template staff updates."""
    is_active: Optional[bool] = None
    is_co_manager: Optional[bool] = None


async def get_template_or_404(template_id: int, db: AsyncSession) -> NetTemplate:
    """Get template or raise 404"""
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.rotation_members).selectinload(NCSRotationMember.user),
            selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.original_user),
            selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.replacement_user),
            selectinload(NetTemplate.staff).selectinload(TemplateStaff.user),
            selectinload(NetTemplate.fifth_week_user),
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


# check_template_permission is now in app.permissions (canonical DB-query version)


@router.get("/members", response_model=List[NCSRotationMemberResponse])
async def list_rotation_members(
    template_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all NCS rotation members for a template"""
    template = await get_template_or_404(template_id, db)
    
    return [
        NCSRotationMemberResponse.from_orm_with_user(member)
        for member in sorted(template.rotation_members, key=lambda m: m.position)
    ]


@router.post("/members", response_model=NCSRotationMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_rotation_member(
    template_id: int,
    member_data: NCSRotationMemberCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a user to the NCS rotation"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check user exists
    result = await db.execute(select(User).where(User.id == member_data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already in rotation
    for existing in template.rotation_members:
        if existing.user_id == member_data.user_id:
            raise HTTPException(status_code=400, detail="User already in rotation")
    
    # Get next position
    max_position = max([m.position for m in template.rotation_members], default=0)
    
    member = NCSRotationMember(
        template_id=template_id,
        user_id=member_data.user_id,
        position=max_position + 1
    )
    db.add(member)
    await db.commit()
    
    # Reload with user relationship
    result = await db.execute(
        select(NCSRotationMember)
        .options(selectinload(NCSRotationMember.user))
        .where(NCSRotationMember.id == member.id)
    )
    member = result.scalar_one()
    
    return NCSRotationMemberResponse.from_orm_with_user(member)


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_rotation_member(
    template_id: int,
    member_id: int,
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
    
    # Clean up any overrides that reference this user (as original or replacement)
    await db.execute(
        delete(NCSScheduleOverride).where(
            NCSScheduleOverride.template_id == template_id,
            (NCSScheduleOverride.original_user_id == member.user_id) | 
            (NCSScheduleOverride.replacement_user_id == member.user_id)
        )
    )
    
    await db.delete(member)
    await db.commit()


@router.delete("/members", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_rotation_members(
    template_id: int,
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
    
    await db.commit()


@router.put("/members/reorder", response_model=List[NCSRotationMemberResponse])
async def reorder_rotation_members(
    template_id: int,
    reorder_data: NCSRotationMemberReorder,
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
    
    await db.commit()
    
    # Reload and return
    template = await get_template_or_404(template_id, db)
    return [
        NCSRotationMemberResponse.from_orm_with_user(member)
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
        fifth_week_user_callsign=template.fifth_week_user.callsign if template.fifth_week_user else None,
        fifth_week_user_name=template.fifth_week_user.name if template.fifth_week_user else None,
        schedule=schedule,
        rotation_members=[
            NCSRotationMemberResponse.from_orm_with_user(m)
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

    return schedule[0] if schedule else None


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
    
    # Calculate who was originally scheduled
    dates = [override_data.scheduled_date]
    schedule = compute_ncs_schedule(
        template, dates, template.rotation_members, []  # No overrides for original calc
    )
    original_user_id = schedule[0].user_id if schedule else None
    
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
        existing.replacement_user_id = override_data.replacement_user_id
        existing.reason = override_data.reason
        existing.original_user_id = original_user_id
        override = existing
    else:
        # Create new override
        override = NCSScheduleOverride(
            template_id=template_id,
            scheduled_date=override_data.scheduled_date,
            original_user_id=original_user_id,
            replacement_user_id=override_data.replacement_user_id,
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
    if override_data.replacement_user_id is None:
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
    
    return NCSScheduleOverrideResponse.from_orm_with_users(override)


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
        NCSScheduleOverrideResponse.from_orm_with_users(override)
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
    
    return [
        TemplateStaffResponse.from_orm_with_user(staff)
        for staff in template.staff
    ]


@router.post("/staff", response_model=TemplateStaffResponse, status_code=status.HTTP_201_CREATED)
async def add_template_staff(
    template_id: int,
    staff_data: TemplateStaffCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a user to the template staff (people who can run nets)"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check user exists
    result = await db.execute(select(User).where(User.id == staff_data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already staff
    for existing in template.staff:
        if existing.user_id == staff_data.user_id:
            raise HTTPException(status_code=400, detail="User is already staff")
    
    staff = TemplateStaff(
        template_id=template_id,
        user_id=staff_data.user_id
    )
    db.add(staff)
    await db.commit()
    
    # Reload with user relationship
    result = await db.execute(
        select(TemplateStaff)
        .options(selectinload(TemplateStaff.user))
        .where(TemplateStaff.id == staff.id)
    )
    staff = result.scalar_one()
    
    return TemplateStaffResponse.from_orm_with_user(staff)


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

    if next_is_active is None and next_is_co_manager is None:
        raise HTTPException(status_code=400, detail="No update fields provided")

    if next_is_active is not None:
        staff.is_active = next_is_active
    if next_is_co_manager is not None:
        staff.is_co_manager = next_is_co_manager
    await db.commit()
    await db.refresh(staff)
    
    return TemplateStaffResponse.from_orm_with_user(staff)
