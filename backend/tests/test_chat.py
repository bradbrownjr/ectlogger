"""
Chat regression test: the WebSocket broadcast payload for a newly sent
message must include avatar_url. It didn't (2026-07) — the REST fetch path
(ChatMessageResponse.from_orm, used for GET /messages on page load) computed
avatar_url correctly, but the manually-built broadcast dict in create_message
omitted it entirely. Since the frontend appends live WebSocket messages
directly to its message list with no transformation, this meant avatars
were only ever visible on messages present when the page loaded, not on
anything sent afterward — until a full refresh re-fetched history.
"""
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_chat_message_broadcast_includes_avatar_url(client, owner):
    create = await client.post("/api/nets/", json={"name": "Chat Test Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/chat/nets/{net_id}/messages",
            json={"message": "hello"},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201

        mock_broadcast.assert_called_once()
        broadcast_payload = mock_broadcast.call_args[0][0]
        assert broadcast_payload["type"] == "chat_message"
        assert "avatar_url" in broadcast_payload["data"]

    # The REST response (used for the sender's own optimistic append) should
    # carry the same field, whether or not it resolves to a real URL.
    data = resp.json()
    assert "avatar_url" in data
