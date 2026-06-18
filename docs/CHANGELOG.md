# ECTLogger Changelog

All notable changes to ECTLogger are documented here.

---

# June 18, 2026 (b)

## New Features

* **Net View: Edit Net Script and Announcements in-place** — NCS and net staff can now click the pencil icon in the floating Net Script or Announcements window to edit the content directly during the net, with a markdown formatting toolbar. Changes save to the schedule template immediately.

## Improvements

* **Net View: Floating windows remember scroll position after minimize** — The Net Script and Announcements windows now restore to the exact position you were reading when you minimize and reopen them, so you don't lose your place mid-net.
* **Prior Topics: Redesigned with date-left layout, search, and pagination** — The topic history dialog now shows dates on the left of each row for quick scanning, includes a keyword search bar, and paginates at 25 rows per page.
* **Schedule: Template list now paginates at 25 per page** — Large schedule lists page through 25 at a time rather than rendering an unbounded scroll.
* **Admin: Contacts list now paginates at 25 per page** — The contacts tab now pages at 25 rows, consistent with the users tab.

## Bug Fixes

* **Net View: Bold and italic formatting now renders in Net Script and Announcements** — Text formatted with asterisks was showing raw markers instead of styled text due to a spacing quirk in the markdown standard; this is now corrected automatically.

---

# June 18, 2026

## Bug Fixes

* **Net Reminders: Correct timing and no duplicates** — Reminder emails now arrive about one hour before a net in its own local time, instead of several hours early, and you receive a single reminder rather than a new one every 15 minutes. Reminders for nets that use a digital talkgroup also send reliably again. Root causes: scheduled net times were compared as if they were UTC instead of the net's local timezone (firing the window hours early); the next-net time drifted by fractions of a second each run so the "already sent" check never matched (re-sending every cycle); and the email's frequency formatting referenced fields that don't exist on digital/talkgroup frequencies (raising an error before the email could send).
* **Sign In: Friendlier expired-link screen** — If a magic link has expired, the sign-in page now gives you a button to return and request a new one, and if you're already signed in on that device it simply confirms that instead of showing a verification error.
* **Schedule: Staff get 1-hour net reminders** — Everyone listed as net staff for a recurring schedule now receives a reminder email one hour before the net begins, with an Access Net button and an Open Lobby button that loads the net and opens the lobby in one click.
* **Schedule: Scheduled nets appear on the dashboard automatically** — Nets are now created on the dashboard 24 hours before their scheduled start time for all recurring schedules, not only those with an NCS rotation configured.
* **Schedule: Net staff can start and manage nets** — Users listed as staff for a schedule can now open the lobby, manage check-ins, and close nets created from that schedule, without needing to be the net owner or hold a pre-assigned NCS role.

---

# June 12, 2026

## New Features

* **Profile: Personal net history is now navigable** — Your activity summary and net list on the Activity tab are clickable. Select any summary card or net name to see the individual sessions behind it and open any net report directly.
* **Schedule: Recurring Announcements** — A new Announcements tab in the schedule editor lets NCS maintain a standing list of items to read each week (club events, upcoming trainings, etc.). During a live net, the list appears in the Announcements window as a checklist so NCS can check off each item as it's announced.

## Improvements

* **Changelog PDF: Styled layout** — The PDF now matches the What's New email design with a color-coded header and labeled sections, making it easier to read and share.
* **Mobile: Narrow-screen layout fixes** — Data tables scroll horizontally instead of overflowing, and dialogs use compact margins on small phones so forms are fully usable without zooming.
* **Archived Nets: Filter to nets you participated in** — Two checkboxes in the Archived Nets dialog let you narrow the list to nets you personally attended or ran as NCS, so you can find your own history without scrolling through everything.
* **Net Settings: Mobile station sort is now optional** — A new toggle controls whether mobile stations are promoted to the top of the check-in list. On by default; net managers who prefer strict chronological order can turn it off in net settings.

---

# June 11, 2026

## New Features

* **Maintenance Banner** — Admins can now display a sitewide warning banner from the new Maintenance tab in the Admin panel. The banner supports a custom message, dismissible or persistent mode, and an optional scheduled start/end window so it appears and clears automatically without manual intervention. The banner is served via a public API endpoint and is visible to logged-out users as well.
* **Server-side maintenance page** — A static `maintenance.html` page is included in the frontend build. Operators can activate it with `./run --maintenance on` over SSH when the app is completely down (bad deploy, DB outage). Caddy then serves the static page directly instead of proxying to the backend. An optional `--message` and `--eta` flag writes a `maintenance.json` sidecar that the page fetches and displays.
* **`run.sh` — consolidated operational script** — `start.sh` and `update.sh` are consolidated into a single `run.sh`. Bare `./run` behaves identically to the old `start.sh`; `./run --service` for systemd; `./run -u` to apply updates and exit; `./run -m on|off` to toggle server-side maintenance mode and exit. The old scripts remain in place temporarily.

## Improvements

* **Adaptive card grids** — The Nets dashboard and Schedule pages now use a CSS auto-fit grid that scales from 1 column on mobile up to 6 columns on ultrawide monitors. Cards fill available space evenly and never leave an empty gap when fewer cards are present.
* **Scrollable tabs with swipe support** — Tabs on the Admin and Profile pages now shrink and scroll horizontally on narrow viewports without visible arrow buttons, and support swipe-left/right gestures on mobile to switch between tabs.
* **Uniform FAB sizing** — All floating action buttons (Create, Filter, Archive, Merge) are now a consistent 56 px large size across every page.

---

# June 10, 2026

## Bug Fixes

* **Archived nets disappear from the Nets list immediately** — If you navigated back to the Nets list before the 5-second archive undo window expired, the net would still appear in the list until you manually refreshed the page. The list now re-fetches automatically when you return to it.
* **Profile photos from mobile phones no longer display sideways** — Portrait and landscape photos taken on phones embed an EXIF orientation tag instead of storing pixels upright. The avatar upload handler now applies that orientation correction before saving, so all photos display right-side up regardless of how the phone was held.
* **Emoji reaction toolbar no longer shifts chat message text** — Hovering over a chat message to reveal the emoji reaction buttons was injecting 100px of extra padding-right into the message row, causing the message text to reflow into a narrower column on every hover. The toolbar now overlays the message content without affecting layout.
* **Check-in list now displays in correct chronological order** — When a net is created from a schedule template, all template staff are pre-assigned NCS roles at the same timestamp. The check-in list was treating all of them as "active NCS" and promoting them to the top, pushing stations who checked in earlier (like KA1RAC) down the list. The NCS sort promotion now only applies to operators who were already checked in before the first non-NCS station joined, which is the correct definition of "running NCS." Operators who happen to have an NCS role but checked in later appear in natural chronological order.
* **Archive and delete now work for net managers and co-managers** — Net managers and co-managers of the schedule a net was created from can now archive, unarchive, and delete nets they manage. Previously only the direct net owner or a site admin could perform these actions, causing a silent 403 for managers like Joel (AA1GM) trying to archive his own nets.
* **Sessions no longer wiped during backend restarts** — The app previously logged users out any time the backend was briefly unavailable (e.g., during a deploy). The client now only clears a session on a deliberate 401 Unauthorized response; transient network errors and 5xx responses leave the stored token untouched so users remain signed in after a deploy.
* **Chat photos now show as "[Photo]" in Net Report and PDF exports** — Chat messages containing pasted images were rendering the raw internal `__CHAT_IMAGE__{...}` JSON payload as plain text in the on-screen Net Report page and the exported PDF. They now display as `[Photo]`.

## Improvements

* **Toolbar reorganized into Net Info and Net Actions rows** — The toolbar on the Net View page is now split into two logical rows: **Row 1 (Net Info)** contains read-only browsing tools (bulk check-in shortcut, search, map, stats, script, announcements, topic history, info URL, net info link) and **Row 2 (Net Actions)** contains all write/management controls (start, edit, roles, check-in, go live, close, import, export, PDF, archive, delete). Previously, action buttons mixed into Row 1 caused the toolbar to overflow into a third row on active nets with many features enabled — for example, the Import button would end up isolated on its own line.
* **Sessions persist for 30 days with automatic rolling refresh** — Access tokens were previously set to a 24-hour lifetime, forcing weekly net operators to re-authenticate before each session. Tokens are now issued with a 30-day lifetime. Additionally, any token with fewer than 7 days remaining is silently refreshed on the next authenticated request, so active users never need to re-login.
* **Emoji reaction controls hidden on closed/archived nets** — The hover emoji toolbar no longer appears on closed or archived nets. Existing reaction counts remain visible for historical reference but are no longer interactive.
* **Activity Log collapsed by default** — The Activity Log panel now loads minimized on every page visit, keeping more screen space available for the check-in list and chat — particularly useful on mobile. Clicking the expand button opens it as before, and the choice persists for the rest of the session.
* **Net and schedule card polish** — Long descriptions on net and schedule cards are now truncated to three lines with an inline "Show more" link to read the rest.
* **Paginated lists** — The Archived Nets dialog and the Admin users table now show 25 rows per page, with 50 or All options. Filters, searches, and column sorts all reset to page 1 automatically. The Admin users list also now arrives sorted most-recently-active first.

## New Features

* **Avatar menu in the nav bar** — The callsign text in the nav bar has been replaced with your avatar. Clicking it opens a menu with Profile, Personal Stats, Admin (if applicable), Dark/Light mode toggle, and Logout — consolidating controls that were previously scattered across the top bar. On mobile, the same items appear at the bottom of the slide-out drawer.
* **In-browser crop and zoom for profile photos** — After selecting a photo, a dialog lets you drag to position and scroll or pinch to zoom before uploading. Only the cropped square is sent to the server, so portrait, landscape, and oddly-framed photos always produce a clean avatar.
* **Session settings configurable in Admin panel** — Admins can now set session lifetime and toggle rolling renewal in Admin → Security → Session Settings, without editing server config files.
* **NCS check-in prompt now offers a role choice** — NCS operators who haven't yet checked in now see two buttons in the check-in prompt: "Check In as NCS" and "Check In as Participant". Both open the standard check-in dialog. Previously, clicking "Check In" scrolled down to the inline NCS entry form, which was confusing for operators who just wanted to observe before joining.
* **NCS role toggle in toolbar** — NCS operators can now step down to participant (or back up to NCS) using the crown icon in the toolbar. Stepping down removes the NCS badge and management controls for that session without losing the permanent role assignment. Stepping back up restores full NCS status. The button only appears for operators with an NCS assignment who are checked in. The last active NCS on an active net cannot step down.

---

# June 9, 2026

## Bug Fixes

* **NCS and subscriber reminders firing early and repeating every 15 minutes** — Fixed a critical bug causing reminders to fire several hours before nets and repeat every 15 minutes by queuing 4+ duplicate emails. Root causes: (1) timezone mismatch — code was using server local time instead of UTC to calculate hours-until, causing early fires on servers outside the net timezone; (2) broken deduplication — reminder log was storing only the date instead of full datetime, so every net on the same date was treated as a duplicate, but the ±30-minute window re-triggered every 15 minutes anyway. Fixed by using UTC consistently and storing the full scheduled datetime for proper deduplication.

---

# June 5, 2026

## Bug Fixes

* **NCS and subscriber reminder delivery restored** — Fixed a reminder-log field mismatch (`net_date` vs `scheduled_date`) in the reminder service that prevented reminder sends from being logged and correctly deduplicated. This restores reliable 24-hour and 1-hour reminder processing.
* **Strafford County weekly net rotation backfill** — Added one-time migration `029_add_aa1gm_back_to_template8_rotation.py` to restore AA1GM to template 8's rotation after an unintended gap. The existing cycle order is preserved and AA1GM is appended to the end.
* **Manager auto-inclusion restored for rotation build** — Fixed a regression in the schedule editor so **Build rotation from staff** always includes the schedule manager when missing, restoring the behavior documented in the 2026-05-20 release notes.

## Improvements

* **Subscriber visibility for managers** — Admins, schedule managers, and co-managers can now view the schedule subscriber list directly in the Net Staff tab, including callsign, name, and email for users who subscribed via the bell or reminder prompt.
* **Tabbed Net Staff modal** — The Net Staff dialog opened from the purple people icon is now organized into dedicated tabs: **Net Control Stations**, **Rotation Order**, **Schedule**, and **Subscribers**.
* **Role-gated email actions in Net Staff modal** — Added **Email Staff**, **Email Subscribers**, and **Email ALL** actions for admins, net managers, and co-managers/co-owners to quickly notify the right groups about cancellations, schedule changes, and net topics.

## Notes

* The migration above backfills template 8 only; it does not change global manager/owner auto-inclusion behavior for all schedules.

## UX Improvements

* **Step away feature** — Users can now click the pause icon (⏸️) to temporarily step away without checking out. Useful when you know you're next but have an emergent need (bathroom, etc.). The button appears in both the toolbar for your own check-in and in the Actions column. Click again to return.

---

# June 4, 2026

## Bug Fixes

* **Gravatar fallback shows name initial** — When a Gravatar image fails to load (404), the avatar badge now displays the first character of the user's name instead of their callsign, maintaining consistency with non-Gravatar users.
* **Server-side Gravatar validation** — The backend now validates Gravatar existence before sending URLs to the frontend, eliminating 404 errors in the client console.

## Improvements

* **Better avatar color distribution** — Expanded avatar color palette from 12 to 24 colors and improved seeding by combining callsign + name, significantly reducing color collisions among users.
* **Auto-select frequency for single-frequency nets** — When a net has only one frequency configured, that frequency is automatically selected as active and assigned to check-ins. This simplifies the UI (no dropdown needed) and ensures check-ins are organized by frequency from the start, even before additional frequencies are added.

---

# June 2, 2026 (c)

## New Features

* **CSV check-in import for closed/archived nets** — Added an Import CSV workflow next to export actions so net managers can merge logs from paper or external tools after a net closes. Includes drag-and-drop upload, an exportable import template, and row-numbered validation errors in the dialog.
* **Co-Manager controls in staff rows** — Owners/admins can now promote or demote authorized staff as **Co-Managers** directly from each row using a star icon. Co-Managers are clearly labeled and share owner-level schedule responsibility for owner-gated actions (such as ownership transfer, linking nets, merge, and delete), providing true backup coverage.
* **Hover reactions in chat** — Chat now supports per-message reactions (👍 🙂 🙁 ❤️ ✅) with live counts synchronized across connected clients.
* **Paste-to-chat images** — Users can paste PNG/JPEG/WEBP images directly into chat; uploads are resized, thumbnailed, rendered inline, and viewable in a full-image lightbox.
* **Status-at-entry for check-ins** — NCS quick-entry now supports choosing station status at creation time on both desktop and mobile forms.

## Improvements

* **Import time parsing and timezone controls** — CSV import now accepts simple date/time formats used by operators (for example `6/3/2026 2:24 PM`, `3/6/2026 14:24`, `2:24 PM`, `14:24`) and supports both US and British slash-date ordering.
* **UTC checkbox + timezone selector on import** — Import dialog now includes a UTC toggle and timezone dropdown for national nets spanning multiple time zones. Explicit timezone markers in CSV values (`Z`, `UTC`, `GMT`, `+/-HH:MM`) are honored automatically.
* **Import window safety checks** — Imported timestamps are validated against net open/lobby time through net close + 10 minutes. Out-of-window rows are skipped with clear row-numbered reasons.
* **Away and Mobile visibility improvements** — Away rows now use a distinct yellow highlight, and Mobile stations are prioritized near the top of the check-in list (after NCS).
* **Contextual create/edit labels** — Ad-hoc/one-time flows now show **Create Net / Edit Net** labels where appropriate instead of always saying Schedule.
* **Clearer schedule action wording** — The Net Staff action label now reads **Create schedule** instead of **Push staff to schedule**.

## Bug Fixes (highest impact first)

* **Check-in Map PDF white-page fix** — Exporting a Check-in Map PDF from the floating map window no longer produces a blank white page. The exporter now captures the live map element so Leaflet tiles and overlays render correctly.
* **Emoji-safe What's New PDFs** — What's New / Changelog PDF exports now preserve emoji reactions (for example 👍 🙂 ❤️ ✅) using inline emoji rendering instead of broken glyph fallback.
* **Mixed text + emoji wrapping improvements** — Changelog PDF line wrapping now handles mixed text-and-emoji lines more reliably, reducing malformed spacing and symbol corruption in exported files.
* **Map PDF blank export fix** — Tile layers now use export-safe CORS settings, preventing blank map captures in PDF exports.
* **1-hour reminder delivery restored** — Fixed a variable-name bug that prevented 1-hour subscriber reminder emails from sending.
* **Early access bypass corrected** — The schedule early-access override now properly bypasses both minimum account age and net-participation requirements.
* **Net Staff modal refresh after manager transfer** — The staff list and add-staff dropdown now refresh immediately after ownership transfer, so users no longer see stale eligibility from the prior manager.
* **Live location control in Profile** — Users can now see and clear current GPS-derived live location from Profile, preventing stale live location from overriding intended profile location during check-ins.

# April 28, 2026

## Net Manager and NCS shown separately

* **Net cards (Active Nets)** now display **Net Manager** (the owner of the net record) and **NCS** (whoever is currently assigned via NetRole) on separate lines. Previously the owner was labeled "NCS", which was misleading whenever the manager and the operator on the air were different people.
* **Schedule cards (Scheduler)** always show **Net Manager**, with **Next NCS** appearing as an additional line when an NCS rotation is configured. The two are no longer mutually exclusive.
* When the manager and NCS are the same person, the duplicate line is suppressed.

## Net owners can delete their own nets

* **Owners can now delete a net in any state** — draft, scheduled, active, or closed. Previously the trash icon only appeared on draft/scheduled nets, and closed-net deletion was locked to admins. Useful for net managers cleaning up training/practice runs.
* **Stronger confirmation dialog** spells out exactly what gets destroyed (check-ins, chat messages, reports) and warns that deletion is permanent.
* **Color-coded buttons**: blue **Cancel**, yellow **Archive Instead** (only for closed nets) or yellow **Close & Archive** (only for active/lobby nets), red **Delete Permanently**. Archive paths are presented as the safer alternative whenever they apply.
* **Close & Archive** runs the existing close endpoint (which emails the complete log to the owner) and then immediately archives the net, so managers who want to preserve the record of a started test/training net can do it in one click.
* **Backend** — the delete-net endpoint already permitted the owner; only the frontend gate has been relaxed. Permission is still owner / admin / NCS via `can_manage`.

---

# April 25, 2026 (b)

## Save edits back to the schedule

* **"Save for this Net" + "Save to Schedule" buttons** — The Edit Net page now has two save buttons. **Save for this Net** persists changes only to the current net (unchanged behavior, just renamed from "Save Changes"). **Save to Schedule** pushes the net's editable fields back to the parent schedule so future nets opened from that schedule inherit them. A confirmation dialog lists exactly what will be overwritten.
* **Push staff to schedule** — The Net Staff dialog opened from a scheduled net now has a **Push staff to schedule** button that copies the net's NCS operators into the schedule's authorized staff list. Operators already on the schedule are skipped, so it's safe to repeat.
* **Schedules now carry stream URL and announcements** — `stream_url` and `announcements` were previously net-only fields. They've been added to the schedule (template) model so values entered there propagate to nets opened from the schedule, and so the new "Save to Schedule" action can promote them. Migration: `018_add_template_stream_announcements.py`.
* **Schedule fields actually copy when opening a net** — Fixed a long-standing gap where `info_url`, `script`, `stream_url`, and `announcements` on a schedule were ignored when opening a net from it. Newly opened nets now inherit those values.
* **Permission model unchanged** — Both new actions check the same backend permissions used everywhere else for editing a schedule (owner, admin, active staff, or active NCS rotation member). The buttons surface a clear error toast on permission failure rather than silently failing.

---

# April 25, 2026

## Net Staff & NCS Rotation

* **Bugfix — non-admin managers can now add staff** — Schedule managers (and net owners) who aren't global admins were silently unable to add operators because the user picker called the admin-only `GET /users` endpoint. A new `GET /users/directory` endpoint returns minimal `{id, callsign, name}` for any authenticated caller and is now used by every staff/rotation picker. Admin-only `GET /users` (which exposes email, role, and notification preferences) is unchanged.
* **Two-step Net Staff workflow restored** — The schedule editor's "Net Staff" tab is now structured as **Schedule Manager → Authorized Net Staff → NCS Rotation (optional)**. Adding staff is the primary action; the rotation is a secondary, optional ordering. A "Build rotation from staff" button populates the rotation in one click instead of forcing the user to re-add every operator manually.
* **Net Staff popup mirrors the editor** — The popup's three tabs (Staff / Manage Staff / Manage Rotation) have been consolidated into a single scrollable "Manage" view for schedule context, matching the editor layout. The read-only "Staff" tab remains for users without management permission.
* **Empty-picker feedback** — Operator pickers now display "No other users available" / "Loading users…" instead of silently showing an empty dropdown, so the failure mode that bit us before can't recur.

## Privacy

* **Guest visibility for net managers and NCS** — Unauthenticated viewers can still see who is the Net Manager and who is currently NCS, but the response now only includes callsign and first name. Surnames, email addresses, and notification preferences are stripped on the public `GET /nets`, `GET /nets/{id}`, `GET /nets/{id}/roles`, and `GET /templates` endpoints when the caller isn't logged in.

---

# April 24, 2026 (c)

## Changelog Downloads & What's New Email Digest

* **PDF download buttons** — The What's New dialog now has two download icons in its action bar: a single-page icon downloads just the latest version's changelog as a PDF, and an open-book icon downloads the entire changelog history. Output is text-native (selectable, small file size).
* **What's New email digest** — Optional opt-in (off by default) that emails subscribed users a single 8 AM digest the morning after each release, summarising every changelog entry from the previous calendar day. Silent on days with no updates so it never spams.
* **Sparkling Subscribe button** — A subscribe/unsubscribe toggle appears in the What's New dialog (right next to "Got it!") so users can opt in to the digest without leaving the modal. Hidden when not signed in.
* **Per-user timezone** — Digests fire at 8 AM in the user's local timezone (auto-captured from the browser the first time they subscribe). Falls back to America/Los_Angeles (PST/PDT) if the timezone isn't set, so we don't wake anyone up early.
* **One-click per-list unsubscribe** — Every What's New email includes a `?list=whats_new` unsubscribe link that opts the user out of just the digest, leaving net-start / net-close / reminder preferences alone. Master unsubscribe still works for everything.
* **Single source of truth** — The changelog data has moved from `frontend/src/components/ChangelogNotification.tsx` to `frontend/src/changelog.json`, which is imported by both the React dialog and the new backend `whats_new_service.py` so the in-app and email content can never drift apart.
* **Migration 017** — Adds `users.notify_whats_new` (Boolean, default false) and `users.timezone` (String) columns. Run `python3 backend/migrations/017_add_whats_new_subscription.py` on each environment.

---

# April 24, 2026 (b)

## Schedule Editor & Staff Modal Cleanup

* **Manager selector moved to Net Staff tab** — On the Edit Schedule page, the "Owner / Default NCS" selector has been relocated from the Basic Info tab to the Net Staff tab and renamed "Schedule Manager". This keeps the Manager (owner) visible alongside the NCS rotation in one place, eliminating the confusion of "why isn't the Manager in the NCS list?"
* **Inline manager transfer in the Staff modal** — The Net Staff modal accessed from a schedule card now exposes a pencil icon next to the Manager. The current Manager or an admin can click it to transfer ownership without leaving the modal. Backend permission checks (`templateApi.update` with `owner_id`) prevent staff/rotation members from transferring ownership.

---

# April 24, 2026

## Net Manager Terminology

* **"Host" renamed to "Manager"** — The schedule owner is now labeled as the "Manager" everywhere in the UI (Scheduler list, Scheduler card, Create Net page, Staff Modal). This matches the standard ham-radio "Net Manager" role: the operator ultimately responsible for a net series.
* **Manager is implicitly an authorized NCS** — The Manager (schedule owner) is always shown at the top of the "Authorized Net Control Stations" list with a Manager chip and never needs to be added as a separate staff member to start or run nets.

## Bug Fixes

* **Staff and rotation members can manage staff** — The "Manage Staff" and "Manage Rotation" tabs were hidden for everyone except the Manager and admins. Active staff members and active NCS rotation members can now also manage the staff list and rotation, matching the documented intent that staff members can run and curate the schedule.
* **Permission consistency between routers** — `routers/ncs_rotation.check_template_permission` previously rejected active staff members even though `routers/templates.check_template_permission` accepted them. The two helpers now allow the same set of users (admin, owner, active staff, active rotation member). This was the root cause behind the SKYWARN GYX schedule manager being unable to assign other NCS operators after a schedule merge.

---

# April 22, 2026

## Mobile & Status Selector Improvements

* **Status dropdown labels** — Each option in the check-in status dropdown now shows a text label next to the emoji (e.g., `👂 Listening only`, `📢 Announcements`, `🚨 Has traffic`). Closed selects still display only the icon to keep the table compact. Addresses confusion where new NCS users picked the wrong icon (e.g., bullhorn for "just listening").
* **Mobile net header compaction**:
  * Duration chip drops the "Duration:" prefix; the clock icon is sufficient.
  * The edit-times pencil button next to the status chip is hidden on mobile (still available on desktop and from the net info page).
  * Toolbar action buttons now shrink in padding/min-width on mobile so the full row of icons (Start/Check-in/Close + exports + admin actions) fits without wrapping.
* **Collapsible mobile check-in form** — The "New Check-in" form on the mobile net view is collapsed by default with a tappable header. NCS/Loggers attending another operator's net no longer have a tall form pushing the check-in list off-screen.

---

# April 21, 2026 (c)

## Schedule Statistics Tweaks

* **Default time window is now 1 year** — Monthly nets and occasional SKYWARN activations were showing zeros under the old 30-day default. The 30 / 90 / year / all-time toggle is unchanged; only the default selection moved.
* **PDF export includes all leaderboards** — The static PDF report now contains all four leaderboards (Check-ins, NCS, Logger, Relay) stacked sequentially, since tab clicks aren't possible in a PDF. The on-screen tabbed view is unchanged.

---

# April 21, 2026 (b)

## Schedule Statistics Overhaul

* **Time-window filters** — Schedule statistics page now supports 30 days / 90 days / 1 year / all-time filters, defaulting to last 30 days. Applies to summary cards, leaderboards, and the history log.
* **Leaderboards** — New tabbed leaderboards on schedule stats:
  * **Check-ins** — Top 20 callsigns by net appearances (replaces the previous "Regular Operators 50%+" view, which was empty for long-running nets).
  * **NCS** — Top operators by number of nets they ran as NCS.
  * **Logger** — Top operators by number of nets they logged.
  * **Relay** — Top callsigns by distinct nets where they relayed at least one check-in (derived from `CheckIn.relayed_by`).
* **NCS column in Net History** — The history log now shows the NCS callsign(s) for each net instance.
* **Export to PDF** — One-click PDF export of the schedule performance report.

## Improvements

* **Uniform schedule card heights** — Cards on the Scheduler page now stretch to equal height within a row and have a minimum height, giving the layout a more professional appearance when content lengths vary.

## API

* `GET /statistics/templates/{template_id}` — Now accepts `?days=30|90|365|0` (0 = all-time, default 30). Response adds `filter_days`, `check_in_leaderboard`, `ncs_leaderboard`, `logger_leaderboard`, `relay_leaderboard`, and per-instance `name`, `closed_at`, `ncs_callsigns`. The legacy `regular_operators` field is preserved (but will often be empty for long-running nets).

---

# April 21, 2026

## Bug Fixes

* **Schedule merge no longer detaches nets** — Merging schedules now correctly preserves every child net's link to the surviving schedule. Previously, when SQLAlchemy flushed the deletion of source schedules in the same transaction as the FK reassignment, the dependency processor's "nullify orphaned children" pass could clobber the just-updated `template_id` values on moved nets, causing those nets (and all their check-ins) to silently disappear from the merged schedule's statistics. Fixed by explicitly flushing all FK reparentings before the source-schedule deletions run.

## New Features

* **Link Existing Net to Schedule** — From the schedule statistics page (`/statistics/schedules/:id`), schedule owners and admins can now click "Link Existing Net" to attach an ad-hoc net (or a net created under the wrong schedule) to this schedule. Useful when an NCS starts a one-off net and later realizes it should be counted toward a recurring schedule's history.

## API

* `PUT /nets/{net_id}/template` — Attach (or detach with `template_id: null`) a net to a schedule. Requires the caller to be the net's owner or admin, and when attaching, also the schedule's owner or admin.
* `GET /templates/{template_id}/linkable-nets` — List nets the current user could attach to a given schedule (their own nets, or all nets if admin, excluding ones already attached).

---

# March 21, 2026

## New Features

* **Merge Schedules** — Combine multiple net schedules into a single master schedule. All child nets, subscribers, staff, NCS rotation members, topic history, and schedule overrides are moved to the master. Source schedules are permanently deleted. Accessible via the merge (⑂) button on the Scheduler page. Only admins and schedule owners can merge.

---

# March 20, 2026

## New Features

* **Auto-start nets at scheduled time** — Nets in lobby mode now automatically go live when the scheduled start time arrives. Any NCS/admin viewing the net triggers the transition. The manual Start button remains available for starting early.
* **Edit net start/end times** — NCS operators and admins can now adjust the actual start and end timestamps of active, closed, or archived nets. Click the edit (pencil) icon next to the status chip to open the time editor.
* **Check-in prompt notification** — Authenticated users viewing an active or lobby net they haven't checked into now receive a friendly notification with a one-click "Check In" button. Appears 2 seconds after page load and auto-dismisses after 15 seconds.
* **Clickable net titles on Dashboard** — Net names in the card view are now clickable links that navigate directly to the net view page.

## Bug Fixes

* **Check-ins chip count** — The check-ins count now shows total participants who checked into the net, including those who later checked out. Checked-out stations are shown separately as a "Checked Out" chip. Previously, checked-out stations were subtracted from the total.
* **Guest count accuracy** — The "Guests" chip now counts actual unauthenticated WebSocket viewers instead of checked-in stations without online presence. This fixes inflated guest counts caused by users who navigated away from the page.
* **Net close/report email fix** — Fixed an issue where the net close email with the log/report was not sent due to `field_config` being passed as a JSON string instead of a parsed dictionary. Added traceback logging for future email failures.
* **Go Live toast notification fix** — The "Net is now LIVE" confirmation toast now displays correctly (was referencing non-existent state variables).

## Documentation

* **README.md** — Added Secondary NCS to the Net Roles table.
* **USER-GUIDE.md** — Fixed the "Checking In" section to show the correct order: click Check In first, then fill the form.

---

# March 12, 2026

## Improvements

* **Smaller PDF exports** — Net Report PDF exports now render text, tables, and statistics natively instead of converting the entire page to images. Only maps are captured as compressed JPEG images. Typical file size reduced from ~24 MB to under 1 MB, making reports easy to email.
* **Net date in PDF filename** — PDF filenames now include the net's start date and time (e.g., `ARES_Net_Report_2026-03-12_1930.pdf`) instead of the date the export was generated.

---

# February 26, 2026

## New Features

* **Check-In Map on Statistics page** — The global Statistics page now includes an interactive map at the bottom showing the approximate geographic distribution of check-ins. Locations are aggregated to 4-character Maidenhead grid squares (~100 km resolution) or US state / Canadian province centroids, so individual operator positions are never revealed.
* **Contacts & Auto-fill** — A new Contacts system auto-populates station information from check-in history. When an NCS or Logger enters a callsign, name, location, and SKYWARN number are auto-filled from the user's account (if registered) or from the contacts directory (built from prior check-ins). All auto-filled fields remain editable for each check-in.
* **Admin Contacts Tab** — A new "Contacts" tab on the Admin page provides a rolodex-style directory of all known stations. Admins can fix misspelled names from rushed check-ins, add email addresses, send invites to create user accounts, and add admin-only notes.
* **Contact Invites** — Admins can add an email to any contact and send an invite. This creates a user account and sends a magic link email. When the contact signs in, their check-in history and statistics are linked to their new account.

---

# February 23, 2026

## Bug Fixes

* **Logger role now works correctly** — Loggers can now change check-in statuses and use the check-in entry form at the bottom of the net page. Previously, a case-sensitivity mismatch in the frontend permission check (`'Logger'` vs the stored value `'LOGGER'`) caused all logger-gated UI controls to be hidden, requiring net staff to promote loggers to NCS as a workaround.

---

# February 20, 2026

## New Features

* **Dual-map view in PDF Report** — When check-ins are geographically clustered with a few distant outliers, the Net Report PDF now automatically shows two maps side-by-side: a zoomed cluster detail view and a full geographic overview. Single-map layout is used when all stations are in a similar area.
* **Check-in location map on Net Statistics page** — The statistics page now fetches and displays a map of all check-in locations for the net, filling the empty grid space next to the status breakdown chart.

## Bug Fixes

* **Check-in now works in LOBBY mode** — Stations can check in as soon as the NCS opens the lobby before the official scheduled start time. Previously, the backend rejected check-ins with a 400 error until the net transitioned to full ACTIVE state.
* **Check-in errors show as in-app toasts** — Error messages (e.g., validation failures) are now displayed as Snackbar notifications instead of native browser `alert()` pop-ups. The actual server error detail is shown when available.
* **Map zoom no longer resets** — The check-in map no longer snaps back to "show all stations" zoom each time the check-in list updates. Your zoom level and pan position are preserved after the initial auto-fit when the map first loads.

---

# January 25, 2026

## New Features

* **Per-user Chat System Messages Toggle** - Users can now hide or show system (activity) messages in the chat using a toolbar icon located to the left of the pop-out button; the preference is saved to the user's profile and persists across sessions.
* **Announcements / General Traffic** - Nets now have a dedicated "Announcements" field separate from the net script. This provides a running list of upcoming events, club announcements, and general traffic items for NCS to reference during the net. Visible to all users via a megaphone icon button in the net toolbar. Supports Markdown formatting and can be opened in a floating window or new tab. Can be edited when creating or editing a net (new "Announcements" tab in net configuration).
* **Prior Topics Log** - Track previously used "Topic of the Week" prompts to avoid repetition. When a net closes with a topic enabled, the topic is automatically logged to history. A history icon button appears in the net toolbar (for nets created from templates) to view all past topics with dates. Helps NCS staff rotate topics and avoid reusing recent ones.
* **Audio Stream URL** - Nets can now include a direct audio stream URL (Shoutcast, Broadcastify, etc.). A speaker icon appears in the net toolbar for easy listening. Works for both authenticated users and guests.
* **Unarchive from Archived List** - Added unarchive button directly to the Archived Nets dialog on the Dashboard (no need to open the net first)
* **In-App Changelog** - New floating info button shows recent changes with unread indicator
* **Consistent Action Button Colors** - All action buttons throughout the UI now use consistent colors: blue for view/search, purple for people/staff, orange for statistics, green for exports/downloads, teal for ICS-309 forms, and red for delete/close. This makes it easier to quickly identify the button you're looking for.

## Bug Fixes & Improvements

* **Net staff members can now create and start nets** (not just rotation members)
* **WebSocket connections now auto-reconnect** if disconnected unexpectedly
* **Users can now check out their own check-in** (previously only NCS/Logger could)
* **Role assignments are now logged in chat** (NCS, Logger, Relay)
* **Improved map PDF export reliability**
* **Net closure now immediately updates all connected clients**
* **Fixed dead WebSocket connections being kept in memory**

---

# December 19, 2025

## New Features

* **Email Unsubscribe Compliance** - All notification emails now include:
  - One-click unsubscribe link in the email footer
  - `List-Unsubscribe` header for email client "unsubscribe" buttons
  - `List-Unsubscribe-Post` header for RFC 8058 one-click compliance
  - Links to manage notification preferences in profile settings
  - Dedicated `/unsubscribe` page that processes tokens and allows re-subscribing
* **Subscription Prompt After Check-in** - When a scheduled net closes, users who checked in are prompted to subscribe to receive notifications for future instances of that net (if not already subscribed)

## Improvements

* **Admin Users List - Three-Tier Online Status** - Presence indicator now shows:
  - Green dot: Online (active within 5 minutes)
  - Yellow dot: Away (5-15 minutes inactive)
  - Red dot: Offline (15+ minutes inactive)
* **Admin Users List - Column Reorder** - Columns now ordered: Name, Callsign, Email (moved Email after Callsign)
* **Admin Users List - Default Sort** - Default sort is now by online status (online users first), then alphabetically by name
* **Admin Users List - Sortable Online Column** - Click the status column header to sort by online/away/offline status

## Bug Fixes

* **Admin Users Timestamp Fix** - Fixed "Last Active" and "Created" timestamps showing incorrectly (2-5 hours off) by properly parsing UTC timestamps from backend
* **Admin Users Timezone Preference** - Timestamps now respect the admin's UTC/local time preference from their profile settings
* **PDF Export - Light Mode** - PDF reports now force light mode styling regardless of current theme, saving printer ink/toner
* **PDF Export - Page Break Fix** - Fixed content duplicating/repeating at page breaks by using proper canvas slicing

---

# December 18, 2025

## New Features

* **Lobby Mode** - NCS can start a net before the scheduled time, entering "Lobby" status where check-ins and chat are enabled but a countdown shows until the official start time. Click "Go Live" to transition to active status.
* **Email Subscribers** - NCS can send custom emails to all subscribers of a scheduled/draft net (e.g., to announce cancellations)
* **Cancel Net Instance** - Delete button added to draft/scheduled nets on the Dashboard to cancel a specific net instance without affecting the recurring schedule
* **Net Script Button** - Added script viewer button (article icon) to the net toolbar between map and edit buttons
* **Unarchive Nets** - Archived nets can now be unarchived (restored to closed status) via the unarchive button in the net toolbar
* **Net Report (PDF)** - Comprehensive multi-page PDF report for closed/archived nets including:
  - ECTLogger branded header with site URL
  - Net info (name, description, frequencies, NCS operators, duration)
  - Statistics summary with charts (status breakdown, check-ins by frequency)
  - Complete check-in log table
  - Chat log (user messages only)
  - ICS-309 Communications Log section (if enabled)
  - Each section on its own page for easy printing
* **PDF Export for Statistics** - Added PDF export buttons to:
  - Platform-wide Statistics page (landscape)
  - Per-net Statistics page (portrait)
  - User Profile Activity tab (landscape)
  - Check-in Map (landscape)

## Improvements

* **Ctrl+Enter Shortcuts** - Speed Entry (bulk check-in), Dashboard email, and Admin email dialogs now submit with Ctrl+Enter
* **Net Creation Permissions** - Only admins, template owners, or designated NCS staff can create nets from schedules (prevents unauthorized users from starting nets)
* **Delete Button Style** - Changed DELETE button in NetView to icon-only with tooltip, matching other toolbar buttons
* **Speed Entry Simplification** - Removed preview chips from bulk check-in dialog; count now shows inline near submit button
* **Archive with Undo** - Archiving a net now shows a toast with UNDO button for 5 seconds before the archive is finalized
* **Download Logs from Archived Nets** - CSV and ICS-309 download buttons are now available when viewing archived nets
* **Frequency Chips View-Only on Closed/Archived** - Frequency chips no longer attempt to set active frequency or claim frequencies on closed/archived nets (Ctrl+click filtering still works)
* **Session Timeout Extended** - Production session timeout increased from 30 minutes to 24 hours to prevent mid-net logouts
* **Stats Button in NetView** - Added statistics button to net toolbar for quick access to net statistics
* **PDF Button on Dashboard** - Added PDF report button to closed/archived nets on Dashboard (both list and card views)
* **Top Operators Tie-Breaking** - When operators have the same number of check-ins, the one who checked in first gets the higher medal ranking

## Bug Fixes

* **Bulk Check-In Notes Field** - Fixed notes not being populated when using Speed Entry (was using hardcoded field positions instead of dynamic enabled fields)
* **Mobile/Announcements Status Crash** - Fixed page going blank when setting status to "Mobile" or "Announcements" (added missing enum values to backend)
* **Pie Chart Labels in PDF** - Fixed pie chart labels overlapping in PDF exports by using external labels with colored text

---

# December 8, 2025

## New Features

* **Topic of the Week** - Ask participants a discussion question during check-in; responses appear in the check-in list and emailed net log
* **Participant Poll** - Run quick polls with up to 5 predefined options; results include bar chart with percentages in the emailed net log
* **Poll/Topic System Messages** - Chat now shows system messages when participants submit poll or topic answers
* **Dialog Enter Key Support** - Close Net, Topic & Poll, Frequencies, and Check-In dialogs now submit when pressing Enter
* **Countdown Timer** - Nets with a scheduled start time display a countdown timer (e.g., "Starts in 2h 15m 30s")
* **Duration Timer** - Active nets display elapsed time since the net started (e.g., "Duration: 1:23:45")
* **Scheduled Start Time** - Set a scheduled start time when creating a net for countdown display
* **Inline Check-In Editing** - NCS and Loggers can now click any row in the check-in list to edit fields directly inline, eliminating the separate edit dialog

## Improvements

* **Toast Notification Duration** - Increased from 3 seconds to 6 seconds for better readability
* **Email Net Log Enhancements** - Now includes poll results bar chart, topic/poll columns respect field configuration, chat log includes poll question and results summary
* **CSV Export** - Includes Topic Response and Poll Response columns when those fields are configured
* **Reverse Proxy Auto-Detection** - `configure.sh` now auto-detects Caddy or Nginx and sets `SKIP_VITE` appropriately
* **Production Frontend Serving** - `SKIP_VITE=true` setting allows Caddy/Nginx to serve static frontend files instead of Vite dev server
* **Inline Edit Discoverability** - Legend now shows "💡 Click row to edit" hint for NCS/Loggers on active nets

## Bug Fixes

* **Poll Column Not Appearing** - Fixed poll/topic columns missing from all three check-in table views (desktop, mobile, detached)
* **Poll/Topic Not Saving** - Fixed backend not saving topic_response and poll_response on check-in creation and rechecks
* **Poll Autocomplete Premature Submit** - Fixed Enter key in poll dropdown causing form submission before selection was complete
* **Beta Server Frontend Not Loading** - Fixed start.sh assuming all service mode deployments have Caddy; now uses SKIP_VITE env var
* **Timer Showing Negative Values** - Fixed countdown/duration timers showing negative values due to UTC timezone parsing issue

---

# December 7, 2025

## New Features

* **Multi-NCS Frequency Management** - Multiple NCS operators can now each claim and monitor different frequencies within the same net
* **NCS Color Coding** - Each NCS operator is assigned a unique color (orange, blue, green, purple, teal) that is used throughout the interface:
  - NCS rows in check-in list are highlighted with their assigned color
  - Frequency chips in the header show NCS colors when claimed
  - Check-in frequency chips match the color of the NCS monitoring that frequency
  - Current user's claimed frequency has a glowing highlight effect
* **Crown Icons for NCS Hierarchy** - Primary NCS (net owner) displays 👑 crown icon, secondary/additional NCS operators display 🤴 prince crown
* **NCS Frequency Claiming** - NCS operators can click a frequency chip to claim it as their monitored frequency
* **Start Net Button** - Added green play button icon with pulse animation to start nets from the Dashboard and NetView pages
* **WebSocket Broadcast for Check-in Deletion** - Deleted check-ins now instantly disappear from all connected clients

## Bug Fixes

* **Check-in Frequency Assignment** - Fixed NCS's claimed frequency not being assigned to new check-ins (case sensitivity: "NCS" vs "ncs")
* **Available Frequencies Population** - Check-ins now properly include the frequency in `available_frequency_ids` when created by NCS
* **Frequency Filter Excludes NCS** - NCS operators are now always visible in the check-in list regardless of frequency filter
* **React Hooks Order Error** - Fixed page crash caused by hooks being called after conditional returns
* **Page Load Performance** - Optimized roles endpoint with eager loading to avoid N+1 database queries
* **Function Name Typo** - Fixed `getNcsColorForUser` → `getNcsColor` reference error

## Improvements

* **Dashboard Permission Checks** - Dashboard now uses `can_manage` field from API instead of fetching all net roles
* **Frequency Chip Row Styling** - Frequency chip rows now inherit NCS background color and left border from parent check-in

---

# December 6, 2025

## New Features

* **ICS-309 Communication Log Export** - Export nets in official ICS-309 format for FEMA/emergency management reporting
* **ICS-309 Toggle** - Per-net setting to enable ICS-309 mode with additional fields (Time Out, incident info)
* **Compact Check-in List View** - Alternative condensed view showing frequency chips inline with check-ins

## Improvements

* **Check-in Highlight on Net Start** - When net starts, check-in button pulses to prompt users to check in
* **Toast Notifications** - Improved feedback messages throughout the application

---

# December 5, 2025

## New Features

* **Net Templates** - Save and reuse net configurations as templates
* **Bulk Check-in** - Quickly check in multiple stations at once
* **Search Check-ins** - Search and filter check-ins by callsign, name, or location

## Bug Fixes

* **WebSocket Reconnection** - Fixed WebSocket not reconnecting after connection loss

---

# November 2025

## New Features

* **Real-time Chat** - Live chat functionality for active nets
* **Check-in Map** - Visual map showing check-in locations (when grid square provided)
* **Location Awareness** - Auto-fill grid square based on browser geolocation
* **Custom Fields** - Configurable per-net fields beyond the standard check-in fields
* **Net Statistics** - Participation statistics and trends
* **Floating Windows** - Detachable check-in list and chat panels

## Improvements

* **Dark Mode** - System-aware dark/light theme support
* **Mobile Responsive** - Improved mobile layout for all pages
* **Offline Indicator** - Visual indicator when connection is lost

---

# October 2025

## Initial Release

* **Magic Link Authentication** - Passwordless email login
* **OAuth Support** - Google, Microsoft, GitHub login options
* **Net Management** - Create, schedule, start, and close nets
* **Multi-frequency Support** - Nets can have multiple frequencies/modes
* **Check-in System** - Full check-in workflow with status tracking
* **Role-based Access** - Admin, NCS, Logger, User, Guest roles
* **WebSocket Updates** - Real-time check-in and status updates
* **Email Notifications** - Net start notifications and closure logs
* **CSV Export** - Export check-in logs as CSV
