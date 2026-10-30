---
title: Check-in fields
summary: Every field a check-in can carry, what is always required, and what a net can turn on, off, or require.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-10-29
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/check-in-fields/
---

# Check-in fields

A check-in has one field that is always required, nine built-in fields a net can independently enable (eight of which it can also require), and any number of admin-defined custom fields that behave exactly the same way as the built-in ones once created. Which fields actually appear on the check-in form and in the check-in table is controlled per net, not per account or globally.

## Always required

**Callsign** is the only field every net requires, on every check-in, with no way to turn it off. It accepts 3 to 20 characters: uppercase letters, digits, and the forward slash (for a portable or mobile suffix like `KC1HILL/M`). The form uppercases what you type automatically.

## Built-in optional fields

Each of these can be independently enabled or disabled for a given net, and (if enabled) marked required. Both toggles live in the net's Check-In Fields settings.

<div class="table-scroll" markdown="1">

| On-screen label | Accepts | Enabled by default | Required by default |
|---|---|---|---|
| Name | Free text | Yes | No |
| Location | Free text; see [Location formats](/docs/reference/location-formats/) for what the map can parse out of it | Yes | No |
| Spotter # | SKYWARN spotter number: letters, numbers, hyphens, and spaces, up to 20 characters, stored upper-case. No format is imposed beyond that, since each NWS office assigns its own | No | No |
| Weather Observation | Free text | No | No |
| Power Src | Free text (e.g. "Generator", "Battery") | No | No |
| Power | Free text (e.g. "100W", "50W mobile") — a separate field from Power Src, not the same thing | No | No |
| Feedback | Free text, multi-line | No | No |
| Notes | Free text, multi-line | No | No |
| Relayed By | The callsign of the station that passed this check-in along to net control. Can be enabled, never required, since most check-ins on a net that uses relays still come in direct | No | No |

</div>

**Relayed By is the one exception to the next paragraph.** With it enabled, its box is always on the check-in form and its column always in the check-in table. With it disabled, both appear anyway as soon as any station on the net is set to **Relay**, or a check-in already has a relayed-by callsign (from a CSV import, for example), so a net that only now and then uses a relay doesn't have to be edited mid-net. Before 2026-10-23 there was no setting at all: the box was on every net's check-in row.

A field that is disabled for a net never appears on that net's check-in form or in its check-in table, whatever an individual operator's account settings are. A field marked required blocks submission of the check-in form until it's filled in.

Every field above and every admin-defined custom field also carries a Spam Guard: it rejects a submitted value that looks like a link or an email address, on by default and enforced on the server, not just as a warning in the form. An admin can turn it off per field from Admin &gt; Check-in Fields, for a field deliberately meant to hold a link.

## Admin-defined custom fields

An admin can define additional fields (text, a multi-line text area, a number, a checkbox, or a fixed list of choices) from the admin panel. Once defined, a custom field is enabled and required per net using the exact same two checkboxes as the built-in fields above — there is no separate mechanism or separate settings screen for custom fields versus built-in ones. A net's check-in form renders every enabled field, built-in and custom, from that single list.

Two fields buried in the model layer, `CustomField` and `CustomFieldValue`, look like an older custom-field system but are dead code: nothing in the API or the frontend references them. The real mechanism is the admin-defined field list described above, served at `GET /api/settings/fields`.

## In reports and exports

The net's [report](/docs/net-managers/reports-and-exports/) and its closing email show each field the net turned on **and at least one station filled in**, so a printed log never carries a field that is empty all the way down. The closing email gives each one a column. The report lists them in one **Details** column, a line per field, so the log stays the width of the page however many fields a net uses. A ticked checkbox reads **Yes**; an unticked one is left blank.

The **Export** CSV always has the same built-in columns, whether the net uses them or not, because [Import](/docs/net-managers/importing-check-ins/) matches on those column names. It adds a column for each custom field the net turned on and somebody filled in.

Before 2026-10-29, Feedback and custom fields such as an FLDIGI checkbox were missing from most of these, and Feedback had no box on any check-in form.

## Topic of the Week and Poll responses

When a net has Topic of the Week or Poll enabled (schedule- or net-level features, not check-in fields), the check-in form gains a locked response field for whichever is turned on. These aren't part of the enable/require field list — they follow whether the feature itself is on.

## Frequencies

If a net has more than one frequency, the check-in form offers an "Available Frequencies" multi-select, letting a station indicate every frequency it can reach (useful on a SKYWARN net where not every spotter can hit every repeater). This is separate from which frequency the check-in was actually logged on, which the report, the Export CSV and the closing email show as **Frequency**.

See also: [Roles and permissions](/docs/reference/roles-and-permissions/) for who can edit a check-in after it's submitted, and [Speed entry syntax](/docs/reference/speed-entry-syntax/) for entering several check-ins at once in field order.
