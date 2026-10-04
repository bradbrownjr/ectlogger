"""
Every net occurrence in a time window: real Net rows merged with projections.

Shared by the Schedule page's month calendar (``GET /templates/calendar``) and
the public RSS feed (``/feed/schedule.xml``), so the two can never disagree about
which nets are on.

Two sources, and the seam between them is *now*:

- **Real rows** are what actually happened, or a net already created for an
  upcoming slot (the scheduler materializes about 24 hours ahead). Every Net in
  the window is returned, dated by its scheduled start, else when it started,
  else when it was created.
- **Projections** are computed from each active recurring schedule, and only
  from the current moment forward. Never project into the past: a projection on
  a past date would claim a net was held that may have been cancelled, and name
  an NCS who never served. ``calculate_schedule_dates`` cannot look backwards
  anyway; do not "fix" that by backdating its start date.

A real row always beats a projection for the same slot, matched on the same
+/- 5 minute window the scheduler uses to decide a slot already has a net
(``ncs_reminder_service._get_or_create_scheduled_net``). Using the scheduler's
rule rather than a looser one means the calendar never hides a slot that the
scheduler will go on to create a second net for.
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import CheckIn, Net, NetStatus, NetTemplate
from app.routers.ncs_schedule import (
    calculate_schedule_dates,
    compute_anchored_ncs_schedule,
    ncs_schedule_load_options,
    template_local_to_utc,
    template_utc_to_local,
)
from app.schemas import CalendarOccurrence, FrequencyResponse
from app.services.ncs_attribution import load_ncs_attribution

# Same tolerance the scheduler uses when deciding a slot already has a net.
SLOT_TOLERANCE = timedelta(minutes=5)

RECURRING_TYPES = ('daily', 'weekly', 'monthly')


def _naive_utc(dt: datetime) -> datetime:
    """Naive UTC, the convention stored timestamps use."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Tag a stored naive-UTC timestamp as UTC so it serializes with an offset."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _months_spanned(start: datetime, end: datetime) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


async def get_occurrences(
    db: AsyncSession,
    window_start: datetime,
    window_end: datetime,
    now: Optional[datetime] = None,
) -> List[CalendarOccurrence]:
    """All occurrences starting in [window_start, window_end), sorted by start.

    Cancelled occurrences are included and flagged, since the calendar has to show
    them struck through; callers that should omit them (the RSS feed) filter.
    """
    window_start = _naive_utc(window_start)
    window_end = _naive_utc(window_end)
    now = _naive_utc(now) if now else datetime.utcnow()

    # ========== REAL NET ROWS ==========
    # Widened by the slot tolerance so a projection just inside the window can
    # still be matched against a net just outside it; trimmed again on output.
    net_date = func.coalesce(Net.scheduled_start_time, Net.started_at, Net.created_at)
    nets = (await db.execute(
        select(Net)
        .options(selectinload(Net.frequencies), selectinload(Net.owner))
        .where(net_date >= window_start - SLOT_TOLERANCE)
        .where(net_date < window_end + SLOT_TOLERANCE)
    )).scalars().all()

    net_ids = [n.id for n in nets]
    check_in_counts: Dict[int, int] = {}
    if net_ids:
        check_in_counts = dict((await db.execute(
            select(CheckIn.net_id, func.count(CheckIn.id))
            .where(CheckIn.net_id.in_(net_ids))
            .group_by(CheckIn.net_id)
        )).all())
    ncs_by_net = await load_ncs_attribution(db, net_ids)

    occurrences: List[CalendarOccurrence] = []
    # template_id -> scheduled starts of its real rows, for suppressing projections
    real_slots: Dict[int, List[datetime]] = {}
    for net in nets:
        if net.template_id is not None and net.scheduled_start_time is not None:
            real_slots.setdefault(net.template_id, []).append(_naive_utc(net.scheduled_start_time))

        start = _naive_utc(net.scheduled_start_time or net.started_at or net.created_at)
        if not (window_start <= start < window_end):
            continue
        occurrences.append(CalendarOccurrence(
            source='net',
            start=_aware_utc(start),
            name=net.name,
            template_id=net.template_id,
            net_id=net.id,
            status=net.status.value if net.status else None,
            started_at=_aware_utc(net.started_at),
            is_cancelled=net.status == NetStatus.CANCELLED,
            cancel_reason=net.cancel_reason,
            ncs_callsign=ncs_by_net.get(net.id, (None, None))[0],
            check_in_count=check_in_counts.get(net.id, 0),
            description=net.description,
            owner_callsign=net.owner.callsign if net.owner else None,
            frequencies=[FrequencyResponse.model_validate(f) for f in net.frequencies],
        ))

    # ========== PROJECTIONS (now forward only) ==========
    projection_start = max(window_start, now)
    if projection_start < window_end:
        templates = (await db.execute(
            select(NetTemplate)
            .options(
                *ncs_schedule_load_options(),
            )
            .where(NetTemplate.is_active == True)  # noqa: E712
            .where(NetTemplate.schedule_type.in_(RECURRING_TYPES))
        )).scalars().all()

        for template in templates:
            occurrences.extend(_project_template(
                template, projection_start, window_end, real_slots.get(template.id, [])
            ))

    occurrences.sort(key=lambda o: (o.start, o.name))
    return occurrences


def _project_template(
    template: NetTemplate,
    projection_start: datetime,
    window_end: datetime,
    real_slots: List[datetime],
) -> List[CalendarOccurrence]:
    """Projected occurrences of one schedule in [projection_start, window_end)."""
    local_start = template_utc_to_local(template, projection_start)
    local_end = template_utc_to_local(template, window_end)
    local_dates = []
    for local_dt in calculate_schedule_dates(template, local_start, _months_spanned(local_start, local_end)):
        utc_dt = template_local_to_utc(template, local_dt)
        if not (projection_start <= utc_dt < window_end):
            continue
        if any(abs(utc_dt - slot) <= SLOT_TOLERANCE for slot in real_slots):
            continue  # a real row already covers this slot
        local_dates.append(local_dt)

    if not local_dates:
        return []

    # One anchored pass for the whole window, so the rotation index is computed
    # once per schedule per request rather than once per occurrence.
    ncs_by_date = {
        entry.date.date(): entry
        for entry in compute_anchored_ncs_schedule(
            template, local_dates, template.rotation_members, template.schedule_overrides
        )
    }

    result = []
    for local_dt in local_dates:
        entry = ncs_by_date.get(local_dt.date())
        result.append(CalendarOccurrence(
            source='projected',
            start=_aware_utc(template_local_to_utc(template, local_dt)),
            name=template.name,
            template_id=template.id,
            is_cancelled=bool(entry and entry.is_cancelled),
            cancel_reason=entry.override_reason if entry and entry.is_cancelled else None,
            is_override=bool(entry and entry.is_override and not entry.is_cancelled),
            is_fifth_week=bool(entry and entry.is_fifth_week),
            ncs_callsign=entry.user_callsign if entry else None,
        ))
    return result
