---
title: Station coverage
summary: Recording who can hear whom during a net, reading the coverage table and map overlay, and what reaches the report and the closing email.
kind: How-to
audience: NCS, Logger, and Relay operators
owner: KC1JMH
revised: 2026-10-31
review_by: 2027-10-21
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-control/station-coverage/
---

# Station coverage

Station-to-station coverage logging records which checked-in stations can hear each other directly. It's built for the question every emergency communications plan eventually has to answer: if the repeater goes down tonight, who can still reach whom on simplex, and where do you need a relay? A monthly simplex drill that logs coverage answers that from real reports instead of guesses, and the answers pile up net after net.

It's off unless the net's manager turned on **Enable Station-to-Station Coverage Logging** in the net's or schedule's settings (see [Creating a net](/docs/net-managers/creating-a-net/)). On a net that has it, you'll see an ear icon at the end of each check-in row and a **Coverage** button in the toolbar.

## Who can record a report

- **NCS, Logger, and Relay** on this net can record a report for any station, as can the net's manager and an admin.
- **Each station can record its own**, from the **I hear** button, unless the manager also turned off **Allow stations to self-report**. That side is covered in [Reporting what you hear](/docs/operators/reporting-what-you-hear/).
- **Schedule staff who haven't taken a role on this net** can only record their own. To record for others, take NCS or Logger first by checking yourself in as one (see [Roles and stepping away](/docs/net-control/roles-and-stepping-away/)).

## Record a station's report

1. Ask the station, on the air, which stations it can hear.
2. Click the ear icon at the end of that station's row. A solid blue ear means the station already has a report; a faded one means it doesn't yet, which makes the rows still to do easy to spot down the list.

   <figure>
     <img src="/docs/img/net-control/can-hear-row-button.png"
          alt="The check-in list of a simplex drill. Each row ends in an ear icon, shown solid blue for stations that already have a report and faded for those that don't. W1PORT's faded ear icon is outlined in red.">
     <figcaption>A solid ear means that station's report has been taken. Faded means it's still to do.</figcaption>
   </figure>

3. Tick each station they name. Each station is listed at the place it's at now, so a report made after a station moved isn't credited to where it was. To tick one at an earlier place, for a report from earlier in the net, tick **Show earlier places**. For "everybody but W2FERN and N2OAKS", tick **All stations** at the top, then untick those two. **All stations** includes checked-out stations, because a station heard before it left was still heard; untick any that weren't.
4. Set **Operating Position** if they aren't at home. It starts at **Home**, and only Home reports reach the station's personal coverage map. On a drill with sites it starts at the station's site instead, and offers the sites first; see [Coverage drills by site](/docs/net-managers/coverage-drills/).
5. Click **Save**.

Saving replaces that station's previous report for that frequency. To correct one, open it again: the dialog shows what's already recorded. A checked-out station's row has no ear icon, since there's nobody left on the air to ask.

### On a net with more than one frequency

The dialog turns into a grid with one column per frequency, so a 2m and 80m comparison is recorded in one pass. Only the frequencies the net's manager left ticked under **Coverage reports** appear; repeaters and talkgroups are usually unticked, since everyone hears everyone through them. Each column has its own select-all box under its heading, and saving records every column, including any you left empty. The **Station** column stays in place while you scroll sideways through a long list of frequencies, and each station is listed once per place, even after it has rechecked on a second frequency. On a big drill, **Find a station** narrows the list by callsign or site, and **Show frequencies** shows one frequency's column at a time. Neither one changes what you've ticked: a hidden tick is still saved. While a search is on, the select-all box ticks only the stations shown.

<figure>
  <img src="/docs/img/net-control/can-hear-grid.png"
       alt="The Who can N1LAKE hear? dialog on a two-band net: one column of checkboxes for 3.930 SSB (80m) and one for 146.520 FM (2m), each with its own all-stations checkbox under the heading. On 80m every station is ticked, and that column's checkbox, outlined in red, is ticked too. On 2m only K1COVE is ticked and the column's checkbox shows a dash.">
  <figcaption>With more than one frequency, each frequency gets its own column and its own select-all box.</figcaption>
</figure>

## Read the coverage table

Click **Coverage** in the toolbar to open the **Station Coverage** panel. Anyone viewing the net can open it, not only staff, and it updates live as reports are saved.

<figure>
  <img src="/docs/img/net-control/coverage-panel.png"
       alt="The simplex drill's net page with the Station Coverage panel open on the right. Each row lists a reporting station, a Two-way or One-way chip, the station it heard, and when. Two-way rows have a green chip with a double arrow; one-way rows have a grey chip with a single arrow.">
  <figcaption>Two-way means both stations heard each other. One-way means only one direction is known.</figcaption>
</figure>

On a drill with sites, the panel opens on **By site** instead, which rolls the reports up by place; **Reports** switches to the table described here. The by-site view is covered in [Coverage drills by site](/docs/net-managers/coverage-drills/#reading-the-results).

Each row is one report: the **Reporter**, a **Two-way** or **One-way** chip, the **Heard Station**, and when it was reported. On a net with more than one frequency there's a **Frequency** column too.

- **Two-way** (green, double arrow) means each station heard the other on the same frequency, from the same places. Either both reported it, or one of them checked the other in on that frequency: a check-in net control logged on the air is a two-way contact, so it counts. Hover over the chip to see when it was a check-in. A station that checked itself in through the app doesn't count, since that went over the internet.
- **One-way** (grey, single arrow) means only one direction is known. It might be a genuinely one-way path, a big station and a small one, or it might just mean the other station hasn't been asked yet. Ask before you plan around it.

The panel's own buttons, left to right:

- **Search** filters the table to one callsign. It hides every other row, so clear it when you're done.
- **Click a callsign** in the table instead to highlight that station's rows without hiding anything; it highlights the station's lines on the map overlay as well. Click it again, or the clear-highlight button, to undo it.
- **Export to CSV** downloads exactly what the table is showing, filter included.
- **Show on map** opens the map with the coverage overlay already on.

If a report was saved against the wrong frequency, staff (and the station that made it) can fix it from the **Frequency** column's dropdown without redoing the report. Like Chat and the map, the panel can be floated or popped out into its own window; see [Multiple monitors and wide screens](/docs/net-control/multiple-monitors/).

## See it on the map

Open **Map**, then click the ear button at the top right of the map to turn on the coverage overlay. Every report becomes a line between the two stations: **solid amber** for a two-way path, **dashed grey** for one-way.

<figure>
  <img src="/docs/img/net-control/coverage-map-overlay.png"
       alt="The live check-in map of the simplex drill with the coverage overlay on, its ear button outlined in red at the top right. Solid amber lines join stations that heard each other; dashed grey lines show a station heard in one direction only.">
  <figcaption>The overlay draws every report as a line, so a gap in coverage shows up as a town with no lines to it.</figcaption>
</figure>

On a net with more than one frequency, a dropdown beside the ear button limits the lines to one frequency. A station with no location the map can place has no pin, so its lines aren't drawn; the table above still has every report.

## After the net

- **The closing email** includes a Station Coverage section listing each pair of stations, with two-way pairs shown once rather than twice. A drill with sites also gets a Coverage by Site section.
- **The net report** has a Station Coverage section with the same table, and a switch, **Include per-station coverage maps**, that adds one small map per reporting station to the report and its PDF. See [Reports and exports](/docs/net-managers/reports-and-exports/).
- **Each station's Profile > Coverage map** picks up every Home report about what that station heard, including the ones you entered for them.

## Next

The operator's side of this, including the personal map, is [Reporting what you hear](/docs/operators/reporting-what-you-hear/). For an exercise that tests places rather than operators, see [Coverage drills by site](/docs/net-managers/coverage-drills/). Turning it on for a net or a schedule is [Creating a net](/docs/net-managers/creating-a-net/).
