# Magic Link Configuration

## Overview

Magic links provide passwordless authentication for ECTLogger. The expiration time is configurable to support different operational scenarios, particularly long-duration emergency events.

## Configuration

### Environment Variable

Add to your `.env` file:

```env
# Magic Link Configuration
# How many days magic links remain valid (default: 30 days)
MAGIC_LINK_EXPIRE_DAYS=30
```

### Default Behavior

- **Default expiration**: 30 days
- **Purpose**: Supports extended emergency operations where operators need persistent access during active incidents or storms
- **Security**: Long expiration is acceptable for this use case since:
  - Magic links are single-use (consumed on first login)
  - Email access is required (controlled by email provider's security)
  - Target audience is trusted emergency communications operators
  - Links are sent only to registered email addresses

## Use Cases

### Short-Duration Events (1-7 days)
```env
MAGIC_LINK_EXPIRE_DAYS=7
```
For typical weekly net operations or short training exercises.

### Long-Duration Events (30+ days)
```env
MAGIC_LINK_EXPIRE_DAYS=30
```
For hurricane season activations, wildfire incidents, or extended emergency operations where operators need seamless access without interruption.

### Ultra-Secure Environments (< 1 day)
```env
MAGIC_LINK_EXPIRE_DAYS=0.0104  # 15 minutes
```
For high-security scenarios requiring frequent re-authentication. Note: decimal values less than 1 day are displayed as hours in emails.

## How It Works

1. **User requests magic link** via login page
2. **System generates JWT token** with configurable expiration
3. **Email is sent** with link and expiration information
4. **User clicks link** within expiration period
5. **System validates token** and creates session

## Email Display Format

The email template automatically formats expiration time based on the configured value:

- `< 1 day`: Displayed as hours (e.g., "15 hours")
- `= 1 day`: Displayed as "24 hours"
- `> 1 day`: Displayed as days (e.g., "30 days")

## Technical Details

### Backend Implementation

**Config** (`backend/app/config.py`):
```python
magic_link_expire_days: int = 30  # Magic link validity period
```

**Token Verification** (`backend/app/auth.py`):
```python
def verify_magic_link_token(token: str, max_age: int = None) -> Optional[str]:
    if max_age is None:
        max_age = settings.magic_link_expire_days * 24 * 60 * 60  # Convert days to seconds
    # ...
```

**API Endpoint** (`backend/app/routers/auth.py`):
```python
@router.post("/magic-link/request")
async def request_magic_link(request: MagicLinkRequest, db: AsyncSession = Depends(get_db)):
    token = create_magic_link_token(request.email)
    await EmailService.send_magic_link(request.email, token, settings.magic_link_expire_days)
    return {
        "message": "Magic link sent to your email",
        "expires_in_days": settings.magic_link_expire_days
    }
```

**Email Service** (`backend/app/email_service.py`):
```python
async def send_magic_link(email: str, token: str, expire_days: int = 30):
    if expire_days == 1:
        expire_text = "24 hours"
    elif expire_days < 1:
        expire_text = f"{int(expire_days * 24)} hours"
    else:
        expire_text = f"{expire_days} days"
    # Email template uses expire_text
```

### Frontend Display

The login page informs users of the configured expiration:

```tsx
<Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary" align="center">
  Magic links are valid for 30 days, keeping you connected during extended emergency events.
</Typography>
```

## Security Considerations

### Why Long Expiration is Acceptable

1. **Single-Use Tokens**: Magic links are consumed on first use
2. **Email Security**: Requires access to user's email account
3. **Trusted Operators**: System designed for vetted emergency communications personnel
4. **Limited Scope**: Application manages emergency net logs, not sensitive personal data
5. **Session Management**: Separate access token expiration (30 minutes default) provides additional security layer

### Additional Security Measures

- Rate limiting on magic link requests (200/minute via SlowAPI)
- CORS protection with configured origins
- Input validation via Pydantic
- XSS protection with content sanitization
- HTTPS enforcement recommended for production

## Troubleshooting

### Link Expires Too Quickly

Increase the value in `.env`:
```env
MAGIC_LINK_EXPIRE_DAYS=60
```

Restart the backend:
```bash
./start.sh
```

### Link Lasts Too Long

Reduce the value for tighter security:
```env
MAGIC_LINK_EXPIRE_DAYS=7
```

### Testing Different Values

You can test with very short expiration for development:
```env
MAGIC_LINK_EXPIRE_DAYS=0.0007  # ~1 minute for testing
```

## Monitoring

Check the API response when requesting a magic link:

```json
{
  "message": "Magic link sent to your email",
  "expires_in_days": 30
}
```

This confirms the currently configured expiration period.

## Migration from Old Version

Previous versions had hardcoded 15-minute (900 second) expiration. To maintain old behavior:

```env
MAGIC_LINK_EXPIRE_DAYS=0.0104  # 15 minutes
```

However, this defeats the purpose of the enhancement. Consider using at least 1 day for practical usability.

## Best Practices

1. **Set based on typical operation duration**: If your nets typically last 8 hours, set to 1 day. If you activate for hurricane season (months), set to 30+ days.

2. **Communicate to users**: Inform your team about the magic link validity period so they know they won't be interrupted during long events.

3. **Review periodically**: After major events, consider whether the expiration period worked well for your operations.

4. **Document your choice**: Add a comment in your `.env` file explaining why you chose that value.

5. **Balance security and usability**: Longer is more convenient but slightly less secure. For emergency operations, operational continuity often outweighs the minimal security risk.

## Related Configuration

- `ACCESS_TOKEN_EXPIRE_MINUTES`: Session token expiration (default: 30 minutes)
- `SECRET_KEY`: JWT signing key (must be secure)
- `SMTP_*`: Email delivery configuration (required for magic links)

## Support

For issues or questions about magic link configuration, see:
- `TROUBLESHOOTING-EMAIL.md` - Email delivery issues
- `README.md` - General setup and configuration
- GitHub Issues - Report bugs or suggest improvements
