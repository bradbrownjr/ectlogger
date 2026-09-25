---
title: Location formats
summary: Every format the Location field understands, one real example of each, and what happens when it can't be parsed.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-25
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/location-formats/
---

# Location formats

The Location field on a check-in is free text, and nothing stops you typing anything into it, but the check-in map, the net report's map, and the statistics map all try to turn it into a point on a map. This page lists every format that parsing actually understands, in the order it tries them, with a real example of each.

## What the map understands

<div class="table-scroll" markdown="1">

| Format | Example | Notes |
|---|---|---|
| GPS, decimal degrees | `43.6591, -70.2568` | Comma or plain space between the two numbers. This is Portland, ME. |
| GPS, degrees-minutes-seconds | `43°39'33"N 70°15'24"W` | The same Portland location, spelled out in DMS. |
| Maidenhead grid square | `FN43mr` | 4, 6, or 8 characters (field, square, optional subsquare, optional extended precision). Resolves to the center of that square. |
| UTM | `19T 348123 4834567` | Zone, latitude band letter, easting, northing — roughly Portland, ME's zone. |
| MGRS | `19TCH4812334567` | Zone, band, 100km grid square letters, then an even-length easting/northing string. |
| Maidenhead grid alongside a place name | `KENNEBUNK FN43SI` | A common convention: a readable town name plus a precise grid, in either order. Any whitespace-separated word that matches the grid pattern is pulled out and used, even surrounded by other text. |
| A recognizable address | `Farmington, ME` | Anything with a comma, or ending in a two-letter state abbreviation or a full state name, is treated as an address and sent to the map's geocoder rather than parsed locally. |

</div>

The parser tries the coordinate formats first, in the order listed, before falling back to treating the text as an address: a bare GPS pair or Maidenhead grid square, then UTM, then MGRS, and only then a grid square pulled out of a longer string like a place name. A bare grid square and a grid square embedded in a longer string are both accepted, so you don't need to strip the town name out first.

## Addresses: what actually gets geocoded

An address-shaped Location is sent to ECTLogger's own backend, which proxies it to OpenStreetMap's Nominatim geocoder (this keeps a browser from hitting Nominatim's rate limit directly, and the result is cached). If the full address doesn't resolve, the map tries progressively less specific versions by dropping the leading comma-separated segment (`County Rd, Shapleigh, ME` failing outright but `Shapleigh, ME` succeeding), stopping at two remaining segments (normally city and state) so a bad street address never degrades all the way down to a single state-wide pin. There is no cap on how many addresses a net can have geocoded; a large net with many unique locations just takes a little longer to load the first time.

## What happens when it can't be parsed

A Location that matches none of the coordinate formats and doesn't look enough like an address (a single word with no state, for instance, or an empty field) is not plotted. The station isn't silently dropped from the log. It's listed separately as unmapped, wherever the app tells you which stations aren't on the map, so you can tell a genuinely unparseable location apart from a slow geocode.

## What reaches the map

Every station that parses or geocodes successfully appears as a marker, colored by role or status (see [Station statuses](/docs/reference/station-statuses/) for the palette and what takes priority over what). This is one shared pipeline behind the live check-in map, the net report's map, and the net statistics map, so a station that's on one is on all three, including a station that has already checked out. Checking out removes nothing from the map; see the note on that in [Station statuses](/docs/reference/station-statuses/).
