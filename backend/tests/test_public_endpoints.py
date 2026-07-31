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
    assert resp.json() == {"default_theme": "ectlogger-blue"}
