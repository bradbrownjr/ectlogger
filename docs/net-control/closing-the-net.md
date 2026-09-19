---
title: Closing the net
summary: What closing generates, who receives it, and what to do if you closed one by mistake.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/closing-the-net/
---

# Closing the net

Closing a net is a real state change, not a formality: it ends the live session, generates the log, and notifies whoever's subscribed to hear about it. This page covers what actually happens and what your options are afterward.

## Closing it

The toolbar's **Close net** button is available to the net's owner, an admin, or anyone holding an active NCS or Logger role. It asks you to confirm first:

<figure>
  <img src="/docs/img/net-control/close-net-dialog.png"
       alt="The Close Net confirmation dialog: &quot;Are you sure you want to close this net? This will end the session and send log emails to subscribers,&quot; with the Close Net button outlined in red.">
  <figcaption>There is no scheduled undo for this; see below for what to do if you close one by mistake.</figcaption>
</figure>

Confirm, and the net's status moves to Closed immediately for every viewer.

If you hold **both** NCS and Logger on this net, which happens when you open the lobby as Logger and then take net control, Close net currently returns a server error instead of closing. Drop one of the two roles from yourself in **Manage Net Control Staff** and try again; see [Known issues](/docs/about/known-issues/).

## What happens the moment it closes

- A system message posts to the net's chat noting it closed.
- A log email goes out to the net's owner (if they've opted in), anyone explicitly subscribed to this schedule, and every active NCS and Logger who actually worked this specific occurrence and hasn't opted out. Running a net is enough to get a copy of its own log, even without a separate subscription. Relay operators are meant to be on that list too and currently are not; see [Known issues](/docs/about/known-issues/).
- If the net has **ICS-309** turned on, that email uses the formal ICS-309 log format and folds in any traffic logged on the net as metadata rows (never the message text itself); otherwise it's a plain net-log email. A recipient with their own preference for ICS-309 gets that format regardless of the net's own setting.
- Formal traffic filed on the net isn't touched by closing it. Forms keep whatever disposition their own chain of custody says, and you can keep logging handoffs against them after the net closes. See [Handling traffic](/docs/net-control/handling-traffic/).

## After closing

Once a net is closed, its exports become available to **anyone who can see the net**, not just staff. Export (CSV), ICS-309, ICS-309 PDF, and the full Report are all open to any viewer, participant included.

<figure>
  <img src="/docs/img/net-control/closed-net-exports.png"
       alt="The toolbar on a closed net, as seen by a station with no staff role: Export, ICS-309, ICS-309 PDF, and Report.">
  <figcaption>Once a net is closed, its exports are open to anyone who can see the net; only Archive and Delete stay staff-only.</figcaption>
</figure>

**Archive** and **Delete** stay restricted to staff. Right after closing, a reminder appears offering to archive the net. Archiving hides it from the active dashboard while keeping every check-in, chat message, statistic, and report intact and fully searchable in the Archived Nets list, and it can be undone at any time with Unarchive. Deleting is the one genuinely permanent option here: it removes the net and everything in it (check-ins, chat, statistics) with no way to get it back. A closed net can only be deleted outright by an admin; the net's own manager can delete it once it's either a draft or already archived, but not while it's simply closed.

The check-in list and role assignments both stay editable after closing, so a wrong callsign or a misattributed NCS role can still be fixed after the fact, the same way as while the net was live. See [Logging check-ins](/docs/net-control/logging-check-ins/) and [Roles and stepping away](/docs/net-control/roles-and-stepping-away/).

## If you closed one by mistake

Honestly: there's no button that reopens a closed net to Active. Closing is meant to be the end of the session, and nothing brings it back live.

What you *can* do:

- **Fix the record.** Everything in the check-in list and the role assignments stays editable after closing, so a mistake in the *log*, a wrong entry or a missing role, is still fixable even though the net itself is done.
- **Don't compound it by deleting.** Archiving is reversible; deleting is not. If a net was closed too early and needs to keep existing so the record isn't lost, leave it closed (or archive it) rather than deleting it, even if the plan is to start a fresh net for the rest of the session.
- **Start a new occurrence if the net genuinely needs to keep running.** If it's a recurring schedule, that's a normal create-a-net action from the schedule; if it was ad hoc, create a new net. It won't be the same net record, but it keeps the rest of tonight's traffic and check-ins from being crammed into a log that already says the session ended.

## Next

That's the end of this path. [Frequencies and multiple net controls](/docs/net-control/frequencies-and-multi-ncs/) and [Multiple monitors and wide screens](/docs/net-control/multiple-monitors/) cover running a bigger net than one desk and one screen; [net managers](/docs/net-managers/) picks up from here for anything about the schedule this net belongs to.
