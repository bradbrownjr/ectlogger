"""
Topic history CRUD (routers/templates_topics.py).

Regression: POST .../topic-history 422'd on every real request. The frontend
(TopicHistory.tsx::handleAddTopic) sends only {topic, used_date} -- template_id
is already the URL path segment -- but TopicHistoryCreate required template_id
in the body too, and the route never reads it off the body anyway (it uses the
path parameter directly). So the schema rejected the only request shape any
client could ever send. See schemas.py::TopicHistoryCreate.
"""
import pytest
from datetime import datetime, timezone

from app.models import NetTemplate
from tests.conftest import auth_headers


async def _make_template(db, owner_id: int) -> NetTemplate:
    template = NetTemplate(
        name="Test Schedule",
        owner_id=owner_id,
        schedule_type="ad_hoc",
        schedule_config="{}",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@pytest.mark.asyncio
async def test_add_topic_history_with_exact_frontend_payload(client, db, owner):
    """The payload the real frontend sends -- no template_id, no net_id --
    must be accepted, not 422 rejected."""
    template = await _make_template(db, owner.id)

    resp = await client.post(
        f"/api/templates/{template.id}/topic-history",
        json={
            "topic": "SKYWARN spotter refresher",
            "used_date": datetime.now(timezone.utc).isoformat(),
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["topic"] == "SKYWARN spotter refresher"
    assert body["template_id"] == template.id
    assert body["net_id"] is None


@pytest.mark.asyncio
async def test_added_topic_appears_in_history(client, db, owner):
    template = await _make_template(db, owner.id)

    await client.post(
        f"/api/templates/{template.id}/topic-history",
        json={"topic": "Winter storm prep", "used_date": datetime.now(timezone.utc).isoformat()},
        headers=auth_headers(owner),
    )

    resp = await client.get(f"/api/templates/{template.id}/topic-history", headers=auth_headers(owner))
    assert resp.status_code == 200
    topics = [t["topic"] for t in resp.json()]
    assert "Winter storm prep" in topics


@pytest.mark.asyncio
async def test_add_topic_history_requires_template_permission(client, db, owner, other):
    """A user with no relationship to the template still can't add to its
    history, even though the body no longer needs to name the template."""
    template = await _make_template(db, owner.id)

    resp = await client.post(
        f"/api/templates/{template.id}/topic-history",
        json={"topic": "Should be rejected", "used_date": datetime.now(timezone.utc).isoformat()},
        headers=auth_headers(other),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_add_topic_history_unknown_template_404s(client, db, owner):
    resp = await client.post(
        "/api/templates/999999/topic-history",
        json={"topic": "Orphan topic", "used_date": datetime.now(timezone.utc).isoformat()},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 404
