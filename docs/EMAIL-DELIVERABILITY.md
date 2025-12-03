# Email Deliverability Guide

## Why Emails Go to Spam

Magic link emails often end up in spam because:

1. **No authentication records** - SPF, DKIM, DMARC not configured
2. **New/unknown sender** - Email provider hasn't seen your domain before
3. **Suspicious content** - Links trigger spam filters
4. **Poor sender reputation** - Sending domain has low trust score
5. **Missing plain text** - HTML-only emails are suspicious
6. **Generic subject lines** - "Sign in" looks like phishing

## Quick Fixes (Already Implemented)

✅ **Plain text alternative** - Emails now include both HTML and plain text versions
✅ **Email headers** - Added Message-ID, Reply-To, X-Mailer, List-Unsubscribe
✅ **Proper From address** - Uses configured SMTP_FROM_EMAIL
✅ **Clear subject line** - "Sign in to ECTLogger" (uses your APP_NAME)

## Long-Term Solutions

### 1. Configure Email Authentication (Recommended)

**SPF Record** - Allows your mail server to send on behalf of your domain:
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.your-mail-provider.com ~all
```

**DKIM Record** - Digitally signs your emails:
- Contact your email hosting provider (server229.web-hosting.com) for your DKIM key
- Add the TXT record they provide to your DNS

**DMARC Record** - Tells receivers how to handle unauthenticated emails:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

### 2. Use a Dedicated Email Domain

Instead of sending from your main domain, use a subdomain:
- Example: `noreply@mail.ectlogger.com` instead of `noreply@ectlogger.com`
- This isolates your main domain's reputation from automated emails

### 3. Warm Up Your Sending Domain

- Start by sending emails to known contacts
- Gradually increase volume over days/weeks
- Monitor bounce rates and spam reports

### 4. Use a Transactional Email Service

Consider using a service like:
- **AWS SES** - $0.10 per 1,000 emails, excellent deliverability
- **SendGrid** - 100/day free tier, handles SPF/DKIM automatically
- **Mailgun** - 5,000/month free tier
- **Postmark** - Specialized for transactional emails

These services have established sender reputations and handle all authentication.

## User Instructions

### For Recipients

**Add to Safe Senders List:**

**Gmail:**
1. Open the email in Spam folder
2. Click "Not spam" at the top
3. Star or mark as important for future emails

**Outlook/Microsoft 365:**
1. Right-click the email
2. Select "Junk" → "Not Junk"
3. Check "Always trust email from [sender]"

**Apple Mail:**
1. Select the email
2. Click "Not Junk" in the banner

**Create a Filter (Gmail):**
1. Open email, click three dots
2. "Filter messages like this"
3. Set: From contains `noreply@yourdomain.com`
4. Create filter: "Never send to Spam"

### For Administrators

**Whitelist in Organization:**
- Ask your IT department to whitelist your ECTLogger email address
- This ensures all team members receive magic links in inbox

**Use Microsoft 365 Admin Center:**
1. Go to Exchange Admin Center
2. Protection → Anti-spam
3. Add your sending address to allowed senders

**Use Google Workspace Admin:**
1. Apps → Google Workspace → Gmail
2. Spam, phishing, and malware → Email whitelist
3. Add your domain or specific address

## Testing Deliverability

### Mail-Tester.com
1. Request a magic link to the test address shown on mail-tester.com
2. Click "Check your score"
3. Review detailed spam analysis
4. Fix issues highlighted in report

### Check DNS Records
```bash
# Check SPF
dig TXT yourdomain.com +short | grep spf

# Check DKIM
dig TXT default._domainkey.yourdomain.com +short

# Check DMARC
dig TXT _dmarc.yourdomain.com +short
```

### Gmail Postmaster Tools
- Sign up at: https://postmaster.google.com
- Verify your sending domain
- Monitor reputation, spam rate, and delivery errors

## Configuration Tips

### Use Professional "From" Address

In your `.env`:
```env
SMTP_FROM_EMAIL=noreply@yourdomain.com  # Not gmail.com!
SMTP_FROM_NAME=YourOrg ECTLogger
APP_NAME=YourOrg Emergency Net Logger
```

### Customize Email Content

The emails are professional and clear, but you can:
- Use your organization's name in `APP_NAME`
- Set `FRONTEND_URL` to your actual domain (not IP address)
- Use a custom domain for both frontend and email

## Common Issues

### Issue: "This message was not authenticated"
**Solution:** Configure SPF, DKIM, DMARC records

### Issue: Gmail "be careful with this message"
**Solution:** 
- Configure email authentication
- Use your own domain (not Gmail/Outlook)
- Build sender reputation over time

### Issue: Blocked by corporate firewall
**Solution:**
- Contact IT to whitelist your domain
- Use a recognized transactional email service
- Document that ECTLogger is an approved internal tool

### Issue: Email never arrives
**Solution:**
- Check spam folder (you found them!)
- Verify SMTP credentials in `.env`
- Check server console logs for errors
- Ensure firewall allows outbound SMTP

## AWS SES Setup (Recommended)

AWS SES is affordable and has excellent deliverability:

### 1. Create AWS SES Account
```bash
# Install AWS CLI
aws configure

# Verify email address (for testing)
aws ses verify-email-identity --email-address noreply@yourdomain.com

# Verify domain (for production)
aws ses verify-domain-identity --domain yourdomain.com
```

### 2. Add DNS Records
AWS will provide TXT records for verification and DKIM - add them to your DNS.

### 3. Configure ECTLogger
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASSWORD=your-ses-smtp-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

### 4. Request Production Access
- By default, SES is in sandbox mode (can only send to verified addresses)
- Request production access in AWS Console: Amazon SES → Account Dashboard → Request production access

**Pricing:** $0.10 per 1,000 emails (62,000 free emails/month if running on EC2)

## SendGrid Setup (Alternative)

### 1. Sign Up
- Free tier: 100 emails/day forever
- No credit card required

### 2. Get API Key
- Settings → API Keys → Create API Key
- Select "Mail Send" permission

### 3. Configure ECTLogger
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

### 4. Verify Domain
- Settings → Sender Authentication → Domain Authentication
- Add provided DNS records

## Monitoring

### Check Logs
```bash
# If running as systemd service
sudo journalctl -u ectlogger -f | grep EMAIL

# Look for:
# [SUCCESS] Email sent successfully
# [ERROR] SMTP ERROR
```

### Track Deliverability
- Monitor how many users report emails in spam
- Ask users to whitelist your sender address
- Consider user feedback on email arrival time

### Regular Maintenance
- Review bounce rates monthly
- Update email content if spam rates increase
- Test deliverability with mail-tester.com quarterly
- Keep SPF/DKIM records updated if changing providers

## Best Practices

1. **Always use your own domain** - Not Gmail, Outlook, etc.
2. **Configure authentication** - SPF, DKIM, DMARC are essential
3. **Keep volume reasonable** - Don't blast thousands of emails suddenly
4. **Monitor bounces** - Remove invalid addresses
5. **Provide unsubscribe** - Already included in email headers
6. **Use plain text + HTML** - Already implemented
7. **Professional content** - Clear, concise, no excessive links
8. **Consistent sender** - Don't change From address frequently

## For Emergency Operations

If you need immediate deliverability:

1. **Manual whitelist:** Have all users add your sender to contacts before the event
2. **Test emails:** Send test emails days before to establish pattern
3. **Domain warmup:** Start using the address for non-critical emails first
4. **Backup method:** Have phone/SMS as fallback for critical notifications
5. **User education:** Include "check spam folder" in training materials

---

## Troubleshooting

### Connection Refused Error

If you see `ERR_CONNECTION_REFUSED` in the browser console, the frontend can't reach the backend.

**Solution**: Reconfigure with your LAN IP:
```bash
./configure.sh
# Or use the migration script:
./migrate.sh --lan-ip YOUR_LAN_IP
```

### Common SMTP Problems

#### 1. SMTP Authentication Failed
**Symptoms**: "Authentication failed" or "Invalid credentials"

**Solution for Gmail**: Use an **App Password**, not your regular password:
1. Enable 2-Step Verification
2. Go to https://myaccount.google.com/apppasswords
3. Generate a new App Password
4. Use that 16-character password in configuration

#### 2. SSL/TLS Configuration
**Symptoms**: "SSL handshake failed" or "Certificate verification failed"

**Solution**: Use port 465 for SSL:
```bash
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=465
```

#### 3. Certificate Hostname Mismatch
**Symptoms**: "Certificate hostname mismatch"

**Solution**: Ensure `SMTP_HOST` matches the SSL certificate exactly.

### Test SMTP Connection

```bash
cd ~/ectlogger/backend
source venv/bin/activate
python3 -c "
import asyncio
from app.email_service import EmailService

async def test():
    await EmailService.send_magic_link('your-email@example.com', 'test-token')
    print('Email sent successfully!')

asyncio.run(test())
"
```

### Ad Blocker Issues

Some ad blockers block requests containing "magic-link" in the URL.

**Solutions**:
1. Whitelist your ECTLogger domain
2. Disable ad blocker temporarily
3. Try a different browser

---

## Need Help?

If emails continue going to spam:
1. Test with mail-tester.com and share results
2. Check server console logs for SMTP errors
3. Verify DNS records are correct
4. Consider switching to AWS SES or SendGrid
5. Contact your email hosting provider for assistance

## Related Documentation
- [MAGIC-LINK-CONFIGURATION.md](MAGIC-LINK-CONFIGURATION.md) - Magic link expiration settings
- [MANUAL-INSTALLATION.md](MANUAL-INSTALLATION.md) - Manual installation and configuration
