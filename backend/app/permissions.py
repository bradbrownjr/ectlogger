"""
Shared permission helpers for net and template authorization.

Centralizes the owner/admin/role checks that were previously duplicated
across routers/nets.py, routers/templates.py, and routers/ncs_rotation.py,
and normalizes the admin-check idiom to `user.role == UserRole.ADMIN`
throughout.  Use `is_admin(user)` in new code rather than either of the
old inline styles.
"""
from __future__ import annotations

import enum
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Form,
    Net,
    NetRole,
    NetTemplate,
    NCSRotationMember,
    TemplateStaff,
    TrafficLogEntry,
    User,
    UserRole,
)


class FormPermissionResult(str, enum.Enum):
    """Result of check_form_permission. APPEND_ONLY is distinct from DENIED
    so a router can return 409 (the form is no longer a draft) rather than a
    plain 403 for a manage attempt. See TRAFFIC-HANDLING-DESIGN.md D3."""
    GRANTED = "granted"
    DENIED = "denied"
    APPEND_ONLY = "append_only"


def is_admin(user: User) -> bool:
    """Return True when the user holds the global admin role."""
    return user.role == UserRole.ADMIN


async def check_net_permission(
    db: AsyncSession,
    net: Net,
    user: User,
    required_roles: Optional[List[str]] = None,
) -> bool:
    """Return True when the user may manage *net*.

    Grants access to:
    - The net owner
    - Any global admin
    - Any user with an active NetRole for this net listed in *required_roles*
      (a role stepped down to Standard via toggle_self_net_role, is_active=False,
      no longer counts -- otherwise "step down to Standard" would only change
      what's displayed, not what's actually permitted)
    """
    if net.owner_id == user.id or is_admin(user):
        return True

    if required_roles:
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net.id,
                NetRole.user_id == user.id,
                NetRole.role.in_(required_roles),
                NetRole.is_active == True,  # noqa: E712
            )
        )
        if result.scalar_one_or_none():
            return True

    return False


async def is_eligible_for_ncs_auto_grant(db: AsyncSession, net: Net, user_id: int) -> bool:
    """Return True when *user_id* is eligible to be granted NCS on checking
    into *net*: an active co-manager or active NCS rotation member for the
    net's template, with no existing NetRole on this specific net occurrence
    yet (owner/admin/an already-assigned role don't need this -- they already
    have access, or checking in wouldn't change anything for them).

    Deliberately does NOT depend on whether someone else already holds an
    active NCS role on this net -- a large multi-desk exercise (e.g. net 15,
    "GYX SKYWARN / Emergency Communications Exercise": 8 different eligible
    staff self-checked in as NCS within minutes of each other) is a
    legitimate, wanted pattern, not a pile-on. An earlier version of this
    function blocked eligibility once anyone else was active NCS, which
    quietly broke that pattern going forward (no self-service way to become
    an additional NCS afterward -- toggle_self_net_role only toggles a role
    you already hold) and also crashed GET /nets/{id} outright on 18
    production nets that already had 2+ active NCS rows, via
    scalar_one_or_none() on a query that was never actually unique.

    The 2026-08-30 ME Dirigo Net incident this function guards against (net
    79: Cory Golob correctly checked in as NCS, then Peter -- an ordinary
    rotation member checking in as a participant nearly an hour later -- was
    auto-granted NCS too, with no choice presented) was root-caused to the
    grant being fully silent and automatic, not to multiple NCS being
    possible. That's fixed at the two call sites instead: the check-in
    Snackbar now defaults check_in_as_standard=true and
    CheckInFormDialog's NCS/Standard radio defaults to Standard, so becoming
    NCS always requires an affirmative, deliberate choice -- eligibility
    alone (this function) no longer silently grants anything.

    Shared by check_ins.py (to decide whether to actually grant, gated on
    the caller having explicitly requested NCS) and nets_core.py (to expose
    the choice to the frontend, e.g. the check-in dialog's NCS/Standard
    toggle).
    """
    if not net.template_id:
        return False

    # Existence check, bounded with limit(1) -- a user can hold more than one
    # NetRole on the same net (e.g. NCS *and* LOGGER), so scalar_one_or_none()
    # on this filter would raise MultipleResultsFound. That is exactly the
    # defect that took GET /nets/{id} down on 2026-09-03; no such rows exist
    # today, but assign_role can create them.
    existing_result = await db.execute(
        select(NetRole.id)
        .where(NetRole.net_id == net.id, NetRole.user_id == user_id)
        .limit(1)
    )
    if existing_result.scalar_one_or_none() is not None:
        return False

    co_mgr_result = await db.execute(
        select(TemplateStaff).where(
            TemplateStaff.template_id == net.template_id,
            TemplateStaff.user_id == user_id,
            TemplateStaff.is_active == True,  # noqa: E712
            TemplateStaff.is_co_manager == True,  # noqa: E712
        )
    )
    if co_mgr_result.scalar_one_or_none() is not None:
        return True

    rotation_result = await db.execute(
        select(NCSRotationMember).where(
            NCSRotationMember.template_id == net.template_id,
            NCSRotationMember.user_id == user_id,
            NCSRotationMember.is_active == True,  # noqa: E712
        )
    )
    return rotation_result.scalar_one_or_none() is not None


async def is_eligible_for_logger_self_grant(db: AsyncSession, net: Net, user_id: int) -> bool:
    """Return True when *user_id* is eligible to be granted LOGGER on checking
    into *net*, with no existing NetRole on this specific net occurrence yet
    (same existence check as is_eligible_for_ncs_auto_grant, and for the same
    reason -- an already-assigned role doesn't need this).

    Eligible: the net's owner (e.g. opening a lobby and stepping in as Logger
    while waiting for the scheduled NCS -- the workflow this was added for,
    2026-09-05), or the same population eligible for NCS auto-grant (active
    co-manager or active NCS rotation member for the net's template). Logger
    is lower-stakes than NCS but still grants check-in management power, so
    it uses the same trust bar plus the owner rather than being open to
    anyone -- unlike NCS eligibility, which requires a template, the owner
    path here also covers ad hoc nets (no template, no rotation/co-manager
    concept, but still the owner's own net).
    """
    existing_result = await db.execute(
        select(NetRole.id)
        .where(NetRole.net_id == net.id, NetRole.user_id == user_id)
        .limit(1)
    )
    if existing_result.scalar_one_or_none() is not None:
        return False

    if net.owner_id == user_id:
        return True

    if not net.template_id:
        return False

    co_mgr_result = await db.execute(
        select(TemplateStaff).where(
            TemplateStaff.template_id == net.template_id,
            TemplateStaff.user_id == user_id,
            TemplateStaff.is_active == True,  # noqa: E712
            TemplateStaff.is_co_manager == True,  # noqa: E712
        )
    )
    if co_mgr_result.scalar_one_or_none() is not None:
        return True

    rotation_result = await db.execute(
        select(NCSRotationMember).where(
            NCSRotationMember.template_id == net.template_id,
            NCSRotationMember.user_id == user_id,
            NCSRotationMember.is_active == True,  # noqa: E712
        )
    )
    return rotation_result.scalar_one_or_none() is not None


async def check_net_lifecycle_permission(
    db: AsyncSession, net: Net, user: User
) -> bool:
    """Return True when the user may archive or delete *net*.

    Grants access to:
    - The net owner
    - Any global admin
    - Any user with NCS role on this specific net
    - The owner or an active co-manager of the template this net was created from
    """
    if net.owner_id == user.id or is_admin(user):
        return True

    # NCS role on this specific net
    ncs_result = await db.execute(
        select(NetRole).where(
            NetRole.net_id == net.id,
            NetRole.user_id == user.id,
            NetRole.role == "NCS",
        )
    )
    if ncs_result.scalar_one_or_none():
        return True

    # Template manager or active co-manager (net auto-created from a schedule)
    if net.template_id:
        tmpl_result = await db.execute(
            select(NetTemplate).where(
                NetTemplate.id == net.template_id,
                NetTemplate.owner_id == user.id,
            )
        )
        if tmpl_result.scalar_one_or_none():
            return True

        co_mgr_result = await db.execute(
            select(TemplateStaff).where(
                TemplateStaff.template_id == net.template_id,
                TemplateStaff.user_id == user.id,
                TemplateStaff.is_co_manager == True,
            )
        )
        if co_mgr_result.scalar_one_or_none():
            return True

    return False


async def check_template_staff_access(
    db: AsyncSession, template: NetTemplate, user: User
) -> bool:
    """Return True when *user* has non-admin management access to
    *template* (owner, active staff, or active NCS rotation member) --
    exactly what check_template_permission grants, MINUS the admin blanket
    bypass.

    Exposed separately (rather than inlined into check_template_permission
    below) so routers can report it on NetTemplateResponse as
    is_owner_or_staff, the template equivalent of nets_core.py's
    is_owner_or_ncs. Both exist for the same reason: a real admin's actual
    API calls always succeed via the admin bypass no matter what the
    frontend's "View as Regular User" toggle (AuthContext.tsx's
    simulateRegularUser) shows them, since that toggle never touches the
    JWT/identity a request authenticates with -- it only fakes `role` in
    the client's own state. For the frontend to correctly hide/disable a
    control while simulating, it needs each response to separately state
    what a genuinely non-admin version of this same user could do, rather
    than the admin-inclusive can_manage/can_create_net fields alone.
    """
    if template.owner_id == user.id:
        return True

    # Active staff members (includes co-managers)
    staff_result = await db.execute(
        select(TemplateStaff).where(
            TemplateStaff.template_id == template.id,
            TemplateStaff.user_id == user.id,
            TemplateStaff.is_active == True,
        )
    )
    if staff_result.scalar_one_or_none():
        return True

    # Active NCS rotation members
    rotation_result = await db.execute(
        select(NCSRotationMember).where(
            NCSRotationMember.template_id == template.id,
            NCSRotationMember.user_id == user.id,
            NCSRotationMember.is_active == True,
        )
    )
    if rotation_result.scalar_one_or_none():
        return True

    return False


async def check_template_permission(
    db: AsyncSession, template: NetTemplate, user: User
) -> bool:
    """Return True when the user may manage *template*.

    Grants access to:
    - The template owner
    - Any global admin
    - Any active staff member for this template
    - Any active NCS rotation member for this template

    This is the canonical implementation; the previous copies in
    routers/templates.py and routers/ncs_rotation.py are removed.
    The ncs_rotation.py copy had a silent bug: it compared
    ``user.role == 'admin'`` (enum vs string, always False) instead of
    ``user.role == UserRole.ADMIN``.
    """
    if is_admin(user):
        return True
    return await check_template_staff_access(db, template, user)


async def check_form_permission(
    db: AsyncSession,
    form: Form,
    user: User,
    level: str,
) -> FormPermissionResult:
    """Return the access *user* has to *form* at *level* ("view" or "manage").

    View grants access to: the submitter, the current holder, anyone named
    reported_by_user_id/handed_to_user_id on any log entry for this form
    (the chain of custody), that net's NCS/logger (when net_id is set), and
    global admins.

    Manage grants access to: the submitter or the net's NCS, but only while
    the form is still a draft (no log entries). Once any log entry exists,
    manage always resolves to APPEND_ONLY -- not DENIED -- so the caller can
    return 409 rather than a plain 403; corrections are made by appending to
    the chain, never by rewriting a message already passed on the air.

    See TRAFFIC-HANDLING-DESIGN.md D3.
    """
    if level not in ("view", "manage"):
        raise ValueError(f"Unknown permission level: {level!r}")

    entries_result = await db.execute(
        select(TrafficLogEntry).where(TrafficLogEntry.form_id == form.id)
    )
    entries = entries_result.scalars().all()

    net = None
    if form.net_id:
        net_result = await db.execute(select(Net).where(Net.id == form.net_id))
        net = net_result.scalar_one_or_none()

    if level == "manage":
        if entries:
            return FormPermissionResult.APPEND_ONLY
        if form.created_by_id == user.id or is_admin(user):
            return FormPermissionResult.GRANTED
        if net and await check_net_permission(db, net, user, required_roles=["ncs"]):
            return FormPermissionResult.GRANTED
        return FormPermissionResult.DENIED

    # level == "view"
    if form.created_by_id == user.id or is_admin(user):
        return FormPermissionResult.GRANTED
    if form.held_by_user_id == user.id:
        return FormPermissionResult.GRANTED
    if any(e.reported_by_user_id == user.id or e.handed_to_user_id == user.id for e in entries):
        return FormPermissionResult.GRANTED
    if net and await check_net_permission(db, net, user, required_roles=["ncs", "logger"]):
        return FormPermissionResult.GRANTED
    return FormPermissionResult.DENIED
