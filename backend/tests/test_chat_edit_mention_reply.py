"""
Chat edit / @mention / reply behavior.

The rules worth guarding here are the ones a future refactor could quietly
break without any test failing elsewhere:

- editing is own-messages-only, with no admin override (unlike delete), since
  an admin rewriting a station's words misattributes them in the net log;
- @mentions only resolve against stations actually checked into that net, so
  an unknown @token stays plain text instead of erroring or matching a
  stranger;
- a reply always tags the quoted message's author, and never tags the sender
  back to themselves.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.models import CheckIn, StationStatus
from tests.conftest import auth_headers


async def _net_with_roster(client, db, owner, members):
    """A net whose chat roster is `members` (each checked in with an account)."""
    create = await client.post("/api/nets/", json={"name": "Chat Feature Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    for user in members:
        db.add(CheckIn(
            net_id=net_id, user_id=user.id, callsign=user.callsign,
            name="", location="", status=StationStatus.CHECKED_IN,
        ))
    await db.commit()
    return net_id


async def _post(client, net_id, user, **body):
    resp = await client.post(
        f"/api/chat/nets/{net_id}/messages", json=body, headers=auth_headers(user)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_edit_overwrites_text_and_stamps_edited_at(client, db, owner):
    net_id = await _net_with_roster(client, db, owner, [owner])
    message = await _post(client, net_id, owner, message="freq is 146.52")
    assert message["edited_at"] is None

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.put(
            f"/api/chat/nets/{net_id}/messages/{message['id']}",
            json={"message": "freq is 146.520"},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 200
        payload = mock_broadcast.call_args[0][0]
        assert payload["type"] == "chat_message_edited"
        assert payload["data"]["message"] == "freq is 146.520"
        assert payload["data"]["edited_at"] is not None

    edited = resp.json()
    assert edited["message"] == "freq is 146.520"
    assert edited["edited_at"] is not None

    listed = await client.get(f"/api/chat/nets/{net_id}/messages", headers=auth_headers(owner))
    assert [m["message"] for m in listed.json()] == ["freq is 146.520"]


@pytest.mark.asyncio
async def test_admin_cannot_edit_another_stations_message(client, db, owner, admin):
    net_id = await _net_with_roster(client, db, owner, [owner])
    message = await _post(client, net_id, owner, message="original wording")

    resp = await client.put(
        f"/api/chat/nets/{net_id}/messages/{message['id']}",
        json={"message": "rewritten by an admin"},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 403

    # Delete still allows the admin override it always had.
    resp = await client.delete(
        f"/api/chat/nets/{net_id}/messages/{message['id']}", headers=auth_headers(admin)
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_mentions_resolve_only_against_the_checked_in_roster(client, db, owner, other):
    net_id = await _net_with_roster(client, db, owner, [owner, other])

    message = await _post(client, net_id, owner, message=f"@{other.callsign.lower()} and @NOBODY copy?")

    assert message["mentioned_user_ids"] == [other.id]


@pytest.mark.asyncio
async def test_edit_re_resolves_mentions(client, db, owner, other):
    net_id = await _net_with_roster(client, db, owner, [owner, other])
    message = await _post(client, net_id, owner, message=f"@{other.callsign} copy?")
    assert message["mentioned_user_ids"] == [other.id]

    resp = await client.put(
        f"/api/chat/nets/{net_id}/messages/{message['id']}",
        json={"message": "never mind"},
        headers=auth_headers(owner),
    )
    assert resp.json()["mentioned_user_ids"] == []


@pytest.mark.asyncio
async def test_reply_carries_a_preview_and_tags_the_quoted_author(client, db, owner, other):
    net_id = await _net_with_roster(client, db, owner, [owner, other])
    original = await _post(client, net_id, other, message="Audio was good on that last check-in")

    reply = await _post(client, net_id, owner, message="agreed", reply_to_message_id=original["id"])

    assert reply["reply_to_message_id"] == original["id"]
    assert reply["reply_to"]["callsign"] == other.callsign
    assert reply["reply_to"]["message"] == "Audio was good on that last check-in"
    # Replying always tags the quoted author, even though "agreed" names nobody.
    assert reply["mentioned_user_ids"] == [other.id]


@pytest.mark.asyncio
async def test_reply_to_own_message_tags_nobody(client, db, owner):
    net_id = await _net_with_roster(client, db, owner, [owner])
    original = await _post(client, net_id, owner, message="net is now taking check-ins")

    reply = await _post(client, net_id, owner, message="correction: 1930 local", reply_to_message_id=original["id"])

    assert reply["mentioned_user_ids"] == []


@pytest.mark.asyncio
async def test_reply_survives_the_quoted_message_being_deleted(client, db, owner, other):
    net_id = await _net_with_roster(client, db, owner, [owner, other])
    original = await _post(client, net_id, other, message="original")
    reply = await _post(client, net_id, owner, message="quoting you", reply_to_message_id=original["id"])

    resp = await client.delete(
        f"/api/chat/nets/{net_id}/messages/{original['id']}", headers=auth_headers(other)
    )
    assert resp.status_code == 204

    listed = await client.get(f"/api/chat/nets/{net_id}/messages", headers=auth_headers(owner))
    remaining = [m for m in listed.json() if m["id"] == reply["id"]]
    assert len(remaining) == 1
    assert remaining[0]["message"] == "quoting you"
    assert remaining[0]["reply_to"] is None


@pytest.mark.asyncio
async def test_reply_must_quote_a_message_in_the_same_net(client, db, owner):
    net_a = await _net_with_roster(client, db, owner, [owner])
    net_b = await _net_with_roster(client, db, owner, [owner])
    in_a = await _post(client, net_a, owner, message="net A traffic")

    resp = await client.post(
        f"/api/chat/nets/{net_b}/messages",
        json={"message": "quoting the wrong net", "reply_to_message_id": in_a["id"]},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_guest_list_redacts_the_quoted_preview(client, db, owner, other):
    """The reply preview is message text too -- redacting the parent but not
    its copy inside a reply would hand a guest exactly what the parent's
    redaction removed."""
    net_id = await _net_with_roster(client, db, owner, [owner, other])
    original = await _post(client, net_id, other, message="reach me at ncs@example.com")
    await _post(client, net_id, owner, message="copy", reply_to_message_id=original["id"])

    listed = await client.get(f"/api/chat/nets/{net_id}/messages")
    assert listed.status_code == 200
    body = listed.text
    assert "ncs@example.com" not in body
