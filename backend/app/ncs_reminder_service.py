"""
NCS Reminder Service

Background task service that sends email reminders to NCS operators
24 hours and 1 hour before their scheduled net.
"""

import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.utils import display_callsign
from app.models import NetTemplate, NCSRotationMember, NCSReminderLog, NCSScheduleOverride, User, NetTemplateSubscription, Net, NetStatus, TemplateStaff
from app.email_service import EmailService
from app.config import settings
from app.logger import logger

# Import the schedule calculation functions from the router
from app.routers.ncs_rotation import compute_ncs_schedule, calculate_schedule_dates, template_local_to_utc


class NCSReminderService:
    """Service for sending NCS duty reminder emails"""
    
    REMINDER_HOURS = [24, 1]  # Send reminders 24 hours and 1 hour before
    CHECK_INTERVAL_MINUTES = 15  # How often to check for reminders to send
    
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
                await self._check_and_send_ncs_reminders()
                await self._check_and_send_staff_reminders()
                await self._check_and_send_subscriber_reminders()
            except Exception as e:
                logger.error("NCS_REMINDER", f"Error in reminder loop: {str(e)}")
            
            # Wait before next check
            await asyncio.sleep(self.CHECK_INTERVAL_MINUTES * 60)
    
    async def _get_or_create_scheduled_net(self, db, template: NetTemplate, scheduled_dt: datetime) -> int | None:
        """
        Find an existing open net for this template near scheduled_dt,
        or auto-create a SCHEDULED net so the NCS has a direct link.
        Returns the net ID, or None on failure.
        """
        from app.routers.nets import net_frequencies as net_freq_table
        import json

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
                announcements=template.announcements,
                owner_id=template.owner_id,
                template_id=template.id,
                field_config=template.field_config,
                status=NetStatus.SCHEDULED,
                ics309_enabled=template.ics309_enabled or False,
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
        from app.routers.ncs_rotation import compute_ncs_schedule
        from sqlalchemy.orm import selectinload as _sil

        # Load the template with the relationships compute_ncs_schedule needs
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

        schedule = compute_ncs_schedule(
            tpl,
            [scheduled_dt],
            tpl.rotation_members,
            tpl.schedule_overrides,
        )
        if not schedule or not schedule[0].user_id or schedule[0].is_cancelled:
            return

        db.add(NetRole(net_id=net_id, user_id=schedule[0].user_id, role="NCS"))

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
                    dates = calculate_schedule_dates(template, now, months_ahead=1)
                    if not dates:
                        continue
                    next_local = dates[0]
                    next_utc = template_local_to_utc(template, next_local)
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Auto-create: error calculating dates for template {template.id}: {e}")
                    continue

                hours_until = (next_utc - now).total_seconds() / 3600
                if abs(hours_until - 24) <= 0.5:
                    net_id = await self._get_or_create_scheduled_net(db, template, next_utc)
                    if net_id:
                        created += 1

            if created > 0:
                logger.info("NCS_REMINDER", f"Auto-created {created} scheduled net(s)")

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
                    dates = calculate_schedule_dates(template, now, months_ahead=1)
                    if not dates:
                        continue
                    next_local = dates[0]
                    next_utc = template_local_to_utc(template, next_local)
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Staff reminder: error calculating dates for template {template.id}: {e}")
                    continue

                hours_until = (next_utc - now).total_seconds() / 3600
                if not (0.5 <= hours_until <= 1.5):
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
                else:
                    net_id = existing_net.id

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

                for staff_entry in active_staff:
                    user = staff_entry.user
                    if not user.email or not user.email_notifications:
                        continue

                    # Skip if they already received a subscriber reminder for this net
                    already_got_subscriber = await self._check_reminder_sent(
                        db, template.id, user.id, next_utc, "subscriber_1h"
                    )
                    if already_got_subscriber:
                        continue

                    already_sent = await self._check_reminder_sent(
                        db, template.id, user.id, next_utc, "staff_1h"
                    )
                    if already_sent:
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
                
                # Calculate upcoming schedule dates for this template
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                try:
                    dates = calculate_schedule_dates(template, start_date, months_ahead=1)
                    if not dates:
                        continue
                    schedule = compute_ncs_schedule(
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

                    # Check if we should send a reminder
                    for reminder_hours in self.REMINDER_HOURS:
                        # Check if we're within the reminder window (±30 minutes)
                        if abs(hours_until - reminder_hours) <= 0.5:
                            reminder_type = f"{reminder_hours}h"
                            already_sent = await self._check_reminder_sent(
                                db, template.id, entry.user_id,
                                scheduled_utc, reminder_type
                            )

                            if not already_sent:
                                user = await self._get_user(db, entry.user_id)
                                if user and user.email:
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
                # 1h reminder — net should already exist; find by exact scheduled time
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
                    net_url = f"{settings.frontend_url}/nets/{existing.id}"

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
            import json
            
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
                    dates = calculate_schedule_dates(template, now, months_ahead=1)
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
                
                # Only send reminders ~1 hour before (within ±30 minutes window)
                if not (0.5 <= hours_until <= 1.5):
                    continue
                
                # Get subscribers who want reminders
                for sub in template.subscriptions:
                    user = sub.user
                    if not user or not user.email:
                        continue
                    
                    # Check user preferences
                    if not user.email_notifications or not user.notify_net_reminder:
                        continue
                    
                    # Check if we already sent this reminder
                    reminder_type = "subscriber_1h"
                    already_sent = await self._check_reminder_sent(
                        db,
                        template.id,
                        user.id,
                        next_date, 
                        reminder_type
                    )
                    
                    if already_sent:
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


# Global instance
ncs_reminder_service = NCSReminderService()
