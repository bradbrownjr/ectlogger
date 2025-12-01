# Logging Configuration Guide

ECTLogger uses a configurable logging system that lets you control the verbosity of console output.

## Log Levels

Configure logging via the `LOG_LEVEL` environment variable in your `.env` file:

### DEBUG (Most Verbose)
Shows everything including:
- JWT token creation and verification details
- Full SQL queries from SQLAlchemy
- Token payloads and user IDs
- SMTP connection details
- Email content and headers

**Use when:** Troubleshooting authentication issues, debugging email problems, tracing API requests

```env
LOG_LEVEL=DEBUG
```

**Example output:**
```
[AUTH] Creating JWT with payload: {'sub': '1', 'exp': 1763863229}
[AUTH] Using algorithm: HS256
[AUTH] Using secret key (first 10 chars): GRwrNF1lBd...
[SMTP] Host: server229.web-hosting.com:465
[SMTP] Username: noreply@domain.com
```

### INFO (Default - Recommended)
Shows important operational events:
- User login/logout events
- Magic link requests and verifications
- Email send confirmations
- API endpoint access
- Net creation/management

**Use when:** Normal operation, monitoring activity, basic troubleshooting

```env
LOG_LEVEL=INFO
```

**Example output:**
```
[API] Magic link request received for user@example.com
[EMAIL] Sending email to user@example.com
[EMAIL] Email sent successfully to user@example.com
[API] Magic link sent successfully to user@example.com
[API] User authenticated: user@example.com (ID: 1)
```

### WARNING
Shows unexpected but non-critical events:
- Invalid authentication attempts
- Expired tokens
- Missing configuration values
- Rate limit warnings

**Use when:** You only want to see problems, not normal operations

```env
LOG_LEVEL=WARNING
```

**Example output:**
```
[AUTH] Token verification failed
[API] Invalid or expired magic link token
```

### ERROR (Least Verbose)
Shows only critical failures:
- SMTP connection failures
- Database errors
- Unhandled exceptions
- System crashes

**Use when:** Production environments where you only care about failures

```env
LOG_LEVEL=ERROR
```

**Example output:**
```
[SMTP] SMTP error: SMTPAuthenticationError: (535, 'Authentication failed')
[EMAIL] Unexpected error: ConnectionRefusedError: Connection refused
```

## Configuration

### Via Environment Variable

Add to your `backend/.env` file:

```env
LOG_LEVEL=INFO
```

### Runtime Changes

To change log level without editing `.env`:

**Linux/macOS:**
```bash
LOG_LEVEL=DEBUG ./start.sh
```

**Windows PowerShell:**
```powershell
$env:LOG_LEVEL="DEBUG"; .\start.ps1
```

### Systemd Service

If running as a systemd service, edit the service file:

```bash
sudo nano /etc/systemd/system/ectlogger.service
```

Add to the `[Service]` section:
```ini
Environment="LOG_LEVEL=INFO"
```

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ectlogger
```

## Log Categories

Logs are organized by category (shown in brackets):

- **[API]** - API endpoint handling
- **[AUTH]** - Authentication and token management
- **[EMAIL]** - Email sending operations
- **[SMTP]** - SMTP server communication
- **[MAGIC LINK]** - Magic link generation and verification
- **[CORS]** - Cross-origin configuration
- **[ERROR]** - Error conditions

## Best Practices

### Development
Use `DEBUG` or `INFO` to see what's happening as you test features.

### Production
Use `INFO` for normal operations, or `WARNING` if you have high traffic and want quieter logs.

### Troubleshooting

**Authentication Issues:**
```env
LOG_LEVEL=DEBUG
```
Look for: Token creation, verification, JWT decode errors

**Email Not Sending:**
```env
LOG_LEVEL=DEBUG
```
Look for: SMTP configuration, connection attempts, authentication errors

**Performance Issues:**
```env
LOG_LEVEL=WARNING
```
Reduces log overhead while still catching problems

**Production Monitoring:**
```env
LOG_LEVEL=INFO
```
Balanced view of operations without excessive detail

## Example Session

### With LOG_LEVEL=INFO (Default)

User requests magic link:
```
[API] Magic link request received for user@example.com
[MAGIC LINK] Generating magic link for user@example.com
[EMAIL] Sending email to user@example.com
[EMAIL] Email sent successfully to user@example.com
[API] Magic link sent successfully to user@example.com
```

User clicks link:
```
[API] Magic link verification request received
[API] User authenticated: user@example.com (ID: 1)
```

### With LOG_LEVEL=DEBUG

User requests magic link:
```
[API] Magic link request received for user@example.com
[API] Token generated successfully
[MAGIC LINK] Generating magic link for user@example.com
[MAGIC LINK] Token: ImJyYWRicm93bmpyQGdt...Mm7HksPCzs (truncated)
[MAGIC LINK] Expires in: 30 days
[EMAIL] Sending email to user@example.com
[EMAIL] Subject: Sign in to ECTLogger
[EMAIL] From: ECTLogger <noreply@domain.com>
[SMTP] Host: server229.web-hosting.com:465
[SMTP] Username: noreply@domain.com
[SMTP] Connecting with TLS (port 465)...
[EMAIL] Email sent successfully to user@example.com
[API] Magic link sent successfully to user@example.com
```

User clicks link:
```
[API] Magic link verification request received
[API] Token: ImJyYWRicm93bmpyQGdt...Mm7HksPCzs (truncated)
[API] Token valid for email: user@example.com
[API] User authenticated: user@example.com (ID: 1)
[AUTH] Creating JWT with payload: {'sub': '1', 'exp': 1763863229}
[AUTH] Using algorithm: HS256
[AUTH] Using secret key (first 10 chars): GRwrNF1lBd...
[AUTH] JWT created: eyJhbGciOiJIUzI1NiIs...qVBhsPIGJQTQ
[API] Access token created successfully
```

## Viewing Logs

### Terminal (Direct Run)
Logs appear in the terminal where you ran `./start.sh`

### Systemd Service
```bash
# Follow live logs
sudo journalctl -u ectlogger -f

# View recent logs
sudo journalctl -u ectlogger -n 100

# Filter by log level (only works with structured logging, shows all with our current implementation)
sudo journalctl -u ectlogger | grep "\[ERROR\]"
```

### Save to File
```bash
# Redirect output
./start.sh 2>&1 | tee ectlogger.log

# Or with systemd
sudo journalctl -u ectlogger > ectlogger.log
```

## Troubleshooting

### Logs Too Verbose
Set `LOG_LEVEL=WARNING` or `LOG_LEVEL=ERROR`

### Not Seeing Expected Logs
- Check that `LOG_LEVEL` is set correctly in `.env`
- Restart the application after changing log level
- Ensure you're looking at the correct output (terminal vs systemd logs)

### SQLAlchemy Query Logs
SQLAlchemy logging is separate and controlled by its own configuration. To disable SQL query logs even in DEBUG mode, you would need to modify `backend/app/database.py`.

## Advanced: Adding Custom Logging

In your code, import and use the logger:

```python
from app.logger import logger

# Info level (shown with LOG_LEVEL=INFO or lower)
logger.info("CATEGORY", "Something important happened")

# Debug level (shown only with LOG_LEVEL=DEBUG)
logger.debug("CATEGORY", "Detailed information for debugging")

# Warning level (shown with LOG_LEVEL=WARNING or lower)
logger.warning("CATEGORY", "Something unexpected but not critical")

# Error level (always shown)
logger.error("CATEGORY", "Something failed")

# Include IP address for Fail2Ban integration (optional)
logger.warning("AUTH", "Invalid token", ip="192.168.1.100")

# Security-specific methods for Fail2Ban
logger.auth_failure("Invalid password", ip="192.168.1.100", email="user@example.com")
logger.auth_success("user@example.com", ip="192.168.1.100")
logger.rate_limit(ip="192.168.1.100", endpoint="/api/auth/login")
logger.banned_access("banned@example.com", ip="192.168.1.100")
```

## Related Configuration

- `LOG_FILE` - See `FAIL2BAN.md` for file logging setup
- `MAGIC_LINK_EXPIRE_DAYS` - See `MAGIC-LINK-CONFIGURATION.md`
- `SMTP_*` - See `TROUBLESHOOTING-EMAIL.md`
- `LOG_LEVEL` - This document
