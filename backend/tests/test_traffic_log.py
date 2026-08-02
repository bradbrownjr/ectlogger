"""
Tests for app/traffic/log.py: append_entry (the single writer of the cached
Form columns), derive_disposition, and recompute_form_cache reproducing the
cache from the log for every disposition transition. See
TRAFFIC-HANDLING-DESIGN.md D7 and R2.
"""
import pytest
from datetime import datetime

from app.models import Form, FormDefinition, FormDisposition, TrafficAction
from app.traffic.log import append_entry, derive_disposition, recompute_form_cache


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
    await db.commit()
    await db.refresh(form)
    return form


@pytest.mark.asyncio
async def test_derive_disposition_no_entries_is_draft(db):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=None)
    assert derive_disposition([]) == FormDisposition.DRAFT


@pytest.mark.asyncio
async def test_full_transition_chain_draft_to_delivered(db, owner, other):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)

    assert derive_disposition([]) == FormDisposition.DRAFT

    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    assert form.last_action == TrafficAction.ORIGINATED
    assert form.held_by_user_id == owner.id
    assert form.held_since is not None

    await append_entry(
        db, form, TrafficAction.RELAYED,
        handed_to_user_id=other.id, reported_by_user_id=owner.id,
    )
    assert form.last_action == TrafficAction.RELAYED
    assert form.held_by_user_id == other.id
    assert form.held_since is not None

    await append_entry(db, form, TrafficAction.DELIVERED, reported_by_user_id=other.id)
    assert form.last_action == TrafficAction.DELIVERED
    assert form.held_by_user_id is None
    assert form.held_since is None

    await db.refresh(form, attribute_names=["log_entries"])
    assert derive_disposition(form) == FormDisposition.DELIVERED

    # recompute_form_cache must reproduce exactly the same cached state from
    # the log alone (R2's self-healing property).
    form.held_by_user_id = 999999
    form.last_action = None
    await recompute_form_cache(db, form)
    assert form.last_action == TrafficAction.DELIVERED
    assert form.held_by_user_id is None
    assert form.held_since is None


@pytest.mark.asyncio
async def test_relayed_to_unknown_operator_clears_holder(db, owner):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)

    await append_entry(db, form, TrafficAction.RECEIVED, reported_by_user_id=owner.id)
    assert form.held_by_user_id == owner.id

    await append_entry(
        db, form, TrafficAction.RELAYED,
        path_name="Pine Tree Net", handed_to="W1AW", handed_to_user_id=None,
    )
    assert form.held_by_user_id is None
    assert form.held_since is None
    assert form.last_action == TrafficAction.RELAYED

    await db.refresh(form, attribute_names=["log_entries"])
    assert derive_disposition(form) == FormDisposition.RELAYED


@pytest.mark.asyncio
async def test_cancelled_path(db, owner):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)

    await append_entry(db, form, TrafficAction.ORIGINATED, reported_by_user_id=owner.id)
    await append_entry(db, form, TrafficAction.CANCELLED, reported_by_user_id=owner.id)

    assert form.last_action == TrafficAction.CANCELLED
    assert form.held_by_user_id is None
    assert form.held_since is None

    await db.refresh(form, attribute_names=["log_entries"])
    assert derive_disposition(form) == FormDisposition.CANCELLED

    form.last_action = None
    form.held_by_user_id = 12345
    await recompute_form_cache(db, form)
    assert form.last_action == TrafficAction.CANCELLED
    assert form.held_by_user_id is None


@pytest.mark.asyncio
async def test_serviced_is_annotation_only_and_does_not_change_disposition(db, owner):
    definition = await _definition(db)
    form = await _form(db, definition, created_by_id=owner.id)

    await append_entry(db, form, TrafficAction.RECEIVED, reported_by_user_id=owner.id)
    await append_entry(
        db, form, TrafficAction.RELAYED,
        handed_to="Seagull Net", handed_to_user_id=None,
    )
    pre_serviced_holder = form.held_by_user_id
    pre_serviced_action = form.last_action

    await append_entry(db, form, TrafficAction.SERVICED, note="Reported delivery to origin")

    # SERVICED must not change the cached fields.
    assert form.held_by_user_id == pre_serviced_holder
    assert form.last_action == pre_serviced_action

    await db.refresh(form, attribute_names=["log_entries"])
    assert derive_disposition(form) == FormDisposition.RELAYED
