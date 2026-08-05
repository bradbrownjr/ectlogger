"""
Define a new, reusable RRI strip type from a pasted example, and file the
first Form from it in the same call. See TRAFFIC-HANDLING-DESIGN.md's RRI
strip section: "RI" is Request for Information -- someone defines a strip's
field structure once, and every respondent answers the same fields. This is
the D1-deferred "wholly new form type... only for output_format='generic'
definitions" phase, scoped narrowly to the RRI strip shape (ordered fields,
optional "/ /" section breaks) rather than general-purpose form authoring.

Any authenticated user may define a type here (matches the existing rule
that anyone can originate/receive traffic) -- created definitions carry
is_builtin=False, so an admin can still disable/relabel one later via the
existing PUT /traffic/definitions/{id}, same as any other definition.

Deliberately does NOT teach app/traffic/formatters.py::parse_any() to
recognize a dynamic type's canonical string on a future paste -- that would
require the currently-pure-function parser to become DB-aware, a bigger
change than this endpoint. A dynamic type's answers are filed through the
ordinary "New" tab's structured form instead, once the type exists.
"""
from __future__ import annotations

import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Form, FormDefinition, FormDefinitionField, Net, TrafficAction, User
from app.schemas import (
    FormDefinitionResponse,
    FormDetailResponse,
    StripTemplateCreate,
    StripTemplateCreateResponse,
    StripTemplateTokenizeRequest,
    StripTemplateTokenizeResponse,
)
from app.traffic.log import append_entry
from app.traffic.promote import compute_promoted_fields
from app.traffic.rri_strip import tokenize_strip

router = APIRouter(tags=["traffic-strip-templates"])

_FORM_TYPE_STRIP_RE = re.compile(r'[^A-Z0-9]+')
_FIELD_NAME_STRIP_RE = re.compile(r'[^a-z0-9]+')


def _normalize_form_type(raw: str) -> str:
    """Uppercase, non-alnum runs -> single hyphen, trimmed -- matches the
    shape of the builtin form_types (WXOBS, GYX-CAR-SKYWARN)."""
    normalized = _FORM_TYPE_STRIP_RE.sub('-', raw.strip().upper()).strip('-')
    return normalized[:32]


def _slugify_field_name(label: str, taken: set) -> str:
    """Lowercase, non-alnum runs -> single underscore, trimmed, deduplicated
    against names already used in this definition (field_definition_fields
    has a UniqueConstraint on (definition_id, name))."""
    base = _FIELD_NAME_STRIP_RE.sub('_', label.strip().lower()).strip('_')[:60] or 'field'
    name = base
    suffix = 2
    while name in taken:
        name = f'{base}_{suffix}'[:64]
        suffix += 1
    taken.add(name)
    return name


@router.post("/strip-templates/tokenize", response_model=StripTemplateTokenizeResponse)
async def tokenize_strip_template(
    data: StripTemplateTokenizeRequest,
    current_user: User = Depends(get_current_user),
):
    """Stateless, writes nothing -- same D5 shape as POST /traffic/import/preview.
    Splits a pasted strip example into ordered value tokens plus where its
    "/ /" section breaks fell, for the frontend to render one labelable row
    per token before POSTing to /strip-templates."""
    try:
        result = tokenize_strip(data.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StripTemplateTokenizeResponse(**result)


@router.post("/strip-templates", response_model=StripTemplateCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_strip_template(
    data: StripTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new FormDefinition (is_builtin=False, output_format='rri_strip')
    from the operator's labeled fields, and (unless file_first_form=False) file
    the first Form from their values -- one atomic call, same
    create/promote/log-entry path traffic_forms.py::create_form uses so this
    type behaves identically to a builtin one from here on (visibility,
    permissions, ICS-309, export, print view all already form-type-agnostic)."""
    form_type = _normalize_form_type(data.form_type)
    if not form_type:
        raise HTTPException(status_code=400, detail="form_type must contain at least one letter or digit")

    existing = await db.execute(select(FormDefinition).where(FormDefinition.form_type == form_type))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'A strip type "{form_type}" already exists -- use it instead of redefining it.',
        )

    if data.net_id is not None:
        net_result = await db.execute(select(Net).where(Net.id == data.net_id))
        if net_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Net not found")

    definition = FormDefinition(
        form_type=form_type,
        title=data.title.strip(),
        description="Defined from a pasted strip example.",
        version="1.0",
        output_format="rri_strip",
        is_builtin=False,
        is_enabled=True,
        sort_order=100,
    )
    db.add(definition)

    taken_names: set = set()
    field_values = {}
    for index, field in enumerate(data.fields):
        name = _slugify_field_name(field.label, taken_names)
        db.add(FormDefinitionField(
            definition=definition,
            name=name,
            label=field.label.strip(),
            field_type='text',
            is_required=False,
            starts_new_section=field.starts_new_section,
            sort_order=(index + 1) * 10,
        ))
        field_values[name] = field.value

    await db.flush()  # definition.id + definition.fields populated for compute_promoted_fields below

    # Defining the type without filing anything: commit explicitly (the filing
    # path below gets its commit from append_entry) and reload with fields
    # eagerly loaded, since the lazy relationship would raise in async context.
    if not data.file_first_form:
        await db.commit()
        definition_result = await db.execute(
            select(FormDefinition)
            .options(selectinload(FormDefinition.fields))
            .where(FormDefinition.id == definition.id)
        )
        return StripTemplateCreateResponse(
            definition=FormDefinitionResponse.from_orm(definition_result.scalar_one()),
            form=None,
        )

    promoted, values = compute_promoted_fields(definition, field_values)

    form = Form(
        definition_id=definition.id,
        form_type=definition.form_type,
        definition_version=definition.version,
        net_id=data.net_id,
        created_by_id=current_user.id,
        field_values=json.dumps(values),
        **promoted,
    )
    db.add(form)
    await db.flush()

    await append_entry(
        db, form, TrafficAction.ORIGINATED,
        reported_by_user_id=current_user.id,
        net_id=data.net_id,
    )

    result = await db.execute(
        select(Form)
        .options(selectinload(Form.definition).selectinload(FormDefinition.fields), selectinload(Form.log_entries))
        .where(Form.id == form.id)
    )
    created_form = result.scalar_one()
    response = StripTemplateCreateResponse(
        definition=FormDefinitionResponse.from_orm(created_form.definition),
        form=FormDetailResponse.from_orm(created_form),
    )

    if created_form.net_id is not None:
        from app.main import manager
        await manager.broadcast({
            "type": "traffic_logged",
            "data": {
                "form_id": created_form.id,
                "net_id": created_form.net_id,
                "form_type": created_form.form_type,
                "message_number": created_form.message_number,
            },
            "timestamp": datetime.utcnow().isoformat()
        }, created_form.net_id)

    return response
