import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.email_service import EmailService
from app.models import Net, NetRole, NetStatus, NetTemplateSubscription, TemplateStaff, User, UserRole
from app.permissions import is_admin
from app.schemas import NetResponse, public_display_name
from app.utils import display_callsign, get_avatar_url

router = APIRouter()

@router.post("/{net_id}/roles")
async def assign_net_role(
    net_id: int,
    user_id: int,
    role: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Assign a role to a user for a net (owner or admin only)"""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Only owner or admin can assign roles
    if net.owner_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to assign roles")
    
    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if role already exists
    result = await db.execute(
        select(NetRole).where(
            NetRole.net_id == net_id,
            NetRole.user_id == user_id,
            NetRole.role == role
        )
    )
    existing_role = result.scalar_one_or_none()
    
    if existing_role:
        raise HTTPException(status_code=400, detail="User already has this role")
    
    # Create role
    net_role = NetRole(net_id=net_id, user_id=user_id, role=role)
    db.add(net_role)
    await db.commit()

    # Broadcast role change via WebSocket
    from app.main import manager, post_system_message
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": user_id,
            "role": role,
            "assigned_at": net_role.assigned_at.isoformat() if hasattr(net_role.assigned_at, 'isoformat') else str(net_role.assigned_at)
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)

    # Log role assignment in chat
    await post_system_message(
        net_id,
        f"{display_callsign(user)} assigned as {role}",
        db
    )

    if role == "NCS":
        from app.net_pause import sync_net_pause_state
        await sync_net_pause_state(db, net_id)

    return {"message": f"Role {role} assigned to user {user_id}"}


@router.delete("/{net_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_net_role(
    net_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a role from a user (owner or admin only)"""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Only owner or admin can remove roles
    if net.owner_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to remove roles")
    
    result = await db.execute(select(NetRole).where(NetRole.id == role_id))
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Prevent removing the last NCS from an active net
    if role.role == "NCS" and net.status == NetStatus.ACTIVE:
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.role == "NCS"
            )
        )
        ncs_roles = result.scalars().all()
        if len(ncs_roles) <= 1:
            raise HTTPException(
                status_code=400, 
                detail="Cannot remove the last NCS from an active net. Assign another NCS first."
            )
    
    # Get user info for system message before deleting
    result = await db.execute(select(User).where(User.id == role.user_id))
    user_to_remove = result.scalar_one_or_none()
    role_name = role.role
    
    await db.delete(role)
    await db.commit()

    # Broadcast role removal via WebSocket
    from app.main import manager, post_system_message
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": role.user_id,
            "role": role_name,
            "removed": True,
            "removed_at": datetime.datetime.utcnow().isoformat()
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)

    # Log role removal in chat
    if user_to_remove:
        await post_system_message(
            net_id,
            f"{display_callsign(user_to_remove)} removed from {role_name} role",
            db
        )

    if role_name == "NCS":
        from app.net_pause import sync_net_pause_state
        await sync_net_pause_state(db, net_id)

    return None


@router.post("/{net_id}/claim-ncs")
async def claim_ncs_role(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Allow net owner or admin to claim NCS role when there is no NCS assigned.
    This is a recovery mechanism for orphaned nets.
    """
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Only owner or admin can claim NCS
    if net.owner_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only net owner or admin can claim NCS")
    
    # Check if there's already an NCS
    result = await db.execute(
        select(NetRole).where(
            NetRole.net_id == net_id,
            NetRole.role == "NCS"
        )
    )
    existing_ncs = result.scalars().all()
    
    if existing_ncs:
        raise HTTPException(status_code=400, detail="Net already has an NCS assigned")
    
    # Remove any existing role for this user
    result = await db.execute(
        select(NetRole).where(
            NetRole.net_id == net_id,
            NetRole.user_id == current_user.id
        )
    )
    existing_role = result.scalar_one_or_none()
    if existing_role:
        await db.delete(existing_role)
    
    # Assign NCS role
    ncs_role = NetRole(net_id=net_id, user_id=current_user.id, role="NCS")
    db.add(ncs_role)
    await db.commit()
    
    # Post system message
    from app.main import post_system_message
    await post_system_message(net_id, f"{display_callsign(current_user)} has claimed NCS", db)
    
    # Broadcast role change via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": current_user.id,
            "role": "NCS",
            "removed": False,
            "assigned_at": datetime.datetime.utcnow().isoformat()
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)

    from app.net_pause import sync_net_pause_state
    await sync_net_pause_state(db, net_id)

    return {"message": "NCS role claimed successfully"}


@router.put("/{net_id}/roles/toggle-self")
async def toggle_self_net_role(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Allow an NCS-role operator to toggle their own active/inactive status on a net."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")

    result = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id, NetRole.user_id == current_user.id, NetRole.role == "NCS")
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=403, detail="You do not have an NCS role on this net")

    currently_active = role.is_active if role.is_active is not None else True

    # Prevent stepping down if you are the only active NCS on an active net
    if currently_active and net.status == NetStatus.ACTIVE:
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.role == "NCS",
                NetRole.is_active == True  # noqa: E712
            )
        )
        active_ncs = result.scalars().all()
        if len(active_ncs) <= 1:
            raise HTTPException(
                status_code=400,
                detail="You are the only active NCS. Assign another NCS before stepping down."
            )

    role.is_active = not currently_active
    await db.commit()
    await db.refresh(role)

    from app.main import manager, post_system_message
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": current_user.id,
            "role": "NCS",
            "is_active": role.is_active,
            "assigned_at": role.assigned_at.isoformat() if hasattr(role.assigned_at, 'isoformat') else str(role.assigned_at)
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)

    action = "stepped up to NCS" if role.is_active else "stepped down to participant"
    await post_system_message(net_id, f"{display_callsign(current_user)} {action}", db)

    from app.net_pause import sync_net_pause_state
    await sync_net_pause_state(db, net_id)

    return {
        "id": role.id,
        "user_id": role.user_id,
        "role": role.role,
        "is_active": role.is_active,
        "assigned_at": role.assigned_at.isoformat() if hasattr(role.assigned_at, 'isoformat') else str(role.assigned_at)
    }


@router.get("/{net_id}/roles")
async def list_net_roles(
    net_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all roles for a net"""
    # Use eager loading to avoid N+1 queries
    result = await db.execute(
        select(NetRole).options(selectinload(NetRole.user)).where(NetRole.net_id == net_id)
    )
    roles = result.scalars().all()
    
    # Build role list using eagerly loaded user data.
    # For unauthenticated callers we expose only callsign + first name so guests
    # can see who is running the net without leaking email or surnames.
    from app.utils import get_avatar_url
    role_list = []
    is_authed = current_user is not None
    for role in roles:
        if role.user:
            entry = {
                "id": role.id,
                "user_id": role.user.id,
                "name": public_display_name(role.user.name, is_authed),
                "callsign": role.user.callsign,
                "role": role.role,
                "active_frequency_id": role.active_frequency_id,
                "assigned_at": role.assigned_at,
                "is_active": role.is_active if role.is_active is not None else True,
                "avatar_url": get_avatar_url(
                    role.user.email if is_authed else None,
                    getattr(role.user, 'avatar_url', None),
                ),
            }
            if is_authed:
                entry["email"] = role.user.email
            role_list.append(entry)
    
    return role_list


@router.put("/{net_id}/roles/{role_id}/frequency/{frequency_id}")
async def claim_ncs_frequency(
    net_id: int,
    role_id: int,
    frequency_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Claim a frequency as an NCS operator. Only the NCS themselves can claim their frequency."""
    # Get the net with frequencies
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Get the role
    result = await db.execute(select(NetRole).where(NetRole.id == role_id, NetRole.net_id == net_id))
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Only the NCS user, owner, or admin can set/change their frequency
    if role.user_id != current_user.id and net.owner_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to claim frequency for this role")
    
    # Verify the frequency belongs to this net
    if frequency_id not in [f.id for f in net.frequencies]:
        raise HTTPException(status_code=400, detail="Frequency not associated with this net")
    
    # Update the role's active frequency
    role.active_frequency_id = frequency_id
    await db.commit()
    
    # Get frequency info for the message
    freq = next((f for f in net.frequencies if f.id == frequency_id), None)
    freq_display = ""
    if freq:
        if freq.frequency:
            freq_display = f"{freq.frequency} {freq.mode or ''}".strip()
        else:
            freq_display = f"{freq.network or ''} TG{freq.talkgroup or ''} {freq.mode or ''}".strip()
    
    # Get user info
    result = await db.execute(select(User).where(User.id == role.user_id))
    user = result.scalar_one_or_none()
    callsign = user.callsign if user else "Unknown"
    
    # Post system message
    from app.main import post_system_message
    await post_system_message(net_id, f"{callsign} is now monitoring {freq_display}", db)
    
    # Broadcast role update via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": role.user_id,
            "role": role.role,
            "active_frequency_id": frequency_id,
            "assigned_at": role.assigned_at.isoformat() if hasattr(role.assigned_at, 'isoformat') else str(role.assigned_at)
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)
    
    return {"message": f"Now monitoring {freq_display}", "active_frequency_id": frequency_id}


@router.delete("/{net_id}/roles/{role_id}/frequency")
async def clear_ncs_frequency(
    net_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear the claimed frequency for an NCS operator."""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    result = await db.execute(select(NetRole).where(NetRole.id == role_id, NetRole.net_id == net_id))
    role = result.scalar_one_or_none()
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Only the NCS user, owner, or admin can clear their frequency
    if role.user_id != current_user.id and net.owner_id != current_user.id and not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to clear frequency for this role")
    
    role.active_frequency_id = None
    await db.commit()
    
    # Broadcast role update via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": role.user_id,
            "role": role.role,
            "active_frequency_id": None,
            "assigned_at": role.assigned_at.isoformat() if hasattr(role.assigned_at, 'isoformat') else str(role.assigned_at)
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)
    
    return {"message": "Frequency cleared"}


@router.post("/{net_id}/email-subscribers", status_code=200)
async def email_net_subscribers(
    net_id: int,
    email_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send an email to selected recipient groups for a net.

    Allowed recipients:
    - subscribers: subscribers of the net's template
    - staff: schedule staff (+ manager) for templated nets, or assigned net NCS (+ owner)
    - all: union of subscribers + staff

    Permission: admin, net owner/manager, or active template co-manager.
    """
    from app.email_service import EmailService
    from app.models import NetTemplateSubscription, TemplateStaff
    from jinja2 import Template
    
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - admin, net owner, or active template co-manager.
    is_admin = current_user.role == UserRole.ADMIN
    is_owner = net.owner_id == current_user.id
    is_co_manager = False
    if net.template_id and not (is_admin or is_owner):
        co_result = await db.execute(
            select(TemplateStaff).where(
                TemplateStaff.template_id == net.template_id,
                TemplateStaff.user_id == current_user.id,
                TemplateStaff.is_active == True,
                TemplateStaff.is_co_manager == True,
            )
        )
        is_co_manager = co_result.scalar_one_or_none() is not None

    if not (is_admin or is_owner or is_co_manager):
        raise HTTPException(status_code=403, detail="Not authorized to send emails for this net")

    recipient_group = (email_data.get('recipient_group') or 'subscribers').strip().lower()
    if recipient_group not in {'subscribers', 'staff', 'all'}:
        raise HTTPException(status_code=400, detail="recipient_group must be one of: subscribers, staff, all")
    
    subject = email_data.get('subject', '').strip()
    message = email_data.get('message', '').strip()
    
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message are required")
    
    recipients_by_id: dict[int, User] = {}

    # Subscribers (templated nets only)
    if recipient_group in {'subscribers', 'all'}:
        if not net.template_id:
            if recipient_group == 'subscribers':
                raise HTTPException(status_code=400, detail="This net has no template - no subscribers to email")
        else:
            result = await db.execute(
                select(User)
                .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
                .where(NetTemplateSubscription.template_id == net.template_id)
                .where(User.email_notifications == True)
                .where(User.is_active == True)
            )
            for subscriber in result.scalars().all():
                recipients_by_id[subscriber.id] = subscriber

    # Staff recipients
    if recipient_group in {'staff', 'all'}:
        if net.template_id:
            # Manager + active schedule staff
            owner_result = await db.execute(select(User).where(User.id == net.owner_id))
            owner_user = owner_result.scalar_one_or_none()
            if owner_user and owner_user.email and owner_user.email_notifications and owner_user.is_active:
                recipients_by_id[owner_user.id] = owner_user

            staff_result = await db.execute(
                select(User)
                .join(TemplateStaff, TemplateStaff.user_id == User.id)
                .where(TemplateStaff.template_id == net.template_id)
                .where(TemplateStaff.is_active == True)
                .where(User.email_notifications == True)
                .where(User.is_active == True)
            )
            for staff_user in staff_result.scalars().all():
                recipients_by_id[staff_user.id] = staff_user
        else:
            # Ad-hoc net fallback: owner + assigned NCS roles
            owner_result = await db.execute(select(User).where(User.id == net.owner_id))
            owner_user = owner_result.scalar_one_or_none()
            if owner_user and owner_user.email and owner_user.email_notifications and owner_user.is_active:
                recipients_by_id[owner_user.id] = owner_user

            ncs_result = await db.execute(
                select(User)
                .join(NetRole, NetRole.user_id == User.id)
                .where(NetRole.net_id == net.id)
                .where(NetRole.role == 'NCS')
                .where(User.email_notifications == True)
                .where(User.is_active == True)
            )
            for ncs_user in ncs_result.scalars().all():
                recipients_by_id[ncs_user.id] = ncs_user

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
                <p>You're receiving this because you subscribed to this net.</p>
                <p>Sent by: {{ sender_callsign }}</p>
            </div>
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        subject=subject,
        net_name=net.name,
        message=message,
        sender_callsign=display_callsign(current_user)
    )
    
    # Send emails
    sent_count = 0
    failed_count = 0
    
    for recipient in recipients:
        try:
            await EmailService.send_email(recipient.email, f"[{net.name}] {subject}", html_content)
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
