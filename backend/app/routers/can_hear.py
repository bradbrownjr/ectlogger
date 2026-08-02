"""
"Can hear" inter-station propagation logging (Phase 1 - Schema and API).

Records directional "who can hear whom" reports during a net. See
docs/ROADMAP.md "Relaying & Propagation Mapping" for the full settled data
model rationale: directional edges (not a blob), no separate report-header
row, reconcile-on-save semantics (insert new / delete unchecked / touch
reported_at on ones that stay checked). The NULL-frequency case (a NULL does
not participate in the main UNIQUE constraint) is closed by a partial unique
index (see migration 049); a concurrent-save duplicate on either that index
or the main unique constraint surfaces as an IntegrityError, which is caught
below and reported as a 409 rather than a 500.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from typing import List
from datetime import datetime
from app.database import get_db
from app.models import CanHearReport, CheckIn, Net, User, net_frequencies
from app.schemas import CanHearReportResponse, CanHearReportSave
from app.dependencies import get_current_user
from app.permissions import check_net_permission

router = APIRouter(prefix="/nets", tags=["can-hear"])


async def _build_report_responses(db: AsyncSession, net_id: int, reports: List[CanHearReport]) -> List[CanHearReportResponse]:
    """Attach reporter/heard callsigns to a list of CanHearReport rows."""
    if not reports:
        return []

    check_in_ids = {r.reporter_check_in_id for r in reports} | {r.heard_check_in_id for r in reports}
    result = await db.execute(select(CheckIn).where(CheckIn.id.in_(check_in_ids)))
    callsigns_by_id = {c.id: c.callsign for c in result.scalars().all()}

    return [
        CanHearReportResponse(
            id=r.id,
            net_id=r.net_id,
            reporter_check_in_id=r.reporter_check_in_id,
            heard_check_in_id=r.heard_check_in_id,
            reporter_callsign=callsigns_by_id.get(r.reporter_check_in_id, ""),
            heard_callsign=callsigns_by_id.get(r.heard_check_in_id, ""),
            frequency_id=r.frequency_id,
            reported_by_user_id=r.reported_by_user_id,
            reported_at=r.reported_at,
        )
        for r in reports
    ]


@router.get("/{net_id}/can-hear-reports", response_model=List[CanHearReportResponse])
async def list_can_hear_reports(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all 'can hear' reports for a net. Reading is not more sensitive
    than the check-in list, so no permission gate beyond normal auth."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    result = await db.execute(select(CanHearReport).where(CanHearReport.net_id == net_id))
    reports = result.scalars().all()

    return await _build_report_responses(db, net_id, reports)


@router.put("/{net_id}/can-hear-reports", response_model=List[CanHearReportResponse])
async def save_can_hear_report(
    net_id: int,
    payload: CanHearReportSave,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reconcile the set of stations reporter_check_in_id can hear on
    frequency_id: insert newly-checked edges, delete unchecked ones, and
    touch reported_at on edges that stay checked (a reconfirmation is a
    more current data point than the one it replaced)."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    if not net.propagation_logging_enabled:
        raise HTTPException(status_code=403, detail="Station-to-station coverage logging is not enabled for this net")

    if not await check_net_permission(db, net, current_user, ["NCS", "LOGGER", "RELAY"]):
        raise HTTPException(status_code=403, detail="Not authorized to record coverage reports")

    result = await db.execute(select(CheckIn).where(CheckIn.id == payload.reporter_check_in_id))
    reporter_check_in = result.scalar_one_or_none()
    if not reporter_check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    if reporter_check_in.net_id != net_id:
        raise HTTPException(status_code=400, detail="Check-in does not belong to this net")

    if payload.reporter_check_in_id in payload.heard_check_in_ids:
        raise HTTPException(status_code=400, detail="A station cannot report hearing itself")

    if payload.heard_check_in_ids:
        result = await db.execute(
            select(CheckIn.id).where(
                CheckIn.id.in_(payload.heard_check_in_ids),
                CheckIn.net_id == net_id,
            )
        )
        valid_heard_ids = {r for r in result.scalars().all()}
        if valid_heard_ids != set(payload.heard_check_in_ids):
            raise HTTPException(status_code=400, detail="One or more heard check-ins do not belong to this net")

    if payload.frequency_id is not None:
        result = await db.execute(
            select(net_frequencies.c.frequency_id).where(
                net_frequencies.c.net_id == net_id,
                net_frequencies.c.frequency_id == payload.frequency_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Frequency does not belong to this net")

    # Load existing edges for this (reporter, frequency) pair
    freq_filter = (
        CanHearReport.frequency_id.is_(None)
        if payload.frequency_id is None
        else CanHearReport.frequency_id == payload.frequency_id
    )
    result = await db.execute(
        select(CanHearReport).where(
            CanHearReport.reporter_check_in_id == payload.reporter_check_in_id,
            freq_filter,
        )
    )
    existing_reports = result.scalars().all()
    existing_by_heard_id = {r.heard_check_in_id: r for r in existing_reports}
    existing_ids = set(existing_by_heard_id.keys())
    incoming_ids = set(payload.heard_check_in_ids)

    to_insert = incoming_ids - existing_ids
    to_delete = existing_ids - incoming_ids
    to_touch = existing_ids & incoming_ids

    now = datetime.utcnow()

    for heard_id in to_delete:
        await db.delete(existing_by_heard_id[heard_id])

    for heard_id in to_touch:
        existing_by_heard_id[heard_id].reported_at = now

    for heard_id in to_insert:
        db.add(CanHearReport(
            net_id=net_id,
            reporter_check_in_id=payload.reporter_check_in_id,
            heard_check_in_id=heard_id,
            frequency_id=payload.frequency_id,
            reported_by_user_id=current_user.id,
            reported_at=now,
        ))

    if payload.operating_position is not None:
        reporter_check_in.operating_position = payload.operating_position

    try:
        await db.commit()
    except IntegrityError:
        # A concurrent save for the same (reporter, frequency) pair raced
        # this one and won (caught by the main unique constraint or the
        # NULL-frequency partial index). Reconcile-on-save has no safe way
        # to merge two overlapping writes, so surface a conflict rather
        # than silently dropping or corrupting either one.
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This coverage report was updated by someone else at the same time. Please reopen the dialog and try again."
        )

    # Broadcast so every viewer of the net sees the change live
    from app.main import manager
    import datetime as dt
    await manager.broadcast({
        "type": "can_hear_changed",
        "data": {"net_id": net_id, "reporter_check_in_id": payload.reporter_check_in_id},
        "timestamp": dt.datetime.utcnow().isoformat()
    }, net_id)

    result = await db.execute(
        select(CanHearReport).where(
            CanHearReport.reporter_check_in_id == payload.reporter_check_in_id,
            freq_filter,
        )
    )
    refreshed_reports = result.scalars().all()

    return await _build_report_responses(db, net_id, refreshed_reports)
