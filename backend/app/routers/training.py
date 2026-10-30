"""Training sessions listed in the top bar's Help > Training dialog.

Admins post, edit and remove sessions; everyone, signed in or not, reads the
ones that are not over yet. The online meeting link is withheld from signed-out
visitors (the dialog says a link exists and asks them to sign in), so a Zoom
room is never published to the open web. Nothing here returns who posted a
session.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import field_changes, record_event
from app.database import get_db
from app.dependencies import get_admin_user, get_current_user_optional
from app.models import TrainingSession, User
from app.schemas import TrainingSessionCreate, TrainingSessionResponse, TrainingSessionUpdate

router = APIRouter(prefix="/training", tags=["training"])

# How long a session with no end time stays listed after it starts.
OPEN_ENDED_SESSION_HOURS = 2

_EDITABLE_FIELDS = ("title", "starts_at", "ends_at", "location", "online_url", "details")


def _response(session: TrainingSession, signed_in: bool) -> TrainingSessionResponse:
    """A session as the viewer may see it: the online link only when signed in."""
    return TrainingSessionResponse(
        id=session.id,
        title=session.title,
        starts_at=session.starts_at,
        ends_at=session.ends_at,
        location=session.location,
        online_url=session.online_url if signed_in else None,
        has_online_link=bool(session.online_url),
        details=session.details,
    )


async def _load(db: AsyncSession, session_id: int) -> TrainingSession:
    session = await db.get(TrainingSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training session not found")
    return session


@router.get("/sessions", response_model=List[TrainingSessionResponse])
async def list_training_sessions(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Sessions not over yet, soonest first. Over means now is past the end time,
    or, with no end time, two hours past the start. Open to guests, whose
    responses carry no online_url (has_online_link says whether one exists)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # stored times are naive UTC
    still_listed = or_(
        TrainingSession.ends_at > now,
        and_(TrainingSession.ends_at.is_(None),
             TrainingSession.starts_at > now - timedelta(hours=OPEN_ENDED_SESSION_HOURS)),
    )
    result = await db.execute(
        select(TrainingSession).where(still_listed).order_by(TrainingSession.starts_at, TrainingSession.id)
    )
    return [_response(s, current_user is not None) for s in result.scalars().all()]


@router.post("/sessions", response_model=TrainingSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_training_session(
    data: TrainingSessionCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Post a training session (admin only)."""
    session = TrainingSession(**data.model_dump(), created_by_id=current_user.id)
    db.add(session)
    await db.flush()  # the id, for the activity log
    record_event(db, "training.session_created", current_user, target_type="training_session",
                 target_id=session.id, target_label=session.title)
    await db.commit()
    return _response(session, True)


@router.put("/sessions/{session_id}", response_model=TrainingSessionResponse)
async def update_training_session(
    session_id: int,
    data: TrainingSessionUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace a session's fields (admin only). The edit form sends all of them."""
    session = await _load(db, session_id)
    values = data.model_dump()
    changes = field_changes(session, values, _EDITABLE_FIELDS)
    for field in _EDITABLE_FIELDS:
        setattr(session, field, values[field])
    if changes:
        record_event(db, "training.session_changed", current_user, target_type="training_session",
                     target_id=session.id, target_label=session.title, details={"changes": changes})
    await db.commit()
    return _response(session, True)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_training_session(
    session_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a session (admin only)."""
    session = await _load(db, session_id)
    record_event(db, "training.session_deleted", current_user, target_type="training_session",
                 target_id=session.id, target_label=session.title)
    await db.delete(session)
    await db.commit()
    return None
