"""
Reconciliation between a template's TopicHistory log and the live/upcoming
Net rows for that template.

These were previously two disconnected stores: a net's topic_of_week_prompt
was only ever written by an NCS via the Topic/Poll dialog or copied from the
template's static default at creation time, while TopicHistory was written
only at net close and never read back into a net. Setting a topic live never
appeared in history until close, and pre-planning a topic in history never
reached the net for that date. The functions here are the single place that
keeps the two in sync, keyed by occurrence date (the calendar date of
scheduled_start_time, falling back to created_at for nets with no schedule).
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Net, NetStatus, NetTemplate, TopicHistory

# Nets still able to receive a topic before/without ever having one -- CLOSED
# and CANCELLED occurrences are done, ARCHIVED even more so.
_PENDING_STATUSES = (NetStatus.DRAFT, NetStatus.SCHEDULED, NetStatus.LOBBY, NetStatus.ACTIVE)


def occurrence_date(net: Net) -> date:
    """The calendar date this net's occurrence belongs to, for matching
    against TopicHistory.used_date."""
    when = net.scheduled_start_time or net.created_at or datetime.utcnow()
    return when.date()


async def topic_history_for_date(
    db: AsyncSession, template_id: int, when: date
) -> Optional[TopicHistory]:
    """The TopicHistory row logged/planned for *when* under this template, if any."""
    result = await db.execute(
        select(TopicHistory).where(TopicHistory.template_id == template_id)
    )
    for entry in result.scalars().all():
        if entry.used_date and entry.used_date.date() == when:
            return entry
    return None


async def seed_topic_from_history(db: AsyncSession, template: NetTemplate, when: date) -> Optional[str]:
    """The topic a newly-created net for this template/date should start with:
    a pre-planned history entry for that date takes precedence over the
    template's generic default, since it's specific to this occurrence."""
    entry = await topic_history_for_date(db, template.id, when)
    if entry:
        return entry.topic
    return template.topic_of_week_prompt


async def upsert_topic_history_from_net(db: AsyncSession, net: Net) -> None:
    """Record *net*'s current topic against its occurrence date, updating an
    existing entry for that date instead of duplicating it. Called both when
    an NCS sets the topic live and when the net closes, so history reflects
    the topic as soon as it's set rather than only after close."""
    if not (net.topic_of_week_enabled and net.topic_of_week_prompt and net.template_id):
        return

    when = occurrence_date(net)
    entry = await topic_history_for_date(db, net.template_id, when)
    if entry:
        entry.topic = net.topic_of_week_prompt
        entry.net_id = net.id
    else:
        db.add(TopicHistory(
            template_id=net.template_id,
            topic=net.topic_of_week_prompt,
            used_date=net.scheduled_start_time or net.created_at or datetime.utcnow(),
            net_id=net.id,
        ))


async def sync_topic_to_pending_nets(
    db: AsyncSession, template_id: int, when: date, topic_text: str
) -> None:
    """Push a topic-history edit for *when* into any not-yet-closed net for
    this template on that date, but only if that net has no topic of its own
    yet -- once an NCS has set one live, a later history edit for the same
    date must not silently overwrite it."""
    result = await db.execute(
        select(Net).where(
            Net.template_id == template_id,
            Net.status.in_(_PENDING_STATUSES),
            Net.topic_of_week_enabled == True,  # noqa: E712
        )
    )
    for net in result.scalars().all():
        if net.topic_of_week_prompt:
            continue
        if occurrence_date(net) == when:
            net.topic_of_week_prompt = topic_text
