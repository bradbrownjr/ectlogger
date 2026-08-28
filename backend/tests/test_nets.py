"""
Net lifecycle smoke tests: create → active → close, plus 403 permission checks.
"""
from unittest.mock import AsyncMock, patch

import pytest
from tests.conftest import auth_headers
from app.models import NetTemplate


async def _make_template(db, owner_id: int, schedule_type: str) -> NetTemplate:
    template = NetTemplate(
        name="Test Schedule",
        owner_id=owner_id,
        schedule_type=schedule_type,
        schedule_config="{}",
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_net(client, owner):
    resp = await client.post(
        "/api/nets/",
        json={"name": "Test Net"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Net"
    assert data["status"] == "draft"
    assert data["owner_id"] == owner.id


@pytest.mark.asyncio
async def test_list_nets(client, owner):
    await client.post("/api/nets/", json={"name": "Net A"}, headers=auth_headers(owner))
    await client.post("/api/nets/", json={"name": "Net B"}, headers=auth_headers(owner))
    resp = await client.get("/api/nets/", headers=auth_headers(owner))
    assert resp.status_code == 200
    names = [n["name"] for n in resp.json()]
    assert "Net A" in names
    assert "Net B" in names


@pytest.mark.asyncio
async def test_get_net_by_id(client, owner):
    create = await client.post("/api/nets/", json={"name": "Specific Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["id"] == net_id


# ---------------------------------------------------------------------------
# template_schedule_type — reported bugs: (1) a post-close "subscribe to the
# next instance" prompt appeared for a one-time net, which will never have a
# next instance; (2) the "Edit net" toolbar button disappeared entirely once
# any net closed, including one occurrence of an ONGOING (e.g. weekly)
# schedule, where staff still legitimately need to fix that net's own
# settings before finalizing its report. Both fixes key off this field, so
# these tests pin what the backend reports for each schedule_type.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_net_template_schedule_type_null_with_no_template(client, owner):
    create = await client.post("/api/nets/", json={"name": "No Template Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))

    assert resp.status_code == 200
    assert resp.json()["template_schedule_type"] is None


@pytest.mark.asyncio
async def test_get_net_template_schedule_type_one_time(client, db, owner):
    template = await _make_template(db, owner.id, schedule_type="one_time")
    create = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    net_id = create.json()["id"]

    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))

    assert resp.status_code == 200
    assert resp.json()["template_schedule_type"] == "one_time"


@pytest.mark.asyncio
async def test_get_net_template_schedule_type_weekly(client, db, owner):
    template = await _make_template(db, owner.id, schedule_type="weekly")
    create = await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))
    net_id = create.json()["id"]

    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))

    assert resp.status_code == 200
    assert resp.json()["template_schedule_type"] == "weekly"


@pytest.mark.asyncio
async def test_list_nets_template_schedule_type_matches_get_net(client, db, owner):
    template = await _make_template(db, owner.id, schedule_type="weekly")
    await client.post(f"/api/templates/{template.id}/create-net", headers=auth_headers(owner))

    resp = await client.get("/api/nets/", headers=auth_headers(owner))

    assert resp.status_code == 200
    nets = [n for n in resp.json() if n["template_id"] == template.id]
    assert len(nets) == 1
    assert nets[0]["template_schedule_type"] == "weekly"


# ---------------------------------------------------------------------------
# is_owner_or_ncs — reported bug: an admin using the frontend's "View as
# Regular User" simulation could still create/edit a net or schedule they
# weren't actually staff of. The simulation only fakes `role` in the
# browser's own state; it never touches the JWT a request authenticates
# with, so can_manage (admin-bypassable) stayed true for a real admin
# regardless of what the UI showed them, and several NetView.tsx/
# NetPaneWindow.tsx/CreateNet.tsx computations read can_manage directly
# instead of the already-existing is_owner_or_ncs field meant for exactly
# this. These tests pin is_owner_or_ncs's own backend behavior (it was
# already implemented, just under-used on the frontend) so a future change
# can't quietly reintroduce the gap the fields are supposed to close.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_net_can_manage_true_but_is_owner_or_ncs_false_for_admin(client, owner, admin):
    create = await client.post("/api/nets/", json={"name": "Admin Sim Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(admin))

    assert resp.status_code == 200
    data = resp.json()
    assert data["can_manage"] is True
    assert data["is_owner_or_ncs"] is False


@pytest.mark.asyncio
async def test_get_net_is_owner_or_ncs_true_for_actual_owner(client, owner):
    create = await client.post("/api/nets/", json={"name": "Owner's Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))

    assert resp.status_code == 200
    data = resp.json()
    assert data["can_manage"] is True
    assert data["is_owner_or_ncs"] is True


@pytest.mark.asyncio
async def test_list_nets_is_owner_or_ncs_matches_get_net(client, owner, admin):
    await client.post("/api/nets/", json={"name": "List Net"}, headers=auth_headers(owner))

    resp = await client.get("/api/nets/", headers=auth_headers(admin))

    assert resp.status_code == 200
    nets = resp.json()
    assert len(nets) >= 1
    for net in nets:
        assert net["can_manage"] is True
        assert net["is_owner_or_ncs"] is False


@pytest.mark.asyncio
async def test_start_net_goes_active(client, owner):
    # No scheduled_start_time → goes straight to ACTIVE
    create = await client.post("/api/nets/", json={"name": "Live Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_close_active_net(client, owner):
    create = await client.post("/api/nets/", json={"name": "Closing Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_full_lifecycle_draft_to_lobby_to_active_to_closed(client, owner):
    from datetime import datetime, timedelta, timezone

    # Create with a future scheduled time so /start goes to LOBBY
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    create = await client.post(
        "/api/nets/",
        json={"name": "Scheduled Net", "scheduled_start_time": future},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    assert create.json()["status"] == "draft"

    # /start → LOBBY
    start = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    assert start.status_code == 200
    assert start.json()["status"] == "lobby"

    # /go-live → ACTIVE
    live = await client.post(f"/api/nets/{net_id}/go-live", headers=auth_headers(owner))
    assert live.status_code == 200
    assert live.json()["status"] == "active"

    # /close → CLOSED
    close = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    assert close.status_code == 200
    assert close.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_lobby_open_sends_notification_go_live_does_not(client, owner):
    """Milestone 0.7 (W1BKW): the "net starting" email must fire once, at lobby
    open, and go-live must send nothing (previously it double-sent: once here
    and again in go_live()).
    """
    from datetime import datetime, timedelta, timezone

    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    create = await client.post(
        "/api/nets/",
        json={"name": "Notify Test Net", "scheduled_start_time": future},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]

    with patch(
        "app.email_service.EmailService.send_net_notification",
        new_callable=AsyncMock,
    ) as mock_notify:
        # /start → LOBBY: this is the one and only send.
        start = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
        assert start.status_code == 200
        assert start.json()["status"] == "lobby"
        mock_notify.assert_called_once()

        # /go-live → ACTIVE: must NOT send again.
        live = await client.post(f"/api/nets/{net_id}/go-live", headers=auth_headers(owner))
        assert live.status_code == 200
        assert live.json()["status"] == "active"
        mock_notify.assert_called_once()  # still just the one call from lobby-open


@pytest.mark.asyncio
async def test_straight_to_active_sends_notification_once(client, owner):
    """Ad-hoc nets (no scheduled_start_time) skip LOBBY entirely, so /start's
    ACTIVE branch is the only place they can be notified - confirm it still
    sends exactly once.
    """
    create = await client.post("/api/nets/", json={"name": "Adhoc Notify Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    with patch(
        "app.email_service.EmailService.send_net_notification",
        new_callable=AsyncMock,
    ) as mock_notify:
        resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        mock_notify.assert_called_once()


# ---------------------------------------------------------------------------
# Permission checks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_non_owner_cannot_start_net(client, owner, other):
    create = await client.post("/api/nets/", json={"name": "Protected Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    resp = await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(other))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_owner_cannot_close_net(client, owner, other):
    create = await client.post("/api/nets/", json={"name": "Owned Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(other))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_close_any_net(client, owner, admin):
    create = await client.post("/api/nets/", json={"name": "Admin Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    resp = await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(admin))
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Archive/unarchive broadcasts (Milestone 0.7: a second client with the
# archive/delete prompt still open never learned the net had already been
# archived elsewhere, because archive_net/unarchive_net never broadcast at
# all. Mirrors the close_net broadcast pattern in nets_core.py.)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_archive_net_broadcasts_status_change(client, owner):
    create = await client.post("/api/nets/", json={"name": "Archive Broadcast Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(f"/api/nets/{net_id}/archive", headers=auth_headers(owner))
        assert resp.status_code == 200
        assert resp.json()["status"] == "archived"

        mock_broadcast.assert_called_once()
        broadcast_payload, broadcast_net_id = mock_broadcast.call_args[0]
        assert broadcast_payload["type"] == "net_status_change"
        assert broadcast_payload["data"]["net_id"] == net_id
        assert broadcast_payload["data"]["status"] == "archived"
        assert broadcast_net_id == net_id


@pytest.mark.asyncio
async def test_unarchive_net_broadcasts_status_change(client, owner):
    create = await client.post("/api/nets/", json={"name": "Unarchive Broadcast Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))
    await client.post(f"/api/nets/{net_id}/close", headers=auth_headers(owner))
    await client.post(f"/api/nets/{net_id}/archive", headers=auth_headers(owner))

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(f"/api/nets/{net_id}/unarchive", headers=auth_headers(owner))
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"

        mock_broadcast.assert_called_once()
        broadcast_payload, broadcast_net_id = mock_broadcast.call_args[0]
        assert broadcast_payload["type"] == "net_status_change"
        assert broadcast_payload["data"]["net_id"] == net_id
        assert broadcast_payload["data"]["status"] == "closed"
        assert broadcast_net_id == net_id


# ---------------------------------------------------------------------------
# Cancel/restore (regression: "Cancel" on a scheduled net used to hard-DELETE
# the row. Because the reminder scheduler treats "no row for this slot" as
# "not created yet", the deleted net got silently recreated - reminder email
# included - a few hours later. Cancelling now sets NetStatus.CANCELLED
# instead, so the occurrence stays on record and the scheduler leaves it
# alone (see _is_cancelled_occurrence in ncs_reminder_service.py).
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_net_sets_status_reason_and_broadcasts(client, owner):
    create = await client.post("/api/nets/", json={"name": "Cancel Broadcast Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(
            f"/api/nets/{net_id}/cancel",
            json={"reason": "In-person meeting instead"},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "cancelled"
        assert body["cancel_reason"] == "In-person meeting instead"
        assert body["cancelled_at"] is not None

        mock_broadcast.assert_called_once()
        broadcast_payload, broadcast_net_id = mock_broadcast.call_args[0]
        assert broadcast_payload["data"]["status"] == "cancelled"
        assert broadcast_net_id == net_id

    # The row still exists - findable, not just missing.
    get_resp = await client.get(f"/api/nets/{net_id}", headers=auth_headers(owner))
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_net_rejects_active_net(client, owner):
    create = await client.post("/api/nets/", json={"name": "Active Cancel Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))

    resp = await client.post(f"/api/nets/{net_id}/cancel", json={}, headers=auth_headers(owner))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_restore_net_returns_to_scheduled_when_start_time_set(client, owner):
    create = await client.post(
        "/api/nets/",
        json={"name": "Restore Net", "scheduled_start_time": "2027-01-01T14:00:00+00:00"},
        headers=auth_headers(owner),
    )
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/cancel", json={"reason": "test"}, headers=auth_headers(owner))

    with patch("app.main.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = await client.post(f"/api/nets/{net_id}/restore", headers=auth_headers(owner))
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "scheduled"
        assert body["cancelled_at"] is None
        assert body["cancel_reason"] is None

        broadcast_payload, _ = mock_broadcast.call_args[0]
        assert broadcast_payload["data"]["status"] == "scheduled"


@pytest.mark.asyncio
async def test_restore_net_rejects_non_cancelled(client, owner):
    create = await client.post("/api/nets/", json={"name": "Not Cancelled Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]

    resp = await client.post(f"/api/nets/{net_id}/restore", headers=auth_headers(owner))
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Logger-role active-frequency permission (regression: these two endpoints
# checked required_roles=["NCS", "Logger"], but the only place a Logger role
# is ever actually assigned (RoleAssignmentDialog.tsx) stores it as "LOGGER"
# — the title-case check never matched a real Logger user. Found during a
# full functional-test pass across NCS/Logger/standard-user/guest roles.)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_logger_role_can_set_active_frequency(client, db, owner, other):
    from app.models import Frequency, NetRole, net_frequencies

    create = await client.post("/api/nets/", json={"name": "Logger Freq Net"}, headers=auth_headers(owner))
    net_id = create.json()["id"]
    await client.post(f"/api/nets/{net_id}/start", headers=auth_headers(owner))

    freq = Frequency(frequency="146.520", mode="FM", description="Test")
    db.add(freq)
    await db.flush()
    await db.execute(net_frequencies.insert().values(net_id=net_id, frequency_id=freq.id))
    db.add(NetRole(net_id=net_id, user_id=other.id, role="LOGGER"))
    await db.commit()

    resp = await client.put(f"/api/nets/{net_id}/active-frequency/{freq.id}", headers=auth_headers(other))
    assert resp.status_code == 200
    assert resp.json()["active_frequency_id"] == freq.id

    resp2 = await client.delete(f"/api/nets/{net_id}/active-frequency", headers=auth_headers(other))
    assert resp2.status_code == 200
    assert resp2.json()["active_frequency_id"] is None
