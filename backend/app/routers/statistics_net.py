from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user_optional
from app.models import CheckIn, Net, NetRole, NetTemplate, User
from app.schemas import (
    NetStatsResponse,
    TimeSeriesDataPoint,
    TopOperator,
)

router = APIRouter()

@router.get("/nets/{net_id}", response_model=NetStatsResponse)
async def get_net_statistics(
    net_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get statistics for a specific net.
    """
    # Get the net
    result = await db.execute(
        select(Net)
        .options(selectinload(Net.check_ins), selectinload(Net.frequencies))
        .where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Basic counts
    total_check_ins = len(net.check_ins)
    unique_callsigns = len(set(c.callsign for c in net.check_ins))
    rechecks = sum(1 for c in net.check_ins if c.is_recheck)
    
    # Duration
    duration_minutes = None
    if net.started_at:
        started_at = net.started_at
        # Ensure timezone awareness
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        
        end_time = net.closed_at
        if end_time:
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
        else:
            end_time = datetime.now(timezone.utc)
        
        # Exclude windows where no NCS was actively present.
        paused_seconds = net.total_paused_seconds or 0
        if net.paused_at:
            paused_at = net.paused_at if net.paused_at.tzinfo else net.paused_at.replace(tzinfo=timezone.utc)
            paused_seconds += (end_time - paused_at).total_seconds()
        duration_minutes = max(0, int((end_time - started_at).total_seconds() / 60) - int(paused_seconds / 60))
    elif net.scheduled_start_time:
        # started_at not recorded but a scheduled time exists — use it
        started_at = net.scheduled_start_time
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        end_time = net.closed_at or datetime.now(timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        candidate = int((end_time - started_at).total_seconds() / 60)
        # Only use if positive (guard against bad scheduled_start_time data)
        if candidate > 0:
            duration_minutes = candidate
    if duration_minutes is None and net.check_ins:
        # started_at not recorded — derive duration from first to last check-in
        times = [c.checked_in_at for c in net.check_ins if c.checked_in_at]
        if times:
            first = min(times)
            if first.tzinfo is None:
                first = first.replace(tzinfo=timezone.utc)
            end_time = net.closed_at or max(times)
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
            duration_minutes = int((end_time - first).total_seconds() / 60)
    
    # Check-ins by status
    status_counts = {}
    for checkin in net.check_ins:
        status = checkin.status.value if checkin.status else "unknown"
        status_counts[status] = status_counts.get(status, 0) + 1
    
    # Check-ins over time (binned by 10-minute intervals if net is long enough)
    check_ins_timeline = []
    if net.started_at and net.check_ins:
        started_at = net.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        
        sorted_checkins = sorted(net.check_ins, key=lambda c: c.checked_in_at)
        for checkin in sorted_checkins:
            checked_in_at = checkin.checked_in_at
            if checked_in_at.tzinfo is None:
                checked_in_at = checked_in_at.replace(tzinfo=timezone.utc)
            minutes_from_start = int((checked_in_at - started_at).total_seconds() / 60)
            check_ins_timeline.append(TimeSeriesDataPoint(
                label=f"+{minutes_from_start}m",
                value=1,
                date=checkin.checked_in_at.isoformat()
            ))
    
    # Top operators (most check-ins including rechecks)
    # Track both count and first check-in time for tie-breaking
    callsign_data = {}  # callsign -> {count: int, first_check_in: datetime}
    for checkin in net.check_ins:
        cs = checkin.callsign
        if cs not in callsign_data:
            callsign_data[cs] = {
                'count': 0,
                'first_check_in': checkin.checked_in_at
            }
        callsign_data[cs]['count'] += 1
        # Track earliest check-in time
        if checkin.checked_in_at < callsign_data[cs]['first_check_in']:
            callsign_data[cs]['first_check_in'] = checkin.checked_in_at
    
    # Sort by count (descending), then by first_check_in (ascending) for tie-breaking
    sorted_operators = sorted(
        callsign_data.items(),
        key=lambda x: (-x[1]['count'], x[1]['first_check_in'])
    )
    
    top_operators = [
        TopOperator(
            callsign=cs,
            check_in_count=data['count'],
            first_check_in=data['first_check_in']
        )
        for cs, data in sorted_operators
    ]
    
    # Check-ins by frequency
    freq_counts = {}
    for checkin in net.check_ins:
        if checkin.frequency:
            freq_label = checkin.frequency.frequency or checkin.frequency.network or "Unknown"
            freq_counts[freq_label] = freq_counts.get(freq_label, 0) + 1
    
    return NetStatsResponse(
        net_id=net_id,
        net_name=net.name,
        status=net.status.value,
        template_id=net.template_id,
        total_check_ins=total_check_ins,
        unique_callsigns=unique_callsigns,
        rechecks=rechecks,
        duration_minutes=duration_minutes,
        started_at=net.started_at,
        closed_at=net.closed_at,
        status_counts=status_counts,
        check_ins_timeline=check_ins_timeline,
        top_operators=top_operators,
        check_ins_by_frequency=freq_counts,
        frequency_count=len(net.frequencies),
    )


@router.get("/templates/{template_id}")
async def get_template_statistics(
    template_id: int,
    days: int = Query(30, ge=0, le=3650, description="Time window in days; 0 = all time"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get historical statistics for a net template (recurring net series).

    Supports a time-window filter via ?days=. Pass 0 for all-time. Default
    is 30 days. Common values: 30, 90, 365, 0.
    """
    # Get template and all associated nets
    template_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = template_result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Build base net query, optionally restricted to the requested time window.
    # We filter on started_at because that's when the net actually ran; nets
    # that never started (drafts) are excluded by virtue of having no
    # started_at and therefore failing the window filter when one is applied.
    nets_query = (
        select(Net)
        .options(selectinload(Net.check_ins))
        .where(Net.template_id == template_id)
        .order_by(Net.started_at.desc())
    )
    if days and days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        nets_query = nets_query.where(Net.started_at >= cutoff)

    nets_result = await db.execute(nets_query)
    nets = nets_result.scalars().all()
    net_ids = [n.id for n in nets]

    total_instances = len(nets)
    total_check_ins = sum(len(n.check_ins) for n in nets)

    # Average check-ins per instance
    avg_check_ins = round(total_check_ins / total_instances, 1) if total_instances > 0 else 0

    # Unique operators across all instances in the window
    all_callsigns: set[str] = set()
    for net in nets:
        all_callsigns.update(c.callsign for c in net.check_ins)

    # Per-callsign appearance counts (one count per net even if a callsign
    # checked in multiple times in the same net).
    callsign_appearances: dict[str, int] = {}
    for net in nets:
        for cs in {c.callsign for c in net.check_ins}:
            callsign_appearances[cs] = callsign_appearances.get(cs, 0) + 1

    # ===== CHECK-IN LEADERBOARD =====
    # Top callsigns by net appearances. Replaces the old "regular operators
    # >50%" filter, which was too strict for long-running nets where the
    # operator pool churns over years. We expose the appearance count and
    # the participation percentage so the UI can still highlight regulars
    # without hiding everyone else.
    check_in_leaderboard = [
        {
            "callsign": cs,
            "appearances": count,
            "percentage": round(count / total_instances * 100, 1) if total_instances else 0,
        }
        for cs, count in sorted(callsign_appearances.items(), key=lambda x: -x[1])
    ][:20]

    # Backwards-compatible "regular_operators" field: still only those at >=50%
    # so older clients keep working, but lowered the cap so it's not empty.
    regular_operators = [op for op in check_in_leaderboard if op["percentage"] >= 50]

    # ===== NCS / LOGGER LEADERBOARDS =====
    # Count distinct nets-in-window where each user held the role. NetRole is
    # a per-net assignment so this directly answers "how many nets did
    # so-and-so run as NCS / log."
    async def _role_leaderboard(role_value: str) -> list[dict]:
        if not net_ids:
            return []
        result = await db.execute(
            select(
                NetRole.user_id,
                User.callsign,
                User.name,
                func.count(func.distinct(NetRole.net_id)).label("nets_count"),
            )
            .join(User, User.id == NetRole.user_id)
            .where(NetRole.net_id.in_(net_ids))
            .where(NetRole.role == role_value)
            .group_by(NetRole.user_id, User.callsign, User.name)
            .order_by(func.count(func.distinct(NetRole.net_id)).desc())
            .limit(20)
        )
        return [
            {
                "user_id": row.user_id,
                "callsign": row.callsign,
                "name": row.name,
                "nets_count": row.nets_count,
            }
            for row in result.all()
        ]

    ncs_leaderboard = await _role_leaderboard("NCS")
    logger_leaderboard = await _role_leaderboard("LOGGER")

    # ===== RELAY LEADERBOARD =====
    # Relays are typically captured per check-in via CheckIn.relayed_by
    # (callsign of the station that relayed the traffic) rather than as a
    # NetRole assignment, so we count distinct nets where each callsign
    # appears as a relay station for at least one check-in.
    relay_leaderboard: list[dict] = []
    if net_ids:
        relay_result = await db.execute(
            select(
                CheckIn.relayed_by,
                func.count(func.distinct(CheckIn.net_id)).label("nets_count"),
                func.count(CheckIn.id).label("relays_count"),
            )
            .where(CheckIn.net_id.in_(net_ids))
            .where(CheckIn.relayed_by.isnot(None))
            .where(CheckIn.relayed_by != "")
            .group_by(CheckIn.relayed_by)
            .order_by(func.count(func.distinct(CheckIn.net_id)).desc())
            .limit(20)
        )
        relay_leaderboard = [
            {
                "callsign": row.relayed_by,
                "nets_count": row.nets_count,
                "relays_count": row.relays_count,
            }
            for row in relay_result.all()
        ]

    # ===== INSTANCES (history log) =====
    # Include NCS callsign(s) per instance so the schedule history log can
    # show who ran each net. We do this in one query rather than N+1.
    ncs_by_net: dict[int, list[str]] = {}
    if net_ids:
        ncs_rows = await db.execute(
            select(NetRole.net_id, User.callsign)
            .join(User, User.id == NetRole.user_id)
            .where(NetRole.net_id.in_(net_ids))
            .where(NetRole.role == "NCS")
        )
        for net_id, callsign in ncs_rows.all():
            if callsign:
                ncs_by_net.setdefault(net_id, []).append(callsign)

    instances_data = [
        {
            "net_id": net.id,
            "name": net.name,
            "date": net.started_at.isoformat() if net.started_at else None,
            "closed_at": net.closed_at.isoformat() if net.closed_at else None,
            "check_in_count": len(net.check_ins),
            "unique_operators": len({c.callsign for c in net.check_ins}),
            "ncs_callsigns": ncs_by_net.get(net.id, []),
        }
        for net in nets
    ]

    return {
        "template_id": template_id,
        "template_name": template.name,
        "template_owner_id": template.owner_id,
        "filter_days": days,
        "total_instances": total_instances,
        "total_check_ins": total_check_ins,
        "avg_check_ins_per_instance": avg_check_ins,
        "unique_operators": len(all_callsigns),
        # Legacy field (kept for backward compat) — will be empty for new
        # long-running nets where no one hits the 50% threshold.
        "regular_operators": regular_operators,
        # New leaderboards
        "check_in_leaderboard": check_in_leaderboard,
        "ncs_leaderboard": ncs_leaderboard,
        "logger_leaderboard": logger_leaderboard,
        "relay_leaderboard": relay_leaderboard,
        "instances": instances_data,
    }


