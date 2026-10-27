"""
Admin > Users > Possible duplicates (services/account_duplicates.py).

Each rule flags a pair; a first name, a shared sign-in address, or a
callsign that differs only by /suffix never flags one alone, since those
are how different people and a club's per-station accounts look too.
"""
import json

import pytest

from app.models import AuditEvent, CheckIn, Net, NetStatus, User, UserRole
from app.services.account_duplicates import base_callsign, find_possible_duplicates
from tests.conftest import auth_headers


async def _users(db, *rows):
    users = [User(role=UserRole.USER, is_active=True, **row) for row in rows]
    db.add_all(users)
    await db.commit()
    return users


async def _pairs(db):
    return {tuple(p["user_ids"]): p for p in await find_possible_duplicates(db)}


def test_base_callsign():
    assert [base_callsign(c) for c in ("KD1OM/1", "VE/KD1OM", "kd1om/p", "KD1OM")] == ["KD1OM"] * 4


@pytest.mark.asyncio
async def test_each_rule_flags_a_pair(db):
    howard, gmail, upper, lower, prev, renamed, bill, bill2 = await _users(
        db,
        dict(email="k9npd@arrl.example", callsign="K9NPD"),
        dict(email="k9npdnh@gmail.example"),                       # callsign in the other's email
        dict(email="Toody@outlook.example", callsign="W1NHD"),
        dict(email="toody@outlook.example"),                       # same email
        dict(email="a@example.com", callsign="KC1OLD", previous_callsigns=json.dumps(["N1NEW"])),
        dict(email="b@example.com", callsign="N1NEW"),            # same callsign (previous)
        dict(email="c@example.com", callsign="W1WFG", name="William Glennon"),
        dict(email="d@example.com", name="william  glennon"),      # same full name
    )
    pairs = await _pairs(db)
    assert pairs[(howard.id, gmail.id)]["reasons"] == ["Callsign in the other's email"]
    assert pairs[(howard.id, gmail.id)]["keep_id"] == howard.id
    assert pairs[(upper.id, lower.id)]["reasons"] == ["Same email"]
    assert pairs[(prev.id, renamed.id)]["reasons"] == ["Same callsign"]
    assert pairs[(bill.id, bill2.id)]["reasons"] == ["Same full name"]
    assert len(pairs) == 4


@pytest.mark.asyncio
async def test_weak_matches_never_flag_alone_but_back_up_a_flag(db):
    tom1, tom2, club, club_hf, steve, steve_p = await _users(
        db,
        dict(email="tom1@example.com", callsign="WA1TOM", name="Tom"),
        dict(email="tom2@example.com", callsign="KD1KE", name="Tom"),       # first name only
        dict(email="club@example.com", callsign="WS1EC", name="Radio Room"),
        dict(email="club.hf@example.com", callsign="WS1EC/HF"),             # station account
        dict(email="steve@example.com", callsign="KD1OM", name="Steve Jordan"),
        dict(email="sj@example.com", callsign="KD1OM/1", name="Steve Jordan"),
    )
    for user in (tom1, tom2, club, club_hf, steve, steve_p):
        db.add(AuditEvent(action="auth.signed_in", actor_user_id=user.id, ip="198.51.100.7"))
    await db.commit()

    pairs = await _pairs(db)
    assert list(pairs) == [(steve.id, steve_p.id)]
    assert pairs[(steve.id, steve_p.id)]["reasons"] == [
        "Same full name", "Same callsign apart from /suffix", "Same sign-in address",
    ]


@pytest.mark.asyncio
async def test_suggests_keeping_the_account_with_history_and_skips_banned(db, admin):
    older, newer, banned = await _users(
        db,
        dict(email="pat.one@example.com", name="Pat Smith"),
        dict(email="pat.two@example.com", name="Pat Smith"),
        dict(email="pat.three@example.com", name="Pat Smith"),
    )
    banned.is_active = False
    net = Net(name="Test Net", owner_id=admin.id, status=NetStatus.CLOSED)
    db.add(net)
    await db.flush()
    db.add(CheckIn(net_id=net.id, user_id=newer.id, callsign="KC1PAT", name="Pat", location="Here"))
    await db.commit()

    pairs = await _pairs(db)
    assert list(pairs) == [(older.id, newer.id)]
    assert pairs[(older.id, newer.id)]["keep_id"] == newer.id


@pytest.mark.asyncio
async def test_endpoint_is_admin_only(client, db, owner, admin):
    await _users(db, dict(email="kc1own@gmail.example"))
    resp = await client.get("/api/users/duplicates", headers=auth_headers(admin))
    assert resp.status_code == 200
    assert resp.json()[0]["reasons"] == ["Callsign in the other's email"]
    assert (await client.get("/api/users/duplicates", headers=auth_headers(owner))).status_code == 403
