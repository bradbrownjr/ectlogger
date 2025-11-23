# Testing Magic Link Expiration Configuration

## Test Plan

### Prerequisites
- Backend running with updated code
- SMTP configured and working
- Test email account accessible

### Test 1: Default 30-Day Expiration

1. **Configuration**
   ```env
   MAGIC_LINK_EXPIRE_DAYS=30
   ```

2. **Steps**
   - Request magic link at login page
   - Check email for magic link
   - Verify email says "This link is valid for 30 days"
   - Click link and verify successful login

3. **Expected Results**
   - ✅ Email received with "30 days" expiration text
   - ✅ Link works immediately
   - ✅ Login page shows "Magic links are valid for 30 days" message
   - ✅ API response includes `"expires_in_days": 30`

### Test 2: Short Expiration (1 Hour)

1. **Configuration**
   ```env
   MAGIC_LINK_EXPIRE_DAYS=0.0417  # ~1 hour
   ```

2. **Steps**
   - Restart backend: `./start.sh`
   - Request new magic link
   - Check email

3. **Expected Results**
   - ✅ Email says "This link is valid for 1 hours" (note: will round to integer hours)
   - ✅ Link works within 1 hour
   - ⏰ Link expires after ~1 hour (test by waiting)

### Test 3: One Day Expiration

1. **Configuration**
   ```env
   MAGIC_LINK_EXPIRE_DAYS=1
   ```

2. **Steps**
   - Restart backend
   - Request magic link
   - Check email

3. **Expected Results**
   - ✅ Email says "This link is valid for 24 hours"
   - ✅ Link works immediately

### Test 4: Extended 60-Day Expiration

1. **Configuration**
   ```env
   MAGIC_LINK_EXPIRE_DAYS=60
   ```

2. **Steps**
   - Restart backend
   - Request magic link
   - Check email

3. **Expected Results**
   - ✅ Email says "This link is valid for 60 days"
   - ✅ Login page shows updated expiration time
   - ✅ API response includes `"expires_in_days": 60`

### Test 5: Expired Link

1. **Setup**
   ```env
   MAGIC_LINK_EXPIRE_DAYS=0.0007  # ~1 minute
   ```

2. **Steps**
   - Restart backend
   - Request magic link
   - **Wait 2 minutes**
   - Try to use the link

3. **Expected Results**
   - ❌ "Invalid or expired magic link" error
   - ✅ User can request a new link
   - ✅ New link works

### Test 6: Production Deployment

1. **Configuration**
   ```env
   MAGIC_LINK_EXPIRE_DAYS=30
   FRONTEND_URL=https://your-domain.com
   ```

2. **Steps**
   - Deploy to production (Debian/LXC)
   - Request magic link via HTTPS
   - Verify email links use HTTPS
   - Test on mobile device

3. **Expected Results**
   - ✅ Email contains HTTPS link
   - ✅ Link works on mobile
   - ✅ Session persists across page refreshes
   - ✅ Access token expires after 30 minutes (independent of magic link)

## API Response Testing

### Request Magic Link

```bash
curl -X POST http://localhost:8000/api/v1/auth/magic-link/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

**Expected Response:**
```json
{
  "message": "Magic link sent to your email",
  "expires_in_days": 30
}
```

### Verify Token

Use the token from email URL:
```bash
curl -X POST http://localhost:8000/api/v1/auth/magic-link/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "TOKEN_FROM_EMAIL"}'
```

**Expected Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "email": "test@example.com",
    "role": "user"
  }
}
```

## Email Template Validation

Check that the email HTML includes:

1. **Dynamic expiration text**:
   - "This link is valid for 30 days" (or configured value)
   - Bold text styling: `<strong>This link is valid for 30 days.</strong>`

2. **App name**: Should use configured `APP_NAME`

3. **Link formatting**: 
   - Blue button with "Sign In" text
   - Plain text link below for copy/paste
   - Both should use `FRONTEND_URL` from config

4. **Footer message**: "If you didn't request this email, you can safely ignore it."

## Integration Testing

### Scenario: Hurricane Activation (Long Event)

1. **Day 0**: Configure for 45 days
   ```env
   MAGIC_LINK_EXPIRE_DAYS=45
   ```

2. **Day 0**: Operators request magic links before storm

3. **Day 1-7**: Active incident logging
   - Operators can log in throughout the week
   - No re-authentication needed
   - Session tokens refresh as needed (30-min expiry)

4. **Day 30**: Still operational
   - Original magic links still work
   - Can track long-duration recovery operations

5. **Day 46**: Links expire
   - Old magic links no longer work
   - Operators request new links if still needed

### Scenario: Weekly Net (Short Event)

1. **Configuration**: 7 days
   ```env
   MAGIC_LINK_EXPIRE_DAYS=7
   ```

2. **Monday**: Request link for tonight's net

3. **Monday evening**: Use link to access system

4. **Following Monday**: Request new link (weekly routine)

## Security Validation

### Test: Token Reuse Prevention

1. Request magic link
2. Use link once (should work)
3. Try to use same link again
4. **Expected**: Second use should fail or create new session (verify behavior)

### Test: Invalid Token

1. Request magic link
2. Modify the token in URL
3. Try to use modified link
4. **Expected**: "Invalid or expired magic link" error

### Test: Rate Limiting

1. Request magic links rapidly (>200 in 1 minute)
2. **Expected**: Rate limit error after threshold

## Regression Testing

Verify existing functionality still works:

- ✅ OAuth login (Google/Microsoft/GitHub)
- ✅ WebSocket connections with JWT
- ✅ Net creation and management
- ✅ Check-in logging
- ✅ Real-time updates
- ✅ Role-based access control
- ✅ Email notifications

## Performance Testing

### Load Test: Magic Link Requests

```bash
# Install wrk: brew install wrk (macOS) or apt install wrk (Linux)
wrk -t4 -c100 -d30s --latency \
  -s test_magic_link.lua \
  http://localhost:8000/api/v1/auth/magic-link/request
```

**Expected**:
- Response time < 500ms
- No errors under normal load
- Rate limiting engages appropriately

## Monitoring

### Logs to Check

Backend logs should show:
```
INFO: Magic link requested for: user@example.com
INFO: Magic link sent successfully (expires in 30 days)
INFO: Magic link verified for: user@example.com
```

### Metrics to Track

- Magic link request rate
- Verification success rate
- Token expiration errors
- Email delivery failures

## Rollback Plan

If issues arise:

1. **Revert expiration to 15 minutes** (old behavior):
   ```env
   MAGIC_LINK_EXPIRE_DAYS=0.0104
   ```

2. **Restart services**:
   ```bash
   sudo systemctl restart ectlogger
   ```

3. **Clear user sessions** (if needed):
   ```bash
   # In Python console
   from app.database import SessionLocal
   # Clear sessions or instruct users to re-login
   ```

## Success Criteria

- ✅ Configuration changes expiration time correctly
- ✅ Email template shows dynamic expiration
- ✅ Login page displays configured expiration
- ✅ Links work within expiration period
- ✅ Links fail after expiration
- ✅ API returns correct `expires_in_days` value
- ✅ No regression in existing features
- ✅ Production deployment works with HTTPS
- ✅ Mobile devices work correctly

## Known Limitations

1. **Fractional days < 1**: Display as hours (integer rounded)
2. **Session tokens**: Still expire after 30 minutes (independent of magic link expiration)
3. **Email delivery**: Depends on SMTP configuration
4. **Timezone**: Expiration calculated in UTC

## Documentation Verification

Ensure all documentation is updated:

- ✅ `README.md` - Configuration example added
- ✅ `.env.example` - MAGIC_LINK_EXPIRE_DAYS documented
- ✅ `MAGIC-LINK-CONFIGURATION.md` - Complete guide created
- ✅ `backend/app/config.py` - Setting added with comment
- ✅ `backend/app/email_service.py` - Dynamic expiration implemented
- ✅ `frontend/src/pages/Login.tsx` - User-facing message added

## Post-Deployment Checklist

After deploying to production:

1. [ ] Verify MAGIC_LINK_EXPIRE_DAYS in production `.env`
2. [ ] Test magic link request/verify flow
3. [ ] Check email template rendering
4. [ ] Verify HTTPS links in emails
5. [ ] Test on multiple devices/browsers
6. [ ] Monitor logs for errors
7. [ ] Inform users of new extended expiration
8. [ ] Update team documentation if needed

## Support Contacts

For issues or questions:
- GitHub Issues: Report bugs or feature requests
- Email: (your support email)
- Documentation: `MAGIC-LINK-CONFIGURATION.md`
