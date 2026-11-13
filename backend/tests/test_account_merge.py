"""
Merging a second account into an operator's original one
(services/account_merge.py, routers/users.py MERGE ACCOUNTS).

K9NPD, 2026-10-27: signed up again with a new address and couldn't use
his callsign. An admin merges the new account into the original: its rows
move, its address becomes a backup sign-in address there, and it is gone.
"""
import json

import pyotp
import pytest
from sqlalchemy import select

from app.auth import create_magic_link_token, encrypt_mfa_secret
from app.database import Base
from app.email_service import EmailService
from app.models import (
    AuditEvent, ChatMessage, ChatMute, CheckIn, NCSRotationMember, Net, NetRole, NetStatus, NetTemplate,
    NetTemplateSubscription, TemplateStaff, User, UserEmail, UserRole,
)
from app.services.account_merge import SOFT_UNIQUE, user_columns
from tests.conftest import auth_headers


@pytest.fixture()
async def admin_code(db, admin):
    secret = pyotp.random_base32()
    admin.mfa_secret_encrypted = encrypt_mfa_secret(secret)
    await db.commit()
    return lambda: pyotp.TOTP(secret).now()


@pytest.fixture()
def notices(monkeypatch):
    sent = []

    async def _notice(to_email, change, address, by_admin, other=""):
        sent.append((to_email, change, address))

    monkeypatch.setattr(EmailService, "send_sign_in_address_notice", staticmethod(_notice))
    return sent


@pytest.fixture()
async def pair(db):
    """Howard's shape: the original holds the callsign and history, the
    second account is new."""
    original = User(email="k9npd@arrl.example", callsign="K9NPD", role=UserRole.USER, is_active=True,
                    oauth_provider="email", oauth_id="k9npd@arrl.example")
    second = User(email="k9npd@gmail.example", name="Howard", location="Concord, NH", role=UserRole.USER,
                  is_active=True, oauth_provider="email", oauth_id="k9npd@gmail.example")
    db.add_all([original, second])
    await db.commit()
    return original, second


async def _merge(client, admin, admin_code, target, source, choices=None):
    body = {"source_id": source.id, "mfa_code": admin_code()}
    if choices is not None:
        body["choices"] = choices
    return await client.post(f"/api/users/{target.id}/merge", json=body, headers=auth_headers(admin))


# ========== EVERY ACCOUNT REFERENCE IS COVERED ==========

def test_every_users_column_is_found_from_the_models():
    """user_columns() reads the foreign keys, so a new table is merged with
    no change. A column holding an account id WITHOUT a foreign key would
    be missed: name it here (and handle it in merge_accounts) or give it one."""
    handled_without_fk = {("audit_events", "actor_user_id"), ("audit_events", "subject_user_id")}
    found = {(c.table, c.column) for c in user_columns()}
    suspects = set()
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            name = column.name
            looks_like_user = name.endswith("user_id") or name.endswith("_by_id") or name == "owner_id"
            if looks_like_user and not column.foreign_keys:
                suspects.add((table.name, name))
    assert suspects - handled_without_fk == set()
    assert len(found) >= 40
    for (table, column), keys in SOFT_UNIQUE.items():
        assert column in Base.metadata.tables[table].c
        assert all(k in Base.metadata.tables[table].c for k in keys)


# ========== MERGING ==========

@pytest.mark.asyncio
async def test_merge_moves_everything_and_keeps_the_originals_copy(client, db, admin, admin_code, pair, notices):
    original, second = pair
    template = NetTemplate(name="Granite State Net", owner_id=admin.id, schedule_type="weekly",
                           schedule_config='{"time": "19:00", "day_of_week": 1, "timezone": "UTC"}')
    db.add(template)
    await db.flush()
    net = Net(name="Granite State Net", owner_id=admin.id, template_id=template.id, status=NetStatus.CLOSED)
    db.add(net)
    await db.flush()
    db.add_all([
        CheckIn(net_id=net.id, user_id=second.id, callsign="K9NPD", name="Howard", location="Concord, NH"),
        CheckIn(net_id=net.id, user_id=original.id, callsign="K9NPD", name="Howard", location="Concord, NH"),
        # Both on the staff: the original's row (co-manager) stays.
        TemplateStaff(template_id=template.id, user_id=original.id, is_active=True, is_co_manager=True),
        TemplateStaff(template_id=template.id, user_id=second.id, is_active=True, is_co_manager=False),
        # Both in the rotation and both subscribed: one each afterwards.
        NCSRotationMember(template_id=template.id, user_id=original.id, position=1, is_active=True),
        NCSRotationMember(template_id=template.id, user_id=second.id, position=2, is_active=True),
        NetTemplateSubscription(template_id=template.id, user_id=original.id),
        NetTemplateSubscription(template_id=template.id, user_id=second.id),
        NetRole(net_id=net.id, user_id=second.id, role="LOGGER", is_active=True),
        ChatMute(net_id=net.id, muter_user_id=second.id, muted_user_id=original.id),
        ChatMessage(net_id=net.id, user_id=admin.id, message="@K9NPD thanks", mentioned_user_ids=json.dumps([second.id])),
        AuditEvent(action="auth.signed_in", actor_user_id=second.id, actor_label="k9npd@gmail.example"),
    ])
    await db.commit()

    preview = await client.get(f"/api/users/{original.id}/merge-preview", params={"source_id": second.id},
                               headers=auth_headers(admin))
    assert preview.status_code == 200, preview.text
    moves = {m["label"]: m["count"] for m in preview.json()["moves"]}
    assert moves["Check-ins"] == 1 and moves["Net roles"] == 1 and moves["Sign-in addresses"] == 1
    assert preview.json()["source"]["email"] == "k9npd@gmail.example"

    second_id, oid, net_id, template_id = second.id, original.id, net.id, template.id
    resp = await _merge(client, admin, admin_code, original, second)
    assert resp.status_code == 200, resp.text
    db.expire_all()

    assert (await db.execute(select(User).where(User.id == second_id))).scalar_one_or_none() is None
    rows = lambda model, **kw: db.execute(select(model).filter_by(**kw))  # noqa: E731
    assert [c.user_id for c in (await rows(CheckIn, net_id=net_id)).scalars()] == [oid, oid]
    [staff] = (await rows(TemplateStaff, template_id=template_id)).scalars().all()
    assert staff.is_co_manager is True
    [rotation] = (await rows(NCSRotationMember, template_id=template_id)).scalars().all()
    assert rotation.position == 1
    assert len((await rows(NetTemplateSubscription, template_id=template_id)).scalars().all()) == 1
    assert [r.user_id for r in (await rows(NetRole, net_id=net_id)).scalars()] == [oid]
    assert (await rows(ChatMute, net_id=net_id)).scalars().all() == []  # would have muted himself
    [mention] = (await rows(ChatMessage, net_id=net_id)).scalars().all()
    assert json.loads(mention.mentioned_user_ids) == [oid]
    signed_in = (await rows(AuditEvent, action="auth.signed_in")).scalars().one()
    assert signed_in.actor_user_id == oid
    merged = (await rows(AuditEvent, action="user.merged")).scalars().one()
    assert json.loads(merged.details)["merged"]["email"] == "k9npd@gmail.example"

    # The original's blanks are filled; its callsign stays.
    merged_user = (await db.execute(select(User).where(User.id == oid))).scalar_one()
    assert (merged_user.callsign, merged_user.name, merged_user.location) == ("K9NPD", "Howard", "Concord, NH")

    # The second address now signs in to the original, and both are told.
    assert [e.email for e in (await rows(UserEmail, user_id=oid)).scalars()] == ["k9npd@gmail.example"]
    signed = await client.post("/api/auth/magic-link/verify", json={"token": create_magic_link_token("k9npd@gmail.example")})
    assert signed.json()["user"]["id"] == oid
    assert sorted(to for to, change, _ in notices if change == "merged") == ["k9npd@arrl.example", "k9npd@gmail.example"]


@pytest.mark.asyncio
async def test_a_second_primary_callsign_is_kept_as_an_additional_one(client, db, admin, admin_code, pair, notices):
    """Still pickable at check-in, not hidden as a previous callsign."""
    original, second = pair
    second.callsign = "K9NPD/1"
    await db.commit()
    oid = original.id
    assert (await _merge(client, admin, admin_code, original, second)).status_code == 200
    db.expire_all()
    merged_user = (await db.execute(select(User).where(User.id == oid))).scalar_one()
    assert merged_user.callsign == "K9NPD"
    assert json.loads(merged_user.callsigns) == ["K9NPD/1"]
    assert json.loads(merged_user.previous_callsigns) == []


@pytest.mark.asyncio
async def test_admin_picks_each_value_from_either_account(client, db, admin, admin_code, notices):
    """KD1OM, 2026-11-13: two accounts, KD1OM on the older and KD1OM/1 on
    the newer, which has the address he uses. Merging the older into the
    newer, the admin keeps KD1OM as the callsign and the newer address as
    primary; the rest of each account comes along."""
    older = User(email="op@yahoo.example", callsign="KD1OM", name="Steve", location="Gorham, ME",
                 role=UserRole.USER, is_active=True, oauth_provider="email", oauth_id="op@yahoo.example")
    newer = User(email="op@gmail.example", callsign="KD1OM/1", name="Steve J", role=UserRole.USER,
                 is_active=True, oauth_provider="email", oauth_id="op@gmail.example")
    db.add_all([older, newer])
    await db.commit()
    kept_id = newer.id

    resp = await _merge(client, admin, admin_code, newer, older,
                        choices={"callsign": "source", "name": "target", "email": "target"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    kept = (await db.execute(select(User).where(User.id == kept_id))).scalar_one()
    assert (kept.email, kept.callsign, kept.name, kept.location) == ("op@gmail.example", "KD1OM", "Steve J", "Gorham, ME")
    assert json.loads(kept.callsigns) == ["KD1OM/1"]
    backups = [e.email for e in (await db.execute(select(UserEmail).where(UserEmail.user_id == kept_id))).scalars()]
    assert backups == ["op@yahoo.example"]
    for address in ("op@gmail.example", "op@yahoo.example"):
        signed = await client.post("/api/auth/magic-link/verify", json={"token": create_magic_link_token(address)})
        assert signed.json()["user"]["id"] == kept_id
    merged = (await db.execute(select(AuditEvent).where(AuditEvent.action == "user.merged"))).scalars().one()
    assert json.loads(merged.details)["taken_from_merged"] == ["callsign"]


@pytest.mark.asyncio
async def test_the_merged_accounts_address_can_become_primary(client, db, admin, admin_code, pair, notices):
    """The kept account's own address becomes the backup, and both still
    sign in to it."""
    original, second = pair
    oid = original.id
    resp = await _merge(client, admin, admin_code, original, second, choices={"email": "source"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    kept = (await db.execute(select(User).where(User.id == oid))).scalar_one()
    assert (kept.email, kept.oauth_id) == ("k9npd@gmail.example", "k9npd@gmail.example")
    backups = [e.email for e in (await db.execute(select(UserEmail).where(UserEmail.user_id == oid))).scalars()]
    assert backups == ["k9npd@arrl.example"]
    for address in ("k9npd@gmail.example", "k9npd@arrl.example"):
        signed = await client.post("/api/auth/magic-link/verify", json={"token": create_magic_link_token(address)})
        assert signed.json()["user"]["id"] == oid


@pytest.mark.asyncio
async def test_a_blank_value_is_never_chosen_and_unknown_fields_are_refused(client, db, admin, admin_code, pair, notices):
    original, second = pair
    oid, sid = original.id, second.id
    resp = await _merge(client, admin, admin_code, original, second, choices={"password_hash": "source"})
    assert resp.status_code == 400
    assert (await db.execute(select(User).where(User.id == sid))).scalar_one_or_none() is not None
    # second has no callsign: choosing it leaves the original's.
    assert (await _merge(client, admin, admin_code, original, second, choices={"callsign": "source"})).status_code == 200
    db.expire_all()
    assert (await db.execute(select(User).where(User.id == oid))).scalar_one().callsign == "K9NPD"


@pytest.mark.asyncio
async def test_merge_needs_a_fresh_two_factor_code(client, db, admin, admin_code, pair):
    original, second = pair
    resp = await client.post(f"/api/users/{original.id}/merge", json={"source_id": second.id, "mfa_code": "000000"},
                             headers=auth_headers(admin))
    assert resp.status_code == 403
    assert (await db.execute(select(User).where(User.id == second.id))).scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_merge_refuses_itself_a_banned_account_and_the_admins_own(client, db, admin, admin_code, pair):
    original, second = pair
    assert (await _merge(client, admin, admin_code, original, original)).status_code == 400
    assert (await _merge(client, admin, admin_code, original, admin)).status_code == 400
    second.is_active = False
    await db.commit()
    assert (await _merge(client, admin, admin_code, original, second)).status_code == 400
    # Admins only.
    resp = await client.get(f"/api/users/{original.id}/merge-preview", params={"source_id": second.id},
                            headers=auth_headers(original))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_backups_of_the_merged_account_come_along(client, db, admin, admin_code, pair, notices):
    original, second = pair
    db.add(UserEmail(user_id=second.id, email="howard@work.example"))
    await db.commit()
    oid = original.id
    assert (await _merge(client, admin, admin_code, original, second)).status_code == 200
    db.expire_all()
    emails = sorted(e.email for e in (await db.execute(select(UserEmail).where(UserEmail.user_id == oid))).scalars())
    assert emails == ["howard@work.example", "k9npd@gmail.example"]
