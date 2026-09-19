---
title: Getting help
summary: How to ask, what to include, and the Diagnostics tool that collects it for you.
kind: How-to
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/about/getting-help/
---

# Getting help

Everything here is reached from the **Help** menu in the top navigation bar. Open it and you'll see: User Guide, Known Issues, Roadmap, Privacy Policy, Start Walkthrough, Submit Feedback, Diagnostics, and About ECTLogger.

## Report a bug or ask for a feature

1. Open the **Help** menu and choose **Submit Feedback**. (You need to be signed in for this one; everything else in the Help menu works signed out too.)
2. Choose **Bug Report** or **Feature Request**.
3. Write a subject and a description. For a bug, say what you expected to happen and what happened instead. Both halves matter more than either alone.
4. Leave **"Include diagnostics (browser, screen size, recent errors)"** checked for a bug report (it's on by default for bugs, off for feature requests). See "What Diagnostics actually collects" below before you decide either way.
5. Attach a screenshot if one would show the problem faster than describing it.
6. Submit. Every admin account gets a copy by email, and where GitHub issue creation is configured, a public tracking issue is opened automatically.

## Check Diagnostics before you report, too

The **Diagnostics** item in the Help menu works whether you're signed in or not, and opens a panel with a **Copy Diagnostics** button. Use it any time something looks wrong, even outside the feedback form. It's often faster to paste this straight into an email or a GitHub issue than to describe your setup by hand.

### What Diagnostics actually collects

Know what you're attaching before you attach it. The snapshot is environment information only:

- App version, and the page you were on
- Viewport and screen size, device pixel ratio, and any zoom the app applied on a short window (a real cause of past reports that looked like missing menus)
- Browser and platform, language, and time zone
- Whether your browser currently reports itself online
- Any problem the app noticed about its own rendering
- The last several `console.error`/`console.warn` messages, with any non-text values redacted to `[object]` rather than included in full

**It never includes your callsign, name, email address, location, chat content, check-in data, or traffic content, and nothing is sent anywhere on its own**. The panel just shows it to you, and you choose whether to paste it or, in the feedback form, check the box to send it along.

## If the page itself isn't working

Before reporting that a button does nothing, try the same thing in a private window, which normally runs with your browser extensions disabled. Ad blockers and script blockers break ECTLogger in ways that look like a fault at our end, sign-in most of all: see [Signing in](/docs/operators/signing-in/#if-the-sign-in-page-does-nothing) for what to allow. If it works in a private window and not in an ordinary one, an extension is the cause, and the useful thing to tell us is which extension.

## Beyond the app

- **GitHub issues**: [github.com/bradbrownjr/ectlogger/issues](https://github.com/bradbrownjr/ectlogger/issues) — the same tracker Submit Feedback can open an issue in automatically. Good for anything you want to track publicly, search past reports on, or follow up on yourself.
- **GitHub discussions**: [github.com/bradbrownjr/ectlogger/discussions](https://github.com/bradbrownjr/ectlogger/discussions) — better than an issue for a question, a "how do other clubs handle this," or an idea you want to talk through before it's a concrete feature request.

## What makes a good report

- **What you expected, and what actually happened.** Both, not just the second one.
- **Which net or schedule**, if it's specific to one. A net ID from the URL is enough.
- **Your callsign**, so a report tied to check-in data or a role can actually be looked up.
- **Diagnostics attached** (see above) for anything that looks like a display or browser problem.
- **One report per problem.** Three unrelated things in one bug report means two of them get lost.

Check [Known issues](/docs/about/known-issues/) first. If it's already listed there, you've saved yourself the report, and if it isn't, that's useful information too.
