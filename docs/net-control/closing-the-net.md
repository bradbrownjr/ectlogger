---
title: Closing the net
summary: What closing generates, who receives it, how to finish the log before it goes out, and what to do if you closed one by mistake.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-10-24
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/closing-the-net/
---

# Closing the net

Closing a net is a real state change, not a formality: it ends the live session, generates the log, and notifies whoever's subscribed to hear about it. This page covers what actually happens and what your options are afterward.

## Closing it

**Close net** is on the toolbar for the net's manager, an admin, and anyone currently acting as NCS or Logger on the net. If you're on the schedule's net staff but haven't taken a role on this occurrence, check yourself in as NCS or Logger first and the button appears. It asks how you want to close:

<figure>
  <img src="/docs/img/net-control/close-net-dialog.png"
       alt="The Close Net dialog, explaining that closing ends the net, with a notice that 1 off-net entry is awaiting review, and Cancel, Review, Finish the log later, Accept all and send, and Close and send the log buttons. Close and send the log is outlined in red.">
  <figcaption>There is no scheduled undo for this; see below for what to do if you close one by mistake.</figcaption>
</figure>

- **Close and send the log** closes the net and emails its log right away.
- **Finish the log later** closes the net but holds the email. Use it when you still have work to do on the log, such as importing a station's paper log after a drill. See [Finishing the log later](#finishing-the-log-later).

Either way, the net's status moves to Closed immediately for every viewer, stations can no longer check in, and chat closes.

If stations logged off-net activity that nobody has accepted yet, the dialog says how many entries are waiting, as above. **Review** opens the off-net log without closing, and **Accept all and send** accepts them, closes, and sends the log. If you send the log without accepting them, they're left off the emailed ICS-309. **Finish the log later** leaves them waiting so you can review them before you send. See [Logging off-net activity](/docs/net-control/off-net-log/).

## What happens the moment it closes

- A system message posts to the net's chat noting it closed.
- Unless you chose **Finish the log later**, a log email goes out to the net's manager (if they've opted in), anyone explicitly subscribed to this schedule, and every active NCS, Logger, and Relay who actually worked this specific occurrence and hasn't opted out. Running a net is enough to get a copy of its own log, even without a separate subscription.
- If the net has **ICS-309** turned on, that email uses the formal ICS-309 log format and folds in any traffic logged on the net as metadata rows (never the message text itself), plus the net's accepted off-net log entries; otherwise it's a plain net-log email. A recipient with their own preference for ICS-309 gets that format regardless of the net's own setting.
- Formal traffic filed on the net isn't touched by closing it. Forms keep whatever disposition their own chain of custody says, and you can keep logging handoffs against them after the net closes. See [Handling traffic](/docs/net-control/handling-traffic/).

## Finishing the log later

A net closed with **Finish the log later** stays closed to stations while net control finishes its log:

- NCS, Logger, and the net's manager can still add stations, one at a time or with **Bulk add**, and fix any check-in. A station added this way is stamped with the time you add it. To keep the times from a station's own log, **Import** it from a CSV instead.
- Off-net entries can still be logged and reviewed, and coverage can still be recorded.
- Stations can't check themselves in, and chat stays closed, even if the net normally keeps chat open for a while after closing.
- The net's page, report, and statistics are marked as a **draft copy**, noting that the log may change before net control approves and sends it. The mark appears on the report's PDF and images too.
- The net can't be archived, and isn't archived automatically when its schedule's next net is created.
- Each day, the net's manager, the schedule's manager and co-managers, and whoever closed the net get an email reminding them the log hasn't been sent.

When the log is complete, click **Send the log** on the banner at the top of the net and confirm. The closing email goes out exactly as it would have at close, built from the log as it stands now. The draft mark comes off, and the net can be archived as usual.

## After closing

Once a net is closed, its exports become available to **anyone who can see the net**, not just staff. Export (CSV), ICS-309, ICS-309 PDF, and the full Report are all open to any viewer, participant included, and to a visitor who isn't signed in. For a visitor, email addresses and phone numbers typed into notes and other free-text fields are hidden, the same as on the check-in list, and the ICS-309 leaves out the off-net log.

<figure>
  <img src="/docs/img/net-control/closed-net-exports.png"
       alt="The toolbar on a closed net, as seen by a station with no staff role: Export, ICS-309, ICS-309 PDF, and Report.">
  <figcaption>Once a net is closed, its exports are open to anyone who can see the net; only Archive and Delete stay staff-only.</figcaption>
</figure>

**Archive** and **Delete** stay restricted to staff. Right after closing, or after you send a held log, a reminder appears offering to archive the net. Archiving hides it from the active dashboard while keeping every check-in, chat message, statistic, and report intact and fully searchable in the Archived Nets list, and it can be undone at any time with Unarchive. Deleting is the one genuinely permanent option here: it removes the net and everything in it, including its statistics. The net drops out of the schedule's statistics and leaderboards and out of every operator's activity history, and its report and ICS-309 can't be produced again. Nobody can bring it back, not even an admin, and the confirmation says so before anything happens. The net's manager, an admin, an active NCS, and the schedule's manager or co-managers can delete a draft, closed, or archived net.

The check-in list and role assignments both stay editable after closing, so a wrong callsign or a misattributed NCS role can still be fixed after the fact, the same way as while the net was live. See [Logging check-ins](/docs/net-control/logging-check-ins/) and [Roles and stepping away](/docs/net-control/roles-and-stepping-away/).

## If you closed one by mistake

Honestly: there's no button that reopens a closed net to Active. Closing is meant to be the end of the session, and nothing brings it back live.

What you *can* do:

- **Fix the record.** Everything in the check-in list and the role assignments stays editable after closing, so a mistake in the *log*, a wrong entry or a missing role, is still fixable even though the net itself is done.
- **Don't compound it by deleting.** Archiving is reversible; deleting is not. If a net was closed too early and needs to keep existing so the record isn't lost, leave it closed (or archive it) rather than deleting it, even if the plan is to start a fresh net for the rest of the session.
- **Start a new occurrence if the net genuinely needs to keep running.** Every net has a schedule behind it, even a one-time net, so that's the **Create** button on the net's schedule in the Scheduler. It won't be the same net record, but it keeps the rest of tonight's traffic and check-ins from being crammed into a log that already says the session ended.

## Next

That's the end of this path. [Frequencies and multiple net controls](/docs/net-control/frequencies-and-multi-ncs/) and [Multiple monitors and wide screens](/docs/net-control/multiple-monitors/) cover running a bigger net than one desk and one screen; [net managers](/docs/net-managers/) picks up from here for anything about the schedule this net belongs to.
