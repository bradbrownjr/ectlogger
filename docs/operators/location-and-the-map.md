---
title: Your location and the map
summary: Town and state, GPS coordinates, Maidenhead, UTM, MGRS — what each looks like, which to use, and what the map does with it.
kind: Explanation
audience: Operators
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/location-and-the-map/
---

# Your location and the map

The Location field on a check-in is free text, but ECTLogger tries to understand it well enough to put a pin on a map. It's worth knowing what it can parse, because the map is only as good as what got typed into that field.

## What the Location field understands

Type any of these into Location (at check-in, or as your [default location](/docs/operators/account-and-profile/)) and the map can generally place it:

- **A place name** — "Portland, ME," a town, a landmark. This gets geocoded against an address lookup service, which takes a moment and needs the location to actually resolve to somewhere real; a vague or made-up place won't plot.
- **GPS coordinates** — decimal degrees (`43.6591, -70.2568`) or degrees/minutes/seconds (`43°39'33"N 70°15'24"W`).
- **Maidenhead grid square** — the format amateur radio already uses for propagation reporting (`FN43pp`). Understood down to the sub-square if you give it one.
- **UTM** — Universal Transverse Mercator (`19T 348123 4834567`).
- **MGRS** — Military Grid Reference System, the format most ARES/served-agency partners already use on paper maps (`19TCH4812334567`).

Any of these works equally well. Which one to use is really "whichever one you or the people relying on your report already think in" — a SKYWARN spotter typically has a grid square memorized, a served agency partner coordinating off a paper map is probably giving you MGRS, and a phone's own GPS app usually hands you decimal coordinates. Pick whichever is fastest and most exact for you in the moment; the map treats all of them the same once parsed. Full format details live in the [location formats reference](/docs/reference/location-formats/).

## Auto-filling it instead of typing it

Two settings, both in your [profile](/docs/operators/account-and-profile/), can save you from typing a location every time:

- **Default Location** fills in whatever you set, every time, until you change it or override it in the moment.
- **Location awareness** asks your browser for GPS permission and keeps a live Maidenhead grid square, shown in the navbar and used to auto-fill Location on check-in instead of your static default. It only updates while the setting is on and your browser has actually granted permission — there's a **Clear GPS location** button in Settings if you want to drop the stored value and stop using it without turning location awareness off entirely.

Either way, whatever auto-fills is still just text in the field before you submit — edit it if it's wrong.

## What the map actually shows

Every net with at least one parseable location on a check-in has a live map, and the same map data drives the net's report and its statistics page — one pipeline behind all three, so a station isn't plotted on one and missing from another. A few things that surprise people:

- **Checked-out stations are still plotted.** The map is a record of who took part in the net, not a live "who's still on frequency" indicator — someone who checked in, participated, and checked out an hour ago stays on the map.
- **There's no cap on how many stations get mapped.** Every check-in with a resolvable location is geocoded and plotted, even on a busy net.
- **Markers are colored by role and status** — NCS, Logger, Relay, and each station status get their own color, with a legend on the map itself. If a station's color looks off, check its actual role and status in the check-in list; the legend is the same vocabulary as [Status, rechecks, and checking out](/docs/operators/status-and-checking-out/), not an invented set of map-only categories.

<figure>
  <img src="/docs/img/operators/location-map.png"
       alt="A net's live check-in map, with colored markers for each station and a legend identifying NCS, Logger, Relay, and station statuses.">
  <figcaption>Every checked-in station with a location ECTLogger can parse, including ones already checked out.</figcaption>
</figure>
