"""
Regression tests for NCS/Logger check-in eligibility
(permissions.is_eligible_for_ncs_auto_grant, is_eligible_for_logger_self_grant).

2026-08-30 ME Dirigo Net incident (net 79): Cory Golob correctly checked in
and held the active NCS role; about 50 minutes later Peter, an ordinary
off-week rotation member, self-checked in purely as a participant and was
silently auto-granted NCS too, with no choice presented. Root-caused to the
grant being fully automatic and silent, not to multiple NCS being possible --
fixed at the two call sites (check_ins.py's Snackbar-triggered check-in now
defaults self_role_choice='standard'; CheckInFormDialog's role radio defaults
to Standard), so becoming NCS always requires an affirmative, deliberate
choice.

An earlier version of this function also blocked eligibility outright once
anyone else held an active NCS role, on the theory that multiple NCS was
itself the bug. That broke a legitimate, pre-existing pattern: net 15 ("GYX
SKYWARN / Emergency Communications Exercise") has 8 different eligible staff
who each deliberately self-checked-in as NCS for their own desk within
minutes of each other. It also crashed GET /nets/{id} outright for every
net with 2+ active NCS rows (18 on production, including net 79 itself)
via scalar_one_or_none() on a query that was never actually unique. See
2026-09-03.

2026-09-05: the same fail-safe self_role_choice field was extended to also
grant LOGGER (is_eligible_for_logger_self_grant), for the "net owner opens
the lobby as Logger while waiting for the scheduled NCS" workflow. The field
was a bool (check_in_as_standard) until this change; it's now a three-way
'standard' | 'ncs' | 'logger' string, defaulting to 'standard', preserving
the same "only an explicit affirmative choice grants anything" guarantee.
"""
import pytest
from sqlalchemy import select

from app.models import Frequency, Net, NetRole, NetTemplate, NCSRotationMember, net_template_frequencies
from app.permissions import is_eligible_for_logger_self_grant, is_eligible_for_ncs_auto_grant
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
    requesting NCS (self_role_choice='ncs', matching the full dialog's
    deliberate "Check in as NCS" choice) must still be granted it -- a
    second simultaneous active NCS is a legitimate, wanted pattern (see
    net 15's multi-desk SKYWARN exercise), not something to block."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH", "self_role_choice": "ncs"},
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
async def test_omitting_the_flag_never_grants_ncs(client, db, owner, other):
    """Fail-safe default. `self_role_choice` defaults to 'standard', and the
    grant requires an explicit 'ncs' (or 'logger'), so any caller that simply
    doesn't send the field checks in as a Standard participant.

    This is the structural guard against the 2026-08-30 incident recurring
    through a new entry point: before 2026-09-03 the (then-boolean) field
    defaulted to False, so *omitting* it requested NCS, and correctness
    depended on every one of ~7 scattered frontend literals staying right.
    Three of them (the initial check-in form state and two form resets) were
    still false, which silently promoted an eligible operator who typed
    their own callsign into the inline check-in form."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH"},  # deliberately omits self_role_choice
        headers=auth_headers(other),
    )
    assert resp.status_code == 201

    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.is_active == True)  # noqa: E712
    )
    granted_user_ids = {r.user_id for r in roles.scalars().all() if r.role in ("NCS", "LOGGER")}
    assert other_id not in granted_user_ids, "omitting the flag must never grant NCS or Logger"


@pytest.mark.asyncio
async def test_explicit_null_never_grants_ncs(client, db, owner, other):
    """`null` is not an affirmative request either -- the grant tests
    membership in ("ncs", "logger"), so an explicit null falls through to
    Standard rather than sneaking past a truthiness check."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH", "self_role_choice": None},
        headers=auth_headers(other),
    )
    assert resp.status_code == 201

    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.role == "NCS", NetRole.is_active == True)  # noqa: E712
    )
    assert other_id not in {r.user_id for r in roles.scalars().all()}


@pytest.mark.asyncio
async def test_staff_entered_checkin_never_grants_ncs(client, db, owner, other):
    """An NCS/Logger logging someone else in by voice is never that person's
    own choice, so it must not grant NCS (or Logger) even with an explicit
    request -- the `current_user.id == linked_user_id` guard in
    check_ins.py."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    template_id = template.id

    # owner (already NCS) enters other's callsign on their behalf, requesting
    # both grantable roles in turn -- neither should ever land. Two separate
    # net occurrences (same ad_hoc template) so the second attempt isn't
    # rejected as an already-checked-in duplicate of the same callsign. All
    # HTTP calls happen before any db.expire_all(), since expiring mid-loop
    # would make the next iteration's auth_headers(owner) touch an expired
    # ORM attribute and trigger a sync lazy-load under async SQLAlchemy.
    net_ids = []
    for role_choice in ("ncs", "logger"):
        net_id = await _create_and_start_net(client, owner, template_id)
        net_ids.append(net_id)
        resp = await client.post(
            f"/api/check-ins/nets/{net_id}/check-ins",
            json={"callsign": "KC1OTH", "self_role_choice": role_choice},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201

    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id.in_(net_ids), NetRole.is_active == True)  # noqa: E712
    )
    granted_user_ids = {r.user_id for r in roles.scalars().all() if r.role in ("NCS", "LOGGER")}
    assert other_id not in granted_user_ids


@pytest.mark.asyncio
async def test_rotation_member_not_auto_granted_when_declining_via_standard_checkin(client, db, owner, other):
    """The actual silent-grant incident this guards against: `other`
    self-checking in with self_role_choice='standard' (the Snackbar's
    current default, and what the dialog sends when Standard stays selected)
    must never pick up NCS regardless of eligibility or of whether anyone
    else is already NCS."""
    owner_id, other_id = owner.id, other.id
    template = await _template_with_rotation_member(db, owner_id, other_id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OTH", "self_role_choice": "standard"},
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
        json={"callsign": "KC1OTH", "self_role_choice": "ncs"},
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


@pytest.mark.asyncio
async def test_owner_can_become_logger_when_requested(client, db, owner):
    """The workflow this was added for (2026-09-05): the net owner opens a
    lobby/net and wants to step in as Logger while waiting for the scheduled
    NCS to arrive. Unlike NCS eligibility, this doesn't require a template
    or rotation membership -- being the owner is enough on its own, and it
    works on an ad hoc net (no template at all)."""
    owner_id = owner.id
    net = Net(name="Ad Hoc Net", owner_id=owner_id, status="active")
    db.add(net)
    await db.commit()
    await db.refresh(net)
    net_id = net.id

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1OWN", "self_role_choice": "logger"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201

    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.role == "LOGGER", NetRole.is_active == True)  # noqa: E712
    )
    assert owner_id in {r.user_id for r in roles.scalars().all()}


@pytest.mark.asyncio
async def test_non_eligible_user_cannot_self_grant_logger(client, db, owner, other, admin):
    """A user who is neither the net's owner nor an active co-manager/rotation
    member for its template must not be able to self-grant Logger just by
    asking -- eligibility has no admin bypass either, since a global admin
    already has full access without needing the badge/pin this grants."""
    admin_id = admin.id
    template = await _template_with_rotation_member(db, owner.id, other.id)
    net_id = await _create_and_start_net(client, owner, template.id)

    resp = await client.post(
        f"/api/check-ins/nets/{net_id}/check-ins",
        json={"callsign": "KC1ADM", "self_role_choice": "logger"},
        headers=auth_headers(admin),
    )
    assert resp.status_code == 201

    db.expire_all()
    roles = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.role == "LOGGER", NetRole.is_active == True)  # noqa: E712
    )
    assert admin_id not in {r.user_id for r in roles.scalars().all()}


@pytest.mark.asyncio
async def test_logger_eligibility_check_respects_existing_role(db, owner, other):
    """Mirrors is_eligible_for_ncs_auto_grant's existence guard: a user who
    already holds any NetRole on this net (even an unrelated one) is not
    eligible to self-grant Logger -- they're already assigned, so this
    doesn't apply to them (they'd use the Acting as NCS/Standard toggle or
    the check-in row's status dropdown instead)."""
    template = await _template_with_rotation_member(db, owner.id, other.id)
    net = Net(name="Rotation Net Occurrence", owner_id=owner.id, status="active", template_id=template.id)
    db.add(net)
    await db.flush()
    db.add(NetRole(net_id=net.id, user_id=other.id, role="RELAY", is_active=True))
    await db.commit()
    await db.refresh(net)

    result = await is_eligible_for_logger_self_grant(db, net, other.id)
    assert result is False
