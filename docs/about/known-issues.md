---
title: Known issues
summary: Confirmed, currently open problems and limitations, with a workaround for each. Check here before filing a bug.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-10-31
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/about/known-issues/
---

# Known issues

This page lists confirmed problems and limitations that are open right now, each with a workaround. Problems that have been fixed are listed under Bug Fixes in the [changelog](/docs/CHANGELOG/), and planned work is on the [Roadmap](/docs/ROADMAP/).

<div class="table-scroll" markdown="1">

| Problem | Who it affects | Workaround | Tracking |
|---|---|---|---|
| [Google, Microsoft and GitHub sign-in](#oauth-sign-in) | Self-hosted servers whose administrator configures one of these providers | Sign in with an emailed link or a password | [#11](https://github.com/bradbrownjr/ectlogger/issues/11) |
| [No separate switch for traffic reminder emails](#traffic-reminder-switch) | Anyone holding formal traffic who wants these reminders off but keeps other email | Turn off the main email switch | [#12](https://github.com/bradbrownjr/ectlogger/issues/12) |

</div>

Every row is also an open issue on GitHub, labelled [known-issue](https://github.com/bradbrownjr/ectlogger/issues?q=is%3Aopen+label%3Aknown-issue).

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
