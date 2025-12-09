from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List
from app.database import get_db
from app.models import Frequency, User, net_frequencies
from app.schemas import FrequencyCreate, FrequencyResponse, FrequencyWithUsageResponse
from app.dependencies import get_current_user, get_current_admin_user

router = APIRouter(prefix="/frequencies", tags=["frequencies"])


@router.post("", response_model=FrequencyResponse, status_code=status.HTTP_201_CREATED)
async def create_frequency(
    frequency_data: FrequencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new frequency"""
    frequency = Frequency(
        frequency=frequency_data.frequency,
        mode=frequency_data.mode,
        network=frequency_data.network,
        talkgroup=frequency_data.talkgroup,
        description=frequency_data.description
    )
    
    db.add(frequency)
    await db.commit()
    await db.refresh(frequency)
    
    return FrequencyResponse.from_orm(frequency)


@router.get("", response_model=List[FrequencyResponse])
async def list_frequencies(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all frequencies"""
    result = await db.execute(
        select(Frequency).offset(skip).limit(limit).order_by(Frequency.frequency)
    )
    frequencies = result.scalars().all()
    
    return [FrequencyResponse.from_orm(freq) for freq in frequencies]


@router.get("/admin/with-usage", response_model=List[FrequencyWithUsageResponse])
async def list_frequencies_with_usage(
    current_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all frequencies with net usage count (admin only)"""
    # Get frequencies with count of nets using each
    result = await db.execute(
        select(
            Frequency,
            func.count(net_frequencies.c.net_id).label('net_count')
        )
        .outerjoin(net_frequencies, Frequency.id == net_frequencies.c.frequency_id)
        .group_by(Frequency.id)
        .order_by(Frequency.frequency)
    )
    
    frequencies_with_counts = result.all()
    
    return [
        FrequencyWithUsageResponse(
            id=freq.id,
            frequency=freq.frequency,
            mode=freq.mode,
            network=freq.network,
            talkgroup=freq.talkgroup,
            description=freq.description,
            created_at=freq.created_at,
            net_count=count
        )
        for freq, count in frequencies_with_counts
    ]


@router.get("/{frequency_id}", response_model=FrequencyResponse)
async def get_frequency(
    frequency_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific frequency"""
    result = await db.execute(
        select(Frequency).where(Frequency.id == frequency_id)
    )
    frequency = result.scalar_one_or_none()
    
    if not frequency:
        raise HTTPException(status_code=404, detail="Frequency not found")
    
    return FrequencyResponse.from_orm(frequency)


@router.put("/{frequency_id}", response_model=FrequencyResponse)
async def update_frequency(
    frequency_id: int,
    frequency_data: FrequencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a frequency"""
    result = await db.execute(
        select(Frequency).where(Frequency.id == frequency_id)
    )
    frequency = result.scalar_one_or_none()
    
    if not frequency:
        raise HTTPException(status_code=404, detail="Frequency not found")
    
    # Update fields
    frequency.frequency = frequency_data.frequency
    frequency.mode = frequency_data.mode
    frequency.network = frequency_data.network
    frequency.talkgroup = frequency_data.talkgroup
    frequency.description = frequency_data.description
    
    await db.commit()
    await db.refresh(frequency)
    
    return FrequencyResponse.from_orm(frequency)


@router.delete("/{frequency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_frequency(
    frequency_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a frequency"""
    result = await db.execute(
        select(Frequency).where(Frequency.id == frequency_id)
    )
    frequency = result.scalar_one_or_none()
    
    if not frequency:
        raise HTTPException(status_code=404, detail="Frequency not found")
    
    await db.delete(frequency)
    await db.commit()
    
    return None
