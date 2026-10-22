"""Email for a shared-frequency change request.

Someone who may not change or delete a frequency themselves (another person
added it, or another net already uses it; see
routers/frequencies.py::change_refusal) can ask the admins from the net or
schedule form. Like the early access request it goes by private email to
every admin, never to the public feedback tracker, since it carries the
requester's email address.
"""

from typing import List, Optional

from jinja2 import Template as JinjaTemplate

from app.config import settings
from app.email.base import send_email
from app.email.schedule_access import _STYLE
from app.logger import logger


async def send_frequency_change_request(
    to_email: str,
    requester_display: str,
    requester_email: str,
    action: str,
    current: str,
    proposed: Optional[str],
    reason: str,
    uses: Optional[str],
    net_names: List[str],
    schedule_names: List[str],
    note: Optional[str],
):
    """Ask an admin to edit or delete one shared frequency."""
    # autoescape: the note, names and frequency text are all user-typed.
    html_content = JinjaTemplate("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
        <h2>Frequency {{ 'deletion' if action == 'delete' else 'change' }} request</h2>
        <p><strong>{{ requester_display }}</strong> is asking for a shared frequency on {{ app_name }} to be
        {{ 'deleted' if action == 'delete' else 'changed' }}.</p>
        <div class="meta">
            <p><strong>Frequency:</strong> {{ current }}</p>
            {% if proposed %}<p><strong>Change it to:</strong> {{ proposed }}</p>{% endif %}
            <p><strong>Why they couldn't:</strong> {{ reason }}</p>
            {% if uses %}<p><strong>Used by:</strong> {{ uses }}</p>{% endif %}
            {% if net_names %}<p><strong>Nets:</strong> {{ net_names | join(', ') }}</p>{% endif %}
            {% if schedule_names %}<p><strong>Schedules:</strong> {{ schedule_names | join(', ') }}</p>{% endif %}
            <p><strong>Email:</strong> {{ requester_email }}</p>
        </div>
        {% if note %}<div class="body-box">{{ note }}</div>{% endif %}
        <p>A change made in the Frequencies tab applies to every net and schedule using this frequency.</p>
        <p><a class="button" href="{{ admin_url }}">Open the Frequencies tab</a></p>
        <div class="footer"><p>Reply to {{ requester_email }} directly to follow up with them.</p></div>
    </div></body></html>
    """, autoescape=True).render(
        style=_STYLE,
        app_name=settings.app_name,
        requester_display=requester_display,
        requester_email=requester_email,
        action=action,
        current=current,
        proposed=proposed,
        reason=reason,
        uses=uses,
        net_names=net_names,
        schedule_names=schedule_names,
        note=note,
        admin_url=f"{settings.frontend_url}/admin/users?tab=frequencies",
    )

    verb = "deletion" if action == "delete" else "change"
    logger.info("EMAIL", f"Sending frequency {verb} request from {requester_display} to admin {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"Frequency {verb} request from {requester_display} — {settings.app_name}",
        html_content=html_content,
    )
