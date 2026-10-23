---
title: Privacy
summary: What ECTLogger stores about you, who can see it, what leaves the instance, and how to get it removed.
kind: Explanation
audience: Everyone
owner: KC1JMH
revised: 2026-10-23
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/PRIVACY/
---

# Privacy

ECTLogger is free, open-source net logging software built for Emergency Communications
Teams and SKYWARN spotter nets. This page explains, in plain terms, what data an ECTLogger
instance collects and why. It does not sell data, run ads, or share data with third parties
beyond what's needed to run the service (email delivery, and optionally Gravatar for avatars
— see below).

This policy describes the software's behavior. The operator of the specific ECTLogger
instance you use (your ECT, ARES group, or SKYWARN coordinator) is the one who actually
runs the server and holds the data — contact them with questions about your own account.

## Account information

Creating an account requires an email address and, typically, a callsign. A password is
optional — magic-link sign-in (a one-time link emailed to you) is the default, and a
password is only useful as a fallback for when email delivery is unavailable. If you set
one, it must meet an industry-standard complexity policy: at least 12 characters, with a
mix of uppercase, lowercase, a number, and a symbol. Administrator accounts are required
to also set up two-factor authentication (a code from an authenticator app).

Your email address is never shown to other users. Your callsign, name, and any contact
details you add to your profile are visible to other signed-in users by default, since
that's the point of a net roster — matching who's on the air to who they are.

## Net logs and check-ins

The core of the app is the net log: who checked in, their frequency/mode, their status
(e.g. has traffic, relay, mobile), and timestamps. This is the operational record of a net
and is visible to other participants and net control staff during and after the net, and
may be exported (CSV, ICS-309) or emailed to subscribers by the net's manager.

Chat messages sent during a net are stored as part of that net's record for the same
reason — they're part of the operational log, not a private conversation.

## Location data

Your profile has an optional static location field you can fill in yourself. Separately,
you can opt in to "location awareness," which uses your browser's location permission to
compute a Maidenhead grid square automatically — this is off by default and only active
if you turn it on in Settings.

## Email notifications

ECTLogger sends email for magic-link sign-in, and optionally for net start/close reminders,
net logs, and a daily digest of platform updates, depending on your notification
preferences. Every notification email includes a one-click unsubscribe link. Turning off
"Email Notifications" in Settings stops all of these except the magic-link sign-in email
itself and this session's own password-changed confirmation, which exist to protect your
account.

## Activity log and IP addresses

ECTLogger keeps an activity log of actions that matter for security and moderation: signing in (and failed attempts), changes to your profile, password, two-factor settings, or email address, and actions that delete or change nets, schedules, roles, and accounts. Each entry records who did it, when, what changed, and the internet (IP) address and browser it came from.

It exists so that an account taken over by someone else, or a person causing trouble under several accounts, can be traced and stopped. Only the instance's administrators can see it. Routine activity such as checking in or chatting is not added to it.

Each address is also given an approximate location (a city and region) from a database kept on the server itself, [DB-IP](https://db-ip.com)'s free IP to City Lite. No address is sent to anyone to look it up. When several wrong passwords are typed for your account, you and the administrators get an email listing those attempts with their addresses and locations.

Muting another station in chat for yourself is recorded without your name or address: the log keeps only that the station was muted, on which net, and a code that lets the administrators see how many *different* people have muted it, not who.

The IP address, location, and browser are cleared from an entry after one year, and the entry itself is deleted after three years. If your account is deleted, the log keeps the callsign it had on entries that already exist, so the record of what happened isn't lost.

## Gravatar

If your instance has Gravatar avatars enabled and you haven't uploaded a custom profile
image, your email address is hashed and sent to gravatar.com to look up an avatar image.
No other profile data is sent. Uploading your own avatar image, or your instance disabling
Gravatar, stops this.

## What we don't do

ECTLogger has no advertising, no analytics or tracking scripts, and doesn't sell or share
your data with third parties beyond the email delivery and optional Gravatar lookups
described above.

## Your data, your control

You can review and update most of your own information from your Profile page at any time, including the email address you sign in with.
To request that your account be deleted, contact an administrator of your ECTLogger
instance.

## Questions

Questions about this policy or your data can be directed to the administrator of the
ECTLogger instance you use, or raised as a GitHub issue on the
[ECTLogger project](https://github.com/bradbrownjr/ectlogger).
