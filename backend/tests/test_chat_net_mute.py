"""
Net-wide (staff-applied) chat mute behavior.

Companion to test_chat_mute.py, which covers the personal-mute half of the
"Chat Moderation" roadmap item. This file covers the staff-set half: a
single, net-wide mute state per (net, muted user) that any active NCS/Logger
can apply or lift -- not a personal preference. Rules worth guarding here:

- only the net owner, a global admin, or an active NCS/Logger on this net may
  apply or lift a net-wide mute; anyone else gets 403;
- it's a single canonical state, not per-applier: a *different* staff member
  than the one who applied it can still lift it;
- re-applying updates who most recently applied it (the audit trail reflects
  the latest moderation action, not just the first);
- any authenticated participant (staff or not) can *read* the current
  net-wide mute list, since everyone's client needs it to filter their own
  view -- only applying/lifting is staff-gated;
- you cannot mute yourself, even as staff;
- it never touches the stored messages table -- the net's log/export is
  unaffected by a live mute.
- the mute is enforced at broadcast time, not just hidden client-side: a
  net-wide-muted author's message is echoed back to their own connection
  only and never sent to any other connection at all, same mechanism the
  guest-PII-redaction path already uses (see test_guest_pii_redaction.py).
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.models import NetRole
from tests.conftest import auth_headers


async def _make_net(db, owner):
    from app.models import Net
    net = Net(name="Net Mute Test", owner_id=owner.id, status="active")
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


async def _grant_role(db, net_id: int, user_id: int, role: str):
    db.add(NetRole(net_id=net_id, user_id=user_id, role=role, is_active=True))
    await db.commit()


@pytest.mark.asyncio
async def test_owner_can_net_wide_mute_and_it_is_audited(client, db, owner, other):
    net = await _make_net(db, owner)

    resp = await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["muted_user_id"] == other.id
    assert body["callsign"] == other.callsign
    assert body["applied_by_user_id"] == owner.id
    assert body["applied_by_callsign"] == owner.callsign


@pytest.mark.asyncio
async def test_non_staff_cannot_apply_or_lift_net_wide_mute(client, db, owner, other):
    net = await _make_net(db, owner)

    resp = await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": owner.id},
        headers=auth_headers(other),
    )
    assert resp.status_code == 403

    # Even lifting a mute that doesn't exist yet is gated the same way.
    resp2 = await client.delete(f"/api/chat/nets/{net.id}/net-mutes/{owner.id}", headers=auth_headers(other))
    assert resp2.status_code == 403


@pytest.mark.asyncio
async def test_active_ncs_or_logger_non_owner_can_apply(client, db, owner, other):
    net = await _make_net(db, owner)
    logger_user = await _make_extra_user(db, "KC1LOG")
    await _grant_role(db, net.id, logger_user.id, "LOGGER")

    resp = await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(logger_user),
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_any_active_staff_can_lift_a_mute_someone_else_applied(client, db, owner, other):
    net = await _make_net(db, owner)
    ncs_user = await _make_extra_user(db, "KC1NCS")
    logger_user = await _make_extra_user(db, "KC1LOG")
    await _grant_role(db, net.id, ncs_user.id, "NCS")
    await _grant_role(db, net.id, logger_user.id, "LOGGER")

    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(ncs_user),
    )

    # A different staff member (never applied it themselves) can still lift it.
    resp = await client.delete(f"/api/chat/nets/{net.id}/net-mutes/{other.id}", headers=auth_headers(logger_user))
    assert resp.status_code == 204

    listed = await client.get(f"/api/chat/nets/{net.id}/net-mutes", headers=auth_headers(owner))
    assert listed.json() == []


@pytest.mark.asyncio
async def test_reapplying_updates_who_applied_it_most_recently(client, db, owner, other):
    net = await _make_net(db, owner)
    ncs_user = await _make_extra_user(db, "KC1NCS")
    await _grant_role(db, net.id, ncs_user.id, "NCS")

    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )
    resp = await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(ncs_user),
    )
    assert resp.status_code == 201
    assert resp.json()["applied_by_user_id"] == ncs_user.id

    listed = await client.get(f"/api/chat/nets/{net.id}/net-mutes", headers=auth_headers(owner))
    assert len(listed.json()) == 1
    assert listed.json()[0]["applied_by_user_id"] == ncs_user.id


@pytest.mark.asyncio
async def test_any_authenticated_participant_can_read_the_mute_list(client, db, owner, other):
    """Even a non-staff viewer needs to read this list -- their own client has
    to filter net-wide-muted authors out of its own view too."""
    net = await _make_net(db, owner)
    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    resp = await client.get(f"/api/chat/nets/{net.id}/net-mutes", headers=auth_headers(other))
    assert resp.status_code == 200
    assert [m["muted_user_id"] for m in resp.json()] == [other.id]


@pytest.mark.asyncio
async def test_staff_cannot_mute_self(client, db, owner):
    net = await _make_net(db, owner)
    resp = await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": owner.id},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_net_wide_mute_unknown_user_404s(client, db, owner):
    net = await _make_net(db, owner)
    resp = await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": 999999},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_net_wide_mute_does_not_touch_the_stored_log(client, db, owner, other):
    """A net-wide mute is a live-view filter, not a delete -- the message
    stays in what GET /messages (and, transitively, any export) returns."""
    net = await _make_net(db, owner)

    sent = await client.post(
        f"/api/chat/nets/{net.id}/messages",
        json={"message": "hello from other"},
        headers=auth_headers(other),
    )
    assert sent.status_code == 201

    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    messages = await client.get(f"/api/chat/nets/{net.id}/messages", headers=auth_headers(owner))
    assert messages.status_code == 200
    assert any(m["message"] == "hello from other" for m in messages.json())


@pytest.mark.asyncio
async def test_message_from_net_muted_author_broadcasts_only_to_self(client, db, owner, other):
    """The core server-enforcement guarantee: once `other` is net-wide muted,
    their next message is echoed back to their own connection only -- the
    broadcast call must restrict delivery, not just leave it to the client
    to hide what already arrived."""
    net = await _make_net(db, owner)
    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/chat/nets/{net.id}/messages",
            json={"message": "spam spam spam"},
            headers=auth_headers(other),
        )
        assert resp.status_code == 201
        mock_broadcast.assert_called_once()
        assert mock_broadcast.call_args.kwargs["only_for_user_ids"] == {other.id}


@pytest.mark.asyncio
async def test_message_from_unmuted_author_broadcasts_to_everyone(client, db, owner, other):
    """Sanity check on the same mechanism: an ordinary, unmuted message must
    not be restricted at all (only_for_user_ids stays None)."""
    net = await _make_net(db, owner)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/chat/nets/{net.id}/messages",
            json={"message": "hello"},
            headers=auth_headers(other),
        )
        assert resp.status_code == 201
        mock_broadcast.assert_called_once()
        assert mock_broadcast.call_args.kwargs["only_for_user_ids"] is None


@pytest.mark.asyncio
async def test_edit_from_net_muted_author_also_broadcasts_only_to_self(client, db, owner, other):
    """Edits go through the same _broadcast_chat_message path as sends -- an
    edit must not leak a muted author's rewritten text to other viewers
    either."""
    net = await _make_net(db, owner)
    sent = await client.post(
        f"/api/chat/nets/{net.id}/messages",
        json={"message": "before"},
        headers=auth_headers(other),
    )
    message_id = sent.json()["id"]

    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.put(
            f"/api/chat/nets/{net.id}/messages/{message_id}",
            json={"message": "after"},
            headers=auth_headers(other),
        )
        assert resp.status_code == 200
        mock_broadcast.assert_called_once()
        assert mock_broadcast.call_args.kwargs["only_for_user_ids"] == {other.id}


@pytest.mark.asyncio
async def test_connection_manager_only_for_user_ids_skips_other_connections():
    """Unit-level check on ConnectionManager.broadcast itself: a connection
    outside only_for_user_ids receives nothing at all for that call, not
    even the guest_message fallback."""
    from app.main import ConnectionManager

    manager = ConnectionManager()
    author_ws = AsyncMock()
    other_ws = AsyncMock()
    guest_ws = AsyncMock()
    net_id = 999999
    manager.active_connections[net_id] = [(author_ws, 1), (other_ws, 2), (guest_ws, 0)]

    await manager.broadcast(
        {"type": "chat_message", "data": {"message": "hidden"}},
        net_id,
        guest_message={"type": "chat_message", "data": {"message": "[redacted]"}},
        only_for_user_ids={1},
    )

    author_ws.send_json.assert_called_once()
    other_ws.send_json.assert_not_called()
    guest_ws.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_applying_a_net_mute_pushes_a_live_update(client, db, owner, other):
    """Without this broadcast, an already-open tab's own mute banner/manage
    list would only learn about a new net-wide mute on its next page load --
    caught during live verification on beta, since the message-suppression
    broadcast alone gives no signal that the mute *list* itself changed."""
    net = await _make_net(db, owner)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/chat/nets/{net.id}/net-mutes",
            json={"muted_user_id": other.id},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201
        mock_broadcast.assert_called_once()
        call = mock_broadcast.call_args.args[0]
        assert call["type"] == "chat_net_mute_changed"
        assert call["data"]["muted_user_id"] == other.id
        assert call["data"]["active"] is True


@pytest.mark.asyncio
async def test_lifting_a_net_mute_pushes_a_live_update(client, db, owner, other):
    net = await _make_net(db, owner)
    await client.post(
        f"/api/chat/nets/{net.id}/net-mutes",
        json={"muted_user_id": other.id},
        headers=auth_headers(owner),
    )

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.delete(f"/api/chat/nets/{net.id}/net-mutes/{other.id}", headers=auth_headers(owner))
        assert resp.status_code == 204
        mock_broadcast.assert_called_once()
        call = mock_broadcast.call_args.args[0]
        assert call["type"] == "chat_net_mute_changed"
        assert call["data"]["muted_user_id"] == other.id
        assert call["data"]["active"] is False


@pytest.mark.asyncio
async def test_lifting_a_mute_that_was_never_set_does_not_broadcast(client, db, owner):
    """No-op unmute (already covered for the 204 itself) must also not fire a
    spurious live-update event."""
    net = await _make_net(db, owner)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.delete(f"/api/chat/nets/{net.id}/net-mutes/999999", headers=auth_headers(owner))
        assert resp.status_code == 204
        mock_broadcast.assert_not_called()


async def _make_extra_user(db, callsign: str):
    from app.models import User, UserRole
    user = User(email=f"{callsign.lower()}@test.com", callsign=callsign, role=UserRole.USER, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
