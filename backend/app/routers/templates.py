"""
Templates router facade — assembles sub-routers into the /templates prefix.

Routes live in:
  templates_core.py          — CRUD (create, list, get, update, delete)
  templates_merge.py         — merge preview/execute, linkable-nets, create-net
  templates_subscriptions.py — subscribe/unsubscribe, subscription list, email-subscribers
  templates_topics.py        — topic-history CRUD
"""
from fastapi import APIRouter

from app.routers.templates_core import router as templates_core_router
from app.routers.templates_merge import router as templates_merge_router
from app.routers.templates_subscriptions import router as templates_subscriptions_router
from app.routers.templates_topics import router as templates_topics_router

router = APIRouter(prefix="/templates", tags=["templates"])
router.include_router(templates_core_router)
router.include_router(templates_merge_router)
router.include_router(templates_subscriptions_router)
router.include_router(templates_topics_router)
