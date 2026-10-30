---
title: Training sessions
summary: Posting a training session so it shows in everyone's Help menu, changing or removing it, and who can see its online meeting link.
kind: How-to
audience: Users holding the Admin role
owner: KC1JMH
revised: 2026-10-30
review_by: 2027-10-30
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/admins/training-sessions/
---

# Training sessions

When you're running a live training session, such as a walk-through of net control for a club or a county team, post it once and everybody finds it in the same place. It appears under **Help**, then **Training**, for every visitor, signed in or not.

There is no admin-panel tab for it. The sessions are edited in the same **Training** window everyone else reads, and only admins see the buttons to change them.

## Post a session

1. Open the **Help** menu and choose **Training**.
2. Click **Add session**.
3. Fill in the form:
   - **Title** (required), such as "Net control basics".
   - **Starts** (required). Enter the time on your own clock. Everyone else sees it converted to theirs, with their time-zone abbreviation, so there's nothing to work out for people in another zone.
   - **Ends** (optional). It has to be later than the start. If you leave it blank, the session stays listed for 2 hours after it starts.
   - **Location** (optional), for a session held in a room.
   - **Online meeting link** (optional). It has to start with `http://` or `https://`.
   - **Details** (optional). What to bring, who it's for, how to prepare. [Markdown](https://www.markdownguide.org/basic-syntax/) works here, so you can use bold text, lists, and links.
4. Click **Add session**.

The session shows straight away, in date order with the soonest first.

## The banner on the main pages

From the start of the day a week before a session (midnight on the reader's own clock, so the Thursday before a Thursday session, all day), a purple banner announces it across the top of the main pages: **Nets**, **Schedule**, **Traffic**, **Stats**, your profile, and the admin panel. It gives the title and time, and **In person** or **Online** (or both) for a session with a location or a meeting link, so people know how they can attend without opening anything. **More info** opens the Training window.

It never shows inside a net, on a net's report, or on the create and edit forms, where the room is needed. It stays up until the session is over, unless the reader closes it with the **✕**. A signed-in user's close is saved to their account, so it stays closed on every device. A visitor who isn't signed in closes it for that browser only. Either way, the next session gets its own banner.

When two sessions fall in the same week, the banner shows the sooner one first, and the other once that one is closed or over.

## Change or remove a session

Each session has a pencil and a trash can at its top right, which only admins see.

- **Edit session** opens the same form with the session's values filled in. Change what you need and click **Save changes**.
- **Delete session** asks you to confirm, then removes it for everyone.

A deleted session can't be brought back. Post it again if you removed the wrong one.

## Sessions clear themselves

You don't have to tidy up. Once a session's end time has passed, it drops off the list. A session with no end time drops off 2 hours after it starts. If the training runs long, edit the end time before it's over.

## Who can see the online meeting link

Only people who are signed in. A visitor who isn't signed in sees the session, its time, place, and details, plus a note that says **Sign in to see the online meeting link.** Signed-in users get a **Join online** button that opens the link in a new tab.

This keeps a video-call room off the open web, where anyone could find it. Put anything that is fine for the public in **Details**, and keep the call itself behind the link field.

## What the activity log records

Posting, changing, and removing a session each add an entry to the [activity log](/docs/admins/activity-log/), with who did it. A change lists each field's old and new value.

## If you don't see the buttons

- You need the **Admin** role, and your account has to have finished [two-factor enrollment](/docs/admins/security-and-mfa/), the same as for the rest of the admin panel.
- If you're using **View as Regular User**, the buttons are hidden on purpose. Exit that view to get them back.
