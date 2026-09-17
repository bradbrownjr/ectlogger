from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user_optional
from app.models import CheckIn, Net, NetStatus, NetTemplate, TrafficLogEntry, User
from app.schemas import (
    GlobalStatsResponse,
    TimeSeriesDataPoint,
    TopNetEntry,
)

router = APIRouter()

# Nets that actually happened, for any "activity" count/time-series -- excludes
# DRAFT (never started) and CANCELLED (explicitly skipped, see the Net
# cancellation feature-registry entry in copilot-instructions.md).
_HELD_NET_STATUSES = [NetStatus.ACTIVE, NetStatus.CLOSED, NetStatus.ARCHIVED]


@router.get("/global", response_model=GlobalStatsResponse)
async def get_global_statistics(
    days: int = Query(30, ge=0, le=3650, description="Window in days for activity/scoreboard/time-series; 0 = all time"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get global platform statistics - available to all users (including unauthenticated).

    `total_*`, `active_nets`, and `traffic_handled` are lifetime/current-moment
    figures and are not affected by `days`. `window_*`, `top_nets`, and the
    three `*_over_time` series are all scoped to the requested window, with
    the time-series bucketed at a granularity chosen from the window size
    (daily for Week/Month, weekly for 6 Months/Year, monthly for All Time).
    """
    now = datetime.now(timezone.utc)
    cutoff = None if days == 0 else now - timedelta(days=days)

    # ===== ALL-TIME / CURRENT-MOMENT TOTALS =====
    total_nets_result = await db.execute(
        select(func.count(Net.id)).where(Net.status != NetStatus.DRAFT)
    )
    total_nets = total_nets_result.scalar() or 0

    total_check_ins_result = await db.execute(select(func.count(CheckIn.id)))
    total_check_ins = total_check_ins_result.scalar() or 0

    total_users_result = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    total_users = total_users_result.scalar() or 0

    unique_callsigns_result = await db.execute(
        select(func.count(distinct(CheckIn.callsign)))
    )
    unique_operators = unique_callsigns_result.scalar() or 0

    active_nets_result = await db.execute(
        select(func.count(Net.id)).where(Net.status == NetStatus.ACTIVE)
    )
    active_nets = active_nets_result.scalar() or 0

    # ===== WINDOWED ACTIVITY =====
    window_nets_query = select(func.count(Net.id)).where(Net.status.in_(_HELD_NET_STATUSES))
    if cutoff is not None:
        window_nets_query = window_nets_query.where(Net.started_at >= cutoff)
    window_nets = (await db.execute(window_nets_query)).scalar() or 0

    window_check_ins_query = select(func.count(CheckIn.id))
    if cutoff is not None:
        window_check_ins_query = window_check_ins_query.where(CheckIn.checked_in_at >= cutoff)
    window_check_ins = (await db.execute(window_check_ins_query)).scalar() or 0

    window_unique_operators_query = select(func.count(distinct(CheckIn.callsign)))
    if cutoff is not None:
        window_unique_operators_query = window_unique_operators_query.where(CheckIn.checked_in_at >= cutoff)
    window_unique_operators = (await db.execute(window_unique_operators_query)).scalar() or 0

    window_avg_query = select(func.avg(
        select(func.count(CheckIn.id))
        .where(CheckIn.net_id == Net.id)
        .correlate(Net)
        .scalar_subquery()
    )).where(Net.status.in_([NetStatus.CLOSED, NetStatus.ARCHIVED]))
    if cutoff is not None:
        window_avg_query = window_avg_query.where(Net.started_at >= cutoff)
    window_avg_check_ins_per_net = round((await db.execute(window_avg_query)).scalar() or 0, 1)

    # ===== ASSISTED TRAFFIC HANDLING =====
    # Distinct forms with any traffic_log_entries row platform-wide, broken
    # out by action (see TRAFFIC-HANDLING-DESIGN.md section 3.5).
    # Deliberately all-time rather than windowed for now.
    traffic_entries_result = await db.execute(
        select(TrafficLogEntry.action, TrafficLogEntry.form_id)
    )
    traffic_by_action_forms: dict = {}
    all_traffic_form_ids: set = set()
    for action, form_id in traffic_entries_result.all():
        action_key = action.value if hasattr(action, "value") else str(action)
        traffic_by_action_forms.setdefault(action_key, set()).add(form_id)
        all_traffic_form_ids.add(form_id)
    traffic_by_action = {action: len(form_ids) for action, form_ids in traffic_by_action_forms.items()}
    traffic_handled = len(all_traffic_form_ids)

    # ===== MOST-ATTENDED NETS SCOREBOARD =====
    top_nets = await _get_top_nets(db, cutoff)

    # ===== TIME SERIES =====
    earliest_started_result = await db.execute(
        select(func.min(Net.started_at)).where(Net.started_at.isnot(None))
    )
    earliest_started = earliest_started_result.scalar()
    edges = _bucket_edges(days, now, earliest_started)

    nets_over_time = await _count_nets_per_bucket(db, edges)
    check_ins_over_time = await _count_check_ins_per_bucket(db, edges)
    unique_operators_over_time = await _count_unique_operators_per_bucket(db, edges)

    return GlobalStatsResponse(
        total_nets=total_nets,
        total_check_ins=total_check_ins,
        total_users=total_users,
        unique_operators=unique_operators,
        active_nets=active_nets,
        window_nets=window_nets,
        window_check_ins=window_check_ins,
        window_unique_operators=window_unique_operators,
        window_avg_check_ins_per_net=window_avg_check_ins_per_net,
        traffic_handled=traffic_handled,
        traffic_by_action=traffic_by_action,
        top_nets=top_nets,
        nets_over_time=nets_over_time,
        check_ins_over_time=check_ins_over_time,
        unique_operators_over_time=unique_operators_over_time,
    )


async def _get_top_nets(db: AsyncSession, cutoff: Optional[datetime], limit: int = 10) -> List[TopNetEntry]:
    """Most-attended nets scoreboard: one row per schedule (net template),
    ranked by total check-ins across that schedule's occurrences within the
    window, with the occurrence count shown alongside so a high total from
    broad turnout can be told apart from one that just meets often. Ad hoc
    nets (no template) are excluded -- there is no series for them to
    accumulate into -- as are DRAFT and CANCELLED occurrences (real rows,
    not deletions, but meaningless in a ranking)."""
    query = (
        select(
            Net.template_id,
            NetTemplate.name,
            func.count(CheckIn.id).label("total_check_ins"),
            func.count(func.distinct(Net.id)).label("occurrence_count"),
        )
        .join(NetTemplate, NetTemplate.id == Net.template_id)
        .outerjoin(CheckIn, CheckIn.net_id == Net.id)
        .where(Net.template_id.isnot(None))
        .where(Net.status.notin_([NetStatus.DRAFT, NetStatus.CANCELLED]))
    )
    if cutoff is not None:
        query = query.where(Net.started_at >= cutoff)
    query = (
        query.group_by(Net.template_id, NetTemplate.name)
        .order_by(func.count(CheckIn.id).desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [
        TopNetEntry(
            template_id=row.template_id,
            template_name=row.name,
            total_check_ins=row.total_check_ins or 0,
            occurrence_count=row.occurrence_count or 0,
        )
        for row in result.all()
    ]


# ===== Time-series bucketing =====
# One shared bucket-edge generator plus three thin per-metric counters,
# replacing what used to be four independent, near-duplicate fixed-window
# (30-day / 26-week) helper functions.

def _bucket_edges(
    days: int, now: datetime, earliest: Optional[datetime]
) -> List[Tuple[datetime, datetime, str]]:
    """Returns (start, end, label) tuples covering the requested window,
    oldest first. Granularity is chosen from the window size: day buckets up
    to ~2 months, week buckets beyond that, month buckets for all-time (days
    == 0), since a daily/weekly series over a multi-year history would be
    unreadable and expensive to compute point-by-point."""
    if days == 0:
        if not earliest:
            return []
        earliest_month_start = earliest.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        months = (now.year - earliest_month_start.year) * 12 + (now.month - earliest_month_start.month) + 1
        months = min(max(months, 1), 120)  # cap at 10 years of monthly buckets
        current_month_index = now.year * 12 + (now.month - 1)
        edges = []
        for i in range(months - 1, -1, -1):
            month_index = current_month_index - i
            year, month0 = divmod(month_index, 12)
            start = datetime(year, month0 + 1, 1, tzinfo=timezone.utc)
            end = (
                datetime(year + 1, 1, 1, tzinfo=timezone.utc)
                if month0 == 11
                else datetime(year, month0 + 2, 1, tzinfo=timezone.utc)
            )
            edges.append((start, end, start.strftime("%b %Y")))
        return edges

    if days > 60:
        weeks = max(1, days // 7)
        edges = []
        for i in range(weeks - 1, -1, -1):
            week_start = (now - timedelta(weeks=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = week_start - timedelta(days=week_start.weekday())  # Monday
            week_end = week_start + timedelta(weeks=1)
            edges.append((week_start, week_end, week_start.strftime("%m/%d")))
        return edges

    edges = []
    for i in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        edges.append((day_start, day_end, day_start.strftime("%m/%d")))
    return edges


async def _count_nets_per_bucket(
    db: AsyncSession, edges: List[Tuple[datetime, datetime, str]]
) -> List[TimeSeriesDataPoint]:
    result = []
    for start, end, label in edges:
        count_result = await db.execute(
            select(func.count(Net.id)).where(
                and_(
                    Net.started_at >= start,
                    Net.started_at < end,
                    Net.status.in_(_HELD_NET_STATUSES),
                )
            )
        )
        result.append(TimeSeriesDataPoint(label=label, value=count_result.scalar() or 0, date=start.date().isoformat()))
    return result


async def _count_check_ins_per_bucket(
    db: AsyncSession, edges: List[Tuple[datetime, datetime, str]]
) -> List[TimeSeriesDataPoint]:
    result = []
    for start, end, label in edges:
        count_result = await db.execute(
            select(func.count(CheckIn.id)).where(
                and_(CheckIn.checked_in_at >= start, CheckIn.checked_in_at < end)
            )
        )
        result.append(TimeSeriesDataPoint(label=label, value=count_result.scalar() or 0, date=start.date().isoformat()))
    return result


async def _count_unique_operators_per_bucket(
    db: AsyncSession, edges: List[Tuple[datetime, datetime, str]]
) -> List[TimeSeriesDataPoint]:
    result = []
    for start, end, label in edges:
        count_result = await db.execute(
            select(func.count(distinct(CheckIn.callsign))).where(
                and_(CheckIn.checked_in_at >= start, CheckIn.checked_in_at < end)
            )
        )
        result.append(TimeSeriesDataPoint(label=label, value=count_result.scalar() or 0, date=start.date().isoformat()))
    return result
