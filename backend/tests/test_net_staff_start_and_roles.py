"""
Regression tests for the two staff-access defects fixed 2026-09-19.

1. Starting a net ignored the NCS rotation. routers/nets_core.start_net had
   its own TemplateStaff query instead of going through
   permissions.is_active_template_staff, which also counts an active
   NCSRotationMember. So Start was the one staff decision in the app where
   being in a schedule's rotation was not enough -- the tier that exists
   specifically to say who runs which week could not start the week that was
   theirs unless somebody had also added them to the staff list.

2. The Roles button was offered to staff the backend refuses. NetView
   rendered it on can_manage, which includes plain template staff, while
   assign_net_role/remove_net_role enforce can_manage_net_roles, which
   additionally requires an active NCS or LOGGER role on that specific
   occurrence. NetResponse.can_manage_roles now carries the real condition
   and the button reads that instead.
"""
import pytest

from app.models import (
    Frequency,
    NCSRotationMember,
    NetRole,
    NetTemplate,
    TemplateStaff,
    net_template_frequencies,
)
from tests.conftest import auth_headers


async def _template(db, owner_id: int) -> NetTemplate:
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()
    template = NetTemplate(
        name="Staff Net",
        owner_id=owner_id,
        schedule_type="ad_hoc",
        schedule_config="{}",
    )
    db.add(template)
    await db.flush()
    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    return template


async def _net_from(client, owner, template_id: int) -> int:
    create = await client.post(
        f"/api/templates/{template_id}/create-net", headers=auth_headers(owner)
    )
    return create.json()["id"]


# ---------------------------------------------------------------------------
# Starting a net
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rotation_member_can_start_the_net(client, db, owner, other):
    """`other` is in the schedule's NCS rotation and is NOT on its staff list.
    Everywhere else in the app those two tiers grant the same access; Start
    was the exception, and refused them."""
    template = await _template(db, owner.id)
    db.add(NCSRotationMember(template_id=template.id, user_id=other.id, position=1, is_active=True))
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    response = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_plain_active_staff_can_still_start_the_net(client, db, owner, other):
    """The path that already worked has to keep working."""
    template = await _template(db, owner.id)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True, is_co_manager=False))
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    response = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_inactive_rotation_member_cannot_start_the_net(client, db, owner, other):
    """Routing through the shared helper must not widen access to someone who
    was taken off the rotation."""
    template = await _template(db, owner.id)
    db.add(NCSRotationMember(template_id=template.id, user_id=other.id, position=1, is_active=False))
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    response = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_unrelated_user_cannot_start_the_net(client, db, owner, other):
    template = await _template(db, owner.id)
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    response = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# The Roles button's condition
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_staff_with_no_role_yet_are_not_offered_the_roles_dialog(client, db, owner, other):
    """Staff membership alone is not enough for assign_net_role, so
    can_manage_roles has to be False even though can_manage is True."""
    template = await _template(db, owner.id)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True, is_co_manager=False))
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    net = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(other))).json()

    assert net["can_manage"] is True
    assert net["can_manage_roles"] is False

    # And the endpoint the button would call agrees.
    refused = await client.post(
        f"/api/nets/{net_id}/roles?user_id={owner.id}&role=LOGGER", headers=auth_headers(other)
    )
    assert refused.status_code == 403


@pytest.mark.asyncio
async def test_staff_holding_an_active_ncs_role_are_offered_it(client, db, owner, other):
    template = await _template(db, owner.id)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True, is_co_manager=False))
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    db.add(NetRole(net_id=net_id, user_id=other.id, role="NCS", is_active=True))
    await db.commit()

    net = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(other))).json()
    assert net["can_manage_roles"] is True

    allowed = await client.post(
        f"/api/nets/{net_id}/roles?user_id={owner.id}&role=LOGGER", headers=auth_headers(other)
    )
    assert allowed.status_code == 200


@pytest.mark.asyncio
async def test_owner_is_always_offered_it(client, db, owner):
    template = await _template(db, owner.id)
    await db.commit()

    net_id = await _net_from(client, owner, template.id)
    net = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))).json()
    assert net["can_manage_roles"] is True
