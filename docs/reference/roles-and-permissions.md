---
title: Roles and permissions
summary: Every role ECTLogger has, at every level, and a grid of who can do what. Check here before assuming somebody cannot do something.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-11-07
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/roles-and-permissions/
---

# Roles and permissions

ECTLogger has roles at three different levels: a global account role, a per-net role that lasts only for one net, and a set of schedule-level tiers that only exist for nets created from a recurring schedule. Most confusion about "why can't this person do that" comes from mixing up which of the three levels applies to a given action.

**One rule covers most of the grid at the bottom**: a net's manager and any global admin can do everything on this page related to that net. On a net from a schedule, the schedule's manager counts as that net's manager too, even when someone on the staff created that one net by hand with **Create Net** and so owns it. There are two exceptions, both footnoted there: a net's manager who is not on the schedule's staff cannot self-grant NCS by checking in the way they can Logger (see footnote 2), and an admin cannot self-grant on a schedule they are not staff on, since that path draws on the schedule's own staff and rotation. Everything else on this page is about who *else*, besides the manager and an admin, can do a given thing.

## Global account roles

Every account has one of these, set on the account rather than on any particular net:

<div class="table-scroll" markdown="1">

| Role | What it changes |
|---|---|
| Admin | Full access to every net and schedule and the admin panel. **Must have two-factor authentication (TOTP) enabled.** An admin who hasn't enrolled is locked out of admin actions until they do. |
| User | The default for every real account. No special access on its own; what a User can do on any given net or schedule comes entirely from the per-net and schedule-level roles below. |
| NCS | Assignable from the admin panel's user editor. It is treated the same as User and does not grant NCS on any net. Per-net NCS access comes from a per-net role or an eligible self-grant (both explained below). |
| Guest | Not assigned to anyone. A check-in with no linked account (someone who checked in by callsign only) is a guest *check-in*, which is a different thing from this account role. |

</div>

The global "NCS" account role is not the NCS role on a specific net (next section). Only the second one does anything.

## Per-net roles

While a net exists, an operator can hold one or more of these roles on that specific net (and only that net):

- **NCS** — runs the net.
- **Logger** — assists NCS with logging.
- **Relay** — checks in stations NCS cannot hear directly.

A net can have more than one active NCS at once (a multi-desk exercise is normal; see [Station statuses](/docs/reference/station-statuses/) for how the check-in list marks a second simultaneous NCS with the "2nd NCS" badge). A role can be stepped down without removing it: **only an *active* per-net role counts.** An operator who steps down to Standard (the "Acting as NCS" toggle) loses NCS access to that net, along with the crown icon next to their name. An NCS who is the only active NCS on an active net cannot step down until someone else is assigned.

A guest check-in (a station with no account) can also be marked NCS, Logger, or Relay. That is a **credit only**: the net card, report, ICS-309, and closing log name the station, but it grants nothing, because there is no account to grant it to. Whoever may use the net's Roles dialog may give or remove one.

## Schedule-level tiers

These are set on a net's schedule. Every net has one, including a one-time net, whose schedule runs once; they apply only to nets from that schedule.

<div class="table-scroll" markdown="1">

| Tier | What it is | What it grants |
|---|---|---|
| Schedule manager | The account that created the schedule (or was later handed it), shown as **Schedule Manager** on its staff tab | Everything a co-manager can do, and everything a net manager can do on every net from this schedule, whoever created it |
| Co-manager | A member of the schedule's "Authorized Net Staff" list with the co-manager flag set | Transfer schedule ownership, merge this schedule into another, archive or delete a net from this schedule, plus everything plain net staff can do |
| Net staff | A member of the schedule's "Authorized Net Staff" list, without the co-manager flag | Edit the schedule and its settings, manage the rotation and staff list, start and run nets from this schedule, and self-grant NCS or Logger by checking in (below) |
| Rotation member | Listed in the schedule's NCS rotation, whether or not they're also on the staff list | Everything plain net staff can do; rotation membership and staff membership give the same access for self-grant and running nets |

</div>

A staff or rotation entry can also name a **callsign with no account yet**. It grants nothing at all until that operator signs in with the address the schedule invited, or the schedule manager or a co-manager links their account; until then it only decides who the net credits as NCS on that operator's week. It can't be made co-manager. Linking accounts, sending invitations, and making someone a co-manager are for the schedule manager, co-managers, and admins only; plain staff can't. See [Net staff and the NCS rotation](/docs/net-managers/net-staff-and-rotation/).

"Net staff" and "rotation member" give the same access; a person can be one, the other, or both. That access covers three actions: self-granting NCS or Logger by checking in (below), starting a net, and opening the Manage Net Control Staff dialog once you hold a role there.

**Close net, Edit net, Go live, and Archive/Delete need the net's manager, an admin, or an active role on this specific net** (see the grid below): plain staff with no role yet on this occurrence take net control by checking themselves in as NCS or Logger. Import is the exception, since staff who can start a net can also backfill its log.

Each toolbar and net-card button appears only when that action would succeed for you.

## Who can create a schedule

Any account can create a schedule, but a standard user has to clear three anti-spam limits first, each configurable from Admin > Security and each off if set to 0: the account must be a minimum number of days old (7 by default), must have already checked into a minimum number of nets (1 by default; counted under any of the account's callsigns, as on its profile), and stays under a daily cap on new schedules per account (5 by default). An admin bypasses all three, and an admin can exempt one account from the age and net-count thresholds (not the daily cap) with the early-access button on the Users tab. A refused user can request that from the refusal message itself. This covers a single net as well as a recurring schedule: the dashboard's **+** button creates a one-time schedule behind the scenes, so it is held to the same thresholds.

## Becoming NCS or Logger by checking yourself in

An eligible operator does not need anyone to hand them a role. Checking themselves into a net can grant one, if they ask for it:

- **NCS**: any active net staff member or rotation member for that net's schedule, or the schedule's manager, checking in with the "Check in as NCS" choice, on a net where they don't already hold a role.
- **Logger**: the same population, plus the net's manager (covers the common case of a schedule's manager opening the lobby and stepping in as Logger while waiting for the scheduled NCS), checking in with "Check in as Logger."

This does not apply to a check-in someone else enters for you (only a self-check-in can grant a role), and a check-in is Standard unless NCS or Logger is chosen, so checking in normally never makes you NCS.

This does **not** depend on whether the net already has an active NCS. Several eligible staff can each claim NCS for their own desk in a large exercise.

## The grid

Read this as: given the row's action, which of the columns can do it. "Net manager" and "Admin" can do everything in this grid; they're included to show the rows where somebody *else* also can.

<div class="table-scroll" markdown="1">

| Action | Standard participant | Net staff / rotation member | Co-manager | Active NCS | Active Logger | Active Relay | Net manager | Admin |
|---|---|---|---|---|---|---|---|---|
| Check into a net, or log another callsign's check-in | Yes¹ | Yes¹ | Yes¹ | Yes | Yes | Yes¹ | Yes | Yes |
| Become NCS by checking yourself in | No | Yes | Yes | — | No | No | No² | No⁷ |
| Become Logger by checking yourself in | No | Yes | Yes | No | — | No | Yes | No⁷ |
| Edit or delete another station's check-in | No | No | No | Yes | Yes | No | Yes | Yes |
| Change net settings, upload a net logo | No | No | No | Yes | No | No | Yes | Yes |
| Start a net (draft/scheduled to lobby or active) | No | Yes³ | Yes³ | Yes | No | No | Yes | Yes |
| Go live (lobby to active) | No | No | No | Yes | No | No | Yes | Yes |
| Set or clear the active frequency | No | No | No | Yes | Yes | No | Yes | Yes |
| Close the net | No | No | No | Yes | Yes | No | Yes | Yes |
| Import check-ins from a CSV | No | Yes³ | Yes³ | Yes | Yes | Yes | Yes | Yes |
| Archive or delete a net | No | No | Yes | Yes⁴ | No | No | Yes | Yes |
| Claim NCS (recovery, only when none is assigned) | No | No | No | — | No | No | Yes | Yes |
| Email a net's subscribers or staff | No | No | Yes | No | No | No | Yes | Yes |
| Assign or remove net roles (Manage Net Control Staff dialog) | No | No⁵ | No⁵ | Yes⁵ | Yes⁵ | No | Yes | Yes |
| Step down your own active NCS role | — | — | — | Yes⁶ | — | — | — | — |
| Mute a station net-wide in chat | No | No | No | Yes | Yes | No | Yes | Yes |
| Remove and block a station from the net | No | No | No | Yes | Yes | No | Yes | Yes |
| Record which stations another station can hear (coverage logging nets only) | No⁸ | No⁸ | No⁸ | Yes | Yes | Yes | Yes | Yes |
| Log off-net activity for any station, on the ICS-309 without review | No⁹ | No⁹ | No⁹ | Yes | Yes | Yes | Yes | Yes |
| Accept, reject, or change a station's off-net entry | No | No | No | Yes | Yes | No | Yes | Yes |
| Read a net's drill plan and mark its messages sent | No | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Write, change, or rate a net's drill plan | No | No | No | Yes | No | No | Yes | Yes |
| Edit the schedule, rotation, or staff list | No | Yes | Yes | — | — | — | Yes | Yes |
| Transfer schedule ownership | No | No | Yes | — | — | — | Yes | Yes |
| Merge one schedule into another | No | No | Yes | — | — | — | Yes | Yes |

</div>

1. Only when the net allows self check-in. When a net has self check-in turned off, adding any check-in (your own or another callsign's) requires an active NCS or Logger role, the net's manager, an admin, or an explicit, eligible self-grant request (the row above).
2. The schedule's manager can, since they count as its net staff. Someone who is a net's manager only because they created it by hand, and who is not on that schedule's staff, cannot; they can still become NCS the ordinary way (an existing NCS/Logger assigns them the role, or Claim NCS if none exists).
3. Active net staff on that net's schedule specifically, even with no per-net role assigned yet, and equally anyone in that schedule's NCS rotation. Start gets you as far as the lobby; taking the net from lobby to active needs NCS, so whoever starts it usually checks themselves in as NCS next.
4. Archiving, deleting, cancelling, and restoring a net need an active NCS role on this specific net, or being the schedule's manager or an active co-manager for a net created from a schedule. A Logger cannot do any of these four.
5. Being net staff, a rotation member, or a co-manager is not enough by itself for this one: you also need an active NCS or Logger role on this specific net. An NCS or Logger handed the role directly, with no staff or rotation membership on that schedule, cannot reassign roles either. You need both.
6. Blocked if you are the only active NCS on a net that is currently active; assign someone else first.
7. Being an admin does not help on these two rows. Self-grant on check-in is drawn from the schedule's own staff and rotation, and an admin is in neither. An admin can assign themselves the role in the Manage Net Control Staff dialog.
8. Anyone checked in can record what their own station hears, unless the net's manager turned off **Allow stations to self-report**. Recording it for somebody else needs an active NCS, Logger, or Relay role on this net; schedule staff and co-managers take one by checking in as NCS or Logger first. See [Station coverage](/docs/net-control/station-coverage/).
9. Anyone signed in and checked into the net can log their own off-net activity. It waits for an active NCS or Logger, or the net's manager, to accept it before it goes on the ICS-309. See [Logging off-net activity](/docs/net-control/off-net-log/).

For who gets emailed about a role or a net's lifecycle, see [Emails we send](/docs/reference/emails/).
