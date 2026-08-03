from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models import FormDefinition, FormDefinitionField, User
from app.schemas import ArlMessageResponse, FormDefinitionResponse, FormDefinitionUpdate
from app.traffic.arl import get_arl_messages

router = APIRouter(tags=["traffic-definitions"])


@router.get("/definitions", response_model=List[FormDefinitionResponse])
async def list_form_definitions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enabled form definitions with their field lists, for the type picker
    and the generic renderer."""
    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.is_enabled == True)
        .order_by(FormDefinition.sort_order, FormDefinition.title)
    )
    definitions = result.scalars().all()
    return [FormDefinitionResponse.from_orm(d) for d in definitions]


@router.get("/arl-messages", response_model=List[ArlMessageResponse])
async def list_arl_messages(
    current_user: User = Depends(get_current_user),
):
    """The ARL numbered-message catalog for the radiogram ArlMessagePicker.

    Static reference data, cached in-process by app/traffic/arl.py -- no DB
    query needed. Route is declared before /definitions/{form_type} so
    "arl-messages" is never captured as a form_type path parameter.
    """
    return get_arl_messages()


@router.get("/definitions/{form_type}", response_model=FormDefinitionResponse)
async def get_form_definition(
    form_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One definition with its full field schema, keyed on form_type."""
    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.form_type == form_type)
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Form definition not found")
    return FormDefinitionResponse.from_orm(definition)


@router.put("/definitions/{definition_id}", response_model=FormDefinitionResponse)
async def update_form_definition(
    definition_id: int,
    data: FormDefinitionUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: enable/disable, reorder, and override field label/description.

    Rejects any field_overrides entry whose id doesn't belong to this
    definition -- the closest thing to "changing the field set" the update
    schema permits is naming a field that isn't actually part of it, and that
    is precisely what must be refused (TRAFFIC-HANDLING-DESIGN.md D1: a
    builtin's field set is code-owned, not admin-authored).
    """
    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.id == definition_id)
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Form definition not found")

    if data.is_enabled is not None:
        definition.is_enabled = data.is_enabled
    if data.sort_order is not None:
        definition.sort_order = data.sort_order

    if data.field_overrides:
        fields_by_id = {f.id: f for f in definition.fields}
        for override in data.field_overrides:
            field = fields_by_id.get(override.id)
            if field is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Field id {override.id} does not belong to definition "
                        f"{definition.form_type}; cannot add or retarget a field "
                        f"on a builtin definition"
                    ),
                )
            if override.label is not None:
                field.label = override.label
            if override.description is not None:
                field.description = override.description

    await db.commit()

    result = await db.execute(
        select(FormDefinition)
        .options(selectinload(FormDefinition.fields))
        .where(FormDefinition.id == definition_id)
    )
    return FormDefinitionResponse.from_orm(result.scalar_one())
