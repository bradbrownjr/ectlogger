"""
A net's headline figures: total check-ins, unique operators, re-checks and
duration.

Shared by GET /statistics/nets/{id} (the report's figures row) and the
closing email's "Headline figures" section, so the two always agree.
"""
from datetime import datetime, timezone
from typing import Optional


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def net_duration_minutes(net, check_ins) -> Optional[int]:
    """Minutes the net ran, less the windows with no NCS present.

    Falls back to the scheduled start, then to the first and last check-in,
    when started_at was never recorded. None when there is nothing to go on.
    """
    duration_minutes = None
    if net.started_at:
        started_at = _aware(net.started_at)
        end_time = _aware(net.closed_at) if net.closed_at else datetime.now(timezone.utc)
        # Exclude windows where no NCS was actively present.
        paused_seconds = net.total_paused_seconds or 0
        if net.paused_at:
            paused_seconds += (end_time - _aware(net.paused_at)).total_seconds()
        duration_minutes = max(0, int((end_time - started_at).total_seconds() / 60) - int(paused_seconds / 60))
    elif net.scheduled_start_time:
        # started_at not recorded but a scheduled time exists — use it
        started_at = _aware(net.scheduled_start_time)
        end_time = _aware(net.closed_at or datetime.now(timezone.utc))
        candidate = int((end_time - started_at).total_seconds() / 60)
        # Only use if positive (guard against bad scheduled_start_time data)
        if candidate > 0:
            duration_minutes = candidate
    if duration_minutes is None and check_ins:
        # started_at not recorded — derive duration from first to last check-in
        times = [c.checked_in_at for c in check_ins if c.checked_in_at and not c.time_not_recorded]
        if times:
            first = _aware(min(times))
            end_time = _aware(net.closed_at or max(times))
            duration_minutes = int((end_time - first).total_seconds() / 60)
    return duration_minutes


def net_figures(net, check_ins) -> dict:
    """{total_check_ins, unique_callsigns, rechecks, duration_minutes}."""
    return {
        "total_check_ins": len(check_ins),
        "unique_callsigns": len({c.callsign for c in check_ins}),
        "rechecks": sum(1 for c in check_ins if c.is_recheck),
        "duration_minutes": net_duration_minutes(net, check_ins),
    }


def format_duration(minutes: Optional[int]) -> str:
    """"1h 5m" or "45m", as the report shows it; an em-dash when unknown."""
    if not minutes:
        return "—"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
