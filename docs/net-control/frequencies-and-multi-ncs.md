---
title: Frequencies and multiple net controls
summary: Working one frequency on a net that runs several, and running more than one net control desk at once.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/frequencies-and-multi-ncs/
---

# Frequencies and multiple net controls

A net doesn't have to be one frequency and one Net Control Station. A multi-band ARES or SKYWARN exercise routinely runs several repeaters or talkgroups under a single net, each with its own desk, all logging into the same check-in list. This page covers working one frequency chip, and what it looks like when more than one NCS is active on the same net at once.

## Frequency chips

If a net has more than one working frequency, each one shows as a chip in the net's header row, next to the status and duration chips. What clicking a chip does depends on who you are:

- **If you're an active NCS**, clicking a chip **claims it as yours**. It becomes the frequency you're monitoring, shown with a star and your own color, and it's added to your own check-in's available frequencies. A different NCS on the same net claims a different chip the same way; nothing stops two NCS from claiming two different frequencies at once, which is exactly the point.
- **If you're Logger, Relay, or the net's manager** (but not an active NCS), clicking a chip instead sets it as the net's single **active frequency**, the one highlighted blue in the check-in list for whoever's currently on it.
- **Ctrl+click** (or Cmd+click on a Mac) always just filters the check-in list down to that frequency, no matter who you are. It never changes anyone's claim or the net's active frequency.
- On a closed or archived net, chips are view-only, and clicking one no longer does anything.

<figure>
  <img src="/docs/img/net-control/frequency-chips-claimed.png"
       alt="Two frequency chips in the net header: 146.940 MHz FM outlined in red, labelled as the frequency you have claimed, and Brandmeister TG31234 DMR outlined in blue, labelled as the one W1PORT is monitoring.">
  <figcaption>Those colored outlines are the app's own, not a callout on this page. Each active NCS claims a different chip, and the color follows the operator, so the same red marks W1PINE's row in the check-in list.</figcaption>
</figure>

Filtering the check-in list to one frequency never hides an active NCS's own row, regardless of which frequency they've claimed, so you can always see who's in charge no matter which slice of the net you're currently looking at.

## More than one NCS at once

A net can legitimately have several simultaneously active NCS. This isn't a fallback or an error state: a multi-desk exercise with each NCS running a different frequency is exactly what the frequency-claiming behavior above exists for, and the check-in list marks it plainly: the first NCS assigned gets the plain NCS crown, and every other simultaneously active NCS gets a second, smaller **2nd NCS** crown next to their name.

"2nd NCS" is a real label you'll see in the legend, but it is **not** a separate role you assign. Underneath, every NCS on the net holds the exact same role. The list is simply marking that more than one is active right now. [Station statuses](/docs/reference/station-statuses/) covers the legend in full, including the other things it mixes in alongside roles and statuses.

## Becoming a second NCS

There's nothing special to do. Any operator eligible to become NCS on this net can check themselves in as NCS the normal way, regardless of whether someone else already holds the role. [Roles and stepping away](/docs/net-control/roles-and-stepping-away/) covers exactly who's eligible and how, and [Roles and permissions](/docs/reference/roles-and-permissions/) has the complete rules this page leans on.

## Next

[Roles and stepping away](/docs/net-control/roles-and-stepping-away/) covers taking, sharing, and handing off NCS itself, and [Handling traffic](/docs/net-control/handling-traffic/) covers formal message traffic, which works the same way regardless of how many frequencies or desks the net is running.
