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

Three entries that were on this page when it was published on 2026-09-19 came off it the same day, fixed rather than worked around: the Traffic panel opening for a net's own NCS and Logger, Relay operators getting their copy of the closing log, and **Close net** failing for an operator holding both NCS and Logger. All three were one root cause. See the [changelog](/docs/CHANGELOG/) for that release.

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
