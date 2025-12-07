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

After signing in, complete your profile:

1. Click your name in the top-right corner
2. Select **Profile**
3. Fill in your information:
   - **Name** — Your name as it should appear in net logs
   - **Callsign** — Your amateur radio callsign
   - **SKYWARN Number** — Your spotter ID (if applicable)
   - **Location Awareness** — Enable to auto-fill your grid square on check-ins

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

1. Click **Create Net** from the dashboard
2. Fill in the net details:
   - **Name** — Net name (e.g., "Monday Evening SKYWARN Net")
   - **Description** — Purpose and any special instructions
   - **Frequencies** — Add one or more frequencies/modes
3. Configure check-in fields (required and optional)
4. Save as **Draft** or **Start** immediately

### Starting a Net

- Click the green **▶ Play** button on the Dashboard or NetView page
- A toast notification will remind you to start if you're viewing a draft/scheduled net

### Managing Check-ins

As NCS, you can:
- Enter check-ins for stations
- Edit or delete check-ins
- Update station status
- Track which frequency each station is on

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

### Filtering by Frequency

- **Ctrl+Click** a frequency chip to filter the check-in list
- NCS operators always remain visible regardless of filter
- Click **Show All** to clear the filter

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
- **Your Activity** — Personal check-in history

## Tips & Tricks

### Keyboard Shortcuts
- Press **Tab** to move between fields
- Press **Enter** to submit a check-in

### Mobile Use
ECTLogger works great on mobile devices. Use your phone or tablet in the field!

### Location Awareness
Enable location awareness in your profile to automatically fill in your Maidenhead grid square when checking in. This is especially useful for mobile operations.

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/bradbrownjr/ectlogger/issues)
- **Questions**: Open a discussion on GitHub

---

**73 and stay safe!** 📻
