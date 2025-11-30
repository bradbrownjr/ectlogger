"""
Statistics router for ECTLogger
Provides endpoints for global stats, net-specific stats, and user stats
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_, distinct, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from app.database import get_db
from app.models import Net, CheckIn, User, NetStatus, NetTemplate, NetTemplateSubscription
from app.auth import get_current_user, get_optional_current_user
from app.schemas import (
    GlobalStatsResponse, 
    NetStatsResponse, 
    UserStatsResponse,
    TimeSeriesDataPoint,
    NetParticipation,
    TopOperator,
    CheckInsByNet,
    FrequentNetStats
)

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/global", response_model=GlobalStatsResponse)
async def get_global_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Get global platform statistics - available to all users (including unauthenticated).
    Returns overall counts and time-series data for charts.
    """
    now = datetime.now(timezone.utc)
    
    # Total counts
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
    
    # Unique operators (unique callsigns that have checked in)
    unique_callsigns_result = await db.execute(
        select(func.count(distinct(CheckIn.callsign)))
    )
    unique_operators = unique_callsigns_result.scalar() or 0
    
    # Currently active nets
    active_nets_result = await db.execute(
        select(func.count(Net.id)).where(Net.status == NetStatus.ACTIVE)
    )
    active_nets = active_nets_result.scalar() or 0
    
    # Nets in last 24 hours
    last_24h = now - timedelta(hours=24)
    nets_24h_result = await db.execute(
        select(func.count(Net.id)).where(
            and_(
                Net.status.in_([NetStatus.ACTIVE, NetStatus.CLOSED, NetStatus.ARCHIVED]),
                Net.started_at >= last_24h
            )
        )
    )
    nets_last_24h = nets_24h_result.scalar() or 0
    
    # Nets in last 7 days
    last_7d = now - timedelta(days=7)
    nets_7d_result = await db.execute(
        select(func.count(Net.id)).where(
            and_(
                Net.status.in_([NetStatus.ACTIVE, NetStatus.CLOSED, NetStatus.ARCHIVED]),
                Net.started_at >= last_7d
            )
        )
    )
    nets_last_7_days = nets_7d_result.scalar() or 0
    
    # Nets in last 30 days
    last_30d = now - timedelta(days=30)
    nets_30d_result = await db.execute(
        select(func.count(Net.id)).where(
            and_(
                Net.status.in_([NetStatus.ACTIVE, NetStatus.CLOSED, NetStatus.ARCHIVED]),
                Net.started_at >= last_30d
            )
        )
    )
    nets_last_30_days = nets_30d_result.scalar() or 0
    
    # Check-ins in last 24 hours
    checkins_24h_result = await db.execute(
        select(func.count(CheckIn.id)).where(CheckIn.checked_in_at >= last_24h)
    )
    check_ins_last_24h = checkins_24h_result.scalar() or 0
    
    # Check-ins in last 7 days
    checkins_7d_result = await db.execute(
        select(func.count(CheckIn.id)).where(CheckIn.checked_in_at >= last_7d)
    )
    check_ins_last_7_days = checkins_7d_result.scalar() or 0
    
    # Average check-ins per net (for closed/archived nets only)
    avg_checkins_result = await db.execute(
        select(func.avg(
            select(func.count(CheckIn.id))
            .where(CheckIn.net_id == Net.id)
            .correlate(Net)
            .scalar_subquery()
        )).where(Net.status.in_([NetStatus.CLOSED, NetStatus.ARCHIVED]))
    )
    avg_check_ins_per_net = round(avg_checkins_result.scalar() or 0, 1)
    
    # Time series: Nets per day for last 30 days
    nets_per_day = await _get_nets_per_day(db, 30)
    
    # Time series: Nets per week for last 6 months (26 weeks)
    nets_per_week = await _get_nets_per_week(db, 26)
    
    # Time series: Check-ins per day for last 30 days
    check_ins_per_day = await _get_check_ins_per_day(db, 30)
    
    # Time series: Unique operators per week for last 6 months
    unique_operators_per_week = await _get_unique_operators_per_week(db, 26)
    
    return GlobalStatsResponse(
        total_nets=total_nets,
        total_check_ins=total_check_ins,
        total_users=total_users,
        unique_operators=unique_operators,
        active_nets=active_nets,
        nets_last_24h=nets_last_24h,
        nets_last_7_days=nets_last_7_days,
        nets_last_30_days=nets_last_30_days,
        check_ins_last_24h=check_ins_last_24h,
        check_ins_last_7_days=check_ins_last_7_days,
        avg_check_ins_per_net=avg_check_ins_per_net,
        nets_per_day=nets_per_day,
        nets_per_week=nets_per_week,
        check_ins_per_day=check_ins_per_day,
        unique_operators_per_week=unique_operators_per_week
    )


@router.get("/nets/{net_id}", response_model=NetStatsResponse)
async def get_net_statistics(
    net_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
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
        end_time = net.closed_at or datetime.now(timezone.utc)
        duration_minutes = int((end_time - net.started_at).total_seconds() / 60)
    
    # Check-ins by status
    status_counts = {}
    for checkin in net.check_ins:
        status = checkin.status.value if checkin.status else "unknown"
        status_counts[status] = status_counts.get(status, 0) + 1
    
    # Check-ins over time (binned by 10-minute intervals if net is long enough)
    check_ins_timeline = []
    if net.started_at and net.check_ins:
        sorted_checkins = sorted(net.check_ins, key=lambda c: c.checked_in_at)
        for checkin in sorted_checkins:
            minutes_from_start = int((checkin.checked_in_at - net.started_at).total_seconds() / 60)
            check_ins_timeline.append(TimeSeriesDataPoint(
                label=f"+{minutes_from_start}m",
                value=1,
                date=checkin.checked_in_at.isoformat()
            ))
    
    # Top operators (most check-ins including rechecks)
    callsign_counts = {}
    for checkin in net.check_ins:
        callsign_counts[checkin.callsign] = callsign_counts.get(checkin.callsign, 0) + 1
    
    top_operators = [
        TopOperator(callsign=cs, check_in_count=count)
        for cs, count in sorted(callsign_counts.items(), key=lambda x: -x[1])[:10]
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
        total_check_ins=total_check_ins,
        unique_callsigns=unique_callsigns,
        rechecks=rechecks,
        duration_minutes=duration_minutes,
        started_at=net.started_at,
        closed_at=net.closed_at,
        status_counts=status_counts,
        check_ins_timeline=check_ins_timeline,
        top_operators=top_operators,
        check_ins_by_frequency=freq_counts
    )


@router.get("/templates/{template_id}")
async def get_template_statistics(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Get historical statistics for a net template (recurring net series).
    """
    # Get template and all associated nets
    template_result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = template_result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get all nets from this template
    nets_result = await db.execute(
        select(Net)
        .options(selectinload(Net.check_ins))
        .where(Net.template_id == template_id)
        .order_by(Net.started_at.desc())
    )
    nets = nets_result.scalars().all()
    
    total_instances = len(nets)
    total_check_ins = sum(len(n.check_ins) for n in nets)
    
    # Average check-ins per instance
    avg_check_ins = round(total_check_ins / total_instances, 1) if total_instances > 0 else 0
    
    # Unique operators across all instances
    all_callsigns = set()
    for net in nets:
        all_callsigns.update(c.callsign for c in net.check_ins)
    
    # Regular operators (checked in to >50% of instances)
    callsign_appearances = {}
    for net in nets:
        net_callsigns = set(c.callsign for c in net.check_ins)
        for cs in net_callsigns:
            callsign_appearances[cs] = callsign_appearances.get(cs, 0) + 1
    
    regular_operators = [
        {"callsign": cs, "appearances": count, "percentage": round(count/total_instances*100, 1)}
        for cs, count in sorted(callsign_appearances.items(), key=lambda x: -x[1])
        if count >= total_instances * 0.5
    ][:20]
    
    # Check-ins per instance over time
    instances_data = [
        {
            "net_id": net.id,
            "date": net.started_at.isoformat() if net.started_at else None,
            "check_in_count": len(net.check_ins),
            "unique_operators": len(set(c.callsign for c in net.check_ins))
        }
        for net in nets[:52]  # Last year of weekly nets
    ]
    
    return {
        "template_id": template_id,
        "template_name": template.name,
        "total_instances": total_instances,
        "total_check_ins": total_check_ins,
        "avg_check_ins_per_instance": avg_check_ins,
        "unique_operators": len(all_callsigns),
        "regular_operators": regular_operators,
        "instances": instances_data
    }


@router.get("/users/me", response_model=UserStatsResponse)
async def get_my_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get statistics for the current authenticated user.
    Shows their check-in history and participation across nets.
    """
    return await _get_user_statistics(db, current_user)


@router.get("/users/{user_id}", response_model=UserStatsResponse)
async def get_user_statistics(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Get public statistics for a user by ID.
    """
    user_result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)
    )
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return await _get_user_statistics(db, user)


async def _get_user_statistics(db: AsyncSession, user: User) -> UserStatsResponse:
    """Helper to build user statistics."""
    import json
    
    now = datetime.now(timezone.utc)
    last_30d = now - timedelta(days=30)
    
    # Get all callsigns for this user
    user_callsigns = [user.callsign] if user.callsign else []
    if user.gmrs_callsign:
        user_callsigns.append(user.gmrs_callsign)
    try:
        additional = json.loads(user.callsigns) if user.callsigns else []
        user_callsigns.extend(additional)
    except:
        pass
    
    if not user_callsigns:
        return UserStatsResponse(
            user_id=user.id,
            callsign=user.callsign,
            total_check_ins=0,
            unique_nets=0,
            nets_participated=0,
            nets_as_ncs=0,
            last_30_days_check_ins=0,
            nets_participated_list=[],
            check_ins_by_month=[],
            favorite_nets=[],
            frequent_nets=[]
        )
    
    # Get all check-ins by this user's callsigns
    check_ins_result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.net))
        .where(CheckIn.callsign.in_(user_callsigns))
        .order_by(CheckIn.checked_in_at.desc())
    )
    check_ins = check_ins_result.scalars().all()
    
    total_check_ins = len(check_ins)
    
    # Last 30 days check-ins
    last_30_days_check_ins = sum(1 for c in check_ins if c.checked_in_at >= last_30d)
    
    # Count nets as NCS (user is the ncs_operator of the net)
    ncs_result = await db.execute(
        select(func.count(Net.id)).where(Net.ncs_operator_id == user.id)
    )
    nets_as_ncs = ncs_result.scalar() or 0
    
    # Unique nets
    net_ids = set(c.net_id for c in check_ins)
    unique_nets = len(net_ids)
    
    # Net participation details
    net_participation = {}
    for checkin in check_ins:
        if checkin.net_id not in net_participation:
            net_participation[checkin.net_id] = {
                "net_id": checkin.net_id,
                "net_name": checkin.net.name if checkin.net else "Unknown",
                "template_id": checkin.net.template_id if checkin.net else None,
                "check_in_count": 0,
                "first_check_in": checkin.checked_in_at,
                "last_check_in": checkin.checked_in_at
            }
        net_participation[checkin.net_id]["check_in_count"] += 1
        if checkin.checked_in_at < net_participation[checkin.net_id]["first_check_in"]:
            net_participation[checkin.net_id]["first_check_in"] = checkin.checked_in_at
        if checkin.checked_in_at > net_participation[checkin.net_id]["last_check_in"]:
            net_participation[checkin.net_id]["last_check_in"] = checkin.checked_in_at
    
    nets_participated_list = [
        NetParticipation(**{k: v for k, v in p.items() if k != "template_id"}) 
        for p in sorted(
            net_participation.values(), 
            key=lambda x: -x["check_in_count"]
        )
    ]
    
    # Check-ins by month (last 12 months)
    monthly_counts = {}
    for i in range(12):
        month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(day=1)
        month_key = month_start.strftime("%Y-%m")
        monthly_counts[month_key] = 0
    
    for checkin in check_ins:
        month_key = checkin.checked_in_at.strftime("%Y-%m")
        if month_key in monthly_counts:
            monthly_counts[month_key] += 1
    
    check_ins_by_month = [
        TimeSeriesDataPoint(label=k, value=v, date=f"{k}-01")
        for k, v in sorted(monthly_counts.items())
    ]
    
    # Favorite nets (most check-ins, simple list)
    favorite_nets = [
        CheckInsByNet(net_id=p.net_id, net_name=p.net_name, count=p.check_in_count)
        for p in nets_participated_list[:5]
    ]
    
    # Frequent nets - group by template for recurring nets, calculate participation rate
    # First, get all templates and their instance counts
    template_check_ins = {}  # template_id -> {name, user_check_ins, template_id}
    standalone_check_ins = {}  # net_id -> {name, user_check_ins}
    
    for net_id, data in net_participation.items():
        template_id = data.get("template_id")
        if template_id:
            if template_id not in template_check_ins:
                template_check_ins[template_id] = {
                    "net_name": data["net_name"],
                    "template_id": template_id,
                    "user_check_ins": 0
                }
            template_check_ins[template_id]["user_check_ins"] += data["check_in_count"]
        else:
            standalone_check_ins[net_id] = {
                "net_name": data["net_name"],
                "user_check_ins": data["check_in_count"]
            }
    
    # Get total instances for each template
    frequent_nets = []
    for template_id, data in template_check_ins.items():
        # Count total instances of this template
        instance_count_result = await db.execute(
            select(func.count(Net.id)).where(
                Net.template_id == template_id,
                Net.status.in_([NetStatus.CLOSED, NetStatus.ARCHIVED])
            )
        )
        total_instances = instance_count_result.scalar() or 1
        
        # Calculate participation rate
        participation_rate = data["user_check_ins"] / total_instances if total_instances > 0 else 0
        
        frequent_nets.append(FrequentNetStats(
            net_name=data["net_name"],
            template_id=template_id,
            check_ins=data["user_check_ins"],
            total_instances=total_instances,
            participation_rate=min(participation_rate, 1.0)  # Cap at 100%
        ))
    
    # Add standalone nets (no template) 
    for net_id, data in standalone_check_ins.items():
        frequent_nets.append(FrequentNetStats(
            net_name=data["net_name"],
            template_id=None,
            check_ins=data["user_check_ins"],
            total_instances=1,
            participation_rate=1.0 if data["user_check_ins"] > 0 else 0
        ))
    
    # Sort by check-in count descending
    frequent_nets.sort(key=lambda x: -x.check_ins)
    
    return UserStatsResponse(
        user_id=user.id,
        callsign=user.callsign,
        total_check_ins=total_check_ins,
        unique_nets=unique_nets,
        nets_participated=unique_nets,
        nets_as_ncs=nets_as_ncs,
        last_30_days_check_ins=last_30_days_check_ins,
        nets_participated_list=nets_participated_list,
        check_ins_by_month=check_ins_by_month,
        favorite_nets=favorite_nets,
        frequent_nets=frequent_nets[:10]  # Top 10
    )


# Helper functions for time series data

async def _get_nets_per_day(db: AsyncSession, days: int) -> List[TimeSeriesDataPoint]:
    """Get count of nets started per day for the last N days."""
    now = datetime.now(timezone.utc)
    result = []
    
    for i in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        count_result = await db.execute(
            select(func.count(Net.id)).where(
                and_(
                    Net.started_at >= day_start,
                    Net.started_at < day_end,
                    Net.status.in_([NetStatus.ACTIVE, NetStatus.CLOSED, NetStatus.ARCHIVED])
                )
            )
        )
        count = count_result.scalar() or 0
        
        result.append(TimeSeriesDataPoint(
            label=day_start.strftime("%m/%d"),
            value=count,
            date=day_start.date().isoformat()
        ))
    
    return result


async def _get_nets_per_week(db: AsyncSession, weeks: int) -> List[TimeSeriesDataPoint]:
    """Get count of nets started per week for the last N weeks."""
    now = datetime.now(timezone.utc)
    result = []
    
    for i in range(weeks - 1, -1, -1):
        week_start = (now - timedelta(weeks=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = week_start - timedelta(days=week_start.weekday())  # Start of week (Monday)
        week_end = week_start + timedelta(weeks=1)
        
        count_result = await db.execute(
            select(func.count(Net.id)).where(
                and_(
                    Net.started_at >= week_start,
                    Net.started_at < week_end,
                    Net.status.in_([NetStatus.ACTIVE, NetStatus.CLOSED, NetStatus.ARCHIVED])
                )
            )
        )
        count = count_result.scalar() or 0
        
        result.append(TimeSeriesDataPoint(
            label=week_start.strftime("%m/%d"),
            value=count,
            date=week_start.date().isoformat()
        ))
    
    return result


async def _get_check_ins_per_day(db: AsyncSession, days: int) -> List[TimeSeriesDataPoint]:
    """Get count of check-ins per day for the last N days."""
    now = datetime.now(timezone.utc)
    result = []
    
    for i in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        count_result = await db.execute(
            select(func.count(CheckIn.id)).where(
                and_(
                    CheckIn.checked_in_at >= day_start,
                    CheckIn.checked_in_at < day_end
                )
            )
        )
        count = count_result.scalar() or 0
        
        result.append(TimeSeriesDataPoint(
            label=day_start.strftime("%m/%d"),
            value=count,
            date=day_start.date().isoformat()
        ))
    
    return result


async def _get_unique_operators_per_week(db: AsyncSession, weeks: int) -> List[TimeSeriesDataPoint]:
    """Get count of unique operators (callsigns) per week for the last N weeks."""
    now = datetime.now(timezone.utc)
    result = []
    
    for i in range(weeks - 1, -1, -1):
        week_start = (now - timedelta(weeks=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = week_start - timedelta(days=week_start.weekday())  # Start of week (Monday)
        week_end = week_start + timedelta(weeks=1)
        
        count_result = await db.execute(
            select(func.count(distinct(CheckIn.callsign))).where(
                and_(
                    CheckIn.checked_in_at >= week_start,
                    CheckIn.checked_in_at < week_end
                )
            )
        )
        count = count_result.scalar() or 0
        
        result.append(TimeSeriesDataPoint(
            label=week_start.strftime("%m/%d"),
            value=count,
            date=week_start.date().isoformat()
        ))
    
    return result
