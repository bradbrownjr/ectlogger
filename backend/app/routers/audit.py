"""Admin > Activity: read the activity log (models.AuditEvent).

Admins only (get_admin_user, which also requires two-factor). Nothing here
writes; events are written by app/audit.py::record_event where each action
happens.
"""
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_user
from app.models import AuditEvent, User

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEventResponse(BaseModel):
    id: int
    created_at: datetime
    action: str
    actor_user_id: Optional[int]
    actor_label: Optional[str]
    ip: Optional[str]
    user_agent: Optional[str]
    location: Optional[str]
    target_type: Optional[str]
    target_id: Optional[int]
    target_label: Optional[str]
    subject_user_id: Optional[int]
    net_id: Optional[int]
    template_id: Optional[int]
    details: Optional[dict]


class AuditPage(BaseModel):
    items: List[AuditEventResponse]
    total: int


class IpAccount(BaseModel):
    user_id: Optional[int]
    label: Optional[str]
    events: int
    first_seen: datetime
    last_seen: datetime


def _response(event: AuditEvent) -> AuditEventResponse:
    try:
        details = json.loads(event.details) if event.details else None
    except ValueError:
        details = {"raw": event.details}
    return AuditEventResponse(
        id=event.id, created_at=event.created_at, action=event.action,
        actor_user_id=event.actor_user_id, actor_label=event.actor_label,
        ip=event.ip, user_agent=event.user_agent, location=event.location,
        target_type=event.target_type, target_id=event.target_id, target_label=event.target_label,
        subject_user_id=event.subject_user_id, net_id=event.net_id, template_id=event.template_id,
        details=details,
    )


@router.get("", response_model=AuditPage)
async def list_events(
    user_id: Optional[int] = Query(None, description="Events done by or to this account"),
    action: Optional[str] = Query(None, description="An action, or a group ending in '.' (e.g. 'auth.')"),
    net_id: Optional[int] = None,
    template_id: Optional[int] = None,
    ip: Optional[str] = None,
    search: Optional[str] = Query(None, max_length=100, description="Text in who, what, or the details"),
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Newest first. Every filter is optional and they combine with AND."""
    conditions = []
    if user_id is not None:
        conditions.append(or_(AuditEvent.actor_user_id == user_id, AuditEvent.subject_user_id == user_id))
    if action:
        conditions.append(AuditEvent.action.startswith(action) if action.endswith(".") else AuditEvent.action == action)
    if net_id is not None:
        conditions.append(AuditEvent.net_id == net_id)
    if template_id is not None:
        conditions.append(AuditEvent.template_id == template_id)
    if ip:
        conditions.append(AuditEvent.ip == ip.strip())
    if search:
        pattern = f"%{search.strip().lower()}%"
        conditions.append(or_(
            func.lower(AuditEvent.actor_label).like(pattern),
            func.lower(AuditEvent.target_label).like(pattern),
            func.lower(AuditEvent.details).like(pattern),
        ))
    if since is not None:
        conditions.append(AuditEvent.created_at >= since)
    if until is not None:
        conditions.append(AuditEvent.created_at <= until)

    total = (await db.execute(select(func.count(AuditEvent.id)).where(*conditions))).scalar_one()
    rows = (await db.execute(
        select(AuditEvent).where(*conditions)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(limit).offset(offset)
    )).scalars().all()
    return AuditPage(items=[_response(e) for e in rows], total=total)


@router.get("/ip-accounts", response_model=List[IpAccount])
async def accounts_seen_from_ip(
    ip: str = Query(..., min_length=1, max_length=64),
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Every account that did anything from this address, busiest first:
    the check for one person behind several accounts."""
    rows = (await db.execute(
        select(
            AuditEvent.actor_user_id,
            func.max(AuditEvent.actor_label),
            func.count(AuditEvent.id),
            func.min(AuditEvent.created_at),
            func.max(AuditEvent.created_at),
        )
        .where(AuditEvent.ip == ip.strip(), AuditEvent.actor_label.isnot(None))
        .group_by(AuditEvent.actor_user_id, AuditEvent.actor_label)
        .order_by(func.count(AuditEvent.id).desc())
    )).all()
    return [
        IpAccount(user_id=uid, label=label, events=count, first_seen=first, last_seen=last)
        for uid, label, count, first, last in rows
    ]
