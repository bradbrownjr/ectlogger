---
title: Administrators
summary: The admin panel of a running instance: who gets in, what the check-in forms ask for, and what the whole site looks like.
kind: Explanation
audience: Users holding the Admin role
owner: KC1JMH
revised: 2026-09-18
review_by: 2027-09-18
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/admins/
---

# Administrators

This path is for whoever holds the **Admin** role on an ECTLogger instance. Everything here happens in the admin panel, in a browser, and none of it requires a shell.

That last part is the reason this is its own path. "Administrator" gets used for two completely different people: the club member who was made an admin so they could add new members and set up a spotter-number field, and the person who owns the server the whole thing runs on. They share almost nothing. If you are the second one, you want [self-hosting](/docs/self-hosting/), which covers installation, deployment, email, logging, and hardening.

## What an admin can do that nobody else can

- See and edit every user, and change what role they hold
- See every net on the instance, including ones they have no part in
- Define the custom check-in fields that nets can ask for
- Maintain the shared frequency list everyone builds nets from
- Set the instance's logo and default color theme
- Put a banner across the top of the site for everyone
- Set the security policy: lockouts, session length, and what MFA is required for
- Decide which traffic form types the instance offers

## Two things to know before you start

**Admins must have two-factor authentication.** It is optional for everyone else and mandatory here, and it is enforced on every admin-only action, not just at login. An admin account without MFA enrolled can sign in but cannot reach the admin panel until it finishes enrolling. This is not something to work around. An account that can read every net and edit every user is the account worth stealing. [Security, MFA, and lockouts](/docs/admins/security-and-mfa/) covers enrollment and what to do when somebody is locked out of their authenticator.

**Being an admin does not make you Net Control.** The global Admin role and the per-net roles are separate systems, on purpose. An admin can see and, where necessary, take over a net, but the person actually running tonight's net holds the NCS role for that net alone. The whole grid is in [roles and permissions](/docs/reference/roles-and-permissions/).

## The pages

**[Users and roles](/docs/admins/users-and-roles/)** — The user list, inviting people, what each global role can do, promoting and demoting, and what happens to somebody's history when their account changes.

**[Custom check-in fields](/docs/admins/custom-fields/)** — Adding a field for a spotter number, a weather observation, or anything else a net needs to collect, and making it available for nets to require.

**[Shared frequencies](/docs/admins/frequencies/)** — The instance-wide list of repeaters, simplex frequencies, and talkgroups that net creators pick from, so everyone spells the same repeater the same way.

**[Branding and themes](/docs/admins/branding-and-themes/)** — The logo and the default color theme, and what individual users can override for themselves.

**[The maintenance banner](/docs/admins/maintenance-banner/)** — Telling everyone the site is about to go down, and the difference between that and the update notice a user sees after a deploy.

**[Security, MFA, and lockouts](/docs/admins/security-and-mfa/)** — MFA enrollment and reset, failed-login lockouts, session length, and recovering an admin account that has lost its authenticator.

**[Traffic handling settings](/docs/admins/traffic-settings/)** — Which formal message types the instance offers, and defining a custom RRI strip type once so every net can use it.

**[The contact directory](/docs/admins/contacts/)** — The callsign directory the app builds as stations check in, what it is used for, and what it holds.

## Not here

Everything about a specific net or schedule belongs to whoever manages it, not to you, and lives in [net managers](/docs/net-managers/). Server installation, backups, and TLS are in [self-hosting](/docs/self-hosting/).
