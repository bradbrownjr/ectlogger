---
title: Traffic handling settings
summary: Which formal message types the instance offers, and what happens once someone defines a new one.
kind: How-to
audience: Users holding the Admin role
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/admins/traffic-settings/
---

# Traffic handling settings

The **Traffic** tab decides which formal message formats an operator is offered when they file a piece of traffic: ARRL radiograms, ICS-213 general messages, weather-observation strips, and anything else the instance has defined. It also sets the order they're listed in and the wording of each field's label and help text. It does not change what any of those formats *are* — see [the glossary](/docs/reference/glossary/) if a format name here is unfamiliar.

<figure>
  <img src="/docs/img/admins/traffic-definitions-table.png"
       alt="The traffic form definitions table with columns Title, Form Type, Version, Format, Status, Enabled, Sort Order, and Actions. Five rows, all marked Built-in and all enabled: ARRL Radiogram, GYX-CAR SKYWARN Report, ICS-213 General Message Form, RRI Strip (General), and RRI WXOBS Weather Observation. The Radiogram's Enabled switch is outlined in red.">
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

A genuinely new format isn't created from this tab, and it isn't an admin job. An [RRI strip](/docs/reference/glossary/) is a short slash-delimited message with a fixed set of fields, and any operator defines a new one by pasting a real example of it while filing traffic and labelling the fields they see. From that point on it behaves exactly like a built-in: it appears in this table, and you can enable, disable, reorder, and relabel it here the same as anything else. See [net control](/docs/net-control/) for where that actually happens.

The one thing you can't do is define the same type twice. A second attempt at a `form_type` that already exists is refused rather than shadowing the first, which is what keeps the format meaningful to a receiving station somewhere else.

## Not here

Filing, promoting, and closing out an actual piece of traffic is covered in [net control](/docs/net-control/), not here — this tab only controls which formats exist and what they're labeled.
