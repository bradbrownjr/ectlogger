"""
Tests for the net check-in CSV import path, including backfilling a net that
ran off-app (POST /api/nets/{net_id}/import/csv).

Two behaviors here are easy to break and expensive when broken:

* The net time window both filters rows and resolves rows that carry only a
  time of day. Window bounds are stored UTC while a bare time is wall clock in
  the import zone, so the correct local date can sit outside the window's UTC
  date span. See test_time_only_row_resolves_when_local_date_precedes_window.
* Closing on import writes an official record. It must use the operator's
  stated end time exactly, and must not fire when nothing imported.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.models import (
    ChatMessage,
    CheckIn,
    Net,
    NetStatus,
    NetTemplate,
    TemplateStaff,
    TopicHistory,
)
from app.services.csv_import import CsvImportConfig, parse_checkin_timestamp
from tests.conftest import auth_headers

IMPORT_URL = "/api/nets/{net_id}/import/csv"

CSV_HEADER = "Callsign,Check-in Time\n"


def csv_bytes(*rows: str) -> bytes:
    return (CSV_HEADER + "".join(f"{r}\n" for r in rows)).encode("utf-8")


def files_arg(payload: bytes):
    return {"file": ("log.csv", payload, "text/csv")}


async def make_net(db, owner, *, status=NetStatus.SCHEDULED, **kwargs):
    net = Net(name=kwargs.pop("name", "Test Net"), owner_id=owner.id, status=status, **kwargs)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


async def make_template(db, owner, **kwargs):
    template = NetTemplate(
        name=kwargs.pop("name", "Test Schedule"),
        owner_id=owner.id,
        schedule_type=kwargs.pop("schedule_type", "weekly"),
        **kwargs,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


# ========== TIME-ONLY DISAMBIGUATION AGAINST THE PROMPTED WINDOW ==========

@pytest.mark.asyncio
async def test_time_only_row_resolves_when_local_date_precedes_window(client, db, owner):
    """A net running 8-10 PM Eastern has a window entirely on the NEXT UTC date.

    The correct local date for its rows is therefore one day before every UTC
    date in the window. Generating candidates only for the window's own UTC
    dates never produces the right answer, and every time-only row fails.
    """
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,8:05 PM")),
        data={
            "timezone_name": "America/New_York",
            "assume_utc": "false",
            "net_started_at": "2026-08-20T20:00",
            "net_closed_at": "2026-08-20T22:00",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["error_count"] == 0, body["errors"]
    assert body["imported"] == 1

    row = (await db.execute(select(CheckIn).where(CheckIn.net_id == net.id))).scalar_one()
    # 8:05 PM EDT on 2026-08-20 is 00:05 UTC on 2026-08-21.
    assert row.checked_in_at.replace(microsecond=0) == datetime(2026, 8, 21, 0, 5)


@pytest.mark.asyncio
async def test_time_only_candidate_generation_is_padded_both_directions():
    """Unit-level guard on the day loop, independent of HTTP and the database."""
    # Window sits one UTC day AFTER the row's local date (US evening net).
    cfg = CsvImportConfig(
        net_id=1,
        net_window_start=datetime(2026, 8, 21, 0, 0),
        net_window_end=datetime(2026, 8, 21, 2, 10),
        import_zone=ZoneInfo("America/New_York"),
        assume_utc=False,
        frequency_token_map={},
        checked_in_by_id=1,
    )
    parsed, err = parse_checkin_timestamp("8:05 PM", cfg)
    assert err is None
    assert parsed == datetime(2026, 8, 21, 0, 5)

    # Mirror case: window sits one UTC day BEFORE the row's local date.
    cfg_ahead = CsvImportConfig(
        net_id=1,
        net_window_start=datetime(2026, 8, 20, 8, 0),
        net_window_end=datetime(2026, 8, 20, 10, 0),
        import_zone=ZoneInfo("Asia/Tokyo"),
        assume_utc=False,
        frequency_token_map={},
        checked_in_by_id=1,
    )
    parsed_ahead, err_ahead = parse_checkin_timestamp("18:30", cfg_ahead)
    assert err_ahead is None
    assert parsed_ahead == datetime(2026, 8, 20, 9, 30)


@pytest.mark.asyncio
async def test_row_outside_prompted_window_is_rejected(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:00")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T19:00",
            "net_closed_at": "2026-08-20T20:00",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 0
    assert body["error_count"] == 1


@pytest.mark.asyncio
async def test_time_only_row_ambiguous_across_multiday_window(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,19:05")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T00:00",
            "net_closed_at": "2026-08-22T00:00",
        },
        headers=auth_headers(owner),
    )

    body = resp.json()
    assert body["imported"] == 0
    assert "more than one day" in body["errors"][0]
    # The window is legal, just wide: the operator gets a warning, not a 400.
    assert any("more than 24 hours" in w for w in body["warnings"])


@pytest.mark.asyncio
async def test_full_date_row_unaffected_by_wide_window(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-21 19:05")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T00:00",
            "net_closed_at": "2026-08-22T00:00",
        },
        headers=auth_headers(owner),
    )

    body = resp.json()
    assert body["error_count"] == 0, body["errors"]
    assert body["imported"] == 1


# ========== TIMEZONE HANDLING OF THE PROMPTED TIMES ==========

@pytest.mark.asyncio
async def test_prompted_times_follow_the_import_timezone(client, db, owner):
    """The same wall-clock text must mean different instants under UTC vs Eastern.

    If the prompted times were ever parsed as UTC while rows were parsed in the
    operator's zone, every row would land hours from the window with no error.
    """
    net_utc = await make_net(db, owner, status=NetStatus.SCHEDULED, name="UTC Net")
    net_local = await make_net(db, owner, status=NetStatus.SCHEDULED, name="Local Net")

    common = {"net_started_at": "2026-08-20T19:00", "net_closed_at": "2026-08-20T20:00"}

    resp_utc = await client.post(
        IMPORT_URL.format(net_id=net_utc.id),
        files=files_arg(csv_bytes()),
        data={"assume_utc": "true", **common},
        headers=auth_headers(owner),
    )
    resp_local = await client.post(
        IMPORT_URL.format(net_id=net_local.id),
        files=files_arg(csv_bytes()),
        data={"assume_utc": "false", "timezone_name": "America/New_York", **common},
        headers=auth_headers(owner),
    )

    start_utc = datetime.fromisoformat(resp_utc.json()["net_window_start"])
    start_local = datetime.fromisoformat(resp_local.json()["net_window_start"])
    assert start_local - start_utc == timedelta(hours=4)


@pytest.mark.asyncio
async def test_explicit_offset_in_prompted_time_wins(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "false",
            "timezone_name": "America/New_York",
            "net_started_at": "2026-08-21T00:00:00+00:00",
            "net_closed_at": "2026-08-21T02:00:00+00:00",
        },
        headers=auth_headers(owner),
    )

    assert datetime.fromisoformat(resp.json()["net_window_start"]) == datetime(2026, 8, 21, 0, 0)


# ========== LEGACY PATH MUST NOT MOVE ==========

@pytest.mark.asyncio
async def test_closed_net_import_unchanged_without_new_params(client, db, owner):
    started = datetime(2026, 8, 20, 23, 0)
    closed = datetime(2026, 8, 21, 0, 0)
    net = await make_net(
        db, owner, status=NetStatus.CLOSED, started_at=started, closed_at=closed
    )

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={"assume_utc": "true"},
        headers=auth_headers(owner),
    )

    body = resp.json()
    assert body["imported"] == 1
    assert datetime.fromisoformat(body["net_window_start"]) == started
    assert datetime.fromisoformat(body["net_window_end"]) == closed + timedelta(minutes=10)
    assert body["closed"] is False


@pytest.mark.asyncio
async def test_prefilled_times_reproduce_legacy_window(client, db, owner):
    """Prefilling the dialog from a closed net's own times must be a no-op."""
    started = datetime(2026, 8, 20, 23, 0)
    closed = datetime(2026, 8, 21, 0, 0)
    net = await make_net(
        db, owner, status=NetStatus.CLOSED, started_at=started, closed_at=closed
    )

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(owner),
    )

    body = resp.json()
    assert datetime.fromisoformat(body["net_window_start"]) == started
    assert datetime.fromisoformat(body["net_window_end"]) == closed + timedelta(minutes=10)


# ========== PERMISSIONS ==========

@pytest.mark.asyncio
async def test_template_staff_can_import_into_scheduled_net(client, db, owner, other):
    template = await make_template(db, owner)
    net = await make_net(db, owner, status=NetStatus.SCHEDULED, template_id=template.id)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=True))
    await db.commit()

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20T23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(other),
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_inactive_template_staff_cannot_import(client, db, owner, other):
    template = await make_template(db, owner)
    net = await make_net(db, owner, status=NetStatus.SCHEDULED, template_id=template.id)
    db.add(TemplateStaff(template_id=template.id, user_id=other.id, is_active=False))
    await db.commit()

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(other),
    )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unrelated_user_cannot_import(client, db, owner, other):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(other),
    )

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_staff_of_other_template_cannot_import(client, db, owner, other):
    template = await make_template(db, owner, name="Mine")
    other_template = await make_template(db, owner, name="Theirs")
    net = await make_net(db, owner, status=NetStatus.SCHEDULED, template_id=template.id)
    db.add(TemplateStaff(template_id=other_template.id, user_id=other.id, is_active=True))
    await db.commit()

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(other),
    )

    assert resp.status_code == 403


# ========== VALIDATION ==========

@pytest.mark.asyncio
async def test_scheduled_import_without_times_rejected(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,19:05")),
        data={"assume_utc": "true"},
        headers=auth_headers(owner),
    )

    assert resp.status_code == 400
    assert "actual start" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_end_before_start_rejected(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T22:00",
            "net_closed_at": "2026-08-20T20:00",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 400
    assert "after" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_window_over_thirty_days_rejected(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-06-01T00:00",
            "net_closed_at": "2026-08-01T00:00",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 400
    assert "30 days" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_close_with_future_end_rejected(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)
    future = datetime.utcnow() + timedelta(days=2)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": future.strftime("%Y-%m-%dT%H:%M"),
            "net_closed_at": (future + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
            "close_net_on_import": "true",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 400
    assert "future" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unparseable_prompted_time_rejected(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "last tuesday",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 400
    assert "net start time" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_draft_net_with_no_scheduled_time_imports(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.DRAFT)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["imported"] == 1


# ========== CLOSE ON IMPORT ==========

@pytest.mark.asyncio
async def test_close_on_import_sets_status_and_exact_times(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
            "close_net_on_import": "true",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["closed"] is True

    await db.refresh(net)
    assert net.status == NetStatus.CLOSED
    assert net.started_at == datetime(2026, 8, 20, 23, 0)
    # The window carries a 10-minute grace; the recorded close time must not.
    assert net.closed_at == datetime(2026, 8, 21, 0, 0)


@pytest.mark.asyncio
async def test_close_on_import_posts_no_system_chat_message(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
            "close_net_on_import": "true",
        },
        headers=auth_headers(owner),
    )

    messages = (await db.execute(select(ChatMessage).where(ChatMessage.net_id == net.id))).scalars().all()
    assert messages == []


@pytest.mark.asyncio
async def test_close_on_import_skipped_when_nothing_imported(client, db, owner):
    """A malformed file must never produce a closed net with no participants."""
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,not a time")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
            "close_net_on_import": "true",
        },
        headers=auth_headers(owner),
    )

    body = resp.json()
    assert body["imported"] == 0
    assert body["closed"] is False
    assert any("left scheduled" in w for w in body["warnings"])

    await db.refresh(net)
    assert net.status == NetStatus.SCHEDULED


@pytest.mark.asyncio
async def test_import_without_close_leaves_net_scheduled(client, db, owner):
    net = await make_net(db, owner, status=NetStatus.SCHEDULED)

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
            "close_net_on_import": "false",
        },
        headers=auth_headers(owner),
    )

    assert resp.json()["closed"] is False
    await db.refresh(net)
    assert net.status == NetStatus.SCHEDULED


@pytest.mark.asyncio
async def test_close_on_import_writes_topic_history(client, db, owner):
    template = await make_template(db, owner)
    net = await make_net(
        db,
        owner,
        status=NetStatus.SCHEDULED,
        template_id=template.id,
        topic_of_week_enabled=True,
        topic_of_week_prompt="What is your go-kit power plan?",
    )

    await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
            "close_net_on_import": "true",
        },
        headers=auth_headers(owner),
    )

    history = (await db.execute(select(TopicHistory).where(TopicHistory.net_id == net.id))).scalars().all()
    assert len(history) == 1


@pytest.mark.asyncio
async def test_close_flag_ignored_on_already_closed_net(client, db, owner):
    started = datetime(2026, 8, 20, 23, 0)
    closed = datetime(2026, 8, 21, 0, 0)
    net = await make_net(
        db, owner, status=NetStatus.CLOSED, started_at=started, closed_at=closed
    )

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes("KC1AAA,2026-08-20 23:30")),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T23:00",
            "net_closed_at": "2026-08-21T00:00",
            "close_net_on_import": "true",
        },
        headers=auth_headers(owner),
    )

    assert resp.json()["closed"] is False
    await db.refresh(net)
    assert net.closed_at == closed


@pytest.mark.asyncio
async def test_correcting_times_on_closed_net_writes_them_back(client, db, owner):
    net = await make_net(
        db,
        owner,
        status=NetStatus.CLOSED,
        started_at=datetime(2026, 8, 20, 23, 0),
        closed_at=datetime(2026, 8, 21, 0, 0),
    )

    resp = await client.post(
        IMPORT_URL.format(net_id=net.id),
        files=files_arg(csv_bytes()),
        data={
            "assume_utc": "true",
            "net_started_at": "2026-08-20T22:45",
            "net_closed_at": "2026-08-21T00:30",
        },
        headers=auth_headers(owner),
    )

    assert resp.status_code == 200, resp.text
    await db.refresh(net)
    assert net.started_at == datetime(2026, 8, 20, 22, 45)
    assert net.closed_at == datetime(2026, 8, 21, 0, 30)
    assert net.status == NetStatus.CLOSED
