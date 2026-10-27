---
title: Signing in
summary: The magic link, changing the address it goes to, backup addresses, the password fallback for when email is down, and two-factor authentication.
kind: How-to
audience: Operators
owner: KC1JMH
revised: 2026-10-27
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/operators/signing-in/
---

# Signing in

There are two ways into your account and one optional thing that sits on top of both. The magic link is the normal way and needs nothing set up. A password is a fallback you turn on yourself, for the night email isn't working. Two-factor authentication adds a six-digit code to whichever of those you used.

You don't choose one and give up the others. All three can be live on the same account at once.

## Sign in with a magic link

1. Go to the sign-in page and type your email address.
2. Click **Send Magic Link**.
3. Open the email and click the link in it.

That is the whole thing. If nobody has ever signed in with that address, clicking the link creates the account right then, so there is no registration form to fill in first.

The link stays valid for 30 days, which is deliberate: during a multi-day activation, nobody wants to be signed out at three in the morning. Bookmark the email rather than retyping your address each time and it will sign you back in instantly, even if your browser clears its cookies or you move to another device.

After 30 days the link stops working. Opening it then shows **This sign-in link has expired** with a **Send me a new link** button: one click emails a fresh link to the same address, so you never have to type it again. Keep the new email in place of the old one. A link that was cut off when it was copied or forwarded shows **This sign-in link didn't work** instead, and needs a new one from the sign-in page.

If the message has not arrived in a minute or two, check your spam folder. If your club runs its own instance and no message ever arrives, that is the server's mail configuration and not something you can fix from here; tell whoever runs it.

## If your callsign already has an account

Signing in with an address you haven't used before creates a new, empty account. If you already made one with a different address, saving your callsign on the new account is refused with a message that the callsign already has an account. Sign out and sign in with the address you used first; your check-ins and roles are all there. If you can't remember it or no longer have it, ask an administrator. They have already been told, and they can merge the new account into your original one, after which both addresses sign you in to it. Adding a [backup email](#add-a-backup-email) once you are back in keeps it from happening again.

## If the sign-in page does nothing

Two browser settings break sign-in in ways that don't look like browser settings.

**Scripts blocked.** ECTLogger is a JavaScript application. With scripts blocked for the site, by NoScript, a privacy extension turned up to strict, or a policy set by whoever manages the computer, the page still draws but its buttons do nothing at all.

**An ad or privacy blocker.** The addresses ECTLogger uses to send a magic link and to complete one both have the words `magic-link` in them, and some blocker lists match on that, so the request never leaves your browser. It looks like a fault at our end: **Failed to send magic link** when you click the button, or a link from your email that opens a page which never finishes signing you in. That is why the error message on screen mentions your ad blocker.

The fix for both is to allow this one site in whichever extension is responsible, by allow-listing `app.ectlogger.us` or your club's own address, rather than turning the extension off everywhere. A private window normally runs with extensions disabled, so if sign-in works there and not in an ordinary tab, you have found your answer.

## Change your sign-in email

The magic link goes to the address on your account, so that address is your account. Change it when you are about to lose the mailbox (a new job, a closed provider), or when the address itself names a callsign you no longer hold after an upgrade, a vanity call, or a move to another district.

1. Open **Profile**, then the **Security** tab.
2. Under **Sign-in email**, type the new address into **New email**. If you have two-factor authentication turned on, also type the current code into **Two-factor code**.
3. Click **Send link**.
4. Open the email that arrives at the new address and click **Confirm email**, then **Confirm new email** on the page it opens.

<figure>
  <img src="/docs/img/operators/security-email-card.png"
       alt="The Sign-in email section at the top of the Profile page&#x27;s Security tab. It names the address the account signs in with, above a New email field holding a new address and the Send link button, outlined in red.">
  <figcaption>The link goes to the new address. Nothing changes until it is opened there.</figcaption>
</figure>

Nothing changes until step 4, and the link works for 24 hours. It can be opened on any device, signed in or not. Once it goes through, your old address gets a notice that it happened, and sign-in links sent to the old address stop working for your account. Your callsign, check-ins, roles, and everything else stay exactly as they were.

The confirmation goes to the new address, not the old one, on purpose: losing the old mailbox is one of the reasons to change it. If you have already lost it and are signed out everywhere, you can't do this yourself. Ask an admin on your instance, who can change it for you from the admin panel.

If the **New email** field is greyed out and reads "Locked by an administrator", an admin has locked your email, and only an admin can change it.

## Add a backup email

A backup email is a second address that also signs you in. Add one before you need it: if you lose the mailbox your sign-in email lives in, a magic link sent to the backup still opens your account, with everything in it. You can have up to three.

1. Open **Profile**, then the **Security** tab.
2. Under **Backup emails**, type the address into **Backup email**. If you have two-factor authentication turned on, also type the current code into **Two-factor code**.
3. Click **Send link**.
4. Open the email that arrives at that address and click **Confirm backup email**, then **Confirm backup email** again on the page it opens.

<figure>
  <img src="/docs/img/operators/security-backup-emails.png"
       alt="The Backup emails section of the Profile page&#x27;s Security tab. One backup address, priya.home@example.org, is listed with Make primary and Remove buttons beside it. Below, a Backup email field holds a second address and the Send link button is outlined in red.">
  <figcaption>Each backup is added only once the link sent to it is opened.</figcaption>
</figure>

The address is added only at step 4, and the link works for 24 hours. A backup gets the security notices your sign-in email gets, such as failed sign-ins and password changes, and nothing else: net logs, reminders, and every other email still go only to your sign-in email.

Next to each backup are two buttons:

- **Make primary** swaps it with your sign-in email. Email goes to it from then on, and your old sign-in email becomes a backup, so nothing stops signing in. Use this once you know you are losing the old address.
- **Remove** takes it off your account. Sign-in links sent to it stop opening your account straight away.

Both ask you to confirm, and for your two-factor code if you have it on. Every address on your account is emailed whenever one is added, removed, or made primary, so if someone else ever gets into your account and adds their own address, you hear about it. If the buttons are greyed out, an admin has locked your email, and only an admin can change your addresses.

## Set a password

A magic link needs a working inbox, and there are nights when you don't have one. Your club's mail server has a bad day, your provider decides ECTLogger is spam, or you are operating from somewhere you can reach a repeater but not your email. A password gets you in with nothing but the browser in front of you.

1. Open **Profile**, then the **Security** tab.
2. Type the password you want into **Password**, and again into **Confirm Password**. If you already have one, that first field reads **New Password** and there's a **Current Password** above it to fill in first.
3. Click **Set Password**, or **Change Password** if you're replacing one.

<figure>
  <img src="/docs/img/operators/security-password-card.png"
       alt="The Password section of the Profile page's Security tab, with Current Password, New Password, and Confirm Password fields and the Change Password button outlined in red below them.">
  <figcaption>A password is a fallback, not a replacement. The magic link keeps working whether you set one or not.</figcaption>
</figure>

It has to be at least 12 characters and contain a lowercase letter, an uppercase letter, a number, and a symbol.

To use it, click **Sign in with a password instead** at the bottom of the sign-in page. That swaps the single email field for **Callsign or Email** and **Password**. Either your callsign or your email address works in the first one. **Use a magic link instead** switches back.

<figure>
  <img src="/docs/img/operators/login-password-link.png"
       alt="The ECTLogger sign-in page, with the Sign in with a password instead link outlined in red below the Send Magic Link button.">
  <figcaption>Easy to miss, because most people never need it. It is at the bottom of the sign-in page.</figcaption>
</figure>

Five wrong passwords in a row lock password sign-in on that account for 15 minutes. Your magic link still works during a lockout, so this is an inconvenience rather than a way to get shut out of your own account.

## Turn on two-factor authentication

Two-factor authentication (MFA) means that after your password or magic link, ECTLogger also asks for the six-digit code from an authenticator app on your phone. It's optional for everyone except admins, who are required to have it.

Worth turning on if your account can do damage: you run a net, you own a schedule, or you hold a role where somebody impersonating you would be believed on the air. It also makes you verifiable on an [authenticated net](/docs/net-control/authenticated-nets/), where Net Control confirms a station really is the account it claims to be by comparing that same code over the air.

1. Open **Profile**, then the **Security** tab, and click **Set Up Two-Factor Authentication**.
2. Scan the QR code with your authenticator app. If you can't scan it, the key is printed underneath with a button to copy it, and every app takes a typed key.
3. Type the six-digit code your app now shows into **Verification Code** and click **Confirm**.
4. ECTLogger shows eight one-time backup codes. Save them, then click **I've Saved These Codes**.

<figure>
  <img src="/docs/img/operators/security-two-factor-setup.png"
       alt="The Two-Factor Authentication section of the Security tab, explaining that it adds a 6-digit code from an authenticator app, with the Set Up Two-Factor Authentication button outlined in red.">
  <figcaption>Directly below the password section on the same tab.</figcaption>
</figure>

<div class="callout warning">
  <span class="callout-label">Warning</span>
  <p>Save the backup codes somewhere other than the phone running the authenticator. They exist for the day that phone is lost, stolen, or in pieces on the shoulder of Route 302, and a copy stored on it is no copy at all. Each one works once.</p>
</div>

## What changes once it is on

- **Every sign-in asks for a code, including a magic link.** After you click the link, the page asks for the six digits before it finishes signing you in. People expect the second factor to apply only to the password, and it doesn't.
- **A backup code works anywhere the app's code does**, once each. You get eight.
- **Replace Authenticator**, on the same Security tab, moves your account to a new phone. It asks for your password, then runs the same scan-and-confirm and issues a fresh set of backup codes, which retires the old set.
- **Disable** turns it off again, and also asks for your password.

Admin accounts are the exception: an admin cannot disable or replace their own two-factor authentication, because an admin who could turn it off on demand would make it optional in practice. Another admin resets it for them.

## If you get a failed sign-in email

When several wrong passwords are typed for your account in a short time, or one wrong two-factor code, ECTLogger emails you a list of the attempts with the time, the internet address, its approximate location, and the browser. Your instance's admins get a copy.

If it was you, nothing needs doing. If it wasn't:

- **Wrong passwords:** nobody got in. Set a strong password you don't use anywhere else, and turn on two-factor authentication if you haven't.
- **A wrong two-factor code:** whoever it was typed your **correct password**. Change your password now. Two-factor authentication is what stopped them.

## If you lose your authenticator

Work down this list:

1. **Sign in with a backup code** in place of the six digits, then use **Replace Authenticator** to enroll the new phone. This is the whole reason the codes exist.
2. **Out of backup codes:** ask an admin on your instance to reset your two-factor authentication. That clears the enrollment so you can set it up again from scratch, and it is a normal thing to ask for. See [security, MFA, and lockouts](/docs/admins/security-and-mfa/) for what they do at their end.
3. **You are the only admin:** nobody can reset it through the app, by design. It takes a command run on the server itself. Whoever has shell access to the instance will find it in [passwords and two-factor authentication](/docs/PASSWORD-MFA/).

## Next

[Your account and profile](/docs/operators/account-and-profile/) covers everything else on the Profile page: your callsign, your default location, and what other operators can see about you. [In the field](/docs/operators/in-the-field/) is the phone-and-battery version of all of this, including why a password is worth setting before you need it.
