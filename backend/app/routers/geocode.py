"""
Geocoding API router - proxies requests to Nominatim to avoid CORS issues
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import httpx
import asyncio
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/geocode", tags=["geocode"])

# Simple in-memory cache for geocoding results
_geocode_cache: dict[str, dict] = {}

# Rate limiting - track last request time
_last_request_time = 0.0


class GeocodeResponse(BaseModel):
    lat: float
    lon: float
    display_name: Optional[str] = None


@router.get("", response_model=Optional[GeocodeResponse])
async def geocode_address(
    q: str = Query(..., description="Address or location to geocode")
):
    """
    Geocode an address using Nominatim (OpenStreetMap).
    Results are cached to reduce API calls.
    """
    global _last_request_time
    
    # Normalize query for caching
    cache_key = q.strip().lower()
    
    # Check cache first
    if cache_key in _geocode_cache:
        cached = _geocode_cache[cache_key]
        if cached is None:
            return None
        return GeocodeResponse(**cached)
    
    # Rate limiting - Nominatim requires 1 request per second
    import time
    current_time = time.time()
    time_since_last = current_time - _last_request_time
    if time_since_last < 1.0:
        await asyncio.sleep(1.0 - time_since_last)
    
    _last_request_time = time.time()
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "format": "json",
                    "q": q,
                    "limit": 1
                },
                headers={
                    "User-Agent": "ECTLogger/1.0 (Emergency Communications Team Logger; contact@ectlogger.us)"
                },
                timeout=10.0
            )
            
            if response.status_code == 429:
                # Rate limited - cache as None temporarily
                logger.warning(f"Nominatim rate limited for query: {q}")
                _geocode_cache[cache_key] = None
                return None
            
            if response.status_code != 200:
                logger.warning(f"Nominatim returned {response.status_code} for query: {q}")
                return None
            
            data = response.json()
            
            if data and len(data) > 0:
                result = {
                    "lat": float(data[0]["lat"]),
                    "lon": float(data[0]["lon"]),
                    "display_name": data[0].get("display_name")
                }
                _geocode_cache[cache_key] = result
                return GeocodeResponse(**result)
            else:
                # Cache empty result to avoid repeated lookups
                _geocode_cache[cache_key] = None
                return None
                
    except httpx.TimeoutException:
        logger.warning(f"Geocoding timeout for: {q}")
        return None
    except Exception as e:
        logger.error(f"Geocoding error for {q}: {e}")
        return None
