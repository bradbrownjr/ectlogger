import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Template
from typing import List
from app.config import settings


class EmailService:
    @staticmethod
    async def send_email(to_email: str, subject: str, html_content: str):
        """Send an email using SMTP"""
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        message["To"] = to_email

        html_part = MIMEText(html_content, "html")
        message.attach(html_part)

        try:
            # Port 465 uses SSL, port 587 uses STARTTLS
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
        except Exception as e:
            print(f"Failed to send email: {e}")
            raise

    @staticmethod
    async def send_magic_link(email: str, token: str):
        """Send magic link email for authentication"""
        magic_link = f"{settings.frontend_url}/auth/verify?token={token}"
        
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background-color: #1976d2; 
                         color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Sign in to {{ app_name }}</h2>
                <p>Click the button below to sign in to your account:</p>
                <a href="{{ magic_link }}" class="button">Sign In</a>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #1976d2;">{{ magic_link }}</p>
                <p>This link will expire in 15 minutes.</p>
                <div class="footer">
                    <p>If you didn't request this email, you can safely ignore it.</p>
                </div>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            app_name=settings.app_name,
            magic_link=magic_link
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
    async def send_net_log(email: str, net_name: str, log_content: str):
        """Send net log after net is closed"""
        html_template = Template("""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 800px; margin: 0 auto; padding: 20px; }
                .log { background-color: #f5f5f5; padding: 15px; border-radius: 4px; 
                      font-family: monospace; white-space: pre-wrap; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Net Log: {{ net_name }}</h2>
                <p>The net has been closed. Here is the complete log:</p>
                <div class="log">{{ log_content }}</div>
            </div>
        </body>
        </html>
        """)
        
        html_content = html_template.render(
            net_name=net_name,
            log_content=log_content
        )
        
        await EmailService.send_email(
            to_email=email,
            subject=f"Net Log: {net_name}",
            html_content=html_content
        )
