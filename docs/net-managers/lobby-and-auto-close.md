---
title: Lobby and auto-close settings
summary: Opening the lobby early so stations can arrive before Net Control, and closing a net everyone walked away from. Both off by default.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/lobby-and-auto-close/
---

# Lobby and auto-close settings

Both of these exist to take a chore off a human's plate at exactly the moment they're least likely to be watching a clock: right before a net starts, and long after everyone stopped paying attention to it. Both are **off by default**, on every schedule and every net, and both can be set on the schedule (as the default for every net it creates) or overridden on one specific net.

<figure>
  <img src="/docs/img/net-managers/lobby-and-close-toggles.png"
       alt="Two switches on the Edit Net Basic Info tab, both off: 'Open the lobby automatically before the net' and 'Close this net automatically after inactivity,' each with an explanatory line beneath it.">
  <figcaption>Both settings are off by default on every net and every schedule.</figcaption>
</figure>

## Auto-open lobby

Turn this on and ECTLogger moves the net into **Lobby** on its own, a set number of minutes ahead of the scheduled start, so stations can check in and chat before Net Control formally begins. Net Control can still open the lobby by hand at any time regardless of this setting, and can click **Go Live** whenever they're ready. The automatic open just means nobody has to remember to do it.

It needs a real scheduled start time to count backward from, so it only applies to a recurring schedule's nets, or a one-time net you've given a start time. An ad hoc net, or a one-time net left with no start time, has nothing to offset against. For those, turning on **"Enable lobby at start of net"** simply means clicking Start opens the lobby immediately instead of going straight to active, with no countdown involved.

One case where the automatic open is deliberately skipped: if the schedule's rotation exists and shows nobody on duty for that specific occurrence (an overridden date with no replacement, for instance), the lobby doesn't open on its own. An unstaffed lobby that looks like the net is running would be worse than leaving it scheduled. This is separate from a schedule having no rotation at all, which is treated as staffed by the schedule's manager and opens on schedule as normal; see [why an auto-created net can start with nobody assigned](/docs/net-managers/net-staff-and-rotation/) for the reasoning behind that.

## Auto-close on inactivity

Turn this on and an **active** net that's gone quiet for a set number of hours (1, 2, 3, or 4) closes itself, exactly as if Net Control had clicked Close. The closing log still goes out the same way it would for a manual close; the only difference is a system chat message noting it closed automatically. This never applies to a net still sitting in **Lobby**, only to an active one.

"Quiet" means no check-in, no recheck, and no chat message. Any one of those resets the clock, so a long SKYWARN or ARES activation that goes hours between check-ins while people are still actively watching and chatting is never closed out from under them. This is exactly why it's off by default rather than on: a net manager has to decide their net is the kind that's genuinely done once it's quiet, not the kind that goes quiet in the middle of real work.

When a net is within 15 minutes of its computed auto-close time, anyone viewing it sees a dismissible warning banner first, which is enough notice to keep it open by simply checking in or sending a chat message if it shouldn't close yet.

## Related

Turning the countdown timer itself on for a net is [Creating a net](/docs/net-managers/creating-a-net/). Cancelling a scheduled net outright, instead of letting it run and then closing it, is [Cancelling, archiving, and restoring](/docs/net-managers/cancelling-and-archiving/).
