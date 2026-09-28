"""
Schedule page month calendar: every net occurrence in a date window.

Mounted ahead of templates_core so ``/templates/calendar`` is not captured by
``/templates/{template_id}``.
"""
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import CalendarOccurrence
from app.services.schedule_occurrences import get_occurrences

router = APIRouter()

# A month grid is six weeks (42 days); allow some slack but no more.
MAX_WINDOW = timedelta(days=62)
# How far ahead the calendar may page. Projections are regenerated from each
# schedule's rotation anchor on every request, so the cost grows with distance.
MAX_FORWARD = timedelta(days=366)


@router.get("/calendar", response_model=List[CalendarOccurrence])
async def get_calendar(
    start: datetime = Query(..., description="Window start (ISO 8601, with offset)"),
    end: datetime = Query(..., description="Window end, exclusive (ISO 8601, with offset)"),
    db: AsyncSession = Depends(get_db),
):
    """Occurrences starting in [start, end): real nets plus projected future slots.

    Public, like the schedule list it sits beside. Past months come only from
    real nets; projections begin at the current moment. Times are returned in
    UTC and placed on a day by the viewer's browser.
    """
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be after start")
    if end - start > MAX_WINDOW:
        raise HTTPException(status_code=400, detail="Window is limited to 62 days")
    if start > datetime.now(timezone.utc) + MAX_FORWARD:
        raise HTTPException(status_code=400, detail="The calendar goes up to one year ahead")

    return await get_occurrences(db, start, end)
