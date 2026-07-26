from app.logger import logger
from jinja2 import Template

from app.config import settings
from app.email.base import send_email

async def send_magic_link(email: str, token: str, expire_days: int = 30):
    """Send magic link email for authentication"""
    logger.info("MAGIC LINK", f"Generating magic link for {email}")
    logger.debug("MAGIC LINK", f"Token: {token[:20]}...{token[-10:]} (truncated)")
    logger.debug("MAGIC LINK", f"Expires in: {expire_days} days")
    
    magic_link = f"{settings.frontend_url}/auth/verify?token={token}"
    
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

