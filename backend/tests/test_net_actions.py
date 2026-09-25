"""
NetResponse.actions: one flag per net action, from the same rule the action
enforces (permissions.net_actions). Fixed 2026-09-25.

The toolbar and dashboard cards used to offer Close, Import, Edit, Go live,
Archive, Cancel, Delete and Email from one broad can_manage flag, which
counted schedule staff with no role on the occurrence and any NCS row
whether or not it was still active. So staff saw buttons that 403'd, a
Logger who wasn't staff could close a net but had no button, and an NCS who
stepped down kept every management button (and, through
check_net_lifecycle_permission, the power to cancel, archive and delete).
"""
import pytest

from app.models import Net, NetRole, NetStatus, NetTemplate, TemplateStaff
from tests.conftest import auth_headers


async def _template(db, owner) -> NetTemplate:
    template = NetTemplate(name="Staff Net", owner_id=owner.id, schedule_type="ad_hoc", schedule_config="{}")
    db.add(template)
    await db.flush()
    return template


async def _net(db, owner, template=None, status=NetStatus.ACTIVE) -> Net:
    net = Net(name="Test Net", owner_id=owner.id, status=status, template_id=template.id if template else None)
    db.add(net)
    await db.flush()
    return net


async def _actions(client, net, user) -> dict:
    r = await client.get(f"/api/nets/{net.id}", headers=auth_headers(user))
    assert r.status_code == 200
    return r.json()["actions"]


@pytest.mark.asyncio
async def test_staff_with_no_role_see_only_what_the_server_allows(client, db, owner, other):
    template = await _template(db, owner)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True, is_co_manager=False))
    net = await _net(db, owner, template)
    await db.commit()

    actions = await _actions(client, net, other)
    assert actions["import_check_ins"] is True
    assert actions["close"] is False
    assert actions["edit"] is False
    assert actions["lifecycle"] is False
    assert actions["claim_ncs"] is False
    # ...and the server agrees about the button it no longer shows.
    r = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(other))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_logger_who_is_not_staff_gets_the_close_button(client, db, owner, other):
    net = await _net(db, owner)
    db.add(NetRole(net_id=net.id, user_id=other.id, role="LOGGER", is_active=True))
    await db.commit()

    actions = await _actions(client, net, other)
    assert actions["close"] is True
    assert actions["edit"] is False
    r = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(other))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_stepped_down_ncs_loses_management(client, db, owner, other):
    net = await _net(db, owner)
    db.add(NetRole(net_id=net.id, user_id=other.id, role="NCS", is_active=False))
    await db.commit()

    r = await client.get(f"/api/nets/{net.id}", headers=auth_headers(other))
    body = r.json()
    assert body["can_manage"] is False
    assert body["is_owner_or_ncs"] is False
    assert not any(body["actions"].values())
    r = await client.post(f"/api/nets/{net.id}/archive", headers=auth_headers(other))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_active_ncs_can_edit_and_change_lifecycle(client, db, owner, other):
    net = await _net(db, owner)
    db.add(NetRole(net_id=net.id, user_id=other.id, role="NCS", is_active=True))
    await db.commit()

    actions = await _actions(client, net, other)
    assert actions["edit"] and actions["close"] and actions["lifecycle"]
    r = await client.put(f"/api/nets/{net.id}", json={"description": "Edited"}, headers=auth_headers(other))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_duplicate_ncs_rows_are_not_a_server_error(client, db, owner, other):
    """check_net_lifecycle_permission used scalar_one_or_none() over NetRole
    rows, and net_roles has no uniqueness constraint."""
    net = await _net(db, owner, status=NetStatus.CLOSED)
    db.add_all([
        NetRole(net_id=net.id, user_id=other.id, role="NCS", is_active=True),
        NetRole(net_id=net.id, user_id=other.id, role="NCS", is_active=True),
    ])
    await db.commit()

    r = await client.post(f"/api/nets/{net.id}/archive", headers=auth_headers(other))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_inactive_co_manager_cannot_change_lifecycle(client, db, owner, other):
    template = await _template(db, owner)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=False, is_co_manager=True))
    net = await _net(db, owner, template, status=NetStatus.CLOSED)
    await db.commit()

    assert (await _actions(client, net, other))["lifecycle"] is False
    r = await client.post(f"/api/nets/{net.id}/archive", headers=auth_headers(other))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_gets_a_regular_user_preview(client, db, owner, admin):
    net = await _net(db, owner)
    await db.commit()

    body = (await client.get(f"/api/nets/{net.id}", headers=auth_headers(admin))).json()
    assert all(body["actions"].values())
    assert not any(body["actions_as_regular_user"].values())


@pytest.mark.asyncio
async def test_non_admin_gets_no_preview(client, db, owner):
    net = await _net(db, owner)
    await db.commit()

    body = (await client.get(f"/api/nets/{net.id}", headers=auth_headers(owner))).json()
    assert body["actions_as_regular_user"] is None
    assert body["actions"]["claim_ncs"] is True


@pytest.mark.asyncio
async def test_list_carries_the_same_actions_as_the_single_net(client, db, owner, other):
    template = await _template(db, owner)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True, is_co_manager=True))
    net = await _net(db, owner, template, status=NetStatus.SCHEDULED)
    db.add(NetRole(net_id=net.id, user_id=other.id, role="LOGGER", is_active=True))
    await db.commit()

    single = await _actions(client, net, other)
    listed = (await client.get("/api/nets/", headers=auth_headers(other))).json()
    assert next(n for n in listed if n["id"] == net.id)["actions"] == single
