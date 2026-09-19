---
title: Logging check-ins
summary: Adding a station, editing a row in place, fixing a misheard callsign, and logging a station with no account.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/logging-check-ins/
---

# Logging check-ins

Whoever holds NCS, Logger, or Relay on a net can add a check-in for any callsign, edit one in place, or delete one outright. This page covers all three, plus the one case that trips people up: logging a station over the air that has never used ECTLogger at all.

## Adding a station who calls in over the air

The fastest way to log one more caller while you're already busy running the net is the same **Bulk add** box [Speed entry](/docs/net-control/speed-entry/) covers — it isn't only for entering a whole roster at once. Open it, type the callsign (and whatever else the net asks for), and submit. One line works exactly the same as fifty.

There's a second, narrower way in, worth knowing about because it's easy to miss: the toolbar's **Check in** button (see [The net control desk](/docs/net-control/the-net-control-desk/)) opens the same form [Checking in](/docs/operators/checking-in/) describes for participants — but it only appears on the toolbar while *your own account* has no active check-in on this net, and it pre-fills the callsign field with your own callsign, not a blank one. You can clear that field and type someone else's instead, which works fine, but once you've checked yourself in the button disappears from the toolbar entirely. In practice this means it's most useful right at the start of a net, before you've logged yourself in as NCS or Logger; after that, Bulk add is the tool for adding one more station.

On a phone or a narrow window, NCS and Logger also get an always-available collapsible **New Check-in** panel above the check-in list, which stays reachable regardless of your own check-in status.

## Editing a row in place

Click anywhere on a check-in's row — Callsign, Name, Location, whatever's shown — and it opens for inline editing right there in the table.

<figure>
  <img src="/docs/img/net-control/inline-edit-open.png"
       alt="A check-in row for KC1HILL open for inline editing, with the Callsign, Name, and Location cells replaced by text fields you can type into directly.">
  <figcaption>Click anywhere on a row to edit it in place. Enter or clicking away saves it; Escape cancels.</figcaption>
</figure>

- **Enter**, or clicking anywhere outside the row, saves your changes.
- **Escape** cancels and puts the row back the way it was.
- **Tab** moves between fields normally, so you can correct several fields in one pass without reaching for the mouse.

This is the tool for fixing a callsign you misheard, correcting a location, or updating anything else about a check-in after the fact — there's no separate "edit" mode or dialog to hunt for.

## Deleting a check-in

Each row has a delete action that asks you to confirm before it removes the row. This is a real delete, not a status change — use it for a genuine mistake (a duplicate entry, a callsign typed into the wrong net), not for a station leaving the net. A station that's done for the night should be checked out instead (see [Status, rechecks, and checking out](/docs/operators/status-and-checking-out/)), since checking out keeps their participation in the log and on the map; deleting removes the row entirely.

## Logging a station with no ECTLogger account

Not every station on the air has ever touched ECTLogger, and that's fine — a check-in doesn't require one. Type the callsign as given; if it doesn't match any registered account, the row is created as a **guest** check-in. Everything about it works the same as any other row: it can be edited, statused, and shown up in exports and the map exactly like an account-linked check-in.

The only things that are unavailable to a guest check-in are the things that genuinely depend on an account existing: there's no profile popup to click through to, and on an [authenticated net](/docs/net-control/authenticated-nets/) a guest check-in can never be identity-verified, because there's no TOTP secret behind it to check.

If the same guest callsign later creates an account and checks in again, that new check-in links to the account the normal way — the earlier guest rows stay exactly as they were logged, under the callsign, with no retroactive relinking.

## Rechecks

If a callsign that's already on the list checks in again, that's a **recheck**, not an error — it adds a second row rather than overwriting the first. [Station statuses](/docs/reference/station-statuses/) covers exactly how that shows up and how to collapse duplicate rows if you'd rather see one line per callsign.

## Next

[Speed entry](/docs/net-control/speed-entry/) covers logging a whole burst of callsigns at once, and [Frequencies and multiple net controls](/docs/net-control/frequencies-and-multi-ncs/) covers marking which frequency a station can reach on a net that runs more than one.
