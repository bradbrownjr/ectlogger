import json
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.logger import logger
from app.models import (
    Net,
    NetRole,
    NetStatus,
    NetTemplate,
    NetTemplateSubscription,
    TemplateStaff,
    User,
    UserRole,
)
from app.schemas import (
    CreateNetFromTemplateRequest,
    NetResponse,
    NetTemplateSubscriptionDetailResponse,
    NetTemplateSubscriptionResponse,
)

from app.routers.templates_core import is_active_co_manager

router = APIRouter()


@router.post("/{template_id}/subscribe", response_model=NetTemplateSubscriptionResponse)
async def subscribe_to_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Subscribe to a template to receive notifications"""
    # Check if template exists
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if already subscribed
    result = await db.execute(
        select(NetTemplateSubscription).where(
            NetTemplateSubscription.template_id == template_id,
            NetTemplateSubscription.user_id == current_user.id
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=400, detail="Already subscribed to this template")
    
    # Create subscription
    subscription = NetTemplateSubscription(
        template_id=template_id,
        user_id=current_user.id
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    
    return NetTemplateSubscriptionResponse.model_validate(subscription)


@router.delete("/{template_id}/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_from_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unsubscribe from a template"""
    result = await db.execute(
        select(NetTemplateSubscription).where(
            NetTemplateSubscription.template_id == template_id,
            NetTemplateSubscription.user_id == current_user.id
        )
    )
    subscription = result.scalar_one_or_none()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Not subscribed to this template")
    
    await db.delete(subscription)
    await db.commit()


@router.get("/{template_id}/subscriptions", response_model=List[NetTemplateSubscriptionDetailResponse])
async def list_template_subscriptions(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List subscribers to a template (admin, owner, or active co-manager only)."""
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    is_admin = current_user.role == UserRole.ADMIN
    is_owner = template.owner_id == current_user.id
    is_co_manager = await is_active_co_manager(db, template.id, current_user.id)
    if not (is_admin or is_owner or is_co_manager):
        raise HTTPException(status_code=403, detail="Not authorized to view subscriptions")

    result = await db.execute(
        select(NetTemplateSubscription)
        .options(selectinload(NetTemplateSubscription.user))
        .where(NetTemplateSubscription.template_id == template_id)
        .order_by(NetTemplateSubscription.subscribed_at.desc())
    )
    subscriptions = result.scalars().all()

    return [NetTemplateSubscriptionDetailResponse.from_orm_with_user(s) for s in subscriptions]


@router.post("/{template_id}/create-net", response_model=NetResponse)
async def create_net_from_template(
    template_id: int,
    request: CreateNetFromTemplateRequest = CreateNetFromTemplateRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new net from a template"""
    # Load template with frequencies and NCS rotation members
    result = await db.execute(
        select(NetTemplate)
        .options(
            selectinload(NetTemplate.frequencies),
            selectinload(NetTemplate.rotation_members)
        )
        .where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if not template.is_active:
        raise HTTPException(status_code=400, detail="Template is not active")
    
    # Check if user has permission to create a net from this template
    # Must be: admin, template owner, staff member, or NCS rotation member
    is_admin = current_user.role == UserRole.ADMIN
    is_owner = template.owner_id == current_user.id
    is_rotation_member = any(member.user_id == current_user.id for member in template.rotation_members)
    
    # Check staff table
    is_staff = False
    if not (is_admin or is_owner or is_rotation_member):
        staff_result = await db.execute(
            select(TemplateStaff).where(
                TemplateStaff.template_id == template.id,
                TemplateStaff.user_id == current_user.id,
                TemplateStaff.is_active == True
            )
        )
        is_staff = staff_result.scalar_one_or_none() is not None
    
    if not (is_admin or is_owner or is_rotation_member or is_staff):
        raise HTTPException(
            status_code=403, 
            detail="Only admins, template owners, or designated staff can create nets from this template"
        )
    
    # Calculate scheduled_start_time based on template's schedule config
    # Only for recurring schedules (daily, weekly, monthly) - not for one_time or ad_hoc
    scheduled_start_time = None
    if template.schedule_type in ('daily', 'weekly', 'monthly') and template.schedule_config:
        try:
            config = json.loads(template.schedule_config) if isinstance(template.schedule_config, str) else template.schedule_config
            time_str = config.get('time', '19:00')
            hour, minute = map(int, time_str.split(':'))
            
            # Get timezone from config (default to America/New_York if not specified)
            tz_name = config.get('timezone', 'America/New_York')
            try:
                import zoneinfo
                local_tz = zoneinfo.ZoneInfo(tz_name)
            except:
                # Fallback if zoneinfo not available
                local_tz = None
            
            # Calculate the next occurrence based on schedule type
            now = datetime.now(timezone.utc)
            if local_tz:
                now_local = now.astimezone(local_tz)
            else:
                now_local = now
            
            if template.schedule_type == 'daily':
                # For daily nets, scheduled time is today at the specified time
                # If that time has passed, it's tomorrow
                scheduled_local = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if scheduled_local <= now_local:
                    scheduled_local = scheduled_local + timedelta(days=1)
            elif template.schedule_type == 'weekly':
                # For weekly nets, find the next occurrence of the specified day
                day_of_week = config.get('day_of_week', 0)  # 0 = Sunday in our config
                # Convert to Python weekday (0 = Monday)
                python_weekday = (day_of_week - 1) % 7 if day_of_week > 0 else 6
                days_ahead = python_weekday - now_local.weekday()
                if days_ahead < 0 or (days_ahead == 0 and now_local.hour * 60 + now_local.minute >= hour * 60 + minute):
                    days_ahead += 7
                scheduled_local = (now_local + timedelta(days=days_ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)
            elif template.schedule_type == 'monthly':
                # Use calculate_schedule_dates to find the actual next occurrence
                # (e.g., the 3rd Thursday of the month), not just "today at HH:MM".
                from app.routers.ncs_rotation import calculate_schedule_dates
                next_dates = calculate_schedule_dates(template, now_local, months_ahead=2)
                scheduled_local = next_dates[0] if next_dates else None
            else:
                scheduled_local = None
            
            # Convert back to UTC for storage
            if scheduled_local and local_tz:
                scheduled_start_time = scheduled_local.astimezone(timezone.utc)
            elif scheduled_local:
                scheduled_start_time = scheduled_local.replace(tzinfo=timezone.utc)
        except Exception as e:
            # Log error but don't fail net creation
            import logging
            logging.warning(f"Failed to calculate scheduled_start_time: {e}")
            scheduled_start_time = None

    # A one-time schedule has no recurrence to compute from, so the caller
    # supplies the net's official start time directly (see CreateNetFromTemplateRequest).
    if request.scheduled_start_time is not None:
        scheduled_start_time = request.scheduled_start_time

    # Create net from template
    from app.models import net_frequencies as net_freq_table
    
    net = Net(
        name=template.name,
        description=template.description,
        info_url=template.info_url,
        stream_url=template.stream_url,
        script=template.script,
        announcements=template.announcements,
        owner_id=current_user.id,
        template_id=template_id,
        field_config=template.field_config,
        status=NetStatus.DRAFT,
        ics309_enabled=template.ics309_enabled or False,
        mobile_priority_sort=template.mobile_priority_sort if template.mobile_priority_sort is not None else True,
        chat_grace_period_minutes=template.chat_grace_period_minutes,
        self_checkin_enabled=template.self_checkin_enabled if template.self_checkin_enabled is not None else True,
        auto_lobby_minutes=template.auto_lobby_minutes,
        topic_of_week_enabled=template.topic_of_week_enabled or False,
        topic_of_week_prompt=template.topic_of_week_prompt,
        poll_enabled=template.poll_enabled or False,
        poll_question=template.poll_question,
        scheduled_start_time=scheduled_start_time
    )
    db.add(net)
    await db.flush()
    
    # Copy frequencies
    for freq in template.frequencies:
        await db.execute(
            net_freq_table.insert().values(net_id=net.id, frequency_id=freq.id)
        )
    
    # When a staff member manually creates a net from the schedule they are
    # taking responsibility for running it, so assign them as the NCS.
    # The automatic path (reminder service auto-create) separately assigns the
    # rotation-computed duty NCS via _assign_duty_ncs.
    db.add(NetRole(net_id=net.id, user_id=current_user.id, role="NCS"))

    await db.commit()

    # Auto-archive all previously closed nets from the same schedule so the
    # dashboard stays clean without requiring manual archiving after each net.
    try:
        closed_result = await db.execute(
            select(Net).where(
                Net.template_id == template_id,
                Net.status == NetStatus.CLOSED,
                Net.id != net.id
            )
        )
        closed_nets = closed_result.scalars().all()
        if closed_nets:
            for closed_net in closed_nets:
                closed_net.status = NetStatus.ARCHIVED
            await db.commit()
            logger.info("NET_CREATE", f"Auto-archived {len(closed_nets)} closed net(s) from template {template_id} on manual net creation")
    except Exception as e:
        logger.error("NET_CREATE", f"Failed to auto-archive closed nets for template {template_id}: {e}")

    # Reload with frequencies
    result = await db.execute(
        select(Net)
        .options(selectinload(Net.frequencies))
        .where(Net.id == net.id)
    )
    net = result.scalar_one()

    return NetResponse.from_orm(net)



@router.post("/{template_id}/email-subscribers", status_code=200)
async def email_template_subscribers(
    template_id: int,
    email_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send an email to selected recipient groups for a schedule template.

    Allowed recipients:
    - subscribers: subscribers of the template
    - staff: schedule staff (+ manager) for the template
    - all: union of subscribers + staff

    Permission: admin, template owner, or active template co-manager.
    """
    from app.email_service import EmailService
    from app.utils import display_callsign
    from jinja2 import Template
    
    result = await db.execute(
        select(NetTemplate).where(NetTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check permissions - admin, template owner, or active template co-manager.
    is_admin = current_user.role == UserRole.ADMIN
    is_owner = template.owner_id == current_user.id
    is_co_manager = await is_active_co_manager(db, template_id, current_user.id)

    if not (is_admin or is_owner or is_co_manager):
        raise HTTPException(status_code=403, detail="Not authorized to send emails for this template")

    recipient_group = (email_data.get('recipient_group') or 'subscribers').strip().lower()
    if recipient_group not in {'subscribers', 'staff', 'all'}:
        raise HTTPException(status_code=400, detail="recipient_group must be one of: subscribers, staff, all")
    
    subject = email_data.get('subject', '').strip()
    message = email_data.get('message', '').strip()
    
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message are required")
    
    recipients_by_id: dict[int, User] = {}

    # Subscribers
    if recipient_group in {'subscribers', 'all'}:
        result = await db.execute(
            select(User)
            .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
            .where(NetTemplateSubscription.template_id == template_id)
            .where(User.email_notifications == True)
            .where(User.is_active == True)
        )
        for subscriber in result.scalars().all():
            recipients_by_id[subscriber.id] = subscriber

    # Staff recipients
    if recipient_group in {'staff', 'all'}:
        owner_result = await db.execute(select(User).where(User.id == template.owner_id))
        owner_user = owner_result.scalar_one_or_none()
        if owner_user and owner_user.email and owner_user.email_notifications and owner_user.is_active:
            recipients_by_id[owner_user.id] = owner_user

        staff_result = await db.execute(
            select(User)
            .join(TemplateStaff, TemplateStaff.user_id == User.id)
            .where(TemplateStaff.template_id == template_id)
            .where(TemplateStaff.is_active == True)
            .where(User.email_notifications == True)
            .where(User.is_active == True)
        )
        for staff_user in staff_result.scalars().all():
            recipients_by_id[staff_user.id] = staff_user

    recipients = [u for u in recipients_by_id.values() if u.email]
    if not recipients:
        raise HTTPException(status_code=400, detail="No recipients with email notifications enabled")
    
    # Create HTML email template
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .net-name { font-weight: bold; color: #1976d2; }
            .message { white-space: pre-wrap; background-color: white; padding: 15px; border-radius: 4px; margin-top: 10px; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>{{ subject }}</h2>
            </div>
            <div class="content">
                <p>Regarding: <span class="net-name">{{ net_name }}</span></p>
                <div class="message">{{ message }}</div>
            </div>
            <div class="footer">
                <p>You're receiving this because you subscribed to this schedule.</p>
                <p>Sent by: {{ sender_callsign }}</p>
            </div>
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        subject=subject,
        net_name=template.name,
        message=message,
        sender_callsign=display_callsign(current_user)
    )
    
    # Send emails
    sent_count = 0
    failed_count = 0
    
    for recipient in recipients:
        try:
            await EmailService.send_email(recipient.email, f"[{template.name}] {subject}", html_content)
            sent_count += 1
        except Exception as e:
            failed_count += 1
            print(f"Failed to send email to {recipient.email}: {e}")
    
    return {
        "recipient_group": recipient_group,
        "sent": sent_count,
        "failed": failed_count,
        "total_recipients": len(recipients)
    }
