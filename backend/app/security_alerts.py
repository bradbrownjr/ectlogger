"""Security alerts, set on Admin > Security (AppSettings.signin_alert_* and
mute_alert_*). Both count entries already in the activity log
(models.AuditEvent), and each alert sent is itself an entry, which is what
stops the same alert going out again inside one window.

- Failed sign-ins: the account's owner and every admin are emailed when an
  account collects signin_alert_threshold wrong passwords or two-factor
  codes within signin_alert_window_minutes. A wrong two-factor code alerts
  on the first one: it means the password was right.
- Muted by others: admins (never the muted station, or a net-wide mute
  would stop being silent) are emailed when mute_alert_threshold different
  people have muted one station within mute_alert_window_days. Personal
  mutes are private, so they are counted by audit.private_actor_code and
  never named.

At most one alert per account per window, so typing wrong passwords at
someone's account can't flood their inbox.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import private_actor_code, record_event, user_label
from app.logger import logger
from app.models import AppSettings, AuditEvent, User, UserRole

SIGNIN_FAILURES = ("auth.password_failed", "auth.mfa_failed")
MUTES = ("chat.muted_by_peer", "chat.station_muted")


async def _settings(db: AsyncSession) -> AppSettings:
    from app.routers.settings import get_or_create_settings
    return await get_or_create_settings(db)


async def _admin_emails(db: AsyncSession) -> List[str]:
    rows = await db.execute(select(User.email).where(User.role == UserRole.ADMIN, User.is_active == True))  # noqa: E712
    return [email for email in rows.scalars().all() if email]


async def _alerted_since(db: AsyncSession, action: str, user_id: int, since: datetime) -> bool:
    found = await db.execute(
        select(AuditEvent.id).where(
            AuditEvent.action == action, AuditEvent.subject_user_id == user_id,
            AuditEvent.created_at >= since.replace(tzinfo=None),
        ).limit(1)
    )
    return found.scalar_one_or_none() is not None


async def check_failed_sign_ins(db: AsyncSession, user: User, mfa: bool, now: Optional[datetime] = None) -> bool:
    """Call after committing an auth.password_failed or auth.mfa_failed
    event for user. Returns whether an alert went out."""
    config = await _settings(db)
    if config.signin_alert_enabled is False:
        return False
    now = now or datetime.now(timezone.utc)
    window = timedelta(minutes=config.signin_alert_window_minutes or 15)
    since = now - window
    attempts = (await db.execute(
        select(AuditEvent).where(
            AuditEvent.action.in_(SIGNIN_FAILURES), AuditEvent.actor_user_id == user.id,
            AuditEvent.created_at >= since.replace(tzinfo=None),
        ).order_by(AuditEvent.created_at)
    )).scalars().all()
    if not mfa and len(attempts) < (config.signin_alert_threshold or 5):
        return False
    if await _alerted_since(db, "alert.failed_sign_ins", user.id, since):
        return False

    record_event(db, "alert.failed_sign_ins", None, target_type="user", target_id=user.id,
                 target_label=user_label(user), subject=user,
                 details={"attempts": len(attempts), "two_factor": mfa})
    await db.commit()

    rows = [{
        "when": a.created_at,
        "what": "Wrong two-factor code" if a.action == "auth.mfa_failed" else "Wrong password",
        "ip": a.ip, "location": a.location, "browser": a.user_agent,
    } for a in attempts]
    from app.email_service import EmailService
    try:
        from app.services.account_email import account_addresses
        addresses = await account_addresses(db, user)
        for address in addresses:
            await EmailService.send_failed_sign_in_alert(address, user_label(user), rows, two_factor=mfa, to_admin=False)
        for admin_email in await _admin_emails(db):
            if admin_email not in addresses:
                await EmailService.send_failed_sign_in_alert(admin_email, user_label(user), rows, two_factor=mfa, to_admin=True)
    except Exception as exc:
        logger.error("SECURITY_ALERT", f"Failed sign-in alert for user {user.id} not sent: {exc}")
    return True


async def check_mutes(db: AsyncSession, muted: User, now: Optional[datetime] = None) -> bool:
    """Call after committing a mute of muted, personal or net-wide. Returns
    whether an alert went out."""
    config = await _settings(db)
    if config.mute_alert_enabled is False:
        return False
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=config.mute_alert_window_days or 30)
    events = (await db.execute(
        select(AuditEvent).where(
            AuditEvent.action.in_(MUTES), AuditEvent.subject_user_id == muted.id,
            AuditEvent.created_at >= since.replace(tzinfo=None),
        )
    )).scalars().all()

    # One code per person, whichever kind of mute they used.
    people = set()
    nets = {}
    for event in events:
        if event.action == "chat.muted_by_peer":
            people.add(json.loads(event.details or "{}").get("muter"))
        elif event.actor_user_id is not None:
            people.add(private_actor_code(event.actor_user_id))
        if event.target_label:
            nets[event.net_id] = event.target_label
    people.discard(None)
    if len(people) < (config.mute_alert_threshold or 3):
        return False
    if await _alerted_since(db, "alert.muted_often", muted.id, since):
        return False

    net_wide = sum(1 for e in events if e.action == "chat.station_muted")
    record_event(db, "alert.muted_often", None, target_type="user", target_id=muted.id,
                 target_label=user_label(muted), subject=muted,
                 details={"people": len(people), "net_wide_mutes": net_wide, "nets": sorted(nets.values())})
    await db.commit()

    from app.email_service import EmailService
    try:
        for admin_email in await _admin_emails(db):
            await EmailService.send_muted_often_alert(
                admin_email, user_label(muted), muted.id, len(people), net_wide,
                sorted(nets.values()), config.mute_alert_window_days or 30,
            )
    except Exception as exc:
        logger.error("SECURITY_ALERT", f"Mute alert for user {muted.id} not sent: {exc}")
    return True


async def check_callsign_taken(db: AsyncSession, user: User, holder: User, callsign: str,
                               now: Optional[datetime] = None) -> bool:
    """Call when user tries to make callsign their primary callsign and
    holder's account already has it. Almost always the same operator, signed
    up again under a different email address (K9NPD, 2026-10-27). The user is
    never shown holder's address; admins are emailed both accounts, at most
    once per account per day. Returns whether an alert went out."""
    now = now or datetime.now(timezone.utc)
    if await _alerted_since(db, "alert.callsign_taken", user.id, now - timedelta(days=1)):
        return False
    record_event(db, "alert.callsign_taken", None, target_type="user", target_id=user.id,
                 target_label=user_label(user), subject=user,
                 details={"callsign": callsign, "holder_user_id": holder.id})
    await db.commit()

    from app.email_service import EmailService
    try:
        for admin_email in await _admin_emails(db):
            await EmailService.send_callsign_taken_alert(admin_email, callsign, user, holder)
    except Exception as exc:
        logger.error("SECURITY_ALERT", f"Callsign-taken alert for user {user.id} not sent: {exc}")
    return True
