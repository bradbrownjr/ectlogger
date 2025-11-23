from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime
import csv
import io
from app.database import get_db
from app.models import Net, NetStatus, User, Frequency, NetRole, net_frequencies, CheckIn
from app.schemas import NetCreate, NetUpdate, NetResponse, FrequencyResponse
from app.dependencies import get_current_user
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
    current_user: User = Depends(get_current_user)
):
    """List nets with optional status filter, excludes archived by default"""
    query = select(Net).options(selectinload(Net.frequencies))
    
    if status:
        query = query.where(Net.status == status)
    elif not include_archived:
        # Exclude archived nets by default
        query = query.where(Net.status != NetStatus.ARCHIVED)
    
    query = query.offset(skip).limit(limit).order_by(Net.created_at.desc())
    
    result = await db.execute(query)
    nets = result.scalars().all()
    
    return [NetResponse.from_orm(net) for net in nets]


@router.get("/{net_id}", response_model=NetResponse)
async def get_net(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get net by ID"""
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    return NetResponse.from_orm(net)


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
    
    # Send notifications to subscribers
    # TODO: Query users who have signed up for this net
    # For now, we'll skip this and implement it when we add subscriptions
    
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
            selectinload(Net.check_ins)
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
    
    # Get owner/NCS information
    result = await db.execute(
        select(User).where(User.id == net.owner_id)
    )
    owner = result.scalar_one_or_none()
    
    # Prepare check-ins data for email
    check_ins_data = []
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        check_ins_data.append({
            'time': check_in.checked_in_at.strftime("%Y-%m-%d %H:%M:%S") if check_in.checked_in_at else "",
            'callsign': check_in.callsign,
            'name': check_in.name,
            'location': check_in.location,
            'skywarn_number': check_in.skywarn_number or '',
            'weather_observation': check_in.weather_observation or '',
            'power_source': check_in.power_source or '',
            'feedback': check_in.feedback or '',
            'notes': check_in.notes or '',
            'status': check_in.status.value if check_in.status else ''
        })
    
    # Send log email to owner
    if owner and owner.email:
        try:
            email_service = EmailService()
            await email_service.send_net_log(
                email=owner.email,
                net_name=net.name,
                net_description=net.description or "",
                ncs_name=owner.callsign or owner.name or owner.email,
                check_ins=check_ins_data,
                started_at=net.started_at.strftime("%Y-%m-%d %H:%M:%S") if net.started_at else "N/A",
                closed_at=net.closed_at.strftime("%Y-%m-%d %H:%M:%S") if net.closed_at else "N/A"
            )
        except Exception as e:
            # Log error but don't fail the close operation
            print(f"Failed to send net log email: {e}")
    
    return NetResponse.from_orm(net)


@router.get("/{net_id}/export/csv")
async def export_net_csv(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export net check-ins as CSV"""
    # Get net with check-ins
    result = await db.execute(
        select(Net).options(
            selectinload(Net.check_ins).selectinload(CheckIn.frequency)
        ).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    # Check permissions - anyone can export a net they have access to
    if not await check_net_permission(db, net, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to export this net")
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    headers = [
        "Check-in Time", "Callsign", "Name", "Location", 
        "Frequency", "SKYWARN Number", "Weather Observation",
        "Power Source", "Feedback", "Notes", "Status"
    ]
    writer.writerow(headers)
    
    # Write check-ins
    for check_in in sorted(net.check_ins, key=lambda x: x.checked_in_at):
        frequency_str = ""
        if check_in.frequency:
            if check_in.frequency.frequency:
                frequency_str = f"{check_in.frequency.frequency} {check_in.frequency.mode}"
            else:
                # Digital mode
                frequency_str = f"{check_in.frequency.network} TG{check_in.frequency.talkgroup}"
        
        writer.writerow([
            check_in.checked_in_at.strftime("%Y-%m-%d %H:%M:%S") if check_in.checked_in_at else "",
            check_in.callsign,
            check_in.name,
            check_in.location,
            frequency_str,
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
    
    await db.delete(role)
    await db.commit()
    return None


@router.get("/{net_id}/roles")
async def list_net_roles(
    net_id: int,
    current_user: User = Depends(get_current_user),
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
