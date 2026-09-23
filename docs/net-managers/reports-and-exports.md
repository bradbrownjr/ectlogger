---
title: Reports, ICS-309, and exports
summary: The net report, the PDF, the ICS-309 Communications Log, the per-section images, and who automatically receives what.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-09-23
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/reports-and-exports/
---

# Reports, ICS-309, and exports

A closed net's toolbar carries four separate downloads, plus a fifth page of its own. None of them require reopening the net, and none of them affect the record — pulling a copy a second time doesn't re-send anything.

<figure>
  <img src="/docs/img/net-managers/net-export-toolbar.png"
       alt="Four toolbar buttons on a closed net: Export, ICS-309, ICS-309 PDF, and Report, with Report outlined in red.">
  <figcaption>Export and both ICS-309 buttons download a single file; Report opens the full multi-section report page.</figcaption>
</figure>

- **Export** downloads the raw check-in list as a CSV: every field the net collected, one row per check-in event (including rechecks), in the timezone your own profile prefers.
- **ICS-309** downloads the check-in and chat log formatted as an official ICS-309 Communications Log, as a CSV.
- **ICS-309 PDF** downloads the same log as a form-accurate, printable PDF.
- **Report** opens the full **Net Report** page, described below.

ICS-309 export is available on any closed net regardless of whether that net turned on the **Enable ICS-309 Communications Log format** toggle — that toggle only decides whether the automatic closing email uses ICS-309 formatting. The toolbar buttons here are a manual download either way.

### Keeping spam out of the record you hand to a served agency

The ICS-309 log is the copy that leaves your group and reaches a served agency, so it needs to stay clean even when a check-in doesn't. Under **ARES & EmComm Features** when creating or editing a net, **Hide muted stations from ICS-309** is on by default: once net control net-mutes a station for spam or disruption, that station's chat messages are left out of every ICS-309 output — the CSV, the PDF, and the automatic closing email — without deleting anything from the net's own chat log. Nothing else about the net record changes: the station's check-in still appears, and the plain check-in export and net-log email are unaffected. Muting a station is done from the chat panel; see [Net control](/docs/net-control/) for how.

## The net report page

<figure>
  <img src="/docs/img/net-managers/net-report-header.png"
       alt="The Net Report page's header with three buttons: Export PDF outlined in red, Export PNG, and View Net.">
  <figcaption>The report page needs no sign-in, so the link is safe to hand to anyone who needs the record. Export PNG saves each section as its own image for a newsletter or social post.</figcaption>
</figure>

This page pulls together everything about the net into one document: check-in statistics, a map, station-to-station coverage (if the net used it), the full chat and activity log, and the ICS-309 log, all in one place. **Export PDF** saves the whole thing as one file. **Export PNG** instead saves each section as its own image, sized for pasting into a newsletter or a social media post, rather than one long page. Each image carries a small footer crediting ECTLogger with the site's address, so anyone who sees the post knows where it came from.

This page needs no sign-in to view — callsign and licensee information are already public via the FCC's own license database, and free-text fields are redacted for a signed-out viewer the same way the check-in list and chat already are. That makes the link safe to hand to an emergency coordinator, a club newsletter editor, or anyone else who needs the record but doesn't have (or need) an ECTLogger account.

## Who automatically gets the closing log by email

When a net closes, ECTLogger emails the log to:

- the net's **manager**, if their own notification preferences have net-close emails on;
- anyone explicitly **subscribed** to the schedule the net came from, with the same preference on;
- and every **active NCS, Logger, or Relay on that net itself**, again subject to their own preference — so staff who ran the net get a copy even if they never separately subscribed to the schedule.

Each recipient gets ICS-309 formatting if either the net turned it on or that recipient's own profile prefers it.

## Related

The export used to hand a net's radiograms and RRI/weather strips to a receiving station is covered in the traffic pages under [Net control](/docs/net-control/). Bringing a net's history in from outside ECTLogger, rather than exporting one out, is [Importing check-ins](/docs/net-managers/importing-check-ins/).
