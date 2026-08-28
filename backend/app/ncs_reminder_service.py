"""
NCS Reminder Service

Background task service that sends email reminders to NCS operators
24 hours and 1 hour before their scheduled net.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.net_start import auto_open_lobby, lobby_open_due
from app.utils import display_callsign
from app.models import CheckIn, NetTemplate, NCSRotationMember, NCSReminderLog, NCSScheduleOverride, User, NetTemplateSubscription, Net, NetStatus, TemplateStaff, NetRole
from app.email_service import EmailService
from app.config import settings
from app.logger import logger

# Import the schedule calculation functions from the router
from app.routers.ncs_rotation import (
    compute_anchored_ncs_schedule, calculate_schedule_dates,
)
# template_*_to_* are defined in ncs_schedule; import them from there rather than
# through ncs_rotation, which only ever passed them along.
from app.routers.ncs_schedule import template_local_to_utc, template_utc_to_local


class NCSReminderService:
    """Service for sending NCS duty reminder emails"""
    
    REMINDER_HOURS = [24, 1]  # Send reminders 24 hours and 1 hour before
    # How often the loop below ticks. Every check here is dedup-gated (a log
    # row, an idempotent status transition, or a re-derivable existence check),
    # so running them often is safe - see e.g. _get_or_create_scheduled_net's
    # docstring. Was 15 until 2026-07-29: auto-lobby's smallest offset is also
    # 15 minutes, so a poll tick could land just before a net's open-lobby
    # window and the next one just before its official start, opening the
    # lobby with almost no lead time. The 30-minute catch-up tolerances used
    # elsewhere in this file (reminder timing, auto-create) have plenty of
    # headroom at this tighter interval.
    CHECK_INTERVAL_MINUTES = 1

    # All reminder_type values that represent the same "~1 hour before the net"
    # email. A user should receive AT MOST ONE of these per net occurrence, so
    # every 1h-class sender deduplicates against the whole set — not just its own
    # type. Priority (NCS > staff > subscriber) is enforced by loop order: the NCS
    # reminder runs first and logs "1h", so an on-duty NCS who is also staff or a
    # subscriber gets only the NCS-styled email, never a second "starting soon".
    ONE_HOUR_REMINDER_TYPES = ("1h", "staff_1h", "subscriber_1h")

    @staticmethod
    def _in_reminder_window(hours_until: float, reminder_hours: float, catch_up_hours: float = 0.5) -> bool:
        """True from the target lead time down to catch_up_hours before it.

        One-sided by design: the upper bound is reminder_hours itself, so this
        goes true on the first poll tick at or after "reminder_hours before
        start" and stays true for catch_up_hours after that. catch_up_hours only
        exists to survive a missed tick or brief downtime — it never lets the
        reminder fire earlier than what its subject line claims. A symmetric
        ±catch_up_hours window (the previous behavior) fires on the *first*
        tick anywhere in that range, which in practice meant "1 hour before"
        emails consistently went out ~90 minutes before start; verified against
        real production sends before this was narrowed.
        """
        return reminder_hours - catch_up_hours <= hours_until <= reminder_hours

    def __init__(self):
        self.running = False
        self._task = None
    
    async def start(self):
        """Start the background reminder service"""
        if self.running:
            logger.warning("NCS_REMINDER", "Service already running")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("NCS_REMINDER", "NCS Reminder service started")
    
    async def stop(self):
        """Stop the background reminder service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("NCS_REMINDER", "NCS Reminder service stopped")
    
    async def _run_loop(self):
        """Main loop that periodically checks for reminders to send"""
        while self.running:
            try:
                await self._check_and_auto_create_nets()
                await self._check_and_auto_open_lobbies()
                await self._check_and_send_ncs_reminders()
                await self._check_and_send_staff_reminders()
                await self._check_and_send_subscriber_reminders()
                await self._check_and_archive_stale_scheduled_nets()
            except Exception as e:
                logger.error("NCS_REMINDER", f"Error in reminder loop: {str(e)}")

            # Wait before next check
            await asyncio.sleep(self.CHECK_INTERVAL_MINUTES * 60)
    
    async def _is_cancelled_occurrence(self, db, template_id: int, scheduled_dt: datetime) -> bool:
        """True if this template+time slot has a Net row explicitly marked CANCELLED.

        A cancelled occurrence must never be auto-(re)created or reminded about
        until the operator explicitly restores it. Callers should check this
        before doing any work for a computed schedule date, since e.g. a
        _get_or_create_scheduled_net's own reuse query doesn't exclude
        cancelled rows (it treats them as "already exists, don't recreate").
        """
        window_start = scheduled_dt - timedelta(minutes=5)
        window_end = scheduled_dt + timedelta(minutes=5)
        result = await db.execute(
            select(Net.id).where(
                and_(
                    Net.template_id == template_id,
                    Net.status == NetStatus.CANCELLED,
                    Net.scheduled_start_time >= window_start,
                    Net.scheduled_start_time <= window_end,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def _get_or_create_scheduled_net(self, db, template: NetTemplate, scheduled_dt: datetime) -> int | None:
        """
        Find an existing open net for this template near scheduled_dt,
        or auto-create a SCHEDULED net so the NCS has a direct link.
        Returns the net ID, or None on failure.
        """
        from app.models import net_frequencies as net_freq_table

        # Look for any non-closed net for this template at exactly this scheduled time
        # (±5 min tolerance guards against floating-point datetime drift between scheduler runs)
        window_start = scheduled_dt - timedelta(minutes=5)
        window_end = scheduled_dt + timedelta(minutes=5)
        result = await db.execute(
            select(Net)
            .where(
                and_(
                    Net.template_id == template.id,
                    Net.status.notin_(['closed', 'archived']),
                    Net.scheduled_start_time >= window_start,
                    Net.scheduled_start_time <= window_end,
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing.id

        # Auto-create the net from the template as SCHEDULED
        try:
            net = Net(
                name=template.name,
                description=template.description,
                info_url=template.info_url,
                stream_url=template.stream_url,
                script=template.script,
                # Deliberately NOT copying template.announcements: Net.announcements
                # is Net Notes now (per-net, meant to start blank), separate from
                # the schedule's Announcements which ScheduleAnnouncements.tsx reads
                # live from the template - see schemas.py NetResponse.from_orm.
                owner_id=template.owner_id,
                template_id=template.id,
                field_config=template.field_config,
                status=NetStatus.SCHEDULED,
                ics309_enabled=template.ics309_enabled or False,
                propagation_logging_enabled=template.propagation_logging_enabled or False,
                self_can_hear_enabled=template.self_can_hear_enabled if template.self_can_hear_enabled is not None else True,
                # The traffic settings were previously left off this copy list, so
                # an auto-created scheduled net silently fell back to the column
                # default instead of honoring its schedule -- matching what
                # create_net_from_template already does for the manual path.
                traffic_enabled=template.traffic_enabled or False,
                traffic_form_types=template.traffic_form_types,
                traffic_strip_form_type=template.traffic_strip_form_type,
                traffic_strip_template=template.traffic_strip_template,
                self_checkin_enabled=template.self_checkin_enabled if template.self_checkin_enabled is not None else True,
                # Copied forward so the NCS can turn auto-lobby off for this one
                # occurrence without editing the schedule.
                auto_lobby_minutes=template.auto_lobby_minutes,
                topic_of_week_enabled=template.topic_of_week_enabled or False,
                topic_of_week_prompt=template.topic_of_week_prompt,
                poll_enabled=template.poll_enabled or False,
                poll_question=template.poll_question,
                scheduled_start_time=scheduled_dt,
            )
            db.add(net)
            await db.flush()
            for freq in template.frequencies:
                await db.execute(
                    net_freq_table.insert().values(net_id=net.id, frequency_id=freq.id)
                )
            # Assign the duty NCS from the rotation as a NetRole so the
            # dashboard can display who is running the net.
            await self._assign_duty_ncs(db, net.id, template.id, scheduled_dt)
            await db.commit()
            logger.info("NCS_REMINDER", f"Auto-created net {net.id} for template {template.id} on {scheduled_dt.date()}")

            # Auto-archive all previously closed nets from the same schedule.
            try:
                closed_result = await db.execute(
                    select(Net).where(
                        Net.template_id == template.id,
                        Net.status == NetStatus.CLOSED,
                        Net.id != net.id
                    )
                )
                closed_nets = closed_result.scalars().all()
                if closed_nets:
                    for closed_net in closed_nets:
                        closed_net.status = NetStatus.ARCHIVED
                    await db.commit()
                    logger.info("NCS_REMINDER", f"Auto-archived {len(closed_nets)} closed net(s) for template {template.id}")
            except Exception as e:
                logger.error("NCS_REMINDER", f"Failed to auto-archive closed nets for template {template.id}: {e}")

            return net.id
        except Exception as e:
            logger.error("NCS_REMINDER", f"Failed to auto-create net for template {template.id}: {e}")
            await db.rollback()
            return None

    async def _assign_duty_ncs(self, db, net_id: int, template_id: int, scheduled_dt: datetime):
        """Create a NetRole(NCS) for the rotation member whose turn falls on scheduled_dt.

        Loads rotation members, overrides, and the fifth-week user fresh from the
        database so this method is safe to call regardless of what relationships are
        already eager-loaded on the template object.
        """
        from sqlalchemy.orm import selectinload as _sil

        # Load the template with the relationships the schedule computation needs
        from app.models import NCSScheduleOverride as _Override
        tpl_result = await db.execute(
            select(NetTemplate)
            .options(
                _sil(NetTemplate.rotation_members),
                _sil(NetTemplate.schedule_overrides).selectinload(_Override.replacement_user),
                _sil(NetTemplate.fifth_week_user),
            )
            .where(NetTemplate.id == template_id)
        )
        tpl = tpl_result.scalar_one_or_none()
        if not tpl or not tpl.rotation_members:
            return

        # scheduled_dt is stored UTC; the anchored schedule works in the template's
        # local-naive dates, so convert before matching the occurrence.
        local_dt = template_utc_to_local(tpl, scheduled_dt)
        schedule = compute_anchored_ncs_schedule(
            tpl,
            [local_dt],
            tpl.rotation_members,
            tpl.schedule_overrides,
        )
        if not schedule or not schedule[0].user_id or schedule[0].is_cancelled:
            return

        db.add(NetRole(net_id=net_id, user_id=schedule[0].user_id, role="NCS", auto_assigned=True))

    async def _check_and_auto_create_nets(self):
        """Ensure a SCHEDULED net instance exists ~24h before every recurring template.

        Decoupled from NCS rotation so nets without a rotation still appear on the
        dashboard a full day in advance. _get_or_create_scheduled_net is idempotent,
        so running this every 15 minutes is safe.
        """
        logger.debug("NCS_REMINDER", "Checking for nets to auto-create...")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(NetTemplate)
                .options(selectinload(NetTemplate.frequencies))
                .where(NetTemplate.is_active == True)
            )
            templates = result.scalars().all()

            now = datetime.utcnow()
            created = 0

            for template in templates:
                if template.schedule_type == 'ad_hoc':
                    continue
                try:
                    # calculate_schedule_dates matches weekdays against the calendar
                    # date of the datetime it's given, so it must be fed the template's
                    # local "now" — not naive UTC. For evening-scheduled nets (e.g. 8 PM
                    # Eastern = midnight UTC), naive UTC's calendar date is already
                    # tomorrow during 8 PM-midnight local time, causing weekday matching
                    # to skip the correct day and land a full week later.
                    now_local = template_utc_to_local(template, now)
                    dates = calculate_schedule_dates(template, now_local, months_ahead=1)
                    if not dates:
                        continue
                    next_local = dates[0]
                    next_utc = template_local_to_utc(template, next_local)
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Auto-create: error calculating dates for template {template.id}: {e}")
                    continue

                hours_until = (next_utc - now).total_seconds() / 3600
                if abs(hours_until - 24) <= 0.5:
                    if await self._is_cancelled_occurrence(db, template.id, next_utc):
                        continue
                    net_id = await self._get_or_create_scheduled_net(db, template, next_utc)
                    if net_id:
                        created += 1

            if created > 0:
                logger.info("NCS_REMINDER", f"Auto-created {created} scheduled net(s)")

    async def _is_occurrence_staffed(self, db, net: Net) -> bool:
        """Whether someone is on duty for this net's occurrence.

        An automated lobby must not open for a net whose duty was cancelled or
        whose rotation has a gap - an unstaffed open lobby is worse than leaving
        the net scheduled, because it looks to everyone like the net is on.

        The rotation is recomputed rather than trusting the NetRole assigned at
        auto-create time, because a duty can be cancelled (an NCSScheduleOverride
        with no replacement) after the net row already exists, and that path does
        not touch the net.

        Nets with no rotation to consult (ad hoc nets, or a schedule that never
        set one up) are treated as staffed: the owner is the de facto NCS, and
        refusing to fire would silently disable a setting they turned on.
        """
        if not net.template_id:
            return True

        from app.models import NCSScheduleOverride as _Override

        tpl_result = await db.execute(
            select(NetTemplate)
            .options(
                selectinload(NetTemplate.rotation_members),
                selectinload(NetTemplate.schedule_overrides).selectinload(_Override.replacement_user),
                selectinload(NetTemplate.fifth_week_user),
            )
            .where(NetTemplate.id == net.template_id)
        )
        tpl = tpl_result.scalar_one_or_none()
        if not tpl or not tpl.rotation_members:
            return True

        # scheduled_start_time is stored UTC; the anchored schedule works in the
        # template's local-naive dates, so convert before matching the occurrence.
        local_dt = template_utc_to_local(tpl, net.scheduled_start_time)
        schedule = compute_anchored_ncs_schedule(
            tpl, [local_dt], tpl.rotation_members, tpl.schedule_overrides
        )
        if not schedule:
            return True  # Occurrence isn't in the rotation's view; don't block on it

        return bool(schedule[0].user_id) and not schedule[0].is_cancelled

    async def _find_lobby_candidates(self, db):
        """Nets that might need their lobby auto-opened, before the offset/staffing checks.

        Matches both DRAFT and SCHEDULED nets. Only the recurring background
        auto-create job (_get_or_create_scheduled_net) produces SCHEDULED nets;
        every manually created net - including a one-time net given a specific
        start time and offset - starts life as DRAFT. A net with no
        scheduled_start_time at all (an ad-hoc net, or a one-time net set to open
        "now") never matches this query regardless of status: it has nothing for
        lobby_open_due() to count down from, and is handled instead by the
        manual-start branch in routers/nets_core.py::start_net().

        Split out from _check_and_auto_open_lobbies so the status filter can be
        tested directly against a test session, the same as _find_stale_nets.
        """
        result = await db.execute(
            select(Net)
            .options(selectinload(Net.frequencies))
            .where(
                and_(
                    Net.status.in_([NetStatus.DRAFT, NetStatus.SCHEDULED]),
                    Net.auto_lobby_minutes.isnot(None),
                    Net.scheduled_start_time.isnot(None),
                )
            )
        )
        return result.scalars().all()

    async def _check_and_auto_open_lobbies(self):
        """Open the lobby for scheduled nets whose auto_lobby_minutes offset has arrived.

        Reads the per-net auto_lobby_minutes only, never the template's: the value
        was copied forward at auto-create time, so an NCS who switched it off for
        a single occurrence cannot have that decision undone here.
        """
        logger.debug("NCS_REMINDER", "Checking for lobbies to auto-open...")

        async with AsyncSessionLocal() as db:
            candidates = await self._find_lobby_candidates(db)

            opened = 0
            for net in candidates:
                try:
                    if not lobby_open_due(net):
                        continue

                    if not await self._is_occurrence_staffed(db, net):
                        logger.info(
                            "NCS_REMINDER",
                            f"Skipping auto-lobby for net {net.id} ({net.name}) - "
                            f"no NCS on duty for this occurrence",
                        )
                        continue

                    await auto_open_lobby(db, net)
                    opened += 1
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Auto-lobby failed for net {net.id}: {e}")
                    await db.rollback()

            if opened > 0:
                logger.info("NCS_REMINDER", f"Auto-opened {opened} net lobby/lobbies")

    async def _check_and_send_staff_reminders(self):
        """Send 1h reminders to all active template staff for upcoming nets.

        Staff reminders are operational — they go to everyone listed as staff for
        the template regardless of whether they've subscribed via the bell icon.
        The master email_notifications switch is respected; notify_net_reminder is
        not required (staff have a duty, not a passive preference).

        Staff members who already received a subscriber_1h reminder for this
        net are skipped to avoid a duplicate email.
        """
        logger.debug("NCS_REMINDER", "Checking for staff reminders to send...")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(NetTemplate)
                .options(
                    selectinload(NetTemplate.frequencies),
                    selectinload(NetTemplate.staff).selectinload(TemplateStaff.user),
                )
                .where(NetTemplate.is_active == True)
            )
            templates = result.scalars().all()

            now = datetime.utcnow()
            reminders_sent = 0

            for template in templates:
                active_staff = [s for s in template.staff if s.is_active and s.user]
                if not active_staff:
                    continue
                if template.schedule_type == 'ad_hoc':
                    continue

                try:
                    now_local = template_utc_to_local(template, now)
                    dates = calculate_schedule_dates(template, now_local, months_ahead=1)
                    if not dates:
                        continue
                    next_local = dates[0]
                    next_utc = template_local_to_utc(template, next_local)
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Staff reminder: error calculating dates for template {template.id}: {e}")
                    continue

                hours_until = (next_utc - now).total_seconds() / 3600
                if not self._in_reminder_window(hours_until, 1.0):
                    continue

                if await self._is_cancelled_occurrence(db, template.id, next_utc):
                    continue

                # Find the net instance (should exist from _check_and_auto_create_nets)
                net_result = await db.execute(
                    select(Net).where(
                        and_(
                            Net.template_id == template.id,
                            Net.status.notin_(['closed', 'archived']),
                            Net.scheduled_start_time >= next_utc - timedelta(minutes=5),
                            Net.scheduled_start_time <= next_utc + timedelta(minutes=5),
                        )
                    )
                )
                existing_net = net_result.scalar_one_or_none()
                if not existing_net:
                    existing_net_id = await self._get_or_create_scheduled_net(db, template, next_utc)
                    net_id = existing_net_id
                    # A freshly created net is always SCHEDULED - nothing to check into yet.
                    net_is_open = False
                else:
                    net_id = existing_net.id
                    net_is_open = existing_net.status in (NetStatus.LOBBY, NetStatus.ACTIVE)

                net_url = f"{settings.frontend_url}/nets/{net_id}" if net_id else f"{settings.frontend_url}/dashboard"
                lobby_url = f"{net_url}?open_lobby=1" if net_id else net_url

                frequencies = []
                for freq in template.frequencies:
                    if freq.frequency:
                        frequencies.append({'frequency': str(freq.frequency), 'mode': freq.mode})
                    elif freq.talkgroup:
                        frequencies.append({
                            'talkgroup_name': freq.network or freq.talkgroup,
                            'talkgroup_id': freq.talkgroup,
                        })

                # Query the on-duty NCS for this net
                ncs_name = None
                ncs_callsign = None
                if net_id:
                    ncs_result = await db.execute(
                        select(User.callsign, User.name)
                        .join(NetRole, NetRole.user_id == User.id)
                        .where(NetRole.net_id == net_id)
                        .where(NetRole.role == "NCS")
                        .order_by(NetRole.assigned_at.desc())
                        .limit(1)
                    )
                    ncs_row = ncs_result.first()
                    if ncs_row:
                        ncs_callsign = ncs_row[0]
                        ncs_name = ncs_row[1]

                for staff_entry in active_staff:
                    user = staff_entry.user
                    if not user.email or not user.email_notifications:
                        continue

                    # One pre-net reminder per user per occurrence: skip if they
                    # already got an NCS, staff, or subscriber 1h reminder for this
                    # net (the NCS reminder runs first, so on-duty NCS are covered).
                    if await self._already_reminded_1h(db, template.id, user.id, next_utc):
                        continue

                    try:
                        await EmailService.send_staff_reminder(
                            to_email=user.email,
                            recipient_name=user.name or display_callsign(user) or "Operator",
                            recipient_callsign=display_callsign(user) or "N/A",
                            net_name=template.name,
                            net_date=next_local.strftime("%A, %B %d, %Y"),
                            net_time=next_local.strftime("%I:%M %p"),
                            frequencies=frequencies,
                            net_url=net_url,
                            lobby_url=lobby_url,
                            unsubscribe_token=user.unsubscribe_token,
                            ncs_name=ncs_name,
                            ncs_callsign=ncs_callsign,
                            net_is_open=net_is_open,
                        )
                        db.add(NCSReminderLog(
                            template_id=template.id,
                            user_id=user.id,
                            scheduled_date=next_utc,
                            reminder_type="staff_1h",
                            sent_at=datetime.utcnow(),
                        ))
                        await db.commit()
                        reminders_sent += 1
                        logger.info("NCS_REMINDER", f"Sent staff 1h reminder to {user.email} for {template.name} on {next_local.date()}")
                    except Exception as e:
                        logger.error("NCS_REMINDER", f"Failed to send staff reminder to {user.email}: {e}")

            if reminders_sent > 0:
                logger.info("NCS_REMINDER", f"Sent {reminders_sent} staff reminder(s)")

    async def _check_and_send_ncs_reminders(self):
        """Check for upcoming nets and send reminders if needed"""
        logger.debug("NCS_REMINDER", "Checking for NCS reminders to send...")
        
        async with AsyncSessionLocal() as db:
            # Get all active templates with rotation members and overrides
            result = await db.execute(
                select(NetTemplate)
                .options(
                    selectinload(NetTemplate.rotation_members).selectinload(NCSRotationMember.user),
                    selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.original_user),
                    selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.replacement_user),
                    selectinload(NetTemplate.fifth_week_user),
                    selectinload(NetTemplate.frequencies)
                )
                .where(NetTemplate.is_active == True)
            )
            templates = result.scalars().all()
            
            now = datetime.utcnow()
            reminders_sent = 0
            
            for template in templates:
                # Skip templates with no rotation members
                if not template.rotation_members:
                    continue

                # Calculate upcoming schedule dates for this template, anchored to the
                # template's local midnight (not UTC midnight) so weekday matching
                # doesn't skip a day for templates scheduled in the local evening.
                now_local = template_utc_to_local(template, now)
                start_date = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
                try:
                    dates = calculate_schedule_dates(template, start_date, months_ahead=1)
                    if not dates:
                        continue
                    schedule = compute_anchored_ncs_schedule(
                        template,
                        dates,
                        template.rotation_members,
                        template.schedule_overrides
                    )
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Error computing schedule for template {template.id}: {str(e)}")
                    continue
                
                for entry in schedule:
                    if not entry.user_id or entry.is_cancelled:
                        continue

                    # entry.date is a naive *local* datetime; convert to UTC so the
                    # window math and dedup compare against datetime.utcnow() correctly.
                    scheduled_local = entry.date
                    scheduled_utc = template_local_to_utc(template, scheduled_local)

                    # Calculate hours until the net
                    time_until = scheduled_utc - now
                    hours_until = time_until.total_seconds() / 3600

                    if await self._is_cancelled_occurrence(db, template.id, scheduled_utc):
                        continue

                    # Check if we should send a reminder
                    for reminder_hours in self.REMINDER_HOURS:
                        if self._in_reminder_window(hours_until, reminder_hours):
                            reminder_type = f"{reminder_hours}h"
                            already_sent = await self._check_reminder_sent(
                                db, template.id, entry.user_id,
                                scheduled_utc, reminder_type
                            )

                            if not already_sent:
                                user = await self._get_user(db, entry.user_id)
                                # Respect the master email switch even for duty
                                # reminders — a user who turned off all email
                                # should never be forced a reminder.
                                if user and user.email and user.email_notifications:
                                    await self._send_reminder(
                                        db, template, user, scheduled_local, scheduled_utc, reminder_hours
                                    )
                                    reminders_sent += 1
            
            if reminders_sent > 0:
                logger.info("NCS_REMINDER", f"Sent {reminders_sent} NCS reminder(s)")
    
    async def _check_reminder_sent(
        self, 
        db, 
        template_id: int, 
        user_id: int, 
        scheduled_date, 
        reminder_type: str
    ) -> bool:
        """Check if a reminder has already been sent"""
        result = await db.execute(
            select(NCSReminderLog)
            .where(
                and_(
                    NCSReminderLog.template_id == template_id,
                    NCSReminderLog.user_id == user_id,
                    NCSReminderLog.scheduled_date == scheduled_date,
                    NCSReminderLog.reminder_type == reminder_type
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def _already_reminded_1h(
        self, db, template_id: int, user_id: int, scheduled_utc
    ) -> bool:
        """True if this user already received any ~1h-before reminder for this occurrence.

        Unifies dedup across the NCS, staff, and subscriber reminder paths so a
        user who holds more than one role (e.g. on-duty NCS who also subscribed)
        gets a single pre-net reminder instead of two or three near-identical
        emails. See ONE_HOUR_REMINDER_TYPES for the priority rationale.
        """
        result = await db.execute(
            select(NCSReminderLog).where(
                and_(
                    NCSReminderLog.template_id == template_id,
                    NCSReminderLog.user_id == user_id,
                    NCSReminderLog.scheduled_date == scheduled_utc,
                    NCSReminderLog.reminder_type.in_(self.ONE_HOUR_REMINDER_TYPES),
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def _get_user(self, db, user_id: int):
        """Get user by ID"""
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
    
    async def _send_reminder(
        self,
        db,
        template: NetTemplate,
        user: User,
        scheduled_local: datetime,
        scheduled_utc: datetime,
        hours_until: int
    ):
        """Send a reminder email and log it.

        scheduled_local is the net's local wall-clock time (used for email display);
        scheduled_utc is the UTC equivalent (used for net lookups and dedup logging).
        """
        try:
            # Format frequencies for the email
            frequencies = []
            for freq in template.frequencies:
                if freq.frequency:
                    frequencies.append({
                        'frequency': str(freq.frequency),
                        'mode': freq.mode
                    })
                elif freq.talkgroup:
                    frequencies.append({
                        'talkgroup_name': freq.network or freq.talkgroup,
                        'talkgroup_id': freq.talkgroup
                    })
            
            # Get operator name and callsign
            operator_name = user.name or display_callsign(user) or "Operator"
            operator_callsign = display_callsign(user) or "N/A"
            
            # Build URLs
            scheduler_url = f"{settings.frontend_url}/scheduler"

            # For the 24h reminder, auto-create the net now so the NCS has a
            # direct link to the waiting net in their email.
            net_url = None
            if hours_until >= 20:  # ~24h window
                net_id = await self._get_or_create_scheduled_net(db, template, scheduled_utc)
                if net_id:
                    net_url = f"{settings.frontend_url}/nets/{net_id}"
            else:
                # 1h reminder — find existing net; auto-create if the 24h window was missed
                result = await db.execute(
                    select(Net)
                    .where(
                        and_(
                            Net.template_id == template.id,
                            Net.status.notin_(['closed', 'archived']),
                            Net.scheduled_start_time >= scheduled_utc - timedelta(minutes=5),
                            Net.scheduled_start_time <= scheduled_utc + timedelta(minutes=5),
                        )
                    )
                )
                existing = result.scalar_one_or_none()
                if existing:
                    net_url = f"{settings.frontend_url}/nets/{existing.id}?open_lobby=1"
                else:
                    net_id = await self._get_or_create_scheduled_net(db, template, scheduled_utc)
                    if net_id:
                        net_url = f"{settings.frontend_url}/nets/{net_id}?open_lobby=1"

            await EmailService.send_ncs_reminder(
                to_email=user.email,
                operator_name=operator_name,
                operator_callsign=operator_callsign,
                net_name=template.name,
                net_date=scheduled_local.strftime("%A, %B %d, %Y"),
                net_time=scheduled_local.strftime("%I:%M %p"),
                frequencies=frequencies,
                hours_until=hours_until,
                scheduler_url=scheduler_url,
                net_url=net_url,
                unsubscribe_token=user.unsubscribe_token
            )

            # Log that we sent this reminder (keyed on UTC for stable dedup)
            reminder_log = NCSReminderLog(
                template_id=template.id,
                user_id=user.id,
                scheduled_date=scheduled_utc,
                reminder_type=f"{hours_until}h",
                sent_at=datetime.utcnow()
            )
            db.add(reminder_log)
            await db.commit()

            logger.info(
                "NCS_REMINDER",
                f"Sent {hours_until}h reminder to {user.email} for {template.name} on {scheduled_local.date()}"
            )
            
        except Exception as e:
            logger.error(
                "NCS_REMINDER", 
                f"Failed to send reminder to {user.email}: {str(e)}"
            )

    async def _check_and_send_subscriber_reminders(self):
        """Check for upcoming nets and send reminders to subscribers who want them"""
        logger.debug("SUBSCRIBER_REMINDER", "Checking for subscriber reminders to send...")
        
        async with AsyncSessionLocal() as db:
            from app.routers.ncs_rotation import calculate_schedule_dates
            
            # Get all active templates
            result = await db.execute(
                select(NetTemplate)
                .options(
                    selectinload(NetTemplate.frequencies),
                    selectinload(NetTemplate.subscriptions).selectinload(NetTemplateSubscription.user)
                )
                .where(NetTemplate.is_active == True)
            )
            templates = result.scalars().all()
            
            now = datetime.utcnow()
            reminders_sent = 0
            
            for template in templates:
                # Skip templates with no subscribers
                if not template.subscriptions:
                    continue
                
                # Calculate the next scheduled date for this template
                try:
                    now_local = template_utc_to_local(template, now)
                    dates = calculate_schedule_dates(template, now_local, months_ahead=1)
                    if not dates:
                        continue

                    next_local = dates[0]  # Next scheduled date (naive local time)
                    # Convert to UTC so window math and dedup match datetime.utcnow().
                    next_date = template_local_to_utc(template, next_local)
                except Exception as e:
                    logger.error("SUBSCRIBER_REMINDER", f"Error calculating dates for template {template.id}: {str(e)}")
                    continue

                # Calculate hours until the net
                time_until = next_date - now
                hours_until = time_until.total_seconds() / 3600
                
                if not self._in_reminder_window(hours_until, 1.0):
                    continue

                if await self._is_cancelled_occurrence(db, template.id, next_date):
                    continue

                # Get subscribers who want reminders
                for sub in template.subscriptions:
                    user = sub.user
                    if not user or not user.email:
                        continue
                    
                    # Check user preferences
                    if not user.email_notifications or not user.notify_net_reminder:
                        continue
                    
                    # One pre-net reminder per user per occurrence: skip if they
                    # already got an NCS, staff, or subscriber 1h reminder for this net.
                    if await self._already_reminded_1h(db, template.id, user.id, next_date):
                        continue
                    
                    # Send the reminder
                    try:
                        await self._send_subscriber_reminder(db, template, user, next_local, next_date)
                        reminders_sent += 1
                    except Exception as e:
                        logger.error("SUBSCRIBER_REMINDER", f"Failed to send reminder to {user.email}: {str(e)}")
            
            if reminders_sent > 0:
                logger.info("SUBSCRIBER_REMINDER", f"Sent {reminders_sent} subscriber reminder(s)")

    async def _send_subscriber_reminder(
        self,
        db,
        template: NetTemplate,
        user: User,
        scheduled_local: datetime,
        scheduled_utc: datetime
    ):
        """Send a subscriber reminder email and log it.

        scheduled_local is the net's local wall-clock time (used for email display);
        scheduled_utc is the UTC equivalent (used for net lookup and dedup logging).
        """
        # Format frequencies for the email
        frequencies = []
        for freq in template.frequencies:
            if freq.frequency:
                frequencies.append({
                    'frequency': str(freq.frequency),
                    'mode': freq.mode
                })
            elif freq.talkgroup:
                frequencies.append({
                    'talkgroup_name': freq.talkgroup,
                    'talkgroup_id': freq.network
                })

        # Get user name and callsign
        recipient_name = user.name or display_callsign(user) or "Operator"
        recipient_callsign = display_callsign(user) or "N/A"

        # Build net URL — find the open/scheduled net for this template
        net_url = f"{settings.frontend_url}/dashboard"
        result = await db.execute(
            select(Net)
            .where(
                and_(
                    Net.template_id == template.id,
                    Net.status.notin_(['closed', 'archived']),
                    Net.scheduled_start_time >= scheduled_utc - timedelta(hours=4),
                    Net.scheduled_start_time <= scheduled_utc + timedelta(hours=4),
                )
            )
        )
        existing_net = result.scalar_one_or_none()
        if existing_net:
            net_url = f"{settings.frontend_url}/nets/{existing_net.id}"

        await EmailService.send_subscriber_reminder(
            to_email=user.email,
            recipient_name=recipient_name,
            recipient_callsign=recipient_callsign,
            net_name=template.name,
            net_date=scheduled_local.strftime("%A, %B %d, %Y"),
            net_time=scheduled_local.strftime("%I:%M %p"),
            frequencies=frequencies,
            net_url=net_url,
            unsubscribe_token=user.unsubscribe_token
        )

        # Log that we sent this reminder (keyed on UTC for stable dedup)
        reminder_log = NCSReminderLog(
            template_id=template.id,
            user_id=user.id,
            scheduled_date=scheduled_utc,
            reminder_type="subscriber_1h",
            sent_at=datetime.utcnow()
        )
        db.add(reminder_log)
        await db.commit()

        logger.info(
            "SUBSCRIBER_REMINDER",
            f"Sent 1h reminder to {user.email} for {template.name} on {scheduled_local.date()}"
        )


    async def _find_stale_nets(self, db, cutoff: datetime):
        """Nets scheduled before `cutoff` that never actually happened.

        Split out from the sweep so the two "didn't happen" shapes can be tested
        without the background loop's own session - see
        _check_and_archive_stale_scheduled_nets for what each one means.
        """
        # Nets with at least one check-in were attended, so they happened even
        # if the NCS never pressed "go live".
        attended = select(CheckIn.net_id).where(CheckIn.net_id == Net.id)

        result = await db.execute(
            select(Net).where(
                and_(
                    Net.scheduled_start_time.isnot(None),
                    Net.scheduled_start_time < cutoff,
                    or_(
                        Net.status == NetStatus.SCHEDULED,
                        and_(
                            Net.status == NetStatus.LOBBY,
                            Net.lobby_opened_automatically == True,
                            Net.started_at.is_(None),
                            ~attended.exists(),
                        ),
                    ),
                )
            )
        )
        return result.scalars().all()

    async def _check_and_archive_stale_scheduled_nets(self):
        """Auto-archive nets that never actually happened, 24+ hours after their start time.

        Two shapes of "didn't happen":

        1. Still SCHEDULED. The net was pre-created by the reminder service and
           nobody ever opened it.
        2. In LOBBY, but the lobby opened itself (auto_lobby_minutes), never went
           live, and nobody checked in. Without this case an auto-opened lobby
           would sit on the dashboard forever, because leaving SCHEDULED is the
           only signal case 1 has. A lobby a human opened is never swept: the
           scheduler must not undo a deliberate action.
        """
        logger.debug("NCS_REMINDER", "Checking for stale scheduled nets...")

        async with AsyncSessionLocal() as db:
            cutoff = datetime.utcnow() - timedelta(hours=24)
            stale = await self._find_stale_nets(db, cutoff)

            if not stale:
                return

            for net in stale:
                reason = (
                    "auto-opened lobby, nobody attended"
                    if net.status == NetStatus.LOBBY
                    else "never opened"
                )
                net.status = NetStatus.ARCHIVED
                logger.info(
                    "NCS_REMINDER",
                    f"Auto-archived stale scheduled net {net.id} "
                    f"({net.name}) — scheduled {net.scheduled_start_time}, {reason}",
                )

            await db.commit()
            logger.info("NCS_REMINDER", f"Auto-archived {len(stale)} stale scheduled net(s)")


# Global instance
ncs_reminder_service = NCSReminderService()
