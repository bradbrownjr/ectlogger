---
title: Recurring schedules
summary: Turning a net into a schedule, the recurrence options, what each net it creates inherits, and how subscriptions work.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/recurring-schedules/
---

# Recurring schedules

A **schedule** is the plan; a **net** is one session it produces. Everything on this page lives on the schedule, not on any single night's net — change it here and the change applies starting with the next net the schedule creates. The interface mostly just calls it "schedule," but the underlying record is a `NetTemplate`, so you'll see the word "template" in a URL or an API response now and then; it means the same thing.

There's no button that instantly converts an existing ad hoc net into a schedule. Build the schedule from **Scheduler > Create Schedule** instead — the form's tabs mirror [creating a net](/docs/net-managers/creating-a-net/) closely, so if you want to keep a net's frequencies, script, or announcements, the fastest path is to open both side by side and copy them over.

## Recurrence types

The **Schedule** tab sets how often the schedule creates a net:

<figure>
  <img src="/docs/img/net-managers/schedule-recurrence-options.png"
       alt="The Schedule tab of Edit Schedule, showing schedule type set to Weekly, a day-of-week and time picker, an optional fifth-week operator field, and the auto-lobby, auto-close, and keep-chat-open toggles below it.">
  <figcaption>Ad-Hoc, One-Time, Daily, Weekly, or Monthly — this is also where a weekly schedule's optional fifth-week operator and the auto-lobby / auto-close defaults for every net it creates live.</figcaption>
</figure>

- **Ad-Hoc** creates no nets on its own. It's a saved template you start manually, whenever you need it, from that schedule's **Create** button.
- **One-Time** creates a single net. Giving it a start date and time is optional — leave it blank and the net is created immediately with no countdown; fill it in and the net gets a real scheduled start, which also unlocks the auto-lobby offset below.
- **Daily**, **Weekly**, and **Monthly** create nets on their own, on the day and time you set. Monthly lets you pick which week or weeks of the month (including "last"). A weekly schedule can also name an optional **fifth-week operator** — someone who takes the one extra Tuesday (or whichever day) a five-week month produces, while the regular rotation just skips that week and picks back up the following one.

Whichever type creates nets automatically, each occurrence starts unstaffed unless the schedule has a rotation — see [Net staff and the NCS rotation](/docs/net-managers/net-staff-and-rotation/) for why that's intentional, not a bug.

## What a new net inherits

A net created from a schedule starts with a copy of everything the schedule has set: name, description, info and stream URLs, script, announcements, frequencies, check-in field configuration, ICS-309/topic/poll settings, traffic settings, and the [auto-lobby and auto-close](/docs/net-managers/lobby-and-auto-close/) defaults. From that point on the two are independent — editing the net changes that occurrence only, and [Save to Schedule](/docs/net-managers/creating-a-net/) is the only thing that pushes an edit back the other way.

Net staff, the rotation, and subscribers are never copied onto the net as a one-time snapshot. They stay on the schedule and are read fresh each time a net needs an NCS assignment or a notification goes out.

## Subscriptions

Anyone can subscribe to a schedule from its **Subscribe** button in the Scheduler — it's the same bell used for "notify me" elsewhere in ECTLogger. A subscriber can opt into the net starting, the net closing (with the log attached), and a reminder before it begins, each controlled from their own [profile](/docs/operators/account-and-profile/) notification settings, independent of whether they're staff. Net staff get their own operational reminder regardless of whether they've subscribed, since running the net is a duty, not a preference. Schedule owners and co-managers can see the subscriber list from the schedule's **Net Staff** dialog or the Staff tab.

A schedule can also be followed as a calendar or RSS feed without subscribing at all — see [Feeds](/docs/reference/feeds/).

## Related

Who can start and run nets from this schedule, and the NCS rotation order, are [Net staff and the NCS rotation](/docs/net-managers/net-staff-and-rotation/). The script and standing announcements themselves are [Scripts, notes, and announcements](/docs/net-managers/scripts-and-announcements/).
