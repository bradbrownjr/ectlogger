"""
Geocoding API router - proxies requests to Nominatim to avoid CORS issues

Also holds the reverse lookup (coordinates -> "Town, ST") used when a user's
browser reports a live GPS position, so net control can read a station's town
instead of a grid square. Both directions share one rate limiter: Nominatim's
usage policy is 1 request per second for the whole application, not per call site.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
import httpx
import asyncio
import time
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/geocode", tags=["geocode"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org"
NOMINATIM_HEADERS = {
    "User-Agent": "ECTLogger/1.0 (Emergency Communications Team Logger; contact@ectlogger.us)"
}

# Simple in-memory caches for geocoding results (None = looked up, nothing found)
_geocode_cache: dict[str, Optional[dict]] = {}
_reverse_cache: dict[str, Optional[str]] = {}

# Rate limiting - the lock serializes callers so concurrent requests can't both
# read a stale last-request time and fire together
_rate_lock = asyncio.Lock()
_last_request_time = 0.0

# Countries whose first-level subdivision is conventionally written as a short
# code after the town ("Waterboro, ME", "Ottawa, ON"). Everywhere else gets the
# country name, which reads more naturally than an ISO code few people know.
_SUBDIVISION_CODE_COUNTRIES = {"us", "ca", "au", "mx"}

# Nominatim address keys that name a populated place, most specific first
_PLACE_KEYS = ("town", "city", "village", "hamlet", "municipality")


class GeocodeResponse(BaseModel):
    lat: float
    lon: float
    display_name: Optional[str] = None


async def _nominatim_get(path: str, params: dict) -> Optional[httpx.Response]:
    """GET a Nominatim endpoint under the shared 1-request-per-second limit.

    Returns the response, or None on timeout/connection failure.
    """
    global _last_request_time
    async with _rate_lock:
        wait = 1.0 - (time.time() - _last_request_time)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_time = time.time()
        try:
            async with httpx.AsyncClient() as client:
                return await client.get(
                    f"{NOMINATIM_URL}/{path}",
                    params=params,
                    headers=NOMINATIM_HEADERS,
                    timeout=10.0,
                )
        except httpx.TimeoutException:
            logger.warning(f"Nominatim timeout for {path} {params}")
        except Exception as e:
            logger.error(f"Nominatim error for {path} {params}: {e}")
        return None


def format_town(address: dict) -> Optional[str]:
    """Turn a Nominatim address block into "Town, ST" or "Town, Country".

    Falls back to the county when there is no populated place (unorganized
    territory), and to just the place name when the region is unknown.
    """
    place = next((address[k] for k in _PLACE_KEYS if address.get(k)), None) or address.get("county")
    if not place:
        return None

    country_code = (address.get("country_code") or "").lower()
    subdivision = address.get("ISO3166-2-lvl4") or ""  # e.g. "US-ME"
    if country_code in _SUBDIVISION_CODE_COUNTRIES and "-" in subdivision:
        region = subdivision.split("-", 1)[1]
    else:
        region = address.get("country")

    return f"{place}, {region}" if region else place


async def reverse_geocode_town(lat: float, lon: float) -> Optional[str]:
    """Coordinates -> "Town, ST" (see format_town), or None if unknown/unavailable.

    Callers pass coordinates already rounded to about 1 km; the cache key rounds
    again so a caller that forgets still gets cache hits and never sends more
    precision than a town lookup needs.
    """
    lat, lon = round(lat, 2), round(lon, 2)
    cache_key = f"{lat},{lon}"
    if cache_key in _reverse_cache:
        return _reverse_cache[cache_key]

    response = await _nominatim_get("reverse", {
        "format": "jsonv2",
        "lat": lat,
        "lon": lon,
        "zoom": 10,  # city/town level
        "addressdetails": 1,
        "accept-language": "en",
    })
    if response is None or response.status_code != 200:
        # Not cached: a transient failure should be retried on the next update
        if response is not None:
            logger.warning(f"Nominatim reverse returned {response.status_code} for {cache_key}")
        return None

    try:
        town = format_town(response.json().get("address") or {})
    except ValueError:
        logger.warning(f"Nominatim reverse returned unreadable JSON for {cache_key}")
        return None
    _reverse_cache[cache_key] = town
    return town


@router.get("", response_model=Optional[GeocodeResponse])
async def geocode_address(
    q: str = Query(..., description="Address or location to geocode")
):
    """
    Geocode an address using Nominatim (OpenStreetMap).
    Results are cached to reduce API calls.
    """
    # Normalize query for caching
    cache_key = q.strip().lower()

    # Check cache first
    if cache_key in _geocode_cache:
        cached = _geocode_cache[cache_key]
        if cached is None:
            return None
        return GeocodeResponse(**cached)

    response = await _nominatim_get("search", {"format": "json", "q": q, "limit": 1})
    if response is None:
        return None

    if response.status_code == 429:
        # Rate limited - cache as None temporarily
        logger.warning(f"Nominatim rate limited for query: {q}")
        _geocode_cache[cache_key] = None
        return None

    if response.status_code != 200:
        logger.warning(f"Nominatim returned {response.status_code} for query: {q}")
        return None

    try:
        data = response.json()
    except ValueError:
        logger.warning(f"Nominatim returned unreadable JSON for query: {q}")
        return None

    if data and len(data) > 0:
        result = {
            "lat": float(data[0]["lat"]),
            "lon": float(data[0]["lon"]),
            "display_name": data[0].get("display_name")
        }
        _geocode_cache[cache_key] = result
        return GeocodeResponse(**result)

    # Cache empty result to avoid repeated lookups
    _geocode_cache[cache_key] = None
    return None
