# Incident and Drill Planning, Packets, and Accountability (Concept Draft)

Last updated: 2026-09-16

Part of the Team Management concept. This document is the planning layer: turning objectives and required services into a reviewable communications plan, finding people and equipment for it, issuing a deployment packet someone can carry, and accounting for those people from authorization through return.

This is the last and heaviest part of the module, and the only part that genuinely requires the Public Service Events workflow. It is also the part most likely to be cut: the membership MVP and the asset register deliver most of the module's value without it.

## Document Map

The Team Management concept is four interlinked documents, split once it outgrew a single readable file. **Section numbers are global across all four** — there is exactly one section 5.13 and it lives in the assets document. A cross-reference to "section 5.14" means the section carrying that number, in whichever document owns it. Do not renumber on a future move; update this table instead.

| Document | Owns | Teams phases |
|---|---|---|
| [Hub — Team Management](TEAM-MANAGEMENT-NOTES.md) | 1–4, 5.1–5.11, 5.16, 5.20, 6–9, execution-plan overview, 11, 12 | M0, M1, M1B, M2, M3, M4 |
| [Assets, Kits, and Custody](TEAM-ASSETS-CUSTODY.md) | 5.13 | M3A |
| [Activation, Tag Board, and Callouts](TEAM-ACTIVATION-CALLOUTS.md) | 5.14, 5.15, 5.18, 5.19 | M1A, M3B |
| [Incident and Drill Planner](TEAM-INCIDENT-PLANNER.md) | 5.12, 5.17 | M5, M6 |

The hub owns everything shared: problem statement, goals and non-goals, scope boundaries, personas, the user-story index, the data-model conventions, the permissions matrix, the privacy classification, the phase overview with model assignments, and the reference bibliography. Read it first; nothing in the other three is standalone design.

**This document covers Teams phases M5 and M6** and accepts user stories TM-12, TM-13, TM-14, TM-17, TM-21, TM-26, TM-27, TM-31, TM-34, the reservation-dependent portion of TM-20, and the remaining continuity cases of TM-28.

### The Standing Constraint

A structured wizard and deterministic matching rules are sufficient here; generative AI is not a dependency, and nothing in this document should be built on one. The harder constraint is architectural: **this phase must not create a second staffing system.** Events owns posts, shifts, offers, sign-in and sign-out, and the hours one event produces. The planner describes what is needed and who might fill it, then writes accepted assignments through the Events workflow. No second shift table, assignment board, attendance clock, or top-level `Incident` entity.

The same discipline applies to accountability. The [activation document](TEAM-ACTIVATION-CALLOUTS.md) introduces a lightweight tag board in section 5.19 that records who is where without any of this machinery. Section 5.17 below is the full incident version of that same fact, and it **extends the tag record rather than replacing it**. Two presence ledgers would disagree during exactly the event they exist for.

### 5.12 Incident and Drill Planner

This is a phased communications-planning assistant integrated with Teams and Events. A structured wizard and deterministic matching rules are sufficient; generative AI is not a dependency.

#### Planning Workflow

1. **Define context and objectives.** Incident/drill name and identifier, exercise/real-world designation, sponsoring team/unit, served agency, planning lead, operational period(s) and timezone, locations, objectives, and measurable success criteria. Example: "Each shelter exchanges a test message with the EOC during the two-hour exercise."
2. **Describe tasks and communications needs.** Per task/post, select services, bands, modes/transports, primary and alternate channels, operating setting, reporting destination, headcount/shift windows, required and desirable qualifications, equipment/power/runtime, and supervision or access requirements. Record logistics and safety inputs supplied by the responsible lead.
3. **Check feasibility and suggest people.** Apply section 5.10 matching and show missing capabilities, unconfirmed availability, staffing gaps, equipment conflicts, and training gaps. Overlay section 5.6 observed RF paths with their age and direction. No measured path means untested, not proven impossible; a past path is not a guarantee under incident conditions.
4. **Review and offer assignments.** The planner selects candidates, confirms conditions, and uses the Events workflow for offers, accept/decline, shifts, and conflicts. A manager can record a phone acceptance with attribution. Equipment reservations and overlapping duties need review before declaring a plan staffed.
5. **Prepare and approve the package.** Select the agency's configured form checklist, preview missing fields and source data, edit draft narrative, and identify the actual preparer/reviewer/approver. Approval is an explicit authorized action. An incomplete package remains visibly draft.
6. **Operate, then review.** Link the plan to the existing net, traffic, check-ins, and Events attendance. Collect actual activity and exercise observations separately from planned work. Compare results to objectives, record improvement actions, and offer reviewed capability/training updates; a successful check-in does not automatically certify a new skill.

Reusable plan templates can retain objectives and requirement patterns. Copying a plan clears member acceptance, approval, and expired period-specific data; recheck availability, qualifications, equipment, and channel choices. Preserve an approved revision and its minimal assignment/form snapshots so later roster edits do not change a previously issued plan. Material revisions invalidate approval for the new version and identify which assignments need reconfirmation.

#### Form Support and Limits

The served agency and incident leadership decide which forms are required. A band/mode selection supplies only part of a communications plan. The [FEMA ICS forms catalog](https://training.fema.gov/emiweb/is/icsresource/icsforms/) provides the official names below; the sequencing and mappings are product proposals. Confirm the exact template edition and local supplements during discovery and before releasing an exporter.

| Output | Proposed inputs and ownership | Delivery |
|---|---|---|
| ICS-202 — Incident Objectives | Objectives, period, conditions, and authorized review fields from the plan | First planner package |
| ICS-204 — Assignment List | Confirmed assignments, supervisor, reporting instructions, and operational period from Events | Reuse the planned Events builder; do not duplicate |
| ICS-205 — Incident Radio Communications Plan | Reviewed channel assignments and technical channel details, not just band/mode tags | Reuse/extend the planned Events builder |
| ICS-205A — Communications List | Selected operational contacts, with explicit disclosure review | First planner package, restricted distribution |
| ICS-203 — Organization Assignment List; ICS-206 — Medical Plan; ICS-208 — Safety Message/Plan | Responsible leaders supply organization, medical, and safety content | Attach reviewed documents initially; structured authoring later if required |
| ICS-211 — Incident Check-In List; ICS-214 — Activity Log | Incident arrival and actual activity; a radio net check-in alone is not incident check-in | Later mappings/workflows; do not manufacture entries from assignments |
| ICS-221 — Demobilization Check-Out | Required release sign-offs and outstanding closeout work from the accountability workflow | Attach/review agency form first; structured export after local mapping is accepted |
| ICS-217A — Communications Resource Availability Worksheet | Reviewed resource/capability data | Later, after candidate matching is proven |
| Existing ICS-213 and ICS-309 | Messages and actual communications history | Continue existing traffic/log exports; link to the plan context |

The first package is a supported communications-planning subset, not automatically a complete Incident Action Plan. Track required attachments in a checklist so unsupported forms remain visible work. Never fabricate medical plans, signatures, approval, frequencies, authorization, or attendance to fill a blank. Printing a name does not constitute a signature.

Use one canonical source per form for screen preview and export, with plan revision, template version, operational period/timezone, and draft/approved state. Validate overflow/continuation pages and local-time rendering. Private roster fields must not flow into a net's existing public report or subscriber email; plan access and distribution require their own explicit policy.


### 5.17 Deployment Readiness, Packets, and Personnel Accountability

#### Personal and Site Readiness

Add member-reported notice required, travel radius, maximum shift/deployment duration, overnight ability, transport offered/needed, and operational accommodation needs. For each deployment, confirm personal/family arrangements and logistics without collecting diagnoses, medication lists, or private family details. Keep emergency-contact name/method and disclosure narrowly limited to authorized welfare/recovery staff. Availability is refreshed for this task, not assumed from a permanent "deployable" flag.

Extend supported-site records with arrival/entry contact, operating workspace, installed antennas/connectors, power/network availability, access restrictions, accessibility, sanitation/shelter and agreed support, setup approval, hazards, and evacuation/reporting instructions. Trailer readiness also depends on compatible transport, authorized driver, keys, crew, and inspection. Each site/procedure has a reviewer and confirmation date; internet links alone are insufficient field instructions. CISA's [AUXFOG](https://www.cisa.gov/sites/default/files/publications/AUXFOG%20June%202016%20-%20508%20Reviewed%20-%20Final%20%282-16-17%29.pdf) is a reference for preparation, site awareness, and deployment/demobilization, subject to current local agency instructions.

#### Tailored Checklists and a Deployment Packet

Use the [2024 hurricane preparation checklist hosted by GMARES](https://gmares.org/wp-content/uploads/2024/08/Preparing-for-a-Hurricane-and-ARES-Operations-2024.pdf) to structure locally adopted preparation stages:

| Stage | Proposed checklist focus |
|---|---|
| Seasonal / routine | Home-operation and deployment kits, family arrangements confirmation, supplies, generator/power checks under approved safety procedures, battery load tests, live digital-function tests, and current printed instructions |
| Member prestorm / pre-event | Refresh availability, confirm personal arrangements without private details, check/charge/pack the selected setup, review monitoring instructions, and report constraints |
| Leadership prestorm / pre-event | Confirm agency needs, poll active/reserve members, identify tentative primary and backup operators, preserve required home-station coverage, assess mutual-aid gaps, and check/preposition fixed and portable resources with authorization |

Each checklist instance retains its template revision, stage/event scope, owner, due date, completion source/evidence, and outstanding blockers. Permit assisted phone/radio recording and printed use. A battery/live-radio test can reference section 5.9 evidence instead of being re-entered; packed, tested, and available remain distinct. Family readiness is a confirmation or constraint, not a request for family plans or medical information.

The source's tentative 72-hour staffing horizon is an optional template parameter, not a mandatory deployment length. Actual primary/backup offers and assignments use Events posts/shifts, reconfirm availability, and check shared equipment; a backup must not be counted as another simultaneously available operator. Before that integration ships, preparation captures staffing needs/gaps only. Checklist completion, monitoring, availability polling, and tentative planning never authorize self-deployment.

Use reusable templates for an equipped EMA office, short field shift, 24-hour/overnight assignment, extended deployment, trailer, or backpack kit. Separate communications equipment, operating supplies, and personal needs. Each checklist line has applicability, required/optional status, responsible supplier (member/team/destination), packed/checked/missing/not applicable state, and confirmation date. Derive equipment lines from the selected configuration/manifest; include personal items and supplies that are not tracked assets.

Reference the [ARRL Field Resources Manual](https://www.arrl.org/files/file/Public%20Service/ARES/ARESFieldResourcesManual-2019.pdf) and [Eastern Massachusetts ARES go-kit checklist](https://ema.arrl.org/wp-content/uploads/2018/03/Go-Kit-Checklist.pdf) for local templates covering radios/accessories, operating forms, lighting, clothing, food/water, and extended-stay needs. Duration and what the host supplies determine the actual list; a published 24/72-hour example is not a universal deployment condition. A checked packing list confirms preparation, not operational qualification.

Generate a printable/downloadable packet containing approved task/period, request/authorization reference, supervisor and necessary contacts, reporting/travel/site instructions, equipment allocation and pickup, tailored checklist, PACE/rendezvous card, applicable forms, safety/relief expectations, and release/return procedure. Include revision/issue/expiry and recipient-specific disclosure. Support printing and saving before departure; offline editing/synchronization remains the separate PWA roadmap work. Cached or printed material cannot be remotely recalled, so minimize private details and define handling/expiry expectations. Essential radio rendezvous instructions must be distributed before app connectivity is lost.

#### Accountability Through Return

Track authorized, en route, arrived/incident check-in, on duty, relieved, released, and returned, with actual/expected timestamps, supervisor, recorder/source, and exception notes. Home-based operators use appropriate duty/welfare states without invented travel. Radio check-in alone does not establish physical arrival or welfare; a net closing does not release responders. Keep these records connected to Events shifts and the canonical actual-hours source.

Record configurable arrival/welfare/relief deadlines, missed-contact follow-up owner, escalation procedure, and assistance requests. Reminders prompt human follow-up; lack of a reply is unknown status, and automated reminders are not a substitute for safety supervision. Record authorized release, required documentation, equipment reconciliation, travel arrangements, and return confirmation separately. Retain unresolved tasks after incident closure instead of marking everyone safely returned.

Use [ICS-211](https://training.fema.gov/emiweb/is/icsresource/icsforms/) for incident check-in mapping when supported, and [ICS-221 Demobilization Check-Out](https://training.fema.gov/emiweb/is/icsresource/assets/ics%20forms/ics%20form%20221%2C%20demobilization%20check-out%20%28v3%29.pdf) as the reference for required release sign-offs. Initially attach an approved agency form/checklist where a full exporter is unavailable. Expenses, mileage, damage, and issued-equipment receipts may be documented for agency review without promising reimbursement.


## Records, Permissions, and Privacy

Governed by the hub rather than duplicated here:

- **Hub section 6.1** rows: equipment reservation; deployment readiness/packet and accountability events; improvement actions; and plan requirements/revisions attached to `NetTemplate`/`Net`.
- **Hub section 7** rows "Plan/assignment management" and "Bulk export", plus the closing note that a planner's read access is an authorized candidate subset and never the full roster.
- **Hub section 8** classification of emergency contacts, private availability and accommodation notes, and restricted deployment packets as high sensitivity, together with the plan-approval audit requirement.

The rule most at risk of erosion in this phase: **a planner's view is a candidate subset, not the roster.** Every convenience added here ("show me everyone so I can decide") is a request to widen it, and the answer is to improve the matching rather than to widen the read.

## Phase M5 — Incident/Drill Requirements and Staffing Integration

**Model:** **Opus** for the reservation conflict model across physical dependency sets — this is the same class of problem as the asset document's checkout transaction, and it must reuse that answer rather than invent a second one. **Sonnet** for the planner wizard, packets, checklists, and the Events wiring, all of which follow established form and integration patterns.

- Add template/net planning context, objectives, measurable drill goals, operational periods, requirements, and reusable task templates.
- Link the adopted agency/PACE procedure and callout to the plan. Deliver task-specific personal/site/logistics checks, tailored packing templates, and a revisioned printable deployment packet. Add incident travel/duty/relief/release/return events through the shared Events accountability contract, extending the section 5.19 tag record rather than creating a parallel one.
- Connect candidate matching and availability confirmation to Events posts/shifts/offers. Exercise manager-recorded acceptance, trainees with supervision, reserve escalation, equipment contention, and scoped conflict checks.
- Connect staged preparation to configurable operational-period horizons, tentative primary/backup staffing, home-coverage needs, and authorized prepositioning. Include approved kit guides in packets and reuse the M3 digital-exercise templates and evidence.
- Add confirmed equipment reservations through the shared asset ledger, with owner/custodian agreement and atomic conflict checks across kits/configuration dependencies. Pair qualified people with team equipment; separate allocation, pickup/checkout, attendance, and return.
- Use observed coverage as supporting evidence and display unmet communications/staffing requirements. Preserve candidate snapshots only as needed for review; revalidate when selecting/confirming assignments.
- Reuse Events multi-period materialization before piloting plans scheduled far ahead or spanning multiple operational periods.

**Dependency:** requires M3, the radio/procedure foundation of M3B, M3A for team equipment allocation/custody, and the relevant Events posts/shifts/offer workflows. Coverage-assisted planning requires M4. SMS is optional. If Events is not ready, a requirements/candidate preview may be piloted, but do not label it completed staffing or create a parallel assignment system.

**Exit:** TM-12, TM-13, TM-17, TM-21, reservation-dependent portions of TM-20, and equipment scenarios 6–8 in hub section 5.10 pass in a shelter/EOC exercise that includes a home relay, a field station, a trainee/mentor pair, and an unfilled requirement. Suggestions, offers, acceptance, equipment reservations, handoffs, and attendance remain visibly distinct. A candidate without an account can be handled end to end by a manager. Reserving Brad's FT-991A blocks its overlapping home use; sharing a mast/computer still conflicts even with two separate radios. A cancelled plan releases reservations without claiming the checked-out go-kit was returned.

TM-26 and TM-27 additionally require a usable pre-downloaded/printed packet, assisted incident arrival, relief and welfare follow-up, actual release, and recorded return, with no travel states invented for a home operator. Closing the exercise net leaves unresolved people/equipment follow-up visible.

TM-31 passes across the M3B/M5 workflow: seasonal and prestorm tasks retain their owners/evidence, unresolved checks remain visible, the staffing horizon is configurable, backup resources are not double-counted, and completing preparation creates no deployment authority.

## Phase M6 — Reviewed ICS Package and Exercise Results

**Model:** **Sonnet**, reusing the Events ICS-204 and ICS-205 builders rather than writing new ones. **Haiku** for additional form field mappings once the first form is built and its pattern verified — a second form against a proven builder is mechanical work. **Opus** only for the plan distribution and disclosure policy, which is a privacy decision rather than a form.

- Deliver the selected ICS-202/204/205/205A package, sharing Events builders for 204/205, plus required attachment checklist and existing traffic/log exports. Add later forms only when the pilot establishes their need and authoritative input sources.
- Add plan versioning, approval, restricted distribution, copy/replan behavior, and actual-versus-objective review. Store template edition and minimal issued snapshots.
- Conduct an exercise using the draft package; capture missing inputs, staffing gaps, RF results, actual hours, and follow-up actions. Coordinator review is required before suggesting changes to long-term qualifications.
- Include agency-approved incident check-in/demobilization attachments (ICS-211/221 as applicable), source/version review, and a corrective-action owner/due date/retest workflow. Reuse the same library for EC succession and updated member briefings; verify the remaining TM-28 continuity cases.
- Deliver station-specific after-action observations linked to configurations, kits, sites, callouts, and traffic/test evidence. Verify TM-34 with a missing cable, failed message path, and outdated guide: each has a responsible owner and appropriate correction/retest, with no automatic qualification or service-status change.

**Exit:** TM-14 passes with a coordinator-reviewed sample package, long text/continuation pages, missing-field warnings, revised approval, timezone handling, restricted contacts, and public-net-report isolation. A second operational period can reuse requirements while reconfirming assignments. No package claims unsupported agency requirements are complete.

## Validation Focus for These Phases

- Test packet disclosure and expiry, missed arrival and welfare follow-up, and release/return **independently of net closure** — closing the exercise net must change none of them.
- Test that a home-based operator is accounted for without any invented travel state, and that a tag recorded through the section 5.19 board before the plan existed is carried forward rather than duplicated.
- Test reservation races across shared dependencies: two planners claiming the same mast, a kit reserved whose radio is separately reserved, and a manifest change that invalidates an existing reservation.
- Test after-action retest links: a corrective action closes only on evidence, and closure changes neither service condition nor operator qualification.
- Verify no private roster field reaches a net's existing public report or subscriber email through any plan, packet, or form export.

## Open Questions Before Planning and Wider Rollout

- Which agency's ICS editions, local supplements, sign-off roles, and distribution rules should the pilot support? Is an attached reviewed form sufficient where structured generation is deferred?
- What standby/escalation conditions distinguish reserve availability from routine availability, and which assignment changes require reconfirmation?
- How should shared radios, portable kits, home relays, concurrent nets, and supervised trainee assignments constrain staffing?
- How old can a measured RF path be before it needs reconfirmation for a particular exercise, and what test context matters?
- What must each host site provide, what must volunteers bring, who authorizes relief/release, and who follows up on overdue arrival/return? Which emergency-contact details are necessary and who may see them?
- Which primary/backup staffing horizons will the pilot adopt, and does the tentative 72-hour figure in the source checklist match how this team actually plans?

## References

Form names come from the [FEMA ICS forms catalog](https://training.fema.gov/emiweb/is/icsresource/icsforms/); preparation and demobilization guidance from CISA AUXFOG and FEMA ICS-221. Full source list, review dates, and the rule that public material is design evidence rather than operational configuration are in the hub's section 12.
