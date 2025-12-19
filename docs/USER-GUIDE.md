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

After signing in, complete your profile by clicking your name in the top-right corner and selecting **Profile**. The profile page has two tabs: **Settings** and **Activity**.

#### Settings Tab

**Basic Information**

- **Name** — Your full name or preferred display name (required)
- **Amateur Radio Call Sign** — Your FCC amateur radio callsign (e.g., KC1JMH)
- **GMRS Call Sign** — Your FCC GMRS callsign (e.g., WROP123) for GMRS frequency nets
- **SKYWARN Spotter Number** — Your NWS spotter ID (e.g., DFW-1234) — auto-fills when checking into SKYWARN nets
- **Default Location** — Your home location or Maidenhead grid square (e.g., FN43pp) — auto-fills when NCS checks you in

**Additional Callsigns**

Add other callsigns you use (tactical callsigns, club calls, etc.). Type a callsign and press Enter or click Add. These appear as chips you can remove by clicking the X.

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

## Joining a Net

### Finding Active Nets

1. From the **Dashboard**, you'll see active nets
2. Click on a net to view details
3. If the net is open for check-ins, you'll see the check-in form

### Checking In

1. Open an active net
2. Fill in the check-in form:
   - Your callsign (auto-filled if logged in)
   - Your name (auto-filled from profile)
   - Your location (auto-filled if location awareness is enabled)
   - Any additional fields the NCS has configured
3. Click **Check In**

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

### Starting a Net

Click the green **▶ Play** button on the Dashboard or NetView page to start a net.

**Lobby Mode** — If you start a net before its scheduled start time, the net enters "Lobby" mode:
- Check-ins and chat are fully functional
- A countdown shows until the scheduled start time
- Status shows as "LOBBY" with a warning (orange) color
- Click **Go Live** when ready to officially begin the net

This is useful for opening check-ins early while operators are gathering, before the net officially starts on the air.

### Canceling a Scheduled Net

To cancel a specific net instance (e.g., Christmas Day):
1. Find the draft or scheduled net on the Dashboard
2. Click the red **🗑️ Delete** icon
3. Confirm the deletion

This deletes only that net instance — the recurring schedule continues for future dates.

**Email Subscribers** — Before canceling, you can notify subscribers by clicking the **✉️ Email** icon and sending a custom message.

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

For multi-monitor setups or larger screens, you can pop out components into separate floating windows:

- **Check-in List** — Click the pop-out icon (↗) in the check-in table header
- **Chat** — Click the pop-out icon in the chat panel header

Detached windows can be:
- Resized by dragging edges or corners
- Moved anywhere on screen
- Minimized to a title bar
- Reattached by clicking the attach icon or closing the window

Your detach preferences are saved and restored when you return to the net.

### Multi-NCS Operations

For nets with multiple frequencies, you can have multiple NCS operators:

1. **Assign NCS Role** — Promote other users to NCS via the status dropdown
2. **Claim a Frequency** — Click a frequency chip to claim it as your monitored frequency
3. **Color Coding** — Each NCS is assigned a unique color:
   - 👑 **Crown** — Primary NCS (net owner)
   - 🤴 **Prince Crown** — Secondary NCS operators
   - Frequency chips and check-in rows are colored to match the monitoring NCS
4. **Check-ins** — When you check in a station, they're automatically assigned to your claimed frequency

### Assigning Roles

Delegate responsibilities:
- **NCS** — Full net control, can manage check-ins and claim frequencies
- **Logger** — Can log check-ins
- **Relay** — Can check in stations they can hear but you can't

### Real-time Chat

Each net has a built-in chat for coordination between participants:

- **Send messages** — Type in the chat input and press Enter or click Send
- **System messages** — See when stations check in/out (enable "Show activity in chat" in Profile settings)
- **Pop-out chat** — Detach the chat window to keep it visible while managing the net
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

1. Click **Close Net**
2. A complete log is generated and emailed to you
3. The net is archived for future reference

### Exporting Logs

- **CSV Export** — Download check-ins as a spreadsheet
- **ICS-309 Export** — Official FEMA communication log format (enable in net settings)

## Statistics

View participation statistics:
- **Platform Stats** — Overall system activity
- **Net Stats** — Per-net participation trends
- **Your Activity** — Personal check-in history (also available in your Profile)

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

ECTLogger automatically follows your system's light/dark mode preference. If your device is set to dark mode, ECTLogger will display in dark mode — easier on the eyes during those late-night nets!

### Mobile Use

ECTLogger is fully responsive and works great on mobile devices. Use your phone or tablet in the field! The interface adapts to smaller screens while keeping all functionality accessible.

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

Subscribe to nets you regularly participate in to receive email notifications when they start, close, or are about to begin. Click the bell icon on any net to toggle subscription.

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/bradbrownjr/ectlogger/issues)
- **Questions**: Open a discussion on GitHub

---

**73 and stay safe!** 📻
