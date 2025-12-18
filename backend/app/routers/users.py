from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.models import User, UserRole
from app.schemas import UserResponse, UserUpdate, AdminUserCreate, CallsignLookupResponse
from app.dependencies import get_current_user, get_current_user_optional, get_admin_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile"""
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_my_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's profile"""
    import json
    
    for field, value in user_update.dict(exclude_unset=True).items():
        # Handle callsigns JSON field
        if field == 'callsigns' and value is not None:
            setattr(current_user, field, json.dumps(value))
        else:
            setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.from_orm(current_user)


@router.put("/me/location")
async def update_my_location(
    location_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's live location (grid square).
    
    Called automatically when location_awareness is enabled and GPS position updates.
    This allows NCS to see the user's current location when checking them in.
    Stored separately from the user's default location so GPS doesn't overwrite manual entry.
    """
    from datetime import datetime, UTC
    location = location_data.get('location', '')
    if location:
        current_user.live_location = location.upper()
        current_user.live_location_updated = datetime.now(UTC)
        await db.commit()
    return {"status": "ok", "live_location": current_user.live_location}


@router.get("", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only)"""
    result = await db.execute(
        select(User).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return [UserResponse.from_orm(user) for user in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Create/invite a new user (admin only)"""
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Create the user - they can log in via magic link
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        callsign=user_data.callsign,
        role=user_data.role,
        is_active=True,
        oauth_provider="magic_link",  # Will use magic link auth
        oauth_id=user_data.email,  # Use email as oauth_id for magic link users
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return UserResponse.from_orm(new_user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Get user by ID"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse.from_orm(user)


@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: int,
    role: UserRole,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user role (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = role
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.put("/{user_id}/ban", response_model=UserResponse)
async def ban_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Ban/deactivate user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.put("/{user_id}/unban", response_model=UserResponse)
async def unban_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Unban/activate user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return UserResponse.from_orm(user)


@router.get("/lookup/{callsign}", response_model=CallsignLookupResponse)
async def lookup_by_callsign(
    callsign: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Look up user info by callsign for check-in auto-fill.
    
    Returns limited info (name, location, skywarn_number) if user exists.
    Location is only returned if user has location_awareness enabled.
    """
    callsign_upper = callsign.upper()
    
    # Look up by primary callsign, GMRS callsign, or additional callsigns
    result = await db.execute(
        select(User).where(
            (User.callsign == callsign_upper) | 
            (User.gmrs_callsign == callsign_upper) |
            (User.callsigns.like(f'%"{callsign_upper}"%'))
        )
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # Return empty response instead of 404 - callsign may be valid but unregistered
        return CallsignLookupResponse()
    
    # Prefer live GPS location if available and recent (within 1 hour), otherwise use static default
    from datetime import datetime, UTC, timedelta
    location = None
    if user.live_location and user.live_location_updated:
        age = datetime.now(UTC) - user.live_location_updated.replace(tzinfo=UTC)
        if age < timedelta(hours=1):
            location = user.live_location
    
    # Fall back to static default location if no recent live location
    if not location:
        location = user.location
    
    return CallsignLookupResponse(
        name=user.name,
        location=location,
        skywarn_number=user.skywarn_number
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete user (admin only)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.delete(user)
    await db.commit()
    return None


@router.post("/email-all", status_code=status.HTTP_200_OK)
async def email_all_users(
    email_data: dict,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a platform notice email to all users with email notifications enabled (admin only)"""
    from app.email_service import EmailService
    from jinja2 import Template
    
    subject = email_data.get('subject', '').strip()
    message = email_data.get('message', '').strip()
    
    if not subject or not message:
        raise HTTPException(status_code=400, detail="Subject and message are required")
    
    # Get all active users with email notifications enabled
    result = await db.execute(
        select(User).where(
            User.is_active == True,
            User.email_notifications == True
        )
    )
    users = result.scalars().all()
    
    if not users:
        raise HTTPException(status_code=400, detail="No users with email notifications enabled")
    
    # Create HTML email template
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .message { white-space: pre-wrap; background-color: white; padding: 15px; border-radius: 4px; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>{{ subject }}</h2>
            </div>
            <div class="content">
                <div class="message">{{ message }}</div>
            </div>
            <div class="footer">
                <p>This is a platform notice from ECTLogger.</p>
                <p>You're receiving this because you have email notifications enabled.</p>
            </div>
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(subject=subject, message=message)
    
    # Send emails
    sent_count = 0
    failed_count = 0
    
    for user in users:
        try:
            await EmailService.send_email(user.email, f"[ECTLogger] {subject}", html_content)
            sent_count += 1
        except Exception as e:
            failed_count += 1
            # Log error but continue sending to other users
            print(f"Failed to send email to {user.email}: {e}")
    
    return {
        "sent": sent_count,
        "failed": failed_count,
        "total_recipients": len(users)
    }

