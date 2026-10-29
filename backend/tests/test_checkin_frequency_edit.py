"""
Fixing a check-in's frequency, and checking a station in In person
(routers/check_ins.py::_settle_frequencies and create_check_in).

Net 137, the 2026-10-24 SET: six check-ins were logged without a frequency
on a multi-frequency net and had to be fixed in the database, and an
arrival at the CCEMA Bunker couldn't be logged without one because the
server always filled in net control's frequency.
"""
import json

import pytest
from sqlalchemy import select

from app.models import CheckIn, Frequency, net_frequencies
from tests.conftest import auth_headers


async def _net_with_frequencies(client, db, owner, count):
    create = await client.post("/api/nets/", json={"name": "Frequency Test Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    freqs = [Frequency(frequency=f"147.{i:03d}", mode="FM") for i in range(count)]
    db.add_all(freqs)
    await db.flush()
    for f in freqs:
        await db.execute(net_frequencies.insert().values(net_id=net_id, frequency_id=f.id))
    await db.commit()
    return net_id, [f.id for f in freqs]


async def _check_in(client, owner, net_id, **fields):
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "W1TEST", **fields},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _edit(client, owner, check_in_id, **fields):
    return await client.put(f"/api/check-ins/check-ins/{check_in_id}", json=fields, headers=auth_headers(owner))


@pytest.mark.asyncio
async def test_frequency_can_be_set_after_check_in(client, db, owner):
    net_id, (a, b) = await _net_with_frequencies(client, db, owner, 2)
    row = await _check_in(client, owner, net_id)
    assert row["frequency_id"] is None

    resp = await _edit(client, owner, row["id"], frequency_id=b)
    assert resp.status_code == 200, resp.text
    assert resp.json()["frequency_id"] == b
    assert resp.json()["available_frequencies"] == [b]


@pytest.mark.asyncio
async def test_changed_frequency_joins_the_reachable_list(client, db, owner):
    net_id, (a, b) = await _net_with_frequencies(client, db, owner, 2)
    row = await _check_in(client, owner, net_id, frequency_id=a, available_frequency_ids=[a])

    resp = await _edit(client, owner, row["id"], frequency_id=b)
    assert resp.json()["frequency_id"] == b
    assert resp.json()["available_frequencies"] == [a, b]


@pytest.mark.asyncio
async def test_frequency_must_be_the_nets_own(client, db, owner):
    net_id, (a, b) = await _net_with_frequencies(client, db, owner, 2)
    stranger = Frequency(frequency="446.000", mode="FM")
    db.add(stranger)
    await db.commit()
    row = await _check_in(client, owner, net_id)

    resp = await _edit(client, owner, row["id"], frequency_id=stranger.id)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_a_frequency_since_removed_does_not_block_other_edits(client, db, owner):
    net_id, (a, b) = await _net_with_frequencies(client, db, owner, 2)
    row = await _check_in(client, owner, net_id, frequency_id=a, available_frequency_ids=[a, b])
    await db.execute(net_frequencies.delete().where(net_frequencies.c.frequency_id == b))
    await db.commit()

    # The inline edit sends the reachable list back as it was
    resp = await _edit(client, owner, row["id"], name="Pat", available_frequency_ids=[a, b])
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_in_person_check_in_has_no_frequency(client, db, owner):
    net_id, (only,) = await _net_with_frequencies(client, db, owner, 1)
    row = await _check_in(client, owner, net_id, status="in_person", frequency_id=only, available_frequency_ids=[only])
    assert row["status"] == "in_person"
    assert row["frequency_id"] is None
    assert row["available_frequencies"] in (None, [])


@pytest.mark.asyncio
async def test_changing_to_in_person_clears_the_frequency(client, db, owner):
    net_id, (a, b) = await _net_with_frequencies(client, db, owner, 2)
    row = await _check_in(client, owner, net_id, frequency_id=a, available_frequency_ids=[a, b])

    resp = await _edit(client, owner, row["id"], status="in_person")
    assert resp.status_code == 200, resp.text
    assert resp.json()["frequency_id"] is None
    assert resp.json()["available_frequencies"] == []


@pytest.mark.asyncio
async def test_in_person_cannot_be_given_a_frequency(client, db, owner):
    net_id, (a, b) = await _net_with_frequencies(client, db, owner, 2)
    row = await _check_in(client, owner, net_id, status="in_person")

    resp = await _edit(client, owner, row["id"], frequency_id=a)
    assert resp.status_code == 400
    # Changing the status in the same edit is fine
    resp = await _edit(client, owner, row["id"], status="checked_in", frequency_id=a)
    assert resp.status_code == 200, resp.text
    assert resp.json()["frequency_id"] == a


@pytest.mark.asyncio
async def test_leaving_in_person_on_a_one_frequency_net_puts_the_station_on_it(client, db, owner):
    net_id, (only,) = await _net_with_frequencies(client, db, owner, 1)
    row = await _check_in(client, owner, net_id, status="in_person")

    resp = await _edit(client, owner, row["id"], status="checked_in")
    assert resp.json()["frequency_id"] == only
    assert resp.json()["available_frequencies"] == [only]


@pytest.mark.asyncio
async def test_checking_out_from_in_person_adds_no_frequency(client, db, owner):
    net_id, (only,) = await _net_with_frequencies(client, db, owner, 1)
    row = await _check_in(client, owner, net_id, status="in_person")

    resp = await _edit(client, owner, row["id"], status="checked_out")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    saved = (await db.execute(select(CheckIn).where(CheckIn.id == row["id"]))).scalar_one()
    assert saved.frequency_id is None
    assert json.loads(saved.available_frequencies or "[]") == []
