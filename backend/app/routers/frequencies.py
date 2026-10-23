from dataclasses import dataclass, field
from typing import Dict, FrozenSet, Iterable, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from app.database import get_db
from app.email_service import EmailService
from app.logger import logger
from app.audit import record_event
from app.models import (
    CheckIn, Frequency, Net, NetTemplate, User, UserRole, net_frequencies, net_template_frequencies,
)
from app.permissions import check_template_permission, is_admin, may_edit_net, net_access
from app.schemas import FrequencyChangeRequest, FrequencyCreate, FrequencyResponse, FrequencyWithUsageResponse
from app.dependencies import get_current_user, get_current_user_optional, get_admin_user

router = APIRouter(prefix="/frequencies", tags=["frequencies"])
_limiter = Limiter(key_func=get_remote_address)


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


# =============================================================================
# WHERE A FREQUENCY IS USED, AND WHO MAY CHANGE IT
# =============================================================================
# Frequencies are one list shared by every net and schedule, so a change made
# from one net's form lands on every other net using the same row. The rule:
# an admin may edit anything; anyone else may edit or delete only a
# frequency they added themselves (Frequency.created_by_id), and only while
# no other net or schedule uses it and no station has checked in on it. The
# net or schedule whose form is open does not count as "other", so a mistake
# can still be fixed after the net was saved. Everything refused can be sent
# to the admins as a request (POST /frequencies/{id}/change-request).


@dataclass
class FrequencyUses:
    net_ids: Set[int] = field(default_factory=set)
    template_ids: Set[int] = field(default_factory=set)
    check_in_count: int = 0

    @property
    def in_use(self) -> bool:
        return bool(self.net_ids or self.template_ids or self.check_in_count)


async def frequency_uses(db: AsyncSession, frequency_ids: Optional[Iterable[int]] = None) -> Dict[int, FrequencyUses]:
    """Return {frequency_id: FrequencyUses} for every frequency referenced
    anywhere (or only *frequency_ids*).

    The one definition of "in use", shared by the edit/delete rule and the
    admin list (which greys out its Delete button), so a button and the server
    can never disagree. Check-ins count because CheckIn.frequency_id and
    Net.active_frequency_id have no ON DELETE rule: a frequency removed from a
    net after stations logged on it would otherwise leave those check-ins
    pointing at a row that no longer exists. A net's active frequency counts
    as that net using it.
    """
    ids = None if frequency_ids is None else list(frequency_ids)
    uses: Dict[int, FrequencyUses] = {}

    def _only(column):
        return [] if ids is None else [column.in_(ids)]

    for freq_id, net_id in (await db.execute(
        select(net_frequencies.c.frequency_id, net_frequencies.c.net_id)
        .where(*_only(net_frequencies.c.frequency_id))
    )).all():
        if freq_id is not None:
            uses.setdefault(freq_id, FrequencyUses()).net_ids.add(net_id)
    for freq_id, net_id in (await db.execute(
        select(Net.active_frequency_id, Net.id)
        .where(Net.active_frequency_id.is_not(None), *_only(Net.active_frequency_id))
    )).all():
        uses.setdefault(freq_id, FrequencyUses()).net_ids.add(net_id)
    for freq_id, template_id in (await db.execute(
        select(net_template_frequencies.c.frequency_id, net_template_frequencies.c.template_id)
        .where(*_only(net_template_frequencies.c.frequency_id))
    )).all():
        if freq_id is not None:
            uses.setdefault(freq_id, FrequencyUses()).template_ids.add(template_id)
    for freq_id, count in (await db.execute(
        select(CheckIn.frequency_id, func.count(CheckIn.id))
        .where(CheckIn.frequency_id.is_not(None), *_only(CheckIn.frequency_id))
        .group_by(CheckIn.frequency_id)
    )).all():
        uses.setdefault(freq_id, FrequencyUses()).check_in_count += count
    return uses


@dataclass(frozen=True)
class FormContext:
    """The net or schedule whose form the change is made from. Its own use of
    a frequency is not "another net" using it."""
    net_ids: FrozenSet[int] = frozenset()
    template_ids: FrozenSet[int] = frozenset()


async def form_context(
    db: AsyncSession, user: Optional[User], net_id: Optional[int], template_id: Optional[int]
) -> FormContext:
    """Resolve the form's net_id / template_id, keeping only what *user* may
    edit, so naming somebody else's net can't excuse a change to it. Editing
    a net counts its own schedule too when the user may manage that schedule
    (Edit Net can save to the schedule as well)."""
    nets: Set[int] = set()
    templates: Set[int] = set()
    if user is None:
        return FormContext()
    if net_id is not None:
        net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one_or_none()
        if net is not None and may_edit_net(await net_access(db, net, user)):
            nets.add(net.id)
            if net.template_id:
                tpl = (await db.execute(select(NetTemplate).where(NetTemplate.id == net.template_id))).scalar_one_or_none()
                if tpl is not None and await check_template_permission(db, tpl, user):
                    templates.add(tpl.id)
    if template_id is not None and template_id not in templates:
        tpl = (await db.execute(select(NetTemplate).where(NetTemplate.id == template_id))).scalar_one_or_none()
        if tpl is not None and await check_template_permission(db, tpl, user):
            templates.add(tpl.id)
    return FormContext(frozenset(nets), frozenset(templates))


def _count(n: int, word: str) -> str:
    return f"{n} {word}{'s' if n != 1 else ''}"


def describe_uses(nets: int, schedules: int, check_ins: int, other: bool = False) -> str:
    """"2 nets, 1 schedule and 3 check-ins", or "2 other nets, ..." when the
    form's own net or schedule was left out of the counts."""
    parts = []
    if nets:
        parts.append(_count(nets, "other net" if other else "net"))
    if schedules:
        parts.append(_count(schedules, "other schedule" if other else "schedule"))
    if check_ins:
        parts.append(_count(check_ins, "check-in"))
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


NOT_YOURS = "Someone else added this frequency to the shared list, so only an administrator can change it."
OLD_ENTRY = "This frequency was added before the site recorded who added each one, so only an administrator can change it."


def change_refusal(
    freq: Frequency, user: Optional[User], uses: FrequencyUses, ctx: FormContext, deleting: bool
) -> Optional[str]:
    """Why *user* may not edit (or delete) *freq* from this form, or None.

    Admins may edit any frequency. Deleting one still in use is refused even
    for an admin, since it would vanish from every net and schedule using it.
    """
    admin = user is not None and is_admin(user)
    if not admin:
        if user is None or freq.created_by_id is None:
            return OLD_ENTRY if user is not None else NOT_YOURS
        if freq.created_by_id != user.id:
            return NOT_YOURS
    elif not deleting:
        return None

    other_nets = len(uses.net_ids - ctx.net_ids)
    other_schedules = len(uses.template_ids - ctx.template_ids)
    if not (other_nets or other_schedules or uses.check_in_count):
        return None
    where = describe_uses(other_nets, other_schedules, uses.check_in_count,
                          other=bool(ctx.net_ids or ctx.template_ids))
    if admin:
        return f"This frequency is still used by {where}, so it can't be deleted."
    action = "delete" if deleting else "change"
    return f"This frequency is already on {where}, so only an administrator can {action} it."

# Coded 403 for a non-admin's refused edit/delete, so the form can offer to
# send the change to the admins (FrequencyChangeRequestDialog.tsx).
FREQUENCY_CHANGE_REFUSED = "frequency_change_refused"


def _response(freq: Frequency, user: Optional[User], uses: FrequencyUses, ctx: FormContext) -> FrequencyResponse:
    response = FrequencyResponse.from_orm(freq)
    response.edit_refused = change_refusal(freq, user, uses, ctx, deleting=False)
    response.delete_refused = change_refusal(freq, user, uses, ctx, deleting=True)
    return response


async def _load(db: AsyncSession, frequency_id: int) -> Frequency:
    frequency = (await db.execute(
        select(Frequency).where(Frequency.id == frequency_id)
    )).scalar_one_or_none()
    if not frequency:
        raise HTTPException(status_code=404, detail="Frequency not found")
    return frequency


async def _uses_of(db: AsyncSession, frequency_id: int) -> FrequencyUses:
    return (await frequency_uses(db, [frequency_id])).get(frequency_id, FrequencyUses())


@router.post("", response_model=FrequencyResponse, status_code=status.HTTP_201_CREATED)
async def create_frequency(
    frequency_data: FrequencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new frequency, recording who added it (see change_refusal)."""
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
        description=frequency_data.description,
        created_by_id=current_user.id,
    )
    
    db.add(frequency)
    await db.commit()
    await db.refresh(frequency)
    
    # Nothing uses a new frequency yet, so its creator may change it.
    return _response(frequency, current_user, FrequencyUses(), FormContext())


@router.get("", response_model=List[FrequencyResponse])
async def list_frequencies(
    skip: int = 0,
    limit: int = 100,
    net_id: Optional[int] = None,
    template_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """List all frequencies.

    ``net_id`` / ``template_id`` name the form asking, so each row's
    ``edit_refused`` / ``delete_refused`` don't count that net or schedule's
    own use of it (see form_context).
    """
    result = await db.execute(
        select(Frequency).offset(skip).limit(limit).order_by(Frequency.frequency)
    )
    frequencies = result.scalars().all()
    uses = await frequency_uses(db, [f.id for f in frequencies])
    ctx = await form_context(db, current_user, net_id, template_id)

    return [_response(freq, current_user, uses.get(freq.id, FrequencyUses()), ctx) for freq in frequencies]


@router.get("/admin/with-usage", response_model=List[FrequencyWithUsageResponse])
async def list_frequencies_with_usage(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all frequencies with their usage (admin only)"""
    result = await db.execute(select(Frequency).order_by(Frequency.frequency))
    uses = await frequency_uses(db)

    responses = []
    for freq in result.scalars().all():
        u = uses.get(freq.id, FrequencyUses())
        responses.append(FrequencyWithUsageResponse(
            id=freq.id,
            frequency=freq.frequency,
            mode=freq.mode,
            network=freq.network,
            talkgroup=freq.talkgroup,
            description=freq.description,
            created_at=freq.created_at,
            net_count=len(u.net_ids),
            schedule_count=len(u.template_ids),
            check_in_count=u.check_in_count,
        ))
    return responses


@router.get("/{frequency_id}", response_model=FrequencyResponse)
async def get_frequency(
    frequency_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific frequency"""
    return FrequencyResponse.from_orm(await _load(db, frequency_id))


@router.put("/{frequency_id}", response_model=FrequencyResponse)
async def update_frequency(
    frequency_id: int,
    frequency_data: FrequencyCreate,
    net_id: Optional[int] = None,
    template_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a frequency. Admins may edit any; anyone else only one they
    added that no other net, schedule or check-in uses (change_refusal),
    judged from the form named by ``net_id`` / ``template_id``. A refusal is
    a 403 with detail ``{code: FREQUENCY_CHANGE_REFUSED, message}``.

    Until 2026-09-25 any signed-in user could edit any frequency, changing it
    everywhere it was used; from then until 2026-10-22 only admins could,
    which left nobody but an admin able to fix a mistake just made in the
    Create Net form.
    """
    frequency = await _load(db, frequency_id)
    uses = await _uses_of(db, frequency_id)
    ctx = await form_context(db, current_user, net_id, template_id)
    refusal = change_refusal(frequency, current_user, uses, ctx, deleting=False)
    if refusal:
        raise HTTPException(status_code=403, detail={"code": FREQUENCY_CHANGE_REFUSED, "message": refusal})
    
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
    
    return _response(frequency, current_user, uses, ctx)


@router.delete("/{frequency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_frequency(
    frequency_id: int,
    net_id: Optional[int] = None,
    template_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a frequency nothing else uses (change_refusal). An admin's
    refusal is a 409 (the Frequencies admin tab); anyone else's is a coded
    403 like update_frequency's.

    The form's own net/schedule use is dropped with it: net_frequencies and
    net_template_frequencies cascade. Check-ins never do (no ON DELETE), so
    any check-in on it always refuses.

    Until 2026-09-25 any signed-in user could delete any frequency, and
    nothing checked whether it was in use, so it silently vanished from
    every net and schedule using it, and check-ins logged on it were left
    pointing at a deleted row.
    """
    frequency = await _load(db, frequency_id)
    ctx = await form_context(db, current_user, net_id, template_id)
    refusal = change_refusal(frequency, current_user, await _uses_of(db, frequency_id), ctx, deleting=True)
    if refusal:
        if is_admin(current_user):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=refusal)
        raise HTTPException(status_code=403, detail={"code": FREQUENCY_CHANGE_REFUSED, "message": refusal})

    await db.delete(frequency)
    record_event(db, "frequency.deleted", current_user, target_type="frequency", target_id=frequency.id,
                 target_label=" ".join(p for p in (frequency.frequency, frequency.mode, frequency.network, frequency.talkgroup) if p))
    await db.commit()

    return None


def _frequency_text(f) -> str:
    """"3.940 SSB (ME ARES 75m)" for the request email."""
    parts = [f.frequency or f.network or "", f.mode]
    if f.talkgroup:
        parts.append(f"TG {f.talkgroup}")
    text = " ".join(p for p in parts if p)
    return f"{text} ({f.description})" if f.description else text


@router.post("/{frequency_id}/change-request")
@_limiter.limit("10/day")
async def request_frequency_change(
    request: Request,
    frequency_id: int,
    data: FrequencyChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ask the admins, by private email, to make a change the requester may
    not make themselves (same pattern as the schedule early access request).

    Request: ``{action: "edit"|"delete", proposed?: FrequencyCreate,
    note?: str, net_id?, template_id?}``. Response: ``{"message": str}``.
    400 when the requester could make the change themselves.
    """
    frequency = await _load(db, frequency_id)
    uses = await _uses_of(db, frequency_id)
    ctx = await form_context(db, current_user, data.net_id, data.template_id)
    refusal = change_refusal(frequency, current_user, uses, ctx, deleting=data.action == "delete")
    if not refusal:
        raise HTTPException(status_code=400, detail="You can make this change yourself.")

    admins = (await db.execute(
        select(User).where(User.role == UserRole.ADMIN, User.is_active == True)  # noqa: E712
    )).scalars().all()
    if not admins:
        logger.warning("FREQUENCY", f"Frequency change requested by {current_user.email}, but there are no admins to ask")
        raise HTTPException(status_code=503, detail="There is no administrator to send this to. Please try again later.")

    # Name what uses it, so the admin can judge whether the change is right
    # for everyone. Capped: the admin tab has the full counts.
    net_names = (await db.execute(
        select(Net.name).where(Net.id.in_(uses.net_ids)).order_by(Net.id.desc()).limit(10)
    )).scalars().all() if uses.net_ids else []
    schedule_names = (await db.execute(
        select(NetTemplate.name).where(NetTemplate.id.in_(uses.template_ids)).order_by(NetTemplate.name).limit(10)
    )).scalars().all() if uses.template_ids else []

    requester_display = current_user.callsign or current_user.name or current_user.email
    if current_user.callsign and current_user.name:
        requester_display = f"{current_user.callsign} ({current_user.name})"

    for admin in admins:
        try:
            await EmailService.send_frequency_change_request(
                to_email=admin.email,
                requester_display=requester_display,
                requester_email=current_user.email,
                action=data.action,
                current=_frequency_text(frequency),
                proposed=_frequency_text(data.proposed) if data.proposed and data.action == "edit" else None,
                reason=refusal,
                uses=describe_uses(len(uses.net_ids), len(uses.template_ids), uses.check_in_count) if uses.in_use else None,
                net_names=net_names,
                schedule_names=schedule_names,
                note=(data.note or "").strip() or None,
            )
        except Exception as e:
            logger.error("FREQUENCY", f"Failed to send frequency change request to admin {admin.email}: {e}")

    logger.info("FREQUENCY", f"Frequency {frequency_id} {data.action} requested by {requester_display}")
    return {"message": "Your request was sent to the administrators."}
