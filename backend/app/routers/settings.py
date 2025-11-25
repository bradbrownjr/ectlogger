from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from app.database import get_db
from app.models import AppSettings, User, UserRole
from app.schemas import AppSettingsResponse, AppSettingsUpdate
from app.auth import get_current_user

router = APIRouter(prefix="/settings", tags=["settings"])


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
