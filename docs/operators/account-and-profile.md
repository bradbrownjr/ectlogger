---
title: Your account and profile
summary: Getting in with a magic link or a password, and what your profile controls.
kind: How-to
audience: Operators
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/account-and-profile/
---

# Your account and profile

You can look at the [dashboard](/docs/operators/finding-a-net/), a net, the schedule list, and the statistics pages without signing in at all. The moment you want to check yourself in, chat, file traffic, or see your own numbers, you need an account. The good news: there is no registration form. Your account is created the first time you sign in.

## Signing in with a magic link

This is the normal way in.

1. Go to the login page and enter your email address.
2. Check your inbox for an email with a sign-in link. If it doesn't show up in a minute or two, check spam.
3. Click the link.

That's it. If this is the first time anyone has signed in with that email address, ECTLogger creates your account right then; there's nothing to fill in first. The link is single-use and expires after a few days.

<figure class="control-figure">
  <img src="/docs/img/operators/account-profile-tab.png"
       alt="The Profile page's Profile tab, showing the Name, Amateur Radio Call Sign, GMRS Call Sign, SKYWARN Spotter Number, and Default Location fields, with Save Changes at the bottom.">
  <figcaption>Your profile identity fields. Only Name is required.</figcaption>
</figure>

## Setting a password (optional fallback)

A magic link needs a working inbox. If your club's email delivery is ever down, or you'd rather not wait on an email every time, set a password from **Profile > Security**. It's a fallback, not a replacement; the magic link keeps working either way.

Passwords must be at least 12 characters and include a lowercase letter, an uppercase letter, a number, and a special character. Five wrong attempts in a row locks the password login for 15 minutes; your magic link still works during a lockout.

The same Security tab lets you turn on two-factor authentication (TOTP, the six-digit code from an authenticator app) for your own account. It's optional for everyone except admins, who are required to have it. Turning it on shows you a QR code to scan and a set of one-time backup codes. Save those somewhere other than the phone running the authenticator, in case you lose the phone.

## Your profile

**Profile** tab:

- **Name** — required. Your display name across the app.
- **Amateur Radio Call Sign** — your primary callsign. A link to look it up on QRZ.com appears once you've entered one.
- **GMRS Call Sign** — if you also operate GMRS, so nets that mix modes can log you correctly.
- **Additional Callsigns** — any other callsigns you use (tactical, a second license, etc.), added and removed as a list of chips.
- **Previous callsigns** — read-only. If you change your primary callsign, the old one moves here automatically, and your check-in history under it is kept.
- **SKYWARN Spotter Number** — auto-fills when you check into a SKYWARN net that asks for it.
- **Default Location** — your home QTH or grid square. Auto-fills the Location field when you check in.
- **Website / YouTube Channel** — optional, shown on your profile popup (see below), not in the check-in list.

**Settings** tab covers appearance and behavior: a color theme (or follow the system default), dark mode, whether times display in your local timezone or UTC, a **Show activity in chat** switch, and [location awareness](/docs/operators/location-and-the-map/) (browser GPS used to keep a live grid square). It also has a **Remember Net View Layout** switch and a **Reset Net View Layout** button. Those control whether the panels in a net (chat, activity log, script, map, and so on) stay where you last left them on this device.

**Notifications** tab is the email switchboard: a master switch, then per-event toggles for a subscribed net starting, a subscribed net closing (with the log attached, optionally as an [ICS-309](/docs/reference/emails/) form), a reminder an hour before a scheduled net, and an opt-in daily digest of what's new in ECTLogger.

## What other people see about you

Click any callsign in a check-in list or in chat and a popup shows your name, avatar, and (if you added one) your website link, plus a QRZ.com link built from your callsign automatically. A callsign that isn't clickable belongs to a check-in with no ECTLogger account behind it; see [Checking in](/docs/operators/checking-in/) for what that means.
