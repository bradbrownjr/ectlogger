---
title: Known issues
summary: Things that are confirmed wrong right now, with workarounds where there are any. Check here before filing a bug.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/about/known-issues/
---

# Known issues

This page lists confirmed, currently open defects — not roadmap items, not planned features, and not things that were fixed before anyone using the app could hit them. For what's planned or being considered, see the [Roadmap](/docs/ROADMAP/) instead. For how to report something new, see [Getting help](/docs/about/getting-help/).

Most of what follows was found while this documentation was being written, by reading the code against what the screens promise. None of it is new breakage. Every one of them has a workaround.

## Net Control and Logger can't open the Traffic panel

On a net with traffic handling turned on, the Traffic panel is meant to be available to that net's NCS and Logger as well as to its owner and to admins. In practice only the owner and admins can see anything in it: everyone else gets **"Not authorized to view this net's traffic"**, even while actively running the net.

**Workaround**: filing still works — the **+** in the panel's header opens the filing dialog normally, and so does **New** in the site-wide **Traffic** section. What you lose is the net-wide view: in the Traffic section you'll see the forms you filed yourself, the ones you're currently holding, and anything handed to or from you, but not every form filed on the net by someone else. Until this is fixed, the practical answer on a busy net is to have the net's owner (or an admin) keep the Traffic panel open, since they can see all of it.

Affects: [Handling traffic](/docs/net-control/handling-traffic/).

## Relay operators don't get a copy of the closing log

When a net closes, the log email goes to the net's owner, to anyone subscribed to the schedule, and to the NCS and Logger who worked it. An operator who worked the net as **Relay** is meant to be on that list too and is not.

**Workaround**: subscribe to the schedule from its **Subscribe** button, which puts you on the list regardless of role. On a one-off net, ask whoever gets the log to forward it.

Affects: [Closing the net](/docs/net-control/closing-the-net/), [Reports and exports](/docs/net-managers/reports-and-exports/).

## Closing a net fails for an operator who holds both NCS and Logger on it

If the same account has been assigned **both** NCS and Logger on one net — which is allowed, and happens when somebody opens the lobby as Logger and then takes net control — clicking **Close net** returns a server error instead of closing it.

**Workaround**: remove one of the two roles from yourself in **Manage Net Control Staff** (the **Roles** button) and close the net again. Or have another NCS or Logger, the net's owner, or an admin close it.

Affects: [Closing the net](/docs/net-control/closing-the-net/).

## Being in the rotation isn't enough to start the net

Everywhere else in ECTLogger, being on a schedule's **Authorized Net Staff** list and being in its **NCS rotation** grant the same access. **Start** is the exception: it checks the staff list only. An operator who is in the rotation but was never added to the staff list can't start a net from that schedule, even on the week the rotation says is theirs.

**Workaround**: add them to the staff list as well. That's where the rest of their access already comes from, and it takes one click on the schedule's **Net Staff** tab. This is documented as current behavior in footnote 3 of [Roles and permissions](/docs/reference/roles-and-permissions/).

## The Roles button appears for staff who can't use it yet

Net staff see the **Roles** button on a net from their schedule before they hold any role on that specific occurrence. Clicking **Assign Role** in the dialog it opens is refused, because assigning roles needs an active NCS or Logger role on that net, not just staff membership on the schedule.

**Workaround**: check yourself in as NCS or Logger first (see [Becoming NCS or Logger by checking yourself in](/docs/reference/roles-and-permissions/)), then the dialog works as expected.

## Self-hosting: an explicit async driver in `DATABASE_URL` breaks startup

If `DATABASE_URL` is set to the async-driver form directly, for example:

```
DATABASE_URL=sqlite+aiosqlite:///./ectlogger.db
```

the application fails to start. Internally, ECTLogger adds the `+aiosqlite` driver itself by replacing `sqlite:///` with `sqlite+aiosqlite:///` in whatever URL it's given, and that same text also appears inside `sqlite+aiosqlite:///`, so the substitution runs twice and produces `sqlite+aiosqlite+aiosqlite:///`, which SQLAlchemy rejects.

**Workaround**: use the plain form ECTLogger's own example configuration documents, without the driver name:

```
DATABASE_URL=sqlite:///./ectlogger.db
```

This is the form every existing installation already uses, so it isn't something you're likely to hit by accident — only by reasonably assuming the explicit form is also accepted.

## If what you've hit isn't here

This page is a snapshot taken on its revision date, not a guarantee. Check [the GitHub issue tracker](https://github.com/bradbrownjr/ectlogger/issues) for anything more recent, and see [Getting help](/docs/about/getting-help/) for how to report something that isn't there yet.
