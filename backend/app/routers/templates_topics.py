from typing import List

from app import schemas
from fastapi import APIRouter, Depends, HTTPException
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


