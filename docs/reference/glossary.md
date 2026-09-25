---
title: Glossary
summary: Words this site uses in a particular way, including a few that mean something slightly different in ECTLogger than they do on the air.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-25
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/glossary/
---

# Glossary

This isn't an amateur radio primer. It assumes you already know what a net, a repeater, and a callsign are. It's here for the words ECTLogger itself uses in a specific way, and for the handful of standard traffic-handling terms this site refers to without re-explaining every time.

**2nd NCS**
: Not a separate assignable role. The label the check-in list uses for any active NCS beyond the first one assigned, for as long as the first is still checked in. See [Station statuses](/docs/reference/station-statuses/).

**Active frequency**
: The one frequency, among a net's several, that NCS has marked as the one everyone should currently be listening to. Stations checked in on it get a highlighted badge in the check-in list.

**Authenticated net**
: A net with the authenticated-nets toggle on, letting NCS or Logger compare a checked-in station's live TOTP code (the same six-digit code their authenticator app shows) against the code ECTLogger computes, to confirm over the air that the operator is who they claim to be. Requires the station's own account to have two-factor authentication enrolled; a station with no account, or no TOTP set up, simply can't be verified this way.

**Bulk add**
: The button (sometimes called "speed entry") that accepts several check-ins typed as one line of semicolon-separated, comma-delimited fields. See [Speed entry syntax](/docs/reference/speed-entry-syntax/).

**Check-out**
: Setting a station's status to Out. Does not remove it from the map, the report, or the log; see [Station statuses](/docs/reference/station-statuses/).

**Co-manager**
: A member of a schedule's staff list with an elevated flag, on top of everything plain net staff can do: transferring schedule ownership, merging the schedule into another, and archiving or deleting a net from that schedule. See [Roles and permissions](/docs/reference/roles-and-permissions/).

**Demo traffic**
: Traffic explicitly marked as throwaway test data. Excluded from reminders, from ICS-309 and net report output, and from summary counts; deletable by its creator or an admin regardless of what's already been logged against it. Contrast with drill traffic below.

**Drill traffic**
: Traffic marked as simulating a real incident for practice. Unlike demo traffic, drill traffic is treated exactly like the real thing everywhere: the same reminder ladder, the same append-only chain of custody, the same appearance in exports. The label exists only so an after-action review can tell it apart from an actual activation.

**Frequency chip**
: The small badge for each of a net's frequencies, shown across the top of the check-in list. Click one to claim it as the frequency you're monitoring, or Ctrl+click to filter the check-in list to just that frequency.

**Grid square**
: A Maidenhead locator (for example `FN43mr`), a compact way to specify a location that ECTLogger's map can parse directly, with no geocoding needed. See [Location formats](/docs/reference/location-formats/).

**ICS-213**
: FEMA's General Message form, one of the formal traffic types ECTLogger can log and export alongside the ARRL Radiogram and RRI strips.

**ICS-309**
: FEMA's Communications Log form, and the format a net's closure log can be exported in, listing every check-in and message in a standard incident-management layout instead of ECTLogger's plain log.

**Lobby**
: The staging state a net sits in before it officially starts. Stations can check in while a net is in the lobby, but the net isn't yet ACTIVE. A lobby can be opened by a human or, if the schedule allows it, automatically ahead of the scheduled start time.

**Logger**
: The per-net role that assists NCS with logging check-ins and traffic. See [Roles and permissions](/docs/reference/roles-and-permissions/).

**NCS (Net Control Station)**
: The per-net role that runs the net. A net can have more than one active NCS at once; see 2nd NCS above and [Roles and permissions](/docs/reference/roles-and-permissions/) for who can hold it.

**Net**
: One radio session, with its own check-in list, chat, and log, moving through the lifecycle Draft, Scheduled, Lobby, Active, and Closed (or Cancelled, for one that never happens).

**Net manager**
: The account a net or a schedule belongs to, shown as **Net Manager** on its card and as **Schedule Manager** on a schedule's staff tab. Internally it is the record's owner, which is the word the API uses. It is a standing responsibility for the net series, not a job on the air: the manager holds the settings, receives the log, and is very often not the person running tonight's net as NCS. See [Roles and permissions](/docs/reference/roles-and-permissions/).

**Net staff**
: An operator listed on a schedule's "Authorized Net Staff" roster, distinct from being in the NCS rotation, though a person is often both. See [Roles and permissions](/docs/reference/roles-and-permissions/).

**Paused net**
: An active net with an NCS assigned, where every assigned-active NCS is currently absent (stepped away, checked out, or otherwise not present) with nobody covering. A net with no NCS assigned at all is not "paused"; that's simply an unstaffed net, a different and intentional situation.

**Radiogram**
: The ARRL's standard formal message format for amateur traffic handling: the classic numbered-preamble message form.

**Recheck**
: Not a status. What happens when a callsign already checked into the net checks in again, and by default a second row in the check-in list rather than an update to the first: the original check-in and the recheck both stay visible, with the recheck row carrying its own marker, unless "Hide duplicate rows" is turned on to show only the latest row per callsign. See [Station statuses](/docs/reference/station-statuses/).

**Relay**
: Both a per-net role (a station that checks in others NCS can't hear directly) and a station status (reporting yourself as relaying); see [Station statuses](/docs/reference/station-statuses/) for how the two interact.

**Rotation**
: The ordered list of operators a schedule cycles NCS duty through automatically, week to week.

**RRI strip**
: A short, fixed-field, slash-delimited message format published by Radio Relay International, used for things like structured weather observations (`WXOBS`), distinct from a full Radiogram, and imported/exported in its own compact form.

**Schedule**
: A recurring template (called a `NetTemplate` internally) that a net can be created from. The rotation, staff list, default settings, and recurrence rule all live on the schedule, not on any one net it produces.

**Traffic**
: Formal message handling (Radiograms, ICS-213s, and RRI strips) logged, relayed, and tracked through delivery on a net that has the traffic feature turned on. See [Emails we send](/docs/reference/emails/) for the reminder emails that come with it.
