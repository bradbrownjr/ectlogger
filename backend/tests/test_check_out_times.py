"""
When each check-in row was checked out (routers/check_ins.py::update_check_in).

Net 137, the 2026-10-24 SET: W1MTW left Windham High School at 09:38 and
was logged from Home at 10:02, but every Windham High School row read
checked out at 11:57. The final check-out restamped rows that were already
out, the row net control clicked never got a time at all, and a station
set back to Checked in kept the time of an earlier check-out. Two-way
contacts (site_coverage.check_in_contacts) and the ICS-214 both read these
times to know where a station was.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import CheckIn
from tests.conftest import auth_headers


async def _net(client, owner):
    net_id = (await client.post("/api/nets/", json={"name": "Checkout Net"}, headers=auth_headers(owner))).json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


async def _check_in(client, owner, net_id, **fields):
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": "W1MTW", **fields}, headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _status(client, owner, check_in_id, status):
    resp = await client.put(f"/api/check-ins/check-ins/{check_in_id}", json={"status": status}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _rows(db, ids):
    rows = (await db.execute(
        select(CheckIn).where(CheckIn.id.in_(ids)).execution_options(populate_existing=True)
    )).scalars().all()
    return {r.id: r for r in rows}


@pytest.mark.asyncio
async def test_the_row_checked_out_gets_a_time(client, db, owner):
    net_id = await _net(client, owner)
    row = await _check_in(client, owner, net_id)
    body = await _status(client, owner, row, "checked_out")
    assert body["checked_out_at"] is not None


@pytest.mark.asyncio
async def test_a_row_already_out_keeps_its_own_time(client, db, owner):
    net_id = await _net(client, owner)
    school = await _check_in(client, owner, net_id, operating_position="Windham High School")
    await _status(client, owner, school, "checked_out")
    left_school = datetime(2026, 10, 24, 13, 38, tzinfo=timezone.utc)
    (await _rows(db, [school]))[school].checked_out_at = left_school
    await db.commit()

    home = await _check_in(client, owner, net_id, operating_position="Home")
    await _status(client, owner, home, "checked_out")
    rows = await _rows(db, [school, home])
    at = rows[school].checked_out_at
    assert (at if at.tzinfo else at.replace(tzinfo=timezone.utc)) == left_school
    assert rows[home].checked_out_at is not None


@pytest.mark.asyncio
async def test_back_on_the_air_clears_the_check_out_time(client, db, owner):
    net_id = await _net(client, owner)
    row = await _check_in(client, owner, net_id)
    await _status(client, owner, row, "checked_out")
    body = await _status(client, owner, row, "checked_in")
    assert body["checked_out_at"] is None


@pytest.mark.asyncio
async def test_live_siblings_are_checked_out_with_the_row(client, db, owner):
    net_id = await _net(client, owner)
    first = await _check_in(client, owner, net_id)
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": "W1MTW", "location": "Somewhere else"},
        headers=auth_headers(owner),
    )
    second = resp.json()["id"] if resp.status_code == 201 else None
    await _status(client, owner, first, "checked_out")
    rows = await _rows(db, [first] + ([second] if second else []))
    assert all(r.status.value == "checked_out" and r.checked_out_at is not None for r in rows.values())
