---
title: Shared frequencies
summary: Maintaining the instance-wide list of repeaters, simplex frequencies, and digital talkgroups that net creators pick from.
kind: How-to
audience: Users holding the Admin role
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/admins/frequencies/
---

# Shared frequencies

Every frequency, repeater, or digital talkgroup a net can use comes from one shared list, maintained on the **Frequencies** tab. Net creators pick from this list rather than typing a frequency by hand each time — which is the point: without a shared list, one net calls it "146.940 ARES Repeater" and another calls the same machine "146.94 Portland Repeater," and now your reports and your map don't agree with each other. Keeping this list clean is the actual job here.

## Adding an entry

Click the **+** button (bottom right) and fill in:

- **Frequency** — e.g. "146.520 MHz." Leave this blank for a digital-only entry (DMR, D-STAR, Fusion, and similar) that has no analog frequency of its own.
- **Mode** — FM, AM, SSB, CW, or one of the digital modes (DMR, D-STAR, YSF/Fusion, P25, NXDN, M17), plus VARA and Winlink for HF digital, or Other.
- **Network** — for a digital mode, the reflector or network name (Brandmeister, Wires-X, REF030C).
- **Talkgroup/Room** — the talkgroup ID or room number, where the network has one.
- **Description** — free text; this is what actually shows up next to the frequency everywhere else in the app, so make it recognizable ("Example County ARES Repeater (PL 100.0)" rather than just "Repeater").

Either a frequency or a network is required — not necessarily both — so a digital-only entry and a classic analog repeater are equally valid rows.

## Editing and deleting

Editing an entry updates it everywhere it's used, immediately — useful for fixing a typo in a description without having to touch every net that already picked it. Deleting is only possible once no net references the entry at all; the **Nets Using** column tells you that count before you try.

<figure>
  <img src="/docs/img/admins/frequency-in-use-row.png"
       alt="A frequency row (146.940 MHz) in the shared frequency list, with its &quot;Nets Using&quot; count showing 1 or more and its delete icon, outlined in red, greyed out and disabled.">
  <figcaption>A frequency already picked by at least one net can be edited but not deleted. The count shows how many nets would be affected.</figcaption>
</figure>

There's no merge tool for two entries that turn out to be the same repeater under slightly different descriptions — if you spot a near-duplicate, it's worth cleaning up by hand before more nets pick the wrong one.

## Not here

Choosing which frequencies a specific net actually uses, and which one is "active" during the net, happens on that net, not here — see [net managers](/docs/net-managers/) and [net control](/docs/net-control/).
