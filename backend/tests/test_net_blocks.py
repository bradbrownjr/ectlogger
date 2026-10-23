"""
Participants-only nets and removing/blocking a station from a net.

A participants-only net leaves self check-in open (nobody knows ahead of
time who will volunteer for a drill), so the label is the only change to
check-in; the enforcement is net control blocking a station that isn't
taking part (routers/net_blocks.py). Rules guarded here:

- blocking removes every check-in under the callsign, records the block, and
  net-wide mutes the station's chat when it has an account;
- a blocked station can't check itself back in, under that callsign or any
  other from the same account; net control can still check it in by hand;
- only the net's managers and its active NCS/Logger may block or unblock;
- unblocking lets the station check in again and lifts the chat mute;
- participants_only round-trips on a net and is copied from its schedule.
"""
import pytest
from sqlalchemy import select

from app.models import AuditEvent, ChatNetMute, CheckIn, Net, NetBlock, NetRole, NetStatus, NetTemplate, User, UserRole
from app.services.net_from_template import build_net_from_template
from tests.conftest import auth_headers


async def _net(db, owner, **kw):
    net = Net(name="SET", owner_id=owner.id, status="active", **kw)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


async def _self_check_in(client, net, user, callsign=None):
    return await client.post(f"/api/check-ins/nets/{net.id}/check-ins",
                             json={"callsign": callsign or user.callsign}, headers=auth_headers(user))


async def _rows(db, net):
    return (await db.execute(
        select(CheckIn).where(CheckIn.net_id == net.id).execution_options(populate_existing=True)
    )).scalars().all()


async def _block(client, net, by, check_in_id):
    return await client.post(f"/api/nets/{net.id}/blocks", json={"check_in_id": check_in_id}, headers=auth_headers(by))


@pytest.mark.asyncio
async def test_block_removes_the_station_mutes_it_and_keeps_it_out(client, db, owner, other):
    net = await _net(db, owner, participants_only=True)
    first = (await _self_check_in(client, net, other)).json()

    resp = await _block(client, net, owner, first["id"])
    assert resp.status_code == 201, resp.text
    assert resp.json()["callsign"] == other.callsign
    assert resp.json()["blocked_by_callsign"] == owner.callsign

    assert await _rows(db, net) == []
    mutes = (await db.execute(select(ChatNetMute).where(ChatNetMute.net_id == net.id))).scalars().all()
    assert [m.muted_user_id for m in mutes] == [other.id]
    actions = (await db.execute(select(AuditEvent.action).where(AuditEvent.net_id == net.id))).scalars().all()
    assert "net.station_blocked" in actions

    again = await _self_check_in(client, net, other)
    assert again.status_code == 403
    assert "removed" in again.json()["detail"]


@pytest.mark.asyncio
async def test_blocked_account_cannot_return_under_another_callsign(client, db, owner, other):
    net = await _net(db, owner)
    first = (await _self_check_in(client, net, other)).json()
    await _block(client, net, owner, first["id"])

    resp = await _self_check_in(client, net, other, callsign="W1NEW")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_net_control_can_still_check_a_blocked_station_in(client, db, owner, other):
    net = await _net(db, owner)
    first = (await _self_check_in(client, net, other)).json()
    await _block(client, net, owner, first["id"])

    resp = await _self_check_in(client, net, owner, callsign=other.callsign)
    assert resp.status_code in (200, 201), resp.text


@pytest.mark.asyncio
async def test_only_net_control_may_block_or_unblock(client, db, owner, other):
    net = await _net(db, owner)
    row = (await _self_check_in(client, net, owner)).json()

    assert (await _block(client, net, other, row["id"])).status_code == 403
    assert (await client.get(f"/api/nets/{net.id}/blocks", headers=auth_headers(other))).status_code == 403

    # An active Logger on the net may.
    db.add(NetRole(net_id=net.id, user_id=other.id, role="LOGGER", is_active=True))
    await db.commit()
    third = User(email="third@test.com", callsign="KC1TRD", role=UserRole.USER, is_active=True)
    db.add(third)
    await db.commit()
    await db.refresh(third)
    target = (await _self_check_in(client, net, third)).json()
    assert (await _block(client, net, other, target["id"])).status_code == 201


@pytest.mark.asyncio
async def test_cannot_block_yourself(client, db, owner):
    net = await _net(db, owner)
    row = (await _self_check_in(client, net, owner)).json()
    assert (await _block(client, net, owner, row["id"])).status_code == 400


@pytest.mark.asyncio
async def test_unblock_lets_the_station_back_and_lifts_the_mute(client, db, owner, other):
    net = await _net(db, owner)
    first = (await _self_check_in(client, net, other)).json()
    block = (await _block(client, net, owner, first["id"])).json()

    listed = (await client.get(f"/api/nets/{net.id}/blocks", headers=auth_headers(owner))).json()
    assert [b["id"] for b in listed] == [block["id"]]

    resp = await client.delete(f"/api/nets/{net.id}/blocks/{block['id']}", headers=auth_headers(owner))
    assert resp.status_code == 204
    assert (await db.execute(select(NetBlock).where(NetBlock.net_id == net.id))).scalars().all() == []
    assert (await db.execute(select(ChatNetMute).where(ChatNetMute.net_id == net.id))).scalars().all() == []
    assert (await _self_check_in(client, net, other)).status_code in (200, 201)


@pytest.mark.asyncio
async def test_block_station_action_is_sent_to_the_app(client, db, owner, other):
    net = await _net(db, owner)
    mine = (await client.get(f"/api/nets/{net.id}", headers=auth_headers(owner))).json()
    theirs = (await client.get(f"/api/nets/{net.id}", headers=auth_headers(other))).json()
    assert mine["actions"]["block_station"] is True
    assert theirs["actions"]["block_station"] is False


@pytest.mark.asyncio
async def test_participants_only_round_trips_and_is_copied_from_the_schedule(client, db, owner):
    net = await _net(db, owner)
    resp = await client.put(f"/api/nets/{net.id}", json={"participants_only": True}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["participants_only"] is True

    template = NetTemplate(name="SET schedule", owner_id=owner.id, participants_only=True)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    assert build_net_from_template(
        template, owner_id=owner.id, status=NetStatus.SCHEDULED, scheduled_start_time=None, topic_of_week_prompt=None,
    ).participants_only is True
