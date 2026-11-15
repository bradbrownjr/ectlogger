"""
The Reports tab: the closing email's section list and its preview.

GET  /report-sections                          the catalogue (services/report_sections.py)
POST /nets/{net_id}/closing-email-preview      the email for this net
POST /templates/{template_id}/closing-email-preview
                                               the email for the schedule's latest closed net,
                                               or for a made-up one when it has none

Both previews take {report_sections: [...] | null} in place of the stored
value and return {subject, html, format, source}. They read only: nothing is
sent, written, or changed (services/closing_email_preview.py).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import CheckIn, Net, NetStatus, NetTemplate, User
from app.permissions import check_template_permission, may_edit_net, net_access
from app.schemas import ClosingEmailPreview, ClosingEmailPreviewRequest, ReportSectionInfo
from app.services.closing_email_preview import preview_from_example, preview_from_net, report_source
from app.services.report_sections import catalogue
from app.utils import resolve_display_tz

router = APIRouter(tags=["reports"])


@router.get("/report-sections", response_model=list[ReportSectionInfo])
async def list_report_sections(current_user: User = Depends(get_current_user)):
    """Every optional section of the closing email, in display order:
    [{key, label, help, requires_any, legacy_plain, legacy_ics309}]."""
    return catalogue()


def _net_query(net_id: int):
    return select(Net).options(
        selectinload(Net.frequencies),
        selectinload(Net.check_ins).selectinload(CheckIn.frequency),
    ).where(Net.id == net_id)


@router.post("/nets/{net_id}/closing-email-preview", response_model=ClosingEmailPreview)
async def preview_net_closing_email(
    net_id: int,
    body: ClosingEmailPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The closing email this net would send with body.report_sections.
    Needs the same permission as editing the net (permissions.may_edit_net).
    A net with no check-ins yet previews with example stations."""
    net = (await db.execute(_net_query(net_id))).scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not may_edit_net(await net_access(db, net, current_user)):
        raise HTTPException(status_code=403, detail="Not authorized to edit this net")

    source = report_source(net, body.report_sections)
    tz = resolve_display_tz(current_user)
    if net.check_ins:
        return await preview_from_net(db, net, source, tz)
    schedule_announcements = None
    if net.template_id:
        schedule_announcements = (await db.execute(
            select(NetTemplate.announcements).where(NetTemplate.id == net.template_id)
        )).scalar_one_or_none()
    return await preview_from_example(
        db, source=source, name=net.name, description=net.description, frequencies=net.frequencies,
        topic_prompt=net.topic_of_week_prompt, poll_question=net.poll_question,
        schedule_announcements=schedule_announcements, tz=tz,
    )


@router.post("/templates/{template_id}/closing-email-preview", response_model=ClosingEmailPreview)
async def preview_template_closing_email(
    template_id: int,
    body: ClosingEmailPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The closing email a net from this schedule would send with
    body.report_sections, using the schedule's settings. Shows the
    schedule's most recent closed or archived net, or a made-up one when it
    has none. Needs the same permission as editing the schedule
    (permissions.check_template_permission)."""
    template = (await db.execute(
        select(NetTemplate).options(selectinload(NetTemplate.frequencies)).where(NetTemplate.id == template_id)
    )).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if not await check_template_permission(db, template, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to update this template")

    source = report_source(template, body.report_sections)
    tz = resolve_display_tz(current_user)
    latest_id = (await db.execute(
        select(Net.id)
        .where(Net.template_id == template.id, Net.status.in_([NetStatus.CLOSED, NetStatus.ARCHIVED]))
        .order_by(Net.closed_at.desc().nulls_last(), Net.id.desc())
        .limit(1)
    )).scalar_one_or_none()
    if latest_id is not None:
        net = (await db.execute(_net_query(latest_id))).scalar_one()
        return await preview_from_net(db, net, source, tz)
    return await preview_from_example(
        db, source=source, name=template.name, description=template.description,
        frequencies=template.frequencies, topic_prompt=template.topic_of_week_prompt,
        poll_question=template.poll_question, schedule_announcements=template.announcements, tz=tz,
    )
