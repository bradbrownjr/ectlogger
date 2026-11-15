"""
Reaction chips name who chose them.

`reactors` (emoji -> callsigns) sits beside `reactions` (emoji -> user_ids) in
the REST response and the chat_reaction broadcast, in the same order, built by
one helper so the two cannot disagree. A label is a callsign, else the
placeholder chat already shows for an author; never an email address.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.models import User, UserRole
from tests.conftest import auth_headers

EMOJI = "👍"


async def _net_and_message(client, owner):
    net_id = (await client.post(
        "/api/nets/", json={"name": "Reactor Net"}, headers=auth_headers(owner)
    )).json()["id"]
    resp = await client.post(
        f"/api/chat/nets/{net_id}/messages", json={"message": "hello"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 201, resp.text
    return net_id, resp.json()["id"]


async def _react(client, net_id, message_id, user):
    resp = await client.post(
        f"/api/chat/nets/{net_id}/messages/{message_id}/reactions",
        json={"emoji": EMOJI}, headers=auth_headers(user),
    )
    assert resp.status_code == 204, resp.text


async def _listed(client, net_id, viewer=None):
    headers = auth_headers(viewer) if viewer else {}
    resp = await client.get(f"/api/chat/nets/{net_id}/messages", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()[0]


@pytest.mark.asyncio
async def test_get_messages_reactors_match_reactions_order(client, db, owner, other, admin):
    net_id, message_id = await _net_and_message(client, owner)
    await _react(client, net_id, message_id, other)
    await _react(client, net_id, message_id, admin)

    message = await _listed(client, net_id, owner)
    assert message["reactions"][EMOJI] == [other.id, admin.id]
    assert message["reactors"][EMOJI] == ["KC1OTH", "KC1ADM"]


@pytest.mark.asyncio
async def test_broadcast_carries_reactors(client, db, owner, other):
    net_id, message_id = await _net_and_message(client, owner)
    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        await _react(client, net_id, message_id, other)
        payload = mock_broadcast.call_args[0][0]
    assert payload["type"] == "chat_reaction"
    assert payload["data"]["message_id"] == message_id
    assert payload["data"]["reactions"] == {EMOJI: [other.id]}
    assert payload["data"]["reactors"] == {EMOJI: ["KC1OTH"]}


@pytest.mark.asyncio
async def test_account_without_callsign_gets_placeholder_never_email(client, db, owner):
    nameless = User(email="secret@test.com", callsign=None, role=UserRole.USER, is_active=True)
    db.add(nameless)
    await db.commit()
    await db.refresh(nameless)
    net_id, message_id = await _net_and_message(client, owner)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        await _react(client, net_id, message_id, nameless)
        broadcast_labels = mock_broadcast.call_args[0][0]["data"]["reactors"][EMOJI]

    listed_labels = (await _listed(client, net_id))["reactors"][EMOJI]  # signed out
    assert broadcast_labels == listed_labels == ["Unknown"]
    assert "@" not in str(listed_labels)


@pytest.mark.asyncio
async def test_toggling_off_removes_the_label(client, db, owner, other, admin):
    net_id, message_id = await _net_and_message(client, owner)
    await _react(client, net_id, message_id, other)
    await _react(client, net_id, message_id, admin)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        await _react(client, net_id, message_id, other)
        data = mock_broadcast.call_args[0][0]["data"]
    assert data["reactions"] == {EMOJI: [admin.id]}
    assert data["reactors"] == {EMOJI: ["KC1ADM"]}

    message = await _listed(client, net_id, owner)
    assert message["reactors"] == {EMOJI: ["KC1ADM"]}
