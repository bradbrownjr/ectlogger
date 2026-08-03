from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, get_current_user_optional
from app.models import CheckIn, Form, Net, NetStatus, TrafficLogEntry, User
from app.schemas import (
    CheckInsByNet,
    FrequentNetStats,
    NcsNetEntry,
    NetParticipation,
    TimeSeriesDataPoint,
    TrafficHandledEntry,
    UserStatsResponse,
)

router = APIRouter()

@router.get("/users/me", response_model=UserStatsResponse)
async def get_my_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get statistics for the current authenticated user.
    Shows their check-in history and participation across nets.
    """
    return await _get_user_statistics(db, current_user)


@router.get("/users/{user_id}", response_model=UserStatsResponse)
async def get_user_statistics(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get public statistics for a user by ID.
    """
    user_result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)
    )
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return await _get_user_statistics(db, user)


def _ensure_tz_aware(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware (assumes UTC if naive)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _get_traffic_handled(db: AsyncSession, user: User):
    """Distinct forms where this user has any traffic_log_entries row,
    broken out by action, plus the drill-down list (one row per form, using
    that form's most recent entry by this user). Unlike check-ins, log
    entries carry a real reported_by_user_id FK, so no callsign matching is
    needed. See TRAFFIC-HANDLING-DESIGN.md section 3.5.
    """
    result = await db.execute(
        select(TrafficLogEntry)
        .options(selectinload(TrafficLogEntry.form).selectinload(Form.net))
        .where(TrafficLogEntry.reported_by_user_id == user.id)
        .order_by(TrafficLogEntry.occurred_at.desc())
    )
    entries = result.scalars().all()

    by_action_forms: dict = {}
    latest_entry_by_form: dict = {}
    for entry in entries:
        action_key = entry.action.value if hasattr(entry.action, "value") else str(entry.action)
        by_action_forms.setdefault(action_key, set()).add(entry.form_id)
        # entries are ordered newest-first, so the first one seen per form is its most recent.
        latest_entry_by_form.setdefault(entry.form_id, entry)

    traffic_by_action = {action: len(form_ids) for action, form_ids in by_action_forms.items()}

    traffic_handled_list = [
        TrafficHandledEntry(
            form_id=entry.form_id,
            net_id=entry.form.net_id if entry.form else None,
            net_name=entry.form.net.name if entry.form and entry.form.net else None,
            form_type=entry.form.form_type if entry.form else "",
            message_number=entry.form.message_number if entry.form else None,
            action=entry.action,
            occurred_at=entry.occurred_at,
        )
        for entry in latest_entry_by_form.values()
    ]
    traffic_handled_list.sort(key=lambda e: e.occurred_at, reverse=True)

    return len(latest_entry_by_form), traffic_by_action, traffic_handled_list


async def _get_user_statistics(db: AsyncSession, user: User) -> UserStatsResponse:
    """Helper to build user statistics."""
    import json

    now = datetime.now(timezone.utc)
    last_30d = now - timedelta(days=30)

    traffic_handled, traffic_by_action, traffic_handled_list = await _get_traffic_handled(db, user)

    # Get all callsigns for this user (current, additional aliases, and previous)
    user_callsigns = [user.callsign] if user.callsign else []
    if user.gmrs_callsign:
        user_callsigns.append(user.gmrs_callsign)
    try:
        additional = json.loads(user.callsigns) if user.callsigns else []
        user_callsigns.extend(additional)
    except:
        pass
    try:
        previous = json.loads(user.previous_callsigns) if user.previous_callsigns else []
        user_callsigns.extend(previous)
    except:
        pass

    if not user_callsigns:
        return UserStatsResponse(
            user_id=user.id,
            callsign=user.callsign,
            total_check_ins=0,
            unique_nets=0,
            nets_participated=0,
            nets_as_ncs=0,
            last_30_days_check_ins=0,
            nets_participated_list=[],
            check_ins_by_month=[],
            favorite_nets=[],
            frequent_nets=[],
            nets_as_ncs_list=[],
            traffic_handled=traffic_handled,
            traffic_by_action=traffic_by_action,
            traffic_handled_list=traffic_handled_list,
        )

    # Get all check-ins by this user's callsigns
    check_ins_result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.net))
        .where(CheckIn.callsign.in_(user_callsigns))
        .order_by(CheckIn.checked_in_at.desc())
    )
    check_ins = check_ins_result.scalars().all()
    
    total_check_ins = len(check_ins)
    
    # Last 30 days check-ins (ensure timezone-aware comparison)
    last_30_days_check_ins = sum(1 for c in check_ins if _ensure_tz_aware(c.checked_in_at) >= last_30d)
    
    # Nets as NCS/owner (user owns the net)
    ncs_result = await db.execute(
        select(Net).where(Net.owner_id == user.id).order_by(Net.started_at.desc())
    )
    ncs_nets = ncs_result.scalars().all()
    nets_as_ncs = len(ncs_nets)
    nets_as_ncs_list = [
        NcsNetEntry(net_id=n.id, net_name=n.name, started_at=n.started_at, closed_at=n.closed_at)
        for n in ncs_nets
    ]
    
    # Unique nets
    net_ids = set(c.net_id for c in check_ins)
    unique_nets = len(net_ids)
    
    # Net participation details
    net_participation = {}
    for checkin in check_ins:
        if checkin.net_id not in net_participation:
            net_participation[checkin.net_id] = {
                "net_id": checkin.net_id,
                "net_name": checkin.net.name if checkin.net else "Unknown",
                "template_id": checkin.net.template_id if checkin.net else None,
                "check_in_count": 0,
                "first_check_in": checkin.checked_in_at,
                "last_check_in": checkin.checked_in_at
            }
        net_participation[checkin.net_id]["check_in_count"] += 1
        if checkin.checked_in_at < net_participation[checkin.net_id]["first_check_in"]:
            net_participation[checkin.net_id]["first_check_in"] = checkin.checked_in_at
        if checkin.checked_in_at > net_participation[checkin.net_id]["last_check_in"]:
            net_participation[checkin.net_id]["last_check_in"] = checkin.checked_in_at
    
    nets_participated_list = [
        NetParticipation(**p)
        for p in sorted(
            net_participation.values(),
            key=lambda x: -x["check_in_count"]
        )
    ]
    
    # Check-ins by month (last 12 months)
    monthly_counts = {}
    for i in range(12):
        month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(day=1)
        month_key = month_start.strftime("%Y-%m")
        monthly_counts[month_key] = 0
    
    for checkin in check_ins:
        month_key = checkin.checked_in_at.strftime("%Y-%m")
        if month_key in monthly_counts:
            monthly_counts[month_key] += 1
    
    check_ins_by_month = [
        TimeSeriesDataPoint(label=k, value=v, date=f"{k}-01")
        for k, v in sorted(monthly_counts.items())
    ]
    
    # Favorite nets (most check-ins, simple list)
    favorite_nets = [
        CheckInsByNet(net_id=p.net_id, net_name=p.net_name, count=p.check_in_count)
        for p in nets_participated_list[:5]
    ]
    
    # Frequent nets - group by template for recurring nets, calculate participation rate
    # First, get all templates and their instance counts
    template_check_ins = {}  # template_id -> {name, user_check_ins, template_id}
    standalone_check_ins = {}  # net_id -> {name, user_check_ins}
    
    for net_id, data in net_participation.items():
        template_id = data.get("template_id")
        if template_id:
            if template_id not in template_check_ins:
                template_check_ins[template_id] = {
                    "net_name": data["net_name"],
                    "template_id": template_id,
                    "user_check_ins": 0
                }
            template_check_ins[template_id]["user_check_ins"] += data["check_in_count"]
        else:
            standalone_check_ins[net_id] = {
                "net_name": data["net_name"],
                "user_check_ins": data["check_in_count"]
            }
    
    # Get total instances for each template
    frequent_nets = []
    for template_id, data in template_check_ins.items():
        # Count total instances of this template
        instance_count_result = await db.execute(
            select(func.count(Net.id)).where(
                Net.template_id == template_id,
                Net.status.in_([NetStatus.CLOSED, NetStatus.ARCHIVED])
            )
        )
        total_instances = instance_count_result.scalar() or 1
        
        # Calculate participation rate
        participation_rate = data["user_check_ins"] / total_instances if total_instances > 0 else 0
        
        frequent_nets.append(FrequentNetStats(
            net_name=data["net_name"],
            template_id=template_id,
            check_ins=data["user_check_ins"],
            total_instances=total_instances,
            participation_rate=min(participation_rate, 1.0)  # Cap at 100%
        ))
    
    # Add standalone nets (no template) 
    for net_id, data in standalone_check_ins.items():
        frequent_nets.append(FrequentNetStats(
            net_name=data["net_name"],
            template_id=None,
            check_ins=data["user_check_ins"],
            total_instances=1,
            participation_rate=1.0 if data["user_check_ins"] > 0 else 0
        ))
    
    # Sort by check-in count descending
    frequent_nets.sort(key=lambda x: -x.check_ins)
    
    return UserStatsResponse(
        user_id=user.id,
        callsign=user.callsign,
        total_check_ins=total_check_ins,
        unique_nets=unique_nets,
        nets_participated=unique_nets,
        nets_as_ncs=nets_as_ncs,
        last_30_days_check_ins=last_30_days_check_ins,
        nets_participated_list=nets_participated_list,
        check_ins_by_month=check_ins_by_month,
        favorite_nets=favorite_nets,
        frequent_nets=frequent_nets[:10],
        nets_as_ncs_list=nets_as_ncs_list,
        traffic_handled=traffic_handled,
        traffic_by_action=traffic_by_action,
        traffic_handled_list=traffic_handled_list,
    )


