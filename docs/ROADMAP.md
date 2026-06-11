# ECT Logger — Product Roadmap

*Last updated: 2026-06-10 (rev 13)*  
*Compiled from user feedback: AA1GM, KC1UIX, W1BKW, W1MTW, KC1JMH*

> **Canonical location:** `docs/ROADMAP.md`. The root-level `ROADMAP.md` is a duplicate and should be deleted.

---

## How to Read This Document

Items are grouped by milestone tier, then by theme within each tier. Each item carries a type tag:

- 🐛 **Bug** — confirmed broken behavior
- 🔧 **Improvement** — working feature that needs polish
- ✨ **Feature** — new capability
- 🔬 **Investigative** — needs reproduction before scoping

Priority within each tier is roughly top-to-bottom. Items from conversations are attributed to their source where useful for context.

---

## Milestone 0 — Infrastructure (prerequisite to everything else)

*These items must exist before the user base grows further. They protect the platform and operator confidence regardless of what feature is being worked on.*

> **Note (2026-06-10):** Milestone 1 bugs were addressed first because several were blocking active nets. Milestone 0 items remain pending and should be scheduled before the user base grows significantly.

### Maintenance Mode

**✨ Maintenance mode — in-app banner and server-side static fallback** *(KC1JMH)*  
Two separate concerns, kept intentionally independent:

---

**1. In-app maintenance banner (DB-backed, Admin UI)**

For use while the app is still running. Admin sets a notice and the app displays it to all users — useful for "expect instability tonight" or "deploying in 10 minutes."

- New **Maintenance Banner** tab in the Admin panel (platform admins only)
- Controls: on/off toggle, message text field, optional scheduled start/end datetime
- When active, displays a dismissible banner sitewide (or a persistent non-dismissible one if the admin prefers)
- Scheduled mode: banner appears automatically at the configured start time and clears at the end time
- No shell access required. No Caddy involvement. Banner state lives in the database or a simple app-level config table.

---

**2. Server-side static maintenance page (flag file + `run.sh`)**

For when the app is actually down — bad deploy, database outage, rendering failure (as seen 2026-06-09). The UI cannot help here; this is an SSH-only operation.

- Static HTML file at `frontend/public/maintenance.html` — no React, no build step, no JS framework, no external dependencies
- Maintenance is controlled via flags on `run.sh` (see below), the consolidated operational script:
  - `./run --maintenance on` (also accepts `true` or `1`) — writes `INSTALL_DIR/maintenance.flag`, optionally writes a `maintenance.json` sidecar with message and ETA, reloads Caddy
  - `./run --maintenance off` (also accepts `false` or `0`) — removes both files, reloads Caddy
  - Short form: `-m on` / `-m off`
- Caddy checks for the flag file on each request; if present, serves `maintenance.html` directly instead of proxying to the backend
- The maintenance page fetches `maintenance.json` if available to display a custom message/ETA; falls back to generic copy if absent
- `.env` variable `MAINTENANCE_MODE=true` as an alternative trigger, useful for Docker deployments where env vars are easier than flag files
- The Admin panel documents this mechanism with the exact commands to run — it does not invoke them

**`run.sh` — consolidated operational script**

`start.sh` and `update.sh` consolidate into a single `run.sh` (also runnable as `./run`). One-time setup scripts (`install.sh`, `configure.sh`, `install-service.sh`, `verify-setup.sh`, `bootstrap.sh`, `migrate.sh`) are unaffected — they stay as-is.

| Invocation | Behavior |
|---|---|
| `./run` | Prompt "check for updates?" with 5-second timeout (defaults to no), then start — same as current `start.sh` interactive behavior |
| `./run --service` | Start in systemd service mode — skips update prompt entirely, same as current `start.sh --service` |
| `./run -u` / `--update` | Run update check and apply if available, **then exit** — does not start the app |
| `./run -m on` / `--maintenance on\|true\|1` | Enable maintenance mode, **then exit** — does not start the app |
| `./run -m off` / `--maintenance off\|false\|0` | Disable maintenance mode, **then exit** — does not start the app |

The `-u`, `-m on`, and `-m off` flags are action-and-exit operations. They never proceed to starting servers. Only bare `./run` and `./run --service` start the application.

The update prompt is intentionally suppressed in `--service` mode to avoid blocking an unattended restart on a partially-baked commit. Updates are the operator's explicit choice, not automatic.

**Migration checklist when `run.sh` is introduced:**
- [x] Add `run.sh` to the repo root
- [x] Update `ectlogger.service` `ExecStart` from `start.sh --service` to `run.sh --service`
- [x] Run `sudo systemctl daemon-reload` after updating the service file
- [x] Verify `sudo systemctl restart ectlogger` starts correctly from the new script
- [x] Keep `start.sh` and `update.sh` in place temporarily with a deprecation notice pointing to `run.sh`, remove in a subsequent release
- [x] Update `docs/PRODUCTION-DEPLOYMENT.md`, `docs/QUICKSTART.md`, and `docs/USER-GUIDE.md` to reference `run.sh`

**Caddyfile pattern (for documentation and `configure.sh`):**
```caddy
@maintenance file INSTALL_DIR/maintenance.flag
handle @maintenance {
    root * INSTALL_DIR/frontend/public
    rewrite * /maintenance.html
    file_server
}
```

**Maintenance page requirements:**
- ECTLogger branding, mode label, custom message if set, ETA if set, admin callsign or status contact
- Must render with zero external dependencies
- Self-hosted instances use this fully independently of `app.ectlogger.us`

### Database Indexes

**✅ Add indexes on frequently sorted/filtered columns** *(KC1JMH)*  
Completed in migration 032. Indexes on `last_active`, `created_at`, `is_active`, and `role` are live on production.

---

## Milestone 1 — Immediate (next release cycle)

*Bugs and friction points blocking real operators during live nets.*

### Auth & Sessions

**🐛 ~~Sessions don't persist across deploys / expire too quickly~~** *(W1MTW, KC1JMH)* — ✅ Done 2026-06-10  
Every deployment resets browser sessions, forcing re-authentication via magic link. Independently, session lifetime is too short for regular users. Fix: implement rolling expiry on the server side (reset TTL on each authenticated request), and make client-side session storage survive deployments. Target: no re-login required for an operator who checks in to a weekly net regularly.

### Net Management Permissions

**🐛 ~~Archive/Delete blocked for net managers and co-managers~~** *(AA1GM)* — ✅ Done 2026-06-10  
Joel (AA1GM) is the primary administrator of a net but clicking Archive does nothing. Net managers and co-managers should have at least the same archive/delete permissions as the NCS of that net. Investigate whether this is a frontend guard or a backend 403. Net ID 20 confirmed affected.

### Check-in Ordering

**🐛 ~~Check-ins display out of chronological order~~** *(AA1GM)* — ✅ Done 2026-06-10  
Entries #6 and #7 in net 20 appear in a different order than they were logged by the NCS. The existing mobile-station promotion feature (intentional re-ordering) is not the cause — Joel confirmed no self-check-ins occurred. Investigate whether account-holder check-ins are being sorted above guest check-ins regardless of timestamp. Pull net 20 logs and compare `checked_in_at` timestamps against display order.

### Chat & UI Polish

**🐛 ~~Emoji reaction popup shifts and reflows chat text~~** *(KC1JMH)* — ✅ Done 2026-06-10  
The emoji picker appears inline rather than as an overlay, causing visible text reflow in the chat panel. Should render as a floating layer (e.g. MUI Popper) that does not affect document flow.

**🔧 ~~Hide emoji picker after net closes~~** — ✅ Done 2026-06-10  
Reaction controls have no purpose on a closed net. Suppress the emoji popup trigger once `net.status === 'closed'`.

**🔧 Activity log minimized by default** *(W1MTW, KC1JMH)*  
Several users found the activity log takes up too much space, especially on mobile. Default the pane to collapsed; the minimize button already exists (`_`). Update initial state only — user preference should persist within the session.

**🐛 ~~Non-square profile photos render sideways~~** *(W1MTW)* — ✅ Done 2026-06-10  
Images with non-square dimensions (e.g. 1920×1080) are displayed rotated. Fixed by applying `ImageOps.exif_transpose()` on the server at upload time — this physically rotates pixel data to match the EXIF orientation tag the camera embedded, which represents the camera's own record of how the photo was taken. The in-browser crop feature (below) remains on the roadmap as the fuller solution.

**✨ In-browser image crop and zoom on upload** *(W1MTW)*  
Replace the raw file-picker upload with a crop UI: after selecting a photo, present a square crop selector with pinch/scroll zoom (similar to Twitter, Discord, etc.). The user positions and sizes their crop region, and only the resulting square is uploaded to the server. This eliminates the sideways-image class of bugs entirely and matches user expectations set by every other platform that accepts avatars. Applies to profile setup and the profile edit page.

**🔬 Mobile responsive UI audit** *(W1MTW)*  
Several issues surfaced on mobile: account setup friction, elements potentially cut off or overflowing the canvas, possible landscape-only layouts, and ambiguous scroll affordances. Conduct a structured review of all primary user flows on narrow viewports (375px baseline): new user onboarding, profile setup, net view, check-in, and chat. Apply mobile UI best practices — no horizontal scroll, touch targets ≥ 44px, clear scroll indicators, no content requiring landscape. File individual bugs from the audit findings.

**🔧 Self-check-in prompt is not obvious enough** *(KC1JMH)*  
Logged-in users who need to check in don't notice the check-in row at the bottom of the screen. Replace the inline prompt with a modal dialog that is clearly dismissible, so new users understand what action is being requested.

**🔧 Net staff self-check-in should not assume NCS role** *(KC1JMH)*  
When a co-manager or NCS-role user loads a lobby or active net page, the current UI assumes they intend to check in as Net Control Station. That assumption is wrong — they may simply be observing or monitoring. The self-check-in dialog (above) should ask: "Check in as Net Control Station or Standard Station?" This prevents accidental NCS takeovers when a second licensed NCS joins a net as a participant. Implement together with the self-check-in dialog improvement above.

### Net Reports

**🔧 Replace raw JSON blob in PDF reports with "PHOTO"** *(KC1UIX)*  
Chat image entries in the PDF report render the full `__CHAT_IMAGE__{...}` JSON string. Replace with the word `PHOTO` or a placeholder. Confirmed at `app.ectlogger.us/nets/22/report`.

### Admin Panel Performance

**🔧 ~~Paginate the Admin users table and slim the list response~~** *(KC1JMH)* — ✅ Done 2026-06-10 (partial)  
Server-side `ORDER BY last_active DESC NULLS LAST` added. Frontend pagination implemented (25/page, 50, or All) using MUI `TablePagination` — filter/sort resets to page 1. Remaining: slim `UserListItem` response schema (still returns full `UserResponse`; low priority until user count grows significantly).

**🔧 Paginate the Archived Nets dialog** — ✅ Done 2026-06-10  
The Archived Nets dialog in the Dashboard now paginates at 25 per page (50 or All options). All existing filter (text search, date range) and sort controls reset to page 1 on change. Added because the archived nets list grows unboundedly as nets are logged and closed each week.

---

## Milestone 2 — Near-term (next 1–2 sprints)

*Improvements that directly affect the quality of the primary use case (running a net).*

### Net History Access

**🔧 Add "View Net" link directly from schedule history pane** *(W1BKW, KC1JMH)*  
Getting to a past net's chat and activity log requires: Schedules → Stats → View Net. Add a direct "View Net" button or row-level link in the history pane of the net stats page to save two clicks. Brad confirmed this in conversation.

**🔧 Chat history accessible outside of net open times** *(W1BKW)*  
Authenticated users want to retrieve chat links and conversation history from past nets without waiting for the next net session. The data already exists in the database. Ensure past net detail pages (including chat log) are accessible to authenticated users at any time, not just during the net window. The archive/circular button flow should be documented more prominently.

### Check-in UX

**🔧 Make mobile-station priority sort configurable** *(AA1GM)*  
The automatic promotion of mobile stations to the top of the check-in list is intentional and appreciated by AA1GM. However, it should be an opt-in toggle on the net settings (on by default) so net managers who prefer strict chronological order can disable it.

### Announcements

**✨ Standalone Announcements dialog for recurring event lists** *(in testing)*  
Allow NCS to maintain a running list of upcoming events to announce each week, separate from the per-net announcement field. This is noted as needing testing before release.

---

## Milestone 3 — Medium-term

*Meaningful new capabilities that don't require architectural changes.*

### User Identity

**✨ "Who is this?" user profile popup** *(KC1JMH)*  
Clicking a callsign or user icon anywhere in the app brings up a dialog showing: larger profile photo, callsign, name (no PII like email), check-in count for this net and across all nets, and current role if any. Visible to authenticated users; guests see callsign only.

### Manager Tooling

**✨ Admin "view as standard user" impersonation mode** *(KC1JMH)*  
A toggle button (padlock icon, near the dark/light mode switch) that strips admin-only UI elements from view without page reload, allowing admins to replicate what a regular user sees. Unlocking restores all admin UI. State is client-side only; no backend impersonation required. Useful for reproducing bug reports and guiding users through the app.

**✨ Post-close chat grace period** *(W1BKW, KC1JMH)*  
Option on net settings to leave the chat open for a configurable window (e.g. 15, 30, 60 minutes) after the net closes. After the grace period, chat goes read-only. Currently under consideration — gather more net manager input before finalizing.

### Multi-Window Support

**✨ "Open in new tab" for Chat and Activity Log panes** *(AA1GM)*  
Allow the chat and activity log floating windows to be popped out into a standalone browser tab, useful for dual-monitor setups. Interim workaround (detach within canvas, span browser window across monitors) should be documented. This is a non-trivial frontend architecture change — scope separately.

### Relaying & Propagation Mapping

**✨ "Can hear" inter-station propagation logging** *(KC1UIX)*  
During a net, NCS and operators need to log not just who NCS can hear, but which stations can hear each other. This data helps ARES teams assign local nets, identify relay chains, and plan for actual incident communications.

The existing "Relay for stations NCS cannot hear" flag captures one direction of this. The new feature would add a "Can hear ___" field on each check-in row, allowing the NCS to record which other stations a given operator has confirmed hearing. Over time this builds a propagation map for the net's coverage area.

Design questions to resolve before implementation:
- Is this a multi-select (station A can hear B, C, and D), or logged as individual directional pairs?
- Should the data be visualized — e.g. overlaid on the check-in map, or as a separate propagation graph?
- Is this logged per-net or aggregated across nets for the same group?

David's use case (YCECT combined repeater/simplex drills) should drive the initial spec.

### Trivia Integration

**✨ Net trivia support** *(back-burner, pending spec)*  
Load trivia questions from a CSV file or URL. During a net, NCS can click a trivia icon on a check-in row to pose a question to that station and log correct/incorrect. Include trivia results in the net log, PDF report, and email summaries. Needs detailed spec before development begins.

---

## Milestone 4 — Longer-term / Architectural

*Items that require significant new infrastructure, platform expansion, or external integrations.*

### Session & Auth Architecture

**🔧 Rolling magic link expiration** *(W1MTW, KC1JMH)*  
TTL resets on each authenticated request so active users stay logged in indefinitely. Users who go weeks between uses re-authenticate at first access. Requires server-side session refresh logic.

### Database Migration Path

**✨ Migrate from SQLite to PostgreSQL ahead of expected growth** *(KC1JMH)*  
ECTLogger runs SQLite today, which is appropriate for a low-concurrency single-server deployment. SQLite serializes all writes; under concurrent net sessions and real-time check-ins from multiple NCS operators at once, this will become a bottleneck. The ORM layer (SQLAlchemy async with `aiosqlite`) already supports PostgreSQL via `asyncpg` — the `DATABASE_URL` env var is the primary code-level change.

Migration plan:
- Provision a PostgreSQL instance on the IONOS VPS (or use a managed instance)
- Run `alembic upgrade head` against the new database
- Write a one-time data migration script to export SQLite rows and import into Postgres (preserve all timestamps and IDs)
- Flip `DATABASE_URL`, restart, smoke-test
- Keep the SQLite file as a backup for 30 days post-migration

**Trigger:** migrate before the user base exceeds ~300 accounts or before any feature requiring high concurrent write throughput (e.g., simultaneous multi-net operation). The expected inbound migration from ham.live's closure makes this a near-term planning item rather than a back-burner one.

### Team Management Module

**✨ Teams — ARES/SKYWARN team roster, training tracking, and ARRL Form 2 support** *(KC1JMH — back-burner)*  

Full spec and design notes: [`docs/concepts/TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md)

Summary: a new **Teams** section (menu between Schedule and Stats) to replace spreadsheet-based ARES/SKYWARN team tracking with a role-controlled, self-service platform. Members manage their own profiles; team managers handle roster, approvals, and reporting. Net participation automatically rolls up to team records. Designed to facilitate ARES Form 2 and EMA hour reporting.

Blocked on: core web app stability, self-hosting, and Docker packaging (see above) being in good shape first.

### Native Desktop Client

**✨ Standalone NCS client application (Windows / macOS / Linux)** *(KC1JMH — back-burner)*  
A packaged desktop GUI application for NCS operators connecting to a hosted or self-hosted ECTLogger instance. Intended for single-operator NCS use; not a server. Targets scenarios where a browser is impractical but a full GUI is available. Proposed repo layout: `clients/windows/`, `clients/macos/`, `clients/linux/` with installable packages per release. Technology decision pending — evaluate Electron, Tauri, or native framework.

### TUI / Packet Client

**✨ Terminal-first NCS client for low-bandwidth and degraded-link operations** *(KC1JMH — back-burner)*  

Full spec and design notes: [`docs/concepts/TUI-PACKET-CLIENT.md`](concepts/TUI-PACKET-CLIENT.md)

Summary: a terminal UI (TUI) client and packet-optimized command protocol for running nets over SSH, local console, or packet radio links (~1200 baud). Two command modes — full terminal and abbreviated packet — with offline command queuing and replay on reconnect. Future phase includes a Winlink gateway for form-based check-in submission. Distinct from the desktop GUI client above: this is the degraded-connectivity and emergency deployment path.

This is separate from the standalone desktop client above. Both are back-burner until the web app and self-hosting are stable.

### Self-Hosting Enhancements

**✨ Docker image for self-hosters**  
Official `Dockerfile` / `docker-compose.yml` for a one-command self-hosted deployment. Publish to Docker Hub alongside each release.

**✨ Net template portability between hosted and self-hosted**  
Allow net templates created on `app.ectlogger.us` to be copied to a self-hosted instance (and vice versa), preserving origin metadata for attribution. Opt-in sharing of logs and net stats between instances.

**✨ Cross-instance user stats sync**  
Users who participate in nets on both hosted and self-hosted instances can opt in to aggregating their check-in stats across both. Requires a federated identity or token-exchange design.

**✨ Resilience against hosted server unavailability**  
Self-hosted instances should degrade gracefully if `app.ectlogger.us` is unreachable or permanently offline. No hard dependency on the hosted server for core net logging functionality.

---

## Parking Lot — Needs More Information

Items that were raised but need clarification, reproduction steps, or a design decision before they can be scheduled.

| Item | Source | Blocker |
|---|---|---|
| ham.live closure — onboarding displaced users | KC1JMH | ham.live is shuttering. No action needed, but inbound user migration is expected. Infrastructure scaling items (DB indexes, pagination, PostgreSQL migration path) have been added to the roadmap in anticipation. Worth monitoring signup rate in coming weeks. |

---

## Out of Scope (Decided)

| Item | Rationale |
|---|---|
| Disabling web self-check-in globally | Net managers can already configure this per-net if needed; a global kill switch is not warranted. |
| Mobile station sort removal | Confirmed intentional and appreciated; making it optional (Milestone 2) is sufficient. |

---

## Feedback Attribution

| Handle | Net role |
|---|---|
| AA1GM — Joel Huntress | Net manager, Maine Dirigo DMR Net |
| KC1UIX — David Lounsbury | YCECT multi-repeater SKYWARN |
| W1BKW — Brian Wall | Regular participant, ham.live nets |
| W1MTW — Mark | Net participant (mobile user) |
| KC1JMH — Brad Brown | Developer / net manager / WSSM Club Secretary / Cumberland County ARES EC |