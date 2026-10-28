---
title: Your account and profile
summary: Your callsign, your default location, your email preferences, and what other operators can see about you.
kind: How-to
audience: Operators
owner: KC1JMH
revised: 2026-10-27
review_by: 2027-10-23
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/account-and-profile/
---

# Your account and profile

You can look at the [dashboard](/docs/operators/finding-a-net/), a net, the schedule list, and the statistics pages without signing in at all. The moment you want to check yourself in, chat, file traffic, or see your own numbers, you need an account. The good news: there is no registration form. Your account is created the first time you sign in.

## Getting in

Type your email address on the sign-in page, click **Send Magic Link**, and click the link in the email. If nobody has ever signed in with that address, that creates your account on the spot.

You can also add backup email addresses that sign you in if you lose your main one, set a password as a fallback for when email delivery is down, and turn on two-factor authentication on top of any of them. All of these live on the Profile page's **Security** tab, and all are covered in [signing in](/docs/operators/signing-in/).

<figure>
  <img src="/docs/img/operators/account-profile-tab.png"
       alt="The Profile page's Profile tab, showing the Name, Amateur Radio Call Sign, GMRS Call Sign, SKYWARN Spotter Number, and Default Location fields, with Save Changes at the bottom.">
  <figcaption>Your profile identity fields. Only Name is required.</figcaption>
</figure>

## Your profile

**Profile** tab:

- **Name** — required. Your display name across the app.
- **Amateur Radio Call Sign** — your primary callsign. A link to look it up on QRZ.com appears once you've entered one.
- **GMRS Call Sign** — if you also operate GMRS, so nets that mix modes can log you correctly.
- **Additional Callsigns** — any other callsigns you use (tactical, a second license, etc.), added and removed as a list of chips.
- **Previous callsigns** — read-only. If you change your primary callsign, the old one moves here automatically, and your check-in history under it is kept.
- **SKYWARN Spotter Number** — the ID your NWS office gave you, such as YO248 or CU-330. Letters, numbers, hyphens, and spaces only, up to 20 characters. Net control's check-in form fills it in for you on a net that asks for it.
- **Default Location** — your home QTH or grid square. Auto-fills the Location field when you check in. Can't contain a link or email address.
- **Website / YouTube Channel** — optional, shown on your profile popup (see below), not in the check-in list.

Your Name can't contain a link or email address either. These fields are copied into net check-ins, which reject links and email addresses, so they're checked when you save your profile rather than on the night of a net.

If a field is greyed out with "Locked by an administrator" beneath it, an admin has fixed it and locked it. Ask an admin of your ECTLogger instance if it needs changing.

**Settings** tab covers appearance and behavior: a color theme (or follow the system default), dark mode, whether times display in your local timezone or UTC, a **Show activity in chat** switch, and [location awareness](/docs/operators/location-and-the-map/) (browser GPS used to keep a live grid square). It also has a **Remember Net View Layout** switch and a **Reset Net View Layout** button. Those control whether the panels in a net (chat, activity log, script, map, and so on) stay where you last left them on this device.

**Notifications** tab is the email switchboard: a master switch, then per-event toggles for a subscribed net starting, a subscribed net closing (with the log attached, optionally as an [ICS-309](/docs/reference/emails/) form, even from a net that doesn't use one), a reminder an hour before a scheduled net, and an opt-in daily digest of what's new in ECTLogger.

## Your profile photo

Your photo appears next to your callsign in check-in lists and chat. Until you upload one, ECTLogger uses your [Gravatar](https://gravatar.com) if your email address has one, or else a circle with your initial. An administrator can turn Gravatar off for the whole site, in which case it's always your initial.

To use a photo of your own:

1. On the Profile page's **Profile** tab, click **Upload Photo** and pick a PNG, JPEG, or WebP image.
2. A **Crop Profile Photo** window opens. Drag the photo to position it in the circle, and use the **Zoom** slider (or scroll, or pinch on a phone) to fill it.
3. Click **Crop & Upload**.

Only the cropped square is uploaded, so a tall phone photo doesn't arrive squashed or sideways. **Replace Photo** swaps it for another, and **Remove** goes back to Gravatar or your initial.

<figure>
  <img src="/docs/img/operators/profile-photo-crop.png"
       alt="The Crop Profile Photo window, with a photo of a radio tower on a hill inside a circular crop guide, a Zoom slider below it, and Cancel and Crop &amp; Upload buttons. Crop &amp; Upload is outlined in red.">
  <figcaption>Position the photo in the circle, then Crop &amp; Upload. Only what's inside the square is saved.</figcaption>
</figure>

## What other people see about you

Click any callsign or avatar in a check-in list, or a callsign in chat, and a popup shows your name, avatar, and (if you added one) your website link, plus a QRZ.com link built from your callsign automatically. It also shows your role in the net you're both in, if you hold one, how many check-ins and nets you have, your most recent nets, and the nets you check into most. This works even for a check-in with no ECTLogger account behind it (someone Net Control logged by voice); the popup then shows whatever name and callsign were entered, without account details like a website link. Net Control and Loggers click the avatar, since clicking a callsign opens the row for them to edit. See [Checking in](/docs/operators/checking-in/) for what a check-in with no account means.
