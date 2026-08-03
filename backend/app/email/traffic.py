"""
Email templates for Assisted Traffic Handling's reminder ladder (D4).

Three shapes:
  - send_traffic_reminder: the normal escalating "you're still holding this"
    nudge (stages 1-3 of the precedence ladder, or stage 1 of an HXB(n)
    override).
  - send_traffic_hxb_final_notice: the HXB(n) hard "cancel and notify origin"
    prompt at n hours, replacing what would otherwise be a fourth reminder.
  - send_traffic_stale_digest: the opt-in weekly digest of stale traffic to
    a schedule's manager (net_templates.traffic_escalation_digest).

All three link straight to the form's log-entry view (``/traffic?id={id}``,
the deep-link param Traffic.tsx already reads), never to a yes/no action --
per D4/R3, the obvious next step is always "log what happened."
"""
from jinja2 import Template

from app.config import settings
from app.email.base import get_unsubscribe_footer, send_email
from app.logger import logger


def _traffic_url(form_id: int) -> str:
    return f"{settings.frontend_url}/traffic?id={form_id}"


async def send_traffic_reminder(
    to_email: str,
    recipient_name: str,
    recipient_callsign: str,
    form_id: int,
    form_subject: str,
    message_number: str,
    precedence: str,
    held_hours: float,
    stage: int,
    unsubscribe_token: str = None,
):
    """Escalating reminder that *recipient* is still holding a piece of traffic.

    ``stage`` is 1-based within whichever ladder applied (the default
    three-stage precedence ladder, or stage 1 of an HXB(n) override -- stage
    2 of an HXB override is the harder send_traffic_hxb_final_notice below,
    not this function).
    """
    logger.info("EMAIL", f"Sending traffic reminder (stage {stage}) to {to_email} for form {form_id}")

    form_url = _traffic_url(form_id)
    held_display = f"{held_hours:.0f} hours" if held_hours >= 2 else f"{held_hours * 60:.0f} minutes"

    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .details { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .button {
                display: inline-block;
                padding: 12px 24px;
                background-color: #1976d2;
                color: #ffffff !important;
                text-decoration: none;
                border-radius: 4px;
                font-weight: bold;
                margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>&#128251; Traffic Reminder</h2>

            <div class="alert">
                <strong>You've been holding a piece of traffic for about {{ held_display }}.</strong>
            </div>

            <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>

            <p>This is a gentle reminder to relay or deliver the following message, or log what
            you've already done with it so this reminder stops.</p>

            <div class="details">
                {% if message_number %}<p><strong>Message:</strong> NR {{ message_number }}</p>{% endif %}
                <p><strong>Subject:</strong> {{ form_subject }}</p>
                {% if precedence %}<p><strong>Precedence:</strong> {{ precedence }}</p>{% endif %}
            </div>

            <a href="{{ form_url }}" class="button" style="color: #ffffff;">Log This Traffic</a>

            <div class="footer">
                <p>This is an automated reminder from {{ app_name }}.</p>
                <p>You can disable traffic reminders in your profile settings.</p>
            </div>

            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)

    html_content = html_template.render(
        recipient_name=recipient_name,
        recipient_callsign=recipient_callsign,
        message_number=message_number,
        form_subject=form_subject,
        precedence=precedence,
        held_display=held_display,
        form_url=form_url,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token),
    )

    await send_email(
        to_email=to_email,
        subject=f"Traffic Reminder: NR {message_number} still pending" if message_number else "Traffic Reminder: message still pending",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token,
    )


async def send_traffic_hxb_final_notice(
    to_email: str,
    recipient_name: str,
    recipient_callsign: str,
    form_id: int,
    form_subject: str,
    message_number: str,
    hxb_hours: int,
    unsubscribe_token: str = None,
):
    """The HXB(n) hard prompt at n hours: cancel and notify origin, not a nudge.

    This replaces what would otherwise be a third reminder -- HXB explicitly
    instructs cancellation past the deadline, so the email says that plainly
    instead of asking the operator to keep waiting.
    """
    logger.info("EMAIL", f"Sending HXB({hxb_hours}) final notice to {to_email} for form {form_id}")

    form_url = _traffic_url(form_id)

    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .details { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .button {
                display: inline-block;
                padding: 12px 24px;
                background-color: #d32f2f;
                color: #ffffff !important;
                text-decoration: none;
                border-radius: 4px;
                font-weight: bold;
                margin: 20px 0;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>&#128251; HXB({{ hxb_hours }}) Deadline Reached</h2>

            <div class="alert">
                <strong>This message's HXB({{ hxb_hours }}) handling instructions have expired.</strong>
            </div>

            <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>

            <p>HXB({{ hxb_hours }}) means: cancel this message if it hasn't been delivered within
            {{ hxb_hours }} hours, and notify the originating station. That deadline has now passed.</p>

            <div class="details">
                {% if message_number %}<p><strong>Message:</strong> NR {{ message_number }}</p>{% endif %}
                <p><strong>Subject:</strong> {{ form_subject }}</p>
            </div>

            <p>Please cancel the message and notify the origin, or log a delivery if it went through
            without the log being updated.</p>

            <a href="{{ form_url }}" class="button" style="color: #ffffff;">Log This Traffic</a>

            <div class="footer">
                <p>This is an automated reminder from {{ app_name }}.</p>
                <p>You can disable traffic reminders in your profile settings.</p>
            </div>

            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)

    html_content = html_template.render(
        recipient_name=recipient_name,
        recipient_callsign=recipient_callsign,
        message_number=message_number,
        form_subject=form_subject,
        hxb_hours=hxb_hours,
        form_url=form_url,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token),
    )

    await send_email(
        to_email=to_email,
        subject=f"HXB({hxb_hours}) Deadline: NR {message_number}" if message_number else f"HXB({hxb_hours}) Deadline Reached",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token,
    )


async def send_traffic_stale_digest(
    to_email: str,
    recipient_name: str,
    recipient_callsign: str,
    template_name: str,
    stale_forms: list,
    unsubscribe_token: str = None,
):
    """Weekly digest of stale traffic for a template's manager (opt-in).

    ``stale_forms`` is a list of dicts: {id, subject, message_number, held_hours}.
    Passive escalation by design (D4) -- this is the only email a manager gets
    about traffic they aren't personally holding; everything else is the
    "Outstanding traffic" badge in the per-net traffic panel.
    """
    logger.info("EMAIL", f"Sending traffic stale digest to {to_email} for {template_name} ({len(stale_forms)} item(s))")

    rows = ""
    for f in stale_forms:
        rows += (
            f"<li><a href=\"{_traffic_url(f['id'])}\">"
            f"{'NR ' + f['message_number'] if f.get('message_number') else 'Message'} - "
            f"{f.get('subject') or 'Untitled'}</a> "
            f"(held {f['held_hours']:.0f}h)</li>"
        )
    if not rows:
        rows = "<li>None</li>"

    html_template = Template("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; }
            ul { margin: 10px 0; padding-left: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>&#128251; Weekly Stale Traffic Digest</h2>

            <div class="alert">
                <strong>{{ template_name }}</strong> has traffic past its final reminder stage
                with no new activity logged.
            </div>

            <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>

            <p>You opted in to this weekly digest for {{ template_name }}. The following items
            are stale -- past the last reminder stage in their ladder with no newer log entry:</p>

            <ul>
                {{ rows }}
            </ul>

            <div class="footer">
                <p>This is an automated weekly digest from {{ app_name }}.</p>
                <p>You can turn this off from the schedule's settings.</p>
            </div>

            {{ unsubscribe_footer }}
        </div>
    </body>
    </html>
    """)

    html_content = html_template.render(
        recipient_name=recipient_name,
        recipient_callsign=recipient_callsign,
        template_name=template_name,
        rows=rows,
        app_name=settings.app_name,
        unsubscribe_footer=get_unsubscribe_footer(unsubscribe_token),
    )

    await send_email(
        to_email=to_email,
        subject=f"Weekly Stale Traffic Digest: {template_name}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token,
    )
