# ECT Logger — Product Roadmap

*Last updated: 2026-08-20*  
*Compiled from user feedback: AA1GM, KC1UIX, W1BKW, W1MTW, N1GSK, KC1JMH*

> **Canonical location:** `docs/ROADMAP.md`.

> **Pruning policy:** completed items are removed from this file, not struck through. The changelog is the record of what shipped; this file is the record of what has not. Before deleting an item, confirm its user-facing outcome is in `docs/CHANGELOG.md` and any convention or decision worth keeping has been moved to `docs/DEVELOPMENT.md` or `docs/DESIGN.md`. This file does not keep a per-prune narrative of what was removed or why — that history lives in `docs/CHANGELOG.md` (user-facing outcome) and git history (implementation detail), not here.

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

### Security & Authentication

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

### Public Service Event Support

**✨ Tactical-callsign posts, shift staffing, and event management for public service events** *(KC1JMH, from a Manchester ARES request via Ken)*

**Model:** Opus for Phase 1-2 (new domain model, and a change to what `CheckIn.callsign` means app-wide); Sonnet for Phases 3-6 build-out against the settled design; **Opus review gate on Phase 1** before merge, since every statistics, export, and dedup path reads that column.

Full spec and design notes: [`docs/concepts/PUBLIC-SERVICE-EVENTS.md`](concepts/PUBLIC-SERVICE-EVENTS.md)

Marathons, bicycle rides, dog sled races, and parades are a structurally different kind of net from an ARES exercise or a SKYWARN spotter net. Amateur operators ride alongside public volunteers in SAG vehicles, at checkpoints, and at start and finish lines. **A station is a place, not a person:** "AID 3" is a table at mile 14 that exists from 06:30 to 16:00 and is worked by whoever is standing there — three different licensed operators over a fourteen-hour ride, a dozen over a four-day sled race.

ECTLogger cannot serve those events today. A check-in typed as a tactical designator links to no user, so the operator earns no credit for their work — the original complaint that prompted this item. There is also no way to plan or track who staffs a position across a rotation, which is what an event manager spends their weeks doing.

**The two facts that shape the design.** The position and the operator are separate, and both must be recorded: the position is what the net calls on the air, while the operator is who gets credit and who is legally responsible, since FCC 97.119 permits tactical calls but still requires each station to identify with its own FCC callsign every ten minutes. And the event manager is a distinct user with distinct needs — staffing the net rather than running it, weeks before the event and again after it.

**Vocabulary decision.** The words *coverage*, *tactical callsign*, *operating position*, *staff*, and *position* are all already spent in this codebase (RF propagation, the per-person `User.callsigns` alias list, the Home/Field classifier, the NCS eligibility pool, and a rotation sort integer respectively). This feature uses **Post** and **Shift** throughout, and never a bare `post` identifier in backend code.

**Key decisions, argued in full in the concept doc:**
- An event is a `NetTemplate` (the reusable plan) plus one `Net` per ICS operational period. No new top-level entity.
- The check-in row carries the **operator's own FCC callsign**, plus a post reference supplying the designator; it renders and exports as designator-then-callsign. This is the only option that gives operator credit with zero changes to the statistics layer, and the only one that does not corrupt recheck dedup.
- Shifts are **materialized rows**, deliberately unlike the computed NCS rotation, because an event is a 2-D sparse assignment with no generating function and every assignment carries state that cannot be recomputed.
- Unlicensed volunteers get a shift and appear on every staffing surface, but never a check-in row — they are not operating a station.

**Phase 1 — Posts on a net, and honest operator credit** *(not started)*
- [ ] Migration `061_`: `net_posts` table; `net_post_id` and `post_designator` columns on `check_ins`
- [ ] `NetPost` model and `PostCategory` enum; post CRUD plus drag-reorder in a new `routers/nets_posts.py`
- [ ] Check-in resolves and stamps the post; a post-designator match takes precedence over the `User.callsigns` alias auto-link so nobody hijacks a post from their profile
- [ ] ICS-309 and net CSV render designator-then-callsign; legacy rows export byte-identically
- [ ] Close the validation hole: `CheckInUpdate.callsign` has no pattern and allows 50 chars while create enforces `^[A-Z0-9/]+$` at 20 — an inline edit can write a value a create rejects
- [ ] Post picker on the check-in dialog, prefilling the callsign from the covering shift
- [ ] Relabel Profile "additional callsigns" to Alias Callsigns, dropping the word "tactical"

**Phase 2 — Shifts, Assignment Board, and gap detection** *(not started)*
- [ ] Migration `062_`: `net_post_shifts`; `ShiftStatus` enum
- [ ] `backend/app/events/gaps.py` — pure, database-free gap computation, unit-testable without a session
- [ ] Assignment Board page at `/nets/:netId/posts` with a CSS Grid station-by-time grid. **No calendar library** — every candidate is 100-400 kB and resource-hostile for a layout that is sixty lines of CSS
- [ ] Native HTML5 drag-and-drop with the required arrow-button and keyboard fallbacks

**Phase 3 — Live board, sign-in and sign-out, day-of accountability** *(not started)*
- [ ] Sign-in and sign-out endpoints creating and closing the linked check-in
- [ ] Live Post Board NetView panel with an UNMANNED badge and unmanned-first sorting
- [ ] The `NetRole` bridge — signing in to a net-control post grants NCS, or a marathon staffed entirely from the board looks NCS-less and auto-pauses
- [ ] Per-net opt-in toggle so ordinary weekly nets are untouched

**Phase 4 — Reusable event plans and notifications** *(not started)*
- [ ] Migrations `063_`/`064_`: `event_posts` with default shift patterns; `net_post_reminder_logs`
- [ ] Copy posts on **all three** net-creation paths, not just the obvious one
- [ ] `event_post_reminder_service.py` following the `NCSReminderService` pattern, including cross-service deduplication so an operator who is also on-duty NCS gets one email rather than three
- [ ] Tokenized accept and decline from the offer email, no login required
- [ ] "Materialize the next N operational periods" — without it a multi-day race planned six weeks out cannot be staffed

**Phase 5 — ICS-204, ICS-205, and hours reporting** *(not started)*
- [ ] `events/ics204.py` and `events/ics205.py`, each a single-source-of-truth dict builder so CSV and PDF cannot drift
- [ ] Print views and PDF export through the existing mechanism; roster and hours CSV sharing a row-builder with the on-screen table
- [ ] Hours and mileage per operator; Posts and Staffing section in the net report

**Phase 6 — Multi-day series, adoption, and polish** *(not started)*
- [ ] Event-series rollup across nets sharing a template; roster carry-forward between operational periods
- [ ] Opt-in, human-confirmed adoption tool for historical tactical strings. **Never rewrite a closed net's log** — it is an ICS record that may already have been filed
- [ ] Per-post equipment checklists; ICS-217 if still wanted

**Documentation deliverables** *(not started)* — these ship **with** the phases, not after. Until then no user-facing guide may describe this feature as available.
- [ ] New `docs/EVENT-MANAGER-GUIDE.md` — the audience is the event communications lead, not the NCS. Planning a course and its posts, recruiting and assigning, chasing gaps, race-morning sign-in, handling no-shows, and post-event hours and forms. Drafted alongside Phase 2 and completed at Phase 5, linked from the README documentation index and `docs/USER-GUIDE.md`
- [ ] `docs/USER-GUIDE.md` — a Public Service Events section covering checking in at a post, shift sign-in and sign-out, and responding to an assignment offer, plus the Alias Callsigns relabel in the profile section
- [ ] `README.md` — a Public Service Events entry in the feature list and the new guide in the documentation index
- [ ] `docs/DEVELOPMENT.md` — the `net_post` / `event_post` naming rule, the materialized-shift decision, and the fourth polling service note
- [ ] `docs/DESIGN.md` — Assignment Board grid conventions and the Post Board panel's place among the NetView side panels

**Trigger:** Phase 1 alone satisfies the original request and can ship independently; it is also the phase carrying the `CheckIn.callsign` semantics change, so it wants the Opus review gate before merge. Phases 2-3 are what make the feature usable for a real event. Phases 4-6 are what make it reusable year over year. Sequence Phase 4's multi-period materialization before any dog sled race pilot.

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

### Schedule Visibility & Calendar

**✨ Month calendar view on the Schedule page, and calendar subscription** *(KC1JMH)*  
**Model:** Sonnet for the month view and the single-event link (Phases 1-2, established UI patterns against one new read endpoint); **Opus for Phase 3**, the subscribable feed — its URL must be fetchable by Google's unauthenticated servers, which makes it an auth design task rather than a UI one.  

Two related capabilities. The first is a **month grid on the Schedule page** with next/previous month arrows, showing which nets fall on which day and, where the schedule has a rotation, who is NCS. The second is **getting a net onto the operator's own calendar** so it shows up next to the rest of their week.

Today the Schedule page (`frontend/src/pages/Scheduler.tsx`) lists *schedules*, not *occurrences* — it answers "what nets exist" but not "what is happening this month." The view-mode `ToggleButtonGroup` at `:582-600` already offers card and list, so calendar is a third button in an affordance that exists. (Note `CalendarMonthIcon` is already imported at `:51` and in use for the date-sort toggle at `:577` — the calendar view needs a different icon, or two adjacent groups show the same glyph.)

**The month grid is a union of two sources, and the seam is today.** Past days come from real `Net` rows — what actually happened, whether it was held, who actually ran it, how many checked in. Today and forward come from materialized `Net` rows where they exist, and from projections where they do not, since `_get_or_create_scheduled_net` only materializes about 24 hours ahead. Projections use the existing `calculate_schedule_dates` plus `compute_anchored_ncs_schedule` (`backend/app/routers/ncs_schedule.py`).

Two rules fall out of that and both are load-bearing:

- **Never project into the past.** `calculate_schedule_dates` filters `d >= start_date` (`ncs_schedule.py:110`) and `get_ncs_schedule` starts at `datetime.now()` (`ncs_rotation.py:234`), so the computed path cannot look backwards at all. That is the correct boundary, not a limitation to fix — a projection onto a past date would assert a net was held that may have been cancelled, and would name an NCS who never served. Do not "enable" previous months by backdating `start_date`.
- **A real row always beats a projection for the same slot**, or a day cell shows the same net twice. This is the same collision already fixed once for manual creation (commit `4034f1f`).

**One aggregate endpoint, not the current fan-out.** `fetchSchedules` (`Scheduler.tsx:119-143`) already issues one `getNextNCS` request per schedule. That is N requests to answer one question, and a month view asks it for every occurrence of every schedule — repeating the pattern means N requests on every arrow click. This needs a single `GET` returning the whole window across all visible schedules in one response.

**Performance is the non-obvious risk.** `compute_anchored_ncs_schedule` regenerates every occurrence from the template's creation date up to the requested window on each call (`ncs_schedule.py:174-179`), because the rotation index is a count of elapsed occurrences. Paging a three-year-old weekly schedule out to a month next year generates hundreds of dates, per template, per click — and the cost grows with both the template's age and how far the user pages. Compute one window for all templates in a single pass, cap the paging range, and treat the anchor-to-index offset as cacheable.

**Naming: this is the third collision in this codebase, and the worst one.** *ICS* here means **Incident Command System** — ICS-309 has shipped, ICS-204 and ICS-205 are planned above. An "Export ICS" button or an `ics.py` module would be read as an incident form export by precisely the emergency-management audience this product serves. Use **iCalendar** and **Calendar Feed** in labels and `ical_feed.py` in code. Never "ICS file."

**Phase 1 — Month view** *(not started)*
- [ ] New aggregate read endpoint returning occurrences across all visible schedules for a date window, merging real `Net` rows with projections and suppressing a projection wherever a real row already covers the slot
- [ ] Calendar as a third view mode on the Schedule page, honoring the existing filter and favorites state, with next/previous month arrows
- [ ] Month grid in CSS Grid — seven columns, six rows. **No calendar library**, consistent with the Assignment Board decision above
- [ ] Render all four states `NCSScheduleEntry` already distinguishes: normal rotation, override, fifth-week, and **cancelled**. A cancelled occurrence must appear struck through, never silently omitted, or the reader concludes the net is on
- [ ] Past days render actual outcome (held, cancelled, check-in count) and link to the net report; future days link to the schedule
- [ ] Mobile falls back to an agenda list via `useLayoutTier` — a month grid is unreadable at 375 px
- [ ] Decide and document the display timezone. Recommend the **viewer's** zone via `resolve_display_tz` (`backend/app/utils.py:87`), since the question being asked is "am I free that evening"; the Schedule page already labels times in the browser zone. This is deliberately the opposite of the Assignment Board, which uses the net's zone — record the divergence so it does not later read as an inconsistency bug

**Phase 2 — Add one net to a calendar** *(not started)*
- [ ] "Add to calendar" on a net and on a schedule occurrence, emitting a Google Calendar template URL and a downloadable `.ics` for everyone else. No backend and no new dependency
- [ ] Populate title, start and end, location or frequency, and a link back to the net

**Phase 3 — Subscribable calendar feed** *(not started)*
- [ ] Per-user feed of their subscribed schedules, offered as both `https` and `webcal://`. This is the version that actually pays off for a recurring net: it keeps updating as schedules change and the rotation advances
- [ ] **Auth design first.** Google fetches feed URLs unauthenticated, so the URL carries a per-user secret token. It must be revocable and regenerable from Profile, must expose nothing the user cannot already see, and must not accept a session cookie as an alternative. Same class of decision as the tokenized accept/decline question in the events spec
- [ ] Emit concrete events per occurrence over a bounded forward window rather than a recurrence rule — each occurrence carries a different NCS in its summary, and cancellations and overrides are sparse exceptions a recurrence rule cannot express cleanly
- [ ] Decide whether to add a Python iCalendar dependency or emit the text directly; `backend/requirements.txt` has neither today
- [ ] Document in the user guide that Google refreshes subscribed feeds on its own schedule, often 12 to 24 hours, so a same-day edit will not appear immediately. Without this line it will be reported as a bug

**Documentation deliverables** *(not started)*
- [ ] `docs/USER-GUIDE.md` — the calendar view, adding a net to a personal calendar, and subscribing to a feed including how to revoke the link
- [ ] `README.md` — feature list entry once Phase 1 ships
- [ ] `docs/DEVELOPMENT.md` — the past-versus-projected boundary rule and the iCalendar naming rule

**Trigger:** Phase 1 stands alone and delivers most of the value. Phase 2 is small and independent. Phase 3 should not start until someone actually asks for a live-updating subscription, since it adds a permanently reachable unauthenticated URL to the attack surface for a convenience the first two phases mostly cover.

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

Also carries the Teams-dependent half of "can hear" station-to-station coverage logging (shipped 2026-08-02, see `CHANGELOG.md`) — named team locations (shelters, EOCs), location-to-location coverage, and Coverage Assessment reporting for team managers. See `TEAM-MANAGEMENT-NOTES.md` section 5.6; the per-net capture it builds on has already shipped and is not blocked by this module.

Blocked on: core web app stability, self-hosting, and Docker packaging being in good shape first.

### Offline-Capable Web Client (PWA)

**✨ Keep logging a net when connectivity drops, and sync on reconnect** *(KC1JMH)*  
**Model:** Opus for the sync and conflict design — this is a distributed-state problem, and the conflict rule below has a real data-loss failure mode. Sonnet for implementation once the design is settled.

An NCS running a net from a field site, an EOC on generator, or a rural home should be able to keep logging check-ins through a connectivity outage, with queued changes replayed when the link returns. Other participants should see that the NCS has gone offline and that net updates will resume once connectivity is restored, rather than silently watching a frozen net.

Offline operation in the browser requires a service worker to cache the app shell, which makes this a PWA. **This resolves the PWA-vs-native question previously flagged under Native Desktop Client below:** the offline requirement is the strongest driver for that work, and a PWA satisfies it without maintaining three native packages. Treat the PWA as the path forward and the native desktop client as likely redundant.

**Groundwork already in place.** Every check-in mutation now applies the server's authoritative single-row response to local state rather than re-reading the whole list (`frontend/src/components/netview/checkInActions.ts`), and a status change paints optimistically and rolls back on failure. "Refetch everything after a write" cannot work offline — there is nothing to refetch from — so that single-row apply is the reconcile primitive this feature builds on. Optimistic update is the same mechanism with the round trip deferred from milliseconds to minutes.

Reconnect resilience also shipped separately: the net socket now reconnects indefinitely, reconnects immediately when the browser reports `online`, and resyncs everything on reconnect via the `netResync` event — check-ins, roles, stats, can-hear, chat, activity log, and traffic. See DEVELOPMENT.md "Reconnect and resync". That covers *recovery* from an outage; it does not cover *working through* one.

**The PWA is the last piece, not the first.** A service worker is strictly required for only two things: cold-starting the app with no network, and surviving a reload mid-outage. Everything else people actually want during a net works in a plain page with the tab already open — IndexedDB needs no service worker, and neither do `online`/`offline` detection or the resync above. The realistic ARES/SKYWARN failure is not "the NCS opens a laptop with no internet"; it is "the NCS is mid-net and the link drops for ten minutes with the tab already open." Stage the work accordingly: durable queue and conflict handling first, service worker and installability last. Doing it in the other order spends the expensive effort on the rarer case.

**Prerequisites, in rough dependency order:**

1. **Client-generated IDs.** The server assigns `check_in.id` today. A check-in created offline has no id, so a queue cannot reference it and it cannot be edited before reconnect. A client-side UUID has to be carried through the model and honored by the create endpoint — this is a schema and API change, not a frontend detail.
2. **A durable queue.** Optimistic state is in-memory and does not survive a refresh, tab close, or crash — precisely the conditions a field deployment hits. Needs IndexedDB with an explicit replay order.
3. **A conflict rule.** This is the sharp edge, not a detail. `create_check_in` (`backend/app/routers/check_ins.py`) rejects with 400 "already checked in" when a callsign's latest row is not `CHECKED_OUT`. Two NCS operating offline on the same net will both log the same callsigns, and on reconnect the second operator's queued creates get rejected wholesale. This needs a merge policy decided up front; retry-with-backoff makes it worse, not better.
4. **Deferred-rollback UX.** A rollback 200 ms after a click is invisible. A rollback twenty minutes later, after the operator has moved on and the net has advanced, needs a reconciliation review screen showing what could not be applied and why. A toast is useless at that timescale.

**The offline-presence signal.** `backend/app/net_pause.py` already computes "no NCS present" and broadcasts `net_pause_change`, with a banner surface on the net view. Reuse that pattern rather than inventing a parallel one — but note the trigger differs: it keys off check-in *status*, not connectivity, so an NCS whose link drops still reads as present. The new signal should be driven by socket liveness, which `ConnectionManager` (`backend/app/main.py`) already observes when a WebSocket drops.

**Relationship to the TUI/packet client below:** that item also specifies offline command queuing and replay. The conflict rule and queue semantics should be designed once and shared, not solved twice with different answers.

### Native Desktop Client

**✨ Standalone NCS client application (Windows / macOS / Linux)** *(KC1JMH — back-burner)*  
**Model:** Opus (framework selection and packaging architecture). *Decision recorded:* the PWA question flagged here is resolved in favor of the PWA — see Offline-Capable Web Client above. Offline operation is the strongest driver for a dedicated client, a PWA satisfies it, and maintaining three native packages alongside it is hard to justify. Treat this section as likely superseded; revisit only if a concrete requirement emerges that a PWA genuinely cannot meet.  
A packaged desktop GUI application for NCS operators connecting to a hosted or self-hosted ECTLogger instance. Intended for single-operator NCS use; not a server. Targets scenarios where a browser is impractical but a full GUI is available. Proposed repo layout: `clients/windows/`, `clients/macos/`, `clients/linux/` with installable packages per release. Technology decision pending — evaluate Electron, Tauri, or native framework.

### TUI / Packet Client

**✨ Terminal-first NCS client for low-bandwidth and degraded-link operations** *(KC1JMH — back-burner)*  
**Model:** Opus (protocol design for the packet command mode is the hard part; the TUI itself is Sonnet work afterward).

Full spec and design notes: [`docs/concepts/TUI-PACKET-CLIENT.md`](concepts/TUI-PACKET-CLIENT.md)

Summary: a terminal UI (TUI) client and packet-optimized command protocol for running nets over SSH, local console, or packet radio links (~1200 baud). Two command modes — full terminal and abbreviated packet — with offline command queuing and replay on reconnect. Future phase includes a Winlink gateway for form-based check-in submission. Distinct from the desktop GUI client above: this is the degraded-connectivity and emergency deployment path.

This is separate from the standalone desktop client above. Both are back-burner until the web app and self-hosting are stable.

Its offline command queuing and replay overlaps directly with the Offline-Capable Web Client above. Design the queue semantics and the conflict rule once and share them across both clients — solving the same problem twice invites two different answers to "what happens when two operators logged the same callsign offline."

### SSH-Hosted TUI

**✨ Server-hosted terminal UI reachable over SSH** *(KC1JMH — idea capture)*  
**Model:** Opus (lands in the auth path and stands up a new internet-facing network service; both are squarely in the Opus tier per the model guidance above).

Full concept notes: [`docs/concepts/SSH-HOSTED-TUI.md`](concepts/SSH-HOSTED-TUI.md)

Summary: an operator runs `ssh ectlogger.us`, authenticates against the existing user database, and gets a Textual TUI for checking into and running nets. Nothing is installed on their machine — the app runs on our server, one forked PTY per SSH session. Auth is password plus TOTP first (registered SSH public keys later), reusing `POST /auth/login` verbatim so the existing lockout, rate limiting, and Fail2Ban jail all apply unchanged.

**Not the same thing as the TUI/Packet Client above, despite both being terminal UIs.** That one is installed on the operator's machine and targets packet radio and ~1200 baud links; this one is hosted by us and needs a working IP link end to end, so it does nothing for the degraded-connectivity scenario. Different transport, different auth model, no offline queue. The packet client's API-key decision does not carry over. Do not merge the two documents.

Prerequisite worth knowing before scoping: only one of the 68 users in the current database has a password set, since everyone else logs in by magic link — which has no meaning without a browser. Any milestone that ships SSH access needs a companion push to get operators to set passwords, or it ships to an audience of one.

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
