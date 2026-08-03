"""
Endpoint tests for routers/traffic_log.py: append/list the chain-of-custody
log, admin delete-last, and GET /traffic/inbox. See
TRAFFIC-HANDLING-DESIGN.md section 3.3.

Unit-level coverage of app/traffic/log.py's own cache-update/disposition
logic already lives in test_traffic_log.py; these tests exercise the HTTP
layer built on top of it (permissions, sequencing, the admin delete-last
guard, and the inbox query).
"""
import pytest
from datetime import datetime

from sqlalchemy import select

from tests.conftest import auth_headers
from app.models import Form, FormDefinition, User, UserRole


async def _definition(db) -> FormDefinition:
    result = await db.execute(select(FormDefinition).where(FormDefinition.form_type == "RADIOGRAM"))
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    definition = FormDefinition(
        form_type="RADIOGRAM", title="ARRL Radiogram", version="3.1", output_format="nts_radiogram"
    )
    db.add(definition)
    await db.commit()
    await db.refresh(definition)
    return definition


async def _draft_form(db, definition, **kwargs) -> Form:
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        field_values="{}",
        **kwargs,
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)
    return form


async def _stranger(db) -> User:
    user = User(email="stranger-log@test.com", callsign="KC1LOG", role=UserRole.USER, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Full chain across all six TrafficAction values, disposition asserted at
# each step. ORIGINATED/RELAYED/SERVICED/DELIVERED on one form (a message
# that moves on and is delivered), RECEIVED/CANCELLED on a second (an
# inbound piece of traffic that gets killed) -- DELIVERED and CANCELLED are
# both terminal so they can't share one chain.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chain_originated_relayed_serviced_delivered(client, db, owner, other):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "originated"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    assert resp.json()["sequence"] == 1

    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "pending"
    assert get_resp.json()["held_by_user_id"] == owner.id

    resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "relayed", "handed_to_user_id": other.id, "path_name": "Pine Tree Net"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    assert resp.json()["sequence"] == 2

    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "relayed"
    assert get_resp.json()["held_by_user_id"] == other.id

    resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "serviced", "note": "Reported delivery status to origin"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201
    assert resp.json()["sequence"] == 3

    # SERVICED is an annotation only -- disposition and holder unchanged.
    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "relayed"
    assert get_resp.json()["held_by_user_id"] == other.id

    resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "delivered"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201
    assert resp.json()["sequence"] == 4

    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "delivered"
    assert get_resp.json()["held_by_user_id"] is None

    log_resp = await client.get(f"/api/traffic/forms/{form.id}/log", headers=auth_headers(owner))
    assert log_resp.status_code == 200
    actions = [e["action"] for e in log_resp.json()]
    assert actions == ["originated", "relayed", "serviced", "delivered"]


@pytest.mark.asyncio
async def test_chain_received_then_cancelled(client, db, owner):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "received"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201

    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "pending"
    assert get_resp.json()["held_by_user_id"] == owner.id

    resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "cancelled", "note": "HXB expired"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201

    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "cancelled"
    assert get_resp.json()["held_by_user_id"] is None


# ---------------------------------------------------------------------------
# Inbox membership transitions (TRAFFIC-HANDLING-DESIGN.md section 2.5)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_inbox_received_moves_it_in_and_relayed_to_known_moves_the_holder(client, db, owner, other):
    """The literal inbox query (TRAFFIC-HANDLING-DESIGN.md section 2.5) is
    WHERE held_by_user_id = :me AND last_action IN ('originated', 'received')
    -- a RELAYED entry moves the cached holder immediately (verified here via
    GET /forms/{id}) but does not itself surface in anyone's /inbox, because
    a relay is the sender's assertion, not the recipient's acknowledgment.
    The recipient's own inbox entry appears only once they log their own
    RECEIVED, which is the normal real-world sequence (the on-air relay
    happens, then the receiving operator logs what they copied)."""
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "received"}, headers=auth_headers(owner)
    )
    inbox = await client.get("/api/traffic/inbox", headers=auth_headers(owner))
    assert inbox.json()["count"] == 1
    assert inbox.json()["items"][0]["id"] == form.id

    other_inbox = await client.get("/api/traffic/inbox", headers=auth_headers(other))
    assert other_inbox.json()["count"] == 0

    await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "relayed", "handed_to_user_id": other.id},
        headers=auth_headers(owner),
    )

    owner_inbox = await client.get("/api/traffic/inbox", headers=auth_headers(owner))
    assert owner_inbox.json()["count"] == 0
    other_inbox = await client.get("/api/traffic/inbox", headers=auth_headers(other))
    assert other_inbox.json()["count"] == 0

    # The cache moved to other.id immediately, even though it's not yet
    # reflected in other's /inbox (last_action is still "relayed").
    detail = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert detail.json()["held_by_user_id"] == other.id
    assert detail.json()["last_action"] == "relayed"

    # Once "other" logs their own receipt, it enters their inbox.
    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "received"}, headers=auth_headers(other)
    )
    other_inbox = await client.get("/api/traffic/inbox", headers=auth_headers(other))
    assert other_inbox.json()["count"] == 1
    assert other_inbox.json()["items"][0]["id"] == form.id


@pytest.mark.asyncio
async def test_inbox_relayed_to_unknown_clears_it(client, db, owner):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "received"}, headers=auth_headers(owner)
    )
    assert (await client.get("/api/traffic/inbox", headers=auth_headers(owner))).json()["count"] == 1

    await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "relayed", "handed_to": "W1AW", "path_name": "Pine Tree Net"},
        headers=auth_headers(owner),
    )
    assert (await client.get("/api/traffic/inbox", headers=auth_headers(owner))).json()["count"] == 0

    detail = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert detail.json()["held_by_user_id"] is None


@pytest.mark.asyncio
async def test_inbox_delivered_clears_it(client, db, owner):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "received"}, headers=auth_headers(owner)
    )
    assert (await client.get("/api/traffic/inbox", headers=auth_headers(owner))).json()["count"] == 1

    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "delivered"}, headers=auth_headers(owner)
    )
    assert (await client.get("/api/traffic/inbox", headers=auth_headers(owner))).json()["count"] == 0


@pytest.mark.asyncio
async def test_inbox_cancelled_clears_it(client, db, owner):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "received"}, headers=auth_headers(owner)
    )
    assert (await client.get("/api/traffic/inbox", headers=auth_headers(owner))).json()["count"] == 1

    await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "cancelled"}, headers=auth_headers(owner)
    )
    assert (await client.get("/api/traffic/inbox", headers=auth_headers(owner))).json()["count"] == 0


# ---------------------------------------------------------------------------
# Admin delete-last-only
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_delete_only_the_last_entry(client, db, owner, admin):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    first = await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "originated"}, headers=auth_headers(owner)
    )
    second = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "relayed", "handed_to": "W1AW"},
        headers=auth_headers(owner),
    )
    first_id = first.json()["id"]
    second_id = second.json()["id"]

    # Deleting the earlier (non-last) entry must 4xx -- the chain is
    # append-only by design; this endpoint exists only for genuine
    # mis-clicks on the most recent hop.
    denied = await client.delete(
        f"/api/traffic/forms/{form.id}/log/{first_id}", headers=auth_headers(admin)
    )
    assert 400 <= denied.status_code < 500

    ok = await client.delete(
        f"/api/traffic/forms/{form.id}/log/{second_id}", headers=auth_headers(admin)
    )
    assert ok.status_code == 204

    log_resp = await client.get(f"/api/traffic/forms/{form.id}/log", headers=auth_headers(owner))
    assert [e["id"] for e in log_resp.json()] == [first_id]

    # The cache must have been rebuilt from the remaining log (recompute_form_cache),
    # not left stale from the deleted RELAYED entry.
    get_resp = await client.get(f"/api/traffic/forms/{form.id}", headers=auth_headers(owner))
    assert get_resp.json()["disposition"] == "pending"
    assert get_resp.json()["held_by_user_id"] == owner.id


@pytest.mark.asyncio
async def test_non_admin_cannot_delete_log_entry(client, db, owner):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id)

    entry = await client.post(
        f"/api/traffic/forms/{form.id}/log", json={"action": "originated"}, headers=auth_headers(owner)
    )
    entry_id = entry.json()["id"]

    resp = await client.delete(
        f"/api/traffic/forms/{form.id}/log/{entry_id}", headers=auth_headers(owner)
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Permission denial for a user with no view access, on both append and list
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_append_and_list_denied_to_uninvolved_stranger(client, db, owner):
    definition = await _definition(db)
    form = await _draft_form(db, definition, created_by_id=owner.id, net_id=None)
    stranger = await _stranger(db)

    append_resp = await client.post(
        f"/api/traffic/forms/{form.id}/log",
        json={"action": "originated"},
        headers=auth_headers(stranger),
    )
    assert append_resp.status_code == 403

    list_resp = await client.get(
        f"/api/traffic/forms/{form.id}/log", headers=auth_headers(stranger)
    )
    assert list_resp.status_code == 403
