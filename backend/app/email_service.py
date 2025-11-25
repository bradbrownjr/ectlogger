import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from jinja2 import Template
from typing import List, Optional
from app.config import settings
from app.logger import logger
import io
import csv


class EmailService:
    @staticmethod
    async def send_email(to_email: str, subject: str, html_content: str):
        """Send an email using SMTP"""
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

    @staticmethod
    async def send_magic_link(email: str, token: str, expire_days: int = 30):
        """Send magic link email for authentication"""
        logger.info("MAGIC LINK", f"Generating magic link for {email}")
        logger.debug("MAGIC LINK", f"Token: {token[:20]}...{token[-10:]} (truncated)")
        logger.debug("MAGIC LINK", f"Expires in: {expire_days} days")
        
        magic_link = f"{settings.frontend_url}/auth/verify?token={token}"
        
        # Format expiration time nicely
        if expire_days == 1:
            expire_text = "24 hours"
        elif expire_days < 1:
            expire_text = f"{int(expire_days * 24)} hours"
        else:
            expire_text = f"{expire_days} days"
        
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #1976d2; 
                    color: #ffffff !important; 
                    text-decoration: none; 
                    border-radius: 4px; 
                    margin: 20px 0;
                    font-weight: bold;
                }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Sign in to {{ app_name }}</h2>
                <p>Click the button below to sign in to your account.</p>
                <p><strong>This link is valid for {{ expire_text }}.</strong></p>
                <a href="{{ magic_link }}" class="button" style="color: #ffffff;">Sign In</a>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #1976d2;">{{ magic_link }}</p>
                <div class="footer">
                    <p>If you didn't request this email, you can safely ignore it.</p>
                </div>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            app_name=settings.app_name,
            magic_link=magic_link,
            expire_text=expire_text
        )
        
        await EmailService.send_email(
            to_email=email,
            subject=f"Sign in to {settings.app_name}",
            html_content=html_content
        )

    @staticmethod
    async def send_net_notification(emails: List[str], net_name: str, net_id: int):
        """Send notification that a net has started"""
        net_url = f"{settings.frontend_url}/nets/{net_id}"
        
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; 
                         color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .alert { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📻 Net Active: {{ net_name }}</h2>
                <div class="alert">
                    <strong>A net you're subscribed to has started!</strong>
                </div>
                <p>The <strong>{{ net_name }}</strong> net is now active and ready for check-ins.</p>
                <a href="{{ net_url }}" class="button">Join Net</a>
                <p>Click the button above to view the net and check in.</p>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            net_name=net_name,
            net_url=net_url
        )
        
        for email in emails:
            try:
                await EmailService.send_email(
                    to_email=email,
                    subject=f"📻 Net Active: {net_name}",
                    html_content=html_content
                )
            except Exception as e:
                print(f"Failed to send notification to {email}: {e}")

    @staticmethod
    async def send_net_invitation(email: str, net_name: str, net_id: int, inviter_name: str):
        """Send invitation to join a net"""
        invite_url = f"{settings.frontend_url}/nets/{net_id}/accept-invitation"
        
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; 
                         color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>You're Invited to Join a Net</h2>
                <p><strong>{{ inviter_name }}</strong> has invited you to join the <strong>{{ net_name }}</strong> net.</p>
                <p>Accept this invitation to receive notifications when this net starts.</p>
                <a href="{{ invite_url }}" class="button">Accept Invitation</a>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            net_name=net_name,
            invite_url=invite_url,
            inviter_name=inviter_name
        )
        
        await EmailService.send_email(
            to_email=email,
            subject=f"Invitation to join {net_name}",
            html_content=html_content
        )

    @staticmethod
    async def send_email_with_attachment(to_email: str, subject: str, html_content: str, attachment_data: str, attachment_filename: str, attachment_type: str = "text/csv"):
        """Send an email with an attachment"""
        logger.info("EMAIL", f"Sending email with attachment to {to_email}")
        
        message = MIMEMultipart("mixed")
        message["Subject"] = subject
        message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        message["To"] = to_email
        message["Reply-To"] = settings.smtp_from_email
        message["Message-ID"] = f"<{hash(to_email + subject)}.ectlogger@{settings.smtp_host}>"
        message["X-Mailer"] = "ECTLogger"

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
            )
            logger.info("EMAIL", f"Email with attachment sent successfully to {to_email}")
        except Exception as e:
            logger.error("EMAIL", f"Failed to send email with attachment: {str(e)}")
            raise

    @staticmethod
    async def send_email_with_attachments(to_email: str, subject: str, html_content: str, attachments: list):
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
            )
            logger.info("EMAIL", f"Email with attachments sent successfully to {to_email}")
        except Exception as e:
            logger.error("EMAIL", f"Failed to send email with attachments: {str(e)}")
            raise

    @staticmethod
    async def send_ncs_reminder(
        to_email: str, 
        operator_name: str,
        operator_callsign: str,
        net_name: str, 
        net_date: str,
        net_time: str,
        frequencies: list,
        hours_until: int,
        scheduler_url: str
    ):
        """Send NCS duty reminder email"""
        logger.info("EMAIL", f"Sending NCS reminder to {to_email} for {net_name} on {net_date}")
        
        # Format frequencies for display
        freq_list = ""
        for freq in frequencies:
            if freq.get('frequency'):
                freq_list += f"<li>{freq['frequency']} MHz - {freq.get('mode', 'N/A')}</li>"
            elif freq.get('talkgroup_name'):
                freq_list += f"<li>{freq['talkgroup_name']} (TG: {freq.get('talkgroup_id', 'N/A')})</li>"
        
        if not freq_list:
            freq_list = "<li>No frequencies configured</li>"
        
        # Different messaging based on reminder timing
        if hours_until <= 1:
            urgency = "starting soon"
            urgency_style = "background-color: #ffebee; border-left: 4px solid #f44336;"
        else:
            urgency = f"in {hours_until} hours"
            urgency_style = "background-color: #fff3e0; border-left: 4px solid #ff9800;"
        
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .alert { {{ urgency_style }} padding: 15px; margin: 20px 0; border-radius: 4px; }
                .details { background-color: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
                .button { 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #1976d2; 
                    color: #ffffff !important; 
                    text-decoration: none; 
                    border-radius: 4px; 
                    margin: 20px 0;
                    font-weight: bold;
                }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
                ul { margin: 10px 0; padding-left: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📻 NCS Duty Reminder</h2>
                
                <div class="alert">
                    <strong>You are scheduled as Net Control Station {{ urgency }}!</strong>
                </div>
                
                <p>Hello {{ operator_name }} ({{ operator_callsign }}),</p>
                
                <p>This is a reminder that you are scheduled to serve as <strong>Net Control Station (NCS)</strong> 
                for the upcoming net session.</p>
                
                <div class="details">
                    <h3>Net Details</h3>
                    <p><strong>Net:</strong> {{ net_name }}</p>
                    <p><strong>Date:</strong> {{ net_date }}</p>
                    <p><strong>Time:</strong> {{ net_time }}</p>
                    <p><strong>Frequencies:</strong></p>
                    <ul>
                        {{ freq_list }}
                    </ul>
                </div>
                
                <p>Please ensure you are ready to run the net at the scheduled time. 
                If you are unable to fulfill your NCS duty, please arrange a swap with another operator as soon as possible.</p>
                
                <a href="{{ scheduler_url }}" class="button" style="color: #ffffff;">View Schedule</a>
                
                <div class="footer">
                    <p>This is an automated reminder from {{ app_name }}.</p>
                    <p>If you need to swap your NCS duty, please use the scheduler to arrange a swap.</p>
                </div>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            operator_name=operator_name,
            operator_callsign=operator_callsign,
            net_name=net_name,
            net_date=net_date,
            net_time=net_time,
            freq_list=freq_list,
            urgency=urgency,
            urgency_style=urgency_style,
            scheduler_url=scheduler_url,
            app_name=settings.app_name
        )
        
        await EmailService.send_email(
            to_email=to_email,
            subject=f"📻 NCS Reminder: {net_name} - {net_date}",
            html_content=html_content
        )

    @staticmethod
    async def send_net_cancellation(
        to_email: str,
        recipient_name: str,
        recipient_callsign: str,
        net_name: str,
        net_date: str,
        net_time: str,
        reason: str | None,
        is_ncs: bool = False,
        scheduler_url: str = None
    ):
        """Send net cancellation notification"""
        logger.info("EMAIL", f"Sending cancellation notice to {to_email} for {net_name} on {net_date}")
        
        if is_ncs:
            subject_prefix = "🚫 NCS Duty Cancelled"
            intro_text = """This is to inform you that your NCS duty has been cancelled 
            for the following net session. You are no longer required to run this net."""
        else:
            subject_prefix = "🚫 Net Cancelled"
            intro_text = """This is to inform you that a net you are subscribed to has been cancelled."""
        
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .alert { background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .details { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
                .reason { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .button { 
                    display: inline-block; 
                    padding: 12px 24px; 
                    background-color: #1976d2; 
                    color: #ffffff !important; 
                    text-decoration: none; 
                    border-radius: 4px; 
                    margin: 20px 0;
                    font-weight: bold;
                }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>{{ subject_prefix }}</h2>
                
                <div class="alert">
                    <strong>The following net has been cancelled.</strong>
                </div>
                
                <p>Hello {{ recipient_name }} ({{ recipient_callsign }}),</p>
                
                <p>{{ intro_text }}</p>
                
                <div class="details">
                    <h3>Cancelled Net Details</h3>
                    <p><strong>Net:</strong> {{ net_name }}</p>
                    <p><strong>Original Date:</strong> {{ net_date }}</p>
                    <p><strong>Original Time:</strong> {{ net_time }}</p>
                </div>
                
                {% if reason %}
                <div class="reason">
                    <strong>Reason:</strong> {{ reason }}
                </div>
                {% endif %}
                
                {% if scheduler_url %}
                <a href="{{ scheduler_url }}" class="button" style="color: #ffffff;">View Schedule</a>
                {% endif %}
                
                <div class="footer">
                    <p>This is an automated notification from {{ app_name }}.</p>
                </div>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            subject_prefix=subject_prefix,
            recipient_name=recipient_name,
            recipient_callsign=recipient_callsign,
            net_name=net_name,
            net_date=net_date,
            net_time=net_time,
            reason=reason,
            intro_text=intro_text,
            scheduler_url=scheduler_url,
            app_name=settings.app_name
        )
        
        await EmailService.send_email(
            to_email=to_email,
            subject=f"{subject_prefix}: {net_name} - {net_date}",
            html_content=html_content
        )

    @staticmethod
    async def send_net_log(email: str, net_name: str, net_description: str, ncs_name: str, check_ins: list, started_at: str, closed_at: str, chat_messages: list = None):
        """Send net log after net is closed with check-ins table, CSV attachment, and chat log"""
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 900px; margin: 0 auto; padding: 20px; }
                .summary { background-color: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #1976d2; color: white; }
                tr:nth-child(even) { background-color: #f2f2f2; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📻 Net Log: {{ net_name }}</h2>
                
                <div class="summary">
                    <h3>Net Summary</h3>
                    <p><strong>Description:</strong> {{ net_description }}</p>
                    <p><strong>NCS:</strong> {{ ncs_name }}</p>
                    <p><strong>Started:</strong> {{ started_at }}</p>
                    <p><strong>Closed:</strong> {{ closed_at }}</p>
                    <p><strong>Total Check-ins:</strong> {{ check_in_count }}</p>
                </div>

                <h3>Check-ins</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Callsign</th>
                            <th>Name</th>
                            <th>Location</th>
                            {% if has_frequencies %}<th>Frequencies</th>{% endif %}
                            {% if has_skywarn %}<th>Spotter #</th>{% endif %}
                            {% if has_weather %}<th>Weather</th>{% endif %}
                            {% if has_power %}<th>Power</th>{% endif %}
                        </tr>
                    </thead>
                    <tbody>
                        {% for check_in in check_ins %}
                        <tr>
                            <td>{{ check_in.time }}</td>
                            <td><strong>{{ check_in.callsign }}</strong></td>
                            <td>{{ check_in.name }}</td>
                            <td>{{ check_in.location }}</td>
                            {% if has_frequencies %}<td>{{ check_in.frequencies }}</td>{% endif %}
                            {% if has_skywarn %}<td>{{ check_in.skywarn_number }}</td>{% endif %}
                            {% if has_weather %}<td>{{ check_in.weather_observation }}</td>{% endif %}
                            {% if has_power %}<td>{{ check_in.power_source }}</td>{% endif %}
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>

                <div class="footer">
                    <p>A CSV file with the complete log is attached to this email.</p>
                    <p>This is an automated message from {{ app_name }}.</p>
                </div>
            </div>
        </body>
        </html>
        """)
        
        # Check which optional fields have data
        has_frequencies = any(c.get('frequencies') for c in check_ins)
        has_skywarn = any(c.get('skywarn_number') for c in check_ins)
        has_weather = any(c.get('weather_observation') for c in check_ins)
        has_power = any(c.get('power_source') for c in check_ins)
        
        html_content = html_template.render(
            app_name=settings.app_name,
            net_name=net_name,
            net_description=net_description or "No description",
            ncs_name=ncs_name,
            started_at=started_at,
            closed_at=closed_at,
            check_in_count=len(check_ins),
            check_ins=check_ins,
            has_frequencies=has_frequencies,
            has_skywarn=has_skywarn,
            has_weather=has_weather,
            has_power=has_power
        )
        
        # Generate CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Check-in Time", "Callsign", "Name", "Location", 
            "Spotter #", "Weather Observation", "Power Source", 
            "Feedback", "Notes", "Status"
        ])
        
        for check_in in check_ins:
            writer.writerow([
                check_in.get('time', ''),
                check_in.get('callsign', ''),
                check_in.get('name', ''),
                check_in.get('location', ''),
                check_in.get('skywarn_number', ''),
                check_in.get('weather_observation', ''),
                check_in.get('power_source', ''),
                check_in.get('feedback', ''),
                check_in.get('notes', ''),
                check_in.get('status', '')
            ])
        
        csv_data = output.getvalue()
        csv_filename = f"{net_name.replace(' ', '_')}_{closed_at.split()[0]}.csv"
        
        # Generate chat log if provided
        attachments = [(csv_data, csv_filename, "text/csv")]
        
        if chat_messages:
            chat_output = io.StringIO()
            chat_output.write(f"Chat Log for {net_name}\n")
            chat_output.write(f"{'='*60}\n\n")
            
            for msg in chat_messages:
                timestamp = msg.get('timestamp', '')
                callsign = msg.get('callsign', 'Unknown')
                message = msg.get('message', '')
                chat_output.write(f"[{timestamp}] {callsign}: {message}\n")
            
            chat_data = chat_output.getvalue()
            chat_filename = f"{net_name.replace(' ', '_')}_{closed_at.split()[0]}_chat.txt"
            attachments.append((chat_data, chat_filename, "text/plain"))
        
        # Send email with attachment(s)
        if len(attachments) > 1:
            await EmailService.send_email_with_attachments(
                to_email=email,
                subject=f"📻 Net Log: {net_name}",
                html_content=html_content,
                attachments=attachments
            )
        else:
            await EmailService.send_email_with_attachment(
                to_email=email,
                subject=f"📻 Net Log: {net_name}",
                html_content=html_content,
                attachment_data=csv_data,
                attachment_filename=csv_filename
            )
