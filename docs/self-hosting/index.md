---
title: Self-hosting
summary: Running your own ECTLogger instance: installation, deployment behind a reverse proxy, email, logging, and hardening.
kind: Explanation
audience: Server operators
owner: KC1JMH
revised: 2026-09-18
applies_to: ECTLogger, self-hosted
permalink: /docs/self-hosting/
---

# Self-hosting

ECTLogger is MIT-licensed and runs on your own hardware. This track is for whoever owns that hardware.

It is a separate track rather than a fifth audience path because it is a separate job. The [administrators](/docs/admins/) path is a browser, a login, and a settings screen. This one is a shell, a service unit, a reverse proxy, and a backup that you have actually tested restoring.

## Should you self-host

**Probably not, if you are a club looking for somewhere to log your Tuesday net.** [app.ectlogger.us](https://app.ectlogger.us) is free, open to anyone with a callsign, maintained, and backed up, and it will stay that way. Self-hosting means the net goes down when your server does, at 7 PM on a Tuesday, with twenty people waiting.

**Worth it if** your group has a policy about where its data lives, you want the instance to survive the public one going away, you are an emergency communications group that needs to run without depending on somebody else's uptime, or you simply want to run your own. All of those are good reasons, and the project is built to be run by other people.

Be honest about the commitment. An instance needs TLS that renews, email that gets delivered rather than filtered, backups, and somebody who notices when it stops.

## What it needs

- **A small Linux server.** The public instance runs on a 1.8 GB VPS. That is enough, but it is not much: it is tight enough that the frontend build gets memory-starved on it, which is why builds happen elsewhere and ship as an artifact. Two gigabytes with swap is a more comfortable floor.
- **Python 3.11 or newer** for the backend, and **Node** to build the frontend.
- **A database.** SQLite by default, and it is a perfectly reasonable answer for a club net. PostgreSQL and MySQL are supported if you already run one.
- **A reverse proxy with TLS.** Caddy on the public instance, and nginx works.
- **Somewhere to send mail from.** ECTLogger's normal login is a magic link in an email, so email delivery is not optional garnish. Budget real time for it.

## Start here

**[Quick start](/docs/QUICKSTART/)** — the shortest path to a running instance, for evaluating it or running it on a LAN.

**[Manual installation](/docs/MANUAL-INSTALLATION/)** — step by step, for understanding what the quick start did.

**[Production deployment](/docs/PRODUCTION-DEPLOYMENT/)** — TLS, a reverse proxy, a service unit, and the things that matter once other people depend on it.

## Configuration

**[Magic link configuration](/docs/MAGIC-LINK-CONFIGURATION/)** — how long a login link stays valid, and why the default is longer than it looks like it should be.

**[Email deliverability](/docs/EMAIL-DELIVERABILITY/)** — SPF, DKIM, DMARC, and the reasons a magic link ends up in somebody's junk folder. The single most common source of "I cannot log in".

**[Logging](/docs/LOGGING/)** — log levels, what gets written where, and what to turn up when something is wrong.

## Security

**[Passwords and two-factor authentication](/docs/PASSWORD-MFA/)** — the password fallback for when email is down, TOTP enrollment, rate limiting, and recovering an admin account with no working authenticator.

**[Security](/docs/SECURITY/)** — what the application does to protect itself, and what it expects you to do.

**[fail2ban](/docs/FAIL2BAN/)** — banning the addresses that keep trying.

## Upgrading

Deploy by pulling from the repository, not by copying files onto the server. Copying causes drift between what is deployed and what is in version control, and the next deploy silently ships whatever the repository thinks is there. [Production deployment](/docs/PRODUCTION-DEPLOYMENT/) has the procedure, including the part people skip: rebuilding the frontend. A `git pull` alone does not change a single pixel of what users see, because the frontend is a static build.
