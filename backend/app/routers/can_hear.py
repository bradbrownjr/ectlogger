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
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models import CanHearReport, CheckIn, Frequency, Net, User, net_frequencies
from app.schemas import CanHearReportResponse, CanHearReportSave, CanHearReportFrequencyUpdate
from app.dependencies import get_current_user, get_current_user_optional
from app.permissions import check_net_permission
from app.band_utils import band_from_frequency_string

router = APIRouter(prefix="/nets", tags=["can-hear"])


async def _build_report_responses(db: AsyncSession, net: Net, reports: List[CanHearReport]) -> List[CanHearReportResponse]:
    """Attach reporter/heard callsigns and a derived band to a list of
    CanHearReport rows. `net` must have `frequencies` loaded (selectinload) -
    it's the source for the single-frequency fallback below."""
    if not reports:
        return []

    check_in_ids = {r.reporter_check_in_id for r in reports} | {r.heard_check_in_id for r in reports}
    result = await db.execute(select(CheckIn).where(CheckIn.id.in_(check_in_ids)))
    callsigns_by_id = {c.id: c.callsign for c in result.scalars().all()}

    freq_ids = {r.frequency_id for r in reports if r.frequency_id is not None}
    frequencies_by_id = {}
    if freq_ids:
        result = await db.execute(select(Frequency).where(Frequency.id.in_(freq_ids)))
        frequencies_by_id = {f.id: f for f in result.scalars().all()}

    # A report with no specific frequency (the reporter picked "No specific
    # frequency" in the dialog) still happened on *some* frequency - if the
    # net's PACE plan has exactly one, that's unambiguously what was used.
    # With more than one frequency there's no way to tell which, so band
    # stays unknown for those reports.
    sole_net_frequency = net.frequencies[0] if len(net.frequencies) == 1 else None

    def _band_for(report: CanHearReport) -> Optional[str]:
        if report.frequency_id is not None:
            freq = frequencies_by_id.get(report.frequency_id)
            return band_from_frequency_string(freq.frequency) if freq else None
        if sole_net_frequency is not None:
            return band_from_frequency_string(sole_net_frequency.frequency)
        return None

    return [
        CanHearReportResponse(
            id=r.id,
            net_id=r.net_id,
            reporter_check_in_id=r.reporter_check_in_id,
            heard_check_in_id=r.heard_check_in_id,
            reporter_callsign=callsigns_by_id.get(r.reporter_check_in_id, ""),
            heard_callsign=callsigns_by_id.get(r.heard_check_in_id, ""),
            frequency_id=r.frequency_id,
            band=_band_for(r),
            reported_by_user_id=r.reported_by_user_id,
            reported_at=r.reported_at,
        )
        for r in reports
    ]


@router.get("/{net_id}/can-hear-reports", response_model=List[CanHearReportResponse])
async def list_can_hear_reports(
    net_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all 'can hear' reports for a net. Reading is not more sensitive
    than the check-in list, which requires no auth at all -- so this is
    open to guests too, matching every other net-view read endpoint."""
    result = await db.execute(select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    result = await db.execute(select(CanHearReport).where(CanHearReport.net_id == net_id))
    reports = result.scalars().all()

    return await _build_report_responses(db, net, reports)


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
    result = await db.execute(select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    if not net.propagation_logging_enabled:
        raise HTTPException(status_code=403, detail="Station-to-station coverage logging is not enabled for this net")

    result = await db.execute(select(CheckIn).where(CheckIn.id == payload.reporter_check_in_id))
    reporter_check_in = result.scalar_one_or_none()
    if not reporter_check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    if reporter_check_in.net_id != net_id:
        raise HTTPException(status_code=400, detail="Check-in does not belong to this net")

    # A station can report what it itself can hear, unless self-reporting is
    # turned off for this net; staff can always report on behalf of any station.
    is_own_check_in = reporter_check_in.user_id == current_user.id
    self_report_allowed = is_own_check_in and net.self_can_hear_enabled is not False
    if not self_report_allowed and not await check_net_permission(db, net, current_user, ["NCS", "LOGGER", "RELAY"]):
        raise HTTPException(status_code=403, detail="Not authorized to record coverage reports")

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

    return await _build_report_responses(db, net, refreshed_reports)


@router.patch("/{net_id}/can-hear-reports/{report_id}", response_model=CanHearReportResponse)
async def update_can_hear_report_frequency(
    net_id: int,
    report_id: int,
    payload: CanHearReportFrequencyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Correct a single report's frequency after the fact - e.g. one logged
    with 'no specific frequency' (see the single-list dialog's dropdown)
    before it's clear which of the net's frequencies it was actually on.
    Does not touch heard_check_in_id or reported_at, and unlike the reconcile
    endpoint above this is scoped to one report, not a full (reporter,
    frequency) set."""
    result = await db.execute(select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    result = await db.execute(select(CanHearReport).where(CanHearReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report or report.net_id != net_id:
        raise HTTPException(status_code=404, detail="Coverage report not found")

    result = await db.execute(select(CheckIn).where(CheckIn.id == report.reporter_check_in_id))
    reporter_check_in = result.scalar_one_or_none()

    # Same self-report-or-staff rule as saving a report in the first place -
    # the reporting station (or whoever is currently allowed to report on
    # its behalf) can correct its own past entry.
    is_own_check_in = bool(reporter_check_in) and reporter_check_in.user_id == current_user.id
    self_report_allowed = is_own_check_in and net.self_can_hear_enabled is not False
    if not self_report_allowed and not await check_net_permission(db, net, current_user, ["NCS", "LOGGER", "RELAY"]):
        raise HTTPException(status_code=403, detail="Not authorized to edit this coverage report")

    if payload.frequency_id is not None:
        result = await db.execute(
            select(net_frequencies.c.frequency_id).where(
                net_frequencies.c.net_id == net_id,
                net_frequencies.c.frequency_id == payload.frequency_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Frequency does not belong to this net")

    report.frequency_id = payload.frequency_id

    try:
        await db.commit()
    except IntegrityError:
        # A report already exists for (reporter, heard, new frequency) -
        # can't merge, so surface the conflict instead of silently dropping
        # one of the two.
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A report already exists for this station pair on that frequency."
        )

    from app.main import manager
    import datetime as dt
    await manager.broadcast({
        "type": "can_hear_changed",
        "data": {"net_id": net_id, "reporter_check_in_id": report.reporter_check_in_id},
        "timestamp": dt.datetime.utcnow().isoformat()
    }, net_id)

    responses = await _build_report_responses(db, net, [report])
    return responses[0]
