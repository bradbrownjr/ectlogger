from app.logger import logger
from typing import Optional


from app.config import settings
from app.email.base import get_unsubscribe_footer, send_email

async def send_feedback_email(
    to_email: str,
    type_label: str,
    subject: str,
    body: str,
    submitter_callsign: Optional[str],
    submitter_name: Optional[str],
    submitter_email: str,
):
    """Send an in-app feedback submission to an admin user."""
    from jinja2 import Template as JinjaTemplate

    color = "#d32f2f" if type_label == "Bug Report" else "#1565c0"
    emoji = "🐛" if type_label == "Bug Report" else "💡"

    display_name = submitter_callsign or submitter_name or submitter_email
    if submitter_name and submitter_callsign:
        display_name = f"{submitter_callsign} — {submitter_name}"

    html_template = JinjaTemplate("""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .badge {
                display: inline-block;
                padding: 4px 12px;
                background-color: {{ color }};
                color: #fff;
                border-radius: 12px;
                font-size: 13px;
                font-weight: bold;
                margin-bottom: 16px;
            }
            .meta { background-color: #f5f5f5; border-radius: 4px; padding: 12px 16px; margin: 16px 0; }
            .meta p { margin: 4px 0; font-size: 14px; }
            .body-box {
                background-color: #fafafa;
                border-left: 4px solid {{ color }};
                padding: 12px 16px;
                margin: 16px 0;
                white-space: pre-wrap;
                font-size: 14px;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #888; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>{{ emoji }} New {{ type_label }} — {{ app_name }}</h2>
            <div class="badge">{{ type_label }}</div>
            <h3>{{ subject }}</h3>
            <div class="meta">
                <p><strong>From:</strong> {{ display_name }}</p>
                <p><strong>Email:</strong> {{ submitter_email }}</p>
            </div>
            <div class="body-box">{{ body }}</div>
            <div class="footer">
                <p>Submitted via the in-app feedback form on {{ app_name }}.</p>
                <p>Reply directly to this email to follow up with the submitter.</p>
            </div>
        </div>
    </body>
    </html>
    """)

    html_content = html_template.render(
        emoji=emoji,
        type_label=type_label,
        subject=subject,
        body=body,
        display_name=display_name,
        submitter_email=submitter_email,
        color=color,
        app_name=settings.app_name,
    )

    logger.info("EMAIL", f"Sending feedback notification to admin {to_email}")
    await send_email(
        to_email=to_email,
        subject=f"{emoji} [{type_label}] {subject} — {settings.app_name}",
        html_content=html_content,
    )

async def send_whats_new_email(to_email: str, unsubscribe_token: Optional[str],
                                digest_date_label: str,
                                entries: list):
    """Send the daily "What's New in ECTLogger" digest email.

    ``entries`` is a list of changelog entry dicts (matching changelog.json
    shape) covering changes from a single calendar day. ``digest_date_label``
    is the human-readable date already formatted in the user's locale.
    """
    # Build sections HTML per type for visual grouping
    type_styles = {
        'feature':     {'label': 'New Features',  'color': '#2e7d32', 'emoji': '✨'},
        'improvement': {'label': 'Improvements',  'color': '#0288d1', 'emoji': '🔧'},
        'bugfix':      {'label': 'Bug Fixes',     'color': '#ed6c02', 'emoji': '🐛'},
        'fix':         {'label': 'Bug Fixes',     'color': '#ed6c02', 'emoji': '🐛'},
        'branding':    {'label': 'Branding',      'color': '#7b1fa2', 'emoji': '🎨'},
    }

    # Collect sections from all entries, merging same-type + same-title sections
    # so each category heading appears exactly once in the email.
    type_priority = {'feature': 0, 'improvement': 1, 'bugfix': 2, 'fix': 2, 'branding': 3}
    section_order: list = []
    merged: dict = {}
    for entry in entries:
        for section in entry.get('sections', []):
            norm_type = 'fix' if section.get('type') == 'bugfix' else section.get('type', 'improvement')
            key = (norm_type, section.get('title', ''))
            if key in merged:
                merged[key]['items'].extend(section.get('items', []))
            else:
                merged[key] = {
                    'title': section.get('title', ''),
                    'type': section.get('type', 'improvement'),
                    'items': list(section.get('items', [])),
                }
                section_order.append(key)
    all_sections = sorted(
        [merged[k] for k in section_order],
        key=lambda s: type_priority.get(s.get('type', 'improvement'), 1),
    )

    sections_html_parts = []
    for section in all_sections:
        style = type_styles.get(section.get('type', 'improvement'),
                                type_styles['improvement'])
        items_html = ''.join(
            f'<li style="margin-bottom: 8px;">{item.get("text", "")}</li>'
            for item in section.get('items', [])
        )
        sections_html_parts.append(f'''
        <div style="margin-bottom: 24px;">
            <h3 style="color: {style['color']}; margin: 0 0 8px 0; font-size: 16px;">
                {style['emoji']} {section.get('title', style['label'])}
            </h3>
            <ul style="margin: 0; padding-left: 24px; color: #333;">
                {items_html}
            </ul>
        </div>
        ''')
    sections_html = ''.join(sections_html_parts)

    unsubscribe_footer = get_unsubscribe_footer(
        unsubscribe_token, list_name="whats_new", list_label="What's New"
    )

    html_content = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
                      color: #fff; padding: 24px; border-radius: 8px 8px 0 0;
                      text-align: center; }}
            .header h1 {{ margin: 0; font-size: 22px; }}
            .header p {{ margin: 4px 0 0 0; opacity: 0.95; font-size: 14px; }}
            .body {{ background: #fff; border: 1px solid #e0e0e0; border-top: none;
                    padding: 24px; border-radius: 0 0 8px 8px; }}
            .cta {{ display: inline-block; padding: 10px 20px; background-color: #1976d2;
                   color: #fff !important; text-decoration: none; border-radius: 4px;
                   margin-top: 8px; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✨ What's New in {settings.app_name}</h1>
                <p>Updates from {digest_date_label}</p>
            </div>
            <div class="body">
                {sections_html}
                <p style="margin-top: 24px; text-align: center;">
                    <a href="{settings.frontend_url}" class="cta" style="color: #fff;">Open {settings.app_name}</a>
                </p>
            </div>
            {unsubscribe_footer}
        </div>
    </body>
    </html>
    '''

    await send_email(
        to_email=to_email,
        subject=f"✨ What's New in {settings.app_name} — {digest_date_label}",
        html_content=html_content,
        unsubscribe_token=unsubscribe_token,
        unsubscribe_list="whats_new",
    )
