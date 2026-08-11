from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime, timezone
from io import BytesIO
from PIL import Image, ImageOps
import json

from app.database import get_db
from app.models import AppSettings, User, UserRole, FieldDefinition
from app.schemas import (
    AppSettingsResponse, AppSettingsUpdate, CustomTheme,
    FieldDefinitionCreate, FieldDefinitionUpdate, FieldDefinitionResponse
)
from app.dependencies import get_current_user, get_admin_user
from app.utils import LOGO_DIR, set_gravatar_enabled

router = APIRouter(prefix="/settings", tags=["settings"])

LOGO_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
LOGO_MAX_DIM = 512
LOGO_RASTER_MIME = {"image/png", "image/jpeg", "image/webp"}
LOGO_SVG_MIME = "image/svg+xml"

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
        session_lifetime_days=settings.session_lifetime_days if settings.session_lifetime_days is not None else 90,
        session_rolling_renewal=settings.session_rolling_renewal if settings.session_rolling_renewal is not None else True,
        maintenance_banner_enabled=settings.maintenance_banner_enabled or False,
        maintenance_banner_message=settings.maintenance_banner_message,
        maintenance_banner_dismissible=settings.maintenance_banner_dismissible if settings.maintenance_banner_dismissible is not None else True,
        maintenance_banner_scheduled_start=settings.maintenance_banner_scheduled_start,
        maintenance_banner_scheduled_end=settings.maintenance_banner_scheduled_end,
        default_theme=settings.default_theme or 'ectlogger-blue',
        default_color_mode=settings.default_color_mode if settings.default_color_mode in ('light', 'dark') else 'light',
        custom_theme=CustomTheme(**json.loads(settings.custom_theme_json)) if settings.custom_theme_json else None,
        custom_logo_url=settings.custom_logo_url,
        gravatar_enabled=settings.gravatar_enabled if settings.gravatar_enabled is not None else True,
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

    # Theming
    if settings_update.default_theme is not None:
        settings.default_theme = settings_update.default_theme

    # Branding
    if settings_update.default_color_mode is not None:
        settings.default_color_mode = settings_update.default_color_mode

    if "custom_theme" in settings_update.model_fields_set:
        settings.custom_theme_json = (
            settings_update.custom_theme.model_dump_json() if settings_update.custom_theme else None
        )

    # Avatars
    if settings_update.gravatar_enabled is not None:
        settings.gravatar_enabled = settings_update.gravatar_enabled
        # get_avatar_url() is called from a synchronous serializer with no DB
        # session, so it reads an in-process cache that has to be refreshed here.
        set_gravatar_enabled(settings_update.gravatar_enabled)

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


@router.get("/theme")
async def get_theme_settings(
    db: AsyncSession = Depends(get_db)
):
    """Get the site's branding settings (public endpoint, needed pre-login so
    the login screen can render correctly before authentication resolves).
    Kept at this URL for backward compatibility even though it now covers
    more than just the default theme key - see docs/DEVELOPMENT.md "Theming".
    """
    settings = await get_or_create_settings(db)
    return {
        "default_theme": settings.default_theme or 'ectlogger-blue',
        "default_color_mode": settings.default_color_mode if settings.default_color_mode in ('light', 'dark') else 'light',
        "custom_theme": json.loads(settings.custom_theme_json) if settings.custom_theme_json else None,
        "custom_logo_url": settings.custom_logo_url,
        "gravatar_enabled": settings.gravatar_enabled if settings.gravatar_enabled is not None else True,
    }


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a custom instance logo, replacing the built-in SVG mark
    (Admin -> Branding). One file for the whole instance, not per-user -
    see LOGO_DIR in app/utils.py. Accepted: PNG, JPEG, WebP, SVG. Max 2 MB."""
    is_svg = file.content_type == LOGO_SVG_MIME
    if not is_svg and file.content_type not in LOGO_RASTER_MIME:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPEG, WebP, or SVG.")

    file_bytes = await file.read()
    if len(file_bytes) > LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 2 MB).")

    # Clear any previously uploaded logo regardless of its extension, so
    # switching from e.g. SVG to PNG doesn't leave the old file behind.
    for existing in LOGO_DIR.glob("instance-logo.*"):
        existing.unlink()

    if is_svg:
        if b'<svg' not in file_bytes.lower():
            raise HTTPException(status_code=400, detail="Invalid SVG file.")
        dest = LOGO_DIR / "instance-logo.svg"
        dest.write_bytes(file_bytes)
    else:
        try:
            pil_image = Image.open(BytesIO(file_bytes))
            pil_image.load()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid or corrupt image.") from exc

        # Physically rotate pixels to match EXIF orientation, same as avatar uploads.
        pil_image = ImageOps.exif_transpose(pil_image)
        if pil_image.mode not in {"RGBA", "RGB"}:
            pil_image = pil_image.convert("RGBA")
        pil_image.thumbnail((LOGO_MAX_DIM, LOGO_MAX_DIM), Image.Resampling.LANCZOS)

        dest = LOGO_DIR / "instance-logo.png"
        pil_image.save(str(dest), format="PNG")

    settings = await get_or_create_settings(db)
    settings.custom_logo_url = f"/api/logo/{dest.name}"
    await db.commit()
    await db.refresh(settings)

    return _build_settings_response(settings)


@router.delete("/logo")
async def delete_logo(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the custom instance logo, reverting to the built-in SVG mark."""
    for existing in LOGO_DIR.glob("instance-logo.*"):
        existing.unlink()

    settings = await get_or_create_settings(db)
    settings.custom_logo_url = None
    await db.commit()
    await db.refresh(settings)

    return _build_settings_response(settings)


# Field Definition Endpoints
@router.get("/fields", response_model=List[FieldDefinitionResponse])
async def list_field_definitions(
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db)
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
