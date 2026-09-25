---
title: Check-in fields
summary: Every field a check-in can carry, what is always required, and what a net can turn on, off, or require.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-25
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/check-in-fields/
---

# Check-in fields

A check-in has one field that is always required, seven built-in fields a net can independently enable and require, and any number of admin-defined custom fields that behave exactly the same way as the built-in ones once created. Which fields actually appear on the check-in form and in the check-in table is controlled per net, not per account or globally.

## Always required

**Callsign** is the only field every net requires, on every check-in, with no way to turn it off. It accepts 3 to 20 characters: uppercase letters, digits, and the forward slash (for a portable or mobile suffix like `KC1HILL/M`). The form uppercases what you type automatically.

## Built-in optional fields

Each of these can be independently enabled or disabled for a given net, and (if enabled) marked required. Both toggles live in the net's Check-In Fields settings.

<div class="table-scroll" markdown="1">

| On-screen label | Accepts | Enabled by default | Required by default |
|---|---|---|---|
| Name | Free text | Yes | No |
| Location | Free text; see [Location formats](/docs/reference/location-formats/) for what the map can parse out of it | Yes | No |
| Spotter # | Free text (SKYWARN spotter number) | No | No |
| Weather Observation | Free text | No | No |
| Power Src | Free text (e.g. "Generator", "Battery") | No | No |
| Power | Free text (e.g. "100W", "50W mobile") — a separate field from Power Src, not the same thing | No | No |
| Notes | Free text, multi-line | No | No |

</div>

A field that is disabled for a net never appears on that net's check-in form or in its check-in table, whatever an individual operator's account settings are. A field marked required blocks submission of the check-in form until it's filled in.

Every field above, the Feedback field below, and every admin-defined custom field also carries a Spam Guard: it rejects a submitted value that looks like a link or an email address, on by default and enforced on the server, not just as a warning in the form. An admin can turn it off per field from Admin &gt; Check-in Fields, for a field deliberately meant to hold a link.

There is also a "Feedback" field defined in the same settings and storage as the fields above, and the check-in list can be told to require it, but neither the check-in dialog nor the inline check-in row currently has an input for it — as of this writing it can only actually be filled in through [Bulk add](/docs/reference/speed-entry-syntax/) or a direct API call, never the ordinary check-in form. If you turn it on expecting a text box to appear, that's a real gap, not something you're missing.

## Admin-defined custom fields

An admin can define additional fields (text, a multi-line text area, a number, or a fixed list of choices) from the admin panel. Once defined, a custom field is enabled and required per net using the exact same two checkboxes as the built-in fields above — there is no separate mechanism or separate settings screen for custom fields versus built-in ones. A net's check-in form renders every enabled field, built-in and custom, from that single list.

Two fields buried in the model layer, `CustomField` and `CustomFieldValue`, look like an older custom-field system but are dead code: nothing in the API or the frontend references them. The real mechanism is the admin-defined field list described above, served at `GET /api/settings/fields`.

## Topic of the Week and Poll responses

When a net has Topic of the Week or Poll enabled (schedule- or net-level features, not check-in fields), the check-in form gains a locked response field for whichever is turned on. These aren't part of the enable/require field list — they follow whether the feature itself is on.

## Frequencies

If a net has more than one frequency, the check-in form offers an "Available Frequencies" multi-select, letting a station indicate every frequency it can reach (useful on a SKYWARN net where not every spotter can hit every repeater). This is separate from which frequency the check-in was actually logged on.

See also: [Roles and permissions](/docs/reference/roles-and-permissions/) for who can edit a check-in after it's submitted, and [Speed entry syntax](/docs/reference/speed-entry-syntax/) for entering several check-ins at once in field order.
