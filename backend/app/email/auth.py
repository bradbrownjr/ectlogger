from typing import Optional
from urllib.parse import quote

from app.logger import logger
from jinja2 import Template

from app.config import settings
from app.email.base import send_email

async def send_magic_link(email: str, token: str, expire_days: int = 30, redirect: Optional[str] = None):
    """Send magic link email for authentication.

    redirect: optional path in this app to land on after sign-in. Callers
    pass one already validated by utils.safe_redirect_path.
    """
    logger.info("MAGIC LINK", f"Generating magic link for {email}")
    logger.debug("MAGIC LINK", f"Token: {token[:20]}...{token[-10:]} (truncated)")
    logger.debug("MAGIC LINK", f"Expires in: {expire_days} days")
    
    magic_link = f"{settings.frontend_url}/auth/verify?token={token}"
    if redirect:
        magic_link += f"&redirect={quote(redirect, safe='/')}"
    
    # Format expiration time nicely
    if expire_days == 1:
        expire_text = "24 hours"
    elif expire_days < 1:
        expire_text = f"{int(expire_days * 24)} hours"
    else:
        expire_text = f"{expire_days} days"
    
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #1976d2; 
                color: #ffffff !important; 
                text-decoration: none; 
                border-radius: 4px; 
                margin: 20px 0;
                font-weight: bold;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Sign in to {{ app_name }}</h2>
            <p>Click the button below to sign in to your account.</p>
            <p><strong>This link is valid for {{ expire_text }}.</strong></p>
            <a href="{{ magic_link }}" class="button" style="color: #ffffff;">Sign In</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1976d2;">{{ magic_link }}</p>
            <div class="footer">
                <p>If you didn't request this email, you can safely ignore it.</p>
            </div>
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        app_name=settings.app_name,
        magic_link=magic_link,
        expire_text=expire_text
    )
    
    await send_email(
        to_email=email,
        subject=f"Sign in to {settings.app_name}",
        html_content=html_content
    )


async def send_password_changed(email: str):
    """Notify the account owner their password was changed -- covers both a
    self-service change and an admin-initiated reset. Never includes the new
    password itself; an admin reset returns the one-time temp password only
    in the API response, shown once to the admin performing it."""
    logger.info("PASSWORD", f"Sending password-changed notice to {email}")

    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Your {{ app_name }} password was changed</h2>
            <p>This is a confirmation that the password on your account was just changed.</p>
            <div class="footer">
                <p>If you didn't make this change, contact an administrator right away.</p>
            </div>
        </div>
    </body>
    </html>
    """)

    html_content = html_template.render(app_name=settings.app_name)

    await send_email(
        to_email=email,
        subject=f"Your {settings.app_name} password was changed",
        html_content=html_content
    )


async def send_email_change_notice(old_email: str, new_email: str, by_admin: bool):
    """Notify both sides of a login email change, by an admin (Admin Users
    "Edit User") or by the user (services/account_email.py). The old address
    gets a heads-up in case it wasn't expected, the new address a
    confirmation that it's now the login email."""
    logger.info("EMAIL CHANGE", f"Notifying {old_email} -> {new_email} (by admin: {by_admin})")
    who = "An administrator" if by_admin else "Someone signed in to your account"

    old_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Your {{ app_name }} account email was changed</h2>
            <p>{{ who }} changed the login email on your account from this address to <strong>{{ new_email }}</strong>. Sign-in links sent to this address no longer work for it.</p>
            <div class="footer">
                <p>If this wasn't you, contact an administrator right away.</p>
            </div>
        </div>
    </body>
    </html>
    """)
    await send_email(
        to_email=old_email,
        subject=f"Your {settings.app_name} account email was changed",
        html_content=old_template.render(app_name=settings.app_name, new_email=new_email, who=who)
    )

    new_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>This is now your {{ app_name }} login email</h2>
            <p>{{ who }} set this address as the login email for a {{ app_name }} account (previously {{ old_email }}). Use it going forward to sign in.</p>
            <div class="footer">
                <p>If you weren't expecting this, contact an administrator right away.</p>
            </div>
        </div>
    </body>
    </html>
    """)
    await send_email(
        to_email=new_email,
        subject=f"This is now your {settings.app_name} login email",
        html_content=new_template.render(app_name=settings.app_name, old_email=old_email,
                                         who="An administrator" if by_admin else "You")
    )



async def send_email_change_link(new_email: str, token: str):
    """The confirmation link for a self-service email change, sent to the
    address being added. Nothing changes until it is opened."""
    link = f"{settings.frontend_url}/auth/confirm-email?token={token}"
    logger.info("EMAIL CHANGE", f"Sending confirmation link to {new_email}")
    template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button {
                display: inline-block;
                padding: 12px 24px;
                background-color: #1976d2;
                color: #ffffff !important;
                text-decoration: none;
                border-radius: 4px;
                margin: 20px 0;
                font-weight: bold;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Confirm your new {{ app_name }} email</h2>
            <p>Someone asked to make this the login email for a {{ app_name }} account. Open the link to confirm it.</p>
            <p><strong>This link is valid for 24 hours.</strong></p>
            <a href="{{ link }}" class="button" style="color: #ffffff;">Confirm email</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1976d2;">{{ link }}</p>
            <div class="footer">
                <p>If you didn't ask for this, ignore this email. Nothing changes unless the link is opened.</p>
            </div>
        </div>
    </body>
    </html>
    """)
    await send_email(
        to_email=new_email,
        subject=f"Confirm your new {settings.app_name} email",
        html_content=template.render(app_name=settings.app_name, link=link),
    )
