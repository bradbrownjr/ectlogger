"""Emails for the schedule-creation early access request.

A user who doesn't yet meet the schedule-creation requirements (account age,
net participation; see routers/templates_core.py) can ask the admins for early
access from the refusal dialog. This goes by private email to every admin,
never to the public GitHub tracker the feedback form uses, since it carries
the requester's email address and history. The requester hears back when an
admin grants it from the Users tab (routers/users.py::set_schedule_age_bypass).
"""

from typing import Optional

from app.config import settings
from app.email.base import send_email
from app.logger import logger

_STYLE = """
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .meta { background-color: #f5f5f5; border-radius: 4px; padding: 12px 16px; margin: 16px 0; }
    .meta p { margin: 4px 0; font-size: 14px; }
    .body-box { background-color: #fafafa; border-left: 4px solid #1565c0; padding: 12px 16px;
                margin: 16px 0; white-space: pre-wrap; font-size: 14px; }
    .button { display: inline-block; padding: 10px 20px; background-color: #1565c0; color: #fff !important;
              text-decoration: none; border-radius: 4px; }
    .footer { margin-top: 30px; font-size: 12px; color: #888; }
"""


async def send_early_access_request(
    to_email: str,
    requester_display: str,
    requester_email: str,
    account_age_days: int,
    min_age_days: int,
    nets_participated: int,
    min_participations: int,
    note: Optional[str],
):
    """Ask an admin to grant a user early access to schedule creation."""
    from jinja2 import Template as JinjaTemplate

    html_content = JinjaTemplate("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
        <h2>Early access request</h2>
        <p><strong>{{ requester_display }}</strong> is asking for early access to create schedules on {{ app_name }}.</p>
        <div class="meta">
            <p><strong>Email:</strong> {{ requester_email }}</p>
            <p><strong>Account age:</strong> {{ account_age_days }} day(s) (requirement: {{ min_age_days }})</p>
            <p><strong>Nets attended:</strong> {{ nets_participated }} (requirement: {{ min_participations }})</p>
        </div>
        {% if note %}<div class="body-box">{{ note }}</div>{% endif %}
        <p>To grant it, open the Users tab, click the timer button on their row, and they will be emailed that they can go ahead. Click their callsign there to see their net history first.</p>
        <p><a class="button" href="{{ admin_url }}">Open the Users tab</a></p>
        <div class="footer"><p>Reply to {{ requester_email }} directly to follow up with them.</p></div>
    </div></body></html>
    """).render(
        style=_STYLE,
        app_name=settings.app_name,
        requester_display=requester_display,
        requester_email=requester_email,
        account_age_days=account_age_days,
        min_age_days=min_age_days,
        nets_participated=nets_participated,
        min_participations=min_participations,
        note=note,
        admin_url=f"{settings.frontend_url}/admin/users?tab=users",
    )

    logger.info("EMAIL", f"Sending early access request from {requester_display} to admin {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"Early access request from {requester_display} — {settings.app_name}",
        html_content=html_content,
    )


async def send_early_access_granted(to_email: str):
    """Tell a user an admin granted them early access to schedule creation."""
    from jinja2 import Template as JinjaTemplate

    html_content = JinjaTemplate("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
        <h2>You can now create schedules</h2>
        <p>An administrator has granted you early access on {{ app_name }}. You can create a net schedule now.</p>
        <p><a class="button" href="{{ create_url }}">Create a schedule</a></p>
    </div></body></html>
    """).render(
        style=_STYLE,
        app_name=settings.app_name,
        create_url=f"{settings.frontend_url}/scheduler/create",
    )

    logger.info("EMAIL", f"Sending early access granted notice to {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"You can now create schedules — {settings.app_name}",
        html_content=html_content,
    )
