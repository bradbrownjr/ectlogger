from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, timedelta, timezone
from app.database import get_db
from app.models import NetTemplate, NetTemplateSubscription, User, net_template_frequencies, Frequency, Net, NetStatus, NCSRotationMember, NetRole, CheckIn, AppSettings, UserRole, TemplateStaff, NCSScheduleOverride, TopicHistory
from app.schemas import NetTemplateCreate, NetTemplateUpdate, NetTemplateResponse, NetTemplateSubscriptionResponse, NetResponse, TemplateMergeRequest, TemplateMergePreview, TemplateMergeConflict, TemplateMergeResponse
from app import schemas
from app.dependencies import get_current_user, get_current_user_optional
import json

router = APIRouter(prefix="/templates", tags=["templates"])


async def check_template_permission(db: AsyncSession, template: NetTemplate, user: User) -> bool:
    """Check if user has permission to manage a template (owner, admin, staff, or NCS rotation member)"""
    # Owner and admin always have permission
    if template.owner_id == user.id or user.role == UserRole.ADMIN:
        return True
    
    # Check if user is in the staff list for this template
    from app.models import TemplateStaff
    staff_result = await db.execute(
        select(TemplateStaff).where(
            TemplateStaff.template_id == template.id,
            TemplateStaff.user_id == user.id,
            TemplateStaff.is_active == True
        )
    )
    if staff_result.scalar_one_or_none():
        return True
    
    # Check if user is in the NCS rotation for this template (also grants permission)
    result = await db.execute(
        select(NCSRotationMember).where(
            NCSRotationMember.template_id == template.id,
            NCSRotationMember.user_id == user.id,
            NCSRotationMember.is_active == True
        )
    )
    if result.scalar_one_or_none():
        return True
    
    return False


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
        schedule_config=schedule_config_json,
        ics309_enabled=template_data.ics309_enabled or False,
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
        .options(selectinload(NetTemplate.frequencies))
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
        selectinload(NetTemplate.rotation_members)
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
            owner_name=template.owner.name if template.owner else None,
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
    if template_data.ics309_enabled is not None:
        template.ics309_enabled = template_data.ics309_enabled
    if template_data.topic_of_week_enabled is not None:
        template.topic_of_week_enabled = template_data.topic_of_week_enabled
    if template_data.topic_of_week_prompt is not None:
        template.topic_of_week_prompt = template_data.topic_of_week_prompt
    if template_data.poll_enabled is not None:
        template.poll_enabled = template_data.poll_enabled
    if template_data.poll_question is not None:
        template.poll_question = template_data.poll_question
    
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
    
    # Check permissions (owner, admin, or NCS rotation member)
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to delete this template")
    
    await db.delete(template)
    await db.commit()


# ========== MERGE TEMPLATES ==========


async def _check_merge_permission(template: NetTemplate, user: User) -> bool:
    """Only admin or template owner can merge (destructive operation)"""
    return user.role == UserRole.ADMIN or template.owner_id == user.id


def _compare_template_fields(target: NetTemplate, source: NetTemplate) -> list:
    """Compare configurable fields between two templates, return conflicts"""
    conflicts = []
    compare_fields = [
        ("schedule_type", "Schedule type"),
        ("schedule_config", "Schedule config"),
        ("field_config", "Field configuration"),
        ("ics309_enabled", "ICS-309 enabled"),
        ("topic_of_week_enabled", "Topic of the Week enabled"),
        ("topic_of_week_prompt", "Topic prompt"),
        ("poll_enabled", "Poll enabled"),
        ("poll_question", "Poll question"),
        ("script", "Net script"),
        ("info_url", "Info URL"),
    ]
    for field_attr, field_label in compare_fields:
        target_val = getattr(target, field_attr)
        source_val = getattr(source, field_attr)
        # Normalize None vs empty string vs '{}'
        t_norm = (target_val or "") if isinstance(target_val, str) else target_val
        s_norm = (source_val or "") if isinstance(source_val, str) else source_val
        if t_norm != s_norm:
            # Truncate long values for display
            t_display = str(target_val)[:100] if target_val else "(empty)"
            s_display = str(source_val)[:100] if source_val else "(empty)"
            conflicts.append(TemplateMergeConflict(
                field=field_label,
                target_value=t_display,
                source_value=s_display,
                source_template_name=source.name,
            ))
    return conflicts


@router.post("/merge/preview", response_model=TemplateMergePreview)
async def preview_merge(
    merge_data: TemplateMergeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Preview what a merge operation will do, including conflicts"""
    # Validate target not in source list
    if merge_data.target_template_id in merge_data.source_template_ids:
        raise HTTPException(status_code=400, detail="Target template cannot be in source list")

    # Load target template
    target_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == merge_data.target_template_id)
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target template not found")
    if not await _check_merge_permission(target, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to merge into this template")

    # Load source templates
    source_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id.in_(merge_data.source_template_ids))
    )
    sources = source_result.scalars().all()
    if len(sources) != len(merge_data.source_template_ids):
        found_ids = {s.id for s in sources}
        missing = [sid for sid in merge_data.source_template_ids if sid not in found_ids]
        raise HTTPException(status_code=404, detail=f"Source template(s) not found: {missing}")

    # Permission check on all sources
    for source in sources:
        if not await _check_merge_permission(source, current_user):
            raise HTTPException(status_code=403, detail=f"Not authorized to merge template '{source.name}' (id={source.id})")

    # Gather stats for each source
    source_info = []
    total_nets = 0
    total_subs = 0
    total_staff = 0
    total_rotation = 0
    all_conflicts = []

    # Get existing target subscriber/staff/rotation user_ids for dedup counting
    target_sub_result = await db.execute(
        select(NetTemplateSubscription.user_id).where(NetTemplateSubscription.template_id == target.id)
    )
    target_sub_users = {row[0] for row in target_sub_result.fetchall()}

    target_staff_result = await db.execute(
        select(TemplateStaff.user_id).where(TemplateStaff.template_id == target.id)
    )
    target_staff_users = {row[0] for row in target_staff_result.fetchall()}

    target_rotation_result = await db.execute(
        select(NCSRotationMember.user_id).where(NCSRotationMember.template_id == target.id)
    )
    target_rotation_users = {row[0] for row in target_rotation_result.fetchall()}

    for source in sources:
        # Count nets
        net_count_result = await db.execute(
            select(func.count(Net.id)).where(Net.template_id == source.id)
        )
        net_count = net_count_result.scalar() or 0
        total_nets += net_count

        # Count new subscribers (not already on target)
        sub_result = await db.execute(
            select(NetTemplateSubscription.user_id).where(NetTemplateSubscription.template_id == source.id)
        )
        source_sub_users = {row[0] for row in sub_result.fetchall()}
        new_subs = len(source_sub_users - target_sub_users)
        total_subs += new_subs
        target_sub_users |= source_sub_users  # Accumulate for subsequent sources

        # Count new staff
        staff_result = await db.execute(
            select(TemplateStaff.user_id).where(TemplateStaff.template_id == source.id)
        )
        source_staff_users = {row[0] for row in staff_result.fetchall()}
        new_staff = len(source_staff_users - target_staff_users)
        total_staff += new_staff
        target_staff_users |= source_staff_users

        # Count new rotation members
        rotation_result = await db.execute(
            select(NCSRotationMember.user_id).where(NCSRotationMember.template_id == source.id)
        )
        source_rotation_users = {row[0] for row in rotation_result.fetchall()}
        new_rotation = len(source_rotation_users - target_rotation_users)
        total_rotation += new_rotation
        target_rotation_users |= source_rotation_users

        source_info.append({
            "id": source.id,
            "name": source.name,
            "net_count": net_count,
            "subscriber_count": len(source_sub_users),
        })

        # Detect conflicts
        all_conflicts.extend(_compare_template_fields(target, source))

    return TemplateMergePreview(
        target_template_id=target.id,
        target_template_name=target.name,
        source_templates=source_info,
        total_nets_moved=total_nets,
        total_subscribers_moved=total_subs,
        total_staff_moved=total_staff,
        total_rotation_members_moved=total_rotation,
        conflicts=all_conflicts,
    )


@router.post("/merge", response_model=TemplateMergeResponse)
async def merge_templates(
    merge_data: TemplateMergeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Merge source templates into a target template.
    Moves all nets, subscriptions, staff, rotation members, topic history,
    and schedule overrides. Source templates are deleted after merge.
    """
    import logging
    logger = logging.getLogger(__name__)

    # Validate target not in source list
    if merge_data.target_template_id in merge_data.source_template_ids:
        raise HTTPException(status_code=400, detail="Target template cannot be in source list")

    # Load target template
    target_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == merge_data.target_template_id)
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target template not found")
    if not await _check_merge_permission(target, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to merge into this template")

    # Load source templates
    source_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id.in_(merge_data.source_template_ids))
    )
    sources = source_result.scalars().all()
    if len(sources) != len(merge_data.source_template_ids):
        found_ids = {s.id for s in sources}
        missing = [sid for sid in merge_data.source_template_ids if sid not in found_ids]
        raise HTTPException(status_code=404, detail=f"Source template(s) not found: {missing}")

    for source in sources:
        if not await _check_merge_permission(source, current_user):
            raise HTTPException(status_code=403, detail=f"Not authorized to merge template '{source.name}' (id={source.id})")

    source_ids = [s.id for s in sources]
    target_id = target.id

    # --- All operations in a single transaction ---

    # 1. Reassociate all nets from source templates to target
    nets_result = await db.execute(
        select(Net).where(Net.template_id.in_(source_ids))
    )
    nets_to_move = nets_result.scalars().all()
    nets_moved = len(nets_to_move)
    for net in nets_to_move:
        net.template_id = target_id
    # IMPORTANT: flush the FK updates to the database BEFORE the source-template
    # deletions below. NetTemplate.nets is a one-to-many without cascade or
    # passive_deletes, so when SQLAlchemy flushes a source DELETE it issues a
    # bulk "UPDATE nets SET template_id=NULL WHERE template_id=<source_id>" to
    # null out orphans. If we let that happen in the same flush as the FK
    # reassignment, the nullify pass can clobber the just-updated rows and
    # nets get silently detached from the merged schedule. Flushing here
    # commits the new FK values first so the nullify pass affects 0 rows.
    await db.flush()
    logger.info(f"Merge: moved {nets_moved} nets to template {target_id}")

    # 2. Move subscriptions (skip duplicates)
    target_sub_result = await db.execute(
        select(NetTemplateSubscription.user_id).where(NetTemplateSubscription.template_id == target_id)
    )
    existing_sub_users = {row[0] for row in target_sub_result.fetchall()}

    source_subs_result = await db.execute(
        select(NetTemplateSubscription).where(NetTemplateSubscription.template_id.in_(source_ids))
    )
    source_subs = source_subs_result.scalars().all()
    subs_moved = 0
    for sub in source_subs:
        if sub.user_id not in existing_sub_users:
            sub.template_id = target_id
            existing_sub_users.add(sub.user_id)
            subs_moved += 1
        else:
            await db.delete(sub)
    logger.info(f"Merge: moved {subs_moved} subscriptions, removed duplicates")

    # 3. Move staff (skip duplicates)
    target_staff_result = await db.execute(
        select(TemplateStaff.user_id).where(TemplateStaff.template_id == target_id)
    )
    existing_staff_users = {row[0] for row in target_staff_result.fetchall()}

    source_staff_result = await db.execute(
        select(TemplateStaff).where(TemplateStaff.template_id.in_(source_ids))
    )
    source_staff = source_staff_result.scalars().all()
    staff_moved = 0
    for staff in source_staff:
        if staff.user_id not in existing_staff_users:
            staff.template_id = target_id
            existing_staff_users.add(staff.user_id)
            staff_moved += 1
        else:
            await db.delete(staff)
    logger.info(f"Merge: moved {staff_moved} staff members")

    # 4. Move NCS rotation members (skip duplicates, append positions)
    target_rotation_result = await db.execute(
        select(NCSRotationMember).where(NCSRotationMember.template_id == target_id)
                                 .order_by(NCSRotationMember.position.desc())
    )
    existing_rotation = target_rotation_result.scalars().all()
    existing_rotation_users = {m.user_id for m in existing_rotation}
    max_position = max((m.position for m in existing_rotation), default=0)

    source_rotation_result = await db.execute(
        select(NCSRotationMember).where(NCSRotationMember.template_id.in_(source_ids))
                                  .order_by(NCSRotationMember.position)
    )
    source_rotation = source_rotation_result.scalars().all()
    rotation_moved = 0
    for member in source_rotation:
        if member.user_id not in existing_rotation_users:
            max_position += 1
            member.template_id = target_id
            member.position = max_position
            existing_rotation_users.add(member.user_id)
            rotation_moved += 1
        else:
            await db.delete(member)
    logger.info(f"Merge: moved {rotation_moved} rotation members")

    # 5. Move schedule overrides
    source_overrides_result = await db.execute(
        select(NCSScheduleOverride).where(NCSScheduleOverride.template_id.in_(source_ids))
    )
    for override in source_overrides_result.scalars().all():
        override.template_id = target_id

    # 6. Move topic history
    source_topics_result = await db.execute(
        select(TopicHistory).where(TopicHistory.template_id.in_(source_ids))
    )
    for topic in source_topics_result.scalars().all():
        topic.template_id = target_id

    # 7. Delete source templates (cascade handles any remaining orphan records)
    # IMPORTANT: flush ALL FK reassignments above before issuing any source
    # template DELETEs. SQLAlchemy's dependency processor decides how to handle
    # orphaned children at flush time based on what's currently in the DB. If
    # the FK updates from steps 1-6 haven't been flushed yet, the source DELETE
    # can trigger nullify/delete passes that clobber the just-reparented rows.
    # See merge_templates docstring and the comment in step 1.
    await db.flush()
    for source in sources:
        await db.delete(source)
    logger.info(f"Merge: deleted {len(sources)} source templates")

    await db.commit()

    logger.info(f"Merge complete: {nets_moved} nets, {subs_moved} subs, {staff_moved} staff, {rotation_moved} rotation → template {target_id}")

    return TemplateMergeResponse(
        target_template_id=target_id,
        nets_moved=nets_moved,
        subscribers_moved=subs_moved,
        staff_moved=staff_moved,
        rotation_members_moved=rotation_moved,
        templates_deleted=len(sources),
    )


@router.get("/{template_id}/linkable-nets")
async def list_linkable_nets(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List nets that the current user could attach to this schedule/template.

    Returns nets that:
    - Are NOT already linked to this template, AND
    - Are owned by the current user (or any net if caller is admin).

    Used by the "Link existing net" UI on the schedule statistics page so an
    NCS can pull an ad-hoc net into the right schedule after the fact.
    """
    # Verify the template exists and the caller is allowed to attach to it.
    template_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = template_result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    is_admin = current_user.role == UserRole.ADMIN
    if not (is_admin or template.owner_id == current_user.id):
        raise HTTPException(
            status_code=403,
            detail="Only the schedule owner or an admin can link nets to this schedule",
        )

    # Build candidate net query
    query = (
        select(Net)
        .options(selectinload(Net.owner))
        .where((Net.template_id != template_id) | (Net.template_id.is_(None)))
        .order_by(Net.started_at.desc().nullslast(), Net.created_at.desc())
        .limit(500)
    )
    if not is_admin:
        query = query.where(Net.owner_id == current_user.id)

    result = await db.execute(query)
    nets = result.scalars().all()

    return [
        {
            "id": n.id,
            "name": n.name,
            "status": n.status.value if n.status else None,
            "started_at": n.started_at.isoformat() if n.started_at else None,
            "closed_at": n.closed_at.isoformat() if n.closed_at else None,
            "owner_callsign": n.owner.callsign if n.owner else None,
            "current_template_id": n.template_id,
        }
        for n in nets
    ]


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
    
    # Check permissions (owner, admin, or NCS rotation member)
    if not await check_template_permission(db, template, current_user):
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
    
    # Check if user has permission to create a net from this template
    # Must be: admin, template owner, staff member, or NCS rotation member
    is_admin = current_user.role == UserRole.ADMIN
    is_owner = template.owner_id == current_user.id
    is_rotation_member = any(member.user_id == current_user.id for member in template.rotation_members)
    
    # Check staff table
    is_staff = False
    if not (is_admin or is_owner or is_rotation_member):
        from app.models import TemplateStaff
        staff_result = await db.execute(
            select(TemplateStaff).where(
                TemplateStaff.template_id == template.id,
                TemplateStaff.user_id == current_user.id,
                TemplateStaff.is_active == True
            )
        )
        is_staff = staff_result.scalar_one_or_none() is not None
    
    if not (is_admin or is_owner or is_rotation_member or is_staff):
        raise HTTPException(
            status_code=403, 
            detail="Only admins, template owners, or designated staff can create nets from this template"
        )
    
    # Calculate scheduled_start_time based on template's schedule config
    # Only for recurring schedules (daily, weekly, monthly) - not for one_time or ad_hoc
    scheduled_start_time = None
    if template.schedule_type in ('daily', 'weekly', 'monthly') and template.schedule_config:
        try:
            config = json.loads(template.schedule_config) if isinstance(template.schedule_config, str) else template.schedule_config
            time_str = config.get('time', '19:00')
            hour, minute = map(int, time_str.split(':'))
            
            # Get timezone from config (default to America/New_York if not specified)
            tz_name = config.get('timezone', 'America/New_York')
            try:
                import zoneinfo
                local_tz = zoneinfo.ZoneInfo(tz_name)
            except:
                # Fallback if zoneinfo not available
                local_tz = None
            
            # Calculate the next occurrence based on schedule type
            now = datetime.now(timezone.utc)
            if local_tz:
                now_local = now.astimezone(local_tz)
            else:
                now_local = now
            
            if template.schedule_type == 'daily':
                # For daily nets, scheduled time is today at the specified time
                # If that time has passed, it's tomorrow
                scheduled_local = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled_local <= now_local:
                    scheduled_local = scheduled_local + timedelta(days=1)
            elif template.schedule_type == 'weekly':
                # For weekly nets, find the next occurrence of the specified day
                day_of_week = config.get('day_of_week', 0)  # 0 = Sunday in our config
                # Convert to Python weekday (0 = Monday)
                python_weekday = (day_of_week - 1) % 7 if day_of_week > 0 else 6
                days_ahead = python_weekday - now_local.weekday()
                if days_ahead < 0 or (days_ahead == 0 and now_local.hour * 60 + now_local.minute >= hour * 60 + minute):
                    days_ahead += 7
                scheduled_local = (now_local + timedelta(days=days_ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)
            elif template.schedule_type == 'monthly':
                # For monthly nets, use the next scheduled date from calculate_schedule_dates
                # For now, just use today's date with the time - the NCS rotation handles the complex logic
                scheduled_local = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled_local <= now_local:
                    scheduled_local = scheduled_local + timedelta(days=1)
            else:
                scheduled_local = None
            
            # Convert back to UTC for storage
            if scheduled_local and local_tz:
                scheduled_start_time = scheduled_local.astimezone(timezone.utc)
            elif scheduled_local:
                scheduled_start_time = scheduled_local.replace(tzinfo=timezone.utc)
        except Exception as e:
            # Log error but don't fail net creation
            import logging
            logging.warning(f"Failed to calculate scheduled_start_time: {e}")
            scheduled_start_time = None
    
    # Create net from template
    from app.routers.nets import net_frequencies as net_freq_table
    
    net = Net(
        name=template.name,
        description=template.description,
        owner_id=current_user.id,
        template_id=template_id,
        field_config=template.field_config,
        status=NetStatus.DRAFT,
        ics309_enabled=template.ics309_enabled or False,
        topic_of_week_enabled=template.topic_of_week_enabled or False,
        topic_of_week_prompt=template.topic_of_week_prompt,
        poll_enabled=template.poll_enabled or False,
        poll_question=template.poll_question,
        scheduled_start_time=scheduled_start_time
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



@router.get("/{template_id}/topic-history", response_model=List[schemas.TopicHistoryResponse])
async def get_topic_history(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get topic history for a template (visible to all authenticated users)"""
    # Verify template exists
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get topic history ordered by most recent first
    from app.models import TopicHistory
    result = await db.execute(
        select(TopicHistory)
        .where(TopicHistory.template_id == template_id)
        .order_by(TopicHistory.used_date.desc())
    )
    topics = result.scalars().all()
    
    return topics


@router.post("/{template_id}/topic-history", response_model=schemas.TopicHistoryResponse)
async def add_topic_history(
    template_id: int,
    topic_data: schemas.TopicHistoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually add a historical topic entry (NCS staff only)"""
    # Verify template exists and user has permission
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if user has permission (owner, admin, staff, or rotation member)
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to manage this template")
    
    # Create topic history entry
    from app.models import TopicHistory
    topic_entry = TopicHistory(
        template_id=template_id,
        topic=topic_data.topic,
        used_date=topic_data.used_date,
        net_id=None  # No associated net for manually added topics
    )
    db.add(topic_entry)
    await db.commit()
    await db.refresh(topic_entry)
    
    return topic_entry
