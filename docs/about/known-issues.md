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

This page was published on 2026-09-19 with five open defects found while the documentation was being written, by reading the code against what the screens promise. All five were fixed the same day rather than worked around. A sixth, where naming the database driver explicitly in a self-hosted `DATABASE_URL` stopped the application from starting, was fixed on 2026-09-22; both the plain and the explicit form now work. Two more, found on 2026-09-25, were fixed the same day: net toolbar buttons that were offered to people the server then refused (and hidden from a Logger it would have allowed), and five frequency modes on the admin screen that could not be saved. See the [changelog](/docs/CHANGELOG/) for what changed.

## Nothing open right now

There are no confirmed open defects as of this page's revision date.

## If what you've hit isn't here

This page is a snapshot taken on its revision date, not a guarantee. Check [the GitHub issue tracker](https://github.com/bradbrownjr/ectlogger/issues) for anything more recent, and see [Getting help](/docs/about/getting-help/) for how to report something that isn't there yet.
