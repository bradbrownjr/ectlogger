---
title: Sites
summary: Giving a net the places its stations deploy to, such as shelters, offices or aid stations, so net control can check each station in at one and see who is where. Importing an agency's list, and who sees it.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-10-23
review_by: 2027-10-23
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/sites/
---

# Sites

When an ARES team deploys to shelters, or a race puts operators at aid stations, net control needs to know who is at each place, not just who is on the air. Give the net a list of sites and the check-in form gets a **Site** box ahead of **Location**. Net control picks the site, and the **Sites** board shows every station grouped by where it is, with any site nobody has reached standing out.

Sites work on any net. A coverage drill such as the ARES Simulated Emergency Test builds on the same list to test which places can reach which; that's [Coverage drills by site](/docs/net-managers/coverage-drills/).

## Before you start

You need to be able to edit the net: its manager, its schedule's manager or a co-manager, or an admin. Sites belong to one net, so for an event that runs from a recurring schedule, add them to the net that schedule creates, from that net's **Edit**.

## Set up the sites

1. Open the net's settings (**Edit** on the net, or the form when creating it) and go to **Basic Info**.
2. Under **ARES & EmComm Features**, find **Sites** and click **Add site**.
3. Type the site as one line: **Name, Town, ST**, such as `Naples Shelter, Naples, ME`, or a name followed by a grid square, such as `Gray Weather Office FN43rv`. The line underneath shows how it was split. If it says no place was found, add a comma before the town.
4. Pick the site's **Type**: **Official office** for an emergency management office or EOC, **Shelter**, **Point of distribution (POD)**, **Staging area**, **Hospital**, or **Other** for anywhere else, such as an aid station or a checkpoint.
5. Leave **Supported** ticked on each site your teams will staff. A site you add by hand starts ticked.
6. Click **Save**.

<figure>
  <img src="/docs/img/net-managers/coverage-sites-editor.png"
       alt="The Sites list in the net's settings, with a search box, a type filter and an Import button above it. Each row has the site typed as one line, such as Naples Shelter, Naples, ME, then its type, a Primary star and a Supported tick. Naples Shelter is opened to show its address, its notes, and the columns kept from the EMA's list: emergency and long-term capacity, generator, and plan status. Its Supported tick is outlined in red. The schools and PODs further down, imported from the EMA's lists, are not ticked.">
  <figcaption>Tick Supported for the sites your teams staff. Open a site to see its address, notes and the rest of its row from the EMA's list.</figcaption>
</figure>

Open a site with the arrow at the end of its row to add its address, latitude and longitude, and notes such as a point of contact or how to get in. Latitude and longitude, when you have them, place the site on the map exactly.

With coverage logging turned on, the list also takes repeaters and nodes, and a **Primary** star for the offices every other site should reach. Both are explained in [Coverage drills by site](/docs/net-managers/coverage-drills/).

Removing a site takes the stations placed at it off that site; their check-ins are kept.

## Import an emergency management agency's site list

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

## Who sees the sites

An agency's list of possible shelters is not public: a shelter on a published list reads as an open shelter, and in a real event some won't be. So:

- **Net staff** see every site, with its address, notes, and the other columns. That's the net's manager, its schedule's manager and staff, an admin, and anyone acting as NCS, Logger, or Relay.
- **Everyone else** sees only the sites in use: ticked **Supported**, starred as primary, a repeater or node, or with a station checked in there. They see the site's name and place, never its address, notes, or other columns.

The Site box, the Sites board, the report, and the closing email only ever show sites in use. If a team turns up at a site you didn't tick, net control can check them in there, which puts it in use.

## Afterward

- **The net report** has a **Sites** section listing who was at each site, at home, or deployed over the whole net. A station that moved shows at each place. See [Reports and exports](/docs/net-managers/reports-and-exports/).
- **The closing email** has the same **Sites** section.

## Next

[Stations at sites](/docs/net-control/stations-at-sites/) is net control's side: checking a station in at a site, what happens when it moves, and the Sites board. [Coverage drills by site](/docs/net-managers/coverage-drills/) adds the reach testing on top.
