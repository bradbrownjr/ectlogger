"""
The chain-of-custody log's API surface: append a hop, list the chain, admin
delete-last, and the caller's delivery inbox. See
TRAFFIC-HANDLING-DESIGN.md section 3.3.

This router calls app/traffic/log.py::append_entry/recompute_form_cache for
every write -- it never reimplements the cache-update or disposition logic
those own. See TRAFFIC-HANDLING-DESIGN.md D7 and R2.
"""
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Form, TrafficAction, TrafficLogEntry, User
from app.permissions import FormPermissionResult, check_form_permission, is_admin
from app.schemas import FormResponse, TrafficInboxResponse, TrafficLogEntryCreate, TrafficLogEntryResponse
from app.traffic.log import append_entry, recompute_form_cache

router = APIRouter(tags=["traffic-log"])


async def _get_form_or_404(db: AsyncSession, form_id: int) -> Form:
    result = await db.execute(select(Form).where(Form.id == form_id))
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


@router.post("/forms/{form_id}/log", response_model=TrafficLogEntryResponse, status_code=status.HTTP_201_CREATED)
async def append_log_entry(
    form_id: int,
    data: TrafficLogEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Append one hop to the form's chain of custody. Anyone with view
    permission may append -- in real traffic handling the person who knows a
    message moved is whoever moved it, and that is often not the submitter
    (TRAFFIC-HANDLING-DESIGN.md section 3.3)."""
    form = await _get_form_or_404(db, form_id)

    perm = await check_form_permission(db, form, current_user, "view")
    if perm == FormPermissionResult.DENIED:
        raise HTTPException(status_code=403, detail="Not authorized to log a hop on this form")

    entry = await append_entry(
        db, form, data.action,
        method=data.method,
        method_note=data.method_note,
        path_name=data.path_name,
        handed_to=data.handed_to,
        handed_to_user_id=data.handed_to_user_id,
        reported_by_user_id=current_user.id,
        net_id=data.net_id,
        note=data.note,
        occurred_at=data.occurred_at,
    )

    # Notify the form's net (if any) that the chain changed, so the Traffic
    # panel and the inbox badge can refetch. Mirrors traffic_forms.py's
    # traffic_logged broadcast; only fires when the form has a net to notify.
    if form.net_id is not None:
        from app.main import manager
        await manager.broadcast({
            "type": "traffic_log_changed",
            "data": {
                "form_id": form.id,
                "net_id": form.net_id,
                "action": entry.action.value,
            },
            "timestamp": datetime.utcnow().isoformat()
        }, form.net_id)

    return TrafficLogEntryResponse.from_orm(entry)


@router.get("/forms/{form_id}/log", response_model=List[TrafficLogEntryResponse])
async def list_log_entries(
    form_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The chain, ordered by sequence, for the timeline panel. Also embedded
    in GET /traffic/forms/{id}."""
    form = await _get_form_or_404(db, form_id)

    perm = await check_form_permission(db, form, current_user, "view")
    if perm == FormPermissionResult.DENIED:
        raise HTTPException(status_code=403, detail="Not authorized to view this form's log")

    result = await db.execute(
        select(TrafficLogEntry).where(TrafficLogEntry.form_id == form_id).order_by(TrafficLogEntry.sequence)
    )
    entries = result.scalars().all()
    return [TrafficLogEntryResponse.from_orm(e) for e in entries]


@router.delete("/forms/{form_id}/log/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log_entry(
    form_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin only, and only the most recent hop by sequence. The chain is
    append-only by design (TRAFFIC-HANDLING-DESIGN.md D7); this exists only
    for genuine mis-clicks, never as a general correction path -- the normal
    correction is appending a new entry."""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only an admin may delete a traffic log entry")

    form = await _get_form_or_404(db, form_id)

    result = await db.execute(
        select(TrafficLogEntry).where(TrafficLogEntry.form_id == form_id).order_by(TrafficLogEntry.sequence)
    )
    entries = result.scalars().all()
    if not entries:
        raise HTTPException(status_code=404, detail="This form has no log entries")

    last = entries[-1]
    if last.id != entry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only the most recent log entry may be deleted; the chain is append-only",
        )

    await db.delete(last)
    await db.flush()
    # Rebuild the cached held_by_user_id/held_since/last_action from the
    # remaining log rather than hand-rolling the reversal -- this is exactly
    # what recompute_form_cache exists for (R2's self-healing property).
    await recompute_form_cache(db, form)
    return None


@router.get("/inbox", response_model=TrafficInboxResponse)
async def get_inbox(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's pending-held traffic, oldest first. Exact query shape
    from TRAFFIC-HANDLING-DESIGN.md section 2.5, served by the composite
    index ix_forms_inbox -- deliberately cheap, drives the navbar badge and
    the Profile view."""
    result = await db.execute(
        select(Form)
        .options(selectinload(Form.log_entries))
        .where(
            Form.held_by_user_id == current_user.id,
            Form.last_action.in_([TrafficAction.ORIGINATED, TrafficAction.RECEIVED]),
        )
        .order_by(Form.held_since.asc())
    )
    forms = result.scalars().all()

    return TrafficInboxResponse(count=len(forms), items=[FormResponse.from_orm(f) for f in forms])
