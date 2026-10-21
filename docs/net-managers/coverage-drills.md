---
title: Coverage drills by site
summary: Setting up a drill that tests where you can reach, not who, such as an ARES Simulated Emergency Test. Sites, primary offices, repeaters and nodes, and the results afterward.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-10-21
review_by: 2027-10-21
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/coverage-drills/
---

# Coverage drills by site

A routine simplex drill asks **who** can hear whom. An exercise such as the ARES Simulated Emergency Test asks **where**: teams go out to shelters, a weather office, and the emergency management offices, and the question is whether each of those places can reach the offices that matter. Next year a different operator will sit in the same shelter, so the result belongs to the place.

Give the net a list of sites and ECTLogger answers that question as reports come in. Each site is checked against the offices you star as primary, the repeaters and nodes each site could get into are kept with a note saying why not, and stations reached outside the net are counted by county.

This builds on station-to-station coverage logging. If you haven't used that yet, [Station coverage](/docs/net-control/station-coverage/) explains the reports this page rolls up.

## Before you start

You need to be able to edit the net: its manager, its schedule's manager or a co-manager, or an admin. Sites belong to one net, so for a drill that runs from a recurring schedule, add them to the net that schedule creates, from that net's **Edit**.

## Set up the sites

1. Open the net's settings (**Edit** on the net, or the form when creating it) and go to **Basic Info**.
2. Under **ARES & EmComm features**, turn on **Enable Station-to-Station Coverage Logging**. The **Sites** list appears under it.
3. Click **Add site** and type the site as one line: **Name, Town, ST**, such as `Naples Shelter, Naples, ME`, or a name followed by a grid square, such as `Gray Weather Office FN43rv`. The line underneath shows how it was split. If it says no place was found, add a comma before the town.
4. Pick the site's **Type**:
   - **Official office**, for an emergency management office, an EOC, or the weather office.
   - **Shelter**, **Point of distribution (POD)**, **Staging area**, or **Hospital**, for the places teams deploy to.
   - **Other**, for anywhere else a team operates from.
   - **Repeater or node**, for a repeater, a packet node, or anything else teams try to get into. See [Repeaters and nodes](#repeaters-and-nodes) below.
5. Click the star beside each office every other site should be able to reach, usually the county and regional offices. These are the **primary** sites, and the results are measured against them.
6. Leave **Supported** ticked on each site your teams will staff. A site you add by hand starts ticked.
7. Click **Save**.

<figure>
  <img src="/docs/img/net-managers/coverage-sites-editor.png"
       alt="The Sites list under coverage logging in the net's settings, with a search box, a type filter and an Import button above it. Each row has the site typed as one line, such as Naples Shelter, Naples, ME, then its type, a Primary star and a Supported tick. Naples Shelter is opened to show its address, its notes, and the columns kept from the EMA's list: emergency and long-term capacity, generator, and plan status. Its Supported tick is outlined in red. The schools and PODs further down, imported from the EMA's lists, are not ticked.">
  <figcaption>Tick Supported for the sites your teams staff. Open a site to see its address, notes and the rest of its row from the EMA's list.</figcaption>
</figure>

Open a site with the arrow at the end of its row to add its address, latitude and longitude, and notes such as a point of contact or how to get in. Latitude and longitude, when you have them, place the site on the map exactly.

Removing a site takes the stations placed at it off that site; their reports are kept.

### Import an emergency management agency's site list

An emergency management agency (EMA) keeps its shelters and points of distribution in a spreadsheet, and each agency lays its list out differently. Instead of typing hundreds of sites, import the list and tell ECTLogger which column is which.

1. Save the net first. Importing needs a saved net.
2. Under **Sites**, click **Import** and choose the file: Excel (.xlsx) or CSV, up to 5 MB.
3. If the workbook has more than one sheet, pick the **Sheet**. If the list has a title above its headings, check that **Headings are on** names the row with the column headings.
4. Under **Columns**, check what each field was matched to, and change any that are wrong. Only **Name** is required. The town and state become the site's place; if the list has no state column, type it in **State for every site**.
5. Choose the **Type for every site**, such as **Point of distribution (POD)**. Import a shelter list and a POD list one at a time so each gets its own type.
6. Leave **Our teams staff every site on this list** unticked for an agency's full list. You'll tick **Supported** on the sites you staff afterward.
7. Check the preview and click **Import**. The sites are added to the list on the form; click **Save** to keep them.

<figure>
  <img src="/docs/img/net-managers/coverage-sites-import.png"
       alt="The Import sites dialog with a CSV of points of distribution loaded. Headings are on row 2, under the list's title. The columns are matched as Name to SITE NAME, Address to LOCATION, Town to CITY, Latitude to LAT., Longitude to LONG. and Notes to POC, Notes, with ME typed as the state for every site. Type for every site, outlined in red, is Point of distribution (POD), and Our teams staff every site on this list is unticked. The preview reads 6 sites read: 4 new, 2 already on the net's list will be updated, and shows the first five with their place, address and coordinates.">
  <figcaption>Match the list's columns, choose its type, and check the preview before importing.</figcaption>
</figure>

Every other column, such as capacity, generator, or plan status, is kept with its site and shown when you open the site. Importing a newer copy of the same list updates the sites already there, matched by name and town, and keeps their star, their **Supported** tick, and the stations checked in at them. A net holds up to 500 sites. Use the search box and the **Type** filter to find one.

### Who sees the sites

An agency's list of possible shelters is not public: a shelter on a published list reads as an open shelter, and in a real event some won't be. So:

- **Net staff** see every site, with its address, notes, and the other columns. That's the net's manager, its schedule's manager and staff, an admin, and anyone acting as NCS, Logger, or Relay.
- **Everyone else** sees only the sites in use: ticked **Supported**, starred as primary, a repeater or node, or with a station checked in there. They see the site's name and place, never its address, notes, or other columns.

Only sites in use appear in the coverage results, the report, and the closing email. If a team turns up at a site you didn't tick, net control can check them in there, which puts it in use.

### Leave repeaters and talkgroups out of the reports

On the **Communication Plan** tab, a coverage net lists its frequencies under **Coverage reports**. Untick every repeater and talkgroup. Through a repeater everyone hears everyone, so only direct frequencies say which places can reach each other. An unticked frequency stays on the net for check-ins, chat, and traffic; it just isn't offered when someone records who they can hear. A schedule has the same list, and the nets it creates inherit it.

### Repeaters and nodes

Whether a shelter can get into the county repeater is a different question from whether it can hear another shelter, and the answer is often more useful. A site can reach the EOC on 2m simplex and through the VHF repeater, but not the UHF repeater on the same building, or send Winlink on simplex but not reach the packet node, because the two antennas sit at different heights on the tower.

Add each one as a site of type **Repeater or node**. Instead of a star it has an optional **Frequency**, so the results say which repeater was meant. A repeater or node is never somewhere a station operates from, so it isn't offered at check-in.

## During the drill

### Checking a station in at a site

On a net with sites, the check-in form's **Location** offers them, grouped by type. Net staff are offered every site; a station checking itself in is offered only the sites in use. Picking one puts the station at that site, and fills in the location so it still lands on the map. Typing anything else is an ordinary location with no site, which is right for a home station that's relaying.

<figure>
  <img src="/docs/img/net-control/check-in-at-a-site.png"
       alt="The New Check-in form on a phone, with its Location box outlined in red and open on a list of the net's sites, grouped by type: under Official office, Example County EOC, Windham, ME; North Office, Bridgton, ME; and Gray Weather Office FN43rv; under Shelter, Naples Shelter, Naples, ME, and Freeport Shelter, Freeport, ME.">
  <figcaption>On a net with sites, Location offers them. Picking one puts the station at that site.</figcaption>
</figure>

### When a team moves to another site

Check the station out, then check it in again at the new site. Each check-in keeps its own site and its own results, so what the team reached from the first shelter stays with the first shelter. Leave **Hide duplicate rows** off while the drill runs so both visits stay in view.

### Recording what a site reached

Use the ear icon on the station's row, as on any coverage net. On a drill with sites, the dialog also has:

- **Each station's site** under its callsign, so you're ticking places, not just callsigns.
- **Operating Position** offering the sites first. It starts at the station's site.
- **Repeaters and nodes**: for each one, **Reached**, **Couldn't reach**, or **Didn't try**, with an optional note. Write down why a failure happened while it's fresh; the note is what makes the result useful in the report.
- **Outside the net**: stations reached that never checked in, such as another county's EOC. Add the callsign or the agency, its county and state, the frequency, and whether it was **Two-way** or **Heard only**. These are what the **Counties reached** list is built from, so fill in the county.

<figure>
  <img src="/docs/img/net-control/can-hear-dialog-site.png"
       alt="The Who can K1COVE hear? dialog on the SET net. A grid of stations against 146.520 FM and 3.930 SSB, each station's site shown under its callsign, such as North Office under W1PINE. Operating Position reads Naples Shelter. In the Repeaters and nodes section, outlined in red, the County VHF repeater is Reached, and the County UHF repeater and the EOC packet node are Couldn't reach, each with a note. Outside the net lists W1ANDY, Androscoggin County EOC, heard only.">
  <figcaption>The same dialog records what the station heard, which repeaters and nodes it got into, and anyone it reached outside the net.</figcaption>
</figure>

Who can record these is the same as for any coverage report: net control, Logger, and Relay for any station, and each station for its own unless self-reporting is off.

## Reading the results

Open **Coverage** in the toolbar. On a net with sites it opens on **By site**; **Reports** switches back to the station-by-station table. It updates live as reports come in, and anyone viewing the net can open it.

**Reaching the primary sites** checks every site against each starred office:

- **Two-way** - both places heard each other on one frequency.
- **Through a relay** - no direct path, but both heard the same third station or site both ways. The station or site that bridges them is named underneath.
- **One-way only** - only one of the two has heard the other.
- **No path** - nothing reported either way. Before reading it as a gap, check the site was actually asked.

**Between sites** is the full grid, with the frequencies each row heard each column on.

<figure>
  <img src="/docs/img/net-control/site-coverage-reach.png"
       alt="Coverage by site. A table checks every site against the two starred offices: Gray Weather Office reaches the Example County EOC two-way on 146.520 FM; Naples Shelter reaches it through a relay, the North Office; Freeport Shelter reaches it through W2FERN, a home station, and has no path to the North Office. Below it, a grid of sites lists the frequencies each row heard each column on, two-way ones marked with a double arrow.">
  <figcaption>Every site against the primary offices: two-way, through a relay, one-way only, or no path.</figcaption>
</figure>

Below those are the **Repeaters and nodes** results by site, with their notes; a **Map** of the sites with a line for each path; **Counties reached**; and **Contacts outside the net**. A site counts as having reached a repeater if anyone there got in.

<figure>
  <img src="/docs/img/net-control/site-coverage-access.png"
       alt="The rest of Coverage by site. Repeaters and nodes: Naples Shelter reached the County VHF repeater but not the County UHF repeater or the EOC packet node, each with a note saying why; Freeport reached the VHF repeater at 50 W; Gray Weather Office reached all three. A map of the sites follows, with lines for each path. Counties reached lists York and Androscoggin, and the contacts outside the net are listed last.">
  <figcaption>Repeater and node results keep their notes, which is what explains a failure afterward.</figcaption>
</figure>

**Export to CSV** downloads whichever view is showing.

## After the drill

- **The closing email** has a **Coverage by Site** section: reach to the primary sites, repeaters and nodes with their notes, the pairs of sites, counties reached, and outside contacts.
- **The net report** has the same **Coverage by Site** section ahead of Station Coverage, in the page and its PDF. See [Reports and exports](/docs/net-managers/reports-and-exports/).
- **Personal coverage maps** are unaffected. A report from a site isn't a Home report, so it never lands on the operator's own map.

## Settings worth turning on for an exercise

- **Enable ICS-309 Communications Log format** on **Basic Info**, so the closing email carries the log in the form served agencies expect.
- **Power Src** on **Check-In Fields**, if the exercise asks which sites ran on emergency power.
- **Traffic handling**, if the exercise moves messages. See the traffic pages in [Net control](/docs/net-control/).
- **A drill plan**, for the objectives, the schedule of events, and the messages each site sends. See [Drill plans](/docs/net-managers/drill-plans/).
- **Chat**, for observations that fit nowhere else. It's part of the net's record.

## Related

- [Drill plans](/docs/net-managers/drill-plans/), for the exercise's objectives, schedule, and prepared messages.
- [Station coverage](/docs/net-control/station-coverage/), for recording reports and reading the station-by-station table.
- [Reporting what you hear](/docs/operators/reporting-what-you-hear/), the operator's side.
- [Creating a net](/docs/net-managers/creating-a-net/), for the rest of the net's settings.
