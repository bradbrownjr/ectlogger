---
title: Sign in with Google, Microsoft and others
summary: Turning on Google, Microsoft or another OpenID Connect sign-in from the admin panel, registering the app with the provider, and which account a sign-in reaches.
kind: How-to
audience: Users holding the Admin role
owner: KC1JMH
revised: 2026-11-17
review_by: 2027-11-17
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/admins/sign-in-providers/
---

# Sign in with Google, Microsoft and others

The sign-in page can show a **Sign in with Google** or **Sign in with Microsoft** button beside the email link and password. Each one is set up in **Admin → Security**, under **Sign in with Google, Microsoft and others**, with nothing to change on the server. Any provider that speaks OpenID Connect works too, such as Authentik or Keycloak, under **Other (OpenID Connect)**.

A provider is an extra way in. The magic link and passwords keep working for everyone, whether a provider is on or not, and removing one later locks nobody out.

You need to be in admin mode to see the section: choose **Switch to admin** from your account menu and enter your code.

## Before you start

Each provider needs an app registered in its own console, and that app needs ECTLogger's **redirect address**: where the provider sends people back after they sign in. ECTLogger shows it with a **Copy** button when you add the provider, and it looks like this:

`https://app.ectlogger.us/api/auth/providers/google/callback`

The last part before `/callback` is `google`, `microsoft`, or the short name you give an Other provider. Your own address takes the place of `app.ectlogger.us`. Google and Microsoft both refuse a plain `http://` address for anything but `localhost` ([Microsoft's rule](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url#supported-schemes)), so a self-hosted server needs HTTPS first.

The provider gives you two values to bring back: a **client ID** and a **client secret**. Both providers show the secret once, when you create it, so copy it straight into ECTLogger.

## Add Google

In the [Google Cloud console](https://console.cloud.google.com/) ([Google's own steps](https://support.google.com/cloud/answer/15549257)):

1. Create a project, for example "ECTLogger".
2. Open **Google Auth Platform** and go through **Get started**. Choose **External** for the audience.
3. Under **Branding**, add your domain to **Authorized domains**, for example `ectlogger.us`. Google refuses a redirect address on a domain that isn't listed here.
4. Leave **Audience** on **Testing**. An app that asks only for a person's name and email address doesn't need a list of test users ([Google's audience rules](https://support.google.com/cloud/answer/15549945)).
5. Under **Clients**, choose **Create client**, then **Web application**. Paste the redirect address into **Authorized redirect URIs** and leave **Authorized JavaScript origins** empty.
6. Copy the client ID and the client secret.

Then in ECTLogger:

1. In **Admin → Security**, choose **Add**, then **Google**.
2. Paste the **Client ID** and **Client secret**.
3. Leave **Show on the sign-in page** on and choose **Save**.

Google says a new or changed redirect address can take from five minutes to a few hours to start working. Until it does, Google answers a sign-in with `redirect_uri_mismatch`.

## Add Microsoft

You need a Microsoft Entra tenant of your own: not your employer's and not a client's. A free Azure account comes with one, called "Default Directory".

In the [Microsoft Entra admin center](https://entra.microsoft.com) ([Microsoft's own steps](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)):

1. Go to **Entra ID**, then **App registrations**, then **New registration**.
2. Name it, for example "ECTLogger". Under **Supported account types**, choose **Any Entra ID Tenant + Personal Microsoft accounts** so people can use either a personal account or a work or school one.
3. Go to **Authentication**, then **Add Redirect URI**, then **Web**, and paste the redirect address ([Microsoft's steps](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri)).
4. On **Overview**, copy the **Application (client) ID**.
5. Go to **Certificates & secrets**, then **New client secret**. Copy its **Value**, not its Secret ID ([Microsoft's steps](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials)).
6. Go to **Token configuration**, then **Add optional claim**, then **ID**, tick `email` and `xms_edov`, and choose **Add** ([Microsoft's steps](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims)).

Then in ECTLogger, choose **Add**, then **Microsoft**, paste the two values, and save. **Who can sign in** decides between **Any Microsoft account, personal or work and school** and **Only my organization**, which asks for the **Tenant ID** from the app's Overview page.

<div class="callout warning">
  <span class="callout-label">Warning</span>
  <p>A Microsoft client secret expires, after 24 months at most. When it does, the Microsoft button stops working until you create a new secret and paste it in with <strong>Edit</strong>. Put the expiry date in your calendar when you create it.</p>
</div>

Step 6 matters. Microsoft lets an organization's administrator put any address on an account, so ECTLogger only trusts a Microsoft account's email address when `xms_edov` says the address's domain owner verified it. Without that claim, a Microsoft sign-in can't reach an existing account by email (see [which account a sign-in reaches](#which-account-a-sign-in-reaches)).

Some organizations stop their staff from approving any outside app. Their staff see a message that they need an administrator's approval. They can ask their IT department, or keep using the email link.

## Add another OpenID Connect provider

Choose **Add**, then **Other (OpenID Connect)**. It needs two more things than Google or Microsoft:

- **Short name** — lower-case letters, numbers and hyphens, like `authentik`. It becomes part of the redirect address, so it can't be changed once saved.
- **Issuer address** — from the provider's settings. ECTLogger reads the provider's settings from this address plus `/.well-known/openid-configuration`.

Register an app with the provider as a confidential web client using the authorization code flow, with the redirect address shown, and the scopes `openid`, `email` and `profile`.

## Check that it works

**Test** on each provider checks what can be checked without signing anyone in: that a client secret is saved and readable, and that the provider's settings are reachable and complete. A pass doesn't prove the client ID and secret are right. Sign in with the new button, in a private window, to finish checking.

## Which account a sign-in reaches

ECTLogger looks for the account in this order:

1. **An account already linked to that Google or Microsoft account.** After the first sign-in, this is how every later one finds you, even if your address with the provider changes.
2. **An account whose sign-in email or backup email matches**, when the provider vouches for the address. That links the two.
3. **A new account**, made the same way as a first email link, when **Create an account the first time someone signs in** is on and the address is in **Only these email domains** (or that field is empty).

Otherwise the sign-in is refused, and the person is told to sign in with their email instead. Once signed in, anyone can link a provider from **Profile → Security**, whatever address it holds. Linking covers every case the email match refuses.

**Two-factor authentication.** A provider sign-in doesn't ask for ECTLogger's six-digit code: Google's or Microsoft's own sign-in is the second step. An admin still enters the code to **Switch to admin**, and an admin who hasn't set up an authenticator is sent to set one up first, the same as after an email link.

## Change or remove a provider

**Edit** changes any field except the short name. Leave **Client secret** empty to keep the one saved. Turning off **Show on the sign-in page** takes the button off the sign-in page and stops sign-in with it, and keeps everyone's link for when you turn it back on.

**Remove** takes the provider away and unlinks every account linked to it. Those people sign in with an email link or password instead.

Adding, changing and removing a provider are recorded in the [activity log](/docs/admins/activity-log/), and so are provider sign-ins, links, unlinks, and failed attempts. The client secret is never shown again once saved, and never written to the log.

If the server's `SECRET_KEY` changes, saved client secrets can't be read any more. The provider shows a warning in Admin → Security, and its button leaves the sign-in page until you enter the secret again.

## Next

[Security, MFA, and lockouts](/docs/admins/security-and-mfa/) covers two-factor authentication and admin mode. Operators find their side in [signing in](/docs/operators/signing-in/#sign-in-with-google-or-microsoft).
