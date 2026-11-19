"""
Two entries on one frequency are different repeaters when their description,
offset or tones differ (2026-11-17, issue #14). Until then only frequency,
mode, network and talkgroup were compared, so the second repeater on 147.090
was refused as a duplicate.
"""
from tests.conftest import auth_headers

FALMOUTH = {"frequency": "147.090", "mode": "FM", "description": "ME-Falmouth Repeater",
            "offset": "+0.600", "tx_tone": "100.0", "rx_tone": "100.0"}


async def _add(client, user, payload):
    return await client.post("/api/frequencies", json=payload, headers=auth_headers(user))


async def test_another_repeater_on_the_same_frequency(client, owner):
    assert (await _add(client, owner, FALMOUTH)).status_code == 201
    r = await _add(client, owner, {**FALMOUTH, "description": "NH-Lakes Region Repeater", "tx_tone": "88.5", "rx_tone": "88.5"})
    assert r.status_code == 201


async def test_same_name_with_a_different_tone_is_different(client, owner):
    assert (await _add(client, owner, FALMOUTH)).status_code == 201
    assert (await _add(client, owner, {**FALMOUTH, "tx_tone": "88.5", "rx_tone": "88.5"})).status_code == 201


async def test_identical_entry_is_refused_ignoring_case_and_spaces(client, owner):
    assert (await _add(client, owner, FALMOUTH)).status_code == 201
    r = await _add(client, owner, {**FALMOUTH, "description": "  me-falmouth repeater "})
    assert r.status_code == 409
    assert "ME-Falmouth Repeater" in r.json()["detail"]


async def test_blank_and_missing_fields_match(client, owner):
    plain = {"frequency": "146.520", "mode": "FM"}
    assert (await _add(client, owner, plain)).status_code == 201
    r = await _add(client, owner, {**plain, "description": "", "network": "", "talkgroup": ""})
    assert r.status_code == 409


async def test_edit_into_an_identical_entry_is_refused(client, owner):
    assert (await _add(client, owner, FALMOUTH)).status_code == 201
    other = (await _add(client, owner, {**FALMOUTH, "description": "NH-Lakes Region Repeater"})).json()
    r = await client.put(f"/api/frequencies/{other['id']}", json=FALMOUTH, headers=auth_headers(owner))
    assert r.status_code == 409
    # Saving an entry unchanged is not a duplicate of itself.
    r = await client.put(f"/api/frequencies/{other['id']}", json={**FALMOUTH, "description": "NH-Lakes Region Repeater"},
                         headers=auth_headers(owner))
    assert r.status_code == 200
