from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
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
    # Verify net exists and is active
    result = await db.execute(select(Net).where(Net.id == net_id))
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if net.status != NetStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Net is not active")
    
    # Check if this is a recheck (user previously checked in)
    result = await db.execute(
        select(CheckIn).where(
            CheckIn.net_id == net_id,
            CheckIn.callsign == check_in_data.callsign
        )
    )
    existing_check_in = result.scalar_one_or_none()
    is_recheck = existing_check_in is not None
    
    # Create check-in
    check_in = CheckIn(
        net_id=net_id,
        user_id=current_user.id if current_user else None,
        callsign=check_in_data.callsign,
        name=check_in_data.name,
        location=check_in_data.location,
        skywarn_number=check_in_data.skywarn_number,
        weather_observation=check_in_data.weather_observation,
        power_source=check_in_data.power_source,
        feedback=check_in_data.feedback,
        notes=check_in_data.notes,
        frequency_id=check_in_data.frequency_id,
        is_recheck=is_recheck,
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
