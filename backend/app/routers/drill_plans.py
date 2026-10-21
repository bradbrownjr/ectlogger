"""
Drill plans: the exercise plan for one net's drill.

  GET    /nets/{id}/drill-plan                         the plan (net control staff)
  PUT    /nets/{id}/drill-plan                         create or replace it (net editors)
  DELETE /nets/{id}/drill-plan                         remove it (net editors)
  POST   /nets/{id}/drill-plan/events/{event_id}/send  file a prepared message

A plan holds the scenario, numbered objectives with their after-action
ratings, and a schedule of events in the columns ARES exercise plans use.
A schedule row can carry a prepared ICS-213 for the site that sends it.
Sending it files a real drill form through traffic_forms.file_form, so the
message is numbered, logged and relayed like any other traffic and appears
on the ICS-309; the row's status is always read back from that form.

Reading is may_run_drill, not public like the coverage reads: the schedule
and the prepared messages are for the people running the drill, not for
the stations it is testing.
"""
import json
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    CoverageSite, DrillEvent, DrillObjective, DrillPlan, Form, Net, TrafficAction, TrafficTestCategory, User,
)
from app.permissions import may_edit_net, may_run_drill, net_access
from app.routers.traffic_forms import file_form
from app.schemas import (
    DrillEventResponse, DrillMessage, DrillMessageSend, DrillObjectiveResponse, DrillPlanResponse, DrillPlanSave,
    FormCreate, TrafficLogEntryCreate,
)
from app.traffic.exercise import mark_exercise_text

router = APIRouter(prefix="/nets", tags=["drill-plans"])


async def _load_net(db: AsyncSession, net_id: int) -> Net:
    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one_or_none()
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    return net


async def _load_plan(db: AsyncSession, net_id: int) -> Optional[DrillPlan]:
    return (await db.execute(
        select(DrillPlan)
        .options(
            selectinload(DrillPlan.objectives),
            selectinload(DrillPlan.events).selectinload(DrillEvent.form).selectinload(Form.log_entries),
        )
        .where(DrillPlan.net_id == net_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()


def _event_response(event: DrillEvent) -> DrillEventResponse:
    # A form deleted since (demo traffic can be) leaves a dangling id, since
    # SQLite doesn't enforce the SET NULL: that row reads as not sent.
    form: Optional[Form] = event.form
    message = DrillMessage(**json.loads(event.message)) if event.message else None
    return DrillEventResponse(
        id=event.id,
        sort_order=event.sort_order,
        time_label=event.time_label,
        initiator=event.initiator,
        receiver=event.receiver,
        event_type=event.event_type,
        method=event.method,
        description=event.description,
        expected_actions=event.expected_actions,
        site_id=event.site_id,
        message=message,
        form_id=form.id if form else None,
        form_status=form.last_action.value if form and form.last_action else None,
        form_message_number=form.message_number if form else None,
        # When it went out: the first step in its chain, which the sender
        # may have backdated, not when the form row was written.
        sent_at=(form.log_entries[0].occurred_at if form.log_entries else form.filed_at) if form else None,
    )


def _plan_response(plan: DrillPlan, can_edit: bool) -> DrillPlanResponse:
    return DrillPlanResponse(
        id=plan.id,
        net_id=plan.net_id,
        exercise_name=plan.exercise_name,
        exercise_when=plan.exercise_when,
        location=plan.location,
        purpose=plan.purpose,
        scenario=plan.scenario,
        announcement=plan.announcement,
        objectives=[
            DrillObjectiveResponse(
                id=o.id, sort_order=o.sort_order, heading=o.heading, text=o.text,
                rating=o.rating, result_note=o.result_note,
            )
            for o in plan.objectives
        ],
        events=[_event_response(e) for e in plan.events],
        updated_at=plan.updated_at,
        can_edit=can_edit,
    )


def _clean(value: Optional[str]) -> Optional[str]:
    value = (value or '').strip()
    return value or None


@router.get("/{net_id}/drill-plan", response_model=DrillPlanResponse)
async def get_drill_plan(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The net's drill plan. 404 when it has none."""
    net = await _load_net(db, net_id)
    access = await net_access(db, net, current_user)
    if not (may_run_drill(access) or may_edit_net(access)):
        raise HTTPException(status_code=403, detail="Not authorized to see this net's drill plan")
    plan = await _load_plan(db, net_id)
    if not plan:
        raise HTTPException(status_code=404, detail="This net has no drill plan")
    return _plan_response(plan, may_edit_net(access))


@router.put("/{net_id}/drill-plan", response_model=DrillPlanResponse)
async def save_drill_plan(
    net_id: int,
    data: DrillPlanSave,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create the plan, or replace its contents. Objectives and rows sent
    with an id keep that row; a row left out is removed. A sent row keeps
    its form, which no request can set or change."""
    net = await _load_net(db, net_id)
    if not may_edit_net(await net_access(db, net, current_user)):
        raise HTTPException(status_code=403, detail="Not authorized to change this net's drill plan")

    site_ids = set((await db.execute(
        select(CoverageSite.id).where(CoverageSite.net_id == net_id)
    )).scalars().all())
    if any(e.site_id is not None and e.site_id not in site_ids for e in data.events):
        raise HTTPException(status_code=400, detail="Site does not belong to this net")

    plan = await _load_plan(db, net_id)
    if plan is None:
        plan = DrillPlan(net_id=net_id)
        db.add(plan)
        await db.flush()
        plan = await _load_plan(db, net_id)

    for field in ('exercise_name', 'exercise_when', 'location', 'purpose', 'scenario', 'announcement'):
        setattr(plan, field, _clean(getattr(data, field)))
    plan.updated_by_id = current_user.id

    existing_objectives: Dict[int, DrillObjective] = {o.id: o for o in plan.objectives}
    existing_events: Dict[int, DrillEvent] = {e.id: e for e in plan.events}
    if {o.id for o in data.objectives if o.id is not None} - set(existing_objectives) \
            or {e.id for e in data.events if e.id is not None} - set(existing_events):
        raise HTTPException(status_code=400, detail="One or more rows don't belong to this plan")

    objectives: List[DrillObjective] = []
    for order, item in enumerate(data.objectives):
        objective = existing_objectives.get(item.id) if item.id is not None else None
        if objective is None:
            objective = DrillObjective()
        objective.heading = _clean(item.heading)
        objective.text = item.text.strip()
        objective.rating = item.rating
        objective.result_note = _clean(item.result_note)
        objective.sort_order = order
        objectives.append(objective)
    plan.objectives = objectives

    events: List[DrillEvent] = []
    for order, item in enumerate(data.events):
        event = existing_events.get(item.id) if item.id is not None else None
        if event is None:
            event = DrillEvent()
        for field in ('time_label', 'initiator', 'receiver', 'event_type', 'method', 'description', 'expected_actions'):
            setattr(event, field, _clean(getattr(item, field)))
        event.site_id = item.site_id
        # A sent message is a filed form; the copy here stays as it was sent.
        if event.form is None:
            event.message = item.message.model_dump_json() if item.message else None
        event.sort_order = order
        events.append(event)
    plan.events = events

    await db.commit()
    plan = await _load_plan(db, net_id)
    return _plan_response(plan, True)


@router.delete("/{net_id}/drill-plan", status_code=status.HTTP_204_NO_CONTENT)
async def delete_drill_plan(
    net_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the plan. Messages already sent stay filed as traffic."""
    net = await _load_net(db, net_id)
    if not may_edit_net(await net_access(db, net, current_user)):
        raise HTTPException(status_code=403, detail="Not authorized to change this net's drill plan")
    plan = await _load_plan(db, net_id)
    if plan:
        await db.delete(plan)
        await db.commit()


@router.post("/{net_id}/drill-plan/events/{event_id}/send", response_model=DrillEventResponse)
async def send_drill_message(
    net_id: int,
    event_id: int,
    data: DrillMessageSend,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """File a row's prepared message as drill traffic on the net, originated
    by its site. The message text opens and closes with the exercise marking
    and the incident name is the exercise's. Received, relayed and delivered
    are then logged on the form like any traffic."""
    net = await _load_net(db, net_id)
    if not may_run_drill(await net_access(db, net, current_user)):
        raise HTTPException(status_code=403, detail="Not authorized to send this net's drill messages")
    plan = await _load_plan(db, net_id)
    event = next((e for e in plan.events if e.id == event_id), None) if plan else None
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule row not found")
    if not event.message:
        raise HTTPException(status_code=400, detail="This row has no prepared message")
    if event.form is not None:
        raise HTTPException(status_code=409, detail="This message was already sent")

    values = json.loads(event.message)
    values['incident_name'] = plan.exercise_name or net.name
    values['message'] = mark_exercise_text(values.get('message') or '')
    handled_by = _clean(data.handled_by) or (event.site.name if event.site else None)

    filed = await file_form(db, FormCreate(
        form_type='ICS213',
        net_id=net_id,
        field_values={k: v for k, v in values.items() if v is not None},
        test_category=TrafficTestCategory.DRILL,
        initial_log_entry=TrafficLogEntryCreate(
            action=TrafficAction.ORIGINATED,
            handled_by=handled_by,
            net_id=net_id,
            note='Prepared message from the drill plan',
            occurred_at=data.occurred_at,
        ),
    ), current_user)

    event = (await db.execute(select(DrillEvent).where(DrillEvent.id == event_id))).scalar_one()
    event.form_id = filed.id
    await db.commit()
    plan = await _load_plan(db, net_id)
    return _event_response(next(e for e in plan.events if e.id == event_id))
