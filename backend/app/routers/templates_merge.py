import json
from datetime import datetime, timedelta, timezone
from typing import List

from app import schemas
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.logger import logger
from app.models import (
    AppSettings,
    CheckIn,
    Frequency,
    NCSRotationMember,
    NCSScheduleOverride,
    Net,
    NetRole,
    NetStatus,
    NetTemplate,
    NetTemplateSubscription,
    TemplateStaff,
    TopicHistory,
    User,
    UserRole,
    net_template_frequencies,
)
from app.permissions import check_template_permission
from app.schemas import (
    NetResponse,
    NetTemplateCreate,
    NetTemplateResponse,
    NetTemplateSubscriptionDetailResponse,
    NetTemplateSubscriptionResponse,
    NetTemplateUpdate,
    TemplateMergeConflict,
    TemplateMergePreview,
    TemplateMergeRequest,
    TemplateMergeResponse,
    public_display_name,
)

from app.routers.templates_core import is_active_co_manager

router = APIRouter()


async def _check_merge_permission(template: NetTemplate, user: User, db: AsyncSession) -> bool:
    """Only admin, template owner, or active co-manager can merge."""
    if user.role == UserRole.ADMIN or template.owner_id == user.id:
        return True
    return await is_active_co_manager(db, template.id, user.id)


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
    if not await _check_merge_permission(target, current_user, db):
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
        if not await _check_merge_permission(source, current_user, db):
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
    if not await _check_merge_permission(target, current_user, db):
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
        if not await _check_merge_permission(source, current_user, db):
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
    is_co_manager = await is_active_co_manager(db, template.id, current_user.id)
    if not (is_admin or template.owner_id == current_user.id or is_co_manager):
        raise HTTPException(
            status_code=403,
            detail="Only the schedule owner, a co-manager, or an admin can link nets to this schedule",
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


