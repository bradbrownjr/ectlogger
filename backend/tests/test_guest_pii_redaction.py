"""
Guest-viewing regression tests.

app.ectlogger.us/nets/{id} is meant to be viewable by a prospective user with
no account — check-ins, chat, and the ICS-309 report all already served
guests except for two endpoints that still required a token unconditionally
(GET .../can-hear-reports and GET .../export/ics309), plus the frontend's
axios interceptor treating ANY 401 as a dead session and hard-redirecting
to /login even for a guest who was never logged in. These tests pin the
fix: both endpoints now serve guests, and free text visible to guests
(check-in fields, chat messages, the ICS-309 log built from them) is
scrubbed of anything that looks like an email or phone number, while an
authenticated viewer always sees the original text.
"""
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers


async def _active_net(client, owner):
    create = await client.post(
        "/api/nets/",
        json={"name": "Guest View Test Net"},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


@pytest.mark.asyncio
async def test_can_hear_reports_readable_by_guest(client, owner):
    net_id = await _active_net(client, owner)
    resp = await client.get(f"/api/nets/{net_id}/can-hear-reports")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_check_in_list_redacts_contact_info_for_guest_not_for_owner(client, owner):
    net_id = await _active_net(client, owner)
    await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={
            "callsign": "W1TEST",
            "notes": "call me at 555-123-4567 if you need anything",
            "feedback": "reach me at ops@example.com after the net",
        },
        headers=auth_headers(owner),
    )

    guest_resp = await client.get(f"/api/check-ins/nets/{net_id}/check-ins")
    assert guest_resp.status_code == 200
    guest_row = next(r for r in guest_resp.json() if r["callsign"] == "W1TEST")
    assert "555-123-4567" not in guest_row["notes"]
    assert "[redacted]" in guest_row["notes"]
    assert "ops@example.com" not in guest_row["feedback"]

    owner_resp = await client.get(
        f"/api/check-ins/nets/{net_id}/check-ins", headers=auth_headers(owner)
    )
    owner_row = next(r for r in owner_resp.json() if r["callsign"] == "W1TEST")
    assert "555-123-4567" in owner_row["notes"]
    assert "ops@example.com" in owner_row["feedback"]


@pytest.mark.asyncio
async def test_check_in_custom_fields_redacted_for_guest(client, owner):
    net_id = await _active_net(client, owner)
    await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={
            "callsign": "W1TEST",
            "custom_fields": {"Contact": "text 603-555-0100 before 9pm"},
        },
        headers=auth_headers(owner),
    )

    guest_resp = await client.get(f"/api/check-ins/nets/{net_id}/check-ins")
    guest_row = next(r for r in guest_resp.json() if r["callsign"] == "W1TEST")
    assert "603-555-0100" not in guest_row["custom_fields"]["Contact"]


@pytest.mark.asyncio
async def test_chat_message_list_redacts_for_guest_not_for_owner(client, owner):
    net_id = await _active_net(client, owner)
    await client.post(
        f"/api/chat/nets/{net_id}/messages",
        json={"message": "email me at ops@example.com"},
        headers=auth_headers(owner),
    )

    guest_resp = await client.get(f"/api/chat/nets/{net_id}/messages")
    guest_msg = next(m for m in guest_resp.json() if not m["is_system"])
    assert "ops@example.com" not in guest_msg["message"]

    owner_resp = await client.get(
        f"/api/chat/nets/{net_id}/messages", headers=auth_headers(owner)
    )
    owner_msg = next(m for m in owner_resp.json() if not m["is_system"])
    assert "ops@example.com" in owner_msg["message"]


@pytest.mark.asyncio
async def test_chat_broadcast_sends_redacted_copy_to_guests(client, owner):
    net_id = await _active_net(client, owner)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/chat/nets/{net_id}/messages",
            json={"message": "call 555-123-4567"},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201

        mock_broadcast.assert_called_once()
        call = mock_broadcast.call_args
        raw_message = call.args[0]
        guest_message = call.kwargs["guest_message"]
        assert raw_message["data"]["message"] == "call 555-123-4567"
        assert "555-123-4567" not in guest_message["data"]["message"]


@pytest.mark.asyncio
async def test_ics309_export_readable_by_guest_and_redacted(client, owner):
    net_id = await _active_net(client, owner)
    await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "W1TEST", "location": "call 555-123-4567 for directions"},
        headers=auth_headers(owner),
    )
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))

    guest_resp = await client.get(f"/api/nets/{net_id}/export/ics309", params={"format": "json"})
    assert guest_resp.status_code == 200
    guest_data = guest_resp.json()
    joined = " ".join(e["message"] for e in guest_data["entries"])
    assert "555-123-4567" not in joined

    owner_resp = await client.get(
        f"/api/nets/{net_id}/export/ics309",
        params={"format": "json"},
        headers=auth_headers(owner),
    )
    owner_data = owner_resp.json()
    owner_joined = " ".join(e["message"] for e in owner_data["entries"])
    assert "555-123-4567" in owner_joined
