"""
Regression tests for the NetRole.role case bug fixed 2026-09-19.

NetRole.role is a plain String(50) with no canonical form enforced at the
database. Every write path stores "NCS"/"LOGGER"/"RELAY" upper-case, but six
readers compared against a lowercase or title-cased spelling and so matched
nothing at all, silently and permanently:

  - permissions.check_form_permission passed ["ncs"] / ["ncs", "logger"]
  - routers/traffic_forms.py passed ["ncs", "logger"] on both per-net gates
  - traffic/visibility.form_visibility_clause filtered on ["ncs", "logger"]
  - services/net_closure.py looked for "Relay" among ["NCS", "LOGGER", ...]

The first four made the whole per-net traffic panel owner-and-admin-only for
the operators actually running the net; the last meant a relay operator has
never received the closing log email.

Two separate defects sat behind the same query and are covered here too: the
existence check used scalar_one_or_none() over a multi-role filter, which
raises MultipleResultsFound for an operator holding both NCS and LOGGER on one
net (the documented "Close net returns a server error" issue), and
form_visibility_clause never filtered is_active, so it would have disagreed
with check_form_permission about a stepped-down operator the moment the case
was corrected.
"""
import pytest

from app.models import Form, FormDefinition, Net, NetRole, NetStatus, User, UserRole
from app.permissions import FormPermissionResult, check_form_permission, check_net_permission
from app.traffic.visibility import form_visibility_clause
from tests.conftest import auth_headers

from sqlalchemy import select
from sqlalchemy.orm import selectinload


async def _net(db, owner, **kwargs) -> Net:
    net = Net(name="Test Net", owner_id=owner.id, **kwargs)
    db.add(net)
    await db.flush()
    return net


async def _role(db, net, user, role, is_active=True) -> NetRole:
    row = NetRole(net_id=net.id, user_id=user.id, role=role, is_active=is_active)
    db.add(row)
    await db.flush()
    return row


async def _form_on(db, net, created_by_id) -> Form:
    definition = FormDefinition(
        form_type="RADIOGRAM", title="ARRL Radiogram", version="3.1",
        output_format="nts_radiogram",
    )
    db.add(definition)
    await db.flush()
    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        field_values="{}",
        created_by_id=created_by_id,
        net_id=net.id,
    )
    db.add(form)
    await db.flush()
    return form


# ---------------------------------------------------------------------------
# check_net_permission
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_lowercase_required_roles_match_a_stored_uppercase_role(db, owner, other):
    """The bug itself: a caller asking for ["ncs"] must match a stored "NCS".

    Normalized inside check_net_permission rather than only at the four call
    sites, so the next caller to write lowercase gets what it means.
    """
    net = await _net(db, owner)
    await _role(db, net, other, "NCS")
    await db.commit()

    assert await check_net_permission(db, net, other, required_roles=["ncs"]) is True
    assert await check_net_permission(db, net, other, required_roles=["ncs", "logger"]) is True


@pytest.mark.asyncio
async def test_holding_both_ncs_and_logger_does_not_raise(db, owner, other):
    """Opening the lobby as Logger and then taking net control is a supported
    shape, so the existence check has to be bounded. Unbounded, this raised
    MultipleResultsFound and surfaced as a 500 from Close net."""
    net = await _net(db, owner)
    await _role(db, net, other, "NCS")
    await _role(db, net, other, "LOGGER")
    await db.commit()

    assert await check_net_permission(db, net, other, required_roles=["NCS", "LOGGER"]) is True


@pytest.mark.asyncio
async def test_duplicate_rows_for_one_role_do_not_raise(db, owner, other):
    """net_roles has no uniqueness constraint on (net_id, user_id, role), so
    duplicates are a shape the code has to tolerate rather than a data error
    to assume away -- same class as the 2026-09-03 outage."""
    net = await _net(db, owner)
    await _role(db, net, other, "NCS")
    await _role(db, net, other, "NCS")
    await db.commit()

    assert await check_net_permission(db, net, other, required_roles=["NCS"]) is True


@pytest.mark.asyncio
async def test_stepped_down_role_is_still_denied(db, owner, other):
    """The case fix must not quietly widen access: is_active=False (stepped
    down to Standard via toggle_self_net_role) still grants nothing."""
    net = await _net(db, owner)
    await _role(db, net, other, "NCS", is_active=False)
    await db.commit()

    assert await check_net_permission(db, net, other, required_roles=["ncs"]) is False


# ---------------------------------------------------------------------------
# The traffic panel, both halves
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_net_ncs_can_view_and_manage_a_form_on_their_net(db, owner, other):
    net = await _net(db, owner)
    await _role(db, net, other, "NCS")
    form = await _form_on(db, net, created_by_id=owner.id)
    await db.commit()

    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.GRANTED
    assert await check_form_permission(db, form, other, "manage") == FormPermissionResult.GRANTED


@pytest.mark.asyncio
async def test_net_logger_can_view_but_not_manage(db, owner, other):
    """Manage is NCS-only (TRAFFIC-HANDLING-DESIGN.md D3); the case fix must
    not blur the two levels together."""
    net = await _net(db, owner)
    await _role(db, net, other, "LOGGER")
    form = await _form_on(db, net, created_by_id=owner.id)
    await db.commit()

    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.GRANTED
    assert await check_form_permission(db, form, other, "manage") == FormPermissionResult.DENIED


@pytest.mark.asyncio
async def test_visibility_clause_agrees_with_check_form_permission(db, owner, other):
    """The list endpoint's SQL mirror and the single-row check must give the
    same answer for the same operator, active and stepped down alike."""
    net = await _net(db, owner)
    role = await _role(db, net, other, "NCS")
    form = await _form_on(db, net, created_by_id=owner.id)
    await db.commit()

    visible = (await db.execute(
        select(Form.id).where(Form.id == form.id, form_visibility_clause(other))
    )).scalars().all()
    assert visible == [form.id]

    role.is_active = False
    await db.commit()

    visible = (await db.execute(
        select(Form.id).where(Form.id == form.id, form_visibility_clause(other))
    )).scalars().all()
    assert visible == []
    assert await check_form_permission(db, form, other, "view") == FormPermissionResult.DENIED


@pytest.mark.asyncio
async def test_net_traffic_list_endpoint_open_to_that_nets_ncs(client, db, owner, other):
    net = await _net(db, owner)
    await _role(db, net, other, "NCS")
    await _form_on(db, net, created_by_id=owner.id)
    await db.commit()

    response = await client.get(f"/api/traffic/nets/{net.id}/forms", headers=auth_headers(other))
    assert response.status_code == 200
    assert response.json()["total"] == 1


@pytest.mark.asyncio
async def test_net_traffic_list_endpoint_still_closed_to_a_stranger(client, db, owner):
    stranger = User(email="stranger@test.com", callsign="KC1STR", role=UserRole.USER, is_active=True)
    db.add(stranger)
    net = await _net(db, owner)
    await _form_on(db, net, created_by_id=owner.id)
    await db.commit()

    response = await client.get(f"/api/traffic/nets/{net.id}/forms", headers=auth_headers(stranger))
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# The write boundary
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_assign_role_normalizes_case(client, db, owner, other):
    """role is a free-text query parameter on this endpoint, and it is the
    only place a client picks the stored value. A lowercase request must land
    as "NCS", not as a row invisible to every reader in the codebase."""
    net = await _net(db, owner)
    await db.commit()

    response = await client.post(
        f"/api/nets/{net.id}/roles?user_id={other.id}&role=ncs", headers=auth_headers(owner)
    )
    assert response.status_code == 200

    stored = (await db.execute(
        select(NetRole.role).where(NetRole.net_id == net.id, NetRole.user_id == other.id)
    )).scalars().all()
    assert stored == ["NCS"]


@pytest.mark.asyncio
async def test_assign_role_rejects_an_unknown_role(client, db, owner, other):
    net = await _net(db, owner)
    await db.commit()

    response = await client.post(
        f"/api/nets/{net.id}/roles?user_id={other.id}&role=SCRIBE", headers=auth_headers(owner)
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# The closing log's recipient list
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_relay_operator_receives_the_closing_log(db, owner, other, monkeypatch):
    """The role filter asked for "Relay" against rows stored as "RELAY", so an
    operator who worked the net as Relay has never been sent the log."""
    from app.email_service import EmailService
    from app.services.net_closure import close_net_and_notify

    sent = []

    async def _record(self, *, email, **kwargs):
        sent.append(email)

    monkeypatch.setattr(EmailService, "send_net_log", _record)
    monkeypatch.setattr(EmailService, "send_ics309_log", _record)

    for user in (owner, other):
        user.email_notifications = True
        user.notify_net_close = True

    net = await _net(db, owner, status=NetStatus.ACTIVE)
    await _role(db, net, other, "RELAY")
    await db.commit()

    # Eager-loaded the way routers/nets_core.close_net loads it -- the service
    # walks net.check_ins and net.frequencies without re-querying.
    net = (await db.execute(
        select(Net)
        .options(selectinload(Net.frequencies), selectinload(Net.check_ins))
        .where(Net.id == net.id)
    )).scalar_one()

    await close_net_and_notify(db, net, owner)

    assert other.email in sent
