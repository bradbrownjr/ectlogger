"""
Build a new Net from its schedule (NetTemplate).

The one place a net takes its settings from its schedule, shared by the
background auto-create (ncs_reminder_service._get_or_create_scheduled_net)
and the manual "Create" button (templates_subscriptions.create_net_from_template).

Until 2026-09-27 each of those carried its own hand-written copy list, and
they drifted: the auto-create path never copied chat_grace_period_minutes,
mobile_priority_sort or ics309_hide_muted_stations, so every automatically
created net (the normal case for a recurring schedule) silently fell back to
the column defaults - "Keep chat open after net" was on for 29 production
nets' schedules and on none of the nets. Copying every column the two tables
share, minus an explicit exclusion list, means a setting added to both
tables later is copied without anyone remembering to add it here.
tests/test_net_from_template.py holds that guarantee.
"""
from datetime import datetime
from typing import Optional

from app.models import Net, NetStatus, NetTemplate

# Columns both tables have that must NOT be copied from the schedule.
NOT_COPIED_FROM_TEMPLATE = frozenset({
    'id', 'created_at', 'updated_at',
    # The caller decides: the schedule's manager for an auto-created net,
    # the person who clicked Create for a manual one.
    'owner_id',
    # Net.announcements is the net's own one-night Net Notes (meant to start
    # blank). The schedule's announcements are read live from the template by
    # the net view, so a net never holds a copy of them.
    'announcements',
    # Seeded per occurrence from the schedule's topic history by the caller.
    'topic_of_week_prompt',
})


def template_setting_columns() -> list[str]:
    """Every column a net takes from its schedule."""
    net_cols = {c.name for c in Net.__table__.columns}
    return sorted(
        c.name for c in NetTemplate.__table__.columns
        if c.name in net_cols and c.name not in NOT_COPIED_FROM_TEMPLATE
    )


def build_net_from_template(
    template: NetTemplate,
    *,
    owner_id: int,
    status: NetStatus,
    scheduled_start_time: Optional[datetime],
    topic_of_week_prompt: Optional[str],
) -> Net:
    """A new, unsaved Net carrying every setting from its schedule.

    A None on the schedule (an older row predating a column) leaves the
    net's own column default in place rather than writing None over it.
    Frequencies are a relationship, not a column; the caller copies them.
    """
    net_columns = Net.__table__.columns
    settings = {}
    for name in template_setting_columns():
        value = getattr(template, name)
        if value is None and net_columns[name].default is not None:
            continue
        settings[name] = value
    return Net(
        **settings,
        owner_id=owner_id,
        template_id=template.id,
        status=status,
        scheduled_start_time=scheduled_start_time,
        topic_of_week_prompt=topic_of_week_prompt,
    )
