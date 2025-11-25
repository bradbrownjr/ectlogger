from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
import csv
import io
import json
from app.database import get_db
from app.models import Net, NetStatus, User, Frequency, NetRole, net_frequencies, CheckIn
from app.schemas import NetCreate, NetUpdate, NetResponse, FrequencyResponse
from app.dependencies import get_current_user, get_current_user_optional
from app.email_service import EmailService

router = APIRouter(prefix="/nets", tags=["nets"])


async def check_net_permission(db: AsyncSession, net: Net, user: User, required_roles: List[str] = None) -> bool:
    """Check if user has permission to manage a net (owner, admin, or has required role)"""
    # Owner and admin always have permission
    if net.owner_id == user.id or user.role.value == "admin":
        return True
    
    # Check if user has required role for this net
    if required_roles:
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net.id,
                NetRole.user_id == user.id,
                NetRole.role.in_(required_roles)
            )
        )
        if result.scalar_one_or_none():
            return True
    
    return False


@router.post("/", response_model=NetResponse, status_code=status.HTTP_201_CREATED)
async def create_net(
    net_data: NetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new net"""
    import json
    
    net = Net(
        name=net_data.name,
        description=net_data.description,
        owner_id=current_user.id,
        status=NetStatus.DRAFT,
        field_config=json.dumps(net_data.field_config) if net_data.field_config else None
    )
    db.add(net)
    await db.flush()
    
    # Add frequencies using the association table directly to avoid lazy loading
    if net_data.frequency_ids:
        # Verify frequencies exist
        result = await db.execute(
            select(Frequency).where(Frequency.id.in_(net_data.frequency_ids))
        )
        frequencies = result.scalars().all()
        
        # Insert into association table directly
        for freq in frequencies:
            await db.execute(
                net_frequencies.insert().values(net_id=net.id, frequency_id=freq.id)
            )
    
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    return NetResponse.from_orm(net)


@router.get("/", response_model=List[NetResponse])
async def list_nets(
    status: NetStatus = None,
    include_archived: bool = False,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """List nets with optional status filter, excludes archived by default (no auth required for guest access)"""
    query = select(Net).options(
        selectinload(Net.frequencies),
        selectinload(Net.owner)
    )
    
    if status:
        query = query.where(Net.status == status)
    elif not include_archived:
        # Exclude archived nets by default
        query = query.where(Net.status != NetStatus.ARCHIVED)
    
    query = query.offset(skip).limit(limit).order_by(Net.created_at.desc())
    
    result = await db.execute(query)
    nets = result.scalars().all()
    
    return [
        NetResponse.from_orm(
            net,
            owner_callsign=net.owner.callsign if net.owner else None,
            owner_name=net.owner.name if net.owner else None
        ) for net in nets
    ]


@router.get("/{net_id}", response_model=NetResponse)
async def get_net(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get net by ID"""
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.owner)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    return NetResponse.from_orm(
        net,
        owner_callsign=net.owner.callsign if net.owner else None,
        owner_name=net.owner.name if net.owner else None
    )


@router.get("/{net_id}/stats")
async def get_net_stats(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get net statistics including online users and check-in counts"""
    from app.main import manager
    from app.models import CheckIn
    
    # Verify net exists
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Get online user IDs
    online_user_ids = list(manager.get_online_users(net_id))
    
    # Get check-in counts
    check_in_result = await db.execute(
        select(CheckIn).where(
            CheckIn.net_id == net_id,
            CheckIn.status != 'checked_out'
        )
    )
    check_ins = check_in_result.scalars().all()
    total_check_ins = len(check_ins)
    
    # Count guests (check-ins without user_id or user not online)
    guest_count = sum(1 for ci in check_ins if not ci.user_id or ci.user_id not in online_user_ids)
    
    return {
        "net_id": net_id,
        "online_user_ids": online_user_ids,
        "total_check_ins": total_check_ins,
        "online_count": len(online_user_ids),
        "guest_count": guest_count
    }


@router.put("/{net_id}", response_model=NetResponse)
async def update_net(
    net_id: int,
    net_update: NetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update net details"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - owner, admin, or NCS can update
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        raise HTTPException(status_code=403, detail="Not authorized to update this net")
    
    # Update fields
    import json
    update_data = net_update.dict(exclude_unset=True, exclude={'frequency_ids'})
    for field, value in update_data.items():
        if field == 'field_config' and value is not None:
            setattr(net, field, json.dumps(value))
        else:
            setattr(net, field, value)
    
    # Update frequencies if provided
    if net_update.frequency_ids is not None:
        result = await db.execute(
            select(Frequency).where(Frequency.id.in_(net_update.frequency_ids))
        )
        frequencies = result.scalars().all()
        net.frequencies = frequencies
    
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    return NetResponse.from_orm(net)


@router.post("/{net_id}/start", response_model=NetResponse)
async def start_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Start a net and notify subscribers"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - owner, admin, or NCS can start
    if not await check_net_permission(db, net, current_user, ["NCS"]):
        raise HTTPException(status_code=403, detail="Not authorized to start this net")
    
    if net.status == NetStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Net is already active")
    
    net.status = NetStatus.ACTIVE
    net.started_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    # Auto-check-in the NCS
    from app.models import CheckIn, StationStatus
    ncs_check_in = CheckIn(
        net_id=net_id,
        user_id=current_user.id,
        callsign=current_user.callsign or current_user.email.split('@')[0].upper(),
        name=current_user.name or '',
        location=current_user.location or '',
        status=StationStatus.CHECKED_IN,
        checked_in_by_id=current_user.id,
        is_recheck=False
    )
    db.add(ncs_check_in)
    await db.commit()
    
    # Post system message for net start
    from app.main import post_system_message
    await post_system_message(net_id, f"Net has been started by {current_user.callsign or current_user.email}", db)
    
    # Send email notification to net owner and template subscribers
    try:
        emails_to_notify = []
        
        # Add net owner (if they have notifications enabled)
        result = await db.execute(select(User).where(User.id == net.owner_id))
        owner = result.scalar_one_or_none()
        if owner and owner.email and owner.email_notifications and owner.notify_net_start:
            emails_to_notify.append(owner.email)
        
        # If net was created from template, add all subscribers who want start notifications
        if net.template_id:
            from app.models import NetTemplateSubscription
            result = await db.execute(
                select(User)
                .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
                .where(NetTemplateSubscription.template_id == net.template_id)
                .where(User.email_notifications == True)
                .where(User.notify_net_start == True)
            )
            subscribers = result.scalars().all()
            for subscriber in subscribers:
                if subscriber.email and subscriber.email not in emails_to_notify:
                    emails_to_notify.append(subscriber.email)
        
        # Send notifications
        if emails_to_notify:
            await EmailService.send_net_notification(emails_to_notify, net.name, net.id)
    except Exception as e:
        print(f"Failed to send net start notification: {e}")
    
    return NetResponse.from_orm(net)


@router.put("/{net_id}/active-frequency/{frequency_id}", response_model=NetResponse)
async def set_active_frequency(
    net_id: int,
    frequency_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set the active frequency for a net (NCS/Logger only)"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - NCS, Logger, or admin
    if not await check_net_permission(db, net, current_user, ["NCS", "Logger"]):
        raise HTTPException(status_code=403, detail="Not authorized to change frequency")
    
    # Verify the frequency belongs to this net
    if frequency_id not in [f.id for f in net.frequencies]:
        raise HTTPException(status_code=400, detail="Frequency not associated with this net")
    
    net.active_frequency_id = frequency_id
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    # Post system message for frequency change
    from app.main import post_system_message
    active_freq = next((f for f in net.frequencies if f.id == frequency_id), None)
    if active_freq:
        freq_display = f"{active_freq.frequency} {active_freq.mode or ''}" if active_freq.frequency else f"{active_freq.network} TG{active_freq.talkgroup or ''}"
        await post_system_message(net_id, f"Active frequency changed to {freq_display.strip()}", db)
    
    return NetResponse.from_orm(net)


@router.delete("/{net_id}/active-frequency", response_model=NetResponse)
async def clear_active_frequency(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear the active frequency for a net (NCS/Logger only)"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - NCS, Logger, or admin
    if not await check_net_permission(db, net, current_user, ["NCS", "Logger"]):
        raise HTTPException(status_code=403, detail="Not authorized to change frequency")
    
    net.active_frequency_id = None
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    return NetResponse.from_orm(net)


@router.post("/{net_id}/close", response_model=NetResponse)
async def close_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Close a net and send log to NCS"""
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins).selectinload(CheckIn.frequency)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Allow net closure by NCS, logger, or admin
    is_authorized = (
        net.owner_id == current_user.id or
        current_user.role.value == "admin"
    )
    
    if not is_authorized:
        # Check if user is a logger for this net
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net_id,
                NetRole.user_id == current_user.id,
                NetRole.role.in_(["LOGGER", "NCS"])
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not authorized to close this net")
    
    if net.status == NetStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Net is already closed")
    
    net.status = NetStatus.CLOSED
    net.closed_at = datetime.utcnow()
    
    await db.commit()
    
    # Post system message for net close
    from app.main import post_system_message
    await post_system_message(net_id, f"Net has been closed by {current_user.callsign or current_user.email}", db)
    
    # Get owner/NCS information
    result = await db.execute(
        select(User).where(User.id == net.owner_id)
    )
    owner = result.scalar_one_or_none()
    
    # Build frequency lookup map
    freq_map = {f.id: f for f in net.frequencies}
    
    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""
    
    # Prepare check-ins data for email
    check_ins_data = []
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        # Get available frequencies list
        available_freqs = []
        if check_in.available_frequencies:
            try:
                freq_ids = json.loads(check_in.available_frequencies)
                for fid in freq_ids:
                    if fid in freq_map:
                        available_freqs.append(format_freq(freq_map[fid]))
            except (json.JSONDecodeError, TypeError):
                pass
        
        check_ins_data.append({
            'time': check_in.checked_in_at.strftime("%Y-%m-%d %H:%M:%S") if check_in.checked_in_at else "",
            'callsign': check_in.callsign,
            'name': check_in.name,
            'location': check_in.location,
            'frequencies': ', '.join(available_freqs) if available_freqs else '',
            'skywarn_number': check_in.skywarn_number or '',
            'weather_observation': check_in.weather_observation or '',
            'power_source': check_in.power_source or '',
            'feedback': check_in.feedback or '',
            'notes': check_in.notes or '',
            'status': check_in.status.value if check_in.status else ''
        })
    
    # Get chat messages
    from app.models import ChatMessage
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.user))
        .where(ChatMessage.net_id == net_id)
        .order_by(ChatMessage.created_at.asc())
    )
    chat_messages_data = []
    for msg in result.scalars().all():
        chat_messages_data.append({
            'timestamp': msg.created_at.strftime("%Y-%m-%d %H:%M:%S") if msg.created_at else "",
            'callsign': msg.user.callsign if msg.user and msg.user.callsign else 'Unknown',
            'message': msg.message
        })
    
    # Build list of email recipients (owner + subscribers who want close notifications)
    emails_to_send = []
    
    # Add owner if they have notifications enabled
    if owner and owner.email and owner.email_notifications and owner.notify_net_close:
        emails_to_send.append(owner.email)
    
    # Add subscribers who want close notifications
    if net.template_id:
        from app.models import NetTemplateSubscription
        result = await db.execute(
            select(User)
            .join(NetTemplateSubscription, NetTemplateSubscription.user_id == User.id)
            .where(NetTemplateSubscription.template_id == net.template_id)
            .where(User.email_notifications == True)
            .where(User.notify_net_close == True)
        )
        subscribers = result.scalars().all()
        for subscriber in subscribers:
            if subscriber.email and subscriber.email not in emails_to_send:
                emails_to_send.append(subscriber.email)
    
    # Send log email to all recipients
    ncs_name = owner.callsign or owner.name or owner.email if owner else "Unknown"
    for email in emails_to_send:
        try:
            email_service = EmailService()
            await email_service.send_net_log(
                email=email,
                net_name=net.name,
                net_description=net.description or "",
                ncs_name=ncs_name,
                check_ins=check_ins_data,
                started_at=net.started_at.strftime("%Y-%m-%d %H:%M:%S") if net.started_at else "N/A",
                closed_at=net.closed_at.strftime("%Y-%m-%d %H:%M:%S") if net.closed_at else "N/A",
                chat_messages=chat_messages_data if chat_messages_data else None
            )
        except Exception as e:
            # Log error but don't fail the close operation
            print(f"Failed to send net log email to {email}: {e}")
    
    return NetResponse.from_orm(net)


@router.get("/{net_id}/export/csv")
async def export_net_csv(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export net check-ins as CSV"""
    # Get net with check-ins and frequencies
    result = await db.execute(
        select(Net).options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins).selectinload(CheckIn.frequency)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - anyone can export a net they have access to
    if not await check_net_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to export this net")
    
    # Build frequency lookup map
    freq_map = {f.id: f for f in net.frequencies}
    
    # Helper to format frequency
    def format_freq(freq):
        if freq.frequency:
            return f"{freq.frequency} {freq.mode or ''}".strip()
        elif freq.network:
            return f"{freq.network} TG{freq.talkgroup or ''}"
        return ""
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    headers = [
        "Check-in Time", "Callsign", "Name", "Location", 
        "Available Frequencies", "Spotter #", "Weather Observation",
        "Power Source", "Feedback", "Notes", "Status"
    ]
    writer.writerow(headers)
    
    # Write check-ins
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        # Get available frequencies list
        available_freqs = []
        if check_in.available_frequencies:
            try:
                freq_ids = json.loads(check_in.available_frequencies)
                for fid in freq_ids:
                    if fid in freq_map:
                        available_freqs.append(format_freq(freq_map[fid]))
            except (json.JSONDecodeError, TypeError):
                pass
        
        writer.writerow([
            check_in.checked_in_at.strftime("%Y-%m-%d %H:%M:%S") if check_in.checked_in_at else "",
            check_in.callsign,
            check_in.name,
            check_in.location,
            ', '.join(available_freqs) if available_freqs else "",
            check_in.skywarn_number or "",
            check_in.weather_observation or "",
            check_in.power_source or "",
            check_in.feedback or "",
            check_in.notes or "",
            check_in.status.value if check_in.status else ""
        ])
    
    # Prepare response
    output.seek(0)
    filename = f"{net.name.replace(' ', '_')}_{net.started_at.strftime('%Y%m%d') if net.started_at else 'draft'}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.delete("/{net_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a net"""
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions
    if net.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this net")
    
    await db.delete(net)
    await db.commit()
    
    return None


@router.post("/{net_id}/archive", response_model=NetResponse)
async def archive_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive a closed net"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions
    if net.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to archive this net")
    
    if net.status != NetStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Only closed nets can be archived")
    
    net.status = NetStatus.ARCHIVED
    await db.commit()
    await db.refresh(net, ['frequencies'])
    
    return NetResponse.from_orm(net)


@router.post("/{net_id}/clone", response_model=NetResponse)
async def clone_net(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clone a net with its settings, frequencies, and field configuration"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    original_net = result.scalar_one_or_none()
    
    if not original_net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Create new net with copied settings
    new_net = Net(
        name=f"{original_net.name} (Copy)",
        description=original_net.description,
        owner_id=current_user.id,
        field_config=original_net.field_config,
        status=NetStatus.DRAFT
    )
    db.add(new_net)
    await db.flush()
    
    # Copy frequencies
    for freq in original_net.frequencies:
        await db.execute(
            net_frequencies.insert().values(net_id=new_net.id, frequency_id=freq.id)
        )
    
    await db.commit()
    await db.refresh(new_net, ['frequencies'])
    
    return NetResponse.from_orm(new_net)


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
    if net.owner_id != current_user.id and current_user.role.value != "admin":
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
    from app.main import manager
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
    if net.owner_id != current_user.id and current_user.role.value != "admin":
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
    
    await db.delete(role)
    await db.commit()

    # Broadcast role removal via WebSocket
    from app.main import manager
    import datetime
    await manager.broadcast({
        "type": "role_change",
        "data": {
            "net_id": net_id,
            "user_id": role.user_id,
            "role": role.role,
            "removed": True,
            "removed_at": datetime.datetime.utcnow().isoformat()
        },
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, net_id)

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
    if net.owner_id != current_user.id and current_user.role.value != "admin":
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
    await post_system_message(net_id, f"{current_user.callsign or current_user.email} has claimed NCS", db)
    
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
    
    return {"message": "NCS role claimed successfully"}


@router.get("/{net_id}/roles")
async def list_net_roles(
    net_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all roles for a net"""
    result = await db.execute(
        select(NetRole).where(NetRole.net_id == net_id)
    )
    roles = result.scalars().all()
    
    # Get user details for each role
    role_list = []
    for role in roles:
        result = await db.execute(select(User).where(User.id == role.user_id))
        user = result.scalar_one_or_none()
        if user:
            role_list.append({
                "id": role.id,
                "user_id": user.id,
                "email": user.email,
                "name": user.name,
                "callsign": user.callsign,
                "role": role.role,
                "assigned_at": role.assigned_at
            })
    
    return role_list
