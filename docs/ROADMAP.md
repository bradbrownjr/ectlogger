# ECT Logger — Product Roadmap

*Last updated: 2026-07-26 (rev 39 — logged field bug reports and feature requests from Maine Dirigo Net (nets #41, #44). Two of the underlying root causes were already fixed same-day in `f866587` (scheduled net auto-create silently failing for rotation-based templates; duplicate/triplicate 1h reminder emails) — remaining items logged below at 0.7 and in Milestone 1.)*  
*Compiled from user feedback: AA1GM, KC1UIX, W1BKW, W1MTW, N1GSK, KC1JMH*

> **Canonical location:** `docs/ROADMAP.md`. ~~The root-level `ROADMAP.md` is a duplicate and should be deleted.~~ *Resolved: the root-level duplicate no longer exists as of 2026-07-03.*

---

## How to Read This Document

Items are grouped by milestone tier, then by theme within each tier. Each item carries a type tag:

- 🐛 **Bug** — confirmed broken behavior
- 🔧 **Improvement** — working feature that needs polish
- ✨ **Feature** — new capability
- 🔬 **Investigative** — needs reproduction before scoping

Priority within each tier is roughly top-to-bottom. Items from conversations are attributed to their source where useful for context.

### Model recommendations for sub-agents

As of rev 25, each item carries a **Model:** line recommending which Claude model a sub-agent should use to implement it:

- **Haiku** — single-file, mechanical, precisely specified changes (delete dead code, fix a known line, add a badge column). Safe once the task is spelled out exactly.
- **Sonnet** — multi-file features and refactors that follow an established pattern with a clear spec. The workhorse tier for this codebase.
- **Opus** — architecture, security-sensitive design, data modeling, and anything touching auth/payments/time handling. Also used as a *review gate* on Sonnet work where noted.

Rule of thumb: Haiku and Sonnet can only maintain this codebase safely once files are small and patterns are extracted — which is exactly what Milestone 0 below delivers. Sequence Milestone 0 before assigning Milestone 1 items to smaller models.

---

## Milestone 0 — Codebase Health & Maintainability *(audit findings, 2026-07-03)*

*Findings from a full audit of the backend and frontend, ordered by severity. These are prerequisites for reliable Haiku/Sonnet maintenance: today the largest files (NetView.tsx at 5,410 lines, Admin.tsx at 3,215, backend routers/nets.py at 2,207) are too big for a smaller model to edit without collateral damage. `tsc --noEmit` currently passes clean, so the refactors below start from a healthy type baseline.*

### 0.1 Confirmed bugs (fix first)

~~**🐛 WebSocket guest messages crash the connection** — completed 2026-07-03~~

~~**🐛 Statistics page Tabs violate DESIGN.md** — completed 2026-07-03~~

### 0.2 Orphaned code (verified zero references)

~~**🔧 Delete `frontend/src/components/NCSRotationModal.tsx`** — completed 2026-07-03~~

~~**🔧 Delete `frontend/src/utils/netReportPdf.ts`** — completed 2026-07-03~~

~~**🔧 Relocate/remove `backend/test_merge.py` and `backend/test_stats.py`** — completed 2026-07-03~~

### 0.3 Guardrails that make small-model maintenance safe

~~**✨ Test suite + CI pipeline** — completed 2026-07-03~~

~~**🔧 React error boundary** — completed 2026-07-03~~

~~**🔧 WebSocket resilience (both ends)** — completed 2026-07-03~~

~~**🔧 SMTP timeouts on all email sends** — completed 2026-07-03~~

~~**🔧 Validate `User.timezone` as a real IANA zone** — completed 2026-07-03~~

~~**🔧 FastAPI deprecation: `@app.on_event` → lifespan handler** — completed 2026-07-03~~

~~**🔧 Composite index candidates for hot query paths** — migration 040 written 2026-07-03; run on prod after verifying with `EXPLAIN QUERY PLAN` — completed 2026-07-03~~

### 0.4 Modularity & componentization program *(complete as of 2026-07-06 — all 4 steps done)*

*Goal: no page/router over ~800 lines, so any single file fits comfortably in a small model's working set. Extract shared patterns first (they shrink every file that follows), then split files from easiest to hardest. Each extraction must preserve behavior exactly — run the 0.3 suite after each step, and follow the Regression Check Policy (a 5,410-line file shrinking by thousands of lines requires the feature-survival checklist).*

*Amendment (2026-07-06, after NetView): the ~800-line number is a proxy for "safe for a small model to edit without collateral damage," not an end in itself. NetView stopped at ~2,289 lines once every duplicated/real-time-risky surface was extracted, because the remaining content (net-lifecycle handler glue, each tied to a different already-extracted dialog) doesn't share a clean dependency boundary — forcing it under 800 would trade a legible line count for an illegible seam. Judge each file on that basis, not the raw number.*

~~**Step 1 — Shared frontend hooks** *(do first; every later split gets smaller)*~~  
~~- `useLocalStorage(key, initial)` — replaces the repeated localStorage-init + persist-effect pattern in NetView, Dashboard, Scheduler~~  
~~- `useSortableTable(items, initialField)` — replaces four duplicate sortField/sortDirection pairs in Admin.tsx plus Scheduler.tsx~~  
~~- `useDialog()` returning open/onOpen/onClose — NetView alone declares ~36 dialog open-state pairs~~  
~~- `useApiData(fetchFn)` — the fetch + loading + error + refetch boilerplate repeated across pages~~  
~~- A `localStorageKeys.ts` constants file documenting every key in use (themeMode, dashboard-*, scheduler-*, floatingWindow_*, checkin_hideDuplicates, token, ...)~~  
*Completed 2026-07-03. All hooks created in `frontend/src/hooks/`; exemplar + mechanical migrations applied across Dashboard, Scheduler, Admin, NetView, Statistics.*

~~**Step 2 — Backend shared permission module**~~  
~~Extract `app/permissions.py`: `check_net_permission`, `check_template_permission`, and the repeated is_owner/is_admin/is_ncs composition currently duplicated across `routers/nets.py`, `routers/templates.py`, `routers/check_ins.py`. Also normalize the two inconsistent admin-check styles (`user.role == UserRole.ADMIN` vs `user.role.value == "admin"`) to one idiom.~~  
*Completed 2026-07-03. `app/permissions.py` created; silent bug fixed in `ncs_rotation.py` (enum vs string admin check); all 8 `.role.value == "admin"` sites normalized.*

~~**Step 3 — Backend router splits** *(FastAPI sub-routers; mechanical once the pattern is set)*~~  
| File | Lines | Split result |
|---|---|---|
| ~~`routers/nets.py` (2,207)~~ | done | `nets_core.py`, `nets_polls.py`, `nets_export.py`, `nets_roles.py` + facade |
| ~~`email_service.py` (1,613)~~ | done | `email/{base,auth,net_lifecycle,reminders,net_logs,digest}.py` + `EmailService` facade class |
| ~~`routers/templates.py` (1,349)~~ | done | `templates_core.py`, `templates_merge.py`, `templates_subscriptions.py`, `templates_topics.py` + facade |
| ~~`routers/statistics.py` (1,022)~~ | done | `statistics_{global,net,user,geo}.py` + facade |
| ~~`routers/ncs_rotation.py` (877)~~ | done | `ncs_schedule.py` (pure functions, unit-testable), router stays in `ncs_rotation.py` |

~~`ncs_reminder_service.py` (777) can stay whole — it is one cohesive background service.~~  
*Completed 2026-07-04. All route paths unchanged (verified with before/after route table diff). 23/23 tests pass on beta.*

~~**Step 4 — Frontend page splits**~~ *(all files done — see decisions inline for NetView and NCSStaffModal, both stopped short of ~800 lines by deliberate judgment call, not oversight)*  
| File | Lines | Extraction plan |
|---|---|---|
| ~~`Admin.tsx` (3,215)~~ | done | Six self-contained tab components in `components/admin/` |
| ~~`CreateSchedule.tsx` (2,262)~~ | done | 7 tab components + `CreateScheduleContext`; 4 shared form panels in `components/forms/` |
| ~~`CreateNet.tsx` (1,820)~~ | done | `BasicInfoTab`, `NCSStaffTab` in `components/create-net/`; shares 4 form panels with CreateSchedule |
| ~~`Dashboard.tsx` (1,490)~~ | done | `NetCard` extracted to `components/dashboard/`; `useFavorites` hook in `hooks/` |
| ~~`Scheduler.tsx` (1,276)~~ | done | `ScheduleCard` extracted to `components/scheduler/`; reuses `useFavorites` |
| ~~`NetView.tsx` (5,410 → 2,289)~~ | done | Extracted to `components/netview/` (+ `hooks/`): `useNetWebSocket`, `CsvImportDialog`, `ArchiveDialogs`, `RoleAssignmentDialog`, `CheckInFormDialog`, `NetControlDialogs`, `NetViewHeader`, `checkInStatusHelpers`, `CheckInMobileList`, `CheckInTable` (unified desktop+detached), `useNetData`, `NetViewSidePanels`, `checkInActions` factory. **Decision (2026-07-06, Brad + Opus review): stop here, don't chase the ~800-line number further.** The ~800-line goal was a proxy for "safe for a small model to edit" — the actual risk (three near-duplicate check-in tables that could silently drift, entangled real-time inline-edit state) is fully extracted and browser-validated. What remains is ~30 net-lifecycle handlers (start/close/archive/subscribe/etc.), each tied to a different already-extracted dialog — a wide, heterogeneous dependency set (10+ dialog controllers, fetchers, toast, navigate) that doesn't share one clean deps object the way `useNetData`/`checkInActions` did. Forcing that extraction would trade a legible line count for an illegible seam, and these handlers are genuine page-controller glue (nothing else calls them) rather than reusable logic. NetView stays at ~2,289 lines as a coherent page controller with every risky/duplicated surface already gone. |
| ~~`NCSStaffModal.tsx` (1,789 → 1,008)~~ | done | Extracted the 4 tab render functions to `components/ncs-staff/`: `NCSStaffRosterTab` (the "Net Control Stations" tab, ~415 lines — kept as one component rather than split into a shared `StaffRosterListItem`, since its 3 context-dependent display modes share presentational shape but differ enough in business logic — manager transfer vs. duty highlighting vs. plain role list — that a forced shared sub-component would obscure more than it saves), `NCSStaffRotationTab` (drag-reorderable list + fifth-week picker; drag-visual state `dragOverIdx`/`dragItemIdx` is now local to the component since nothing else reads it, while the actual reorder mutation stays a parent-owned prop), `NCSStaffScheduleTab` (fully self-contained including the swap/cancel dialog and its handlers, since nothing else in the modal touched that state), `NCSStaffSubscribersTab`. Also extracted `utils/apiErrors.ts` (`getErrorMessage`), deduping a helper that was locally defined in both the parent and the new Schedule tab. All 4 extractions verified byte-identical via normalized diff. Roster/Rotation/Subscribers tabs keep their handlers and cross-cutting state (staff/members/scheduleEntries, fetchData, permission derivations) in the parent, passed down as props — unlike Profile.tsx's tabs, several handlers here ripple across tabs (e.g. removing a staffer also updates rotation and schedule entries), so a zero-prop self-contained split wasn't safe. Browser-validated on beta 2026-07-06: opened the modal on both a bare schedule and one with 6 configured rotation members, clicked through all 4 tabs, and used the Up/Down reorder buttons to confirm the extracted `handleMoveMember` prop still persists correctly through `/ncs-rotation/members/reorder` (test data restored to original order afterward). Stopped at 1,008 lines rather than forcing under 800 — same judgment call as NetView: every duplicated/complex UI surface is extracted, and the remainder (fetchData, ~15 handlers, permission derivations, Dialog/email/toast shell) is cohesive page-controller glue without a clean narrow dependency boundary. |
| ~~`Profile.tsx` (1,078 → 193)~~ | done | Extracted to `components/profile/` (+ `hooks/`): `useUserStats` (activity-stats fetch effect), `ProfileAvatarSection` (avatar display + crop dialog + upload/delete, fully self-contained — calls `useAuth()` directly), `ProfileTab` (identity form), `SettingsTab` (notification/display toggles), `ActivityTab` (stat cards + favorite-nets table + PDF export, zero props — calls `useUserStats`/`useAuth`/`useNavigate` itself), and **`DrillDownTable`** (unifies the two near-identical paginated drill-down tables the audit flagged into one parameterized component via `showNetName`/`showCheckIns`/`onView` props). `formData`/`handleSubmit`/`saving`/`error`/`success` stay in the parent (the only state genuinely shared between ProfileTab and SettingsTab, since both submit the same `PUT /users/me`), typed via a new shared `ProfileFormData` interface. All bodies verified byte-identical via normalized diff. Browser-validated on beta 2026-07-06: all 3 tabs render, tab-switching works, stat-card drill-down activates correctly, zero non-benign console errors. `tsc --noEmit` clean. |

*Admin through Scheduler splits completed 2026-07-04. NetView dialog cluster + form + WS hook completed and beta-validated 2026-07-05 (`0929758`, `485ee48`, `f3418ad`, `0fdfe31`, `556a4df`, `4e6ad87`). Header + status-helper factory + mobile-list 2026-07-05 (`ec10adb`, `8b945e0`, `8c40cb3`). Desktop `CheckInTable` extraction (byte-identical body, verified) + detached unification 2026-07-05 (`91a6b1b`, `10874b9`). All Opus-gated table work complete and browser-validated 2026-07-06. Sub-800 slim-down: `useNetData` hook (`1e42839`), `NetViewSidePanels` (`d7a2d98`), `checkInActions` factory (`82a7bdb`), all 2026-07-06 and all browser-validated.*

**✅ `checkInActions` browser-validated 2026-07-06.** Live smoke test on beta hit two false-negative signals before landing on ground truth — worth recording since they're general Browserless-testing gotchas, not app bugs: (1) this net auto-creates an NCS check-in for the viewing owner, so a page-wide `button[title="Raise hand"]` selector silently toggled the *wrong* row's hand-raise; scoping the query to the target row's own `<tr>` fixed it. (2) Browserless's default 800×600 viewport is narrower than the check-in table, so Puppeteer's real `.click()` (which requires an on-screen, unclipped target) failed for off-screen columns, and a DOM-level `.click()` bypass left focus in a state where the subsequent blur-driven save never fired; setting `page.setViewport({width:1600, height:1000})` resolved both. With those fixed, direct before/after database reads confirmed `handleToggleHand` (hand_raised flipped correctly for the intended check-in) and `handleSaveInlineEdit` via Enter-key save (edited field value persisted) both work exactly as before extraction.

**✅ Browser-validated 2026-07-06** (Browserless container recovered after the 2026-07-05 Unraid power-loss reboot). Live smoke test on beta against a throwaway net confirmed: the check-in row renders identically in the attached and detached placements (same `CheckInTable`, confirmed by matching row text); clicking detach correctly moves *only* the check-in panel into floating mode (`checkInTableIsDocked: true`, verified distinct from Chat/Activity Log which have their own similarly-titled detach buttons); the in-table detach icon correctly disappears once detached (`detachIconGoneInDetachedView: true`); and — the key Step 4 behavior change — **clicking a cell in the now-detached table activates inline editing** (`inlineEditActivated: true`), confirming the disparity fix. All API calls 200, zero non-benign console errors. NetView Milestone 0.4 split is fully validated end-to-end; the Opus gate is closed for good.

**✅ Sub-800 slim-down validated 2026-07-06.** `NetViewSidePanels` consolidates the Chat/Activity Log docked-column and both detached-`FloatingWindow` blocks into one component/call site. A live smoke test confirmed: Chat's own detach icon (rendered inside Chat's own `<table>` header, not the check-in list's) correctly toggles exactly one panel to floating mode; and — critically — the pre-existing quirk where Activity Log's docked slot disappears whenever Chat is detached (both gated on the same `!chatDetached` condition) was preserved exactly, not accidentally fixed or broken by consolidating the three render blocks into one call site. Confirms MUI Grid's default `position: static` doesn't change the FloatingWindow's (react-rnd, `position: absolute`) resolved containing block at the new nesting depth.

**Placement and reuse convention** *(added rev 26 — the point of splitting is reuse, not just smaller files)*  
Extractions are organized by *functionality*, and each extracted piece gets an explicit home based on its reuse scope:

- **App-wide** → `frontend/src/hooks/` and `frontend/src/components/` root: `useLocalStorage`, `useDialog`, `useApiData`, `useSortableTable`, plus a generic `ConfirmDialog` (the delete/archive/close confirmation pattern currently re-implemented in Admin, NetView, Dashboard, and Scheduler).
- **Shared between specific pages** → also `components/` root, named for the function not the page: `useFavorites` (Dashboard + Scheduler), the view-mode grid/list toggle (Dashboard + Scheduler), and the per-tab form panels that CreateNet and CreateSchedule near-duplicate today (Script, Announcements, Check-in Fields tabs) — extracting these once removes the standing risk of the two pages drifting apart.
- **Page-local** → a page subfolder (`components/netview/`, `components/admin/`): the six Admin tabs, `NetViewHeader`, the NetView dialog cluster. Local until a second consumer appears; promotion to `components/` root is a rename, not a rewrite.
- **Reuse candidates to verify during extraction, not assume**: a read-only variant of `CheckInTable` may be able to back `NetReport.tsx`'s check-in listing, and `useSortableTable` should back any future admin-style table (e.g., the power-user indicators item in Milestone 1). Confirm fit at extraction time; don't force a premature abstraction (KISS).

Rule for sub-agents doing the splits: a component takes typed props and owns no page state it doesn't need — if an extracted piece still reaches back into its old page for state, the split isn't done. That's what makes these pieces safely editable by Haiku later and reusable elsewhere.

**Model:** Sonnet for each page split, with an Opus review gate on the NetView split only (real-time state + WebSocket + inline editing interactions make it the riskiest change in this program). Admin tab extractions are Haiku-capable once Sonnet does the first one.

### 0.5 Migration hygiene policy *(process, not code)*

- ~~**Numbering collision**: three migrations shared prefix `013_`~~ — resolved 2026-07-07. Confirmed via `migrations/README.md` that there's no version-tracking table (each script is idempotent, run manually by exact filename), so renumbering already-applied files is functionally risk-free. Kept `013_add_user_last_active.py` (earliest, 2025-12-18 17:36) as-is; renamed the other two into the next free slots after 040, preserving their original relative order: `041_rename_available_to_has_traffic.py` (was 2025-12-18 22:34) and `042_add_unsubscribe_token.py` (was 2025-12-19). No other file references the old names. Docstrings inside both files describe the change in prose, not by number, so no internal edits needed.
- ~~**Instance-specific data migrations are in the repo**~~ — norm codified 2026-07-07 in `migrations/README.md`'s new "Migration content guidelines" section: migrations should only contain schema changes; data fixes belong in the admin UI or an uncommitted one-off script. `022_add_aa1gm_to_schedule8_rotation.py`, `029_add_aa1gm_back_to_template8_rotation.py`, `030_add_fifth_week_user.py` are left in place (already ran) — this only stops the pattern going forward.
- **Alembic adoption** — still open, deferred to the PostgreSQL item in Milestone 2, whose plan currently references `alembic upgrade head` even though **Alembic is not set up in this project**. Must be resolved as part of that work: either adopt Alembic first, or rewrite that step. **Model:** Opus for the design decision, Sonnet for execution.

### 0.6 Post-Milestone-0.4 cleanup *(non-blocking, found during PR #2 review, 2026-07-26)*

*PR #2 (Milestone 0.4 → main) merged clean: all P1/P2/P3 manual tests passed, both CI checks green, no merge conflicts. Code review surfaced two low-severity items that don't affect behavior — logged here so they don't get lost.*

- **🔧 Dead/unused imports left over from the mechanical router split** — `backend/app/routers/nets_roles.py` (module-level imports shadowed by identical local imports in nearly every handler), `templates_topics.py` / `templates_merge.py` (long lists of unused model/schema imports), `nets_core.py` (unused `timedelta`, `check_net_lifecycle_permission`, `FrequencyResponse`). Purely cosmetic — `pyflakes` was clean of anything behavior-affecting. **Model:** Haiku (mechanical, single-file, precisely specified — run `pyflakes` per file and delete what it flags).
- **🔧 `docs/DEVELOPMENT.md` WebSocket message-type doc drift** — lists `check_in_update` and `online_users` as message types, but the backend never emits those literal names (pre-existing drift, not introduced by Milestone 0.4). Reconcile the doc against the actual set the backend emits, cross-referenced in `useNetWebSocket.ts`: `check_in`, `active_speaker`, `active_frequency`, `chat_message`, `chat_reaction`, `role_change`, `status_change`, `check_in_deleted`, `hand_raised_changed`, `net_started`, `net_status_change`. **Model:** Haiku.

### 0.7 Field bug reports — Maine Dirigo Net (2026-07-26)

*Raised live via chat during nets [#41](https://app.ectlogger.us/nets/41) and [#44](https://app.ectlogger.us/nets/44). Two root causes described in these reports were already fixed same-day in `f866587` before this triage: (1) scheduled net auto-create silently failing whenever the template has an NCS rotation (a `NetRole` import was missing, so `_get_or_create_scheduled_net` raised and swallowed the error) — this explains the "had to hit Create Net instead of it just being there" and "scheduler didn't fire" reports; (2) duplicate/triplicate 1-hour reminder emails and NCS staff receiving both the staff and subscriber reminder — fixed via a cross-type dedup helper. See that commit for detail. Everything below is still open.*

**🐛 Mobile check-in entry point not discoverable** *(N1GSK)*  
**Model:** Sonnet — reproduce on a real mobile viewport first; likely a missing/unclear check-in CTA rather than a one-line fix.  
Mobile user reported not being prompted to check in and being unable to identify which button performs check-in ("I just kept hitting icons"). Needs reproduction against an active net on a narrow viewport to determine whether the check-in control is present but unclear, or missing for some net/user state.

**🐛 Admin user not shown the check-in prompt other NCS/staff receive** *(KC1JMH)*  
**Model:** Sonnet.  
An admin-role user acting as NCS was not prompted to check in the way other (non-admin) NCS/staff are. Suggests the check-in-prompt trigger branches on global user role in a way that excludes admins — audit the prompt condition (likely in `NetView.tsx` or a check-in hook) for an `is_admin` short-circuit that should be checking net-role (NCS/staff) instead.

**🐛 Chat avatars fall back to letter-avatar after a check-in event** *(KC1JMH)*  
**Model:** Sonnet.  
After checking in, avatar images in chat stopped rendering (fell back to initial-letter avatars); reporter suspects this may also affect the check-in table. Investigate whether the `check_in` WebSocket payload or the user-serializer used post-check-in omits `avatar_url` where the initial page load includes it.

**🐛 Archive/delete dialog doesn't update when another client archives the net** *(KC1JMH)*  
**Model:** Sonnet.  
NCS closed and archived a net while a second user was still looking at the "archive or delete?" prompt for the same net. The second client should receive the net-archived WebSocket event and either dismiss the dialog or swap it to a "return to dashboard" state, instead of leaving a stale prompt for an action that already happened.

**🐛 NCS/staff reminder omits "who is on duty" schedule data** *(W1BKW, KC1JMH)*  
**Model:** Haiku — same file as the `f866587` fix (`ncs_reminder_service.py`); reuse the duty-NCS lookup that fix's tests already exercise and add it to the staff reminder's render context.  
Of the several reminder emails received during net #44, only one included the on-duty NCS name; the NCS/staff variant is missing it. Confirm which template(s) omit the duty-NCS field and add it.

**🐛 Manually-added check-in duplicates into a second "Recheck" row when that station later logs in and checks in themselves** *(W1BKW, KC1UIX — reported independently on two different nets)*  
**Model:** Sonnet.  
When NCS manually adds a station's check-in, then that station later logs in and self-checks-in, the app creates a second row with status "Recheck" instead of matching the existing manual entry. Likely cause: recheck-matching keys off `user_id` (null on a manually-entered row) rather than callsign, so a self-check-in with a real `user_id` never matches the manual row. Needs a callsign-based fallback match when the existing row has no `user_id`.

**🐛 Subscriber "net starting" notification fires on the second lifecycle action (Start) instead of the first (Open Lobby)** *(W1BKW)*  
**Model:** Sonnet — touches net lifecycle + `ncs_reminder_service.py`/notification dispatch, the same area as the `f866587` fix.  
NCS opens the lobby expecting subscribers to be notified then, giving lead time before the net goes active; instead the notify-subscribers email fires only when the net is actually started, giving little to no lead time. Move (or add an option for) the subscriber notification to fire on the lobby-open transition.

---

## Milestone 1 — Medium-term

*Meaningful new capabilities that don't require architectural changes.*

### Theming

**✨ User-selectable color themes** *(KC1JMH)*  
**Model:** Sonnet for the ThemeContext plumbing, migration, and endpoints; palette curation is a human/Opus taste task; the swatch picker component is Haiku-sized once the THEMES constant exists. *(Note: the existing `ThemeContext.tsx` handles only the dark/light toggle — this feature extends it, it does not exist yet.)*  
Allow users to choose a named color theme for the app from a hand-curated palette library. Each theme is a coordinated light/dark pair — selecting it works with the existing dark/light mode toggle automatically. Themes are per-user with a system-wide default that admins can change from the Admin panel.

**Palette source**  
**[Jam3/nice-color-palettes](https://github.com/Jam3/nice-color-palettes)** (MIT) — 1,000+ five-color palettes curated from ColourLovers. From the full library, a small set of themes will be hand-picked: one light-mode palette and one complementary dark-mode palette per color family (blues, greens, reds, purples, etc.). Attribution to Jam3 / Experience Monks is required in the app's About or Settings UI per the MIT license terms.

**Theme structure**  
Each named theme bundles a `light` and `dark` variant derived from Jam3 palettes in the same color family. MUI `createTheme()` maps the palette's primary and accent colors to `primary.main` and `secondary.main`; everything else (typography, spacing, component overrides) inherits from the base theme. The dark/light toggle remains a separate user preference that selects which variant of the active theme renders.

**Preference hierarchy**  
1. **User preference** — stored in `users.theme` (nullable string, e.g. `"ocean"`, `"forest"`). Null means "follow the system default."  
2. **System default** — stored in `app_settings` (existing key/value config table) under key `default_theme`. Admins can change this from a new Theme tab in the Admin panel. Ships set to `"ectlogger-blue"` (the current `#1976d2` palette) so no visible change for existing deployments.

When a user clears their preference or a new user registers, they automatically inherit whatever the admin has set as the system default. If the admin later changes the system default, only users with `users.theme = null` are affected.

**Admin panel**  
New "Themes" section in the Admin panel. Admins see the same swatch picker that users see, plus a "Set as system default" button. The current system default is highlighted with a badge. Changing it takes effect immediately for all users on the system default.

**Implementation checklist** *(not started)*  
- [ ] Curate the theme set: pick light + dark palette pairs per color family from Jam3 library
- [ ] Define `THEMES` constant (token → `{ name, light: MuiPaletteOptions, dark: MuiPaletteOptions }`)
- [ ] Add `theme` column to `users` table (migration)
- [ ] Add `default_theme` key to `app_settings` (seed or migration)
- [ ] Expose `GET /settings/theme` (public — needed before login for guests) and `PUT /admin/settings/theme` (admin only)
- [ ] Add `PUT /users/me` support for `theme` field (already exists, just add the field)
- [ ] Wrap app in a `ThemeContext` that resolves user → system → hardcoded fallback
- [ ] Theme swatch picker component (reused in both Profile and Admin panel)
- [ ] Add attribution credit in About / Settings footer

### Net Scheduling

**✨ Auto-open lobby before scheduled start** *(KC1JMH)*  
**Model:** Sonnet (touches the reminder/scheduler background service, where the June 2026 naive-UTC bug lived — write the schedule-calc test first). The UI toggle alone is Haiku-sized.  
Add a per-schedule setting (e.g. "Open lobby X minutes before start time") that automatically transitions a scheduled net into Lobby mode without requiring the NCS to click a link. The NCS could still open the lobby manually at any time — this is an optional server-side trigger for groups that always open the net at the same offset before their formal start. Requires:
- New `auto_lobby_minutes` column on `NetTemplate` (nullable; null = disabled)
- UI toggle + number input in the schedule editor (Net Settings tab)
- Background task in the reminder/scheduler service to fire the transition at the right time
- Guard to skip if the net is already in Lobby/Active state

### Net Reminders & Lifecycle UX *(field reports, Maine Dirigo Net, 2026-07-26)*

**🔧 Clearer reminder email call-to-action wording** *(field feedback)*  
**Model:** Sonnet — the NCS button is conditional on lobby/active state, not pure copy.  
- Rename "Join Net" on the standard reminder to two distinct actions: "View Net" and "Check-in to Net".
- On the NCS/staff reminder, replace the single "Access Net" button with "View Net" and "Check Into Net" (the latter shown only once the lobby is open or the net is active), keeping "Open Lobby" as its own button.

**🔧 Move "Keep chat open after closing" and "Schedule is active" toggles to the Schedule tab** *(field feedback)*  
**Model:** Haiku — relocating two existing form controls within Edit Net; no new logic.  
Both toggles currently live outside the Schedule tab in the net editor, which reads as inconsistent with their scheduling-related purpose.

**🔧 Clarify Create-vs-Start workflow copy** *(W1BKW)*  
**Model:** Haiku — copy/tooltip only.  
Now that scheduled nets reliably auto-create (`f866587`), manual "Create Net" should rarely be needed for scheduled nets. Add copy/tooltip distinguishing manual ad hoc creation from the auto-created scheduled path so operators aren't confused about why both a Create and a Start step exist on the rare occasion they land on this screen.

~~**✨ Per-schedule toggle to disable self check-in** *(AA1GM — Joel Huntress, direct request)* — completed 2026-07-26~~  
~~**Model:** Sonnet.~~  
~~Add a toggle in the net schedule editor to disable self-check-in for a given schedule/template. Joel reports NCS confusion when a station checks in both via ECTLogger and by voice on nets where self check-in isn't wanted. When disabled, only NCS/logger-entered check-ins are accepted; self-check-in UI is hidden for stations on that net.~~

**✨ Auto-check-in for subscribed stations on certain nets** *(field request)*  
**Model:** Sonnet — needs a design decision on scope (per-user opt-in vs NCS-controlled per-schedule) before implementation; recommend a per-user preference on the existing subscription, defaulting off.  
Let a station be automatically checked in on nets they're subscribed to (surfaced via the existing subscription icon), for operators who reliably check into the same recurring net every week.

### Admin Tooling

**🔧 Power-user indicators in the Admin users list** *(KC1JMH)*  
**Model:** Sonnet for the NCS-indicator query decision (live `exists` subquery vs denormalized flag affects list performance); the changelog-subscriber and MFA badge columns are Haiku-sized. Sequence after the `AdminUsersTab` extraction in Milestone 0.4 so the work lands in a small file.  
Surface three at-a-glance signals in the Admin → Users table so the operator can identify engaged, high-value users without cross-referencing other screens:

- **NCS indicator** — flag users who hold (or have held) an NCS role on any net, so power users are immediately visible.
- **Changelog subscriber indicator** — flag users who have opted into "What's New" emails (Profile → What's New emails), so the operator can see who is following development.
- **MFA-enrolled indicator** — flag users who have enrolled a TOTP authenticator (`totp_enabled`), so the operator can see who can participate in authenticated nets. Depends on the MFA / TOTP feature below.

Implementation notes:
- NCS indicator: derive from `NetRole` rows where role = NCS for the user. Decide whether "is NCS on any net" is computed live (an `exists` subquery in the users list) or denormalized onto the user record for list performance. Render as a small badge/icon column.
- Changelog subscriber: the subscription flag already exists for the daily digest (`whats_new_service.py`); surface it as a column/badge — no new data needed.
- MFA-enrolled: read straight from the `totp_enabled` column added by the MFA feature; surface as a padlock badge consistent with the check-in authentication indicator (see Authenticated nets below).
- Consider making both columns sortable/filterable so the operator can list all NCS operators or all subscribers in one click.

### Check-in Grid Quality-of-Life

**🔧 Freeze the check-in action button column during horizontal scroll** *(KC1JMH)*  
**Model:** Sonnet — sticky columns in MUI tables interact badly with row hover/selection backgrounds and need testing on real mobile widths; must be applied identically to both check-in table variants. Strongly prefer sequencing after the NetView split (Milestone 0.4) so the change is made once in an extracted `CheckInTable` component instead of twice inside a 5,410-line file.  
On narrow screens or wide nets the check-in grid scrolls horizontally and the per-row action buttons — the primary controls for each station — scroll out of view. Pin/freeze the action column so it stays visible at the edge while the other fields scroll under it. Apply the same treatment consistently across the desktop inline table and any other horizontally-scrolling check-in view (see DESIGN.md "symmetry and uniformity"). Keep the frozen column's touch targets at the 44×44 px minimum.

### Security & Authentication

**✨ MFA / TOTP authenticator support** *(KC1JMH)*  
**Model:** Opus for the security design (secret at-rest encryption, recovery-code storage/hashing, login-flow changes); Sonnet for implementation against that design. Do not hand any part of this to Haiku — auth mistakes are silent until exploited.  
Let users enroll a TOTP authenticator as a second factor. During enrollment, show **both** the QR code **and** the plain-text preshared secret (base32) with a copy button, so users can store the secret in a password vault (Bitwarden, 1Password) instead of a dedicated authenticator app if they prefer.

Requirements:
- New columns on `User`: `totp_secret` (with at-rest encryption considerations), `totp_enabled` (bool), and storage for backup/recovery codes.
- Enrollment flow: generate a secret, render the QR from an `otpauth://` URI **and** display the secret string with a copy button, then verify a code before enabling.
- Verification step at login (after magic-link / OAuth) when `totp_enabled` is set.
- Backup/recovery codes for account recovery, plus a disable-MFA flow.
- Suggested libraries: `pyotp` for TOTP, `qrcode` for QR generation (or render the `otpauth://` URI to a QR client-side).

**✨ Authenticated nets — station identity verification via TOTP** *(KC1JMH)*  
**Model:** Sonnet for implementation, with an Opus review gate on the expected-code endpoint (it deliberately reveals a station's current TOTP to NCS — the permission gating and never-send-the-secret rule must be airtight).  
Builds directly on MFA. Adds a per-net "Authenticated net" toggle in the Edit Net settings, with subtext explaining that it lets check-ins prove their identity to net control. When enabled, a checked-in user can read the current code from their authenticator to NCS; an action button on the check-in row shows NCS the **expected** code for that station so they can confirm it matches and mark the station as identity-verified for the net.

Requirements / design questions:
- New `authenticated` (bool) toggle on the net/template, with descriptive subtext in the Edit Net toggles section.
- Action button on check-in rows (NCS-only) that displays the currently-valid expected TOTP for the station's account.
- Server endpoint: given the net and the check-in's user, return the currently-valid expected code(s) with a small skew window — permission-gated to NCS (and possibly Logger). The raw secret must **never** be sent to the client; only the computed code.
- Record an "identity verified" state on the check-in once NCS affirms the match.
- **Authentication status indicator** — each check-in row shows a padlock next to (or overlaid on) the station's profile icon: a closed padlock once identity is verified, an open padlock when it is not. This makes a station's authentication state readable at a glance for everyone viewing the net.
- **Unenrolled stations** — if a user checks into an authenticated net without having enrolled MFA, they simply show the open-padlock (unauthenticated) state. ECTLogger does not block or auto-reject them; it is left to NCS to decide how to respond. The indicator just makes the unauthenticated status visible.
- Verification is only offered on nets flagged `authenticated`; on all other nets no padlock is shown.
- **Dependency:** requires the MFA / TOTP support above to exist first.

### Formal Traffic & Forms (Radiograms)

**✨ Radiogram and form support for handling formal traffic on nets** *(KC1JMH)*  
**Model:** Opus to resolve the design questions and lock the data model (form-definition schema vs dedicated radiogram structure is a decision that is expensive to reverse); Sonnet for each implementation phase; the auto-fill/word-count helpers are Haiku-sized once specced.  
Let NCS and users originate, relay, and deliver formal written traffic (ARRL Radiograms and other standard forms) within ECTLogger, with results stored against the net and retrievable later.

Scope:
- **Forms data model** — a `Form` table for submitted form instances (plus a form-definition / `FormField` template structure), each instance optionally linked to a `Net` so forms can also be filed outside a net. Store submitter, timestamps, form type, and field values.
- **Forms navbar menu** — a new "Forms" section in the navbar to view submitted forms, file a form outside a net, and (admin) add or edit form definitions and their fields.
- **On-net entry** — NCS/users fill a form during a net and the result is stored with that net.
- **Delivery** — forms filled by a user are emailed to that user, reusing the existing SMTP path.
- **Automation to keep entry quick** — auto-fill of date/time fields, automatic word/group count for the radiogram text (the "check"), and validation so operators never hand-count.
- **Stats** — add a "traffic handled" count to per-net stats and global stats, and surface it in the net log / PDF report / email summary.
- **ICS-309 integration** — for nets that have ICS-309 enabled, traffic logged via forms is recorded on the net's ICS-309 communications log, so formal traffic appears alongside the rest of the net's logged activity in the export.

Design questions to resolve before implementation:
- Which forms ship first? ARRL Radiogram (NTS) is the obvious first; ICS-213 general message is a likely second. Are form definitions hardcoded templates or fully admin-editable schemas?
- How is the radiogram modeled — a generic field schema covers ICS-style forms, but the radiogram preamble (number, precedence, handling, station of origin, check, place of origin, time/date) may warrant dedicated structure.
- Is "traffic handled" counted per form submitted, or per piece of traffic by disposition (originated vs. relayed vs. delivered)?
- Retrieval and permissions: who can view a stored form — the submitter, the NCS of that net, admins?
- PDF / printable output for forms, consistent with the existing ICS-309 export pattern.

This is a substantial multi-part feature: sequence the data model + Forms menu first, then on-net entry and email delivery, then the stats rollup.

### Multi-Window Support

**✨ "Open in new tab" for Chat and Activity Log panes** *(AA1GM)*  
**Model:** Opus to scope the architecture (cross-tab state sync, WebSocket sharing or duplication, auth in the popped-out tab), then Sonnet to build. Blocked on the NetView split (Milestone 0.4) — popping panes out of the current monolith would multiply its complexity.  
Allow the chat and activity log floating windows to be popped out into a standalone browser tab, useful for dual-monitor setups. Interim workaround (detach within canvas, span browser window across monitors) should be documented. This is a non-trivial frontend architecture change — scope separately.

### Relaying & Propagation Mapping

**✨ "Can hear" inter-station propagation logging** *(KC1UIX)*  
**Model:** Opus to settle the data-model direction (pairs vs multi-select, per-net vs aggregated — this shapes the schema permanently); Sonnet for implementation; any map/graph visualization is its own Sonnet task afterward.  
During a net, NCS and operators need to log not just who NCS can hear, but which stations can hear each other. This data helps ARES teams assign local nets, identify relay chains, and plan for actual incident communications.

The existing "Relay for stations NCS cannot hear" flag captures one direction of this. The new feature would add a "Can hear ___" field on each check-in row, allowing the NCS to record which other stations a given operator has confirmed hearing. Over time this builds a propagation map for the net's coverage area.

Design questions to resolve before implementation:
- Is this a multi-select (station A can hear B, C, and D), or logged as individual directional pairs?
- Should the data be visualized — e.g. overlaid on the check-in map, or as a separate propagation graph?
- Is this logged per-net or aggregated across nets for the same group?

David's use case (YCECT combined repeater/simplex drills) should drive the initial spec.

### Supporter / Funding Integration

**✨ Optional Ko-fi supporter integration, admin-configured per deployment** *(sustainability)*

**Model:** Phase 1 (config + support page) Sonnet; Phase 2 webhook handler Sonnet **with Opus review** (inbound payment webhooks are an attack surface — token verification, replay, refund handling); Phase 3 (progress bar/copy) Haiku; Phase 4 (About-modal credits) Sonnet.

> **Prerequisite:** *Help Menu and About modal* shipped in rev 22. The subtle "Support" entry point lives inside the About modal.

A subtle, never-obtrusive, never-gated way for operators to help cover an instance's hosting and development costs. ECTLogger stays 100% free; support is a quiet opt-in side door, not a paywall, modal, or nag. Because ECTLogger is open source and self-hosted by others, this ships as a **generic integration any operator can point at their own Ko-fi account from the Admin panel** — never hardcoded to one account, and disabled by default so a fresh clone shows nothing until configured.

**Platform decision — Ko-fi, single platform.**  
Ko-fi is the choice for US-based operators specifically: it lets a creator link **both Stripe and PayPal** side-by-side, while Buy Me a Coffee is Stripe-only and Stripe US cannot process PayPal — disqualifying it for the older, PayPal/Venmo-trusting ham audience. Ko-fi also takes **0% on one-time tips** (only the ~2.9% + $0.30 processor fee) and 5% on recurring memberships unless the operator pays Ko-fi Gold ($6/mo). Running two platforms at once was explicitly rejected: it creates donor choice-paralysis, double webhook maintenance, and fragmented goal tracking. (Source: design conversation, June 2026.)

**Deployment-configurable settings (open-source requirement).**  
New columns on the `AppSettings` singleton (see DEVELOPMENT.md "AppSettings singleton pattern"), all editable from a new **Support / Funding** section in the Admin panel (gated by the existing `role != ADMIN → 403` check):

| Setting | Type / default | Public read? | Purpose |
|---|---|---|---|
| `kofi_enabled` | bool, default `false` | yes | Master switch; gates the entire feature |
| `kofi_username` | string, nullable | yes | Builds the Ko-fi page / widget URL |
| `kofi_webhook_token` | string, nullable | **no — write-only** | Verifies inbound webhooks |
| `kofi_hosting_goal_amount` | int, nullable | yes | Monthly progress-bar target (per deployment) |
| `kofi_hosting_goal_currency` | string, default `USD` | yes | Goal display currency |
| `kofi_support_message` | text, nullable (may be blank) | yes | Operator's own pitch; blank renders a sensible default |

**Secret handling:** the public `GET /settings` response (readable before login) must **never** return `kofi_webhook_token`. Expose a boolean `kofi_webhook_configured` instead; the raw token is settable only via the admin `PUT`. The Admin panel also displays this deployment's fixed webhook URL (`https://<your-host>/api/webhooks/donations`) for the operator to paste into their own Ko-fi dashboard.

**Phase 1 — Config + subtle surface** *(not started)*
- [ ] Migration: add the six `kofi_*` columns to `AppSettings`
- [ ] Extend `AppSettingsResponse` / `AppSettingsUpdate` schemas and the `PUT /settings` handler, enforcing the write-only rule for `kofi_webhook_token`
- [ ] Admin panel "Support / Funding" section (set values; show the deployment webhook URL)
- [ ] "Support" link added inside the **About modal** — the single quiet entry point (no nags, no buttons beside action controls)
- [ ] `/support` view: renders `kofi_support_message` (or default copy) plus the Ko-fi widget; renders **only when `kofi_enabled`**
- [ ] Add `.github/FUNDING.yml` here and across the other ham repos (`hamalert-notifier`, `skywarn-activation-alerts`, `pktnet`, `radiomail.info`, etc.) for the native GitHub Sponsor button

**Phase 2 — Supporter recognition ("sparkle")** *(not started)*
- [ ] Migration: add `users.is_supporter` (bool) and `users.supporter_expires_at` (nullable, tz-aware UTC)
- [ ] `routers/donations.py`: `POST /api/webhooks/donations` — verify the configured `kofi_webhook_token`, match payload `email` to `User.email`, set the flag (one-off tip → expires in 30 days; subscription → persists until a cancel/expiry event)
- [ ] Daily expiry sweep that clears lapsed one-off sparkles (follows the existing `*_service.py` background pattern)
- [ ] Surface `is_supporter` in the WebSocket user payload (`online_users`) and relevant user serializers
- [ ] `UserAvatar.tsx`: conditional supporter style — a subtle gold ring with a soft glow and a periodic shine sweep, kept lightweight for the real-time UI. One component change propagates to Chat, NetView, Navbar, Profile, and NCSStaffModal
- [ ] Decide edge cases: donor email ≠ account email (offer a "link my donation" note on `/support`); refunds/chargebacks strip the sparkle; anonymous tips count toward the goal but earn no sparkle

**Phase 3 — Transparency** *(not started)*
- [ ] Monthly progress bar driven by `kofi_hosting_goal_amount` (use Ko-fi's native goal widget first; build custom only if styling demands it)
- [ ] Honest cost framing in the default `/support` copy: real monthly hosting figure, "always free" reassurance, and the "independent dev lab funds a suite of ham tools" ecosystem framing (the HamStudy / SignalStuff model)
- [ ] Open Collective deferred — revisit only if donation volume ever justifies a public ledger

**Phase 4 — Recognition in the About modal** *(not started)*

Top financial supporters and community contributors are acknowledged directly in the About modal — visible to every user, no login required. Two categories:

- **Top Supporters** — operators who have contributed financially via Ko-fi, ordered by lifetime contribution amount. Shown as a short list (e.g., top 5) with callsign and a subtle supporter badge. A "View all supporters" link or secondary dialog lists the full roster.
- **Honorable Mentions** — operators who have contributed invaluable feedback in the form of bug reports and feature requests. This group already exists in the "Feedback Attribution" table at the bottom of this roadmap and should be seeded from that list when the feature ships.

**Data model notes:**
- Top Supporters: derived from the `is_supporter` / donation webhook data added in Phase 2. Lifetime totals require accumulating amounts on the webhook handler (new `donor_lifetime_total` column, or a separate `donations` log table). Display requires explicit opt-in from the donor (a `show_in_credits` flag) to avoid surfacing anonymous tips.
- Honorable Mentions: a lightweight `credits` table (or admin-managed JSON in `AppSettings`) with fields: `callsign`, `name`, `note` (optional), `category` (supporter | contributor). Admins add/remove entries from the Admin panel.

**Implementation checklist** *(not started)*
- [ ] Decide on data source for lifetime totals (accumulate on webhook vs. separate donations log)
- [ ] Add `show_in_credits` opt-in flag to user/donor flow on `/support` page
- [ ] Admin panel: "Credits" section to manage the Honorable Mentions list
- [ ] `GET /api/credits` public endpoint returning top supporters + honorable mentions
- [ ] About modal: "Top Supporters" section (short list) + "Honorable Mentions" section, both collapsed behind a "View contributors" expandable or secondary dialog
- [ ] Seed Honorable Mentions from the Feedback Attribution table in this roadmap at launch

**Trigger:** implement after Phase 2 (donor tracking) is in place. Honorable Mentions can ship independently of Phase 2 since they are admin-curated.

**Trigger:** start after the Help Menu / About modal ships (done). Phase 1 alone satisfies the original goal (a subtle support link); Phases 2–4 are additive and carry no risk to core net logging.

### Trivia Integration

**✨ Net trivia support** *(back-burner, pending spec)*  
**Model:** Sonnet once a spec exists; the spec itself is a human/Opus conversation.  
Load trivia questions from a CSV file or URL. During a net, NCS can click a trivia icon on a check-in row to pose a question to that station and log correct/incorrect. Include trivia results in the net log, PDF report, and email summaries. Needs detailed spec before development begins.

---

## Milestone 2 — Longer-term / Architectural

*Items that require significant new infrastructure, platform expansion, or external integrations.*

### Database Migration Path

**✨ Migrate from SQLite to PostgreSQL ahead of expected growth** *(KC1JMH)*  
**Model:** Opus — data migration with zero-loss requirements, plus two audit-found landmines: (1) the plan below says `alembic upgrade head`, but **Alembic is not set up in this project** — migrations are hand-numbered scripts in `backend/migrations/`; adopt Alembic first or replace that step with a schema bootstrap from `models.py`; (2) several columns store JSON as `Text` (e.g. `User.callsigns`) and enums via SQLAlchemy `Enum` — both need an explicit porting decision for Postgres.  
ECTLogger runs SQLite today, which is appropriate for a low-concurrency single-server deployment. SQLite serializes all writes; under concurrent net sessions and real-time check-ins from multiple NCS operators at once, this will become a bottleneck. The ORM layer (SQLAlchemy async with `aiosqlite`) already supports PostgreSQL via `asyncpg` — the `DATABASE_URL` env var is the primary code-level change.

Migration plan:
- Provision a PostgreSQL instance on the IONOS VPS (or use a managed instance)
- Run `alembic upgrade head` against the new database
- Write a one-time data migration script to export SQLite rows and import into Postgres (preserve all timestamps and IDs)
- Flip `DATABASE_URL`, restart, smoke-test
- Keep the SQLite file as a backup for 30 days post-migration

**Trigger:** migrate before the user base exceeds ~300 accounts or before any feature requiring high concurrent write throughput (e.g., simultaneous multi-net operation). The expected inbound migration from ham.live's closure makes this a near-term planning item rather than a back-burner one.

### UTC-Aware Datetime Hardening *(prerequisite for the PostgreSQL migration above)*

**🔧 Standardize on timezone-aware UTC datetimes end-to-end** *(KC1JMH)*

**Model:** Sonnet for the mechanical sweep, Opus review before merge (naive/aware bugs pass tests that don't cross a DST boundary). *Audit 2026-07-03 verified scope:* 34 `utcnow` references across 8 files — `auth.py`, `main.py`, `whats_new_service.py`, `ncs_reminder_service.py`, `routers/chat.py`, `routers/check_ins.py`, `routers/nets.py`, `routers/ncs_rotation.py`. Frontend `'Z'`-append workarounds live in `Admin.tsx` (6 sites), `CreateNet.tsx`, and `NetView.tsx`.

**Background.** The app already stores concrete net instants (`Net.scheduled_start_time`, `started_at`, `closed_at`, etc.) in UTC and renders them per-user in local time. The fragility is *how* UTC is represented in the code: today it is **naive UTC by convention**. On SQLite, `DateTime(timezone=True)` silently drops the offset, so a value written as "UTC" comes back as a naive `datetime`. The backend leans on this (boundary helpers return naive UTC; comparisons use the deprecated `datetime.utcnow()`), and the frontend papers over it by appending `'Z'` before parsing (`CreateNet.tsx`, `NetView.tsx`). The June 2026 reminder bug was one symptom of this naive/aware ambiguity.

**Why this blocks PostgreSQL.** SQLite ignores timezone info; **PostgreSQL does not.** A `DateTime(timezone=True)` column maps to `timestamptz`, which stores a true instant and returns **tz-aware** datetimes. Under Postgres:

- Writing a naive datetime to `timestamptz` makes the driver (`asyncpg`) assume the server/session timezone — which may not be UTC — silently corrupting the stored instant.
- Reading returns tz-aware values, so any lingering `naive == aware` comparison (e.g. against `datetime.utcnow()`) raises `TypeError: can't compare offset-naive and offset-aware datetimes`.

In other words, the SQLite→Postgres migration will **break time handling app-wide** unless this is resolved first. This item is therefore a prerequisite, not a nice-to-have.

**Target design (works on both SQLite and PostgreSQL):**

- Introduce a single `UTCDateTime` SQLAlchemy `TypeDecorator` used by every datetime column:
  - On **bind** (write): require/assume UTC, store as a tz-aware value on Postgres (`timestamptz`) and as a normalized naive-UTC value on SQLite.
  - On **result** (read): re-attach `tzinfo=timezone.utc` to values coming back naive from SQLite, so the rest of the app *always* receives tz-aware UTC regardless of backend.
- Replace every `datetime.utcnow()` with `datetime.now(timezone.utc)` (also resolves the Python 3.12 deprecation). Grep targets: `routers/*.py`, `ncs_reminder_service.py`, `whats_new_service.py`, `auth.py`.
- Keep `template_local_to_utc()` as the conversion boundary for recurrence-rule projections — but have it return tz-aware UTC once the decorator is in place.
- Serialize datetimes via `.isoformat()` (yields `+00:00`) and **remove the frontend `'Z'`-append workarounds**; standardize parsing in one `parseUtc()` helper on the client.

**Implementation checklist** *(not started)*
- [ ] Add `UTCDateTime` TypeDecorator in `models.py` (or a `app/types.py`) and switch all datetime columns to it
- [ ] Replace all `datetime.utcnow()` calls with `datetime.now(timezone.utc)`
- [ ] Audit every `naive vs aware` comparison; remove the defensive naive/aware branches (e.g. `routers/nets.py` lobby logic)
- [ ] Update `template_local_to_utc()` and reminder service to produce/consume tz-aware UTC
- [ ] Remove `'Z'`-append hacks; add a single `parseUtc()` client helper and route all scheduled-time parsing through it
- [ ] Verify on SQLite (existing) **and** a scratch PostgreSQL instance: round-trip a scheduled net, a reminder projection, and an import/ICS-309 export
- [ ] Sequence this **before** flipping `DATABASE_URL` in the PostgreSQL migration

**Trigger:** complete alongside (and ahead of) the PostgreSQL migration. Low user-visible risk if done carefully; high risk if deferred until after the Postgres cutover.

### Team Management Module

**✨ Teams — ARES/SKYWARN team roster, training tracking, and ARRL Form 2 support** *(KC1JMH — back-burner)*  
**Model:** Opus for the module design (new domain model, role system, reporting); Sonnet for phased build-out once designed.

Full spec and design notes: [`docs/concepts/TEAM-MANAGEMENT-NOTES.md`](concepts/TEAM-MANAGEMENT-NOTES.md)

Summary: a new **Teams** section (menu between Schedule and Stats) to replace spreadsheet-based ARES/SKYWARN team tracking with a role-controlled, self-service platform. Members manage their own profiles; team managers handle roster, approvals, and reporting. Net participation automatically rolls up to team records. Designed to facilitate ARES Form 2 and EMA hour reporting.

Blocked on: core web app stability, self-hosting, and Docker packaging being in good shape first.

### Native Desktop Client

**✨ Standalone NCS client application (Windows / macOS / Linux)** *(KC1JMH — back-burner)*  
**Model:** Opus (framework selection and packaging architecture). *Review note for Brad — not removing, but flagging for a decision:* this overlaps with the TUI/packet client below and with the browser app itself; a PWA (installable web app with offline caching) might satisfy the "browser is impractical" case at a fraction of the cost of maintaining three native packages. Worth deciding before any work starts.  
A packaged desktop GUI application for NCS operators connecting to a hosted or self-hosted ECTLogger instance. Intended for single-operator NCS use; not a server. Targets scenarios where a browser is impractical but a full GUI is available. Proposed repo layout: `clients/windows/`, `clients/macos/`, `clients/linux/` with installable packages per release. Technology decision pending — evaluate Electron, Tauri, or native framework.

### TUI / Packet Client

**✨ Terminal-first NCS client for low-bandwidth and degraded-link operations** *(KC1JMH — back-burner)*  
**Model:** Opus (protocol design for the packet command mode is the hard part; the TUI itself is Sonnet work afterward).

Full spec and design notes: [`docs/concepts/TUI-PACKET-CLIENT.md`](concepts/TUI-PACKET-CLIENT.md)

Summary: a terminal UI (TUI) client and packet-optimized command protocol for running nets over SSH, local console, or packet radio links (~1200 baud). Two command modes — full terminal and abbreviated packet — with offline command queuing and replay on reconnect. Future phase includes a Winlink gateway for form-based check-in submission. Distinct from the desktop GUI client above: this is the degraded-connectivity and emergency deployment path.

This is separate from the standalone desktop client above. Both are back-burner until the web app and self-hosting are stable.

### Self-Hosting Enhancements

**✨ Docker image for self-hosters**  
**Model:** Sonnet. Note: cleaning up the instance-specific data migrations issue (Milestone 0.5) matters here — a fresh Docker install should never execute another deployment's roster fixes.  
Official `Dockerfile` / `docker-compose.yml` for a one-command self-hosted deployment. Publish to Docker Hub alongside each release.

**✨ Net template portability between hosted and self-hosted**  
**Model:** Opus design (export format, identity/attribution model), then Sonnet.  
Allow net templates created on `app.ectlogger.us` to be copied to a self-hosted instance (and vice versa), preserving origin metadata for attribution. Opt-in sharing of logs and net stats between instances.

**✨ Cross-instance user stats sync**  
**Model:** Opus — federated identity/token exchange is an architecture decision with security consequences.  
Users who participate in nets on both hosted and self-hosted instances can opt in to aggregating their check-in stats across both. Requires a federated identity or token-exchange design.

**✨ Resilience against hosted server unavailability**  
**Model:** Sonnet (mostly an audit task: verify no hard-coded dependencies on the hosted instance, then fix what's found).  
Self-hosted instances should degrade gracefully if `app.ectlogger.us` is unreachable or permanently offline. No hard dependency on the hosted server for core net logging functionality.

---

## Parking Lot — Needs More Information

Items that were raised but need clarification, reproduction steps, or a design decision before they can be scheduled.

| Item | Source | Blocker |
|---|---|---|
| ham.live closure — onboarding displaced users | KC1JMH | ham.live is shuttering. No action needed, but inbound user migration is expected. Infrastructure scaling items (DB indexes, PostgreSQL migration path) have been added to the roadmap in anticipation. Worth monitoring signup rate in coming weeks. |

---

## Out of Scope (Decided)

| Item | Rationale |
|---|---|
| Disabling web self-check-in globally | Net managers can already configure this per-net if needed; a global kill switch is not warranted. |
| Mobile station sort removal | Confirmed intentional and appreciated; making it optional (Milestone 1) is sufficient. |

---

## Feedback Attribution

| Handle | Net role |
|---|---|
| AA1GM — Joel Huntress | Net manager, Maine Dirigo DMR Net |
| KC1UIX — David Lounsbury | YCECT multi-repeater SKYWARN |
| W1BKW — Brian Wall | Regular participant, ham.live nets |
| W1MTW — Mark Carlson | Net participant (mobile user) |
| N1GSK | Net participant (mobile user), Maine Dirigo Net |
| KC1JMH — Brad Brown | Developer / net manager / WSSM Club Secretary / Cumberland County ARES EC |
