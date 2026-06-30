from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Literal
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import User, UserRole
from app.dependencies import get_current_user
from app.email_service import EmailService
from app.logger import logger

router = APIRouter(prefix="/feedback", tags=["feedback"])
_limiter = Limiter(key_func=get_remote_address)


class FeedbackCreate(BaseModel):
    type: Literal["bug", "feature"]
    subject: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=10, max_length=5000)


@router.post("")
@_limiter.limit("5/hour")
async def submit_feedback(
    request: Request,
    feedback: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a bug report or feature request; emails all admin users."""
    result = await db.execute(
        select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    )
    admins = result.scalars().all()

    if not admins:
        logger.warning("FEEDBACK", "No admin users to notify — feedback received but not emailed")
        return {"message": "Feedback received"}

    type_label = "Bug Report" if feedback.type == "bug" else "Feature Request"

    for admin in admins:
        try:
            await EmailService.send_feedback_email(
                to_email=admin.email,
                type_label=type_label,
                subject=feedback.subject,
                body=feedback.body,
                submitter_callsign=current_user.callsign,
                submitter_name=current_user.name,
                submitter_email=current_user.email,
            )
        except Exception as e:
            logger.error("FEEDBACK", f"Failed to notify admin {admin.email}: {e}")

    submitter = current_user.callsign or current_user.name or current_user.email
    logger.info("FEEDBACK", f"[{type_label}] from {submitter}: {feedback.subject}")
    return {"message": "Feedback submitted"}
