---
title: Your statistics
summary: What ECTLogger counts for you, where to see it, and how the leaderboards work.
kind: How-to
audience: Operators
owner: KC1JMH
revised: 2026-10-01
review_by: 2027-09-19
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/your-statistics/
---

# Your statistics

ECTLogger keeps a running history of every net you've checked into, and shows it back to you in two places: your own numbers on your profile, and where you stand against everyone else on a given net or schedule.

## Your numbers

**Profile > Activity** shows a row of stat cards:

- **Total Check-ins** — every check-in you've ever logged, across every net.
- **Nets Joined** — how many distinct nets you've taken part in.
- **As NCS** — how many nets you've run.
- **Last 30 Days** — recent activity, for a quick "have I been keeping up" check.
- **Traffic Handled** and **Traffic Pending** appear once they apply to you — traffic you've originated, relayed, or delivered, and anything you're currently holding that hasn't moved yet. See [Filing traffic](/docs/operators/filing-traffic/).

Click any card to drill into the exact list of nets (or messages) behind the number, sorted and paginated. Below the cards, **Your Favorite Nets** lists the nets you check into most, with the top three marked gold, silver, and bronze, and each row expandable into your own session history for that net. A **PDF** button at the top exports the whole tab as a printable page.

<figure>
  <img src="/docs/img/operators/activity-stat-cards.png"
       alt="The Profile Activity tab's stat cards: Total Check-ins, Nets Joined, As NCS, and Last 30 Days.">
  <figcaption>Click any card to see the nets behind the number.</figcaption>
</figure>

## Where you stand against everyone else

The site-wide **Statistics** section (reachable from the navbar, and browsable without signing in) covers a single net, a whole recurring schedule, or the instance as a whole. A schedule's statistics page includes four leaderboards, each capped at the top 20 and each with a medal icon for the top three:

- **Check-in leaderboard** — ranked by how many of the schedule's occurrences a callsign has appeared in, with the percentage of occurrences that represents.
- **NCS leaderboard** and **Logger leaderboard** — ranked by how many occurrences someone held that role.
- **Relay leaderboard** — ranked by how many occurrences someone relayed at least one station.

You can narrow any of them to the last 30 days, 90 days, a year, or all time.

<figure>
  <img src="/docs/img/operators/leaderboard-table.png"
       alt="A schedule statistics page's check-in leaderboard, listing callsigns with their appearance count and participation percentage, medal icons next to the top three rows.">
  <figcaption>The check-in leaderboard for a recurring net, filtered to the last 90 days.</figcaption>
</figure>

The top-level `/statistics` page itself is instance-wide rather than per-net or per-schedule. It's a good place to get a feel for how active the instance is as a whole, separate from either your own numbers or one schedule's leaderboard. It has three parts:

- **All-time totals** - the cards across the top: nets held, check-ins, registered users, distinct callsigns, average check-ins per net, traffic handled, and nets running right now. These never change with the period buttons.
- **The selected period** - pick **Week**, **Month**, **6 Months**, **Year**, or **All Time** at the top of the page, and the heading below the totals names the period you chose. Under it are that period's figures (nets, check-ins, operators, new operators, average check-ins per net, and traffic handled), a chart with **Nets**, **Check-ins**, **Operators**, and **Traffic** tabs, and two scoreboards: **Most-Attended Nets** and **Most-Active Operators**. Click a net to open its schedule's statistics, or a callsign to open that operator's profile. An operator's count is the number of nets they checked into, so checking in twice to the same net counts once. Month means the last 30 days, not the calendar month.
- **Check-in map** - roughly where the selected period's check-ins came from, by state or province.

Both views are reading the same underlying check-in history — your Activity tab is the personal cut of it, the leaderboards and instance-wide charts are the comparative ones.
