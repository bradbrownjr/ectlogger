"""
Traffic Reminder Service

Background task service that sends escalating reminder emails to whoever is
currently holding a piece of formal traffic too long, plus an opt-in weekly
digest of stale traffic to a schedule's manager. Structure mirrors
ncs_reminder_service.py closely (poll loop, one-sided window helper, dedup
logging modeled on WhatsNewSendLog's atomic-insert pattern) per
docs/concepts/TRAFFIC-HANDLING-DESIGN.md D4 and Phase 7.

Eligibility is derived, not flagged (D4): a form is "still pending" exactly
when Form.last_action is ORIGINATED or RECEIVED, because that is the same
condition derive_disposition (app/traffic/log.py) uses to call it PENDING --
those cached columns have exactly one writer (append_entry), so as soon as a
newer log entry is appended (RELAYED/DELIVERED/CANCELLED), last_action moves
off this set and the form drops out of the ladder on the very next poll tick.
No separate "still pending" query logic is hand-rolled here.
"""

import asyncio
import re
from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import (
    AppSettings,
    Form,
    Net,
    NetTemplate,
    TemplateStaff,
    TrafficAction,
    TrafficReminderLog,
    User,
)
from app.traffic.log import not_demo_clause
from app.email_service import EmailService
from app.config import settings
from app.logger import logger

# ---------------------------------------------------------------------------
# The precedence-scaled ladder (D4). Hours-since-held_since at which each
# stage fires. Keyed on every string Form.precedence can hold: radiogram
# single letters (R/W/P/E) and ICS-213 words (Routine/Urgent/Emergency).
# Anything unrecognized (None included) falls back to the Welfare/Routine
# default -- the least aggressive ladder, matching "gently" as the roadmap's
# word for this feature.
# ---------------------------------------------------------------------------
_EMERGENCY_LADDER = (1, 4, 12)
_PRIORITY_LADDER = (4, 12, 24)
_DEFAULT_LADDER = (24, 72, 24 * 7)

_PRECEDENCE_LADDERS = {
    "E": _EMERGENCY_LADDER,
    "EMERGENCY": _EMERGENCY_LADDER,
    "P": _PRIORITY_LADDER,
    "URGENT": _PRIORITY_LADDER,
    "W": _DEFAULT_LADDER,
    "R": _DEFAULT_LADDER,
    "ROUTINE": _DEFAULT_LADDER,
}

# Matches "HXB48", "HXB(48)", "HXB 48" -- Form.handling is typed free text
# (see radiogram.py's preamble parser), so this tolerates the punctuation
# variants an operator might type even though the stored convention is the
# bare "HXB48" form (see models.py's Form.handling comment).
_HXB_RE = re.compile(r'HXB\s*\(?\s*(\d+)\s*\)?', re.IGNORECASE)


def _ladder_for_precedence(precedence: str | None) -> tuple[int, int, int]:
    """The three stage-hours for a form's precedence, defaulting to Welfare/Routine."""
    if not precedence:
        return _DEFAULT_LADDER
    return _PRECEDENCE_LADDERS.get(precedence.strip().upper(), _DEFAULT_LADDER)


def parse_hxb_hours(handling: str | None) -> int | None:
    """Parse the hour parameter out of an HXB(n) handling code, or None.

    No existing HX-code parser was found elsewhere in the codebase (grepped
    radiogram.py, definitions.py, formatters.py) -- validator="hx_code" on
    FormDefinitionField is advisory-only per D5 and never actually parses the
    number out. This is therefore the first and only place that number is
    extracted, kept local to this service rather than duplicated.
    """
    if not handling:
        return None
    match = _HXB_RE.search(handling)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


class TrafficReminderService:
    """Service for sending the traffic reminder ladder and the weekly stale digest."""

    # How often the loop ticks. The finest ladder granularity is 1 hour
    # (Emergency's stage 1), so a 15-minute tick with a 30-minute catch-up
    # window (matching NCSReminderService's default) has plenty of headroom
    # without the false-early risk a longer interval would carry.
    CHECK_INTERVAL_MINUTES = 15
    CATCH_UP_HOURS = 0.5

    # The weekly stale-traffic digest fires once, in the first tick of this
    # UTC hour on this weekday (0 = Monday). Guarded by an in-memory
    # per-template "already sent this ISO week" set rather than a persisted
    # log row -- unlike the per-form reminder ladder (which the design doc
    # explicitly requires a cross-process dedup table for, because a missed
    # dedup there means duplicate reminder ladders drifting per-worker), the
    # digest is a single weekly send off a single-process loop
    # (_is_primary_process gates this the same as ncs_reminder_service), so
    # in-memory state is sufficient and avoids a schema whose only job would
    # be tracking a once-a-week timestamp per template.
    DIGEST_WEEKDAY = 0  # Monday
    DIGEST_HOUR_UTC = 8

    def __init__(self):
        self.running = False
        self._task = None
        self._last_digest_week: dict[int, str] = {}

    @staticmethod
    def _stage_due(elapsed_hours: float, stage_hours: float, catch_up_hours: float = CATCH_UP_HOURS) -> bool:
        """One-sided: true once elapsed reaches (stage_hours - catch_up_hours).

        Unlike NCSReminderService._in_reminder_window (which counts down to a
        future net start and needs an upper bound to close the window as time
        passes), elapsed-since-held_since only grows. There is no upper bound
        here by design -- once true it stays true -- because it is
        traffic_reminder_logs (the dedup row), not window closure, that stops
        a stage from firing twice. The lower bound is what guarantees "never
        early": elapsed_hours below stage_hours - catch_up_hours must always
        return False, matching the one-sided shape D4 requires reusing.
        """
        return elapsed_hours >= stage_hours - catch_up_hours

    async def start(self):
        if self.running:
            logger.warning("TRAFFIC_REMINDER", "Service already running")
            return
        self.running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("TRAFFIC_REMINDER", "Traffic Reminder service started")

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("TRAFFIC_REMINDER", "Traffic Reminder service stopped")

    async def _run_loop(self):
        while self.running:
            try:
                await self._check_and_send_reminders()
                await self._check_and_send_stale_digest()
            except Exception as e:
                logger.error("TRAFFIC_REMINDER", f"Error in reminder loop: {str(e)}")
            await asyncio.sleep(self.CHECK_INTERVAL_MINUTES * 60)

    # -----------------------------------------------------------------
    # Master switch
    # -----------------------------------------------------------------

    async def _reminder_enabled_globally(self, db) -> bool:
        result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
        app_settings = result.scalar_one_or_none()
        # No row yet (fresh install before the first settings read/write) ->
        # default True, matching the column's own default.
        return app_settings is None or app_settings.traffic_reminder_enabled is not False

    # -----------------------------------------------------------------
    # Per-form reminder ladder
    # -----------------------------------------------------------------

    async def _find_pending_forms(self, db):
        """Forms someone is currently holding, per the same "still pending"
        condition derive_disposition uses (last_action in ORIGINATED/RECEIVED).

        Split out from _check_and_send_reminders so the eligibility query can
        be exercised directly in tests, the same as NCSReminderService's
        _find_lobby_candidates / _find_stale_nets.
        """
        result = await db.execute(
            select(Form)
            .options(selectinload(Form.held_by))
            .where(
                and_(
                    Form.last_action.in_([TrafficAction.ORIGINATED, TrafficAction.RECEIVED]),
                    Form.held_by_user_id.isnot(None),
                    Form.held_since.isnot(None),
                    not_demo_clause(),
                )
            )
        )
        return result.scalars().all()

    async def _check_and_send_reminders(self):
        logger.debug("TRAFFIC_REMINDER", "Checking for traffic reminders to send...")

        async with AsyncSessionLocal() as db:
            if not await self._reminder_enabled_globally(db):
                return

            forms = await self._find_pending_forms(db)
            if not forms:
                return

            now = datetime.now(timezone.utc)
            sent = 0

            for form in forms:
                user = form.held_by
                if not user or not user.email:
                    continue
                if not user.email_notifications or user.notify_traffic_reminder is False:
                    continue

                held_since = form.held_since
                if held_since.tzinfo is None:
                    held_since = held_since.replace(tzinfo=timezone.utc)
                elapsed_hours = (now - held_since).total_seconds() / 3600
                if elapsed_hours < 0:
                    continue

                try:
                    if await self._maybe_send_for_form(db, form, user, elapsed_hours):
                        sent += 1
                except Exception as e:
                    logger.error("TRAFFIC_REMINDER", f"Failed reminder check for form {form.id}: {e}")

            if sent:
                logger.info("TRAFFIC_REMINDER", f"Sent {sent} traffic reminder(s)")

    async def _maybe_send_for_form(self, db, form: Form, user: User, elapsed_hours: float) -> bool:
        """Send at most one stage for this form this tick, in ladder order.

        Stops at the first due-but-unsent stage rather than firing every
        overdue stage at once after a long outage -- see _stage_due's
        docstring on why the window never closes on its own. This keeps the
        "escalating intervals, not a nag" promise even after a catch-up: a
        long-overdue form gets one email per tick until it's caught up to
        its true stage, instead of three at once.
        """
        hxb_hours = parse_hxb_hours(form.handling)

        if hxb_hours is not None:
            stages = [(1, hxb_hours / 2, "reminder"), (2, hxb_hours, "hxb_final")]
        else:
            ladder = _ladder_for_precedence(form.precedence)
            stages = [(i + 1, hours, "reminder") for i, hours in enumerate(ladder)]

        for stage_index, stage_hours, kind in stages:
            if not self._stage_due(elapsed_hours, stage_hours):
                break  # ladder is ordered ascending; nothing later is due either
            if await self._already_sent(db, form.id, user.id, stage_index):
                continue  # this stage already went out; check whether the next is due too
            return await self._send_stage(db, form, user, stage_index, stage_hours, kind, elapsed_hours)

        return False

    async def _already_sent(self, db, form_id: int, user_id: int, stage: int) -> bool:
        result = await db.execute(
            select(TrafficReminderLog).where(
                and_(
                    TrafficReminderLog.form_id == form_id,
                    TrafficReminderLog.user_id == user_id,
                    TrafficReminderLog.stage == stage,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def _send_stage(self, db, form: Form, user: User, stage: int, stage_hours: float, kind: str, elapsed_hours: float) -> bool:
        """Insert the dedup row, send the email, commit only on success.

        Mirrors WhatsNewService's atomic-insert-wins pattern exactly: the row
        is flushed (not committed) before the send so the UniqueConstraint
        catches a concurrent duplicate attempt as an IntegrityError, and is
        only committed after the send call returns without raising. A send
        that is a logged EMAIL_ENABLED=false no-op still returns normally, so
        the row is still committed -- see R9 in the design doc: writing the
        row only on a *real* delivery would reintroduce the duplicate-send
        race the unique constraint exists to prevent.
        """
        try:
            log_row = TrafficReminderLog(form_id=form.id, user_id=user.id, stage=stage)
            db.add(log_row)
            await db.flush()
        except IntegrityError:
            await db.rollback()
            return False  # another process/tick already sent this stage

        recipient_name = user.name or user.callsign or "Operator"
        recipient_callsign = user.callsign or "N/A"

        try:
            if kind == "hxb_final":
                hxb_hours = parse_hxb_hours(form.handling)
                await EmailService.send_traffic_hxb_final_notice(
                    to_email=user.email,
                    recipient_name=recipient_name,
                    recipient_callsign=recipient_callsign,
                    form_id=form.id,
                    form_subject=form.subject or "Untitled",
                    message_number=form.message_number,
                    hxb_hours=hxb_hours,
                    unsubscribe_token=user.unsubscribe_token,
                )
            else:
                await EmailService.send_traffic_reminder(
                    to_email=user.email,
                    recipient_name=recipient_name,
                    recipient_callsign=recipient_callsign,
                    form_id=form.id,
                    form_subject=form.subject or "Untitled",
                    message_number=form.message_number,
                    precedence=form.precedence,
                    held_hours=elapsed_hours,
                    stage=stage,
                    unsubscribe_token=user.unsubscribe_token,
                )
            await db.commit()
            logger.info(
                "TRAFFIC_REMINDER",
                f"Sent {kind} stage {stage} to {user.email} for form {form.id} "
                f"({elapsed_hours:.1f}h held)",
            )
            return True
        except Exception as e:
            await db.rollback()
            logger.error("TRAFFIC_REMINDER", f"Failed to send traffic reminder to {user.email}: {e}")
            return False

    # -----------------------------------------------------------------
    # Weekly stale-traffic digest (opt-in, per net_templates.traffic_escalation_digest)
    # -----------------------------------------------------------------

    async def _check_and_send_stale_digest(self):
        now = datetime.now(timezone.utc)
        if now.weekday() != self.DIGEST_WEEKDAY or now.hour != self.DIGEST_HOUR_UTC:
            return
        if now.minute >= self.CHECK_INTERVAL_MINUTES:
            return  # only the first tick of the hour attempts this

        iso_week = now.strftime("%G-W%V")

        logger.debug("TRAFFIC_REMINDER", "Checking for weekly stale traffic digests to send...")

        async with AsyncSessionLocal() as db:
            if not await self._reminder_enabled_globally(db):
                return

            result = await db.execute(
                select(NetTemplate)
                .options(selectinload(NetTemplate.staff).selectinload(TemplateStaff.user))
                .where(NetTemplate.traffic_escalation_digest == True)  # noqa: E712
            )
            templates = result.scalars().all()

            sent = 0
            for template in templates:
                if self._last_digest_week.get(template.id) == iso_week:
                    continue

                stale = await self._find_stale_forms_for_template(db, template.id, now)
                if not stale:
                    self._last_digest_week[template.id] = iso_week
                    continue

                recipients = await self._template_managers(db, template)
                for user in recipients:
                    if not user.email or not user.email_notifications:
                        continue
                    if user.notify_traffic_reminder is False:
                        continue
                    try:
                        await EmailService.send_traffic_stale_digest(
                            to_email=user.email,
                            recipient_name=user.name or user.callsign or "Operator",
                            recipient_callsign=user.callsign or "N/A",
                            template_name=template.name,
                            stale_forms=stale,
                            unsubscribe_token=user.unsubscribe_token,
                        )
                        sent += 1
                    except Exception as e:
                        logger.error(
                            "TRAFFIC_REMINDER",
                            f"Failed to send stale digest to {user.email} for template {template.id}: {e}",
                        )

                self._last_digest_week[template.id] = iso_week

            if sent:
                logger.info("TRAFFIC_REMINDER", f"Sent {sent} weekly stale traffic digest(s)")

    async def _find_stale_forms_for_template(self, db, template_id: int, now: datetime) -> list[dict]:
        """Pending forms, on nets belonging to *template_id*, past their final ladder stage.

        "Stale" per D4: past the last reminder stage (or the HXB(n) override's
        n-hour deadline) with no newer log entry -- i.e. still pending.
        """
        result = await db.execute(
            select(Form)
            .join(Net, Form.net_id == Net.id)
            .where(
                and_(
                    Net.template_id == template_id,
                    Form.last_action.in_([TrafficAction.ORIGINATED, TrafficAction.RECEIVED]),
                    Form.held_since.isnot(None),
                    not_demo_clause(),
                )
            )
        )
        forms = result.scalars().all()

        stale = []
        for form in forms:
            held_since = form.held_since
            if held_since.tzinfo is None:
                held_since = held_since.replace(tzinfo=timezone.utc)
            elapsed_hours = (now - held_since).total_seconds() / 3600

            hxb_hours = parse_hxb_hours(form.handling)
            final_stage_hours = hxb_hours if hxb_hours is not None else _ladder_for_precedence(form.precedence)[-1]

            if elapsed_hours >= final_stage_hours:
                stale.append({
                    "id": form.id,
                    "subject": form.subject,
                    "message_number": form.message_number,
                    "held_hours": elapsed_hours,
                })

        return stale

    async def _template_managers(self, db, template: NetTemplate) -> list[User]:
        """Owner plus active co-managers -- the same "manager" definition
        check_net_lifecycle_permission uses for a template-linked net."""
        managers = {}

        result = await db.execute(select(User).where(User.id == template.owner_id))
        owner = result.scalar_one_or_none()
        if owner:
            managers[owner.id] = owner

        for staff_entry in template.staff:
            if staff_entry.is_active and staff_entry.is_co_manager and staff_entry.user:
                managers[staff_entry.user.id] = staff_entry.user

        return list(managers.values())


# Global instance
traffic_reminder_service = TrafficReminderService()
