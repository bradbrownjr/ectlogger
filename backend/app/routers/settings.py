from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
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


@router.get("", response_model=AppSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get application settings (any authenticated user can read)"""
    settings = await get_or_create_settings(db)
    
    return _build_settings_response(settings)


def _build_settings_response(settings: AppSettings) -> AppSettingsResponse:
    return AppSettingsResponse(
        default_field_config=json.loads(settings.default_field_config) if settings.default_field_config else {},
        field_labels=json.loads(settings.field_labels) if settings.field_labels else {},
        schedule_min_account_age_days=settings.schedule_min_account_age_days if settings.schedule_min_account_age_days is not None else 7,
        schedule_min_net_participations=settings.schedule_min_net_participations if settings.schedule_min_net_participations is not None else 1,
        schedule_max_per_day=settings.schedule_max_per_day if settings.schedule_max_per_day is not None else 5,
        session_lifetime_days=settings.session_lifetime_days if settings.session_lifetime_days is not None else 30,
        session_rolling_renewal=settings.session_rolling_renewal if settings.session_rolling_renewal is not None else True,
        maintenance_banner_enabled=settings.maintenance_banner_enabled or False,
        maintenance_banner_message=settings.maintenance_banner_message,
        maintenance_banner_dismissible=settings.maintenance_banner_dismissible if settings.maintenance_banner_dismissible is not None else True,
        maintenance_banner_scheduled_start=settings.maintenance_banner_scheduled_start,
        maintenance_banner_scheduled_end=settings.maintenance_banner_scheduled_end,
    )


@router.put("", response_model=AppSettingsResponse)
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

    # Schedule creation limits
    if settings_update.schedule_min_account_age_days is not None:
        settings.schedule_min_account_age_days = settings_update.schedule_min_account_age_days

    if settings_update.schedule_min_net_participations is not None:
        settings.schedule_min_net_participations = settings_update.schedule_min_net_participations

    if settings_update.schedule_max_per_day is not None:
        settings.schedule_max_per_day = settings_update.schedule_max_per_day

    # Session settings
    if settings_update.session_lifetime_days is not None:
        settings.session_lifetime_days = max(1, settings_update.session_lifetime_days)

    if settings_update.session_rolling_renewal is not None:
        settings.session_rolling_renewal = settings_update.session_rolling_renewal

    # Maintenance banner
    if settings_update.maintenance_banner_enabled is not None:
        settings.maintenance_banner_enabled = settings_update.maintenance_banner_enabled

    if settings_update.maintenance_banner_message is not None:
        settings.maintenance_banner_message = settings_update.maintenance_banner_message

    if settings_update.maintenance_banner_dismissible is not None:
        settings.maintenance_banner_dismissible = settings_update.maintenance_banner_dismissible

    if "maintenance_banner_scheduled_start" in settings_update.model_fields_set:
        settings.maintenance_banner_scheduled_start = settings_update.maintenance_banner_scheduled_start

    if "maintenance_banner_scheduled_end" in settings_update.model_fields_set:
        settings.maintenance_banner_scheduled_end = settings_update.maintenance_banner_scheduled_end

    await db.commit()
    await db.refresh(settings)

    return _build_settings_response(settings)


@router.get("/maintenance-banner")
async def get_maintenance_banner(db: AsyncSession = Depends(get_db)):
    """Public endpoint: returns the effective maintenance banner state.

    Computes whether the banner is currently active based on the enabled flag
    and optional scheduled window. No authentication required so the banner
    can be shown to logged-out visitors.
    """
    settings = await get_or_create_settings(db)

    if not settings.maintenance_banner_enabled:
        return {"active": False, "message": None, "dismissible": True}

    now = datetime.now(timezone.utc)

    # Check scheduled window
    if settings.maintenance_banner_scheduled_start or settings.maintenance_banner_scheduled_end:
        start = settings.maintenance_banner_scheduled_start
        end = settings.maintenance_banner_scheduled_end

        if start and now < start:
            return {"active": False, "message": None, "dismissible": True}
        if end and now > end:
            return {"active": False, "message": None, "dismissible": True}

    return {
        "active": True,
        "message": settings.maintenance_banner_message,
        "dismissible": settings.maintenance_banner_dismissible if settings.maintenance_banner_dismissible is not None else True,
    }


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
