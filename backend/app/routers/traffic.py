"""
Traffic router facade — assembles sub-routers into the /traffic prefix.
See docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.

Routes live in:
  traffic_definitions.py — form definition catalog (list, get, admin update)
  traffic_forms.py       — form instance CRUD, visibility-scoped listing, and
                            the per-net summary
  traffic_export.py      — plaintext/PDF export for a single form

traffic_log.py (chain-of-custody log, import) is a later phase and is not
registered here yet.
"""
from fastapi import APIRouter

from app.routers.traffic_definitions import router as traffic_definitions_router
from app.routers.traffic_export import router as traffic_export_router
from app.routers.traffic_forms import router as traffic_forms_router

router = APIRouter(prefix="/traffic", tags=["traffic"])
router.include_router(traffic_definitions_router)
router.include_router(traffic_forms_router)
router.include_router(traffic_export_router)
