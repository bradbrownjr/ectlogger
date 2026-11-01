"""
Stations from a paper log, added after the net closed.

Brad, 2026-10-30 (SET net 137): Andy KC1WGO was at the CCEMA Bunker but never
got logged, and nobody wrote down when he arrived. A check-in added to a held
log (Net.log_held_since) is logged at the time written down, or as "Not
recorded" (CheckIn.time_not_recorded): stamped with the net's close so it
sorts last, printed with no time, and left out of time-based statistics.
Until then it was stamped with the moment it was typed in, after the net.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models import CheckIn, Net, NetStatus
from app.services import net_closure
from app.services.ics309_log import build_ics309_rows
from tests.conftest import auth_headers

START = datetime(2026, 10, 24, 11, 0, tzinfo=timezone.utc)
CLOSE = datetime(2026, 10, 24, 16, 40, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def no_closing_email(monkeypatch):
    async def _fake_send(db, net):
        return None
    monkeypatch.setattr(net_closure, "send_net_log", _fake_send)


async def _held_net(client, db, owner):
    create = await client.post("/api/nets/", json={"name": "SET"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    net = await db.get(Net, net_id)
    net.status = NetStatus.ACTIVE
    await db.commit()
    await client.post(f"/api/nets/{net_id}/close", json={"hold_log": True}, headers=auth_headers(owner))
    net = await db.get(Net, net_id)
    await db.refresh(net)
    net.started_at = START
    net.closed_at = CLOSE
    await db.commit()
    return net_id


async def _add(client, owner, net_id, **body):
    return await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": "KC1WGO", **body}, headers=auth_headers(owner)
    )


async def _row(db, check_in_id):
    row = await db.get(CheckIn, check_in_id)
    await db.refresh(row)
    return row


@pytest.mark.asyncio
async def test_paper_log_time_is_kept(client, db, owner):
    net_id = await _held_net(client, db, owner)
    resp = await _add(client, owner, net_id, checked_in_at="2026-10-24T12:15:00Z")
    assert resp.status_code == 201, resp.text
    assert resp.json()["time_not_recorded"] is False
    row = await _row(db, resp.json()["id"])
    assert row.checked_in_at.replace(tzinfo=timezone.utc) == datetime(2026, 10, 24, 12, 15, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_no_time_is_not_recorded_and_sorts_last(client, db, owner):
    net_id = await _held_net(client, db, owner)
    resp = await _add(client, owner, net_id, status="in_person")
    assert resp.status_code == 201, resp.text
    assert resp.json()["time_not_recorded"] is True
    row = await _row(db, resp.json()["id"])
    assert row.checked_in_at.replace(tzinfo=timezone.utc) == CLOSE


@pytest.mark.asyncio
async def test_time_outside_the_net_is_refused(client, db, owner):
    net_id = await _held_net(client, db, owner)
    early = await _add(client, owner, net_id, checked_in_at="2026-10-24T09:00:00Z")
    late = await _add(client, owner, net_id, checked_in_at="2026-10-24T18:00:00Z")
    assert early.status_code == 400
    assert late.status_code == 400


@pytest.mark.asyncio
async def test_running_net_ignores_a_given_time(client, db, owner):
    create = await client.post("/api/nets/", json={"name": "Live"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    net = await db.get(Net, net_id)
    net.status = NetStatus.ACTIVE
    await db.commit()
    resp = await _add(client, owner, net_id, checked_in_at="2020-01-01T00:00:00Z")
    assert resp.status_code == 201
    row = await _row(db, resp.json()["id"])
    assert row.checked_in_at.year != 2020
    assert row.time_not_recorded is False


@pytest.mark.asyncio
async def test_ics309_prints_no_time_and_puts_it_last(client, db, owner):
    net_id = await _held_net(client, db, owner)
    await _add(client, owner, net_id)
    await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "W1AW", "checked_in_at": "2026-10-24T12:00:00Z"},
        headers=auth_headers(owner),
    )
    rows = (await db.execute(CheckIn.__table__.select().where(CheckIn.net_id == net_id))).all()
    check_ins = [await db.get(CheckIn, r.id) for r in rows]
    log = build_ics309_rows(check_ins=check_ins, chat_messages=[], started_at=START.replace(tzinfo=None), closed_at=CLOSE.replace(tzinfo=None))
    check_in_rows = [r for r in log if r['message'].startswith('Check-in')]
    assert [r['from_station'] for r in check_in_rows] == ['W1AW', 'KC1WGO']
    assert check_in_rows[-1]['time'] == ''


@pytest.mark.asyncio
async def test_statistics_timeline_leaves_it_out(client, db, owner):
    net_id = await _held_net(client, db, owner)
    await _add(client, owner, net_id)
    resp = await client.get(f"/api/statistics/nets/{net_id}", headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["check_ins_timeline"] == []
