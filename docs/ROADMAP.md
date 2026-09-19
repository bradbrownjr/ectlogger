# ECT Logger — Product Roadmap

*Last updated: 2026-09-18*  
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

### Thinking levels for sub-agents

The model tier decides *who* does the work. The thinking level decides *how much reasoning budget is spent before the first edit*. They are independent, and the second one is the more common source of waste: an expensive model on a transcription task burns tokens restating a design that is already settled, while a cheap model with no budget at all on a concurrency question writes something that looks right and passes its own tests.

- **none** — the task is fully specified and the work is transcription. Repeated instances of a verified pattern, blank template files, one more field mapping against a proven builder.
- **think** — ordinary feature work against an established pattern with a clear spec. The default for Sonnet.
- **think hard** — more than one implementation looks correct and the wrong one fails quietly: concurrency, recurrence and timezone math, idempotency, and anything where running the same operation twice must not produce two records.
- **ultrathink** — schema, invariants, permission boundaries, and every review gate. Deliberately rare. If a plan has ultrathink on most of its packages, the packages are the problem, not the budget.

Items carrying a **Model:** line but no **Think:** line predate this convention; read them as `think` for Sonnet and Opus and `none` for Haiku.

### Documentation coverage for sub-agents

Every item that changes user-facing behavior carries a **Docs:** line naming which audience paths on the help site the work has to land in, using the path names from the Documentation & Help Site Overhaul item below: **operators**, **net-control**, **net-managers**, **admins**, **self-hosting**, **reference**, or **none**.

The line is not a reminder to write documentation afterward. It is part of the item's scope, the same as its migrations and its tests, and an item is not done until those pages exist. A feature that reaches production undocumented is a feature most of its audience will never find, which is how a net manager ends up asking for something that shipped four months ago.

Two rules make this survive contact with a real build:

- **Name the paths, not the files.** "Docs: net-managers, reference" is checkable by whoever reviews the merge. "Update the docs" is not.
- **`none` has to be argued.** Write `Docs: none (no user-visible change)` and mean it. Infrastructure, refactors, and test work legitimately take it; anything a user can see or click does not.

Items predating this convention get a **Docs:** line when they are picked up, not retroactively in bulk. The Public Service Event Support item below already carries the long-form version of this as its own "Documentation deliverables" phase, which is the pattern generalized here.

---

## Milestone 0 — Codebase Health & Maintainability

*The bulk of this milestone (0.1 confirmed bugs, 0.2 orphaned code, 0.3 guardrails, 0.4 the modularity and componentization program) completed between 2026-07-03 and 2026-07-06 and has been pruned. What it delivered: a test suite and CI pipeline, React error boundaries, WebSocket resilience, SMTP timeouts, IANA timezone validation, composite indexes, shared frontend hooks, `app/permissions.py`, the backend router facades, and the frontend page splits. The patterns those splits established are documented in [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) ("Backend router-split (facade) pattern", "Frontend component-split pattern", "Post-split verification checklist").*

***Milestone 0 is complete as of 2026-07-29.** Every section has shipped and been pruned. Section numbers are not reused, so commit messages and docs referencing "Milestone 0.4" or "Milestone 0.7" still resolve against the changelog. New codebase-health work should open a new section here rather than reopening a pruned one.*

### 0.10 — `DATABASE_URL` mangles an explicit async driver

**🐛 `sqlite+aiosqlite:///...` becomes `sqlite+aiosqlite+aiosqlite:///...` and the app will not start** *(found 2026-09-18 while standing up the documentation demo instance)*

**Model:** Haiku. **Think:** none.
**Docs:** self-hosting, if the fix changes what a valid `DATABASE_URL` looks like. Otherwise none (the documented form already works).

`app/database.py` normalizes a SQLite URL by doing a plain string replace of
`sqlite:///` with `sqlite+aiosqlite:///`. That substring also occurs inside
`aiosqlite:///`, so a URL that already names the async driver gets it inserted a
second time, and SQLAlchemy's dialect loader fails with `ValueError: too many
values to unpack` — an error that says nothing about what is actually wrong.

Nobody has hit this in production because `.env.example` documents the plain
`sqlite:///./ectlogger.db` form and that is what everyone uses. It is a trap for
the next person who reasonably assumes the explicit driver form is also
accepted, and the self-hosting documentation is about to get more eyes on it.

- [ ] Only prepend the driver when it is not already present, and cover both forms with a test

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

### Documentation & Help Site Overhaul

**✨ Rebuild ectlogger.us as a real help site: a marketing landing page, four audience paths, current screenshots** *(KC1JMH)*

**Model:** Opus for the information architecture, the audience split, and the screenshot pipeline design (Phases 0-1); Sonnet for page-by-page writing against the settled outline (Phases 2-5); Haiku for mechanical moves, link fixes, and front-matter stamping. **Opus review gate before the branch merges**, because GitHub Pages publishes from `main` and there is no staging site.
**Think:** think hard for Phases 0-1; think for the writing phases; none for the mechanical ones.
**Docs:** all paths. This item *is* the documentation.

This is a long-running feature branch (`feature/docs-site`) under the rules in `.github/copilot-instructions.md`. Doc-only work never reaches beta, so the usual beta-confirms-before-prod gate is replaced by a local Jekyll preview plus the Opus review gate. Nothing lands on `main` until the whole site is coherent, because a half-migrated site is worse than the current one.

#### What is actually wrong today

Audited 2026-09-18 against the live site, not from memory:

- **There is no landing page.** `README.md` *is* the homepage, because GitHub Pages runs `jekyll-readme-index` by default. One file is being asked to be the marketing pitch, the feature list, the role reference, the workflow explainer, and the developer's documentation index. It does none of them well, and a newcomer's first screen is a 60-item emoji bullet list.
- **The app's Help menu does not link to help.** `Navbar.tsx` labels the item **User Guide** and opens `https://ectlogger.us`, which is the README. The one guide we have is two clicks further in, and nothing on the homepage points at it above the fold.
- **There is no navigation.** The header offers Home, GitHub, and Open App. Twenty markdown files under `docs/` have no sidebar, no breadcrumb, no next/previous, and no search. Every page is an island reached by a link somebody remembered to write.
- **The user guide is one 1,084-line scroll** (82 KB) running from "enter your email address" to the admin panel with no landmarks, no per-audience entry point, and **not one screenshot**.
- **Six screenshots exist, all from 2026-01-25**, all light-mode, referenced from exactly one place: the README hero. They predate the multi-monitor layout, the wide-screen dock, traffic handling, the card-button redesign, the logo upload, and the marker palette. `check-in-log.pdn` (a Paint.NET source file, 188 KB) is committed alongside them.
- **Internal working documents are published to the public web.** Verified 200 responses for `docs/DEVELOPMENT`, `docs/DESIGN`, `docs/USER-STORIES`, and every file in `docs/concepts/` including the 190 KB `TEAM-MANAGEMENT-NOTES.md`. These are design conversations and deployment internals, not user information, and they are currently a larger share of the site than the user guide is.
- **There is no `sitemap.xml` and no `robots.txt`.** Both 404. Nothing tells a search engine which of those twenty files is the one an operator should land on.
- **The content has measurably drifted.** Concrete, verified against `backend/app/models.py` and yesterday's commits:
  - README's station-status list names **Available** and **Recheck**, neither of which is a `StationStatus`, and omits **Has Traffic**, **Relay**, **Announcements**, and **Mobile**, all four of which are.
  - README's net-role table lists **Secondary NCS** as a distinct role. There is no such role; multi-NCS is simply more than one active `NetRole("NCS")`.
  - README's global-role table omits the `NCS` value that `UserRole` actually has.
  - README says only an owner, co-manager, or rotation member can self-grant Logger. Commit `58b99cf` (2026-09-18) widened that to any active net staff.
  - `docs/training_video_outline.md` teaches OAuth sign-in with Google, Microsoft, and GitHub. The OAuth callback is a `501` stub and has never been a working login path.

#### Standards consulted, and what each one actually decides

Per the house rule on checking doctrine before design: say whether a standard answers the question, delegates it, or conflicts with us.

- **Diátaxis (tutorial / how-to / reference / explanation) — answers it.** This is the framework that resolves the stated tension between "accessible to the new person" and "enough for power users." They are not a spectrum to compromise along; they are different document types. The newcomer needs a *tutorial* (one guaranteed-to-work path, no choices). The power user needs *reference* (complete, scannable, no narrative). Writing one document that serves both is what produced the 1,084-line guide. Every page in the new site declares which of the four it is, and pages do not mix modes.
- **ISO/IEC/IEEE 26514:2022, *Design and development of information for users* — answers the document-control half.** It is where the per-page front matter comes from: a stated audience, an owner, a revision, a last-reviewed date, and a statement of which product version the page describes. It also supplies the completeness checklist we will grade the old pages against. We adopt its apparatus, not its deliverable list; it assumes shipped software with a release train and we deploy continuously.
- **ITIL 4 — delegates the structure, answers the lifecycle.** ITIL has nothing to say about how a user manual is laid out, and its Knowledge Management practice assumes an internal service desk with a ticket queue feeding article creation. We have GitHub Issues, the in-app Submit Feedback form, and one maintainer, so the service-desk machinery does not transfer. Three things do, and they are the parts that keep this from rotting again: **every article has a named owner and an explicit review-by date**, **publish incrementally rather than holding everything for a big-bang release**, and **maintain a known-issues page** so a recurring question has somewhere to live that is not a changelog entry. The in-app Diagnostics and Feedback tools are already the intake for that last one.
- **WCAG 2.2 AA — constrains it.** This matters more than usual for an audience that includes served agencies with Section 508 obligations. Binding rules: every screenshot carries real alt text describing what it shows (1.1.1); **no instruction may exist only inside an image** (1.4.5), so a screenshot always accompanies prose rather than replacing it; annotation callouts need contrast and a shape or number, never color alone (1.4.1); headings are descriptive and nested without skipping (2.4.6, 2.4.10).
- **Plain-language practice — conflicts, mildly, and the conflict is productive.** The existing voice runs to long, dense, technically specific paragraphs, and that is genuinely good writing for *explanation* pages. It is wrong for *procedures*. Resolution: explanation and reference keep the current register; how-to pages get numbered steps, one action per step, imperative mood, and the outcome stated before the steps.

#### Voice

The site is written the way the current user guide's best sections are written, which is the same voice as the MEPN material: **a sysop writing to other operators.** Practical, specific, never breathless.

- "You" for the reader-operator. "We" sparingly, for the project. Never "ECTLogger is pleased to offer."
- Sentence case for every heading, button reference, and label. Protocol literals keep their real casing: callsigns, `ICS-309`, `WXOBS`, `@MAINE`.
- **Always give the why.** A sentence that says what a control does without saying what problem it solves gets rewritten. This is already the strongest habit in the existing guide and it is the thing to preserve above all else.
- Name real things: "Net Control", "on frequency", "the check-in row", "the repeater is running weak." Avoid developer vocabulary entirely. The changelog's forbidden-terms list applies here too: no "component", "endpoint", "modal", "boolean", "refactor".
- Expand an acronym on first use per page, then use it freely. Assume the reader knows amateur radio; do not assume they know ARES, RRI, or ICS.
- Honesty about limits. If a feature needs MFA set up, or only works on a template-based net, say so where the reader will hit it, not in a footnote.
- **Emoji: retire them from body copy.** They are load-bearing in exactly two places and stay there: the ROADMAP's type tags, and the changelog. The README's one-emoji-per-bullet feature list is the single biggest reason the homepage reads as unserious.

#### Target structure

The landing page is marketing. Everything under `/docs/` is a path, and every path opens with a "start here" page that states who it is for and what the reader will be able to do at the end.

```
/                     Landing page (new index.md) - what it is, who it is for,
                      the four paths, one live screenshot, one call to action.
                      Describes what ECTLogger does; never names another product.

/docs/                Documentation home. The four paths, a search box, and the
                      three "first ten minutes" tutorials.

/docs/start/          Tutorials - the only pages with a guaranteed single path
                      Check into your first net . Run your first net .
                      Set up your first recurring schedule

/docs/operators/      PATH 1 - Operators (check-ins). The largest audience and
                      the one that must never need another path to participate.
                      Account and profile . Finding a net . Checking in .
                      Status, rechecks, and checking out . Chat, polls, topics .
                      Location and the map . Filing traffic . Your statistics .
                      On a phone in the field

/docs/net-control/    PATH 2 - Net staff (NCS, Logger, Relay) running a live net
                      The net toolbar . Logging check-ins . Speed entry .
                      Frequencies and multi-NCS . Roles and stepping away .
                      Chat moderation and mutes . Authenticated nets .
                      Traffic handling . Multi-monitor and wide-screen .
                      Closing the net

/docs/net-managers/   PATH 3 - Net managers who own nets and schedules
                      Creating a net . Recurring schedules . Net staff and NCS
                      rotation . Scripts, notes, announcements . Lobby and
                      auto-close settings . Cancelling, archiving, restoring .
                      Reports, ICS-309, exports . CSV import and backfill .
                      Schedule statistics and leaderboards

/docs/admins/         PATH 4 - Platform administrators (the Admin panel)
                      Users and roles . Custom fields . Frequencies . Branding
                      and themes . Maintenance banner . Security, MFA, lockouts .
                      Traffic settings . Contacts

/docs/self-hosting/   Running your own instance. A separate track, not a fifth
                      path - see the decision below.

/docs/reference/      Reference - complete, scannable, no narrative
                      Station statuses . Roles and permissions matrix . Keyboard
                      shortcuts . Check-in fields . Speed-entry syntax .
                      Location formats . Emails we send . RSS feeds . Glossary

/docs/about/          Changelog . Roadmap . Privacy . Known issues . Getting help
```

**Decisions made, and the reasons, so they are not relitigated mid-build:**

1. **Path order is privilege escalation: operator, net staff, net manager, administrator.** A person becomes staff on somebody else's net before they own a schedule, so the nav order matches the career. This differs from the order in the original request; say so if you want it changed before writing starts.
2. **Self-hosting is its own track, not a fifth path.** The word "administrator" covers two different people: the club member with the Admin role in a hosted instance, who never touches a shell, and the person running the service on a VPS. Merging them buries the first audience under `systemctl`. Path 4 is the Admin panel only; the server operator gets `/docs/self-hosting/` with the existing installation, deployment, email, logging, fail2ban, and security documents reorganized behind one index.
3. **Internal documents leave the published site.** `docs/concepts/`, `DEVELOPMENT.md`, `DESIGN.md`, and `USER-STORIES.md` stay in the repository, where they belong, and get an `exclude:` entry in `_config.yml`. `ROADMAP.md`, `CHANGELOG.md`, and `PRIVACY.md` stay published; the app links to all three.
4. **`README.md` becomes a repository README again.** What the project is, a screenshot, a link to the site, how to run it locally, how to contribute, the license. The marketing copy moves to `index.md` and the feature list becomes a page under `/docs/`.
5. **Light-mode screenshots only.** The repo already made this call once (commit `eaff80c`) and the layout's `.light-only` / `.dark-only` swap has been dead code since. Halving the capture count is worth more than showing the dark theme in every figure. The dark theme gets one dedicated figure on the personalization page.

#### The screenshot problem, and the actual fix

The screenshots are eight months stale because refreshing them is manual, and any process that depends on somebody remembering to re-crop twenty PNGs will produce eight-month-stale screenshots again. **The deliverable is not new screenshots; it is a command that regenerates every screenshot in the site.**

- `scripts/docs-screenshots/capture.mjs` drives headless Chrome through the Browserless instance, following the mechanics already recorded in the browserless skill: connect with `connectOverCDP` rather than `connect`; intercept and refulfill requests to the baked-in API hostname; use a tall window size at connect time, because the app shell's `overflow: hidden` root silently truncates a fullPage capture to one screen; select MUI controls by `aria-label`, not `title`.
- `scripts/docs-screenshots/shots.yml` is the manifest, one entry per figure: id, route, viewport, element selector for a partial capture, crop padding, any callout annotations, the alt text, the caption, and the doc page that embeds it. Adding a figure means adding an entry, not writing a script.
- **Annotations are drawn at capture time**, as CSS injected before the screenshot, never painted on afterward in an image editor. A hand-annotated PNG cannot be regenerated, which is how we got here.
- **A figure that tells the reader where to click carries a bright red box around the target**, or a bright red underline where a box would swallow half the screen. Red at full saturation (`#e53935`, 3 px) against the app's blue-grey chrome is the highest-contrast marker available and reads as "look here" without a legend. Two rules keep it honest: the annotation is declared in the manifest as a selector, so it moves when the control moves instead of pointing at empty space after a layout change; and per WCAG 1.4.5 the prose still names the control by its label, because a red box is unusable to a screen reader and the alt text has to carry the same instruction in words.
- **Captures run against a seeded demo instance, never beta.** Beta holds a copy of production's database with real names and email addresses, and a published screenshot of it is a privacy incident. `backend/scripts/seed_demo_data.py` builds a throwaway database with a fixed fictional roster, a closed net with a full log, an active net mid-check-in, a recurring schedule with a rotation, and a few traffic messages. This shares the `FRONTEND_PORT` groundwork already scoped in item 0.9, so sequence them together if both are live.
- **One documented cast of characters**, used in every screenshot, every worked example, and every speed-entry sample, written into `docs/DEVELOPMENT.md` so examples stop being invented page by page. The guide currently improvises `KC1ABC`, `N1XYZ`, and `W1DEF`, every one of which is a callsign the FCC can and may already have issued to a real operator.

  **The rule: every example callsign carries a four-letter suffix, which the amateur service cannot issue.** The FCC's sequential call sign system tops out at a three-letter suffix (1x3 and 2x3 being the longest forms), so a four-letter suffix is structurally unassignable in perpetuity. This is the same reasoning behind `N0CALL`, the placeholder WSJT-X, Direwolf, and most of the packet ecosystem ship as their default. It means no screenshot can ever put words in a real licensee's mouth, and a ham reading closely recognizes the shape as a placeholder without it looking foreign or wrong.

  Geographic four-letter suffixes read most naturally in a check-in table. Proposed roster:

  | Callsign | Name | Stands in for |
  | --- | --- | --- |
  | `W1PINE` | Alex Reed | Net Control, the schedule owner through most of the guide |
  | `K1COVE` | Dana Whitfield | Logger |
  | `N1LAKE` | Marcus Ellery | Relay |
  | `KC1HILL` | Priya Nandan | A regular participant, the "you" of the operator path |
  | `W1PORT` | Joan Alderman | Second NCS on a multi-frequency net |
  | `N1ROVE` | Chris Baumann | Mobile station, used for the status and location examples |
  | `K1CAMP` | Terry Osgood | Shelter station, used in the traffic examples |
  | `W2FERN` · `N2OAKS` · `K3BASE` · `W1MILL` · `N1BIRD` | — | Table filler, enough rows for a realistic log |
  | `N0CALL` | — | Reserved for "not configured yet" examples only |

  Organizations are named so they cannot be mistaken for a real group or tread on anyone's mark: **Example County ARES**, **Example County SKYWARN**, **Tuesday Evening Club Net**. Locations stay real New England towns, since the map pages need addresses that actually geocode and a town name is not personal information.
- Output lands in `docs/img/<section>/<shot-id>.png`, PNG, width-capped. `assets/screenshots/` and its `.pdn` file are deleted once the README hero is re-pointed.
- Every figure gets alt text from the manifest, and no procedure step depends on the reader seeing the image.

#### Phases

**Phase 0 — Scaffold** *(complete 2026-09-19)*

- [x] Branch `feature/docs-site`
- [x] **Preview repo.** A throwaway `ectlogger-docs-preview` repository with Pages enabled, that `feature/docs-site` is pushed to for review. This is the real GitHub Pages build, so the plugin set and versions match production exactly, and it needs nothing installed on the dev host. Delete the repo when the branch merges, and see the limitation recorded below
- [x] `_data/nav.yml` plus a sidebar. The single `default.html` became a `shell` layout with `default`, `docs`, and `landing` inheriting from it, and the stylesheet moved to `assets/css/site.css`
- [x] Front-matter template: title, summary, kind, audience, owner, revised, applies-to, permalink. Documented in `docs/DEVELOPMENT.md`
- [x] `_config.yml` excludes, `jekyll-sitemap`, `robots.txt`, and directory-style permalinks
- [x] Seed roster and organization names into `docs/DEVELOPMENT.md` before any page is written, so no agent invents its own examples

**What the preview repo does not prove.** It serves from a subpath
(`/ectlogger-docs-preview/`) rather than a domain root, so `scripts/docs-preview.sh`
rewrites `baseurl` before pushing and anything built from a root-absolute path is
wrong there and right in production: figures, and any hand-written href starting
with a single slash, will 404 on the preview. Links emitted by the layouts go
through `relative_url` and are fine. This was not anticipated when the decision
was made and it is worth knowing before trusting a preview. What the preview is
genuinely for is the failure with no other safety net: a Liquid or YAML error in
a layout takes down every page of the real site at once, and there is no staging.

**Phase 1 — Landing page and documentation home** *(complete 2026-09-19)*
- [x] `index.md`: the pitch, who it is for, the four paths, one current screenshot, one call to action. No competitor comparisons, stated or implied
- [x] `README.md` cut back to a repository README. The line comparing ECTLogger to "clunky desktop apps or decade-old web interfaces" is gone
- [x] `/docs/` home with the four path cards and the three tutorials, plus all eight path index pages
- [x] Screenshot pipeline running end to end, proven by the landing-page hero being generated rather than hand-captured, and by an annotated figure with a real red box
- [x] **Search**, wired in early so every page is indexed as it is written: a `search.json` the site generates from its own pages, plus Lunr in the layout and a search field in the sidebar. This is what `just-the-docs` does, and it is the ordinary answer for a Jekyll site on GitHub Pages. We take the mechanism, not the theme, since the layout already matches the app's Material design and there is no reason to throw that away. The index page needs `render_with_liquid: true` in its own front matter to opt back out of the site-wide Liquid switch-off
- [x] `Navbar.tsx` Help menu: **User Guide** points at `/docs/`, and a **Known Issues** item added. `AboutModal.tsx`'s privacy link picked up the trailing slash the new permalinks need

**Phase 2 — Operator path and the three tutorials** *(not started)*
- [ ] Three "first ten minutes" tutorials, each verified by walking it in a browser against the seeded instance
- [ ] Nine operator pages, harvested from `USER-GUIDE.md` where the existing text is good and rewritten where it is not
- [ ] Figures for check-in, status, map, chat, and mobile

**Phase 3 — Net staff and net manager paths** *(not started)*
- [ ] Ten net-control pages and nine net-manager pages
- [ ] The multi-monitor and wide-screen material needs real figures more than any other section; it is currently four paragraphs describing a spatial layout in words
- [ ] Traffic handling gets its own sub-index; it is large enough to be a manual on its own

**Phase 4 — Administrator path, self-hosting track, reference** *(not started)*
- [ ] Eight Admin-panel pages with a figure each
- [ ] Self-hosting index over the existing install, deploy, email, logging, fail2ban, and security documents, each re-checked against what the scripts actually do today
- [ ] Reference section, generated from the code where possible so it cannot drift: station statuses and the permissions matrix are the two worth generating
- [ ] Glossary

**Phase 5 — Sweep, verify, retire** *(not started)*
- [ ] Factual sweep of every page against the running app, with the five confirmed drifts above as the starting list
- [ ] Delete `USER-GUIDE.md` (fully superseded), `training_video_outline.md` (a chat transcript that teaches a login path that does not exist), `assets/screenshots/`
- [ ] Link check across the whole site, including the links the app itself opens
- [ ] Every page carries an owner and a review-by date
- [ ] `docs/about/known-issues.md` seeded from recent feedback submissions
- [ ] The whole of "Keeping it current" below, which is the part that decides whether any of this is still true in a year

#### Keeping it current

The 2026-01 screenshots did not go stale because anyone decided to let them. They went stale because nothing made them anyone's problem on the way past. A rebuilt site with no mechanism attached decays the same way and on roughly the same schedule, so these are deliverables of Phase 5, not aspirations:

- **`.github/copilot-instructions.md`, "Documentation Requirements", rewritten.** It currently tells every agent to update `README.md`, `docs/USER-GUIDE.md`, `docs/CHANGELOG.md`, and `docs/DEVELOPMENT.md`. Two of those four will not exist in that role any more, and an instruction naming a deleted file is worse than no instruction, because it gets followed into a new file nobody reads. It must instead name the audience paths and require a feature to say which ones it touches.
- **The `Docs:` line becomes mandatory on new roadmap items**, per the convention added to "How to Read This Document" above. This is the load-bearing piece: it puts documentation inside an item's scope at the moment the item is written, rather than leaving it to a checklist at the end when the budget is gone.
- **Definition of Done gains a documentation clause** alongside the existing changelog one, so "the pages for its audience paths exist" sits next to "the changelog is updated" rather than below it.
- **Every page carries an owner and a review-by date** in its front matter, per ISO 26514 and the ITIL lifecycle discipline. A yearly sweep of pages past their review date is a real, bounded task; "is the documentation still accurate" is not.
- **Screenshots are regenerated by command, not by hand.** Re-running the capture script is a chore an agent can be handed in one line, which is the whole reason the pipeline exists rather than a folder of PNGs. Worth running against the seeded instance after any release that changes the check-in table, the net toolbar, or the card buttons.
- **A page that documents an unshipped feature is a bug.** The Public Service Events item already states this rule for itself ("until then no user-facing guide may describe this feature as available"); it generalizes. The site describes production, and a feature baking on a branch gets its pages written on that branch and merged with it.

#### Decisions settled 2026-09-18

1. **Example callsigns and names: invented, and structurally unassignable.** Four-letter suffixes throughout, with generic fictional names and Example County organizations. Full roster in the screenshot section above.
2. **Preview: a separate GitHub Pages repository, not a local Jekyll install.** GitHub Pages serves one site per repository from one branch, so a docs branch is invisible until it merges, and merging a half-built site is the one outcome this branch exists to avoid. Pushing the branch to a throwaway preview repo gets the genuine Pages build, with the same plugins and versions, and installs nothing. Rejected: the `jekyll/jekyll` container, because Docker is not usable by this account.

   **The escape hatch, if the push-and-wait loop proves too slow for layout and search work:** `sudo apt update && sudo apt install -y ruby-full` (Debian 13 here, `ruby-full` 3.3 in the repository, and `gcc`, `g++`, `make`, and the `zlib`/`openssl` headers native gems want are already present), then userspace from there — a `Gemfile` pinning `github-pages`, `bundle config set --local path vendor/bundle`, `bundle install`, and `bundle exec jekyll serve` for live reload. Add `vendor/` and `_site/` to `.gitignore` if it comes to that. Prose iterates fine on a one-minute build; a stylesheet does not, which is the only thing that should trigger this.

   Worth being explicit, since the two got confused once already: **this has nothing to do with screenshots.** Browserless photographs the running application, which is what goes *inside* the pages. Jekyll builds the pages themselves. Neither needs the other.
3. **Search: Lunr over a Jekyll-generated JSON index**, the `just-the-docs` mechanism, on the default GitHub Pages build. At roughly fifty pages this is comfortably inside Lunr's range; it starts to hurt in the hundreds. Rejected for now: Pagefind, which is the better answer for a large site but needs a GitHub Actions build, and an Actions build is a new way for the site to stop updating. Revisit if the site ever passes a few hundred pages, and pick up the CI broken-link gate at the same time.
4. **Path order: operator, net staff, net manager, administrator.** Confirmed.

#### Risks

- **Merging a half-built site.** A partial migration leaves the app's Help menu pointing at pages that do not exist yet. Mitigation is the feature-branch rule already in force: nothing merges until Phase 5 passes.
- **Screenshots leaking real user data.** The only real mitigation is the seeded instance. Do not take "just this one" from beta.
- **Repository size.** Roughly sixty PNGs at a few hundred KB each. Width-cap on capture, and do not commit intermediate crops.
- **Writing volume.** This is around fifty pages. Split by path across agents so a single context does not try to hold the whole site, and give each agent the finished outline plus the voice rules rather than asking it to invent structure.

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

**The application helps build the ICS-205; what it must never do is approve it.** An earlier revision of this entry said the 205 is received rather than authored, which is too narrow. It is true of a large incident with a staffed communications unit. It is not true of the ordinary county activation, where no such unit exists, the EC is effectively the communications lead for the amateur resources, and the team is the only party in the room who can say which repeaters, simplex frequencies, and digital paths are actually available. Drafting it is the team's job. The distinction that matters is not authored versus received — it is **drafted versus approved**, and that is the line the app enforces.

- **The team maintains one master communications plan.** The standing channel set: repeaters and their coverage, simplex frequencies, digital paths, tactical call signs, and the PACE assignment for each function. It is maintained between incidents, which is the only time it can be done properly, and it is the input to everything below. These are the channel and PACE records Teams phase M3B already builds.
- **An incident's 205 is instantiated from the master as a snapshot, never a live link.** The master will be edited next month; the 205 that was issued on the night must not change when it is. Same rule as every other issued document above.
- **Then it is edited for that incident** — add the channels the agency assigned, drop what is irrelevant, add the other agencies' resources that were given to us. A derived plan that cannot be edited is a template, not a plan.
- **Authorship is not approval, and the app records which it has.** Whether the team's draft becomes *the* incident's communications plan depends on whether an incident communications unit exists and on what the served agency's practice is. An unapproved plan renders visibly as a draft, an approved one records who approved it and when — the same approved-versus-draft discipline section 5.18 already applies to procedures, and the same reason section 5.20 says scaffolding is not adoption.
- **Both directions work.** When the agency issues its own 205, that one is recorded as authoritative for the incident and ours becomes our input to it, or our portion of it, rather than a competing plan.
- **One channel record set, three renderings.** The PACE card is our fallback ladder, the ICS-205 is the incident's channel plan, and the ICS-205A is the contact list. They overlap heavily and they are not the same document, so they render from one set of channel records rather than three stores that will disagree by the second activation. This is the same "one capture, many renderings" rule the situational awareness feed follows.
- **Who approves a communications plan locally is a setting**, because it differs by county and by agency, and a default that assumes either answer is wrong somewhere.

We author and hand over the ICS-213, 214, and 309 outright. The 205 and 205A we draft, and someone else may or may not approve.

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

**Observations belong on a map, and the map is theirs — this is the attendance spreadsheet again.** During the drill, an EMA staff member in the EOC built the county's common operating picture in ArcGIS: road closures, shelters and their status, trees and wires down, hazards. Her inputs were her peers' reports and **our hand-transcribed radio notes, retyped by her.** That is the same disease as the master attendance sheet, and it has the same cure: not a prettier form on our side, but an export in the schema her system already reads.

- **Do not build a GIS.** ArcGIS is the county's system of record for the common operating picture and should stay that way. This feature adds a location to an observation and emits it in an interchange format — GeoJSON and CSV with coordinates are the usual two — so her layer ingests it without anyone retyping. **Confirm which her layer actually accepts, and match its field names**, exactly as the attendance export matches the master sheet's columns. A file-based export comes first; a live integration with credentials and hosted feature services is only justified if the file proves insufficient, and it is a vendor commitment either way.
- **Most radio-reported locations are not coordinates, and forcing them to be is the dangerous failure here.** "Tree down on Route 22 near the Gray line" is the normal shape of an observation. The location field therefore accepts a named place, an intersection, a road segment, free text, or a coordinate, and **what was said is recorded verbatim**. Converting that to a point is a **separate, attributed act** — who placed it, when, and by what method (reported coordinate, map click, geocoder result) — carrying a precision indicator. Silently geocoding a vague description into a pin makes a guess indistinguishable from an observation, to a consumer who is dispatching resources on it. That is "never invent a fact to fill a blank" with a truck attached.
- **An observation with no location is still a valid observation.** It exports as attributes without geometry rather than being dropped, and any map view states how many entries it is not showing. A map that silently omits a third of the reports is worse than no map.
- **Provenance has to survive onto the map**, because symbology flattens everything it does not encode. A third-hand unconfirmed report and a coordinator's confirmed one must not render identically. The source type and confirmation state travel into the exported attributes, not just our database.
- **The monitored-source constraint gates the layer too.** If the team's setting says scanner-derived content is logged internally and not shared outward, it cannot appear on an exported layer either. An export is a sharing channel; treating it as a file rather than a disclosure is how that setting gets quietly bypassed.
- **Our own map is a small view over our own observations, and never claims to be the county's picture.** Worth knowing what exists today before scoping it: the only geographic feature in the application is a statistics map that coarsens check-in locations to state and province centroids. There is no per-record geometry, no layer infrastructure, and nothing here to extend — this is new capability, not a small addition to an existing map.
- **The observation taxonomy is a setting seeded from what the county actually used** — closures, shelters and status, trees and wires down, hazards — because the next county's layer will have different categories and the value of matching hers is precisely that nobody has to translate.

**Inviting the EMA staff member as a user is a second, larger step — and the export may make it unnecessary.** The cheapest version of "help them manage their situational awareness" is that she keeps ArcGIS and stops retyping. If an account is still wanted after that, it is a new kind of principal and needs its own design rather than a role added to an existing one: someone outside the organization, without a callsign, who can see one incident's observations and contribute her own, and who must never reach the team roster, whereabouts detail, member contact information, or net staffing. Her contributions are attributed to her with their own provenance — an EOC report is not something we heard on the radio — and her access is scoped to the incident and expires with it. That is a permission boundary between two organizations, which puts it in the same tier as the Teams permission helper, and it is tracked as its own item below rather than folded in here.

**Do not manufacture entries.** An ICS-214 is written from what happened, never generated from assignments, a plan, or a shift roster — the same rule [`TEAM-INCIDENT-PLANNER.md`](concepts/TEAM-INCIDENT-PLANNER.md) already states for ICS-211 and ICS-214 mappings. A fabricated activity log is worse than none, because it is signed and filed.

**Reuse, do not rebuild.** The Traffic module already owns form definitions, chain of custody, per-net export integration, and form-accurate PDFs. This feature is a fifth form family and a dispatcher beside it, not a second traffic system. ICS-309 stays where it is.

**Open questions — and the answers are settings, not constants.** Cumberland County EMA is the source of the questions below, and it does not speak for the next county, for MEMA, or for any other served agency. An answer obtained from one agency becomes **that team's configured value with that answer as its default**, never a hardcoded rule, column set, or validation. The test is simple: if standing this up for the next county over requires a code change, the answer was written in the wrong place. See the policy register in [`TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md) section 5.20 — settings that are genuinely the agency's policy rather than the team's attach to the served-agency record, so a team serving both a county EMA and the state does not have to average two answers into one.

- What does the EMA's policy actually permit for scanner-derived content — logged internally only, shared within the county, or repeatable outward? This gates the outbound dispatcher for a whole source type. **Setting**, defaulting to log-internally-and-never-dispatch, because that is the only default that is safe when nobody has answered.
- Where does an incident reference get created in practice, given the app is rarely the first system to know an incident exists? Most likely it arrives with the section 5.14 activation record and everything else adopts it, but confirm against a real storm rather than a drill. **Setting** for who may open an incident and whether an agency reference is required before one can be opened.
- Does the county want the SA feed as its own export, or folded into the ICS-214? The drill did both, which may mean both are needed or may mean one was redundant. **Setting**; build both renderings and let the team choose, since the cost of the second one is a formatter.
- Which outbound targets beyond Slack — Teams, Mattermost, a generic webhook, email? A generic signed webhook plus a Slack-shaped formatter probably covers it without committing to vendors. **Setting**, per team, and already planned that way.
- Should a net with two operating sites model the relay explicitly, or is the existing multi-NCS net plus the Relay role enough? The drill worked; confirm before adding anything.
- **What schema does the county's ArcGIS layer actually use** — its field names, its category values, and which file formats it will ingest? This is the same question as the master attendance spreadsheet's columns, it has the same answer shape, and it is the difference between an export that drops into her map and one she has to translate. **Setting**, with her layer's mapping as this team's value.

### Agency Liaison Access

**✨ An account for served-agency staff, scoped to one incident, that can never reach the roster** *(KC1JMH — from the statewide drill of 2026-09-17)*
**Model:** Opus for the principal type and the permission boundary; Sonnet for the invitation flow, the scoped views, and the contribution form.
**Think:** ultrathink for the boundary and the expiry semantics; think for everything else. **Opus review gate before merge**, on the same reasoning as the Teams permission helper: a scoping bug here exposes a roster to another organization and nothing in the interface shows it.

**Do the situational awareness export first and see whether this is still wanted.** The EMA staff member's actual problem is that she retypes our radio notes into her ArcGIS map. An export in her layer's schema solves that without giving anyone an account. This item exists because Brad asked whether she could be invited to help manage situational awareness including our input, and that is a reasonable thing to want — but it is the larger and riskier of the two answers, and the cheaper one may close the case.

**What makes this a new principal rather than a new role.** Every existing actor in this application is either a member of the organization or a guest checking into a net. An agency liaison is neither: an employee of the served agency, usually without a callsign or any amateur licence, who is a peer to the team rather than a part of it, and who needs write access to shared operational data while being permanently outside the organization's private data.

- **Scoped to an incident, expiring with it.** Not to the team, not to the application. Access begins when the incident is opened or the invitation is accepted, and ends when the incident closes, which is what makes issuing one safe during an activation and what stops a storm's invitation becoming a standing account nobody remembers.
- **A deny list is the wrong mechanism.** The boundary is expressed as what the principal may reach — this incident's observations, its map, its own contributions — never as the member surface minus a list of exclusions, because every field added later defaults to visible in the second design and invisible in the first. The roster, whereabouts detail, member contact information, training records, equipment, and net staffing are not "hidden"; they are not in the reachable set.
- **Her contributions are hers, with their own provenance.** A report from an EOC colleague is a coordinator or agency report, not something the team heard on the radio. Attribution and source type must make that distinction visible in every rendering and export, or our after-action will credit our operators with her peers' information.
- **She may not act as the team.** No callouts, no tagging anyone in or out, no traffic origination on the team's behalf, no form approval. Contribution to the shared picture is not authority within the organization — the same rule this project applies to every other workflow boundary.
- **Invitation is a team decision with a record**, issued by team staff, recording who invited whom, for which incident, and when it lapsed. An agency relationship ends; the audit of what its people could see should not.
- **A licence is not required and must not be implied anywhere.** Registration today is callsign-centred; this principal has no callsign, and nothing in the interface should ask for one, generate a placeholder, or display an empty callsign field where a station identifier normally goes.

**Open questions.** Does the EMA's own policy permit its staff to hold accounts in a volunteer organization's system, and who decides that — her, her director, or county IT? Is one liaison per incident realistic, or does a real activation need several with different agencies? And if she contributes an observation that later proves wrong, whose correction is it — hers, or the team's log's?

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

---

#### Build Plan

The phase table above says what each phase delivers and which tier should build it. This is the execution index: the same work broken into packages small enough to hand to one sub-agent in one sitting, each with its model, its thinking level, and the specific sections it needs to read. Section 10 of `TEAM-MANAGEMENT-NOTES.md` remains authoritative for exit criteria; nothing below replaces them, and where this index and a phase's exit criteria disagree, the criteria win.

Package IDs are stable and are meant to appear in commit messages and branch names. `M1A-3` means the same thing a year from now, and a phase that gains a package appends rather than renumbering.

**Before package one.** Three things are true before any of this starts, and none of them is negotiable by a sub-agent that does not know about them:

1. *Schema Tooling Decision* is settled and *UTC-Aware Datetime Hardening* has landed. Teams adds dozens of dated columns; adding them naive means they join the sweep that item exists to end.
2. M0 has exited. Its output is the specification every later package is measured against, and it is a conversation, not an implementation task.
3. All of it lands on a long-running `feature/teams` branch per the Long-Running Feature Branches rules in `.github/copilot-instructions.md`: every phase is commits on that branch, beta tests from the branch, and the merge to `main` happens only once beta confirms. No changelog entry is written until that merge deploys to production, dated for the actual deploy day. Incidental bug fixes made to get a phase shippable are not separate changelog items.

**What a package prompt contains, and what it must not.** The four concept documents run about 2,700 lines. Pasting the set into every sub-agent prompt is the largest avoidable cost in this module, and it also buries the two paragraphs that actually govern the work. The Reads column below names the sections a package needs; the prompt carries those sections, not the set. Section numbers are global across the four documents, so a bare section number resolves through any of their Document Maps. Alongside the named sections, every prompt regardless of tier carries:

- **The four standing rules from section 10** — never invent a fact to fill a blank, never let one workflow grant another's authority, reuse before adding, stop at the phase boundary. They are short, and they are precisely the assumptions a model reading one section in isolation will otherwise make.
- **The one invariant this package must not break**, written as a single sentence. If it takes a paragraph, the package is two packages.
- **The exit test that proves it**, lifted from the phase's exit criteria.
- **The codebase pattern it builds against, named rather than explained** — `DEVELOPMENT.md` "Backend router-split (facade) pattern", `permissions.py`, `ConnectionManager`, the migration template. Naming a pattern the agent can read costs a line; describing it costs a page and drifts from the code.

A package that cannot be briefed this way is too large. Split it.

**M0 — Discovery.**

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M0-1 | Data dictionary, permission matrix, sample import and mapping, pilot scenarios, prioritized report/form checklist | Opus, in conversation | ultrathink | 10 (M0), 11 |

**M1 — Team and Membership Foundation.** The foundation every other phase builds on, and the one place where a quiet mistake is unrecoverable rather than expensive.

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M1-1 | Schema: team, unit, membership, grant, claim, audit, and the policy register with every default it decides | Opus | ultrathink | 6.1, 6.2, 5.2, 5.8, 5.20 |
| M1-2 | Team permission helper: scoped grants, unit delegation, field-level read/write, lifecycle suppression | Opus | ultrathink | 7, 8, 5.2 |
| M1-3 | Additive migrations valid on both upgraded and fresh installations | Sonnet | think hard | 6.1, migration template |
| M1-4 | Router facade plus membership and application lifecycle endpoints, written against the helper | Sonnet | think | 5.2, 5.3 |
| M1-5 | Teams navigation, discovery and privacy settings, roster, member detail, manager-created records | Sonnet | think | 5.1, 5.7, 5.8 |
| M1-6 | Audited record claims, concurrency checks, core export and retention controls | Sonnet | think hard | 5.3, 8 |
| M1-G | **Gate:** the permission helper, probed directly through the API with revoked grants and altered team identifiers | Opus | ultrathink | 7, 8, release checklist |

**M1A — Tag Board and Presence Accountability.** Depends on M1 alone and is the shortest path from a roster to something usable on activation day.

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M1A-1 | Presence state model and its relationship to `CheckIn` and the Events shift; the board and tag invariants | Opus | ultrathink | 5.19, 5.5, 6.1 |
| M1A-2 | Named `TeamLocation` records pulled forward from M4, names only, no coverage | Sonnet | none | 5.6 (named locations) |
| M1A-3 | Board open and guarded close with keeper handover; tag in and out; assisted tagging carrying recorder and channel | Sonnet | think | 5.19 |
| M1A-4 | Live board over `ConnectionManager`, server-originated events only, broadcast by the route handler after the write | Sonnet | think | 5.19, WebSocket table |
| M1A-5 | Raw row export with a stable board-plus-membership row identity and a recorded export receipt | Sonnet | think hard | 5.19, 6.1 |
| M1A-6 | Rendered agency roster: populated from membership, printable blank with expected attendees, agency text verbatim | Sonnet | think | 5.19, 5.8 |
| M1A-7 | Overdue surfacing with no automatic state change; external-participant stage | Sonnet | think | 5.19 |
| M1A-8 | Team participation join on the incident record, and the cross-team record visibility setting, default off | Opus | ultrathink | 5.19, 7, 8, Incident Operations Log |
| M1A-G | **Gate:** the presence model; tag and check-in independence tested in both directions; smoke test against "at most one open tag per person per board" | Opus | ultrathink | ACT validation focus |

**M1B — Guided Setup, Policy Register, and Doctrine Hints.** Depends on M1 alone. Almost entirely content and forms over a register M1 already had to build, which is why it carries no Opus package.

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M1B-1 | Setup stepper over the register: skippable, resumable, every step re-enterable later, deputy or successor first | Sonnet | think | 5.20 |
| M1B-2 | Hint catalog schema and the first hints, one of each strength, rendering visibly differently from one another | Sonnet | think hard | 5.20 (hint shape) |
| M1B-3 | Decision log: value, responding hint, deciding member, date, rationale; a decision to differ is a complete outcome | Sonnet | think | 5.20 |
| M1B-4 | Quick-Start scaffold against the 5.14 agency and PACE records, and the draft SOP export | Sonnet | think | 5.20, 5.14, 5.18 |
| M1B-5 | Remaining hint entries and the 5.16 training catalog seed, with the IS-200/IS-800 edition conflict left visible | Haiku | none | 5.20 (catalog), 5.16 |
| M1B-6 | **Adversarial check:** attempt to make a hint of each strength block a save, disable a field, or change a permission outcome, and report what was attempted | Sonnet | think hard | M1B exit criteria |

**M2 — Onboarding, Import, and Freshness.**

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M2-1 | Import engine: identity matching, idempotent re-import, blank-means-unknown, reversal semantics | Opus | ultrathink | 5.11 |
| M2-2 | Mapping, preview, and reconciliation flow with typed local fields and correction downloads | Sonnet | think | 5.11 |
| M2-3 | Self-service intake, progressive profile editing, saved drafts, optional invites, assisted update | Sonnet | think | 5.7 |
| M2-4 | Last-confirmed indicators, review queues, reminders on the existing email patterns | Sonnet | think | 5.11, email patterns |
| M2-5 | Versioned blank and example CSV files and field guides, once the columns are settled | Haiku | none | 5.11 (import catalog) |
| M2-G | **Gate:** the commit path, with a reversal after later edits, a partial batch, and a concurrent edit | Opus | ultrathink | 5.11, release checklist |

**M3 — Training, Readiness, and Capability Search.**

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M3-1 | Capability and configuration model with AND/OR match semantics | Opus | ultrathink | 5.9, 5.10 |
| M3-2 | Training catalog, records, reviewer workflow, task books, equivalencies, training calendar | Sonnet | think | 5.9, 5.16 |
| M3-3 | Personal equipment and operating configurations: Home, Vehicles, Deployable, with shared physical-item references | Sonnet | think hard | 5.9 (equipment) |
| M3-4 | Roster search, AND/OR filters, match explanations, scoped exports, indexes from representative queries | Sonnet | think | 5.10 |
| M3-5 | Additional saved views and the training, equipment, and capability CSV templates | Haiku | none | 5.10, 5.11 |

**M3A — Team Asset Register and Custody.**

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M3A-1 | Containment, custody state, and the checkout, transfer, and return transaction | Opus | ultrathink | 5.13 (custody) |
| M3A-2 | Registration, ownership distinctions, manifests, condition, audit and history views | Sonnet | think | 5.13 (inventory) |
| M3A-3 | Maintenance tasks, recurring and triggered schedules, due queue, deferrals, return-to-service rules | Sonnet | think hard | 5.13 (maintenance) |
| M3A-4 | Antenna sweep metadata, structured summaries, private attachments, baselines; guides and printable quick tests | Sonnet | think | 5.13 (sweeps, guides) |
| M3A-5 | Location, asset, kit-content, initial-assignment, and sweep CSV templates | Haiku | none | 5.13, 5.11 |
| M3A-G | **Gate:** the handoff transaction, with concurrent checkout, partial return, and a containment cycle | Opus | ultrathink | AST validation focus |

**M3B — Procedures, Radio Callout, and Optional SMS.** The first six packages are the first release; the provider work is separable and optional.

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M3B-1 | Versioned procedures, owner and deputy handover, adoption workflow, review reminders, open-action dashboard | Sonnet | think | 5.18 |
| M3B-2 | Agency records, alert stages, approved PACE and rendezvous cards, manual callout and response recording | Sonnet | think | 5.14 |
| M3B-3 | PACE-aware frequency ordering in team-linked net creation and editing | Sonnet | think | 5.4 (PACE) |
| M3B-4 | SMS consent model, the check at send time, suppression scope, delivery separated from acknowledgment | Opus | ultrathink | 5.15 (consent) |
| M3B-5 | Queued individual sends, recipient previews, budget and expiry controls, simulated-provider pilot with synthetic recipients | Sonnet | think hard | 5.15 (workflow) |
| M3B-6 | Signed status and reply callbacks: signature validation, replays, out-of-order events, recycled numbers | Opus | ultrathink | 5.15 |
| M3B-7 | Channel and PACE-entry CSV templates, imported plans staying drafts | Haiku | none | 5.11 |
| M3B-G | **Gate:** the webhook handler and the consent check at the queue/send boundary | Opus | ultrathink | ACT validation focus |

**M4 — Participation, Coordinator Reports, and Coverage.**

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M4-1 | Attribution rule across the three canonical actual-time sources, reporting periods, and timezone boundaries | Opus | ultrathink | 5.5, 5.19, Events reporting contract |
| M4-2 | Net and schedule association to a team on **every** creation path, including the background scheduler | Sonnet | think hard | 5.4, Feature Registry creation paths |
| M4-3 | Reporting periods, drill versus real-world distinction, source drill-downs, ARES and EMA preparation adapters | Sonnet | think | 5.5 |
| M4-4 | NH timecard adapter with export-only rounding, and the agency attendance column mapping over M1A's raw rows | Sonnet | think | 5.5, 5.19 |
| M4-5 | Coverage rollups, maps, and exports from the existing per-net `CanHearReport` observations | Sonnet | think | 5.6 |
| M4-6 | Historical participation and manual-activity CSV template | Haiku | none | 5.11 |
| M4-G | **Gate:** attribution reconciled against hand-calculated samples with overlaps, transfers, and missing hours | Opus | ultrathink | M4 exit criteria |

**M5 — Incident and Drill Requirements with Staffing Integration.** Requires Events.

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M5-1 | Reservation conflict model across physical dependency sets, reusing M3A-1's transaction rather than inventing a second | Opus | ultrathink | 5.13 (reservations), 5.12 |
| M5-2 | Plan context, objectives, operational periods, requirements, reusable task templates | Sonnet | think | 5.12 |
| M5-3 | Candidate matching and availability confirmation against Events posts, shifts, and offers | Sonnet | think hard | 5.12 (staffing) |
| M5-4 | Tailored checklists, packing templates, and the revisioned deployment packet with disclosure and expiry | Sonnet | think | 5.17 |
| M5-5 | Travel, duty, relief, release, and return events extending the 5.19 tag record, never a parallel ledger | Sonnet | think hard | 5.17, 5.19 |

**M6 — Reviewed ICS Package and Exercise Results.** Requires M5 and the Events form builders.

| # | Package | Model | Think | Reads |
|---|---|---|---|---|
| M6-1 | ICS-202 and package assembly, reusing the Events 204 and 205 builders | Sonnet | think | 5.12 (forms) |
| M6-2 | Plan versioning, approval, restricted distribution, issued snapshots, copy and replan | Sonnet | think hard | 5.12 |
| M6-3 | Remaining form field mappings and the attachment checklist, once the first form's pattern is verified | Haiku | none | 5.12 |
| M6-4 | Plan distribution and disclosure policy | Opus | think hard | 8, 5.17 |
| M6-5 | After-action observations and corrective actions that close only on evidence | Sonnet | think | 5.12 (after-action) |

**The review gates are packages, not a reading pass.** Each `-G` package is its own sub-agent invocation with no feature code to write and one question to answer: does the phase's invariant survive an attempt to break it? A gate that only reads the diff will approve code that is wrong in exactly the way the gate exists to catch, because the diff looks like what the spec asked for. A gate runs the exit test, attempts the failure, and reports what it attempted rather than only what passed. Six gates come from the concept document (M1, M1A, M2, M3A, M3B, M4). M1B-6 is the same discipline at Sonnet tier, because what is being attacked there is a rendering and permission-consultation rule rather than a data invariant.

**A package is done when** its exit test passes and is named in the commit; tests exist under `backend/tests/` following the existing naming; the docs that describe the shipped behavior are updated; and, where the package rests on a data-shape assumption, the real-data smoke test in `.github/copilot-instructions.md` has been run against beta's database and production's copy. This module is unusually full of those assumptions — at most one current membership per user per team, at most one open tag per person per board, at most one current parent container per item, exactly one current assignment per asset, a resolvable identity per import row — and every one of them passes hand-built fixtures by construction.

**Three points where this is worth shipping, and little in between.**

1. **M1 plus M1A.** A roster and a tag board: who is where on activation day, with no import, no capability model, no Events, and no radio. The smallest thing the team can actually use in the field.
2. **M1 plus M2 plus M3.** The membership MVP. The spreadsheet can be retired.
3. **M4.** The coordinator's monthly report stops being assembled by hand.

M1B, M3A, and M3B attach to any of those and gate none of them. M5 and M6 wait on Events regardless of everything above.

**One cross-tier dependency worth naming now.** The Milestone 1 *Incident Operations Log & Situational Awareness Feed* ships long before any of this and correctly does not wait for it. **It owns the incident record**: a first-class record with an open and closed state that holds identity and status and owns no people. Teams adopts that record rather than defining a second one, and M1A-8 adds only the team participation join and the cross-team visibility setting on top of it. Two things follow for whoever builds the Milestone 1 item first: do not assume an incident has a net, and **do not assume a single team**, because the join is coming and a schema that precludes it is a migration.

M1A-8 is the one Opus package in this phase that is not the presence model, and it is Opus for a specific reason: cross-team visibility is a privacy boundary between two organizations that did not choose each other, reached through a shared incident. Getting it wrong exposes one county's roster to another with nothing in the UI to show it, which is the same failure mode as the M1 permission helper.

---

**Blocked on:** core web app stability, self-hosting, and Docker packaging being in good shape first. That gating is unchanged; the build plan above is what to execute when it lifts, not a signal to start.

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
