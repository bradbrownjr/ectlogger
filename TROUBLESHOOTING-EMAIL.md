# Email Troubleshooting Guide

## Quick Fix for "Connection Refused" Error

If you see `ERR_CONNECTION_REFUSED` in the browser console, the frontend can't reach the backend.

### Solution: Reconfigure with LAN IP

```bash
cd ~/ectlogger
./configure.sh
```

When prompted:
1. **Choose to overwrite** existing config (y)
2. **Note the detected LAN IP** (e.g., 192.168.1.100)
3. **Frontend URL**: Use `http://YOUR_LAN_IP:3000`
4. **Backend API URL**: Use `http://YOUR_LAN_IP:8000`

This creates `frontend/.env` with:
```
VITE_API_URL=http://YOUR_LAN_IP:8000
```

After reconfiguring, restart the application.

## Email Configuration Issues

### Check Backend Logs

The backend prints detailed error messages. Look for:
```
ERROR sending magic link: ...
```

### Common Email Problems

#### 1. SMTP Authentication Failed
**Symptoms**: "Authentication failed" or "Invalid credentials"

**Solution**:
- For Gmail: Use an **App Password**, not your regular password
  1. Enable 2-Step Verification
  2. Go to https://myaccount.google.com/apppasswords
  3. Generate a new App Password
  4. Use that 16-character password in configuration

#### 2. SSL/TLS Configuration
**Symptoms**: "SSL handshake failed" or "Certificate verification failed"

**Solution** (for your server229.web-hosting.com):
```bash
SMTP_HOST=server229.web-hosting.com
SMTP_PORT=465
```

Port 465 uses SSL directly (not STARTTLS).

#### 3. Wrong Hostname
**Symptoms**: "Certificate hostname mismatch"

**Solution**: Make sure `SMTP_HOST` matches the SSL certificate
- Use: `server229.web-hosting.com` (not `mail.lynwood.us`)

### Test SMTP Connection Manually

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

## Frontend Not Connecting to Backend

### Check Frontend Configuration

```bash
cat ~/ectlogger/frontend/.env
```

Should show:
```
VITE_API_URL=http://YOUR_LAN_IP:8000
```

If missing, run `./configure.sh` again.

### Check Backend CORS Configuration

Edit `backend/.env`:
```
FRONTEND_URL=http://YOUR_LAN_IP:3000
```

Must match where you're accessing the frontend from.

### Restart After Configuration Changes

```bash
# If using systemd service
sudo systemctl restart ectlogger

# If running directly
./start.sh
```

## Ad Blocker Issues

Some ad blockers block requests with "magic-link" in the URL.

**Solutions**:
1. Whitelist your ECTLogger domain
2. Disable ad blocker for the site
3. Try a different browser temporarily

The error message now mentions ad blockers to help users troubleshoot.
