---
title: Roles and permissions
summary: Every role ECTLogger has, at every level, and a grid of who can do what. Check here before assuming somebody cannot do something.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/roles-and-permissions/
---

# Roles and permissions

ECTLogger has roles at three different levels: a global account role, a per-net role that lasts only for one net, and a set of schedule-level tiers that only exist for nets created from a recurring schedule. Most confusion about "why can't this person do that" comes from mixing up which of the three levels is actually the one that matters for a given action. This page is checked directly against the code, not written from memory.

**One rule covers most of the grid at the bottom**: a net's owner and any global admin can do everything on this page related to that net, with only two narrow exceptions noted below (Claim NCS, and template merge). Everything else on this page is about who *else*, besides the owner and an admin, can do a given thing.

## Global account roles

Every account has exactly one of these, stored on the user itself rather than on any particular net:

<div class="table-scroll" markdown="1">

| Role | What it actually changes |
|---|---|
| Admin | Full access to every net and schedule, the admin panel, and every admin-only API route. **Must have two-factor authentication (TOTP) enabled** -- this is enforced on every admin route, not just at login, so an admin who hasn't enrolled is locked out of admin actions until they do. |
| User | The default for every real account. No special access on its own; what a User can do on any given net or schedule comes entirely from the per-net and schedule-level roles below. |
| NCS | Assignable from the admin panel's user editor. As of this writing, no permission check anywhere in the backend treats an account with this global role any differently from an ordinary User -- it does not grant NCS on any specific net by itself. Per-net NCS access always comes from a per-net role or an eligible self-grant (both explained below), never from this account-level label. |
| Guest | Defined but not currently assigned anywhere in the application. A check-in with no linked account (someone who checked in by callsign only, with no ECTLogger login) is a guest *check-in*, which is a different thing entirely from this account role. |

</div>

Don't confuse the global "NCS" account role with holding the NCS role on a specific net (next section) -- they are unrelated, and only the second one does anything.

## Per-net roles

While a net exists, an operator can hold one or more of these roles on that specific net (and only that net):

- **NCS** -- runs the net.
- **Logger** -- assists NCS with logging.
- **Relay** -- checks in stations NCS cannot hear directly.

A net can have more than one active NCS at once (a multi-desk exercise is a normal pattern, not an error -- see [Station statuses](/docs/reference/station-statuses/) for how the check-in list marks a second simultaneous NCS with the "2nd NCS" badge). A role can be temporarily stepped down without removing it: **only an *active* per-net role counts for anything.** An operator who steps down to Standard (the "Acting as NCS" toggle) genuinely loses NCS access to that net, not just the crown icon next to their name -- the backend checks the same active flag the screen does. An NCS who is the *only* active NCS on an active net cannot step down until someone else is assigned, so a net is never accidentally left with nobody in charge.

## Schedule-level tiers

These only apply to nets created from a recurring schedule (a `NetTemplate`); an ad hoc net has none of them.

<div class="table-scroll" markdown="1">

| Tier | What it is | What it grants |
|---|---|---|
| Schedule owner | The account that created the schedule (or was later transferred it) | Everything a co-manager can do, plus is the only account (besides an admin) who can merge one schedule into another |
| Co-manager | A member of the schedule's "Authorized Net Staff" list with the co-manager flag set | Transfer schedule ownership, archive or delete a net from this schedule, plus everything plain net staff can do |
| Net staff | A member of the schedule's "Authorized Net Staff" list, without the co-manager flag | Edit the schedule and its settings, manage the rotation and staff list, start and run nets from this schedule, and self-grant NCS or Logger by checking in (below) |
| Rotation member | Listed in the schedule's NCS rotation, whether or not they're also on the staff list | Everything plain net staff can do -- rotation membership and staff membership grant the identical trust level for self-grant and day-to-day running of nets |

</div>

"Net staff" and "rotation member" grant the same practical access; a person can be one, the other, or both. This was tightened on 2026-09-18: for years, plain staff with no co-manager flag and no rotation slot could be shown management controls in the interface but were quietly refused by the backend the moment they tried to use one, because the underlying check only ever recognized co-managers and rotation members. A schedule with active staff but no rotation and no co-manager -- a real, unremarkable setup -- produced nets that nobody among its own staff could actually run, and an admin had to intervene by hand every single time. Plain active staff now has the access the interface already promised them.

## Becoming NCS or Logger by checking yourself in

An eligible operator does not need anyone to hand them a role. Checking themselves into a net can grant one on the spot, if they explicitly ask for it:

- **NCS**: any active net staff member or rotation member for that net's schedule, checking in with the "Check in as NCS" choice, on a net that doesn't already have a `NetRole` for them.
- **Logger**: the same population, plus the net's owner (covers the common case of a schedule owner opening the lobby and stepping in as Logger while waiting for the scheduled NCS), checking in with "Check in as Logger."

Two things this deliberately does *not* do: it never fires for a check-in someone else enters on your behalf (only a genuine self-check-in can grant a role), and it defaults to a Standard check-in unless NCS or Logger is explicitly requested -- there is no way to be silently made NCS by checking in normally. Both defaults exist because of a real incident (2026-08-30): an off-week rotation member was silently auto-granted NCS with no choice presented, simply by checking in as a participant.

This does **not** depend on whether the net already has an active NCS. A large exercise with several eligible staff each claiming NCS for their own desk within minutes of each other is the intended pattern, not something to block.

## The grid

Read this as: given the row's action, which of the columns can do it. "Owner" and "Admin" can do everything in this grid; they're included so you can see the handful of rows where somebody *else* also can.

<div class="table-scroll" markdown="1">

| Action | Standard participant | Net staff / rotation member | Co-manager | Active NCS | Active Logger | Active Relay | Owner | Admin |
|---|---|---|---|---|---|---|---|---|
| Check into a net, or log another callsign's check-in | Yes¹ | Yes¹ | Yes¹ | Yes | Yes | Yes¹ | Yes | Yes |
| Become NCS by checking yourself in | No | Yes | Yes | -- | No | No | No² | Yes |
| Become Logger by checking yourself in | No | Yes | Yes | No | -- | No | Yes | Yes |
| Edit or delete another station's check-in | No | No | No | Yes | Yes | No | Yes | Yes |
| Change net settings, upload a net logo | No | No | No | Yes | No | No | Yes | Yes |
| Start a net (draft/scheduled to lobby or active) | No | Yes³ | Yes³ | Yes | No | No | Yes | Yes |
| Go live (lobby to active) | No | No | No | Yes | No | No | Yes | Yes |
| Set or clear the active frequency | No | No | No | Yes | Yes | No | Yes | Yes |
| Close the net | No | No | No | Yes⁴ | Yes⁴ | No | Yes | Yes |
| Archive or delete a net | No | No | Yes | Yes⁴ | No | No | Yes | Yes |
| Claim NCS (recovery, only when none is assigned) | No | No | No | -- | No | No | Yes | Yes |
| Assign or remove net roles (Manage NCS/Logger dialog) | No | No⁵ | No⁵ | Yes⁵ | Yes⁵ | No | Yes | Yes |
| Step down your own active NCS role | -- | -- | -- | Yes⁶ | -- | -- | -- | -- |
| Mute a station net-wide in chat | No | No | No | Yes | Yes | No | Yes | Yes |
| Edit the schedule, rotation, or staff list | No | Yes | Yes | -- | -- | -- | Yes | Yes |
| Transfer schedule ownership | No | No | Yes | -- | -- | -- | Yes | Yes |
| Merge one schedule into another | No | No | No | -- | -- | -- | Yes | Yes |

</div>

1. Only when the net allows self check-in. When a net has self check-in turned off, adding any check-in (your own or another callsign's) requires an active NCS or Logger role, the net's owner, an admin, or an explicit, eligible self-grant request (the row above).
2. The net's owner is not automatically eligible to self-grant NCS the way they are Logger -- see "Becoming NCS or Logger" above. An owner can still become NCS the ordinary way (an existing NCS/Logger assigns them the role, or Claim NCS if none exists).
3. Active net staff or rotation member for that net's schedule specifically, even with no per-net role assigned yet.
4. Closing and archiving check whether you were ever assigned NCS or Logger on this specific net, not whether that role is still active -- unlike every other row, which requires the role to currently be active.
5. Being net staff, a rotation member, or a co-manager is not enough by itself for this one -- you also need to currently hold an active NCS or Logger role on this specific net. An NCS or Logger handed the role ad hoc, with no staff or rotation membership on that schedule, cannot reassign roles either, even though they're actively running the net -- both halves have to be true at once.
6. Blocked if you are the only active NCS on a net that is currently active -- assign someone else first.

For the underlying permission checks this grid is drawn from, see `backend/app/permissions.py`. For who gets emailed about a role or a net's lifecycle, see [Emails we send](/docs/reference/emails/).
