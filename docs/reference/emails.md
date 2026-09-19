---
title: Emails we send
summary: Every message ECTLogger sends, what triggers it, who gets it, and how to stop getting it.
kind: Reference
audience: Everyone
owner: KC1JMH
revised: 2026-09-19
review_by: 2027-09-19
applies_to: ECTLogger, hosted and self-hosted
permalink: /docs/reference/emails/
---

# Emails we send

Every one of these is read directly from the sending code, not from memory. Most respect two layers of preference: the "Enable email notifications" master switch in Profile settings that silences everything below it, and a per-message toggle for the ones that are genuinely optional. A handful are treated as operational rather than a preference and go out regardless of the per-message toggle — each row below says which.

## Account and access

<div class="table-scroll" markdown="1">

| Email | Trigger | Recipients | To stop it |
|---|---|---|---|
| Magic link | You request one on the sign-in page | The address you entered | Nothing to turn off — it's how you sign in. |
| Password changed | You change your own password, or an admin resets it for you | The account's email | Nothing to turn off — a security notice, sent regardless of your email preferences. |

</div>

## Net lifecycle

<div class="table-scroll" markdown="1">

| Email | Trigger | Recipients | To stop it |
|---|---|---|---|
| Net starting | The first moment a net becomes visible to check into — a human opening its lobby, or it going live directly. An automatically opened lobby stays silent until a person confirms the net is really happening. | The net's manager, plus every subscriber to that schedule | Profile setting "Net start notifications" (on by default), and the master switch. |
| Net closure log | The net closes | The net's manager, every explicit subscriber to that schedule, and (since 2026-09-05) every active NCS, Logger, and Relay on that specific net — so running a net you never separately subscribed to still gets you the log | Profile setting "Net close notifications (with log)" (on by default), and the master switch, checked per recipient |
| Duty reminder (NCS) | 24 hours and 1 hour before your scheduled rotation slot | The rotation member on duty for that occurrence | The master switch only — this is a duty reminder, not an optional preference, so there's no separate toggle for it |
| Duty reminder (staff) | 1 hour before a net from a schedule you're active staff on, whether or not you've separately subscribed | Every active staff member for that schedule, skipped if you already got the NCS or subscriber reminder for the same net | The master switch only, same reasoning as the NCS reminder |
| Subscriber reminder | 1 hour before a net you've subscribed to, if you opted into reminders specifically | Subscribers with the reminder preference on | Profile setting "Net reminder (1 hour before)" (off by default — subscribing to a schedule alone does not turn this on), and the master switch |
| Duty roster changed | The pre-assigned NCS for an upcoming, not-yet-started net changes because the rotation roster was edited | Both the previously-assigned and the newly-assigned operator | Sent regardless of your email preferences, as of this writing — there is no way to opt out of this one |
| Net cancelled | A specific date on the schedule is marked cancelled with no replacement NCS | The operator who would have been on duty, plus every subscriber to that schedule | Sent regardless of your email preferences, as of this writing |

</div>

The closure log arrives as a full ICS-309 form if the net itself has ICS-309 enabled, or if you personally prefer ICS-309 ("Use ICS-309 format" in Profile settings, off by default) even when the net doesn't — otherwise it's the plain check-in log.

## Traffic handling

Only relevant on a net with [traffic](/docs/reference/glossary/) enabled.

<div class="table-scroll" markdown="1">

| Email | Trigger | Recipients | To stop it |
|---|---|---|---|
| Traffic reminder | Escalating: while you're still holding a piece of formal traffic, at intervals set by its precedence — Emergency at 1h/4h/12h held, Priority at 4h/12h/24h, Routine/Welfare at 24h/72h/168h | Whoever currently holds the message | The master switch only. There's a per-message preference behind this in the data model (on by default, described as an operational obligation rather than a passive preference), but as of this writing no Profile screen exposes a way to turn it off separately from the master switch. |
| HXB final notice | A message carrying an HXB(n) handling instruction (an expiration time) reaches that deadline | Whoever currently holds the message | Same as above |
| Weekly stale traffic digest | Once a week, only for a schedule that opted into the digest, if it has traffic that's gone stale | The schedule's manager and active co-managers | Same as above |

</div>

## Digests and feedback

<div class="table-scroll" markdown="1">

| Email | Trigger | Recipients | To stop it |
|---|---|---|---|
| What's New digest | Daily at 8 AM, if anything shipped the day before | Everyone who opted in | Profile setting "What's New emails" (off by default), and the master switch |
| Feedback notification | Someone submits Submit Feedback from the Help menu | Every admin account | Not something the submitter receives or can opt out of — it's the copy that reaches the people who can act on it |

</div>

See [Getting help](/docs/about/getting-help/) for what Submit Feedback actually sends, and [Roles and permissions](/docs/reference/roles-and-permissions/) for who counts as staff, manager, or co-manager above.
