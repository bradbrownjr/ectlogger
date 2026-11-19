---
title: Send the reminder and log to a group
summary: Give a net or schedule one group address, such as a groups.io list, and the group gets the net's reminder the day before and its log after it closes.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-11-19
review_by: 2027-11-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/distribution-list/
---

# Send the reminder and log to a group

A club or team that already has a mailing list, such as a groups.io list, can have ECTLogger email that list directly. Give a net or schedule one **Distribution list** address, and the list gets two emails per net:

- **A reminder** once the net is a day or less from its start time. It names the net, its date and time, its frequencies, the NCS on duty when one is known, and a link to the net. A net with no start time gets no reminder.
- **The log** when the net closes, or when net control sends a log they held to finish. It's the same email subscribers get, in the net's own format (plain or ICS-309).

Members of the list don't need an account.

## Set the address

1. Open **Edit Schedule** for a schedule, or **Edit Net** for one net.
2. On the **Basic Info** tab, under **General Net Features**, type the list's address in **Distribution list**.
3. Save.

A schedule's address is copied to each net created from it after you save. A net that already exists keeps the address it had, so change that net in **Edit Net** if it needs the new one. To stop the emails, clear the box and save.

## Let the group accept the emails

The emails come from the address your ECTLogger site sends from. Most groups take mail only from their own members, so the group has to accept that address before anything arrives. The **(i)** button beside **Distribution list** shows the address.

On groups.io:

- **Paid group** (Premium or Enterprise): the group's owner adds the sending address with **Direct Add**, then opens its membership and sets **Posting Privileges** to **Override: not moderated**.
- **Free group**: free groups can only invite members, and nobody reads the sending address to accept an invitation. Instead, the owner turns on **Allow Nonmembers to Post** under **Message Policies**. Each email then waits for a moderator to approve it.

On another list service, allow the sending address to post to the list.

These steps come from the [groups.io owners manual](https://groups.io/helpcenter/ownersmanual), checked on 2026-11-19.

## What the group's copy leaves out

The list isn't an account, so its copy of the log is built the way a visitor who isn't signed in sees the net:

- Email addresses and phone numbers typed into check-in notes, other free-text fields, and chat are hidden.
- The ICS-309 leaves out the off-net log.
- Times are in the schedule's time zone. A net with no schedule uses its manager's.
- There's no unsubscribe link. The footer asks the group to have the net's manager remove the address.

## Who can see and change it

Only the people who can edit the net or schedule see the address. Everyone else, net control included, never sees it. Each change is recorded in the admin activity log.

Net control can send the log to the list again from a closed net's **Reports** menu; see [Sending the log again](/docs/net-control/closing-the-net/#sending-the-log-again).

## Next

[Reports and exports](/docs/net-managers/reports-and-exports/) covers choosing what goes into the closing email. [Emails we send](/docs/reference/emails/) lists every email and who gets it.
