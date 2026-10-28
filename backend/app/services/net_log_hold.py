"""Daily reminder for nets closed with "finish the log later".

A net closed with hold_log (services/net_closure.py) keeps
Net.log_held_since set until net control sends its log
(routers/nets_core.py::send_held_log). Until then it can't be archived, so
its managers get one email a day: 24 hours after the close, then every 24
hours after the last reminder. Run from ncs_reminder_service.py's loop.

Auto-close holds the log too when nobody would be credited as NCS
(services/ncs_attribution.py::ncs_needed). Then the managers get one email
asking who ran the net instead of the daily reminder, and the log goes out
by itself at Net.log_hold_send_at (send_due_held_logs), with "NCS: Not
recorded" if nobody answered.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.logger import logger
from app.models import Net, NetStatus, NetTemplate, TemplateStaff, User
from app.utils import display_callsign, resolve_display_tz, to_display_tz

REMINDER_INTERVAL = timedelta(hours=24)
# How long auto-close waits for someone to say who ran the net.
NCS_GRACE_PERIOD = timedelta(hours=24)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def reminder_due(net: Net, now: datetime) -> bool:
    """24 hours since the close, or since the last reminder."""
    if net.status != NetStatus.CLOSED or net.log_held_since is None:
        return False
    if net.log_hold_send_at is not None:
        return False  # asked once at auto-close; sends itself (send_due_held_logs)
    last = net.log_hold_reminded_at or net.log_held_since
    return now - _aware(last) >= REMINDER_INTERVAL


async def log_hold_recipients(db: AsyncSession, net: Net) -> List[User]:
    """The net's managers: its own manager, its schedule's manager and
    co-managers, and whoever closed it. Accounts with email turned off are
    left out; the net page still shows the waiting log."""
    user_ids = {net.owner_id, net.log_held_by_user_id}
    if net.template_id:
        template_owner = (await db.execute(
            select(NetTemplate.owner_id).where(NetTemplate.id == net.template_id)
        )).scalar_one_or_none()
        user_ids.add(template_owner)
        co_managers = (await db.execute(
            select(TemplateStaff.user_id).where(
                TemplateStaff.template_id == net.template_id,
                TemplateStaff.is_co_manager == True,  # noqa: E712
                TemplateStaff.is_active == True,  # noqa: E712
                TemplateStaff.user_id.isnot(None),
            )
        )).scalars().all()
        user_ids.update(co_managers)
    user_ids.discard(None)
    if not user_ids:
        return []
    users = (await db.execute(
        select(User).where(User.id.in_(user_ids), User.email_notifications == True)  # noqa: E712
    )).scalars().all()
    return [u for u in users if u.email]


async def send_due_log_hold_reminders(db: AsyncSession, now: Optional[datetime] = None) -> int:
    """Send every reminder that's due and stamp log_hold_reminded_at.
    Returns the number of nets reminded about."""
    from app.email_service import EmailService

    now = now or datetime.now(timezone.utc)
    nets = (await db.execute(
        select(Net).where(Net.status == NetStatus.CLOSED, Net.log_held_since.isnot(None))
    )).scalars().all()
    reminded = 0
    for net in nets:
        if not reminder_due(net, now):
            continue
        await _email_managers(db, net)
        net.log_hold_reminded_at = now
        reminded += 1
    if reminded:
        await db.commit()
    return reminded


async def _email_managers(db: AsyncSession, net: Net, ncs_needed: bool = False) -> None:
    """The held-log email to each of the net's managers (log_hold_recipients)."""
    from app.email_service import EmailService

    for user in await log_hold_recipients(db, net):
        try:
            tz = resolve_display_tz(user)
            closed_local = to_display_tz(_aware(net.closed_at or net.log_held_since), tz)
            send_on = None
            if ncs_needed and net.log_hold_send_at:
                send_on = to_display_tz(_aware(net.log_hold_send_at), tz).strftime("%B %-d at %-I:%M %p %Z")
            await EmailService.send_log_hold_reminder(
                to_email=user.email,
                recipient_name=user.name or display_callsign(user),
                net_name=net.name,
                closed_on=closed_local.strftime("%B %-d, %Y"),
                net_url=f"{settings.frontend_url}/nets/{net.id}",
                unsubscribe_token=getattr(user, "unsubscribe_token", None),
                ncs_needed=ncs_needed,
                send_on=send_on,
            )
        except Exception as e:
            logger.error("NCS_REMINDER", f"Held-log email for net {net.id} to {user.email} failed: {e}")


async def ask_who_ran(db: AsyncSession, net: Net) -> None:
    """Email the managers of a net auto-close just held for want of an NCS."""
    await _email_managers(db, net, ncs_needed=True)


async def send_due_held_logs(db: AsyncSession, now: Optional[datetime] = None) -> int:
    """Send each auto-close hold whose grace period is over, as it stands:
    with whoever has been recorded as NCS by then, or "Not recorded".
    Returns the number of logs sent."""
    from sqlalchemy.orm import selectinload

    from app.audit import record_net_event
    from app.models import CheckIn
    from app.services.net_closure import send_net_log

    now = now or datetime.now(timezone.utc)
    nets = (await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins).selectinload(CheckIn.frequency),
        ).where(Net.status == NetStatus.CLOSED, Net.log_held_since.isnot(None), Net.log_hold_send_at.isnot(None))
    )).scalars().all()
    sent = 0
    for net in nets:
        if _aware(net.log_hold_send_at) > now:
            continue
        net.log_held_since = None
        net.log_held_by_user_id = None
        net.log_hold_reminded_at = None
        net.log_hold_send_at = None
        record_net_event(db, "net.log_sent", None, net, details={"automatic": True})
        await db.commit()
        try:
            await send_net_log(db, net)
        except Exception as e:
            logger.error("NCS_REMINDER", f"Sending the held log for net {net.id} failed: {e}")
        sent += 1
    return sent
