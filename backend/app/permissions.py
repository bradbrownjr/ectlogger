"""
Shared permission helpers for net and template authorization.

Centralizes the owner/admin/role checks that were previously duplicated
across routers/nets.py, routers/templates.py, and routers/ncs_rotation.py,
and normalizes the admin-check idiom to `user.role == UserRole.ADMIN`
throughout.  Use `is_admin(user)` in new code rather than either of the
old inline styles.
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Net,
    NetRole,
    NetTemplate,
    NCSRotationMember,
    TemplateStaff,
    User,
    UserRole,
)


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
    - Any user whose NetRole for this net is listed in *required_roles*
    """
    if net.owner_id == user.id or is_admin(user):
        return True

    if required_roles:
        result = await db.execute(
            select(NetRole).where(
                NetRole.net_id == net.id,
                NetRole.user_id == user.id,
                NetRole.role.in_(required_roles),
            )
        )
        if result.scalar_one_or_none():
            return True

    return False


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
    if template.owner_id == user.id or is_admin(user):
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
