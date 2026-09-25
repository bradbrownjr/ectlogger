from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import List, Optional
from app.database import get_db
from app.models import CheckIn, Frequency, Net, User, net_frequencies, net_template_frequencies
from app.schemas import FrequencyCreate, FrequencyResponse, FrequencyWithUsageResponse
from app.dependencies import get_current_user, get_admin_user

router = APIRouter(prefix="/frequencies", tags=["frequencies"])


async def check_duplicate_frequency(
    db: AsyncSession,
    frequency: Optional[str],
    mode: str,
    network: Optional[str],
    talkgroup: Optional[str],
    exclude_id: Optional[int] = None
) -> Optional[Frequency]:
    """
    Check if a duplicate frequency already exists.
    A duplicate is defined as matching: frequency + mode + network + talkgroup
    (since the same frequency could be used by different repeaters across the country,
    we need all 4 fields to match to be considered a true duplicate)
    """
    # Build conditions for the query
    conditions = [
        # Handle None vs empty string - treat them as equal for comparison
        or_(
            and_(Frequency.frequency == frequency, frequency is not None),
            and_(Frequency.frequency.is_(None), frequency is None),
            and_(Frequency.frequency == '', frequency == ''),
            and_(Frequency.frequency.is_(None), frequency == ''),
            and_(Frequency.frequency == '', frequency is None)
        ),
        Frequency.mode == mode,
        or_(
            and_(Frequency.network == network, network is not None),
            and_(Frequency.network.is_(None), network is None),
            and_(Frequency.network == '', network == ''),
            and_(Frequency.network.is_(None), network == ''),
            and_(Frequency.network == '', network is None)
        ),
        or_(
            and_(Frequency.talkgroup == talkgroup, talkgroup is not None),
            and_(Frequency.talkgroup.is_(None), talkgroup is None),
            and_(Frequency.talkgroup == '', talkgroup == ''),
            and_(Frequency.talkgroup.is_(None), talkgroup == ''),
            and_(Frequency.talkgroup == '', talkgroup is None)
        ),
    ]
    
    # Exclude a specific ID (for updates)
    if exclude_id is not None:
        conditions.append(Frequency.id != exclude_id)
    
    result = await db.execute(
        select(Frequency).where(and_(*conditions))
    )
    return result.scalar_one_or_none()


def format_duplicate_error(freq: Frequency) -> str:
    """Format a user-friendly error message for duplicate frequency"""
    parts = []
    if freq.frequency:
        parts.append(freq.frequency)
    parts.append(freq.mode)
    if freq.network:
        parts.append(f"on {freq.network}")
    if freq.talkgroup:
        parts.append(f"TG {freq.talkgroup}")
    return f"A frequency with these details already exists: {' '.join(parts)}"


async def frequency_usage(db: AsyncSession) -> dict:
    """Return {frequency_id: (net_count, schedule_count, check_in_count)} for
    every frequency referenced anywhere.

    The one definition of "in use", shared by delete_frequency (which refuses
    to delete one) and the admin list (which greys out its Delete button), so
    the button and the server can never disagree. Check-ins count because
    CheckIn.frequency_id and Net.active_frequency_id have no ON DELETE rule: a
    frequency removed from a net after stations logged on it would otherwise
    leave those check-ins pointing at a row that no longer exists.
    """
    usage: dict = {}

    def _add(rows, slot):
        for freq_id, count in rows:
            if freq_id is None:
                continue
            counts = usage.setdefault(freq_id, [0, 0, 0])
            counts[slot] += count

    _add((await db.execute(
        select(net_frequencies.c.frequency_id, func.count(func.distinct(net_frequencies.c.net_id)))
        .group_by(net_frequencies.c.frequency_id)
    )).all(), 0)
    # A net's active frequency is normally also one of its frequencies; count
    # it as a net use only when it isn't, so a net is never counted twice.
    _add((await db.execute(
        select(Net.active_frequency_id, func.count(Net.id))
        .where(Net.active_frequency_id.is_not(None))
        .where(~select(net_frequencies.c.net_id).where(
            net_frequencies.c.net_id == Net.id,
            net_frequencies.c.frequency_id == Net.active_frequency_id,
        ).exists())
        .group_by(Net.active_frequency_id)
    )).all(), 0)
    _add((await db.execute(
        select(net_template_frequencies.c.frequency_id, func.count(func.distinct(net_template_frequencies.c.template_id)))
        .group_by(net_template_frequencies.c.frequency_id)
    )).all(), 1)
    _add((await db.execute(
        select(CheckIn.frequency_id, func.count(CheckIn.id))
        .where(CheckIn.frequency_id.is_not(None))
        .group_by(CheckIn.frequency_id)
    )).all(), 2)
    return {freq_id: tuple(counts) for freq_id, counts in usage.items()}


@router.post("", response_model=FrequencyResponse, status_code=status.HTTP_201_CREATED)
async def create_frequency(
    frequency_data: FrequencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new frequency"""
    # Check for duplicates
    existing = await check_duplicate_frequency(
        db,
        frequency=frequency_data.frequency,
        mode=frequency_data.mode,
        network=frequency_data.network,
        talkgroup=frequency_data.talkgroup
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=format_duplicate_error(existing)
        )
    
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
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all frequencies with their usage (admin only)"""
    result = await db.execute(select(Frequency).order_by(Frequency.frequency))
    usage = await frequency_usage(db)

    responses = []
    for freq in result.scalars().all():
        net_count, schedule_count, check_in_count = usage.get(freq.id, (0, 0, 0))
        responses.append(FrequencyWithUsageResponse(
            id=freq.id,
            frequency=freq.frequency,
            mode=freq.mode,
            network=freq.network,
            talkgroup=freq.talkgroup,
            description=freq.description,
            created_at=freq.created_at,
            net_count=net_count,
            schedule_count=schedule_count,
            check_in_count=check_in_count,
        ))
    return responses


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
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a frequency (admin only).

    Frequencies are one list shared by every net and schedule on the
    instance, so editing one changes it everywhere it is used. Until
    2026-09-25 any signed-in user could do this, from the frequency table on
    the net and schedule forms.
    """
    result = await db.execute(
        select(Frequency).where(Frequency.id == frequency_id)
    )
    frequency = result.scalar_one_or_none()
    
    if not frequency:
        raise HTTPException(status_code=404, detail="Frequency not found")
    
    # Check for duplicates (excluding this frequency)
    existing = await check_duplicate_frequency(
        db,
        frequency=frequency_data.frequency,
        mode=frequency_data.mode,
        network=frequency_data.network,
        talkgroup=frequency_data.talkgroup,
        exclude_id=frequency_id
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=format_duplicate_error(existing)
        )
    
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
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a frequency (admin only), refused with 409 while it is in use.

    Until 2026-09-25 any signed-in user could delete any frequency, and
    nothing checked whether it was in use: net_frequencies and
    net_template_frequencies cascade, so it silently vanished from every net
    and schedule using it, and check-ins logged on it were left pointing at a
    deleted row. Only the admin screen's disabled button stood in the way.
    """
    result = await db.execute(
        select(Frequency).where(Frequency.id == frequency_id)
    )
    frequency = result.scalar_one_or_none()

    if not frequency:
        raise HTTPException(status_code=404, detail="Frequency not found")

    net_count, schedule_count, check_in_count = (await frequency_usage(db)).get(frequency_id, (0, 0, 0))
    if net_count or schedule_count or check_in_count:
        uses = []
        if net_count:
            uses.append(f"{net_count} net{'s' if net_count != 1 else ''}")
        if schedule_count:
            uses.append(f"{schedule_count} schedule{'s' if schedule_count != 1 else ''}")
        if check_in_count:
            uses.append(f"{check_in_count} check-in{'s' if check_in_count != 1 else ''}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This frequency is still used by {', '.join(uses)}, so it can't be deleted.",
        )

    await db.delete(frequency)
    await db.commit()

    return None
