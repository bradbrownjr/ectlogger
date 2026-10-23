"""
Who may delete, merge, or hand over a schedule: its manager, an active
co-manager, or an admin (templates_core.may_administer_schedule).

The server applied that rule in several hand-written copies while the
Schedule page offered Merge and Delete to the manager and admins only, so a
co-manager the server allowed never saw either button. The page now reads
NetTemplateResponse.is_owner_or_co_manager, which these tests pin.
"""
import pytest

from app.models import NetTemplate, TemplateStaff
from tests.conftest import auth_headers


async def _template(db, owner_id, name, day):
    template = NetTemplate(
        name=name, owner_id=owner_id, schedule_type="weekly",
        schedule_config=f'{{"day_of_week": {day}, "time": "19:00"}}',
    )
    db.add(template)
    await db.commit()
    return template


async def _flag(client, user, template_id):
    resp = await client.get(f"/api/templates/{template_id}", headers=auth_headers(user))
    assert resp.status_code == 200, resp.text
    return resp.json()["is_owner_or_co_manager"]


@pytest.mark.asyncio
async def test_flag_is_set_for_manager_and_co_manager_only(client, db, owner, other, admin):
    template = await _template(db, owner.id, "Tuesday Net", 2)
    assert await _flag(client, owner, template.id) is True
    # Plain staff can run the schedule but not destroy it.
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True, is_co_manager=False))
    await db.commit()
    assert await _flag(client, other, template.id) is False
    # No admin bypass in the flag; the page adds the admin case itself.
    assert await _flag(client, admin, template.id) is False

    staff = (await db.execute(
        TemplateStaff.__table__.select().where(TemplateStaff.user_id == other.id)
    )).first()
    row = await db.get(TemplateStaff, staff.id)
    row.is_co_manager = True
    await db.commit()
    assert await _flag(client, other, template.id) is True


@pytest.mark.asyncio
async def test_co_manager_can_preview_a_merge_and_conflicts_name_their_source(client, db, owner, other):
    target = await _template(db, owner.id, "Tuesday Net", 2)
    source = await _template(db, owner.id, "Thursday Net", 4)
    for t in (target, source):
        db.add(TemplateStaff(template_id=t.id, user_id=other.id, is_active=True, is_co_manager=True))
    await db.commit()

    resp = await client.post(
        "/api/templates/merge/preview",
        json={"target_template_id": target.id, "source_template_ids": [source.id]},
        headers=auth_headers(other),
    )
    assert resp.status_code == 200, resp.text
    conflicts = resp.json()["conflicts"]
    assert any(c["field"] == "Schedule config" for c in conflicts)
    assert {c["source_template_id"] for c in conflicts} == {source.id}


@pytest.mark.asyncio
async def test_plain_staff_cannot_merge_or_delete(client, db, owner, other):
    target = await _template(db, owner.id, "Tuesday Net", 2)
    source = await _template(db, owner.id, "Thursday Net", 4)
    for t in (target, source):
        db.add(TemplateStaff(template_id=t.id, user_id=other.id, is_active=True, is_co_manager=False))
    await db.commit()

    merge = await client.post(
        "/api/templates/merge/preview",
        json={"target_template_id": target.id, "source_template_ids": [source.id]},
        headers=auth_headers(other),
    )
    assert merge.status_code == 403
    delete = await client.delete(f"/api/templates/{source.id}", headers=auth_headers(other))
    assert delete.status_code == 403

