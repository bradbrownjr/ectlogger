"""
The schedule's manager manages every net from that schedule, and a corrected
callsign follows the new callsign's account.

Both reported by N1KWG, Weekly Greater Manchester NH ARES Net:

- 2026-10-05 (net 109): a staff member clicked Create Net on the schedule a
  week early, which made that staff member the net's owner. N1KWG, the
  schedule's manager but not on its own staff list, then had no controls on
  the net at all. Ownership stays with whoever created it (it is also the
  "nets you ran" credit); the schedule's manager gains management instead.
- 2026-10-12 (net 124): a station logged as KB1JCZ and corrected to KB1JCX
  stayed a guest row, so it could not be given a role from the list.
"""
import pytest
from sqlalchemy import select

from app.models import (
    CheckIn,
    Frequency,
    Net,
    NetRole,
    NetTemplate,
    TemplateStaff,
    User,
    UserRole,
    net_template_frequencies,
)
from app.permissions import is_eligible_for_logger_self_grant, is_eligible_for_ncs_auto_grant
from tests.conftest import auth_headers


async def _schedule_with_staff(db, manager_id: int, staff_id: int) -> NetTemplate:
    """A schedule whose manager is NOT on its own staff list, as N1KWG's is."""
    freq = Frequency(frequency="443.400", mode="FM", description="Test Repeater")
    db.add(freq)
    await db.flush()
    template = NetTemplate(
        name="Manager Test Net",
        owner_id=manager_id,
        schedule_type="ad_hoc",
        schedule_config="{}",
    )
    db.add(template)
    await db.flush()
    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    db.add(TemplateStaff(template_id=template.id, user_id=staff_id, is_active=True, is_co_manager=False))
    await db.commit()
    await db.refresh(template)
    return template


async def _outsider(db) -> User:
    user = User(email="outsider@test.com", callsign="KC1OUT", role=UserRole.USER, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _staff_created_net(client, db, manager, staff) -> int:
    """Net 109's shape: created by hand by a staff member, not the manager."""
    template = await _schedule_with_staff(db, manager.id, staff.id)
    resp = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(staff))
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ========== SCHEDULE MANAGER ON A STAFF-CREATED NET ==========

@pytest.mark.asyncio
async def test_staff_created_net_keeps_its_creator_as_owner(client, db, owner, other):
    """Ownership is the 'nets you ran' credit, so it must not move."""
    other_id = other.id
    net_id = await _staff_created_net(client, db, owner, other)
    db.expire_all()
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    assert net.owner_id == other_id


@pytest.mark.asyncio
async def test_schedule_manager_gets_every_net_action(client, db, owner, other):
    net_id = await _staff_created_net(client, db, owner, other)
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))
    assert resp.status_code == 200
    actions = resp.json()["actions"]
    for action in ("edit", "start", "close", "lifecycle", "claim_ncs", "manage_roles", "email_subscribers"):
        assert actions[action] is True, action


@pytest.mark.asyncio
async def test_outsider_still_gets_no_net_actions(client, db, owner, other):
    outsider = await _outsider(db)
    net_id = await _staff_created_net(client, db, owner, other)
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(outsider))
    actions = resp.json()["actions"]
    assert not any(actions.values()), actions


@pytest.mark.asyncio
async def test_schedule_manager_can_start_assign_roles_and_close(client, db, owner, other):
    outsider = await _outsider(db)
    net_id = await _staff_created_net(client, db, owner, other)
    headers = auth_headers(owner)

    assert (await client.post(f"/api/nets/{net_id}/start", headers=headers)).status_code == 200

    # The Roles dialog, which on net 109 only the staff member who created
    # the net could use.
    assign = await client.post(
        f"/api/nets/{net_id}/roles", params={"user_id": outsider.id, "role": "LOGGER"}, headers=headers
    )
    assert assign.status_code == 200, assign.text

    assert (await client.post(f"/api/nets/{net_id}/close", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_schedule_manager_can_self_check_in_as_ncs_with_self_check_in_off(client, db, owner, other):
    """Net 109 also had self check-in turned off, so the manager could not
    even check in. As net staff, they can now take NCS by checking in."""
    owner_id, owner_callsign = owner.id, owner.callsign
    net_id = await _staff_created_net(client, db, owner, other)
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    net.self_checkin_enabled = False
    await db.commit()

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": owner_callsign, "self_role_choice": "ncs"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text

    db.expire_all()
    roles = (await db.execute(
        select(NetRole.user_id).where(
            NetRole.net_id == net_id, NetRole.role == "NCS", NetRole.is_active == True  # noqa: E712
        )
    )).scalars().all()
    assert owner_id in roles


@pytest.mark.asyncio
async def test_schedule_manager_is_eligible_for_self_grant(client, db, owner, other):
    net_id = await _staff_created_net(client, db, owner, other)
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    assert await is_eligible_for_ncs_auto_grant(db, net, owner.id)
    assert await is_eligible_for_logger_self_grant(db, net, owner.id)


@pytest.mark.asyncio
async def test_outsider_still_blocked_when_self_check_in_off(client, db, owner, other):
    outsider = await _outsider(db)
    net_id = await _staff_created_net(client, db, owner, other)
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    net.self_checkin_enabled = False
    await db.commit()

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": outsider.callsign, "self_role_choice": "ncs"},
        headers=auth_headers(outsider),
    )
    assert resp.status_code == 403


# ========== CORRECTED CALLSIGN RELINKS THE ACCOUNT ==========

async def _started_net_with_guest_row(client, db, owner, other, typo: str) -> tuple:
    template = await _schedule_with_staff(db, owner.id, other.id)
    create = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": typo}, headers=auth_headers(owner)
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user_id"] is None
    return net_id, resp.json()["id"]


@pytest.mark.asyncio
async def test_corrected_callsign_links_the_account(client, db, owner, other):
    """Net 124: logged with a typo, corrected by staff, then given a role."""
    net_id, check_in_id = await _started_net_with_guest_row(client, db, owner, other, "KC1OTX")

    resp = await client.put(
        f"/api/check-ins/check-ins/{check_in_id}", json={"callsign": other.callsign}, headers=auth_headers(owner)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["user_id"] == other.id


@pytest.mark.asyncio
async def test_callsign_corrected_to_a_guest_drops_the_wrong_link(client, db, owner, other):
    """A typo that happened to match someone else's account must not stay
    credited to that account once the callsign is fixed."""
    template = await _schedule_with_staff(db, owner.id, other.id)
    create = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": other.callsign}, headers=auth_headers(owner)
    )
    assert resp.json()["user_id"] == other.id

    fixed = await client.put(
        f"/api/check-ins/check-ins/{resp.json()['id']}", json={"callsign": "KC1GST"}, headers=auth_headers(owner)
    )
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["user_id"] is None


@pytest.mark.asyncio
async def test_unchanged_callsign_keeps_its_link(client, db, owner, other):
    """The inline editor resends the callsign on every save; an edit to some
    other field must leave the account link alone."""
    template = await _schedule_with_staff(db, owner.id, other.id)
    create = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": other.callsign}, headers=auth_headers(owner)
    )
    edited = await client.put(
        f"/api/check-ins/check-ins/{resp.json()['id']}",
        json={"callsign": other.callsign, "location": "Manchester, NH"},
        headers=auth_headers(owner),
    )
    assert edited.json()["user_id"] == other.id


@pytest.mark.asyncio
async def test_own_row_edit_never_detaches_the_operator(client, db, owner, other):
    """An operator changing their own row (a portable suffix, say) keeps it."""
    other_id = other.id
    template = await _schedule_with_staff(db, owner.id, other.id)
    create = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": other.callsign}, headers=auth_headers(other)
    )
    assert resp.json()["user_id"] == other.id

    edited = await client.put(
        f"/api/check-ins/check-ins/{resp.json()['id']}", json={"callsign": "KC1OTH/M"}, headers=auth_headers(other)
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["user_id"] == other_id
    db.expire_all()
    row = (await db.execute(select(CheckIn).where(CheckIn.id == resp.json()["id"]))).scalar_one()
    assert row.user_id == other_id
