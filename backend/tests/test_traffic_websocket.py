"""
Tests for the traffic_logged WebSocket broadcast (routers/traffic_forms.py::
create_form). See TRAFFIC-HANDLING-DESIGN.md section 3.6: it fires only for
a form filed on a net (net_id is set) -- a standalone form has no net
connection group to notify. Follows the same patch("app.main.manager.
broadcast", ...) pattern as test_chat.py.
"""
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import auth_headers
from app.traffic.definitions import upsert_form_definitions

RADIOGRAM_VALUES = {
    "number": "1",
    "precedence": "R - Routine",
    "station_of_origin": "KC1OWN",
    "place_of_origin": "Portland ME",
    "to_name": "Jim Kutsch",
    "to_callsign": "KY2D",
    "to_address": "123 Main St",
    "to_city_state": "Newington CT",
    "to_zip": "06111",
    "text": "Test message",
    "signature": "Brad",
}


@pytest.mark.asyncio
async def test_traffic_logged_broadcasts_when_net_id_set(client, db, owner):
    await upsert_form_definitions(db)
    net_resp = await client.post("/api/nets/", json={"name": "WS Traffic Net"}, headers=auth_headers(owner))
    net_id = net_resp.json()["id"]

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            "/api/traffic/forms",
            json={"form_type": "RADIOGRAM", "net_id": net_id, "field_values": RADIOGRAM_VALUES},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201

        mock_broadcast.assert_called_once()
        payload, broadcast_net_id = mock_broadcast.call_args[0]
        assert payload["type"] == "traffic_logged"
        assert payload["data"]["net_id"] == net_id
        assert payload["data"]["form_id"] == resp.json()["id"]
        assert broadcast_net_id == net_id


@pytest.mark.asyncio
async def test_traffic_logged_not_broadcast_for_standalone_form(client, db, owner):
    await upsert_form_definitions(db)

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            "/api/traffic/forms",
            json={"form_type": "RADIOGRAM", "field_values": RADIOGRAM_VALUES},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201
        mock_broadcast.assert_not_called()
