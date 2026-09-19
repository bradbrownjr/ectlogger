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

This page was published on 2026-09-19 with five open defects found while the documentation was being written, by reading the code against what the screens promise. All five were fixed the same day rather than worked around, so only the one below remains. See the [changelog](/docs/CHANGELOG/) for what changed.

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
