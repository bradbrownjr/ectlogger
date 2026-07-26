"""
Regression tests for the NCS reminder / auto-create background service.

Guards the auto-create path that failed silently from 2026-06-20 to 2026-07-26:
_assign_duty_ncs referenced NetRole without importing it, so every auto-create
for a template WITH an NCS rotation raised NameError. That was swallowed by
_get_or_create_scheduled_net's except handler, which rolled back and returned
None — no net was ever created. The background service catches its own
exceptions, so nothing surfaced for five weeks. Plain (rotation-less) templates
were unaffected because _assign_duty_ncs returns before the broken line.
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    Frequency,
    Net,
    NetRole,
    NCSReminderLog,
    NetStatus,
    NetTemplate,
    NCSRotationMember,
    net_template_frequencies,
)
from app.ncs_reminder_service import NCSReminderService


async def _weekly_rotation_template(db, owner_id: int) -> NetTemplate:
    """Weekly Sunday template with one linked frequency and a single-member rotation.

    Timezone is UTC so local == UTC (no DST math), and created_at anchors the
    rotation well before the target date so the schedule resolves to a real NCS.
    """
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()

    template = NetTemplate(
        name="Rotation Net",
        owner_id=owner_id,
        schedule_type="weekly",
        schedule_config='{"time": "14:00", "day_of_week": 0, "timezone": "UTC"}',
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db.add(template)
    await db.flush()

    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    # Sole rotation member -> every occurrence resolves to the owner.
    db.add(NCSRotationMember(template_id=template.id, user_id=owner_id, position=1, is_active=True))
    await db.commit()

    # Reload with the relationship _get_or_create_scheduled_net iterates.
    result = await db.execute(
        select(NetTemplate)
        .options(selectinload(NetTemplate.frequencies))
        .where(NetTemplate.id == template.id)
    )
    return result.scalar_one()


# 2026-03-08 14:00 UTC is the 2nd Sunday of March (not a 5th-week pause).
_SCHEDULED = datetime(2026, 3, 8, 14, 0)


@pytest.mark.asyncio
async def test_auto_create_assigns_ncs_for_rotation_template(db, owner):
    """A rotation template must auto-create the net AND assign the duty NCS.

    Before the NetRole import fix this returned None (NameError swallowed).
    """
    template = await _weekly_rotation_template(db, owner.id)

    service = NCSReminderService()
    net_id = await service._get_or_create_scheduled_net(db, template, _SCHEDULED)

    assert net_id is not None, "auto-create returned None (NetRole NameError regressed)"

    net = (
        await db.execute(
            select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
        )
    ).scalar_one()
    assert net.status == NetStatus.SCHEDULED
    assert net.template_id == template.id
    # Frequency was copied from the template.
    assert len(net.frequencies) == 1

    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert any(r.role == "NCS" and r.user_id == owner.id for r in roles), \
        "duty NCS was not assigned from the rotation"


@pytest.mark.asyncio
async def test_auto_create_is_idempotent(db, owner):
    """Calling twice for the same occurrence returns the same net, not a duplicate."""
    template = await _weekly_rotation_template(db, owner.id)

    service = NCSReminderService()
    first = await service._get_or_create_scheduled_net(db, template, _SCHEDULED)
    second = await service._get_or_create_scheduled_net(db, template, _SCHEDULED)

    assert first is not None
    assert first == second

    nets = (await db.execute(select(Net).where(Net.template_id == template.id))).scalars().all()
    assert len(nets) == 1


@pytest.mark.asyncio
async def test_one_hour_dedup_spans_all_reminder_types(db, owner):
    """A user who already got any 1h-class reminder is deduped across all paths.

    This is the fix for duplicate/triplicate "starting soon" emails: a single
    on-duty NCS reminder ("1h") must suppress the staff and subscriber senders
    for the same net occurrence.
    """
    template = await _weekly_rotation_template(db, owner.id)
    service = NCSReminderService()

    # No reminder logged yet -> all senders would send.
    assert not await service._already_reminded_1h(db, template.id, owner.id, _SCHEDULED)

    # The NCS path logs its "1h" reminder first...
    db.add(NCSReminderLog(
        template_id=template.id,
        user_id=owner.id,
        scheduled_date=_SCHEDULED,
        reminder_type="1h",
        sent_at=datetime.utcnow(),
    ))
    await db.commit()

    # ...so the staff and subscriber senders now see it and skip.
    assert await service._already_reminded_1h(db, template.id, owner.id, _SCHEDULED)

    # A different occurrence is unaffected.
    other_date = datetime(2026, 3, 15, 14, 0)
    assert not await service._already_reminded_1h(db, template.id, owner.id, other_date)
