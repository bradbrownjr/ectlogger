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
from app.models import NetTemplate, NCSRotationMember, NCSReminderLog, User
from app.email_service import EmailService
from app.config import settings
from app.logger import logger

# Import the schedule calculation function from the router
from app.routers.ncs_rotation import compute_ncs_schedule


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
                await self._check_and_send_reminders()
            except Exception as e:
                logger.error("NCS_REMINDER", f"Error in reminder loop: {str(e)}")
            
            # Wait before next check
            await asyncio.sleep(self.CHECK_INTERVAL_MINUTES * 60)
    
    async def _check_and_send_reminders(self):
        """Check for upcoming nets and send reminders if needed"""
        logger.debug("NCS_REMINDER", "Checking for NCS reminders to send...")
        
        async with AsyncSessionLocal() as db:
            # Get all active templates with rotation members
            result = await db.execute(
                select(NetTemplate)
                .options(
                    selectinload(NetTemplate.rotation_members).selectinload(NCSRotationMember.user),
                    selectinload(NetTemplate.frequencies)
                )
                .where(NetTemplate.is_active == True)
            )
            templates = result.scalars().all()
            
            now = datetime.now()
            reminders_sent = 0
            
            for template in templates:
                # Skip templates with no rotation members
                if not template.rotation_members:
                    continue
                
                # Get the upcoming schedule for this template (next 48 hours)
                try:
                    schedule = await compute_ncs_schedule(db, template.id, weeks=1)
                except Exception as e:
                    logger.error("NCS_REMINDER", f"Error computing schedule for template {template.id}: {str(e)}")
                    continue
                
                for entry in schedule:
                    if not entry.get('user_id') or entry.get('is_cancelled'):
                        continue
                    
                    # Parse the scheduled date/time
                    try:
                        scheduled_dt = datetime.fromisoformat(entry['date'])
                    except (ValueError, KeyError):
                        continue
                    
                    # Calculate hours until the net
                    time_until = scheduled_dt - now
                    hours_until = time_until.total_seconds() / 3600
                    
                    # Check if we should send a reminder
                    for reminder_hours in self.REMINDER_HOURS:
                        # Check if we're within the reminder window (±30 minutes)
                        if abs(hours_until - reminder_hours) <= 0.5:
                            # Check if we've already sent this reminder
                            reminder_type = f"{reminder_hours}h"
                            already_sent = await self._check_reminder_sent(
                                db, 
                                template.id, 
                                entry['user_id'],
                                scheduled_dt.date(),
                                reminder_type
                            )
                            
                            if not already_sent:
                                # Get user details
                                user = await self._get_user(db, entry['user_id'])
                                if user and user.email:
                                    await self._send_reminder(
                                        db,
                                        template,
                                        user,
                                        scheduled_dt,
                                        reminder_hours
                                    )
                                    reminders_sent += 1
            
            if reminders_sent > 0:
                logger.info("NCS_REMINDER", f"Sent {reminders_sent} NCS reminder(s)")
    
    async def _check_reminder_sent(
        self, 
        db, 
        template_id: int, 
        user_id: int, 
        net_date, 
        reminder_type: str
    ) -> bool:
        """Check if a reminder has already been sent"""
        result = await db.execute(
            select(NCSReminderLog)
            .where(
                and_(
                    NCSReminderLog.template_id == template_id,
                    NCSReminderLog.user_id == user_id,
                    NCSReminderLog.net_date == net_date,
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
        scheduled_dt: datetime,
        hours_until: int
    ):
        """Send a reminder email and log it"""
        try:
            # Format frequencies for the email
            frequencies = []
            for freq in template.frequencies:
                if freq.frequency:
                    frequencies.append({
                        'frequency': str(freq.frequency),
                        'mode': freq.mode
                    })
                elif freq.talkgroup_name:
                    frequencies.append({
                        'talkgroup_name': freq.talkgroup_name,
                        'talkgroup_id': freq.talkgroup_id
                    })
            
            # Get operator name and callsign
            operator_name = user.name or user.callsign or "Operator"
            operator_callsign = user.callsign or "N/A"
            
            # Build scheduler URL
            scheduler_url = f"{settings.frontend_url}/scheduler"
            
            await EmailService.send_ncs_reminder(
                to_email=user.email,
                operator_name=operator_name,
                operator_callsign=operator_callsign,
                net_name=template.name,
                net_date=scheduled_dt.strftime("%A, %B %d, %Y"),
                net_time=scheduled_dt.strftime("%I:%M %p"),
                frequencies=frequencies,
                hours_until=hours_until,
                scheduler_url=scheduler_url
            )
            
            # Log that we sent this reminder
            reminder_log = NCSReminderLog(
                template_id=template.id,
                user_id=user.id,
                net_date=scheduled_dt.date(),
                reminder_type=f"{hours_until}h",
                sent_at=datetime.utcnow()
            )
            db.add(reminder_log)
            await db.commit()
            
            logger.info(
                "NCS_REMINDER", 
                f"Sent {hours_until}h reminder to {user.email} for {template.name} on {scheduled_dt.date()}"
            )
            
        except Exception as e:
            logger.error(
                "NCS_REMINDER", 
                f"Failed to send reminder to {user.email}: {str(e)}"
            )


# Global instance
ncs_reminder_service = NCSReminderService()
