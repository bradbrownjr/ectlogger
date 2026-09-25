---
title: The net control desk
summary: Every control on the net view, what it does, and which ones you'll actually reach for.
kind: Explanation
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-09-25
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/the-net-control-desk/
---

# The net control desk

Every net, whether it has three check-ins or thirty, opens to the same page: a title bar, a row of buttons, a check-in list, and (space permitting) chat and an activity log alongside it. This page walks the whole thing once, control by control, so the first time you see it isn't in the middle of a busy net.

What you actually see depends on who you are. A Standard participant gets a handful of read-only buttons. NCS and Logger get the full command bar. Relay gets participant-level access plus the ability to log check-ins on behalf of stations Net Control can't hear directly. The screenshots on this page are from NCS's seat; where Logger or Relay see something different, it's called out.

## The command bar

<figure>
  <img src="/docs/img/net-control/command-bar-ncs.png"
       alt="The net control command bar as Net Control Station sees it on an active net, reading left to right: Bulk add, Search, Map, Traffic, Announcements, Notes, Topics, Stats, Import, Edit net, Roles, Role: NCS, Step away, Just listening, Check out, Close net.">
  <figcaption>Every button here is gated by who you are and what state the net is in. A Standard participant, a Logger, and a Relay operator each see a different subset of this same row.</figcaption>
</figure>

The bar is two groups run together with a thin divider between them: information buttons on the left (things that show you something), and management buttons on the right (things that change the net or your own participation in it). On a narrow window the bar drops labels first, then moves whichever buttons matter least into a **More** menu, lowest-priority first. Nothing is ever hidden just because a phone-sized breakpoint says so, only because there's genuinely no room.

Here's what each one does, grouped the way the toolbar groups them.

### Information (left side)

- **Bulk add** — opens a box for entering one or many check-ins at once, fast. Also known as speed entry. Covered in full on [Speed entry](/docs/net-control/speed-entry/). Only NCS and Logger see it, and only once the net has at least one check-in.
- **Search** — filters the check-in list by callsign, name, or location as you type. Doesn't touch the underlying data, just what's shown.
- **Map** — plots every checked-in station with a location ECTLogger could parse, including ones already checked out. See [Location formats](/docs/reference/location-formats/) for what it can and can't read.
- **Coverage** — station-to-station "who can hear whom" reports, if the net has propagation logging turned on. Not every net does.
- **Traffic** — opens the traffic panel for this net, if the net has formal traffic handling enabled and you're the net's manager, an admin, or hold an active NCS or Logger role. A Standard participant never sees this button, even on a traffic-enabled net. See [Handling traffic](/docs/net-control/handling-traffic/).
- **Announcements** / **Notes** / **Topics** / **Stats** — read-only views of the schedule's announcements, this net's own notes, prior weeks' topic-of-the-week answers, and this net's statistics page.
- **Audio** and **Website**, when the net has a stream URL or an info URL set, open those in a new tab.

### Management (right side)

- **Import** — backfills check-ins from a CSV, for a net that ran off-app or needs bulk correction. Shown to the net's manager, an admin, anyone currently acting as NCS, Logger, or Relay, and the schedule's net staff, whether or not they've taken a role on this occurrence yet. This is a net-manager-flavored tool; day-to-day logging almost never needs it.
- **Edit net** — the net's settings form. Staff only, and it stays available even after the net closes, since a typo in the log sometimes isn't found until later.
- **Roles** — opens **Manage Net Control Staff**, where you assign or remove NCS, Logger, and Relay for anyone. On a draft or scheduled net the button's tooltip reads "Assign NCS and logger roles (any assigned NCS can start the net)". Covered in [Roles and stepping away](/docs/net-control/roles-and-stepping-away/).
- **Role: NCS** / **Role: Standard** — appears only for an operator who already holds an active NCS role on this net, and toggles between acting as NCS and stepping down to a Standard participant without leaving the role behind entirely.
- **Claim NCS** — a recovery button, shown to the net's manager or an admin only when a net has no assigned NCS at all.
- **Raise hand** — a participant-side signal to get NCS's attention; NCS doesn't see this on their own row, since they run the queue rather than joining it.
- **Step away** / **Just listening** / **Check out** — self-service status changes for your own check-in. Stepping away as the net's only active NCS asks you to confirm first, since it pauses the net until someone returns. See [Roles and stepping away](/docs/net-control/roles-and-stepping-away/).
- **I hear** — records which stations you can hear, if the net has propagation logging on and allows self-reporting.
- **Close net** — ends the session. See [Closing the net](/docs/net-control/closing-the-net/) for exactly what that does and doesn't undo.

Once a net is closed or archived, the management group swaps to **Export**, **ICS-309**, **ICS-309 PDF**, **Report**, and (staff only) **Archive** or **Delete**. These are covered in [Closing the net](/docs/net-control/closing-the-net/).

## The title row

Above the command bar, the net's name and description sit next to a row of status chips: the net's current status (LOBBY or ACTIVE), how long it's been running, a station count, and, when the net has more than one working frequency, a chip per frequency. Clicking a frequency chip does different things depending on who you are and whether you're NCS; that behavior, and what the colors mean, is its own page: [Frequencies and multiple net controls](/docs/net-control/frequencies-and-multi-ncs/).

If nobody who currently holds an active NCS role is actually present on the net, a blue border frames the whole browser window and a banner reads "Net Control has stepped away — this net has been paused until they return." That's covered in [Roles and stepping away](/docs/net-control/roles-and-stepping-away/), along with what "paused" does and doesn't mean for the net's timer.

## The check-in list and its legend

The check-in list is the center of the page for a reason: everything else here exists to keep it accurate. A legend strip sits above it:

<figure>
  <img src="/docs/img/reference/check-in-legend.png"
       alt="The check-in list legend, reading left to right: NCS (a crown), 2nd NCS (a second crown), Logger (a clipboard), Standard (a check mark), Recheck (two arrows in a circle), Listening (an ear), Relay (a satellite dish), Away (a pause symbol), Traffic (a siren), Announce (a megaphone), and Out (a waving hand), followed by a note that a blue highlight marks a station on the net's active frequency and that clicking a row opens inline editing.">
  <figcaption>The legend above the check-in list. It mixes net roles, station statuses, and the Recheck marker in one row; Station statuses explains what each entry means.</figcaption>
</figure>

It's worth knowing up front that this legend is doing three different jobs at once: it shows **per-net roles** (NCS, 2nd NCS, Logger), **station statuses** (Standard, Listening, Relay, Away, Traffic, Announce, Out), and the **Recheck marker**, which is neither. [Station statuses](/docs/reference/station-statuses/) untangles all three in full; the short version is that "2nd NCS" is real (it's how the list marks any additional simultaneously-active NCS beyond the first) but it isn't a role you assign, because every NCS holds the identical role underneath.

For adding, editing, and correcting rows in that list, see [Logging check-ins](/docs/net-control/logging-check-ins/).

## What's docked beside the list

On a wide enough screen, Chat and the Activity Log sit docked in a column beside the check-in list by default; on an ultrawide monitor, Script, Notes, and the schedule's Announcements can join a second column on the left. Every one of these panels, along with Map, Coverage, and Traffic when they're open, can be detached into a floating overlay or popped out into a genuinely separate browser window, so you can spread the desk across more than one monitor. That's its own page: [Multiple monitors and wide screens](/docs/net-control/multiple-monitors/).

## Which ones actually matter

If you're new to this seat, the controls worth knowing cold before your first net are: **Bulk add** (fast logging), clicking a row to edit it inline, **Step away** and **Check out** for your own status, **Roles** if you need to hand off or add a Logger, and **Close net** when you're done. Everything else on this page is worth knowing exists, but you'll reach for those five constantly and the rest occasionally.

## Next

[Logging check-ins](/docs/net-control/logging-check-ins/) covers adding and correcting rows in detail, and [Roles and stepping away](/docs/net-control/roles-and-stepping-away/) covers taking and handing off control.
