import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import CheckIn, Net, NetRole, NetStatus, NetTemplate, NetTemplateSubscription, User
from app.schemas import (
    CheckInMapDataPoint,
    CheckInMapResponse,
    CheckInsByNet,
    FrequentNetStats,
    GlobalStatsResponse,
    NcsNetEntry,
    NetParticipation,
    NetStatsResponse,
    TimeSeriesDataPoint,
    TopOperator,
    UserStatsResponse,
)

router = APIRouter()

@router.get("/global", response_model=GlobalStatsResponse)
async def get_global_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
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
