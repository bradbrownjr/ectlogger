"""
Regression tests for NCS check-in eligibility
(permissions.is_eligible_for_ncs_auto_grant).

2026-08-30 ME Dirigo Net incident (net 79): Cory Golob correctly checked in
and held the active NCS role; about 50 minutes later Peter, an ordinary
off-week rotation member, self-checked in purely as a participant and was
silently auto-granted NCS too, with no choice presented. Root-caused to the
grant being fully automatic and silent, not to multiple NCS being possible --
fixed at the two call sites (check_ins.py's Snackbar-triggered check-in now
defaults check_in_as_standard=true; CheckInFormDialog's NCS/Standard radio
defaults to Standard), so becoming NCS always requires an affirmative,
deliberate choice.

An earlier version of this function also blocked eligibility outright once
anyone else held an active NCS role, on the theory that multiple NCS was
itself the bug. That broke a legitimate, pre-existing pattern: net 15 ("GYX
SKYWARN / Emergency Communications Exercise") has 8 different eligible staff
who each deliberately self-checked-in as NCS for their own desk within
minutes of each other. It also crashed GET /nets/{id} outright for every
net with 2+ active NCS rows (18 on production, including net 79 itself)
via scalar_one_or_none() on a query that was never actually unique. See
2026-09-03.
"""
import pytest
from sqlalchemy import select

from app.models import Frequency, Net, NetRole, NetTemplate, NCSRotationMember, net_template_frequencies
from app.permissions import is_eligible_for_ncs_auto_grant
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
async def test_rotation_member_can_become_additional_ncs_when_requested(client, db, owner, other):
    """`other` is an eligible off-week rotation member. Starting the net
    already auto-assigns `owner` as its active NCS (see
    nets_core.py::start_net). `other` self-checking in and explicitly
    requesting NCS (check_in_as_standard omitted/false, matching the full
    dialog's deliberate "Check in as NCS" choice) must still be granted it --
    a second simultaneous active NCS is a legitimate, wanted pattern (see
    net 15's multi-desk SKYWARN exercise), not something to block."""
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
    assert ncs_user_ids == {owner_id, other_id}


@pytest.mark.asyncio
async def test_rotation_member_not_auto_granted_when_declining_via_standard_checkin(client, db, owner, other):
    """The actual silent-grant incident this guards against: `other`
    self-checking in with check_in_as_standard=true (the Snackbar's current
    default, and what the dialog sends when Standard stays selected) must
    never pick up NCS regardless of eligibility or of whether anyone else is
    already NCS."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH", "check_in_as_standard": True},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201

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


@pytest.mark.asyncio
async def test_eligibility_check_tolerates_multiple_existing_active_ncs_rows(db, owner, other, admin):
    """Guards against reintroducing a uniqueness assumption: production data
    (e.g. net 79, net 15) can hold many active NCS NetRole rows on the same
    net at once. Any future query added here for an "already active NCS"
    style check must not use scalar_one_or_none() / assume at most one row
    -- that took down GET /nets/{id} for 18 nets on 2026-09-03."""
    template = NetTemplate(
        name="Multi-NCS Template", owner_id=owner.id, schedule_type="ad_hoc", schedule_config="{}"
    )
    db.add(template)
    await db.flush()

    net = Net(name="Multi-NCS Net", owner_id=owner.id, status="active", template_id=template.id)
    db.add(net)
    await db.flush()
    db.add(NetRole(net_id=net.id, user_id=owner.id, role="NCS", is_active=True))
    db.add(NetRole(net_id=net.id, user_id=other.id, role="NCS", is_active=True))
    await db.commit()
    await db.refresh(net)

    from app.models import TemplateStaff
    db.add(TemplateStaff(template_id=template.id, user_id=admin.id, is_active=True, is_co_manager=True))
    await db.commit()

    result = await is_eligible_for_ncs_auto_grant(db, net, admin.id)
    assert result is True
