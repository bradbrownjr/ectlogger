---
title: Station statuses
summary: All eight station statuses, what each looks like on the check-in list, and what it does to the map.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/station-statuses/
---

# Station statuses

A station's status is the icon and word shown in the Status column of the check-in list. It is set when a station checks in, and can be changed at any time (by the station itself, or by NCS/Logger) while the net is active.

There are exactly eight. This list is read directly from `StationStatus` in the application's data model, not written from memory. The guide this page replaces invented a ninth ("Available") and left out four real ones.

<div class="table-scroll" markdown="1">

| Icon shown | In the legend | In the dropdown | Means on the air | Plotted on the map | Also affects |
|---|---|---|---|---|---|
| A green checkmark | Standard | Checked in | Checked in and available | Yes | Default status; also the icon shown for a role holder (NCS, Logger, Relay) who has no other status set |
| An ear | Listening | Listening only | Monitoring only, not transmitting | Yes | — |
| A satellite dish | Relay | Relay | Can relay stations NCS cannot hear | Yes | Also a per-net role (see [Roles and permissions](/docs/reference/roles-and-permissions/)); the role badge takes priority over this status when both apply |
| A pause symbol | Away | Away | Temporarily away, will return | Yes | — |
| A siren | Traffic | Has traffic | Has traffic or an emergency to report | Yes | Shows the traffic icon in the toolbar for NCS/Logger if traffic handling (see [Glossary](/docs/reference/glossary/)) is enabled on the net |
| A megaphone | Announce | Announcements | Has announcements to share | Yes | — |
| A car | Mobile | Mobile | Mobile station, may only be available briefly | Yes | Sorted above chronological order unless the net's manager has turned mobile-priority sort off. It is on by default |
| A waving hand | Out | Checked out | Checked out of net | **Yes** | Excluded from the "currently on frequency" count, but not from the map or the log |

</div>

Two columns, because ECTLogger genuinely uses two sets of words for the same eight things. The legend under the check-in list is written short to fit on one line ("Standard", "Traffic", "Out"); the status dropdown and the net report spell them out ("Checked in", "Has traffic", "Checked out"). They are the same statuses. Nothing changes but the wording.

A CSV export is a third form again: it writes the internal names, `checked_in`, `listening`, `relay`, `away`, `has_traffic`, `announcements`, `mobile`, and `checked_out`. Those are what the API uses too. No screen ever shows them.

## Checked-out stations are still plotted

This is the one rule on this page most worth getting right: **checking out does not remove a station from the map.** The map, the net report, and the statistics page all record who took part in the net, not who is still on frequency at this exact second. A station that checked in, held traffic, and checked out twenty minutes before the net closed is exactly as real a participant as one still on frequency when NCS closes down, and every map in the app treats it that way.

If a station is missing from the map, the reason is almost always that its Location field could not be parsed or geocoded, not that it checked out. See [Location formats](/docs/reference/location-formats/) for what the map can and cannot read.

## Recheck is not a status

A recheck is what happens when a callsign that is already checked into the net checks in again. There is no `recheck` value in the list above because it isn't a station's status, it's a description of what just happened. It is a genuinely new row, though, not an update to the existing one. By default, the check-in list shows **both** rows: the original check-in and the recheck, each with its own timestamp. The recheck row carries the Recheck marker in place of its normal Standard checkmark; the original row is untouched and keeps showing whatever status it already had.

If you'd rather see one row per callsign, the check-in list has a **"Hide duplicate rows"** toggle (off by default, remembered per browser) that shows only the most recent row for each callsign and hides the earlier ones. Turning it off again (its tooltip reads "Show all rows (including re-checks)") brings every row back, recheck history included.

What matters is understanding that "Recheck" is a marker on one specific row describing what just happened to that callsign, not a ninth entry in the status list above, and not something that quietly replaces an earlier row unless you've asked the list to collapse them.

## The legend mixes three different things

The check-in list has a Legend bar above the table, and it does not exclusively list statuses. It combines three different kinds of information in one row:

- **Per-net roles**: NCS, 2nd NCS, and Logger. These are not statuses at all; they describe who is running the net, not what a station is currently doing. See [Roles and permissions](/docs/reference/roles-and-permissions/).
- **Station statuses**: Standard, Listening, Relay, Away, Traffic, Announce, and Out, the eight values in the table above (Relay appears as both a role and a status, since a station can hold the Relay net role or simply report itself as relaying).
- **The Recheck marker**, which is neither a role nor a status, as explained above.

This is the source of most confusion about statuses in the older documentation, including the invented "Available" status and the missing "2nd NCS" role. If something on the legend doesn't fit the status table on this page, it's a role or the recheck marker, not a ninth status.

<figure>
  <img src="/docs/img/reference/check-in-legend.png"
       alt="The check-in list legend, reading left to right: NCS (a crown), 2nd NCS (a second crown), Logger (a clipboard), Standard (a check mark), Recheck (two arrows in a circle), Listening (an ear), Relay (a satellite dish), Away (a pause symbol), Traffic (a siren), Announce (a megaphone), and Out (a waving hand), followed by a note that a blue highlight marks a station on the net's active frequency and that clicking a row opens inline editing.">
  <figcaption>The legend above the check-in list. It mixes three different kinds of thing in one row: net roles, station statuses, and the Recheck marker.</figcaption>
</figure>

## "2nd NCS" is real, but it isn't a role you assign

"2nd NCS" appears in the legend with the tooltip "2nd NCS - assists primary Net Control Station." It is how the check-in list marks any additional active NCS beyond the first one assigned. There is no separate assignable role called "2nd NCS"; every NCS holds the exact same `NetRole` value of `NCS`. The list simply shows the first-assigned active NCS with a crown and every other simultaneously active NCS with a second, smaller crown, for as long as the first one is still checked in.

Multiple simultaneously active NCS is a normal, supported pattern (a multi-desk exercise with several stations each running their own frequency, for example), not an error state; see [Roles and permissions](/docs/reference/roles-and-permissions/) for who can become NCS and when.

## Custom fields don't add statuses

An admin can add custom check-in fields (see [Check-in fields](/docs/reference/check-in-fields/)), but a custom field is data on a check-in, never a new entry in the Status dropdown. The eight statuses above are fixed by the application; only an ECTLogger code change adds a ninth.
