# Activation, Tag Board, and Callouts (Concept Draft)

Last updated: 2026-09-17

Part of the Team Management concept. This document covers what happens when a team is called on: who has the authority to activate it, what alert stages mean locally, which communications paths are planned and in what order, how members are reached, how the team knows who is actually where, and which versioned procedures govern all of it.

## Document Map

The Team Management concept is four interlinked documents, split once it outgrew a single readable file. **Section numbers are global across all four** — there is exactly one section 5.13 and it lives in the assets document. A cross-reference to "section 5.14" means the section carrying that number, in whichever document owns it. Do not renumber on a future move; update this table instead.

| Document | Owns | Teams phases |
|---|---|---|
| [Hub — Team Management](TEAM-MANAGEMENT-NOTES.md) | 1–4, 5.1–5.11, 5.16, 5.20, 6–9, execution-plan overview, 11, 12 | M0, M1, M1B, M2, M3, M4 |
| [Assets, Kits, and Custody](TEAM-ASSETS-CUSTODY.md) | 5.13 | M3A |
| [Activation, Tag Board, and Callouts](TEAM-ACTIVATION-CALLOUTS.md) | 5.14, 5.15, 5.18, 5.19 | M1A, M3B |
| [Incident and Drill Planner](TEAM-INCIDENT-PLANNER.md) | 5.12, 5.17 | M5, M6 |

The hub owns everything shared: problem statement, goals and non-goals, scope boundaries, personas, the user-story index, the data-model conventions, the permissions matrix, the privacy classification, the phase overview with model assignments, and the reference bibliography. Read it first; nothing in the other three is standalone design.

**This document covers Teams phases M1A and M3B** and accepts user stories TM-22, TM-23, TM-24, TM-35, TM-39 through TM-42, TM-47, and the procedure-handover portion of TM-28.

**Sections appear in workflow order, not numeric order:** 5.14 (activation authority, alert stages, PACE), 5.19 (tag board), 5.15 (optional SMS), 5.18 (procedure library and succession). The numbers are global across the document set and are not renumbered on a move; see the map above.

### The Line That Runs Through All of It

Every section here touches the same hazard from a different angle, so it is stated once at the top rather than re-argued four times:

> **Reaching someone is not the same as them answering, answering is not the same as being available, being available is not the same as being assigned, and none of those is deployment authority.**

Provider delivery, human acknowledgment, stated availability, assignment acceptance, physical presence, and agency authorization are six distinct facts. Collapsing any two of them produces a system that reports a team is responding when it is not. The tag board in 5.19 exists precisely because presence was the one fact this app had no way to record at all.

### 5.14 Activation Authority, Alert Levels, and PACE

Maintain a served-agency record with mission scope, agreement/procedure reference and review date, primary/alternate agency contacts, activation authority, approved team delegates, and reporting chain. A person permitted to send a callout is not necessarily permitted to authorize deployment. Record who requested and authorized the response, when, incident/reference number if supplied, and any limits on the task. Verbal requests can be recorded with attribution and later documentation.

The [ARRL ARES Plan](https://www.arrl.org/files/file/ARES%20Plan%20July%202025.pdf) recommends scenario-specific quick-start procedures. [FEMA mobilization guidance](https://emilms.fema.gov/_is0700b/groups/37.html) advises waiting for official deployment notification. Apply these as a distinction between preparedness monitoring, availability requests, and authorized assignments, including emergency phone/radio workflows when the app is unavailable.

**Proposed local alert vocabulary:** Normal; Advisory/Monitor; Standby/Availability Requested; Activated/Assignments Issued; Demobilizing; Closed. Labels/colors can be adapted to the adopted local manual. Always show words and required actions, not color alone. Store SKYWARN, exercise, ARES/RACES/other agency context as separate attributes rather than forcing them into a severity ladder. A weather warning may justify monitoring under an approved standing procedure; it does not itself authorize an EOC visit, trailer movement, or an SMS blast.

For each mission or communications path, define **PACE — Primary, Alternate, Contingency, Emergency** methods, with endpoint/contact, approved channel settings, infrastructure dependencies, switching trigger, switching authority, and last exercise result. Multiple choices using one repeater site, power source, or internet connection are not independent fallbacks. Use [CISA's PACE guidance](https://www.cisa.gov/sites/default/files/2024-10/2024_NCSWICPTE_Leveraging_PACE_Plan_Emergency_Comms_Ecosystems.pdf) as a reference; the team must select and test the actual methods.

**Brad's proposed storm procedure, to be adopted with the EMA:** distribute a current radio rendezvous card in advance. It specifies what conditions trigger monitoring; which primary repeater to use; approved fallback sequence; listening/check-in windows and timezone; how NCS/deputy coverage is arranged; and what to do if the repeater or NCS cannot be heard. Resolve the primary choice and fallback channels from current local confirmation, not a neighboring county's plan. Record availability and relay needs over the air when necessary. Members should not independently rotate through channels without a shared timing/transition rule. Monitoring requires no travel and does not presume that every member has confirmed availability.

An authorized coordinator can create a callout before a net exists and later link its resource net and operational periods. Capture the affected unit/audience, alert stage, exercise/real designation, requested action, response deadline, validity/expiry, next update, and source plan revision. Updates/cancellations carry the same incident/callout identifier and a new revision, with obsolete instructions visibly superseded. Restricted deployment details remain separate from any public alert-level display.

### 5.19 Tag Board and Presence Accountability

**The gap this closes.** A team frequently needs to know who is where when there is no net at all. The EOC is staffed for an afternoon. Three people are at the trailer replacing a feedline. Two are driving to a shelter. Someone went home at 1800 and nobody noticed. None of that is radio traffic, none of it needs an NCS or a frequency, and none of it should produce an ICS-309.

Today the app's only mechanism for recording "who is present" is a check-in on a net, and that is the wrong shape twice over. A station checked into the storm net from their own kitchen and an operator physically sitting at the EOC are both check-ins, distinguishable only through the free-text operating-position classifier. And a volunteer doing non-radio work -- a shelter desk, a supply run, an unlicensed helper of the kind the York County model explicitly includes -- has no business appearing in a net log at all, but absolutely must be accounted for.

**What it is.** A **tag board** is a team-owned live record of who is currently tagged in, where, and in what state. An authorized coordinator opens one for a named occasion (an activation, a drill, a work session, a storm watch, a shelter shift), it runs until closed, and it leaves behind a dated participation record. It requires no net, no event, no plan, and no radio.

**Who opens and closes one: whoever is running the thing.** The authority follows the existing leadership appointment rather than becoming a new permission to hand out. A team lead (EC) has it for their team, and a delegated AEC has it within the unit scope they already hold, by virtue of the appointment recorded in section 5.8 — there is no separate "board opener" grant, because a grant that has to be assigned in advance is a grant that will not have been assigned at 0200 on the night it is needed.

On a real incident the authority is the **incident commander**, and that person is frequently not an ECTLogger user at all: they are the EMA duty officer or the agency's own IC, running an incident in which this team is one resource. The module must not resolve that by inventing an account for them or by making "incident commander" an application permission. It resolves the same way section 5.14 already resolves activation authority:

> **The person with the authority and the person operating the app are two different facts, and the board records both.** A board carries who authorized it (by name, role, and agency, as free reference rather than a user link) alongside who opened it in the app. An authorized team member opening a board at the direction of an agency IC is the normal case, not an exception, and it is the same recorder-and-channel attribution used for an assisted tag.

Opening a board under someone else's authority therefore requires no new app permission and confers none. It does not make the opener the IC, it does not authorize deployment, and it creates no authority over anyone tagged onto the board. It records that a board exists, on whose say-so.

**What the doctrine actually says, because this was researched rather than assumed (2026-09-17).** Three findings, and they point the same way:

- **ARRL does not answer it, deliberately.** The [July 2025 ARES Plan](https://www.arrl.org/files/file/ARES%20Plan%20July%202025.pdf) covers vision, training levels, credentialing, and staff positions, and says nothing about who may begin a record. What it does say is that *"it is incumbent upon every Emergency Coordinator (EC) to develop a Standard Operating Procedure or Guide for his or her organization"* and that the EC's scenario *"Quick-Start"* document *"can serve as a standard policy for consistent procedures when an activation occurs."* This class of question is delegated to the local SOP on purpose. **There is no national standard for the app to comply with, so the app must not hardcode one.**
- **ICS does answer it, and the answer is first-arrival-acts.** Under ICS, the first arriving authority with jurisdiction establishes incident command and remains in charge until transfer of command is accomplished; the arrival of a more qualified person does not by itself change command. Transfer is face to face, includes a full briefing, and its effective time is announced to everyone affected. That is exactly the shape used here, and the keeper handover below is modeled on it rather than on an invented "adopt" flag.
- **Local ARES SOPs disagree with each other, and the strict ones are about a different action.** Some, such as Washington County's, state plainly that units do not self-activate and that no member may take it upon themselves to activate or participate without authorization. That rule governs **self-deployment**, not record-keeping: it stops a member driving to a disaster and inserting themselves. It says nothing about writing down who is already standing in the room. Opening a board is not activating, not deploying, and not assuming command, and collapsing those is precisely the error the hub's standing rule against one workflow granting another's authority exists to prevent. The ARES Plan makes the same distinction in its own credentialing section: an ARES ID identifies a member but *"will not necessarily grant permission to enter a disaster area"* — only the AHJ's incident-specific credential does.

**Therefore: who may open a board is a per-team setting, defaulting to any active member.** That switch lives in the hub's section 5.20 policy register, alongside the doctrine hint that says in as many words that ARRL declines to answer this and expects the local SOP to — so the EC reading the setting learns why it is theirs to decide rather than finding an unexplained toggle. A team whose adopted SOP is the strict kind flips it and requires an appointment, rather than needing a different build. The default is the permissive one because the cost of being wrong is asymmetric: a junk board is a nuisance an EC corrects in the morning, and an unrecorded first ninety minutes of an activation is the exact failure this feature exists to prevent.

Two constraints follow, and they are not optional:

- **Duplicate boards are prevented by constraint, not by permission.** One open board per team at a time; a second person attempting to open one is shown the board that already exists and offered the tag-in action on it. This removes most of the argument against the permissive default without restricting anybody.
- **A member-opened board must read as a sign-in sheet, never as an activation.** The wording matters more than the data here: "W1ABC opened a tag board" is a record; "W1ABC activated the team" is a claim of authority that member does not have and that local doctrine forbids. Alert stages in 5.14 are set by the people 5.14 authorizes, never as a side effect of opening a board.

**Closing is the guarded half**, because it is the action with the accountability consequence, and a long activation routinely outlives the person who opened it — shifts change, the EC goes home, the IC is relieved. A board therefore has a **current keeper**, initially its opener, transferable through the audited handover pattern section 5.18 already defines for document ownership and pending callouts. Model the handover on the ICS transfer of command it mirrors: an explicit action, with a briefing note, a recorded effective time, and visibility to everyone on the board — not a silent change of owner. The keeper, anyone holding the same appointment-level authority over that team or unit, or a team administrator may close it. Closing still requires the acknowledgment described below when people are still tagged in, regardless of who is doing it: authority to close a board is not authority to declare everyone home safe.

**Vocabulary decision.** Following the Public Service Events precedent of settling contested words once rather than per-screen:

- The surface is a **Tag Board**; the actions are **tag in** and **tag out**.
- The person record is a **member tag** (`member_tags`), **never a bare `tag`** -- `asset_tag` is already an equipment field in [section 5.13](TEAM-ASSETS-CUSTODY.md), and a module that inventories both people and equipment cannot afford an ambiguous `tag`.
- The occasion is a **board** (`tag_boards`), not an incident, an event, or an activation. Section 5.12 explicitly refuses `Incident` a top-level entity, `Event` belongs to Public Service Events, and Activation is an alert stage in 5.14 above.

**The two facts that shape the whole design.**

1. **Presence is not a check-in.** A tag is a fact about where a person physically is and what duty state they are in. A check-in is a fact about a station being on the air. One person can have both at once, either one alone, or neither. **A tag must never create a check-in, and a check-in must never create a tag.** That inference is the single most tempting shortcut available here, and it is wrong in both directions.
2. **Neither a board nor a net is the parent of the other.** A board can run with no net; a net can run with no board. Where both exist, an optional link supports reporting and nothing more. Containment would mean closing one closes the other, which produces exactly the false "everyone is accounted for" this feature exists to prevent.

**States, kept deliberately small.** Section 5.17's full ladder (authorized, en route, arrived, on duty, relieved, released, returned) belongs to a real incident with a plan behind it. A tag board needs the cheap version:

| State | Meaning |
|---|---|
| En route | Committed and travelling to a stated place. Optional per team; a team that does not want it turns it off |
| Tagged in | Present at a stated place, with an optional task or role label |
| Tagged out | Left, with an actual time |

Plus a place -- a named team location, free text for somewhere not yet a named location, or an explicit mobile/roving value -- and an optional expected-out time.

**A tag is never inferred.** Not from a net check-in, not from a callout acknowledgment, not from an accepted Events shift, not from a login. Someone who acknowledged a callout is not present. Someone on a shift roster is not present until they arrive. This rule is what makes the board worth trusting, and every convenience that erodes it makes the board a liability during the one event it exists for. It is the same distinction the banner at the top of this document draws, applied to the last fact in the chain.

**Assisted tagging is the normal case, not the exception.** Most tags will be recorded by somebody else -- over the radio, by phone, or by whoever is standing at the door with a clipboard. An authorized coordinator can tag anyone in or out, and every tag carries who recorded it and through which channel (self, radio, telephone, in person), the same attribution pattern used throughout this module. A membership record with no account can be tagged, and so can an unlicensed helper. **No new people table**: a taggable person is a team membership, consistent with the Events boundary rule that unregistered people never get a table of their own.

**Live view.** One board is one broadcast group, reusing the existing `ConnectionManager` pattern rather than polling. New event types are **server-originated, broadcast by the route handler after the database write**, never client-relayed -- the project already paid for that lesson when one browser's socket hiccup silently broke live check-in sync for every other viewer.

**Overdue is a prompt, never a state change.** A tag may carry an expected-out time, and the board surfaces anyone past it so a human can go find out why. **Nobody is ever automatically tagged out.** An auto-clearing board reports that everyone is accounted for, which is the worst available failure mode for a tool whose entire purpose is knowing that they are not.

**Closing a board.** Closing with people still tagged in requires explicit acknowledgment and lists exactly who is still on it. This is the same discipline as a partial equipment return in section 5.13: a board that silently tags everyone out at close is worse than no board at all, because it manufactures a record of a safe demobilization that never happened.

**Hours, and the double-count trap.** Tag time is a **third canonical actual-time source**, alongside net check-in duration and Events shift hours. One person at the EOC, checked into the net, working an Events shift generates three overlapping durations for one contribution. The M4 reporting adapter must reconcile these, never sum them, and the tag board is the newest and least obvious of the three. Section 5.5's existing warning about linked check-in and shift time now has a third input; it is called out here because M1A ships well before M4 and would otherwise hand M4 a problem it did not know it had.

**The agency sign-in sheet, and what the board owes it.** Cumberland County EMA puts a paper roster on the table at every meeting and every activation: *Meeting Attendance / Event Participant Roster*, with a header naming the meeting, event, or incident, a date, a **Meeting / Operational Period** start and end time, and eight columns — name, title/position, agency, phone, email, travel time round trip, time in, time out.

**It is not a numbered ICS form.** [ICS-211](https://training.fema.gov/emiweb/is/icsresource/icsforms/), the standard incident check-in list, is a resource-oriented document built for demobilization planning: resource kind and type, order request number, leader's name, total personnel, method of travel, incident assignment, qualifications. Cumberland's is person-oriented and carries contact details ICS-211 does not. The two are not substitutes and the app must never present one as the other; ICS-211 mapping stays where section 5.12 already puts it, in M6.

**But its shape is not arbitrary either, and that matters more than whether it is official.** EMPG requires a non-federal cost match, volunteer hours are the usual way a county meets it, and in-kind match documentation has to show name, date, times, and the activity. Four of those eight columns exist because of that rule. The footer's per-diem language is federal travel-reimbursement boilerplate. So this is a local form serving non-local requirements, which is the best possible case for the app: generate the local document, satisfy the external rule, and pretend to be neither an ICS form nor an authority on grant compliance.

Most of it maps onto a board that already exists:

| Form field | Board record |
|---|---|
| Name of meeting / event / incident | The board's occasion name. The form's own "Meeting / Operational Period" phrasing is the same union of cases section 5.19 chose deliberately |
| Date, start time, end time | Board open and close times |
| Name, title/position, agency, phone, email | Section 5.8 membership, profile, and affiliation records, populated rather than retyped |
| Time in, time out | Tag in and tag out, unchanged |

**Three things do not map, and each is a design decision rather than a missing column.**

1. **Travel time round trip is not presence and must never be added to it.** It is time spent *not* at the place, recorded because a grant match counts it, and it is a fourth duration next to tag time, net check-in duration, and Events shift hours — but not a fourth *source of the same quantity*. Section 5.5's reconciliation rule picks one duration from several measurements of one contribution; travel time is a different contribution and is carried alongside, never folded in. It is self-reported by the person who travelled, never inferred from a home address, a named location, or a map.
2. **The sheet is a data-capture instrument, not a signature.** Its footer talks about signing and per diem, but the EMA does not use it that way: the paper is transcribed into a master spreadsheet holding every team's attendance, and that spreadsheet is the record. Nothing downstream consumes a signature, so **do not add attestation marking to the rendered sheet** — it would decorate a transcription source with a distinction its only reader does not use. The recorder and channel that section 5.19 already stores stay in the record as ordinary provenance, where they cost nothing and answer "who said so" if anyone ever asks. The per-diem paragraph is agency text carried verbatim like the rest of the template, not a workflow this project implements.
3. **Half the room is not on the team.** The agency column exists because a county EMA meeting contains fire chiefs, public works, Red Cross, and a warning coordination meteorologist, none of whom are ARES members and none of whom should become roster entries as the price of being counted present. The **no new people table** rule still holds — an external attendee is a manager-created membership record in an explicitly external stage, never a second people store — but section 5.8's stage vocabulary needs a value that means *attended once, not a member and not a prospect*, and it must not put them in outreach, staffing search, or the headcount. Confirm that value before building the export, not after.

**The paper is not the destination, and designing for the paper would miss the point.** Each sheet is transcribed into a master spreadsheet where every team's attendance is kept. The clipboard is an intermediate; the retyping is the actual cost and the actual source of error. So the valuable output is **not a better-looking form — it is the rows, in the shape the master sheet wants, so that nobody retypes anything.** A rendered sheet remains worth producing for the table by the door, but it is the lesser half of this feature.

Four consequences follow, and they are the difference between this working and this quietly corrupting somebody's spreadsheet:

- **We contribute rows; we do not model the master sheet.** It aggregates teams this instance knows nothing about, it is owned by the agency, and it is not a record this app can hold a correct view of. Export our own rows and stop there. Nothing in this module gains a multi-team attendance store.
- **Re-exporting must not duplicate.** The failure mode is invisible from here: a second export appends a second copy of every row to a spreadsheet nobody in this app can see. Each exported row needs a stable identity derived from the board and the membership, and the board records what was exported and when, so a re-run is recognizable as a re-run by whoever pastes it.
- **The column set belongs to the EMA and probably is not the paper form's.** A master sheet spanning many teams likely carries a team or agency column the single-team paper form has no need of, and may omit columns the paper collects. Treat the mapping as a per-team setting, and confirm it against the actual spreadsheet rather than inferring it from the sheet we have seen.
- **This is an adapter, so it reuses section 5.5's adapter machinery rather than inventing a private export.** That is the module's own reuse rule. M1A emits its raw rows — occasion, person, times, travel time, agency — and claims no approved mapping, exactly as it already does for report categories; the coordinator-approved column mapping is M4 work where every other adapter lives.

**Paper still has to work when nothing else does.** The sheet exists because a clipboard on a table by the door needs no power, no network, and no account. A board can **print a blank roster with expected attendees pre-populated**, be filled by hand, and be transcribed afterward — which is only assisted tagging with a channel of in person, already in the design. Nothing here may make the app the only way to sign in; that is the same rule section 5.14 applies to the rendezvous card, for the same reason. The app removes the retyping on a normal day and stays out of the way on a bad one.

**The template belongs to the served agency, so it belongs in the policy register.** Which roster layout a team produces is a section 5.20 setting, defaulting to none, because there is no national standard to default to and inventing one would repeat the mistake the tag board's open-authority research already caught. Agency-supplied text — the per-diem notice above all — travels with the template **verbatim, with its source and revision date**, and is never composed, paraphrased, or updated by this project. Printing last year's legal notice under this year's date is a failure mode with consequences outside the app.

**Privacy.** A live list of named people and their current physical locations is the most sensitive real-time data anywhere in this module -- more sensitive than the static roster, because it says where a named person is right now. Default visibility is team staff plus the people on that board. It never appears in a net's public report or any other public output. It is last-confirmed whereabouts, not live location tracking; section 5.13 already draws that line for equipment and it applies harder to people. Retention should be short for the whereabouts detail and longer for the participation total, since the hours are what reporting needs and the positions are not.

**Relationship to the rest of the module.**

- **Section 5.17 (planner)** is the full incident version of the same underlying fact. It extends the tag record with authorization, relief, release, and return, tied to a plan and to Events shifts. It does not create a second presence ledger.
- **Section 5.14 (above)** -- raising to Standby or Activated is the natural moment to open a board, but opening a board is not an activation and authorizes nothing.
- **Section 5.13 (assets)** -- a board makes "who is at the trailer" and "who has the go-kit" answerable side by side, but custody remains custody. **Tagging out does not return equipment**, and the board should say so when someone tags out still holding something.
- **[Public Service Events](PUBLIC-SERVICE-EVENTS.md)** -- an event's sign-in and sign-out against a staffed post remains the Events workflow. A tag board is for the case with no posts and no shifts. A team that finds itself building a post schedule on a tag board is doing Events, and the answer is to use Events.

**Why this ships early.** A tag board needs a team, membership records, and optionally some named locations. It needs no training records, no capabilities, no assets, no nets, no Events, and no planner. That makes it the highest value-per-effort item in the entire module after the roster itself, which is why it is scheduled as M1A rather than buried behind the planner.

### 5.15 Optional SMS Callouts (Twilio Candidate)

Twilio is Brad's proposed first provider. This section authorizes design only: no account setup, number purchase, credentials, outbound messages, or contact upload is performed by this concept update. The implementation should expose a small provider interface while initially supporting one configured provider. SMS is optional per deployment and team and must not gate radio-based activation or membership.

#### Consent, Sender Scope, and Privacy

- Collect a confirmed mobile number in normalized international format and separate, optional consent for named sender/team and message purposes (for example activation notices and opted-in drills/training). Record notice version, purpose, source, timestamp, and withdrawal; possession of a number, team membership, a public directory listing, or the old "okay to text" cell is not sufficient evidence for a new messaging program.
- Show sender identity, expected message purpose/frequency, possible message/data charges, help and opt-out instructions. Manager-assisted consent must record the member's actual agreement through an accepted process; staff cannot consent on the member's behalf. Follow the [Twilio Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy), and confirm the exact registration/consent flow for the chosen sender type before launch.
- Synchronize provider opt-outs with the local suppression list. Check eligibility/consent again at send time; STOP overrides pending jobs and urgent message classification. Re-enrollment requires fresh valid consent. With [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out), handle provider START/STOP/HELP events without sending duplicate provider confirmations. Map provider-level suppression to its actual sender/service scope; a team-specific preference cannot bypass a broader provider block.
- Explain that Twilio and downstream carriers process destination numbers and message content. Send individual messages rather than group texts; recipients must not see the roster or each other's numbers. Keep SMS content minimal: team identity, alert/exercise label, action, approved rendezvous information, deadline, and opt-out/help as applicable. Avoid home addresses, access codes, medical information, detailed incident traffic, or member lists; use an authenticated detail page for restricted content.
- Define retention for number/consent records, message bodies, replies, delivery events, provider logs, and backups. Review provider retention/redaction options without promising deletion from carriers or phones. Keep credentials and webhook secrets server-side, restrict number lookup/export, and redact ordinary logs/diagnostics. Update PRIVACY and self-hosting guidance before enabling SMS.

Keep SMS consent distinct from the existing `User.email_notifications` and email-to-SMS `sms_gateway` fields. An email preference must not enroll SMS, and adding Twilio must not silently reroute existing notifications. A team member can choose radio or assisted telephone follow-up instead. Confirm changed/recycled phone numbers; ambiguous shared numbers cannot establish which person acknowledged an assignment.

#### Coordinator Workflow and Delivery Reliability

1. Choose an approved procedure, alert stage, exercise/real label, expiration, and authorized audience. Filter by unit/task if appropriate; historical/withdrawn members are excluded. A frozen recipient preview records included/excluded counts and reasons, with masked numbers unless the user has contact access.
2. Preview the exact message, sender, purpose, estimated segment count/cost, and response instructions. A separate callout permission is required to send, with the actor and source authorization audited. Urgent alerts and routine training reminders have distinct schedules/preferences; do not assume an emergency label bypasses consent or sender policy.
3. Queue one intended delivery per callout revision/recipient/channel, deduplicating shared destination numbers while preserving member ambiguity for follow-up. Apply rate/budget controls, bounded retries, and expiry. Show partial failures; a broadcast is not one atomic success.
4. Display provider delivery separately from human response: pending/accepted/sent/delivered/failed or unknown versus acknowledged/available/unavailable/needs contact. Twilio [status callbacks](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status) supply delivery events; they do not demonstrate that a volunteer read, understood, or accepted an assignment.
5. Accept a scoped in-app response, an unambiguous SMS reply with callout identifier, or a radio/phone response entered by authorized staff. Preserve responder, channel, time, and recorder. Acknowledgment means receipt; availability and assignment acceptance require explicit answers. A telephone/SMS response is not authorization to edit a profile or issue a deployment order.
6. At the response deadline, present unreachable/failed/unacknowledged members for approved radio/phone follow-up. Silence means unknown, not unavailable or safe. Superseding/cancelling a callout stops unsent obsolete jobs; messages already accepted by the provider may still arrive, so include issue/expiry times and a revision-aware status view.

Validate inbound reply/status webhook signatures using the provider-supported validation method and correct externally visible URL behind the deployment proxy; bind callbacks to the configured account/sender and known message/callout. Deduplicate retries, handle out-of-order events, and prevent a delayed callback from reversing a final delivery result or consent withdrawal. Signature checking authenticates the provider, not the human holding a phone. See [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security).

Provider submission timeouts need an uncertain-delivery state and reconciliation, not blind resends that might duplicate an alert. Persist jobs across restarts, bound how long queued alerts remain useful, and distinguish app queue expiry from any provider-side cancellation guarantee. A provider or internet outage must leave the previously issued radio/PACE card usable; downloading instructions at incident time cannot be the only fallback.

For US local-number application messaging, plan for the relevant [A2P 10DLC registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc); other sender types have their own verification requirements. Confirm sender ownership, registration, throughput, segment pricing, and spending limits at implementation time. On a shared ECTLogger instance, define which organization is the registered sender and whether teams need separate services/accounts; do not let one team's branding, consent, costs, or opt-outs be silently attributed to another. No pricing or universal emergency exemption is assumed here.

### 5.18 Procedure Library, Succession, and Improvement

Maintain a versioned library of manuals, quick-start procedures, agreements, PACE cards, site guides, training plans, and exercise/after-action records. Each has an owner/deputy, source URL or authorized attachment, scope, approver, version/effective date, review date, public/restricted classification, and superseded-by link. Drafts are visibly distinct from adopted operational instructions. Acknowledgment of a revised procedure is tracked separately from training completion.

Include a curated external-resource catalog linked to relevant tasks/configurations: original author/organization, source URL, publication/version date when known, last local review, applicability, and reuse permission. GMARES hosts both its own and others' material; attribution and permission follow the original work. Link by default, obtain appropriate permission before reproducing documents/videos, and distinguish a broken/outdated learning link from an approved local operating instruction. Review older software screenshots/settings before recommending them; link current official software sources rather than bundling historical installers. Reuse this library for kit guides and exercise learning links, not a separate learning-management platform.

For the EC transition, begin with the inherited WSSM manual and an explicit adoption checklist: confirm agency authority/agreement, current role holders/deputies, monitored channels, callout/relief arrangements, inventories/custody, training requirements, source conflicts, and outstanding actions. Adapt neighboring patterns into proposed local procedures; do not rewrite the original manuals or publish local adoption through this concept update.

Store organizational responsibility rather than relying on one person's email account. A leadership handover transfers document ownership, access grants, provider administration responsibilities, pending callouts, asset-recovery issues, and improvement actions through an audited process; secrets belong in deployment secret management, not in manuals. Do not infer new authority solely from an EC title on a public page.

An after-action review compares objectives with actual results, identifies what worked and what failed, and creates named corrective actions with due dates, closure evidence, and a retest. Link improvements back to the relevant task, kit, site, PACE path, or procedure revision so the next drill tests the fix. Update approved materials and brief members through their chosen channels.

The [GMARES-hosted after-action template](https://gmares.org/wp-content/uploads/2023/04/aar_form.docx) adds a useful station-level view: operator/configuration/location, how and when notified, emergency power, operating/weather/propagation conditions, message counts, issues, and successes. Reuse callout, traffic, and test records where authorized; distinguish messages originated, relayed, and delivered so counts are not misleading. Link each observation to the relevant resource or procedure: a missing cable becomes a kit discrepancy, failed delivery becomes a path/test finding, and unclear instructions become a guide-review action. Closure requires appropriate evidence/retest and reviewer action; it must not automatically restore service condition or certify an operator.


## Records, Permissions, and Privacy

These stay in the hub rather than being copied here, so that a security review happens in one place against one table. These phases are governed by:

- **Hub section 6.1** rows: served agency and procedure/document revisions; callout/revision and per-recipient delivery/response; messaging consent/suppression and provider configuration; tag board and member tag; improvement actions. `TeamLocation` is shared with the hub's section 5.6 and is a prerequisite for named tag-board places.
- **Hub section 7** rows "Callouts and responses", "Procedures and training plans", and "Tag board and member presence", plus the closing paragraph separating a callout coordinator's authorized-audience access from a raw phone-number export, and provider configuration from ordinary team management.
- **Hub section 8** classification of SMS numbers, replies, recipient lists, restricted deployment packets, and live member presence as high sensitivity; the callout, consent, procedure-adoption, and tag-board audit requirements; and the offboarding rule that removes pending callout eligibility and suppresses queued notifications.

Two boundaries are worth repeating here because they are the ones a phase read in isolation will get wrong:

- **A callout permission is not deployment authority.** Sending is a communications action. Authorizing a response is an agency action recorded separately, with its own attribution.
- **A tag is not a check-in, in either direction.** Neither record may create the other, and neither one's lifecycle may close the other.

## Phase M1A — Tag Board and Presence Accountability

**Model:** **Opus** for the presence state model and its relationship to the canonical actual-time sources — the double-count problem in 5.19 is a reporting landmine that costs nothing to design correctly now and is expensive to unpick after M4 is built on top of it. **Sonnet** for the board UI, tagging actions, live updates, roster picker, and exports, all of which follow patterns this codebase already has.

**Depends on M1 only.** Not on M2 import, M3 capabilities, M3A assets, M3B callouts, Events, or the planner. This is deliberate: it is the shortest path from "we have a roster" to "we can run an activation with it".

- Tag board records: team-owned, named occasion, opened and closed with attribution and times. **Open/close authority derives from the existing EC/AEC appointment and its unit scope; no new permission is defined.** Who may open one is a per-team setting defaulting to any active member; **one open board per team at a time**, so a second opener is routed to the existing board rather than creating a duplicate. Opening never sets an alert stage and never reads as activating the team. A board separately records the authorizing incident commander or team lead as a free name/role/agency reference, since that person is often not a platform user, and carries a current keeper transferable by audited handover so a long activation can outlive its opener. Optional links to a net, an alert stage, or later a plan — always optional references, never containment.
- Member tag records with state, place, optional task label, optional expected-out time, recorder, and channel. Self-tagging and assisted tagging travel the same path and produce the same record, distinguished only by recorder and channel.
- Named `TeamLocation` places, free text, and an explicit mobile value. Basic location records are pulled forward from M4 the same way M3A pulls them forward; RF coverage rollups still wait.
- Live board view over the existing `ConnectionManager` broadcast, server-originated events only, broadcast by the route handler after the database write.
- Overdue surfacing with human follow-up and no automatic state change. Guarded board close that lists anyone still tagged in and requires explicit acknowledgment.
- Team-staff-plus-participants visibility by default, with the whereabouts detail excluded from every public output and from net reports.
- Scoped export of a board's participation for later reporting. Record the durations; do not claim a report-category mapping that M4 has not defined yet.
- **Export the board's own rows for the served agency's master attendance spreadsheet**, which is where the paper actually ends up and where the retyping actually happens. Raw rows only at this phase — occasion, person, times, travel time, agency — with the coordinator-approved column mapping deferred to M4 alongside every other adapter. Each row carries a stable board-plus-membership identity, and the board records what was exported and when, so a second export reads as a re-run instead of silently doubling somebody's spreadsheet.
- Render the agency's roster template as the secondary output: member details populated from section 5.8 records, optional self-reported round-trip travel time carried separately from presence time, and external attendees included through the external-participant stage without joining the roster. Printing a blank roster with expected attendees pre-populated is part of this deliverable, not a later convenience — it is the fallback that keeps the workflow alive without power or network.

**Exit:** TM-39 through TM-41 pass. A board runs end to end with no net in existence anywhere in the system. A member with no account and an unlicensed helper are both tagged in by radio and tagged out correctly, each carrying its recorder and channel. An overdue tag is visible and unchanged. Closing a board with two people still tagged in is refused until acknowledged, and the acknowledgment names them. No tag creates a check-in and no check-in creates a tag, verified in both directions. TM-42 is verified when M4 ships; until then the board exports durations and claims no reconciliation.

TM-47 passes: a board exports rows that paste into the agency's master sheet without retyping, and exporting the same board twice is identifiable as a re-run rather than producing a second set of rows indistinguishable from the first. No export contains a row for any team but this one. Travel time never appears inside a presence duration in any export. A rendered roster populates from membership records, prints blank with expected attendees, and accepts transcription afterward. An external attendee appears on the roster and in no headcount, outreach list, or staffing search. Agency-supplied footer text renders verbatim with its revision date, and a template with no recorded source cannot be published.

## Phase M3B — Procedures, Radio Callout, and Optional SMS

**Model:** **Sonnet** for procedures, PACE records, alert stages, manual callout recording, and PACE-first frequency ordering — established UI and read patterns. **Opus** for the SMS provider work: the consent model, the check at send time, webhook signature validation, suppression scope mapping, and the delivery-versus-acknowledgment separation. **Opus review gate on the webhook handler**, the same reasoning the roadmap already applies to the Ko-fi donation webhook.

This work depends on M1/M2 permissions, membership, and contact preferences; it can proceed independently of asset reporting, the tag board, and Events.

- **First release:** versioned local procedures, agency/deputy responsibilities, approved PACE/rendezvous cards, alert stages, manual radio/phone callouts and assisted response recording. Publish/distribute through an explicit local adoption workflow; the app is not a prerequisite for listening under a previously issued plan.
- Add section 5.4 PACE-aware frequency selection to team-linked net creation/editing, including inherited team associations, labeled role ordering, authorized channel resolution, and refresh on team changes. This convenience does not depend on SMS or the incident planner.
- Add channel and PACE-entry CSV templates/importers. Imported PACE plans remain drafts and cannot populate approved-plan recommendations until reviewed and adopted.
- **Optional provider release:** implement Twilio configuration, sender/team isolation, consent/suppression, recipient previews, individual queued sends, budget/expiry controls, signed reply/status callbacks, and response/follow-up views. Keep provider delivery distinct from human acknowledgment and authority. No SMS feature is complete until opt-out, cancellation, uncertain delivery, and stale-job behavior are handled.
- Pilot first with a simulated provider and synthetic recipients; conduct any real test only with an approved sender and explicitly enrolled participants. Rehearse app/internet/provider failure using the distributed radio card, and record phone/radio acknowledgments.
- Deliver privacy/consent documentation and self-hosted setup guidance with the provider feature. Include the procedure library, document owner/deputy handover, review reminders, and open-action dashboard.
- Add seasonal/member-prestorm/leadership-prestorm checklist templates and instances, owners/deadlines, assisted completion, and links to station tests when M3 is available. Keep personal details minimal and outstanding blockers visible. Needs/gap collection can ship here; primary/backup staffing integration follows in M5.

**Exit:** TM-22 through TM-24 and the procedure-handover portion of TM-28 pass. STOP during a queued broadcast prevents subsequent sends; callback replays and out-of-order events cannot create false acknowledgments or reverse suppression; a submission timeout does not trigger blind duplicate alerts. A coordinator can identify unresolved recipients and a non-SMS member can participate. No test turns an advisory, availability response, or message delivery into deployment authorization.

TM-35 passes in both net creation and editing: direct and inherited team associations prioritize approved PACE channels, search retains that priority among matches, shared entries are not duplicated, and distinct channel settings remain distinguishable. Test multiple plans, switching/clearing teams, missing or unresolved PACE entries, revoked access, and a later plan revision. Existing selections remain unchanged unless explicitly edited, and restricted plan/channel details do not leak through suggestions or public outputs.

## Validation Focus for These Phases

The hub's release checklist carries the cross-cutting cases. These are the ones specific to activation, presence, and callouts, and they are where these phases actually break:

- **Tag independence, both directions.** Create a check-in on a net linked to an open board and confirm no tag appears. Tag someone in on a board linked to an active net and confirm no check-in appears, no ICS-309 row is produced, and the net's public report is unchanged. Close the net and confirm the board is untouched; close the board and confirm the net is untouched.
- **Nobody disappears.** An expected-out time passing changes nothing but visibility. A board close with people still tagged in is refused and names them. A member offboarded mid-board keeps their historical tag. A tag out while still holding checked-out equipment is allowed but surfaces the outstanding custody.
- **Assisted paths.** Tag in a membership with no account, a member with no callsign, and an unlicensed helper, each by a different channel, and confirm recorder and channel survive into the export. Confirm a member cannot tag another member without the coordinator grant, and that the grant is scoped to their team.
- **Consent at the boundaries.** Test consent changes between queue and send, invalid webhook signatures, account/sender mismatches, duplicate and out-of-order callbacks, shared and recycled numbers, expiring and superseded alerts, cost limits, and uncertain submission. Verify the radio and telephone fallback paths, and that no phone list or private reply leaks into a public net view.
- **Procedure state.** Confirm an approved procedure is visibly distinct from a draft, that owner and deputy handover transfers document ownership and pending callouts through an audited path, and that acknowledgment of a revised procedure is tracked separately from training completion.
- **PACE without the app.** Rehearse a transition with the app unreachable, using only the previously issued rendezvous card. Confirm nothing in the design makes downloading instructions at incident time the only fallback, and that two fallback methods sharing one repeater site, power source, or internet connection are not presented as independent.
- Run the hub's real-data smoke-test procedure against the tag-board invariants specifically. "At most one open tag per person per board" is exactly the shape of assumption that passes every hand-built fixture and fails on real rows, and here it fails while somebody is standing in a shelter.

## Open Questions Before an Activation Pilot

- Is Cumberland County's participant roster a form the county wrote, or one Maine EMA issues to every county? The design answer is the same either way — a per-team template with the agency's text carried verbatim — but if it is a state form, one template serves every Maine team and is worth shipping. Ask the EMA for the source file and its revision.
- **What are the master spreadsheet's actual columns, and how does a team's data get into it?** This is the question that decides the shape of the export, and the paper form is not a reliable proxy for it — a sheet spanning every team almost certainly carries a team or agency column the single-team form has no need of. Ask for a copy or a header row, plus whether the EMA wants a file, a paste, or a shared sheet.
- Does anyone other than the EMA read that spreadsheet, and does it aggregate upward to the state? That determines whether a column mapping is a Cumberland setting or a Maine one, and whether the same export serves both.
- What is the external-participant stage actually called locally, and who may create one? A meeting roster full of agency staff is the common case, and the answer determines whether an EMA coordinator can record attendance without a roster-manager grant.
- Which monitored channels, PACE entries, and transition rules does the EMA actually approve, and who holds switching authority for each path? Resolve from current local confirmation, not a neighboring county's plan.
- **Answered 2026-09-17, with research.** Open/close authority follows whoever is running the occasion (the incident commander, or the team lead), derived from the existing EC/AEC appointment rather than a separate grant. The 0200-first-arrival case resolves to a **per-team setting defaulting to any active member**, because the ARES Plan delegates this to the local SOP and real local SOPs disagree. See the doctrine findings in 5.19. What still needs Brad: **does Cumberland's adopted SOP, once written with the EMA, take the default or the strict posture?** That is a policy answer to record in the team's settings, not a code change.
- Which named locations should a board offer by default?
- How long is whereabouts detail retained versus the participation total? The hours are what reporting needs; the positions are not, and they are the sensitive half.
- Does a tag board need to reference an alert stage at all, or is the association better left entirely optional? A required stage makes a Saturday work session look like an activation.
- Does the team want the en-route state, or does it invite recording intentions as facts? This is a per-team setting in the current design; confirm that the default is off.
- What sender type, registered organization, billing owner, spending limit, response deadline, and message-purpose scopes apply to SMS on a shared instance? Which teams need separate services or accounts?
- Which members prefer radio or assisted telephone follow-up over SMS entirely, and how is that preference recorded without implying they are unreachable?
- Which seasonal and prestorm checklist stages are actually adopted locally, who owns each, and what counts as a blocker versus a reminder?

## References

Section 5.19's roster discussion additionally cites [FEMA's ICS forms index](https://training.fema.gov/emiweb/is/icsresource/icsforms/) for ICS-211, which the agency sign-in sheet is deliberately **not**, and [FEMA's EMPG program page](https://www.fema.gov/grants/preparedness/emergency-management-performance) for the cost-match requirement that shapes what such a sheet collects. Neither makes this project an authority on grant compliance, and no export may imply that it is.

This document cites the [ARRL ARES Plan](https://www.arrl.org/files/file/ARES%20Plan%20July%202025.pdf), [FEMA mobilization guidance](https://emilms.fema.gov/_is0700b/groups/37.html), [CISA PACE guidance](https://www.cisa.gov/sites/default/files/2024-10/2024_NCSWICPTE_Leveraging_PACE_Plan_Emergency_Comms_Ecosystems.pdf), the [Twilio Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy) and related Twilio documentation, and the [GMARES-hosted after-action template](https://gmares.org/wp-content/uploads/2023/04/aar_form.docx). Full source list, review dates, and attribution rules are in the hub's section 12.
