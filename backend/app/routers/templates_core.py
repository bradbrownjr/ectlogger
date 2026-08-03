import json
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import (
    AppSettings,
    CheckIn,
    NCSRotationMember,
    NetTemplate,
    NetTemplateSubscription,
    TemplateStaff,
    User,
    UserRole,
    net_template_frequencies,
)
from app.permissions import check_template_permission
from app.schemas import (
    NetTemplateCreate,
    NetTemplateResponse,
    NetTemplateUpdate,
    public_display_name,
)

router = APIRouter()


async def is_active_co_manager(db: AsyncSession, template_id: int, user_id: int) -> bool:
    """Return True when user is an active staff member flagged as co-manager."""
    result = await db.execute(
        select(TemplateStaff).where(
            TemplateStaff.template_id == template_id,
            TemplateStaff.user_id == user_id,
            TemplateStaff.is_active == True,
            TemplateStaff.is_co_manager == True,
        )
    )
    return result.scalar_one_or_none() is not None


async def check_schedule_creation_eligibility(db: AsyncSession, user: User) -> tuple[bool, str]:
    """Check if user is eligible to create schedules based on app settings.

    Returns (is_eligible, error_message). Admins bypass all checks.
    """
    if user.role == UserRole.ADMIN:
        return True, ""

    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()

    if not settings:
        min_age_days = 7
        min_participations = 1
        max_per_day = 5
    else:
        min_age_days = settings.schedule_min_account_age_days if settings.schedule_min_account_age_days is not None else 7
        min_participations = settings.schedule_min_net_participations if settings.schedule_min_net_participations is not None else 1
        max_per_day = settings.schedule_max_per_day if settings.schedule_max_per_day is not None else 5

    if min_age_days > 0 and user.created_at and not getattr(user, 'schedule_age_bypass', False):
        account_age = datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)
        if account_age.days < min_age_days:
            days_remaining = min_age_days - account_age.days
            return False, f"Your account must be at least {min_age_days} days old to create schedules. Please wait {days_remaining} more day(s)."

    if min_participations > 0 and not getattr(user, 'schedule_age_bypass', False):
        participation_result = await db.execute(
            select(func.count(func.distinct(CheckIn.net_id)))
            .where(CheckIn.user_id == user.id)
        )
        participation_count = participation_result.scalar() or 0
        if participation_count < min_participations:
            return False, f"You must participate in at least {min_participations} net(s) before creating schedules. You have participated in {participation_count}."

    if max_per_day > 0:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        templates_today_result = await db.execute(
            select(func.count(NetTemplate.id))
            .where(NetTemplate.owner_id == user.id)
            .where(NetTemplate.created_at >= today_start)
        )
        templates_today = templates_today_result.scalar() or 0
        if templates_today >= max_per_day:
            return False, f"You have reached the daily limit of {max_per_day} schedules. Please try again tomorrow."

    return True, ""


@router.post("/", response_model=NetTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: NetTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new net template"""
    # Check eligibility for schedule creation (admins bypass)
    is_eligible, error_message = await check_schedule_creation_eligibility(db, current_user)
    if not is_eligible:
        raise HTTPException(status_code=403, detail=error_message)
    
    # Serialize field_config and schedule_config to JSON
    field_config_json = json.dumps(template_data.field_config) if template_data.field_config else None
    schedule_config_json = json.dumps(template_data.schedule_config) if template_data.schedule_config else '{}'
    
    # Determine owner - creator can assign to another user
    owner_id = current_user.id
    if template_data.owner_id:
        # Verify the target user exists
        target_user = await db.execute(select(User).where(User.id == template_data.owner_id))
        if target_user.scalar_one_or_none():
            owner_id = template_data.owner_id

    fifth_week_user_id = template_data.fifth_week_user_id
    if fifth_week_user_id is not None:
        result = await db.execute(select(User).where(User.id == fifth_week_user_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Fifth-week user not found")
    
    template = NetTemplate(
        name=template_data.name,
        description=template_data.description,
        info_url=template_data.info_url,
        stream_url=template_data.stream_url,
        script=template_data.script,
        announcements=template_data.announcements,
        owner_id=owner_id,
        fifth_week_user_id=fifth_week_user_id,
        field_config=field_config_json,
        schedule_type=template_data.schedule_type,
        schedule_config=schedule_config_json,
        ics309_enabled=template_data.ics309_enabled or False,
        propagation_logging_enabled=template_data.propagation_logging_enabled or False,
        traffic_enabled=template_data.traffic_enabled if template_data.traffic_enabled is not None else True,
        self_checkin_enabled=template_data.self_checkin_enabled if template_data.self_checkin_enabled is not None else True,
        auto_lobby_minutes=template_data.auto_lobby_minutes,
        topic_of_week_enabled=template_data.topic_of_week_enabled or False,
        topic_of_week_prompt=template_data.topic_of_week_prompt,
        poll_enabled=template_data.poll_enabled or False,
        poll_question=template_data.poll_question
    )
    db.add(template)
    await db.flush()
    
    # Add frequencies
    if template_data.frequency_ids:
        for freq_id in template_data.frequency_ids:
            await db.execute(
                net_template_frequencies.insert().values(
                    template_id=template.id,
                    frequency_id=freq_id
                )
            )

    await db.commit()
    await db.refresh(template)
    
    # Load frequencies
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.frequencies),
            selectinload(NetTemplate.fifth_week_user),
        )
        .where(NetTemplate.id == template.id)
    )
    template = result.scalar_one()
    
    return NetTemplateResponse.from_orm(template, subscriber_count=0, is_subscribed=False, can_manage=True, can_create_net=True)


@router.get("/", response_model=List[NetTemplateResponse])
async def list_templates(
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = False,
    my_templates: bool = False,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List net templates (no auth required for guest access)"""
    query = select(NetTemplate).options(
        selectinload(NetTemplate.frequencies),
        selectinload(NetTemplate.owner),
        selectinload(NetTemplate.rotation_members),
        selectinload(NetTemplate.fifth_week_user),
    )
    
    if not include_inactive:
        query = query.where(NetTemplate.is_active == True)
    
    if my_templates and current_user:
        # Include templates user owns OR is in the NCS rotation for
        rotation_template_ids = await db.execute(
            select(NCSRotationMember.template_id)
            .where(NCSRotationMember.user_id == current_user.id)
            .where(NCSRotationMember.is_active == True)
        )
        rotation_ids = [row[0] for row in rotation_template_ids.fetchall()]
        query = query.where(
            (NetTemplate.owner_id == current_user.id) | 
            (NetTemplate.id.in_(rotation_ids))
        )
    
    query = query.offset(skip).limit(limit).order_by(NetTemplate.name)
    
    result = await db.execute(query)
    templates = result.scalars().all()
    
    # Get subscriber counts and subscription status for each template
    template_responses = []
    for template in templates:
        count_result = await db.execute(
            select(func.count(NetTemplateSubscription.id))
            .where(NetTemplateSubscription.template_id == template.id)
        )
        subscriber_count = count_result.scalar() or 0
        
        # Check if current user is subscribed (guests are never subscribed)
        is_subscribed = False
        can_manage = False
        if current_user:
            subscription_result = await db.execute(
                select(NetTemplateSubscription)
                .where(
                    NetTemplateSubscription.template_id == template.id,
                    NetTemplateSubscription.user_id == current_user.id
                )
            )
            is_subscribed = subscription_result.scalar_one_or_none() is not None
            
            # Check if user can manage (owner, admin, or NCS rotation member)
            can_manage = await check_template_permission(db, template, current_user)
        
        template_responses.append(NetTemplateResponse.from_orm(
            template, 
            subscriber_count=subscriber_count,
            is_subscribed=is_subscribed,
            owner_callsign=template.owner.callsign if template.owner else None,
            owner_name=public_display_name(template.owner.name if template.owner else None, current_user is not None),
            can_manage=can_manage,
            can_create_net=can_manage  # Same permission - owner, admin, or NCS staff
        ))
    
    return template_responses


@router.get("/{template_id}", response_model=NetTemplateResponse)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get template by ID"""
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.frequencies),
            selectinload(NetTemplate.fifth_week_user),
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get subscriber count
    count_result = await db.execute(
        select(func.count(NetTemplateSubscription.id))
        .where(NetTemplateSubscription.template_id == template_id)
    )
    subscriber_count = count_result.scalar() or 0
    
    # Check if current user is subscribed
    subscription_result = await db.execute(
        select(NetTemplateSubscription)
        .where(
            NetTemplateSubscription.template_id == template_id,
            NetTemplateSubscription.user_id == current_user.id
        )
    )
    is_subscribed = subscription_result.scalar_one_or_none() is not None
    
    # Check if user can manage
    can_manage = await check_template_permission(db, template, current_user)
    
    return NetTemplateResponse.from_orm(template, subscriber_count=subscriber_count, is_subscribed=is_subscribed, can_manage=can_manage, can_create_net=can_manage)


@router.put("/{template_id}", response_model=NetTemplateResponse)
async def update_template(
    template_id: int,
    template_data: NetTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a template"""
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check permissions (owner, admin, or NCS rotation member)
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to update this template")
    
    # Update fields
    if template_data.name is not None:
        template.name = template_data.name
    if template_data.description is not None:
        template.description = template_data.description
    if template_data.info_url is not None:
        template.info_url = template_data.info_url
    if template_data.stream_url is not None:
        template.stream_url = template_data.stream_url
    if template_data.script is not None:
        template.script = template_data.script
    if template_data.announcements is not None:
        template.announcements = template_data.announcements
    if template_data.field_config is not None:
        template.field_config = json.dumps(template_data.field_config)
    if template_data.is_active is not None:
        template.is_active = template_data.is_active
    if template_data.schedule_type is not None:
        template.schedule_type = template_data.schedule_type
    if template_data.schedule_config is not None:
        template.schedule_config = json.dumps(template_data.schedule_config)
    if "fifth_week_user_id" in template_data.model_fields_set:
        if template_data.fifth_week_user_id is None:
            template.fifth_week_user_id = None
        else:
            fifth_week_user_result = await db.execute(
                select(User).where(User.id == template_data.fifth_week_user_id)
            )
            fifth_week_user = fifth_week_user_result.scalar_one_or_none()
            if not fifth_week_user:
                raise HTTPException(status_code=404, detail="Fifth-week user not found")
            template.fifth_week_user_id = template_data.fifth_week_user_id
    if template_data.ics309_enabled is not None:
        template.ics309_enabled = template_data.ics309_enabled
    if template_data.propagation_logging_enabled is not None:
        template.propagation_logging_enabled = template_data.propagation_logging_enabled
    if template_data.traffic_enabled is not None:
        template.traffic_enabled = template_data.traffic_enabled
    if template_data.mobile_priority_sort is not None:
        template.mobile_priority_sort = template_data.mobile_priority_sort
    if 'chat_grace_period_minutes' in template_data.model_fields_set:
        template.chat_grace_period_minutes = template_data.chat_grace_period_minutes
    if template_data.self_checkin_enabled is not None:
        template.self_checkin_enabled = template_data.self_checkin_enabled
    # model_fields_set, not "is not None": null is the meaningful "disabled" value
    if 'auto_lobby_minutes' in template_data.model_fields_set:
        template.auto_lobby_minutes = template_data.auto_lobby_minutes
    if template_data.topic_of_week_enabled is not None:
        template.topic_of_week_enabled = template_data.topic_of_week_enabled
    if template_data.topic_of_week_prompt is not None:
        template.topic_of_week_prompt = template_data.topic_of_week_prompt
    if template_data.poll_enabled is not None:
        template.poll_enabled = template_data.poll_enabled
    if template_data.poll_question is not None:
        template.poll_question = template_data.poll_question
    
    # Update owner if provided (owner/admin/co-manager can transfer ownership)
    if template_data.owner_id is not None and template_data.owner_id != template.owner_id:
        is_admin = current_user.role == UserRole.ADMIN
        is_owner = template.owner_id == current_user.id
        is_co_manager = await is_active_co_manager(db, template.id, current_user.id)
        if not (is_admin or is_owner or is_co_manager):
            raise HTTPException(
                status_code=403,
                detail="Only the schedule owner, a co-manager, or an admin can transfer ownership",
            )

        # Verify new owner exists
        new_owner_result = await db.execute(select(User).where(User.id == template_data.owner_id))
        new_owner = new_owner_result.scalar_one_or_none()
        if not new_owner:
            raise HTTPException(status_code=404, detail="New owner not found")
        template.owner_id = template_data.owner_id
    
    # Update frequencies if provided
    if template_data.frequency_ids is not None:
        # Remove existing frequencies
        await db.execute(
            delete(net_template_frequencies).where(
                net_template_frequencies.c.template_id == template_id
            )
        )
        # Add new frequencies
        for freq_id in template_data.frequency_ids:
            await db.execute(
                net_template_frequencies.insert().values(
                    template_id=template_id,
                    frequency_id=freq_id
                )
            )
    
    await db.commit()
    
    # Reload with frequencies
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.frequencies),
            selectinload(NetTemplate.fifth_week_user),
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one()
    
    # Get subscriber count
    count_result = await db.execute(
        select(func.count(NetTemplateSubscription.id))
        .where(NetTemplateSubscription.template_id == template_id)
    )
    subscriber_count = count_result.scalar() or 0
    
    # Check if current user is subscribed
    subscription_result = await db.execute(
        select(NetTemplateSubscription)
        .where(
            NetTemplateSubscription.template_id == template_id,
            NetTemplateSubscription.user_id == current_user.id
        )
    )
    is_subscribed = subscription_result.scalar_one_or_none() is not None
    
    return NetTemplateResponse.from_orm(template, subscriber_count=subscriber_count, is_subscribed=is_subscribed, can_manage=True, can_create_net=True)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a template"""
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Deletion is restricted to owner/co-manager/admin.
    # Active staff and NCS rotation members can manage schedule settings
    # but should not be able to permanently destroy a schedule.
    is_owner = template.owner_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    is_co_manager = await is_active_co_manager(db, template.id, current_user.id)
    if not (is_owner or is_admin or is_co_manager):
        raise HTTPException(status_code=403, detail="Only the schedule owner, a co-manager, or an admin can delete a schedule")
    
    await db.delete(template)
    await db.commit()


# ========== MERGE TEMPLATES ==========


