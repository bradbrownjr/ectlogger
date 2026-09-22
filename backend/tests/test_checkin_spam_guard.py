"""
Check-in spam guard: a submitted field value that looks like a URL or email
address is rejected server-side for whichever fields an admin has
spam_guard_enabled on (Admin > Check-in Fields), on by default.

Enforced in routers/check_ins.py, not only as CheckInFormDialog.tsx's inline
warning, because a client-side nudge never stops a deliberate spammer -- a
raw API call skips the frontend entirely. Prompted by a real report
(2026-09-21): a station put "YOUTUBE.COM/@NB9D" in the check-in Location
field, which then reached a served agency's ICS-309 email unfiltered.
"""
import pytest

from app.models import FieldDefinition, Net
from tests.conftest import auth_headers


async def _active_net(client, owner):
    create = await client.post("/api/nets/", json={"name": "Spam Guard Test Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


async def _seed_location_field(db, spam_guard_enabled: bool = True):
    db.add(FieldDefinition(
        name="location", label="Location", field_type="text",
        is_builtin=True, spam_guard_enabled=spam_guard_enabled,
    ))
    await db.commit()


@pytest.mark.asyncio
async def test_spammy_location_rejected_on_create(client, db, owner):
    await _seed_location_field(db)
    net_id = await _active_net(client, owner)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "NB9D", "location": "YOUTUBE.COM/@NB9D"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400
    assert "link or email" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_normal_location_accepted(client, db, owner):
    await _seed_location_field(db)
    net_id = await _active_net(client, owner)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "W1TEST", "location": "Manchester, NH"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_spam_guard_can_be_turned_off_per_field(client, db, owner):
    await _seed_location_field(db, spam_guard_enabled=False)
    net_id = await _active_net(client, owner)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "NB9D", "location": "YOUTUBE.COM/@NB9D"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_spammy_location_rejected_on_update(client, db, owner):
    await _seed_location_field(db)
    net_id = await _active_net(client, owner)

    create = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "W1TEST", "location": "Manchester, NH"},
        headers=auth_headers(owner),
    )
    check_in_id = create.json()["id"]

    resp = await client.put(
        f"/api/check-ins/check-ins/{check_in_id}",
        json={"location": "YOUTUBE.COM/@NB9D"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400
    assert "link or email" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_no_field_definitions_means_no_guard(client, db, owner):
    """A field the admin catalog doesn't know about yet (fresh install, or a
    custom field never listed) can't be guarded -- must fail open, not
    reject every check-in because the lookup found nothing."""
    net_id = await _active_net(client, owner)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "NB9D", "location": "YOUTUBE.COM/@NB9D"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
