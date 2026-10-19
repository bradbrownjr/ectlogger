"""
Net staff, rotation members, swaps, the 5th-week pick and net roles named by
callsign before the operator has an account (services/callsign_people.py).

Asked for by N1KWG (Greater Manchester NH ARES, 2026-10-05: "I am still
chasing some of our NCS staff to create their accounts ... Until that is
complete, I cannot create a rotation"), and for nets a Logger runs, checking
the NCS in each week. The security tests matter most: a callsign-only entry
must never grant anything, and a sign-up that takes one over must be
reversible.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    CallsignClaim,
    CheckIn,
    Contact,
    Frequency,
    Net,
    NetCallsignRole,
    NetRole,
    NetStatus,
    NetTemplate,
    NCSRotationMember,
    NCSScheduleOverride,
    TeamInvite,
    TemplateStaff,
    User,
    UserRole,
    net_template_frequencies,
)
from app.ncs_reminder_service import NCSReminderService
from app.permissions import is_active_template_staff
from app.services.callsign_people import (
    claim_callsign_placeholders,
    find_user_by_callsign,
    normalize_callsign,
)
from app.services.ncs_attribution import net_ncs_attribution
from tests.conftest import auth_headers


def _next_sunday_1400() -> datetime:
    now = datetime.utcnow()
    candidate = (now + timedelta(days=(6 - now.weekday()) % 7)).replace(hour=14, minute=0, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=7)
    return candidate


async def _weekly_schedule(db, manager_id: int) -> NetTemplate:
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()
    template = NetTemplate(
        name="Greater Test ARES Net",
        owner_id=manager_id,
        schedule_type="weekly",
        schedule_config='{"time": "14:00", "day_of_week": 0, "timezone": "UTC"}',
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db.add(template)
    await db.flush()
    await db.execute(net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id))
    await db.commit()
    await db.refresh(template)
    return template


async def _user(db, email: str, callsign=None, role=UserRole.USER, **kwargs) -> User:
    user = User(email=email, callsign=callsign, role=role, is_active=True, **kwargs)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _staff_url(template_id):
    return f"/api/templates/{template_id}/ncs-rotation/staff"


def _members_url(template_id):
    return f"/api/templates/{template_id}/ncs-rotation/members"


# ========== ADDING BY CALLSIGN ==========

@pytest.mark.asyncio
async def test_staff_by_callsign_creates_a_callsign_only_entry(client, db, owner):
    template = await _weekly_schedule(db, owner.id)
    resp = await client.post(_staff_url(template.id), json={"callsign": " kb1jcx "}, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["user_id"] is None
    assert body["user_callsign"] == "KB1JCX"
    assert body["has_account"] is False

    row = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert row.user_id is None and row.callsign == "KB1JCX"


@pytest.mark.asyncio
async def test_callsign_with_an_account_resolves_to_the_account(client, db, owner, other):
    template = await _weekly_schedule(db, owner.id)
    resp = await client.post(_staff_url(template.id), json={"callsign": other.callsign.lower()}, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    assert resp.json()["user_id"] == other.id
    assert resp.json()["has_account"] is True


@pytest.mark.asyncio
async def test_duplicate_callsign_entry_is_refused(client, db, owner):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    assert (await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=headers)).status_code == 201
    dup = await client.post(_staff_url(template.id), json={"callsign": "kb1jcx"}, headers=headers)
    assert dup.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["KENG", "12345", "<script>", "K1A%", "/K1ABC", "K", "", "K1ABC DEF"])
async def test_things_that_are_not_callsigns_are_refused(client, db, owner, bad):
    template = await _weekly_schedule(db, owner.id)
    resp = await client.post(_staff_url(template.id), json={"callsign": bad}, headers=auth_headers(owner))
    assert resp.status_code in (400, 422), (bad, resp.text)


@pytest.mark.asyncio
async def test_both_or_neither_is_refused(client, db, owner, other):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    both = await client.post(_staff_url(template.id), json={"user_id": other.id, "callsign": "KB1JCX"}, headers=headers)
    assert both.status_code == 400
    neither = await client.post(_staff_url(template.id), json={}, headers=headers)
    assert neither.status_code == 400


@pytest.mark.asyncio
async def test_only_the_manager_can_add_by_callsign(client, db, owner, other):
    template = await _weekly_schedule(db, owner.id)
    resp = await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=auth_headers(other))
    assert resp.status_code == 403
    guest = await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"})
    assert guest.status_code in (401, 403)


# ========== A CALLSIGN-ONLY ENTRY GRANTS NOTHING ==========

@pytest.mark.asyncio
async def test_no_account_is_never_net_staff(db, owner):
    """SQLAlchemy turns `user_id == None` into IS NULL, which would match every
    callsign-only row; the helper must fail closed."""
    template = await _weekly_schedule(db, owner.id)
    db.add(TemplateStaff(template_id=template.id, callsign="KB1JCX", is_active=True, is_co_manager=True))
    db.add(NCSRotationMember(template_id=template.id, callsign="KB1JCX", position=1, is_active=True))
    await db.commit()
    assert await is_active_template_staff(db, template.id, None) is False


@pytest.mark.asyncio
async def test_callsign_only_staff_gives_an_unrelated_account_nothing(client, db, owner):
    """An account with no callsign at all sees a net from this schedule
    exactly as an outsider would, co-manager placeholder or not."""
    template = await _weekly_schedule(db, owner.id)
    db.add(TemplateStaff(template_id=template.id, callsign="KB1JCX", is_active=True, is_co_manager=True))
    await db.commit()
    stranger = await _user(db, "stranger@test.com", callsign=None)
    net_id = (await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))).json()["id"]
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(stranger))
    assert not any(resp.json()["actions"].values()), resp.json()["actions"]
    start = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(stranger))
    assert start.status_code == 403


@pytest.mark.asyncio
async def test_callsign_role_grants_no_net_access(client, db, owner):
    """A credit-only NCS on a net does not make anyone a manager of it."""
    template = await _weekly_schedule(db, owner.id)
    net_id = (await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))).json()["id"]
    db.add(NetCallsignRole(net_id=net_id, callsign="KB1JCX", role="NCS"))
    await db.commit()
    stranger = await _user(db, "stranger@test.com", callsign=None)
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(stranger))
    assert not any(resp.json()["actions"].values())


# ========== PUBLIC LISTS STAY PRIVATE ==========

@pytest.mark.asyncio
async def test_invite_address_never_appears_in_any_list(client, db, owner):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    resp = await client.post(
        _staff_url(template.id), json={"callsign": "KB1JCX", "invite_email": "Ken.Real@Example.com"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["invited"] is True
    await client.post(_members_url(template.id), json={"callsign": "KB1JCX"}, headers=headers)

    for viewer in (headers, None):
        for url in (_staff_url(template.id), _members_url(template.id),
                    f"/api/templates/{template.id}/ncs-rotation/schedule"):
            body = (await client.get(url, headers=viewer)).text
            assert "example.com" not in body.lower(), url
    guest_staff = (await client.get(_staff_url(template.id))).json()
    assert guest_staff[0]["invited"] is False, "whether an invite went out is for signed-in viewers"

    invite = (await db.execute(select(TeamInvite).where(TeamInvite.callsign == "KB1JCX"))).scalar_one()
    assert (invite.template_id, invite.email, invite.invited_by_id) == (template.id, "ken.real@example.com", owner.id)


@pytest.mark.asyncio
async def test_invite_budget_is_enforced(client, db, owner, monkeypatch):
    from app.services import callsign_people
    monkeypatch.setattr(callsign_people, "INVITES_PER_DAY", 2)
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    for i, callsign in enumerate(["KB1AAA", "KB1AAB"]):
        resp = await client.post(_staff_url(template.id), json={"callsign": callsign, "invite_email": f"a{i}@example.com"}, headers=headers)
        assert resp.status_code == 201, resp.text
    third = await client.post(_staff_url(template.id), json={"callsign": "KB1AAC", "invite_email": "a3@example.com"}, headers=headers)
    assert third.status_code == 429


# ========== THE ROTATION AND THE NET ==========

async def _rotation_of_one_callsign(client, db, owner, callsign="KB1JCX"):
    template = await _weekly_schedule(db, owner.id)
    resp = await client.post(_members_url(template.id), json={"callsign": callsign}, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    # _get_or_create_scheduled_net reads .frequencies, so load it up front.
    db.expunge_all()
    result = await db.execute(
        select(NetTemplate).options(selectinload(NetTemplate.frequencies)).where(NetTemplate.id == template.id)
    )
    return result.scalar_one()


@pytest.mark.asyncio
async def test_schedule_shows_the_callsign_on_duty(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner)
    schedule = (await client.get(f"/api/templates/{template.id}/ncs-rotation/schedule", headers=auth_headers(owner))).json()["schedule"]
    assert schedule and all(e["user_callsign"] == "KB1JCX" and e["has_account"] is False for e in schedule)


@pytest.mark.asyncio
async def test_auto_created_net_credits_the_callsign_as_ncs(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner)
    service = NCSReminderService()
    net_id = await service._get_or_create_scheduled_net(db, template, _next_sunday_1400())
    assert net_id

    assert (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all() == []
    callsign_roles = (await db.execute(select(NetCallsignRole).where(NetCallsignRole.net_id == net_id))).scalars().all()
    assert [(r.callsign, r.role, r.auto_assigned) for r in callsign_roles] == [("KB1JCX", "NCS", True)]
    assert await net_ncs_attribution(db, net_id) == ("KB1JCX", None)

    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    assert await service._is_occurrence_staffed(db, net) is True


@pytest.mark.asyncio
async def test_net_card_and_report_name_the_callsign(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner)
    net_id = await NCSReminderService()._get_or_create_scheduled_net(db, template, _next_sunday_1400())
    detail = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))).json()
    assert detail["ncs_callsign"] == "KB1JCX"
    roles = (await client.get(f"/api/nets/{net_id}/callsign-roles")).json()
    assert roles[0]["callsign"] == "KB1JCX"
    # The account roles list, which the app matches to check-ins by user_id,
    # never carries a callsign-only role.
    assert (await client.get(f"/api/nets/{net_id}/roles")).json() == []


@pytest.mark.asyncio
async def test_swap_to_a_callsign_and_cancel_still_cancels(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner)
    headers = auth_headers(owner)
    schedule = (await client.get(f"/api/templates/{template.id}/ncs-rotation/schedule")).json()["schedule"]
    first, second = schedule[0]["date"], schedule[1]["date"]

    swap = await client.post(f"/api/templates/{template.id}/ncs-rotation/overrides",
                             json={"scheduled_date": first, "replacement_callsign": "W1EAA"}, headers=headers)
    assert swap.status_code == 201, swap.text
    assert swap.json()["replacement_user_callsign"] == "W1EAA"
    assert swap.json()["original_user_callsign"] == "KB1JCX"
    assert swap.json()["is_cancellation"] is False

    cancel = await client.post(f"/api/templates/{template.id}/ncs-rotation/overrides",
                               json={"scheduled_date": second}, headers=headers)
    assert cancel.json()["is_cancellation"] is True

    schedule = (await client.get(f"/api/templates/{template.id}/ncs-rotation/schedule")).json()["schedule"]
    assert schedule[0]["user_callsign"] == "W1EAA" and schedule[0]["is_cancelled"] is False
    assert schedule[1]["is_cancelled"] is True


@pytest.mark.asyncio
async def test_removing_a_callsign_member_keeps_other_callsign_swaps(client, db, owner):
    """Override cleanup on removal must match by callsign, not by a NULL user_id."""
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    a = (await client.post(_members_url(template.id), json={"callsign": "KB1AAA"}, headers=headers)).json()
    await client.post(_members_url(template.id), json={"callsign": "KB1BBB"}, headers=headers)
    db.add(NCSScheduleOverride(template_id=template.id, scheduled_date=datetime(2030, 1, 6, 14),
                               original_callsign="KB1BBB", replacement_callsign="W1EAA"))
    await db.commit()
    await client.delete(f"{_members_url(template.id)}/{a['id']}", headers=headers)
    remaining = (await db.execute(select(NCSScheduleOverride).where(NCSScheduleOverride.template_id == template.id))).scalars().all()
    assert len(remaining) == 1


@pytest.mark.asyncio
async def test_fifth_week_by_callsign(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner)
    resp = await client.put(f"/api/templates/{template.id}", json={"fifth_week_callsign": "w1eaa"}, headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["fifth_week_user_callsign"] == "W1EAA"
    assert resp.json()["fifth_week_has_account"] is False
    cleared = await client.put(f"/api/templates/{template.id}", json={"fifth_week_callsign": None, "fifth_week_user_id": None}, headers=auth_headers(owner))
    assert cleared.json()["fifth_week_user_callsign"] is None


@pytest.mark.asyncio
async def test_roster_edit_moves_duty_between_callsign_and_account(client, db, owner, other):
    """resync replaces an auto-assigned callsign NCS with an account's, and back."""
    template = await _rotation_of_one_callsign(client, db, owner)
    headers = auth_headers(owner)
    net_id = await NCSReminderService()._get_or_create_scheduled_net(db, template, _next_sunday_1400())

    member = (await client.post(_members_url(template.id), json={"user_id": other.id}, headers=headers)).json()
    ids = [m["id"] for m in (await client.get(_members_url(template.id))).json()]
    await client.put(f"{_members_url(template.id)}/reorder", json={"member_ids": [member["id"]] + [i for i in ids if i != member["id"]]}, headers=headers)

    db.expunge_all()
    assert (await db.execute(select(NetCallsignRole).where(NetCallsignRole.net_id == net_id))).scalars().all() == []
    roles = (await db.execute(select(NetRole).where(NetRole.net_id == net_id))).scalars().all()
    assert [(r.user_id, r.auto_assigned) for r in roles] == [(other.id, True)]


# ========== CREDIT-ONLY ROLES ON A NET ==========

async def _active_net_with_guest(client, db, owner, callsign="KB1JCX"):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    net_id = (await client.post(f"/api/templates/{template.id}/create-net", headers=headers)).json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=headers)
    ci = await client.post(f"/api/check-ins/nets/{net_id}/check-ins", json={"callsign": callsign}, headers=headers)
    assert ci.status_code == 201 and ci.json()["user_id"] is None
    return net_id, ci.json()["id"]


@pytest.mark.asyncio
async def test_logger_marks_a_guest_as_ncs(client, db, owner):
    net_id, _ = await _active_net_with_guest(client, db, owner)
    headers = auth_headers(owner)
    resp = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1JCX", "role": "ncs"}, headers=headers)
    assert resp.status_code == 200, resp.text
    # One role per station: changing it replaces it.
    resp = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1JCX", "role": "LOGGER"}, headers=headers)
    roles = (await client.get(f"/api/nets/{net_id}/callsign-roles")).json()
    assert [(r["callsign"], r["role"]) for r in roles] == [("KB1JCX", "LOGGER")]
    removed = await client.delete(f"/api/nets/{net_id}/callsign-roles/{roles[0]['id']}", headers=headers)
    assert removed.status_code == 204


@pytest.mark.asyncio
async def test_callsign_role_refused_for_accounts_bad_roles_and_outsiders(client, db, owner, other):
    net_id, _ = await _active_net_with_guest(client, db, owner)
    headers = auth_headers(owner)
    has_account = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": other.callsign, "role": "NCS"}, headers=headers)
    assert has_account.status_code == 400
    bad_role = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1JCX", "role": "ADMIN"}, headers=headers)
    assert bad_role.status_code == 400
    outsider = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1JCX", "role": "NCS"}, headers=auth_headers(other))
    assert outsider.status_code == 403
    guest = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1JCX", "role": "NCS"})
    assert guest.status_code in (401, 403)


@pytest.mark.asyncio
async def test_corrected_callsign_takes_its_credit_role_along(client, db, owner):
    net_id, check_in_id = await _active_net_with_guest(client, db, owner, callsign="KB1JCZ")
    headers = auth_headers(owner)
    await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1JCZ", "role": "NCS"}, headers=headers)
    fixed = await client.put(f"/api/check-ins/check-ins/{check_in_id}", json={"callsign": "KB1JCX"}, headers=headers)
    assert fixed.status_code == 200, fixed.text
    roles = (await client.get(f"/api/nets/{net_id}/callsign-roles")).json()
    assert [(r["callsign"], r["role"]) for r in roles] == [("KB1JCX", "NCS")]


@pytest.mark.asyncio
async def test_corrected_to_an_account_becomes_a_real_role(client, db, owner, other):
    net_id, check_in_id = await _active_net_with_guest(client, db, owner, callsign="KC1OTZ")
    headers = auth_headers(owner)
    await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KC1OTZ", "role": "NCS"}, headers=headers)
    await client.put(f"/api/check-ins/check-ins/{check_in_id}", json={"callsign": other.callsign}, headers=headers)
    assert (await client.get(f"/api/nets/{net_id}/callsign-roles")).json() == []
    roles = (await client.get(f"/api/nets/{net_id}/roles", headers=headers)).json()
    assert [(r["user_id"], r["role"]) for r in roles if r["user_id"] == other.id] == [(other.id, "NCS")]


@pytest.mark.asyncio
async def test_correction_onto_an_account_drops_credit_for_an_editor_who_cannot_assign_roles(client, db, owner, other):
    """T6: a Logger who couldn't assign NCS directly can't do it by editing a
    credited guest row's callsign to an account's callsign."""
    net_id, check_in_id = await _active_net_with_guest(client, db, owner, callsign="KC1OTZ")
    await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KC1OTZ", "role": "NCS"}, headers=auth_headers(owner))
    logger_user = await _user(db, "lg@example.com", callsign="KC1LOG")
    db.add(NetRole(net_id=net_id, user_id=logger_user.id, role="LOGGER", is_active=True))
    await db.commit()
    resp = await client.put(f"/api/check-ins/check-ins/{check_in_id}", json={"callsign": other.callsign}, headers=auth_headers(logger_user))
    assert resp.status_code == 200, resp.text
    roles = (await client.get(f"/api/nets/{net_id}/roles")).json()
    assert not [r for r in roles if r["user_id"] == other.id]
    assert (await client.get(f"/api/nets/{net_id}/callsign-roles")).json() == []


@pytest.mark.asyncio
async def test_callsign_role_needs_a_check_in_on_the_net(client, db, owner):
    net_id, _ = await _active_net_with_guest(client, db, owner)
    resp = await client.post(f"/api/nets/{net_id}/callsign-roles", json={"callsign": "KB1ZZZ", "role": "NCS"}, headers=auth_headers(owner))
    assert resp.status_code == 400


# ========== SIGNING UP TAKES OVER THE ENTRIES ==========

async def _placeholders_everywhere(client, db, owner, callsign="KB1JCX"):
    """Staff, rotation, the auto-created net's NCS, and a past net's credit."""
    template = await _rotation_of_one_callsign(client, db, owner, callsign)
    headers = auth_headers(owner)
    await client.post(_staff_url(template.id), json={"callsign": callsign}, headers=headers)
    net_id = await NCSReminderService()._get_or_create_scheduled_net(db, template, _next_sunday_1400())
    past = Net(name="Past", owner_id=owner.id, template_id=template.id, status=NetStatus.ARCHIVED)
    db.add(past)
    await db.flush()
    db.add(NetCallsignRole(net_id=past.id, callsign=callsign, role="NCS"))
    await db.commit()
    return template, net_id, past.id


async def _link(client, template_id, manager, callsign="KB1JCX"):
    """The schedule's manager confirms the account with this callsign is the
    operator on their staff list (the Link button)."""
    staff = [s for s in (await client.get(_staff_url(template_id), headers=auth_headers(manager))).json()
             if s["user_callsign"] == callsign and s["user_id"] is None][0]
    resp = await client.patch(f"{_staff_url(template_id)}/{staff['id']}", json={"link": True}, headers=auth_headers(manager))
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_a_profile_callsign_alone_takes_over_nothing(client, db, owner):
    """The troll case: typing someone's callsign into a profile is not proof.
    It is held for the manager, who is told once, and grants nothing."""
    template, net_id, past_id = await _placeholders_everywhere(client, db, owner)
    troll = await _user(db, "troll@example.com", callsign=None)
    resp = await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(troll))
    assert resp.status_code == 200, resp.text

    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert (staff.user_id, staff.callsign) == (None, "KB1JCX")
    for nid in (net_id, past_id):
        assert (await db.execute(select(NetRole).where(NetRole.net_id == nid))).scalars().all() == []
    held = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == troll.id))).scalars().all()
    assert [(c.status, c.template_id) for c in held] == [("held", template.id)]
    detail = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(troll))).json()
    assert not any(detail["actions"].values())
    assert (await client.put(f"/api/templates/{template.id}", json={"name": "pwned"}, headers=auth_headers(troll))).status_code == 403
    listed = (await client.get(_staff_url(template.id), headers=auth_headers(owner))).json()[0]
    assert listed["account_available"] is True

    # Saving the profile again (the form sends every field) adds nothing.
    await client.put("/api/users/me", json={"callsign": "KB1JCX", "name": "Ken"}, headers=auth_headers(troll))
    await client.put("/api/users/me", json={"callsign": "KB1JCQ"}, headers=auth_headers(troll))
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(troll))
    db.expunge_all()
    assert len((await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == troll.id))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_an_extra_or_gmrs_callsign_is_never_matched(client, db, owner):
    template = await _weekly_schedule(db, owner.id)
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=auth_headers(owner))
    troll = await _user(db, "troll@example.com", callsign="KC1TRL")
    await client.put("/api/users/me", json={"callsigns": ["KB1JCX"], "gmrs_callsign": "KB1JCX"}, headers=auth_headers(troll))
    assert (await db.execute(select(CallsignClaim))).scalars().all() == []


@pytest.mark.asyncio
async def test_manager_link_takes_over_every_entry(client, db, owner):
    template, net_id, past_id = await _placeholders_everywhere(client, db, owner)
    newcomer = await _user(db, "ken@example.com", callsign=None)
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(newcomer))
    await _link(client, template.id, owner)

    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert (staff.user_id, staff.callsign) == (newcomer.id, None)
    member = (await db.execute(select(NCSRotationMember).where(NCSRotationMember.template_id == template.id))).scalar_one()
    assert (member.user_id, member.callsign) == (newcomer.id, None)
    for nid in (net_id, past_id):
        assert (await db.execute(select(NetCallsignRole).where(NetCallsignRole.net_id == nid))).scalars().all() == []
        role = (await db.execute(select(NetRole).where(NetRole.net_id == nid))).scalar_one()
        assert role.user_id == newcomer.id and role.role == "NCS"
    claim = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == newcomer.id))).scalar_one()
    assert (claim.status, claim.linked_by_id, claim.via_invite) == ("linked", owner.id, False)
    detail = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(newcomer))).json()
    assert detail["actions"]["start"] is True


@pytest.mark.asyncio
async def test_invited_sign_in_prefills_and_takes_over(client, db, owner):
    from app.routers.auth import get_or_create_user

    template = await _weekly_schedule(db, owner.id)
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCX", "invite_email": "ken@example.com"}, headers=auth_headers(owner))
    user = await get_or_create_user(db, "ken@example.com", "ken@example.com", "email", "ken@example.com")
    assert user.callsign == "KB1JCX"
    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert staff.user_id == user.id
    claim = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == user.id))).scalar_one()
    assert claim.via_invite is True


@pytest.mark.asyncio
async def test_an_invite_only_vouches_on_its_own_schedule(client, db, owner, other):
    """T2: another schedule's staff can't invite someone else's placeholder
    at their own address and have it handed over everywhere."""
    from app.routers.auth import get_or_create_user

    ken_net = await _weekly_schedule(db, owner.id)
    await client.post(_staff_url(ken_net.id), json={"callsign": "KB1JCX", "invite_email": "ken@example.com"}, headers=auth_headers(owner))
    evil_net = await _weekly_schedule(db, other.id)
    await client.post(_staff_url(evil_net.id), json={"callsign": "KB1JCX", "invite_email": "troll@example.com"}, headers=auth_headers(other))
    troll = await get_or_create_user(db, "troll@example.com", "troll@example.com", "email", "troll@example.com")
    db.expunge_all()
    ken_staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == ken_net.id))).scalar_one()
    assert ken_staff.user_id is None, "an invite on another schedule must not hand over this one"
    evil_staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == evil_net.id))).scalar_one()
    assert evil_staff.user_id == troll.id


@pytest.mark.asyncio
async def test_different_address_than_the_invite_is_held_for_the_manager(client, db, owner):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCX", "invite_email": "ken@example.com"}, headers=headers)
    troll = await _user(db, "troll@example.com", callsign=None)
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(troll))

    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert staff.user_id is None, "a sign-up with a different address must not take the invited spot"
    listed = (await client.get(_staff_url(template.id), headers=headers)).json()[0]
    assert listed["account_available"] is True
    assert (await client.get(_staff_url(template.id))).json()[0]["account_available"] is False

    # The manager confirms it is them after all.
    linked = await _link(client, template.id, owner)
    assert linked["user_id"] == troll.id
    claim = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == troll.id))).scalar_one()
    assert claim.status == "linked", "the held claim becomes the link, not a second row"


@pytest.mark.asyncio
async def test_plain_staff_cannot_link_invite_or_make_co_managers(client, db, owner, other):
    template = await _weekly_schedule(db, owner.id)
    plain = (await client.post(_staff_url(template.id), json={"user_id": other.id}, headers=auth_headers(owner))).json()
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=auth_headers(owner))
    sock = await _user(db, "sock@example.com", callsign="KB1JCX")
    staff = {s["user_callsign"]: s for s in (await client.get(_staff_url(template.id), headers=auth_headers(owner))).json()}
    h = auth_headers(other)
    assert (await client.patch(f"{_staff_url(template.id)}/{staff['KB1JCX']['id']}", json={"link": True}, headers=h)).status_code == 403
    assert (await client.patch(f"{_staff_url(template.id)}/{plain['id']}", json={"is_co_manager": True}, headers=h)).status_code == 403
    invite = await client.post(_staff_url(template.id), json={"callsign": "KB1NEW", "invite_email": "x@example.com"}, headers=h)
    assert invite.status_code == 403
    # Renaming a placeholder onto an account is a link too.
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCZ"}, headers=auth_headers(owner))
    typo = [s for s in (await client.get(_staff_url(template.id), headers=h)).json() if s["user_callsign"] == "KB1JCZ"][0]
    assert (await client.patch(f"{_staff_url(template.id)}/{typo['id']}", json={"callsign": "KB1JCX"}, headers=h)).status_code == 403
    db.expunge_all()
    assert all(r.user_id != sock.id for r in (await db.execute(select(TemplateStaff))).scalars().all())


@pytest.mark.asyncio
async def test_resent_invites_count_and_one_address_is_capped(client, db, owner, monkeypatch):
    """T1: re-sending used to overwrite the row and never count."""
    from app.services import callsign_people
    monkeypatch.setattr(callsign_people, "INVITES_PER_DAY", 3)
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    staff = (await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=headers)).json()
    codes = [(await client.patch(f"{_staff_url(template.id)}/{staff['id']}", json={"invite_email": f"v{i}@example.com"},
                                 headers=headers)).status_code for i in range(5)]
    assert codes == [200, 200, 200, 429, 429]
    monkeypatch.setattr(callsign_people, "INVITES_PER_DAY", 100)
    codes = [(await client.patch(f"{_staff_url(template.id)}/{staff['id']}", json={"invite_email": "victim@example.com"},
                                 headers=headers)).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


@pytest.mark.asyncio
async def test_sign_in_survives_two_contacts_with_one_address(db, owner):
    """T3: Contact.email is not unique; a shared address must not break sign-in."""
    from app.routers.auth import get_or_create_user
    db.add_all([Contact(callsign="KB1AAA", email="family@example.com"), Contact(callsign="KB1AAB", email="family@example.com")])
    await db.commit()
    user = await get_or_create_user(db, "family@example.com", "family@example.com", "email", "family@example.com")
    assert user.callsign == "KB1AAA"


@pytest.mark.asyncio
async def test_banned_account_takes_over_nothing(db, owner):
    template = await _weekly_schedule(db, owner.id)
    db.add(TemplateStaff(template_id=template.id, callsign="KB1JCX", is_active=True))
    banned = await _user(db, "b@example.com", callsign="KB1JCX")
    banned.is_active = False
    await db.commit()
    outcome = await claim_callsign_placeholders(db, banned)
    assert outcome.claims == [] and outcome.held == []


@pytest.mark.asyncio
async def test_an_account_already_on_staff_merges_rather_than_duplicates(client, db, owner):
    template = await _weekly_schedule(db, owner.id)
    newcomer = await _user(db, "ken@example.com", callsign=None)
    db.add(TemplateStaff(template_id=template.id, user_id=newcomer.id, is_active=True))
    db.add(TemplateStaff(template_id=template.id, callsign="KB1JCX", is_active=True))
    await db.commit()
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(newcomer))
    await _link(client, template.id, owner)
    db.expunge_all()
    rows = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalars().all()
    assert [(r.user_id, r.callsign) for r in rows] == [(newcomer.id, None)]


@pytest.mark.asyncio
async def test_duplicate_rotation_rows_do_not_break_schedule_reads(client, db, owner, other):
    """T9/T7: a rotation may list one operator twice; reads must not 500."""
    template = await _weekly_schedule(db, owner.id)
    db.add_all([NCSRotationMember(template_id=template.id, user_id=other.id, position=1, is_active=True),
                NCSRotationMember(template_id=template.id, user_id=other.id, position=2, is_active=True)])
    await db.commit()
    resp = await client.get(f"/api/templates/{template.id}", headers=auth_headers(other))
    assert resp.status_code == 200, resp.text


# ========== UNDOING A CLAIM ==========

async def _troll_linked(client, db, owner):
    """A manager is fooled into linking a troll who signed up with KB1JCX."""
    template, net_id, past_id = await _placeholders_everywhere(client, db, owner)
    troll = await _user(db, "troll@example.com", callsign=None)
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(troll))
    await _link(client, template.id, owner)
    return template, net_id, past_id, troll


@pytest.mark.asyncio
async def test_admin_revert_restores_every_entry_and_blocks_retaking(client, db, owner, admin):
    template, net_id, past_id, troll = await _troll_linked(client, db, owner)
    claims = (await client.get(f"/api/users/{troll.id}/callsign-claims", headers=auth_headers(admin))).json()
    assert len(claims) == 1 and claims[0]["entries"] >= 4 and claims[0]["status"] == "linked"
    assert (await client.get(f"/api/users/{troll.id}/callsign-claims", headers=auth_headers(owner))).status_code == 403

    reverted = await client.post(f"/api/users/{troll.id}/callsign-claims/{claims[0]['id']}/revert", headers=auth_headers(admin))
    assert reverted.status_code == 200, reverted.text

    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert (staff.user_id, staff.callsign, staff.is_co_manager) == (None, "KB1JCX", False)
    member = (await db.execute(select(NCSRotationMember).where(NCSRotationMember.template_id == template.id))).scalar_one()
    assert (member.user_id, member.callsign) == (None, "KB1JCX")
    for nid in (net_id, past_id):
        assert (await db.execute(select(NetRole).where(NetRole.net_id == nid))).scalars().all() == []
        assert [r.callsign for r in (await db.execute(select(NetCallsignRole).where(NetCallsignRole.net_id == nid))).scalars().all()] == ["KB1JCX"]
    detail = (await client.get(f"/api/nets/{net_id}", headers=auth_headers(troll))).json()
    assert not any(detail["actions"].values())

    # Neither this account nor a second one gets it back by editing a profile.
    await client.put("/api/users/me", json={"callsign": "KB1JCQ"}, headers=auth_headers(troll))
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(troll))
    sock = await _user(db, "sock@example.com", callsign=None)
    await client.put("/api/users/me", json={"callsigns": ["KB1JCX"]}, headers=auth_headers(sock))
    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert staff.user_id is None

    again = await client.post(f"/api/users/{troll.id}/callsign-claims/{claims[0]['id']}/revert", headers=auth_headers(admin))
    assert again.status_code == 400


@pytest.mark.asyncio
async def test_revert_clears_co_manager_and_duty_roles_from_the_window(client, db, owner, admin):
    """T4 + T9: what the troll got while linked doesn't survive the revert."""
    template, net_id, _past, troll = await _troll_linked(client, db, owner)
    staff = (await client.get(_staff_url(template.id), headers=auth_headers(owner))).json()[0]
    await client.patch(f"{_staff_url(template.id)}/{staff['id']}", json={"is_co_manager": True}, headers=auth_headers(owner))
    # A net auto-created while the troll held the rotation slot.
    db.expunge_all()
    tpl = (await db.execute(select(NetTemplate).options(selectinload(NetTemplate.frequencies)).where(NetTemplate.id == template.id))).scalar_one()
    later_net = await NCSReminderService()._get_or_create_scheduled_net(db, tpl, _next_sunday_1400() + timedelta(days=7))
    assert (await db.execute(select(NetRole).where(NetRole.net_id == later_net))).scalar_one().user_id == troll.id

    await client.put(f"/api/users/{troll.id}/ban", headers=auth_headers(admin))
    db.expunge_all()
    staff_row = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert (staff_row.user_id, staff_row.is_co_manager) == (None, False)
    assert (await db.execute(select(NetRole).where(NetRole.net_id == later_net, NetRole.user_id == troll.id))).scalars().all() == []
    assert [r.callsign for r in (await db.execute(select(NetCallsignRole).where(NetCallsignRole.net_id == later_net))).scalars().all()] == ["KB1JCX"]


@pytest.mark.asyncio
async def test_ban_reverts_all_claims(client, db, owner, admin):
    template, net_id, _past, troll = await _troll_linked(client, db, owner)
    ban = await client.put(f"/api/users/{troll.id}/ban", headers=auth_headers(admin))
    assert ban.status_code == 200, ban.text
    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert staff.user_id is None and staff.callsign == "KB1JCX"
    claim = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == troll.id))).scalar_one()
    assert claim.reverted_at is not None and claim.reverted_by_id == admin.id
    # And a banned account is never offered for linking again.
    listed = (await client.get(_staff_url(template.id), headers=auth_headers(owner))).json()[0]
    assert listed["account_available"] is False


@pytest.mark.asyncio
async def test_ban_frees_the_callsign_for_the_real_operator(client, db, owner, admin):
    """The primary callsign is unique: without this, the real operator got
    'already in use' until an admin renamed the banned account."""
    _template, _net, _past, troll = await _troll_linked(client, db, owner)
    ban = (await client.put(f"/api/users/{troll.id}/ban", headers=auth_headers(admin))).json()
    assert (ban["callsign"], ban["banned_callsign"]) == (None, "KB1JCX")

    real = await _user(db, "real@example.com", callsign=None)
    resp = await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(real))
    assert resp.status_code == 200, resp.text

    # Unbanning can't take it back from the real operator.
    unban = (await client.put(f"/api/users/{troll.id}/unban", headers=auth_headers(admin))).json()
    assert (unban["callsign"], unban["banned_callsign"]) == (None, "KB1JCX")


@pytest.mark.asyncio
async def test_unban_restores_a_callsign_nobody_took(client, db, admin):
    user = await _user(db, "mistake@example.com", callsign="KB1MIS")
    await client.put(f"/api/users/{user.id}/ban", headers=auth_headers(admin))
    unban = (await client.put(f"/api/users/{user.id}/unban", headers=auth_headers(admin))).json()
    assert (unban["callsign"], unban["banned_callsign"], unban["is_active"]) == ("KB1MIS", None, True)


@pytest.mark.asyncio
async def test_guests_are_not_told_who_has_an_account(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner)
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=auth_headers(owner))
    staff = (await client.get(_staff_url(template.id))).json()
    members = (await client.get(_members_url(template.id))).json()
    schedule = (await client.get(f"/api/templates/{template.id}/ncs-rotation/schedule")).json()
    assert staff and all(s["has_account"] and not s["invited"] for s in staff)
    assert members and all(m["has_account"] for m in members)
    assert schedule["schedule"] and all(e["has_account"] for e in schedule["schedule"])
    # Signed in, the same entries say so.
    signed_in = (await client.get(_staff_url(template.id), headers=auth_headers(owner))).json()
    assert [s["has_account"] for s in signed_in] == [False]


@pytest.mark.asyncio
async def test_deleting_an_account_reverts_its_claims(client, db, owner, admin):
    template, _net, _past, troll = await _troll_linked(client, db, owner)
    resp = await client.delete(f"/api/users/{troll.id}", headers=auth_headers(admin))
    assert resp.status_code == 204, resp.text
    db.expunge_all()
    staff = (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalar_one()
    assert (staff.user_id, staff.callsign) == (None, "KB1JCX")


@pytest.mark.asyncio
async def test_revert_leaves_entries_the_manager_changed_since(client, db, owner, admin):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=headers)
    troll = await _user(db, "troll@example.com", callsign=None)
    await client.put("/api/users/me", json={"callsign": "KB1JCX"}, headers=auth_headers(troll))
    staff = await _link(client, template.id, owner)
    await client.delete(f"{_staff_url(template.id)}/{staff['id']}", headers=headers)
    claim = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == troll.id))).scalar_one()
    resp = await client.post(f"/api/users/{troll.id}/callsign-claims/{claim.id}/revert", headers=auth_headers(admin))
    assert resp.json()["restored"] == 0
    assert (await db.execute(select(TemplateStaff).where(TemplateStaff.template_id == template.id))).scalars().all() == []


# ========== TYPOS ==========

@pytest.mark.asyncio
async def test_fixing_a_typo_renames_staff_and_rotation_together(client, db, owner):
    template = await _rotation_of_one_callsign(client, db, owner, "KB1JCZ")
    headers = auth_headers(owner)
    staff = (await client.post(_staff_url(template.id), json={"callsign": "KB1JCZ"}, headers=headers)).json()
    fixed = await client.patch(f"{_staff_url(template.id)}/{staff['id']}", json={"callsign": "kb1jcx"}, headers=headers)
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["user_callsign"] == "KB1JCX"
    members = (await client.get(_members_url(template.id))).json()
    assert [m["user_callsign"] for m in members] == ["KB1JCX"]


@pytest.mark.asyncio
async def test_fixing_a_typo_to_an_account_links_it(client, db, owner, other):
    template = await _rotation_of_one_callsign(client, db, owner, "KC1OTZ")
    headers = auth_headers(owner)
    member = (await client.get(_members_url(template.id))).json()[0]
    fixed = await client.patch(f"{_members_url(template.id)}/{member['id']}", json={"callsign": other.callsign}, headers=headers)
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["user_id"] == other.id
    claim = (await db.execute(select(CallsignClaim).where(CallsignClaim.user_id == other.id))).scalar_one()
    assert claim.callsign == other.callsign


@pytest.mark.asyncio
async def test_account_entries_cannot_be_relinked(client, db, owner, other):
    template = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    staff = (await client.post(_staff_url(template.id), json={"user_id": other.id}, headers=headers)).json()
    resp = await client.patch(f"{_staff_url(template.id)}/{staff['id']}", json={"callsign": "KB1JCX"}, headers=headers)
    assert resp.status_code == 400


# ========== MERGE ==========

@pytest.mark.asyncio
async def test_merge_keeps_every_callsign_only_entry(client, db, owner):
    target = await _weekly_schedule(db, owner.id)
    source = await _weekly_schedule(db, owner.id)
    headers = auth_headers(owner)
    await client.post(_staff_url(target.id), json={"callsign": "KB1AAA"}, headers=headers)
    await client.post(_staff_url(source.id), json={"callsign": "KB1BBB"}, headers=headers)
    await client.post(_staff_url(source.id), json={"callsign": "KB1AAA"}, headers=headers)
    resp = await client.post("/api/templates/merge", json={"target_template_id": target.id, "source_template_ids": [source.id]}, headers=headers)
    assert resp.status_code == 200, resp.text
    callsigns = sorted(s["user_callsign"] for s in (await client.get(_staff_url(target.id))).json())
    assert callsigns == ["KB1AAA", "KB1BBB"]


# ========== HELPERS ==========

def test_normalize_callsign_accepts_portables():
    assert normalize_callsign(" w1aw/m ") == "W1AW/M"
    assert normalize_callsign("VE3/K1ABC") == "VE3/K1ABC"
    assert normalize_callsign("wrop123") == "WROP123"


@pytest.mark.asyncio
async def test_find_user_prefers_primary_and_tolerates_shared_extras(db):
    primary = await _user(db, "p@example.com", callsign="W1XYZ")
    await _user(db, "x1@example.com", callsign="K1AAA", callsigns=json.dumps(["W1XYZ", "N1CLB"]))
    await _user(db, "x2@example.com", callsign="K1BBB", callsigns=json.dumps(["N1CLB"]))
    assert (await find_user_by_callsign(db, "w1xyz")).id == primary.id
    assert (await find_user_by_callsign(db, "N1CLB")) is not None
    assert (await find_user_by_callsign(db, "N1CL")) is None


@pytest.mark.asyncio
async def test_callsign_only_entry_cannot_be_made_co_manager(client, db, owner):
    """A callsign-only entry's flags pass to whoever takes the callsign over,
    so co-manager (schedule-ownership tier) must wait for a real account."""
    template = await _weekly_schedule(db, owner.id)
    staff = (await client.post(_staff_url(template.id), json={"callsign": "KB1JCX"}, headers=auth_headers(owner))).json()
    resp = await client.patch(f"{_staff_url(template.id)}/{staff['id']}", json={"is_co_manager": True}, headers=auth_headers(owner))
    assert resp.status_code == 400
