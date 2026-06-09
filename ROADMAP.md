# ECT Logger — Product Roadmap

**📍 This file has been consolidated. The canonical roadmap is now at [docs/ROADMAP.md](docs/ROADMAP.md).**

Please refer to [docs/ROADMAP.md](docs/ROADMAP.md) for the current, maintained roadmap.

*Bugs and friction points blocking real operators during live nets.*

### Auth & Sessions

**🐛 Sessions don't persist across deploys / expire too quickly** *(W1MTW, KC1JMH)*  
Every deployment resets browser sessions, forcing re-authentication via magic link. Independently, session lifetime is too short for regular users. Fix: implement rolling expiry on the server side (reset TTL on each authenticated request), and make client-side session storage survive deployments. Target: no re-login required for an operator who checks in to a weekly net regularly.

### Net Management Permissions

**🐛 Archive/Delete blocked for net managers and co-managers** *(AA1GM)*  
Joel (AA1GM) is the primary administrator of a net but clicking Archive does nothing. Net managers and co-managers should have at least the same archive/delete permissions as the NCS of that net. Investigate whether this is a frontend guard or a backend 403. Net ID 20 confirmed affected.

### Check-in Ordering

**🐛 Check-ins display out of chronological order** *(AA1GM)*  
Entries #6 and #7 in net 20 appear in a different order than they were logged by the NCS. The existing mobile-station promotion feature (intentional re-ordering) is not the cause — Joel confirmed no self-check-ins occurred. Investigate whether account-holder check-ins are being sorted above guest check-ins regardless of timestamp. Pull net 20 logs and compare `checked_in_at` timestamps against display order.

### Chat & UI Polish

**🐛 Emoji reaction popup shifts and reflows chat text** *(KC1JMH)*  
The emoji picker appears inline rather than as an overlay, causing visible text reflow in the chat panel. Should render as a floating layer (e.g. MUI Popper) that does not affect document flow.

**🔧 Hide emoji picker after net closes**  
Reaction controls have no purpose on a closed net. Suppress the emoji popup trigger once `net.status === 'closed'`.

**🔧 Activity log minimized by default** *(W1MTW, KC1JMH)*  
Several users found the activity log takes up too much space, especially on mobile. Default the pane to collapsed; the minimize button already exists (`_`). Update initial state only — user preference should persist within the session.

**🔧 Profile photo must be square — enforce or auto-crop** *(W1MTW)*  
Non-square images (e.g. 1920×1080) render sideways. Either enforce square crop at upload time with a crop UI, or auto-crop server-side to a centered square. Also affects initial account setup on mobile. Document the requirement clearly in the upload dialog in the interim.

**🔧 Self-check-in prompt is not obvious enough** *(KC1JMH)*  
Logged-in users who need to check in don't notice the check-in row at the bottom of the screen. Replace the inline prompt with a modal dialog that is clearly dismissible, so new users understand what action is being requested.

### Net Reports

**🔧 Replace raw JSON blob in PDF reports with "PHOTO"** *(KC1UIX)*  
Chat image entries in the PDF report render the full `__CHAT_IMAGE__{...}` JSON string. Replace with the word `PHOTO` or a placeholder. Confirmed at `app.ectlogger.us/nets/22/report`.

---

## Milestone 2 — Near-term (next 1–2 sprints)

*Improvements that directly affect the quality of the primary use case (running a net).*

### Net History Access

**🔧 Add "View Net" link directly from schedule history pane** *(W1BKW, KC1JMH)*  
Getting to a past net's chat and activity log requires: Schedules → Stats → View Net. Add a direct "View Net" button or row-level link in the history pane of the net stats page to save two clicks. Brad confirmed this in conversation.

**🔧 Chat history accessible outside of net open times** *(W1BKW)*  
Authenticated users want to retrieve chat links and conversation history from past nets without waiting for the next net session. The data already exists in the database. Ensure past net detail pages (including chat log) are accessible to authenticated users at any time, not just during the net window. The archive/circular button flow should be documented more prominently.

### Check-in UX

**🔧 Make mobile-station priority sort configurable** *(AA1GM)*  
The automatic promotion of mobile stations to the top of the check-in list is intentional and appreciated by AA1GM. However, it should be an opt-in toggle on the net settings (on by default) so net managers who prefer strict chronological order can disable it.

### Announcements

**✨ Standalone Announcements dialog for recurring event lists** *(in testing)*  
Allow NCS to maintain a running list of upcoming events to announce each week, separate from the per-net announcement field. This is noted as needing testing before release.

---

## Milestone 3 — Medium-term

*Meaningful new capabilities that don't require architectural changes.*

### User Identity

**✨ "Who is this?" user profile popup** *(KC1JMH)*  
Clicking a callsign or user icon anywhere in the app brings up a dialog showing: larger profile photo, callsign, name (no PII like email), check-in count for this net and across all nets, and current role if any. Visible to authenticated users; guests see callsign only.

### Manager Tooling

**✨ Admin "view as standard user" impersonation mode** *(KC1JMH)*  
A toggle button (padlock icon, near the dark/light mode switch) that strips admin-only UI elements from view without page reload, allowing admins to replicate what a regular user sees. Unlocking restores all admin UI. State is client-side only; no backend impersonation required. Useful for reproducing bug reports and guiding users through the app.

**✨ Post-close chat grace period** *(W1BKW, KC1JMH)*  
Option on net settings to leave the chat open for a configurable window (e.g. 15, 30, 60 minutes) after the net closes. After the grace period, chat goes read-only. Currently under consideration — gather more net manager input before finalizing.

### Multi-Window Support

**✨ "Open in new tab" for Chat and Activity Log panes** *(AA1GM)*  
Allow the chat and activity log floating windows to be popped out into a standalone browser tab, useful for dual-monitor setups. Interim workaround (detach within canvas, span browser window across monitors) should be documented. This is a non-trivial frontend architecture change — scope separately.

### Relaying & Propagation Logging

**✨ "Relayed by" field on check-in** *(KC1UIX)*  
Optional field on each check-in to record which station relayed a transmission to NCS. Mirror/complement of the existing "Relay for stations NCS cannot hear" flag. Useful for multi-repeater SKYWARN and combined repeater/simplex drills. Brad noted this needs logic design before implementation.

### Trivia Integration

**✨ Net trivia support** *(pending spec)*  
Load trivia questions from a CSV file or URL. During a net, NCS can click a trivia icon on a check-in row to pose a question to that station and log correct/incorrect. Include trivia results in the net log, PDF report, and email summaries. Needs detailed spec before development begins.

---

## Milestone 4 — Longer-term / Architectural

*Items that require significant new infrastructure, platform expansion, or external integrations.*

### Session & Auth Architecture

**🔧 Rolling magic link expiration** *(W1MTW, KC1JMH)*  
TTL resets on each authenticated request so active users stay logged in indefinitely. Users who go weeks between uses re-authenticate at first access. Requires server-side session refresh logic.

### ARES / Team Management Module

**✨ ECT / SKYWARN team management** *(KC1JMH poll)*  
Track operator time toward ARRL ARES Form 2 reporting. Log member training and capabilities. Generate tabulated net time from existing net logs. Support a club logo in PDF net reports. Evaluate integration points with existing tools (volunteerhams, hamclubonline) — neither currently offers a public API. This is a substantial feature; scope as a separate module.

### Native Desktop Client

**✨ Standalone NCS client application (Windows / macOS / Linux)** *(KC1JMH)*  
A native desktop application for NCS operators that:
- Connects to either the hosted API (`app.ectlogger.us`) or a self-hosted instance
- Operates in offline/degraded mode, buffering check-in data locally when the Internet is unavailable
- Syncs to the API once connectivity is restored
- Is intended for single-operator NCS use only — not a multi-user server
- Targets emergency and storm event scenarios where connectivity is intermittent

Proposed repo layout: `clients/windows/`, `clients/macos/`, `clients/linux/`, with installable packages built and published for each release.

Technology decision (to be made): evaluate Electron, Tauri, or a native framework against the requirement for offline buffering and OS packaging. See `docs/concepts/TUI-PACKET-CLIENT.md` for related prior thinking.

### Self-Hosting Enhancements

**✨ Docker image for self-hosters**  
Official `Dockerfile` / `docker-compose.yml` for a one-command self-hosted deployment. Publish to Docker Hub alongside each release.

**✨ Net template portability between hosted and self-hosted**  
Allow net templates created on `app.ectlogger.us` to be copied to a self-hosted instance (and vice versa), preserving origin metadata for attribution. Opt-in sharing of logs and net stats between instances.

**✨ Cross-instance user stats sync**  
Users who participate in nets on both hosted and self-hosted instances can opt in to aggregating their check-in stats across both. Requires a federated identity or token-exchange design.

**✨ Resilience against hosted server unavailability**  
Self-hosted instances should degrade gracefully if `app.ectlogger.us` is unreachable or permanently offline. No hard dependency on the hosted server for core net logging functionality.

---

## Parking Lot — Needs More Information

Items that were raised but need clarification, reproduction steps, or a design decision before they can be scheduled.

| Item | Source | Blocker |
|---|---|---|
| Mobile UI rendering bug (callsign sideways on phone) | W1MTW | May be the same as the non-square profile photo issue. Needs separate reproduction on mobile. |
| Mobile account setup friction | W1MTW | Vague — needs specific steps that failed. Likely related to profile photo and session issues above. |
| ham.live open-source evaluation | W1MTW | Not an ECT Logger issue; noted for competitive awareness only. |

---

## Out of Scope (Decided)

| Item | Rationale |
|---|---|
| Disabling web self-check-in globally | Net managers can already configure this per-net if needed; a global kill switch is not warranted. |
| Mobile station sort removal | Confirmed intentional and appreciated; making it optional (Milestone 2) is sufficient. |

---

## Feedback Attribution

| Handle | Net role |
|---|---|
| AA1GM — Joel Huntress | Net manager, Maine Dirigo DMR Net |
| KC1UIX — David Lounsbury | YCECT multi-repeater SKYWARN |
| W1BKW — Brian Wall | Regular participant, ham.live nets |
| W1MTW — Mark | Net participant (mobile user) |
| KC1JMH — Brad Brown | Developer / net manager |


# Next big release: Team management (backburner)
https://ares.arrl.org/aresform2instructions.pdf
https://volunteerham.com/
https://docs.google.com/spreadsheets/d/1q1NGh9wZQ6snzGDDF5JO55U4o0TDpGB2s8WpFgPpDxk/edit?gid=0#gid=0

I am thinking about adding a Team Management section and functionality to my ECT Logger app, incorporating similar functions to those of https://www.hamclubonline.com/ or https://volunteerham.com/. My concerns are what level of personal information I should be storing, what I would need for privacy policy, enhancements for GDPR and other PII assertions, and so forth. Right now, our team tracks people by spreadsheet, but I'd like to track it in one place where they can safely update their own info without having the ability to change others unless they are a team admin, and net participation would apply to their team profile records. We'd have to add a field in the Net Setup and Edit Net area to assign a net to a team. And users should be able to participate in multiple teams, as well as run their own. Team managers should be able to add people who are not users, and may opt to invite them to the platform or not. If they join later, they should automatically be included in the teams where they've been listed by a team manager, linked to by call sign and/or email address.

This would be a new section in the menu bar "Teams" between Schedule and Stats. Users can list all teams, unless a team is marked Private by its owner, prioritizing teams they belong to at the top. Sortable alphabetically, by team manager, by size, and by region. Users  cannot see the contents of a team unless they are a member. They can request to join, which notifies the team manager, and lists them as a candidate in the staff list.

Facilitate the Emergency Coordinator or EC in filling their EMA's hour reports and the ARRL ARES Form 2.

Things we track at the Wireless Society of Southern Maine Emergency Communications Team (WSSM-ECT):
- Full name
- Contact info (address and phone numbers)
- Whether we can text them
- Email address
- Active status
- Building door access (has a key card)
- Training programs taken such as IS-100, SKYWARN modules and last taken date, hopefully I could put in a 2 year reminder to the EC and an email to the user to retake the SKYWARN trainings and other certifications that must be renewed (admin can add others)
- SKYWARN Spotter number
- Whether or not they belong to the CERT, Search and Rescue, etc also (admin can add others)
- If they are ready and trained for running a net
- Deployment level: Responder or Reserve
- What SETs they attended
- MARS COMEX
- SHARES trained
- Capabilities like HF, VHF, Digital voice, digital data, equipment they have, etc.; I can supply more later

Moving away from a shared tracking spreadsheet is a massive upgrade for security and data sanity. Spreadsheets are notoriously difficult to lock down, so giving users a dedicated dashboard where they can manage their own data—while keeping admin keys restricted—is exactly the right instinct.

*First, the quick buddy check: I'm an AI, not an attorney, so this isn't formal legal advice. But looking at this from a pure software architecture and data privacy standpoint, here is how you can break down the risks and compliance steps.*

---

### 1. Build vs. Buy: Where Does This Fit Best?

Before writing code, it's worth evaluating if the existing platforms match your workflow:

* **VolunteerHam:** This platform is explicitly built for public service tracking. It already handles volunteer hours, training tracking (like IS-100 and SKYWARN), event registrations (perfect for tracking who attended what SET), and deployment levels (Responder/Reserve). It saves you from building the tracking logic from scratch.
* **HamClubOnline:** This is excellent for traditional club administration (dues, rosters, syncing with the FCC database via FRN), but it is less optimized for tracking complex tactical training arrays, emergency deployment tiers, or local facility permissions.
* **ECTLogger (Building It):** If you integrate this directly into your application, you gain a massive advantage: **Data Sovereignty**. You control where the database lives, you don't rely on a third-party service's uptime during an activation, and you can tightly couple a user’s operational capabilities directly with your net logging workflows.

---

### 2. The PII Risk Assessment (Sorting by Exposure)

If you choose to build this feature natively, your tracked items fall into distinct data-sensitivity categories. Treating all data with the same security level leads to over-engineering, whereas treating it too lightly leads to leaks.

| Sensitivity Level | Data Points | Technical Handling |
| --- | --- | --- |
| **Low Risk** <br>

<br>*(Public Operational Data)* | Callsign, Active status, Net control readiness, SET attendance, Radio capabilities (HF/VHF/Digital), Equipment list. | Standard database fields. Much of this is public record or broadcast over the air anyway. |
| **Medium Risk** <br>

<br>*(Standard PII)* | Full name, Email address, Phone numbers, Text messaging consent (`boolean`), Training records (IS-100, SKYWARN numbers). | Requires secure transport (HTTPS), strong hashing for user passwords, and strict Role-Based Access Control (RBAC). |
| **High Risk** <br>

<br>*(Physical & Liability Assets)* | **Physical street addresses**, **Building door access privileges**. | **Encrypt these fields at rest.** If your database backup is ever exposed, a hacker shouldn't get a neat list mapping real-world addresses to physical building keys. |

> ⚠️ **The "Building Door Access" Gotcha:** Storing whether someone has a physical key or fob to a building changes your threat profile. If someone gains unauthorized admin access to your app, they instantly know who can bypass physical security. Consider decoupling this into an opaque identifier (e.g., `access_tier_id`) rather than explicit text notes about which doors they can open.

---

### 3. Privacy-by-Design Features (GDPR & PII Assertions)

Even if your team operates purely locally, designing around modern privacy principles like GDPR or CCPA/CPRA ensures your app is rock-solid. You can implement three core technical pillars to make your system compliant:

#### A. Data Minimization

Ask yourself: *Do you actually need their full street address to deploy them?* If you only need to know their approximate location for grid coverage, consider tracking just their town or Zip code. If you absolutely need the address for official documentation, encrypt that column in the database using AES-256.

#### B. Self-Service Data Portability (Right to Access)

To meet compliance expectations easily, add a simple button in the user profile settings: **"Export My Data"**. When clicked, it generates a clean JSON or CSV dump of every single row attached to their user ID.

#### C. The "Right to be Forgotten" (Data Erasure)

If a team member leaves, they should be able to request account deletion. However, in an emergency logging app, completely dropping a user record can break relational integrity (e.g., if they served as Net Control for a past exercise).

* **The Fix:** Implement an **Anonymization Routine**. When a user is deleted, overwrite their Name, Address, Email, and Phone with generic strings (e.g., `DELETED_USER_412`), but keep their historical logging metrics intact.

---

### 4. Crafting the Privacy Policy

You don’t need a 50-page corporate legal document. For an open-source or team-focused tool, a clear, transparent `/privacy` page is significantly better. It needs to clearly state:

1. **What you collect:** Explicitly list the fields (Name, Phone, Training, etc.).
2. **Why you collect it:** State the explicit operational purpose (e.g., *"We collect training and capability data to ensure effective personnel deployment during emergency communications exercises and real-world activations."*)
3. **Who sees it:** Define the boundaries clearly. *"Your contact information is visible only to designated Team Administrators. Fellow team members can only see your callsign, active status, and radio capabilities."*
4. **Data Retention:** State how long you keep it. *"Data is retained as long as you are an active member of the team. Inactive profiles are purged or anonymized after 24 months of no activity."*

