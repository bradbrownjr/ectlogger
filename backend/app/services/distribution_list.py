"""A net's distribution list: one group address, such as a groups.io list,
that gets the net's reminder the day before and its closing log.

Set on a schedule (copied to each net by services/net_from_template.py) or on
a net (models.Net.distribution_list, migration 105). The address is not an
account, so every copy it gets is built as a signed-out visitor sees the net
(services/net_closure.py::_send_list_copy) and carries no personal
unsubscribe link (email/base.py::get_distribution_list_footer).

Anyone who can edit a net or schedule could point ECTLogger's mail at any
address, so it is one address, shown only to the people who can edit it,
and every change is written to the activity log (Brad, 2026-11-19).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record_net_event, record_schedule_event
from app.config import settings
from app.models import Net, NetStatus, NetTemplate, User
from app.utils import resolve_display_tz

logger = logging.getLogger(__name__)

# The reminder goes out once, as soon as the net is a day or less away.
LIST_REMINDER_HOURS = 24


def record_distribution_list_change(db: AsyncSession, actor: Optional[User], target: Any,
                                    old: Optional[str], new: Optional[str]) -> None:
    """Write the change to the activity log when the address changed. target
    is a Net or a NetTemplate; the caller commits."""
    if (old or None) == (new or None):
        return
    details = {"from": old, "to": new}
    if isinstance(target, NetTemplate):
        record_schedule_event(db, "schedule.distribution_list_changed", actor, target, details=details)
    else:
        record_net_event(db, "net.distribution_list_changed", actor, target, details=details)


async def list_time_zone(db: AsyncSession, net: Net) -> Optional[ZoneInfo]:
    """The time zone a list's copy shows times in: the schedule's, since a
    group has no profile. A net with no schedule uses its manager's display
    zone, or UTC."""
    if net.template_id:
        from app.routers.ncs_schedule import _template_local_tz
        template = await db.get(NetTemplate, net.template_id)
        if template is not None:
            return _template_local_tz(template)
    owner = await db.get(User, net.owner_id) if net.owner_id else None
    return resolve_display_tz(owner)


async def find_list_reminder_candidates(db: AsyncSession, now: datetime) -> List[Net]:
    """Draft or scheduled nets with a distribution list that start within the
    next day and haven't had their list reminder. DRAFT counts because a net
    created by hand from a schedule stays a draft until it starts. now is
    naive UTC, like the rest of the scheduler."""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(
            Net.distribution_list.isnot(None),
            Net.list_reminder_sent_at.is_(None),
            Net.scheduled_start_time.isnot(None),
            Net.status.in_([NetStatus.DRAFT, NetStatus.SCHEDULED]),
            Net.scheduled_start_time > now,
            Net.scheduled_start_time <= now + timedelta(hours=LIST_REMINDER_HOURS),
        )
    )
    return list(result.scalars().all())


async def send_list_reminder(db: AsyncSession, net: Net) -> None:
    """Email the list the net's reminder, then stamp list_reminder_sent_at so
    it goes once. Stamped even when the send fails, so a bad address is not
    retried every minute; the failure is logged."""
    from app.email_service import EmailService
    from app.ncs_reminder_service import _reminder_frequencies
    from app.services.ncs_attribution import ncs_on_duty

    tz = await list_time_zone(db, net)
    start = net.scheduled_start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    local = start.astimezone(tz or timezone.utc)
    ncs_name, ncs_callsign = await ncs_on_duty(db, net.id, net.template_id)
    try:
        await EmailService.send_list_reminder(
            to_email=net.distribution_list,
            net_name=net.name,
            net_date=local.strftime("%A, %B %d, %Y"),
            net_time=local.strftime("%I:%M %p %Z"),
            frequencies=_reminder_frequencies(net),
            net_url=f"{settings.frontend_url}/nets/{net.id}",
            ncs_name=ncs_name,
            ncs_callsign=ncs_callsign,
        )
    except Exception:
        logger.exception("Failed to send net %s's reminder to its distribution list", net.id)
    net.list_reminder_sent_at = datetime.utcnow()
    await db.commit()


async def send_due_list_reminders(db: AsyncSession, now: Optional[datetime] = None) -> int:
    """The scheduler's tick (ncs_reminder_service.py). Returns how many went out."""
    now = now or datetime.utcnow()
    sent = 0
    for net in await find_list_reminder_candidates(db, now):
        await send_list_reminder(db, net)
        sent += 1
    return sent
