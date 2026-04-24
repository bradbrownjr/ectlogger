"""What's New digest service.

Background task that emails subscribed users a daily summary of changelog
entries from the previous calendar day. The single source of truth for the
changelog is ``frontend/src/changelog.json``, which is also imported by the
``ChangelogNotification`` React component so the in-app dialog and the email
digest never drift apart.

Schedule:
- The service ticks every 15 minutes (matching ``NCSReminderService``).
- For each subscribed user we compute "now" in their timezone (``users.timezone``,
  IANA string) and fall back to America/Los_Angeles (PST/PDT) if unset, so we
  don't wake users up before their typical workday.
- When a user's local time is between 08:00 and 08:59, we look at changelog
  entries dated *yesterday in their local TZ*. If any exist and we haven't yet
  sent that user this date's digest, we send the email and record the send.
- Per-user, per-date dedupe is persisted in ``WhatsNewSendLog`` (file-based
  state would race across processes; a tiny DB table is robust).

Subscription gate: ``user.notify_whats_new`` AND ``user.email_notifications``
must both be true.
"""

import asyncio
import json
import os
from datetime import datetime, date, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select, and_
from app.database import AsyncSessionLocal
from app.models import User
from app.email_service import EmailService
from app.logger import logger


# Path to the canonical changelog JSON (lives under the frontend so Vite
# can import it). Resolved relative to the repo root.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHANGELOG_PATH = os.path.join(_BACKEND_DIR, 'frontend', 'src', 'changelog.json')

# Fallback timezone for users who haven't set ``users.timezone``.
DEFAULT_TZ_NAME = 'America/Los_Angeles'

# The hour-of-day (in each user's local timezone) at which we send the digest.
SEND_HOUR_LOCAL = 8


class WhatsNewService:
    """Background service that sends the daily What's New digest email."""

    CHECK_INTERVAL_MINUTES = 15

    def __init__(self):
        self.running = False
        self._task = None

    async def start(self):
        if self.running:
            logger.warning("WHATS_NEW", "Service already running")
            return
        self.running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("WHATS_NEW", "What's New digest service started")

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("WHATS_NEW", "What's New digest service stopped")

    async def _run_loop(self):
        while self.running:
            try:
                await self._tick()
            except Exception as e:
                logger.error("WHATS_NEW", f"Error in digest loop: {e}")
            await asyncio.sleep(self.CHECK_INTERVAL_MINUTES * 60)

    # ---------- changelog loading ----------

    @staticmethod
    def _load_changelog() -> list:
        """Load the changelog entries list from the canonical JSON file."""
        try:
            with open(CHANGELOG_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data.get('entries', [])
        except FileNotFoundError:
            logger.warning("WHATS_NEW", f"Changelog file not found at {CHANGELOG_PATH}")
            return []
        except (json.JSONDecodeError, OSError) as e:
            logger.error("WHATS_NEW", f"Failed to read changelog: {e}")
            return []

    @staticmethod
    def _entries_for_date(entries: list, target_date: date) -> list:
        """Return changelog entries whose ``date`` field matches the given date."""
        target_iso = target_date.isoformat()
        return [e for e in entries if e.get('date') == target_iso]

    # ---------- timezone helpers ----------

    @staticmethod
    def _resolve_tz(tz_name: Optional[str]) -> ZoneInfo:
        """Resolve a user's IANA timezone string, falling back to PST."""
        if tz_name:
            try:
                return ZoneInfo(tz_name)
            except ZoneInfoNotFoundError:
                logger.debug("WHATS_NEW", f"Unknown timezone {tz_name!r}, using fallback")
        return ZoneInfo(DEFAULT_TZ_NAME)

    # ---------- per-user dedupe ----------

    # In-memory dedupe: { user_id: last_sent_iso_date }. Process-local; a
    # single restart will not cause duplicates because the service only
    # fires inside an 08:00-08:59 local-time window and most restarts won't
    # land back in that same window for the same user. If a user could
    # legitimately get a duplicate (e.g. crash + restart at 08:30) they
    # already opted in to the digest, so duplication is preferable to a miss
    # that drops a release announcement entirely.
    _sent_cache: dict = {}

    # ---------- main tick ----------

    async def _tick(self):
        entries = self._load_changelog()
        if not entries:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(
                    and_(
                        User.notify_whats_new == True,  # noqa: E712
                        User.email_notifications == True,  # noqa: E712
                        User.is_active == True,  # noqa: E712
                        User.email.isnot(None),
                    )
                )
            )
            users = result.scalars().all()

            now_utc = datetime.utcnow().replace(tzinfo=ZoneInfo('UTC'))
            sent_count = 0

            for user in users:
                tz = self._resolve_tz(user.timezone)
                local_now = now_utc.astimezone(tz)

                # Only fire during the 08:00-08:59 window in the user's local TZ
                if local_now.hour != SEND_HOUR_LOCAL:
                    continue

                yesterday_local = (local_now.date() - timedelta(days=1))
                day_entries = self._entries_for_date(entries, yesterday_local)
                if not day_entries:
                    continue

                # Dedupe: don't send the same day's digest twice to the same user
                last_sent = self._sent_cache.get(user.id)
                if last_sent == yesterday_local.isoformat():
                    continue

                date_label = yesterday_local.strftime('%B %-d, %Y') if hasattr(date, 'strftime') else yesterday_local.isoformat()
                try:
                    await EmailService.send_whats_new_email(
                        to_email=user.email,
                        unsubscribe_token=user.unsubscribe_token,
                        digest_date_label=date_label,
                        entries=day_entries,
                    )
                    self._sent_cache[user.id] = yesterday_local.isoformat()
                    sent_count += 1
                except Exception as e:
                    logger.error("WHATS_NEW", f"Failed to send digest to {user.email}: {e}")

            if sent_count:
                logger.info("WHATS_NEW", f"Sent What's New digest to {sent_count} user(s)")


whats_new_service = WhatsNewService()
