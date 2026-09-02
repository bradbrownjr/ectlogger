# ECTLogger SSH-Hosted TUI Concept (Ideas Doc)

Last updated: 2026-09-02

This document sketches a server-hosted terminal UI for ECTLogger: an operator runs
`ssh ectlogger.us`, authenticates against the app's own user database, and gets a
full-screen terminal interface for checking into and running nets. Nothing is
installed on the operator's machine.

Status: idea capture, not an approved build. Nothing here is committed to a
milestone.

## 1. Problem Statement and Relationship to the Packet Client

Some operators live in a terminal. For them a browser is friction, not convenience:
an SSH session opens faster than a tab, survives on a low-powered or headless box,
works over `mosh` on a flaky link, and needs no local install, no npm, and no
browser-profile juggling on a shared machine.

This is a **convenience and low-friction-access** path. It is explicitly **not** the
degraded-connectivity path.

That distinction matters because the repo already contains
[`TUI-PACKET-CLIENT.md`](TUI-PACKET-CLIENT.md), which specifies a different product
that is easy to confuse with this one:

| | Packet client | SSH-hosted TUI (this doc) |
|---|---|---|
| Where it runs | The operator's machine | Our server |
| Install | Operator installs it | Nothing to install |
| Transport | Packet radio, serial, any link down to ~1200 baud | A working IP link, SSH |
| Auth model | API keys (its Decision A) | Password plus TOTP, later SSH keys |
| Offline queue | Core requirement | Not applicable |

An SSH session needs a working IP link end to end, so this concept does **nothing**
for the ~1200 baud emergency scenario that motivates the packet client. Neither
replaces the other. They may eventually share Textual widgets for rendering a
check-in table, but they do not share a transport, an auth model, or the offline
queue, and their design decisions should not be copied across without re-deriving
them.

## 2. Goals and Non-Goals

### Goals

- Let an operator check into and participate in a net entirely from a terminal.
- Let an NCS run a net from a terminal.
- Authenticate against the existing user database, with no separate account system.
- Add zero risk and zero dependencies to the running web application.

### Non-Goals

- Parity with the web UI. See section 7 for why that is not a bounded target.
- Statistics and reporting in the first milestone.
- Schedule and template authoring. A terminal is a poor place to build a recurrence
  rule.
- The admin panel.
- Anything requiring the packet client's offline command queue.
- Serving low-bandwidth or radio-only links. That is the packet client's job.

## 3. Architecture

**SSH front end.** An `asyncssh` (2.24.0) server listening on a non-22 port. Port 22
on production belongs to the `ectlogger@app.ectlogger.us` deploy account and must not
be touched.

**Session model.** On session open, fork a PTY and run the TUI as a subprocess under
an unprivileged user, pumping bytes between the SSH channel and the PTY master and
forwarding window-change events. This is worth stating explicitly because the obvious
alternative is worse: running the Textual `App` in-process per session behind a custom
driver couples us to Textual's driver internals, and one crashed session can take down
the daemon for everyone. The subprocess approach is framework-agnostic, makes `TERM`
and resize behave the way every terminal program expects, and contains a crash to a
single session.

**UI framework.** Textual (8.2.8), matching the sibling `google-tui` project. A second
language toolchain buys nothing here, because the app runs on our server rather than
on the operator's machine, so single-binary distribution is not a concern.

**Talking to the backend.** All net data and all authentication move over localhost
HTTP against the running backend. The app's inert modules (schemas, enums, display
helpers) are imported directly. Section 5 states the rule that separates the two, and
it is the most important rule in this document.

**Live updates.** One websocket client per session against
`/api/ws/nets/{id}?token=`, which already accepts a JWT as a query parameter and falls
back to guest access on a bad token (`backend/app/main.py`, `websocket_endpoint`).
Note that `active_speaker`, `active_frequency`, and `bulk_check_in_status` are relayed
verbatim and unvalidated by the server, so a TUI session becomes another emitter of
them and should follow the same conventions the web client does.

## 4. Authentication

### The constraint that shapes everything

Of the 68 users in the beta copy of the production database, **one** has a password
set and **one** has MFA enabled. Everyone else logs in by magic link, which is
meaningless without a browser to click into.

So the auth work here is not primarily code. Any milestone that ships SSH access needs
a companion push to get operators to set a password. The endpoint already exists
(`POST /auth/password/set` in `backend/app/routers/auth.py`) and the Profile UI already
exposes it. This is the single most likely reason a working TUI ships and goes unused,
and it should be planned for rather than discovered.

### First milestone: password plus TOTP

`asyncssh` keyboard-interactive collects a callsign or email and a password, then
prompts for a TOTP code when the server answers `mfa_required`.

This is a straight call to `POST /auth/login` (`backend/app/routers/auth.py`). That
handler already implements the generic no-enumeration error string, the five-attempt
lockout with its timed unlock, the deactivated-account check, and the three result
states (`ok`, `mfa_required`, `mfa_setup_required`). **None of it should be
reimplemented.** The lockout logic lives inline in that route handler rather than in a
shared helper, so a second copy is not a refactor, it is a fork that will drift.

Note that `get_admin_user` (`backend/app/dependencies.py`) gates admin routes on
`mfa_enabled` and not merely on role, so any future admin surface in the TUI requires
a working TOTP prompt regardless.

### Later: registered SSH public keys

A `user_ssh_keys` table plus a Profile Security panel, checked from `asyncssh`'s
`validate_public_key` hook. This is the best end state by a wide margin, because
`ssh KC1JMH@tui.ectlogger.us` then just works with no prompt at all, which is what an
SSH-native operator actually expects.

It is deferred only because it is the first thing in this concept that touches the web
application's schema and UI. Everything before it is additive.

### Considered and not planned: email code

Connect as a generic user, enter a callsign or email, receive a short numeric code by
email instead of a magic-link URL, and type it in. This matches the mental model
operators already have and needs no prior setup, which is genuinely attractive given
the password-adoption problem above.

Not planned because it puts an SMTP dependency in the login path: when mail is slow or
undeliverable, nobody can log in at all. Password auth degrades better.

## 5. Modularity Boundary

The constraint is that this must not interfere with the established web application.
Since the code lives in `backend/tui/` rather than a separate repository, that has to
be stated as a rule rather than assumed from the directory layout.

**The rule:**

> `backend/tui/` never opens a database session.

Everything else follows from it, and it is close to self-enforcing. Every function in
`app/permissions.py` is declared `async def (db: AsyncSession, ...)`, so the permission
layer is simply unreachable without a session the TUI is not allowed to have. The code
that must stay server-side is exactly the code that cannot run without a database
handle.

### Import freely

These are inert, have no side effects, and duplicating them is strictly worse:

- **`app.schemas`** (2,108 lines, 121 classes). Validating responses with the real
  response models makes the TUI a typed client for free, and it means an API change
  breaks the TUI at parse time with a clear error instead of at render time with a
  `KeyError` or a silently blank column.
- **The seven string enums in `app.models`**: `UserRole`, `NetStatus`,
  `StationStatus`, `FormDisposition`, `TrafficAction`, `RelayMethod`,
  `TrafficTestCategory`. A duplicated status enum is how the TUI ends up not knowing
  about a status that was added last month.
- **`app.utils` display helpers**: `display_callsign`, `format_time_for_net`,
  `to_display_tz`, `resolve_display_tz`, `redact_contact_info`. Reimplementing these
  is how the TUI formats a callsign or a net time differently from the web app for the
  same record.
- **`app.band_utils.band_from_frequency_string`**, and **`app.config.settings`** for
  the API base URL, so there is no second config file to drift out of sync with
  `backend/.env`.

The React frontend duplicates all of these shapes in TypeScript only because it cannot
import Python. The TUI can, and that is the concrete payoff of putting it in
`backend/tui/` instead of a separate repository.

### Always over HTTP, never by importing

- **Every read and write of net data.** This is load-bearing rather than stylistic.
  `check_ins.py::create_check_in` performs the websocket broadcast *and* the backup-NCS
  auto-grant. A TUI writing a check-in straight to the database skips both, which
  reproduces exactly the failure already documented in this project's agent
  instructions from the `check_in` client-relay incident: the activity log filling with
  new check-ins while the main table never moved. Same bug class, new entry point.
- **All of authentication.** `POST /auth/login` carries the slowapi rate limit, the
  five-attempt lockout, and the `logger.auth_failure()` call that Fail2Ban keys on
  (section 6). Importing `verify_password` directly skips all three.

### Direction stays one-way

`app.*` must never import `tui.*`, and the web application must run correctly with
`backend/tui/` deleted entirely. That rule, not the number of imports going the other
way, is what actually protects the web app.

### Dependencies and process isolation

The TUI's virtualenv is a *superset* of the backend's: importing `app.schemas` pulls
in Pydantic and importing the enums pulls in SQLAlchemy, both already present. So
`backend/requirements-tui.txt` should install `-r requirements.txt` plus `asyncssh`,
`textual`, and any charting extra, while `backend/requirements.txt` stays untouched so
the production web service's dependency set does not grow.

Moving the enums out of `models.py` to avoid the SQLAlchemy import was considered and
rejected: the TUI runs on the same box in the same environment, so it buys nothing and
would refactor the web app purely for the TUI's benefit.

The TUI gets **its own systemd unit**, separate from `ectlogger`. Restarting one must
never restart the other.

## 6. Security and IP Sourcing

Two findings here mean less work than expected, and one is a hard constraint that is
easy to get wrong.

### Fail2Ban needs no new filter

`fail2ban/filter.d/ectlogger.conf` already matches lines of the form:

```
YYYY-MM-DD HH:MM:SS [WARNING] [AUTH] Authentication failed: <reason> - IP: <host>
```

That is exactly what `logger.auth_failure()` emits (`backend/app/logger.py`). A failed
TUI login that goes through `POST /auth/login` produces a matching line automatically,
so the existing `ectlogger` jail bans SSH brute-force attempts as-is.

A second, `asyncssh`-level jail is still worth adding for pre-auth abuse that never
reaches the API at all: connection floods, protocol garbage, and key-scan attempts.

### IP sourcing needs no backend change, with one hard constraint

`get_client_ip()` (`backend/app/security.py`) already trusts `127.0.0.1` as a proxy and
reads the **rightmost** `X-Forwarded-For` hop. So the SSH front end simply sets
`X-Forwarded-For` to the SSH peer address, and the real operator IP lands in the logs,
in the Fail2Ban jail, and in the rate-limit key correctly. No change to
`_TRUSTED_PROXIES` and no change to any route.

**The constraint: the TUI must connect directly to the backend, not through Caddy.**
Caddy appends the peer it actually saw rather than replacing the header, so a proxied
request arrives carrying `ssh-peer, 127.0.0.1` and the rightmost-hop rule correctly
returns `127.0.0.1`. The effect is that every TUI login in the world collapses onto a
single rate-limit bucket and every ban is misattributed to localhost. This is a
requirement, not a preference.

### SSH hardening

- PTY sessions only. No `exec`, no sftp or other subsystems, no `direct-tcpip` port
  forwarding. Everything not explicitly needed is refused.
- Idle timeout and absolute session timeout.
- Per-IP concurrent connection cap.
- Host key generated at install time, with its fingerprint published in the user
  documentation so operators can verify what they are connecting to.

Worth stating plainly as a risk rather than burying it: this puts an internet-facing
SSH daemon on a host that currently exposes only HTTPS through Caddy. That is a real
increase in attack surface, and it is the main argument for keeping this on beta until
it has been exercised properly.

## 7. Scope by Milestone

"Replicate the web UI" is not a bounded task. The frontend is roughly 48,000 lines of
TypeScript and TSX across 166 API routes, and `NetView.tsx` alone is 2,954 lines plus
another 6,004 in `components/netview/`. So each milestone is framed by the operator's
job rather than by a list of pages.

**M1, walking skeleton.** SSH in, authenticate, list active nets, and watch one net's
check-in table update live over the websocket. Read-only. This is deliberately small,
because it is the milestone that answers whether the idea feels good in practice, and
it should not be expensive to abandon.

**M2, participate.** Check in and out, set status, hand-raised, active frequency, and
a chat pane. Registered SSH public key auth lands here.

**M3, run a net.** NCS controls (start, pause, close), role assignment, and traffic
logging.

**Deferred: statistics, schedule authoring, admin, PDF export.**

On statistics specifically: Textual can absolutely draw charts. `textual-plotext`
(1.0.1) wraps `plotext` for full plots, and Textual ships a built-in `Sparkline`
widget. Statistics are deferred as a priority call, not a capability limit, and the
option should stay open.

## 8. Risks

- **Two UIs, one feature set.** Every future net feature then needs a second
  implementation or an explicit "web only" decision. This ongoing cost is larger than
  the initial build and is the strongest argument against the whole concept.
- **New internet-facing SSH daemon** on a host that today exposes only HTTPS. See
  section 6.
- **Server-side session state.** Idle sessions, half-dead TCP connections, and a
  websocket per session all accumulate. Timeouts and caps are required, not optional.
- **Password adoption.** A people problem rather than an engineering one, and the most
  likely reason a working M1 ships and nobody uses it. See section 4.

## 9. Open Questions

- What is the password-adoption strategy: opt-in, prompted at next web login, or
  required in order to use SSH access at all?
- Do self-hosters get this enabled by default, or strictly opt-in?
- Does the hosted instance advertise the SSH endpoint publicly, or share it on
  request?
- Does M2's chat pane need image handling, or does it degrade to a placeholder for
  image messages?
- Does `mosh` support matter enough to influence the session model, given that it
  would need its own UDP port and its own hardening?
