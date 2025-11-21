# Security Policy

## Overview

The ECT Net Logger application implements comprehensive security measures to protect against common vulnerabilities and ensure safe operation in production environments.

## Security Features

### 1. Input Validation & Sanitization

**Pydantic Schema Validation**
- All API inputs validated using Pydantic with strict field constraints
- String length limits prevent buffer overflow and DoS attacks
- Regular expression patterns enforce format requirements
- Type checking prevents injection of malicious data types

**Field-Specific Protections:**
- **Callsigns**: Max 20 chars, uppercase alphanumeric only (pattern: `^[A-Z0-9/]+$`)
- **Names**: Max 100 characters
- **Locations**: Max 200 characters
- **Weather observations**: Max 2000 characters
- **Net names**: Max 200 characters
- **Net descriptions**: Max 2000 characters
- **Chat messages**: Max 5000 characters
- **Custom fields**: Max 50 fields per check-in, max 5000 chars per value
- **Frequency mode**: Restricted to valid modes (FM, AM, SSB, etc.)

**XSS Protection:**
- HTML entity escaping on all user inputs
- HTML tag stripping via `security.sanitize_html()`
- JavaScript pattern detection and removal
- Event handler attribute removal (`onclick`, `onerror`, etc.)

**SQL Injection Prevention:**
- SQLAlchemy ORM with parameterized queries (no raw SQL)
- Custom field validation prevents SQL patterns
- Path traversal pattern detection

### 2. Authentication & Authorization

**JWT Token Security:**
- HS256 algorithm for token signing
- Configurable secret key via environment variable
- Token expiration (30 days default)
- Token verification on all protected endpoints

**OAuth2 Integration:**
- Google, Microsoft, GitHub SSO
- State parameter for CSRF protection
- Secure token exchange flow

**Magic Link Email:**
- Time-limited tokens via `itsdangerous`
- Single-use token pattern recommended
- Email delivery via SMTP with TLS

**Role-Based Access Control (RBAC):**
- User roles: USER, LOGGER, NCS, ADMIN
- Per-net role assignments via NetRole table
- Permission checks before sensitive operations
- Ownership validation on resource access

**WebSocket Authentication:**
- JWT token required for WebSocket connections
- Token passed as query parameter
- Connection rejected if authentication fails (code 1008)
- User validation against database

### 3. Rate Limiting

**SlowAPI Integration:**
- Default limit: 200 requests per minute per IP
- Prevents brute force attacks
- Mitigates DoS/DDoS attempts
- Automatic 429 response on limit exceeded

**Apply Custom Limits:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/sensitive-endpoint")
@limiter.limit("10/minute")  # More restrictive for sensitive ops
async def sensitive_operation():
    pass
```

### 4. Security Headers

**HTTP Security Headers:**
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - Browser XSS filter
- `Strict-Transport-Security` - Enforces HTTPS
- `Content-Security-Policy` - Restricts resource loading

### 5. Database Security

**Connection Security:**
- Environment-based credentials (never hardcoded)
- Async database connections with proper pooling
- Connection string validation

**Data Protection:**
- Passwords never stored (OAuth-only authentication)
- Sensitive data encrypted in transit (HTTPS/TLS)
- Database-level constraints (foreign keys, unique, not null)

**Query Safety:**
- ORM-only queries (no raw SQL execution)
- Automatic SQL injection protection
- Transaction management with rollback on errors

### 6. CORS Configuration

**Controlled Origin Access:**
- Whitelist-based origin validation
- Credentials allowed only for trusted origins
- Frontend URL from environment variable
- Development mode allows localhost:3000

**Production Configuration:**
```env
FRONTEND_URL=https://your-domain.com
```

### 7. Email Security

**SMTP with TLS:**
- TLS encryption for email transmission
- SMTP authentication required
- No plain-text password logging

**Template Sanitization:**
- Jinja2 template engine with autoescaping
- User input sanitized before email inclusion
- No execution of user-provided code

## Vulnerability Reporting

If you discover a security vulnerability, please report it to:

1. **DO NOT** create a public GitHub issue
2. Email: [security contact email - to be configured]
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Best Practices for Deployment

### Environment Variables
```bash
# Generate strong secret key
SECRET_KEY=$(openssl rand -hex 32)

# Use strong database passwords
DATABASE_URL=postgresql://user:STRONG_PASSWORD@localhost/ectlogger

# Configure email with app-specific password
SMTP_PASSWORD=app_specific_password_not_main_password
```

### HTTPS Configuration (nginx example)
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Database Security
```bash
# Use connection pooling limits
DATABASE_URL=postgresql://user:pass@localhost/db?pool_size=20&max_overflow=10

# Enable SSL for PostgreSQL connections
DATABASE_URL=postgresql://user:pass@localhost/db?sslmode=require

# Restrict database user permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ectlogger_user;
```

### Firewall Configuration
```bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (redirect to HTTPS)
ufw allow 443/tcp  # HTTPS
ufw enable

# Block all other incoming by default
ufw default deny incoming
ufw default allow outgoing
```

### Regular Updates
```bash
# Keep dependencies updated
pip install --upgrade -r requirements.txt
npm update

# Monitor for security advisories
pip-audit
npm audit
```

## Security Checklist for Production

- [ ] Change default `SECRET_KEY` to cryptographically random value
- [ ] Use HTTPS/TLS for all connections
- [ ] Configure firewall to restrict access
- [ ] Use strong database passwords
- [ ] Enable database connection encryption
- [ ] Set up automated backups
- [ ] Configure log rotation and monitoring
- [ ] Review and restrict CORS origins
- [ ] Enable rate limiting (already configured)
- [ ] Set up intrusion detection system (IDS)
- [ ] Configure fail2ban or similar for brute force protection
- [ ] Regular security audits and penetration testing
- [ ] Keep all dependencies updated
- [ ] Monitor security advisories for dependencies
- [ ] Implement backup authentication method
- [ ] Set up alerting for suspicious activity
- [ ] Review file upload capabilities (if added)
- [ ] Audit user permissions regularly
- [ ] Test disaster recovery procedures

## Known Limitations

1. **WebSocket Token Passing**: Token sent as query parameter (visible in logs). Consider upgrading to header-based authentication or initial message authentication.

2. **Rate Limiting Scope**: Current rate limiting is per-IP. Consider adding per-user rate limits for authenticated endpoints.

3. **Session Management**: JWT tokens valid until expiration. No token revocation mechanism implemented. Consider adding token blacklist for logout/ban functionality.

4. **Audit Logging**: Basic logging implemented. Consider adding comprehensive audit trail for sensitive operations.

## Security Testing

### Run Security Tests
```bash
# Check for known vulnerabilities in dependencies
cd backend
pip install safety
safety check

cd ../frontend
npm audit

# Run OWASP ZAP or similar security scanner
# Test with tools like:
# - Burp Suite
# - OWASP ZAP
# - sqlmap (should find no SQL injection)
# - XSS test payloads (should be sanitized)
```

### Example Test Cases
```python
# Test XSS prevention
payload = "<script>alert('xss')</script>"
# Should be escaped to: &lt;script&gt;alert('xss')&lt;/script&gt;

# Test SQL injection prevention
payload = "'; DROP TABLE users; --"
# Should be safely handled by ORM

# Test path traversal
payload = "../../etc/passwd"
# Should be rejected by validation

# Test oversized input
payload = "A" * 10000  # Should be rejected (max length exceeded)
```

## Compliance Notes

This application implements security controls aligned with:
- **OWASP Top 10** - Protection against common web vulnerabilities
- **SANS Top 25** - Mitigation of dangerous software errors
- **CWE/SANS** - Secure coding practices

For compliance with specific regulations (GDPR, HIPAA, etc.), additional controls may be required.

## License

Security features are part of the ECT Net Logger project licensed under MIT License. See LICENSE file for details.
