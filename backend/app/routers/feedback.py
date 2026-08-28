import base64

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Literal, Optional
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.database import get_db
from app.models import User, UserRole
from app.dependencies import get_current_user
from app.email_service import EmailService
from app.logger import logger

router = APIRouter(prefix="/feedback", tags=["feedback"])
_limiter = Limiter(key_func=get_remote_address)

# Screenshots ride along in the same admin email as a real attachment (see
# email/digest.py); nothing is persisted server-side. Kept to mail-friendly
# raster types and a size a reporter's screen capture won't realistically
# exceed -- this is a support aid, not a file upload feature.
ALLOWED_SCREENSHOT_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024  # 5 MB

# Label per feedback type, using GitHub's own default labels so no repo
# setup is required beyond the token. "in-app-feedback" tags the source so
# these are easy to triage separately from issues filed by hand.
_GITHUB_TYPE_LABELS = {"bug": "bug", "feature": "enhancement"}


class FeedbackCreate(BaseModel):
    type: Literal["bug", "feature"]
    subject: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=10, max_length=5000)
    # Plain-text environment snapshot from clientDiagnostics.ts; the user opts
    # in via a checkbox, so this is never sent silently.
    diagnostics: Optional[str] = Field(None, max_length=4000)
    # Base64 (no data: URL prefix) -- max_length is a generous upper bound on
    # the encoded string; the real 5 MB decoded-size limit is enforced below.
    screenshot_data: Optional[str] = Field(None, max_length=7_000_000)
    screenshot_filename: Optional[str] = Field(None, max_length=200)
    screenshot_mime: Optional[str] = Field(None, max_length=100)


async def _create_github_issue(feedback: FeedbackCreate, submitter_callsign: str, submitter_name: str) -> Optional[tuple[str, int]]:
    """Best-effort: open a public GitHub issue for a feedback submission.

    Returns (issue URL, issue number) on success, None if disabled or on any
    failure (network, auth, rate limit) -- this must never block the admin
    email path, which is the reliable notification channel. Submitter email
    is intentionally omitted from the issue body since it's public; callsign
    and name are already public via FCC lookup.
    """
    if not settings.github_issues_token:
        return None

    body_lines = [
        feedback.body,
        "",
        "---",
        f"Submitted by {submitter_callsign} ({submitter_name}) via in-app feedback.",
    ]
    if feedback.diagnostics:
        body_lines += ["", "<details><summary>Diagnostics</summary>", "", "```", feedback.diagnostics, "```", "</details>"]
    if feedback.screenshot_data:
        body_lines += ["", "_A screenshot was attached; it was sent in the admin email notification, not this issue._"]

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.github.com/repos/{settings.github_issues_repo}/issues",
                headers={
                    "Authorization": f"Bearer {settings.github_issues_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                json={
                    "title": feedback.subject,
                    "body": "\n".join(body_lines),
                    "labels": [_GITHUB_TYPE_LABELS[feedback.type], "in-app-feedback"],
                },
                timeout=10.0,
            )
            response.raise_for_status()
            issue = response.json()
            return issue.get("html_url"), issue.get("number")
    except Exception as e:
        logger.error("FEEDBACK", f"Failed to create GitHub issue: {e}")
        return None


@router.post("")
@_limiter.limit("5/hour")
async def submit_feedback(
    request: Request,
    feedback: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a bug report or feature request; emails all admin users."""
    screenshot = None
    if feedback.screenshot_data:
        if feedback.screenshot_mime not in ALLOWED_SCREENSHOT_MIME_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported screenshot type")
        try:
            screenshot_bytes = base64.b64decode(feedback.screenshot_data, validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid screenshot data")
        if len(screenshot_bytes) > MAX_SCREENSHOT_BYTES:
            raise HTTPException(status_code=400, detail="Screenshot too large (max 5 MB)")
        filename = (feedback.screenshot_filename or "screenshot.png").replace("/", "_").replace("\\", "_")
        screenshot = (screenshot_bytes, filename, feedback.screenshot_mime)

    type_label = "Bug Report" if feedback.type == "bug" else "Feature Request"
    submitter = current_user.callsign or current_user.name or current_user.email

    issue_url, issue_number = await _create_github_issue(feedback, current_user.callsign, current_user.name) or (None, None)
    if issue_url:
        logger.info("FEEDBACK", f"Created GitHub issue #{issue_number} for [{type_label}] from {submitter}: {issue_url}")

    result = await db.execute(
        select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    )
    admins = result.scalars().all()

    if not admins:
        logger.warning("FEEDBACK", "No admin users to notify — feedback received but not emailed")
        return {"message": "Feedback received", "github_issue_url": issue_url, "github_issue_number": issue_number}

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
                diagnostics=feedback.diagnostics,
                screenshot=screenshot,
                github_issue_url=issue_url,
                github_issue_number=issue_number,
            )
        except Exception as e:
            logger.error("FEEDBACK", f"Failed to notify admin {admin.email}: {e}")

    logger.info("FEEDBACK", f"[{type_label}] from {submitter}: {feedback.subject}")
    return {"message": "Feedback submitted", "github_issue_url": issue_url, "github_issue_number": issue_number}
