"""
Traffic router facade — assembles sub-routers into the /traffic prefix.
See docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.

Routes live in:
  traffic_definitions.py — form definition catalog (list, get, admin update)
  traffic_forms.py       — form instance CRUD and visibility-scoped listing

traffic_log.py and traffic_export.py (chain-of-custody log, export/import)
are later phases and are not registered here yet.
"""
from fastapi import APIRouter

from app.routers.traffic_definitions import router as traffic_definitions_router
from app.routers.traffic_forms import router as traffic_forms_router

router = APIRouter(prefix="/traffic", tags=["traffic"])
router.include_router(traffic_definitions_router)
router.include_router(traffic_forms_router)
