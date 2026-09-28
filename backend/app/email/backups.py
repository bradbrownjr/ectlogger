"""Backup alerts to every active admin: a failed backup, no successful backup
for too long, and a full backup being downloaded."""
from typing import Optional

from jinja2 import Template

from app.config import settings
from app.email.base import send_email
from app.logger import logger

_TEMPLATE = Template("""
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .detail { background: #f5f5f5; border-left: 4px solid {{ accent }}; padding: 12px 16px; margin: 16px 0; white-space: pre-wrap; font-family: monospace; font-size: 13px; }
        .button { display: inline-block; padding: 10px 20px; background: #1976d2; color: #fff !important; text-decoration: none; border-radius: 4px; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h2>{{ heading }}</h2>
        {% for paragraph in paragraphs %}<p>{{ paragraph }}</p>{% endfor %}
        {% if detail %}<div class="detail">{{ detail }}</div>{% endif %}
        <p><a class="button" href="{{ admin_url }}">Open Admin &gt; Backups</a></p>
        <div class="footer">
            <p>Sent to every administrator of {{ app_name }}.</p>
        </div>
    </div>
</body>
</html>
""")


async def _send_to_admins(recipients: list[str], subject: str, heading: str,
                          paragraphs: list[str], detail: Optional[str], accent: str) -> None:
    html = _TEMPLATE.render(
        heading=heading, paragraphs=paragraphs, detail=detail, accent=accent,
        app_name=settings.app_name, admin_url=f"{settings.frontend_url}/admin?tab=backups",
    )
    for address in recipients:
        try:
            await send_email(to_email=address, subject=subject, html_content=html)
        except Exception as exc:
            logger.error("BACKUP", f"Could not send backup alert to {address}: {exc}")


async def send_backup_failed(recipients: list[str], status: str, started_at: str,
                             detail: str) -> None:
    if status == "partial":
        subject = f"{settings.app_name}: backup made, but an off-site copy failed"
        heading = "An off-site backup copy failed"
        paragraphs = [
            f"The backup that started {started_at} was made and kept on the server, "
            "but at least one off-site copy did not arrive.",
        ]
    else:
        subject = f"{settings.app_name}: backup failed"
        heading = "A backup failed"
        paragraphs = [f"The backup that started {started_at} did not complete. No new backup was made."]
    paragraphs.append("The next scheduled backup will try again. You can also run one now from the admin panel.")
    await _send_to_admins(recipients, subject, heading, paragraphs, detail, "#d32f2f")


async def send_backup_overdue(recipients: list[str], last_success: Optional[str],
                              scheduler_note: Optional[str]) -> None:
    since = f"The last successful backup was {last_success}." if last_success else \
        "There has been no successful backup since backups were turned on."
    paragraphs = [since]
    if scheduler_note:
        paragraphs.append(scheduler_note)
    paragraphs.append("You will not get this email again until a backup succeeds.")
    await _send_to_admins(
        recipients, f"{settings.app_name}: no recent backup",
        "Backups are overdue", paragraphs, None, "#ed6c02",
    )


async def send_backup_downloaded(recipients: list[str], who: str, filename: str,
                                 ip: Optional[str]) -> None:
    paragraphs = [
        f"{who} downloaded the backup {filename} from the admin panel"
        + (f" (from {ip})." if ip else "."),
        "The file is encrypted and needs the backup passphrase to open. If this "
        "download wasn't expected, check who has admin access.",
    ]
    await _send_to_admins(
        recipients, f"{settings.app_name}: a backup was downloaded",
        "A backup was downloaded", paragraphs, None, "#1976d2",
    )
