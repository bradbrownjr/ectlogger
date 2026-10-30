---
title: Known issues
summary: Confirmed, currently open problems and limitations, with a workaround for each. Check here before filing a bug.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-10-30
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/about/known-issues/
---

# Known issues

This page lists confirmed problems and limitations that are open right now, each with a workaround. Problems that have been fixed are listed under Bug Fixes in the [changelog](/docs/CHANGELOG/), and planned work is on the [Roadmap](/docs/ROADMAP/).

<div class="table-scroll" markdown="1">

| Problem | Who it affects | Workaround | Tracking |
|---|---|---|---|
| [Who can hear, from a recheck row](#who-can-hear-recheck) | Anyone recording or reading a station's "who can hear" report after that station has checked in again | Open it from the station's first check-in row | [#10](https://github.com/bradbrownjr/ectlogger/issues/10) |
| [Google, Microsoft and GitHub sign-in](#oauth-sign-in) | Self-hosted servers whose administrator configures one of these providers | Sign in with an emailed link or a password | [#11](https://github.com/bradbrownjr/ectlogger/issues/11) |
| [No separate switch for traffic reminder emails](#traffic-reminder-switch) | Anyone holding formal traffic who wants these reminders off but keeps other email | Turn off the main email switch | [#12](https://github.com/bradbrownjr/ectlogger/issues/12) |

</div>

Every row is also an open issue on GitHub, labelled [known-issue](https://github.com/bradbrownjr/ectlogger/issues?q=is%3Aopen+label%3Aknown-issue).

## Who can hear, from a recheck row {#who-can-hear-recheck}

When a station checks in again (a recheck), the net log gains a second row for it. If you open **Who can [callsign] hear?** from that second row (the ear icon at the end of the row, or **I hear** on the toolbar), the dialog shows only the reports saved on that row, and anything you save is stored against it. The reports saved on the station's first row don't appear, so the station can look as if it has reported nothing.

**Workaround:** open the dialog from the station's first check-in row. This is tied to an open design decision about how rechecks are recorded.

See [Reporting what you hear](/docs/operators/reporting-what-you-hear/) and [Station coverage](/docs/net-control/station-coverage/).

## Google, Microsoft and GitHub sign-in {#oauth-sign-in}

A self-hosted server can be given Google, Microsoft or GitHub sign-in keys, but the final step of signing in with them returns an error, so no one can complete it. The app doesn't show sign-in buttons for these providers, so on the hosted app nobody will run into it; it affects only an administrator who configures the keys expecting them to work.

**Workaround:** sign in with an emailed link or a password.

See [Manual installation](/docs/MANUAL-INSTALLATION/).

## No separate switch for traffic reminder emails {#traffic-reminder-switch}

Reminders about formal traffic you are still holding are on by default, and no screen lets you turn them off on their own.

**Workaround:** the main email switch in your Profile settings turns them off along with every other email. Turn it off only if you can do without the rest.

See [Emails we send](/docs/reference/emails/).

## If what you've hit isn't here

Check [the GitHub issue tracker](https://github.com/bradbrownjr/ectlogger/issues) for anything more recent, and see [Getting help](/docs/about/getting-help/) for how to report something that isn't listed.
