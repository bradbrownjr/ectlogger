from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, UTC
from app.database import get_db
from app.models import CheckIn, Net, NetStatus, User, StationStatus
from app.schemas import CheckInCreate, CheckInUpdate, CheckInResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/check-ins", tags=["check-ins"])


@router.post("/nets/{net_id}/check-ins", response_model=CheckInResponse, status_code=status.HTTP_201_CREATED)
async def create_check_in(
    net_id: int,
    check_in_data: CheckInCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a check-in for a net"""
    import json
    
    # Verify net exists and is active, load frequencies
    result = await db.execute(
        select(Net).options(selectinload(Net.frequencies)).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if net.status != NetStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Net is not active")
    
    # Validate and process frequency_id
    if check_in_data.frequency_id is None and net.active_frequency_id:
        check_in_data.frequency_id = net.active_frequency_id
    
    # Validate available_frequency_ids against net's prescribed frequencies
    available_freq_ids = check_in_data.available_frequency_ids or []
    if available_freq_ids:
        net_freq_ids = {f.id for f in net.frequencies}
        invalid_freqs = [fid for fid in available_freq_ids if fid not in net_freq_ids]
        if invalid_freqs:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid frequency IDs: {invalid_freqs}. Must be from net's prescribed frequencies."
            )
    
    # Check if this is a recheck (user previously checked in to this net)
    # Only consider the most recent check-in for this callsign
    result = await db.execute(
        select(CheckIn).where(
            CheckIn.net_id == net_id,
            CheckIn.callsign == check_in_data.callsign
        ).order_by(CheckIn.checked_in_at.desc()).limit(1)
    )
    existing_check_in = result.scalar_one_or_none()
    
    # Try to automatically link to existing user by callsign
    linked_user_id = None
    result = await db.execute(
        select(User).where(
            (User.callsign == check_in_data.callsign) | 
            (User.callsigns.like(f'%"{check_in_data.callsign}"%'))
        )
    )
    matching_user = result.scalar_one_or_none()
    if matching_user:
        linked_user_id = matching_user.id
    
    # If there's an existing check-in, update it and accumulate frequencies
    if existing_check_in:
        # Merge available frequencies - add new frequency_id to available_frequencies
        existing_freqs = json.loads(existing_check_in.available_frequencies) if existing_check_in.available_frequencies else []
        
        # Add previous frequency_id to available frequencies if it exists and isn't already there
        if existing_check_in.frequency_id and existing_check_in.frequency_id not in existing_freqs:
            existing_freqs.append(existing_check_in.frequency_id)
        
        # Add new frequency_id to available frequencies if it exists and isn't already there
        if check_in_data.frequency_id and check_in_data.frequency_id not in existing_freqs:
            existing_freqs.append(check_in_data.frequency_id)
        
        # Merge with user-provided available frequencies
        for freq_id in available_freq_ids:
            if freq_id not in existing_freqs:
                existing_freqs.append(freq_id)
        
        available_frequencies_json = json.dumps(existing_freqs)
        
        existing_check_in.user_id = linked_user_id
        existing_check_in.name = check_in_data.name
        existing_check_in.location = check_in_data.location
        existing_check_in.skywarn_number = check_in_data.skywarn_number
        existing_check_in.weather_observation = check_in_data.weather_observation
        existing_check_in.power_source = check_in_data.power_source
        existing_check_in.feedback = check_in_data.feedback
        existing_check_in.notes = check_in_data.notes
        existing_check_in.frequency_id = check_in_data.frequency_id
        existing_check_in.available_frequencies = available_frequencies_json
        existing_check_in.is_recheck = True
        existing_check_in.checked_in_by_id = current_user.id
        existing_check_in.status = StationStatus.CHECKED_IN
        existing_check_in.checked_out_at = None  # Clear checkout timestamp
        existing_check_in.checked_in_at = datetime.now(UTC)  # Update check-in time
        check_in = existing_check_in
    else:
        # Serialize available frequencies to JSON for new check-in
        available_frequencies_json = json.dumps(available_freq_ids)
    else:
        # Create new check-in
        check_in = CheckIn(
            net_id=net_id,
            user_id=linked_user_id,
            callsign=check_in_data.callsign,
            name=check_in_data.name,
            location=check_in_data.location,
            skywarn_number=check_in_data.skywarn_number,
            weather_observation=check_in_data.weather_observation,
            power_source=check_in_data.power_source,
            feedback=check_in_data.feedback,
            notes=check_in_data.notes,
            frequency_id=check_in_data.frequency_id,
            available_frequencies=available_frequencies_json,
            is_recheck=False,
            checked_in_by_id=current_user.id,
            status=StationStatus.CHECKED_IN
        )
        db.add(check_in)
    
    await db.commit()
    await db.refresh(check_in)
    
    return CheckInResponse.from_orm(check_in)


@router.get("/nets/{net_id}/check-ins", response_model=List[CheckInResponse])
async def list_check_ins(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List all check-ins for a net"""
    result = await db.execute(
        select(CheckIn)
        .where(CheckIn.net_id == net_id)
        .order_by(CheckIn.checked_in_at)
    )
    check_ins = result.scalars().all()
    
    return [CheckInResponse.from_orm(ci) for ci in check_ins]


@router.get("/check-ins/{check_in_id}", response_model=CheckInResponse)
async def get_check_in(
    check_in_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific check-in"""
    result = await db.execute(
        select(CheckIn).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    return CheckInResponse.from_orm(check_in)


@router.put("/check-ins/{check_in_id}", response_model=CheckInResponse)
async def update_check_in(
    check_in_id: int,
    check_in_update: CheckInUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a check-in"""
    result = await db.execute(
        select(CheckIn).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Update fields
    for field, value in check_in_update.dict(exclude_unset=True).items():
        setattr(check_in, field, value)
    
    await db.commit()
    await db.refresh(check_in)
    
    return CheckInResponse.from_orm(check_in)


@router.delete("/check-ins/{check_in_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_check_in(
    check_in_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a check-in"""
    result = await db.execute(
        select(CheckIn).where(CheckIn.id == check_in_id)
    )
    check_in = result.scalar_one_or_none()
    
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")
    
    # Check permissions (NCS, logger, or admin)
    result = await db.execute(select(Net).where(Net.id == check_in.net_id))
    net = result.scalar_one_or_none()
    
    if net.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.delete(check_in)
    await db.commit()
    
    return None
