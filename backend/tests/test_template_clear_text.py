"""
Emptying a text field in Edit Schedule clears it. The form sends null for an
emptied field, and the update used to skip nulls, so the ME Dirigo Net's
Default Topic Prompt could not be deleted (2026-11-12).
"""
from app.routers.templates_core import CLEARABLE_TEXT_FIELDS
from tests.conftest import auth_headers
from tests.test_templates import _make_template


async def test_null_clears_each_text_field(client, db, owner):
    template = await _make_template(db, owner.id)
    headers = auth_headers(owner)
    url = f"/api/templates/{template.id}"

    filled = {field: "https://example.com/x" for field in CLEARABLE_TEXT_FIELDS}
    assert (await client.put(url, json=filled, headers=headers)).status_code == 200

    r = await client.put(url, json={field: None for field in CLEARABLE_TEXT_FIELDS}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    for field in CLEARABLE_TEXT_FIELDS:
        assert body.get(field) is None, field


async def test_omitted_field_is_left_alone(client, db, owner):
    template = await _make_template(db, owner.id)
    headers = auth_headers(owner)
    url = f"/api/templates/{template.id}"

    await client.put(url, json={"topic_of_week_prompt": "Favorite radio?"}, headers=headers)
    r = await client.put(url, json={"script": "Welcome"}, headers=headers)
    assert r.json()["topic_of_week_prompt"] == "Favorite radio?"
