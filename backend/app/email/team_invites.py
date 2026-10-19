"""Emails for operators added to a schedule by callsign before they sign up.

- send_team_invite: a manager added a callsign to their staff or rotation and
  gave an address to invite it at.
- send_callsign_claimed: an account took over a callsign's entries on a
  schedule; its manager is told, since nothing proves a callsign belongs to
  whoever typed it into their profile.
- send_callsign_claim_held: an account has the callsign, but the manager had
  invited it at a different address, so nothing was taken over.

See app/services/callsign_people.py for when each is sent.
"""

from typing import List, Optional

from jinja2 import Template as JinjaTemplate

from app.config import settings
from app.email.base import send_email
from app.logger import logger

# Schedule names, callsigns and account names are all typed by users, so
# every template here autoescapes (autoescape=True below).
_STYLE = """
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .meta { background-color: #f5f5f5; border-radius: 4px; padding: 12px 16px; margin: 16px 0; }
    .meta p { margin: 4px 0; font-size: 14px; }
    .warn { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 12px 16px; margin: 16px 0; }
    .button { display: inline-block; padding: 10px 20px; background-color: #1565c0; color: #fff !important;
              text-decoration: none; border-radius: 4px; }
    .footer { margin-top: 30px; font-size: 12px; color: #888; }
"""


async def send_team_invite(
    to_email: str,
    callsign: str,
    schedule_name: str,
    inviter_display: str,
    login_url: str,
):
    """Invite an operator a manager has put on a schedule by callsign."""
    html_content = JinjaTemplate("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
        <h2>You're on the team for {{ schedule_name }}</h2>
        <p>{{ inviter_display }} added <strong>{{ callsign }}</strong> to the net control team for
        <strong>{{ schedule_name }}</strong> on {{ app_name }}, the net logger the net uses.</p>
        <p>You don't need an account to be on the team. If you'd like to see the schedule, get
        reminders before your turn, and run the net from the app, sign in with this email address.
        Your callsign is filled in for you, and your place on the team is waiting.</p>
        <p><a class="button" href="{{ login_url }}">Sign in to {{ app_name }}</a></p>
        <div class="footer"><p>If {{ callsign }} isn't your callsign, you can ignore this email.
        Nothing is set up until you sign in.</p></div>
    </div></body></html>
    """, autoescape=True).render(
        style=_STYLE,
        app_name=settings.app_name,
        callsign=callsign,
        schedule_name=schedule_name,
        inviter_display=inviter_display,
        login_url=login_url,
    )
    logger.info("EMAIL", f"Sending team invite for {callsign} ({schedule_name}) to {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"You're on the team for {schedule_name}",
        html_content=html_content,
    )


async def send_callsign_claimed(
    to_email: str,
    callsign: str,
    account_display: str,
    account_email: Optional[str],
    schedule_name: str,
    entries: List[str],
    via_invite: bool,
    scheduler_url: str,
):
    """Tell a schedule's manager an account took over a callsign's entries."""
    html_content = JinjaTemplate("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
        <h2>{{ callsign }} signed up</h2>
        <p><strong>{{ callsign }}</strong> now has an account, and has taken their place on
        <strong>{{ schedule_name }}</strong> ({{ entries | join(', ') }}).</p>
        <div class="meta">
            <p><strong>Account:</strong> {{ account_display }}</p>
            {% if account_email %}<p><strong>Email:</strong> {{ account_email }}</p>{% endif %}
            <p><strong>How:</strong> {% if via_invite %}signed in with the address you invited{% else %}added the callsign to their profile{% endif %}</p>
        </div>
        {% if not via_invite %}
        <div class="warn">If this isn't the operator you meant, remove them from the staff list
        and tell an administrator, who can undo this and close the account.</div>
        {% endif %}
        <p><a class="button" href="{{ scheduler_url }}">Open your schedules</a></p>
        <div class="footer"><p>You're receiving this because you manage {{ schedule_name }}.</p></div>
    </div></body></html>
    """, autoescape=True).render(
        style=_STYLE,
        callsign=callsign,
        account_display=account_display,
        account_email=account_email,
        schedule_name=schedule_name,
        entries=entries,
        via_invite=via_invite,
        scheduler_url=scheduler_url,
    )
    logger.info("EMAIL", f"Sending callsign-claimed notice for {callsign} ({schedule_name}) to {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"{callsign} joined {schedule_name}",
        html_content=html_content,
    )


async def send_callsign_claim_held(
    to_email: str,
    callsign: str,
    account_display: str,
    account_email: Optional[str],
    schedule_name: str,
    scheduler_url: str,
):
    """Tell a manager an account has the callsign they invited elsewhere."""
    html_content = JinjaTemplate("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
        <h2>Check this sign-up for {{ callsign }}</h2>
        <p>An account now has the callsign <strong>{{ callsign }}</strong>, but it signed in with a
        different address from the one you invited for <strong>{{ schedule_name }}</strong>.
        It has not been given their place on your team.</p>
        <div class="meta">
            <p><strong>Account:</strong> {{ account_display }}</p>
            {% if account_email %}<p><strong>Email:</strong> {{ account_email }}</p>{% endif %}
        </div>
        <p>If it is them, open the schedule's Staff dialog and click <strong>Link</strong> next to
        {{ callsign }}. If it isn't, tell an administrator.</p>
        <p><a class="button" href="{{ scheduler_url }}">Open your schedules</a></p>
        <div class="footer"><p>You're receiving this because you manage {{ schedule_name }}.</p></div>
    </div></body></html>
    """, autoescape=True).render(
        style=_STYLE,
        callsign=callsign,
        account_display=account_display,
        account_email=account_email,
        schedule_name=schedule_name,
        scheduler_url=scheduler_url,
    )
    logger.info("EMAIL", f"Sending callsign-claim-held notice for {callsign} ({schedule_name}) to {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"Check this sign-up for {callsign}",
        html_content=html_content,
    )
