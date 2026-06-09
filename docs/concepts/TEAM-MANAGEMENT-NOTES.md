# Team Management Spec Draft (Back-Burner)

Last updated: 2026-06-08

This document is a structured draft spec for a future Team Management module. It is intentionally scoped as back-burner work while core web app stability and self-hosting priorities are completed.

Related roadmap reference: [docs/ROADMAP.md](../ROADMAP.md)

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
- M4 Hardening:
  - audit logs, retention/anonymization controls, UX polish

## 11. Open Questions

- Should private teams be completely hidden or discoverable without member details?
- What exact fields are member-editable vs manager-only?
- What identity-linking conflict policy is acceptable for callsign/email mismatches?
- How should multi-team membership affect reporting attribution when a user participates broadly?
- What minimum retention policy is required operationally and legally for this deployment?
- What report formats are mandatory for local EC workflows at launch?

## 12. Reference Links

- https://ares.arrl.org/aresform2instructions.pdf
- https://volunteerham.com/
- https://www.hamclubonline.com/
- https://docs.google.com/spreadsheets/d/1q1NGh9wZQ6snzGDDF5JO55U4o0TDpGB2s8WpFgPpDxk/edit?gid=0#gid=0
