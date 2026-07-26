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

@router.get("/checkin-map", response_model=CheckInMapResponse)
async def get_checkin_map(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get geographic distribution of check-ins for the statistics map.
    All locations — whether grid squares or text — are resolved to the nearest
    US state or Canadian province centroid, so each region produces at most one pin.
    No authentication required (public statistics).
    """
    # Query all distinct locations with their check-in counts
    result = await db.execute(
        select(CheckIn.location, func.count(CheckIn.id).label("count"))
        .where(CheckIn.location != None, CheckIn.location != "")
        .group_by(CheckIn.location)
    )
    location_counts = result.all()

    # Aggregate by coarsened region (4-char grid or state/province)
    region_aggregation: dict[str, dict] = {}  # region_key -> {lat, lon, count}
    total_parsed = 0

    for raw_location, count in location_counts:
        if not raw_location or not raw_location.strip():
            continue

        location = raw_location.strip()
        region_key = None
        lat = None
        lon = None

        # Try Maidenhead grid square first — resolve to nearest state/province
        coords = _parse_maidenhead_to_latlon(location)
        if coords:
            grid_lat, grid_lon = coords
            region = _nearest_region(grid_lat, grid_lon)
            if region:
                region_key = region
                lat, lon = _REGION_CENTROIDS[region]
        else:
            # Try to extract state/province abbreviation from text
            state = _extract_state_abbrev(location)
            if state and state in _REGION_CENTROIDS:
                region_key = state
                lat, lon = _REGION_CENTROIDS[state]

        if region_key and lat is not None and lon is not None:
            total_parsed += 1
            if region_key in region_aggregation:
                region_aggregation[region_key]["count"] += count
            else:
                region_aggregation[region_key] = {
                    "lat": lat,
                    "lon": lon,
                    "count": count,
                }

    regions = [
        CheckInMapDataPoint(
            region=key,
            latitude=data["lat"],
            longitude=data["lon"],
            count=data["count"],
        )
        for key, data in sorted(region_aggregation.items())
    ]

    return CheckInMapResponse(regions=regions, total_locations=total_parsed)


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
