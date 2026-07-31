"""
Guest (unauthenticated) read-access regression tests.

ECTLogger's design intent is that unauthenticated viewers ("guests" — scanner
listeners, potential hams, anyone following a net without an account) can see
check-ins and chat with no login required (this is what nets' own scripts
invite people to do: "follow along with the check-ins and chat"). Poll
results, topic-of-week responses, and field-definitions carry the same kind
of already-public data (callsigns/names already shown in the check-in list,
or plain field-label config with no user data at all) but required auth
anyway — an oversight caught during a full functional-test pass across
NCS/Logger/standard-user/guest roles. Fixed by dropping the unused
current_user dependency from each, matching check_ins.py/chat.py's existing
pattern for public GET endpoints.
"""
import pytest
from tests.conftest import auth_headers


async def _active_net_with_poll_and_topic(client, owner):
    create = await client.post(
        "/api/nets/",
        json={
            "name": "Public Endpoints Test Net",
            "poll_enabled": True,
            "poll_question": "How is the weather?",
            "topic_of_week_enabled": True,
            "topic_of_week_prompt": "What's your favorite band?",
        },
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


@pytest.mark.asyncio
async def test_guest_can_view_poll_responses(client, owner):
    net_id = await _active_net_with_poll_and_topic(client, owner)
    resp = await client.get(f"/api/nets/{net_id}/poll-responses")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_guest_can_view_poll_results(client, owner):
    net_id = await _active_net_with_poll_and_topic(client, owner)
    resp = await client.get(f"/api/nets/{net_id}/poll-results")
    assert resp.status_code == 200
    assert resp.json()["question"] == "How is the weather?"


@pytest.mark.asyncio
async def test_guest_can_view_topic_responses(client, owner):
    net_id = await _active_net_with_poll_and_topic(client, owner)
    resp = await client.get(f"/api/nets/{net_id}/topic-responses")
    assert resp.status_code == 200
    assert resp.json()["prompt"] == "What's your favorite band?"


@pytest.mark.asyncio
async def test_guest_can_view_field_definitions(client):
    resp = await client.get("/api/settings/fields")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_guest_can_view_default_theme(client):
    resp = await client.get("/api/settings/theme")
    assert resp.status_code == 200
    assert resp.json() == {
        "default_theme": "ectlogger-blue",
        "default_color_mode": "light",
        "custom_theme": None,
        "custom_logo_url": None,
    }


@pytest.mark.asyncio
async def test_non_admin_cannot_upload_logo(client, owner):
    resp = await client.post(
        "/api/settings/logo",
        files={"file": ("logo.png", b"not a real image", "image/png")},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_upload_and_delete_svg_logo(client, admin):
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    resp = await client.post(
        "/api/settings/logo",
        files={"file": ("logo.svg", svg_bytes, "image/svg+xml")},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["custom_logo_url"] == "/api/logo/instance-logo.svg"

    theme_resp = await client.get("/api/settings/theme")
    assert theme_resp.json()["custom_logo_url"] == "/api/logo/instance-logo.svg"

    del_resp = await client.delete("/api/settings/logo", headers=auth_headers(admin))
    assert del_resp.status_code == 200
    assert del_resp.json()["custom_logo_url"] is None
