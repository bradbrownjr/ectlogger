# ECT Logger — Product Roadmap

*Last updated: 2026-09-16*  
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

### 0.8 — Add swap to the production host *(operator task — needs root)*

**⚠️ Manual task for Brad.** Not a code change and not something the agent can do: the
deploy account's passwordless sudo covers only the `ectlogger` service, so these need an
interactive sudo password.

**Why:** on 2026-09-03 a routine `npm run build` on production was OOM-killed partway
through. Vite empties `frontend/dist/` before it writes anything, so the kill left the site
with **no `index.html` at all** — a full outage (Caddy's `try_files {path} /index.html` had
nothing to serve) whose only symptom was the single word `Killed` at the end of otherwise
normal build output. The API stayed up; the web app did not. Recovery was a rebuild, about
three minutes.

The host is **1880 MB with no swap**, and the frontend is a single ~2.9 MB chunk that keeps
growing. The immediate mitigation is already in place and documented in
`.github/copilot-instructions.md`: builds now run with
`NODE_OPTIONS=--max-old-space-size=1024` plus a mandatory post-build check that
`dist/index.html` exists. That narrows the window but doesn't remove it — the bundle will
eventually outgrow the cap.

**Before running:** take a snapshot/backup of the VPS first. These commands write a 2 GB
file to `/` (79 GB total, 63 GB free as of 2026-09-03) and edit `/etc/fstab` and
`/etc/sysctl.conf`. A bad `/etc/fstab` line can prevent the host from booting cleanly, so
have a way back.

```bash
ssh ectlogger@app.ectlogger.us

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Persist across reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Only fall back to swap under real pressure (default 60 is too eager for a server)
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# Verify
swapon --show
free -m
```

**Verify `/etc/fstab` before rebooting:** `sudo findmnt --verify --verbose` should report no
errors. Once swap is live, an unbounded build should no longer be able to take the site
down, though the heap cap and post-build check are worth keeping either way.

**Follow-up worth considering separately:** the 2.9 MB single chunk is the underlying cause.
Code-splitting it (`manualChunks` / dynamic imports) would cut build memory *and* speed up
first load for users. That's a real refactor with its own regression risk, so it belongs on
its own rather than bundled into this.

### 0.9 — Second test instance on the dev host *(partly an operator task — needs root)*

**🔧 A place for `feature/teams` to bake that does not cost us beta** *(KC1JMH)*
**Model:** Sonnet for the one code change. **Think:** think. The rest is configuration and operator steps.

The Teams module is a long-running feature branch measured in months. Under the current setup, testing it on beta means beta stops mirroring production, and every bug report that arrives in the meantime has nowhere to be reproduced. A second instance on this host solves it, and the host is nowhere near its limits: 96 GB of RAM and 12 cores, currently running one instance.

**Which branch goes where, and it is the opposite of the obvious assignment.** Existing beta stays on `main` — it is the instance that must keep mirroring production so bug reports can be reproduced against what users are actually running. The **new** instance tracks `feature/teams`. The unstable work goes on the new box, not the established one.

**Prerequisite code change, and it lands on `main` rather than the feature branch.** `BACKEND_PORT` is already read from `backend/.env`, so the backend side is free. The frontend port is hardcoded in three places — `--port 3000` in `start.sh`, and `port: 3000` in both the `server` and `preview` blocks of `frontend/vite.config.ts`. Add a `FRONTEND_PORT` env var following exactly the pattern `BACKEND_PORT` already uses, defaulting to 3000 so nothing existing changes. **Port 3001 is already in use** by something outside this container's process view, so the second instance takes 3002 and 8002.

**Check disk before starting.** `/` is 3.7 TB at **100 % with about 7.2 GB free**. A second checkout is roughly 660 MB with `node_modules` and the venv, and a Vite build wants scratch on top of that. It fits, but not comfortably — clear space first rather than discovering this mid-build.

**Steps that do not need root** (run directly on this host — it is the session's own host, never an SSH target):

```bash
# 1. Clone the feature branch into its own directory
git clone "$(git -C /home/bradb/ectlogger remote get-url origin)" /home/bradb/ectlogger-teams
cd /home/bradb/ectlogger-teams && git checkout feature/teams

# 2. Backend environment
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt

# 3. Frontend dependencies
cd /home/bradb/ectlogger-teams/frontend && npm ci

# 4. Config: its own ports, its own database, and its own SECRET_KEY.
#    Write backend/.env with BACKEND_PORT=8002, a DATABASE_URL pointing at this
#    instance's own SQLite file, EMAIL_ENABLED=false and SMTP_HOST=127.0.0.1.
#    Write frontend/.env with FRONTEND_PORT=3002, VITE_SERVE_MODE=preview, and
#    VITE_API_URL pointing at whatever hostname this instance ends up served on.

# 5. Build the frontend (vite preview serves a static build; git pull alone is never enough)
npm run build
```

**The email guards are the one step that must not be skipped or improvised.** A fresh `.env` on a new instance is a brand-new way to mail real operators from a test, and Teams introduces reminders, review requests, invitations, and callout notices — every one of them a new sender. `EMAIL_ENABLED=false` and `SMTP_HOST=127.0.0.1` go in before the service ever starts, not after the first send.

**Start this instance on a fresh database with de-identified fixtures, not a copy of production.** The Teams concept documents already require de-identified fixtures for this module's testing, and a third copy of production's real member data is a privacy cost with no matching benefit. Teams migrations must never run against beta's database, which holds that copy. Where a real-data smoke test is genuinely needed, run it against beta's existing copy rather than making another one.

**Steps that need root, so they are Brad's** (`! sudo ...` from the prompt runs them in-session). First `/etc/systemd/system/ectlogger-teams.service`, which is the existing unit with the paths changed:

```ini
[Unit]
Description=ECTLogger Teams branch test instance
After=network.target

[Service]
Type=simple
User=bradb
Group=bradb
WorkingDirectory=/home/bradb/ectlogger-teams
Environment="PATH=/home/bradb/ectlogger-teams/backend/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="NODE_PATH=/home/bradb/ectlogger-teams/frontend/node_modules"
ExecStart=/bin/bash /home/bradb/ectlogger-teams/start.sh --service
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then a `/etc/sudoers.d/ectlogger-teams` granting the same five verbs the existing file grants for `ectlogger` (start, stop, restart, is-active, status), so this instance can be managed without a password the way the first one is. Then `systemctl daemon-reload && systemctl enable --now ectlogger-teams`. Finally, nothing on this host proxies `ectbeta.lynwood.us`, so a hostname for the new instance is a change wherever that reverse proxy actually lives.

**Verify** with `systemctl is-active ectlogger-teams`, a request to `:8002/docs`, and a request to `:3002/` — then confirm the original instance is still answering on 3000 and 8000 and still on `main`.

**This does not change how production is built.** Building production's frontend here and shipping the artifact has been standard since 2026-09-15 because production's 1.8 GB VPS gets OOM-killed building its own. The one rule when Teams eventually ships: the production build comes from **`main` after the merge**, never from the teams instance's branch checkout, and still with `VITE_API_URL=https://app.ectlogger.us/api` passed explicitly on the build command.

---

## Milestone 1 — Medium-term

*Meaningful new capabilities that don't require architectural changes.*

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
*Re-requested 2026-09-08 as "calendar view of schedule" — that is Phase 1 below and nothing more,
so this section already covers it. Treat the repeat ask as a priority signal: Phase 1 is the whole
of what was wanted, and it stands alone without Phases 2-3.*  
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

### Net View Usability

**🔧 Let a station change its own Topic of the Week answer from the toolbar** *(KC1JMH, 2026-09-08)*  
**Model:** Haiku, once the icon is chosen — the permission and persistence paths both already exist.

A station that answers the topic question at check-in has no obvious way to change its answer
afterward; the answer lives in `check_ins.topic_response` and is reachable only by finding your own
row and editing it inline, which is exactly the hunt the "I hear" and "Just listening" toolbar
buttons were added to remove. Add a toolbar action alongside them.

Nothing new is needed underneath: `update_check_in`
(`backend/app/routers/check_ins.py:464`) already permits a user to edit their own check-in
(`is_own_check_in`), and the toolbar entry follows the existing action-descriptor pattern in
`NetViewHeader.tsx` (~`:500-600`) — key, group, priority, visible, Icon, color, label, tooltip,
onClick.

- [ ] Visible only when `isAuthenticated`, the net is active or in lobby, the viewer has an active
      check-in, **and** `net.topic_of_week_enabled` — the button must not appear on a net with no
      topic set, and must not appear for a viewer who is not checked in
- [ ] Small dialog prefilled with the current answer, showing `net.topic_of_week_prompt` as its
      label so the operator can see the question they are answering
- [ ] **Icon choice is the open question.** The topic column header uses a plain tooltip today and
      the toolbar's neutral icons are already dense. Candidates worth comparing in place:
      `RateReviewOutlined`, `ChatBubbleOutline` (too close to Chat), `QuestionAnswerOutlined`,
      `EditNoteOutlined`. Pick against the icon-color table in DESIGN.md, and check it is not
      confusable with Chat, Announcements, or the poll surfaces at icon-only width
- [ ] Consider covering the poll answer with the same control, or deliberately not. Both live on
      the same row and a station that wants to change one usually wants the other

**🔧 Separate "stepped away" from "no answer when called", and flash the row on return** *(KC1JMH, 2026-09-08)*  
**Model:** Sonnet — a new `StationStatus` member touches the status dropdowns, the row tint logic,
exports, and statistics, so it is a small-but-wide change rather than a one-file one.

Two different facts currently share one status. A station that sets itself `away` is saying "I am
stepping out, call me later." NCS marking a station `away` after calling it with no response is
recording something else entirely: the station may be off the air, out of range, or gone. Both
render as the same yellow row, so a net log cannot distinguish an operator who told the net they
were leaving from one who vanished mid-net — a distinction ARES/SKYWARN after-action review
actually cares about.

- [ ] New `StationStatus` member for the NCS-set case (`NO_ANSWER`, label "No answer") alongside
      the existing self-set `AWAY`. Existing rows keep meaning `away`; nothing is migrated
- [ ] Distinct row tint and status-menu entry for each, in `CheckInTable.tsx` (`rowBgColor`,
      ~`:388`) and `CheckInMobileList.tsx`. The two hard-coded `validValues` status arrays in those
      files both need the new member — they are the kind of list that silently drops an unknown
      status
- [ ] Only staff can set "No answer"; only the station itself sets "Step away". The toolbar's
      step-away toggle stays self-only and never produces the new status
- [ ] **Toolbar icon change:** the self step-away action currently uses `PauseCircleOutline`. Swap
      it for a walking/boot glyph so the two states read differently at a glance — MUI has
      `DirectionsWalk` and `Hiking`; `Hiking` is the closer match to the requested hiking boot.
      Keep the active/warning tone it already has
- [ ] Include both statuses distinctly in the net report, the ICS-309 export, and the check-in
      status counts, or the split buys nothing outside the live view

**Return-from-away flash.** When a station comes back — its status leaves `away` — briefly
highlight the row so NCS notices without watching the table, then let it fade. Reuse
`sneakInFade` / `SNEAK_IN_HIGHLIGHT_MS` from `sneakInHighlight.ts` rather than inventing a second
flash: the app should have exactly one "something just happened in this row" animation.

- [ ] Fire only on a live WebSocket `status_change`, never on the initial load or a reconnect
      resync — the same rule the sneak-in highlight and the chat mention highlights already
      follow, and the reason neither of them flashes the whole table on every reload
- [ ] **Read the request the other way before building.** "Add a timeout for the highlighted row
      when someone comes back from away" can also mean *the away tint itself should time out* —
      a station that steps away and never returns stays yellow for the rest of the net. If that is
      the actual complaint, the fix is an auto-expiry on the away state (or an "away for 20 min"
      age badge), not a return flash. Confirm which before writing code; they are different
      features and only one was asked for
- [ ] Whichever it is, do not build it on the arrow's broken pattern — see the sneak-in arrow bug
      above, whose root cause is exactly a flash timer whose lifetime was borrowed from another
      component's state

**🔧 Make net logos openable at full size** *(KC1JMH, 2026-09-08)*  
**Model:** Haiku — one small shared component, three call sites.

Net and schedule logos render at 28-32 px (`NetCard.tsx:141`, `ScheduleCard.tsx:212`,
`NetViewHeader.tsx:821`). Club logos routinely carry the club name, a repeater frequency, or a
callsign as part of the artwork, and none of it is legible at that size. Clicking should open the
uploaded image at its natural size.

- [ ] One shared click-to-enlarge wrapper used by all three sites, not three separate dialogs.
      A plain MUI `Dialog` with the image at `max-width: 100%` and a close affordance is enough;
      no lightbox dependency
- [ ] Keyboard reachable and dismissible on Escape, with the logo carrying alt text naming the net
      or schedule — it is currently a decorative `Avatar` with no label
- [ ] Do not swallow the card click. On `NetCard`/`ScheduleCard` the logo sits inside a card whose
      body already navigates; the enlarge click has to stop propagation or clicking the logo will
      both open the image and leave the page
- [ ] Serve the original upload, not the resized avatar, or the enlarged view is just a blurry
      28 px image — confirm what `NetLogoSection.tsx`'s upload path actually stores before
      promising full resolution

### Statistics & Recognition

**✨ Most-attended nets scoreboard on the global statistics page** *(KC1JMH, 2026-09-08)*  
**Model:** Sonnet — one new aggregate query plus a table, against an established page.

The global statistics page (`frontend/src/pages/Statistics.tsx`, backed by
`routers/statistics_global.py`) reports totals, activity windows, and time series, but never ranks
anything. Add a scoreboard of the nets with the most check-ins, which is both the question people
ask and a quiet nudge toward the nets worth joining.

Per-net leaderboards already exist and set the pattern to follow — `statistics_net.py` builds
`check_in_leaderboard`, `ncs_leaderboard`, and `relay_leaderboard` for a schedule's series.

- [ ] Extend `GlobalStatsResponse` (`schemas.py:1548`) with a `top_nets` list, and compute it in
      `statistics_global.py` as one grouped aggregate — not a per-net fan-out
- [ ] **A row is one schedule (net template), not one net occurrence** (decided 2026-09-08) — a
      single well-attended weekly net would otherwise fill the whole board with its own
      occurrences. Rank by total check-ins aggregated across a schedule's nets within the window,
      and show the occurrence count alongside the total so the reader can see whether a high total
      comes from broad turnout or from meeting often. Ad hoc nets with no template are excluded
      from this board — there is no series for them to accumulate into
- [ ] Exclude nets whose status makes them meaningless in a ranking — `DRAFT` and `CANCELLED`
      are real rows, not deletions, and a cancelled occurrence exists precisely so the scheduler
      can see the slot was skipped. **There is no net-level DEMO flag to filter on:** `DEMO` is a
      value of `TrafficTestCategory` and scopes traffic forms only. If practice nets should be
      excluded from this board, that exclusion has to be designed, not assumed to exist
- [ ] Decide the time window. An all-time board freezes within a year and stops rewarding current
      activity; a rolling 12-month or 90-day window keeps moving. Recommend a rolling window with
      the period stated on the card, since every other panel on that page is already windowed
- [ ] Link each row to the net or schedule statistics page, and make sure it does not leak a net
      the viewer could not otherwise see — the page is readable before login

### Incident Operations Log & Situational Awareness Feed

**✨ Log what you hear once, and let it render as an ICS-214, a spreadsheet row, and a Slack post** *(KC1JMH — from the statewide drill of 2026-09-17, see [`USER-STORIES.md`](USER-STORIES.md))*  
**Model:** Opus for the record-type boundaries, the provenance model, and the incident record's schema — the failure here is an unverified overheard report reaching a decision-maker as a fact, which is a judgment problem, not a CRUD problem. Sonnet for the log UI, the ICS-214 exporter, and the outbound dispatcher, all of which follow the Traffic module's existing patterns. Haiku for additional export field mappings once the first one is built and verified.
**Think:** ultrathink for the record-type boundaries, the provenance model, and the incident schema; think for the log UI and exporters; think hard for the dispatcher, where a retry must not repost; none for additional field mappings.

**The drill that produced this.** A county EOC ran a statewide exercise with the team split across two buildings. Every sitrep heard from MEMA or another county was handwritten, then typed into a spreadsheet, then typed into Slack, then typed again into an ICS-214. One thing heard, four places written. Separately, a shelter supply request was passed to MEMA as a verbalized list relayed through the team's other site.

**Start by using what already ships.** The supply request was an ICS-213 and the app already files them, with the full originated/received/relayed/delivered chain of custody that would have recorded both hops of that relay and put metadata-only rows on the net's ICS-309. That is not a gap; that is a feature nobody reached for under pressure, which is a training and UI-discoverability finding rather than a build. Fix the discoverability before building anything below.

**Four record types, and collapsing any two of them is the whole risk.** Doctrine already separates them and the app should too:

| Record | Question it answers | Status |
|---|---|---|
| Traffic (Radiogram, ICS-213, RRI strip) | A message **we handled** — we are in its chain of custody | Shipped |
| ICS-309 Communications Log | What **our station** sent and received on a net | Shipped, per-net, fed by traffic |
| ICS-214 Activity Log | What **our unit did** — notable activities, the reference for the after-action report | **Gap** |
| Situational awareness entry | Something **we heard about somebody else**, logged because our county needs to know | **Gap, and the bulk of the drill's work** |

The fourth is the discovery, **and it is its own record rather than a kind of traffic** — it has no addressee, no precedence, no custody chain, and no delivery, which is four of the things a traffic form exists to carry. An overheard report from another county is not our traffic, not our station's message log, and not our activity. It is an observation about a third party, its value is its content rather than its handling, and the app has nowhere to put it. That is what was being retyped into a spreadsheet and Slack all day.

**And the source is frequently not amateur radio at all.** The EMA calls on the team during big storms to monitor public service radio and scanners and report storm damage. The observer is in no communications chain whatsoever; they are listening to somebody else's operational traffic, or looking out a window, and producing intelligence from it. So an SA entry's source types span at least: direct observation, scanner or public-service monitoring, overheard amateur traffic, a report relayed to us, and a coordinator's own briefing. **The source type governs how far the entry may travel** — scanner-derived content in particular carries sharing constraints that an amateur net's traffic does not, agencies have their own policy about it, and nothing derived from monitoring should be pushed to an outbound channel automatically. Confirm the local rule with the EMA and record it as a team setting rather than assuming one.

**An SA entry carries its provenance or it is actively dangerous.** This is the one place in the feature where a cheap model will do the wrong thing confidently. Every entry records who reported it, **how we came by it — heard direct, relayed to us, or overheard** — and whether it is confirmed or unconfirmed. A third-hand "shelter at capacity" copied off an HF net and a coordinator's own confirmed report must never render identically, because the consumer is somebody allocating supplies. The module's standing rule against inventing a fact to fill a blank applies with money and people attached.

**One capture, many renderings.** The entry is written once, at the radio, by the person who heard it. Everything after that is a rendering of the same record: an ICS-214 row, a CSV row shaped for the county's spreadsheet, and an outbound post. No path may require retyping, and no rendering may be the system of record.

**Outbound notifications, Slack included — a courtesy, never the record.** Hard rules, because this is where an integration quietly becomes load-bearing:

- The log write succeeds or fails on its own. Dispatch is fire-and-forget, queued, retried, and **never blocks or fails a log entry**.
- Undelivered is visible. A post that never landed shows as undelivered next to the entry rather than being assumed sent.
- Provenance travels with the text. A Slack message gets forwarded and screenshotted into decisions, so the confirmed/unconfirmed marking and the source go in the message body, not just the database.
- **The drill's own scenario is the argument.** The injected condition was Internet, phones, and cellular down. That is exactly when Slack cannot work and exactly when the radio log matters most. The webhook is the good-day convenience; the log has to stand alone on the bad day.
- Per-team webhook configuration, secrets never exported, and a visible test-send. Treat the outbound URL as a credential.

**These records belong to an incident, not to a net, and an incident must be something you can stand up on its own.** A storm is three days, six nets, two tag boards, forty SA entries, and a dozen ICS-213s. Today the app's only container is the net, so nothing ties one operation's records together — and worse, **an operation with no net has nowhere to live at all.** That is not an edge case. Monitoring public safety radio during a storm involves no net. A shelter tag board with three people in it involves no net. A single supply request relayed by phone involves no net. The net is one thing a team might do during an incident, not the thing an incident is.

**This is a deliberate decision to cross a tripwire this document set out itself.** An earlier revision resolved the incident question as a correlation label that records carry, and stated that the moment it grew a lifecycle it would have become the top-level `Incident` entity [`TEAM-INCIDENT-PLANNER.md`](concepts/TEAM-INCIDENT-PLANNER.md) refuses. Standing an incident up before any record exists *is* a lifecycle. So the tripwire has done its job: this is the decision it asked for, made in the open rather than reached by accretion.

**What survives the change is the actual refusal, which was never about lifecycle.** The planner refuses a **container that owns staffing** — a second shift table, assignment board, or attendance clock. That stands, and it is what keeps this from becoming a parallel Events module:

- **The incident record holds identity and status, nothing else.** A name, a type (real-world, drill, exercise, planned event), the served agency and its own reference number, when it opened and closed, who opened it, and which teams are participating. No shifts. No assignments. No roster. No attendance clock. No staffing role of any kind.
- **It creates nothing and closes nothing.** Nets, tag boards, traffic, SA entries, and activity entries each reference it optionally. Closing an incident closes no net and no board, and closing either of those closes no incident — the same independence rule [`TEAM-ACTIVATION-CALLOUTS.md`](concepts/TEAM-ACTIVATION-CALLOUTS.md) already enforces between a board and a net, for the same reason: two things that close each other will do it at the worst moment.
- **Independent in both directions.** A net with no incident is the ordinary weekly training net. An incident with no net is the ordinary small activation. One incident may carry many nets, many boards, and many teams, and none of those is required for it to exist.
- **Prefer the agency's own incident number.** Section 5.14 already records an "incident/reference number if supplied" from the served agency, and that is the seed of this. The EMA or the state assigns the identifier; the app records it rather than minting a competing one, consistent with how this module treats every other externally-owned fact. Mint a local reference only when nobody supplied one — and when a local one has been minted and the agency's number arrives later, adopting it must not orphan the records already pointing at the local one.
- **Three different things get called "multiple teams", and conflating them produces the wrong schema.** The statewide drill of 2026-09-17 contained two of them at once:
  - **One team, several operating sites.** Cumberland's team split between the EMA's old building and the new one, relaying VHF-to-HF between them. That is **one team**, two locations, two stations, and an internal relay. It must not be modeled as two teams — doing so would split one roster, one membership list, and one set of hours across two records for the duration of an activation. Sites are places, which the section 5.19 tag board already has, plus a station identity per site for logging.
  - **Many organizations in one incident, almost none of them in this application.** Thirteen counties, MEMA, and a SimCell. They are the sources of observations, the addressees of traffic, and the originators of injects, and they will never be users here. They are external references — the same free name, role, and agency pattern section 5.14 already uses for an authorizing incident commander — and they need no permission model at all, because there is nothing to permit.
  - **Several teams inside one deployment.** This only happens when somebody hosts one instance for many teams, and that is a real scenario rather than a hypothetical: an instance run by MEMA or a state ARES section for all of Maine's counties turns exactly this drill into the genuine multi-team case. There, the incident is the join across teams, each team sees only its own records by default, and cross-team visibility is a per-team setting that is off until chosen and grants sight of records only — never membership, never whereabouts detail, never authority over another team's board.
- **The record design has to be identical across all three**, because the same operation is case two on a county's self-hosted instance and case three on a state-hosted one. An incident references participating teams, zero or more; external organizations are named references on the records that mention them; sites belong to a team. Nothing about which of the three is in play may change what a record looks like, or the same drill produces two incompatible datasets depending on who hosts it.
- ICS-309 stays per-net. That is correct by doctrine — it is a station's log for an operational period — and an incident reference is an additional axis, not a replacement. Do not "fix" the 309 to span an incident.
- **The tripwire, restated at its new boundary.** The refused entity is the one that owns people: the moment this record grows shifts, assignments, a roster, an attendance clock, or permissions over persons rather than over records, it has become what the planner rules out. The lifecycle was negotiable and has been negotiated. The staffing is not.

**This feature owns the incident record; Teams adopts it.** The Incident Operations Log ships well before the Teams module, so it builds the record and every consumer that exists at that point. Two forward-compatibility requirements, because they are cheap now and migrations later: **do not assume a single team** (the participation join is added by Teams phase M1A, and the schema must not preclude it), and do not assume every incident has a net, which is the whole point above.

**The ICS form inventory, and who owns each one.** Verified against the code on 2026-09-17 rather than from memory:

| Form | What it is | Status |
|---|---|---|
| **ICS-213** General Message | A message we handled, with originator, addressee, and reply | **Ships now.** Full form definition, the originated/received/relayed/delivered chain of custody, and a form-accurate PDF |
| **ICS-309** Communications Log | What a station sent and received during an operational period | **Ships now.** Generated from the net's traffic log, CSV and JSON, per net, gated on that net's own toggle |
| **ICS-214** Activity Log | What our unit did — the reference for the after-action report | **Gap, and this item closes it.** Rendered from log entries, never generated from a roster |
| **ICS-205** Incident Radio Communications Plan | The channel plan for an operational period | Teams phase M6, reusing the Events builder. Its inputs are the approved PACE and channel records from Teams M3B |
| **ICS-205A** Communications List | Who is reachable how, by assignment | Teams phase M6 |
| **ICS-211** Check-In List | Resources checking in to an incident | Teams phase M6, and it is **resource-oriented, not the EMA's attendance roster** — the attendance work in Teams M1A is a different document with a different purpose |
| **ICS-202 / 204** Objectives, Assignment List | Incident objectives and tactical assignments | Teams phase M6 via the Events builders |
| **ICS-217A** Communications Resource Availability | What channels are available to be planned with | Candidate only; not committed until a pilot shows it is needed |

**Two directions, and only one of them is "create".** We author and hand over the ICS-213, 214, and 309, and our own portion of the 205A. We **receive and operate under** an ICS-205 — it is normally authored by the communications unit at the incident level and issued to us, not written by an ARES team. The application must therefore be able to record a received communications plan as the authoritative one for an incident, with its edition, without pretending we produced it. A team that quietly generates its own 205 and files it as the plan has invented an authority it does not have, which is the same failure this module refuses everywhere else.

**The incident carries its document set, for history and for re-export — and the hard part is that a re-export must reproduce what was handed over, not what the data says today.** Attaching a form to an incident is not a new mechanism: the form carries the incident reference like every other record, and "the incident's documents" is a view over that reference rather than a container that owns them. What is new, and what has to be designed rather than assumed, is what a second export means.

- **An issued copy is recorded when it goes out.** What was rendered, its edition, when, by whom, and to whom. Without that, the ICS-214 handed to the EMA on the night of the drill is unreconstructable the moment anyone corrects a typo in a log entry three days later — and the after-action, the audit, and the grant record all want the document that was actually handed over.
- **Re-export offers two distinct things and never silently conflates them.** *Reproduce the issued copy*, identical to what was handed over, or *render current*, plainly labeled as a revision with the issued copy still retrievable. A second original is never produced, which is the same rule the attendance export already follows for the same reason: **every outward-going artifact records that it went out, and a second one is either a reproduction or a revision, never a silent second original.**
- **Corrections revise, they never erase.** The traffic module's chain of custody is already append-only; a corrected form is a new revision beside the issued one, not an edit over it.
- **Received documents belong to the set too, stored verbatim.** The ICS-205 issued to us, the agency's roster template, the injects — kept as received with their source and edition, never normalized into our own formatting, on the same principle that keeps an agency's footer text verbatim on its roster.
- **The log stays the system of record for the facts; the issued snapshot is the record of what we communicated.** Those are different claims and the app needs both. Neither replaces the other.
- **The incident is the natural retention unit**, which is a useful consequence: "hold everything for this storm" becomes one operation. The period itself is a team policy agreed with the served agency, never a timer this project chose — see section 8 of [`TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md), where federal award records run three years from the final expenditure report and a hold extends that silently.

Teams phase M6 already plans versioning, approval, and issued snapshots for the plan package. That is the same mechanism and must reuse it rather than building a second one.

**Exercise marking is not cosmetic, and a SimCell makes it load-bearing.** The drill was driven by a simulation cell injecting scenario traffic, and every form leaving the team during an exercise has to be unmistakably an exercise document. The traffic module already carries `TrafficTestCategory.DRILL`, which deliberately exempts nothing — same chain of custody, same appearance in the ICS-309 — and only labels. Every form family added here inherits that behavior, and the label has to survive into the rendered output and the outbound post, not just the database. An exercise sitrep forwarded into a Slack channel and screenshotted is exactly how a drill message becomes a real one.

**One open design question this drill exposed.** ICS-309 is a log for a station and an operational period, and the app currently generates one per net. When one team operates two stations on one net — the old office and the new office, as happened here — that produces a single merged log where the field practice was two, one kept at each site. The other site kept its own 309 by hand. Whether the app should render per-station logs from one net's traffic is a real question with a doctrinal answer, and it should be settled when the incident work lands rather than discovered during the next activation.

**Do not manufacture entries.** An ICS-214 is written from what happened, never generated from assignments, a plan, or a shift roster — the same rule [`TEAM-INCIDENT-PLANNER.md`](concepts/TEAM-INCIDENT-PLANNER.md) already states for ICS-211 and ICS-214 mappings. A fabricated activity log is worse than none, because it is signed and filed.

**Reuse, do not rebuild.** The Traffic module already owns form definitions, chain of custody, per-net export integration, and form-accurate PDFs. This feature is a fifth form family and a dispatcher beside it, not a second traffic system. ICS-309 stays where it is.

**Open questions — and the answers are settings, not constants.** Cumberland County EMA is the source of the questions below, and it does not speak for the next county, for MEMA, or for any other served agency. An answer obtained from one agency becomes **that team's configured value with that answer as its default**, never a hardcoded rule, column set, or validation. The test is simple: if standing this up for the next county over requires a code change, the answer was written in the wrong place. See the policy register in [`TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md) section 5.20 — settings that are genuinely the agency's policy rather than the team's attach to the served-agency record, so a team serving both a county EMA and the state does not have to average two answers into one.

- What does the EMA's policy actually permit for scanner-derived content — logged internally only, shared within the county, or repeatable outward? This gates the outbound dispatcher for a whole source type. **Setting**, defaulting to log-internally-and-never-dispatch, because that is the only default that is safe when nobody has answered.
- Where does an incident reference get created in practice, given the app is rarely the first system to know an incident exists? Most likely it arrives with the section 5.14 activation record and everything else adopts it, but confirm against a real storm rather than a drill. **Setting** for who may open an incident and whether an agency reference is required before one can be opened.
- Does the county want the SA feed as its own export, or folded into the ICS-214? The drill did both, which may mean both are needed or may mean one was redundant. **Setting**; build both renderings and let the team choose, since the cost of the second one is a formatter.
- Which outbound targets beyond Slack — Teams, Mattermost, a generic webhook, email? A generic signed webhook plus a Slack-shaped formatter probably covers it without committing to vendors. **Setting**, per team, and already planned that way.
- Should a net with two operating sites model the relay explicitly, or is the existing multi-NCS net plus the Relay role enough? The drill worked; confirm before adding anything.

### Exports & Printing

**✨ Export net announcements and the net script to PDF with their formatting intact** *(KC1JMH, 2026-09-08)*  
**Model:** Sonnet.

Announcements and the net script are Markdown (`nets.announcements`, `nets.script`, with template
defaults on `net_templates`), edited through the formatting toolbars in `Announcements.tsx` and
`NetScript.tsx` and rendered with react-markdown plus remark-breaks. There is no way to get either
onto paper, which is what an NCS running a net from a printed script actually needs, and copying
the raw Markdown out yields asterisks and hash marks instead of headings and bullets.

The mechanism already exists and must be reused, not re-invented: `exportElementToPdf`
(`frontend/src/utils/pdfExport.ts`) captures a rendered DOM element through html2canvas and jsPDF,
forces light-mode styling, and handles page boundaries. NetReport, Statistics, the traffic panel,
and the ICS-309 view all go through it. Exporting the **already-rendered preview** is therefore
both the least code and the only approach that guarantees the PDF matches what the editor's
preview showed.

- [ ] Export action on both the announcements and net script panels, at all their placements
      (inline, docked, and detached — both components support undocking)
- [ ] Render off-screen at a fixed print width rather than capturing the panel at its on-screen
      size. A detached panel is a few hundred pixels wide and would produce a PDF of a narrow
      column
- [ ] Header identifying the net, the date, and which document it is, so a printed script found on
      a desk says what net it belongs to
- [ ] Filename following the convention the existing exports use
- [ ] Verify the Markdown features the editor toolbars actually offer survive the round trip —
      headings, bold, italic, the `==highlight==` extension, links, both list types, and the
      horizontal rule. The highlight extension is custom, so it is the one most likely to render
      as literal equals signs
- [ ] Consider a combined "net paperwork" export (script plus announcements in one document)
      before building two separate buttons. An NCS printing one usually wants both

### Account Deletion, Anonymization & Right to Erasure

**🔒 Replace hard user deletion with anonymization, and add a separate erasure action**
**Model:** Opus for the design and the erasure semantics; Sonnet for the implementation once the shape is agreed.

**The problem.** `DELETE /users/{id}` (`routers/users.py::delete_user`) is a bare
`await db.delete(user)` — no cleanup, no reassignment, no anonymization. Everything that
referenced that user is left pointing at an id that no longer exists.

Two things make that worse than it looks:

- **The `ondelete` rules in `models.py` are not actually enforced.** `PRAGMA foreign_keys`
  is `0` (SQLite's default) and nothing in `database.py` turns it on, so all 16 existing
  `ondelete="CASCADE"` / `"SET NULL"` declarations are decorative in the current
  deployment. Nine further FKs to `users.id` have no rule at all, including
  `nets.owner_id`, `net_templates.owner_id`, `net_roles.user_id`,
  `check_ins.checked_in_by_id` and `chat_messages.user_id`.
- **Display paths hide the damage.** Every NCS/attribution query joins to `users`, and an
  inner join silently drops a row pointing at a missing user — so an orphan is invisible in
  the UI and only shows up in queries that count without joining. One such row existed
  (net 1, from a user deleted in 2025) and was removed 2026-09-03; it was found by accident
  while debugging something else.

**Chosen approach: anonymize in place, don't hard-delete.** Blank the identifying fields on
the `users` row rather than removing it — `name`, `location`, `avatar_url`,
`skywarn_number`, `sms_gateway`, live location; `email` to a unique non-identifying value
(the column is `NOT NULL UNIQUE`); `callsign` to a placeholder; clear `gmrs_callsign`,
`callsigns`, `previous_callsigns`, `oauth_id`, `unsubscribe_token`, password and MFA
material. Set `is_active = False` and add a `deleted_at` column.

Why this over hard-delete plus `SET NULL` everywhere:

- Every foreign key stays valid, so **no row can ever orphan again** — without enabling the
  pragma, rebuilding ~9 tables (SQLite cannot `ALTER` a constraint), making columns
  nullable, and adding NULL handling to every join.
- The anonymized row **is** the placeholder. Historical nets render "(deleted)" as the NCS
  with no new plumbing in the ~25 places that display a user.
- Properly anonymized data falls outside GDPR's scope (Recital 26), which is why this is the
  standard pattern for records that retain operational value. It satisfies CCPA-style
  deletion requests on the same basis.

**Callsigns in historical logs: keep by default, scrub on explicit request.** A callsign is
personal data — it maps to a named licensee in public FCC records — and `check_ins.callsign`
is a denormalized string that survives account deletion regardless of what happens to the
`users` row. Decision (2026-09-03):

- **Routine account deletion** anonymizes the account and **leaves historical check-ins and
  chat intact**. A completed net log and its ICS-309 export are emergency-communications
  records whose value depends on the callsigns being present; retaining them is justified as
  records retention.
- **An explicit right-to-erasure request** is a *separate* admin action that additionally
  replaces the callsign in historical `check_ins` and authored `chat_messages` with a
  placeholder. Kept separate precisely because it degrades completed operational records, so
  it should be a deliberate act with a clear audit trail, not a side effect of tidying up an
  account.

**Open questions to resolve before building:**

- What exactly does an erased check-in row render as — a fixed string, or a per-user
  pseudonym so multiple entries by the same person still correlate within one net log?
- Does erasure touch free-text `chat_messages.message` bodies (which can name people), or
  only the authorship link and callsign? Scanning message text is a much larger problem.
- Should already-sent net log emails and generated PDFs be considered out of reach? (They
  should — but say so explicitly rather than leaving it implied.)
- Is enabling `PRAGMA foreign_keys=ON` worth doing anyway as a guardrail once deletion no
  longer orphans, given it would start enforcing 16 rules that have never actually run?
  Needs an audit of what would begin cascading before it is switched on — this is its own
  risk, not a freebie.
- Admin UX: the Users tab currently offers "Delete". That likely becomes "Deactivate" /
  "Anonymize" / "Erase", which needs wording that a net manager can reason about without
  reading a privacy policy.

---

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

**✨ Teams — ARES/SKYWARN team roster, readiness, equipment custody, callouts, and ARRL Form 2 support** *(KC1JMH — back-burner)*

Full spec and design notes, in four interlinked documents. The hub is the entry point; section numbers are global across all four:

- [`TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md) — hub. Problem, scope, personas, user stories, data model, permissions, privacy, guided setup and the policy register, phase overview, references. Phases M0, M1, M1B, M2, M3, M4.
- [`TEAM-ACTIVATION-CALLOUTS.md`](concepts/TEAM-ACTIVATION-CALLOUTS.md) — activation authority and PACE, the tag board, optional SMS, procedure library. Phases M1A, M3B.
- [`TEAM-ASSETS-CUSTODY.md`](concepts/TEAM-ASSETS-CUSTODY.md) — asset register, kit manifests, custody, maintenance, SWR sweeps. Phase M3A.
- [`TEAM-INCIDENT-PLANNER.md`](concepts/TEAM-INCIDENT-PLANNER.md) — plan context, requirements, staffing integration, ICS package. Phases M5, M6.

Summary: a new **Teams** section (menu between Schedule and Stats) to replace spreadsheet-based ARES/SKYWARN team tracking with a role-controlled, self-service platform. Members manage their own profiles; team managers handle roster, approvals, and reporting. Net participation rolls up to team records. Designed to facilitate ARES Form 2 and EMA hour reporting.

The concept has since grown well past a roster. It now also covers station capabilities and demonstrated readiness, team equipment inventory and custody, per-item maintenance and antenna sweep records, versioned procedures and PACE plans, radio and optional SMS callouts, a tag board for presence accountability, task books and training schedules, deployment packets and personnel accountability, and a communications-planning layer that shares the Events staffing workflow. It is the largest single feature proposed for this app.

**The tag board (phase M1A) is the cheapest operationally useful piece and should ship right after the roster.** The app currently has no way to record who is physically where unless a net is running, and a net check-in records a station being on the air, not a person being in a place — a non-radio volunteer or an unlicensed helper has no reason to be in a net log at all but still has to be accounted for. A tag board answers "who is where" with no net, no event, no plan, and no radio. It depends on M1 alone. See `TEAM-ACTIVATION-CALLOUTS.md` section 5.19. Its one hard invariant: **a tag never creates a check-in and a check-in never creates a tag**, and nobody is ever automatically tagged out. M1A also feeds the served agency's attendance records from the board. Cumberland County EMA collects attendance on a custom local participant roster (not ICS-211, though EMPG's cost match is why it asks for name, date, times, and activity), and every sheet is then **transcribed into a master spreadsheet holding every team's attendance** — so the retyping is the real cost, and exporting the board's own rows in the agency's column mapping is the real deliverable; the rendered paper sheet is the secondary one. Three things make it non-trivial, all designed rather than deferred: round-trip travel time is carried alongside a presence duration and never added to it, re-exporting a board must read as a re-run rather than silently doubling rows in a spreadsheet this app cannot see, and the agency staff filling half the room are recorded as external participants without joining the roster.

**Guided setup for the EC standing the team up (phase M1B).** This module silently defaults roughly two dozen per-team policy decisions the moment a team record is created — whether the en-route tag state exists, who may open a tag board, how long whereabouts detail is retained, what the organizational levels are called, which training rules apply. A default nobody was shown is not a policy. M1B adds a **policy register** listing every one of those settings with its value, its default, and the section that governs it, plus a catalog of **sourced ICS and ARES hints** attached to the decisions they bear on. Three rules make it safe: setup is always skippable and a team that never opens it works on safe defaults; a hint may never block a save, disable a field, or be consulted by a permission check; and each hint states whether its source *requires*, *recommends*, *delegates*, or merely *exemplifies* — never collapsing those four, because rendering a delegated question as a requirement invents a national standard that does not exist. The register itself is M1 schema (a setting added after teams exist is a migration plus a guess); M1B is the stepper, the catalog, and the decision log over it. See `TEAM-MANAGEMENT-NOTES.md` section 5.20.

Also carries the Teams-dependent half of "can hear" station-to-station coverage logging (shipped 2026-08-02, see `CHANGELOG.md`) — named team locations (shelters, EOCs), location-to-location coverage, and Coverage Assessment reporting for team managers. See `TEAM-MANAGEMENT-NOTES.md` section 5.6; the per-net capture it builds on has already shipped and is not blocked by this module.

**Phases and model assignment.** The concept's section 10 is authoritative and carries the exit criteria; this is the index. Phase labels are **M0-M6 (plus M1A, M1B, M3A, M3B), phases of this module** — not roadmap tiers. "Teams phase M3" is unambiguous; "Milestone 3" is not, since this whole module sits inside Milestone 2.

One tier for a module this size is wrong in both directions: it overpays for the mechanical parts and underinvests in the six places where a silent bug is expensive. The split follows **Opus writes the schema and the invariants, Sonnet builds against them, Haiku fills in repeated instances of an established pattern.**

| Phase | Delivers | Model |
|---|---|---|
| M0 | Discovery: data dictionary, permission matrix, sample import, pilot scenarios | Human conversation with **Opus**; not an implementation task |
| M1 | Team/unit records, membership lifecycle, scoped grants, audited claims, the policy register and its defaults | **Opus** schema, permission helper, and register; **Sonnet** UI/CRUD; **Opus review gate** |
| M1A | Tag board: presence occasions, tag in/out, places, live view, guarded close | **Opus** presence state model and its relation to the canonical hours sources; **Sonnet** board UI, tagging, live updates, exports; **Opus review gate on the presence model**. Depends on M1 alone |
| M1B | Guided team setup, doctrine hint catalog, policy decisions, SOP-draft export | **Sonnet** throughout — a stepper over an existing settings table, a read-only catalog, and a decision log are established patterns here; **Haiku** for further hint entries once the four-strength shape is verified. Depends on M1 alone |
| M2 | Intake, assisted maintenance, CSV import catalog, freshness/reminders | **Opus** import/identity engine; **Sonnet** forms and batch UI; **Haiku** template and field-guide files; **Opus review gate on commit path** |
| M3 | Training, task books, station configurations and capabilities, roster search | **Opus** capability model and match semantics; **Sonnet** catalogs, views, exports; **Haiku** additional saved views |
| M3A | Asset register, kits, custody, maintenance schedules, SWR sweeps | **Opus** containment and the checkout transaction; **Sonnet** registration, manifests, queues; **Opus review gate on handoff** |
| M3B | Procedures, PACE cards, alert stages, radio callouts; then optional Twilio SMS | **Sonnet** for everything except SMS; **Opus** for consent, check-at-send, and webhook validation; **Opus review gate on the webhook** |
| M4 | Net/team association, participation attribution, report adapters, coverage | **Opus** attribution rule (time handling, now over **three** canonical actual-time sources: net check-in, Events shift, and M1A tag); **Sonnet** adapters, exports, coverage rollups |
| M5 | Plan objectives, requirements, candidate matching, reservations, packets | **Opus** reservation conflict model (reuse M3A's answer); **Sonnet** wizard and Events wiring |
| M6 | Reviewed ICS-202/204/205/205A package, versioning, after-action actions | **Sonnet** reusing Events builders; **Haiku** additional form mappings |

**M1-M3 are the membership MVP** and independently replace the spreadsheet. **M1A is the shortest path from a roster to something a team can run an activation with**, and needs nothing but M1. **M1B is the cheapest useful thing for the person standing the team up**, and is almost entirely content and forms over a register M1 already had to build. M1A, M1B, M3A, and M3B are each independently shippable and depend on none of the others. Only M5 and M6 require Events.

**Sequencing against the two prerequisites above.** *Schema Tooling Decision* should be settled before M1 creates the first Teams tables, and *UTC-Aware Datetime Hardening* should land first — Teams adds dozens of dated columns, and adding them naive means they join the sweep that item exists to end. Neither blocks M0, which is pure discovery and can start any time.

**Blocked on:** core web app stability, self-hosting, and Docker packaging being in good shape first. That gating is unchanged; the phase breakdown above is what to do when it lifts, not a signal to start.

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
