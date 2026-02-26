"""Contacts router — manage station contacts from check-in history.

Contacts are auto-created when a callsign checks in for the first time.
Admins can edit contacts to fix names, add emails, and send invites.
When a contact creates an account, their user_id is linked here.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models import Contact, User
from app.schemas import ContactCreate, ContactUpdate, ContactResponse
from app.dependencies import get_current_user, get_admin_user

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=List[ContactResponse])
async def list_contacts(
    search: str = None,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List all contacts (admin only). Optional search by callsign, name, or location."""
    query = select(Contact).order_by(Contact.callsign)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Contact.callsign.ilike(search_term)) |
            (Contact.name.ilike(search_term)) |
            (Contact.location.ilike(search_term)) |
            (Contact.email.ilike(search_term))
        )
    
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    contact_data: ContactCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new contact (admin only)."""
    # Check for duplicate callsign
    result = await db.execute(
        select(Contact).where(Contact.callsign == contact_data.callsign)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Contact with callsign {contact_data.callsign} already exists"
        )
    
    # Check if a user already exists with this callsign
    user_result = await db.execute(
        select(User).where(
            (User.callsign == contact_data.callsign) |
            (User.gmrs_callsign == contact_data.callsign)
        )
    )
    matching_user = user_result.scalar_one_or_none()
    
    contact = Contact(
        callsign=contact_data.callsign,
        name=contact_data.name,
        location=contact_data.location,
        email=contact_data.email,
        skywarn_number=contact_data.skywarn_number,
        notes=contact_data.notes,
        user_id=matching_user.id if matching_user else None,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single contact by ID (admin only)."""
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    contact_data: ContactUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a contact (admin only). Supports partial updates."""
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Check for callsign conflicts if callsign is being changed
    update_data = contact_data.model_dump(exclude_unset=True)
    if 'callsign' in update_data and update_data['callsign'] != contact.callsign:
        existing = await db.execute(
            select(Contact).where(Contact.callsign == update_data['callsign'])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Contact with callsign {update_data['callsign']} already exists"
            )
    
    # Apply updates
    for key, value in update_data.items():
        setattr(contact, key, value)
    
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a contact (admin only)."""
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    await db.delete(contact)
    await db.commit()
    return None


@router.post("/{contact_id}/invite", status_code=status.HTTP_200_OK)
async def invite_contact(
    contact_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """Send an invite email to a contact (admin only).
    
    Creates a user account with magic link auth and links the contact.
    """
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    if not contact.email:
        raise HTTPException(status_code=400, detail="Contact has no email address")
    
    if contact.user_id:
        raise HTTPException(status_code=400, detail="Contact already has a linked user account")
    
    # Check if a user with this email already exists
    existing_user = await db.execute(
        select(User).where(User.email == contact.email)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="A user with this email already exists"
        )
    
    # Create user account for the contact
    import secrets
    new_user = User(
        email=contact.email,
        name=contact.name,
        callsign=contact.callsign,
        role="user",
        oauth_provider="magic_link",
        oauth_id=f"magic_{contact.email}",
        is_active=True,
        unsubscribe_token=secrets.token_urlsafe(48),
    )
    db.add(new_user)
    await db.flush()  # Get the new user's ID
    
    # Link the contact to the new user
    contact.user_id = new_user.id
    
    await db.commit()
    await db.refresh(contact)
    
    # Send magic link email for first login
    from app.email_service import EmailService
    from app.config import settings
    
    try:
        # Generate a magic link token
        from app.auth import create_magic_link_token
        token = create_magic_link_token(contact.email)
        
        verify_url = f"{settings.frontend_url}/auth/verify?token={token}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #1976d2; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background-color: #f5f5f5; }}
                .button {{ display: inline-block; padding: 12px 24px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; }}
                .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Welcome to ECTLogger!</h2>
                </div>
                <div class="content">
                    <p>Hi{' ' + contact.name if contact.name else ''},</p>
                    <p>You've been invited to join ECTLogger, the radio net logging platform. 
                    Your callsign <strong>{contact.callsign}</strong> has already been registered.</p>
                    <p>Click the button below to sign in and set up your account:</p>
                    <p style="text-align: center;">
                        <a href="{verify_url}" class="button">Sign In to ECTLogger</a>
                    </p>
                    <p style="font-size: 12px; color: #666;">This link expires in 15 minutes. 
                    You can always request a new one from the login page.</p>
                </div>
                <div class="footer">
                    <p>ECTLogger — Emergency Communications Team Logger</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        await EmailService.send_email(
            contact.email,
            "[ECTLogger] You're Invited!",
            html_content
        )
        
        return {"message": f"Invite sent to {contact.email}", "user_id": new_user.id}
    except Exception as e:
        # User was created but email failed — still return success with warning
        return {
            "message": f"User account created but invite email failed: {str(e)}",
            "user_id": new_user.id,
            "email_error": True
        }
