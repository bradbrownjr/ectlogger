---
title: Known issues
summary: Things that are confirmed wrong right now, with workarounds where there are any. Check here before filing a bug.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/about/known-issues/
---

# Known issues

This page lists confirmed, currently open defects -- not roadmap items, not planned features, and not things that were fixed before anyone using the app could hit them. For what's planned or being considered, see the [Roadmap](/docs/ROADMAP/) instead. For how to report something new, see [Getting help](/docs/about/getting-help/).

As of this review, there is one confirmed open defect, and it's specific to self-hosting:

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

This is the form every existing installation already uses, so it isn't something you're likely to hit by accident -- only by reasonably assuming the explicit form is also accepted.

## Nothing else confirmed open right now

No other defects are confirmed and open as of this review: there are no open issues in the project's GitHub tracker, and no untriaged field reports waiting on this page. That's a snapshot, not a guarantee -- if you've just found something, it may simply not have reached this page yet. Check [the GitHub issue tracker](https://github.com/bradbrownjr/ectlogger/issues) directly for anything more recent than this page's revision date, and see [Getting help](/docs/about/getting-help/) for how to report it if it isn't already there.
