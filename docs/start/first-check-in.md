---
title: Check into your first net
summary: Get an account, find the net your club is running, and put your callsign on the list. About five minutes.
kind: Tutorial
audience: Anyone new to ECTLogger
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/start/first-check-in/
---

# Check into your first net

By the end of this you will have an account and your callsign will be on a net's check-in list, visible to Net Control and to everyone else watching.

You need a callsign, an email address you can read right now, and a browser. Nothing to install.

This walkthrough uses [app.ectlogger.us](https://app.ectlogger.us), the hosted instance. If your club runs its own, use that address instead; everything else is identical.

## 1. Get in

Go to the site. If you are not signed in, you land on the sign-in page.

Type your email address and click **Send Magic Link**.

<figure class="control-figure">
  <img src="/docs/img/start/login-magic-link.png"
       alt="The ECTLogger sign-in page, with an Email Address field filled in and the Send Magic Link button outlined in red below it.">
  <figcaption>One field and one button. There is no account to create first.</figcaption>
</figure>

There is no separate sign-up step. If that address has never been used here, clicking the link in the email creates the account on the spot.

Now go and read your email. The message has a link in it; click it, and you are signed in. The link is good for 30 days, which is deliberate: during a multi-day activation nobody wants to be signed out at three in the morning. Bookmark that email rather than retyping your address every time, and you will stay signed in even if your browser clears its cookies or you move to another device.

If the email does not arrive within a minute or two, check the spam folder. If your club runs its own instance and no message ever arrives, it is almost certainly the server's mail configuration and not you; tell whoever runs it.

## 2. Fill in who you are

The first time you sign in, ECTLogger asks for your name and your callsign before it lets you do anything else.

Put your real name in **Name**, and your callsign in **Primary Call Sign**. Net Control will be reading both off the screen while they work the list, so this is not the place for a handle or a link. Put a callsign in even though the field says it is optional: it is what your check-ins get filed under, and the whole app is organized around it.

If you hold more than one callsign, or a GMRS callsign as well, add the rest later in your profile. See [your account and profile](/docs/operators/account-and-profile/).

## 3. Find the net

You land on the dashboard, which lists the nets on this instance. An active net carries a green **active** chip.

Find the net you want and click **View**.

<figure>
  <img src="/docs/img/start/dashboard-view-button.png"
       alt="A net card on the dashboard, with its green active chip in the corner and the View button at the bottom outlined in red.">
  <figcaption>View opens the net. Nets you can still take part in sort ahead of ones that are over.</figcaption>
</figure>

If the list is long, the search box filters by net name, description, Net Control's callsign, or frequency. If the net you want is not there at all, it may not have started yet, or it may already be closed; [finding a net](/docs/operators/finding-a-net/) covers where everything else lives.

## 4. Check in

The net has a toolbar across the top. Click **Check in**, over on the right of it.

<figure class="control-figure">
  <img src="/docs/img/start/checkin-toolbar-button.png"
       alt="The net toolbar, with the Check in button outlined in red among the Search, Map, Announcements, Notes, Topics, and Stats buttons.">
  <figcaption>The net toolbar. What is on it depends on whether you are checked in yet.</figcaption>
</figure>

A dialog opens with your callsign already filled in. Every other field is optional unless this net's manager has asked for it.

<figure class="control-figure">
  <img src="/docs/img/operators/check-in-dialog.png"
       alt="The Check In dialog, with the Check In button outlined in red at the bottom right of the form. Only the Callsign field is required by default.">
  <figcaption>Only the callsign is required by default. Some nets ask for more, and those fields are marked.</figcaption>
</figure>

Fill in **Location** if you can. It is what puts you on the net's map, and it accepts a town and state, a grid square, or coordinates. The [location formats](/docs/reference/location-formats/) page lists everything it understands.

Click **Check In**.

## 5. You are on the list

Your callsign appears in the check-in list, with a green check mark against it and the time you checked in.

<figure>
  <img src="/docs/img/start/checked-in-row.png"
       alt="A check-in list with fifteen rows in it, the reader's own N1DUNE callsign outlined in red in the last row, alongside a green check mark, the name Robin Teague, and the location Freeport, ME.">
  <figcaption>Your own row is the one with a status dropdown on it. Everyone else's is read-only to you.</figcaption>
</figure>

That is it. You are logged, Net Control can see you, and the net's record will show that you took part.

Two things worth doing before you close the tab:

- **Set your status honestly if it changes.** The dropdown on your own row is yours. If you step away from the radio, set **Away**; if you are only monitoring, set **Listening only**. Net Control works the list from top to bottom and calls people who say they are there.
- **Check out when you leave.** Click **Check out** in the toolbar. It does not remove you from the log or the map, it just tells Net Control not to wait for you.

## Where to go next

The [operators path](/docs/operators/) covers all of this properly: [status, rechecks, and checking out](/docs/operators/status-and-checking-out/), [chat and polls](/docs/operators/chat-and-polls/), [your location and the map](/docs/operators/location-and-the-map/), and what the app counts toward [your statistics](/docs/operators/your-statistics/).

If you would rather run a net than check into one, [run your first net](/docs/start/run-your-first-net/) is the next tutorial.
