---
name: magic-link
description: Generate a working ECTLogger magic-link login URL for any email on beta/alpha, without sending real email. Use when asked to "make/generate a magic link", "log in as <email> for testing", or when SMTP is disabled in the target environment (beta/alpha).
---

# Magic Link Generator (beta/alpha testing)

Mints a valid ECTLogger magic-link login URL for any email address, no SMTP required.

This works because magic-link tokens are stateless: `create_magic_link_token()`
(`backend/app/auth.py`) just signs the email string with
`itsdangerous.URLSafeTimedSerializer(SECRET_KEY)` under salt `"magic-link"`.
No DB row is written and no email needs to send to mint a valid token — the
normal `POST /auth/magic-link/request` endpoint only wraps this call plus an
email send; calling `create_magic_link_token` directly skips the email step
entirely.

## When to use

- User wants to log in as a specific email to test roles/permissions
  (NCS, Logger, guest, non-admin owner, etc.).
- Target environment's SMTP is intentionally disabled (beta points at
  `127.0.0.1` on purpose — see copilot-instructions.md) so the real
  "request magic link" flow always 500s.

## Scope guardrail

Only generate links for **beta** or **alpha** without asking further —
these are non-production test environments.

**Never generate a production magic link without explicit confirmation
first.** It creates a real, working login session for that user's actual
account on `app.ectlogger.us`.

## Steps

1. Determine target environment and backend path:

   | Env | Host | Backend path |
   |---|---|---|
   | beta | same host as this session, no SSH needed | `/home/bradb/ectlogger/backend` |
   | alpha | `bradb@10.6.26.6` | `/home/bradb/ectlogger/backend` |
   | production | `ectlogger@app.ectlogger.us` | `~/ectlogger/backend` (confirm with user before using) |

2. Run (prefix with `ssh <host>` for alpha/production):

   ```bash
   cd <backend_path> && source venv/bin/activate && python3 -c "
   from app.auth import create_magic_link_token
   from app.config import settings
   token = create_magic_link_token('<EMAIL>')
   print(f'{settings.frontend_url}/auth/verify?token={token}')
   print(f'Expires in {settings.magic_link_expire_days} days')
   "
   ```

3. Return the printed URL. Mention it logs straight in as `<EMAIL>` —
   recommend opening in an incognito window / separate browser profile so
   it doesn't collide with the operator's own session.

## Notes

- Default token expiry is 30 days (`MAGIC_LINK_EXPIRE_DAYS` env var,
  `backend/app/config.py`).
- If `<EMAIL>` has no existing user account, the link still works — the
  account is created on first verify via `get_or_create_user`, which only
  runs inside `POST /auth/magic-link/verify` (triggered when the frontend
  `/auth/verify` page loads with the token).
- Pure token minting: no database writes, no outbound email, fully
  reversible (token just expires after 30 days if unused).
