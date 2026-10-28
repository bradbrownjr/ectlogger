"""
Check In as Participant does what it says (routers/check_ins.py).

N1KWG, net 142 (2026-10-26): the rotation had assigned him NCS the day
before, so the lobby prompt offered Check In as NCS or as Participant. The
Participant button sent 'standard', which grants nothing and removed
nothing, so it would have left him NCS anyway. It now sends 'participant',
which steps the person down from an NCS or Logger role they hold on that
net. 'standard' stays the do-nothing default, so a recheck or a client
that omits the field never strips anyone's role.
"""
import pytest
from sqlalchemy import select

from app.models import CheckIn, Net, NetRole, NetStatus
from app.permissions import SOLE_NCS_DETAIL
from tests.conftest import auth_headers


async def _net_with_assigned_ncs(db, owner, ncs_user, status=NetStatus.LOBBY, extra_ncs=None):
    net = Net(name="Rotation Net", owner_id=owner.id, status=status)
    db.add(net)
    await db.flush()
    db.add(NetRole(net_id=net.id, user_id=ncs_user.id, role="NCS", auto_assigned=True))
    if extra_ncs is not None:
        db.add(NetRole(net_id=net.id, user_id=extra_ncs.id, role="NCS"))
    await db.commit()
    return net.id


async def _check_in(client, net_id, user, choice):
    return await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": user.callsign, "self_role_choice": choice},
        headers=auth_headers(user),
    )


async def _active_ncs(db, net_id):
    db.expire_all()
    return set((await db.execute(
        select(NetRole.user_id).where(NetRole.net_id == net_id, NetRole.role == "NCS", NetRole.is_active == True)  # noqa: E712
    )).scalars().all())


@pytest.mark.asyncio
async def test_participant_steps_an_assigned_ncs_down(client, db, owner, other):
    other_id = other.id
    net_id = await _net_with_assigned_ncs(db, owner, other)
    resp = await _check_in(client, net_id, other, "participant")
    assert resp.status_code == 201
    assert other_id not in await _active_ncs(db, net_id)


@pytest.mark.asyncio
async def test_standard_leaves_an_assigned_role_alone(client, db, owner, other):
    other_id = other.id
    net_id = await _net_with_assigned_ncs(db, owner, other)
    resp = await _check_in(client, net_id, other, "standard")
    assert resp.status_code == 201
    assert other_id in await _active_ncs(db, net_id)


@pytest.mark.asyncio
async def test_the_only_ncs_of_a_running_net_cannot_step_down(client, db, owner, other):
    other_id = other.id
    net_id = await _net_with_assigned_ncs(db, owner, other, status=NetStatus.ACTIVE)
    resp = await _check_in(client, net_id, other, "participant")
    assert resp.status_code == 400
    assert resp.json()["detail"].startswith(SOLE_NCS_DETAIL)
    assert other_id in await _active_ncs(db, net_id)
    # Refused before anything was saved
    assert (await db.execute(select(CheckIn.id).where(CheckIn.net_id == net_id))).first() is None


@pytest.mark.asyncio
async def test_a_running_net_with_another_ncs_lets_them_step_down(client, db, owner, other):
    owner_id, other_id = owner.id, other.id
    net_id = await _net_with_assigned_ncs(db, owner, other, status=NetStatus.ACTIVE, extra_ncs=owner)
    resp = await _check_in(client, net_id, other, "participant")
    assert resp.status_code == 201
    assert await _active_ncs(db, net_id) == {owner_id}
