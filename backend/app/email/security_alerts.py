"""Security alert emails (app/security_alerts.py decides when).

Each one that shows a location credits DB-IP with a link, which the City
Lite database's CC BY 4.0 license requires (app/geoip.py)."""
from datetime import datetime
from typing import List
from urllib.parse import quote

from jinja2 import Template

from app.config import settings
from app.email.base import send_email
from app.geoip import ATTRIBUTION_HTML
from app.logger import logger

_STYLE = """
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 640px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 14px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
"""


def _when(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M UTC")
    return str(value)


async def send_failed_sign_in_alert(to_email: str, account: str, attempts: List[dict], two_factor: bool, to_admin: bool):
    """Failed sign-ins on one account. attempts: dicts with when, what, ip,
    location, browser. The owner's copy says what to do; the admin's copy
    names the account and links to its activity."""
    logger.info("SECURITY_ALERT", f"Failed sign-in alert for {account} to {'admin' if to_admin else 'owner'}")
    template = Template("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
      {% if to_admin %}
        <h2>Failed sign-ins on {{ account }}</h2>
        <p>{% if two_factor %}Someone entered the right password for <strong>{{ account }}</strong> but the wrong two-factor code.{% else %}Someone has repeatedly failed to sign in to <strong>{{ account }}</strong>.{% endif %}</p>
      {% else %}
        <h2>Someone tried to sign in to your {{ app_name }} account</h2>
        {% if two_factor %}
          <p>Someone entered your <strong>correct password</strong> but the wrong two-factor code. If that wasn't you, your password is known to someone else: change it now from Profile &gt; Security.</p>
        {% else %}
          <p>There were several wrong passwords for your account. If that wasn't you, nobody got in, but set a strong password you don't use anywhere else and turn on two-factor authentication from Profile &gt; Security.</p>
        {% endif %}
        <p>If it was you, there is nothing to do.</p>
      {% endif %}
      <table>
        <tr><th>When</th><th>What</th><th>From</th></tr>
        {% for a in attempts %}
        <tr>
          <td>{{ a.when }}</td>
          <td>{{ a.what }}</td>
          <td>{{ a.ip or "Unknown address" }}{% if a.location %}<br>{{ a.location }}{% endif %}{% if a.browser %}<br><span style="color:#666">{{ a.browser }}</span>{% endif %}</td>
        </tr>
        {% endfor %}
      </table>
      {% if to_admin %}<p><a href="{{ activity_url }}">Open the activity log</a></p>{% endif %}
      <div class="footer">
        <p>Locations are approximate. {{ attribution }}</p>
        {% if not to_admin %}<p>If you didn't expect this, contact an administrator of {{ app_name }}.</p>{% endif %}
      </div>
    </div></body></html>
    """)
    html = template.render(
        style=_STYLE, app_name=settings.app_name, account=account, two_factor=two_factor, to_admin=to_admin,
        attempts=[{**a, "when": _when(a["when"])} for a in attempts], attribution=ATTRIBUTION_HTML,
        activity_url=f"{settings.frontend_url}/admin/users?tab=activity",
    )
    subject = (f"Failed sign-ins on {account}" if to_admin
               else f"Someone tried to sign in to your {settings.app_name} account")
    await send_email(to_email=to_email, subject=f"[{settings.app_name}] {subject}", html_content=html)


async def send_muted_often_alert(to_email: str, station: str, user_id: int, people: int, net_wide: int,
                                 nets: List[str], window_days: int):
    """A station muted by many different people. Admins only; personal mutes
    are private, so it gives counts, never who."""
    logger.info("SECURITY_ALERT", f"Mute alert for {station}")
    template = Template("""
    <!DOCTYPE html>
    <html><head><style>{{ style }}</style></head>
    <body><div class="container">
      <h2>{{ station }} has been muted by {{ people }} people</h2>
      <p>In the last {{ window_days }} days, {{ people }} different people have muted <strong>{{ station }}</strong> in chat{% if net_wide %}, including {{ net_wide }} net-wide mute{{ "s" if net_wide != 1 }} by net control{% endif %}.</p>
      {% if nets %}<p>Nets: {{ nets | join(", ") }}</p>{% endif %}
      <p>Personal mutes are private, so this doesn't say who muted them.</p>
      <p><a href="{{ activity_url }}">See {{ station }}'s activity</a></p>
    </div></body></html>
    """)
    html = template.render(
        style=_STYLE, station=station, people=people, net_wide=net_wide, nets=nets, window_days=window_days,
        activity_url=f"{settings.frontend_url}/admin/users?tab=activity&user={user_id}&label={quote(station)}",
    )
    await send_email(to_email=to_email, subject=f"[{settings.app_name}] {station} muted by {people} people",
                     html_content=html)
