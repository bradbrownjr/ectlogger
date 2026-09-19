---
title: Feeds and calendars
summary: The two RSS feeds ECTLogger publishes, what's in them, and where to find their addresses.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/feeds/
---

# Feeds and calendars

ECTLogger publishes two plain RSS feeds. Both are public and unauthenticated — there is no login token in the URL, nothing to revoke, and nothing that identifies who is subscribed. Point any ordinary RSS reader at either address.

<div class="table-scroll" markdown="1">

| Feed | Address | Contents |
|---|---|---|
| Upcoming nets | `/feed/schedule.xml` on your instance's backend address | Every scheduled net occurrence in the next 14 days, across every active recurring schedule and every ad hoc net with a start time set. A cancelled occurrence drops out of the feed entirely rather than appearing crossed out. |
| Changelog | `/feed/changelog.xml` on your instance's backend address | The most recent changelog entries (up to 20), newest first, with each entry's full list of changes in the description. |

</div>

Note the path: these are served from `/feed/...`, not `/api/feed/...` like the rest of the application's API.

## Where to find the address

Neither feed is buried in settings — both have a visible RSS icon right where you'd look for the thing they cover:

- The **Schedule** page has an RSS icon (tooltip: "Subscribe to upcoming nets (RSS)") next to the schedule header.
- The changelog dialog (opened from **About ECTLogger** in the Help menu, or the notification badge on first login after a release) has an RSS icon (tooltip: "Subscribe to changelog (RSS)") next to its PDF download buttons.

Copy the link target from either icon into your feed reader rather than typing the address by hand — the exact host is your instance's backend, which may differ from the address you use to browse the app.
