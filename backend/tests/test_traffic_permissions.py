"""
Permission matrix tests for check_form_permission (app/permissions.py), per
TRAFFIC-HANDLING-DESIGN.md D3. One test per grant path, plus denial cases.
"""
import pytest
from datetime import datetime, timezone

from app.models import Form, FormDefinition, Net, NetRole, TrafficAction, TrafficLogEntry, User, UserRole
from app.permissions import FormPermissionResult, check_form_permission
from app.traffic.log import append_entry


async def _definition(db) -> FormDefinition:
    definition = FormDefinition(
        form_type="RADIOGRAM", title="ARRL Radiogram", version="3.1", output_format="nts_radiogram"
    )
    db.add(definition)
    await db.flush()
    return definition


async def _form(db, definition, **kwargs) -> Form:
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        field_values="{}",
        **kwargs,
    )
    db.add(form)
    await db.flush()
    return form


async def _stranger(db) -> User:
    user = User(email="stranger@test.com", callsign="KC1STR", role=UserRole.USER, is_active=True)
    db.add(user)
    await db.flush()
    return user


# ---------------------------------------------------------------------------
# View: grant paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_view_granted_to_submitter(db, owner):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    assert await check_form_permission(db, form, owner, "view") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_view_granted_to_current_holder(db, owner, other):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, held_by_user_id=other.id)
    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_view_granted_to_chain_of_custody(db, owner, other):
    """Someone who never held the form but appears on a log entry (reported_by
    or handed_to) must still be able to view it -- this is what HXD reporting
    requires."""
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    entry = TrafficLogEntry(
        form_id=form.id,
        sequence=1,
        action=TrafficAction.RELAYED,
        handed_to_user_id=other.id,
        occurred_at=datetime.utcnow(),
    )
    db.add(entry)
    await db.commit()
    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_view_granted_to_net_ncs_logger(db, owner, other):
    net = Net(name="Test Net", owner_id=owner.id)
    db.add(net)
    await db.flush()
    role = NetRole(net_id=net.id, user_id=other.id, role="ncs")
    db.add(role)
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, net_id=net.id)
    await db.commit()
    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_view_granted_to_admin(db, owner, admin):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    assert await check_form_permission(db, form, admin, "view") == FormPermissionResult.GRANTED


# ---------------------------------------------------------------------------
# View: denials
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_view_denied_to_unrelated_stranger_on_net_scoped_form(db, owner, other):
    """A form filed on a net is not automatically visible to every net
    check-in -- only the submitter, holder, chain of custody, and that net's
    NCS/logger/admin. An ordinary participant with no NetRole is denied."""
    net = Net(name="Test Net", owner_id=owner.id)
    db.add(net)
    await db.flush()
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, net_id=net.id)
    await db.commit()
    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.DENIED


@pytest.mark.asyncio
async def test_view_denied_to_stranger_on_form_filed_outside_a_net(db, owner):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, net_id=None)
    stranger = await _stranger(db)
    await db.commit()
    assert await check_form_permission(db, form, stranger, "view") == FormPermissionResult.DENIED


# ---------------------------------------------------------------------------
# Manage
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_manage_granted_to_submitter_while_draft(db, owner):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    assert await check_form_permission(db, form, owner, "manage") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_manage_granted_to_net_ncs_while_draft(db, owner, other):
    net = Net(name="Test Net", owner_id=owner.id)
    db.add(net)
    await db.flush()
    role = NetRole(net_id=net.id, user_id=other.id, role="ncs")
    db.add(role)
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id, net_id=net.id)
    await db.commit()
    assert await check_form_permission(db, form, other, "manage") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_manage_denied_to_uninvolved_user_while_draft(db, owner, other):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    await db.commit()
    assert await check_form_permission(db, form, other, "manage") == FormPermissionResult.DENIED


@pytest.mark.asyncio
async def test_manage_is_append_only_once_a_log_entry_exists(db, owner):
    """A form becomes append-only the instant it has any log entry -- PATCH
    must return 409, not 403, even for the submitter who could otherwise
    manage a draft."""
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)
    await db.commit()

    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)

    assert await check_form_permission(db, form, owner, "manage") == FormPermissionResult.APPEND_ONLY
