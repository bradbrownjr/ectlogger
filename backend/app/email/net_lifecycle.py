from app.logger import logger
from typing import List

from jinja2 import Template

from app.config import settings
from app.email.base import get_unsubscribe_footer, send_email

async def send_net_notification(emails: List[str], net_name: str, net_id: int, unsubscribe_tokens: dict = None):
    """Send notification that a net has started, with magic link for instant login
    
    Args:
        emails: List of email addresses to notify
        net_name: Name of the net
        net_id: ID of the net
        unsubscribe_tokens: Optional dict mapping email -> unsubscribe_token
    """
    from app.auth import create_magic_link_token
    
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; 
                     color: #ffffff !important; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
            .alert { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; }
            .info { font-size: 12px; color: #666; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="28" height="28" style="vertical-align:middle;margin-right:6px"><circle cx="100" cy="100" r="92" fill="white" stroke="#1a6b2e" stroke-width="9"/><circle cx="100" cy="100" r="68" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="47" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><circle cx="100" cy="100" r="26" fill="none" stroke="#b2dfb2" stroke-width="1.5"/><line x1="100" y1="165" x2="100" y2="38" stroke="#90a4ae" stroke-width="4.5" stroke-linecap="round"/><line x1="88" y1="58" x2="112" y2="58" stroke="#90a4ae" stroke-width="3" stroke-linecap="round"/><line x1="84" y1="74" x2="116" y2="74" stroke="#78909c" stroke-width="2.5" stroke-linecap="round"/><circle cx="100" cy="38" r="5.5" fill="#4caf50"/><circle cx="152" cy="72" r="5.5" fill="#4caf50"/><circle cx="56" cy="62" r="5.5" fill="#4caf50"/><circle cx="48" cy="138" r="5.5" fill="#4caf50"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#2e7d32" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M 52 112 L 84 148 L 162 58" fill="none" stroke="#43a047" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg> Net Active: {{ net_name }}</h2>
            <div class="alert">
                <strong>A net you're subscribed to has started!</strong>
            </div>
            <p>The <strong>{{ net_name }}</strong> net is now active and ready for check-ins.</p>
            <a href="{{ join_url }}" class="button" style="color: #ffffff;">Join Net</a>
            <p>Click the button above to view the net and check in. You'll be automatically signed in.</p>
            <p class="info">This link is unique to you and will sign you in automatically. Do not share it.</p>
            
            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)
    
    unsubscribe_tokens = unsubscribe_tokens or {}
    
    for email in emails:
        try:
            # Generate a magic link token for this user
            token = create_magic_link_token(email)
            # URL that logs them in and redirects to the net
            join_url = f"{settings.frontend_url}/auth/verify?token={token}&redirect=/nets/{net_id}"
            
            # Get unsubscribe token for this email
            unsub_token = unsubscribe_tokens.get(email)
            
            html_content = html_template.render(
                net_name=net_name,
                join_url=join_url,
                unsubscribe_footer=get_unsubscribe_footer(unsub_token)
            )
            
            await send_email(
                to_email=email,
                subject=f"📻 Net Active: {net_name}",
                html_content=html_content,
                unsubscribe_token=unsub_token
            )
        except Exception as e:
            print(f"Failed to send notification to {email}: {e}")

async def send_net_invitation(email: str, net_name: str, net_id: int, inviter_name: str):
    """Send invitation to join a net"""
    invite_url = f"{settings.frontend_url}/nets/{net_id}/accept-invitation"
    
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; 
                     color: #ffffff !important; text-decoration: none; border-radius: 4px; margin: 20px 0; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>You're Invited to Join a Net</h2>
            <p><strong>{{ inviter_name }}</strong> has invited you to join the <strong>{{ net_name }}</strong> net.</p>
            <p>Accept this invitation to receive notifications when this net starts.</p>
            <a href="{{ invite_url }}" class="button" style="color: #ffffff;">Accept Invitation</a>
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        net_name=net_name,
        invite_url=invite_url,
        inviter_name=inviter_name
    )
    
    await send_email(
        to_email=email,
        subject=f"Invitation to join {net_name}",
        html_content=html_content
    )

async def send_net_cancellation(
    to_email: str,
    recipient_name: str,
    recipient_callsign: str,
    net_name: str,
    net_date: str,
    net_time: str,
    reason: str | None,
    is_ncs: bool = False,
    scheduler_url: str = None,
    unsubscribe_token: str = None
):
    """Send net cancellation notification"""
    logger.info("EMAIL", f"Sending cancellation notice to {to_email} for {net_name} on {net_date}")
    
    if is_ncs:
        subject_prefix = "🚫 NCS Duty Cancelled"
        intro_text = """This is to inform you that your NCS duty has been cancelled 
        for the following net session. You are no longer required to run this net."""
    else:
        subject_prefix = "🚫 Net Cancelled"
        intro_text = """This is to inform you that a net you are subscribed to has been cancelled."""
    
    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .details { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .reason { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; }
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
            <h2>{{ subject_prefix }}</h2>
            
            <div class="alert">
                <strong>The following net has been cancelled.</strong>
            </div>
            
            <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>
            
            <p>{{ intro_text }}</p>
            
            <div class="details">
                <h3>Cancelled Net Details</h3>
                <p><strong>Net:</strong> {{ net_name }}</p>
                <p><strong>Original Date:</strong> {{ net_date }}</p>
                <p><strong>Original Time:</strong> {{ net_time }}</p>
            </div>
            
            {% if reason %}
            <div class="reason">
                <strong>Reason:</strong> {{ reason }}
            </div>
            {% endif %}
            
            {% if scheduler_url %}
            <a href="{{ scheduler_url }}" class="button" style="color: #ffffff;">View Schedule</a>
            {% endif %}
            
            <div class="footer">
                <p>This is an automated notification from {{ app_name }}.</p>
            </div>
            
            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)
    
    html_content = html_template.render(
        subject_prefix=subject_prefix,
        recipient_name=recipient_name,
        recipient_callsign=recipient_callsign,
        net_name=net_name,
        net_date=net_date,
        net_time=net_time,
        reason=reason,
        intro_text=intro_text,
        scheduler_url=scheduler_url,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token)
    )
    
    await send_email(
        to_email=to_email,
        subject=f"{subject_prefix}: {net_name} - {net_date}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token
    )

