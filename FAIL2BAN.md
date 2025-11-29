# Fail2Ban Integration for ECTLogger

ECTLogger includes Fail2Ban-compatible security logging to protect against brute-force authentication attacks.

## Quick Setup

### 1. Configure ECTLogger Logging

Add the `LOG_FILE` environment variable to your `backend/.env`:

```env
# Enable file logging for Fail2Ban
LOG_FILE=/var/log/ectlogger/app.log
```

Create the log directory with proper permissions:

```bash
sudo mkdir -p /var/log/ectlogger
sudo chown $USER:$USER /var/log/ectlogger
```

### 2. Install Fail2Ban Filter

Copy the filter configuration:

```bash
sudo cp fail2ban/filter.d/ectlogger.conf /etc/fail2ban/filter.d/
```

### 3. Configure Fail2Ban Jail

Copy the jail configuration:

```bash
sudo cp fail2ban/jail.d/ectlogger.conf /etc/fail2ban/jail.d/
```

Or add to `/etc/fail2ban/jail.local`:

```ini
[ectlogger]
enabled = true
port = http,https,8000
filter = ectlogger
logpath = /var/log/ectlogger/app.log
maxretry = 5
findtime = 600
bantime = 3600
```

### 4. Restart Services

```bash
# Restart ECTLogger to enable file logging
sudo systemctl restart ectlogger

# Restart Fail2Ban to load new configuration
sudo systemctl restart fail2ban
```

## Configuration Options

### ECTLogger Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_FILE` | Path to log file for Fail2Ban | None (stdout only) |
| `LOG_LEVEL` | Minimum log level | `INFO` |

### Fail2Ban Jail Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `maxretry` | Failed attempts before ban | 5 |
| `findtime` | Time window for counting failures (seconds) | 600 (10 min) |
| `bantime` | Ban duration (seconds) | 3600 (1 hour) |

## Log Format

ECTLogger produces Fail2Ban-compatible log entries:

```
2025-11-29 12:34:56 [WARNING] [AUTH] Authentication failed: Invalid or expired magic link token - IP: 192.168.1.100
2025-11-29 12:35:00 [WARNING] [SECURITY] Banned user access attempt: user@example.com - IP: 192.168.1.100
2025-11-29 12:35:05 [WARNING] [SECURITY] Rate limit exceeded on /auth/magic-link/request - IP: 192.168.1.100
2025-11-29 12:36:00 [INFO] [AUTH] Authentication successful for user@example.com - IP: 192.168.1.101
```

## Testing

### Test the Filter

```bash
# Test with sample log entries
fail2ban-regex /var/log/ectlogger/app.log /etc/fail2ban/filter.d/ectlogger.conf

# View matched IPs
fail2ban-regex /var/log/ectlogger/app.log /etc/fail2ban/filter.d/ectlogger.conf --print-all-matched
```

### Check Fail2Ban Status

```bash
# View jail status
sudo fail2ban-client status ectlogger

# View banned IPs
sudo fail2ban-client status ectlogger | grep "Banned IP"

# Unban an IP
sudo fail2ban-client set ectlogger unbanip 192.168.1.100
```

## Reverse Proxy Configuration

If ECTLogger runs behind nginx or another reverse proxy, ensure the proxy forwards the real client IP:

### Nginx Example

```nginx
location / {
    proxy_pass http://localhost:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

ECTLogger automatically reads these headers:
- `X-Forwarded-For` (standard proxy header)
- `X-Real-IP` (nginx-specific)

## Security Events Logged

| Event | Log Level | Category |
|-------|-----------|----------|
| Invalid magic link token | WARNING | AUTH |
| Expired magic link token | WARNING | AUTH |
| Banned user login attempt | WARNING | SECURITY |
| Rate limit exceeded | WARNING | SECURITY |
| Successful authentication | INFO | AUTH |

## Troubleshooting

### Logs not appearing in file

1. Check `LOG_FILE` is set in `.env`
2. Verify the directory exists and is writable
3. Restart ECTLogger

### Fail2Ban not banning IPs

1. Check log file path matches jail configuration
2. Test filter with `fail2ban-regex`
3. Check Fail2Ban logs: `sudo tail -f /var/log/fail2ban.log`

### IPs behind proxy not detected

1. Ensure proxy sends `X-Forwarded-For` or `X-Real-IP`
2. Check ECTLogger logs show correct client IPs
