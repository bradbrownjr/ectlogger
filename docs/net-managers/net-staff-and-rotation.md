---
title: Net staff and the NCS rotation
summary: Who is allowed to run your net, adding operators who haven't signed up yet, co-managers, the NCS rotation, why an auto-created net deliberately starts with nobody assigned, and the link that invites people to subscribe.
kind: How-to
audience: Net owners, schedule owners, and co-managers
owner: KC1JMH
revised: 2026-10-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/net-managers/net-staff-and-rotation/
---

# Net staff and the NCS rotation

There are two separate lists here, and they answer two different questions. **Authorized Net Staff** answers "who is allowed to run a net from this schedule at all." The **NCS rotation** answers "whose turn is it this week", and it's entirely optional.

## Authorized Net Staff

<figure>
  <img src="/docs/img/net-managers/staff-and-rotation.png"
       alt="The Net Staff tab of Edit Schedule: the Schedule Manager, an Authorized Net Staff list with a co-manager star and an active/inactive switch per row, an NCS Rotation list below it with up/down reordering arrows, and a Subscribers section at the bottom with the schedule's subscribe link.">
  <figcaption>Staff can start and run nets the moment they're added, and so can anyone in the rotation below even if they were never added as staff. The rotation is optional; its added job is deciding who gets pre-assigned NCS ahead of time.</figcaption>
</figure>

From a schedule's **Net Staff** tab (or the **Staff** button on its card), add any operator to the **Authorized Net Staff** list and they can start and run nets from that schedule from that point on, with no rotation slot required. The **Schedule Manager**, whoever created the schedule or was later handed it, always has this access implicitly, and manages every net from the schedule, including one a staff member created by hand with **Create Net**. Nobody needs to click Create Net for a recurring schedule: each occurrence is created automatically the day before.

Each staff row has its own switch to disable someone temporarily without removing them, and a star to promote them to **co-manager**. Co-manager is a strictly higher tier than plain staff: it's for schedule-ownership actions (transferring ownership, merging schedules, archiving or deleting a net from this schedule), not for who can run a net night to night. Plain active staff can already do that.

The staff list, the rotation, and who has NCS on upcoming dates are public, so anyone can see who runs your net. Visitors who aren't signed in see call signs and first names only, and not which operators have an account yet. Nobody sees a staff member's email address.

**Since 2026-09-18, any active staff member can also claim NCS or Logger on a net just by checking themselves in as one**, the same as a rotation member could before; co-manager status isn't required for that. Pick **Check In as NCS** or **Check In as Logger** on the check-in banner or form when it's offered; see [Checking in](/docs/operators/checking-in/) for what that looks like. Only a genuine self-check-in grants a role this way. If Net Control or the Logger enters someone else's check-in by voice, it never grants NCS or Logger on their behalf, even if that person is staff.

## Operators who haven't signed up yet

You don't have to wait for every net control operator to make an account before you build the team. In the add box on the staff list, type the operator's callsign. If nobody with an account has that callsign, they're added **by callsign** and their row is marked **No account yet**. You can also give an email address there, and ECTLogger sends them an invitation to sign up. Their row then reads **Invited**.

An operator on the list by callsign can go in the rotation, take the fifth week, and be swapped in for a single night, just like anyone else. When their week comes up, the net names them as its NCS, so the net card, the report, the ICS-309, and the closing log all credit the right person. What they can't do is use ECTLogger's net controls, because there's no account to sign in with yet. Someone else, usually the Logger, runs the net in the app and checks them in. They also can't be made a co-manager until they have an account.

**If you invited them, they take over their spot as soon as they sign in with that address.** Their callsign is filled in for them, and their staff row, their rotation position, any swaps naming them, and any nets from this schedule where they were credited as NCS all move to their new account. You get an email saying they joined. Nothing is lost, and nobody has to re-add them.

**Anyone else waits for you.** Anybody can type a callsign into a profile, so a sign-up with that callsign and no invite to that address gets nothing by itself. You get an email, and their row shows **Signed up, confirm it's them** and a link button. Clicking it shows the account's name and part of its email address; link it once you're sure the new account is really them. Only an account's main callsign counts here, not the extra or GMRS callsigns on a profile. Only the schedule manager and co-managers can link someone, send invitations, or make someone a co-manager.

**To fix a typo** in a callsign, or to send an invitation you skipped, click the pencil on that row. A corrected callsign also changes in the rotation and on any swaps. If the corrected callsign already belongs to an account, the row joins that account straight away.

If you link someone and later find the callsign isn't theirs, an admin can undo it from the user's account in the admin panel, and banning that account undoes all of them at once. See [Users and roles](/docs/admins/users-and-roles/) for the admin side.

## The NCS rotation (optional)

The rotation is a separate, ordered list. Reorder it with the up/down arrows, or build it in one step from the **Build rotation from staff** button, which adds every active staff member (and the manager) who isn't already in it, including anyone on the staff list by callsign. Being in the rotation carries the same starting and self-grant access as being on Authorized Net Staff, even for someone added only to the rotation and never to the staff list. On top of that, it's what decides who gets **pre-assigned** NCS automatically, ahead of time, on each occurrence a recurring schedule creates. If the rotation is empty, nobody is pre-assigned (see below). Deactivate a rotation member the same way as a staff row, to skip them without losing their place in line.

A single date can be overridden from the schedule's **Schedule** tab in the Net Staff dialog: swap a specific night to someone else, or mark it as no coverage, without touching the rotation's permanent order.

## Why an auto-created net can start with nobody assigned

If a schedule has no rotation configured, its automatically created nets, and their auto-opened lobbies if that's turned on, start with **no one assigned as NCS**. This is intentional, not a bug: clubs routinely don't know who's available until the night of, and the fix isn't to guess a default assignment, it's for whoever shows up to claim it. Any active staff member does that just by checking themselves in as NCS, exactly as described above.

If a net somehow ends up active with nobody holding NCS at all (the assigned rotation member never showed, for instance), a **Claim NCS** button appears in the net's toolbar for anyone who can otherwise manage the net, so it's never permanently stuck.

## Assigning roles by hand

Net Control, Logger, and Relay can also be assigned directly from a net's **Roles** button ("Manage Net Control Staff"), which lists current assignments and lets you add or remove them. This works regardless of net status, so a role assigned to the wrong person on a closed net can still be corrected after the fact. It's a separate action from the self-grant above: this is for staff assigning someone else (or logging a Relay station), not for claiming a role yourself.

A net can legitimately have more than one active NCS at once: a multi-desk exercise with several people each running their own frequency, for example. The check-in list marks every NCS after the first as **2nd NCS** in its legend; it's not a separate assignable role, just how the list marks an additional active one. See [Station statuses](/docs/reference/station-statuses/) for the full legend.

## Inviting people to subscribe

A schedule's subscribers are emailed when one of its nets starts. Anyone can subscribe from the Schedule page, but that depends on them finding your net there first. To send people straight to it, copy the schedule's **Subscribe link** and post it wherever your group already looks: a club website, an email, a dashboard.

<figure>
  <img src="/docs/img/net-managers/subscribe-link.png"
       alt="The Subscribers tab of the Staff dialog: a Subscribe link field holding the schedule's link, with the Copy link button beside it outlined in red, above a subscriber list that is still empty.">
  <figcaption>The link sits above the subscriber list, so the people it brings in show up right below it.</figcaption>
</figure>

The link is above the subscriber list in two places: the **Subscribers** tab of the **Staff** dialog, and the bottom of the **Net Staff** tab when you edit the schedule. Click **Copy link**. It's offered to the same people who can see the subscriber list: the schedule manager, co-managers, and admins.

Whoever opens the link sees the net's name, description, when it runs, and its frequencies, with one **Subscribe** button. Someone who isn't signed in gets **Sign in to subscribe** instead and is brought back to the same page afterward, which also works for a person creating their account on the spot. Opening the link never subscribes anybody by itself; they always click the button.

The link doesn't expire and it isn't a secret. It shows nothing the public Schedule page doesn't already show, so it's safe to post in the open. A link to a schedule that has since been deactivated tells the visitor the net is no longer scheduled.

## Related

Assigning a role to yourself while checking in, and stepping back down to a standard participant afterward, are covered from the operator's side in [Checking in](/docs/operators/checking-in/) and [Status, rechecks, and checking out](/docs/operators/status-and-checking-out/). The complete list of roles and what each one can do is [Roles and permissions](/docs/reference/roles-and-permissions/).
