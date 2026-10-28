"""
NCS credit goes to whoever ran the net (services/ncs_attribution.py).

Brad, 2026-10-28: the rotation's pick is assigned a day ahead, and was
credited on the report, ICS-309 and closing email even when they never
turned up, so the net manager had to remove them by hand. Once a net has
ended, an NCS is credited only if they took part (in the check-in list,
logged a check-in, or posted in chat). Closing, or sending a held log, asks
"Who ran this net?" when that leaves nobody; auto-close holds the log and
asks the managers, then sends it after 24 hours with "NCS: Not recorded".
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import (
    ChatMessage, CheckIn, Net, NetCallsignRole, NetRole, NetStatus, NetTemplate, User, UserRole,
)
from app.ncs_reminder_service import NCSReminderService
from app.services import net_closure, net_log_hold
from app.services.ncs_attribution import (
    NCS_NEEDED_DETAIL, NCS_NOT_RECORDED, load_ncs_rows, ncs_needed, net_ncs_attribution,
)
from tests.conftest import auth_headers
from tests.test_net_auto_close import _patched_session_local


@pytest.fixture()
def sent_logs(monkeypatch):
    sent = []

    async def _fake_send(db, net):
        sent.append(net.id)

    monkeypatch.setattr(net_closure, "send_net_log", _fake_send)
    return sent


async def _user(db, callsign):
    user = User(email=f"{callsign.lower()}@example.com", callsign=callsign, role=UserRole.USER, is_active=True)
    db.add(user)
    await db.commit()
    return user


async def _net(db, owner, status=NetStatus.ACTIVE, **fields):
    fields.setdefault("started_at", datetime.now(timezone.utc) - timedelta(hours=1))
    net = Net(name="Credit Net", owner_id=owner.id, status=status, **fields)
    db.add(net)
    await db.commit()
    return net


def _ncs(net, user):
    return NetRole(net_id=net.id, user_id=user.id, role="NCS")


def _check_in(net, callsign, user=None, logged_by=None):
    return CheckIn(net_id=net.id, callsign=callsign, name="Op", location="Here", user_id=user.id if user else None,
                   checked_in_by_id=logged_by.id if logged_by else None)


# ========== Who is credited ==========

@pytest.mark.asyncio
async def test_an_ncs_who_took_no_part_is_not_credited_once_the_net_ends(db, owner):
    absent, present, logger_only, chatter = [await _user(db, cs) for cs in ("W1ABS", "W1PRE", "W1LOG", "W1CHT")]
    net = await _net(db, owner)
    db.add_all([_ncs(net, u) for u in (absent, present, logger_only, chatter)])
    db.add_all([
        _check_in(net, "W1PRE", user=present),
        _check_in(net, "K1XYZ", logged_by=logger_only),
        ChatMessage(net_id=net.id, user_id=chatter.id, message="on frequency"),
    ])
    await db.commit()

    # While the net runs, everyone assigned is shown: the card says who is on duty.
    assert (await net_ncs_attribution(db, net.id))[0] == "W1ABS, W1PRE, W1LOG, W1CHT"

    net.status = NetStatus.CLOSED
    await db.commit()
    assert (await net_ncs_attribution(db, net.id))[0] == "W1PRE, W1LOG, W1CHT"


@pytest.mark.asyncio
async def test_checked_in_by_callsign_alone_counts(db, owner, other):
    """A Logger logging the NCS by callsign (UFB New England) credits them,
    with or without an account."""
    net = await _net(db, owner, status=NetStatus.ARCHIVED)
    db.add_all([
        _ncs(net, other),
        NetCallsignRole(net_id=net.id, callsign="N1GST", role="NCS"),
        NetCallsignRole(net_id=net.id, callsign="N1AWY", role="NCS"),
        _check_in(net, other.callsign.lower()),
        _check_in(net, "N1GST"),
    ])
    await db.commit()
    assert (await net_ncs_attribution(db, net.id))[0] == f"{other.callsign}, N1GST"


@pytest.mark.asyncio
async def test_a_net_that_never_ran_credits_nobody(db, owner, other):
    net = await _net(db, owner, status=NetStatus.ARCHIVED, started_at=None)
    db.add(_ncs(net, other))
    await db.commit()
    assert await net_ncs_attribution(db, net.id) == (None, None)


@pytest.mark.asyncio
async def test_schedule_leaderboard_counts_only_credited_nets(client, db, owner):
    template = NetTemplate(name="Weekly", owner_id=owner.id)
    db.add(template)
    await db.commit()
    ran, absent = await _user(db, "W1RAN"), await _user(db, "W1NOT")
    for _ in range(2):
        net = await _net(db, owner, status=NetStatus.CLOSED, template_id=template.id)
        db.add_all([_ncs(net, ran), _ncs(net, absent), _check_in(net, "W1RAN", user=ran)])
    await db.commit()

    resp = await client.get(f"/api/statistics/templates/{template.id}?days=0")
    board = {row["callsign"]: row["nets_count"] for row in resp.json()["ncs_leaderboard"]}
    assert board == {"W1RAN": 2}
    assert all(i["ncs_callsigns"] == ["W1RAN"] for i in resp.json()["instances"])


# ========== Closing asks who ran it ==========

@pytest.mark.asyncio
async def test_close_is_refused_until_someone_is_named(client, db, owner, other, sent_logs):
    net = await _net(db, owner)
    absent = await _user(db, "W1ABS")
    db.add(_ncs(net, absent))
    db.add(_check_in(net, other.callsign, user=other))
    await db.commit()
    check_in_id = (await db.execute(select(CheckIn.id).where(CheckIn.net_id == net.id))).scalar_one()

    needed = await client.get(f"/api/nets/{net.id}/ncs-needed", headers=auth_headers(owner))
    assert needed.json() == {"needed": True}

    refused = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(owner))
    assert refused.status_code == 400 and refused.json()["detail"] == NCS_NEEDED_DETAIL
    assert sent_logs == []

    closed = await client.post(f"/api/nets/{net.id}/close", json={"ncs_check_in_id": check_in_id},
                               headers=auth_headers(owner))
    assert closed.status_code == 200
    assert sent_logs == [net.id]
    assert (await net_ncs_attribution(db, net.id))[0] == other.callsign


@pytest.mark.asyncio
async def test_naming_a_station_with_no_account_credits_its_callsign(client, db, owner, sent_logs):
    net = await _net(db, owner)
    db.add(_check_in(net, "N1GST"))
    await db.commit()
    check_in_id = (await db.execute(select(CheckIn.id).where(CheckIn.net_id == net.id))).scalar_one()

    resp = await client.post(f"/api/nets/{net.id}/close", json={"ncs_check_in_id": check_in_id},
                             headers=auth_headers(owner))
    assert resp.status_code == 200
    assert (await net_ncs_attribution(db, net.id))[0] == "N1GST"


@pytest.mark.asyncio
async def test_closing_does_not_ask_when_someone_is_credited_or_nobody_came(client, db, owner, other, sent_logs):
    staffed = await _net(db, owner)
    db.add_all([_ncs(staffed, other), _check_in(staffed, other.callsign, user=other)])
    empty = await _net(db, owner)
    await db.commit()
    for net in (staffed, empty):
        assert not await ncs_needed(db, net)
        assert (await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(owner))).status_code == 200


@pytest.mark.asyncio
async def test_a_held_log_asks_before_it_is_sent(client, db, owner, other, sent_logs):
    net = await _net(db, owner)
    db.add(_check_in(net, other.callsign, user=other))
    await db.commit()
    check_in_id = (await db.execute(select(CheckIn.id).where(CheckIn.net_id == net.id))).scalar_one()
    held = await client.post(f"/api/nets/{net.id}/close", json={"hold_log": True, "ncs_check_in_id": check_in_id},
                             headers=auth_headers(owner))
    assert held.status_code == 200

    # The credit is removed while the log is held: sending asks again.
    await db.execute(NetRole.__table__.delete().where(NetRole.net_id == net.id))
    await db.commit()
    refused = await client.post(f"/api/nets/{net.id}/send-log", headers=auth_headers(owner))
    assert refused.status_code == 400 and refused.json()["detail"] == NCS_NEEDED_DETAIL
    sent = await client.post(f"/api/nets/{net.id}/send-log", json={"ncs_check_in_id": check_in_id},
                             headers=auth_headers(owner))
    assert sent.status_code == 200
    assert sent_logs == [net.id]


# ========== Auto-close ==========

@pytest.mark.asyncio
async def test_auto_close_holds_the_log_and_asks_then_sends_after_24_hours(db, owner, other, sent_logs, monkeypatch):
    asked = []

    async def _fake_ask(db, net):
        asked.append(net.id)

    monkeypatch.setattr(net_log_hold, "ask_who_ran", _fake_ask)
    net = await _net(db, owner, started_at=datetime.now(timezone.utc) - timedelta(hours=5),
                     auto_close_after_minutes=60)
    db.add(_ncs(net, await _user(db, "W1ABS")))
    db.add(CheckIn(net_id=net.id, callsign=other.callsign, name="Op", location="Here", user_id=other.id,
                   checked_in_at=datetime.now(timezone.utc) - timedelta(hours=4)))
    await db.commit()
    db.expire_all()  # SQLite hands times back naive, as production reads them

    service = NCSReminderService()
    async with _patched_session_local(db):
        await service._check_and_close_inactive_nets()
    await db.refresh(net)
    assert net.status == NetStatus.CLOSED
    assert net.log_held_since is not None and net.log_hold_send_at is not None
    assert asked == [net.id] and sent_logs == []
    assert not net_log_hold.reminder_due(net, datetime.now(timezone.utc) + timedelta(days=2))

    assert await net_log_hold.send_due_held_logs(db) == 0
    assert await net_log_hold.send_due_held_logs(db, datetime.now(timezone.utc) + timedelta(hours=25)) == 1
    await db.refresh(net)
    assert net.log_held_since is None and net.log_hold_send_at is None
    assert sent_logs == [net.id]


@pytest.mark.asyncio
async def test_auto_close_sends_as_usual_when_an_ncs_is_credited(db, owner, other, sent_logs):
    net = await _net(db, owner, started_at=datetime.now(timezone.utc) - timedelta(hours=5),
                     auto_close_after_minutes=60)
    db.add(_ncs(net, other))
    db.add(CheckIn(net_id=net.id, callsign=other.callsign, name="Op", location="Here", user_id=other.id,
                   checked_in_at=datetime.now(timezone.utc) - timedelta(hours=4)))
    await db.commit()
    db.expire_all()  # SQLite hands times back naive, as production reads them

    async with _patched_session_local(db):
        await NCSReminderService()._check_and_close_inactive_nets()
    await db.refresh(net)
    assert net.status == NetStatus.CLOSED and net.log_held_since is None
    assert sent_logs == [net.id]


@pytest.mark.asyncio
async def test_ics309_export_says_not_recorded(client, db, owner, other):
    net = await _net(db, owner, status=NetStatus.CLOSED)
    db.add_all([_ncs(net, other), _check_in(net, "K1XYZ")])
    await db.commit()
    resp = await client.get(f"/api/nets/{net.id}/export/ics309", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert NCS_NOT_RECORDED in resp.text
    assert other.callsign not in resp.text.split("K1XYZ")[0]
