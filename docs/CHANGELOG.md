# ECTLogger Changelog

All notable changes to ECTLogger are documented here.

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
