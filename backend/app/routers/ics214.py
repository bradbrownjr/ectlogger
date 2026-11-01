"""
A closed net's ICS-214 Activity Log, for net control to finish and download.

  GET    /nets/{id}/ics214                      the form as it stands
  PUT    /nets/{id}/ics214                      save the header and edits
  POST   /nets/{id}/ics214/entries              add a line written by hand
  PUT    /nets/{id}/ics214/entries/{entry_id}   change one
  DELETE /nets/{id}/ics214/entries/{entry_id}   remove one

Lines and resources are rendered from what was logged each time
(services/ics214.py); what's stored is only what net control changed
(Ics214Form) and the lines it wrote (ActivityEntry). The PDF is drawn by
the app (ICS214PrintView) from GET's answer.

Everything here is may_prepare_ics214, like closing the net, and only once
the net has closed: before then the log is still being written.
"""
import json
from datetime import timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import record_net_event
from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    ActivityEntry, CoverageSite, DrillPlan, Ics214Form, Net, NetRole, NetStatus, StationChannelMark, User,
)
from app.permissions import may_prepare_ics214, net_access
from app.schemas import (
    ActivityEntryWrite, Ics214Header, Ics214Line, Ics214Resource, Ics214Response, Ics214Save,
)
from app.services.check_in_columns import format_frequency
from app.services.ics214 import apply_line_edits, apply_resource_edits, build_activity_lines, build_resources
from app.services.ncs_attribution import net_ncs_attribution
from app.traffic.ics309 import format_traffic_ics309_message, get_net_traffic_log_entries, traffic_from_station
from app.utils import display_callsign

router = APIRouter(prefix="/nets", tags=["ics214"])

HEADER_FIELDS = (
    "incident_name", "period_from", "period_to", "unit_name", "leader", "home_agency",
    "prepared_name", "prepared_position",
)


async def _load(db: AsyncSession, net_id: int, user: User) -> Net:
    net = (await db.execute(
        select(Net)
        .options(
            selectinload(Net.frequencies),
            selectinload(Net.check_ins),
            selectinload(Net.net_roles).selectinload(NetRole.user),
            selectinload(Net.template),
        )
        .where(Net.id == net_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    if not may_prepare_ics214(await net_access(db, net, user)):
        raise HTTPException(status_code=403, detail="Only net control can prepare this net's ICS-214")
    if net.status not in (NetStatus.CLOSED, NetStatus.ARCHIVED):
        raise HTTPException(status_code=400, detail="The ICS-214 is ready once the net has closed")
    return net


async def _stored(db: AsyncSession, net_id: int) -> Optional[Ics214Form]:
    return (await db.execute(select(Ics214Form).where(Ics214Form.net_id == net_id))).scalar_one_or_none()


async def _defaults(db: AsyncSession, net: Net, user: User) -> Ics214Header:
    plan = (await db.execute(select(DrillPlan).where(DrillPlan.net_id == net.id))).scalar_one_or_none()
    ncs_callsign, ncs_name = await net_ncs_attribution(db, net.id)
    leader = ""
    if ncs_callsign:
        leader = f"{ncs_name}, {ncs_callsign}, Net Control" if ncs_name else f"{ncs_callsign}, Net Control"
    positions = [r.role.upper() for r in net.net_roles if r.user_id == user.id and r.is_active]
    me = display_callsign(user)
    return Ics214Header(
        incident_name=(plan.exercise_name if plan and plan.exercise_name else net.name)[:200],
        period_from=net.started_at,
        period_to=net.closed_at,
        # The unit is the team running the net: its schedule, if it has one
        unit_name=(net.template.name if net.template else net.name)[:200],
        leader=leader[:200],
        home_agency="",
        prepared_name=(f"{user.name}, {me}" if user.name and me != user.name else me or "")[:200],
        prepared_position="Net Control" if "NCS" in positions else "Logger" if "LOGGER" in positions else "",
    )


async def _response(db: AsyncSession, net: Net, user: User) -> Ics214Response:
    stored = await _stored(db, net.id)
    defaults = await _defaults(db, net, user)
    header = defaults.model_copy(update={
        f: getattr(stored, f) for f in HEADER_FIELDS if stored is not None and getattr(stored, f) is not None
    })

    frequencies = {f.id: format_frequency(f) for f in net.frequencies}
    site_names = dict((await db.execute(
        select(CoverageSite.id, CoverageSite.name).where(CoverageSite.net_id == net.id)
    )).all())
    marks = (await db.execute(select(StationChannelMark).where(StationChannelMark.net_id == net.id))).scalars().all()
    traffic = await get_net_traffic_log_entries(db, net.id)
    entries = (await db.execute(
        select(ActivityEntry).where(ActivityEntry.net_id == net.id).order_by(ActivityEntry.occurred_at)
    )).scalars().all()

    lines = build_activity_lines(
        net=net, rows=net.check_ins, marks=marks, roles=net.net_roles, traffic=traffic, entries=entries,
        site_names=site_names,
        channel=lambda fid: frequencies.get(fid),
        role_callsign=lambda role: display_callsign(role.user) if role.user else None,
        traffic_text=lambda hop: f"{traffic_from_station(hop.form, hop)}: {format_traffic_ics309_message(hop.form, hop)}",
    )
    line_edits = json.loads(stored.line_edits or "{}") if stored else {}
    resource_edits = json.loads(stored.resource_edits or "{}") if stored else {}
    return Ics214Response(
        header=header,
        defaults=defaults,
        resources=[Ics214Resource(**r) for r in apply_resource_edits(build_resources(net.check_ins, net.net_roles), resource_edits)],
        lines=[Ics214Line(**{k: v for k, v in l.items() if k in Ics214Line.model_fields})
               for l in apply_line_edits(lines, line_edits)],
        exercise=(await db.execute(select(DrillPlan.id).where(DrillPlan.net_id == net.id))).first() is not None,
    )


@router.get("/{net_id}/ics214", response_model=Ics214Response)
async def get_ics214(net_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    net = await _load(db, net_id, current_user)
    return await _response(db, net, current_user)


@router.put("/{net_id}/ics214", response_model=Ics214Response)
async def save_ics214(
    net_id: int, body: Ics214Save,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Store the header (a value equal to its default is stored as the
    default) and the edits, keeping only those that change something."""
    net = await _load(db, net_id, current_user)
    defaults = await _defaults(db, net, current_user)
    stored = await _stored(db, net.id)
    if stored is None:
        stored = Ics214Form(net_id=net.id)
        db.add(stored)
    for field in HEADER_FIELDS:
        value = getattr(body.header, field)
        if isinstance(value, str):
            value = value.strip()
        default = getattr(defaults, field)
        same = value == default or (field.startswith("period_") and value is not None and default is not None
                                    and _same_moment(value, default))
        # The preparer's own name defaults to whoever opens the form, so it
        # is always kept once saved.
        setattr(stored, field, value if field.startswith("prepared_") or not same else None)
    stored.line_edits = json.dumps({
        k: e.model_dump(exclude_none=True) for k, e in body.line_edits.items() if e.hidden or (e.text or "").strip()
    })
    stored.resource_edits = json.dumps({
        k: e.model_dump(exclude_none=True) for k, e in body.resource_edits.items()
        if e.hidden or e.name is not None or e.position is not None or (e.agency or "").strip()
    })
    stored.updated_by_id = current_user.id
    await db.commit()
    return await _response(db, net, current_user)


def _same_moment(a, b) -> bool:
    a = a if a.tzinfo else a.replace(tzinfo=timezone.utc)
    b = b if b.tzinfo else b.replace(tzinfo=timezone.utc)
    return abs((a - b).total_seconds()) < 60


async def _entry(db: AsyncSession, net_id: int, entry_id: int) -> ActivityEntry:
    entry = (await db.execute(
        select(ActivityEntry).where(ActivityEntry.id == entry_id, ActivityEntry.net_id == net_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Line not found")
    return entry


@router.post("/{net_id}/ics214/entries", response_model=Ics214Response, status_code=status.HTTP_201_CREATED)
async def add_activity_entry(
    net_id: int, body: ActivityEntryWrite,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    net = await _load(db, net_id, current_user)
    db.add(ActivityEntry(net_id=net.id, occurred_at=body.occurred_at, text=body.text.strip(),
                         created_by_id=current_user.id))
    await db.commit()
    return await _response(db, net, current_user)


@router.put("/{net_id}/ics214/entries/{entry_id}", response_model=Ics214Response)
async def update_activity_entry(
    net_id: int, entry_id: int, body: ActivityEntryWrite,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    net = await _load(db, net_id, current_user)
    entry = await _entry(db, net.id, entry_id)
    entry.occurred_at = body.occurred_at
    entry.text = body.text.strip()
    await db.commit()
    return await _response(db, net, current_user)


@router.delete("/{net_id}/ics214/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity_entry(
    net_id: int, entry_id: int,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    net = await _load(db, net_id, current_user)
    entry = await _entry(db, net.id, entry_id)
    await db.delete(entry)
    record_net_event(db, "net.activity_entry_deleted", current_user, net, subject_user_id=entry.created_by_id,
                     details={"at": entry.occurred_at.isoformat() if entry.occurred_at else None, "text": entry.text})
    await db.commit()
    return Response(status_code=204)
