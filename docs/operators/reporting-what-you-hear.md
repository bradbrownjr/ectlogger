---
title: Reporting what you hear
summary: Telling the net which other stations you can hear directly, why that matters when the repeater goes down, and the map of everyone you've heard from home.
kind: How-to
audience: Anyone checking into a net
owner: KC1JMH
revised: 2026-10-21
review_by: 2027-10-21
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/operators/reporting-what-you-hear/
---

# Reporting what you hear

On a repeater net, everybody hears everybody, because the repeater does the hearing for them. An emergency communications plan has to answer a harder question: when the repeater is down, who can still hear whom on simplex, and who will need a relay to get through? The only way to answer that is to ask the stations themselves, and write the answers down.

Some nets do exactly that. A net with **station-to-station coverage logging** turned on asks each station which other checked-in stations it can hear directly. Every report fills in part of the picture: net control sees it as a table and as lines on the map, and you get a map of your own of everyone you've heard from home.

Not every net uses this. If you don't see an **I hear** button after you check in, the net you're on isn't collecting coverage reports.

## Record what you can hear

1. Check into the net as usual. The button only appears once you're checked in.
2. Click **I hear** in the net toolbar. On a narrow screen it may have moved into the **More** menu at the end of the toolbar.

   <figure>
     <img src="/docs/img/operators/i-hear-button.png"
          alt="The right-hand end of the net toolbar once you are checked in: Just listening, then I hear outlined in red, then Check out.">
     <figcaption>I hear only appears on a net that has coverage logging turned on.</figcaption>
   </figure>

3. Tick every station you can hear. The list is everyone else in the net, including stations that have already checked out (they're greyed out, and sorted last).
4. Check **Operating Position**. It starts at **Home**; change it to **Field Deployed**, or type your own, if you're not operating from your usual station.
5. Click **Save**.

### "Everybody but..."

The most common report on a simplex net is "I can hear everybody except two." For that, tick **All stations** at the top of the list, then untick the ones you can't hear. Clicking **All stations** again clears everything.

<figure>
  <img src="/docs/img/operators/i-hear-select-all.png"
       alt="The Who can KC1HILL hear? dialog. All stations, outlined in red at the top, shows a dash because most stations are ticked. Below it every station is ticked except W2FERN and N2OAKS. W1MILL is ticked and greyed out, marked checked out. The Operating Position field reads Home, above Cancel and Save.">
  <figcaption>"Everybody but W2FERN and N2OAKS" is three clicks: All stations, then the two you didn't hear.</figcaption>
</figure>

**All stations** includes checked-out stations too. A station that checked out after you heard it was still heard, and the report should say so. If you didn't hear one of them, untick it like any other.

While only some stations are ticked, the **All stations** box shows a dash instead of a tick.

## The parts that surprise people

**Saving replaces your last report, it doesn't add to it.** The dialog opens with your previous answers already ticked. Change what's different and save again; whatever is unticked when you save is removed.

**Reports are per frequency.** On a net with one frequency, a **Frequency** box at the top shows which one you're reporting on. On a net with several, the dialog becomes a grid with one column per frequency, so you can say you hear a station on 2m but not on 80m. Each column has its own select-all box under its heading. Repeaters and talkgroups usually aren't offered: everyone hears everyone through them, so they say nothing about who can hear whom directly.

**Net control can record it for you.** If you'd rather say it on the air ("KC1HILL, I hear everybody but W2FERN and N2OAKS"), net control, the Logger, or a Relay can tick the boxes for you from your row. That counts exactly the same, including on your own map below. It's also the only way to report on a net that has turned self-reporting off: you won't see **I hear** there at all.

**Everyone viewing the net can see the reports.** Coverage is part of the net's log, the same as the check-in list. Your personal map, below, is only yours.

**One-way isn't an accusation.** When you report hearing a station and they haven't reported hearing you yet, net control sees that pair marked **One-way**. It often just means the other station hasn't been asked.

## On a drill at a shelter or an office

Some exercises, such as the ARES Simulated Emergency Test, send teams to shelters and offices to find out which places can reach each other. On a net like that:

- **Pick your site when you check in.** The **Location** box offers the net's sites. If your team moves to another site, check out and check in again from the new one, so each site keeps its own results.
- **Operating Position starts at your site.** Your reports from a site never reach your personal map below, which is only for home.
- **Repeaters and nodes** asks whether you got into each one: **Reached**, **Couldn't reach**, or **Didn't try**. If you couldn't, a few words in the note on why (a basement room, a low antenna) is the most useful thing you can add.
- **Outside the net** is for stations you reached that never checked in, such as another county's EOC. Fill in their county; that's how the exercise counts which counties it reached.

## Your coverage map

**Profile > Coverage** shows every station you've heard from home, across every net you've taken part in, on one map.

<figure>
  <img src="/docs/img/operators/profile-coverage-map.png"
       alt="The Coverage tab of the Profile page, headed Your Home Station Coverage, with a map of the lakes region and coast of southern Maine showing a marker for each station KC1HILL has heard from home, and a note below that the map only shows stations they heard.">
  <figcaption>Every station you've heard from home, across every net, on one map.</figcaption>
</figure>

- **Only Home reports are mapped.** A report with your operating position set to **Field Deployed** says something about that location for one night, not about your station, so it's left out. Anything containing the word "home" counts.
- **It's what your station heard, whoever entered it.** Reports you saved yourself and reports net control saved for you both appear. What other stations heard never does, and neither do nets you didn't take part in.
- **Markers are colored by band**, and a station heard on more than one band blends the colors. Hover over a marker for the callsign, the bands, and when you last heard it. Click or tap it for how many nets confirmed it on each band.
- **A faded marker hasn't been reconfirmed in 90 days.** Propagation changes, antennas come down, and an old report shouldn't look as certain as last week's.
- **A station needs a location ECTLogger can place.** A station that never gave one, or gave one the map can't read, isn't plotted. See [Your location and the map](/docs/operators/location-and-the-map/) for what it can read.

## Next

[Your location and the map](/docs/operators/location-and-the-map/) covers giving your own location, which is what puts you on everyone else's coverage map. Net control's side of this is [Station coverage](/docs/net-control/station-coverage/).
