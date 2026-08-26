# ECTLogger Changelog

All notable changes to ECTLogger are documented here.

---

# August 25, 2026

## New Features

* **Traffic: Mark traffic as Drill or Demo** — You can now label a piece of traffic as Drill (a full exercise, still logged and reported like real traffic) or Demo (throwaway test data), right when you file it or any time after. Demo traffic is excluded from reminder emails and from ICS-309/Net Report exports and traffic counts, and you (or an admin) can delete it even after it's been logged, so a test strip never sits in your inbox nagging you.

## Bug Fixes

* **Net View: NCS crown shows only for active staff** — The crown icon could appear for someone who had stepped down from the role; it now only shows for staff who currently hold that position.
* **Net View: Announcement links open in new tabs** — Links in the net script, announcements, and notes now open in a new tab, so clicking one keeps you in the net instead of taking you away.
* **Check-in: Station locations saved to history** — Correcting a station's location on an existing check-in now updates that callsign's saved location everywhere, and locations are saved for members with accounts too, so a station's location no longer reverts to an old value the next time they check in.
* **NCS Rotation: Roster changes take effect immediately** — Reordering the rotation, or adding and removing people, now sets the upcoming nets to match the list you just arranged, including a net that had already been created and staffed before you made the fix. Before, the schedule kept working from the old order underneath, so a correction never really took hold and had to be patched with a swap on every net from then on. When a roster change does move a net's assigned NCS, both the person coming off and the person going on duty get an email so nobody finds out by surprise.
* **NCS Rotation: Swaps record the right person** — The operator a swap or cancellation says was originally scheduled is now the operator who actually had that date, so cancellation notices reach the person who was going to run the net instead of whoever happens to be first on the roster.

---

# August 21, 2026

## New Features

* **Net View: Share a net without an account** — Send someone a net's link and they can view it, no sign-in needed, so you can show a prospective member how ECT Logger works before they join. Any phone number or email address in check-in notes or chat stays hidden from them.

## Improvements

* **Check-in Import: Imports now logged** — A CSV check-in import posts a summary note to the net's Activity Log recording who ran it and how many rows landed, so there's a visible record of when and how a backfilled net's data arrived.

## Bug Fixes

* **Net Report: Complete check-in maps** — The check-in map on a net's report no longer silently drops stations once a net has more than 10 different locations; every mappable station now shows up. Any station that still can't be placed (no location on file, or one we couldn't look up) is listed by callsign under the map instead of just vanishing with no explanation.
* **Check-in Import: Shortened years accepted** — Timestamps written with a 2-digit year, like 8/20/26, now import correctly instead of every row being rejected, so a CSV straight from Notepad or a spreadsheet's default date format doesn't need to be reformatted by hand first.
* **Net View: Fix roles on closed nets** — NCS and Logger assignments can now be corrected after a net is closed or archived, not just while it's live, so a wrong or missing role from a backfilled import doesn't require reopening the net to fix.
* **Net View: Archive reminder no longer covers import results** — Closing a net through a CSV import no longer pops the archive-reminder dialog immediately on top of the import summary, so you get a moment to read the results first.

---

# August 20, 2026

## New Features

* **Net View: Backfill a net that ran off-app** — If a net was run on paper or in another program and never started in ECT Logger, staff can now import its check-in log from a CSV, enter the net's real start and end times, and have the net recorded as closed in one step, so everyone who took part gets attendance credit and the schedule's participation statistics stay accurate. Rows that list only a time of day, like 7:05 PM, are now placed correctly when you pick your own time zone instead of UTC, and anyone on a schedule's staff can run the import rather than only the net's owner.

---

# August 19, 2026

## New Features

* **Admin: Checkbox custom fields** — Custom check-in fields can now be a checkbox, not just text or a dropdown, for capturing yes/no info like whether a station can do digital modes.

---

# August 18, 2026

## Improvements

* **Net View: Coverage reports now show band** — Station-to-station "can hear" reports and your Profile's coverage map now label (and color-code) each entry by the amateur band it was heard on, like 2m or 40m, blending colors on the map when a station's been heard on more than one, since HF and VHF/UHF propagation behave very differently. On nets with more than one frequency, the "Who can this station hear?" dialog now shows one column per frequency so you can record who you heard on each in a single pass, instead of switching a dropdown and re-checking the list per frequency.
* **Net View: Export coverage reports to CSV** — The Station Coverage panel is wider by default so every column, including the timestamp, fits without wrapping, and a new download button next to the search and map icons lets you export the current report to a CSV file for use in a spreadsheet.
* **Net View: Correct a coverage report's frequency** — If a station-to-station coverage report was logged without picking a specific frequency (or the wrong one), NCS, Logger, and Relay can now fix it right in the Station Coverage panel's Frequency column, and any station can correct its own past reports the same way.

## Bug Fixes

* **Schedule: No more duplicate nets from manual create** — Clicking "Create Net" on a schedule shortly before its scheduled time could create a second, separate net if one had already been auto-created for that same time slot. It now opens the existing net instead of creating a duplicate.

---

# August 17, 2026

## Improvements

* **Traffic: Copy exported text** — A piece of traffic's detail screen now shows the exact text that gets exported to a text file, with a copy icon right next to it, so you can hand it to whoever needs it without exporting and opening a file first.

* **Traffic: Log who actually handled it** — Log a Handoff now has a "Handled by" field for who performed the action (separate from "Handed to," who it went to), pre-filled with your own callsign since you're usually logging your own work; overwrite it when you're instead logging a hop someone else verbally reported to you, like an NCS logging a relay a station reported over the net.

## Bug Fixes

* **Traffic: GYX/CAR SKYWARN strip now recognized correctly** — A strip pasted straight from the current GYX SKYWARN reporting tool starts with "GYX WEATHER," which the strip type didn't recognize, so those reports landed as an unrecognized strip instead of auto-filling into the named fields. Pasting one now correctly identifies it and fills every field.

---

# August 14, 2026

## Improvements

* **Net View: Stations can self-report their own coverage** — Any station can now log its own "can hear" report from the ear icon on its own check-in row, not just NCS, Logger, and Relay recording on its behalf. Net managers can turn this off per net or schedule under ARES & EmComm Features if they'd rather staff record every report themselves.

* **Net View: Co-managers and rotation members can step in as NCS** — Any active co-manager or NCS rotation member for a schedule is now automatically granted acting-NCS access the moment they check themselves into one of its nets, even when it isn't their week, so they can pick up net control if the scheduled NCS is unavailable or has to step away. A "Check in as NCS / Check in as Participant" choice on the check-in prompt and check-in form lets them decide up front, and the existing Acting as NCS/Standard toggle lets them change their mind at any time afterward. A station checked in by NCS or Logger on its behalf (e.g. by voice) is always recorded as a standard participant.

---

# August 11, 2026

## New Features

* **Help: Diagnostics for support** — the Help menu now has a Diagnostics option describing this browser and window (screen size, browser version, and whether the app noticed anything wrong with itself), with a Copy button so you can paste it into a message when something misbehaves. Some problems only happen at particular window sizes and are otherwise almost impossible to track down. It contains no callsigns, names, locations, or net activity, and nothing is sent anywhere unless you paste it.

* **Sitewide: New-version banner** — If a tab is left open through a deploy, it now shows a banner offering to reload once a new version has shipped, so you're never troubleshooting on outdated code without realizing it, and you won't be told to force a hard refresh to see something new.

* **Help: Feedback reports now carry diagnostics and a screenshot** — The Submit Feedback form has a checkbox (checked by default for bug reports) to include your diagnostics snapshot, which now also captures any recent browser console errors, plus a screenshot you attach from a file you've already captured. Reports arrive with the context needed to track down a problem instead of a back-and-forth asking what happened.

## Improvements

* **Admin: An accurate, up-to-date picture of who's online** — the user list used to count anyone with a browser tab open as active every single minute, so admins couldn't tell who was genuinely on the site — and even then, seeing it meant reloading the page. "Last active" now updates only when someone actually does something, and the list refreshes itself every 30 seconds, with the time of the last update shown and a refresh button for an answer right now. Together that's what lets us deploy fixes and new features at a moment we know won't interrupt anyone mid-net, instead of guessing.

* **Sitewide: Pages load faster** — every screen that shows people (the net roster, chat, staff pickers, and your own profile) was waiting on the server to look up each person's profile photo with an outside service before it could answer. The admin user list took about seven seconds; that work now happens in your browser instead, in the background, so pages come back right away and photos appear as they load.

* **Admin: New option to turn off Gravatar** — Security now has a Profile Photos switch admins can use to stop the site from using Gravatar, the outside service that supplies profile pictures from a person's email address. Gravatar stays on by default, so nothing changes unless an admin turns it off. If an admin does turn it off, nothing on the site contacts gravatar.com at all, which matters for instances running on isolated or restricted networks. Uploaded profile photos are stored here and keep working either way.

* **Net View: Built to ride out a spotty connection** — Nets may be run or attended from field sites, EOCs on generator, and rural links where the internet comes and goes. The net page now keeps trying to reconnect for as long as you leave it open, instead of quietly giving up after a few minutes, and it reconnects the moment your signal returns rather than waiting out a timer. When it reconnects it catches up on everything that happened while you were out — check-ins, statuses, chat, the activity log, and traffic. Before this, a page could come back looking perfectly normal while showing an out-of-date net, which is the worst way to lose track of a net. This applies to everyone taking part, not just Net Control.

* **Net View: Edit a closed or archived net** — NCS, net managers, and admins can now fix a typo or a wrong setting on a net after it has closed or archived, not just while it's part of a recurring schedule. A note reminds you the net's log has already gone out, so a change here updates the record only.

* **Net View: Check-in prompt explains staff-only self check-in** — If a net has self check-in turned off, the owner, NCS, and loggers still get the check-in prompt since they can always check in; it now says why, so it doesn't look like the setting isn't working.

* **Sitewide: Alert banner colors show urgency** — The maintenance banner is now red to mark it as a blocker, and the new-version banner is amber to mark it as a brief, non-blocking interruption, so the color itself tells you how urgent a sitewide notice is.

## Bug Fixes

* **Net View: Check-in changes appear instantly** — picking a status used to leave the old icon on screen while the change saved, which made it look like the change hadn't taken and led people to click again. Your choice now shows the moment you make it, and new check-ins, edits, and deletions update the list right away instead of after a pause. The delay was worst on slow or mobile connections, where it could run to several seconds.

* **Schedule: Adding a topic to history** — Adding a past topic to a schedule's topic history always failed with an error. Fixed, so NCS and staff can log topics again.

* **Net View: Dropdown menus on shorter screens** — Status and other dropdown menus inside a net now open next to the control you clicked instead of far off-screen, so they no longer look like buttons that do nothing. This affected anyone whose browser window was less than about 800 pixels tall, which is common on a laptop or with Windows display scaling turned up, and it hit every dropdown on the page including the status box in the check-in row at the bottom.

* **Net View: Setting your own station's status** — Whoever owns the net can now set their own station's status (mobile, away, has traffic, announcements, and the rest) instead of that one box being permanently locked. A status you set is now also shown in place of the NCS crown, so you can see it actually took effect, and the rest of the net can tell when Net Control has stepped away or gone mobile.

---

# August 5, 2026

## New Features

* **Traffic: Weather and RRI strips** — File Radio Relay International's WXOBS weather observation strip, the GYX-CAR SKYWARN regional variant, or paste any other RRI strip as a general entry. Don't see your area's strip? Paste a filled-in example, name each field, and it becomes a real, reusable type available to everyone from then on, the same as the built-in ones. Filing shows the named fields and the exact strip text side by side and keeps them in sync as you type, so you can also just paste a strip a station reads back over the air and have it split across the fields.

* **Traffic: File and track traffic from inside a net** — A new Traffic button in the net toolbar opens a panel showing that net's traffic, with the same detach, pop-out, and minimize controls as every other net panel. Filing traffic from here attaches it to that net, so it shows up in the net's own Traffic panel, its export, and its ICS-309 log — filing from the standalone Traffic section is still there for traffic that isn't tied to a particular net. Net settings can now say which form types a net accepts and pin the WX/RRI strip type (or paste an origin strip on the spot) so operators see the right fields without guessing.

* **Traffic: Export a whole net's traffic** — The Traffic panel's Export button now covers everything filed on that net in one go: plain text (one line per report, ready for a spreadsheet or a Winlink template) or a printable PDF with every message laid out like its real paper form — the ARRL Radiogram pad, the FEMA ICS-213, or the strip layout — several to a page, with no message ever split across a page break.

---

# August 3, 2026

## New Features

* **Traffic: Assisted traffic handling** — File and track formal traffic (ARRL radiograms and ICS-213 general messages) from a net's Traffic panel or the standalone Traffic section. Every hop — originated, received, relayed, delivered, serviced, cancelled — is logged so you always know what happened to a message, and your personal inbox keeps anything you're still holding visible until you log that it moved on. Only the submitter, current holder, chain of custody, that net's NCS/logger, and admins can see a given piece of traffic, since it can carry a private individual's name, address, and phone number.

* **Traffic: Paste or drop to import** — Already have a message copied down by hand or relayed from packet? Paste the plaintext in, or drag a text file onto the box, and the parser pre-fills a new form for you to review before saving — no need to re-type every field.

* **Traffic: Form-accurate PDF export** — Printable PDFs now look like the real paper forms — the ARRL Radiogram pad and FEMA ICS-213 General Message form, boxes and rules included — ready to file or hand to the addressee, instead of a plain text dump.

* **ICS-309: Traffic Handling integration** — Nets with ICS-309 enabled now show formal traffic hops as metadata rows on the Communications Log, including its own form-accurate PDF export, so a net's formal traffic appears alongside the rest of its logged activity — the message text itself is never included.

* **Profile: Traffic stats** — Your Activity tab now shows Traffic Handled and Traffic Pending counts, each with a drill-down list of the underlying messages.

## Bug Fixes

* **Net View: Station Coverage close button** — The floating Station Coverage window's close (X) button was actually wired to "dock back to main view," which had no effect on most screens, leaving the window stuck open. It now closes the window like the X anywhere else does.

---

# August 2, 2026

## New Features

* **Net View: Station-to-station coverage logging** — NCS, Logger, and Relay can now record which stations can hear each other during a net, not just who NCS hears. Turn it on per net under ARES & EmComm Features, then use the new ear icon on a check-in row to log who that station can hear. A new Coverage panel (alongside Chat, Activity Log, and the Check-In Map) shows the results as a sortable, filterable table, and an overlay on the Check-In Map draws the confirmed one-way and two-way paths — click a callsign in either place to see just that station's connections. This is the coverage-assessment picture ARES and SKYWARN drills need, without the paper notes. Your Profile also gets a personal map of stations you've confirmed hearing from home, each labeled with when you last heard them.

* **Net Report: Per-station coverage maps** — When Station-to-Station Coverage Logging is on, the net report can now include a map for each reporting station showing who it heard, with every pin labeled by callsign, so an after-action report can show propagation station-by-station instead of just as a table. Off by default via a switch on the report's Station Coverage section, since it can add many pages to a large net's report.

## Improvements

* **Net View: Start Net moved to the front of the toolbar** — On a draft or scheduled net, Start Net is now the very first button, ahead of Net Info and everything else, so it's not buried behind read-only actions.

* **Editor: Markdown preview** — You can now toggle between Write and Preview while editing the net script, notes, or announcements, both in the net/schedule editor and in the floating dialogs, so you can check how your formatting will look before saving.

## Bug Fixes

* **Entering invalid data no longer crashes the page** — A validation error, like a callsign that's too short, could previously take down the whole page instead of showing a normal error message. Fixed everywhere this could happen.

---

# July 31, 2026

## New Features

* **Branding: Color themes** — Pick a color theme in Profile → Settings, each with light and dark variants that follow the existing dark mode toggle.
  * Admins can set the site-wide default everyone else follows, build a fully custom color theme, and upload a custom logo to replace the built-in mark — all from Admin → Branding — useful for a self-hosted instance that wants to look like its own organization.

* **Net View: Run a net across multiple monitors** — Check-Ins, Chat, and Activity Log can each open in their own real browser window, not just a movable panel inside the page, so a multi-monitor NCS station can dedicate a full screen to logging, another to chat, and another to the activity feed. Every window stays live and in sync with the net in real time. Already using the in-page floating panel? A new button on its title bar sends it straight to its own window — no need to dock it back first.

* **Net View: Arrange the page for a wide screen** — On an ultrawide monitor, Script, Announcements, and the Check-In Map can now dock directly into the page next to Chat and Activity Log, instead of floating on top of everything else. Drag the divider between any two panels — or between the columns themselves — to resize them however you use them; your layout is remembered next time.

* **Net View: Net Notes** — Jot down something you noticed during a specific net, like a repeater running weaker than usual, without touching your schedule's standing Announcements text. Look for the Notes button once you're checked in.

* **Profile: Choose whether your Net View layout is remembered** — A "Remember Net View Layout" toggle and a one-click reset in Profile → Settings let you decide whether panel positions, sizes, and docking stay exactly the way you left them on that device (the default) or start fresh every time. Sizes already stay independent across a phone, a laptop, and an ultrawide monitor even if they share a browser.

## Improvements

* **Net View: Easier to write Script, Announcements, and Notes** — Long entries now scroll properly while editing instead of getting clipped, every line break renders the way you typed it, and a new Link button inserts a properly formatted link.

* **Profile: Notifications is now its own tab** — Email notification settings moved out of Settings into a dedicated Notifications tab and menu item, with room for more notification types as they're added.

## Bug Fixes

* **Net View: Notes no longer overwrites your schedule's Announcements** — Editing a net's Notes was silently saving into the schedule's Announcements text instead, so it could carry over onto every future net from that schedule. Notes now saves to just that net, and the button no longer stays hidden until something has already been written.

* **Net View: Notes, Announcements, and Script now reliably show what you saved** — A backend bug meant your saved text could come back blank after leaving the page and returning, even though it was correctly stored. Fixed.

* **Net View: The Website/stream button now shows up correctly** — Nets with an audio stream URL configured weren't showing the toolbar button to listen in, due to the same backend bug as above. Fixed.

---

# July 30, 2026

## Improvements

* **Reminders: Clearer buttons on net-starting and staff emails** — The subscriber "net starting" email and the NCS staff reminder now have separate View Net and Check Into Net buttons, so you can jump straight to checking in instead of landing on the net page and hunting for the button.

* **Schedule: Chat and active-status settings moved to the Schedule tab** — "Keep chat open after closing" and "Schedule is active" now live on the Schedule tab instead of Basic Info, next to the other scheduling controls they belong with.

* **Schedule: Clearer "Create net now" tooltip** — The manual create button on the Scheduler page now says it skips the normal auto-schedule timing, so it's clear that's what you're choosing to do instead of waiting for the net to auto-create.

* **Admin: Users list improvements** — New NCS and What's New subscriber badges show at a glance who has run a net as NCS and who is following development, without opening their profile. The table is also tighter so more columns fit on screen, and clicking Status, Last Active, Created, or either badge column now shows active/most-recent first instead of oldest first.

* **Net View: Check-in action buttons stay visible while scrolling** — On a wide net or a narrow phone screen, the check-in list's action buttons (step away, raise hand, delete) now stay pinned to the edge as you scroll sideways through the other columns, so you don't have to scroll back to reach them.

* **Nets & Schedule: Sort choice now follows your account** — Switching Active Nets or Schedule to alphabetical (or back) used to reset when you opened the app on a different device or browser. It's now saved to your account, and Schedule now defaults to next-occurrence order for anyone who hasn't picked a preference yet.

* **Login: Sessions now last 90 days by default** — Login sessions were resetting to 30 days by default, which meant infrequent operators sometimes had to request a new magic link. The login page also now points out that bookmarking the emailed magic link (valid 30 days and reusable) gets you back in instantly even if your browser clears cookies or you switch devices.

## Bug Fixes

* **Admin, Profile, Statistics: Swiping a wide table no longer flips tabs** — Dragging sideways through a table that scrolls horizontally (like the Users list on a phone) was being read as a swipe to the next tab, so a slow reload interrupted your scroll. Scrolling that table now stays put.

* **Net Log: Emailed logs and CSV exports now honor your timezone setting** — The net-close email and the CSV/ICS-309 exports always showed check-in and start/close times in raw UTC, ignoring your Settings preference. They now follow that setting correctly: your local timezone if you're set to local (once your device has reported it to your account), or UTC if you've chosen "Display times in UTC."

* **Reminders: The 1-hour reminder now actually arrives about 1 hour ahead** — It could go out anywhere from 90 minutes to 30 minutes before a net started, even though the subject line always said "starts in 1 hour." It now consistently arrives within a couple minutes of that mark, for NCS, staff, and subscriber reminders alike.

---

# July 29, 2026

## New Features

* **Schedule: Automatic lobby opening** — A schedule's Schedule tab can now open its net's lobby on its own, so stations can check in and chat early without waiting for Net Control. Recurring schedules pick a lead time (15/30/60 minutes); Ad-Hoc opens the lobby the moment Net Control clicks Start; One-Time nets can do either, or be given an actual future start time for the first time. A net with automatic opening enabled shows a live countdown to when its lobby will open. It is off by default, and Net Control can still open the lobby by hand at any time.

## Improvements

* **Reminders: Subscribers hear about a net when the lobby opens** — The net starting email now goes out the moment Net Control opens the lobby, instead of when the net goes live. You get real lead time to get to the radio rather than finding out once the net is already running.

* **Reminders: Staff reminder names the NCS on duty** — The one hour reminder sent to net staff now says who is scheduled as Net Control, so you no longer have to open the net or the rotation to find out who is running it.

## Bug Fixes

* **Net View: Archive prompt clears itself when someone else archives the net** — If another manager archived or deleted a net while you still had the archive or delete question open, your prompt sat there offering an action that had already happened. It now closes on its own and tells you the net was archived.

---

# July 28, 2026

## New Features

* **Net View: Paused-net indicator** — If the NCS steps away and no co-NCS is covering, a blue border frames the whole window and a banner says the net is paused until Net Control returns. The on-air timer pauses too, and both clear the instant an NCS is present again, so a net's recorded duration no longer counts time with nobody running it.

## Improvements

* **Net View: Redesigned toolbar** — The toolbar now uses the full width of the page and keeps full button labels visible whenever there is room, instead of hiding them behind More at a fixed screen size. Check In is green so newcomers spot it immediately, and the NCS toggle reads "Role: NCS" or "Role: Standard" so it is obvious which role you are in. Raise Hand is hidden while you are NCS, and stepping away as the only NCS now warns you first.

* **Nets and Schedule: Redesigned card buttons** — Every button on a net or schedule card now shows a short label beside its icon and offers a bigger target on a phone, so you can tell what each one does at a glance instead of hovering. Buttons that change something (Create, Edit, Cancel, Start, Delete) are grouped apart from the view-only buttons everyone sees, ordered so Start is easy to reach and no longer sits beside Cancel. Wide cards spread the two groups to opposite edges; narrow ones stack them.

* **Net View: Correcting a net's times moved somewhere sensible** — The unlabeled pencil tucked among the status chips is gone. You now correct a net's actual start and end times under Basic Info, on Edit Net while the net is running or on Net Info once it has closed, so a late start or a net you forgot to close can still be fixed for the official log.

* **Mobile: Less scrolling to reach the net** — The Activity Log now starts collapsed on a phone so the check-in list and chat are within reach, and it remembers that separately from your desktop setting. A busy net's status chips now wrap onto extra lines instead of forcing the whole page to scroll sideways.

* **Net View: Prior topics link back to their net** — Each entry in the prior-topics list now opens the net it came from in a new tab, so you can look through past topics without losing your place in the net you have open.

## Bug Fixes

* **Statistics: Platform statistics and the check-in map load again** — The Statistics page and its map of where stations are checking in from were both failing with an error instead of loading. Both work again.

* **Net Logs: Missing log email for quiet nets** — Closing a net that had no chat messages silently failed to email the net log and its check-in spreadsheet, so anyone subscribed got nothing at all. Those emails now send for every net, whether or not anyone used chat.

* **Net View: Staff-only controls no longer shown to everyone** — Bulk Add, Net Info, and the option to add a historical topic were visible to guests and regular participants even though only NCS, loggers, and net managers could use them. All three are now limited to staff, including when the page is opened directly by its web address. Everyone can still browse the list of prior topics.

---


# July 26, 2026

## New Features

* **Check-in: Disable self check-in per net** — Net Managers can now turn off self check-in for a schedule or net, from the schedule editor or the net's own settings. When off, only Net Control and logging staff can add check-ins, so stations aren't logged twice when they check in both by voice and by app.

## Bug Fixes

* **Schedule: Recurring nets with a rotation appear again** — Nets that use an NCS rotation now automatically show up on the dashboard about a day ahead, so the on-duty NCS always has a waiting net to open. These had been silently failing to appear.

* **Email: No more duplicate net reminders** — You now get at most one "starting soon" reminder per net, even if you are the NCS and also on staff or subscribed. The same reminder could previously arrive two or three times.

* **Check-in: No more duplicate rows for stations still checked in** — Checking in a station that already has an active check-in (whether they try it themselves, or Net Control/Logger re-adds them) no longer creates a second row. You'll see a message that the station is already checked in instead. Re-checking in still works normally once a station has checked out.

## Improvements

* **Net Settings: Clearer feature sections** — The settings in a schedule or net are now grouped as **General Net Features** (mobile priority sort, chat grace period, self check-in) above a smaller **ARES & EmComm Features** section that holds just the ICS-309 log format. Everyday options are no longer buried under an emergency-communications heading, and both the schedule editor and Create/Edit Net lay them out identically.

* **Platform: Behind-the-scenes cleanup** — We spent the last few weeks reorganizing the app's internal code so future bug fixes and feature requests can ship faster and more safely. That work is done, and regular fixes and new features resume now.

* **Net View: Redesigned toolbar** — The net toolbar now spans the full width of the page with labeled buttons instead of unlabeled icons packed into a narrow column, so you can find Search, Stats, Roles, and the rest without hovering to guess. It automatically switches to icon-only on narrower screens so nothing gets cut off.

---

# July 7, 2026

## Bug Fixes

* **Net View: Check-in map no longer crashes** — Maximizing or restoring the check-in location map could throw an error and leave the map broken. Fixed.

* **Chat: Avatars now show on new messages** — Profile pictures previously only appeared on messages that were already on the page when you loaded it. New messages sent during the net now show the sender's avatar too.

* **Net View: Check-in edits now properly restricted** — Editing a check-in is now limited to the station itself, the Net Manager, NCS, and Logger. This closes a gap that let any signed-in participant edit someone else's check-in details.

* **Net View: Logger role can manage the active frequency** — Operators assigned the Logger role could not set or clear the net's active frequency. This now works as intended.

* **Net View: Assigning NCS/Logger roles works for all Net Managers** — The role-assignment picker showed no names to choose from unless you were a site admin. Any Net Manager can now assign roles as intended.

## Improvements

* **Net View: Guests can now see poll results and topic answers** — Visitors who aren't signed in can now see poll results, topic-of-the-week responses, and properly labeled check-in fields, matching the same public view already available for check-ins and chat.

---

# July 3, 2026

## Bug Fixes

* **Net View: Guest viewer crash fixed** — Unauthenticated viewers connecting to a net no longer crash the WebSocket session for everyone in the room. The server was referencing an authenticated-only variable when broadcasting presence updates, so any guest connection triggered a backend error that severed all connected clients.

## Improvements

* **Statistics: Swipe navigation on mobile** — The Statistics page chart tabs now support left/right swipe gestures to switch between charts on phones and tablets, consistent with the Admin and Profile pages. Tabs also scroll horizontally without visible arrow buttons on narrow screens.

---

# June 30, 2026

## New Features

* **Auto-archive stale scheduled nets** — A scheduled net that was never opened (never transitioned to Lobby or Active) is automatically archived 24 hours after its scheduled start time. Nets that didn't happen no longer linger on the Active Nets dashboard.

* **Help menu** — The "Docs" nav link is replaced by a Help dropdown with four options: User Guide (opens the documentation site), Start Walkthrough, Submit Feedback, and About ECTLogger.

* **Submit Feedback** — Authenticated users can report bugs or request features directly from the Help menu. Submissions are emailed to every admin on the instance, with the submitter's callsign, name, and email included so admins can follow up. Rate-limited to 5 submissions per IP per hour.

* **Guided walkthrough** — A step-through tour covers the main app areas (Dashboard, Net View, Scheduler, Statistics, Profile, and the Help menu itself). Launches automatically for new users on their first login and can be relaunched at any time from Help.

* **About: Honorable Mentions** — The About dialog recognizes operators who shaped ECTLogger through bug reports and feature requests: AA1GM (Joel Huntress), KC1UIX (David Lounsbury), W1BKW (Brian Wall), W1MTW (Mark Carlson).

* **About ECTLogger modal** — Shows the current version, links to GitHub, documentation, and issue tracker, and open-source license credits (MIT; Jam3/nice-color-palettes attribution).

## Improvements

* **Profile: Callsign history** — Changing your primary callsign now automatically preserves the old one so your check-in history and statistics follow you. Useful when upgrading your license class, requesting a vanity callsign, or moving to a new region. Previous callsigns appear as read-only chips below the callsign field on your profile page.

---

# June 29, 2026

## Bug Fixes

* **Net View: NCS/staff status change via dropdown** — NCS and net staff members can now change their own status (Away, Checked Out, etc.) using the status dropdown in the check-in list. Previously, the dropdown triggered a role-removal call that only net owners and site admins can authorize, causing a silent failure for anyone else.

* **Net Closure Email: Topic of the Week now shown** — The closure email now includes a dedicated "Topic of the Week" section above the check-in table, showing the topic prompt. The email already listed each operator's response in the table, but the question itself was missing, leaving recipients without context.

* **NCS Reminder: 1-hour email now always includes a direct lobby link** — The 1-hour NCS duty reminder now provides a direct Open Net link that opens the lobby in one click. If the net had not yet been auto-created when the reminder fired, it is created now. Previously, if the 24-hour pre-creation window was missed, the email fell back to a View Schedule link, requiring the NCS to navigate manually.

* **Net from Schedule: Creator assigned as NCS at manual net creation** — When a staff member manually creates a net from the schedule, they are now assigned the NCS role (they are taking responsibility for running it). Previously, every rotation member was assigned the NCS role simultaneously, causing the wrong operator to appear as primary NCS and cluttering the check-in list with multiple NCS rows from the start. The automatic path (24-hour pre-creation via the reminder service) continues to assign the rotation-computed duty NCS.

---

# June 27, 2026

## Improvements

* **Net View: Low-resolution display support** — The logging panel now scales to fit on shorter screens such as 13-inch MacBooks, small Windows laptops, and iPads in landscape, so the check-in entry fields are always reachable without needing to undock the window.

---

# June 25, 2026

## Bug Fixes

* **Check-in: Self-checkout** — Checking yourself out of a net now works reliably. A hidden conflict in the backend caused a server error whenever any user tried to check themselves out; they were left stuck and had to set their status to Away as a workaround.

---

# June 24, 2026

## Bug Fixes

* **Schedule: Net Control rotation now advances each week** — The upcoming Net Control Station moves to the next operator in the rotation every time the net meets, instead of always showing the first person on the list. The schedule is anchored to the net's first meeting date, so each operator gets their correct turn and the Next NCS no longer stays stuck on one person as the dates roll forward.

* **Schedule: Date sort order** — The net schedule list now ranks nets by their true next occurrence. Recurring nets always appear before one-time events, and nets that meet earlier in the week are no longer listed after nets that meet later.

---

# June 22, 2026

## New Features

* **Admin: View as Regular User** — Admins can now temporarily simulate the regular user experience from the avatar menu (padlock icon, near the dark/light mode switch). Admin-only UI elements are hidden and an amber User View chip appears in the navbar as a reminder. Click the chip or choose Exit User View to restore full access. Useful for reproducing bug reports and guiding other operators through the app.

* **Schedule: Auto-archive previous nets on new net creation** — When a new net is created from a recurring schedule (manually or by the automatic 24-hour pre-creation), all closed nets from that schedule are archived automatically. The dashboard stays clean without requiring manual cleanup after each session. Archived nets remain fully accessible and can be unarchived at any time.

## Bug Fixes

* **Schedule: Rotation reorder now updates the schedule immediately** — After moving members up or down in the rotation order, the schedule tab refreshes on the spot instead of showing the old order until the panel was closed and reopened.

* **Schedule: Fixed rotation shift caused by swap overrides** — An active swap override on an upcoming date could shift every subsequent NCS assignment by one position, causing the wrong operator to be listed for every future net.

---

# June 21, 2026

## Branding

* **Logo: New official ECTLogger logo** — A radar ring circle with a Yagi antenna mast, station check-in dots, and a bold green checkmark replaces the FM radio emoji throughout the app, in emails, and in the browser tab favicon.

* **Active Nets: Cell tower icon** — The Active Nets page heading now uses a cell tower icon fitting for nets on the air, replacing the retired FM radio emoji.

* **Typography: Consistent page headings** — Heading weights and layouts standardized across Active Nets, Schedule, and Statistics so all three pages look visually uniform.

---

# June 20, 2026 (d)

## Bug Fixes

* **Dashboard: Scheduled net cards now show the correct Next NCS** — When a net is automatically created from a rotation schedule, the operator whose turn it is for that specific date is now correctly identified and displayed on the card. Previously the wrong name (or no name) could appear due to all rotation members being assigned simultaneously when the net was created.

---

# June 20, 2026 (c)

## New Features

* **Check-in List: Who is this?** — Click any avatar in the check-in list to see that operator's callsign, name, role in the current net, total check-ins, and the nets they attend most often.

* **Net Settings: Post-close chat grace period** — Enable a 15, 30, or 60 minute window after closing a net during which chat remains open, so participants can finish off-air conversations before it goes read-only.

* **Net View: Presence dots on avatars** — Registered users now show a green dot when online and a gray dot when offline, so you can instantly tell who has a viewable profile versus a guest check-in.

* **Net View: Clickable avatars in chat and Net Staff dialog** — Click any avatar in the chat panel or the Net Staff dialog to open that operator's profile popup.

* **Schedule: Sort by alphabetical or next scheduled date** — Two sort buttons in the header let you order the schedule list A-Z or by upcoming date (unscheduled nets fall to the bottom). Your choice is remembered between visits.

* **Active Nets: Sort by status or alphabetical** — A bolt icon sorts nets by activity (live nets first, then lobby, then upcoming scheduled nets in start-time order); A-Z sorts alphabetically. Your choice is remembered between visits.

* **Active Nets and Schedule: Filter button moved to the header** — The filter icon is now in the top-right toolbar alongside sort and view controls instead of a floating button at the bottom of the page.

---

# June 19, 2026 (e)

## New Features

* **Net View: Archive reminder after closing a net** — When you close a net, a prompt appears at the top of the screen offering to archive it right away (preserving all check-ins and statistics) or delete it permanently. A help button explains the difference between the two so you can choose confidently.

---

# June 19, 2026 (d)

## Improvements

* **Dashboard: Active nets from a starred schedule automatically sort to the top** — If you've starred a schedule, any net running from it will float to the top of the active nets list too. You can also star or unstar directly from the net card.

---

# June 19, 2026 (c)

## New Features

* **Scheduler: Star your favorite nets to keep them at the top** — Click the star icon on any net card or list row to pin it. Starred nets always appear first, no matter where they fall alphabetically.

---

# June 19, 2026 (b)

## Improvements

* **Net Statistics & PDF Report: Expand any chart or map to full screen** — Each card now has an expand icon in the corner. Click it to open that chart or map full screen for a bigger, clearer view. Press Escape or the X to go back.
* **Net Statistics & PDF Report: Check-in Activity chart shows the flow of the net** — A smooth wave chart now highlights when stations were busiest and when traffic quieted, replacing the old cumulative line.
* **Net Statistics & PDF Report: Hover the status chart to see exact counts** — Mousing over a slice shows how many stations are in that status, not just the percentage.

---

# June 19, 2026

## Improvements

* **Net Statistics: Charts now display side-by-side in a single row** — The Check-in Status, Check-in Activity, and Check-ins by Frequency cards are arranged across one row so you can compare them at a glance without scrolling.
* **Net Statistics & PDF Report: Check-in Activity chart added to the PDF report** — The activity chart that appears on the statistics page is now also included in the exported net report PDF.
* **Net Statistics & PDF Report: Check-ins by Frequency chart only appears for multi-frequency nets** — The frequency breakdown chart is now hidden for nets that use a single frequency, where it added no useful information.

---

# June 18, 2026 (b)

## New Features

* **Net View: Edit Net Script and Announcements in-place** — NCS and net staff can now click the pencil icon in the floating Net Script or Announcements window to edit the content directly during the net, with a markdown formatting toolbar. Changes save to the schedule template immediately.

## Improvements

* **Net View: Floating windows remember scroll position after minimize** — The Net Script and Announcements windows now restore to the exact position you were reading when you minimize and reopen them, so you don't lose your place mid-net.
* **Prior Topics: Redesigned with date-left layout, search, and pagination** — The topic history dialog now shows dates on the left of each row for quick scanning, includes a keyword search bar, and paginates at 25 rows per page.
* **Schedule: Template list now paginates at 25 per page** — Large schedule lists page through 25 at a time rather than rendering an unbounded scroll.
* **Admin: Contacts list now paginates at 25 per page** — The contacts tab now pages at 25 rows, consistent with the users tab.

## Bug Fixes

* **Net View: Bold and italic formatting now renders in Net Script and Announcements** — Text formatted with asterisks was showing raw markers instead of styled text due to a spacing quirk in the markdown standard; this is now corrected automatically.

---

# June 18, 2026

## Bug Fixes

* **Net Reminders: Correct timing and no duplicates** — Reminder emails now arrive about one hour before a net in its own local time, instead of several hours early, and you receive a single reminder rather than a new one every 15 minutes. Reminders for nets that use a digital talkgroup also send reliably again. Root causes: scheduled net times were compared as if they were UTC instead of the net's local timezone (firing the window hours early); the next-net time drifted by fractions of a second each run so the "already sent" check never matched (re-sending every cycle); and the email's frequency formatting referenced fields that don't exist on digital/talkgroup frequencies (raising an error before the email could send).
* **Sign In: Friendlier expired-link screen** — If a magic link has expired, the sign-in page now gives you a button to return and request a new one, and if you're already signed in on that device it simply confirms that instead of showing a verification error.
* **Schedule: Staff get 1-hour net reminders** — Everyone listed as net staff for a recurring schedule now receives a reminder email one hour before the net begins, with an Access Net button and an Open Lobby button that loads the net and opens the lobby in one click.
* **Schedule: Scheduled nets appear on the dashboard automatically** — Nets are now created on the dashboard 24 hours before their scheduled start time for all recurring schedules, not only those with an NCS rotation configured.
* **Schedule: Net staff can start and manage nets** — Users listed as staff for a schedule can now open the lobby, manage check-ins, and close nets created from that schedule, without needing to be the net owner or hold a pre-assigned NCS role.

---

# June 12, 2026

## New Features

* **Profile: Personal net history is now navigable** — Your activity summary and net list on the Activity tab are clickable. Select any summary card or net name to see the individual sessions behind it and open any net report directly.
* **Schedule: Recurring Announcements** — A new Announcements tab in the schedule editor lets NCS maintain a standing list of items to read each week (club events, upcoming trainings, etc.). During a live net, the list appears in the Announcements window as a checklist so NCS can check off each item as it's announced.

## Improvements

* **Changelog PDF: Styled layout** — The PDF now matches the What's New email design with a color-coded header and labeled sections, making it easier to read and share.
* **Mobile: Narrow-screen layout fixes** — Data tables scroll horizontally instead of overflowing, and dialogs use compact margins on small phones so forms are fully usable without zooming.
* **Archived Nets: Filter to nets you participated in** — Two checkboxes in the Archived Nets dialog let you narrow the list to nets you personally attended or ran as NCS, so you can find your own history without scrolling through everything.
* **Net Settings: Mobile station sort is now optional** — A new toggle controls whether mobile stations are promoted to the top of the check-in list. On by default; net managers who prefer strict chronological order can turn it off in net settings.

---

# June 11, 2026

## New Features

* **Maintenance Banner** — Admins can now display a sitewide warning banner from the new Maintenance tab in the Admin panel. The banner supports a custom message, dismissible or persistent mode, and an optional scheduled start/end window so it appears and clears automatically without manual intervention. The banner is served via a public API endpoint and is visible to logged-out users as well.
* **Server-side maintenance page** — A static `maintenance.html` page is included in the frontend build. Operators can activate it with `./run --maintenance on` over SSH when the app is completely down (bad deploy, DB outage). Caddy then serves the static page directly instead of proxying to the backend. An optional `--message` and `--eta` flag writes a `maintenance.json` sidecar that the page fetches and displays.
* **`run.sh` — consolidated operational script** — `start.sh` and `update.sh` are consolidated into a single `run.sh`. Bare `./run` behaves identically to the old `start.sh`; `./run --service` for systemd; `./run -u` to apply updates and exit; `./run -m on|off` to toggle server-side maintenance mode and exit. The old scripts remain in place temporarily.

## Improvements

* **Adaptive card grids** — The Nets dashboard and Schedule pages now use a CSS auto-fit grid that scales from 1 column on mobile up to 6 columns on ultrawide monitors. Cards fill available space evenly and never leave an empty gap when fewer cards are present.
* **Scrollable tabs with swipe support** — Tabs on the Admin and Profile pages now shrink and scroll horizontally on narrow viewports without visible arrow buttons, and support swipe-left/right gestures on mobile to switch between tabs.
* **Uniform FAB sizing** — All floating action buttons (Create, Filter, Archive, Merge) are now a consistent 56 px large size across every page.

---

# June 10, 2026

## Bug Fixes

* **Archived nets disappear from the Nets list immediately** — If you navigated back to the Nets list before the 5-second archive undo window expired, the net would still appear in the list until you manually refreshed the page. The list now re-fetches automatically when you return to it.
* **Profile photos from mobile phones no longer display sideways** — Portrait and landscape photos taken on phones embed an EXIF orientation tag instead of storing pixels upright. The avatar upload handler now applies that orientation correction before saving, so all photos display right-side up regardless of how the phone was held.
* **Emoji reaction toolbar no longer shifts chat message text** — Hovering over a chat message to reveal the emoji reaction buttons was injecting 100px of extra padding-right into the message row, causing the message text to reflow into a narrower column on every hover. The toolbar now overlays the message content without affecting layout.
* **Check-in list now displays in correct chronological order** — When a net is created from a schedule template, all template staff are pre-assigned NCS roles at the same timestamp. The check-in list was treating all of them as "active NCS" and promoting them to the top, pushing stations who checked in earlier (like KA1RAC) down the list. The NCS sort promotion now only applies to operators who were already checked in before the first non-NCS station joined, which is the correct definition of "running NCS." Operators who happen to have an NCS role but checked in later appear in natural chronological order.
* **Archive and delete now work for net managers and co-managers** — Net managers and co-managers of the schedule a net was created from can now archive, unarchive, and delete nets they manage. Previously only the direct net owner or a site admin could perform these actions, causing a silent 403 for managers like Joel (AA1GM) trying to archive his own nets.
* **Sessions no longer wiped during backend restarts** — The app previously logged users out any time the backend was briefly unavailable (e.g., during a deploy). The client now only clears a session on a deliberate 401 Unauthorized response; transient network errors and 5xx responses leave the stored token untouched so users remain signed in after a deploy.
* **Chat photos now show as "[Photo]" in Net Report and PDF exports** — Chat messages containing pasted images were rendering the raw internal `__CHAT_IMAGE__{...}` JSON payload as plain text in the on-screen Net Report page and the exported PDF. They now display as `[Photo]`.

## Improvements

* **Toolbar reorganized into Net Info and Net Actions rows** — The toolbar on the Net View page is now split into two logical rows: **Row 1 (Net Info)** contains read-only browsing tools (bulk check-in shortcut, search, map, stats, script, announcements, topic history, info URL, net info link) and **Row 2 (Net Actions)** contains all write/management controls (start, edit, roles, check-in, go live, close, import, export, PDF, archive, delete). Previously, action buttons mixed into Row 1 caused the toolbar to overflow into a third row on active nets with many features enabled — for example, the Import button would end up isolated on its own line.
* **Sessions persist for 30 days with automatic rolling refresh** — Access tokens were previously set to a 24-hour lifetime, forcing weekly net operators to re-authenticate before each session. Tokens are now issued with a 30-day lifetime. Additionally, any token with fewer than 7 days remaining is silently refreshed on the next authenticated request, so active users never need to re-login.
* **Emoji reaction controls hidden on closed/archived nets** — The hover emoji toolbar no longer appears on closed or archived nets. Existing reaction counts remain visible for historical reference but are no longer interactive.
* **Activity Log collapsed by default** — The Activity Log panel now loads minimized on every page visit, keeping more screen space available for the check-in list and chat — particularly useful on mobile. Clicking the expand button opens it as before, and the choice persists for the rest of the session.
* **Net and schedule card polish** — Long descriptions on net and schedule cards are now truncated to three lines with an inline "Show more" link to read the rest.
* **Paginated lists** — The Archived Nets dialog and the Admin users table now show 25 rows per page, with 50 or All options. Filters, searches, and column sorts all reset to page 1 automatically. The Admin users list also now arrives sorted most-recently-active first.

## New Features

* **Avatar menu in the nav bar** — The callsign text in the nav bar has been replaced with your avatar. Clicking it opens a menu with Profile, Personal Stats, Admin (if applicable), Dark/Light mode toggle, and Logout — consolidating controls that were previously scattered across the top bar. On mobile, the same items appear at the bottom of the slide-out drawer.
* **In-browser crop and zoom for profile photos** — After selecting a photo, a dialog lets you drag to position and scroll or pinch to zoom before uploading. Only the cropped square is sent to the server, so portrait, landscape, and oddly-framed photos always produce a clean avatar.
* **Session settings configurable in Admin panel** — Admins can now set session lifetime and toggle rolling renewal in Admin → Security → Session Settings, without editing server config files.
* **NCS check-in prompt now offers a role choice** — NCS operators who haven't yet checked in now see two buttons in the check-in prompt: "Check In as NCS" and "Check In as Participant". Both open the standard check-in dialog. Previously, clicking "Check In" scrolled down to the inline NCS entry form, which was confusing for operators who just wanted to observe before joining.
* **NCS role toggle in toolbar** — NCS operators can now step down to participant (or back up to NCS) using the crown icon in the toolbar. Stepping down removes the NCS badge and management controls for that session without losing the permanent role assignment. Stepping back up restores full NCS status. The button only appears for operators with an NCS assignment who are checked in. The last active NCS on an active net cannot step down.

---

# June 9, 2026

## Bug Fixes

* **NCS and subscriber reminders firing early and repeating every 15 minutes** — Fixed a critical bug causing reminders to fire several hours before nets and repeat every 15 minutes by queuing 4+ duplicate emails. Root causes: (1) timezone mismatch — code was using server local time instead of UTC to calculate hours-until, causing early fires on servers outside the net timezone; (2) broken deduplication — reminder log was storing only the date instead of full datetime, so every net on the same date was treated as a duplicate, but the ±30-minute window re-triggered every 15 minutes anyway. Fixed by using UTC consistently and storing the full scheduled datetime for proper deduplication.

---

# June 5, 2026

## Bug Fixes

* **NCS and subscriber reminder delivery restored** — Fixed a reminder-log field mismatch (`net_date` vs `scheduled_date`) in the reminder service that prevented reminder sends from being logged and correctly deduplicated. This restores reliable 24-hour and 1-hour reminder processing.
* **Strafford County weekly net rotation backfill** — Added one-time migration `029_add_aa1gm_back_to_template8_rotation.py` to restore AA1GM to template 8's rotation after an unintended gap. The existing cycle order is preserved and AA1GM is appended to the end.
* **Manager auto-inclusion restored for rotation build** — Fixed a regression in the schedule editor so **Build rotation from staff** always includes the schedule manager when missing, restoring the behavior documented in the 2026-05-20 release notes.

## Improvements

* **Subscriber visibility for managers** — Admins, schedule managers, and co-managers can now view the schedule subscriber list directly in the Net Staff tab, including callsign, name, and email for users who subscribed via the bell or reminder prompt.
* **Tabbed Net Staff modal** — The Net Staff dialog opened from the purple people icon is now organized into dedicated tabs: **Net Control Stations**, **Rotation Order**, **Schedule**, and **Subscribers**.
* **Role-gated email actions in Net Staff modal** — Added **Email Staff**, **Email Subscribers**, and **Email ALL** actions for admins, net managers, and co-managers/co-owners to quickly notify the right groups about cancellations, schedule changes, and net topics.

## Notes

* The migration above backfills template 8 only; it does not change global manager/owner auto-inclusion behavior for all schedules.

## UX Improvements

* **Step away feature** — Users can now click the pause icon (⏸️) to temporarily step away without checking out. Useful when you know you're next but have an emergent need (bathroom, etc.). The button appears in both the toolbar for your own check-in and in the Actions column. Click again to return.

---

# June 4, 2026

## Bug Fixes

* **Gravatar fallback shows name initial** — When a Gravatar image fails to load (404), the avatar badge now displays the first character of the user's name instead of their callsign, maintaining consistency with non-Gravatar users.
* **Server-side Gravatar validation** — The backend now validates Gravatar existence before sending URLs to the frontend, eliminating 404 errors in the client console.

## Improvements

* **Better avatar color distribution** — Expanded avatar color palette from 12 to 24 colors and improved seeding by combining callsign + name, significantly reducing color collisions among users.
* **Auto-select frequency for single-frequency nets** — When a net has only one frequency configured, that frequency is automatically selected as active and assigned to check-ins. This simplifies the UI (no dropdown needed) and ensures check-ins are organized by frequency from the start, even before additional frequencies are added.

---

# June 2, 2026 (c)

## New Features

* **CSV check-in import for closed/archived nets** — Added an Import CSV workflow next to export actions so net managers can merge logs from paper or external tools after a net closes. Includes drag-and-drop upload, an exportable import template, and row-numbered validation errors in the dialog.
* **Co-Manager controls in staff rows** — Owners/admins can now promote or demote authorized staff as **Co-Managers** directly from each row using a star icon. Co-Managers are clearly labeled and share owner-level schedule responsibility for owner-gated actions (such as ownership transfer, linking nets, merge, and delete), providing true backup coverage.
* **Hover reactions in chat** — Chat now supports per-message reactions (👍 🙂 🙁 ❤️ ✅) with live counts synchronized across connected clients.
* **Paste-to-chat images** — Users can paste PNG/JPEG/WEBP images directly into chat; uploads are resized, thumbnailed, rendered inline, and viewable in a full-image lightbox.
* **Status-at-entry for check-ins** — NCS quick-entry now supports choosing station status at creation time on both desktop and mobile forms.

## Improvements

* **Import time parsing and timezone controls** — CSV import now accepts simple date/time formats used by operators (for example `6/3/2026 2:24 PM`, `3/6/2026 14:24`, `2:24 PM`, `14:24`) and supports both US and British slash-date ordering.
* **UTC checkbox + timezone selector on import** — Import dialog now includes a UTC toggle and timezone dropdown for national nets spanning multiple time zones. Explicit timezone markers in CSV values (`Z`, `UTC`, `GMT`, `+/-HH:MM`) are honored automatically.
* **Import window safety checks** — Imported timestamps are validated against net open/lobby time through net close + 10 minutes. Out-of-window rows are skipped with clear row-numbered reasons.
* **Away and Mobile visibility improvements** — Away rows now use a distinct yellow highlight, and Mobile stations are prioritized near the top of the check-in list (after NCS).
* **Contextual create/edit labels** — Ad-hoc/one-time flows now show **Create Net / Edit Net** labels where appropriate instead of always saying Schedule.
* **Clearer schedule action wording** — The Net Staff action label now reads **Create schedule** instead of **Push staff to schedule**.

## Bug Fixes (highest impact first)

* **Check-in Map PDF white-page fix** — Exporting a Check-in Map PDF from the floating map window no longer produces a blank white page. The exporter now captures the live map element so Leaflet tiles and overlays render correctly.
* **Emoji-safe What's New PDFs** — What's New / Changelog PDF exports now preserve emoji reactions (for example 👍 🙂 ❤️ ✅) using inline emoji rendering instead of broken glyph fallback.
* **Mixed text + emoji wrapping improvements** — Changelog PDF line wrapping now handles mixed text-and-emoji lines more reliably, reducing malformed spacing and symbol corruption in exported files.
* **Map PDF blank export fix** — Tile layers now use export-safe CORS settings, preventing blank map captures in PDF exports.
* **1-hour reminder delivery restored** — Fixed a variable-name bug that prevented 1-hour subscriber reminder emails from sending.
* **Early access bypass corrected** — The schedule early-access override now properly bypasses both minimum account age and net-participation requirements.
* **Net Staff modal refresh after manager transfer** — The staff list and add-staff dropdown now refresh immediately after ownership transfer, so users no longer see stale eligibility from the prior manager.
* **Live location control in Profile** — Users can now see and clear current GPS-derived live location from Profile, preventing stale live location from overriding intended profile location during check-ins.

# April 28, 2026

## Net Manager and NCS shown separately

* **Net cards (Active Nets)** now display **Net Manager** (the owner of the net record) and **NCS** (whoever is currently assigned via NetRole) on separate lines. Previously the owner was labeled "NCS", which was misleading whenever the manager and the operator on the air were different people.
* **Schedule cards (Scheduler)** always show **Net Manager**, with **Next NCS** appearing as an additional line when an NCS rotation is configured. The two are no longer mutually exclusive.
* When the manager and NCS are the same person, the duplicate line is suppressed.

## Net owners can delete their own nets

* **Owners can now delete a net in any state** — draft, scheduled, active, or closed. Previously the trash icon only appeared on draft/scheduled nets, and closed-net deletion was locked to admins. Useful for net managers cleaning up training/practice runs.
* **Stronger confirmation dialog** spells out exactly what gets destroyed (check-ins, chat messages, reports) and warns that deletion is permanent.
* **Color-coded buttons**: blue **Cancel**, yellow **Archive Instead** (only for closed nets) or yellow **Close & Archive** (only for active/lobby nets), red **Delete Permanently**. Archive paths are presented as the safer alternative whenever they apply.
* **Close & Archive** runs the existing close endpoint (which emails the complete log to the owner) and then immediately archives the net, so managers who want to preserve the record of a started test/training net can do it in one click.
* **Backend** — the delete-net endpoint already permitted the owner; only the frontend gate has been relaxed. Permission is still owner / admin / NCS via `can_manage`.

---

# April 25, 2026 (b)

## Save edits back to the schedule

* **"Save for this Net" + "Save to Schedule" buttons** — The Edit Net page now has two save buttons. **Save for this Net** persists changes only to the current net (unchanged behavior, just renamed from "Save Changes"). **Save to Schedule** pushes the net's editable fields back to the parent schedule so future nets opened from that schedule inherit them. A confirmation dialog lists exactly what will be overwritten.
* **Push staff to schedule** — The Net Staff dialog opened from a scheduled net now has a **Push staff to schedule** button that copies the net's NCS operators into the schedule's authorized staff list. Operators already on the schedule are skipped, so it's safe to repeat.
* **Schedules now carry stream URL and announcements** — `stream_url` and `announcements` were previously net-only fields. They've been added to the schedule (template) model so values entered there propagate to nets opened from the schedule, and so the new "Save to Schedule" action can promote them. Migration: `018_add_template_stream_announcements.py`.
* **Schedule fields actually copy when opening a net** — Fixed a long-standing gap where `info_url`, `script`, `stream_url`, and `announcements` on a schedule were ignored when opening a net from it. Newly opened nets now inherit those values.
* **Permission model unchanged** — Both new actions check the same backend permissions used everywhere else for editing a schedule (owner, admin, active staff, or active NCS rotation member). The buttons surface a clear error toast on permission failure rather than silently failing.

---

# April 25, 2026

## Net Staff & NCS Rotation

* **Bugfix — non-admin managers can now add staff** — Schedule managers (and net owners) who aren't global admins were silently unable to add operators because the user picker called the admin-only `GET /users` endpoint. A new `GET /users/directory` endpoint returns minimal `{id, callsign, name}` for any authenticated caller and is now used by every staff/rotation picker. Admin-only `GET /users` (which exposes email, role, and notification preferences) is unchanged.
* **Two-step Net Staff workflow restored** — The schedule editor's "Net Staff" tab is now structured as **Schedule Manager → Authorized Net Staff → NCS Rotation (optional)**. Adding staff is the primary action; the rotation is a secondary, optional ordering. A "Build rotation from staff" button populates the rotation in one click instead of forcing the user to re-add every operator manually.
* **Net Staff popup mirrors the editor** — The popup's three tabs (Staff / Manage Staff / Manage Rotation) have been consolidated into a single scrollable "Manage" view for schedule context, matching the editor layout. The read-only "Staff" tab remains for users without management permission.
* **Empty-picker feedback** — Operator pickers now display "No other users available" / "Loading users…" instead of silently showing an empty dropdown, so the failure mode that bit us before can't recur.

## Privacy

* **Guest visibility for net managers and NCS** — Unauthenticated viewers can still see who is the Net Manager and who is currently NCS, but the response now only includes callsign and first name. Surnames, email addresses, and notification preferences are stripped on the public `GET /nets`, `GET /nets/{id}`, `GET /nets/{id}/roles`, and `GET /templates` endpoints when the caller isn't logged in.

---

# April 24, 2026 (c)

## Changelog Downloads & What's New Email Digest

* **PDF download buttons** — The What's New dialog now has two download icons in its action bar: a single-page icon downloads just the latest version's changelog as a PDF, and an open-book icon downloads the entire changelog history. Output is text-native (selectable, small file size).
* **What's New email digest** — Optional opt-in (off by default) that emails subscribed users a single 8 AM digest the morning after each release, summarising every changelog entry from the previous calendar day. Silent on days with no updates so it never spams.
* **Sparkling Subscribe button** — A subscribe/unsubscribe toggle appears in the What's New dialog (right next to "Got it!") so users can opt in to the digest without leaving the modal. Hidden when not signed in.
* **Per-user timezone** — Digests fire at 8 AM in the user's local timezone (auto-captured from the browser the first time they subscribe). Falls back to America/Los_Angeles (PST/PDT) if the timezone isn't set, so we don't wake anyone up early.
* **One-click per-list unsubscribe** — Every What's New email includes a `?list=whats_new` unsubscribe link that opts the user out of just the digest, leaving net-start / net-close / reminder preferences alone. Master unsubscribe still works for everything.
* **Single source of truth** — The changelog data has moved from `frontend/src/components/ChangelogNotification.tsx` to `frontend/src/changelog.json`, which is imported by both the React dialog and the new backend `whats_new_service.py` so the in-app and email content can never drift apart.
* **Migration 017** — Adds `users.notify_whats_new` (Boolean, default false) and `users.timezone` (String) columns. Run `python3 backend/migrations/017_add_whats_new_subscription.py` on each environment.

---

# April 24, 2026 (b)

## Schedule Editor & Staff Modal Cleanup

* **Manager selector moved to Net Staff tab** — On the Edit Schedule page, the "Owner / Default NCS" selector has been relocated from the Basic Info tab to the Net Staff tab and renamed "Schedule Manager". This keeps the Manager (owner) visible alongside the NCS rotation in one place, eliminating the confusion of "why isn't the Manager in the NCS list?"
* **Inline manager transfer in the Staff modal** — The Net Staff modal accessed from a schedule card now exposes a pencil icon next to the Manager. The current Manager or an admin can click it to transfer ownership without leaving the modal. Backend permission checks (`templateApi.update` with `owner_id`) prevent staff/rotation members from transferring ownership.

---

# April 24, 2026

## Net Manager Terminology

* **"Host" renamed to "Manager"** — The schedule owner is now labeled as the "Manager" everywhere in the UI (Scheduler list, Scheduler card, Create Net page, Staff Modal). This matches the standard ham-radio "Net Manager" role: the operator ultimately responsible for a net series.
* **Manager is implicitly an authorized NCS** — The Manager (schedule owner) is always shown at the top of the "Authorized Net Control Stations" list with a Manager chip and never needs to be added as a separate staff member to start or run nets.

## Bug Fixes

* **Staff and rotation members can manage staff** — The "Manage Staff" and "Manage Rotation" tabs were hidden for everyone except the Manager and admins. Active staff members and active NCS rotation members can now also manage the staff list and rotation, matching the documented intent that staff members can run and curate the schedule.
* **Permission consistency between routers** — `routers/ncs_rotation.check_template_permission` previously rejected active staff members even though `routers/templates.check_template_permission` accepted them. The two helpers now allow the same set of users (admin, owner, active staff, active rotation member). This was the root cause behind the SKYWARN GYX schedule manager being unable to assign other NCS operators after a schedule merge.

---

# April 22, 2026

## Mobile & Status Selector Improvements

* **Status dropdown labels** — Each option in the check-in status dropdown now shows a text label next to the emoji (e.g., `👂 Listening only`, `📢 Announcements`, `🚨 Has traffic`). Closed selects still display only the icon to keep the table compact. Addresses confusion where new NCS users picked the wrong icon (e.g., bullhorn for "just listening").
* **Mobile net header compaction**:
  * Duration chip drops the "Duration:" prefix; the clock icon is sufficient.
  * The edit-times pencil button next to the status chip is hidden on mobile (still available on desktop and from the net info page).
  * Toolbar action buttons now shrink in padding/min-width on mobile so the full row of icons (Start/Check-in/Close + exports + admin actions) fits without wrapping.
* **Collapsible mobile check-in form** — The "New Check-in" form on the mobile net view is collapsed by default with a tappable header. NCS/Loggers attending another operator's net no longer have a tall form pushing the check-in list off-screen.

---

# April 21, 2026 (c)

## Schedule Statistics Tweaks

* **Default time window is now 1 year** — Monthly nets and occasional SKYWARN activations were showing zeros under the old 30-day default. The 30 / 90 / year / all-time toggle is unchanged; only the default selection moved.
* **PDF export includes all leaderboards** — The static PDF report now contains all four leaderboards (Check-ins, NCS, Logger, Relay) stacked sequentially, since tab clicks aren't possible in a PDF. The on-screen tabbed view is unchanged.

---

# April 21, 2026 (b)

## Schedule Statistics Overhaul

* **Time-window filters** — Schedule statistics page now supports 30 days / 90 days / 1 year / all-time filters, defaulting to last 30 days. Applies to summary cards, leaderboards, and the history log.
* **Leaderboards** — New tabbed leaderboards on schedule stats:
  * **Check-ins** — Top 20 callsigns by net appearances (replaces the previous "Regular Operators 50%+" view, which was empty for long-running nets).
  * **NCS** — Top operators by number of nets they ran as NCS.
  * **Logger** — Top operators by number of nets they logged.
  * **Relay** — Top callsigns by distinct nets where they relayed at least one check-in (derived from `CheckIn.relayed_by`).
* **NCS column in Net History** — The history log now shows the NCS callsign(s) for each net instance.
* **Export to PDF** — One-click PDF export of the schedule performance report.

## Improvements

* **Uniform schedule card heights** — Cards on the Scheduler page now stretch to equal height within a row and have a minimum height, giving the layout a more professional appearance when content lengths vary.

## API

* `GET /statistics/templates/{template_id}` — Now accepts `?days=30|90|365|0` (0 = all-time, default 30). Response adds `filter_days`, `check_in_leaderboard`, `ncs_leaderboard`, `logger_leaderboard`, `relay_leaderboard`, and per-instance `name`, `closed_at`, `ncs_callsigns`. The legacy `regular_operators` field is preserved (but will often be empty for long-running nets).

---

# April 21, 2026

## Bug Fixes

* **Schedule merge no longer detaches nets** — Merging schedules now correctly preserves every child net's link to the surviving schedule. Previously, when SQLAlchemy flushed the deletion of source schedules in the same transaction as the FK reassignment, the dependency processor's "nullify orphaned children" pass could clobber the just-updated `template_id` values on moved nets, causing those nets (and all their check-ins) to silently disappear from the merged schedule's statistics. Fixed by explicitly flushing all FK reparentings before the source-schedule deletions run.

## New Features

* **Link Existing Net to Schedule** — From the schedule statistics page (`/statistics/schedules/:id`), schedule owners and admins can now click "Link Existing Net" to attach an ad-hoc net (or a net created under the wrong schedule) to this schedule. Useful when an NCS starts a one-off net and later realizes it should be counted toward a recurring schedule's history.

## API

* `PUT /nets/{net_id}/template` — Attach (or detach with `template_id: null`) a net to a schedule. Requires the caller to be the net's owner or admin, and when attaching, also the schedule's owner or admin.
* `GET /templates/{template_id}/linkable-nets` — List nets the current user could attach to a given schedule (their own nets, or all nets if admin, excluding ones already attached).

---

# March 21, 2026

## New Features

* **Merge Schedules** — Combine multiple net schedules into a single master schedule. All child nets, subscribers, staff, NCS rotation members, topic history, and schedule overrides are moved to the master. Source schedules are permanently deleted. Accessible via the merge (⑂) button on the Scheduler page. Only admins and schedule owners can merge.

---

# March 20, 2026

## New Features

* **Auto-start nets at scheduled time** — Nets in lobby mode now automatically go live when the scheduled start time arrives. Any NCS/admin viewing the net triggers the transition. The manual Start button remains available for starting early.
* **Edit net start/end times** — NCS operators and admins can now adjust the actual start and end timestamps of active, closed, or archived nets. Click the edit (pencil) icon next to the status chip to open the time editor.
* **Check-in prompt notification** — Authenticated users viewing an active or lobby net they haven't checked into now receive a friendly notification with a one-click "Check In" button. Appears 2 seconds after page load and auto-dismisses after 15 seconds.
* **Clickable net titles on Dashboard** — Net names in the card view are now clickable links that navigate directly to the net view page.

## Bug Fixes

* **Check-ins chip count** — The check-ins count now shows total participants who checked into the net, including those who later checked out. Checked-out stations are shown separately as a "Checked Out" chip. Previously, checked-out stations were subtracted from the total.
* **Guest count accuracy** — The "Guests" chip now counts actual unauthenticated WebSocket viewers instead of checked-in stations without online presence. This fixes inflated guest counts caused by users who navigated away from the page.
* **Net close/report email fix** — Fixed an issue where the net close email with the log/report was not sent due to `field_config` being passed as a JSON string instead of a parsed dictionary. Added traceback logging for future email failures.
* **Go Live toast notification fix** — The "Net is now LIVE" confirmation toast now displays correctly (was referencing non-existent state variables).

## Documentation

* **README.md** — Added Secondary NCS to the Net Roles table.
* **USER-GUIDE.md** — Fixed the "Checking In" section to show the correct order: click Check In first, then fill the form.

---

# March 12, 2026

## Improvements

* **Smaller PDF exports** — Net Report PDF exports now render text, tables, and statistics natively instead of converting the entire page to images. Only maps are captured as compressed JPEG images. Typical file size reduced from ~24 MB to under 1 MB, making reports easy to email.
* **Net date in PDF filename** — PDF filenames now include the net's start date and time (e.g., `ARES_Net_Report_2026-03-12_1930.pdf`) instead of the date the export was generated.

---

# February 26, 2026

## New Features

* **Check-In Map on Statistics page** — The global Statistics page now includes an interactive map at the bottom showing the approximate geographic distribution of check-ins. Locations are aggregated to 4-character Maidenhead grid squares (~100 km resolution) or US state / Canadian province centroids, so individual operator positions are never revealed.
* **Contacts & Auto-fill** — A new Contacts system auto-populates station information from check-in history. When an NCS or Logger enters a callsign, name, location, and SKYWARN number are auto-filled from the user's account (if registered) or from the contacts directory (built from prior check-ins). All auto-filled fields remain editable for each check-in.
* **Admin Contacts Tab** — A new "Contacts" tab on the Admin page provides a rolodex-style directory of all known stations. Admins can fix misspelled names from rushed check-ins, add email addresses, send invites to create user accounts, and add admin-only notes.
* **Contact Invites** — Admins can add an email to any contact and send an invite. This creates a user account and sends a magic link email. When the contact signs in, their check-in history and statistics are linked to their new account.

---

# February 23, 2026

## Bug Fixes

* **Logger role now works correctly** — Loggers can now change check-in statuses and use the check-in entry form at the bottom of the net page. Previously, a case-sensitivity mismatch in the frontend permission check (`'Logger'` vs the stored value `'LOGGER'`) caused all logger-gated UI controls to be hidden, requiring net staff to promote loggers to NCS as a workaround.

---

# February 20, 2026

## New Features

* **Dual-map view in PDF Report** — When check-ins are geographically clustered with a few distant outliers, the Net Report PDF now automatically shows two maps side-by-side: a zoomed cluster detail view and a full geographic overview. Single-map layout is used when all stations are in a similar area.
* **Check-in location map on Net Statistics page** — The statistics page now fetches and displays a map of all check-in locations for the net, filling the empty grid space next to the status breakdown chart.

## Bug Fixes

* **Check-in now works in LOBBY mode** — Stations can check in as soon as the NCS opens the lobby before the official scheduled start time. Previously, the backend rejected check-ins with a 400 error until the net transitioned to full ACTIVE state.
* **Check-in errors show as in-app toasts** — Error messages (e.g., validation failures) are now displayed as Snackbar notifications instead of native browser `alert()` pop-ups. The actual server error detail is shown when available.
* **Map zoom no longer resets** — The check-in map no longer snaps back to "show all stations" zoom each time the check-in list updates. Your zoom level and pan position are preserved after the initial auto-fit when the map first loads.

---

# January 25, 2026

## New Features

* **Per-user Chat System Messages Toggle** - Users can now hide or show system (activity) messages in the chat using a toolbar icon located to the left of the pop-out button; the preference is saved to the user's profile and persists across sessions.
* **Announcements / General Traffic** - Nets now have a dedicated "Announcements" field separate from the net script. This provides a running list of upcoming events, club announcements, and general traffic items for NCS to reference during the net. Visible to all users via a megaphone icon button in the net toolbar. Supports Markdown formatting and can be opened in a floating window or new tab. Can be edited when creating or editing a net (new "Announcements" tab in net configuration).
* **Prior Topics Log** - Track previously used "Topic of the Week" prompts to avoid repetition. When a net closes with a topic enabled, the topic is automatically logged to history. A history icon button appears in the net toolbar (for nets created from templates) to view all past topics with dates. Helps NCS staff rotate topics and avoid reusing recent ones.
* **Audio Stream URL** - Nets can now include a direct audio stream URL (Shoutcast, Broadcastify, etc.). A speaker icon appears in the net toolbar for easy listening. Works for both authenticated users and guests.
* **Unarchive from Archived List** - Added unarchive button directly to the Archived Nets dialog on the Dashboard (no need to open the net first)
* **In-App Changelog** - New floating info button shows recent changes with unread indicator
* **Consistent Action Button Colors** - All action buttons throughout the UI now use consistent colors: blue for view/search, purple for people/staff, orange for statistics, green for exports/downloads, teal for ICS-309 forms, and red for delete/close. This makes it easier to quickly identify the button you're looking for.

## Bug Fixes & Improvements

* **Net staff members can now create and start nets** (not just rotation members)
* **WebSocket connections now auto-reconnect** if disconnected unexpectedly
* **Users can now check out their own check-in** (previously only NCS/Logger could)
* **Role assignments are now logged in chat** (NCS, Logger, Relay)
* **Improved map PDF export reliability**
* **Net closure now immediately updates all connected clients**
* **Fixed dead WebSocket connections being kept in memory**

---

# December 19, 2025

## New Features

* **Email Unsubscribe Compliance** - All notification emails now include:
  - One-click unsubscribe link in the email footer
  - `List-Unsubscribe` header for email client "unsubscribe" buttons
  - `List-Unsubscribe-Post` header for RFC 8058 one-click compliance
  - Links to manage notification preferences in profile settings
  - Dedicated `/unsubscribe` page that processes tokens and allows re-subscribing
* **Subscription Prompt After Check-in** - When a scheduled net closes, users who checked in are prompted to subscribe to receive notifications for future instances of that net (if not already subscribed)

## Improvements

* **Admin Users List - Three-Tier Online Status** - Presence indicator now shows:
  - Green dot: Online (active within 5 minutes)
  - Yellow dot: Away (5-15 minutes inactive)
  - Red dot: Offline (15+ minutes inactive)
* **Admin Users List - Column Reorder** - Columns now ordered: Name, Callsign, Email (moved Email after Callsign)
* **Admin Users List - Default Sort** - Default sort is now by online status (online users first), then alphabetically by name
* **Admin Users List - Sortable Online Column** - Click the status column header to sort by online/away/offline status

## Bug Fixes

* **Admin Users Timestamp Fix** - Fixed "Last Active" and "Created" timestamps showing incorrectly (2-5 hours off) by properly parsing UTC timestamps from backend
* **Admin Users Timezone Preference** - Timestamps now respect the admin's UTC/local time preference from their profile settings
* **PDF Export - Light Mode** - PDF reports now force light mode styling regardless of current theme, saving printer ink/toner
* **PDF Export - Page Break Fix** - Fixed content duplicating/repeating at page breaks by using proper canvas slicing

---

# December 18, 2025

## New Features

* **Lobby Mode** - NCS can start a net before the scheduled time, entering "Lobby" status where check-ins and chat are enabled but a countdown shows until the official start time. Click "Go Live" to transition to active status.
* **Email Subscribers** - NCS can send custom emails to all subscribers of a scheduled/draft net (e.g., to announce cancellations)
* **Cancel Net Instance** - Delete button added to draft/scheduled nets on the Dashboard to cancel a specific net instance without affecting the recurring schedule
* **Net Script Button** - Added script viewer button (article icon) to the net toolbar between map and edit buttons
* **Unarchive Nets** - Archived nets can now be unarchived (restored to closed status) via the unarchive button in the net toolbar
* **Net Report (PDF)** - Comprehensive multi-page PDF report for closed/archived nets including:
  - ECTLogger branded header with site URL
  - Net info (name, description, frequencies, NCS operators, duration)
  - Statistics summary with charts (status breakdown, check-ins by frequency)
  - Complete check-in log table
  - Chat log (user messages only)
  - ICS-309 Communications Log section (if enabled)
  - Each section on its own page for easy printing
* **PDF Export for Statistics** - Added PDF export buttons to:
  - Platform-wide Statistics page (landscape)
  - Per-net Statistics page (portrait)
  - User Profile Activity tab (landscape)
  - Check-in Map (landscape)

## Improvements

* **Ctrl+Enter Shortcuts** - Speed Entry (bulk check-in), Dashboard email, and Admin email dialogs now submit with Ctrl+Enter
* **Net Creation Permissions** - Only admins, template owners, or designated NCS staff can create nets from schedules (prevents unauthorized users from starting nets)
* **Delete Button Style** - Changed DELETE button in NetView to icon-only with tooltip, matching other toolbar buttons
* **Speed Entry Simplification** - Removed preview chips from bulk check-in dialog; count now shows inline near submit button
* **Archive with Undo** - Archiving a net now shows a toast with UNDO button for 5 seconds before the archive is finalized
* **Download Logs from Archived Nets** - CSV and ICS-309 download buttons are now available when viewing archived nets
* **Frequency Chips View-Only on Closed/Archived** - Frequency chips no longer attempt to set active frequency or claim frequencies on closed/archived nets (Ctrl+click filtering still works)
* **Session Timeout Extended** - Production session timeout increased from 30 minutes to 24 hours to prevent mid-net logouts
* **Stats Button in NetView** - Added statistics button to net toolbar for quick access to net statistics
* **PDF Button on Dashboard** - Added PDF report button to closed/archived nets on Dashboard (both list and card views)
* **Top Operators Tie-Breaking** - When operators have the same number of check-ins, the one who checked in first gets the higher medal ranking

## Bug Fixes

* **Bulk Check-In Notes Field** - Fixed notes not being populated when using Speed Entry (was using hardcoded field positions instead of dynamic enabled fields)
* **Mobile/Announcements Status Crash** - Fixed page going blank when setting status to "Mobile" or "Announcements" (added missing enum values to backend)
* **Pie Chart Labels in PDF** - Fixed pie chart labels overlapping in PDF exports by using external labels with colored text

---

# December 8, 2025

## New Features

* **Topic of the Week** - Ask participants a discussion question during check-in; responses appear in the check-in list and emailed net log
* **Participant Poll** - Run quick polls with up to 5 predefined options; results include bar chart with percentages in the emailed net log
* **Poll/Topic System Messages** - Chat now shows system messages when participants submit poll or topic answers
* **Dialog Enter Key Support** - Close Net, Topic & Poll, Frequencies, and Check-In dialogs now submit when pressing Enter
* **Countdown Timer** - Nets with a scheduled start time display a countdown timer (e.g., "Starts in 2h 15m 30s")
* **Duration Timer** - Active nets display elapsed time since the net started (e.g., "Duration: 1:23:45")
* **Scheduled Start Time** - Set a scheduled start time when creating a net for countdown display
* **Inline Check-In Editing** - NCS and Loggers can now click any row in the check-in list to edit fields directly inline, eliminating the separate edit dialog

## Improvements

* **Toast Notification Duration** - Increased from 3 seconds to 6 seconds for better readability
* **Email Net Log Enhancements** - Now includes poll results bar chart, topic/poll columns respect field configuration, chat log includes poll question and results summary
* **CSV Export** - Includes Topic Response and Poll Response columns when those fields are configured
* **Reverse Proxy Auto-Detection** - `configure.sh` now auto-detects Caddy or Nginx and sets `SKIP_VITE` appropriately
* **Production Frontend Serving** - `SKIP_VITE=true` setting allows Caddy/Nginx to serve static frontend files instead of Vite dev server
* **Inline Edit Discoverability** - Legend now shows "💡 Click row to edit" hint for NCS/Loggers on active nets

## Bug Fixes

* **Poll Column Not Appearing** - Fixed poll/topic columns missing from all three check-in table views (desktop, mobile, detached)
* **Poll/Topic Not Saving** - Fixed backend not saving topic_response and poll_response on check-in creation and rechecks
* **Poll Autocomplete Premature Submit** - Fixed Enter key in poll dropdown causing form submission before selection was complete
* **Beta Server Frontend Not Loading** - Fixed start.sh assuming all service mode deployments have Caddy; now uses SKIP_VITE env var
* **Timer Showing Negative Values** - Fixed countdown/duration timers showing negative values due to UTC timezone parsing issue

---

# December 7, 2025

## New Features

* **Multi-NCS Frequency Management** - Multiple NCS operators can now each claim and monitor different frequencies within the same net
* **NCS Color Coding** - Each NCS operator is assigned a unique color (orange, blue, green, purple, teal) that is used throughout the interface:
  - NCS rows in check-in list are highlighted with their assigned color
  - Frequency chips in the header show NCS colors when claimed
  - Check-in frequency chips match the color of the NCS monitoring that frequency
  - Current user's claimed frequency has a glowing highlight effect
* **Crown Icons for NCS Hierarchy** - Primary NCS (net owner) displays 👑 crown icon, secondary/additional NCS operators display 🤴 prince crown
* **NCS Frequency Claiming** - NCS operators can click a frequency chip to claim it as their monitored frequency
* **Start Net Button** - Added green play button icon with pulse animation to start nets from the Dashboard and NetView pages
* **WebSocket Broadcast for Check-in Deletion** - Deleted check-ins now instantly disappear from all connected clients

## Bug Fixes

* **Check-in Frequency Assignment** - Fixed NCS's claimed frequency not being assigned to new check-ins (case sensitivity: "NCS" vs "ncs")
* **Available Frequencies Population** - Check-ins now properly include the frequency in `available_frequency_ids` when created by NCS
* **Frequency Filter Excludes NCS** - NCS operators are now always visible in the check-in list regardless of frequency filter
* **React Hooks Order Error** - Fixed page crash caused by hooks being called after conditional returns
* **Page Load Performance** - Optimized roles endpoint with eager loading to avoid N+1 database queries
* **Function Name Typo** - Fixed `getNcsColorForUser` → `getNcsColor` reference error

## Improvements

* **Dashboard Permission Checks** - Dashboard now uses `can_manage` field from API instead of fetching all net roles
* **Frequency Chip Row Styling** - Frequency chip rows now inherit NCS background color and left border from parent check-in

---

# December 6, 2025

## New Features

* **ICS-309 Communication Log Export** - Export nets in official ICS-309 format for FEMA/emergency management reporting
* **ICS-309 Toggle** - Per-net setting to enable ICS-309 mode with additional fields (Time Out, incident info)
* **Compact Check-in List View** - Alternative condensed view showing frequency chips inline with check-ins

## Improvements

* **Check-in Highlight on Net Start** - When net starts, check-in button pulses to prompt users to check in
* **Toast Notifications** - Improved feedback messages throughout the application

---

# December 5, 2025

## New Features

* **Net Templates** - Save and reuse net configurations as templates
* **Bulk Check-in** - Quickly check in multiple stations at once
* **Search Check-ins** - Search and filter check-ins by callsign, name, or location

## Bug Fixes

* **WebSocket Reconnection** - Fixed WebSocket not reconnecting after connection loss

---

# November 2025

## New Features

* **Real-time Chat** - Live chat functionality for active nets
* **Check-in Map** - Visual map showing check-in locations (when grid square provided)
* **Location Awareness** - Auto-fill grid square based on browser geolocation
* **Custom Fields** - Configurable per-net fields beyond the standard check-in fields
* **Net Statistics** - Participation statistics and trends
* **Floating Windows** - Detachable check-in list and chat panels

## Improvements

* **Dark Mode** - System-aware dark/light theme support
* **Mobile Responsive** - Improved mobile layout for all pages
* **Offline Indicator** - Visual indicator when connection is lost

---

# October 2025

## Initial Release

* **Magic Link Authentication** - Passwordless email login
* **OAuth Support** - Google, Microsoft, GitHub login options
* **Net Management** - Create, schedule, start, and close nets
* **Multi-frequency Support** - Nets can have multiple frequencies/modes
* **Check-in System** - Full check-in workflow with status tracking
* **Role-based Access** - Admin, NCS, Logger, User, Guest roles
* **WebSocket Updates** - Real-time check-in and status updates
* **Email Notifications** - Net start notifications and closure logs
* **CSV Export** - Export check-in logs as CSV
