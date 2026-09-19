---
title: Speed entry syntax
summary: Exactly what the Bulk add box accepts, in the order it accepts it.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/speed-entry-syntax/
---

# Speed entry syntax

The button that opens this box is labelled **Bulk add** (tooltip: "Bulk add multiple check-ins"), not Speed Entry, though "speed entry" is what long-time operators tend to call it and you'll hear both. It's in the net toolbar, visible to NCS and Logger once the net is in lobby or active and has at least one check-in.

<figure>
  <img src="/docs/img/net-control/toolbar-speed-entry.png"
       alt="The net control toolbar, with the leftmost button, labelled &quot;Bulk add&quot;, outlined in red. The rest of the row reads Search, Map, Traffic, Announcements, Notes, Topics, Stats, Import, Edit net, Roles, Role: NCS, Step away, Just listening, Check out, Close net.">
  <figcaption>The Bulk add button, leftmost in the net control toolbar.</figcaption>
</figure>

## The format

One line of text can hold any number of check-ins. Separate check-ins with a semicolon:

```
KC1HILL, Priya Nandan, Portland ME; N1LAKE, Marcus Ellery, Kennebunk ME
```

Within one check-in, separate fields with commas, in this exact order:

1. **Callsign** — always first, the only required field.
2. **Name**, if the net has Name enabled (on by default).
3. **Location**, if the net has Location enabled (on by default).
4. **Spotter #**, if the net has it enabled.
5. **Weather Observation**, if the net has it enabled.
6. **Power Src**, if the net has it enabled — entered here as a plain field with no label of its own, right after Weather Observation.
7. **Feedback**, if the net has it enabled.
8. **Notes**, if the net has it enabled.
9. Any admin-defined custom fields the net has enabled, in the order the admin panel lists them.

Only fields the net actually has turned on take a slot in the line — a net with just Name and Location enabled (the default) only has three positions: callsign, name, location. Check the net's own Check-In Fields settings, or watch the "Format:" line the box shows live above where you type, to see the exact order for that net. See [Check-in fields](/docs/reference/check-in-fields/) for what each field is and how a net turns one on.

**The separate "Power" (wattage) field cannot be entered through Bulk add.** Only Power Src has a slot in the line, described above. If a net needs the wattage recorded, add it with Notes or after the fact through the check-in table.

## Status shortcuts

Add a colon and a one- or two-letter code at the end of a check-in to set anything other than the default Standard status:

<div class="table-scroll" markdown="1">

| Shortcut | Status |
|---|---|
| `:jl` | Listening |
| `:r` | Relay |
| `:t` | Has traffic |
| `:a` | Announcements |
| `:m` | Mobile |
| `:o` | Checked out |

</div>

Leave the shortcut off for a normal Standard check-in. See [Station statuses](/docs/reference/station-statuses/) for what each status means on the air.

## A complete example

```
KC1HILL, Priya Nandan, Portland ME; N1LAKE, Marcus Ellery, Kennebunk ME:r; N1ROVE, Chris Baumann, Route 302 near Fryeburg ME:m
```

This adds three stations: Priya as a standard check-in, Marcus marked Relay, and Chris marked Mobile.

## What happens on submit

- Each check-in in the line is submitted one at a time; a bad entry doesn't stop the good ones. The result toast reports how many succeeded, how many failed, and the first few error messages.
- Callsigns are uppercased automatically and checked against the same format every check-in requires (letters, digits, and `/` only). An invalid callsign fails that one entry without touching the rest of the line.
- Ctrl+Enter submits without reaching for the mouse.
- While the box is open, every other viewer of the net sees a brief "check-ins may arrive in bursts" notice below the check-in table, so a wall of new rows appearing at once doesn't look like something broke.
