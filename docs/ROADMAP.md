# ECT Logger — Product Roadmap

*Last updated: 2026-07-31 (rev 51 — pruned "Verify 1-hour reminder send time against the net's scheduled start" (Security & Authentication): confirmed against real production reminder logs that it was NOT already resolved by `f866587`. Two post-fix sends (2026-07-28, 2026-07-30 nets) fired 1h23m and 1h29m before start, not 1h — the `abs(hours_until - reminder_hours) <= 0.5` window fires on the first poll tick anywhere within ±30 minutes of the target, which in practice meant it always caught the early edge. Replaced with a one-sided `NCSReminderService._in_reminder_window()` helper (`reminder_hours - catch_up_hours <= hours_until <= reminder_hours`) shared by the NCS, staff, and subscriber senders for both the 24h and 1h tiers, plus a parametrized unit test covering the real production timestamps. Convention recorded in `docs/DEVELOPMENT.md`'s Date & Time Handling section; user-facing outcome in `docs/CHANGELOG.md`'s 2026.07.30g entry. The "Extend the login session window" item, added to this section in the same rev-44 triage, is untouched and remains open. Rev 50 — pruned "Check-in Grid Quality-of-Life": its one item, freezing the check-in action column during horizontal scroll, deployed to production 2026-07-30, confirming beta sign-off. The desktop/detached table's Actions column and its separate hide-duplicates/detach icon column were merged into a single sticky column (beta testing surfaced that keeping them separate left a permanent empty gap after the action buttons), and a scroll-aware shadow was added on the frozen column's left edge that appears only while there's more hidden to the left and fades out at the true right edge — applied identically to the mobile table. See `docs/CHANGELOG.md`'s 2026.07.30e entry for the user-facing outcome. The section had only this one item, so the heading is removed along with it. Rev 49 — closed out the "Admin Tooling" section: its one remaining bullet, the MFA-enrolled indicator, was entirely blocked on the MFA/TOTP feature anyway, so it moved to live as a "Downstream" note under "✨ MFA / TOTP authenticator support" (Security & Authentication) instead of sitting in its own now-empty section. No code changed; this is a roadmap reorganization only — the section heading is removed since it has no content of its own left. Rev 48 — pruned two of the three "Power-user indicators in the Admin users list" bullets: the NCS indicator (a live `exists` subquery joined into `list_users`, per the app's low-hundreds-of-users scale — no denormalized column, no migration) and the changelog-subscriber indicator (straight readthrough of the existing `notify_whats_new` column) both shipped 2026-07-30. The section stays open with only the MFA-enrolled bullet left, which remains blocked on the MFA/TOTP feature not yet existing — there is no `totp_enabled` column to surface until that lands. Rev 47 — pruned "Net Reminders & Lifecycle UX" entirely: its three remaining items (reminder-email CTA wording, moving the chat-grace-period/schedule-active toggles to the Schedule tab, and the "Create net now" tooltip clarifying it skips auto-schedule) all shipped 2026-07-30, orchestrated as three parallel worktree-isolated agents. See `docs/CHANGELOG.md`'s 2026.07.30b entry for the user-facing outcome. The section's fourth item, auto-check-in, had already been split off to Backburner Ideas in rev 46, so this prune closes the heading out completely. Rev 46 — moved "Auto-check-in for subscribed stations" out of "Net Reminders & Lifecycle UX" into a new "Backburner Ideas" section: the discoverability problem that motivated it (stations not realizing they had to check in manually) is already addressed by the command-bar rewrite, the flashing Check In button, and the check-in prompt dialog, and its scope decision (belt-and-suspenders: NCS enables per-schedule, station opts in per-subscription) is recorded there in case it's revisited. Rev 45 — pruned the "Net Scheduling" section: auto-open lobby before scheduled start deployed to production 2026-07-30 (`efa1785`), confirming beta sign-off. Its user-facing outcome is already in `docs/CHANGELOG.md`'s 2026-07-29 entry ("Automatic lobby opening"), and its implementation conventions live in the Feature Registry at the bottom of `.github/copilot-instructions.md` ("Auto-open lobby before scheduled start" row). "Net Reminders & Lifecycle UX", a separate heading just below it, still has 4 open items and was not touched by this prune. Rev 44 — triaged the Maine Dirigo Net buglog to empty: every remaining field report was either already fixed or is now carried here, and two threads that existed only in the buglog were added to Security & Authentication (login session window, 1-hour reminder send time). Rev 43 — pruned section 0.7, the Maine Dirigo Net field reports, which closes Milestone 0 entirely. Three of the six reports needed no code change: the two mobile/discoverability check-in reports were already resolved by the 2026-07-27 command-bar rewrite (`3e31355`) and its green Check In tint (`026a238`), which landed the day after the reports were filed; the "admin not prompted to check in" report did not reproduce, because the prompt condition in `NetView.tsx` has always OR'd `role === 'admin'` in as an inclusion rather than gating on it; and the chat avatar fallback was fixed on 2026-07-07 by `3859cc9`, so that report was most likely a stale frontend build. The other three shipped 2026-07-29: the archive endpoint had never broadcast a status change at all (a gap pre-dating the 0.4 split, not a regression from it), the staff reminder had no duty-NCS field to begin with, and the subscriber "net starting" notification moved to lobby-open, which also removed a duplicated send block between `/start` and `/go-live` that would otherwise have double-notified. Rev 42 — pruned section 0.6, the post-Milestone-0.4 cleanup: the dead-import sweep and the WebSocket message-type doc reconciliation both shipped. The sweep was widened past the four files the PR review named to all 29 backend files carrying the same debt, and it surfaced a live bug — `send_email_with_attachment` was left unimported by the email-service split, so net log emails failed for any net without chat. Rev 41 — moved section 0.5 into Milestone 2. Its only open item, the Alembic-vs-numbered-scripts decision, was already a stated prerequisite of the PostgreSQL migration, so it now lives there as "Schema Tooling Decision", a sibling prerequisite section alongside UTC-Aware Datetime Hardening, rather than as a separate Milestone 0 section. Milestone 0.1 through 0.4 (the codebase health and modularity program) are done and have been removed; their durable conventions now live in [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) and the shipped user-facing result is in [`docs/CHANGELOG.md`](CHANGELOG.md). Section number 0.7 is kept as-is so commit messages and docs referencing "Milestone 0.4" still resolve.)*  
*Compiled from user feedback: AA1GM, KC1UIX, W1BKW, W1MTW, N1GSK, KC1JMH*

> **Canonical location:** `docs/ROADMAP.md`.

> **Pruning policy:** completed items are removed from this file, not struck through. The changelog is the record of what shipped; this file is the record of what has not. Before deleting an item, confirm its user-facing outcome is in `docs/CHANGELOG.md` and any convention or decision worth keeping has been moved to `docs/DEVELOPMENT.md` or `docs/DESIGN.md`.

---

## How to Read This Document

Items are grouped by milestone tier, then by theme within each tier. Each item carries a type tag:

- 🐛 **Bug** — confirmed broken behavior
- 🔧 **Improvement** — working feature that needs polish
- ✨ **Feature** — new capability
- 🔬 **Investigative** — needs reproduction before scoping

Priority within each tier is roughly top-to-bottom. Items from conversations are attributed to their source where useful for context.

### Model recommendations for sub-agents

As of rev 25, each item carries a **Model:** line recommending which Claude model a sub-agent should use to implement it:

- **Haiku** — single-file, mechanical, precisely specified changes (delete dead code, fix a known line, add a badge column). Safe once the task is spelled out exactly.
- **Sonnet** — multi-file features and refactors that follow an established pattern with a clear spec. The workhorse tier for this codebase.
- **Opus** — architecture, security-sensitive design, data modeling, and anything touching auth/payments/time handling. Also used as a *review gate* on Sonnet work where noted.

Rule of thumb: Haiku and Sonnet can only maintain this codebase safely once files are small and patterns are extracted. That groundwork shipped with Milestone 0.4 (2026-07-06), so Milestone 1 items can now be assigned to smaller models as their **Model:** lines indicate.

---

## Milestone 0 — Codebase Health & Maintainability

*The bulk of this milestone (0.1 confirmed bugs, 0.2 orphaned code, 0.3 guardrails, 0.4 the modularity and componentization program) completed between 2026-07-03 and 2026-07-06 and has been pruned. What it delivered: a test suite and CI pipeline, React error boundaries, WebSocket resilience, SMTP timeouts, IANA timezone validation, composite indexes, shared frontend hooks, `app/permissions.py`, the backend router facades, and the frontend page splits. The patterns those splits established are documented in [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) ("Backend router-split (facade) pattern", "Frontend component-split pattern", "Post-split verification checklist").*

***Milestone 0 is complete as of 2026-07-29.** Every section has shipped and been pruned. Section numbers are not reused, so commit messages and docs referencing "Milestone 0.4" or "Milestone 0.7" still resolve against the changelog. New codebase-health work should open a new section here rather than reopening a pruned one.*

---

## Milestone 1 — Medium-term

*Meaningful new capabilities that don't require architectural changes.*

### Theming

**✨ User-selectable color themes** *(KC1JMH)*  
**Model:** Sonnet for the ThemeContext plumbing, migration, and endpoints; palette curation is a human/Opus taste task; the swatch picker component is Haiku-sized once the THEMES constant exists. *(Note: the existing `ThemeContext.tsx` handles only the dark/light toggle — this feature extends it, it does not exist yet.)*  
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

### Security & Authentication

**🔧 Extend the login session window past 30 days** *(W1BKW, relaying a member request)*  
**Model:** Haiku — a single expiry constant plus the matching copy; no flow changes.  
Operators report having to request a fresh magic link "every week". Sessions are held locally on a 30-day rolling window that resets on each visit, so the reported symptom is really cache clearing, a privacy browser, or switching devices, none of which a longer window fixes. Still worth raising the threshold for the common case, and worth saying plainly in the login screen copy that bookmarking the magic link is the durable option. Do not treat this as a bug report against session handling; the current behavior is working as designed.

**✨ MFA / TOTP authenticator support** *(KC1JMH)*  
**Model:** Opus for the security design (secret at-rest encryption, recovery-code storage/hashing, login-flow changes); Sonnet for implementation against that design. Do not hand any part of this to Haiku — auth mistakes are silent until exploited.  
Let users enroll a TOTP authenticator as a second factor. During enrollment, show **both** the QR code **and** the plain-text preshared secret (base32) with a copy button, so users can store the secret in a password vault (Bitwarden, 1Password) instead of a dedicated authenticator app if they prefer.

Requirements:
- New columns on `User`: `totp_secret` (with at-rest encryption considerations), `totp_enabled` (bool), and storage for backup/recovery codes.
- Enrollment flow: generate a secret, render the QR from an `otpauth://` URI **and** display the secret string with a copy button, then verify a code before enabling.
- Verification step at login (after magic-link / OAuth) when `totp_enabled` is set.
- Backup/recovery codes for account recovery, plus a disable-MFA flow.
- Suggested libraries: `pyotp` for TOTP, `qrcode` for QR generation (or render the `otpauth://` URI to a QR client-side).

**Downstream (was its own "Admin Tooling" roadmap section; folded in here 2026-07-30 since it's entirely blocked on this feature):** once `totp_enabled` exists, add an MFA-enrolled badge to the Admin → Users list (Model: Haiku — a single read of the new column plus a badge column, no query design work) so the operator can see who can participate in authenticated nets. Surface it as a padlock badge consistent with the check-in authentication indicator (see Authenticated nets below). The NCS and changelog-subscriber indicators that shipped alongside this item 2026-07-30 are already live (see `docs/CHANGELOG.md`).

**✨ Authenticated nets — station identity verification via TOTP** *(KC1JMH)*  
**Model:** Sonnet for implementation, with an Opus review gate on the expected-code endpoint (it deliberately reveals a station's current TOTP to NCS — the permission gating and never-send-the-secret rule must be airtight).  
Builds directly on MFA. Adds a per-net "Authenticated net" toggle in the Edit Net settings, with subtext explaining that it lets check-ins prove their identity to net control. When enabled, a checked-in user can read the current code from their authenticator to NCS; an action button on the check-in row shows NCS the **expected** code for that station so they can confirm it matches and mark the station as identity-verified for the net.

Requirements / design questions:
- New `authenticated` (bool) toggle on the net/template, with descriptive subtext in the Edit Net toggles section.
- Action button on check-in rows (NCS-only) that displays the currently-valid expected TOTP for the station's account.
- Server endpoint: given the net and the check-in's user, return the currently-valid expected code(s) with a small skew window — permission-gated to NCS (and possibly Logger). The raw secret must **never** be sent to the client; only the computed code.
- Record an "identity verified" state on the check-in once NCS affirms the match.
- **Authentication status indicator** — each check-in row shows a padlock next to (or overlaid on) the station's profile icon: a closed padlock once identity is verified, an open padlock when it is not. This makes a station's authentication state readable at a glance for everyone viewing the net.
- **Unenrolled stations** — if a user checks into an authenticated net without having enrolled MFA, they simply show the open-padlock (unauthenticated) state. ECTLogger does not block or auto-reject them; it is left to NCS to decide how to respond. The indicator just makes the unauthenticated status visible.
- Verification is only offered on nets flagged `authenticated`; on all other nets no padlock is shown.
- **Dependency:** requires the MFA / TOTP support above to exist first.

### Formal Traffic & Forms (Radiograms)

**✨ Radiogram and form support for handling formal traffic on nets** *(KC1JMH)*  
**Model:** Opus to resolve the design questions and lock the data model (form-definition schema vs dedicated radiogram structure is a decision that is expensive to reverse); Sonnet for each implementation phase; the auto-fill/word-count helpers are Haiku-sized once specced.  
Let NCS and users originate, relay, and deliver formal written traffic (ARRL Radiograms and other standard forms) within ECTLogger, with results stored against the net and retrievable later.

Scope:
- **Forms data model** — a `Form` table for submitted form instances (plus a form-definition / `FormField` template structure), each instance optionally linked to a `Net` so forms can also be filed outside a net. Store submitter, timestamps, form type, and field values.
- **Forms navbar menu** — a new "Forms" section in the navbar to view submitted forms, file a form outside a net, and (admin) add or edit form definitions and their fields.
- **On-net entry** — NCS/users fill a form during a net and the result is stored with that net.
- **Delivery** — forms filled by a user are emailed to that user, reusing the existing SMTP path.
- **Automation to keep entry quick** — auto-fill of date/time fields, automatic word/group count for the radiogram text (the "check"), and validation so operators never hand-count.
- **Stats** — add a "traffic handled" count to per-net stats and global stats, and surface it in the net log / PDF report / email summary.
- **ICS-309 integration** — for nets that have ICS-309 enabled, traffic logged via forms is recorded on the net's ICS-309 communications log, so formal traffic appears alongside the rest of the net's logged activity in the export.

Design questions to resolve before implementation:
- Which forms ship first? ARRL Radiogram (NTS) is the obvious first; ICS-213 general message is a likely second. Are form definitions hardcoded templates or fully admin-editable schemas?
- How is the radiogram modeled — a generic field schema covers ICS-style forms, but the radiogram preamble (number, precedence, handling, station of origin, check, place of origin, time/date) may warrant dedicated structure.
- Is "traffic handled" counted per form submitted, or per piece of traffic by disposition (originated vs. relayed vs. delivered)?
- Retrieval and permissions: who can view a stored form — the submitter, the NCS of that net, admins?
- PDF / printable output for forms, consistent with the existing ICS-309 export pattern.

This is a substantial multi-part feature: sequence the data model + Forms menu first, then on-net entry and email delivery, then the stats rollup.

### Multi-Window Support

**✨ "Open in new tab" for Chat and Activity Log panes** *(AA1GM)*  
**Model:** Opus to scope the architecture (cross-tab state sync, WebSocket sharing or duplication, auth in the popped-out tab), then Sonnet to build. Blocked on the NetView split (Milestone 0.4) — popping panes out of the current monolith would multiply its complexity.  
Allow the chat and activity log floating windows to be popped out into a standalone browser tab, useful for dual-monitor setups. Interim workaround (detach within canvas, span browser window across monitors) should be documented. This is a non-trivial frontend architecture change — scope separately.

### Relaying & Propagation Mapping

**✨ "Can hear" inter-station propagation logging** *(KC1UIX)*  
**Model:** Opus to settle the data-model direction (pairs vs multi-select, per-net vs aggregated — this shapes the schema permanently); Sonnet for implementation; any map/graph visualization is its own Sonnet task afterward.  
During a net, NCS and operators need to log not just who NCS can hear, but which stations can hear each other. This data helps ARES teams assign local nets, identify relay chains, and plan for actual incident communications.

The existing "Relay for stations NCS cannot hear" flag captures one direction of this. The new feature would add a "Can hear ___" field on each check-in row, allowing the NCS to record which other stations a given operator has confirmed hearing. Over time this builds a propagation map for the net's coverage area.

Design questions to resolve before implementation:
- Is this a multi-select (station A can hear B, C, and D), or logged as individual directional pairs?
- Should the data be visualized — e.g. overlaid on the check-in map, or as a separate propagation graph?
- Is this logged per-net or aggregated across nets for the same group?

David's use case (YCECT combined repeater/simplex drills) should drive the initial spec.

### Supporter / Funding Integration

**✨ Optional Ko-fi supporter integration, admin-configured per deployment** *(sustainability)*

**Model:** Phase 1 (config + support page) Sonnet; Phase 2 webhook handler Sonnet **with Opus review** (inbound payment webhooks are an attack surface — token verification, replay, refund handling); Phase 3 (progress bar/copy) Haiku; Phase 4 (About-modal credits) Sonnet.

> **Prerequisite:** *Help Menu and About modal* shipped in rev 22. The subtle "Support" entry point lives inside the About modal.

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

**Phase 4 — Recognition in the About modal** *(not started)*

Top financial supporters and community contributors are acknowledged directly in the About modal — visible to every user, no login required. Two categories:

- **Top Supporters** — operators who have contributed financially via Ko-fi, ordered by lifetime contribution amount. Shown as a short list (e.g., top 5) with callsign and a subtle supporter badge. A "View all supporters" link or secondary dialog lists the full roster.
- **Honorable Mentions** — operators who have contributed invaluable feedback in the form of bug reports and feature requests. This group already exists in the "Feedback Attribution" table at the bottom of this roadmap and should be seeded from that list when the feature ships.

**Data model notes:**
- Top Supporters: derived from the `is_supporter` / donation webhook data added in Phase 2. Lifetime totals require accumulating amounts on the webhook handler (new `donor_lifetime_total` column, or a separate `donations` log table). Display requires explicit opt-in from the donor (a `show_in_credits` flag) to avoid surfacing anonymous tips.
- Honorable Mentions: a lightweight `credits` table (or admin-managed JSON in `AppSettings`) with fields: `callsign`, `name`, `note` (optional), `category` (supporter | contributor). Admins add/remove entries from the Admin panel.

**Implementation checklist** *(not started)*
- [ ] Decide on data source for lifetime totals (accumulate on webhook vs. separate donations log)
- [ ] Add `show_in_credits` opt-in flag to user/donor flow on `/support` page
- [ ] Admin panel: "Credits" section to manage the Honorable Mentions list
- [ ] `GET /api/credits` public endpoint returning top supporters + honorable mentions
- [ ] About modal: "Top Supporters" section (short list) + "Honorable Mentions" section, both collapsed behind a "View contributors" expandable or secondary dialog
- [ ] Seed Honorable Mentions from the Feedback Attribution table in this roadmap at launch

**Trigger:** implement after Phase 2 (donor tracking) is in place. Honorable Mentions can ship independently of Phase 2 since they are admin-curated.

**Trigger:** start after the Help Menu / About modal ships (done). Phase 1 alone satisfies the original goal (a subtle support link); Phases 2–4 are additive and carry no risk to core net logging.

### Trivia Integration

**✨ Net trivia support** *(back-burner, pending spec)*  
**Model:** Sonnet once a spec exists; the spec itself is a human/Opus conversation.  
Load trivia questions from a CSV file or URL. During a net, NCS can click a trivia icon on a check-in row to pose a question to that station and log correct/incorrect. Include trivia results in the net log, PDF report, and email summaries. Needs detailed spec before development begins.

---

## Milestone 2 — Longer-term / Architectural

*Items that require significant new infrastructure, platform expansion, or external integrations.*

### Database Migration Path

**✨ Migrate from SQLite to PostgreSQL ahead of expected growth** *(KC1JMH)*  
**Model:** Opus — data migration with zero-loss requirements, plus an audit-found landmine: several columns store JSON as `Text` (e.g. `User.callsigns`) and enums via SQLAlchemy `Enum` — both need an explicit porting decision for Postgres. The schema-tooling question (Alembic or not) is its own prerequisite section below.  
ECTLogger runs SQLite today, which is appropriate for a low-concurrency single-server deployment. SQLite serializes all writes; under concurrent net sessions and real-time check-ins from multiple NCS operators at once, this will become a bottleneck. The ORM layer (SQLAlchemy async with `aiosqlite`) already supports PostgreSQL via `asyncpg` — the `DATABASE_URL` env var is the primary code-level change.

Migration plan:
- Resolve the schema-tooling decision (see the prerequisite section below)
- Provision a PostgreSQL instance on the IONOS VPS (or use a managed instance)
- Bring the new database to the current schema (`alembic upgrade head` if Alembic is adopted, otherwise create from `models.py`)
- Write a one-time data migration script to export SQLite rows and import into Postgres (preserve all timestamps and IDs)
- Flip `DATABASE_URL`, restart, smoke-test
- Keep the SQLite file as a backup for 30 days post-migration

**Trigger:** migrate before the user base exceeds ~300 accounts or before any feature requiring high concurrent write throughput (e.g., simultaneous multi-net operation). The expected inbound migration from ham.live's closure makes this a near-term planning item rather than a back-burner one.

### Schema Tooling Decision *(prerequisite for the PostgreSQL migration above)*

**🔧 Decide whether to adopt Alembic before the Postgres cutover** *(formerly roadmap item 0.5, "Migration hygiene policy")*  
**Model:** Opus for the decision, Sonnet for execution.

Migrations today are hand-numbered Python scripts in `backend/migrations/`, each run individually against each deployment. That works for SQLite schema tweaks but leaves no versioning record, so a fresh Postgres database has no defined "current schema" to build from. Decide and execute one of two paths before the cutover:

- **Adopt Alembic** — autogenerate an initial revision from `models.py`, stamp the existing production/beta databases as current so they are not re-run from scratch, and convert the run-each-script workflow (including the docs in `backend/migrations/README.md`, `docs/DEVELOPMENT.md`, and the deployment steps in `.github/copilot-instructions.md`).
- **Skip Alembic** — bootstrap the Postgres schema directly from `models.py` and keep the numbered-script convention for incremental changes.

Whichever path is taken, the PostgreSQL migration plan above must be rewritten to match: it currently assumes Alembic.

**Already settled (2026-07-07), keep enforcing:** migrations carry schema changes only, never instance-specific data fixes — a self-hoster must never inherit another deployment's roster seeding. The standing rule lives in the "Migration content guidelines" section of `backend/migrations/README.md`, and it constrains whichever tooling path is chosen. The `013_` numbering collision that prompted the rule is resolved.

### UTC-Aware Datetime Hardening *(prerequisite for the PostgreSQL migration above)*

**🔧 Standardize on timezone-aware UTC datetimes end-to-end** *(KC1JMH)*

**Model:** Sonnet for the mechanical sweep, Opus review before merge (naive/aware bugs pass tests that don't cross a DST boundary). *Audit 2026-07-03 verified scope:* 34 `utcnow` references across 8 files — `auth.py`, `main.py`, `whats_new_service.py`, `ncs_reminder_service.py`, `routers/chat.py`, `routers/check_ins.py`, `routers/nets.py`, `routers/ncs_rotation.py`. Frontend `'Z'`-append workarounds live in `Admin.tsx` (6 sites), `CreateNet.tsx`, and `NetView.tsx`.

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
**Model:** Opus for the module design (new domain model, role system, reporting); Sonnet for phased build-out once designed.

Full spec and design notes: [`docs/concepts/TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md)

Summary: a new **Teams** section (menu between Schedule and Stats) to replace spreadsheet-based ARES/SKYWARN team tracking with a role-controlled, self-service platform. Members manage their own profiles; team managers handle roster, approvals, and reporting. Net participation automatically rolls up to team records. Designed to facilitate ARES Form 2 and EMA hour reporting.

Blocked on: core web app stability, self-hosting, and Docker packaging being in good shape first.

### Native Desktop Client

**✨ Standalone NCS client application (Windows / macOS / Linux)** *(KC1JMH — back-burner)*  
**Model:** Opus (framework selection and packaging architecture). *Review note for Brad — not removing, but flagging for a decision:* this overlaps with the TUI/packet client below and with the browser app itself; a PWA (installable web app with offline caching) might satisfy the "browser is impractical" case at a fraction of the cost of maintaining three native packages. Worth deciding before any work starts.  
A packaged desktop GUI application for NCS operators connecting to a hosted or self-hosted ECTLogger instance. Intended for single-operator NCS use; not a server. Targets scenarios where a browser is impractical but a full GUI is available. Proposed repo layout: `clients/windows/`, `clients/macos/`, `clients/linux/` with installable packages per release. Technology decision pending — evaluate Electron, Tauri, or native framework.

### TUI / Packet Client

**✨ Terminal-first NCS client for low-bandwidth and degraded-link operations** *(KC1JMH — back-burner)*  
**Model:** Opus (protocol design for the packet command mode is the hard part; the TUI itself is Sonnet work afterward).

Full spec and design notes: [`docs/concepts/TUI-PACKET-CLIENT.md`](concepts/TUI-PACKET-CLIENT.md)

Summary: a terminal UI (TUI) client and packet-optimized command protocol for running nets over SSH, local console, or packet radio links (~1200 baud). Two command modes — full terminal and abbreviated packet — with offline command queuing and replay on reconnect. Future phase includes a Winlink gateway for form-based check-in submission. Distinct from the desktop GUI client above: this is the degraded-connectivity and emergency deployment path.

This is separate from the standalone desktop client above. Both are back-burner until the web app and self-hosting are stable.

### Self-Hosting Enhancements

**✨ Docker image for self-hosters**  
**Model:** Sonnet. Note: a fresh Docker install must never execute another deployment's roster fixes — the schema-changes-only rule in `backend/migrations/README.md` ("Migration content guidelines") is what keeps that true, so verify the image's migration step honors it.  
Official `Dockerfile` / `docker-compose.yml` for a one-command self-hosted deployment. Publish to Docker Hub alongside each release.

**✨ Net template portability between hosted and self-hosted**  
**Model:** Opus design (export format, identity/attribution model), then Sonnet.  
Allow net templates created on `app.ectlogger.us` to be copied to a self-hosted instance (and vice versa), preserving origin metadata for attribution. Opt-in sharing of logs and net stats between instances.

**✨ Cross-instance user stats sync**  
**Model:** Opus — federated identity/token exchange is an architecture decision with security consequences.  
Users who participate in nets on both hosted and self-hosted instances can opt in to aggregating their check-in stats across both. Requires a federated identity or token-exchange design.

**✨ Resilience against hosted server unavailability**  
**Model:** Sonnet (mostly an audit task: verify no hard-coded dependencies on the hosted instance, then fix what's found).  
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

## Backburner Ideas

Well-specified but deprioritized — not blocked on information (see Parking Lot for those), just not worth building right now.

**✨ Auto-check-in for subscribed stations on certain nets** *(field request, 2026-07-30)*  
Let a station be automatically checked in on nets they're subscribed to (surfaced via the existing subscription icon), for operators who reliably check into the same recurring net every week.

**Design decision (2026-07-30, KC1JMH):** if revisited, scope is belt-and-suspenders — the NCS/schedule owner must enable auto-check-in on the schedule **and** the individual station must opt in on their subscription. Neither side alone is sufficient.

**Why backburnered:** this request traces back to stations not realizing they needed to manually check in after opening the net view. That underlying discoverability problem has since been addressed directly — the command-bar rewrite, the flashing Check In button, and the check-in prompt dialog all now surface the action itself, which was the actual gap. Revisit only if reports of missed check-ins continue despite those fixes.

---

## Feedback Attribution

| Handle | Net role |
|---|---|
| AA1GM — Joel Huntress | Net manager, Maine Dirigo DMR Net |
| KC1UIX — David Lounsbury | YCECT multi-repeater SKYWARN |
| W1BKW — Brian Wall | Regular participant, ham.live nets |
| W1MTW — Mark Carlson | Net participant (mobile user) |
| N1GSK | Net participant (mobile user), Maine Dirigo Net |
| KC1JMH — Brad Brown | Developer / net manager / WSSM Club Secretary / Cumberland County ARES EC |
