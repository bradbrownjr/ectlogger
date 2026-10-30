"""The schedules the signed-in person has starred.

Starred schedules lead the Schedule page (their own Favorites group) and their
nets lead the dashboard. Saved on the account so they follow the person to
every phone and computer; until 2026-10-30 each browser kept its own list
(Brad). Guests still keep theirs in the browser, having no account.

Only ever the caller's own stars: there is no reading anyone else's.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import NetTemplate, ScheduleFavorite, User

router = APIRouter(prefix="/users/me/favorite-schedules", tags=["schedule-favorites"])


class FavoriteSchedulesAdd(BaseModel):
    """Stars a browser kept before they were saved to the account."""
    template_ids: List[int] = Field(default_factory=list, max_length=500)


async def _favorite_ids(db: AsyncSession, user_id: int) -> List[int]:
    # Joined to the schedule: SQLite doesn't enforce the CASCADE, so a star
    # can outlive a schedule deleted outside the ORM.
    rows = await db.execute(
        select(ScheduleFavorite.template_id)
        .join(NetTemplate, NetTemplate.id == ScheduleFavorite.template_id)
        .where(ScheduleFavorite.user_id == user_id)
        .order_by(ScheduleFavorite.template_id)
    )
    return list(rows.scalars())


async def _add_and_commit(db: AsyncSession, user_id: int, template_ids: List[int]) -> None:
    """Star each schedule and commit. Two requests adding the same star at
    once (two tabs, or React running the page's first load twice in
    development) can both find it missing; the second then hits the unique
    constraint. Its star is already there, so it rolls back and tries once
    more, which skips it."""
    for attempt in range(2):
        await _add(db, user_id, template_ids)
        try:
            await db.commit()
            return
        except IntegrityError:
            await db.rollback()
            if attempt:
                raise


async def _add(db: AsyncSession, user_id: int, template_ids: List[int]) -> None:
    """Star each schedule that exists and isn't starred yet."""
    wanted = set(template_ids)
    if not wanted:
        return
    existing = set((await db.execute(select(NetTemplate.id).where(NetTemplate.id.in_(wanted)))).scalars())
    starred = set((await db.execute(
        select(ScheduleFavorite.template_id).where(ScheduleFavorite.user_id == user_id)
    )).scalars())
    for template_id in sorted(existing - starred):
        db.add(ScheduleFavorite(user_id=user_id, template_id=template_id))


@router.get("", response_model=List[int])
async def list_favorite_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ids of the schedules the caller has starred."""
    return await _favorite_ids(db, current_user.id)


@router.post("", response_model=List[int])
async def add_favorite_schedules(
    body: FavoriteSchedulesAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a browser's stars to the account, the first time the person signs
    in there. Adds only: a star already removed on another device stays off
    the account unless this browser still had it. Unknown ids are ignored.
    Returns every starred id."""
    user_id = current_user.id  # read up front: a rollback expires current_user
    await _add_and_commit(db, user_id, body.template_ids)
    return await _favorite_ids(db, user_id)


@router.put("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def star_schedule(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Star one schedule. Starring it again changes nothing."""
    if not (await db.execute(select(NetTemplate.id).where(NetTemplate.id == template_id))).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Schedule not found")
    await _add_and_commit(db, current_user.id, [template_id])


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unstar_schedule(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove one star. Removing one that isn't there changes nothing."""
    await db.execute(delete(ScheduleFavorite).where(
        ScheduleFavorite.user_id == current_user.id, ScheduleFavorite.template_id == template_id))
    await db.commit()
