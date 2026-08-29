# Password Login & Two-Factor Authentication

Magic link remains the default sign-in method. Password login is an opt-in fallback for
when outbound email is unavailable and a magic link can't be retrieved at all — added after
a hosting-provider email outage locked users out entirely. TOTP-based MFA is optional for
regular accounts and required for administrators.

## Login identifier

Password login accepts either a callsign or an email address in one `identifier` field,
disambiguated by the presence of `@` (`app/routers/auth.py::_find_by_identifier`). Both are
looked up case-insensitively (email lowercased, callsign uppercased before the query).

## Password storage

Hashed with `bcrypt` directly (`app/auth.py::hash_password`/`verify_password`) — not
passlib's `CryptContext`, which is broken against modern `bcrypt` releases in this
environment (`passlib` calls `bcrypt.__about__.__version__`, which no longer exists; verified
against the venv in this repo before building on it). Passwords are capped at 72 bytes at
the schema layer (`PasswordSetRequest`/`PasswordLoginRequest` in `schemas.py`) since bcrypt
silently ignores anything past that.

## Password complexity policy

Self-service and admin-set passwords (`PasswordSetRequest.new_password`) go through
`app/auth.py::validate_password_strength`: at least 12 characters, with at least one
lowercase letter, one uppercase letter, one digit, and one special character. This is an
industry-standard composition policy, enforced as a Pydantic field validator on
`PasswordSetRequest` (`schemas.py`) so both the self-service `/auth/password/set` route and
any future caller of that schema get the same rule for free. Mirrored client-side in
`frontend/src/components/profile/SecurityTab.tsx::getPasswordStrengthError` for instant
feedback; the backend validator is the actual enforcement point.

This rule does not apply to admin-issued one-time temporary passwords
(`generate_temporary_password`, `POST /users/{id}/password/reset`) — those are random
`secrets.token_urlsafe` strings never typed by a human, shown once, and meant to be replaced
via `/auth/password/set` (which does enforce the policy) on first use.

## Account lockout

Five failed password attempts (`MAX_FAILED_PASSWORD_ATTEMPTS` in `app/auth.py`) locks the
account for 15 minutes (`PASSWORD_LOCKOUT_MINUTES`), tracked via
`User.failed_password_attempts`/`password_locked_until`. Resets to zero on a successful
login or password change. This is separate from, and in addition to, the IP-based rate
limiting and fail2ban jail below.

Login errors are deliberately generic (`GENERIC_LOGIN_ERROR` in `routers/auth.py`) — no
distinction between "no such account," "no password set," and "wrong password," to avoid
account enumeration.

## Two-Factor Authentication (TOTP)

- **Library**: `pyotp` for TOTP generation/verification, `qrcode[pil]` for server-rendered
  QR codes (returned as a base64 PNG data URI — the frontend needs no QR library).
- **Secret storage**: `User.mfa_secret_encrypted`, Fernet-encrypted with a key HKDF-derived
  from `SECRET_KEY` under a purpose label distinct from any other use of `SECRET_KEY`
  (`app/auth.py::_MFA_SECRET_PURPOSE`), so rotating one doesn't affect the other.
  `decrypt_mfa_secret` returns `None` on any failure (corrupt data, or `SECRET_KEY` was
  rotated since enrollment) rather than raising — callers treat that the same as "not
  enrolled."
- **Backup codes**: 8 codes (`BACKUP_CODE_COUNT`), each `secrets.token_hex(5)` (40 bits of
  entropy), stored as SHA-256 hashes in `User.mfa_backup_codes` (plain SHA-256 is
  intentional — there's nothing to brute-force from a hash of 40 random bits, unlike a
  user-chosen password). Single-use: consumed and removed from the list on success.
- **Enrollment**: `POST /auth/mfa/setup/start` mints and persists a secret immediately (not
  yet enabled — survives a page refresh mid-setup), `POST /auth/mfa/setup/confirm` verifies
  the first real code and flips `mfa_enabled`, minting backup codes shown once.
- **Replacing a lost authenticator**: `POST /auth/mfa/replace/start` (proven by account
  password, not a TOTP code — that's the point, the old device is gone) stages a new secret
  in `User.mfa_pending_secret_encrypted` so an abandoned attempt never strands the working
  secret; `POST /auth/mfa/replace/confirm` swaps it in and re-mints backup codes.
- **Disabling** (non-admin only): `POST /auth/mfa/disable`, password-gated.

## Where MFA is enforced

Two independent gates, both in `app/dependencies.py::get_admin_user`:

1. **At login** (`app/routers/auth.py::_resolve_mfa`, shared by `/auth/login` and
   `/auth/magic-link/verify` since MFA must apply regardless of first factor): an admin
   without `mfa_enabled` gets `mfa_setup_required` — a token IS issued, but every admin-only
   route stays blocked until enrollment (see next point). An account with MFA enabled (admin
   or not) that supplies no/wrong code gets `mfa_required` and no token.
2. **On every admin-only route** (`get_admin_user`): raises 403 with
   `MFA_SETUP_REQUIRED_DETAIL` if `not current_user.mfa_enabled`, regardless of how the
   admin authenticated. This is what makes MFA actually mandatory, not just requested at
   login — an admin can't route around it by using an old un-refreshed session. The
   frontend matches this exact string (`api.ts::MFA_SETUP_REQUIRED_DETAIL`) to redirect to
   the enrollment screen instead of showing a generic access-denied error. **Keep the two
   strings in sync if either changes.**

For non-admin accounts, MFA is opt-in — but once a user enables it, it's enforced at login
the same way. An "optional" second factor that's silently skipped after being turned on
would be worse than not offering it at all.

## MFA recovery paths

- **Self-service, non-admin**: a backup code works in place of a TOTP code at login. Losing
  the device entirely: use the replace flow (password-gated) from Profile > Security.
- **Admin, another admin available**: `POST /users/{user_id}/mfa/reset` (admin-only,
  `routers/users.py`) clears the target user's MFA enrollment. An admin cannot reset their
  own MFA this way — trivially defeats "MFA mandatory for admins."
- **Admin, no other admin exists**: `backend/scripts/reset_admin_mfa.py <callsign-or-email>`,
  run on the server. Deliberately requires host/SSH access, not just an app session —
  recovering from "the only admin lost their phone" should need more than a web login.

## Password recovery paths

- **Self-service**: `POST /auth/password/set` (Profile > Security), requires the current
  password if one is already set.
- **Admin-initiated**: `POST /users/{user_id}/password/reset` (admin-only) generates a
  one-time temporary password, shown once in the API response and never logged. The
  affected user only gets a "your password was changed" email — never the password itself.

## Rate limiting

Per-route `slowapi` limits (same pattern as `routers/feedback.py`), on top of the app-wide
default of 200/minute/IP (`app/main.py`):

| Route | Limit |
|---|---|
| `POST /auth/magic-link/request` | 5/hour |
| `POST /auth/magic-link/verify` | 20/minute |
| `POST /auth/login` | 10/minute |

## Fail2Ban integration

No new logging infrastructure was needed — `app/logger.py`'s `auth_failure`/`auth_success`/
`rate_limit`/`banned_access` methods already write the exact format
`fail2ban/filter.d/ectlogger.conf` expects, and `app/security.py::get_client_ip` already
trusts only the rightmost `X-Forwarded-For` hop from a trusted proxy. The new login and MFA
routes just call the existing methods. See `docs/FAIL2BAN.md` for jail setup.

## Database columns (migration `065_add_password_mfa.py`)

Added to `users`: `password_hash`, `failed_password_attempts`, `password_locked_until`,
`mfa_enabled`, `mfa_secret_encrypted`, `mfa_backup_codes`, `mfa_pending_secret_encrypted`.
