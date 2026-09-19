---
title: Traffic handling settings
summary: Which formal message types the instance offers, and what happens once someone defines a new one.
kind: How-to
audience: Users holding the Admin role
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/admins/traffic-settings/
---

# Traffic handling settings

The **Traffic** tab controls which formal message formats (radiograms, ICS-213s — a general message form from the Incident Command System, or ICS, used across emergency response — weather-observation strips, and similar) show up in the type picker when someone files a piece of traffic, the order they're listed in, and the wording of each field's label and help text.

<figure>
  <img src="/docs/img/admins/traffic-definitions-table.png"
       alt="The traffic form definitions table, listing the ARRL Radiogram among other formats, with its &quot;Enabled&quot; switch outlined in red.">
  <figcaption>Turning a format off removes it from the type picker instantly. Past messages filed in that format are unaffected.</figcaption>
</figure>

## Enabling, ordering, and relabeling

Each row is one message format. From here you can:

- **Enable or disable** it with the switch — an instant on/off for whether it shows up in the type picker. Nothing already filed in that format is touched.
- **Reorder** it by editing the sort order number and clicking away; lower numbers appear first.
- **Edit field labels and help text** with the pencil icon — the label an operator sees for each field, and the description underneath it.

## What can't be changed here

The instance ships with a handful of built-in formats — the ARRL Radiogram and the ICS-213 General Message among them — and their actual field structure is fixed on purpose: it follows the ARRL/NTS format exactly, so it can't drift into something a receiving station somewhere else won't recognize. You can relabel a built-in field's display text, but you can't add, remove, or retype the fields themselves.

## Defining a new strip type

A genuinely new message format — a custom RRI strip with its own set of fields (RRI: Request for Information — one operator defines the fields once, and everyone who answers uses the same set) — isn't created from this tab. Any operator can define one the first time they paste a real example of it while filing a piece of traffic, and from that point on it behaves exactly like a built-in format: it shows up in this table, and from here you can enable, disable, reorder, and relabel it the same as anything else. See [net control](/docs/net-control/) for where that actually happens.

## Not here

Filing, promoting, and closing out an actual piece of traffic is covered in [net control](/docs/net-control/), not here — this tab only controls which formats exist and what they're labeled.
