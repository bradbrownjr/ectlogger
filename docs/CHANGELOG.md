# ECTLogger Changelog

All notable changes to ECTLogger are documented here.

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

## Improvements

* **Toast Notification Duration** - Increased from 3 seconds to 6 seconds for better readability
* **Email Net Log Enhancements** - Now includes poll results bar chart, topic/poll columns respect field configuration, chat log includes poll question and results summary
* **CSV Export** - Includes Topic Response and Poll Response columns when those fields are configured
* **Reverse Proxy Auto-Detection** - `configure.sh` now auto-detects Caddy or Nginx and sets `SKIP_VITE` appropriately
* **Production Frontend Serving** - `SKIP_VITE=true` setting allows Caddy/Nginx to serve static frontend files instead of Vite dev server

## Bug Fixes

* **Poll Column Not Appearing** - Fixed poll/topic columns missing from all three check-in table views (desktop, mobile, detached)
* **Poll/Topic Not Saving** - Fixed backend not saving topic_response and poll_response on check-in creation and rechecks
* **Poll Autocomplete Premature Submit** - Fixed Enter key in poll dropdown causing form submission before selection was complete
* **Beta Server Frontend Not Loading** - Fixed start.sh assuming all service mode deployments have Caddy; now uses SKIP_VITE env var

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
