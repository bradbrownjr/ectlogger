"""
Net start: opening the lobby and announcing the net.

Two related concerns live here because they are the same business rule seen
from two sides:

1. `auto_open_lobby()` - the scheduler-driven counterpart to the LOBBY branch of
   `routers/nets_core.py::start_net()`. It performs the same transition without
   the side effects that only make sense for a human caller (claiming the NCS
   role, auto-checking the caller in).

2. `send_net_start_notifications()` - the single "net starting" email. Exactly
   one goes out per net, at whichever transition first makes the net visible to
   check in. Rather than asking every caller to reason about whether an earlier
   transition already sent it, the send is idempotent: it stamps
   `Net.start_notification_sent_at` and returns early if that is already set.
   Call it freely from any transition that could be the first one.

An automatically opened lobby deliberately does NOT announce the net. Nobody has
confirmed the net is actually happening at that point, so the email waits until
an NCS checks in or the net goes live. See docs/ROADMAP.md "Auto-open lobby".
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.email_service import EmailService
from app.logger import logger
from app.models import Net, NetStatus, User, net_frequencies


async def send_net_start_notifications(db: AsyncSession, net: Net) -> None:
    """Email the net owner and template subscribers that the net is starting.

    Idempotent: the first successful send stamps `start_notification_sent_at`,
    and every later call for the same net returns immediately. This is what lets
    `start_net()`, `go_live()`, and the NCS-arrival path in `check_ins.py` all
    call it without any of them needing to know which transition came first.
    """
    if net.start_notification_sent_at is not None:
        return

    try:
        emails_to_notify = []
        unsubscribe_tokens = {}  # Map email -> unsubscribe_token

        # Add net owner (if they have notifications enabled)
        result = await db.execute(select(User).where(User.id == net.owner_id))
        owner = result.scalar_one_or_none()
        if owner and owner.email and owner.email_notifications and owner.notify_net_start:
            emails_to_notify.append(owner.email)
            if owner.unsubscribe_token:
                unsubscribe_tokens[owner.email] = owner.unsubscribe_token

        # If net was created from template, add all subscribers who want start notifications
        if net.template_id:
            from app.models import NetTemplateSubscription
            result = await db.execute(
                select(User)
                .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
                .where(NetTemplateSubscription.template_id == net.template_id)
                .where(User.email_notifications == True)
                .where(User.notify_net_start == True)
            )
            subscribers = result.scalars().all()
            for subscriber in subscribers:
                if subscriber.email and subscriber.email not in emails_to_notify:
                    emails_to_notify.append(subscriber.email)
                    if subscriber.unsubscribe_token:
                        unsubscribe_tokens[subscriber.email] = subscriber.unsubscribe_token

        # Stamp before sending. A send that fails partway through has already
        # delivered to some recipients, so retrying would double-notify them.
        net.start_notification_sent_at = datetime.utcnow()
        await db.commit()

        if emails_to_notify:
            await EmailService.send_net_notification(emails_to_notify, net.name, net.id, unsubscribe_tokens)
    except Exception as e:
        logger.error("NET_START", f"Failed to send net start notification for net {net.id}: {e}")


def _as_naive_utc(dt: datetime) -> datetime:
    """Normalize a datetime to naive UTC.

    scheduled_start_time comes back naive from SQLite but may be tz-aware from
    Postgres/MySQL, and callers pass whichever "now" they have. Normalizing both
    sides is what keeps this comparison from raising "can't compare offset-naive
    and offset-aware datetimes" on some deployments and not others.
    """
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def lobby_open_due(net: Net, now: datetime = None) -> bool:
    """Whether `net`'s automatic lobby should be open at `now`.

    True only inside the window [start - auto_lobby_minutes, start). The upper
    bound matters as much as the lower one: a late tick (service restart, a long
    loop) must not open a pre-net staging room for a net whose official start has
    already gone by. That net needs a human to start it.

    Pure and side-effect free so the offset math can be tested directly - this is
    the same class of arithmetic as the June 2026 naive-UTC reminder bug.
    """
    if net.auto_lobby_minutes is None or net.scheduled_start_time is None:
        return False

    scheduled = _as_naive_utc(net.scheduled_start_time)
    now = _as_naive_utc(now) if now is not None else datetime.utcnow()

    open_at = scheduled - timedelta(minutes=net.auto_lobby_minutes)
    return open_at <= now < scheduled


async def auto_open_lobby(db: AsyncSession, net: Net) -> None:
    """Move `net` into LOBBY on the scheduler's behalf.

    Mirrors the LOBBY branch of `routers/nets_core.py::start_net()` minus the
    human-caller side effects, and sends no email (see module docstring). Keep
    the two in sync when the lobby transition changes.

    Callers are responsible for the guards (still SCHEDULED, not cancelled, an
    NCS is assigned, start time still in the future) - see
    `ncs_reminder_service._check_and_auto_open_lobbies`.
    """
    # Auto-select single frequency as active if not already set. Loaded with an
    # explicit query rather than net.frequencies: a lazy load on an async session
    # raises MissingGreenlet, and this helper must not depend on how the caller
    # happened to fetch the net.
    if not net.active_frequency_id:
        freq_result = await db.execute(
            select(net_frequencies.c.frequency_id).where(net_frequencies.c.net_id == net.id)
        )
        freq_ids = freq_result.scalars().all()
        if len(freq_ids) == 1:
            net.active_frequency_id = freq_ids[0]

    net.status = NetStatus.LOBBY
    net.lobby_opened_automatically = True

    await db.commit()

    # Imported here, not at module scope: app.main imports the routers, which
    # import this module, so a top-level import would be circular.
    from app.main import post_system_message, manager

    await post_system_message(
        net.id,
        "Net lobby opened automatically ahead of the scheduled start. "
        "Check in early; the net begins at the official start time.",
        db,
    )

    await manager.broadcast({
        "type": "net_lobby_opened",
        "data": {
            "net_id": net.id,
            "started_by": None,  # No human opened this one
            "status": net.status.value,
            "started_at": None,
            "scheduled_start_time": net.scheduled_start_time.isoformat() if net.scheduled_start_time else None,
        }
    }, net.id)

    logger.info("NET_START", f"Auto-opened lobby for net {net.id} ({net.name})")
