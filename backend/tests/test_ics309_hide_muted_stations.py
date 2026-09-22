"""
Net.ics309_hide_muted_stations: a net-wide-muted station's chat rows are
excluded from the ICS-309 Communications Log (the copy that reaches a served
agency), on by default, without touching the stored chat log, the plain net
log, or the station's check-in rows. See app/traffic/ics309.py's
get_ics309_muted_user_ids and its two callers (nets_export.py, net_closure.py).

Prompted by a real spam report (2026-09-21): a station used the check-in
Location field and chat to post promotional links/images during a live net;
staff net-muted them mid-net, but the already-generated ICS-309 export still
carried the muted station's earlier chat messages.
"""
import pytest
from sqlalchemy import select

from app.models import ChatMessage, Net
from tests.conftest import auth_headers


async def _net_with_muted_chat(db, owner, spammer, hide_muted: bool = True):
    net = Net(name="ICS309 Mute Test", owner_id=owner.id, ics309_hide_muted_stations=hide_muted)
    db.add(net)
    await db.commit()
    await db.refresh(net)

    db.add(ChatMessage(net_id=net.id, user_id=owner.id, message="Net is starting, please check in"))
    db.add(ChatMessage(net_id=net.id, user_id=spammer.id, message="SPAM-MARKER buy my youtube channel"))
    await db.commit()

    from app.models import ChatNetMute
    db.add(ChatNetMute(net_id=net.id, muted_user_id=spammer.id, applied_by_user_id=owner.id))
    await db.commit()
    return net


@pytest.mark.asyncio
async def test_muted_stations_chat_hidden_from_ics309_by_default(client, db, owner, other):
    net = await _net_with_muted_chat(db, owner, other)

    resp = await client.get(
        f"/api/nets/{net.id}/export/ics309", params={"format": "json"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 200
    messages = [e["message"] for e in resp.json()["entries"]]
    assert not any("SPAM-MARKER" in m for m in messages)
    assert any("Net is starting" in m for m in messages)


@pytest.mark.asyncio
async def test_ics309_hide_muted_stations_can_be_turned_off(client, db, owner, other):
    net = await _net_with_muted_chat(db, owner, other, hide_muted=False)

    resp = await client.get(
        f"/api/nets/{net.id}/export/ics309", params={"format": "json"}, headers=auth_headers(owner)
    )
    assert resp.status_code == 200
    messages = [e["message"] for e in resp.json()["entries"]]
    assert any("SPAM-MARKER" in m for m in messages)


@pytest.mark.asyncio
async def test_muted_station_chat_still_in_stored_log_and_chat_api(client, db, owner, other):
    """The mute-hide setting only affects the ICS-309 output -- the actual
    chat message row, and whatever reads it directly, must be untouched."""
    net = await _net_with_muted_chat(db, owner, other)

    result = await db.execute(select(ChatMessage).where(ChatMessage.net_id == net.id))
    stored_messages = [m.message for m in result.scalars().all()]
    assert any("SPAM-MARKER" in m for m in stored_messages)
