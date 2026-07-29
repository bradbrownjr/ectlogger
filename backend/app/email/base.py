from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from app.config import settings
from app.logger import logger

def get_unsubscribe_url(unsubscribe_token: str, list_name: Optional[str] = None) -> str:
    """Generate the unsubscribe URL for a user.

    When ``list_name`` is provided the URL targets a per-list opt-out
    (e.g. ``?list=whats_new``) instead of the master switch.
    """
    base = f"{settings.frontend_url}/unsubscribe?token={unsubscribe_token}"
    if list_name:
        base += f"&list={list_name}"
    return base

def get_unsubscribe_footer(unsubscribe_token: str, list_name: Optional[str] = None,
                            list_label: Optional[str] = None) -> str:
    """Generate HTML footer with unsubscribe link for email compliance.

    ``list_name`` / ``list_label`` together render a per-list unsubscribe
    link (e.g. "Unsubscribe from What's New emails") in addition to the
    regular profile-settings link. Falls back to the master unsubscribe
    when ``list_name`` is None.
    """
    if not unsubscribe_token:
        return ""
    if list_name:
        unsubscribe_url = get_unsubscribe_url(unsubscribe_token, list_name)
        label = list_label or list_name
        link_text = f"Unsubscribe from {label} emails"
    else:
        unsubscribe_url = get_unsubscribe_url(unsubscribe_token)
        link_text = "Unsubscribe from all email notifications"
    return f'''
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;">
        <p>You received this email because you have an account on {settings.app_name}.</p>
        <p><a href="{unsubscribe_url}" style="color: #666;">{link_text}</a></p>
        <p>To manage your notification preferences, visit your <a href="{settings.frontend_url}/profile" style="color: #666;">profile settings</a>.</p>
    </div>
    '''
async def send_email(to_email: str, subject: str, html_content: str,
                     unsubscribe_token: str = None,
                     unsubscribe_list: Optional[str] = None):
    """Send an email using SMTP.

    ``unsubscribe_list`` (optional) routes the List-Unsubscribe header and
    plain-text unsubscribe link to a per-list opt-out (e.g. ``"whats_new"``)
    instead of the master unsubscribe.
    """
    logger.info("EMAIL", f"Sending email to {to_email}")
    logger.debug("EMAIL", f"Subject: {subject}")
    logger.debug("EMAIL", f"From: {settings.smtp_from_name} <{settings.smtp_from_email}>")
    logger.debug("SMTP", f"Host: {settings.smtp_host}:{settings.smtp_port}")
    logger.debug("SMTP", f"Username: {settings.smtp_user}")
    
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Reply-To"] = settings.smtp_from_email
    # Add headers to improve deliverability and reduce spam score
    message["Message-ID"] = f"<{hash(to_email + subject)}.ectlogger@{settings.smtp_host}>"
    message["X-Mailer"] = "ECTLogger"
    
    # Add List-Unsubscribe header - use token-based URL if available, otherwise mailto
    if unsubscribe_token:
        unsubscribe_url = get_unsubscribe_url(unsubscribe_token, unsubscribe_list)
        message["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    else:
        message["List-Unsubscribe"] = f"<mailto:{settings.smtp_from_email}?subject=unsubscribe>"

    # Add plain text version to reduce spam score
    plain_text = f"""
{subject}

This is an automated email from {settings.app_name}.

If you cannot view this email properly, please enable HTML in your email client.

---
{settings.app_name}
This is an automated message, please do not reply.
"""
    if unsubscribe_token:
        plain_text += f"\nTo unsubscribe: {get_unsubscribe_url(unsubscribe_token, unsubscribe_list)}"
        
    text_part = MIMEText(plain_text, "plain")
    html_part = MIMEText(html_content, "html")
    
    message.attach(text_part)
    message.attach(html_part)

    try:
        # Port 465 uses SSL, port 587 uses STARTTLS
        use_tls = settings.smtp_port == 465
        
        ssl_mode = 'TLS (port 465)' if use_tls else 'STARTTLS (port 587)' if settings.smtp_port == 587 else 'Plain'
        logger.debug("SMTP", f"Connecting with {ssl_mode}...")
        
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=use_tls,
            start_tls=(settings.smtp_port == 587),
            timeout=30,
        )

        logger.info("EMAIL", f"Email sent successfully to {to_email}")
        
    except aiosmtplib.SMTPException as e:
        logger.error("SMTP", f"SMTP error: {type(e).__name__}: {str(e)}")
        logger.info("SMTP", "Check SMTP credentials in .env file")
        logger.info("SMTP", f"Verify SMTP_HOST ({settings.smtp_host}) and SMTP_PORT ({settings.smtp_port})")
        raise
    except Exception as e:
        logger.error("EMAIL", f"Unexpected error: {type(e).__name__}: {str(e)}")
        logger.debug("EMAIL", f"Check network connectivity to {settings.smtp_host}")
        raise

async def send_email_with_attachment(to_email: str, subject: str, html_content: str, attachment_data: str, attachment_filename: str, attachment_type: str = "text/csv", unsubscribe_token: str = None):
    """Send an email with an attachment"""
    logger.info("EMAIL", f"Sending email with attachment to {to_email}")
    
    message = MIMEMultipart("mixed")
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Reply-To"] = settings.smtp_from_email
    message["Message-ID"] = f"<{hash(to_email + subject)}.ectlogger@{settings.smtp_host}>"
    message["X-Mailer"] = "ECTLogger"
    
    # Add List-Unsubscribe header
    if unsubscribe_token:
        unsubscribe_url = get_unsubscribe_url(unsubscribe_token)
        message["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    else:
        message["List-Unsubscribe"] = f"<mailto:{settings.smtp_from_email}?subject=unsubscribe>"

    # Create the HTML part
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)

    # Create the attachment
    attachment = MIMEBase("application", "octet-stream")
    attachment.set_payload(attachment_data.encode())
    encoders.encode_base64(attachment)
    attachment.add_header("Content-Disposition", f"attachment; filename={attachment_filename}")
    message.attach(attachment)

    try:
        use_tls = settings.smtp_port == 465
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=use_tls,
            start_tls=(settings.smtp_port == 587),
            timeout=30,
        )
        logger.info("EMAIL", f"Email with attachment sent successfully to {to_email}")
    except Exception as e:
        logger.error("EMAIL", f"Failed to send email with attachment: {str(e)}")
        raise

async def send_email_with_attachments(to_email: str, subject: str, html_content: str, attachments: list, unsubscribe_token: str = None):
    """Send an email with multiple attachments
    attachments: list of tuples (data, filename, mime_type)
    """
    logger.info("EMAIL", f"Sending email with {len(attachments)} attachments to {to_email}")
    
    message = MIMEMultipart("mixed")
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Reply-To"] = settings.smtp_from_email
    message["Message-ID"] = f"<{hash(to_email + subject)}.ectlogger@{settings.smtp_host}>"
    message["X-Mailer"] = "ECTLogger"
    
    # Add List-Unsubscribe header
    if unsubscribe_token:
        unsubscribe_url = get_unsubscribe_url(unsubscribe_token)
        message["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    else:
        message["List-Unsubscribe"] = f"<mailto:{settings.smtp_from_email}?subject=unsubscribe>"

    # Create the HTML part
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)

    # Add attachments
    for data, filename, mime_type in attachments:
        attachment = MIMEBase("application", "octet-stream")
        attachment.set_payload(data.encode())
        encoders.encode_base64(attachment)
        attachment.add_header("Content-Disposition", f"attachment; filename={filename}")
        message.attach(attachment)

    try:
        use_tls = settings.smtp_port == 465
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=use_tls,
            start_tls=(settings.smtp_port == 587),
            timeout=30,
        )
        logger.info("EMAIL", f"Email with attachments sent successfully to {to_email}")
    except Exception as e:
        logger.error("EMAIL", f"Failed to send email with attachments: {str(e)}")
        raise

