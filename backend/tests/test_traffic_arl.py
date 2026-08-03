"""
Tests for GET /traffic/arl-messages (app/traffic/arl.py, routers/traffic_definitions.py).

Covers the catalog shape the ArlMessagePicker relies on (num/word/group/text/
blanks), that both groups are present, and that a regular (non-admin) user
can read it, per TRAFFIC-HANDLING-DESIGN.md section 3.1.
"""
import pytest

from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_arl_messages_requires_auth(client):
    resp = await client.get("/api/traffic/arl-messages")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_arl_messages_returns_catalog_shape(client, owner):
    resp = await client.get("/api/traffic/arl-messages", headers=auth_headers(owner))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0

    groups = {entry["group"] for entry in data}
    assert "emergency" in groups
    assert "routine" in groups

    first = data[0]
    assert set(["num", "word", "group", "text", "blanks"]).issubset(first.keys())
    assert isinstance(first["blanks"], list)

    # ARL 3 ("Am in _____ hospital...") has exactly one blank -- a concrete
    # spot-check that fill-in-the-blank messages round-trip correctly.
    arl_3 = next(entry for entry in data if entry["num"] == 3 and entry["group"] == "emergency")
    assert arl_3["blanks"] == ["Hospital name"]


@pytest.mark.asyncio
async def test_arl_messages_not_shadowed_by_form_type_route(client, owner):
    """The literal path /arl-messages must resolve here, not fall through to
    GET /definitions/{form_type} with form_type="arl-messages"."""
    resp = await client.get("/api/traffic/arl-messages", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
