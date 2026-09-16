# Team Management Spec Draft (Back-Burner)

Last updated: 2026-09-16

This document is a structured draft spec for a future Team Management module. It is intentionally scoped as back-burner work while core web app stability and self-hosting priorities are completed.

The September expansion incorporates Joel, AA1GM's NH-ARES membership needs, Brad's contact/training/capability spreadsheets, personal station equipment and team asset custody, and researched guidance on activation, preparedness, training, and demobilization. Brad's inherited WSSM-ECT manual and York/Strafford examples inform the local pilot. Greater Manchester ARES resources add demonstrated station readiness, digital-message exercises, staged preparation, kit operating guides, local timecards, and station-specific after-action review. Everything described as a new Teams, callout, or planning workflow below is proposed, not shipped. This expands the concept without changing the roadmap's priority or authorizing implementation.

Related roadmap references:

- [docs/ROADMAP.md](../ROADMAP.md) > Milestone 2 > Team Management Module — the module itself.
- [docs/CHANGELOG.md](../CHANGELOG.md) (2026-08-02) — the per-net "can hear" station-to-station coverage logging that section 5.6 below builds on has already shipped; its roadmap entry was removed once complete, per this project's convention of dropping shipped items from ROADMAP.md rather than leaving them checked off in place.

## 1. Problem Statement

Current team operations rely on shared spreadsheets for staffing, training, and readiness tracking. This creates:

- weak access control and auditability
- data quality drift
- duplicate records
- poor self-service for member updates
- manual effort for reporting (including ARES-style reporting)

Goal: provide a secure, role-based team management experience integrated with existing ECTLogger net activity, answering three practical questions: **Who belongs to our team? What can they do? Who can help with this particular assignment?**

### Stakeholder Input and Evidence

- Joel describes an onboarding and retention problem, plus an EC reporting need: distinguish active deployable members, active non-deployable members, reserve members, and historical records (departed members and Silent Keys).
- Brad needs members to maintain their own information, with a manager-assisted path for people who prefer phone or paper. His spreadsheet also captures training, station capabilities, local administrative details, and exercise participation.
- Brad's proposed incident/drill planner starts with objectives and required services, bands, and modes, then identifies suitable people and helps prepare the appropriate incident forms.
- Brad's equipment example includes a home FT-991A/computer setup that can be disconnected for deployment, an FT-817ND QRP setup with a PC interface, vehicle-mounted VHF/UHF FM/DMR equipment, and deployable HF antennas/mast. His team also supports two EMA offices, a communications trailer, and a backpack go-kit whose contents and current holder must be tracked. These are member-reported examples, not verified model specifications or an inventory audit.
- Brad is taking over as county EC and needs continuity of procedures, contacts, and training through a leadership transition. His proposed callout combines prearranged storm monitoring on the primary repeater/PACE alternatives with optional Twilio SMS from ECTLogger. SMS is a proposed additional channel, not the activation authority or a prerequisite for team participation.
- The [public NH-ARES membership form](https://secure.ema.arrl.org/qilan/ares/NH/ARES_membership_app_new), reviewed 2026-09-15, includes roster disclosure choices, fixed/mobile/portable band-and-mode capabilities, emergency power, activation availability, affiliations, and training. Its EC reporting interface has not been reviewed; no registration was submitted. Its existence does not establish what reporting, approval, or update workflows are available behind login.

The product opportunity is a living readiness roster with a short, welcoming entry path. A new volunteer should be able to express interest before knowing every radio specification or completing a training program. Better onboarding can remove friction; whether it improves recruitment and retention must be measured during the pilot.

### Local Manuals and Reference Findings (Reviewed 2026-09-15)

| Source | Finding and consequence for this concept |
|---|---|
| [WSSM-ECT public resource page](http://www.ws1sm.com/ECT.html) and [inherited operations manual, version 09.25](http://www.ws1sm.com/Forms/WSSM-ECT-ARES-RACES_Ops_Manual_Simple_PDF.pdf) | The manual describes Cumberland County EMA approval of operations, county ownership of equipment, responder/leadership training, net procedures, and archived after-action reporting. Preserve these as the inherited baseline; confirm the current agreement, authority, inventory, and requirements before adoption. |
| [York County Emergency Communications Team](https://k1yem.com/) | Its public description includes unlicensed helpers and says the team is EMA-directed rather than ARES/club-affiliated. Support program-specific affiliations and support roles instead of assuming every emergency communications team is an ARES unit. |
| [YCECT Operations Manual, March 12, 2025](https://k1yem.com/wp-content/uploads/2025/03/YCECT-Operations-Manual.pdf) | Useful patterns include resource/relay/home operator and facilitator roles, graduated alerts, monitoring and telephone recall, execution checklists, SITREPs, and staged training. Some scheduling/EMA-duty sections are unfinished. Its activation and mobilization paragraphs list different repeater entries (147.345 versus 147.234); verify locally before reuse. |
| [Strafford County NH-ARES page](https://nh-ares.org/strafford.php) | Describes agency support, mutual aid, community events, repeater/simplex/NBEMS resources, flexible commitment, home-based contributions, and introductory education. Use these onboarding and mission patterns; this page does not establish a complete current local manual or training calendar. |
| [Greater Manchester ARES Winlink training](https://gmares.org/winlink-training-resources/) and [NBEMS training](https://gmares.org/nbems-training/) | Distinguish internet/Telnet, RF gateway, and direct peer-to-peer operation; modules also cover forms, relaying through Winlink, printing, and FLamp. Model tested paths and end-to-end task evidence, with linked learning resources rather than a single digital-capable checkbox. |
| [GMARES hurricane preparation checklist, 2024](https://gmares.org/wp-content/uploads/2024/08/Preparing-for-a-Hurricane-and-ARES-Operations-2024.pdf) | Separates preseason, member prestorm, and leadership prestorm preparation, including live digital tests, battery tests, family arrangements, availability polling, backup staffing, and tentative 72-hour planning. Use locally approved staged checklists; neither that duration nor checklist completion is deployment authority. |
| [GMARES VHF/UHF go-box article](https://gmares.org/wp-content/uploads/2023/04/VHF-UHF-Go-Box.pdf) | Describes equipment assembled for home and portable use. Attach operating guides to configurations, covering connections, accessories, power, setup, and functional tests; do not import the article's equipment choices or historical prices as requirements. |
| [GMARES forms library](https://gmares.org/forms/) | Provides an NH ARES timecard and a station-oriented after-action template alongside message/activity forms. Add reviewed local reporting mappings and resource-linked observations; these examples do not establish Maine reporting requirements. |

Public material is evidence for design, not a live dispatch configuration. Retain each source URL, document version, reviewed date, section/page, local owner, and adoption decision. Separate inherited practice, neighboring examples, national guidance, and approved local rules. Reconcile conflicts rather than silently preferring whichever source was imported last. Published names, contact details, schedules, equipment lists, and frequencies require confirmation before operational use; public availability is not permission to bulk-import contact data or enroll anyone in SMS.

The WSSM page/manual were retrieved over their supplied HTTP URLs after the browser's HTTPS fetch failed; the Strafford page was readable without the trailing slash. This review neither edits those external documents nor endorses every technical or regulatory statement in them. Use authoritative program/agency sources for credentialing and radio-service rules.

### Fit with the Existing Project

The current app uses a React/MUI frontend and a FastAPI/SQLAlchemy backend, with SQLite today and database/schema-tooling changes on the roadmap. Code and documentation reviewed for this concept establish these integration points:

| Existing foundation | Reuse and boundary |
|---|---|
| `User` identity, amateur/GMRS callsigns, profile, and authentication | Link an account to membership records; do not introduce another login or expose private team fields through public operator profiles. |
| `Contact`, created from check-in history | Optional identity bridge for known stations. It requires a callsign and its routes are platform-admin-only; it cannot serve as the Teams roster for prospects or manager-maintained records without accounts. |
| `NetTemplate`, `Net`, `CheckIn`, `NetRole`, and schedule staff | Reuse schedules, operational activity, and operational permissions. Team membership does not itself grant NCS, logger, or schedule staff privileges. |
| `Frequency`, band derivation, `CanHearReport`, and existing maps | Reuse channel choices and observed paths; record an operator's usable capability combinations separately. Equipment capability and a demonstrated RF path are different evidence. |
| Traffic forms, ICS-213, ICS-309, and CSV/PDF exports | Reuse message handling and communications logs. A future plan must not generate fictional operational activity. |
| Public Service Events concept | Posts, shifts, attendance, and ICS-204/205 are planned there; these are dependencies, not currently available Teams features. |

Primary implementation references: [models](../../backend/app/models.py), [permissions](../../backend/app/permissions.py), [contacts](../../backend/app/routers/contacts.py), [Development Guide](../DEVELOPMENT.md), and [UI Design Reference](../DESIGN.md).

## 2. Goals and Non-Goals

### Goals

- Replace spreadsheet-based team tracking.
- Ease new-team onboarding with downloadable, versioned CSV templates and guided imports for supported record types, not just member rosters.
- Let users safely maintain their own profile/team data.
- Restrict cross-user edits to staff with the relevant delegated team permission.
- Link net participation to team records and reporting.
- Support multiple team memberships per user.
- Support pre-user records that can later link to a platform account.
- Make onboarding and recurring updates usable on a phone, with saved progress and manager-assisted entry.
- Give ECs and delegated AECs scoped responsibility for organizational units and their rosters.
- Distinguish membership stage, field deployment willingness, home-based participation, qualifications, and current availability.
- Find members by specific tasks and usable combinations of service, band, mode, station type, training, power, and location.
- Keep data current through confirmation dates, review queues, and configurable reminders.
- Preserve departed-member and Silent Key history while removing those records from routine outreach and staffing suggestions.
- Build incident/drill objectives into reviewable communications plans and candidate lists, sharing the Events staffing workflow.
- Separate home, vehicle-installed mobile, and deployable setups while linking configurations that depend on the same physical equipment.
- Track team-managed radios, antennas, batteries, power supplies, kits, and trailers, including ownership, contents, current assignment, condition, and custody history.
- Let authorized staff answer "Where is the go-kit, who has it, is it complete, and can we use it?" without searching messages or relying on memory.
- Maintain per-item preventive maintenance schedules, repair/service history, and comparable antenna-system SWR sweep records, with due-work visibility and task-specific readiness consequences.
- Support approved activation procedures, radio/PACE rendezvous instructions, and optional consent-based SMS with human acknowledgment and follow-up.
- Connect task-book progress, local training schedules, personal preparedness, and site requirements to printable deployment packets.
- Track incident arrival, relief, release, and return separately from radio check-ins; preserve procedures and authority through coordinator succession.
- Distinguish reported equipment capability from demonstrated communication paths, with dated tests and visible dependencies or failures.
- Make seasonal/event preparation, transferable kit operating instructions, and end-to-end messaging exercises reusable across home, mobile, and deployable setups.
- Map participation to approved local report formats and turn station-specific after-action findings into owned, retestable improvements.

### Pilot Success Measures

Establish a baseline with one Maine team and, if willing, one NH-ARES unit. Proposed targets to validate in discovery:

- A prospect can submit the minimum application on a phone in five minutes without completing the equipment inventory.
- A member can confirm an unchanged profile in two minutes; assisted confirmation is equally valid and attributed to the assisting manager.
- An EC can answer the agreed capability-search scenarios in section 5.10 in under one minute without exporting a spreadsheet.
- Every imported source row is reconciled as imported, matched, skipped, or unresolved; no source columns silently disappear.
- The pilot dashboard shows application completion, time awaiting staff response, roster freshness, and interested-to-trainee/active progression. Agree target improvements after collecting the baseline; do not infer age or collect date of birth merely to measure recruitment.
- Before retiring the pilot spreadsheet, coordinators accept a roster export, readiness report, and monthly participation total against a manually checked sample.
- In the asset pilot, every registered asset has a resolved current assignment or an explicit discrepancy with a responsible staff member. A coordinator can locate the backpack kit's recorded holder and see readiness/return status in under one minute.
- In a callout exercise, staff can distinguish provider delivery, member acknowledgment, availability, and deployment authorization; a member without SMS/internet can follow the previously issued radio plan and be recorded by NCS.

### Non-Goals (initial release)

- Full parity with VolunteerHam or HamClubOnline feature sets.
- Cross-instance federation/sync for team data.
- Complex compliance automation beyond baseline privacy controls.
- Automatic dispatch, automatic credential certification, or automatic incident-command approval.
- A guarantee to generate every agency's required ICS package from band/mode checkboxes alone.
- Operating a telecom network, a standalone learning-management system, procurement/accounting/depreciation software, or a merchandise inventory system. Operational equipment inventory/custody (5.13) and an optional external SMS provider integration (5.15) are in scope.
- Replacing public warning systems, guaranteeing SMS delivery, or sending automatic weather-triggered deployment orders. Local alert procedures remain human-approved.
- Controlling radio software, automatically transmitting exercise traffic, or bundling third-party training/software. Initial digital exercises coordinate and record work performed with external tools.

## 3. Scope

### In Scope (phaseable)

- Teams area in primary navigation.
- Team creation, discovery, privacy mode, and membership workflows.
- Team roster and member profile fields relevant to emergency comms readiness.
- Team role-based permissions.
- Team-linked net participation rollups.
- Reporting outputs that help EC workflows and ARES-style summaries.
- Structured capability search and a phased incident/drill planning layer.
- Personal equipment/configuration records and team asset inventory, kit manifests, checkout/transfer/return, repair, and decommissioning.
- Versioned procedures/PACE plans, controlled callouts, optional Twilio SMS, task books/training schedules, deployment packets, and personnel accountability.

### Out of Scope for now

- Native desktop-specific team workflows.
- Third-party API integrations with external club systems.
- Automated legal policy generation.
- A separate Teams implementation of per-event staffing. The planner integrates with Events as described below.

### Boundary against Public Service Event Support

[`PUBLIC-SERVICE-EVENTS.md`](PUBLIC-SERVICE-EVENTS.md) covers staffing the communications
positions of a marathon, bicycle ride, or sled race. It overlaps this module on hours,
contact details, and rosters, so the split is fixed here and stated identically in both
documents:

> **Events own per-event posts, shifts, sign-in and sign-out, and the hours produced by one
> event. Teams owns people, long-term membership, training records, and cross-event ARRL Form
> 2 and EMA rollups.**

Practically: Events must not create a `volunteers` or `people` table — unregistered people
live inline on its shift rows, and `Contact.user_id` links them if they later register.
Events export hours for one event; Teams sums them across events and produces the form. Any
new noun proposed for either module should be tested against that sentence before it is given
a table.

**Planner extension:** Teams owns long-term readiness and reusable task qualification requirements. Objectives, operational periods, plan revisions, and selected requirements extend the existing `NetTemplate`/`Net` planning context. A candidate search reads authorized team records; accepted assignments are written through the Events post/shift workflow. Do not introduce a second shift table, assignment board, attendance clock, or top-level `Incident` entity in this phase. An incident/drill label groups and describes this workflow; one net can serve as its first operational period.

The Events draft currently offers registered schedule staff and known contacts. Before connecting the modules, extend that eligibility interface to accept authorized Teams candidates, including members without callsigns/accounts, while preserving its inline volunteer snapshots. Any later membership reference on a shift must be optional and team-scoped. Update both concept documents when implementing this shared contract; the existing ownership boundary above remains in force.

**Asset extension:** Teams owns the equipment register, kit contents, custody, condition, maintenance history, and equipment reservations. Events/plans reference those records for particular posts and periods. A planned equipment allocation does not check out the asset, and a net closing does not return it. Keep one physical-resource ledger rather than copying equipment into every event.

**Readiness and activation extension:** Teams owns agency agreements, training plans, procedures, consent, and callout records, which may exist before any net opens. Incident personnel accountability extends the existing operational-period/Events workflow, referencing memberships and shifts; it must not create a competing attendance or hours ledger. Training sessions can link to a net/exercise, but an in-person workshop must not require a fictitious radio net. Define these interfaces alongside Events before implementation.

## 4. Personas and Roles

- Member:
  - view and edit own profile fields allowed by policy
  - request team membership
  - view teams and team data per team visibility rules
- Team Manager/Admin:
  - approve/deny join requests
  - manage team settings and roster
  - add non-user member records and send optional invites
  - access team reporting views
- Platform Admin:
  - global moderation/support access
  - no automatic override of private team internals unless policy allows
- Prospect/interested volunteer:
  - express interest with minimal information and see the next onboarding step
  - participate without a callsign or account through assisted entry
- EC / section coordinator:
  - oversee explicitly assigned organizational units and aggregated readiness
- AEC / delegated coordinator:
  - manage only the units and functions delegated by an EC or team administrator
- Training reviewer / mentor:
  - review qualifications or guide trainees without automatically gaining access to all contact and access records
- Incident/drill planner:
  - define objectives and requirements, review candidates, and prepare a plan within assigned teams/nets
- Equipment custodian / asset manager:
  - maintain assigned assets and kit contents, authorize handoffs, reconcile returns, and record repair/decommissioning
  - access the holder/contact/location details needed to recover equipment without automatically gaining general roster or training administration
- Authorized callout coordinator:
  - issue scoped advisories/requests under the approved procedure, monitor responses, and delegate follow-up
  - record agency activation authority separately from permission to send an SMS or run a net

EC/AEC are organizational appointments; NCS is an operational role. Neither a title nor a volunteer's readiness designation automatically grants application permissions.

### 4.1 User Stories and Acceptance Outcomes

| ID | User story | Acceptance outcome |
|---|---|---|
| TM-01 | As a prospective volunteer, I want a short application so I can get involved before I own equipment or finish training. | Name, a contact method, intended unit, and interests are enough to submit; technical sections can be completed later, and the next step is visible. |
| TM-02 | As a member, I want to update or confirm my information from my phone. | Saved progress survives leaving the page; I can confirm no changes and see which fields need staff review. |
| TM-03 | As an EC, I want to maintain a record for a member who prefers a phone call. | I can add/update a person without email, callsign, or account, record the source of the update, and later link a verified account without losing history. |
| TM-04 | As an EC, I want Joel's four roster categories plus trainee and interested views. | Saved views derive from separate status dimensions, have visible definitions and an as-of date, and expose incomplete classifications. |
| TM-05 | As an AEC, I want to help manage my assigned area. | My access is limited to delegated units/actions; changing an ID or export filter cannot expose another unit's private records. |
| TM-06 | As a home-based volunteer, I want my contribution to count. | I appear in matching home relay, net control, or digital-message tasks even when field deployment is declined. |
| TM-07 | As a training reviewer, I want to distinguish reported training from verified qualifications. | Records retain course/version, completion, evidence, reviewer, and any applicable renewal; members cannot verify their own records. |
| TM-08 | As a manager, I want to find usable operators for a task. | Compound filters match the same station configuration; results explain matches, unknowns, and missing requirements. |
| TM-09 | As the spreadsheet owner, I want to import all three tabs safely. | A preview shows mappings, identity conflicts, unrecognized values, and row totals before committing; a repeat import does not duplicate records. |
| TM-10 | As a coordinator, I want a roster that stays current. | I can find overdue confirmations, request updates, and record assisted responses without treating inactivity as proof of departure. |
| TM-11 | As an EC, I want respectful historical records. | Departure or Silent Key status suppresses outreach and staffing suggestions, preserves authorized reporting history, and does not deactivate unrelated memberships/accounts. |
| TM-12 | As a planner, I want to describe objectives and resource needs. | I can define tasks, bands/modes, locations, time windows, headcounts, and qualifications, then see candidates and unmet needs. |
| TM-13 | As a volunteer or assisting manager, I want to accept or decline a proposed assignment. | A suggestion is not an assignment; acceptance and actual attendance are separate, conflicts are flagged, and the Events workflow owns shifts. |
| TM-14 | As a communications lead, I want reviewable incident forms. | Supported forms share a plan revision and operational period, identify missing inputs, and require explicit review before approval. |
| TM-15 | As a reporting coordinator, I want credible monthly totals. | I can trace totals to recorded participation, distinguish planned/actual time, and see how multi-unit membership and overlaps were handled. |
| TM-16 | As a member, I want to distinguish my home, truck, and deployable equipment. | Multiple setups reference the same physical item where applicable; each has its own usable band/mode/power/accessory requirements and setup time. |
| TM-17 | As a planner, I want to know what moving a home radio takes out of service. | Reserving the FT-991A for deployment conflicts with home configurations that need that same radio; the FT-817ND is an alternative only if its complete setup meets the task. |
| TM-18 | As an asset manager, I want an inventory for both EMA offices, the trailer, and the backpack kit. | Each tracked item has a stable ID, owner, current assignment, condition, and history; kit contents remain individually traceable when removed or replaced. |
| TM-19 | As a coordinator, I want to find a checked-out go-kit. | I can see the confirmed holder, last-known location, handoff time, due/recall conditions, and manifest; transfer and return update custody without losing history. |
| TM-20 | As an asset manager, I want repairs and retirement to affect readiness. | Repair/decommissioned assets remain accounted for but are excluded from usable supply; affected kits/configurations and future reservations are flagged. |
| TM-21 | As a volunteer, I want to use team equipment even when I do not own a suitable radio. | Search can pair my qualifications with an available team setup, identifying pickup, training, power, and transport needs without claiming I own the equipment. |
| TM-22 | As a member during a storm, I want to know where to listen when normal communications fail. | A previously issued PACE/rendezvous card gives channel settings, switching triggers, listening windows, and instructions if no NCS is heard; monitoring alone does not authorize deployment. |
| TM-23 | As a callout coordinator, I want to reach the right volunteers and see who responded. | A preview shows the authorized audience, consent exclusions, message/version/expiry, and cost estimate; delivery, acknowledgment, availability, and assignment acceptance remain distinct. |
| TM-24 | As a member, I want control of SMS contact and privacy. | Joining does not require SMS; opting out suppresses queued sends, personal numbers are not exposed to recipients, and radio/phone-assisted responses remain usable. |
| TM-25 | As an EC or evaluator, I want a training program that demonstrates readiness. | Versioned task requirements, observed sign-offs, mentoring, and dated sessions support progression without treating attendance or a certificate as complete task qualification. |
| TM-26 | As a deploying volunteer, I want clear instructions and a tailored packing list. | My packet includes authorized task, supervisor/site instructions, agreed logistics, personal/equipment checklist, PACE plan, and checkout/return steps; it can be printed before departure. |
| TM-27 | As a coordinator, I want to account for people through their return. | En-route, arrival, duty, relief, release, and return are recorded distinctly, overdue milestones prompt staff follow-up, and closing a net changes none of them automatically. |
| TM-28 | As an incoming EC, I want procedures and ownership to survive a leadership change. | I can locate approved manuals, agency contacts/agreements, training plans, pending actions, and responsible deputies without relying on a predecessor's personal inbox. |
| TM-29 | As a planner, I want evidence that a particular station can complete a communications task. | Results distinguish reported, self-tested, reviewed, failed, and stale evidence for the configuration/path; a Telnet test cannot satisfy an RF or peer-to-peer requirement. |
| TM-30 | As an instructor, I want reusable end-to-end digital-message exercises. | A template specifies prerequisites, stations, transports, message format, delivery criteria, and evaluator; attendance, delivery evidence, and qualification sign-off remain separate. |
| TM-31 | As an EC, I want seasonal and prestorm readiness checks before assigning people. | Staged tasks have owners, deadlines, evidence, and blockers; home and field preparation are distinct, and tentative primary/backup staffing does not authorize deployment. |
| TM-32 | As a qualified relief operator, I want to use a team kit without relying on its usual operator. | I can access its approved, printable configuration-specific guide, reconcile the manifest, connect and test the setup, and report missing or outdated instructions. |
| TM-33 | As a reporting coordinator, I want an NH-style timecard without duplicate entry. | Approved mappings include off-air work, preserve recorded time, apply export-only rounding, and trace totals to canonical activity without double-counting. |
| TM-34 | As an exercise lead, I want station-specific findings to improve the next operation. | Observations link to the affected configuration, kit, site, or procedure; a corrective action has an owner, due date, and retest evidence without automatically certifying an operator. |
| TM-35 | As a team net manager creating or editing a team-linked net, I want the team's PACE frequencies/channels at the top of the frequency options. | The authorized team's approved radio entries appear first, labeled and ordered Primary, Alternate, Contingency, Emergency; remaining permitted choices stay available, and suggestions never silently select or replace a net frequency. |
| TM-36 | As a coordinator onboarding a team with existing records, I want downloadable CSV templates for each supported record type. | I can download a blank template and synthetic example, map existing columns, preview validation and relationships, and import authorized records in dependency order; corrections/re-imports do not duplicate records or silently overwrite data. |
| TM-37 | As an equipment custodian, I want a maintenance schedule and service history for each item. | Multiple item-specific tasks retain procedure, responsible person, recurrence/trigger, due date, results, and evidence; overdue, deferred, failed, and completed work remain distinct, and service completion does not silently change custody or certify readiness. |
| TM-38 | As an antenna-system maintainer, I want to retain and compare SWR sweeps. | Each sweep identifies the antenna/feed-line configuration and measurement conditions, with dated results and attachments; baseline comparisons flag context differences, and failures or material changes prompt review of affected capabilities. |

## 5. Functional Requirements

### 5.1 Navigation and Team Discovery

- Add Teams menu entry between Schedule and Stats.
- Team list defaults:
  - teams the user belongs to first
  - then other discoverable teams
- Sorting options:
  - alphabetical
  - manager
  - size
  - region
- Private teams:
  - hidden from non-members in browse results by default; metadata-only discovery is an explicit team setting if supported

### 5.2 Membership and Access Control

- Users can request to join discoverable teams.
- Team manager receives notification and can approve/deny.
- Approval to the general team roster does not certify formal ARES eligibility, agency credentials, or incident access; apply the program-specific checks in section 5.16.
- Candidate/pending state visible in team staff workflow.
- Non-members cannot view restricted team internals.
- Membership applications are separate from the approved member roster. Saving a draft or expressing interest grants no teammate-directory access.
- A team contains named organizational units, initially supporting section → district/county → local group. Names and optional levels are configurable; an ARRL section is not assumed to be the same as a county or an ICS section. EMA-directed teams can omit ARES-specific levels and titles.
- A membership can have one primary unit and additional unit assignments, with effective dates. Count a person once in team-wide headcounts even if they serve several units.
- Delegation names both the unit scope and allowed actions (roster, approvals, training review, planning, export). Access to descendants is explicit; belonging to a parent unit is not a blanket authorization rule.
- Separate independent teams remain separate privacy boundaries. A person may join several; a hierarchy does not silently enroll them in other teams or expose their other memberships.

### 5.3 Identity Linking and Invitations

- Team manager can create non-user member records.
- Optional invite flow for non-user records.
- Give each membership a stable internal ID; callsigns, names, and email addresses are mutable attributes, not primary identity keys.
- Callsign/email matches suggest candidates only. Claiming a private record requires verified account ownership and an invitation bound to that record, or manager-reviewed confirmation. Never expose a private roster because somebody typed a matching callsign.
- Handle shared email addresses, GMRS/family calls, former/reassigned callsigns, changed names, and conflicting existing links. Ambiguity goes to a review queue; an unresolved record remains usable by its authorized manager.
- Invitations expire, are single-use, and can be revoked. The verified claim preserves membership, training, provenance, and participation history.
- A manager edit changes team-held contact information; it must not change an account's login email or global identity. Sharing profile updates with another team is an explicit member action.
- Reuse known `Contact.user_id` links as evidence where applicable, but do not reuse the current contact auto-match rule as authorization for private membership data.

### 5.4 Net Integration

- Net Schedule supports assigning a default team.
- Nets created from a schedule inherit that team association by default.
- Net Edit supports overriding or clearing inherited team association when needed.
- Net Setup and Edit Net support assigning a net to a team.
- Net participation contributes to team-level summaries.
- Member participation time and check-in counts are aggregated automatically to the associated team.
- Users in multiple teams map net activity according to net-team assignment.
- Require authority over both the net/schedule and the destination team to create or change the association; an association grants no additional net or traffic permissions.
- Keep membership effective dates and the report's attribution rule. Backdated/imported participation requires review rather than assigning every historical check-in to today's roster.
- Do not treat a check-in count, website login, or NCS appointment as proof of current training, willingness to deploy, or equipment readiness.

#### PACE-Aware Frequency Selection

When an authorized net manager creates or edits a net connected to a team, automatically present that team's approved PACE radio frequencies/channels at the top of the frequency selection list. This applies whether the team association is selected directly or inherited from a schedule/template. Reuse the section 5.14 PACE entries and existing `Frequency` choices rather than maintaining a separate favorites list.

- Show a labeled team PACE group before the remaining permitted frequency options, ordered Primary, Alternate, Contingency, Emergency. Include channel name, frequency, mode, relevant channel settings, and PACE role so similarly named or numerically identical channels can be distinguished.
- If the team has multiple approved mission/path plans, identify the plan/path on each entry; where a plan is explicitly selected for the net, prioritize that plan within the PACE group. Preserve configured order within a role. Non-radio methods such as telephone/SMS do not become frequency options.
- Resolve approved PACE radio entries to selectable channel records without duplicating them in the remaining list. Deduplicate by channel identity/settings, not frequency number alone; retain all applicable plan/role labels. Unresolved or incomplete entries are visibly flagged for authorized review, not silently fabricated into usable channels.
- Keep normal search/filter behavior, showing matching PACE entries first and other matching choices afterward. Prioritization is a convenience, not a restriction, automatic selection, or authorization to transmit.
- Recompute suggestions when the team association changes or is cleared. Preserve already selected net frequencies; flag any access/validity problem for explicit resolution rather than silently replacing or deleting a selection. Later PACE revisions do not rewrite saved net settings.
- Enforce team/plan visibility for suggestions, labels, and channel details. Draft, superseded, or unauthorized plans must not be exposed as current recommendations. A team with no approved radio entries, or a net without a team, retains the ordinary frequency list. Selecting a restricted entry does not authorize publishing its private details in public net outputs; apply the document/channel disclosure rules before saving or exporting.

### 5.5 Reporting

- Provide team-level summaries to reduce manual reporting burden.
- Support export formats needed for local coordinator workflows and ARES Form 2 preparation.
- Offer monthly, quarterly, yearly, and custom periods in a configured reporting timezone, with explicit start/end boundaries and an as-of timestamp.
- Reports include membership categories/unit counts, applications awaiting review, stale records, training gaps, usable capabilities, and participation. Permission-filter exports using the same scope as the on-screen view.
- Count unique people at the team level, including manager-maintained records, with unresolved identity links visibly separated. Do not add subgroup totals to produce a team headcount.
- Keep planned shift hours, net participation time, actual Events hours, and approved manual activity distinct. Document which sources each report includes; linked check-in and shift time for the same work must not be counted twice.
- ARES/EMA adapters need coordinator-approved field mappings, units, and sample expected totals. Export preparation data first; do not claim that every activity maps automatically to a current official reporting category.

The [NH ARES timecard v1-6 hosted by GMARES](https://gmares.org/wp-content/uploads/2025/12/NH-ARES-Timecard-v1-6.xlsx) is a concrete adapter example: nets, exercises, training, public service, community service, SKYWARN, meetings, emergencies, and unclassified activity. Support reviewed off-air activity such as mentoring and station maintenance without inventing a net. Retain source activity IDs, dates, actual durations, and the approved report mapping/version. Apply destination-specific rounding (the example workbook requests half-hour increments) only at export, preserving original time; confirm rounding granularity and category definitions with the receiving coordinator. Linked net, session, and Events records represent one contribution, not additive hours. An NH mapping must not silently become the default for Maine or other programs.

### 5.6 Team Locations and Coverage Assessment

This is the Teams-dependent half of the "can hear" inter-station propagation feature. The per-net capture side of that feature (station-to-station coverage logging: the reporting dialog, the Coverage panel, and the map overlay) shipped 2026-08-02 and did not wait on Teams — see `docs/CHANGELOG.md` for the release entry. Its settled data model (the `can_hear_reports` table, the `operating_position` classifier on check-ins, the `team_location_id` upgrade path below) lives in `backend/app/models.py` and `backend/app/routers/can_hear.py` now that it has shipped; it's no longer a separate roadmap entry. This section covers only what genuinely requires a team to exist.

Context: teams support fixed locations (shelters, EOCs, hospitals, cooling centers, staging areas). A team manager needs to know, for each supported location, which other locations and which stations that location can reliably communicate with — and where the gaps are. This is the deliverable of a Coverage Assessment exercise, a common ARES/emcomm SET drill type, and today it is produced by hand from paper notes.

#### Named locations

- New `TeamLocation` entity: a place a team supports, owned by one team.
- Fields: name, type (shelter/EOC/hospital/staging/other), address or coordinates, optional grid square, notes, active flag.
- Coordinates reuse the existing location parsing already used by the check-in map (GPS, Maidenhead, UTM, MGRS, or geocoded address), so a location renders on a map with no new parsing work.
- Address and access details are high-sensitivity data — see section 8 for classification and controls.

#### Link from per-net reports

- The shipped feature stores a station's operating position on its check-in as a nullable free-text classifier (Home / Field Deployed / typed value).
- Teams adds a nullable `team_location_id` foreign key on the check-in alongside it, plus a `fixed_location` classifier value. This is additive: no existing row is rewritten and no migration breaks.
- Once available, the reporting dialog's operating-position dropdown is seeded with the team's named locations in addition to Home and Field Deployed.
- A manager can backfill: map recurring free-text positions ("Windham EOC") onto the matching `TeamLocation` record. Backfill is manager-reviewed, never automatic string matching.

#### Location-to-location coverage

- `TeamLocationCoverage` is a **read-time rollup**, not a maintained table, consistent with the per-net-source-of-truth decision in the roadmap item. It answers: for a pair of locations, has any station operating from location A confirmed hearing a station operating from location B, on which frequency, how recently, and across how many nets.
- Present confirmed two-way paths distinctly from one-way ones. Direction is never inferred — a one-way path is an operationally meaningful finding, not missing data.
- Frequency scoping carries through: a repeater path and a simplex path between the same two locations are separate findings, and the simplex one is usually the one that matters for a drill.
- Reconsider precompute only if a team-year coverage query becomes slow. Caching a rollup later does not change the source of truth.

#### Manager-facing outputs

- Per-location view: a map and list of the locations and stations that location can communicate with, with recency and confirmation count.
- Team coverage map: all of the team's locations plus confirmed paths between them, filterable by frequency and date range.
- Gap analysis: which supported locations have no confirmed path to the team's primary location, and which have only a one-way path.
- Relay planning: which member stations sit on a confirmed path between two locations that have none directly, i.e. who can relay for whom.
- Placement planning: where an additional station would close the most gaps.
- Coverage Assessment export suitable for handing to an EC or attaching to a SET report, following the export conventions in section 5.5.

#### Cross-team and mutual aid

- Deliberately out of scope for the first Teams release. Sharing coverage data between teams raises the same consent and data-sovereignty questions as cross-instance federation (a stated non-goal in section 2), and should not be designed until single-team coverage has been used in a real drill.

#### Note on personal coverage maps

A user's own "stations I can hear from home" map is **not** part of this section — it's the Profile → Coverage tab, and it already shipped alongside the rest of the per-net capture on 2026-08-02, needing only per-net reports and the home classifier. Teams does not gate it and must not duplicate it.

### 5.7 Onboarding, Self-Service, and Assisted Maintenance

- Provide a mobile-friendly, team-branded entry page explaining who the group serves, how volunteers can help, and what happens after submission. Private teams use an invitation entry point.
- Start with name, preferred contact method, intended unit/location, interests, and acknowledgment of the team's data-use notice. Do not require a callsign, full address, training certificate, or complete station inventory to express interest.
- Use short sections: About You; Contact & Preferences; Participation; Training; Stations & Equipment. Show progress, save drafts, and allow "not sure" answers. Core status/mode values use labeled selections, following the existing UI guidance.
- Account holders use ECTLogger authentication. A manager can enter the same information from a phone call or paper application without creating an account for the person. An unauthenticated interest submission, if offered, is an intake record with abuse controls and no roster access.
- Members directly maintain contact preferences, interests, willingness, availability, and self-reported capabilities. Approvals, verified qualifications, appointments, and access authorizations remain delegated staff actions. Show changes awaiting review alongside the last approved value where relevant.
- After review, show the applicant a named next step: coordinator contact, orientation, mentor, training, or an introductory net. Capture optional mentoring needs and non-radio interests such as logging, technical support, and recruitment.
- Keep onboarding configuration modest: required/optional sections and a few typed local fields. A general-purpose form builder is not necessary for the first release.

### 5.8 Membership, Readiness, and Staff Designations

Do not overload a single `status` field. The user-facing roster can show several understandable badges derived from these independent facts:

| Dimension | Proposed values / meaning | Maintained by |
|---|---|---|
| Application decision | Draft, pending, approved, declined, withdrawn | Applicant submits/withdraws; authorized staff decides |
| Membership stage | Interested, trainee, active, reserve, historical | Authorized roster staff, with dated changes |
| Historical disposition | Left, transferred, Silent Key, other; effective date and optional restricted note | Authorized roster staff |
| Field deployment willingness/ability | Willing and able, unable, not willing, conditional, unknown | Member or assisting manager; separate staff eligibility review |
| Participation setting | Home/fixed, mobile, portable/field, remote support; multiple selections allowed | Member or assisting manager |
| Qualification / appointment | Task-specific trainee or qualified; EC, AEC, NCS-qualified, mentor, etc. | Delegated reviewer/appointing staff |
| Current availability | Available, unavailable, conditional, unknown for a stated date/time window | Member or assisting manager |
| Application permissions | Member, scoped roster manager, training reviewer, planner, team administrator | Authorized team administrator |

"Standalone home-based volunteer" is a visible participation designation: home/fixed support, optionally with no field deployment. It can coexist with active or reserve membership and does not require a subordinate field assignment. A member can also be active overall while training for a particular task. `User.is_active`, a live check-in status, and schedule `TemplateStaff` are not membership-stage fields.

Provide these saved views out of the box, with filter definitions visible:

| Joel's category | Definition |
|---|---|
| Active and willing to deploy | Active stage + willing and able for field deployment; show qualification gaps separately. This is a candidate pool, not a certified deployable headcount. |
| Active, but unable to deploy | Active stage + unable to deploy; show home/remote participation and a separate adjacent view for those who choose not to deploy. |
| Reserve | Reserve stage, with escalation conditions and contact/availability preferences; do not mix into routine active staffing searches by default. |
| Historical | Historical stage, grouped by left/transferred/Silent Key/other, excluded from normal outreach and assignment searches. |

Also supply Interested, Trainees, Home-Based Support, and Needs Classification views. Conditional or unknown deployment answers must remain visible rather than being silently counted as deployable or non-deployable. Overlapping badges/views are not additive totals.

Readiness is derived for a specific task from stage, qualifications, usable equipment, participation setting, and dated availability. A team can define local qualification rules and trainee supervision requirements. Store willingness without demanding medical details or a reason for inability to deploy. Members can immediately mark themselves unavailable; resolving a staff review must never delay that change taking effect.

Historical transitions retain authorized activity history and suppress pending team reminders/invites/offers. They do not rewrite closed net logs, deactivate the global account, or change another team's record. Restoration is reviewed and audited; it does not resurrect old offers or assume old qualifications remain current.

### 5.9 Training and Station Capabilities

**Training records** distinguish not reported, interested/planned, in progress, self-reported complete, verified, and expired/superseded where applicable. Each record carries course/qualification name and version, provider, completion date, optional evidence/reference, review status/reviewer/date, and an expiry or review date only where the credential or team policy calls for one. Do not invent a universal expiration for FEMA courses. Imported "Yes" means reported completion with unknown date/evidence until reviewed.

Task qualification is separate from course attendance: NCS training, observed competence, and authorization to run a particular net are distinct. A trainee may qualify for a supervised assignment while remaining ineligible for an unsupervised one. Training evidence uploads, when introduced, need private storage, authorized downloads, size/type limits, and a deletion policy.

**Capabilities are combinations, not unrelated checkboxes.** A capability entry describes a usable setup:

- Station/configuration: home/fixed, mobile, or portable; named location if relevant, and optional equipment identifier for a shared resource.
- Radio service: amateur, GMRS, FRS, CB, marine, or locally defined service.
- Band/channel range and mode: distinct bands, voice modes, digital modes/protocols, and any compatibility/version constraints.
- Function: voice net control, relay, message origination/delivery, Winlink client, Winlink RMS gateway, packet/BBS, APRS, or another task.
- Supporting equipment/software, antenna polarization where relevant, emergency power, and optional tested runtime under stated conditions.
- Access to equipment (owned, shared, borrowed, team-provided), setup needs, operator proficiency, operational/test status, and confirmation date.

A Winlink service claim does not specify its RF transport; ask for the usable band and transport combination. PACTOR 2 and 3 may differ for matching. Keep legacy labels such as Winmor as imported descriptions pending review rather than silently converting them. Separate software/hardware names (PiGate), services (Winlink), modes, and bands so a search can ask the right question.

Do not infer a mobile capability from a home setup, HF digital ability from unrelated HF voice and VHF packet checkboxes, or every HF band from "80–10m." Broad spreadsheet entries stay broad/unverified until expanded by the member. A capable receiver or owned radio is not automatically a qualified transmitting resource; specific channel use still requires appropriate authorization and coordinator review.

#### Personal Equipment and Operating Configurations

Separate **the physical item**, **a usable configuration of items**, and **where/when that configuration can operate**. A member may report simple capabilities first and add equipment detail progressively; item-level identity is required when that equipment is shared between configurations or reserved for a plan.

| Operating context | What it describes | Deployment details |
|---|---|---|
| Home / fixed | Equipment normally installed at the member's home or another fixed station | Whether individual items can be removed, owner willingness, disconnect/reinstall time, and the home capabilities lost while those items are away |
| Mobile / vehicle-installed | Equipment installed and usable in a named vehicle, such as "Brad's truck" | Vehicle availability, installed antennas/power, and supported modes/bands in that installation; driving/parked limitations can be recorded |
| Deployable / portable | Equipment that can be transported and assembled at another site, including a ready-packed kit or equipment borrowed from the home station | Packed versus needs disassembly, required accessories/power/transport, setup time, and availability window |

Deployability is an attribute of an item/setup, not proof that it is already packed or that its owner is available. A portable kit carried in a truck is not automatically a vehicle-installed station. Deployable equipment may be offered with its owner as operator or loaned for another qualified operator; record those permissions separately.

Each physical item has a stable ID, owner, category, make/model/description, optional serial/asset tag, current placement/custody, service condition, and confirmation date. Personal serial numbers are optional and private. Store multiple configurations with references to their required radio(s), computer/interface/software, antennas/feed lines, mast, batteries/power supplies, and other dependencies. Requirements may identify acceptable alternatives; a verified substitution is not an extra copy of the original resource.

Per configuration, record usable service/band/mode combinations, digital transport/function, transmit power or QRP designation, antenna coverage/polarization, power source/runtime, and tested status. A PC interface alone does not establish that every digital mode works; the computer, interface, software, and operator proficiency must support the selected task. A manufacturer's broad "all-band/all-mode" label or imported description remains a reported summary until actual supported combinations are confirmed. No equipment specification lookup or automatic model-based certification is required for the initial feature.

**Brad's example, expressed as records rather than duplicate radios:**

| Item/setup supplied by Brad | Proposed representation | Planning consequence |
|---|---|---|
| FT-991A connected to a home computer, removable for deployment | One personal radio referenced by a home configuration and a deployable configuration; document whether the same computer travels or another is required | Deploying the radio makes configurations depending on it unavailable at home for removal, travel, operation, and reinstall time. Other independent home equipment can still be considered. |
| FT-817ND, described as QRP/all-band/all-mode with a PC interface | A second physical radio with its own configuration, reported QRP constraint, interface, power, and antenna requirements | Can be proposed independently of the FT-991A, but cannot silently satisfy a task requiring a higher transmit-power threshold. Shared computer/antenna dependencies may still conflict. |
| Truck VHF/UHF FM and DMR equipment | Vehicle-installed configuration with the actual radio item(s), confirmed band/mode combinations, antenna, and vehicle power | Supplies vehicle-based capability only where that installation supports the task; it does not establish truck HF capability. |
| Deployable HF antennas and mast | Separate personal items usable as dependencies of compatible portable setups | The same mast, antenna, or feed line cannot be promised to two simultaneous sites; transport and assembly requirements are visible. |

Use member profile sections labeled Home, Vehicles, and Deployable Equipment, with a shared Equipment list behind them. Let a member choose "also usable for deployment" and select existing equipment when defining a portable setup. Show which items must be disconnected, what must be packed, missing dependencies, and affected home capabilities. Personal equipment remains member-owned when offered to a team; a checkout or reservation never changes ownership.

#### Demonstrated Station Readiness

Inspired by [GMARES Winlink training](https://gmares.org/winlink-training-resources/), distinguish internet/Telnet, RF-to-gateway, and direct station-to-station paths. Record usable service, band, transport/mode, function, and dependencies, including remote endpoint compatibility, gateway or internet reliance. A Telnet success is not evidence of RF readiness; RF gateway use is not proof that direct peer-to-peer operation works.

Keep dated test records linked to the operator, configuration revision/required items, task, and path. Capture test time, source net/exercise if any, endpoint, power/antenna setup, relevant software/configuration versions, expected outcome, observed result, and reviewer/evidence where applicable. Distinguish member-reported capability, self-tested success, reviewed demonstration, failed/partial test, and not tested; derive stale/retest-needed indicators from local review policy and material configuration changes. Preserve older successes alongside newer failures rather than showing only the last successful date. Do not invent a universal test expiry or claim a tested path guarantees future propagation or endpoint availability.

Digital evidence may include successful origination, receipt, relay, readable form delivery, or printing as required by the task. Link existing traffic/log records where available; avoid duplicating message bodies or storing sensitive real incident content for training proof. An observed receive-only or one-way result cannot establish two-way delivery. A station test is distinct from an evaluator's operator qualification sign-off and from the existing `CanHearReport` RF observation.

Search can require a particular tested path, power condition, evidence review state, and recency. Explain missing tests, failed dependencies, and changes needing retest. Moving Brad's FT-991A to another antenna/computer/power setup does not automatically transfer the home configuration's demonstrated readiness to the deployed setup.

### 5.10 Roster Search and Task Matching

The roster has a search box, labeled filters, selectable columns, saved views, and a detail drawer/page. Group results by organizational unit when useful. Filters include stage, deployment choice, participation setting, task, training/review status, affiliation, town/county, radio service, band, mode, power, current availability, and confirmation age. Local administrative fields are available only to authorized staff.

- Make AND/OR choices explicit: "all required capabilities" versus "any of these alternatives." A requirement for portable 2m FM must match a portable 2m FM setup on the same record.
- Allow multiple requirements for one person, but evaluate concurrency and shared equipment: owning one radio does not imply two simultaneous channels. A staffing headcount cannot count that person twice during overlapping shifts.
- Show candidates with reasons: matches requirements, potentially suitable but needs confirmation, or missing a stated requirement. Unknown, stale, unverified, unavailable, and explicitly incapable are distinct conditions.
- Hard requirements (for example a required verified qualification) cannot be satisfied by an unknown field. Desirable capabilities help order results without hiding missing required capabilities.
- Default to approved, non-historical memberships in the permitted scope. Reserve and trainee candidates are explicit additions; trainee suggestions include supervision needs.
- A team-only query must not expose another team's availability, qualifications, or conflicts. Cross-team conflict checks require a later explicit sharing policy; label the current conflict check's scope.
- Saved searches are live views with an as-of timestamp, not frozen rosters. Exports capture filters and date, respect disclosure choices, and identify fields omitted for the recipient.
- Offer "member with own equipment" and "qualified member using team equipment" matches. Results name the usable configuration, needed items, owner permission, equipment condition, and pickup/setup requirements. Owning equipment is not a prerequisite to being a useful operator.
- Check equipment availability across every configuration/kit referencing the same items, including setup/travel/return time. Show conflicts involving radios, computers, antennas, masts, vehicles, and batteries. Do not assume separate band capabilities can operate concurrently unless the setup supports it.

Required acceptance scenarios:

1. Find active, field-willing members in a selected county with verified team-required training and portable 2m FM on battery power. Home-only 2m FM does not match.
2. Find home-based operators able to relay messages on a specified HF band and digital transport using backup power. A volunteer unable to deploy remains eligible.
3. Find reserve packet/Winlink operators who may assist during a stated escalation window; missing availability returns "confirm availability," not "available."
4. Find NCS trainees and available qualified mentors for a drill, showing both the supervision requirement and each person's usable station setup.
5. Find confirmed 60m SSB capability without treating the spreadsheet's "80–10m (ex. 60/30)" as evidence. Show historical records only in the explicit historical search.

Equipment acceptance scenarios (after the applicable asset/reservation phases):

6. Propose Brad's FT-991A for a field assignment and show which home tasks lose that radio during the same window. Consider the FT-817ND only after checking QRP/power, computer, antenna, and operator requirements.
7. Find a qualified operator with no personal portable setup and pair them with the backpack go-kit. A kit checked out to somebody else requires an agreed handoff; an overdue return is not proof that it is available.
8. Remove a required battery or radio from a kit for repair. Searches flag only the affected capabilities as unavailable/degraded and identify the missing dependency; unaffected functions or an approved compatible replacement can still be evaluated.

Demonstrated-readiness scenarios:

9. Request battery-powered RF peer-to-peer message delivery. Exclude a configuration demonstrated only through Telnet or an RF gateway from confirmed matches; show it as needing the requested test where otherwise suitable.
10. Record a failed test after an earlier success, then replace the interface or antenna. Keep the evidence history, surface the unresolved failure/configuration change, and require the applicable retest before presenting the setup as currently demonstrated.

### 5.11 Data Freshness, Import, and Local Administration

**Freshness:** distinguish last edited, last member/assisted confirmation, and last staff verification. Confirming a phone number does not refresh equipment or training evidence. Offer configurable section-level review intervals (a proposed pilot default is six months for contact/capability confirmation), a one-click "still correct" action, and a manager queue for overdue or undeliverable requests. Reminders respect contact preferences and historical status, avoid duplicate sends, and support recorded phone/paper follow-up. Never mark a person inactive solely because they did not log in or answer email.

**Spreadsheet transition:** accept CSV exports of Contact, Training, and Capabilities tabs with a guided mapping/preview, alongside the reusable record-type templates below. Native workbook import can follow if the pilot needs it; templates must not require a particular spreadsheet application.

1. Select the team/unit and map source columns, including repeated headings and composite band fields, to the dictionary in section 6.2. Preview how Y/N, blank, F/M/P, and compound cells will be interpreted.
2. Match tabs using manager-confirmed stable identifiers where possible. Use callsign/email/name only to suggest matches; duplicate names, shared calls, and conflicting fields need review. Do not assume that matching row numbers across tabs identifies the same person.
3. Show field-by-field conflicts with existing records and source provenance. Blank cells mean unknown, not false, and must not erase existing values by default. Preserve unknown labels and raw source values in a restricted review record.
4. Commit only accepted mappings/rows, retaining an import batch, row outcomes, and reconciliation totals. Importing data neither invites people nor grants membership access nor verifies qualifications automatically.
5. Re-import with a batch/source key and explicit update policy so the same data does not duplicate members or training. Permit reversal of untouched imported changes; later edits require conflict-aware review rather than blind rollback.
6. Export a reviewed roster and compare it with the spreadsheet before cutover. Retain the original securely for the agreed transition period, then apply the retention policy.

#### Multi-Record CSV Import and Downloadable Templates

Provide a permission-scoped Teams → Import area with a catalog of supported record types, dependencies, template versions, and import history. Each available type offers a downloadable **blank CSV template**, a separate **synthetic example CSV**, and a field guide identifying required/optional columns, accepted values, units, date/time formats, and reference keys. Do not ship real member data in examples or advertise an importer before its destination feature exists. Existing spreadsheets can use column mapping instead of being manually reformatted to match the template.

Present the primary onboarding choices in plain language: **Staff / Members**, **Equipment**, and **Training**, with additional choices for locations, channels, and other supported records. Each has its own CSV template rather than requiring all record types in a single upload. Staff includes volunteers and team leadership, not just people with application accounts or administrative permissions.

| Record type / template family | Relationships and import boundary | Delivery phase |
|---|---|---|
| Staff / members and organizational units | Names, callsigns where applicable, contact details/preferences, unit references, membership stage and participation designations, linked by stable source keys; no account creation or permission grants | M2 |
| Staff appointments | Member/unit keys, organizational position such as EC, AEC, or equipment custodian, effective dates and source; pending authorized review, distinct from login permissions and verified qualifications | M2 |
| Training/completion records | Member key, course/version, completion date and evidence reference; reported/unreviewed until an authorized reviewer acts | M3; legacy training columns can be staged during M2 |
| Personal equipment, station configurations, configuration-item links, and capability entries | Separate item/configuration keys; repeated capability rows preserve service/band/mode/setting combinations and shared equipment | M3; legacy capability columns can be staged during M2 |
| Named team locations, team assets, kit contents, and initial assignment snapshots | Location/member/item keys, legal owner, managing team, parent kit, condition and observed custody date; unresolved custody becomes an accountable discrepancy, not an invented handoff | M3A |
| Equipment maintenance schedules, service history, and antenna sweep summaries | Stable item/system/task keys, responsible custodian, recurrence/due dates, work/result dates, and evidence references; imported history is reported evidence, not automatic return-to-service approval. Sweep files use separate authorized uploads | M3A |
| Team channel definitions and PACE plan entries | Channel/settings keys, plan/path and P/A/C/E role; imported plans remain drafts pending local approval and channel/disclosure validation | M3B |
| Historical participation/manual activity | Member key, source activity key, type, dates and actual duration if known; reviewed attribution and overlap reconciliation, with no fabricated nets or attendance | M4 |

These are related CSV files, not one oversized sheet: import units/members before their appointments, training, and activity, items/locations before dependent configurations/kit assignments, and channels before PACE references. Allow a staged onboarding batch to validate references across its files before committing them in dependency order. Unresolved or ambiguous references block the affected rows and their dependents, while unrelated valid rows may be explicitly accepted. Show exactly what remains pending after a partial import; never create placeholder people, assets, or channels silently.

Use a team-scoped source namespace plus stable external record keys for updates and cross-file relationships; do not require users to discover database IDs. Provide authorized reference-key exports for existing records and keep callsigns, names, and emails as match suggestions only. Validate parent cycles, duplicate keys, cross-team references, conflicting ownership/custody, and required capability combinations. An initial custody snapshot records the importer's observation and provenance, not a fabricated checkout acknowledgment or service history.

Use UTF-8 CSV, accept common BOM/line-ending variations, and correctly handle quoted commas, quotes, and multiline fields. Preserve identifiers as text, document decimal units and ISO date/time formats, and make the reporting/import timezone explicit. Reject ambiguous conversions for review rather than guessing. Templates include a documented version marker; retain the selected schema version with the batch and offer mapping/rejection for obsolete versions. Team-local custom fields appear only in authorized team-specific templates, with their definitions and visibility preserved.

Extend the shared preview with per-row/column errors, proposed creates/updates/unchanged/skips, missing dependencies, and a downloadable correction CSV. Blank cells leave existing values unchanged by default; clearing a value requires an explicit reviewed operation. Revalidate permissions, references, and concurrent changes at commit. Retry/re-import must be idempotent, with reconciled totals and dependency-aware, conflict-checked reversal; deleting records by omission is not supported.

Apply field-level permissions and file/row/size limits, keep uploads and error reports private with retention controls, and prevent spreadsheet-formula execution through spreadsheet-safe exports of untrusted values, including correction files. Never evaluate imported formulas, fetch arbitrary evidence URLs, or treat CSV as executable content. Evidence attachments follow the separate authorized upload workflow. Imports cannot grant application permissions, approve staff appointments or PACE plans, verify qualifications, enroll SMS recipients, send invitations/messages, reserve resources, or authorize deployment; each remains an explicit workflow. An imported EC/AEC title grants no administrative access; an imported NCS-qualified designation is reported qualification evidence requiring review, not a live net role. Existing historical/suppression rules still apply to imported records.

Provide team-scoped typed custom fields (text, choice, yes/no/unknown, date, number) for limited local needs. Each field has a label, help text, visibility, editor role, and export policy. Keep searchable shared concepts such as band/mode/training in structured records, not arbitrary notes. Door, IaR, shirt issuance, and apparel sizes should not clutter the initial volunteer application.

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

### 5.13 Team Assets, Kits, and Custody

#### Station and Kit Operating Guides

Attach a versioned operating guide to each supported station/kit configuration, using the [GMARES go-box article](https://gmares.org/wp-content/uploads/2023/04/VHF-UHF-Go-Box.pdf) as a design example rather than a prescribed build. Include labeled connection photographs/diagrams, required accessories and compatible substitutions, software/configuration references, setup/shutdown steps, power requirements, measured runtime with test conditions, and a quick functional test. Do not present battery capacity alone as guaranteed operating duration.

Link to the existing manifest, equipment IDs, and station tests instead of maintaining a second inventory. Record author/reviewer, applicable configuration revision, review date, and changes requiring review. A replacement radio/interface or changed wiring flags affected instructions for review without rewriting previously issued guides. Personal configurations can have private guides; team kit guides use scoped member access, with restricted site/access details separated and no passwords or door codes embedded.

Provide a printable/downloadable, revision-marked copy before handoff or deployment, including the guide in the section 5.17 packet when applicable. Pilot with a qualified operator other than the kit's usual maintainer: find parts, assemble safely under local procedures, complete a functional test, and submit discrepancies. Guide availability, manifest completeness, successful testing, custody, and operator authorization are independent facts.

#### Inventory and Ownership

Provide a Teams → Assets area with inventory, kits/stations, current assignments, checkouts, and service history. Register team-owned equipment and equipment managed for an EMA or other agency; record the legal owner separately from the managing team and the person holding it. A member's loaned radio links to the same physical equipment record under explicitly granted team visibility, rather than becoming a duplicate team-owned radio. Sharing records/reservations across independent teams remains a later policy decision.

Use named `TeamLocation` records for the two EMA offices. Model the trailer as a movable asset/container with a home storage location and changing current assignment. Model the backpack go-kit as a container/kit asset; neither a trailer nor a backpack should masquerade as a permanently fixed location in coverage maps. A deployment can link either to a supported site while retaining its asset identity.

Track radios, antenna systems, batteries, power supplies, computers/interfaces, feed lines, masts, and other accountable accessories. Each registered item has an internal asset ID even if it lacks a serial number. Useful fields include description/category, make/model, owner, managing team/unit, serial/tag when applicable, home storage location, current assignment, condition, last inventory confirmation, and optional service/test dates and restricted notes. Show power/capacity and relevant technical capabilities through the same equipment/configuration model used for personal gear. Purchasing, depreciation, and consumable stock accounting remain outside this scope.

#### Every Asset Has an Accountable Assignment

Do not combine lifecycle, condition, physical whereabouts, and future plans in one status. Every asset has exactly one current primary assignment, directly or inherited from its containing kit. Also retain an accountable contact, last-known physical location, and the timestamp/source of the latest confirmation where applicable.

| Assignment/disposition shown to staff | Required record | Readiness effect |
|---|---|---|
| Assigned to location | Named location, such as EMA Office A/B or trailer storage, and responsible custodian/contact | Evaluate condition, access, reservations, and whether removal is permitted |
| Assigned / checked out to member | Team membership record (account optional), handoff time, last-known location, purpose, and due date or explicit ongoing-assignment review date | Holder is known; availability for another task requires release/handoff confirmation |
| Contained in kit/trailer | Parent asset plus effective custody/location inherited through its current assignment | Parent checkout includes the contents actually present; component condition still affects capability |
| Out for repair | Service destination/provider, team liaison, dispatch date, fault/work note, and expected return if known | Unavailable until received and checked; retain the legal owner and origin |
| Decommissioned | Lifecycle state, date/reason/authorizer, and retained storage/custodian or recorded disposal/transfer destination | Excluded from usable inventory and new allocations; identity/history remain searchable |
| Missing / location unconfirmed | Explicit discrepancy, last confirmed assignment/time, responsible investigator, and follow-up state | Excluded from confirmed available supply; never silently treated as unassigned stock |

"Available" is derived for a time/task; "reserved" describes future use. Neither replaces custody. A retired radio still on an EMA shelf has both a decommissioned lifecycle state and a known storage assignment. Closing an import with unknown location creates an accountable discrepancy requiring reconciliation, not a fabricated location. A home/default storage location is not evidence that an item was returned there.

#### Kit Contents and Readiness

- Keep a manifest of expected equipment and actual linked items for each office station, trailer, and go-kit. A station configuration describes how items operate together; physical containment describes where they are stored. Sharing a configuration does not put an item inside two containers.
- A physical item has at most one current parent container; prevent cycles. Nested kits are allowed (for example a backpack inside the trailer), with inherited custody resolved to the outer holder/location and visible in the item detail.
- Checkout of a complete kit moves its present contents together, atomically. Missing components are listed on the handoff manifest, not falsely marked as transferred. On removal, explicitly detach the component and give it a new assignment in the same operation; the kit retains its expected-content requirement.
- Record substitutions and manifest revisions with dates. Historical handoffs retain the manifest as transferred at that time, even if a radio or battery is later replaced.
- Track condition separately (ready, degraded, unserviceable, unknown) and task-dependent checks such as battery charge/test date, working power supply, required cables, antenna availability, and computer/interface readiness. Inventory confirmation alone does not certify functional readiness.
- Recompute affected configuration/kit capabilities when a dependency moves, fails, goes for repair, or is decommissioned. Report missing required versus optional items and usable alternatives; do not simply add together every mode listed on every radio in a kit.

#### Checkout, Transfer, Return, and Service

1. **Select and check.** The custodian chooses the item/kit, reviews its current assignment, manifest/condition, conflicting reservations, and intended recipient/purpose. Record due date or explicitly ongoing assignment with a review date.
2. **Confirm the handoff.** Record from/to holder or location, actual handoff time, recorder, recipient acknowledgment (in-app or documented phone/in-person), and any condition/contents exceptions. A pending request does not change confirmed custody. Assisted handoff works for a member without an account.
3. **Transfer without losing the trail.** Moving a kit between members, offices, trailer storage, or a deployed site creates another custody event. Resolve an in-transit item to a named responsible holder and destination. Do not overwrite the prior holder or infer movement from a plan edit.
4. **Return and reconcile.** A return request is not a completed return: an authorized receiver records actual destination, manifest reconciliation, condition, and outstanding missing/damaged items. A late/partial return cannot reset the entire kit to "ready."
5. **Repair or retire.** Detach a failed component if needed, record the repair destination/team liaison, and flag affected reservations. A repaired item requires receipt and appropriate inspection before being offered as ready. Decommissioning requires disposition details and history retention; outstanding custody/contents must be resolved explicitly.

Maintain an append-only handoff/service history with attributed corrections, an authoritative current assignment, and version checks. Concurrent checkout requests for the same kit or component cannot both succeed; retries must not create duplicate handoffs. Kit/component state changes happen as one transaction. The detailed storage design may use current-state records plus history, but both must remain consistent.

Show current holder and last confirmation prominently, with authorized contact details, due date, overdue/recall indicators, kit completeness, and last service/test. Provide filters and reports for location, holder, owner/unit, category, repair, retirement, missing items, overdue returns, and inventory confirmation age. Optional QR/asset-tag lookup can accelerate identification later; it grants no public access to custody or inventory details.

Notify holders and scoped custodians of agreed return/review dates and unresolved discrepancies through permitted channels. A coordinator can record a recall request and follow-up; neither a recall nor an expired due date automatically transfers custody. Member departure or Silent Key status creates a staff equipment-recovery task without sending routine notices to a historical member or clearing their outstanding custody record.

#### Per-Item Maintenance Schedules and History

Give each equipment item an explicit maintenance plan: one or more tasks, an approved no-scheduled-maintenance designation with rationale/review date, or a visible needs-review state. Plans also apply to personal equipment when the owner chooses to track/share them, without exposing private service details to a team by default. A kit-level inspection does not replace the separate schedules for its radio, batteries, antenna system, trailer, or other components.

- Each task records procedure/reference and revision, responsible maintainer and backup, applicable item/configuration, interval or trigger, last qualifying completion, next due date, advance reminder, and acceptance criteria approved by the owner/agency. Reusable equipment-category templates provide starting points with per-item overrides; the app does not prescribe universal service intervals.
- Support calendar recurrence and event-triggered work such as before deployment, after return, after repair, or after a configuration change. Optional usage-based tasks require explicit meter/counter readings and units; unknown usage remains unknown. Record whether calendar due dates use a fixed cadence or elapsed time since completion, and define handling of early/late service rather than silently moving the schedule.
- Example tasks include battery condition/capacity checks, radio/interface functional checks, connector/feed-line inspection, antenna-system sweeps, power-supply checks, and manufacturer/agency-required generator or trailer service. Link approved instructions; the app records work rather than substituting for qualified inspection or manufacturer safety guidance.
- Work records retain stable task/item references, scheduled and actual dates, performer, work performed, findings/measurements, parts replaced, result, evidence, reviewer where required, and next action. Record unscheduled repairs as well as preventive work. Preserve attributed corrections and prior schedule versions; changing a task must not rewrite service history.
- Keep due soon, overdue, in progress, deferred, completed, and cancelled work distinct from pass/fail/inconclusive results. A failed attempt is not a qualifying completion and cannot reset the successful-service date. Deferral requires an authorized owner, reason, revised target, and retained original due date; reminders or deferrals cannot clear a fault.
- Provide an item timeline and team maintenance queue/calendar filtered by asset, site/kit, custodian, task, due window, and result. Notify responsible people through permitted channels, with assisted completion for non-account holders and printable work lists. Completing work does not move equipment or resolve an outstanding checkout.

Define readiness impact per task: advisory, review required, or blocking for specified functions. Overdue work is not automatically proof of physical failure, but a required overdue inspection may block use under local policy. Failed/blocking tasks affect dependent station configurations and kits, with warnings on affected future reservations and an explicit authorized return-to-service review after repair/retest. Do not mark an entire kit ready because one component passed; do not disable unrelated functions without a dependency. Use the same service/condition history and section 5.9 evidence links, not a competing maintenance status ledger.

#### Antenna-System SWR Sweeps and Test Evidence

Treat an antenna system as a versioned operational configuration referencing the antenna, feed line, connectors/adapters, matching components, installation/site, and other relevant items. This is not necessarily a physical container. Attach a sweep to that system revision and applicable maintenance task, not merely to the owner's radio or an unqualified "SWR good" checkbox.

Capture test date/operator, purpose (baseline, periodic, post-repair, or changed setup), instrument/model and available calibration/reference information, measurement point, frequency range and units, sample spacing when known, and installed/test conditions. Record relevant antenna position/height, feed-line arrangement, tuner/matching state, and environmental notes so later reviewers can judge comparability. Retain SWR at required operating frequencies and any recorded acceptable ranges/limits with their local procedure source; do not invent a universal pass threshold or treat an SWR result as proof of end-to-end communications coverage.

Allow private upload/download of analyzer exports, sweep plots/screenshots, and supporting photographs, with file-type/size controls and metadata. Initially support attachments plus structured summary readings; automated parsing of vendor files, graph overlays, instrument control, and automatic measurements are optional later work, not prerequisites. A PDF/image alone need not be converted automatically into numeric data. Where sample data is supported, retain the original evidence and explicit units.

Show prior/baseline results side by side with test context and reviewer notes; label different system revisions, measurement points, or test conditions rather than implying directly comparable trends. Replacing a feed line, moving a portable antenna, or changing the installation preserves prior results but flags the applicable retest requirement. Link findings to affected bands/tasks, service actions, station-readiness evidence, and the operating guide. Only approved completion/retest and any required return-to-service review can clear a blocking finding.

#### Reservations and Planning Integration

The equipment ledger must be useful before the incident planner ships. Add future reservations when planning is implemented: named resources/configuration, time window including preparation/transport/restoration, intended task/post, requester/approver, and provisional/confirmed/released state. Personal equipment needs the owner's agreement; team equipment follows delegated custodian authority.

Check conflicts across the physical dependency set: reserving the backpack includes required present components; separately reserving its radio for the same interval conflicts. A proposed substitution must be compatible and available, and a parent/manifest change must revalidate existing reservations. Reserve confirmed resources atomically to prevent two planners both claiming the same item. Surface conflicts instead of silently overriding an existing commitment.

Plans distinguish qualified operator, suitable configuration, confirmed resource reservation, actual equipment handoff, and actual attendance. Cancellation releases future reservations but leaves equipment with its recorded holder until a real transfer/return occurs. Repair, loss, overdue custody, or changed owner consent invalidates affected readiness assumptions and alerts the planner/custodian for review. Show only authorized reservation details; where cross-team visibility is unavailable, require owner confirmation and state that conflict checks are limited to the current team.

### 5.14 Activation Authority, Alert Levels, and PACE

Maintain a served-agency record with mission scope, agreement/procedure reference and review date, primary/alternate agency contacts, activation authority, approved team delegates, and reporting chain. A person permitted to send a callout is not necessarily permitted to authorize deployment. Record who requested and authorized the response, when, incident/reference number if supplied, and any limits on the task. Verbal requests can be recorded with attribution and later documentation.

The [ARRL ARES Plan](https://www.arrl.org/files/file/ARES%20Plan%20July%202025.pdf) recommends scenario-specific quick-start procedures. [FEMA mobilization guidance](https://emilms.fema.gov/_is0700b/groups/37.html) advises waiting for official deployment notification. Apply these as a distinction between preparedness monitoring, availability requests, and authorized assignments, including emergency phone/radio workflows when the app is unavailable.

**Proposed local alert vocabulary:** Normal; Advisory/Monitor; Standby/Availability Requested; Activated/Assignments Issued; Demobilizing; Closed. Labels/colors can be adapted to the adopted local manual. Always show words and required actions, not color alone. Store SKYWARN, exercise, ARES/RACES/other agency context as separate attributes rather than forcing them into a severity ladder. A weather warning may justify monitoring under an approved standing procedure; it does not itself authorize an EOC visit, trailer movement, or an SMS blast.

For each mission or communications path, define **PACE — Primary, Alternate, Contingency, Emergency** methods, with endpoint/contact, approved channel settings, infrastructure dependencies, switching trigger, switching authority, and last exercise result. Multiple choices using one repeater site, power source, or internet connection are not independent fallbacks. Use [CISA's PACE guidance](https://www.cisa.gov/sites/default/files/2024-10/2024_NCSWICPTE_Leveraging_PACE_Plan_Emergency_Comms_Ecosystems.pdf) as a reference; the team must select and test the actual methods.

**Brad's proposed storm procedure, to be adopted with the EMA:** distribute a current radio rendezvous card in advance. It specifies what conditions trigger monitoring; which primary repeater to use; approved fallback sequence; listening/check-in windows and timezone; how NCS/deputy coverage is arranged; and what to do if the repeater or NCS cannot be heard. Resolve the primary choice and fallback channels from current local confirmation, not a neighboring county's plan. Record availability and relay needs over the air when necessary. Members should not independently rotate through channels without a shared timing/transition rule. Monitoring requires no travel and does not presume that every member has confirmed availability.

An authorized coordinator can create a callout before a net exists and later link its resource net and operational periods. Capture the affected unit/audience, alert stage, exercise/real designation, requested action, response deadline, validity/expiry, next update, and source plan revision. Updates/cancellations carry the same incident/callout identifier and a new revision, with obsolete instructions visibly superseded. Restricted deployment details remain separate from any public alert-level display.

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

### 5.16 Program Eligibility, Task Books, and Training Schedule

Support general team participants, unlicensed prospects/helpers, and program-qualified ARES/RACES/agency personnel as distinct designations. [ARRL's ARES membership guidance](https://www.arrl.org/ares) limits formal ARES membership to licensed amateurs; York's broader team model should remain possible. Credential issuer, affiliation, clearance verification/reference, expiry/review, and incident-specific access are distinct from membership stage and application permissions. Store the agency's clearance decision when needed, not background-check reports or sensitive investigative details.

Expand the training catalog to explicitly include IS-200 alongside IS-100/700/800, appropriate ARRL courses, local orientation, and role-specific practical tasks. The [ARES Individual Task Book, July 2024](https://www.arrl.org/files/file/ARES%20Taskbook%20July%202024%20%28improved%29.pdf) supports task-level dates, evaluator sign-offs, and local additions. Store task-book edition, required/encouraged/optional designation, prerequisites, task evidence, evaluator identity/authority, sign-off date, approved equivalence, and local adoption record. Members submit evidence; authorized evaluators approve it.

The July 2024 task book marks IS-200/800 encouraged at Basic, while the [July 2025 ARES Plan](https://www.arrl.org/files/file/ARES%20Plan%20July%202025.pdf) includes them in Basic training. Reconcile the adopted local rule with section leadership; preserve evidence and version history rather than silently reclassifying members after an import. The same plan distinguishes credentialing from incident-specific entry authorization. Course attendance, task proficiency, program qualification, and site access therefore remain separate checks.

**Proposed local training cycle, inspired by the neighboring examples rather than copying their calendar:**

| Cadence to validate | Session objective | Evidence recorded |
|---|---|---|
| Regular short on-air practice | Voice procedure, radio programming, net control, message delivery, and PACE transitions | Attendance plus separately evaluated tasks; link existing net/check-in records |
| Monthly practical session | Rotate through EMA station orientation, home/portable setup, batteries/power, antennas, digital interfaces, and kit handoff | Instructor, setup used, practical result, and follow-up needs |
| Quarterly scenario | Agency task from callout through assignment, communications, relief, and demobilization | Timed objectives, gaps, radio/SMS fallback exercise, and after-action tasks |
| Annual review and exercise plan | Review manual, agency requirements, roster freshness, equipment inventory, task-book progression, and priority risks | Approved next-year plan and named owners/dates for improvements |

Sequence fundamentals before specialist modes, offer mentoring and make-up sessions, and include home-based and administrative support roles. Scheduling records need owner/instructor, objectives/task links, prerequisites, capacity, date/time/location or net link, required gear, signups, attendance, and completion review. Training communications use their own preferences; a drill cannot masquerade as an urgent real activation. Reuse existing net scheduling where applicable and a lightweight session record for non-radio workshops rather than building a course-delivery platform. Provide an exportable personal training/task-book record and a coordinator gap view.

#### Reusable Digital-Message Exercises

Use [GMARES NBEMS modules](https://gmares.org/nbems-training/) and [Winlink modules](https://gmares.org/winlink-training-resources/) as attributed learning links tied to practical tasks. Examples include saving/retrieving FLmsg files, handling ICS-213 through Winlink, receiving/printing attachments, FLamp transfers, and direct peer-to-peer operation. Sequence introductory setup before interoperability drills; link a mentor and prerequisites without treating watching a video as demonstrated competence.

An exercise template defines objective, roles/stations, configuration requirements, message format, initial and alternate transports, scenario constraints, expected recipient/output, completion criteria, and evaluator. One example: receive a synthetic ICS-213, relay it using the designated alternate transport, and deliver a readable copy to the receiving agency role. Record actual timestamps, path, receipt/delivery evidence, incomplete steps, and feedback. Require printing only when the task calls for a paper handoff. Use clearly marked exercise traffic and approved channels; do not send unsolicited test messages to operational agencies.

Reuse net/exercise scheduling, attendance, existing message records, station test evidence, and task-book review. Lightweight training exercises can run before the full incident planner; later plans reference the same templates. ECTLogger initially coordinates and records external radio-software use, with no automatic transmission or implied software API integration.

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

### 5.18 Procedure Library, Succession, and Improvement

Maintain a versioned library of manuals, quick-start procedures, agreements, PACE cards, site guides, training plans, and exercise/after-action records. Each has an owner/deputy, source URL or authorized attachment, scope, approver, version/effective date, review date, public/restricted classification, and superseded-by link. Drafts are visibly distinct from adopted operational instructions. Acknowledgment of a revised procedure is tracked separately from training completion.

Include a curated external-resource catalog linked to relevant tasks/configurations: original author/organization, source URL, publication/version date when known, last local review, applicability, and reuse permission. GMARES hosts both its own and others' material; attribution and permission follow the original work. Link by default, obtain appropriate permission before reproducing documents/videos, and distinguish a broken/outdated learning link from an approved local operating instruction. Review older software screenshots/settings before recommending them; link current official software sources rather than bundling historical installers. Reuse this library for kit guides and exercise learning links, not a separate learning-management platform.

For the EC transition, begin with the inherited WSSM manual and an explicit adoption checklist: confirm agency authority/agreement, current role holders/deputies, monitored channels, callout/relief arrangements, inventories/custody, training requirements, source conflicts, and outstanding actions. Adapt neighboring patterns into proposed local procedures; do not rewrite the original manuals or publish local adoption through this concept update.

Store organizational responsibility rather than relying on one person's email account. A leadership handover transfers document ownership, access grants, provider administration responsibilities, pending callouts, asset-recovery issues, and improvement actions through an audited process; secrets belong in deployment secret management, not in manuals. Do not infer new authority solely from an EC title on a public page.

An after-action review compares objectives with actual results, identifies what worked and what failed, and creates named corrective actions with due dates, closure evidence, and a retest. Link improvements back to the relevant task, kit, site, PACE path, or procedure revision so the next drill tests the fix. Update approved materials and brief members through their chosen channels.

The [GMARES-hosted after-action template](https://gmares.org/wp-content/uploads/2023/04/aar_form.docx) adds a useful station-level view: operator/configuration/location, how and when notified, emergency power, operating/weather/propagation conditions, message counts, issues, and successes. Reuse callout, traffic, and test records where authorized; distinguish messages originated, relayed, and delivered so counts are not misleading. Link each observation to the relevant resource or procedure: a missing cable becomes a kit discrepancy, failed delivery becomes a path/test finding, and unclear instructions become a guide-review action. Closure requires appropriate evidence/retest and reviewer action; it must not automatically restore service condition or certify an operator.

## 6. Data Model Draft

### 6.1 Ownership and Proposed Records

Names are conceptual until implementation discovery; avoid fixing migration numbers or a new framework now.

| Record | Responsibility and constraints |
|---|---|
| `Team`, `TeamUnit` | Team privacy boundary and scoped organizational hierarchy; prevent cycles and cross-team parent links. |
| `TeamMembership` | Stable roster identity with nullable `user_id`/optional contact link, lifecycle dates, and stage. May exist before a platform account or callsign; a linked user has at most one current membership per team. |
| Membership unit assignments, appointments, and permission grants | Separate dated unit affiliations, organizational titles, and authorized actions. Changes cannot silently elevate access. |
| `TeamJoinRequest` | Application/review lifecycle, independently of member permissions and readiness. |
| `TeamMemberProfile` | Team-held identity/contact data, disclosure preferences, deployment choice, participation settings, and confirmation metadata. Auth identity remains on `User`. |
| `TeamTrainingRecord` and qualification definitions | Reported/verified course evidence and team task requirements; retain provenance and review history. |
| Station configurations and capability entries | Repeated service/band/mode/function/setting combinations, power, shared equipment references, proficiency, and evidence dates; replace the underspecified single `TeamCapabilityProfile` blob. |
| Station test evidence | Operator/configuration revision, path/dependencies, conditions, task/result, source activity, reviewer, and retest needs. Preserve failed and superseded evidence; neither a qualification record nor a duplicate RF coverage ledger. |
| Equipment item / team asset registration | One identity per physical radio, computer, antenna, battery, mast, or container. Separate personal/agency/team ownership from team management and custody; an asset registration references the equipment item, not a copy. |
| Configuration equipment requirements | Links to required items or approved alternatives, with task capabilities and setup/restore requirements; supports one FT-991A used in alternative home and deployable configurations. |
| Asset containment and kit manifest | One current physical parent per item, no cycles; expected contents and dated actual composition. Checkout snapshots preserve what was transferred. |
| Asset assignment and custody/service history | Mandatory current assignment/disposition with same-scope references; inherited container custody must resolve to an explicit holder/location/disposition. History records attributed handoffs, corrections, repair, and retirement. |
| Equipment maintenance tasks and work records | Per-item procedure/recurrence/trigger, responsible staff, due dates, deferrals, results, evidence, and qualifying completion; references the existing condition/service history and readiness dependencies rather than duplicating them. |
| Antenna-system sweep evidence | System/configuration revision, task, instrument/test context, frequency/SWR summaries, baseline reference, private attachments, and reviewer outcome; link to station tests without equating an SWR measurement with a demonstrated RF path. |
| Equipment reservation | Planned resource use and time window, optionally linked to an existing net/post/plan revision. Check conflicts across physical dependencies; reservation is separate from actual custody. |
| Served agency and procedure/document revisions | Agency requests/authority, agreement references, local adoption, owner/deputy, approval, review date, and disclosure. PACE paths reference versioned communications settings/dependencies and switching rules. |
| Callout/revision and per-recipient delivery/response | Alert intent/audience/expiry; separate provider attempts, human acknowledgment, availability, and assisted response attribution. May precede and later link to a net. |
| Messaging consent/suppression and provider configuration | Phone verification, sender/team/purpose scope, consent provenance and withdrawals; deployment secrets remain private. Provider opt-out scope can be broader than local team preferences. |
| Task-book definitions/sign-offs and training sessions | Versioned program/local requirements, evaluator approval, session objectives/prerequisites, attendance, and net/exercise links. No duplicate attendance ledger for sessions already represented by a net. |
| Reusable exercise templates and preparation checklists | Task/prerequisite/delivery criteria and staged checklist definitions/instances, with revision, scope, owner, due date, blockers, and linked evidence. Reuse session/plan records for execution and Events for staffing. |
| Deployment readiness/packet and accountability events | Minimal task-specific logistics, checklist/source revisions, approved packet, travel/duty/welfare/release/return evidence linked to Events assignments and the canonical hours source. |
| Improvement actions | Named owner, due date, source exercise/incident, affected procedure/resource/task, closure evidence, and retest. |
| `TeamAffiliation`, availability windows, local field values | Multiple agencies/clubs, conditional/date-specific availability, and typed administrative extensions. |
| `TeamLocation` | Supported fixed location from section 5.6; a private home station is not automatically a shared team location. |
| Status history, audit records, import batches/row outcomes | Who changed or confirmed what, when, why, and from which source; restrict sensitive values in these records. |
| Participation and location-coverage rollups | Read-time calculations over authoritative activity. `TeamNetParticipationRollup` is not a second editable attendance ledger; cache only if measured performance warrants it. |
| Report adapter definitions | Coordinator-approved category/source mappings, edition, timezone, units, rounding rules, and sample reconciliation; raw activity durations remain unchanged. |
| Plan requirements/revisions attached to `NetTemplate`/`Net` | Objectives, period-specific requirements, approval, and minimal export snapshots. Reuse Events posts/shifts and existing traffic records for execution. |

Shared profile convenience must not become shared private storage: a member can explicitly copy a change to selected memberships, while each team retains its own consent, qualifications, administrative notes, and history. Member-facing updates and privileged verification use distinct write permissions. Use version checks for concurrent member/manager edits so a stale form cannot silently overwrite a newer update.

For assets, validate that assignment destinations match their type and that all item, container, member, location, and reservation references are authorized for the managing team. Reuse the shared equipment schema for personal and team equipment while keeping access boundaries explicit. Do not delete an item, container, membership, or location in a way that erases outstanding custody; require reassignment or a retained historical/discrepancy record. Retiring a trailer or kit does not automatically retire every component inside it.

### 6.2 Spreadsheet Field Mapping

This dictionary accounts for all supplied columns. It is an import mapping, not a mandate to reproduce the workbook's tabs or abbreviations in the interface.

| Source fields | Proposed destination / interpretation |
|---|---|
| LAST NAME, FIRST NAME (all tabs) | Structured name on the team profile, displayed together. Cross-tab matches require review when identity is uncertain; do not create three people. |
| HAM CALL, Call Sign; GMRS CALL | Separate amateur and GMRS identifiers, with optional aliases/history and optional account linkage. Blank is allowed for prospects/support volunteers. |
| EMA # | Team/agency identifier with issuing organization; restricted as appropriate, not an account key. |
| ADDRESS, COUNTY; Town | Structured address/town/county/state/postal fields. Distinguish member contact address from a station's operating location. |
| HOME PHONE, CELL PHONE, EMAIL | Typed contact methods, preferred method, and optional team-specific values distinct from login email. |
| OKAY TO TEXT? Y/N | Preserve legacy yes/no/unknown and source/date for review; obtain the documented sender/purpose-specific consent required by section 5.15 before enrolling in the proposed SMS service. Blank does not grant permission. |
| STATUS | Review into membership stage and separate deployment/participation fields; retain the original value during reconciliation. |
| Door | Restricted local field; confirm whether this means building-access authorization, credential issuance, or something else. Do not store door codes or secrets. |
| IaR | Unresolved local abbreviation; preserve verbatim in a restricted field until Brad defines its meaning, values, and audience. |
| Shirts, Shirt size, Hat size | Optional administrative issuance/count or notes plus sizes. Confirm what "Shirts" values mean; keep out of operational readiness and general roster exports. |
| IS-100, IS-700, IS-800, OTHER FEMA | Individual training records with course/version where known; explicitly add IS-200 to the new catalog without inventing completion. Other FEMA supports multiple courses, not a single yes/no flag. |
| SKYWARN, Spotter # | Separate training record and spotter identifier/issuing office; a spotter number alone does not verify training currency. |
| CERT, ARRL/OTHER | Training/qualification records and, where the source means membership, a separate affiliation. Preserve ambiguity for review. |
| NET CONTROL | NCS training/proficiency/qualification; interpret source values before mapping. Does not assign a live net role. |
| DEPLOYMENT LEVEL | Preserve any local level label, then map to willingness, participation setting, and team qualification rules. Do not assume it means only Responder/Reserve or a national credential. |
| SET PARTICIPATION, MARS COMEX | Dated exercise/activity records with type, source, and actual hours if known. An imported participation flag is not evidence of a duration. |
| License Class | Amateur license class, with reported/verified provenance; optional expiry/review information if collected. Keep separate from equipment capability. |
| Local Affiliations: ARES, RACES, Club Program | Repeating affiliations with organization/unit, role, standing if relevant, and dates. Allow CERT/SAR/SHARES/MARS or other local groups without fixed columns. |
| Latitude, Longitude (decimal degrees) | Station coordinates with precision/source and confirmation date. Validate ranges; retain exact location privately and permit town-level display. |
| Emergency Power: Battery, Generator, Solar | Power options linked to the applicable station configuration; optional capacity/runtime/test date, with unknown values retained. |
| Home Station: 2m / 440 FM; 2m / 440 DMR | Fixed station band/mode entries. A combined column does not prove both bands; preserve its scope and request confirmation before splitting. |
| Home Station: 80–10m HF (ex. 60/30), 60m HF, 30m HF | Broad HF claim plus explicit band entries. Keep 60m/30m independent; require mode and actual-band confirmation for precise matching. |
| Home Station: 6m FM (Horiz / Verti), 6m SSB | Fixed 6m mode entries with antenna polarization where known. |
| Home Station: Sound Card Digital, VHF Packet, Pactor 2/3 | Digital setup/transport capabilities; ask for service, band, transport/version, usable software, and operator proficiency. |
| Non-Ham: CB, FRS, GMRS, Marine (Y, F, G, M) | Separate service capability entries. Confirm the sheet's code legend before interpreting letters; retain ambiguous cells and do not guess that M means mobile or marine. |
| Packet / Winmor / SCS: Winlink RMS, HOME BBS | Distinguish gateway/BBS service from client capability; capture identifier, band/transport, operating setting, and usable/tested status. Preserve legacy labels for review. |
| Mobile / Portable: 2m / 440 FM, 2m / 440 DMR | Mobile and/or portable band/mode entries; M/P selects setting after the import legend is confirmed. Both may apply. |
| Mobile / Portable: 80–10m HF (ex. 60/30), 60m HF, 30m HF, 6m | Same explicit band treatment as home capabilities, separately qualified for mobile/portable operation; 6m requires mode confirmation. |
| Mobile / Portable: VHF Packet, APRS, PiGate | Separate packet/APRS functions and PiGate equipment/setup entries linked to actual bands, transports, power, and setting. |

### 6.3 Additional Fields to Validate in Discovery

The NH form's roster disclosure choices and activation availability should be carried into the new design. Proposed optional additions include preferred contact time, alternate contact method, license expiry, weekday/overnight availability, routine public-service interest, mentoring/recruitment interests, notification assistance, and equipment/transport details when a local task requires them. These are progressive profile questions, not all prerequisites to join.

Do not import a legacy password or collect date of birth by default. Unknown and explicitly declined answers need distinct storage where they affect matching or contact consent. Course catalogs, mode aliases, and local code mappings need versioned definitions so a future label change does not reinterpret historical records.

## 7. Permissions Matrix (Draft)

Proposed defaults; finalize the deployment support-access policy before storing private roster data.

| Action/data | Member | Scoped roster manager (EC/AEC) | Training reviewer | Planner | Team administrator |
|---|---|---|---|---|---|
| Own contact, preferences, self-reported capability | Read/edit own permitted fields | Read/edit within delegated scope | Only needed identity fields | Only operationally needed, disclosed fields | Team scope |
| Membership approval/stage/unit | View own status; request changes | Within delegated scope | No | No | Team scope |
| Training evidence and verification | Submit/view own; cannot self-verify | Only with review grant | Within delegated training scope | Eligibility result; evidence only by separate grant | Team scope |
| Other members' directory data | Team policy and member disclosure | Within delegated scope | Minimal needed fields | Authorized candidate subset | Team scope |
| Access indicators / sensitive admin notes | Own disclosed fields; no self-authorization | Separate explicit grant | No by default | Task eligibility indicator only | Explicit need-based access |
| Plan/assignment management | Own offer/response | Separate planning/net grant | No by default | Assigned plan/net scope | Still requires operational authority |
| Own equipment and loan consent | Maintain own reported gear; agree/decline loans | Assist only within granted scope | No by default | Read disclosed capabilities/availability | No authority to loan personal gear without owner consent |
| Team assets, contents, and custody | View/acknowledge own custody; report issues | Separate asset-management grant | No by default | Read authorized readiness; request allocation | Manage/delegate within team and owner restrictions |
| Callouts and responses | Own consent/preferences and response | Explicit scoped callout grant | Training reminders only if granted | Request callout; send only if granted | Delegate sender scope; record external deployment authority separately |
| Procedures and training plans | View approved/disclosed versions | Draft/review as delegated | Own training scope | Approved operational subset | Assign owners/approvers; adoption still requires appropriate agency authority |
| Bulk export | Own data / permitted directory only | Separate scoped export grant | Training export grant only | Approved operational subset | Scoped and audited |
| Grant permissions / change privacy | No | Only if separately delegated | No | No | Yes, with audit |

A platform administrator's existing access to nets and contacts is not a Teams permission specification. New helpers must check team, unit, action, and field sensitivity explicitly; decide and document any exceptional support access and audit it. A managed server's operator remains technically able to access its database/backups, so application privacy must not imply protection from the host operator.

Apply the same checks to search suggestions/counts, maps, downloads, evidence attachments, background emails, and live updates. Revoked membership/delegation must take effect on subsequent requests and active subscriptions. Do not rely on hidden buttons or a team ID supplied by the browser as authorization.

An equipment custodian receives scoped asset-management permissions independently of EC/AEC, training, or net roles. These include the minimal holder/contact/location data needed for handoff/recovery, manifest edits, return reconciliation, and service/disposition actions. Holding a kit does not grant permission to edit ownership, erase history, decommission it, or assign other team assets. Define which handoffs need staff authorization; acknowledgments and issue reports are member actions, with phone/in-person recording available to authorized staff.

A callout coordinator may send to an authorized recipient set without receiving a raw phone-number export. Welfare/recovery contact access is separately scoped; general members do not see others' emergency contacts or deployment travel details. Provider configuration, spending limits, and credential changes require deployment administration; ordinary team managers cannot access secrets or another team's messaging history.

## 8. Privacy and Security Controls

This section is product/engineering guidance, not legal advice.

### Data Classification

- Low sensitivity:
  - callsign, participation, capabilities
- Medium sensitivity:
  - name, email, phone, training records
- High sensitivity:
  - street address, precise home coordinates, building access indicators, restricted administrative notes
  - equipment serial numbers, detailed inventories at private sites, holder contact/location details, and sensitive repair/access notes
  - emergency contacts, private availability/accommodation notes, SMS numbers/replies, recipient lists, and restricted deployment packets
  - team location addresses and access details (5.6) — a roster of shelter and EOC addresses is more sensitive than any single member record, and its visibility should default to team managers

### Required Controls (baseline)

- Enforce RBAC on all team/member endpoints.
- Encrypt data in transit.
- Encrypt high-sensitivity fields at rest.
- Capture audit logs for privileged data changes.
- Implement least-privilege defaults for visibility.
- Classification never grants public access: even a callsign/capability can reveal private team membership. Discoverability of a team does not make its roster public.
- Provide field-level roster disclosure choices and separate limited directory, staff roster, and operational plan exports. Preview recipients/fields before distribution; a private field must not leak through a public map, report, or emailed attachment.
- Record consent/preferences and their source for both self-service and manager-assisted records. Recheck preferences when sending; a historic "okay to text" import is not blanket permission for every type of notification.
- Include encryption/key management, backup access, private attachment storage, and recovery procedures in the implementation design; encryption must account for required search without logging raw sensitive values.
- Audit imports, merges/claims, status transitions, privilege changes, verification, plan approval, and bulk exports from the first roster release. Avoid copying sensitive payloads into ordinary application logs.
- Audit asset ownership changes, containment/manifests, custody transfers/corrections, service, retirement, and reservations from the asset release. Restrict detailed asset exports and lookup tags; routine net reports should not expose a member's equipment inventory or home storage location.
- Audit callout authorization/audience/revisions, consent and suppression, delivery/response transitions, procedure adoption, evaluator sign-offs, and personnel release. Minimize message content in audit/diagnostic logs. Disclose external SMS processing and printed/offline packet limitations before release.

### User Rights and Lifecycle

- Data export for user-owned profile data.
- Separate team departure, historical archiving, account deletion, and anonymization workflows. A historical roster is not permission to retain every contact/address/evidence field indefinitely.
- Retention schedule for applications, member contacts, certificates, imports, audit records, and plan snapshots must be defined before release. Minimize or remove personal details when no longer needed while preserving required operational records under the agreed policy.
- Reconcile offboarding/anonymization with existing closed-net and issued-plan records explicitly; no automatic rewrites of filed communications logs. Document retained fields, access, and backup expiry.
- Include custody/service records and handoff manifests in retention planning. Resolve outstanding loans during offboarding; retain the minimum recovery/history information needed without preserving unrelated profile fields indefinitely. Current location means last confirmed whereabouts, not live GPS tracking.
- Offboarding removes pending callout eligibility, suppresses queued notifications, and transfers open procedure/callout/recovery responsibilities. Retain required consent/withdrawal evidence separately from routine message content, with restricted access and an agreed retention policy.

### Privacy Policy Checklist

- What data is collected.
- Why each class of data is collected.
- Who can view each class of data.
- Retention, deletion, and anonymization behavior.

## 9. Build vs Buy Notes

- VolunteerHam and HamClubOnline remain comparison candidates; their current features and migration/export options have not been evaluated for this expansion.
- The case for an in-app module is direct use of ECTLogger participation, radio capability/coverage data, and communications planning under one permission model. The first release must demonstrate that advantage while replacing the stale spreadsheet.
- Use a small roster pilot to validate adoption and maintenance cost before committing to the full planner. External membership-system synchronization remains outside the initial scope.

## 10. Execution Plan (Proposed)

This replaces the earlier five-milestone outline. Security, auditability, import safety, and data lifecycle are part of the first usable roster, not deferred to a final hardening milestone. Estimates should follow discovery and review of the schema-tooling roadmap; no dates or migration numbers are committed here.

### M0 — Validate Workflow and Data Contracts

- Walk through a new application, annual update, EC report, and staffing request with Brad and, if available, Joel/an NH EC. Request a walkthrough or anonymized report examples for the unreviewed reporting interface; its absence need not block the Maine pilot.
- Start the local procedure adoption register from WSSM version 09.25 and the York/Strafford references. Confirm agency authority, program eligibility, current channels, local course/task-book rules, and source discrepancies; obtain an approved radio rendezvous plan and identify deputies.
- Confirm the dictionary: Door, IaR, Shirts, non-ham code legend, compound band cells, local deployment levels, organizational hierarchy, and required launch reports.
- Inventory the two EMA office setups, trailer, and backpack kit with their actual owners/custodians. Confirm which accessories need individual tracking, expected manifests, loan/handoff authority, and readiness checks; record Brad's personal examples without assuming model specifications.
- Review the GMARES references for local adoption: select initial digital paths/tests, seasonal/prestorm templates, guide reviewers, and resource permissions. Obtain an anonymized NH timecard example and confirm category/rounding rules before claiming adapter compatibility.
- Agree field ownership, status transitions, evidence/qualification rules, consent, retention, support access, and pilot success targets. Draft the mobile onboarding and coordinator roster screens.
- Confirm Events readiness and agree the candidate/assignment interface, including manager-maintained people without callsigns. Identify exact form editions and required local attachments before building exporters.
- Review schema tooling, timezone conventions, search/index strategy, and self-hosting requirements against current code at implementation time. Do not assume roadmap database work has shipped.
- For optional SMS, decide registered sender/account/service ownership, team isolation, consent wording/evidence, phone verification, message purposes, opt-out mapping, budgets, delivery expiry, and radio/phone fallback. Verify current Twilio requirements without enrolling live contacts during discovery.

**Exit:** reviewed data dictionary, permission matrix, sample import/mapping, pilot scenarios, and prioritized report/form checklist. Unresolved local fields have a safe raw-value holding path; critical privacy and identity decisions are resolved before real data is stored.

### M1 — Team and Membership Foundation

- Add team/unit records, scoped grants, membership/application lifecycle, and history with additive migrations compatible with both upgraded and fresh installations.
- Deliver Teams navigation, discovery/privacy settings, a basic roster, member details, and manager-created records without accounts. Keep unit delegation and organizational titles separate.
- Establish served-agency/procedure references, general-team versus program eligibility, and distinct delegated callout/custodian/evaluator permissions. Record an owner/deputy for the inherited manual and agency relationship.
- Implement audited record claims, field-level read/write checks, lifecycle suppression, concurrency checks, and core export/retention controls.
- Build in existing backend router/permission patterns and frontend page/component patterns; no separate authentication service or independent frontend application.

**Exit:** two test teams and multiple units prove isolation; interested, trainee, active, reserve, home-based, and historical records all work, and no team action changes unrelated account/net permissions. Exercise the roster/identity portions of TM-03 through TM-06 and TM-11, including changed/shared callsigns and ambiguous claims; full saved-view and matching acceptance follows in M3.

### M2 — Onboarding, Spreadsheet Import, and Freshness Pilot

- Add short self-service intake, progressive profile editing, saved drafts, optional invites, and manager-assisted update/confirmation.
- Deliver the three-tab CSV mapping/preview/reconciliation flow and typed local fields. Imported training/capability values remain reported/unreviewed until their review steps ship.
- Establish the section 5.11 import catalog, versioned blank/example CSV downloads, field guides, source/reference keys, private batch history, dependency validation, correction downloads, and safe retry/reversal. Ship staff/member, unit, and staff-appointment templates first; verify that imported titles cannot grant access or bypass appointment review. Clearly distinguish staged legacy fields from supported structured importers.
- Add last-confirmed indicators, review queues, configurable reminder delivery using existing email patterns, and phone/paper follow-up tracking. Collect optional SMS consent only against the approved notice/process; provider sending belongs to M3B and does not block this roster release.
- Ship basic scoped roster exports, onboarding status metrics, and disclosure previews; document how to cut over and export data back out.

**Exit:** TM-01, TM-02, TM-09, and TM-10 pass with realistic de-identified pilot data. All columns/rows reconcile, re-import is repeatable, conflicting edits are visible, and a member and an assisting manager complete the same update flow. A limited roster pilot can begin; full spreadsheet retirement waits for M3 search/training acceptance.

TM-36 is accepted incrementally in each template's delivery phase. A coordinator can download the blank/example files and field guide, import synthetic related records, correct a rejected row, and re-import without duplication. Validate quoted/multiline text, leading-zero identifiers, ambiguous dates, unknown template versions, unresolved references, partial batches, concurrent edits, unauthorized fields, and spreadsheet-safe correction exports. Completion of the full template catalog follows M4, not the first roster release.

### M3 — Training, Readiness, and Capability Search

- Add the training catalog/records/reviewer workflow and structured station configurations, digital functions, power, availability, and task requirements.
- Add adopted task-book definitions/sign-offs, local additions/equivalencies, mentor assignments, and the lightweight training calendar with net/exercise links. Preserve course/version differences and separate attendance from verified practical proficiency.
- Deliver station test history and path-aware matching, plus reusable digital-exercise templates and attributed learning links. Exercise reported/self-tested/reviewed states, failures, changed configurations, and RF versus Telnet/gateway/peer-to-peer distinctions. Reuse existing net/traffic records; full incident planning is not a prerequisite.
- Add progressive personal equipment entry and Home / Vehicles / Deployable views with shared physical-item references, explicit power/QRP constraints, accessory dependencies, and removal/setup/restoration requirements. Reuse the same item/configuration design for the team asset phase.
- Convert accepted imported values through reviewed mappings; keep unresolved composite values visible for follow-up.
- Add training, personal equipment, configuration/link, and capability CSV templates/importers to the shared catalog; verify references without splitting one shared radio into duplicate assets.
- Deliver Joel's saved category views, the home-based and trainee views, AND/OR capability filters, match explanations, and scoped readiness exports.
- Measure search response on the expected pilot roster size and add indexes based on representative queries, without duplicating source records in a second search database by default.

**Exit:** TM-04, TM-06, TM-07, TM-08, TM-16, TM-25, and the first five section 5.10 scenarios pass, including counterexamples (home/mobile mismatch, unknown band, stale verification, historical member, and shared equipment). Brad's example shows one FT-991A across alternative configurations, a separate QRP setup, truck equipment, and shared deployable antennas/mast. ECs can approve cutover of roster/training/capability maintenance; existing monthly reporting remains until M4 reconciliation. **M1–M3 are the membership MVP**, independently useful before planning ships.

TM-29, TM-30, and section 5.10 scenarios 9–10 also pass: a synthetic message exercise produces task/path evidence without granting automatic qualification, and a newer failure or material setup change remains visible despite an older success.

### M3A — Team Asset Register and Custody

- Build on the M3 equipment/configuration records and M1 membership/permission foundation. Bring forward basic named `TeamLocation` records from M4 so the EMA offices and storage destinations exist; RF coverage rollups can still wait.
- Deliver asset registration, owner/managing-team distinctions, station/kit manifests, current assignments, nested containment, condition, and audit/history views. Add equipment custodian grants and restricted holder lookup.
- Implement checkout, acknowledged transfer, reconciled return, component removal/replacement, repair, decommissioning/disposal, discrepancy tracking, and due/review/recall workflows. Enforce transactional handoffs and idempotent retries.
- Support basic inventory import/export with preview, stable asset IDs, and reconciliation; unresolved items require a responsible custodian and an explicit discrepancy. No blank custody or silent assignment to default storage.
- Add location, team asset, kit-content, and initial-assignment CSV templates and dependency checks; prevent containment cycles and contradictory item/container custody. No import can overwrite later handoff history without conflict review.
- Deliver per-item maintenance tasks, recurring/triggered schedules, work history, due-work queue/reminders, deferrals, and readiness/return-to-service rules. Add maintenance schedule/history and sweep-summary CSV templates, with item/task reference validation and explicit dates/units.
- Add antenna-system sweep metadata, structured summary readings, private attachments, and baseline/context comparison. Use configuration revisions and existing service/test evidence; defer vendor parsing, automated graph overlays, and instrument integrations.
- Deliver configuration-specific operating guides and printable quick tests using the shared document revision/access model. Flag guide/test review after affected equipment changes; include power/runtime conditions and manifest links.
- Pilot the two EMA office stations, trailer, and go-kit. Confirm physical contents against the register and perform a kit handoff to a member without an account, a transfer to another member, and a partial return with a component out for repair.

**Exit:** TM-18 through TM-20 pass for present custody and readiness; reservation-dependent checks follow in M5. Every item resolves to one current accountable assignment, concurrent kit/component checkout attempts cannot both succeed, and a manifest change preserves prior handoff contents. Staff can find the recorded go-kit holder and determine what remains missing or unavailable. **The asset register ships without waiting for Events or incident planning.**

TM-32 passes when a qualified relief operator uses the approved guide and manifest to set up/test the backpack kit and record discrepancies without relying on its usual operator. Superseded guides retain their history, and printed copies contain no secrets or unnecessary personal information.

TM-37 and TM-38 pass with multiple tasks on one item, fixed versus completion-based recurrence, an overdue task, an authorized deferral, failed service/retest, and a changed antenna/feed-line configuration. Check that a failed attempt cannot reset the successful-service date, a kit inspection cannot complete every component's maintenance, custody is unchanged, and only affected capabilities are blocked. Historical sweeps retain their system/test context; imported or attached results do not automatically approve return to service. Reservation warnings are verified when M5 ships.

### M3B — Procedures, Radio Callout, and Optional SMS

This work depends on M1/M2 permissions, membership, and contact preferences; it can proceed independently of asset reporting and Events.

- **First release:** versioned local procedures, agency/deputy responsibilities, approved PACE/rendezvous cards, alert stages, manual radio/phone callouts and assisted response recording. Publish/distribute through an explicit local adoption workflow; the app is not a prerequisite for listening under a previously issued plan.
- Add section 5.4 PACE-aware frequency selection to team-linked net creation/editing, including inherited team associations, labeled role ordering, authorized channel resolution, and refresh on team changes. This convenience does not depend on SMS or the incident planner.
- Add channel and PACE-entry CSV templates/importers. Imported PACE plans remain drafts and cannot populate approved-plan recommendations until reviewed and adopted.
- **Optional provider release:** implement Twilio configuration, sender/team isolation, consent/suppression, recipient previews, individual queued sends, budget/expiry controls, signed reply/status callbacks, and response/follow-up views. Keep provider delivery distinct from human acknowledgment and authority. No SMS feature is complete until opt-out, cancellation, uncertain delivery, and stale-job behavior are handled.
- Pilot first with a simulated provider and synthetic recipients; conduct any real test only with an approved sender and explicitly enrolled participants. Rehearse app/internet/provider failure using the distributed radio card, and record phone/radio acknowledgments.
- Deliver privacy/consent documentation and self-hosted setup guidance with the provider feature. Include the procedure library, document owner/deputy handover, review reminders, and open-action dashboard.
- Add seasonal/member-prestorm/leadership-prestorm checklist templates and instances, owners/deadlines, assisted completion, and links to station tests when M3 is available. Keep personal details minimal and outstanding blockers visible. Needs/gap collection can ship here; primary/backup staffing integration follows in M5.

**Exit:** TM-22 through TM-24 and the procedure-handover portion of TM-28 pass. STOP during a queued broadcast prevents subsequent sends; callback replays and out-of-order events cannot create false acknowledgments or reverse suppression; a submission timeout does not trigger blind duplicate alerts. A coordinator can identify unresolved recipients and a non-SMS member can participate. No test turns an advisory, availability response, or message delivery into deployment authorization.

TM-35 passes in both net creation and editing: direct and inherited team associations prioritize approved PACE channels, search retains that priority among matches, shared entries are not duplicated, and distinct channel settings remain distinguishable. Test multiple plans, switching/clearing teams, missing or unresolved PACE entries, revoked access, and a later plan revision. Existing selections remain unchanged unless explicitly edited, and restricted plan/channel details do not leak through suggestions or public outputs.

### M4 — Participation, Coordinator Reports, and Coverage

- Add authorized net/schedule-to-team association on every creation path and effective-date-aware participation attribution.
- Deliver reporting periods, drill/real-world activity distinctions, reviewed manual history, ARES/EMA preparation adapters, and source drill-downs. When Events actual hours are available, consume them through its reporting contract.
- Implement the approved NH timecard mapping as a selectable adapter, including off-air activity and export-only rounding. Preserve source precision and explicitly reconcile linked session/net/shift activity rather than summing duplicate records.
- Add the historical participation/manual-activity CSV template and reviewed import, preserving source precision and checking overlaps with existing activity before including records in totals.
- Implement section 5.6 coverage rollups/maps/exports from existing per-net observations, reusing the named team locations introduced in M3A (or delivering that shared foundation here if M4 proceeds first). Protect precise home/site data and show path recency/direction.

**Exit:** TM-15 reconciles to manually calculated samples, including membership transfers, multi-unit membership, overlapping net/shift participation, missing actual hours, and timezone boundaries. Coverage fixtures show one-way, two-way, stale, and untested paths without inventing confirmation. Coordinator acceptance is required for each claimed report mapping.

TM-33 passes for an approved NH sample with fractional durations, off-air mentoring/maintenance, mixed activity categories, and overlapping source links. Changing export rounding does not change recorded hours or another program's report.

### M5 — Incident/Drill Requirements and Staffing Integration

- Add template/net planning context, objectives, measurable drill goals, operational periods, requirements, and reusable task templates.
- Link the adopted agency/PACE procedure and callout to the plan. Deliver task-specific personal/site/logistics checks, tailored packing templates, and a revisioned printable deployment packet. Add incident travel/duty/relief/release/return events through the shared Events accountability contract.
- Connect candidate matching and availability confirmation to Events posts/shifts/offers. Exercise manager-recorded acceptance, trainees with supervision, reserve escalation, equipment contention, and scoped conflict checks.
- Connect staged preparation to configurable operational-period horizons, tentative primary/backup staffing, home-coverage needs, and authorized prepositioning. Include approved kit guides in packets and reuse the M3 digital-exercise templates and evidence.
- Add confirmed equipment reservations through the shared asset ledger, with owner/custodian agreement and atomic conflict checks across kits/configuration dependencies. Pair qualified people with team equipment; separate allocation, pickup/checkout, attendance, and return.
- Use observed coverage as supporting evidence and display unmet communications/staffing requirements. Preserve candidate snapshots only as needed for review; revalidate when selecting/confirming assignments.
- Reuse Events multi-period materialization before piloting plans scheduled far ahead or spanning multiple operational periods.

**Dependency:** requires M3, the radio/procedure foundation of M3B, M3A for team equipment allocation/custody, and the relevant Events posts/shifts/offer workflows. SMS is optional. Coverage-assisted planning requires M4. If Events is not ready, a requirements/candidate preview may be piloted, but do not label it completed staffing or create a parallel assignment system.

**Exit:** TM-12, TM-13, TM-17, TM-21, reservation-dependent portions of TM-20, and equipment scenarios 6–8 in section 5.10 pass in a shelter/EOC exercise that includes a home relay, a field station, a trainee/mentor pair, and an unfilled requirement. Suggestions, offers, acceptance, equipment reservations, handoffs, and attendance remain visibly distinct. A candidate without an account can be handled end to end by a manager. Reserving Brad's FT-991A blocks its overlapping home use; sharing a mast/computer still conflicts even with two separate radios. A cancelled plan releases reservations without claiming the checked-out go-kit was returned.

TM-26 and TM-27 additionally require a usable pre-downloaded/printed packet, assisted incident arrival, relief and welfare follow-up, actual release, and recorded return, with no travel states invented for a home operator. Closing the exercise net leaves unresolved people/equipment follow-up visible.

TM-31 passes across the M3B/M5 workflow: seasonal and prestorm tasks retain their owners/evidence, unresolved checks remain visible, the staffing horizon is configurable, backup resources are not double-counted, and completing preparation creates no deployment authority.

### M6 — Reviewed ICS Package and Exercise Results

- Deliver the selected ICS-202/204/205/205A package, sharing Events builders for 204/205, plus required attachment checklist and existing traffic/log exports. Add later forms only when the pilot establishes their need and authoritative input sources.
- Add plan versioning, approval, restricted distribution, copy/replan behavior, and actual-versus-objective review. Store template edition and minimal issued snapshots.
- Conduct an exercise using the draft package; capture missing inputs, staffing gaps, RF results, actual hours, and follow-up actions. Coordinator review is required before suggesting changes to long-term qualifications.
- Include agency-approved incident check-in/demobilization attachments (ICS-211/221 as applicable), source/version review, and a corrective-action owner/due date/retest workflow. Reuse the same library for EC succession and updated member briefings; verify the remaining TM-28 continuity cases.
- Deliver station-specific after-action observations linked to configurations, kits, sites, callouts, and traffic/test evidence. Verify TM-34 with a missing cable, failed message path, and outdated guide: each has a responsible owner and appropriate correction/retest, with no automatic qualification or service-status change.

**Exit:** TM-14 passes with a coordinator-reviewed sample package, long text/continuation pages, missing-field warnings, revised approval, timezone handling, restricted contacts, and public-net-report isolation. A second operational period can reuse requirements while reconfirming assignments. No package claims unsupported agency requirements are complete.

### Release and Validation Checklist

- Use de-identified fixtures for review and testing; do not seed NH/Maine member data into shipped migrations or fresh installations.
- Test permission boundaries through direct API requests, exports, attachments, search counts, maps, and live updates; include revoked grants and altered team/unit identifiers.
- Verify claimed-record collisions, import reversals with later edits, simultaneous profile edits, status transition history, consent withdrawal, and suppressed historical outreach.
- Test matched capability tuples and missing evidence rather than only individual filter controls. Include band/service/mode compatibility, time-window conflicts, and equipment shared by multiple candidates.
- Verify one item across home/deployable setups, power/QRP constraints, parent/component checkout and reservation races, partial returns, in-transit custody, missing assets, manifest substitutions, repair, decommissioning with retained location/disposal, and member offboarding with an outstanding loan. Ensure changes invalidate affected capabilities and preserve historical manifests.
- Test SMS consent changes at queue/send boundaries, invalid webhook signatures, account/sender mismatches, duplicate/out-of-order callbacks, shared/recycled numbers, expiring/superseded alerts, cost limits, and uncertain submission. Verify radio/phone fallback and that no phone list or private reply leaks into public net views.
- Test task-book version changes without erasing sign-offs, approved versus draft procedures, owner/deputy handover, packet disclosure/expiry, missed arrival/welfare follow-up, and release/return independently of net closure. Rehearse the chosen PACE transitions with app connectivity absent.
- Reconcile report/export calculations and source attribution. Test period boundaries, actual/planned-hour separation, and stable issued-plan/closed-net history.
- Test configuration-specific evidence after failed tests/equipment changes, Telnet versus RF matching, guide revision/disclosure, staged checklist blockers, and after-action retest links. Validate NH adapter rounding without mutating source durations or duplicating off-air/net/event participation.
- Test maintenance recurrence and timezone boundaries, event-trigger deduplication, missing usage readings, early/late completion, deferral history, failed-test handling, and scoped reminder/attachment access. Preserve sweep context and original evidence through component replacement, CSV re-import, and schedule changes.
- Check fresh install and upgrade paths, backup/restore, private evidence storage, retention operations, mobile/keyboard accessibility, and usable performance on the pilot's roster.
- Ship member and EC/AEC guidance with each release: onboarding/assisted entry, import, privacy/delegation, readiness search, and later planning. Update README, USER-GUIDE, DESIGN, DEVELOPMENT, PRIVACY, ROADMAP, and CHANGELOG when corresponding behavior actually ships. Coordinate the Events concept update before implementing shared contracts.
- At each pilot checkpoint, compare the section 2 measures and gather coordinator/member feedback. Keep an export-based exit path; do not require the advanced planner for membership adoption.

## 11. Open Questions

These are discovery questions, not blockers to maintaining this concept. Defaults elsewhere in the document apply until reviewed; do not invent definitions for unknown source data.

### Before a Real Roster Pilot

- What do Door, IaR, Shirts, and the non-ham Y/F/G/M values mean? Which need restricted visibility, and which are still useful?
- What deployment levels and task qualification rules do Maine and NH use? How do they distinguish course completion, local authorization, supervised training, and current availability?
- Is NH best represented as one team with scoped section/district/county units, or separate teams? What can each EC/AEC see and edit, and who grants delegation?
- Does a private team hide its existence or expose a membership-request page? Default to hidden unless the team chooses discovery; neither option exposes the roster.
- Which profile fields require staff review, and what exceptional platform support access is acceptable? Which records/attachments must be retained, minimized, or removed, and when?
- What reports does Joel's EC interface produce, and which ARES/EMA columns, reporting timezone, attribution rules, and export formats are mandatory at launch?
- What source identifiers can safely join Brad's three tabs? How should conflicts and shared accounts/contact methods be resolved by the coordinator?
- Which parts of the inherited WSSM manual remain adopted, who can approve updates with the EMA, and who serves as backup for activation, document ownership, and training review?

### Before the Asset Pilot

- Which office/trailer/go-kit components are team-owned versus EMA-owned or personally loaned, and who authorizes removal, loan, repair, or disposal?
- Which accessories need individual IDs versus a counted checklist entry, and what must be present/charged/tested before each setup is considered ready?
- What home storage location, responsible contact, due/review interval, and recall expectations apply to each kit? Who can acknowledge transfers and reconcile returns?
- Can a holder transfer equipment directly with both parties' acknowledgment, or is a custodian approval required? What recovery process applies to missing gear or departing/historical members?
- For personal gear, is it offered only with its owner operating, or may it be loaned? Which computers, interfaces, antennas, and masts are shared dependencies, and how much removal/restoration time is needed?
- Who authors/reviews each station/kit guide, what qualifies as a material configuration change, and which power/live-message tests must a relief operator demonstrate?
- Which item-specific maintenance intervals/triggers, SWR sweep baselines and acceptance criteria, service reviewers, and overdue-task restrictions are approved by the owners/agencies? Which analyzer file formats need attachments first versus later structured import?

### Before Planning and Wider Rollout

- Which agency's ICS editions, local supplements, sign-off roles, and distribution rules should the pilot support? Is an attached reviewed form sufficient where structured generation is deferred?
- What standby/escalation conditions distinguish reserve availability from routine availability, and which assignment changes require reconfirmation?
- How should shared radios, portable kits, home relays, concurrent nets, and supervised trainee assignments constrain staffing?
- Which team location details may ordinary members see? Default precise addresses/access details to need-based staff access; review the use of generalized map locations.
- How old can a measured RF path be before it needs reconfirmation for a particular exercise, and what test context matters?
- Will mutual aid need explicitly shared locations, qualifications, or availability? Keep separate teams isolated until a sharing contract is agreed; duplicate local location records are acceptable initially.
- What freshness intervals and follow-up cadence work for volunteers? Validate the six-month pilot proposal rather than assuming all data expires together.
- Which monitored channel and PACE transition/listening rules will Cumberland adopt? Resolve differing reference entries locally and confirm what to do when no NCS is heard.
- Who owns the SMS sender and pays the bill, which team/purpose scopes need distinct consent, and what response deadlines, escalation, expiry, and spending limits apply? Which members prefer radio/telephone follow-up?
- What must each host site provide, what must volunteers bring, who authorizes relief/release, and who follows up on overdue arrival/return? Which emergency-contact details are necessary and who may see them?
- Which training cadence, task-book edition/local overrides, evaluators, and practical objectives should the first annual plan adopt? Neighboring schedules are examples until locally confirmed.
- Which digital paths, receipt/delivery criteria, test recency rules, seasonal stages, and primary/backup staffing horizons will the pilot adopt? Which external training resources may be linked versus reproduced?

## 12. Reference Links

Sources below inform the proposed workflows; they are not imported operational settings. Local/provider sources were reviewed 2026-09-15. National references were reviewed during the preceding guidance discussion; recheck editions and local adoption at implementation. Preserve URLs and edition dates even when a source later moves. No external contacts were enrolled or messaged.

### Local Baseline and Neighboring Examples

- [WSSM-ECT resource page](http://www.ws1sm.com/ECT.html) — inherited local entry point and resource index.
- [WSSM-ECT Operations Manual, version 09.25](http://www.ws1sm.com/Forms/WSSM-ECT-ARES-RACES_Ops_Manual_Simple_PDF.pdf) — inherited authority, equipment, training, net, and reporting baseline; confirm current adoption with the EMA.
- [York County Emergency Communications Team](https://k1yem.com/) — EMA-directed team model and inclusive support participation.
- [YCECT Operations Manual, March 12, 2025](https://k1yem.com/wp-content/uploads/2025/03/YCECT-Operations-Manual.pdf) — role structure, alerts, mobilization, checklists, and staged training; source conflicts/incomplete sections are noted in section 1.
- [Strafford County NH-ARES](https://nh-ares.org/strafford.php) — agency missions, radio resources, flexible participation, and introductory education; the user-supplied trailing-slash URL was normalized for retrieval.

### Greater Manchester ARES Practical Resources

Reviewed 2026-09-15. These are reference examples and proposed local adaptations, not a software integration or automatic adoption of another team's procedures. Preserve original authorship; some materials are hosted or linked by GMARES on behalf of others.

- [GMARES](https://gmares.org/) — organization/resource entry point.
- [Winlink training resources](https://gmares.org/winlink-training-resources/) — path-specific learning modules, including internet/Telnet, RF gateway, and peer-to-peer operation; dates vary by module.
- [NBEMS training](https://gmares.org/nbems-training/) — FLmsg/ICS-213, Winlink interoperability, printing, FLamp, and macro exercises.
- [Preparation checklists](https://gmares.org/checklists/) — index of task-book, hurricane, and go-kit resources; verify originating author and edition.
- [Preparing for a Hurricane and ARES Operations, Dave Colter WA1ZCN, 2024](https://gmares.org/wp-content/uploads/2024/08/Preparing-for-a-Hurricane-and-ARES-Operations-2024.pdf) — staged preparation, live station/power checks, availability, and tentative backup/extended staffing.
- [VHF/UHF Go-Box and Base Station, Jay Taft K1EHZ](https://gmares.org/wp-content/uploads/2023/04/VHF-UHF-Go-Box.pdf) — shared home/portable setup example informing configuration-specific operating guides; upload path is not proof of publication date.
- [Forms library](https://gmares.org/forms/) — local reporting and message/activity form examples; confirm agency-required editions independently.
- [NH ARES Timecard v1-6](https://gmares.org/wp-content/uploads/2025/12/NH-ARES-Timecard-v1-6.xlsx) — activity categories and half-hour reporting increments; coordinator review must settle mapping and rounding rules.
- [After Action Report template](https://gmares.org/wp-content/uploads/2023/04/aar_form.docx) — station/operator, notification, power, conditions, message counts, issues, and successes.

### ARES, Preparedness, and Incident Guidance

- [ARRL ARES overview and membership guidance](https://www.arrl.org/ares) — formal program eligibility and links to current program resources.
- [ARRL ARES Plan, July 2025](https://www.arrl.org/files/file/ARES%20Plan%20July%202025.pdf) — quick-start procedures, qualification, agency relationships, and credentialing.
- [ARES Individual Task Book, version 3.0, July 2024](https://www.arrl.org/files/file/ARES%20Taskbook%20July%202024%20%28improved%29.pdf) — task evidence, evaluator sign-offs, and local additions; reconcile differences with the later plan.
- [ARRL Field Resources Manual, 2019 file](https://www.arrl.org/files/file/Public%20Service/ARES/ARESFieldResourcesManual-2019.pdf) — field reference and preparation templates; older guidance requires local review.
- [Eastern Massachusetts ARES go-kit checklist](https://ema.arrl.org/wp-content/uploads/2018/03/Go-Kit-Checklist.pdf) — equipment, operating supplies, and personal/extended deployment checklist example.
- [CISA Auxiliary Communications Field Operations Guide](https://www.cisa.gov/sites/default/files/publications/AUXFOG%20June%202016%20-%20508%20Reviewed%20-%20Final%20%282-16-17%29.pdf) — preparation, site awareness, mobilization, deployment, and demobilization reference; follow current agency procedures.
- [CISA PACE planning guidance](https://www.cisa.gov/sites/default/files/2024-10/2024_NCSWICPTE_Leveraging_PACE_Plan_Emergency_Comms_Ecosystems.pdf) — communications alternatives, dependencies, switching triggers, and exercises.
- [FEMA mobilization guidance](https://emilms.fema.gov/_is0700b/groups/37.html) — requested/authorized deployment and unrequested-resource concerns.
- [FEMA ICS-221 Demobilization Check-Out](https://training.fema.gov/emiweb/is/icsresource/assets/ics%20forms/ics%20form%20221%2C%20demobilization%20check-out%20%28v3%29.pdf) — release and required checkout sign-offs.
- [Maine EMA response-team guidance](https://www.maine.gov/mema/response-recovery/incident-management/emergency-management-response-teams) — local context for volunteer response, training, and accountability; specific requirements need agency confirmation.

### Twilio Design References

- [Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy) — sender/purpose consent, identification, and withdrawal requirements.
- [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) — provider opt-out events and confirmations.
- [Outbound message status](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status) — provider delivery lifecycle/callbacks, distinct from human acknowledgment.
- [Webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) — authenticated provider callbacks and signature validation.
- [A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) — US local-number application messaging registration; confirm requirements for the chosen sender.

### Existing Project and Membership References

- [NH-ARES public membership application](https://secure.ema.arrl.org/qilan/ares/NH/ARES_membership_app_new) — public fields reviewed 2026-09-15; EC reporting not reviewed.
- [FEMA ICS forms catalog](https://training.fema.gov/emiweb/is/icsresource/icsforms/) — form names checked 2026-09-15; confirm selected editions and agency requirements before implementation.
- Joel, AA1GM's membership request, Brad's three-tab field list, and follow-up personal/team equipment and custody examples — supplied in the design conversation, 2026-09-15.
- [Public Service Events design](PUBLIC-SERVICE-EVENTS.md) — shared posts/shifts, operational periods, and form-builder ownership.
- [Traffic Handling design](TRAFFIC-HANDLING-DESIGN.md) — existing message/log integration boundaries.
- [Privacy Policy](../PRIVACY.md) — current behavior; must be updated before new Teams collection is released.

Earlier reference leads (not re-evaluated for current product capabilities or required reporting formats in this expansion):

- https://ares.arrl.org/aresform2instructions.pdf
- https://volunteerham.com/
- https://www.hamclubonline.com/
- https://docs.google.com/spreadsheets/d/1q1NGh9wZQ6snzGDDF5JO55U4o0TDpGB2s8WpFgPpDxk/edit?gid=0#gid=0
