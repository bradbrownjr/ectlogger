"""When a scheduled backup is due, and when the lack of one is worth an alert.

Pure functions over timestamps, so the rules are testable without a clock.
"""
from datetime import datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def period_hours(schedule_mode: str, interval_hours: int) -> int:
    return 24 if schedule_mode == "daily" else max(1, interval_hours)


def latest_daily_slot(now: datetime, daily_time: str, tz_name: str) -> datetime:
    """The most recent daily_time (HH:MM, in tz_name) at or before ``now``."""
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("UTC")
    hour, minute = (int(part) for part in daily_time.split(":"))
    local_now = now.astimezone(tz)
    slot = datetime.combine(local_now.date(), time(hour, minute), tzinfo=tz)
    if slot > local_now:
        slot = datetime.combine(local_now.date() - timedelta(days=1), time(hour, minute), tzinfo=tz)
    return slot


def is_due(now: datetime, schedule_mode: str, daily_time: str, tz_name: str,
           interval_hours: int, last_attempt_at: Optional[datetime]) -> bool:
    """One attempt per slot. A failed attempt is not retried until the next
    slot (the failure email has already gone out, and retrying every few
    minutes would send one per try); "Back up now" is the manual retry.

    A slot missed while the server was down runs at the first check after it
    comes back, not a day late.
    """
    if last_attempt_at is None:
        return True
    if schedule_mode == "daily":
        return last_attempt_at < latest_daily_slot(now, daily_time, tz_name)
    return now - last_attempt_at >= timedelta(hours=period_hours(schedule_mode, interval_hours))


def overdue_threshold(schedule_mode: str, interval_hours: int) -> timedelta:
    """No success for one and a half periods means something is wrong:
    36 hours on a daily schedule, 9 on a six-hourly one."""
    return timedelta(hours=period_hours(schedule_mode, interval_hours) * 1.5)


def is_overdue(now: datetime, schedule_mode: str, interval_hours: int,
               last_success_at: Optional[datetime], enabled_since: Optional[datetime]) -> bool:
    reference = last_success_at or enabled_since
    if reference is None:
        return False
    return now - reference > overdue_threshold(schedule_mode, interval_hours)
