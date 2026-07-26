"""
EmailService facade — assembles the email sub-modules into a single class
so all existing callers continue to work without change.

Implementation lives in:
  email/base.py          — send_email, send_email_with_attachment/s, unsubscribe helpers
  email/auth.py          — send_magic_link
  email/net_lifecycle.py — send_net_notification, send_net_invitation, send_net_cancellation
  email/reminders.py     — send_ncs_reminder, send_subscriber_reminder, send_staff_reminder
  email/net_logs.py      — send_net_log, send_ics309_log
  email/digest.py        — send_feedback_email, send_whats_new_email
"""
from app.email.auth import send_magic_link
from app.email.base import (
    get_unsubscribe_footer,
    get_unsubscribe_url,
    send_email,
    send_email_with_attachment,
    send_email_with_attachments,
)
from app.email.digest import send_feedback_email, send_whats_new_email
from app.email.net_lifecycle import (
    send_net_cancellation,
    send_net_invitation,
    send_net_notification,
)
from app.email.net_logs import send_ics309_log, send_net_log
from app.email.reminders import (
    send_ncs_reminder,
    send_staff_reminder,
    send_subscriber_reminder,
)


class EmailService:
    """Namespace class — all methods are module-level functions imported as class attributes."""

    get_unsubscribe_url = staticmethod(get_unsubscribe_url)
    get_unsubscribe_footer = staticmethod(get_unsubscribe_footer)
    send_email = staticmethod(send_email)
    send_email_with_attachment = staticmethod(send_email_with_attachment)
    send_email_with_attachments = staticmethod(send_email_with_attachments)
    send_magic_link = staticmethod(send_magic_link)
    send_net_notification = staticmethod(send_net_notification)
    send_net_invitation = staticmethod(send_net_invitation)
    send_net_cancellation = staticmethod(send_net_cancellation)
    send_ncs_reminder = staticmethod(send_ncs_reminder)
    send_subscriber_reminder = staticmethod(send_subscriber_reminder)
    send_staff_reminder = staticmethod(send_staff_reminder)
    send_net_log = staticmethod(send_net_log)
    send_ics309_log = staticmethod(send_ics309_log)
    send_feedback_email = staticmethod(send_feedback_email)
    send_whats_new_email = staticmethod(send_whats_new_email)
