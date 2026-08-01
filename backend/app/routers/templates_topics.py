from typing import List

from app import schemas
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    NetTemplate,
    TopicHistory,
    User,
)
from app.permissions import check_template_permission

router = APIRouter()

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


async def _get_owned_topic_entry(
    db: AsyncSession, template_id: int, topic_id: int, current_user: User
) -> TopicHistory:
    """Shared lookup + permission check for editing/deleting a topic history entry."""
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to manage this template")

    result = await db.execute(
        select(TopicHistory).where(
            TopicHistory.id == topic_id,
            TopicHistory.template_id == template_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Topic history entry not found")

    return entry


@router.put("/{template_id}/topic-history/{topic_id}", response_model=schemas.TopicHistoryResponse)
async def update_topic_history(
    template_id: int,
    topic_id: int,
    topic_data: schemas.TopicHistoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Edit a topic history entry's text and/or date (NCS staff only)"""
    entry = await _get_owned_topic_entry(db, template_id, topic_id, current_user)

    if topic_data.topic is not None:
        entry.topic = topic_data.topic
    if topic_data.used_date is not None:
        entry.used_date = topic_data.used_date

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{template_id}/topic-history/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_topic_history(
    template_id: int,
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a topic history entry (NCS staff only)"""
    entry = await _get_owned_topic_entry(db, template_id, topic_id, current_user)
    await db.delete(entry)
    await db.commit()


