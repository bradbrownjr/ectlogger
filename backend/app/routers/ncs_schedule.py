"""
Pure schedule computation functions for NCS rotation.

These are free of FastAPI and database dependencies — they take model
objects as arguments and return computed schedules.  Extracted here so
they can be unit-tested without a running database.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from dateutil.relativedelta import relativedelta
from dateutil.rrule import DAILY, MONTHLY, WEEKLY, rrule

from app.models import NCSRotationMember, NCSScheduleOverride, NetTemplate
from app.schemas import NCSScheduleEntry

def _template_local_tz(template: NetTemplate):
    """Resolve the template's scheduling timezone, defaulting to America/New_York."""
    import zoneinfo
    config = json.loads(template.schedule_config) if isinstance(template.schedule_config, str) else (template.schedule_config or {})
    tz_name = config.get('timezone', 'America/New_York')
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except Exception:
        return zoneinfo.ZoneInfo('America/New_York')


def template_local_to_utc(template: NetTemplate, local_dt: datetime) -> datetime:
    """Convert a naive datetime expressed in the template's scheduling timezone to naive UTC.

    calculate_schedule_dates() returns naive datetimes whose wall-clock value is the
    net's *local* start time (from schedule_config 'time'/'timezone'). Callers that
    compare against datetime.utcnow() (e.g. the reminder service) must convert first,
    or reminders fire hours early. Returns a naive UTC datetime to match utcnow().
    """
    local_tz = _template_local_tz(template)
    return local_dt.replace(tzinfo=local_tz).astimezone(timezone.utc).replace(tzinfo=None)


def template_utc_to_local(template: NetTemplate, utc_dt: datetime) -> datetime:
    """Convert a UTC datetime to a naive datetime in the template's scheduling timezone.

    Inverse of template_local_to_utc(). Used to match a stored (UTC) net start time
    back to the local-naive dates produced by calculate_schedule_dates().
    """
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    return utc_dt.astimezone(_template_local_tz(template)).replace(tzinfo=None)


def calculate_schedule_dates(template: NetTemplate, start_date: datetime, months_ahead: int = 6) -> List[datetime]:
    """Calculate all scheduled net dates based on template schedule config"""
    if template.schedule_type == 'ad_hoc':
        return []
    
    config = json.loads(template.schedule_config) if template.schedule_config else {}
    end_date = start_date + relativedelta(months=months_ahead)
    
    # Parse time from config
    time_str = config.get('time', '19:00')
    try:
        hour, minute = map(int, time_str.split(':'))
    except:
        hour, minute = 19, 0
    
    dates = []
    
    if template.schedule_type == 'daily':
        rule = rrule(DAILY, dtstart=start_date, until=end_date)
        dates = [dt.replace(hour=hour, minute=minute, second=0, microsecond=0) for dt in rule]
        
    elif template.schedule_type == 'weekly':
        day_of_week = config.get('day_of_week', 0)  # 0 = Sunday
        # Convert to Python weekday (0 = Monday)
        python_weekday = (day_of_week - 1) % 7 if day_of_week > 0 else 6
        rule = rrule(WEEKLY, byweekday=python_weekday, dtstart=start_date, until=end_date)
        dates = [dt.replace(hour=hour, minute=minute, second=0, microsecond=0) for dt in rule]
        
    elif template.schedule_type == 'monthly':
        day_of_week = config.get('day_of_week', 0)
        weeks_of_month = config.get('week_of_month', [1])  # e.g., [1, 3] for 1st and 3rd
        python_weekday = (day_of_week - 1) % 7 if day_of_week > 0 else 6
        
        # Generate dates for each week of each month
        current = start_date.replace(day=1)
        while current <= end_date:
            # Find all occurrences of the weekday in this month
            month_start = current.replace(day=1)
            month_end = (month_start + relativedelta(months=1)) - timedelta(days=1)
            
            day = month_start
            week_occurrences = []
            while day <= month_end:
                if day.weekday() == python_weekday:
                    week_occurrences.append(day)
                day += timedelta(days=1)
            
            # Select the specified weeks
            for week_num in weeks_of_month:
                if week_num == 5:  # Last occurrence
                    if week_occurrences:
                        dates.append(week_occurrences[-1].replace(hour=hour, minute=minute, second=0, microsecond=0))
                elif 1 <= week_num <= len(week_occurrences):
                    dates.append(week_occurrences[week_num - 1].replace(hour=hour, minute=minute, second=0, microsecond=0))
            
            current += relativedelta(months=1)
    
    # Filter to only dates >= start_date and sort
    dates = sorted([d for d in dates if d >= start_date])
    return dates


def is_fifth_occurrence(dt: datetime) -> bool:
    """True if dt is the 5th occurrence of its weekday in its month."""
    return (dt.day - 1) // 7 == 4


def get_rotation_anchor_date(template: NetTemplate) -> Optional[datetime]:
    """Return the first scheduled occurrence on/after the template was created.

    The rotation's first active member serves this anchor date, and every later
    assignment is derived from how many occurrences have elapsed since it. Anchoring
    to a fixed calendar point (instead of "the next upcoming net") is what makes the
    rotation advance week-over-week: without it, compute_ncs_schedule always pins
    position 1 to whatever the next date happens to be, so the same operator is
    perpetually "Next NCS".

    Returns a naive *local* datetime (matching calculate_schedule_dates), or None for
    ad-hoc schedules or templates with no creation timestamp.
    """
    if template.schedule_type == 'ad_hoc' or not template.created_at:
        return None
    created = template.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    # Express creation time in the template's local tz, at midnight, so the same-day
    # occurrence is captured even if the template was created after the net's start time.
    created_local = created.astimezone(_template_local_tz(template)).replace(
        tzinfo=None, hour=0, minute=0, second=0, microsecond=0
    )
    # Look ahead far enough to catch at least one occurrence for any cadence
    # (monthly nets may only meet once a month).
    dates = calculate_schedule_dates(template, created_local, months_ahead=4)
    return dates[0] if dates else None


def compute_anchored_ncs_schedule(
    template: NetTemplate,
    target_dates: List[datetime],
    rotation_members: List[NCSRotationMember],
    overrides: List[NCSScheduleOverride],
) -> List[NCSScheduleEntry]:
    """Compute NCS for target_dates with the rotation anchored to the schedule's
    first occurrence, so the position advances with the calendar instead of resetting
    to position 1 for every upcoming net.

    Builds the full occurrence list from the anchor up to the latest requested date,
    runs the (unchanged) per-position rotation logic over it so fifth-week pauses and
    override progression stay correct, then returns only the requested dates.
    """
    if not target_dates or not rotation_members:
        return compute_ncs_schedule(template, target_dates, rotation_members, overrides)

    anchor = get_rotation_anchor_date(template)
    window_end = max(target_dates)
    # No anchor (ad-hoc / no created_at) or the request precedes the anchor: fall back
    # to the legacy per-list-position behavior rather than guessing.
    if anchor is None or window_end < anchor:
        return compute_ncs_schedule(template, target_dates, rotation_members, overrides)

    # Generate every occurrence from the anchor through the latest requested date so
    # the rotation index reflects the true elapsed-occurrence count.
    months_span = (window_end.year - anchor.year) * 12 + (window_end.month - anchor.month) + 2
    full_dates = [
        d for d in calculate_schedule_dates(template, anchor, months_ahead=months_span)
        if d <= window_end
    ]
    full_schedule = compute_ncs_schedule(template, full_dates, rotation_members, overrides)

    wanted = {d.date() for d in target_dates}
    return [entry for entry in full_schedule if entry.date.date() in wanted]


def compute_ncs_schedule(
    template: NetTemplate,
    dates: List[datetime],
    rotation_members: List[NCSRotationMember],
    overrides: List[NCSScheduleOverride]
) -> List[NCSScheduleEntry]:
    """Compute who is NCS for each date, applying overrides"""
    if not rotation_members or not dates:
        return []
    
    # Get active members in order
    active_members = sorted(
        [m for m in rotation_members if m.is_active],
        key=lambda m: m.position
    )
    
    if not active_members:
        return []
    
    # Build override lookup by date (normalized to date only)
    override_lookup = {}
    for override in overrides:
        date_key = override.scheduled_date.date()
        override_lookup[date_key] = override
    
    schedule = []
    member_count = len(active_members)
    normal_index = 0
    fifth_week_user = template.fifth_week_user
    use_fifth_week_override = (
        template.schedule_type == 'weekly'
        and template.fifth_week_user_id is not None
        and fifth_week_user is not None
        and fifth_week_user.is_active
    )
    
    for date in dates:
        date_key = date.date()
        is_fifth_week_slot = is_fifth_occurrence(date) and use_fifth_week_override
        
        # Check for override
        override = override_lookup.get(date_key)
        
        if override:
            if override.replacement_user_id is None:
                # Net is cancelled
                entry = NCSScheduleEntry(
                    date=date,
                    user_id=None,
                    user_name=None,
                    user_callsign=None,
                    user_email=None,
                    is_override=True,
                    is_fifth_week=False,
                    is_cancelled=True,
                    override_reason=override.reason,
                    override_id=override.id
                )
            else:
                # Swap to different user
                entry = NCSScheduleEntry(
                    date=date,
                    user_id=override.replacement_user_id,
                    user_name=override.replacement_user.name if override.replacement_user else None,
                    user_callsign=override.replacement_user.callsign if override.replacement_user else None,
                    user_email=override.replacement_user.email if override.replacement_user else None,
                    is_override=True,
                    is_fifth_week=False,
                    is_cancelled=False,
                    override_reason=override.reason,
                    override_id=override.id
                )
            # Overrides should preserve the normal rotation progression so
            # downstream assignments don't shift. The only exception is a
            # configured fifth-week slot, which intentionally pauses rotation.
            if not is_fifth_week_slot:
                normal_index += 1
        elif is_fifth_week_slot:
            entry = NCSScheduleEntry(
                date=date,
                user_id=template.fifth_week_user_id,
                user_name=fifth_week_user.name if fifth_week_user else None,
                user_callsign=fifth_week_user.callsign if fifth_week_user else None,
                user_email=fifth_week_user.email if fifth_week_user else None,
                is_override=False,
                is_fifth_week=True,
                is_cancelled=False,
            )
        else:
            # Normal rotation
            member = active_members[normal_index % member_count]
            normal_index += 1
            entry = NCSScheduleEntry(
                date=date,
                user_id=member.user_id,
                user_name=member.user.name if member.user else None,
                user_callsign=member.user.callsign if member.user else None,
                user_email=member.user.email if member.user else None,
                is_override=False,
                is_fifth_week=False,
                is_cancelled=False
            )
        
        schedule.append(entry)
    
    return schedule


