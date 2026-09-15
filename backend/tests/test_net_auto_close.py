"""
Regression tests for auto-close-on-inactivity (Net.auto_close_after_minutes).

Added after the ME Dirigo Net (net 92, 2026-09-14) sat ACTIVE for hours after
the NCS said the net was complete and forgot to press Close. Off by default --
a long SKYWARN/ARES activation can legitimately go hours between check-ins, so
this must never close a net nobody opted in.

Covers the two standalone helpers directly (same pattern as
_find_stale_nets/test_auto_lobby.py: they're designed to be tested against a
plain session rather than only through the full AsyncSessionLocal-opening
loop method), plus the full _check_and_close_inactive_nets() path with
AsyncSessionLocal patched to the test db, mirroring
test_traffic_reminder_service.py's _patched_session_local.

Timestamps are computed relative to a real datetime.now(timezone.utc) taken at
each test's start rather than frozen, since the code under test also calls
datetime.now(timezone.utc) for "now".
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import ChatMessage, CheckIn, Net, NetStatus, StationStatus
from app.ncs_reminder_service import NCSReminderService
from app.services.net_closure import compute_auto_close_at


async def _make_net(db, owner, **kwargs):
    net = Net(
        name=kwargs.pop("name", "Test Net"),
        owner_id=owner.id,
        status=kwargs.pop("status", NetStatus.ACTIVE),
        **kwargs,
    )
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


class _patched_session_local:
    """Points ncs_reminder_service.AsyncSessionLocal at the test's own db
    session so the full _check_and_close_inactive_nets() (which normally opens
    its own AsyncSessionLocal) can see fixtures on the shared in-memory test
    database."""

    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        import app.ncs_reminder_service as svc_module

        db = self._db

        class _FakeSessionLocal:
            def __call__(self):
                return self

            async def __aenter__(self_inner):
                return db

            async def __aexit__(self_inner, *exc):
                return False

        self._original = svc_module.AsyncSessionLocal
        svc_module.AsyncSessionLocal = _FakeSessionLocal()
        return self

    async def __aexit__(self, *exc):
        import app.ncs_reminder_service as svc_module
        svc_module.AsyncSessionLocal = self._original
        return False


# ========== _last_activity_at ==========

@pytest.mark.asyncio
async def test_last_activity_falls_back_to_started_at_with_no_checkins_or_chat(db, owner):
    started_at = datetime.now(timezone.utc) - timedelta(hours=5)
    net = await _make_net(db, owner, started_at=started_at)
    service = NCSReminderService()

    result = await service._last_activity_at(db, net.id, net.started_at)

    assert result == net.started_at


@pytest.mark.asyncio
async def test_last_activity_reflects_a_recent_recheck(db, owner):
    started_at = datetime.now(timezone.utc) - timedelta(hours=5)
    net = await _make_net(db, owner, started_at=started_at)
    check_in = CheckIn(
        net_id=net.id,
        callsign="KC1AAA",
        name="Test",
        location="Home",
        status=StationStatus.CHECKED_IN,
        checked_in_at=started_at + timedelta(hours=1),
    )
    db.add(check_in)
    await db.commit()
    # Simulate a recheck bumping updated_at well after the original check-in
    # and well after started_at.
    recheck_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    check_in.updated_at = recheck_at
    await db.commit()

    service = NCSReminderService()
    result = await service._last_activity_at(db, net.id, net.started_at)

    # SQLite round-trips DateTime(timezone=True) as naive, so compare values
    # rather than tzinfo-sensitive equality.
    assert result.replace(tzinfo=None) == recheck_at.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_last_activity_reflects_a_recent_chat_message(db, owner):
    started_at = datetime.now(timezone.utc) - timedelta(hours=5)
    net = await _make_net(db, owner, started_at=started_at)
    chat_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db.add(ChatMessage(
        net_id=net.id,
        user_id=owner.id,
        message="Anyone still out there?",
        created_at=chat_at,
    ))
    await db.commit()

    service = NCSReminderService()
    result = await service._last_activity_at(db, net.id, net.started_at)

    assert result.replace(tzinfo=None) == chat_at.replace(tzinfo=None)


# ========== _find_auto_close_candidates ==========

@pytest.mark.asyncio
async def test_find_candidates_only_active_with_minutes_set(db, owner):
    active_opted_in = await _make_net(db, owner, name="A", status=NetStatus.ACTIVE, auto_close_after_minutes=60)
    await _make_net(db, owner, name="B", status=NetStatus.ACTIVE, auto_close_after_minutes=None)
    await _make_net(db, owner, name="C", status=NetStatus.LOBBY, auto_close_after_minutes=60)
    await _make_net(db, owner, name="D", status=NetStatus.CLOSED, auto_close_after_minutes=60)

    service = NCSReminderService()
    candidates = await service._find_auto_close_candidates(db)

    assert [n.id for n in candidates] == [active_opted_in.id]


# ========== compute_auto_close_at (net_closure.py) ==========
# Used by GET /nets/{id} (routers/nets_core.py::get_net) to surface the
# warning banner's countdown target; must agree with the scheduler's own
# _last_activity_at above since they share the same implementation.

@pytest.mark.asyncio
async def test_compute_auto_close_at_disabled_returns_none(db, owner):
    net = await _make_net(
        db, owner,
        started_at=datetime.now(timezone.utc) - timedelta(hours=1),
        auto_close_after_minutes=None,
    )

    assert await compute_auto_close_at(db, net) is None


@pytest.mark.asyncio
async def test_compute_auto_close_at_non_active_returns_none(db, owner):
    net = await _make_net(
        db, owner,
        status=NetStatus.LOBBY,
        started_at=datetime.now(timezone.utc) - timedelta(hours=1),
        auto_close_after_minutes=60,
    )

    assert await compute_auto_close_at(db, net) is None


@pytest.mark.asyncio
async def test_compute_auto_close_at_adds_minutes_to_last_activity(db, owner):
    started_at = datetime.now(timezone.utc) - timedelta(hours=5)
    net = await _make_net(
        db, owner,
        started_at=started_at,
        auto_close_after_minutes=60,
    )
    chat_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db.add(ChatMessage(net_id=net.id, user_id=owner.id, message="hi", created_at=chat_at))
    await db.commit()

    result = await compute_auto_close_at(db, net)

    expected = chat_at + timedelta(minutes=60)
    assert result.replace(tzinfo=None) == expected.replace(tzinfo=None)


# ========== Full _check_and_close_inactive_nets() ==========

@pytest.mark.asyncio
async def test_inactive_net_past_threshold_is_closed(db, owner):
    net = await _make_net(
        db, owner,
        started_at=datetime.now(timezone.utc) - timedelta(hours=5),
        auto_close_after_minutes=60,
    )

    service = NCSReminderService()
    async with _patched_session_local(db):
        await service._check_and_close_inactive_nets()

    await db.refresh(net)
    assert net.status == NetStatus.CLOSED

    messages = (await db.execute(select(ChatMessage).where(ChatMessage.net_id == net.id))).scalars().all()
    assert any("automatically closed" in m.message for m in messages)


@pytest.mark.asyncio
async def test_net_with_recent_activity_is_left_open(db, owner):
    net = await _make_net(
        db, owner,
        started_at=datetime.now(timezone.utc) - timedelta(hours=5),
        auto_close_after_minutes=60,
    )
    db.add(CheckIn(
        net_id=net.id,
        callsign="KC1AAA",
        name="Test",
        location="Home",
        status=StationStatus.CHECKED_IN,
        checked_in_at=datetime.now(timezone.utc) - timedelta(minutes=10),
    ))
    await db.commit()

    service = NCSReminderService()
    async with _patched_session_local(db):
        await service._check_and_close_inactive_nets()

    await db.refresh(net)
    assert net.status == NetStatus.ACTIVE


@pytest.mark.asyncio
async def test_disabled_by_default_never_closes(db, owner):
    net = await _make_net(
        db, owner,
        started_at=datetime.now(timezone.utc) - timedelta(days=1),
        auto_close_after_minutes=None,
    )

    service = NCSReminderService()
    async with _patched_session_local(db):
        await service._check_and_close_inactive_nets()

    await db.refresh(net)
    assert net.status == NetStatus.ACTIVE
