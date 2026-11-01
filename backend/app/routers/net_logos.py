"""Logo library: reuse a logo already on the site, and pass a replaced logo
on to the other nets and schedules that showed the old one.

Uploading and removing stay on POST/DELETE /nets/{id}/logo and
/templates/{id}/logo. See services/net_logos.py for why logo files are
shared and only deleted once nothing points at them.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import (
    LogoApplyRequest,
    LogoApplyResponse,
    LogoLibraryEntry,
    LogoUseNet,
    LogoUses,
    LogoUseSchedule,
)
from app.services.net_logos import (
    LogoPermissionError,
    apply_logo,
    editable_uses,
    logo_in_use,
    logo_library,
    logo_path,
    release_logos,
)

router = APIRouter(prefix="/logos", tags=["logos"])


@router.get("", response_model=List[LogoLibraryEntry])
async def list_logos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Every logo a net or schedule uses, one entry per image, for the
    Choose existing picker. Signed-in only, since only staff can set one."""
    return await logo_library(db)


@router.get("/uses", response_model=LogoUses)
async def list_logo_uses(
    logo_url: str = Query(..., max_length=500),
    exclude_net_id: Optional[int] = None,
    exclude_schedule_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The nets and schedules the caller may change that still show
    *logo_url*, leaving out the one they just changed."""
    uses = await editable_uses(
        db, current_user, logo_url,
        exclude_net_ids=[exclude_net_id] if exclude_net_id else [],
        exclude_template_ids=[exclude_schedule_id] if exclude_schedule_id else [],
    )
    return LogoUses(
        nets=[
            LogoUseNet(id=n.id, name=n.name, status=n.status, date=n.started_at or n.scheduled_start_time)
            for n in uses["nets"]
        ],
        schedules=[LogoUseSchedule(id=t.id, name=t.name) for t in uses["templates"]],
    )


@router.post("/apply", response_model=LogoApplyResponse)
async def apply_logo_to(
    body: LogoApplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a logo already in use on each listed net and schedule. All or
    nothing: 403 if the caller may not edit any one of them.

    Only a logo some net or schedule already shows is accepted, so this can
    never point a net at an arbitrary file or address."""
    path = logo_path(body.logo_url)
    if path is None or not path.exists() or not await logo_in_use(db, body.logo_url):
        raise HTTPException(status_code=400, detail="That logo is not in use on this site.")
    if not body.net_ids and not body.schedule_ids:
        raise HTTPException(status_code=400, detail="Choose at least one net or schedule.")
    try:
        previous = await apply_logo(db, current_user, body.logo_url, body.net_ids, body.schedule_ids)
    except LookupError:
        raise HTTPException(status_code=404, detail="Net or schedule not found")
    except LogoPermissionError:
        raise HTTPException(status_code=403, detail="You can't change the logo on one of those.")
    await db.commit()
    await release_logos(db, [u for u in previous if u != body.logo_url])
    return LogoApplyResponse(
        logo_url=body.logo_url,
        updated_nets=len(set(body.net_ids)),
        updated_schedules=len(set(body.schedule_ids)),
    )
