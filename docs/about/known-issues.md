---
title: Known issues
summary: Things that are confirmed wrong right now, with workarounds where there are any. Check here before filing a bug.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-25
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/about/known-issues/
---

# Known issues

This page lists confirmed, currently open defects — not roadmap items, not planned features, and not things that were fixed before anyone using the app could hit them. For what's planned or being considered, see the [Roadmap](/docs/ROADMAP/) instead. For how to report something new, see [Getting help](/docs/about/getting-help/).

This page was published on 2026-09-19 with five open defects found while the documentation was being written, by reading the code against what the screens promise. All five were fixed the same day rather than worked around. A sixth, where naming the database driver explicitly in a self-hosted `DATABASE_URL` stopped the application from starting, was fixed on 2026-09-22; both the plain and the explicit form now work. See the [changelog](/docs/CHANGELOG/) for what changed.

## Some toolbar buttons show for the wrong people

**Found:** 2026-09-25. **Affects:** net staff and Loggers on an active net.

The net toolbar decides who sees **Close net**, **Import**, **Edit net**, and **Archive** by a broader rule than the server uses to decide who may actually do them. Two things follow:

- A member of the schedule's net staff or NCS rotation who hasn't checked into this occurrence as NCS sees those buttons, but clicking them is refused with a permission error.
- A Logger who isn't on the schedule's staff is allowed to close the net, but never sees the **Close net** button.

**Workaround:** if you're net staff, check yourself in as NCS (or Logger, to close or import) before using those buttons. If you're a Logger without the button, ask the NCS or the net's manager to close the net.

## If what you've hit isn't here

This page is a snapshot taken on its revision date, not a guarantee. Check [the GitHub issue tracker](https://github.com/bradbrownjr/ectlogger/issues) for anything more recent, and see [Getting help](/docs/about/getting-help/) for how to report something that isn't there yet.
