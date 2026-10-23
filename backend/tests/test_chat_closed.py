"""
Chat closes with the net, on the server and not only in the browser.

Chat.tsx disables the message box once a net is closed, except during the
net's "Keep chat open after closing" window. Until 2026-10-23 the server
applied no such rule, so a message could be posted to a closed net at any
time. These guard the server's copy of that rule (chat.py::chat_is_open).
"""
from datetime import datetime, timedelta, UTC

import pytest

from app.models import Net, NetStatus
from app.routers.chat import chat_is_open
from tests.conftest import auth_headers


async def _net(client, db, owner, *, status, grace=None, closed_minutes_ago=None):
    create = await client.post("/api/nets/", json={"name": "Chat Close Net"}, headers=auth_headers(owner))
    net = await db.get(Net, create.json()["id"])
    net.status = status
    net.chat_grace_period_minutes = grace
    if closed_minutes_ago is not None:
        net.closed_at = datetime.now(UTC) - timedelta(minutes=closed_minutes_ago)
    await db.commit()
    return net.id


async def _send(client, net_id, user, text="73 all"):
    return await client.post(
        f"/api/chat/nets/{net_id}/messages", json={"message": text}, headers=auth_headers(user)
    )


@pytest.mark.asyncio
async def test_active_net_takes_messages(client, db, owner):
    net_id = await _net(client, db, owner, status=NetStatus.ACTIVE)
    assert (await _send(client, net_id, owner)).status_code == 201


@pytest.mark.asyncio
async def test_closed_net_without_grace_refuses_messages(client, db, owner):
    net_id = await _net(client, db, owner, status=NetStatus.CLOSED, closed_minutes_ago=1)
    resp = await _send(client, net_id, owner)
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Chat is closed for this net"


@pytest.mark.asyncio
async def test_closed_net_takes_messages_within_grace(client, db, owner):
    net_id = await _net(client, db, owner, status=NetStatus.CLOSED, grace=30, closed_minutes_ago=10)
    assert (await _send(client, net_id, owner)).status_code == 201


@pytest.mark.asyncio
async def test_closed_net_refuses_messages_after_grace(client, db, owner):
    net_id = await _net(client, db, owner, status=NetStatus.CLOSED, grace=15, closed_minutes_ago=20)
    assert (await _send(client, net_id, owner)).status_code == 403


@pytest.mark.asyncio
async def test_edit_and_reaction_refused_after_close_but_delete_allowed(client, db, owner, other):
    net_id = await _net(client, db, owner, status=NetStatus.ACTIVE)
    mine = (await _send(client, net_id, owner, "first")).json()
    theirs = (await _send(client, net_id, other, "second")).json()

    net = await db.get(Net, net_id)
    net.status = NetStatus.CLOSED
    net.closed_at = datetime.now(UTC)
    await db.commit()

    edit = await client.put(
        f"/api/chat/nets/{net_id}/messages/{mine['id']}",
        json={"message": "rewritten later"}, headers=auth_headers(owner),
    )
    assert edit.status_code == 403
    react = await client.post(
        f"/api/chat/nets/{net_id}/messages/{theirs['id']}/reactions",
        json={"emoji": "👍"}, headers=auth_headers(owner),
    )
    assert react.status_code == 403
    # Staff can still clear spam out of a closed net's chat.
    delete = await client.delete(
        f"/api/chat/nets/{net_id}/messages/{mine['id']}", headers=auth_headers(owner)
    )
    assert delete.status_code == 204


def test_archived_net_chat_is_closed_even_within_grace():
    net = Net(status=NetStatus.ARCHIVED, chat_grace_period_minutes=60, closed_at=datetime.now(UTC))
    assert chat_is_open(net) is False


def test_naive_closed_at_is_treated_as_utc():
    # SQLite hands back naive datetimes; they're stored as UTC.
    closed = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5)
    net = Net(status=NetStatus.CLOSED, chat_grace_period_minutes=15, closed_at=closed)
    assert chat_is_open(net) is True
