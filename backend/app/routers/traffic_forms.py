import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Form, FormDefinition, FormDisposition, Net, TrafficAction, TrafficLogEntry, User
from app.permissions import FormPermissionResult, check_form_permission, check_net_permission, is_admin
from app.schemas import (
    FormCreate,
    FormDetailResponse,
    FormListResponse,
    FormResponse,
    FormUpdate,
    TrafficSummaryResponse,
)
from app.traffic.log import append_entry
from app.traffic.promote import compute_promoted_fields
from app.traffic.visibility import form_visibility_clause

router = APIRouter(tags=["traffic-forms"])

# Stage C's reminder service (TRAFFIC-HANDLING-DESIGN.md D4) will replace this
# fixed threshold with the real precedence-scaled staleness ladder. Until that
# lands, "outstanding" on the per-net summary is a simple placeholder: a
# pending form held 24+ hours by its current holder.
_STALE_THRESHOLD = timedelta(hours=24)

_FORM_DETAIL_OPTIONS = (
    selectinload(Form.definition).selectinload(FormDefinition.fields),
    selectinload(Form.log_entries),
)


def _disposition_clause(disposition: FormDisposition):
    """Translate a derived FormDisposition into a filter on the cached
    Form.last_action column. Correct because last_action is always the most
    recent *non-SERVICED* action (see app/traffic/log.py::_apply_cache_update),
    which is exactly what derive_disposition inspects."""
    if disposition == FormDisposition.DRAFT:
        return Form.last_action.is_(None)
    if disposition == FormDisposition.PENDING:
        return Form.last_action.in_([TrafficAction.ORIGINATED, TrafficAction.RECEIVED])
    if disposition == FormDisposition.RELAYED:
        return Form.last_action == TrafficAction.RELAYED
    if disposition == FormDisposition.DELIVERED:
        return Form.last_action == TrafficAction.DELIVERED
    if disposition == FormDisposition.CANCELLED:
        return Form.last_action == TrafficAction.CANCELLED
    return None


@router.post("/forms", response_model=FormDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_form(
    data: FormCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a form instance. Normalizes nts_normalize fields, computes the
    check, promotes list/search columns, and inserts the initial ORIGINATED
    (default) or RECEIVED log entry, all in one transaction (append_entry
    commits; see app/traffic/log.py)."""
    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.form_type == data.form_type)
    )
    definition = result.scalar_one_or_none()
    if not definition or not definition.is_enabled:
        raise HTTPException(status_code=404, detail="Form definition not found or disabled")

    if data.net_id is not None:
        net_result = await db.execute(select(Net).where(Net.id == data.net_id))
        if net_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Net not found")

    missing = [
        f.label for f in definition.fields
        if f.is_required and not data.field_values.get(f.name)
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    initial = data.initial_log_entry
    action = initial.action if initial else TrafficAction.ORIGINATED
    if action not in (TrafficAction.ORIGINATED, TrafficAction.RECEIVED):
        raise HTTPException(
            status_code=400,
            detail="initial_log_entry.action must be 'originated' or 'received'",
        )

    promoted, values = compute_promoted_fields(definition, data.field_values)

    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        net_id=data.net_id,
        created_by_id=current_user.id,
        field_values=json.dumps(values),
        **promoted,
    )
    db.add(form)
    await db.flush()

    await append_entry(
        db, form, action,
        method=initial.method if initial else None,
        method_note=initial.method_note if initial else None,
        path_name=initial.path_name if initial else None,
        handed_to=initial.handed_to if initial else None,
        handed_to_user_id=initial.handed_to_user_id if initial else None,
        reported_by_user_id=current_user.id,
        net_id=(initial.net_id if initial else None) or data.net_id,
        note=initial.note if initial else None,
        occurred_at=initial.occurred_at if initial else None,
    )

    result = await db.execute(
        select(Form).options(*_FORM_DETAIL_OPTIONS).where(Form.id == form.id)
    )
    created_form = result.scalar_one()
    response = FormDetailResponse.from_orm(created_form)

    # Notify the net's traffic panel that a new form was filed, so it can
    # refetch (see TRAFFIC-HANDLING-DESIGN.md section 3.6). Only forms filed
    # on a net have anyone listening on that net's WebSocket group; a
    # standalone form (net_id is None) has no group to notify.
    if created_form.net_id is not None:
        from app.main import manager
        await manager.broadcast({
            "type": "traffic_logged",
            "data": {
                "form_id": created_form.id,
                "net_id": created_form.net_id,
                "form_type": created_form.form_type,
                "message_number": created_form.message_number,
            },
            "timestamp": datetime.utcnow().isoformat()
        }, created_form.net_id)

    return response


@router.get("/forms", response_model=FormListResponse)
async def list_forms(
    q: Optional[str] = None,
    form_type: Optional[str] = None,
    net_id: Optional[int] = None,
    disposition: Optional[FormDisposition] = None,
    precedence: Optional[str] = None,
    handling: Optional[str] = None,
    mine: Optional[bool] = None,
    held_by_me: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated, visibility-scoped list. The visibility rule is applied as a
    WHERE clause (app/traffic/visibility.py), so `total` reflects only what
    the caller may see -- a form outside that scope never shows up in the
    count, per TRAFFIC-HANDLING-DESIGN.md D3."""
    filters = []
    if not is_admin(current_user):
        filters.append(form_visibility_clause(current_user))
    if q:
        like = f"%{q}%"
        filters.append(or_(
            Form.subject.ilike(like),
            Form.addressee_display.ilike(like),
            Form.message_number.ilike(like),
        ))
    if form_type:
        filters.append(Form.form_type == form_type)
    if net_id is not None:
        filters.append(Form.net_id == net_id)
    if disposition is not None:
        filters.append(_disposition_clause(disposition))
    if precedence:
        filters.append(Form.precedence == precedence)
    if handling:
        filters.append(Form.handling == handling)
    if mine:
        filters.append(Form.created_by_id == current_user.id)
    if held_by_me:
        filters.append(Form.held_by_user_id == current_user.id)

    count_query = select(func.count()).select_from(Form)
    query = select(Form)
    if filters:
        count_query = count_query.where(and_(*filters))
        query = query.where(and_(*filters))

    total = (await db.execute(count_query)).scalar() or 0

    query = query.options(selectinload(Form.log_entries)).order_by(Form.filed_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    forms = result.scalars().all()

    return FormListResponse(items=[FormResponse.from_orm(f) for f in forms], total=total)


@router.get("/nets/{net_id}/forms", response_model=FormListResponse)
async def list_net_forms(
    net_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The per-net traffic panel's list. Gated on that net's NCS/logger/owner/
    admin (TRAFFIC-HANDLING-DESIGN.md D3 rule 4) -- once granted, the caller
    sees every form logged on this net, not just the ones they'd otherwise
    have chain-of-custody visibility into."""
    net_result = await db.execute(select(Net).where(Net.id == net_id))
    net = net_result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not await check_net_permission(db, net, current_user, required_roles=["ncs", "logger"]):
        raise HTTPException(status_code=403, detail="Not authorized to view this net's traffic")

    count_query = select(func.count()).select_from(Form).where(Form.net_id == net_id)
    total = (await db.execute(count_query)).scalar() or 0

    result = await db.execute(
        select(Form)
        .options(selectinload(Form.log_entries))
        .where(Form.net_id == net_id)
        .order_by(Form.filed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    forms = result.scalars().all()
    return FormListResponse(items=[FormResponse.from_orm(f) for f in forms], total=total)


@router.get("/nets/{net_id}/summary", response_model=TrafficSummaryResponse)
async def get_net_traffic_summary(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Counts by derived disposition for the per-net traffic panel's summary
    strip, plus a simple outstanding/stale count for the manager badge. Same
    visibility gate as GET /traffic/nets/{net_id}/forms (that net's
    NCS/logger/owner/admin, TRAFFIC-HANDLING-DESIGN.md D3 rule 4)."""
    net_result = await db.execute(select(Net).where(Net.id == net_id))
    net = net_result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not await check_net_permission(db, net, current_user, required_roles=["ncs", "logger"]):
        raise HTTPException(status_code=403, detail="Not authorized to view this net's traffic")

    counts = {}
    for disposition in FormDisposition:
        clause = _disposition_clause(disposition)
        count_query = select(func.count()).select_from(Form).where(Form.net_id == net_id, clause)
        counts[disposition] = (await db.execute(count_query)).scalar() or 0

    stale_cutoff = datetime.utcnow() - _STALE_THRESHOLD
    outstanding_query = select(func.count()).select_from(Form).where(
        Form.net_id == net_id,
        _disposition_clause(FormDisposition.PENDING),
        Form.held_since.isnot(None),
        Form.held_since <= stale_cutoff,
    )
    outstanding = (await db.execute(outstanding_query)).scalar() or 0

    return TrafficSummaryResponse(
        net_id=net_id,
        draft=counts[FormDisposition.DRAFT],
        pending=counts[FormDisposition.PENDING],
        relayed=counts[FormDisposition.RELAYED],
        delivered=counts[FormDisposition.DELIVERED],
        cancelled=counts[FormDisposition.CANCELLED],
        outstanding=outstanding,
    )


@router.get("/forms/{form_id}", response_model=FormDetailResponse)
async def get_form(
    form_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Form).options(*_FORM_DETAIL_OPTIONS).where(Form.id == form_id)
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    perm = await check_form_permission(db, form, current_user, "view")
    if perm == FormPermissionResult.DENIED:
        raise HTTPException(status_code=403, detail="Not authorized to view this form")

    return FormDetailResponse.from_orm(form)


@router.patch("/forms/{form_id}", response_model=FormResponse)
async def update_form(
    form_id: int,
    data: FormUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit field values while the form is still a draft. Once any log entry
    exists the form is append-only: return 409, not 403, so the client knows
    to append to the traffic log instead of retrying the edit."""
    result = await db.execute(
        select(Form)
        .options(
            selectinload(Form.definition).selectinload(FormDefinition.fields),
            selectinload(Form.log_entries),
        )
        .where(Form.id == form_id)
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    perm = await check_form_permission(db, form, current_user, "manage")
    if perm == FormPermissionResult.APPEND_ONLY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This form already has log entries and is append-only; log a hop instead of editing it",
        )
    if perm == FormPermissionResult.DENIED:
        raise HTTPException(status_code=403, detail="Not authorized to edit this form")

    if data.field_values is not None:
        existing = json.loads(form.field_values) if form.field_values else {}
        existing.update(data.field_values)
        promoted, existing = compute_promoted_fields(form.definition, existing)
        form.field_values = json.dumps(existing)
        for column, value in promoted.items():
            setattr(form, column, value)

    await db.commit()
    await db.refresh(form)
    return FormResponse.from_orm(form)


@router.delete("/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form(
    form_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a mis-filed draft. Submitter or admin only, and only while the
    form has no log entries -- a form with any history is a record, not a
    draft, and must not be deletable."""
    result = await db.execute(select(Form).where(Form.id == form_id))
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if not (form.created_by_id == current_user.id or is_admin(current_user)):
        raise HTTPException(status_code=403, detail="Not authorized to delete this form")

    entries_result = await db.execute(
        select(TrafficLogEntry.id).where(TrafficLogEntry.form_id == form.id).limit(1)
    )
    if entries_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a form once it has log entries",
        )

    await db.delete(form)
    await db.commit()
    return None
