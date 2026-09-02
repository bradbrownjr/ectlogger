"""
Regression tests for the backup NCS auto-grant gate
(permissions.is_eligible_for_ncs_auto_grant).

2026-08-30 ME Dirigo Net incident (net 79): Cory Golob correctly checked in
and held the active NCS role; about 50 minutes later Peter, an ordinary
off-week rotation member, self-checked in purely as a participant and was
silently auto-granted NCS too, because eligibility never considered whether
the net already had an active NCS. That extra role then showed up as a
second, wrong "Net Control Station" attribution in the net's report.
"""
import pytest
from sqlalchemy import select

from app.models import Frequency, NetRole, NetTemplate, NCSRotationMember, net_template_frequencies
from tests.conftest import auth_headers


async def _template_with_rotation_member(db, owner_id: int, member_id: int) -> NetTemplate:
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()

    template = NetTemplate(
        name="Rotation Net",
        owner_id=owner_id,
        schedule_type="ad_hoc",
        schedule_config="{}",
    )
    db.add(template)
    await db.flush()

    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    db.add(NCSRotationMember(template_id=template.id, user_id=member_id, position=1, is_active=True))
    await db.commit()
    await db.refresh(template)
    return template


async def _create_and_start_net(client, owner, template_id: int) -> int:
    create = await client.post(
        f"/api/templates/{template_id}/create-net", headers=auth_headers(owner)
    )
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    return net_id


@pytest.mark.asyncio
async def test_rotation_member_not_auto_granted_ncs_when_another_ncs_already_active(client, db, owner, other):
    """`other` is an eligible off-week rotation member. Starting the net
    already auto-assigns `owner` as its active NCS (see
    nets_core.py::start_net), so `other` self-checking in afterward as a
    participant must NOT also become NCS."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201

    # The check-in ran against a different session (see conftest's client
    # fixture) -- expire this session's identity map before re-querying.
    # (owner_id/other_id were captured above, before expiring -- touching an
    # expired ORM attribute like owner.id triggers a *sync* lazy-load under
    # async SQLAlchemy and blows up.)
    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.role == "NCS", NetRole.is_active == True)  # noqa: E712
    )
    ncs_user_ids = {r.user_id for r in roles.scalars().all()}
    assert other_id not in ncs_user_ids
    assert ncs_user_ids == {owner_id}


@pytest.mark.asyncio
async def test_rotation_member_still_auto_granted_ncs_when_no_active_ncs_yet(client, db, owner, other):
    """Legitimate backup case, unchanged: the net's starter (owner) stepped
    back down to Standard before anyone else checked in -- mirrors an
    auto-opened lobby that nobody has claimed yet (no human called
    start_net, so nothing auto-assigned NCS). The eligible rotation member
    checking in next still becomes NCS with no separate claim step."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    owner_ncs = (await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.user_id == owner_id, NetRole.role == "NCS")
    )).scalar_one()
    owner_ncs.is_active = False
    await db.commit()

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH"},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201

    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.role == "NCS", NetRole.is_active == True)  # noqa: E712
    )
    ncs_user_ids = {r.user_id for r in roles.scalars().all()}
    assert other_id in ncs_user_ids
