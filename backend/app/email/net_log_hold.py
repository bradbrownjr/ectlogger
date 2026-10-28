"""Reminder that a closed net's log is still waiting to be sent.

Sent once a day to the net's managers while the net is closed with "finish
the log later" (Net.log_held_since). See services/net_log_hold.py.

With ncs_needed it is instead the one email sent when auto-close held the
log because nobody would be credited as NCS: it asks who ran the net, and
says when the log goes out without one.
"""
from jinja2 import Template

from app.config import settings
from app.email.base import get_unsubscribe_footer, send_email
from app.logger import logger

_TEMPLATE = Template("""
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .alert { background-color: #fff8e1; border-left: 4px solid #f9a825; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #1976d2;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
        }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        {% if ncs_needed %}
        <h2>Who ran this net?</h2>

        <div class="alert">
            <strong>{{ net_name }}</strong> closed itself on {{ closed_on }} after a quiet spell, and no NCS is recorded for it.
        </div>

        <p>Hello {{ recipient_name }},</p>

        <p>The log is on hold so the right operator is credited as NCS. Open the net, click
        <strong>Send the log</strong>, and choose who ran it from the stations checked in.
        If nobody does, the log is sent on {{ send_on }} with NCS: Not recorded.</p>
        {% else %}
        <h2>Net log waiting to be sent</h2>

        <div class="alert">
            <strong>{{ net_name }}</strong> closed on {{ closed_on }}, and its log hasn't been sent yet.
        </div>

        <p>Hello {{ recipient_name }},</p>

        <p>The net was closed to finish its log. Its report is marked as a draft, and the net can't be
        archived until the log goes out. When the log is complete, open the net and click
        <strong>Send the log</strong>. Stations, subscribers and net control then get the closing email.</p>
        {% endif %}

        <p><a href="{{ net_url }}" class="button" style="color: #ffffff;">Open the net</a></p>

        <div class="footer">
            {% if not ncs_needed %}<p>{{ app_name }} sends this reminder each day until the log is sent.</p>{% endif %}
        </div>

        {{ unsubscribe_footer }}
    </div>
</body>
</html>
""", autoescape=True)


async def send_log_hold_reminder(
    to_email: str,
    recipient_name: str,
    net_name: str,
    closed_on: str,
    net_url: str,
    unsubscribe_token: str = None,
    ncs_needed: bool = False,
    send_on: str = None,
):
    logger.info("EMAIL", f"Sending held-log {'NCS question' if ncs_needed else 'reminder'} to {to_email} for {net_name}")
    from markupsafe import Markup
    html_content = _TEMPLATE.render(
        recipient_name=recipient_name,
        net_name=net_name,
        closed_on=closed_on,
        net_url=net_url,
        ncs_needed=ncs_needed,
        send_on=send_on,
        app_name=settings.app_name,
        unsubscribe_footer=Markup(get_unsubscribe_footer(unsubscribe_token)),
    )
    await send_email(
        to_email=to_email,
        subject=f"Who ran {net_name}?" if ncs_needed else f"Net log waiting to be sent: {net_name}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token,
    )
