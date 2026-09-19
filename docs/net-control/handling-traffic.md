---
title: Handling traffic
summary: The traffic panel, filing and relaying formal messages, and what the chain of custody records.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/handling-traffic/
---

# Handling traffic

Some nets carry formal message traffic — ARRL radiograms, ICS-213 general messages, or a SKYWARN weather strip — alongside ordinary check-in logging. If a net has Assisted Traffic Handling turned on, NCS, Logger, and the net's owner get a Traffic panel for filing and tracking it, right on the net view.

## Who sees it

The toolbar's **Traffic** button only appears when a net has traffic handling enabled *and* you're the net's owner, an admin, or hold an active NCS or Logger role on it. A Standard participant never sees this button on the net view, even on a traffic-enabled net — their own way to file traffic is the **Traffic** item in the top navigation bar instead, covered on the operators path.

**One open defect affects this page.** Right now the panel only fills in for the net's owner and for admins; an NCS or Logger who opens it gets "Not authorized to view this net's traffic" instead of the list. Filing still works. See [Known issues](/docs/about/known-issues/) for the workaround. The rest of this page describes what the panel does once it opens, which is the same for everyone who can see it — the figures below are taken from the net owner's seat.

## The traffic panel

Clicking **Traffic** opens a panel beside the check-in list: a summary strip showing how many pieces of traffic are in each state (draft, pending, relayed, delivered, cancelled, and how many are outstanding), and a short list of recent forms filed on this net.

<figure>
  <img src="/docs/img/net-control/traffic-panel-docked.png"
       alt="The Traffic panel docked below Chat beside the check-in list, showing a &quot;pending: 1&quot; summary chip above a table of one urgent ICS-213 addressed to EOC Logistics.">
  <figcaption>The Traffic panel opens beside the check-in list — filing and viewing traffic never leaves the net view.</figcaption>
</figure>

Like Chat and the Activity Log, this panel can be detached into a floating overlay or popped out into its own window — see [Multiple monitors and wide screens](/docs/net-control/multiple-monitors/). Clicking any row opens that form's full detail, with a back arrow to return to the list.

## Filing traffic

The **+** in the panel's header opens the filing dialog, offering the message types this specific net has enabled.

<figure>
  <img src="/docs/img/net-control/file-traffic-dialog.png"
       alt="The File traffic dialog's form-type picker, showing cards for the message types this net has enabled.">
  <figcaption>Only the form types this net turned on appear here; the standalone Traffic section can always reach the rest.</figcaption>
</figure>

Fill in the form for whichever type you picked and submit. It appears in the panel immediately, and every other viewer's Traffic panel and the site-wide traffic inbox badge refresh live to reflect it.

## Logging the chain of custody

Open a piece of traffic's detail view and you'll find its chain of custody — an append-only log of everything that's happened to that message: originated, received, relayed, delivered, serviced (reported back to the originator), or cancelled. **Log Handoff** adds the next hop: pick the action, optionally the method (voice net, phone, email, in person, and so on), who actually handled it, who it was handed to, and a note if it needs one.

Two things worth knowing about this log:

- It's genuinely append-only. There's no edit button — if a hop was logged wrong, the fix is logging a corrected entry afterward, not changing history. Only an admin can remove an entry, and only the single most recent one, for a real mis-click rather than as a general undo.
- "Handled by" defaults to your own callsign, since the common case is logging something you just did yourself — but it's a plain editable field, so change it when you're logging a hop someone else told you about over the net rather than one you performed.

## Your inbox

Any piece of traffic currently held by you — something you originated or received that hasn't moved on yet — shows up in your own traffic inbox, with a count badge in the top navigation bar. That's the same inbox regardless of which net the traffic came from, so it's worth checking even after a net you were running has closed.

## Exporting

The panel's export button offers two genuinely different outputs: **Text**, one line per report, good for pasting into a spreadsheet or a Winlink template; and **PDF**, every report rendered as its real form — a radiogram pad, an ICS-213, or a strip layout — for printing or handing off on paper.

## Next

[Closing the net](/docs/net-control/closing-the-net/) covers what happens to a net's traffic once the net itself closes, and [Authenticated nets](/docs/net-control/authenticated-nets/) covers the other identity-adjacent staff tool on the net view.
