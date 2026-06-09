# ECT Logger — Product Roadmap

*Last updated: 2026-06-09*  
*Compiled from user feedback: AA1GM, KC1UIX, W1BKW, W1MTW, KC1JMH*

---

## How to Read This Document

Items are grouped by milestone tier, then by theme within each tier. Each item carries a type tag:

- 🐛 **Bug** — confirmed broken behavior
- 🔧 **Improvement** — working feature that needs polish
- ✨ **Feature** — new capability
- 🔬 **Investigative** — needs reproduction before scoping

Priority within each tier is roughly top-to-bottom. Items from conversations are attributed to their source where useful for context.

---

## Milestone 1 — Immediate (next release cycle)

*Bugs and friction points blocking real operators during live nets.*

### Auth & Sessions

**🐛 Sessions don't persist across deploys / expire too quickly** *(W1MTW, KC1JMH)*  
Every deployment resets browser sessions, forcing re-authentication via magic link. Independently, session lifetime is too short for regular users. Fix: implement rolling expiry on the server side (reset TTL on each authenticated request), and make client-side session storage survive deployments. Target: no re-login required for an operator who checks in to a weekly net regularly.

### Net Management Permissions

**🐛 Archive/Delete blocked for net managers and co-managers** *(AA1GM)*  
Joel (AA1GM) is the primary administrator of a net but clicking Archive does nothing. Net managers and co-managers should have at least the same archive/delete permissions as the NCS of that net. Investigate whether this is a frontend guard or a backend 403. Net ID 20 confirmed affected.

### Reminders & Notifications

✅ **1-hour net reminder fires too early and repeats every 15 minutes** *(AA1GM)* — **FIXED in 2026.06.09**  
Root causes: timezone mismatch (using server local time instead of UTC) and broken deduplication (storing only date instead of full datetime). Fixed by using UTC consistently throughout and storing full scheduled datetime for proper deduplication.

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
Non-square images (e.g. 1920×1080) render sideways. Treat this as an immediate bug fix plus avatar UX upgrade: provide square crop with zoom at upload time (mobile and desktop), prevent unintended rotation, and only rotate when the user explicitly requests it. Also affects initial account setup on mobile.

**🔬 Mobile onboarding and responsive UI audit** *(W1MTW, KC1JMH)*  
Review first-time user flow and mobile layouts for overflow, clipped content, unclear scrolling, and orientation assumptions. Validate that core onboarding and check-in tasks are fully usable in portrait mode on common phone sizes.

**🔧 Self-check-in prompt is not obvious enough** *(KC1JMH)*  
Logged-in users who need to check in don't notice the check-in row at the bottom of the screen. Replace the inline prompt with a modal dialog that is clearly dismissible, so new users understand what action is being requested.

**🔧 Post-close archive reminder toast for NCS** *(KC1JMH)*  
When NCS closes a net, show a brief reminder toast prompting them to archive the net when finished. Include an Archive action button directly in the toast. Duration target: about 10 seconds before fade-out (or follow the project UI timing standard if different). Intended to reduce closed-but-unarchived nets lingering on the Active Nets page.

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
Optional field on each check-in to record which station relayed a transmission to NCS. This is additive (not a replacement) to the existing "Relay for stations NCS cannot hear" flag and supports propagation mapping between stations. Initial design direction: keep "Relayed by" and evaluate whether a companion "Can hear" field is needed for explicit station-to-station hearing data. Brad noted this needs logic/schema design before implementation.

### Trivia Integration

**✨ Net trivia support** *(pending spec, back-burner)*  
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

**✨ Standalone NCS client application (Windows / macOS / Linux)** *(KC1JMH, back-burner)*  
A native desktop application for NCS operators that:
- Connects to either the hosted API (`app.ectlogger.us`) or a self-hosted instance
- Operates in offline/degraded mode, buffering check-in data locally when the Internet is unavailable
- Syncs to the API once connectivity is restored
- Is intended for single-operator NCS use only — not a multi-user server
- Targets emergency and storm event scenarios where connectivity is intermittent

Proposed repo layout: `clients/windows/`, `clients/macos/`, `clients/linux/`, with installable packages built and published for each release.

Technology decision (to be made): evaluate Electron, Tauri, or a native framework against the requirement for offline buffering and OS packaging. Defer until core hosted web app stability and self-hosted Docker flow are complete. See `docs/concepts/TUI-PACKET-CLIENT.md` for related prior thinking.

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

---

## Related Concept Notes

- Team management brainstorming and privacy notes: [docs/concepts/TEAM-MANAGEMENT-NOTES.md](concepts/TEAM-MANAGEMENT-NOTES.md)

