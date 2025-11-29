from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import json

from app.database import get_db
from app.models import AppSettings, User, UserRole, FieldDefinition
from app.schemas import (
    AppSettingsResponse, AppSettingsUpdate,
    FieldDefinitionCreate, FieldDefinitionUpdate, FieldDefinitionResponse
)
from app.dependencies import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])

# Built-in fields that are created on first run
BUILTIN_FIELDS = [
    {"name": "name", "label": "Name", "field_type": "text", "default_enabled": True, "is_builtin": True, "sort_order": 10},
    {"name": "location", "label": "Location", "field_type": "text", "default_enabled": True, "is_builtin": True, "sort_order": 20},
    {"name": "skywarn_number", "label": "Spotter #", "field_type": "text", "default_enabled": False, "is_builtin": True, "sort_order": 30},
    {"name": "weather_observation", "label": "Weather", "field_type": "textarea", "default_enabled": False, "is_builtin": True, "sort_order": 40},
    {"name": "power_source", "label": "Power Src", "field_type": "text", "default_enabled": False, "is_builtin": True, "sort_order": 50},
    {"name": "power", "label": "Power", "field_type": "text", "default_enabled": False, "is_builtin": True, "sort_order": 55},
    {"name": "feedback", "label": "Feedback", "field_type": "textarea", "default_enabled": False, "is_builtin": True, "sort_order": 60},
    {"name": "notes", "label": "Notes", "field_type": "textarea", "default_enabled": False, "is_builtin": True, "sort_order": 70},
]


async def ensure_builtin_fields(db: AsyncSession):
    """Create built-in fields if they don't exist"""
    for field_data in BUILTIN_FIELDS:
        result = await db.execute(
            select(FieldDefinition).where(FieldDefinition.name == field_data["name"])
        )
        if not result.scalar_one_or_none():
            field = FieldDefinition(**field_data)
            db.add(field)
    await db.commit()


async def get_or_create_settings(db: AsyncSession) -> AppSettings:
    """Get the singleton settings row, creating it if it doesn't exist"""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    
    return settings


@router.get("/", response_model=AppSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get application settings (any authenticated user can read)"""
    settings = await get_or_create_settings(db)
    
    return AppSettingsResponse(
        default_field_config=json.loads(settings.default_field_config) if settings.default_field_config else {},
        field_labels=json.loads(settings.field_labels) if settings.field_labels else {}
    )


@router.put("/", response_model=AppSettingsResponse)
async def update_settings(
    settings_update: AppSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update application settings (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    settings = await get_or_create_settings(db)
    
    if settings_update.default_field_config is not None:
        settings.default_field_config = json.dumps(settings_update.default_field_config)
    
    if settings_update.field_labels is not None:
        settings.field_labels = json.dumps(settings_update.field_labels)
    
    await db.commit()
    await db.refresh(settings)
    
    return AppSettingsResponse(
        default_field_config=json.loads(settings.default_field_config) if settings.default_field_config else {},
        field_labels=json.loads(settings.field_labels) if settings.field_labels else {}
    )


@router.get("/field-labels")
async def get_field_labels(
    db: AsyncSession = Depends(get_db)
):
    """Get field labels (public endpoint for display purposes)"""
    settings = await get_or_create_settings(db)
    return json.loads(settings.field_labels) if settings.field_labels else {}


# Field Definition Endpoints
@router.get("/fields", response_model=List[FieldDefinitionResponse])
async def list_field_definitions(
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all field definitions"""
    await ensure_builtin_fields(db)
    
    query = select(FieldDefinition).order_by(FieldDefinition.sort_order, FieldDefinition.name)
    if not include_archived:
        query = query.where(FieldDefinition.is_archived == False)
    
    result = await db.execute(query)
    fields = result.scalars().all()
    return [FieldDefinitionResponse.from_orm(f) for f in fields]


@router.post("/fields", response_model=FieldDefinitionResponse)
async def create_field_definition(
    field_data: FieldDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new field definition (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check for duplicate name
    result = await db.execute(
        select(FieldDefinition).where(FieldDefinition.name == field_data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Field with this name already exists")
    
    field = FieldDefinition(
        name=field_data.name,
        label=field_data.label,
        field_type=field_data.field_type,
        options=json.dumps(field_data.options) if field_data.options else None,
        placeholder=field_data.placeholder,
        default_enabled=field_data.default_enabled,
        default_required=field_data.default_required,
        sort_order=field_data.sort_order,
        is_builtin=False,
    )
    db.add(field)
    await db.commit()
    await db.refresh(field)
    
    return FieldDefinitionResponse.from_orm(field)


@router.put("/fields/{field_id}", response_model=FieldDefinitionResponse)
async def update_field_definition(
    field_id: int,
    field_data: FieldDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a field definition (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(
        select(FieldDefinition).where(FieldDefinition.id == field_id)
    )
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    
    # Update allowed fields
    if field_data.label is not None:
        field.label = field_data.label
    if field_data.field_type is not None:
        field.field_type = field_data.field_type
    if field_data.options is not None:
        field.options = json.dumps(field_data.options) if field_data.options else None
    if field_data.placeholder is not None:
        field.placeholder = field_data.placeholder
    if field_data.default_enabled is not None:
        field.default_enabled = field_data.default_enabled
    if field_data.default_required is not None:
        field.default_required = field_data.default_required
    if field_data.is_archived is not None:
        field.is_archived = field_data.is_archived
    if field_data.sort_order is not None:
        field.sort_order = field_data.sort_order
    
    await db.commit()
    await db.refresh(field)
    
    return FieldDefinitionResponse.from_orm(field)


@router.delete("/fields/{field_id}")
async def archive_field_definition(
    field_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Archive a field definition (admin only). Built-in fields cannot be archived."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(
        select(FieldDefinition).where(FieldDefinition.id == field_id)
    )
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    
    if field.is_builtin:
        raise HTTPException(status_code=400, detail="Built-in fields cannot be archived")
    
    field.is_archived = True
    await db.commit()
    
    return {"message": "Field archived successfully"}
