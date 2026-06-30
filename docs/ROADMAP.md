# ECT Logger — Product Roadmap

*Last updated: 2026-06-30 (rev 21)*  
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

## Milestone 1 — Medium-term

*Meaningful new capabilities that don't require architectural changes.*

### Theming

**✨ User-selectable color themes** *(KC1JMH)*  
Allow users to choose a named color theme for the app from a hand-curated palette library. Each theme is a coordinated light/dark pair — selecting it works with the existing dark/light mode toggle automatically. Themes are per-user with a system-wide default that admins can change from the Admin panel.

**Palette source**  
**[Jam3/nice-color-palettes](https://github.com/Jam3/nice-color-palettes)** (MIT) — 1,000+ five-color palettes curated from ColourLovers. From the full library, a small set of themes will be hand-picked: one light-mode palette and one complementary dark-mode palette per color family (blues, greens, reds, purples, etc.). Attribution to Jam3 / Experience Monks is required in the app's About or Settings UI per the MIT license terms.

**Theme structure**  
Each named theme bundles a `light` and `dark` variant derived from Jam3 palettes in the same color family. MUI `createTheme()` maps the palette's primary and accent colors to `primary.main` and `secondary.main`; everything else (typography, spacing, component overrides) inherits from the base theme. The dark/light toggle remains a separate user preference that selects which variant of the active theme renders.

**Preference hierarchy**  
1. **User preference** — stored in `users.theme` (nullable string, e.g. `"ocean"`, `"forest"`). Null means "follow the system default."  
2. **System default** — stored in `app_settings` (existing key/value config table) under key `default_theme`. Admins can change this from a new Theme tab in the Admin panel. Ships set to `"ectlogger-blue"` (the current `#1976d2` palette) so no visible change for existing deployments.

When a user clears their preference or a new user registers, they automatically inherit whatever the admin has set as the system default. If the admin later changes the system default, only users with `users.theme = null` are affected.

**Admin panel**  
New "Themes" section in the Admin panel. Admins see the same swatch picker that users see, plus a "Set as system default" button. The current system default is highlighted with a badge. Changing it takes effect immediately for all users on the system default.

**Implementation checklist** *(not started)*  
- [ ] Curate the theme set: pick light + dark palette pairs per color family from Jam3 library
- [ ] Define `THEMES` constant (token → `{ name, light: MuiPaletteOptions, dark: MuiPaletteOptions }`)
- [ ] Add `theme` column to `users` table (migration)
- [ ] Add `default_theme` key to `app_settings` (seed or migration)
- [ ] Expose `GET /settings/theme` (public — needed before login for guests) and `PUT /admin/settings/theme` (admin only)
- [ ] Add `PUT /users/me` support for `theme` field (already exists, just add the field)
- [ ] Wrap app in a `ThemeContext` that resolves user → system → hardcoded fallback
- [ ] Theme swatch picker component (reused in both Profile and Admin panel)
- [ ] Add attribution credit in About / Settings footer

### Net Scheduling

**✨ Auto-open lobby before scheduled start** *(KC1JMH)*  
Add a per-schedule setting (e.g. "Open lobby X minutes before start time") that automatically transitions a scheduled net into Lobby mode without requiring the NCS to click a link. The NCS could still open the lobby manually at any time — this is an optional server-side trigger for groups that always open the net at the same offset before their formal start. Requires:
- New `auto_lobby_minutes` column on `NetTemplate` (nullable; null = disabled)
- UI toggle + number input in the schedule editor (Net Settings tab)
- Background task in the reminder/scheduler service to fire the transition at the right time
- Guard to skip if the net is already in Lobby/Active state

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

### Help Menu and User Onboarding Walkthrough

**✨ Replace "Docs" nav link with a Help menu** *(discoverability)*  
The current "Docs" link in the navbar is a bare external link. Replace it with a Help menu containing four options:
- **User Guide** — external link to documentation (existing behavior)
- **Start Walkthrough** — launches the guided UI tour (works for new and returning users)
- **Submit Feedback** — opens the in-app bug / feature request form (see below)
- **About ECTLogger** — modal showing version, license credits (including Jam3 palette attribution), GitHub link

**Guided walkthrough**  
A step-by-step tour of the main UI surfaces using a library such as `react-joyride` or `driver.js`. Highlights key elements (Dashboard, check-in form, net view, Schedule Statistics, Profile Activity) with descriptive callouts. Auto-triggers for new users on first login (flag stored in `users` table or localStorage); re-triggerable at any time from the Help menu. Lets existing users self-serve when they encounter unfamiliar features rather than needing to label every icon.

**In-app feedback form (bug reports and feature requests)**  
A "Submit Feedback" option in the Help menu opens a modal form. Users select a type (Bug Report or Feature Request), write a subject and description, and submit. On submission the backend emails every user with `role = ADMIN` on the instance using the existing `email_service`. The email includes the submitter's callsign, name, and email address so admins can follow up directly. The form is available to all authenticated users; no account-level permissions gate it. No external issue tracker or third-party service is involved — the email is the artifact.

**Implementation checklist** *(not started)*
- [ ] `POST /api/feedback` endpoint — accepts `type` (bug/feature), `subject`, `body`; reads all `role = ADMIN` users from the DB; sends one email per admin via `email_service`
- [ ] Email template: plain and readable, includes submitter callsign / name / email, feedback type badge, subject, and full description body
- [ ] Frontend `FeedbackModal.tsx`: type selector, subject field, description textarea, submit button with loading state; accessible from the Help menu
- [ ] Add "Submit Feedback" as the third item in the Help menu dropdown (between Start Walkthrough and About ECTLogger)
- [ ] Rate-limit the endpoint to prevent accidental or deliberate email floods (e.g., 5 submissions per user per hour)

### Supporter / Funding Integration

**✨ Optional Ko-fi supporter integration, admin-configured per deployment** *(sustainability)*

> **Depends on:** *Help Menu and About modal* (above). The subtle "Support" entry point lives inside the About modal, so this item is sequenced to land **after** that ships.

A subtle, never-obtrusive, never-gated way for operators to help cover an instance's hosting and development costs. ECTLogger stays 100% free; support is a quiet opt-in side door, not a paywall, modal, or nag. Because ECTLogger is open source and self-hosted by others, this ships as a **generic integration any operator can point at their own Ko-fi account from the Admin panel** — never hardcoded to one account, and disabled by default so a fresh clone shows nothing until configured.

**Platform decision — Ko-fi, single platform.**  
Ko-fi is the choice for US-based operators specifically: it lets a creator link **both Stripe and PayPal** side-by-side, while Buy Me a Coffee is Stripe-only and Stripe US cannot process PayPal — disqualifying it for the older, PayPal/Venmo-trusting ham audience. Ko-fi also takes **0% on one-time tips** (only the ~2.9% + $0.30 processor fee) and 5% on recurring memberships unless the operator pays Ko-fi Gold ($6/mo). Running two platforms at once was explicitly rejected: it creates donor choice-paralysis, double webhook maintenance, and fragmented goal tracking. (Source: design conversation, June 2026.)

**Deployment-configurable settings (open-source requirement).**  
New columns on the `AppSettings` singleton (see DEVELOPMENT.md "AppSettings singleton pattern"), all editable from a new **Support / Funding** section in the Admin panel (gated by the existing `role != ADMIN → 403` check):

| Setting | Type / default | Public read? | Purpose |
|---|---|---|---|
| `kofi_enabled` | bool, default `false` | yes | Master switch; gates the entire feature |
| `kofi_username` | string, nullable | yes | Builds the Ko-fi page / widget URL |
| `kofi_webhook_token` | string, nullable | **no — write-only** | Verifies inbound webhooks |
| `kofi_hosting_goal_amount` | int, nullable | yes | Monthly progress-bar target (per deployment) |
| `kofi_hosting_goal_currency` | string, default `USD` | yes | Goal display currency |
| `kofi_support_message` | text, nullable (may be blank) | yes | Operator's own pitch; blank renders a sensible default |

**Secret handling:** the public `GET /settings` response (readable before login) must **never** return `kofi_webhook_token`. Expose a boolean `kofi_webhook_configured` instead; the raw token is settable only via the admin `PUT`. The Admin panel also displays this deployment's fixed webhook URL (`https://<your-host>/api/webhooks/donations`) for the operator to paste into their own Ko-fi dashboard.

**Phase 1 — Config + subtle surface** *(not started)*
- [ ] Migration: add the six `kofi_*` columns to `AppSettings`
- [ ] Extend `AppSettingsResponse` / `AppSettingsUpdate` schemas and the `PUT /settings` handler, enforcing the write-only rule for `kofi_webhook_token`
- [ ] Admin panel "Support / Funding" section (set values; show the deployment webhook URL)
- [ ] "Support" link added inside the **About modal** — the single quiet entry point (no nags, no buttons beside action controls)
- [ ] `/support` view: renders `kofi_support_message` (or default copy) plus the Ko-fi widget; renders **only when `kofi_enabled`**
- [ ] Add `.github/FUNDING.yml` here and across the other ham repos (`hamalert-notifier`, `skywarn-activation-alerts`, `pktnet`, `radiomail.info`, etc.) for the native GitHub Sponsor button

**Phase 2 — Supporter recognition ("sparkle")** *(not started)*
- [ ] Migration: add `users.is_supporter` (bool) and `users.supporter_expires_at` (nullable, tz-aware UTC)
- [ ] `routers/donations.py`: `POST /api/webhooks/donations` — verify the configured `kofi_webhook_token`, match payload `email` to `User.email`, set the flag (one-off tip → expires in 30 days; subscription → persists until a cancel/expiry event)
- [ ] Daily expiry sweep that clears lapsed one-off sparkles (follows the existing `*_service.py` background pattern)
- [ ] Surface `is_supporter` in the WebSocket user payload (`online_users`) and relevant user serializers
- [ ] `UserAvatar.tsx`: conditional supporter style — a subtle gold ring with a soft glow and a periodic shine sweep, kept lightweight for the real-time UI. One component change propagates to Chat, NetView, Navbar, Profile, and NCSStaffModal
- [ ] Decide edge cases: donor email ≠ account email (offer a "link my donation" note on `/support`); refunds/chargebacks strip the sparkle; anonymous tips count toward the goal but earn no sparkle

**Phase 3 — Transparency** *(not started)*
- [ ] Monthly progress bar driven by `kofi_hosting_goal_amount` (use Ko-fi's native goal widget first; build custom only if styling demands it)
- [ ] Honest cost framing in the default `/support` copy: real monthly hosting figure, "always free" reassurance, and the "independent dev lab funds a suite of ham tools" ecosystem framing (the HamStudy / SignalStuff model)
- [ ] Open Collective deferred — revisit only if donation volume ever justifies a public ledger

**Trigger:** start after the Help Menu / About modal ships. Phase 1 alone satisfies the original goal (a subtle support link); Phases 2–3 are additive and carry no risk to core net logging.

### Trivia Integration

**✨ Net trivia support** *(back-burner, pending spec)*  
Load trivia questions from a CSV file or URL. During a net, NCS can click a trivia icon on a check-in row to pose a question to that station and log correct/incorrect. Include trivia results in the net log, PDF report, and email summaries. Needs detailed spec before development begins.

---

## Milestone 2 — Longer-term / Architectural

*Items that require significant new infrastructure, platform expansion, or external integrations.*

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

### UTC-Aware Datetime Hardening *(prerequisite for the PostgreSQL migration above)*

**🔧 Standardize on timezone-aware UTC datetimes end-to-end** *(KC1JMH)*

**Background.** The app already stores concrete net instants (`Net.scheduled_start_time`, `started_at`, `closed_at`, etc.) in UTC and renders them per-user in local time. The fragility is *how* UTC is represented in the code: today it is **naive UTC by convention**. On SQLite, `DateTime(timezone=True)` silently drops the offset, so a value written as "UTC" comes back as a naive `datetime`. The backend leans on this (boundary helpers return naive UTC; comparisons use the deprecated `datetime.utcnow()`), and the frontend papers over it by appending `'Z'` before parsing (`CreateNet.tsx`, `NetView.tsx`). The June 2026 reminder bug was one symptom of this naive/aware ambiguity.

**Why this blocks PostgreSQL.** SQLite ignores timezone info; **PostgreSQL does not.** A `DateTime(timezone=True)` column maps to `timestamptz`, which stores a true instant and returns **tz-aware** datetimes. Under Postgres:

- Writing a naive datetime to `timestamptz` makes the driver (`asyncpg`) assume the server/session timezone — which may not be UTC — silently corrupting the stored instant.
- Reading returns tz-aware values, so any lingering `naive == aware` comparison (e.g. against `datetime.utcnow()`) raises `TypeError: can't compare offset-naive and offset-aware datetimes`.

In other words, the SQLite→Postgres migration will **break time handling app-wide** unless this is resolved first. This item is therefore a prerequisite, not a nice-to-have.

**Target design (works on both SQLite and PostgreSQL):**

- Introduce a single `UTCDateTime` SQLAlchemy `TypeDecorator` used by every datetime column:
  - On **bind** (write): require/assume UTC, store as a tz-aware value on Postgres (`timestamptz`) and as a normalized naive-UTC value on SQLite.
  - On **result** (read): re-attach `tzinfo=timezone.utc` to values coming back naive from SQLite, so the rest of the app *always* receives tz-aware UTC regardless of backend.
- Replace every `datetime.utcnow()` with `datetime.now(timezone.utc)` (also resolves the Python 3.12 deprecation). Grep targets: `routers/*.py`, `ncs_reminder_service.py`, `whats_new_service.py`, `auth.py`.
- Keep `template_local_to_utc()` as the conversion boundary for recurrence-rule projections — but have it return tz-aware UTC once the decorator is in place.
- Serialize datetimes via `.isoformat()` (yields `+00:00`) and **remove the frontend `'Z'`-append workarounds**; standardize parsing in one `parseUtc()` helper on the client.

**Implementation checklist** *(not started)*
- [ ] Add `UTCDateTime` TypeDecorator in `models.py` (or a `app/types.py`) and switch all datetime columns to it
- [ ] Replace all `datetime.utcnow()` calls with `datetime.now(timezone.utc)`
- [ ] Audit every `naive vs aware` comparison; remove the defensive naive/aware branches (e.g. `routers/nets.py` lobby logic)
- [ ] Update `template_local_to_utc()` and reminder service to produce/consume tz-aware UTC
- [ ] Remove `'Z'`-append hacks; add a single `parseUtc()` client helper and route all scheduled-time parsing through it
- [ ] Verify on SQLite (existing) **and** a scratch PostgreSQL instance: round-trip a scheduled net, a reminder projection, and an import/ICS-309 export
- [ ] Sequence this **before** flipping `DATABASE_URL` in the PostgreSQL migration

**Trigger:** complete alongside (and ahead of) the PostgreSQL migration. Low user-visible risk if done carefully; high risk if deferred until after the Postgres cutover.

### Team Management Module

**✨ Teams — ARES/SKYWARN team roster, training tracking, and ARRL Form 2 support** *(KC1JMH — back-burner)*  

Full spec and design notes: [`docs/concepts/TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md)

Summary: a new **Teams** section (menu between Schedule and Stats) to replace spreadsheet-based ARES/SKYWARN team tracking with a role-controlled, self-service platform. Members manage their own profiles; team managers handle roster, approvals, and reporting. Net participation automatically rolls up to team records. Designed to facilitate ARES Form 2 and EMA hour reporting.

Blocked on: core web app stability, self-hosting, and Docker packaging being in good shape first.

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
| ham.live closure — onboarding displaced users | KC1JMH | ham.live is shuttering. No action needed, but inbound user migration is expected. Infrastructure scaling items (DB indexes, PostgreSQL migration path) have been added to the roadmap in anticipation. Worth monitoring signup rate in coming weeks. |

---

## Out of Scope (Decided)

| Item | Rationale |
|---|---|
| Disabling web self-check-in globally | Net managers can already configure this per-net if needed; a global kill switch is not warranted. |
| Mobile station sort removal | Confirmed intentional and appreciated; making it optional (Milestone 1) is sufficient. |

---

## Feedback Attribution

| Handle | Net role |
|---|---|
| AA1GM — Joel Huntress | Net manager, Maine Dirigo DMR Net |
| KC1UIX — David Lounsbury | YCECT multi-repeater SKYWARN |
| W1BKW — Brian Wall | Regular participant, ham.live nets |
| W1MTW — Mark | Net participant (mobile user) |
| KC1JMH — Brad Brown | Developer / net manager / WSSM Club Secretary / Cumberland County ARES EC |
