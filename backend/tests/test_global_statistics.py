"""
Tests for GET /statistics/global: the held-net rule shared by the all-time
and windowed net counts, windowed new operators, and the most-active
operators scoreboard.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models import CheckIn, Contact, Net, NetStatus


def _net(owner, status, started_days_ago=None, name="Net"):
    started = None
    if started_days_ago is not None:
        started = datetime.now(timezone.utc) - timedelta(days=started_days_ago)
    return Net(name=name, owner_id=owner.id, status=status, started_at=started)


def _check_in(net, callsign, days_ago, user_id=None, name="Op"):
    return CheckIn(
        net_id=net.id,
        callsign=callsign,
        name=name,
        location="Portland, ME",
        user_id=user_id,
        checked_in_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


@pytest.mark.asyncio
async def test_total_nets_counts_only_held_nets(client, db, owner):
    db.add_all([
        _net(owner, NetStatus.ARCHIVED, 5),
        _net(owner, NetStatus.CLOSED, 5),
        _net(owner, NetStatus.ACTIVE, 0),
        _net(owner, NetStatus.CANCELLED),
        _net(owner, NetStatus.SCHEDULED),
        _net(owner, NetStatus.DRAFT),
    ])
    await db.commit()

    data = (await client.get("/api/statistics/global?days=0")).json()
    assert data["total_nets"] == 3
    assert data["window_nets"] == 3


@pytest.mark.asyncio
async def test_new_operators_and_top_operators(client, db, owner, other):
    old = _net(owner, NetStatus.ARCHIVED, 60, "Old")
    recent1 = _net(owner, NetStatus.ARCHIVED, 5, "Recent 1")
    recent2 = _net(owner, NetStatus.ARCHIVED, 3, "Recent 2")
    cancelled = _net(owner, NetStatus.CANCELLED, 2, "Cancelled")
    db.add_all([old, recent1, recent2, cancelled])
    await db.commit()
    for n in (old, recent1, recent2, cancelled):
        await db.refresh(n)

    owner.name = "Brad Brown"
    db.add(Contact(callsign="W1NEW", name="Nancy Newcomer"))
    db.add_all([
        # KC1OWN: veteran (seen 60 days ago), two recent nets plus a recheck
        _check_in(old, "KC1OWN", 60, owner.id),
        _check_in(recent1, "KC1OWN", 5, owner.id),
        _check_in(recent1, "KC1OWN", 5, owner.id),
        _check_in(recent2, "KC1OWN", 3, owner.id),
        # W1NEW: guest, first ever check-in inside the window
        _check_in(recent1, "W1NEW", 5),
        # A cancelled net never counts toward the scoreboard
        _check_in(cancelled, "W1NEW", 2),
        _check_in(cancelled, "W1NEW", 2),
    ])
    await db.commit()

    data = (await client.get("/api/statistics/global?days=30")).json()
    assert data["window_new_operators"] == 1

    top = data["top_operators"]
    assert [(t["callsign"], t["nets_attended"]) for t in top] == [("KC1OWN", 2), ("W1NEW", 1)]
    assert top[0]["first_name"] == "Brad"
    assert top[0]["user_id"] == owner.id
    assert top[1]["first_name"] == "Nancy"
    assert top[1]["user_id"] is None

    all_time = (await client.get("/api/statistics/global?days=0")).json()
    assert all_time["window_new_operators"] == all_time["unique_operators"] == 2
    assert all_time["top_operators"][0]["nets_attended"] == 3


@pytest.mark.asyncio
async def test_checkin_map_follows_window(client, db, owner):
    net = _net(owner, NetStatus.ARCHIVED, 60)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    old = _check_in(net, "W1OLD", 60)
    old.location = "Portland, ME"
    recent = _check_in(net, "W1NOW", 2)
    recent.location = "Concord, NH"
    db.add_all([old, recent])
    await db.commit()

    regions = lambda d: sorted(r["region"] for r in d.json()["regions"])
    assert regions(await client.get("/api/statistics/checkin-map")) == ["ME", "NH"]
    assert regions(await client.get("/api/statistics/checkin-map?days=30")) == ["NH"]
