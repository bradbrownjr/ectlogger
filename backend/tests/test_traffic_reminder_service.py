"""
Tests for app/traffic_reminder_service.py: the precedence-scaled reminder
ladder (D4), its one-sided window, HXB(n) override, dedup via
traffic_reminder_logs, and the two opt-outs (per-user and instance-wide).
See docs/concepts/TRAFFIC-HANDLING-DESIGN.md D4 and Phase 7.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AppSettings,
    Form,
    FormDefinition,
    TrafficAction,
    TrafficReminderLog,
)
from app.traffic.log import append_entry
from app.traffic_reminder_service import (
    TrafficReminderService,
    _DEFAULT_LADDER,
    _EMERGENCY_LADDER,
    _PRIORITY_LADDER,
    _ladder_for_precedence,
    parse_hxb_hours,
)


async def _definition(db) -> FormDefinition:
    definition = FormDefinition(
        form_type="RADIOGRAM", title="ARRL Radiogram", version="3.1", output_format="nts_radiogram"
    )
    db.add(definition)
    await db.flush()
    return definition


async def _form(db, definition, **kwargs) -> Form:
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        field_values="{}",
        **kwargs,
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)
    return form


# ---------------------------------------------------------------------------
# Ladder lookup and one-sided window
# ---------------------------------------------------------------------------

def test_ladder_for_precedence_covers_radiogram_letters_and_ics213_words():
    assert _ladder_for_precedence("E") == _EMERGENCY_LADDER
    assert _ladder_for_precedence("Emergency") == _EMERGENCY_LADDER
    assert _ladder_for_precedence("P") == _PRIORITY_LADDER
    assert _ladder_for_precedence("Urgent") == _PRIORITY_LADDER
    assert _ladder_for_precedence("W") == _DEFAULT_LADDER
    assert _ladder_for_precedence("R") == _DEFAULT_LADDER
    assert _ladder_for_precedence("Routine") == _DEFAULT_LADDER


def test_ladder_for_precedence_defaults_when_unrecognized_or_missing():
    """None, empty, and an unrecognized value all fall back to the least
    aggressive (Welfare/Routine) ladder -- never the most aggressive."""
    assert _ladder_for_precedence(None) == _DEFAULT_LADDER
    assert _ladder_for_precedence("") == _DEFAULT_LADDER
    assert _ladder_for_precedence("bogus") == _DEFAULT_LADDER


def test_ladder_values_match_design_doc_table():
    assert _EMERGENCY_LADDER == (1, 4, 12)
    assert _PRIORITY_LADDER == (4, 12, 24)
    assert _DEFAULT_LADDER == (24, 72, 24 * 7)


@pytest.mark.parametrize("precedence,ladder", [
    ("E", _EMERGENCY_LADDER),
    ("P", _PRIORITY_LADDER),
    ("R", _DEFAULT_LADDER),
])
def test_stage_due_never_fires_early(precedence, ladder):
    """The one-sided window's lower bound is the whole point: elapsed just
    under (stage_hours - catch_up) must never be due, for every precedence."""
    for stage_hours in ladder:
        just_before = stage_hours - TrafficReminderService.CATCH_UP_HOURS - 0.01
        assert not TrafficReminderService._stage_due(just_before, stage_hours)


@pytest.mark.parametrize("stage_hours", [1, 4, 12, 24, 72, 168])
def test_stage_due_fires_at_and_after_the_boundary(stage_hours):
    catch_up = TrafficReminderService.CATCH_UP_HOURS
    # Exactly at the lower bound: due.
    assert TrafficReminderService._stage_due(stage_hours - catch_up, stage_hours)
    # Exactly at the nominal stage hour: due.
    assert TrafficReminderService._stage_due(stage_hours, stage_hours)
    # Well past it: still due (no upper bound -- dedup logging is what stops
    # a second send, not window closure).
    assert TrafficReminderService._stage_due(stage_hours + 1000, stage_hours)


# ---------------------------------------------------------------------------
# HXB(n) parsing
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("handling,expected", [
    ("HXB48", 48),
    ("HXB(48)", 48),
    ("HXB 48", 48),
    ("hxb24", 24),
    ("HXG", None),
    ("HXD", None),
    (None, None),
    ("", None),
])
def test_parse_hxb_hours(handling, expected):
    assert parse_hxb_hours(handling) == expected


# ---------------------------------------------------------------------------
# Eligibility: "still pending" == last_action in (ORIGINATED, RECEIVED)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_pending_forms_includes_originated_and_received(db, owner, other):
    definition = await _definition(db)
    form1 = await _form(db, definition, created_by_id=owner.id)
    form2 = await _form(db, definition, created_by_id=owner.id)

    await append_entry(db, form1, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    await append_entry(db, form2, TrafficAction.RECEIVED, reported_by_user_id=other.id)

    service = TrafficReminderService()
    pending = await service._find_pending_forms(db)
    pending_ids = {f.id for f in pending}
    assert form1.id in pending_ids
    assert form2.id in pending_ids


@pytest.mark.asyncio
async def test_new_log_entry_removes_form_from_eligibility(db, owner, other):
    """A form drops out of the reminder ladder the instant a newer log entry
    exists (D4: "eligibility is derived, not flagged"), simulated here via
    append_entry the same way a relay/delivery action would in the real
    router flow."""
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)

    service = TrafficReminderService()
    pending = await service._find_pending_forms(db)
    assert form.id in {f.id for f in pending}

    # Relay it onward -- last_action moves off ORIGINATED/RECEIVED.
    await append_entry(
        db, form, TrafficAction.RELAYED,
        handed_to_user_id=other.id, reported_by_user_id=owner.id,
    )

    pending = await service._find_pending_forms(db)
    assert form.id not in {f.id for f in pending}


@pytest.mark.asyncio
async def test_find_pending_forms_excludes_demo_but_includes_drill(db, owner):
    """DEMO is throwaway test data and must never nag anyone. DRILL simulates
    a real incident and is deliberately NOT exempted -- it stays eligible
    exactly like real (unlabeled) traffic."""
    definition = await _definition(db)
    real_form = await _form(db, definition, created_by_id=owner.id)
    drill_form = await _form(db, definition, created_by_id=owner.id, test_category="drill")
    demo_form = await _form(db, definition, created_by_id=owner.id, test_category="demo")

    for form in (real_form, drill_form, demo_form):
        await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)

    service = TrafficReminderService()
    pending_ids = {f.id for f in await service._find_pending_forms(db)}
    assert real_form.id in pending_ids
    assert drill_form.id in pending_ids
    assert demo_form.id not in pending_ids


# ---------------------------------------------------------------------------
# Per-stage dedup: the ladder fires at the right elapsed time, and the
# UniqueConstraint blocks a duplicate even under a simulated race.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_maybe_send_for_form_fires_stage_1_only_once_due(db, owner, monkeypatch):
    """Routine precedence: stage 1 is 24h. Held 23h (before catch-up window)
    must not send; held 24h must send exactly once, and a second call must
    not re-send the same stage."""
    definition = await _definition(db)
    form = await _form(
        db, definition, created_by_id=owner.id, precedence="R",
        subject="Test message", message_number="1",
    )
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    await db.refresh(form)

    sent_calls = []

    async def fake_send_traffic_reminder(**kwargs):
        sent_calls.append(kwargs["stage"])

    monkeypatch.setattr(
        "app.traffic_reminder_service.EmailService.send_traffic_reminder",
        fake_send_traffic_reminder,
    )

    service = TrafficReminderService()

    # 23 hours: below the 24h - 0.5h catch-up threshold -> must not fire.
    fired = await service._maybe_send_for_form(db, form, owner, elapsed_hours=23.0)
    assert fired is False
    assert sent_calls == []

    # 24 hours: due -> fires stage 1 exactly once.
    fired = await service._maybe_send_for_form(db, form, owner, elapsed_hours=24.0)
    assert fired is True
    assert sent_calls == [1]

    # Calling again at the same elapsed time must not re-send stage 1 (dedup
    # row already exists); nothing else is due yet either.
    fired_again = await service._maybe_send_for_form(db, form, owner, elapsed_hours=24.0)
    assert fired_again is False
    assert sent_calls == [1]


@pytest.mark.asyncio
async def test_emergency_precedence_uses_1_4_12_ladder(db, owner, monkeypatch):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, precedence="E")
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    await db.refresh(form)

    sent_calls = []

    async def fake_send(**kwargs):
        sent_calls.append(kwargs["stage"])

    monkeypatch.setattr(
        "app.traffic_reminder_service.EmailService.send_traffic_reminder", fake_send
    )

    service = TrafficReminderService()

    # Emergency stage 1 is 1h -- must not fire at 0.4h (below 1 - 0.5 catch-up).
    assert await service._maybe_send_for_form(db, form, owner, elapsed_hours=0.4) is False
    # At 1h it must fire.
    assert await service._maybe_send_for_form(db, form, owner, elapsed_hours=1.0) is True
    assert sent_calls == [1]


@pytest.mark.asyncio
async def test_hxb_override_uses_half_and_full_hour_ladder_instead_of_precedence(db, owner, monkeypatch):
    """HXB48 overrides the precedence ladder entirely: stage 1 (reminder) at
    24h, stage 2 (hard cancel/notify-origin prompt) at 48h -- not the
    Routine precedence's 24/72/168h ladder that would otherwise apply."""
    definition = await _definition(db)
    form = await _form(
        db, definition, created_by_id=owner.id, precedence="R", handling="HXB48",
    )
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    await db.refresh(form)

    reminder_calls = []
    final_calls = []

    async def fake_reminder(**kwargs):
        reminder_calls.append(kwargs["stage"])

    async def fake_final(**kwargs):
        final_calls.append(kwargs["hxb_hours"])

    monkeypatch.setattr(
        "app.traffic_reminder_service.EmailService.send_traffic_reminder", fake_reminder
    )
    monkeypatch.setattr(
        "app.traffic_reminder_service.EmailService.send_traffic_hxb_final_notice", fake_final
    )

    service = TrafficReminderService()

    # Stage 1 (n/2 = 24h) fires the ordinary reminder, not the hard notice.
    assert await service._maybe_send_for_form(db, form, owner, elapsed_hours=24.0) is True
    assert reminder_calls == [1]
    assert final_calls == []

    # Stage 2 (n = 48h) fires the hard cancel/notify-origin notice.
    assert await service._maybe_send_for_form(db, form, owner, elapsed_hours=48.0) is True
    assert final_calls == [48]


@pytest.mark.asyncio
async def test_duplicate_stage_send_blocked_by_unique_constraint(db, engine, owner):
    """Simulates the cross-process race: two concurrent sessions both try to
    log the same (form_id, user_id, stage) reminder. One must raise
    IntegrityError, exactly like WhatsNewSendLog's dedup mechanism."""
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)

    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session_a:
        session_a.add(TrafficReminderLog(form_id=form.id, user_id=owner.id, stage=1))
        await session_a.commit()

    async with factory() as session_b:
        session_b.add(TrafficReminderLog(form_id=form.id, user_id=owner.id, stage=1))
        with pytest.raises(IntegrityError):
            await session_b.flush()
        await session_b.rollback()


# ---------------------------------------------------------------------------
# Opt-outs: per-user and instance-wide
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_notify_traffic_reminder_false_suppresses_send(db, owner, monkeypatch):
    owner.notify_traffic_reminder = False
    await db.commit()

    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, precedence="R")
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    # Force it well past stage 1 (24h) so the test proves the opt-out is what
    # suppresses the send, not merely that the ladder isn't due yet.
    form.held_since = datetime.utcnow() - timedelta(hours=30)
    await db.commit()
    await db.refresh(form)
    await db.refresh(owner)

    sent_calls = []

    async def fake_send(**kwargs):
        sent_calls.append(kwargs["stage"])

    monkeypatch.setattr(
        "app.traffic_reminder_service.EmailService.send_traffic_reminder", fake_send
    )

    service = TrafficReminderService()

    async with _patched_session_local(db):
        await service._check_and_send_reminders()

    assert sent_calls == []


@pytest.mark.asyncio
async def test_app_settings_traffic_reminder_enabled_false_suppresses_send(db, owner, monkeypatch):
    db.add(AppSettings(id=1, traffic_reminder_enabled=False))
    await db.commit()

    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, precedence="R")
    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    form.held_since = datetime.utcnow() - timedelta(hours=30)
    await db.commit()
    await db.refresh(form)

    sent_calls = []

    async def fake_send(**kwargs):
        sent_calls.append(kwargs["stage"])

    monkeypatch.setattr(
        "app.traffic_reminder_service.EmailService.send_traffic_reminder", fake_send
    )

    service = TrafficReminderService()

    async with _patched_session_local(db):
        await service._check_and_send_reminders()

    assert sent_calls == []


class _patched_session_local:
    """Context manager that points AsyncSessionLocal at the test's own
    session for the duration of a `_check_and_send_reminders()` call, so the
    full loop method (which normally opens its own AsyncSessionLocal) can see
    fixtures set up on the shared in-memory test database.
    """

    def __init__(self, db):
        self._db = db
        self._patcher = None

    async def __aenter__(self):
        import app.traffic_reminder_service as svc_module

        db = self._db

        class _FakeSessionLocal:
            def __call__(self):
                return self

            async def __aenter__(self_inner):
                return db

            async def __aexit__(self_inner, *exc):
                return False

        self._original = svc_module.AsyncSessionLocal
        svc_module.AsyncSessionLocal = _FakeSessionLocal()
        return self

    async def __aexit__(self, *exc):
        import app.traffic_reminder_service as svc_module
        svc_module.AsyncSessionLocal = self._original
        return False
