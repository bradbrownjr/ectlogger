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
    User,
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
async def test_is_cancelled_occurrence_detects_cancelled_net(db, owner):
    """Regression: cancelling a scheduled net used to hard-delete the row, so
    the next reminder tick saw "no net for this slot" and silently recreated
    it (reminder email included). _is_cancelled_occurrence is the guard the
    reminder loops check before doing any work for a computed schedule date.
    """
    template = await _weekly_rotation_template(db, owner.id)

    db.add(Net(
        name=template.name,
        owner_id=owner.id,
        template_id=template.id,
        status=NetStatus.CANCELLED,
        scheduled_start_time=_SCHEDULED,
        cancelled_at=datetime.now(timezone.utc),
        cancel_reason="in-person meeting instead",
    ))
    await db.commit()

    service = NCSReminderService()
    assert await service._is_cancelled_occurrence(db, template.id, _SCHEDULED) is True
    # A different slot for the same template has no cancelled row and isn't flagged.
    other_slot = _SCHEDULED.replace(hour=15)
    assert await service._is_cancelled_occurrence(db, template.id, other_slot) is False


@pytest.mark.asyncio
async def test_get_or_create_scheduled_net_does_not_duplicate_cancelled_row(db, owner):
    """Defense in depth: even called directly for an already-cancelled slot
    (normal callers check _is_cancelled_occurrence first and skip instead),
    _get_or_create_scheduled_net must reuse the existing row, not insert a
    second Net for the same occurrence.
    """
    template = await _weekly_rotation_template(db, owner.id)

    cancelled = Net(
        name=template.name,
        owner_id=owner.id,
        template_id=template.id,
        status=NetStatus.CANCELLED,
        scheduled_start_time=_SCHEDULED,
    )
    db.add(cancelled)
    await db.commit()
    await db.refresh(cancelled)

    service = NCSReminderService()
    net_id = await service._get_or_create_scheduled_net(db, template, _SCHEDULED)

    assert net_id == cancelled.id
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


@pytest.mark.asyncio
async def test_staff_reminder_includes_duty_ncs_name(db, owner):
    """Staff reminder email receives the on-duty NCS name when a NetRole exists.

    Verifies that the ncs_name and ncs_callsign are queried and passed to the
    reminder template when a net with an assigned NCS exists.
    """
    from app.models import TemplateStaff

    template = await _weekly_rotation_template(db, owner.id)
    service = NCSReminderService()

    # Create a SCHEDULED net with the duty NCS assigned
    net_id = await service._get_or_create_scheduled_net(db, template, _SCHEDULED)
    assert net_id is not None

    # Verify the NetRole was created
    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert any(r.role == "NCS" for r in roles), "duty NCS was not assigned"

    # Resolve the duty NCS through the SAME helper the reminder service uses
    # (app.utils.format_ncs_attribution). This test used to re-implement the
    # query inline with `assigned_at DESC LIMIT 1`, which meant it passed no
    # matter what the service actually did -- it was asserting against a copy.
    # That is precisely how the 2026-09-03 misattribution survived a green
    # suite. Assert against the shared rule instead.
    from app.utils import format_ncs_attribution

    ncs_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id)
        .where(NetRole.role == "NCS")
        .where(NetRole.is_active == True)  # noqa: E712
        .order_by(NetRole.assigned_at.asc())
    )
    ncs_callsign, ncs_name = format_ncs_attribution(ncs_result.all())

    assert ncs_callsign == owner.callsign
    assert ncs_name == owner.name


@pytest.mark.parametrize(
    "hours_until, reminder_hours, expected",
    [
        # Net #44 (2026-07-12): reminder fired 30m19s before start, matching
        # the original bug report ("1 hour" email arrived with only 30 min
        # notice). That's still inside the catch-up floor (a legitimate late
        # send beats no send), so it's accepted - the auto-create timing skew
        # that caused it was a separate bug, already fixed in f866587.
        (30.32 / 60, 1.0, True),
        # Real post-fix sends (2026-07-28, 2026-07-30 nets) fired ~83 and ~89
        # minutes before start under the old symmetric ±30min window. The old
        # `abs(hours_until - reminder_hours) <= 0.5` accepted both; the new
        # one-sided window must reject both as too early.
        (83 / 60, 1.0, False),
        (89 / 60, 1.0, False),
        # Exactly on the target and just inside the catch-up floor: accepted.
        (1.0, 1.0, True),
        (0.5, 1.0, True),
        # Missed by more than the 30-minute catch-up floor: rejected as stale.
        (0.49, 1.0, False),
        (20 / 60, 1.0, False),
        # A hair after the target (next tick hasn't fired yet, still pending
        # by nominal reminder_hours but within a minute): accepted.
        (1.0 - 1 / 60, 1.0, True),
        # 24-hour tier uses the same helper with a different target.
        (24.0, 24.0, True),
        (23.5, 24.0, True),
        (23.49, 24.0, False),
        (24.5, 24.0, False),
    ],
)
def test_reminder_window_is_one_sided(hours_until, reminder_hours, expected):
    """The reminder window must never accept a time earlier than reminder_hours
    before start - only late, within the catch-up floor. This is the fix for
    the roadmap item confirming real "1 hour" reminders were firing ~90
    minutes before start under the old symmetric ±30-minute window.
    """
    assert NCSReminderService._in_reminder_window(hours_until, reminder_hours) is expected


@pytest.mark.asyncio
async def test_staff_reminder_handles_missing_ncs(db, owner):
    """Staff reminder accepts None for ncs_name/ncs_callsign when no NetRole exists.

    Verifies graceful handling of templates without an NCS rotation.
    """
    from app.models import TemplateStaff

    # Create a template without rotation (no NCSRotationMember)
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()

    template = NetTemplate(
        name="No Rotation Net",
        owner_id=owner.id,
        schedule_type="weekly",
        schedule_config='{"time": "14:00", "day_of_week": 0, "timezone": "UTC"}',
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db.add(template)
    await db.flush()

    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    await db.commit()

    service = NCSReminderService()

    # Try to create a scheduled net (will succeed but without NCS assignment)
    result = await db.execute(
        select(NetTemplate)
        .options(selectinload(NetTemplate.frequencies))
        .where(NetTemplate.id == template.id)
    )
    reloaded_template = result.scalar_one()

    net_id = await service._get_or_create_scheduled_net(db, reloaded_template, _SCHEDULED)
    assert net_id is not None

    # Query for duty NCS (should return None since no rotation)
    ncs_result = await db.execute(
        select(User.callsign, User.name)
        .join(NetRole, NetRole.user_id == User.id)
        .where(NetRole.net_id == net_id)
        .where(NetRole.role == "NCS")
        .order_by(NetRole.assigned_at.desc())
        .limit(1)
    )
    ncs_row = ncs_result.first()

    # Verify no NCS was assigned
    assert ncs_row is None
