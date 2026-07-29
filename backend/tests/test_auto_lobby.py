"""
Tests for auto-open lobby (schedule setting -> scheduler transition -> cleanup).

The feature deliberately collides with two existing behaviors, and both guards
are covered here:

* The stale sweep identifies a net that never ran by "still SCHEDULED 24h after
  its start". Auto-lobby moves nets out of SCHEDULED on a timer, so the sweep
  gained a second case for auto-opened lobbies nobody attended.
* The subscriber "net starting" email fires at lobby open. An automatic open
  must stay silent until a human confirms the net is really happening.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    CheckIn,
    NCSRotationMember,
    NCSScheduleOverride,
    Net,
    NetStatus,
    NetTemplate,
    StationStatus,
)
from app.ncs_reminder_service import NCSReminderService
from app.net_start import auto_open_lobby, lobby_open_due
from tests.conftest import auth_headers


# 20:00 America/New_York on Sunday 2026-03-15 is 00:00 UTC on Monday 2026-03-16.
# Every evening-scheduled net has this UTC/local date split, which is exactly what
# broke the reminder service in June 2026, so the staffing check is tested with it.
_LOCAL_EVENING = datetime(2026, 3, 15, 20, 0)
_UTC_EVENING = datetime(2026, 3, 16, 0, 0)


async def _evening_template(db, owner_id: int, with_rotation: bool = True) -> NetTemplate:
    """Weekly Sunday 20:00 Eastern template, optionally with a one-member rotation."""
    template = NetTemplate(
        name="Evening Net",
        owner_id=owner_id,
        schedule_type="weekly",
        schedule_config='{"time": "20:00", "day_of_week": 0, "timezone": "America/New_York"}',
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        auto_lobby_minutes=20,
    )
    db.add(template)
    await db.flush()

    if with_rotation:
        db.add(NCSRotationMember(template_id=template.id, user_id=owner_id, position=1, is_active=True))
    await db.commit()

    result = await db.execute(
        select(NetTemplate)
        .options(selectinload(NetTemplate.frequencies))
        .where(NetTemplate.id == template.id)
    )
    return result.scalar_one()


async def _net(db, owner_id: int, **kwargs) -> Net:
    net = Net(
        name="Evening Net",
        owner_id=owner_id,
        status=kwargs.pop("status", NetStatus.SCHEDULED),
        scheduled_start_time=kwargs.pop("scheduled_start_time", _UTC_EVENING),
        **kwargs,
    )
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


# ==========================================================================
# Offset math
# ==========================================================================

@pytest.mark.asyncio
async def test_lobby_open_due_only_inside_the_window(db, owner):
    """Fires from (start - offset) up to, but not including, the start time."""
    net = await _net(db, owner.id, auto_lobby_minutes=20)

    assert not lobby_open_due(net, _UTC_EVENING - timedelta(minutes=21)), "fired before the offset"
    assert lobby_open_due(net, _UTC_EVENING - timedelta(minutes=20)), "missed the exact offset"
    assert lobby_open_due(net, _UTC_EVENING - timedelta(minutes=1))
    # At and after the official start a human has to start the net; a staging
    # lobby is no longer the right transition.
    assert not lobby_open_due(net, _UTC_EVENING)
    assert not lobby_open_due(net, _UTC_EVENING + timedelta(hours=3)), "late tick opened a stale lobby"


@pytest.mark.asyncio
async def test_lobby_open_due_disabled_when_unset(db, owner):
    """Null auto_lobby_minutes (the default) never fires, whatever the clock says."""
    net = await _net(db, owner.id, auto_lobby_minutes=None)
    assert not lobby_open_due(net, _UTC_EVENING - timedelta(minutes=5))

    # Nor does an ad hoc net with the setting but no scheduled start to count from.
    no_start = await _net(db, owner.id, auto_lobby_minutes=20, scheduled_start_time=None)
    assert not lobby_open_due(no_start, _UTC_EVENING)


@pytest.mark.asyncio
async def test_lobby_open_due_handles_timezone_aware_start(db, owner):
    """A tz-aware scheduled_start_time (Postgres/MySQL) compares without blowing up."""
    net = await _net(
        db, owner.id,
        auto_lobby_minutes=20,
        scheduled_start_time=_UTC_EVENING.replace(tzinfo=timezone.utc),
    )
    aware_now = (_UTC_EVENING - timedelta(minutes=5)).replace(tzinfo=timezone.utc)
    assert lobby_open_due(net, aware_now)


# ==========================================================================
# Staffing guard
# ==========================================================================

@pytest.mark.asyncio
async def test_occurrence_staffed_for_evening_net_across_the_utc_date_boundary(db, owner):
    """The duty lookup converts UTC back to template-local before matching.

    The net's stored start is 2026-03-16 00:00 UTC, but the occurrence is the
    Sunday *evening* of 2026-03-15 local. Matching on the UTC date would look at
    a Monday and find no occurrence.
    """
    template = await _evening_template(db, owner.id)
    net = await _net(db, owner.id, template_id=template.id, auto_lobby_minutes=20)

    assert await NCSReminderService()._is_occurrence_staffed(db, net)


@pytest.mark.asyncio
async def test_occurrence_not_staffed_when_duty_cancelled(db, owner):
    """A cancelled duty (override with no replacement) blocks the automatic open.

    The cancellation can land after the net row already exists, which is why the
    rotation is recomputed instead of trusting the NetRole assigned at creation.
    """
    template = await _evening_template(db, owner.id)
    net = await _net(db, owner.id, template_id=template.id, auto_lobby_minutes=20)

    db.add(NCSScheduleOverride(
        template_id=template.id,
        scheduled_date=_LOCAL_EVENING,
        original_user_id=owner.id,
        replacement_user_id=None,  # NULL replacement = cancelled
    ))
    await db.commit()

    assert not await NCSReminderService()._is_occurrence_staffed(db, net)


@pytest.mark.asyncio
async def test_occurrence_staffed_when_there_is_no_rotation(db, owner):
    """No rotation to consult means the owner is the de facto NCS, so it still fires.

    Refusing here would silently disable a setting the user turned on.
    """
    template = await _evening_template(db, owner.id, with_rotation=False)
    net = await _net(db, owner.id, template_id=template.id, auto_lobby_minutes=20)
    assert await NCSReminderService()._is_occurrence_staffed(db, net)

    ad_hoc = await _net(db, owner.id, auto_lobby_minutes=20)
    assert await NCSReminderService()._is_occurrence_staffed(db, ad_hoc)


# ==========================================================================
# The transition itself
# ==========================================================================

@pytest.mark.asyncio
async def test_auto_open_lobby_marks_the_net_and_stays_silent(db, owner):
    """Opens the lobby, flags it as automatic, and sends no "net starting" email."""
    net = await _net(db, owner.id, auto_lobby_minutes=20)

    await auto_open_lobby(db, net)
    await db.refresh(net)

    assert net.status == NetStatus.LOBBY
    assert net.lobby_opened_automatically is True
    # started_at stays empty: the net is staging, not live.
    assert net.started_at is None
    # Nobody has confirmed the net is happening, so subscribers are not told yet.
    assert net.start_notification_sent_at is None
    # And no NCS was auto-checked-in, unlike a human pressing "open lobby".
    check_ins = (await db.execute(select(CheckIn).where(CheckIn.net_id == net.id))).scalars().all()
    assert check_ins == []


# ==========================================================================
# Stale sweep
# ==========================================================================

@pytest.mark.asyncio
async def test_sweep_archives_an_auto_opened_lobby_nobody_attended(db, owner):
    """The case that would otherwise sit on the dashboard forever."""
    old_start = datetime.utcnow() - timedelta(hours=30)
    net = await _net(
        db, owner.id,
        status=NetStatus.LOBBY,
        scheduled_start_time=old_start,
        auto_lobby_minutes=20,
        lobby_opened_automatically=True,
    )

    stale = await NCSReminderService()._find_stale_nets(db, datetime.utcnow() - timedelta(hours=24))
    assert [n.id for n in stale] == [net.id]


@pytest.mark.asyncio
async def test_sweep_spares_an_auto_opened_lobby_that_was_attended(db, owner):
    """One check-in means the net happened, even if nobody pressed "go live"."""
    old_start = datetime.utcnow() - timedelta(hours=30)
    net = await _net(
        db, owner.id,
        status=NetStatus.LOBBY,
        scheduled_start_time=old_start,
        auto_lobby_minutes=20,
        lobby_opened_automatically=True,
    )
    db.add(CheckIn(
        net_id=net.id, callsign="KC1TST", name="", location="",
        status=StationStatus.CHECKED_IN,
    ))
    await db.commit()

    stale = await NCSReminderService()._find_stale_nets(db, datetime.utcnow() - timedelta(hours=24))
    assert stale == []


@pytest.mark.asyncio
async def test_sweep_never_touches_a_human_opened_lobby(db, owner):
    """The scheduler must not undo a deliberate action, however long it sits."""
    old_start = datetime.utcnow() - timedelta(days=5)
    await _net(
        db, owner.id,
        status=NetStatus.LOBBY,
        scheduled_start_time=old_start,
        lobby_opened_automatically=False,
    )

    stale = await NCSReminderService()._find_stale_nets(db, datetime.utcnow() - timedelta(hours=24))
    assert stale == []


@pytest.mark.asyncio
async def test_sweep_still_archives_nets_that_were_never_opened(db, owner):
    """The original behavior is unchanged by the new case."""
    old_start = datetime.utcnow() - timedelta(hours=30)
    net = await _net(db, owner.id, scheduled_start_time=old_start)

    stale = await NCSReminderService()._find_stale_nets(db, datetime.utcnow() - timedelta(hours=24))
    assert [n.id for n in stale] == [net.id]


@pytest.mark.asyncio
async def test_sweep_leaves_recent_nets_alone(db, owner):
    """A net scheduled inside the last 24 hours has not had its chance yet."""
    await _net(db, owner.id, scheduled_start_time=datetime.utcnow() - timedelta(hours=2))

    stale = await NCSReminderService()._find_stale_nets(db, datetime.utcnow() - timedelta(hours=24))
    assert stale == []


# ==========================================================================
# Ad-hoc / one-time "now": forced lobby on manual Start
#
# These nets have no scheduled_start_time at all, so there is nothing for the
# background scheduler to count down from - lobby_open_due() always returns
# False for them (covered above). Instead, "enable lobby" is honored directly
# by start_net() the moment a human clicks Start: it stages through LOBBY
# rather than skipping straight to ACTIVE.
# ==========================================================================

@pytest.mark.asyncio
async def test_manual_start_forces_lobby_when_no_scheduled_time(client, owner):
    create = await client.post(
        "/api/nets/",
        json={"name": "Ad-Hoc Net", "auto_lobby_minutes": 0},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]

    resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))

    assert resp.status_code == 200
    assert resp.json()["status"] == "lobby"


@pytest.mark.asyncio
async def test_manual_start_goes_active_when_lobby_not_enabled(client, owner):
    """Unchanged default: a plain ad-hoc net with no auto_lobby_minutes still
    skips straight to ACTIVE, exactly as before this feature existed."""
    create = await client.post(
        "/api/nets/",
        json={"name": "Plain Ad-Hoc Net"},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]

    resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))

    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


# ==========================================================================
# One-time "at a specific time": reuses the recurring scheduler mechanism
# ==========================================================================

@pytest.mark.asyncio
async def test_auto_open_lobbies_matches_draft_status_not_only_scheduled(db, owner):
    """Manually created nets (including a one-time net given a start time) are
    always DRAFT, never SCHEDULED - only the recurring auto-create job produces
    SCHEDULED nets. The candidate query must still find them."""
    draft_net = await _net(
        db, owner.id,
        status=NetStatus.DRAFT,
        scheduled_start_time=datetime.utcnow() + timedelta(minutes=10),
        auto_lobby_minutes=15,
    )
    scheduled_net = await _net(
        db, owner.id,
        status=NetStatus.SCHEDULED,
        scheduled_start_time=datetime.utcnow() + timedelta(minutes=10),
        auto_lobby_minutes=15,
    )
    # A closed net with the same fields should never resurface as a candidate.
    await _net(
        db, owner.id,
        status=NetStatus.CLOSED,
        scheduled_start_time=datetime.utcnow() + timedelta(minutes=10),
        auto_lobby_minutes=15,
    )

    candidates = await NCSReminderService()._find_lobby_candidates(db)

    assert {n.id for n in candidates} == {draft_net.id, scheduled_net.id}


@pytest.mark.asyncio
async def test_auto_open_lobby_applied_to_a_draft_net(db, owner):
    """End-to-end through auto_open_lobby(): a DRAFT one-time net that reached its
    offset transitions to LOBBY exactly like a SCHEDULED recurring one does."""
    net = await _net(
        db, owner.id,
        status=NetStatus.DRAFT,
        scheduled_start_time=datetime.utcnow() + timedelta(minutes=10),
        auto_lobby_minutes=15,
    )
    assert lobby_open_due(net)

    await auto_open_lobby(db, net)
    await db.refresh(net)

    assert net.status == NetStatus.LOBBY
    assert net.lobby_opened_automatically is True
