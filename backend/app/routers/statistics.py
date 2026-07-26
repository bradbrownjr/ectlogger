"""
Statistics router facade — assembles sub-routers into the /statistics prefix.

Routes live in:
  statistics_global.py — GET /global
  statistics_net.py    — GET /nets/{net_id}, GET /templates/{template_id}
  statistics_user.py   — GET /users/me, GET /users/{user_id}
  statistics_geo.py    — GET /checkin-map
"""
from fastapi import APIRouter

from app.routers.statistics_geo import router as statistics_geo_router
from app.routers.statistics_global import router as statistics_global_router
from app.routers.statistics_net import router as statistics_net_router
from app.routers.statistics_user import router as statistics_user_router

router = APIRouter(prefix="/statistics", tags=["statistics"])
router.include_router(statistics_global_router)
router.include_router(statistics_net_router)
router.include_router(statistics_user_router)
router.include_router(statistics_geo_router)
