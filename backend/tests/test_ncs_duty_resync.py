"""
Regression tests for resync_pending_duty_ncs.

Reported by Joel Huntress (AA1GM): a rotation roster fix landed correctly for
future occurrences, but a net auto-created ~24h ahead of the fix kept the
stale, pre-fix duty NCS -- nothing ever revisited a pending net after
_assign_duty_ncs stamped it once at creation time. resync_pending_duty_ncs is
called from every roster-editing route (add/remove/reorder/clear/merge) to
close that gap.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    Frequency,
    Net,
    NetRole,
    NetStatus,
    NetTemplate,
    NCSRotationMember,
    net_template_frequencies,
)
from app.ncs_reminder_service import NCSReminderService
from app.routers.ncs_rotation import resync_pending_duty_ncs
from app.routers.ncs_schedule import stamp_rotation_anchor


def _next_sunday_1400() -> datetime:
    """A real future occurrence, well past resync's `scheduled_start_time > now` filter."""
    now = datetime.utcnow()
    days_ahead = (6 - now.weekday()) % 7 or 7  # Monday=0..Sunday=6; always strictly future
    return (now + timedelta(days=days_ahead)).replace(hour=14, minute=0, second=0, microsecond=0)


async def _template_with_two_members(db, user_a_id: int, user_b_id: int) -> NetTemplate:
    """Weekly Sunday UTC template, A at position 1 and B at position 2."""
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()

    template = NetTemplate(
        name="Rotation Net",
        owner_id=user_a_id,
        schedule_type="weekly",
        schedule_config='{"time": "14:00", "day_of_week": 0, "timezone": "UTC"}',
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db.add(template)
    await db.flush()

    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    db.add(NCSRotationMember(template_id=template.id, user_id=user_a_id, position=1, is_active=True))
    db.add(NCSRotationMember(template_id=template.id, user_id=user_b_id, position=2, is_active=True))
    await db.commit()

    result = await db.execute(
        select(NetTemplate)
        .options(selectinload(NetTemplate.frequencies), selectinload(NetTemplate.rotation_members))
        .where(NetTemplate.id == template.id)
    )
    return result.scalar_one()


async def _put_at_position_one(db, template: NetTemplate, user_id: int, other_user_id: int) -> None:
    """Reorder the 2-member roster so user_id leads, then re-anchor -- the same
    effect as PUT /members/reorder, done directly against the ORM objects."""
    result = await db.execute(select(NCSRotationMember).where(NCSRotationMember.template_id == template.id))
    members = {m.user_id: m for m in result.scalars().all()}
    members[user_id].position = 1
    members[other_user_id].position = 2
    stamp_rotation_anchor(template)
    await db.commit()


@pytest.mark.asyncio
async def test_resync_replaces_stale_auto_assigned_duty_ncs(db, owner, other):
    """A roster reorder must update the duty NCS on a net auto-created before the edit."""
    template = await _template_with_two_members(db, owner.id, other.id)

    scheduled_dt = _next_sunday_1400()
    net_id = await NCSReminderService()._get_or_create_scheduled_net(db, template, scheduled_dt)
    assert net_id is not None

    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert len(roles) == 1
    assert roles[0].role == "NCS"
    assert roles[0].auto_assigned is True
    original_ncs_id = roles[0].user_id

    # Re-anchoring puts whoever now leads the roster on point for the very next
    # occurrence, so putting the *other* member at position 1 guarantees a flip
    # regardless of who the rotation originally picked.
    new_ncs_id = other.id if original_ncs_id == owner.id else owner.id
    await _put_at_position_one(db, template, new_ncs_id, original_ncs_id)

    await resync_pending_duty_ncs(db, template.id)

    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert len(roles) == 1, "reorder must replace the stale role, not add a second one"
    assert roles[0].user_id == new_ncs_id
    assert roles[0].auto_assigned is True


@pytest.mark.asyncio
async def test_resync_never_touches_a_lobby_or_active_net(db, owner, other):
    """Only DRAFT/SCHEDULED nets are eligible -- once the lobby is open, a human is in charge."""
    template = await _template_with_two_members(db, owner.id, other.id)
    scheduled_dt = _next_sunday_1400()
    net_id = await NCSReminderService()._get_or_create_scheduled_net(db, template, scheduled_dt)

    original_role = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalar_one()
    original_ncs_id = original_role.user_id
    new_ncs_id = other.id if original_ncs_id == owner.id else owner.id

    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    net.status = NetStatus.LOBBY
    await db.commit()

    await _put_at_position_one(db, template, new_ncs_id, original_ncs_id)
    await resync_pending_duty_ncs(db, template.id)

    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert len(roles) == 1
    assert roles[0].user_id == original_ncs_id, "an already-open lobby must not be silently reassigned"


@pytest.mark.asyncio
async def test_resync_leaves_a_manually_assigned_ncs_alone(db, owner, other):
    """A human's explicit role assignment on a pending net is never overwritten or duplicated."""
    template = await _template_with_two_members(db, owner.id, other.id)
    scheduled_dt = _next_sunday_1400()
    net_id = await NCSReminderService()._get_or_create_scheduled_net(db, template, scheduled_dt)

    # Replace the auto-assigned role with a manual one, as an owner/admin would via
    # POST /nets/{id}/roles (auto_assigned defaults False for anything not stamped
    # by _assign_duty_ncs itself).
    await db.execute(NetRole.__table__.delete().where(NetRole.net_id == net_id))
    db.add(NetRole(net_id=net_id, user_id=owner.id, role="NCS", auto_assigned=False))
    await db.commit()

    await _put_at_position_one(db, template, other.id, owner.id)
    await resync_pending_duty_ncs(db, template.id)

    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert len(roles) == 1, "must not add a second NCS alongside a manual assignment"
    assert roles[0].user_id == owner.id
    assert roles[0].auto_assigned is False
