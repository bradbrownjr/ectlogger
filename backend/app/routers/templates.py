from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, timedelta, timezone
from app.database import get_db
from app.models import NetTemplate, NetTemplateSubscription, User, net_template_frequencies, Frequency, Net, NetStatus, NCSRotationMember, NetRole, CheckIn, AppSettings, UserRole
from app.schemas import NetTemplateCreate, NetTemplateUpdate, NetTemplateResponse, NetTemplateSubscriptionResponse, NetResponse
from app.dependencies import get_current_user, get_current_user_optional
import json

router = APIRouter(prefix="/templates", tags=["templates"])


async def check_schedule_creation_eligibility(db: AsyncSession, user: User) -> tuple[bool, str]:
    """
    Check if user is eligible to create schedules based on app settings.
    Returns (is_eligible, error_message).
    Admins bypass all checks.
    """
    if user.role == UserRole.ADMIN:
        return True, ""
    
    # Get app settings
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    
    if not settings:
        # No settings, use defaults
        min_age_days = 7
        min_participations = 1
        max_per_day = 5
    else:
        min_age_days = settings.schedule_min_account_age_days or 7
        min_participations = settings.schedule_min_net_participations or 1
        max_per_day = settings.schedule_max_per_day or 5
    
    # Check account age
    if user.created_at:
        account_age = datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)
        if account_age.days < min_age_days:
            days_remaining = min_age_days - account_age.days
            return False, f"Your account must be at least {min_age_days} days old to create schedules. Please wait {days_remaining} more day(s)."
    
    # Check net participation count
    if min_participations > 0:
        participation_result = await db.execute(
            select(func.count(func.distinct(CheckIn.net_id)))
            .where(CheckIn.user_id == user.id)
        )
        participation_count = participation_result.scalar() or 0
        if participation_count < min_participations:
            return False, f"You must participate in at least {min_participations} net(s) before creating schedules. You have participated in {participation_count}."
    
    # Check daily creation limit
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
    
    template = NetTemplate(
        name=template_data.name,
        description=template_data.description,
        info_url=template_data.info_url,
        script=template_data.script,
        owner_id=owner_id,
        field_config=field_config_json,
        schedule_type=template_data.schedule_type,
        schedule_config=schedule_config_json
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
        .options(selectinload(NetTemplate.frequencies))
        .where(NetTemplate.id == template.id)
    )
    template = result.scalar_one()
    
    return NetTemplateResponse.from_orm(template, subscriber_count=0, is_subscribed=False)


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
        selectinload(NetTemplate.owner)
    )
    
    if not include_inactive:
        query = query.where(NetTemplate.is_active == True)
    
    if my_templates and current_user:
        query = query.where(NetTemplate.owner_id == current_user.id)
    
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
        if current_user:
            subscription_result = await db.execute(
                select(NetTemplateSubscription)
                .where(
                    NetTemplateSubscription.template_id == template.id,
                    NetTemplateSubscription.user_id == current_user.id
                )
            )
            is_subscribed = subscription_result.scalar_one_or_none() is not None
        
        template_responses.append(NetTemplateResponse.from_orm(
            template, 
            subscriber_count=subscriber_count,
            is_subscribed=is_subscribed,
            owner_callsign=template.owner.callsign if template.owner else None,
            owner_name=template.owner.name if template.owner else None
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
        .options(selectinload(NetTemplate.frequencies))
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
    
    return NetTemplateResponse.from_orm(template, subscriber_count=subscriber_count, is_subscribed=is_subscribed)


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
    
    # Check permissions
    if template.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this template")
    
    # Update fields
    if template_data.name is not None:
        template.name = template_data.name
    if template_data.description is not None:
        template.description = template_data.description
    if template_data.info_url is not None:
        template.info_url = template_data.info_url
    if template_data.script is not None:
        template.script = template_data.script
    if template_data.field_config is not None:
        template.field_config = json.dumps(template_data.field_config)
    if template_data.is_active is not None:
        template.is_active = template_data.is_active
    if template_data.schedule_type is not None:
        template.schedule_type = template_data.schedule_type
    if template_data.schedule_config is not None:
        template.schedule_config = json.dumps(template_data.schedule_config)
    
    # Update owner if provided (only owner or admin can transfer ownership)
    if template_data.owner_id is not None and template_data.owner_id != template.owner_id:
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
        .options(selectinload(NetTemplate.frequencies))
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
    
    return NetTemplateResponse.from_orm(template, subscriber_count=subscriber_count, is_subscribed=is_subscribed)


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
    
    # Check permissions
    if template.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this template")
    
    await db.delete(template)
    await db.commit()


@router.post("/{template_id}/subscribe", response_model=NetTemplateSubscriptionResponse)
async def subscribe_to_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Subscribe to a template to receive notifications"""
    # Check if template exists
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if already subscribed
    result = await db.execute(
        select(NetTemplateSubscription).where(
            NetTemplateSubscription.template_id == template_id,
            NetTemplateSubscription.user_id == current_user.id
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="Already subscribed to this template")
    
    # Create subscription
    subscription = NetTemplateSubscription(
        template_id=template_id,
        user_id=current_user.id
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    
    return NetTemplateSubscriptionResponse.model_validate(subscription)


@router.delete("/{template_id}/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_from_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unsubscribe from a template"""
    result = await db.execute(
        select(NetTemplateSubscription).where(
            NetTemplateSubscription.template_id == template_id,
            NetTemplateSubscription.user_id == current_user.id
        )
    )
    subscription = result.scalar_one_or_none()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Not subscribed to this template")
    
    await db.delete(subscription)
    await db.commit()


@router.get("/{template_id}/subscriptions", response_model=List[NetTemplateSubscriptionResponse])
async def list_template_subscriptions(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List subscribers to a template (owner/admin only)"""
    # Check if template exists and user has permission
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if template.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view subscriptions")
    
    result = await db.execute(
        select(NetTemplateSubscription).where(NetTemplateSubscription.template_id == template_id)
    )
    subscriptions = result.scalars().all()
    
    return [NetTemplateSubscriptionResponse.model_validate(s) for s in subscriptions]


@router.post("/{template_id}/create-net", response_model=NetResponse)
async def create_net_from_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new net from a template"""
    # Load template with frequencies and NCS rotation members
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.frequencies),
            selectinload(NetTemplate.rotation_members)
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if not template.is_active:
        raise HTTPException(status_code=400, detail="Template is not active")
    
    # Create net from template
    from app.routers.nets import net_frequencies as net_freq_table
    
    net = Net(
        name=template.name,
        description=template.description,
        owner_id=current_user.id,
        template_id=template_id,
        field_config=template.field_config,
        status=NetStatus.DRAFT,
        ics309_enabled=template.ics309_enabled or False
    )
    db.add(net)
    await db.flush()
    
    # Copy frequencies
    for freq in template.frequencies:
        await db.execute(
            net_freq_table.insert().values(net_id=net.id, frequency_id=freq.id)
        )
    
    # Copy NCS rotation members as NetRoles
    for member in template.rotation_members:
        net_role = NetRole(
            net_id=net.id,
            user_id=member.user_id,
            role="NCS"
        )
        db.add(net_role)
    
    await db.commit()
    
    # Reload with frequencies
    result = await db.execute(
        select(Net)
        .options(selectinload(Net.frequencies))
        .where(Net.id == net.id)
    )
    net = result.scalar_one()
    
    return NetResponse.from_orm(net)
