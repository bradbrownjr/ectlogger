# Team Assets, Kits, and Custody (Concept Draft)

Last updated: 2026-09-16

Part of the Team Management concept. This document is the equipment half: the register of physical things a team owns or manages, who is holding each one, what a kit is supposed to contain, what maintenance it is due, and how any of that changes readiness. It answers one question the current app cannot answer at all — *where is the go-kit, who has it, is it complete, and can we use it?*

## Document Map

The Team Management concept is four interlinked documents, split once it outgrew a single readable file. **Section numbers are global across all four** — there is exactly one section 5.13 and it lives in the assets document. A cross-reference to "section 5.14" means the section carrying that number, in whichever document owns it. Do not renumber on a future move; update this table instead.

| Document | Owns | Teams phases |
|---|---|---|
| [Hub — Team Management](TEAM-MANAGEMENT-NOTES.md) | 1–4, 5.1–5.11, 5.16, 6–9, execution-plan overview, 11, 12 | M0, M1, M2, M3, M4 |
| [Assets, Kits, and Custody](TEAM-ASSETS-CUSTODY.md) | 5.13 | M3A |
| [Activation, Tag Board, and Callouts](TEAM-ACTIVATION-CALLOUTS.md) | 5.14, 5.15, 5.18, 5.19 | M1A, M3B |
| [Incident and Drill Planner](TEAM-INCIDENT-PLANNER.md) | 5.12, 5.17 | M5, M6 |

The hub owns everything shared: problem statement, goals and non-goals, scope boundaries, personas, the user-story index, the data-model conventions, the permissions matrix, the privacy classification, the phase overview with model assignments, and the reference bibliography. Read it first; nothing in the other three is standalone design.

**This document covers Teams phase M3A** and accepts user stories TM-18, TM-19, TM-20 (present custody), TM-32, TM-37, and TM-38 from the hub's section 4.1. The reservation-dependent portion of TM-20 is accepted in M5, in the [planner document](TEAM-INCIDENT-PLANNER.md).

### Why This Is Its Own Phase

The asset register is useful the moment it exists. It does not need the incident planner, Events, callouts, or reporting — a team with a trailer, two EMA office stations, and a backpack kit gets value from knowing where they are on day one. M3A is therefore deliberately schedulable on its own, and its exit criteria are written so that nothing in it waits on a phase that may never be built.

It does build on two things from elsewhere: the membership and permission foundation from M1 (a custodian is a scoped grant, and a holder is a membership record), and the equipment/configuration records from M3 (a team asset and a member's personal radio are the same kind of thing and must share a schema, or one FT-991A becomes two rows). Named `TeamLocation` records are pulled forward from M4 so that storage destinations exist; the RF coverage rollups that normally accompany them can still wait.

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


## Records, Permissions, and Privacy

These stay in the hub rather than being copied here, so that a security review happens in one place against one table. This phase is governed by:

- **Hub section 6.1** rows: equipment item / team asset registration, configuration equipment requirements, asset containment and kit manifest, asset assignment and custody/service history, equipment maintenance tasks and work records, antenna-system sweep evidence, and equipment reservation. Also the paragraph immediately after that table covering assignment-destination validation, containment cycles, and deletion that would erase outstanding custody.
- **Hub section 7** row "Team assets, contents, and custody", plus the closing paragraph defining the equipment custodian grant as independent of EC/AEC, training, and net roles.
- **Hub section 8** classification of equipment serial numbers, detailed inventories at private sites, holder contact/location details, and sensitive repair/access notes as high sensitivity; the asset audit requirement; and the custody/service retention rule.

The one boundary worth repeating here because it is easy to lose in a phase this large: **holding a kit grants no authority over it.** A holder can acknowledge custody and report problems. Editing ownership, erasing history, decommissioning, or assigning other team assets are custodian actions, and the two must not be collapsed because the holder is usually the person standing in front of the equipment.

## Phase M3A — Team Asset Register and Custody

**Model:** **Opus** for containment, custody state, and the checkout/transfer transaction — concurrent checkout of one kit is a correctness problem, not a UI one, and getting it wrong produces a real-world accountability failure rather than a display bug. **Sonnet** for registration, manifests, maintenance tasks, sweep metadata, queues, and guides, all of which follow established CRUD and document-revision patterns once the state model is fixed. **Opus review gate on the handoff transaction before merge.**

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

## Validation Focus for This Phase

The hub's release checklist carries the cross-cutting cases. These are the ones specific to assets, and they are where this phase actually breaks:

- Verify one item across home/deployable setups, power/QRP constraints, parent/component checkout and reservation races, partial returns, in-transit custody, missing assets, manifest substitutions, repair, decommissioning with retained location/disposal, and member offboarding with an outstanding loan. Ensure changes invalidate affected capabilities and preserve historical manifests.
- Test maintenance recurrence and timezone boundaries, event-trigger deduplication, missing usage readings, early/late completion, deferral history, failed-test handling, and scoped reminder/attachment access. Preserve sweep context and original evidence through component replacement, CSV re-import, and schedule changes.
- Test guide revision and disclosure: a superseded guide stays retrievable, a printed copy carries its revision, and no guide leaks site access details or secrets to a member scope that should not see them.
- Run the hub's real-data smoke-test procedure against the containment and assignment invariants specifically. "Exactly one current assignment per asset" and "at most one current parent per item" are precisely the shape of assumption that passes every hand-built fixture and fails on real rows.

## Open Questions Before the Asset Pilot

- Which office/trailer/go-kit components are team-owned versus EMA-owned or personally loaned, and who authorizes removal, loan, repair, or disposal?
- Which accessories need individual IDs versus a counted checklist entry, and what must be present/charged/tested before each setup is considered ready?
- What home storage location, responsible contact, due/review interval, and recall expectations apply to each kit? Who can acknowledge transfers and reconcile returns?
- Can a holder transfer equipment directly with both parties' acknowledgment, or is a custodian approval required? What recovery process applies to missing gear or departing/historical members?
- For personal gear, is it offered only with its owner operating, or may it be loaned? Which computers, interfaces, antennas, and masts are shared dependencies, and how much removal/restoration time is needed?
- Who authors/reviews each station/kit guide, what qualifies as a material configuration change, and which power/live-message tests must a relief operator demonstrate?
- Which item-specific maintenance intervals/triggers, SWR sweep baselines and acceptance criteria, service reviewers, and overdue-task restrictions are approved by the owners/agencies? Which analyzer file formats need attachments first versus later structured import?

## References

This document cites the [GMARES VHF/UHF go-box article](https://gmares.org/wp-content/uploads/2023/04/VHF-UHF-Go-Box.pdf) as a design example for configuration-specific operating guides. Full source list, review dates, and attribution rules are in the hub's section 12.
