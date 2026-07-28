import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import CheckIn, NetRole, NetTemplate, NetTemplateSubscription, User
from app.schemas import (
    CheckInMapDataPoint,
    CheckInMapResponse,
    CheckInsByNet,
    FrequentNetStats,
    GlobalStatsResponse,
    NcsNetEntry,
    NetParticipation,
    NetStatsResponse,
    TopOperator,
    UserStatsResponse,
)

router = APIRouter()

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
