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
    current_user: Optional[User] = Depends(get_current_user_optional)
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


def _ensure_tz_aware(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware (assumes UTC if naive)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _get_user_statistics(db: AsyncSession, user: User) -> UserStatsResponse:
    """Helper to build user statistics."""
    import json
    
    now = datetime.now(timezone.utc)
    last_30d = now - timedelta(days=30)
    
    # Get all callsigns for this user (current, additional aliases, and previous)
    user_callsigns = [user.callsign] if user.callsign else []
    if user.gmrs_callsign:
        user_callsigns.append(user.gmrs_callsign)
    try:
        additional = json.loads(user.callsigns) if user.callsigns else []
        user_callsigns.extend(additional)
    except:
        pass
    try:
        previous = json.loads(user.previous_callsigns) if user.previous_callsigns else []
        user_callsigns.extend(previous)
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
            frequent_nets=[],
            nets_as_ncs_list=[],
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
    
    # Last 30 days check-ins (ensure timezone-aware comparison)
    last_30_days_check_ins = sum(1 for c in check_ins if _ensure_tz_aware(c.checked_in_at) >= last_30d)
    
    # Nets as NCS/owner (user owns the net)
    ncs_result = await db.execute(
        select(Net).where(Net.owner_id == user.id).order_by(Net.started_at.desc())
    )
    ncs_nets = ncs_result.scalars().all()
    nets_as_ncs = len(ncs_nets)
    nets_as_ncs_list = [
        NcsNetEntry(net_id=n.id, net_name=n.name, started_at=n.started_at, closed_at=n.closed_at)
        for n in ncs_nets
    ]
    
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
        NetParticipation(**p)
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
        frequent_nets=frequent_nets[:10],
        nets_as_ncs_list=nets_as_ncs_list,
    )


# ========== Check-In Geographic Map ==========

# Regex for Maidenhead grid square: 2 letters (A-R) + 2 digits, optional subsquare + extended
_MAIDENHEAD_RE = re.compile(r'^([A-Ra-r]{2})(\d{2})([A-Xa-x]{2})?(\d{2})?$')

# US state abbreviation regex (word boundary match at end of string or after comma/space)
_STATE_ABBREV_RE = re.compile(
    r'(?:,\s*|\s+)'
    r'(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|'
    r'MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|'
    r'DC|AS|GU|MP|PR|VI|'
    # Canadian provinces
    r'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$',
    re.IGNORECASE
)

# State/province centroids (lat, lon) for mapping text locations
_REGION_CENTROIDS: dict[str, tuple[float, float]] = {
    # US States
    "AL": (32.806671, -86.791130), "AK": (61.370716, -152.404419),
    "AZ": (33.729759, -111.431221), "AR": (34.969704, -92.373123),
    "CA": (36.116203, -119.681564), "CO": (39.059811, -105.311104),
    "CT": (41.597782, -72.755371), "DE": (39.318523, -75.507141),
    "FL": (27.766279, -81.686783), "GA": (33.040619, -83.643074),
    "HI": (21.094318, -157.498337), "ID": (44.240459, -114.478773),
    "IL": (40.349457, -88.986137), "IN": (39.849426, -86.258278),
    "IA": (42.011539, -93.210526), "KS": (38.526600, -96.726486),
    "KY": (37.668140, -84.670067), "LA": (31.169546, -91.867805),
    "ME": (44.693947, -69.381927), "MD": (39.063946, -76.802101),
    "MA": (42.230171, -71.530106), "MI": (43.326618, -84.536095),
    "MN": (45.694454, -93.900192), "MS": (32.741646, -89.678696),
    "MO": (38.456085, -92.288368), "MT": (46.921925, -110.454353),
    "NE": (41.125370, -98.268082), "NV": (38.313515, -117.055374),
    "NH": (43.452492, -71.563896), "NJ": (40.298904, -74.521011),
    "NM": (34.840515, -106.248482), "NY": (42.165726, -74.948051),
    "NC": (35.630066, -79.806419), "ND": (47.528912, -99.784012),
    "OH": (40.388783, -82.764915), "OK": (35.565342, -96.928917),
    "OR": (44.572021, -122.070938), "PA": (40.590752, -77.209755),
    "RI": (41.680893, -71.511780), "SC": (33.856892, -80.945007),
    "SD": (44.299782, -99.438828), "TN": (35.747845, -86.692345),
    "TX": (31.054487, -97.563461), "UT": (40.150032, -111.862434),
    "VT": (44.045876, -72.710686), "VA": (37.769337, -78.169968),
    "WA": (47.400902, -121.490494), "WV": (38.491226, -80.954456),
    "WI": (44.268543, -89.616508), "WY": (42.755966, -107.302490),
    "DC": (38.897438, -77.026817),
    # US Territories
    "AS": (-14.270972, -170.132217), "GU": (13.444304, 144.793731),
    "MP": (15.097900, 145.673900), "PR": (18.220833, -66.590149),
    "VI": (18.335765, -64.896335),
    # Canadian Provinces
    "AB": (53.933271, -116.576503), "BC": (53.726669, -127.647621),
    "MB": (53.760860, -98.813873), "NB": (46.565580, -66.461820),
    "NL": (53.135509, -57.660435), "NS": (44.681987, -63.744311),
    "NT": (64.825500, -124.845700), "NU": (70.299770, -83.107490),
    "ON": (51.253775, -85.323214), "PE": (46.510712, -63.416813),
    "QC": (52.939916, -73.549136), "SK": (52.939916, -106.450856),
    "YT": (64.282823, -135.000000),
}


def _parse_maidenhead_to_latlon(grid: str) -> tuple[float, float] | None:
    """Convert a Maidenhead grid square string to its approximate center lat/lon.
    The caller is expected to then resolve this to a state/province centroid via
    _nearest_region() so individual positions are never exposed on the map.
    """
    match = _MAIDENHEAD_RE.match(grid)
    if not match:
        return None

    field = match.group(1).upper()
    digits = match.group(2)

    field1 = ord(field[0]) - ord('A')  # 0-17
    field2 = ord(field[1]) - ord('A')  # 0-17
    square1 = int(digits[0])  # 0-9
    square2 = int(digits[1])  # 0-9

    # Center of the 4-char grid square (2° lon x 1° lat)
    lon = (field1 * 20) - 180 + (square1 * 2) + 1
    lat = (field2 * 10) - 90 + (square2 * 1) + 0.5

    return (lat, lon)


def _extract_state_abbrev(location: str) -> str | None:
    """Try to extract a US state or Canadian province abbreviation from a text location."""
    match = _STATE_ABBREV_RE.search(location.strip())
    if match:
        return match.group(1).upper()
    return None


# Maximum squared-degree distance (~1500 km) before we give up resolving a grid to a region.
# Keeps overseas grid squares (e.g. Europe) from being pinned to the nearest US state.
_MAX_NEAREST_DIST_SQ = 15.0 ** 2  # 15° ≈ 1500 km at mid-latitudes


def _nearest_region(lat: float, lon: float) -> str | None:
    """Return the abbreviation of the nearest state/province centroid to (lat, lon).
    Returns None if all centroids are farther than _MAX_NEAREST_DIST_SQ.
    Uses squared Euclidean distance in degrees — fast and sufficient for this purpose.
    """
    best_key = None
    best_dist = float('inf')
    for key, (clat, clon) in _REGION_CENTROIDS.items():
        dist = (lat - clat) ** 2 + (lon - clon) ** 2
        if dist < best_dist:
            best_dist = dist
            best_key = key
    return best_key if best_dist <= _MAX_NEAREST_DIST_SQ else None


