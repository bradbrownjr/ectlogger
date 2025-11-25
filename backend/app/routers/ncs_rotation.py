from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from dateutil.rrule import rrule, DAILY, WEEKLY, MONTHLY
import json

from app.database import get_db
from app.models import (
    NetTemplate, NCSRotationMember, NCSScheduleOverride, User, NetTemplateSubscription
)
from app.schemas import (
    NCSRotationMemberCreate, NCSRotationMemberResponse,
    NCSScheduleOverrideCreate, NCSScheduleOverrideResponse,
    NCSScheduleEntry, NCSScheduleResponse
)
from app.dependencies import get_current_user, get_current_user_optional
from app.email_service import EmailService
from app.config import settings
from app.logger import logger

router = APIRouter(prefix="/templates/{template_id}/ncs-rotation", tags=["ncs-rotation"])


async def get_template_or_404(template_id: int, db: AsyncSession) -> NetTemplate:
    """Get template or raise 404"""
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.rotation_members).selectinload(NCSRotationMember.user),
            selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.original_user),
            selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.replacement_user),
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


async def check_template_permission(template: NetTemplate, user: User, db: AsyncSession) -> bool:
    """Check if user can manage this template's rotation"""
    if user.role == 'admin':
        return True
    if template.owner_id == user.id:
        return True
    # Check if user is in the rotation
    for member in template.rotation_members:
        if member.user_id == user.id:
            return True
    return False


def calculate_schedule_dates(template: NetTemplate, start_date: datetime, months_ahead: int = 6) -> List[datetime]:
    """Calculate all scheduled net dates based on template schedule config"""
    if template.schedule_type == 'ad_hoc':
        return []
    
    config = json.loads(template.schedule_config) if template.schedule_config else {}
    end_date = start_date + relativedelta(months=months_ahead)
    
    # Parse time from config
    time_str = config.get('time', '19:00')
    try:
        hour, minute = map(int, time_str.split(':'))
    except:
        hour, minute = 19, 0
    
    dates = []
    
    if template.schedule_type == 'daily':
        rule = rrule(DAILY, dtstart=start_date, until=end_date)
        dates = [dt.replace(hour=hour, minute=minute) for dt in rule]
        
    elif template.schedule_type == 'weekly':
        day_of_week = config.get('day_of_week', 0)  # 0 = Sunday
        # Convert to Python weekday (0 = Monday)
        python_weekday = (day_of_week - 1) % 7 if day_of_week > 0 else 6
        rule = rrule(WEEKLY, byweekday=python_weekday, dtstart=start_date, until=end_date)
        dates = [dt.replace(hour=hour, minute=minute) for dt in rule]
        
    elif template.schedule_type == 'monthly':
        day_of_week = config.get('day_of_week', 0)
        weeks_of_month = config.get('week_of_month', [1])  # e.g., [1, 3] for 1st and 3rd
        python_weekday = (day_of_week - 1) % 7 if day_of_week > 0 else 6
        
        # Generate dates for each week of each month
        current = start_date.replace(day=1)
        while current <= end_date:
            # Find all occurrences of the weekday in this month
            month_start = current.replace(day=1)
            month_end = (month_start + relativedelta(months=1)) - timedelta(days=1)
            
            day = month_start
            week_occurrences = []
            while day <= month_end:
                if day.weekday() == python_weekday:
                    week_occurrences.append(day)
                day += timedelta(days=1)
            
            # Select the specified weeks
            for week_num in weeks_of_month:
                if week_num == 5:  # Last occurrence
                    if week_occurrences:
                        dates.append(week_occurrences[-1].replace(hour=hour, minute=minute))
                elif 1 <= week_num <= len(week_occurrences):
                    dates.append(week_occurrences[week_num - 1].replace(hour=hour, minute=minute))
            
            current += relativedelta(months=1)
    
    # Filter to only dates >= start_date and sort
    dates = sorted([d for d in dates if d >= start_date])
    return dates


def compute_ncs_schedule(
    template: NetTemplate,
    dates: List[datetime],
    rotation_members: List[NCSRotationMember],
    overrides: List[NCSScheduleOverride]
) -> List[NCSScheduleEntry]:
    """Compute who is NCS for each date, applying overrides"""
    if not rotation_members or not dates:
        return []
    
    # Get active members in order
    active_members = sorted(
        [m for m in rotation_members if m.is_active],
        key=lambda m: m.position
    )
    
    if not active_members:
        return []
    
    # Build override lookup by date (normalized to date only)
    override_lookup = {}
    for override in overrides:
        date_key = override.scheduled_date.date()
        override_lookup[date_key] = override
    
    schedule = []
    member_count = len(active_members)
    
    for i, date in enumerate(dates):
        date_key = date.date()
        
        # Check for override
        override = override_lookup.get(date_key)
        
        if override:
            if override.replacement_user_id is None:
                # Net is cancelled
                entry = NCSScheduleEntry(
                    date=date,
                    user_id=None,
                    user_name=None,
                    user_callsign=None,
                    user_email=None,
                    is_override=True,
                    is_cancelled=True,
                    override_reason=override.reason
                )
            else:
                # Swap to different user
                entry = NCSScheduleEntry(
                    date=date,
                    user_id=override.replacement_user_id,
                    user_name=override.replacement_user.name if override.replacement_user else None,
                    user_callsign=override.replacement_user.callsign if override.replacement_user else None,
                    user_email=override.replacement_user.email if override.replacement_user else None,
                    is_override=True,
                    is_cancelled=False,
                    override_reason=override.reason
                )
        else:
            # Normal rotation
            member = active_members[i % member_count]
            entry = NCSScheduleEntry(
                date=date,
                user_id=member.user_id,
                user_name=member.user.name if member.user else None,
                user_callsign=member.user.callsign if member.user else None,
                user_email=member.user.email if member.user else None,
                is_override=False,
                is_cancelled=False
            )
        
        schedule.append(entry)
    
    return schedule


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
    
    if not await check_template_permission(template, current_user, db):
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
    
    if not await check_template_permission(template, current_user, db):
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
    
    await db.delete(member)
    await db.commit()


@router.put("/members/reorder", response_model=List[NCSRotationMemberResponse])
async def reorder_rotation_members(
    template_id: int,
    member_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder the NCS rotation by providing member IDs in desired order"""
    template = await get_template_or_404(template_id, db)
    
    if not await check_template_permission(template, current_user, db):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Update positions
    for i, member_id in enumerate(member_ids, start=1):
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
    
    # Compute schedule with overrides
    schedule = compute_ncs_schedule(
        template,
        dates,
        template.rotation_members,
        template.schedule_overrides
    )
    
    return NCSScheduleResponse(
        template_id=template_id,
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
    
    # Compute schedule
    schedule = compute_ncs_schedule(
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
    
    if not await check_template_permission(template, current_user, db):
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
                scheduler_url=scheduler_url
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
                    scheduler_url=scheduler_url
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
    
    if not await check_template_permission(template, current_user, db):
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
