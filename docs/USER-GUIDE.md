# ECTLogger User Guide

Welcome to ECTLogger! This guide will help you get started with using the application.

## Getting Started

### Creating an Account

1. Visit [app.ectlogger.us](https://app.ectlogger.us)
2. Enter your email address
3. Click "Send Magic Link"
4. Check your email and click the link to sign in

That's it! No password to remember.

### Setting Up Your Profile

After signing in, complete your profile by clicking your name in the top-right corner and selecting **Profile**. The profile page has three tabs: **Profile**, **Settings**, and **Activity**.

#### Settings Tab

**Basic Information**

- **Name** — Your full name or preferred display name (required)
- **Amateur Radio Call Sign** — Your FCC amateur radio callsign (e.g., KC1JMH)
- **GMRS Call Sign** — Your FCC GMRS callsign (e.g., WROP123) for GMRS frequency nets
- **SKYWARN Spotter Number** — Your NWS spotter ID (e.g., DFW-1234) — auto-fills when checking into SKYWARN nets
- **Default Location** — Your home location or Maidenhead grid square (e.g., FN43pp) — auto-fills when NCS checks you in

**Additional Callsigns**

Add other callsigns you use (tactical callsigns, club calls, etc.). Type a callsign and press Enter or click Add. These appear as chips you can remove by clicking the X.

**Previous Callsigns**

If you update your primary Amateur Radio Call Sign, the old callsign is automatically saved here. Your full check-in history and statistics carry over — useful when upgrading your license class, requesting a vanity callsign, or changing regions. This list is read-only and managed by the system.

**Display Preferences**

- **Display times in UTC** — Show all timestamps in UTC instead of your local timezone. Useful for operators who work across time zones.
- **Show activity in chat** — Display check-in/out and net events as system messages in chat (IRC-style activity feed)
- **Enable location awareness** — Allows ECTLogger to use your browser's location to determine your Maidenhead grid square. Shows your grid in the navbar and auto-fills it on check-ins. Your browser will prompt for permission.

**Email Notifications**

Control which emails you receive for nets you're subscribed to:

- **Enable email notifications** — Master switch for all notifications (except login links)
- **Net start notifications** — Receive an email when a subscribed net goes active
- **Net close notifications (with log)** — Receive the net log when a subscribed net closes
  - **Use ICS-309 format** — Format net logs as ICS-309 Communications Log (FEMA standard) instead of the regular format
- **Net reminder (1 hour before)** — Receive a reminder email 1 hour before scheduled nets start

#### Activity Tab

View your participation statistics:
- Total check-ins, nets participated in, and NCS sessions
- Last 30 days activity
- Your favorite (most frequented) nets

## Net and Schedule Cards

Nets on the **Dashboard** and schedules on the **Scheduler** page are shown as
cards. Every button at the bottom of a card has a **text label** next to its
icon, so you can tell what each one does without hovering over it, and the
buttons are sized for comfortable tapping on a phone.

### Two groups of buttons

If you help run a net, a card's buttons come in **two groups**:

- **Management.** The actions that change something: Create, Edit, Cancel,
  Delete, Start, Email, Archive, Export, Report. You only see these on nets and
  schedules you're allowed to manage.
- **Everyone.** The view-only actions: View, Staff, Stats, Info, and
  Subscribe/Unsubscribe.

If you're not staff on a net, you simply see the second group on its own.

**How they're arranged depends on how wide the card is.** On a wide card — say a
single net stretching the full width of the page — both groups share one row, with
the management buttons on the left and the everyday buttons pushed over to the
right, so the space is actually used. When the card is too narrow to fit them side
by side, the groups stack into two rows, management on top, both lined up on the
left. Cards in a busy multi-column grid will usually stack, while a lone
full-width card on the same page shares a single row.

Within the management group, buttons run from least to most consequential, with
the action you want most sitting at the safe end. On a net card that means
**Edit, Cancel, Start** — so Start is easy to hit and is not sitting next to
Cancel. On a schedule card, **Create** leads, followed by Edit and Delete.

### What each button does

**On a net card (Dashboard):**

| Button | What it does | Who sees it |
|---|---|---|
| **View** | Open the net | Everyone |
| **Staff** | Show the net's NCS, loggers, and relays | Everyone |
| **Stats** | Open net statistics | Everyone (active/lobby and closed nets) |
| **Info** | Open the club or organization's website | Everyone, when an Info URL is set |
| **Email** | Message subscribers before the net | Net staff, on draft/scheduled nets from a schedule |
| **Edit** | Change the net's settings | Net staff, on draft/scheduled nets |
| **Cancel** | Cancel this net instance | Net staff, on draft/scheduled nets |
| **Start** | Open the net for check-ins | Net staff, on draft/scheduled nets |
| **Delete** | Remove the net and its data | Net staff, on active, lobby, and closed nets |
| **Export** | Download the check-in log as CSV | Net staff, on closed nets |
| **Report** | Open the printable PDF net report | Net staff, on closed nets |
| **Archive** | Hide the net from the dashboard, keeping its record | Net staff, on closed nets |

**On a schedule card (Scheduler):**

| Button | What it does | Who sees it |
|---|---|---|
| **Create** | Open a net now from this schedule | Whoever is on duty or manages the schedule |
| **Edit** | Change the schedule's settings | Schedule staff |
| **Delete** | Remove the schedule | Owner or admin only |
| **Info** | Open the club or organization's website | Everyone, when an Info URL is set |
| **Stats** | Open statistics across every net this schedule has run | Everyone |
| **Staff** | Show the schedule's staff and NCS rotation | Everyone |
| **Subscribe** / **Unsubscribe** | Turn email notifications for this net on or off | Signed-in users |

### Long descriptions

When a net or schedule has a long description, the card shows the first three
lines followed by a **Show more** link. Click it to reveal the rest, and **Show
less** to collapse it again. Cards without a long description don't show the link
at all.

On the net page itself, the description sits next to the net name and works a
little differently: clicking it (or the **More** button beside it) opens the full
text in a small panel that floats over the page, so the toolbar and check-in list
stay put instead of being pushed down. Click away to close it.

## Joining a Net

### Finding Active Nets

1. From the **Dashboard**, you'll see active nets
2. Click on a net to view details
3. If the net is open for check-ins, you'll see the check-in form

### The Net Toolbar

Every net page has a toolbar spanning the full width of the page, just below the
net name. Buttons show a text label whenever there's room for one, so you rarely
have to hover to work out what something does. As the window gets narrower,
labels drop off one at a time and the least-used buttons move into a **More**
menu at the end of the strip — but the main action for whatever the net is doing
right now (**Start net**, **Check in**, **Go live**, or **Close net**) always
keeps its label and never disappears into the menu.

The toolbar is split into two groups by a thin divider:

- **Left — information.** Search, Map, Stats, Script, Announcements, Notes,
  Topics, Website, and similar. These don't change anything.
- **Right — management.** Check in, Check out, Raise hand, Step away, and the
  staff controls for running and closing the net.

Some buttons stay tinted to show your current state at a glance — **Check in** is
green while you're not yet checked in, **Role: NCS** stays highlighted while
you're acting as Net Control, and **Return** glows orange while you're marked
away. Hovering a tinted button deepens its own color rather than turning it gray,
so it never looks like it switched off.

Buttons you're not permitted to use aren't shown. **Net info**, **Bulk add**, and
the option to add a historical topic are limited to NCS, loggers, and net
managers. Everyone can still browse the list of prior topics.

To the right of the net name you'll find status chips — the net's status,
countdown or duration, station counts, who's online, and the net's frequencies.
On a phone these wrap onto extra lines instead of pushing the page sideways.

### Checking In

1. Open an active net
2. Click **Check in** in the net toolbar — it's tinted green so it stands out
3. Fill in the check-in form that opens:
   - Your callsign (auto-filled if logged in)
   - Your name (auto-filled from profile or contacts directory)
   - Your location (auto-filled if location awareness is enabled, or from contacts directory)
   - Any additional fields the NCS has configured
4. Submit the form to complete your check-in

### Status Updates

After checking in, you can update your status:
- ✅ **Checked In** — Active participant
- 👂 **Listening** — Monitoring but not active
- 📻 **Available** — Ready if needed
- ⏸️ **Away** — Temporarily unavailable
- 👋 **Checked Out** — Leaving the net

## Running a Net (NCS)

### Creating a Net

The Create Net form has five tabs to configure your net:

#### Tab 1: Basic Info

- **Name** — Net name (e.g., "Monday Evening SKYWARN Net")
- **Description** — Purpose, scope, and any special instructions
- **Info URL** — Optional link to your club or organization's website
- **Scheduled Start Time** — Optional. If set, a countdown timer displays before the net starts
- **Enable ICS-309 format** — Use official FEMA communications log format for net closure emails
- **Allow self check-in** — On by default. Turn off if you want only Net Control and logging staff to add check-ins, e.g. when stations checking in both by voice and by app is causing confusion during roll call. When off, the check-in button is hidden for regular participants; staff still check stations in from the check-in list.

**Community Net Features** (optional):
- **Topic of the Week** — Ask participants a discussion question during check-in (responses collected in log)
- **Participant Poll** — Run a poll with predefined options; results shown as a chart in the net log

#### Tab 2: Net Staff

Pre-assign staff roles before the net starts:
- **NCS** — Net Control Station operators
- **Logger** — Can log check-ins for other stations
- **Relay** — Can check in stations they can hear

Search for users by callsign or name and assign roles.

#### Tab 3: Communication Plan

Add the frequencies and modes for your net:
- **Analog frequencies** — Enter frequency (e.g., "146.520") and mode (FM, SSB, CW, etc.)
- **Digital talkgroups** — Select network (DMR, D-STAR, etc.), enter talkgroup ID, and description

Nets can have multiple frequencies for split operations or cross-band coordination.

#### Tab 4: Net Script

Enter a formatted script for NCS operators to follow. Supports Markdown formatting:
- Use the toolbar for bold, italic, lists, and horizontal rules
- Upload a .txt or .md file with an existing script
- Script appears in a floating, resizable window during the net

#### Tab 5: Check-In Fields

Configure which fields appear on the check-in form:
- **Enabled** — Show the field on the check-in form
- **Required** — Make the field mandatory (only applies if enabled)

Standard fields include: Name, Location, Status, Remarks, etc. If Topic or Poll are enabled on Tab 1, those fields automatically appear here.

After configuring all tabs, click **Create Net** to save as a draft, or start immediately.

### Recurring Schedules

For nets that run regularly (weekly club nets, SKYWARN practice nets, etc.), create a schedule:

1. Click **Create Schedule** from the dashboard or Scheduler page
2. Configure the net details (same as creating a one-time net)
3. Set the **Recurrence Pattern**:
   - Day of the week (e.g., every Tuesday)
   - Start time
   - Timezone
4. (Optional) Set up **NCS Rotation** — assign multiple operators to take turns running the net
5. The system automatically creates draft nets according to your schedule

**NCS Rotation features:**
- Add multiple operators to the rotation pool
- View upcoming NCS assignments on the rotation calendar
- Request coverage or swap dates with other operators
- Override specific dates when needed

### Schedules act as templates

A **schedule** is also the *template* that nets are opened from. When the system (or you) opens a net from a schedule, the net is seeded with the schedule's name, description, info URL, stream URL, script, announcements, frequencies, check-in field configuration, ICS-309/Topic/Poll settings, self check-in setting, and staff list.

After a net is opened, edits you make to the net stay on **that net only** by default. The schedule isn't touched unless you explicitly push your changes back to it. This keeps in-the-moment edits (a one-off frequency change, a session-specific announcement) from rewriting the schedule's defaults.

To promote net edits back to the schedule:

- **Edit Net page** — A second button, **Save to Schedule**, sits next to **Save for this Net**. It copies the net's editable fields (name, description, info URL, stream URL, script, announcements, frequencies, field config, and ICS-309/Topic/Poll toggles) onto the parent schedule. A confirmation dialog lists exactly what will be overwritten.
- **Net Staff dialog** — When opened from a net that came from a schedule, a **Push staff to schedule** button copies the net's NCS operators into the schedule's authorized staff list. Operators already on the schedule are skipped, so the action is safe to repeat.

**Who can use these actions:** the same people who can edit the schedule — its owner, an admin, an active staff member, or an active NCS rotation member. If you don't have permission, the app surfaces a clear error.

### Merging Schedules

If you have multiple schedules that should be combined into one (e.g., separate schedules that were created for the same net series):

1. On the **Scheduler** page, click the **Merge** floating button (merging-arrows icon) in the bottom-right corner
2. Checkboxes appear on each schedule card — select 2 or more schedules to merge
3. Click **Merge Selected** in the bottom bar
4. In the dialog, choose which schedule becomes the **master** (the one that survives)
5. Review the merge summary and any conflicting settings highlighted in yellow
6. Click **Merge** to confirm

**What gets moved to the master schedule:**
- All historical nets and their check-ins, roles, and chat messages
- Subscribers (duplicates are automatically removed)
- Staff members and NCS rotation members
- Topic history and schedule overrides

**Who can merge:**
- **Admins** can merge any schedules
- **Owners** can merge schedules they own (all selected schedules must be yours)

> **This action is permanent and cannot be undone.** Source schedules are deleted after the merge.

### Linking an Existing Net to a Schedule

If an ad-hoc net was created outside a schedule (or was attached to the wrong schedule), you can re-attach it from the **Schedule Statistics** page so its check-ins count toward the schedule's history and leaderboards:

1. On the **Scheduler** page, click **Stats** on the schedule's card.
2. Click **Link Existing Net** in the page header.
3. Pick a net from the list and confirm. To detach a net from a schedule entirely, choose **(none)**.

**Who can link/detach:**
- The net's owner or an admin can change a net's schedule.
- When *attaching* to a schedule, you must also be the schedule's owner or an admin.
- Detaching only requires net ownership/admin.

### Net Script

Create a standardized script for NCS operators to follow:

1. In the **Create Net** or **Create Schedule** form, go to the **Net Script** tab
2. Enter your script using the formatting toolbar (headings, bold, lists, etc.)
3. During the net, click the **📜 Script** button to open the script viewer

The script viewer is a floating window that can be:
- Resized and moved
- Minimized to save screen space
- Opened in a new browser tab for printing or larger display

Example uses:
- Preamble and ID script
- Weather safety messaging (SKYWARN)
- Emergency procedures and frequencies
- Traffic handling protocols

### Net Timers

The net header displays helpful timing information:

- **Countdown Timer** — For scheduled nets, shows time until start (e.g., "Starts in 2h 15m")
- **Duration Timer** — For active nets, shows elapsed time (e.g., "Duration: 1:23:45")

### Correcting Net Start and End Times

If a net was opened late, closed late, or you forgot to close it until the next
morning, net staff can correct the recorded times so the official log and
statistics are accurate. These are the **actual** times the net ran — separate
from the Scheduled Start Time that drives the countdown timer.

Find them under **Actual Net Times**, in the **Basic Info** tab, directly below
Scheduled Start Time:

- **On an active net** — open **Edit Net**.
- **On a closed or archived net** — open **Net Info** from the net's toolbar.
  Even though that page is otherwise read-only, the time fields stay editable,
  because times usually need fixing *after* the net has closed.

Adjust **Actual Start Time** and/or **Actual End Time**, then click **Save
Times**. This saves immediately and on its own — you don't need to save the rest
of the form. The corrected duration flows through to the net log, statistics, and
PDF report.

The fields only appear once a net has actually been started, and only to staff
who can manage the net.

### Starting a Net

Click the green **Start** button on the net's card on the Dashboard, or **Start net** in the toolbar on the net page.

**Lobby Mode** — If you start a net before its scheduled start time, the net enters "Lobby" mode:
- Check-ins and chat are fully functional
- A countdown shows until the scheduled start time
- Status shows as "LOBBY" with a warning (orange) color
- Click **Go live** in the net toolbar when ready to officially begin the net

This is useful for opening check-ins early while operators are gathering, before the net officially starts on the air.

**Opening the lobby automatically** — A schedule can open its lobby on its own, so nobody has to be at a screen for early check-ins to begin. The control lives on the **Schedule** tab of the schedule editor, right after the schedule type, and what it offers depends on that type:

- **Daily / Weekly / Monthly** — turn on **Open the lobby automatically before the net** and choose how far ahead (15, 30, or 60 minutes). Every net created from that schedule inherits the setting.
- **Ad-Hoc** — turn on **Enable lobby at start of net**. These nets have no scheduled time to count down from, so there's no minutes picker; instead, whenever Net Control clicks **Start**, the net stages through Lobby first instead of going straight live. Click **Go live** when ready to officially begin.
- **One-Time** — a **Net Start Time** field appears in the same spot Daily/Weekly/Monthly show their recurrence. Leave it blank and the net is created immediately with no scheduled time, same as before. Fill it in and the lobby toggle below becomes **Open the lobby automatically before the net** with the same 15/30/60-minute picker as a recurring schedule; leave the start time blank and the toggle instead reads **Enable lobby**, behaving like Ad-Hoc (stages into Lobby the moment Net Control clicks Start).

Details worth knowing:
- It is off by default for every schedule type. Existing schedules are unaffected until you turn it on.
- Net Control can still open the lobby by hand at any time, exactly as before.
- For Daily/Weekly/Monthly, to skip auto-lobby for one week only, open that net's **Edit Net** page and turn the switch off there. The schedule is left alone, so following weeks still open automatically.
- The recurring case, and a One-Time net given a start time, will not open the lobby if the week's Net Control duty was cancelled or nobody is on the rotation for that date, so an unstaffed lobby never looks like a running net.
- Subscribers are not emailed when the lobby opens automatically (recurring, or a One-Time net with a start time). That notice waits until Net Control checks in or the net goes live, so nobody is told a net started that never ran. Ad-Hoc, and a One-Time net with no start time, are triggered by Net Control clicking Start, so the usual start notification applies immediately.
- If a lobby opened on its own and nobody ever checked in, it is archived off the dashboard a day later, the same as a scheduled net that was never opened.
- While waiting for it to fire, the net's page shows a live **Lobby opens in** countdown next to the existing **Starts in** countdown, so nobody has to guess whether or when it will happen. The underlying check runs every minute, so the lobby may open shortly after the countdown reaches zero.

### Canceling or Deleting a Net

To cancel or remove a specific net instance:
1. Find the net on the Dashboard
2. Click the red **Cancel** button (on draft and scheduled nets) or **Delete** button (on active, lobby, and closed nets) in the card's management row. Both appear only to net owners, NCS, and admins.
3. The confirmation dialog spells out exactly what will be lost (check-ins, chat, reports). Choose:
   - **Cancel** (blue) — back out
   - **Close & Archive** (yellow, only on active/lobby nets) — close the net normally (the full log is emailed to you) and immediately archive it, so the record is preserved but the net leaves the active list. Best choice for finished test/training runs you want to keep.
   - **Archive Instead** (yellow, only on closed nets) — hide the net from the active list while keeping every record
   - **Delete Permanently** (red) — destroy the net and all its data; this cannot be undone

This deletes only the chosen net instance — the recurring schedule continues for future dates. For training and practice runs, deletion is the right choice; for real net activations, **archive** is almost always safer because it preserves the log.

**Email Subscribers** — Before canceling a draft/scheduled net, you can notify subscribers by clicking the **Email** button on the net's card and sending a custom message.

### Managing Check-ins

As NCS, you can:
- Enter check-ins for stations
- Edit or delete check-ins
- Update station status
- Track which frequency each station is on

#### Speed Entry (Bulk Check-In)

For fast-moving nets, use the ⏩ Speed Entry button to check in multiple stations at once:

1. Click the **⏩** button next to the check-in form
2. Enter multiple check-ins separated by semicolons
3. Format: `CALLSIGN, Name, Location, Notes; CALLSIGN2, Name2, Location2`
4. Press **Ctrl+Enter** or click the Add button to process all at once

**Status shortcuts** — Append a colon and shortcut to set status:
- `:jl` — Just Listening
- `:r` — Relay
- `:t` — Has Traffic
- `:a` — Announcements
- `:m` — Mobile
- `:o` — Checked Out

**Examples:**
```
KC1ABC, John, Portland ME; N1XYZ, Jane, Boston MA:jl; W1DEF, Bob, Bangor ME:m
```

This checks in KC1ABC (normal), N1XYZ (listening status), and W1DEF (mobile status) in one operation.

> **Note:** The field order matches your net's enabled fields (shown in the format hint). If "Power Source" is enabled, the format becomes: `CALLSIGN, Name, Location, Power, Notes`.

#### Inline Editing

NCS and Loggers can edit check-in details directly in the table:

1. Click anywhere on a check-in row to enter edit mode
2. The row highlights and fields become editable text boxes
3. Click on the specific field you want to edit — it will auto-focus
4. Press **Tab** to move between fields within the same row
5. Press **Enter** to save changes, or **Escape** to cancel
6. Click outside the row to save and exit edit mode

This eliminates the need for a separate edit dialog for quick corrections.

### Detachable Windows

For multi-monitor setups or larger screens, you can pop out the Check-In
list, Chat, or Activity Log into a movable panel inside the page — click the
picture-in-picture icon in that panel's header (on the check-in list, it's
stacked above the "open in new window" icon in the same corner, to keep the
table's action column from getting any wider).

Detached windows can be:
- Resized by dragging edges or corners
- Moved anywhere on screen
- Minimized to a title bar
- Reattached by clicking the attach icon or closing the window

Your detach preferences are saved and restored when you return to the net.

### Running a Net Across Multiple Monitors

Check-Ins, Chat, and Activity Log can each open in a real, separate browser
window instead of a panel inside the page — click the "open in new window"
icon in that panel's header (docked or floating). This is built for
multi-monitor NCS stations: dedicate a full screen to the check-in table,
another to chat, another to the activity feed. Each window signs in
automatically, keeps its own live connection to the net, and remembers its
size and position the next time you open it. Closing a window brings that
panel back into the main net view automatically.

If you've already floated a panel into the in-page movable window and decide
you'd rather have it in its own real window, there's no need to dock it back
first — the floating panel's title bar has its own "open in new window"
icon that sends it straight there in one click.

### Multi-NCS Operations

For nets with multiple frequencies, you can have multiple NCS operators:

1. **Assign NCS Role** — Promote other users to NCS via the status dropdown
2. **Claim a Frequency** — Click a frequency chip to claim it as your monitored frequency
3. **Color Coding** — Each NCS is assigned a unique color:
   - 👑 **Crown** — Primary NCS (net owner)
   - 🤴 **Prince Crown** — Secondary NCS operators
   - Frequency chips and check-in rows are colored to match the monitoring NCS
4. **Check-ins** — When you check in a station, they're automatically assigned to your claimed frequency

### Stepping Away as NCS

If you're the only active NCS and click Step Away, you'll see a confirmation
warning that no one else is currently running the net. If you continue, or
if you're disconnected/check out with no co-NCS covering, the net shows a
blue border and a banner telling everyone the net has been paused until
Net Control returns, and the on-air duration timer pauses. Both clear
automatically the moment an NCS is present again — either you returning, a
co-NCS stepping up, or someone claiming NCS. Time spent with no NCS present
doesn't count toward the net's recorded duration in statistics or reports.

### Assigning Roles

Delegate responsibilities:
- **NCS** — Full net control, can manage check-ins and claim frequencies
- **Logger** — Can log check-ins
- **Relay** — Can check in stations they can hear but you can't

### Real-time Chat

Each net has a built-in chat for coordination between participants:

- **Send messages** — Type in the chat input and press Enter or click Send
- **System messages** — See when stations check in/out (enable "Show activity in chat" in Profile settings)
- **Pop-out chat** — Detach the chat window to keep it visible while managing the net, or open it in its own browser window for a second monitor
- **Persistent history** — Chat messages are saved and visible to participants who join later

Chat is useful for:
- Coordinating between NCS operators on multi-frequency nets
- Quick questions or comments from participants
- Relaying traffic details without tying up voice frequencies
- Backup coordination during contests or emergency activations

### Filtering by Frequency

- **Ctrl+Click** a frequency chip to filter the check-in list
- NCS operators always remain visible regardless of filter
- Click **Show All** to clear the filter

### Community Net Features

For casual nets and roundtables, ECTLogger offers engagement tools:

#### Topic of the Week

Ask participants a discussion question:

1. In the net settings (Topic & Poll button), enter a **Topic Question**
2. When checking in, participants see the question and can type their response
3. Responses appear in the check-in list's "Topic" column
4. All responses are included in the emailed net log

#### Participant Poll

Run a quick poll with predefined options:

1. In the net settings (Topic & Poll button), enter a **Poll Question**
2. Add up to 5 **Poll Options** (e.g., "Yes", "No", "Maybe")
3. Participants select their answer via dropdown when checking in
4. Poll results are shown in the "Poll" column
5. The emailed net log includes a bar chart of poll results with percentages

Both Topic and Poll columns are only visible when configured for the net. System messages in chat announce when participants submit answers.

### Closing the Net

1. Click **Close net** in the net toolbar
2. A complete log is generated and emailed to you
3. The net can be archived or remain in closed status

### Archiving and Unarchiving

- **Auto-archive (recurring nets)** — When a new net is created from a recurring schedule (manually or automatically), any previously closed nets from that same schedule are archived automatically. This keeps the dashboard clean without requiring manual cleanup after each net. Archived nets remain fully accessible and can be unarchived at any time.
- **Auto-archive (stale scheduled nets)** — A net in Scheduled status that was never opened is automatically archived 24 hours after its scheduled start time. If a net didn't happen, it disappears from the dashboard on its own.
- **Archive** — From a closed net, click **Archive** (on the net's card, or in the net toolbar) to hide it from the main dashboard. A 5-second UNDO toast lets you cancel if clicked accidentally.
- **Unarchive** — From an archived net view, click **Unarchive** in the toolbar to restore it to closed status.
- **Download Logs** — Both closed and archived nets have download buttons (CSV and ICS-309) available in the toolbar. Closed nets also have an **Export** button on their dashboard card for the CSV log.

### Exporting Logs

- **CSV Export** — Download check-ins as a spreadsheet
- **ICS-309 Export** — Official FEMA communication log format (enable in net settings)

### Importing Check-ins from CSV

Closed and archived nets now include an **Import CSV** button next to export actions. This is useful when multiple NCS operators are logging in parallel and some logs were captured on paper or in another tool.

1. Open the closed or archived net.
2. Click **Import CSV**.
3. Optional: click **Export Template** to download the expected columns and sample rows.
4. Choose a file by clicking the drop zone or drag and drop a CSV file.
5. Set time interpretation:
   - **UTC checked**: untagged timestamps are treated as UTC.
   - **UTC unchecked**: untagged timestamps use the selected **Import Time Zone**.
   - Timestamps with explicit markers (`Z`, `UTC`, `GMT`, `+/-HH:MM`) always use their explicit timezone.
6. Click **Import CSV**.

#### Accepted Date and Time Formats

The importer accepts simple operator-friendly formats:

- `6/3/2026 2:24 PM`
- `3/6/2026 14:24`
- `2026-06-03 14:24`
- `2:24 PM`
- `2:24`
- `14:24`

Both US and British slash-date ordering are supported. If a slash-date is ambiguous and cannot be resolved safely, the row is rejected with a row-numbered error.

#### Timeframe Validation

Imported timestamps are validated against the net timeline:

- Earliest allowed: net open/lobby start.
- Latest allowed: net close time plus 10 minutes.

Rows outside this window are skipped and reported with clear row numbers and reason text.

#### Checks and Balances

- Row-level validation errors are shown in the import dialog with row numbers.
- Sample rows from the exported template are marked and automatically ignored if left in the file.
- Imports keep check-ins in chronological order based on parsed timestamp.

### Net Report (PDF)

Generate a comprehensive multi-page PDF report for closed or archived nets:

1. **Access** — Click **Report** in the net toolbar (for closed/archived nets), or the **Report** button on the net's card on the Dashboard
2. **View Report** — Review the report page with all sections displayed
3. **Export** — Click **Export PDF** to download the report

**Report Sections** (each on its own page):

- **ECTLogger Header** — Branded title with site URL for attribution
- **Net Info** — Name, description, frequencies, NCS operators, start/end times, duration
- **Statistics Summary** — Cards showing total check-ins, unique operators, rechecks, duration; plus charts for status breakdown and check-ins by frequency
- **Check-in Log** — Complete table of all check-ins with time, callsign, name, location, status, frequency, and notes
- **Chat Log** — All user messages (system messages excluded) with timestamps
- **ICS-309** — Official communications log format (only if ICS-309 is enabled for the net)

The PDF is ideal for after-action reports, club records, or emergency management documentation.

## Statistics

Three statistics views are available, each with PDF export:

- **Platform Stats** — Overall system activity across all nets.
- **Net Stats** — Per-net participation trends, status breakdown, and check-ins by frequency.
- **Your Activity** — Personal check-in history (also available in your Profile).

**Top Operators Ranking** — Top operators are ranked by check-in count. When tied, the operator who checked in earliest gets the higher medal (🥇🥈🥉) ranking.

### Schedule Statistics

For recurring nets, the **Schedule Statistics** page (Scheduler → **Stats** on a schedule card) aggregates participation across every net instance the schedule has produced.

**Time-window filter** — Toggle between **30 days**, **90 days**, **1 year**, and **All time**. The default is **1 year** so monthly nets and occasional SKYWARN activations always show meaningful counts. The selected window applies to every panel on the page (summary cards, leaderboards, history log, and PDF export).

**Summary cards** — Total nets in the window, total check-ins, unique operators, and average check-ins per net.

**Leaderboards** — Tabbed view; each leaderboard is scoped to the selected time window and lists the top 20:

- **Check-ins** — Top callsigns by number of nets they checked into. Replaces the old strict "Regular Operators (50%+)" view, which was empty for nets with operator turnover.
- **NCS** — Operators ranked by the number of nets they ran as Net Control.
- **Logger** — Operators ranked by the number of nets they logged.
- **Relay** — Stations ranked by both the number of nets they relayed in and total relayed check-ins. Derived from the *Relayed By* field on each check-in.

**Net History log** — Recent net instances under this schedule, including start/end times, duration, check-in count, and the **NCS callsign(s)** for each instance.

### Exporting a Schedule Statistics Report (PDF)

Click **Export PDF** in the page header to download a printable report. The report respects the active time-window filter and includes:

- The schedule name and the active filter (e.g., "Last 1 year").
- All summary cards.
- **All four leaderboards** stacked sequentially — the PDF is static, so every leaderboard is included regardless of which tab is active on screen.
- The Net History log with NCS callsigns.

Use this for after-action reporting, club records, or emergency management documentation that needs to show participation trends across many nets.

## Tips & Tricks

### Keyboard Shortcuts

**Check-in Form:**
- Press **Tab** to move between fields
- Press **Enter** to submit a check-in

**Inline Editing:**
- Press **Tab** to move between fields in the same row
- Press **Enter** to save changes
- Press **Escape** to cancel without saving

### Dark Mode

Toggle dark mode from the navbar's sun/moon icon (or the user menu on mobile), or from the "Dark mode" switch at the top of **Profile → Settings** — easier on the eyes during those late-night nets. Your choice is remembered on this device.

### Color Themes

Pick a color theme from **Profile → Settings**: each named theme is a coordinated light/dark pair, so whichever one you choose works automatically with the dark mode toggle above. Select "Follow system default" to always match whatever the site admin has set as the default theme instead of a fixed personal choice — this is also what you get automatically until you pick something else. If the site admin has configured a custom theme (Admin → Branding), it shows up here too, alongside the curated set.

### Mobile Use

ECTLogger is fully responsive and works great on mobile devices. Use your phone or tablet in the field! The interface adapts to smaller screens while keeping all functionality accessible.

A few things behave differently on a phone:

- **Bigger buttons on cards** — the action buttons on net and schedule cards use
  a taller tap target on mobile, so they're easier to hit accurately with a thumb.
- **Status chips wrap** — a busy net's chips flow onto extra lines instead of
  forcing the page to scroll sideways.
- **Activity Log starts collapsed** — on a phone the Activity Log begins closed
  so the check-in list and chat are reachable without scrolling past it. Open it
  whenever you like; your choice is remembered separately from the desktop view.
- **Swipe between tabs** — on pages with tabs (Profile, Admin), swipe left or
  right to move between them.

### Location Awareness

Enable location awareness in your profile to automatically fill in your Maidenhead grid square when checking in. This is especially useful for:
- Mobile operations where your location changes
- Field Day and portable setups
- SKYWARN spotters reporting from various locations

Your browser will ask for permission before sharing location data.

### Searching and Filtering

**Search Bar:** Type in the search field to filter check-ins by callsign, name, or location.

**Frequency Filtering:** If a net has multiple frequencies:
- **Ctrl+click** a frequency chip to filter the check-in list to only stations on that frequency
- Click again to remove the filter
- A "Clear Filter" chip appears when filtering is active
- NCS operators are always shown regardless of filter

This is handy for NCS operating split frequencies — focus on stations monitoring your frequency!

### Subscribing to Nets

Subscribe to nets you regularly participate in to receive email notifications when they start, close, or are about to begin. On the **Scheduler** page, click **Subscribe** on a schedule's card; the button becomes **Unsubscribe** once you're subscribed, so you can always tell your current state at a glance.

---

## Administration (Admin Role Only)

Users with the Admin role have access to additional management features via the Admin page.

### View as Regular User

Admins can temporarily simulate the regular user experience to reproduce bug reports or guide other operators through the app. Click your avatar in the top-right corner and choose **View as Regular User** (padlock icon, near the dark/light mode switch). While active, admin-only UI elements are hidden and an amber **User View** chip appears in the navbar. Click the chip or return to the menu and choose **Exit User View** to restore full admin access. This is a client-side toggle only — no backend permissions change.

### User Management

The Users tab shows all registered users with online presence indicators:

**Presence Indicators (colored dots):**
- 🟢 **Green** — Online now (active within 5 minutes)
- 🟡 **Yellow** — Away (5-15 minutes since last activity)
- 🔴 **Red** — Offline (15+ minutes since last activity)

**Power-User Indicators (icons):** Two columns flag engaged users at a glance, without opening their profile:
- 🏅 **NCS badge** — shown for any user who has held the NCS role on a net, past or present.
- 📰 **Subscriber badge** — shown for any user currently subscribed to "What's New" emails (Profile → Settings).

Both columns are blank for users the badge doesn't apply to, and both are sortable — click the column header to list all NCS operators, or all subscribers, together.

**Default Sort:** Users are sorted by online status (online first), then alphabetically by name.

**Available Actions:**
- Change user roles (user, ncs, admin)
- Ban/unban users
- Delete users

**Column Order:** Name, Callsign, Email, Role, NCS, Subscriber, Status, Last Active, Created, Actions

### Additional Admin Features

- **Contacts** — View and manage station contacts auto-populated from check-in history. Fix names, add emails, send invites to create user accounts. Contact data auto-fills when NCS enters a callsign during check-in.
- **Check-In Fields** — Configure default check-in form fields
- **Frequency Library** — Manage shared frequency presets
- **Security** — View fail2ban status and recent authentication events
- **Site Settings** — Configure schedule creation limits
- **Branding** — Set the system-wide default color theme and light/dark appearance, build a fully custom color theme, and upload a custom logo to replace the built-in mark — useful for self-hosted instances that want to look like their own organization. The default theme applies immediately to any user who hasn't picked a personal theme in their own Profile → Settings; the default appearance only affects visitors who have never toggled light/dark before.

---

## Getting Help

The **Help** menu in the top navigation bar provides four options:

- **User Guide** — Opens this documentation site in a new tab.
- **Start Walkthrough** — Launches a step-through tour of the main app areas: Dashboard, Running a Net, Schedule, Statistics, Profile & Settings, and the Help menu itself. The walkthrough launches automatically on your first login and can be restarted at any time from here.
- **Submit Feedback** — Opens an in-app form to report a bug or request a feature. Submissions are delivered directly to the site administrator with your callsign and contact info included so they can follow up. Rate-limited to 5 submissions per hour.
- **About ECTLogger** — Shows the current version, a link to the GitHub repository, open-source license credits, and the Honorable Mentions list of operators whose feedback helped shape the platform.

---

**73 and stay safe!** 📻
