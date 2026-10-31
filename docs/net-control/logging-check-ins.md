---
title: Logging check-ins
summary: Adding a station, editing a row in place, fixing a misheard callsign or a missed frequency, marking a channel offline, checking someone in in person, removing and blocking a station that shouldn't be on the net, and logging a station with no account.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-10-31
review_by: 2027-10-23
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/logging-check-ins/
---

# Logging check-ins

Whoever holds NCS or Logger on a net can add a check-in for any callsign, edit one in place, or delete one outright. This page covers all three, plus the one case that trips people up: logging a station over the air that has never used ECTLogger at all.

## Adding a station who calls in over the air

The fastest way to log one more caller while you're already busy running the net is the same **Bulk add** box [Speed entry](/docs/net-control/speed-entry/) covers, and it isn't only for entering a whole roster at once. Open it, type the callsign (and whatever else the net asks for), and submit. One line works exactly the same as fifty.

There's a second, narrower way in, worth knowing about because it's easy to miss: the toolbar's **Check in** button (see [The net control desk](/docs/net-control/the-net-control-desk/)) opens the same form [Checking in](/docs/operators/checking-in/) describes for participants, but it only appears on the toolbar while *your own account* has no active check-in on this net, and it pre-fills the callsign field with your own callsign, not a blank one. You can clear that field and type someone else's instead, which works fine, but once you've checked yourself in it becomes **Edit check-in**, which reopens the form for your own row only (see [Fixing your check-in](/docs/operators/checking-in/#fixing-your-check-in)). In practice this means it's most useful right at the start of a net, before you've logged yourself in as NCS or Logger; after that, Bulk add is the tool for adding one more station.

On a phone or a narrow window, NCS and Logger also get an always-available collapsible **New Check-in** panel above the check-in list, which stays reachable regardless of your own check-in status.

When you type a callsign into the check-in form and move on to the next field, ECTLogger fills in that station's Name, Location, and Spotter # from their profile. Anything their profile leaves blank, or everything if they have no account, comes from what net control entered for them last time. A station using location awareness gets the town its GPS position is in, such as `Waterboro, ME`, rather than a grid square; hover over the location in the check-in list to see the grid. If you correct the callsign, the new station's details replace the ones filled in for the old one, but anything you typed yourself is left alone. Only fields this net shows are ever filled. A field the net has turned off is never filled in or sent, so something in a station's profile you can't see can never stop you from saving the check-in.

On a net with [sites](/docs/net-managers/sites/), the form has a **Site** box ahead of Location for where the station is tonight: a shelter, Home, Field Deployed, or Traveling. [Stations at sites](/docs/net-control/stations-at-sites/) covers it, and what happens when a station checks in from somewhere new.

## Spotting stations who check themselves in

While you're running a net by voice, stations can also check themselves in from the app without calling. So you don't miss them, a station's own check-in flashes its row gold for a couple of seconds when it arrives. A check-in you or another logger typed in doesn't flash, and neither does your own.

If the new row lands outside the part of the list you can see, a round arrow button appears at the top or bottom edge of the list, pointing toward it. Click it to scroll the station into view; it goes away once you've seen the row.

Every viewer sees the flash, not just net control, and nothing flashes when you first open or reload the net.

### Who's online

A station with an ECTLogger account has a small dot on its avatar: green while they have the net open, grey when they don't. A station with no dot has no account, such as a station you logged by voice, so it has no profile to open. Click an avatar for that station's profile popup; see [Your account and profile](/docs/operators/account-and-profile/#what-other-people-see-about-you).

## Editing a row in place

Click anywhere on a check-in's row (Callsign, Name, Location, whatever's shown) and it opens for inline editing right there in the table.

<figure>
  <img src="/docs/img/net-control/inline-edit-open.png"
       alt="A check-in row for KC1HILL open for inline editing, with the Callsign, Name, and Location cells replaced by text fields you can type into directly.">
  <figcaption>Click anywhere on a row to edit it in place. Enter or clicking away saves it; Escape cancels.</figcaption>
</figure>

- **Enter**, or clicking anywhere outside the row, saves your changes.
- **Escape** cancels and puts the row back the way it was.
- **Tab** moves between fields normally, so you can correct several fields in one pass without reaching for the mouse.

This is the tool for fixing a callsign you misheard, correcting a location or a site, or updating anything else about a check-in after the fact. There's no separate "edit" mode or dialog to hunt for. A corrected callsign also moves the row to that station's account, or makes it a guest row if the new callsign has none, so a station first logged with a typo can still be made NCS or Logger from the list.

The one exception is the station's round picture (its avatar) beside the callsign. Clicking that opens the station's profile instead, so you can look someone up without opening the row for editing.

### Fixing a station's frequency

On a net with more than one frequency, opening a row for editing also opens two boxes under it:

- **Checked in on** is the frequency the station called in on.
- **Also reachable on** is every frequency the station can be reached on.

<figure>
  <img src="/docs/img/net-control/frequency-edit-open.png"
       alt="KC1HILL's check-in row open for editing, with two boxes outlined together in red on a row beneath it: Checked in on, showing the frequency the station called in on, and Also reachable on, listing every frequency the station can be reached on.">
  <figcaption>On a net with more than one frequency, editing a row also lets you fix its frequencies.</figcaption>
</figure>

Use them when a station was logged without the right frequency, for instance when nobody picked one at check-in. Choosing a **Checked in on** frequency adds it to **Also reachable on** as well. A net with only one frequency has nothing to choose between, so the boxes don't appear there.

### A station's channels

On a net with more than one frequency, each station's row has a chip for every channel it has at its place:

- **Filled** means the station checked in on that channel, so it has been worked both ways.
- **Outlined** means the station listed it under **Also reachable on** but hasn't checked in on it yet.
- **Struck through, with a dashed edge** means net control marked it offline. Hover over it for the time.

The radio icon is on the channel of the station's newest check-in.

When a station loses a channel, such as a repeater going down or a radio that quit, click its chip and choose **Mark offline**. When it's back, click it again and choose **Back online**. The chat records both. A channel marked offline stays on the row, because it's still part of what happened tonight.

## Checking someone in in person

Someone can be part of a net without being on the air: staff at the EOC or a shelter during an exercise or incident, who signed in at the door rather than over the radio. Give their check-in the **In person** status, a standing figure. Their row is tinted and has no frequency, so net control knows not to call them on the air. In [Bulk add](/docs/net-control/speed-entry/), end the line with `:ip`.

Changing a check-in to In person removes its frequency. Changing it back to another status on a net with one frequency puts the station on that frequency again. On a net with several, choose it in the row's editor as above.

## Deleting a check-in

Each row has a delete action that asks you to confirm before it removes the row. When the station has checked in more than once at that place, the row's delete removes all of those check-ins; to remove just one, open the row's timeline (see [Rechecks](#rechecks)) and use the delete beside that check-in. This is a real delete, not a status change, so use it for a genuine mistake (a duplicate entry, a callsign typed into the wrong net), not for a station leaving the net. A station that's done for the night should be checked out instead (see [Status, rechecks, and checking out](/docs/operators/status-and-checking-out/)), since checking out keeps their participation in the log and on the map; deleting removes the row entirely.

### Removing and blocking a station

Sometimes a station checks in that shouldn't be on the net at all, such as someone who isn't part of a drill checking into its [participants-only](/docs/net-managers/creating-a-net/#basic-info) net. Deleting the row doesn't stop them checking straight back in, so the delete prompt offers a second button:

1. Click the station's delete action.
2. Click **Remove and block**.

ECTLogger then:

- removes every check-in under that callsign from this net,
- mutes the station's chat for everyone on the net (see [Chat moderation](/docs/net-control/chat-moderation/#muting-a-station-for-everyone)),
- refuses the station's own check-ins on this net from then on, under that callsign or any other on the same account, with "Net control has removed this station from this net."

You can still check the station in yourself if it turns out to belong. A block only covers this one net: the schedule's next net starts clean.

To lift a block, open **Net info** on the toolbar. Net control sees a **Blocked from this net** list there; click **Unblock** beside the callsign. That also lifts the chat mute. The removed check-ins don't come back.

Removing and blocking is for the net's NCS and Logger, its manager, and admins.

## Logging a station with no ECTLogger account

Not every station on the air has ever touched ECTLogger, and that's fine; a check-in doesn't require one. Type the callsign as given; if it doesn't match any registered account, the row is created as a **guest** check-in. Everything about it works the same as any other row: it can be edited, statused, and shown up in exports and the map exactly like an account-linked check-in.

When a station relays a check-in for someone net control can't hear, type the relay's callsign in the **Relayed By** box on the check-in row. The box is there on a net whose manager turned the field on. On any other net it appears as soon as one station is set to **Relay** from its status menu, so set the relay station first.

A guest check-in can be marked NCS, Logger, or Relay from its status menu, the same way as any other row. This is how a Logger who runs the net in the app credits the net control operator on the air when that operator has no account: pick **NCS** on their row, and the report, the ICS-309, and the closing log name them as Net Control. The role is a credit only. It doesn't give anyone access to anything, because there's no account to give it to. The people who can do this are the same ones who can use the net's **Roles** button. Picking a plain status for that row again removes the role.

The things that are unavailable to a guest check-in are the ones that genuinely depend on an account existing: their profile popup has no account details such as a website link, and on an [authenticated net](/docs/net-control/authenticated-nets/) a guest check-in can never be identity-verified, because there's no TOTP secret behind it to check.

If the same guest callsign later creates an account and checks in again, that new check-in links to the account the normal way. The earlier guest rows stay exactly as they were logged, under the callsign, with no retroactive relinking. Editing a row's callsign is the one thing that links it to an account after the fact. A role given to the guest row is the exception: on a net from a schedule, the credit moves to their account once they take over their spot on that schedule's team (see [Net staff and the NCS rotation](/docs/net-managers/net-staff-and-rotation/)).

If you fix a guest row's callsign, a role on it follows the correction. If the corrected callsign has an account, the role becomes a real one only when you're someone who can use the net's **Roles** button; otherwise it's dropped, and that station can be given a role the usual way.

## Rechecks

If a callsign that's already on the list checks in again, that's a **recheck**, not an error. Each recheck is logged as its own check-in with its own time, but the list keeps one row per station per place: a station that checks in on the repeater and again on simplex from the same shelter is one row, with a chip for each channel (see [A station's channels](#a-stations-channels)).

A station that has checked in more than once there has a small arrow beside its number. Click it to open the row's **timeline**: every check-in, oldest first, with the channel each was on, and any channel marked offline or back online in between.

A station that moves gets a new row at its new place, and on a net with sites the old one is checked out; see [Stations at sites](/docs/net-control/stations-at-sites/#when-a-station-moves). [Station statuses](/docs/reference/station-statuses/#recheck-is-not-a-status) covers how rechecks show up.

The counters at the top of the net count each callsign once, whatever its rechecks: **Checked Out** plus **Checked In** is every station that has taken part, and **Rechecks** counts the extra rows.

## Next

[Speed entry](/docs/net-control/speed-entry/) covers logging a whole burst of callsigns at once, and [Frequencies and multiple net controls](/docs/net-control/frequencies-and-multi-ncs/) covers marking which frequency a station can reach on a net that runs more than one.
