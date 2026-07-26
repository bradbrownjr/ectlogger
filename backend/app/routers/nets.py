"""
Net router facade — assembles sub-routers into the /nets prefix.

Routes live in:
  nets_core.py   — lifecycle (create, list, get, start, go-live, close, …)
  nets_polls.py  — poll and topic-response queries
  nets_export.py — CSV/ICS-309 export, CSV import, archive, clone, delete
  nets_roles.py  — role assignment, NCS claim/toggle, frequency claim, email
"""
from fastapi import APIRouter

from app.routers.nets_core import router as nets_core_router
from app.routers.nets_export import router as nets_export_router
from app.routers.nets_polls import router as nets_polls_router
from app.routers.nets_roles import router as nets_roles_router

router = APIRouter(prefix="/nets", tags=["nets"])
router.include_router(nets_core_router)
router.include_router(nets_polls_router)
router.include_router(nets_export_router)
router.include_router(nets_roles_router)
