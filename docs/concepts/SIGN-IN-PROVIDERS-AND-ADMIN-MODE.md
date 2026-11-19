# Sign-in Providers and Admin Mode

Last updated: 2026-11-19

Status: both phases merged to main 2026-11-19. Admin mode is in use. Sign-in providers
are shipped but no provider is set up on production yet, and no real Google or
Microsoft sign-in has been tested; its changelog item waits for that (Brad,
2026-11-19). Admin mode is admin-only, so it goes in `docs/CHANGELOG.md` and not in
the in-app changelog or the What's New email.
Replaces [issue #11](https://github.com/bradbrownjr/ectlogger/issues/11) (OAuth sign-in
is a 501 stub).

Two features, built and shipped in this order:

1. **Admin mode.** An admin uses the app as a regular user until they switch to admin
   and enter their two-factor code. Admin mode closes after 15 minutes without an
   admin action, or when they lock it.
2. **Sign-in providers (OIDC).** Sign in with Google, Microsoft, or any OpenID Connect
   provider, set up from the Admin panel.

Admin mode comes first because it is what makes provider sign-in safe for admins: an
admin who signs in with Google enters no code at sign-in, and gets admin access only
by entering one. It is also worth having on its own: today one code at sign-in covers
up to 90 days of admin access on that browser.

## Decisions (Brad, 2026-11-15)

- **Provider sign-in only adds a way in.** Magic link and password sign-in stay as they
  are, for every account, including one first created through a provider. Turning a
  provider off or unlinking it never locks anyone out: magic link to their address
  still works.
- **Password and magic-link sign-in keep their code for admins.** An admin with
  two-factor enters a code at sign-in and again to switch to admin.
- **GitHub is dropped.** Google, Microsoft, and a generic OIDC provider only.
- **Microsoft: both account types.** Personal (outlook.com, hotmail.com) and work or
  school accounts, and an "only my organization" option by tenant ID.
- **A first provider sign-in creates an account**, the same as a first magic link.
  An admin can limit a provider to listed email domains, or turn new accounts off for it.
- **Admins sign in through a provider without a code.** The provider is trusted to have
  checked the person. Every admin action still needs admin mode, which needs a code.
- **Admin mode closes after 15 minutes without activity**, and has a Lock admin
  button. A code for every single admin request was considered and rejected: opening
  the Admin panel alone makes several requests, and a code only changes every 30
  seconds.
- **Admins start every session as a regular user.** This replaces "View as Regular
  User", which only changed what the app showed: the server kept giving full admin
  access the whole time.
- **Configured in the Admin panel, not `.env`.** Self-hosters and admins of every skill
  level must be able to set this up without a terminal.

## Phase 1: Admin mode

### What the user sees

- After signing in, an admin sees the app as any user does. The Admin link and admin
  overrides on other people's nets and schedules are absent.
- The account menu has **Switch to admin**. It asks for the two-factor code (or a backup
  code) and opens admin mode.
- While admin mode is open, an **Admin** chip shows the minutes left in the top bar.
  Clicking it locks admin mode, as does **Lock admin** in the account menu. Either
  reloads the page, so permissions the server worked out for the old mode go away.
- After 15 minutes without activity, admin mode closes. The next admin action asks
  for the code again, then sends the refused request again. The Admin page asks for
  the code when opened outside admin mode, instead of sending the admin away.
- An admin who has not set up two-factor is still sent to set it up at sign-in, as
  before (`mfa_setup_required`), and Switch to admin sends them there too.

### Server

- **Admin mode is held on the server, per browser session**, not per account: opening
  it on a laptop must not open it on the phone in the admin's pocket.
  - Every token gets a random session id claim (`sid`). Rolling renewal
    (`dependencies.py`, the `expiring` branch) carries the `sid` into the renewed token.
    A token from before this change has no `sid`, so its admin mode is simply closed;
    switching to admin issues a token with one.
  - `AdminSession(user_id, sid, opened_at, last_used_at, closed_at, ip, user_agent)`,
    one migration. Open = a row for this `(user_id, sid)` with no `closed_at` and
    `last_used_at` within 15 minutes.
- **One rule decides "acts as admin".** `get_current_user` looks up the admin session
  once per request and records the answer for the request. A single helper, for
  example `acts_as_admin(user)`, replaces each `role == UserRole.ADMIN` check (30 checks
  in 15 files today, including `permissions.py`'s admin override on nets and
  schedules). A test fails when a raw `UserRole.ADMIN` comparison appears outside the
  helper, so a new check cannot bypass admin mode.
  - `user.role` is never changed in memory to fake a regular user: the session could
    commit it.
- **What keeps admin mode open:** any request the admin made themselves, admin or
  not. Requests sent with `X-Background-Request: 1` never do, for the same reason
  they don't update `last_active`: an open tab polling in the background is not an
  admin at work. Counting only requests that used admin powers was considered and
  dropped: the check runs inside synchronous helpers, and most reads never commit,
  so it could not be recorded reliably. The walk-away case is covered either way.
- **The browser learns the closing time** from an `X-Admin-Mode-Closes-At` header
  (ISO time, or `closed`) on every response to an admin.
- **Endpoints**
  - `POST /auth/admin-mode` with `totp_code`: checks it the same way sign-in does
    (`verify_totp_code` or a backup code), opens admin mode, returns the token with a
    `sid` if it lacked one.
  - `DELETE /auth/admin-mode`: Lock admin.
  - `/users/me` adds `admin_mode: { open, closes_at }`.
- **A refused admin request** answers 403 with a fixed detail string,
  `ADMIN_MODE_REQUIRED`, kept in sync with `services/api.ts` the way
  `MFA_SETUP_REQUIRED_DETAIL` already is. The axios interceptor opens the code dialog
  and retries the request after a correct code.
- **Unchanged:** a backup download still needs a fresh code every time, admin mode or
  not. An account with two-factor on still enters its code at password or magic-link
  sign-in, admins included, so such an admin enters a code at sign-in and again to
  switch to admin. Brad chose to keep both (2026-11-15): the sign-in code protects the
  regular account, which can still run nets.
- **Activity log:** `admin_mode.opened` and `admin_mode.locked`, with a label in
  `activityLog.ts`. A wrong code counts toward the existing failed sign-in alerts.

### App

- `AuthContext`: `user.role` stays the real role. A new `isAdmin` is true only while
  admin mode is open, and every place that gates on `role === 'admin'` (31 today) uses
  it. `simulateRegularUser`, the "View as Regular User" menu item, and
  `NetResponse.actions_as_regular_user` are removed: the server now answers as a
  regular user, so `actions` alone is right.
- At the closing time the app asks `/users/me` as a background request, so asking
  does not keep admin mode open.

## Phase 2: Sign-in providers

### Admin setup (Admin, Security tab, "Sign-in providers")

- **Add provider:** Google, Microsoft, or Other (OpenID Connect, by issuer URL).
- **Fields:** on/off, button label, client ID, client secret, Microsoft account type
  (any Microsoft account, or only my organization by tenant ID), allowed email domains
  (optional), and whether a first sign-in may create an account.
- **The client secret is write-only.** It is stored encrypted with
  `auth.py::fernet_for_purpose` under its own purpose, like MFA secrets and backup
  target credentials. Rotating `SECRET_KEY` makes it unreadable, the same as those.
- **Redirect URI with a Copy button**, built from the request so it is right behind
  Caddy. This is the one value an admin pastes into the provider's console.
- **The redirect URI is `<site>/api/auth/providers/<slug>/callback`**, where the slug
  is `google`, `microsoft`, or one the admin picks for an Other provider. It is keyed
  by slug, not the database id, so an admin can register it in the provider's console
  before adding the provider here. Beta's test clients use
  `https://ectbeta.lynwood.us/api/auth/providers/google/callback` and
  `.../microsoft/callback`; production adds `https://app.ectlogger.us/...` to the same
  clients when the branch ships.
- **Test** fetches the provider's discovery document and reports what is wrong
  (unreachable, wrong issuer, no authorization endpoint) before anyone tries to sign in.
- Every change is written to the activity log.

### Sign-in flow

- Login page: one button per enabled provider, listed by a public
  `GET /auth/providers`. The email field and password option stay.
- `GET /api/auth/providers/{slug}/start` redirects to the provider. Authlib keeps the
  `state`, `nonce`, and PKCE `code_verifier` in `request.session`
  (`authlib/integrations/starlette_client/apps.py`, Authlib 1.6.5, the version on beta and production), so `main.py` adds
  Starlette's `SessionMiddleware`: signed with a key derived from `SECRET_KEY`,
  `SameSite=Lax` (the return from the provider is a cross-site page load), HTTPS-only
  on production, path `/api/auth`.
- The callback checks the ID token, finds or creates the account (below), and
  redirects to the app with a short-lived, single-use code. The app trades the code for
  the usual token at `POST /auth/providers/exchange`. The token is never put in a URL,
  where browser history and proxy logs would keep it.
- Providers are read from the database on each sign-in, not registered once at import
  as `routers/auth.py` does today, so a change in the Admin panel applies at once.

### Accounts

- **New table** `UserIdentity(provider_id, subject, user_id, email_at_link, linked_at,
  last_used_at)`. `User.oauth_provider`/`oauth_id` are not reused: magic-link accounts
  keep their address in `oauth_id` (`services/account_email.py`), and it is unique, so
  a provider sign-in would overwrite it and break the next magic link.
- **Which account a sign-in reaches:**
  1. An existing `UserIdentity` for this provider and subject.
  2. Otherwise, an account whose primary or backup address
     (`find_user_by_email`) matches a **verified** address from the provider, which
     links it:
     - Google: only when `email_verified` is true.
     - Microsoft: the subject is `tid` + `oid`, never the email claim. A user who
       has no mailbox can set their Mail attribute to someone else's address, so
       Microsoft says not to identify users by email. Linking by email needs
       `xms_edov` (email domain owner verified) to be true.
     - Other: only when `email_verified` is true.
  3. Otherwise a new account, if the provider allows it and the address is in its
     allowed domains. It is created by `get_or_create_user`'s existing path
     (contact prefill, invited callsign, first account becomes admin).
  4. Otherwise the sign-in is refused with a message saying to sign in another way
     and link the provider from Profile.
- **Profile, Security tab:** linked sign-ins, with Link and Unlink. Link asks the
  server for a start address carrying a ten-minute single-use code
  (`ProviderSignInCode`, purpose `link`), since the start address is a page load that
  can't see the user's token. Linking while
  signed in covers every case step 2 refuses.
- **Account merge** (`services/account_merge.py`) moves `UserIdentity` rows by its
  foreign key, which `test_account_merge.py` already enforces for new user columns.
- **Two-factor:** an account with two-factor on is not asked for its code after a
  provider sign-in. For an admin, admin mode (Phase 1) still is.
- Ban and delete revoke sign-in as they do today. Activity log: a provider sign-in is
  `auth.signed_in` with the provider's label as its method, plus `auth.provider_linked`,
  `auth.provider_unlinked`, `auth.provider_failed`, and
  `admin.sign_in_provider_added`/`_changed`/`_removed` (in the Site settings group).

### Cleanup

- Remove GitHub and the stub routes (`/auth/oauth/{provider}`, its callback, the
  import-time `oauth.register` calls).
- **Keep the six `*_CLIENT_ID`/`*_CLIENT_SECRET` settings in `config.py`, marked
  deprecated and ignored.** pydantic-settings refuses unknown `.env` keys
  (`extra='forbid'` in `pydantic_settings/main.py`, checked against 2.12.0, the version on beta and production), and production's `.env` and every
  self-hoster's copy of `.env.example` still has them, so deleting them would stop
  the server from starting. Log a warning at startup when one is set to a real value.
  Remove them from `.env.example`.
- Close issue #11 and clear its Known Issues row.

## Open questions

1. **Resolved 2026-11-17: Microsoft "any account" needs our own issuer check.** Its
   discovery document gives the issuer as
   `https://login.microsoftonline.com/{tenantid}/v2.0`, a template. Authlib 1.6.5
   (`base_client/async_openid.py::parse_id_token`) compares `iss` to the discovery
   `issuer` word for word unless the caller passes `claims_options`, so every real
   Microsoft token would fail. The callback passes its own `iss` rule for every
   provider: the discovery issuer, with `{tenantid}` replaced by the token's `tid`
   when it has one. Passing `claims_options` drops Authlib's default `iss` check, so
   the rule must always be passed, never only for Microsoft.
   Also from that source: `authorize_access_token` verifies the ID token only when the
   saved state has a nonce (`starlette_client/apps.py`), and PKCE is sent only when the
   client is registered with `code_challenge_method="S256"`. The callback refuses a
   sign-in with no verified `userinfo` rather than trusting the response.
   Still to confirm against a real Microsoft sign-in.
2. **Unverified: does a personal Microsoft account carry `xms_edov`?** Microsoft's
   optional claims reference documents it as a Boolean and doesn't say whether
   personal accounts get it. Community reports (searched 2026-11-17) disagree: one saw
   the string `"1"` in a real personal-account token, another says personal accounts
   never carry it. The code accepts `true`, `1`, `"1"` and `"true"`, and treats
   anything else as unverified, which means a personal account without it can neither
   reach an existing account by email nor create one. Brad's first sign-in with a
   personal account decides whether that needs changing.
3. **Testing needs real client IDs.** Brad registers a test app in Google Cloud Console
   and in Microsoft Entra, both pointed at beta's redirect URI. A generic OIDC
   provider needs a real server too, for example Authentik or Keycloak in Docker on
   Unraid. A hand-written fake is not evidence of how a real provider behaves.
4. **Decided 2026-11-17: work and school Microsoft accounts ship untested.** Brad has
   only a personal Microsoft account to test with, so a work or school sign-in is first
   seen in a real report. They take the same path as a personal account (subject
   `tid:oid`, email trusted only with `xms_edov`); the parts only an organization can
   show are its consent policy (staff may need their admin's approval, which the admin
   page already says) and whether its tokens carry `xms_edov`. If one can't reach an
   existing account by email, linking from Profile > Security still works. Treat a
   report about either as a bug to fix, not a known gap.

## Documentation paths

- **Administrators:** a new how-to for setting up each provider; admin mode on the
  admin pages; the Security tab page.
- **Get started / Operators:** signing in with a provider; linking one from Profile.
- **Reference:** roles and permissions (admin mode), the activity log events.
- **About:** clear the OAuth row from Known Issues.
- **Walkthrough:** check whether any card names "View as Regular User".
- **Roadmap:** an "At a glance" row for each feature while on the branch.

## Changelog drafts (written when each phase ships)

- Phase 1, New Features: `Admin: Admin mode — Admins now use the app as a regular user
  and choose Switch to admin, with their two-factor code, when they need admin tools.
  Admin mode closes after 15 minutes without an admin action, or when you choose Lock
  admin, so a screen left open in a public place no longer carries admin access.`
- Phase 2, New Features: `Sign-in: Use your Google or Microsoft account — Once an
  administrator sets it up under Admin > Security, you can sign in with Google,
  Microsoft or your organization's own sign-in instead of waiting for an emailed link,
  and link one to your account under Profile > Security. Email links and passwords
  work as before.`
