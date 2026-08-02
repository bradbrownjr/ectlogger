# Team Management Spec Draft (Back-Burner)

Last updated: 2026-08-01

This document is a structured draft spec for a future Team Management module. It is intentionally scoped as back-burner work while core web app stability and self-hosting priorities are completed.

Related roadmap references:

- [docs/ROADMAP.md](../ROADMAP.md) > Milestone 2 > Team Management Module — the module itself.
- [docs/ROADMAP.md](../ROADMAP.md) > Milestone 1 > Relaying & Propagation Mapping — the per-net "can hear" capture that section 5.6 below builds on. That half ships without Teams.

## 1. Problem Statement

Current team operations rely on shared spreadsheets for staffing, training, and readiness tracking. This creates:

- weak access control and auditability
- data quality drift
- duplicate records
- poor self-service for member updates
- manual effort for reporting (including ARES-style reporting)

Goal: provide a secure, role-based team management experience integrated with existing ECT Logger net activity.

## 2. Goals and Non-Goals

### Goals

- Replace spreadsheet-based team tracking.
- Let users safely maintain their own profile/team data.
- Restrict cross-user edits to team admins/managers.
- Link net participation to team records and reporting.
- Support multiple team memberships per user.
- Support pre-user records that can later link to a platform account.

### Non-Goals (initial release)

- Full parity with VolunteerHam or HamClubOnline feature sets.
- Cross-instance federation/sync for team data.
- Complex compliance automation beyond baseline privacy controls.

## 3. Scope

### In Scope (phaseable)

- Teams area in primary navigation.
- Team creation, discovery, privacy mode, and membership workflows.
- Team roster and member profile fields relevant to emergency comms readiness.
- Team role-based permissions.
- Team-linked net participation rollups.
- Reporting outputs that help EC workflows and ARES-style summaries.

### Out of Scope for now

- Native desktop-specific team workflows.
- Third-party API integrations with external club systems.
- Automated legal policy generation.

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
  - hidden from non-members in browse results (or metadata-only visibility, TBD)

### 5.2 Membership and Access Control

- Users can request to join discoverable teams.
- Team manager receives notification and can approve/deny.
- Candidate/pending state visible in team staff workflow.
- Non-members cannot view restricted team internals.

### 5.3 Identity Linking and Invitations

- Team manager can create non-user member records.
- Optional invite flow for non-user records.
- On account creation, link existing record by prioritized match keys:
  - callsign
  - email
  - both when available
- Link flow requires collision handling and manager review when confidence is ambiguous.

### 5.4 Net Integration

- Net Schedule supports assigning a default team.
- Nets created from a schedule inherit that team association by default.
- Net Edit supports overriding or clearing inherited team association when needed.
- Net Setup and Edit Net support assigning a net to a team.
- Net participation contributes to team-level summaries.
- Member participation time and check-in counts are aggregated automatically to the associated team.
- Users in multiple teams map net activity according to net-team assignment.

### 5.5 Reporting

- Provide team-level summaries to reduce manual reporting burden.
- Support export formats needed for local coordinator workflows and ARES Form 2 preparation.
- Define canonical report periods (monthly/quarterly/yearly) in later phase.

### 5.6 Team Locations and Coverage Assessment

This is the Teams-dependent half of the "can hear" inter-station propagation feature. The per-net capture side of that feature ships in Milestone 1 and does **not** wait on Teams. See [docs/ROADMAP.md](../ROADMAP.md) > Milestone 1 > Relaying & Propagation Mapping for the settled data model, the per-net reporting dialog, and the phase order. This section covers only what genuinely requires a team to exist.

Context: teams support fixed locations (shelters, EOCs, hospitals, cooling centers, staging areas). A team manager needs to know, for each supported location, which other locations and which stations that location can reliably communicate with — and where the gaps are. This is the deliverable of a Coverage Assessment exercise, a common ARES/emcomm SET drill type, and today it is produced by hand from paper notes.

#### Named locations

- New `TeamLocation` entity: a place a team supports, owned by one team.
- Fields: name, type (shelter/EOC/hospital/staging/other), address or coordinates, optional grid square, notes, active flag.
- Coordinates reuse the existing location parsing already used by the check-in map (GPS, Maidenhead, UTM, MGRS, or geocoded address), so a location renders on a map with no new parsing work.
- Address and access details are high-sensitivity data — see section 8 for classification and controls.

#### Link from per-net reports

- Milestone 1 stores a station's operating position on its check-in as a nullable free-text classifier (Home / Field Deployed / typed value).
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

A user's own "stations I can hear from home" map is **not** part of this section. It needs only per-net reports and the home classifier, so it ships in Milestone 1 as the last phase of the roadmap item. Teams does not gate it and must not duplicate it.

## 6. Data Model Draft

### Core Entities

- Team
- TeamMembership
- TeamJoinRequest
- TeamMemberProfile
- TeamTrainingRecord
- TeamCapabilityProfile
- TeamAffiliation
- TeamNetParticipationRollup
- TeamLocation (see 5.6; TeamLocationCoverage is a read-time rollup, not a stored entity)

### Candidate Fields (from WSSM-ECT workflows)

- Identity/contact:
  - full name
  - email
  - phone/address
  - text consent
- Status/readiness:
  - active status
  - net control readiness
  - deployment level (Responder/Reserve)
- Training/certs:
  - IS-100, SKYWARN, other admin-defined tracks
  - completion/renewal dates
  - reminder intervals
- Operations/affiliations:
  - spotter number
  - CERT/SAR/etc affiliations
  - SHARES/MARS COMEX/SET participation
  - capabilities/equipment (HF/VHF/digital voice/digital data)
- Access/security-sensitive:
  - building access status

## 7. Permissions Matrix (Draft)

To be finalized in implementation planning.

- Member:
  - read own full profile
  - edit own allowed fields
  - read limited teammate fields per policy
- Manager/Admin:
  - read/write team records
  - approve membership
  - manage non-user records and invitations
- Platform Admin:
  - support/admin actions per global policy

## 8. Privacy and Security Controls

This section is product/engineering guidance, not legal advice.

### Data Classification

- Low sensitivity:
  - callsign, participation, capabilities
- Medium sensitivity:
  - name, email, phone, training records
- High sensitivity:
  - street address, building access indicators
  - team location addresses and access details (5.6) — a roster of shelter and EOC addresses is more sensitive than any single member record, and its visibility should default to team managers

### Required Controls (baseline)

- Enforce RBAC on all team/member endpoints.
- Encrypt data in transit.
- Encrypt high-sensitivity fields at rest.
- Capture audit logs for privileged data changes.
- Implement least-privilege defaults for visibility.

### User Rights and Lifecycle

- Data export for user-owned profile data.
- Account/member offboarding flow with anonymization option to preserve historical net stats.
- Retention schedule to be defined before release.

### Privacy Policy Checklist

- What data is collected.
- Why each class of data is collected.
- Who can view each class of data.
- Retention, deletion, and anonymization behavior.

## 9. Build vs Buy Notes

- VolunteerHam: strong feature overlap for volunteer/training/deployment tracking.
- HamClubOnline: stronger traditional club administration profile.
- In-app ECT Logger implementation: strongest control for data sovereignty and direct net-workflow integration.

## 10. Milestones (Proposed)

- M0 Discovery:
  - finalize scope, roles, and privacy posture
  - settle minimal data model
- M1 Foundation:
  - teams CRUD, membership, team visibility, core RBAC
- M2 Integration:
  - net-to-team assignment and participation rollups
- M3 Reporting:
  - coordinator and ARES-prep exports
  - team locations and coverage assessment outputs (5.6), assuming the Milestone 1 per-net capture has shipped and produced usable data
- M4 Hardening:
  - audit logs, retention/anonymization controls, UX polish

## 11. Open Questions

- Should private teams be completely hidden or discoverable without member details?
- What exact fields are member-editable vs manager-only?
- What identity-linking conflict policy is acceptable for callsign/email mismatches?
- How should multi-team membership affect reporting attribution when a user participates broadly?
- What minimum retention policy is required operationally and legally for this deployment?
- What report formats are mandatory for local EC workflows at launch?
- Should team locations be visible to all team members or managers only by default (5.6)?
- Can a location belong to more than one team, or does mutual aid require duplicate records?
- How stale is too stale for a confirmed path to still count as coverage in a gap analysis?

## 12. Reference Links

- https://ares.arrl.org/aresform2instructions.pdf
- https://volunteerham.com/
- https://www.hamclubonline.com/
- https://docs.google.com/spreadsheets/d/1q1NGh9wZQ6snzGDDF5JO55U4o0TDpGB2s8WpFgPpDxk/edit?gid=0#gid=0
