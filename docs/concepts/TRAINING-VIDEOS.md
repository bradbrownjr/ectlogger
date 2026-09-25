# ECTLogger Training Video Plan

Last updated: 2026-09-25

A recording plan for short training videos for club and ARES peers: the basics as an
operator, then as net control, then as a net manager, followed by short clips on the
advanced and unusual features. Each video has a staging checklist to finish **before**
recording starts, so a take is never spent fixing the setup on camera.

Status: working plan, not documentation. It replaces `docs/training_video_outline.md`,
which was removed on 2026-09-19 because it taught OAuth sign-in (a `501` stub, never a
working login path), a "Secondary NCS" role that does not exist, and a "Speed Entry"
button that now reads **Bulk add**.

## Principles

- **Follow the help site, don't compete with it.** Videos A1, B1, and C1 track the three
  Get Started tutorials, which were walked click by click in a browser on 2026-09-24. Put
  the matching page link in every video description; the page is where the detail lives
  and the one that gets corrected when the app changes.
- **Record only on the seeded demo instance.** Never beta and never production: beta holds
  a copy of production's database, so any frame of it shows real callsigns, names, and
  email addresses. The demo roster is invented, and every callsign has a four-letter
  suffix the FCC cannot issue.
- **Short.** 3 to 6 minutes for a track video, 1 to 3 for a clip. One playlist per track.
- **Say the button's words.** Narrate with the exact label on screen ("Bulk add", "Close
  net", "Start Walkthrough") so a viewer can find it by searching the help site.

## Series outline

| # | Title | Audience | Length | Help-site pages |
|---|---|---|---|---|
| A1 | Signing in and finding your net | Everyone | 4 min | start/first-check-in, operators/signing-in, operators/finding-a-net |
| A2 | Checking in and taking part | Everyone | 5 min | operators/checking-in, status-and-checking-out, chat-and-polls, location-and-the-map |
| B1 | Running your first net | New net control | 6 min | start/run-your-first-net, net-control/logging-check-ins, closing-the-net |
| B2 | The net control desk | NCS, Logger, Relay | 6 min | net-control/the-net-control-desk, roles-and-stepping-away, frequencies-and-multi-ncs |
| B3 | After the net: reports and ICS-309 | NCS, net managers | 4 min | net-control/closing-the-net, net-managers/reports-and-exports, cancelling-and-archiving |
| C1 | Setting up a recurring schedule | Net managers | 6 min | start/first-schedule, net-managers/recurring-schedules, net-staff-and-rotation, lobby-and-auto-close |
| C2 | Reading your schedule's statistics | Net managers | 3 min | net-managers/schedule-statistics |

Short clips, in rough order of how often peers will need them:

| Clip | What it shows | Help-site page |
|---|---|---|
| Speed entry | Typing a pileup into **Bulk add**: commas between fields, semicolons between stations, status shortcuts | net-control/speed-entry, reference/speed-entry-syntax |
| Stepping up as backup NCS | A schedule's staff member checking in as NCS or Logger on an unstaffed net | net-control/roles-and-stepping-away |
| Hand raise and stepping away | Raising a hand, Step away, Just listening, Check out | operators/status-and-checking-out |
| Chat power tools | Reply, @mention, edit, personal mute, and the NCS net-wide mute (shift+click) | operators/chat-and-polls, net-control/chat-moderation |
| Traffic | Filing traffic as a station, then handling it at the desk | operators/filing-traffic, net-control/handling-traffic |
| Authenticated nets | The padlock, reading the station's code, Confirm Match / Reject | net-control/authenticated-nets |
| Multiple monitors | Popping panels out into their own windows across screens | net-control/multiple-monitors |
| On a phone in the field | The phone layout, what to set up before leaving the house | operators/in-the-field |
| Scripts, announcements, notes | Loading the net script, announcements, NCS notes | net-managers/scripts-and-announcements |
| Importing check-ins | Backfilling a net that ran off-app from a CSV | net-managers/importing-check-ins |
| Cancelling and restoring | Cancelling one scheduled occurrence, and bringing it back | net-managers/cancelling-and-archiving |
| Feeds and calendars | The RSS feeds and where their addresses are | reference/feeds |
| Admin: frequencies and custom fields | The shared frequency list; adding a field such as SKYWARN spotter number | admins/frequencies, admins/custom-fields |

## Staging the demo instance

Do this once per recording session, then use the per-video checklists below.

### 1. Start it fresh

The start-up commands live in `scripts/docs-screenshots/README.md` ("Running it", steps
1 to 3) and are not repeated here so they cannot drift. In short: seed
`backend/demo.db`, start the demo backend on port 8100 and the demo frontend on port
3100, then open `http://10.6.26.3:3100`. That address only works on the home LAN or over
Tailscale.

**Reseed right before recording, not the night before.** Check-in times, "started N
minutes ago", and the active nets are all seeded relative to the moment the script ran,
so a day-old seed reads as a net that has been running for 24 hours.

**Reset between takes** by stopping the demo backend, re-running the seed command (it
rebuilds the database from scratch), and starting the backend again. Every check-in,
role change, or closed net from the previous take is gone. Sign every browser in again
afterward.

### 2. Accounts

Every seeded account signs in with password `DemoNet!2026` (the email is the callsign in
lower case at `example.com`, and the callsign also works in the sign-in box).

| Callsign | Name | Use it for |
|---|---|---|
| W1PINE | Alex Reed | Net control and net manager. Owns the ARES Weekly Net and is its NCS on the repeater |
| N1DUNE | Robin Teague | The new operator. Checked into nothing, so the check-in dialog is available |
| K1COVE | Dana Whitfield | Logger on the ARES Weekly Net; co-manager of the ARES schedule; manager of the Tuesday club net |
| W1PORT | Joan Alderman | Second NCS on the ARES Weekly Net, on the DMR talkgroup; manager of the scheduled SKYWARN net |
| N1LAKE | Marcus Ellery | Relay on the ARES Weekly Net; verified on the Identity Drill |
| K1CAMP | Terry Osgood | Has traffic on the ARES Weekly Net; SKYWARN staff; verifiable on the Identity Drill |
| W1DEMO | Sam Whitcomb | Admin. Needs a two-factor code on sign-in (see below) |

The rest of the roster (KC1HILL, N1ROVE, W2FERN, N2OAKS, K3BASE, W1MILL, N1BIRD) is table
filler: every one is already checked into the ARES Weekly Net.

**Admin two-factor code.** The seed writes W1DEMO's secret to `backend/demo-seed.json`
under `admin_mfa.secret`. Load it into an authenticator app on your phone once per seed,
or print a current code with:

```bash
backend/venv/bin/python -c "import json,pyotp; s=json.load(open('backend/demo-seed.json'))['admin_mfa']['secret']; print(pyotp.TOTP(s).now())"
```

**Magic links cannot be sent by the demo** (email is disabled on purpose). To show the
magic-link flow on camera, request one on screen, cut, then open a link generated with:

```bash
cd backend && SECRET_KEY=demo-only-not-a-real-secret DATABASE_URL="sqlite:///./demo.db" \
  SMTP_HOST=127.0.0.1 SMTP_USER=d@e.com SMTP_PASSWORD=d SMTP_FROM_EMAIL=d@e.com \
  venv/bin/python -c "from app.auth import create_magic_link_token; print(create_magic_link_token('n1dune@example.com'))"
```

and visit `http://10.6.26.3:3100/auth/verify?token=<printed token>`.

### 3. Nets the seed provides

| Net | State | Good for |
|---|---|---|
| Example County ARES Weekly Net | Active, from the ARES schedule | Nearly everything: every station status, two NCS on two frequencies, a Logger, a Relay, a raised hand (KC1HILL), traffic (K1CAMP), chat with a reply and a mention |
| Bridgton Simplex Exercise | Active, ad hoc, nobody logged, no NCS | Claim NCS (as its manager, W1PINE) |
| Example County ARES Identity Drill | Active, authenticated | The padlock clip |
| Example County SKYWARN Net | Scheduled for next Thursday | Scheduled-net cards, cancel and restore |
| Tuesday Evening Club Net | Closed | Report, ICS-309, and exports without having to close anything first |

The seed does **not** include a net script, a poll, or a topic of the week. Add them
before any take that shows them (see A2 and the scripts clip).

### 4. Admin settings the seed needs changed

Seeded accounts are minutes old, and a non-admin cannot create a schedule until the
account is 7 days old and has checked into a net. Before B1 or C1, sign in as W1DEMO and
set **Admin > Security > Minimum Account Age (days)** to `0`. W1PINE already counts as
having checked into a net. Alternatively, turn on the age bypass for W1PINE alone under
**Admin > Users**. Don't narrate around the limit in the video; mention it once in C1,
since real new accounts will hit it (see net-managers/recurring-schedules, "A brand-new
account may have to wait").

### 5. The recording machine

- **Two browser identities** for anything live, such as a check-in appearing on the NCS
  table as the station submits it. Use two separate Chrome profiles (or one normal
  window plus one incognito window). Two tabs in the same profile share one sign-in.
- **Screen:** record at 1920x1080, browser zoom around 125% so text survives YouTube
  compression, bookmarks bar hidden, extensions that draw on the page turned off.
- **Quiet:** OS do-not-disturb on, no other apps with pop-up notifications, close chat
  apps.
- **One theme for the whole series.** Pick light or dark in Profile > Settings and keep
  it. Dark mode can get its own 20-second mention in A2.
- **Clean layout:** Profile > Settings > **Reset Net View Layout** in each browser before
  each take, so panels are where a new viewer's will be.
- **Walkthrough:** the seed marks it as already seen. Open it on camera from the Help
  menu with **Start Walkthrough**.
- **Address bar:** it shows `10.6.26.3:3100`. Either crop it out in editing or say once
  that this is a practice copy with made-up stations.

## Per-video staging and beats

### A1. Signing in and finding your net

Staging: signed out, fresh window. Seed less than an hour old.

1. What ECTLogger is, in two sentences: a live net log everyone can see.
2. Sign in: the magic-link email (show the request, cut to the link), and the password
   option. There is no Google/Microsoft/GitHub sign-in.
3. Help > **Start Walkthrough**, skim it.
4. The dashboard: status chips on the net cards, card vs list view toggle, the filter
   icon for search, the star to favorite a scheduled net.

### A2. Checking in and taking part

Staging: browser 1 as N1DUNE; browser 2 as W1PINE on the ARES Weekly Net, to show the
row arriving live. As W1PINE, add a poll and a topic of the week to the ARES Weekly Net
first (**Edit net**). Optionally turn on location awareness in N1DUNE's Profile >
Settings so the grid square fills in.

1. Open the ARES Weekly Net and check in. Cut to browser 2 as the row appears.
2. Change your status; Listening, Away, Mobile; what the icons mean.
3. Chat: send a message, reply to one, @mention the NCS.
4. Answer the poll and the topic of the week.
5. The map, and which location formats it understands.
6. Check out.

### B1. Running your first net

Staging: Minimum Account Age set to 0 (section 4). Browser 1 as W1PINE; browser 2 as
N1DUNE ready to check in. Have 4 or 5 roster callsigns on a note to "hear" on the air.

1. The **+** button on the dashboard opens the One-Time schedule form: seven tabs, a
   Schedule Name, and a frequency is required before Create is allowed.
2. **Start**: whoever clicks it becomes NCS and is checked in automatically, with a
   "check in now" message posted to chat.
3. Log two stations by hand with the check-in form, one by clicking a row to edit it
   inline, then N1DUNE checks themselves in from browser 2.
4. Log three at once with **Bulk add** (link the speed-entry clip).
5. **Close net** while checked in as the NCS. (Known issue: net staff who haven't taken
   a role see the button but get refused. See about/known-issues.)

### B2. The net control desk

Staging: browser 1 as W1PINE on the ARES Weekly Net, layout reset. Nothing else; the
seed already has every status, a raised hand, traffic, two NCS, a Logger, and a Relay.

1. Toolbar tour, left to right, one sentence each.
2. Reading the table: statuses, the raised hand (KC1HILL), traffic (K1CAMP).
3. Roles: two NCS on two frequencies (W1PINE on the repeater, W1PORT on DMR), the active
   frequency indicator, Logger and Relay, and what each can do.
4. Stepping away and coming back; Just listening.

### B3. After the net: reports and ICS-309

Staging: signed in as K1COVE, who manages the Tuesday Evening Club Net (already closed),
so nothing has to be closed on camera.

1. What closing does, and who gets the log email (the net manager, subscribers, and the
   NCS, Logger, and Relay who worked it). The demo sends no email: show
   reference/emails, or a real log email with the recipients blurred.
2. Report, ICS-309, ICS-309 PDF, and CSV export. Anyone who can see a closed net can
   open these.
3. Archive (and that it can be undone); Delete is permanent.

### C1. Setting up a recurring schedule

Staging: Minimum Account Age set to 0. Signed in as W1PINE.

1. Mention the new-account limits once.
2. Create a weekly schedule: the four tabs that matter, then **Create Schedule**.
3. After saving, the **Staff** button: add net staff with **Add NCS Operator**, set a
   co-manager, and set the rotation on the Rotation Order tab.
4. Auto-open lobby and auto-close after inactivity, and why both are off unless you turn
   them on.
5. Reminder emails for the rotation's NCS.
6. The point to land: a net with nobody pre-assigned is normal. Staff claim it by
   checking themselves in as NCS.

### C2. Reading your schedule's statistics

Staging: the seed has very little history (one active and one closed net), so the charts
look thin. Either accept that and keep the video short, or extend the seed with a few
months of past nets for this video before recording.

1. The 30d / 90d / 1y / All filter, and that it rescopes the whole page.
2. The four leaderboards.
3. Net history and the schedule report.

### Clip staging notes

- **Stepping up as backup NCS:** every staff member of the ARES schedule is already
  checked into the ARES Weekly Net. First, as W1PINE, add N1DUNE as net staff (**Staff**
  button), then as N1DUNE check in and pick **NCS (backup net control)** under "Check in as". For Claim NCS instead,
  use the Bridgton Simplex Exercise as W1PINE.
- **Authenticated nets:** use the Identity Drill as W1PINE. Load K1CAMP's secret from
  `demo-seed.json` (`mfa_secrets.K1CAMP`) into your phone's authenticator so there is a
  real code to read out on camera. N1ROVE shows a station without two-factor; N2OAKS is a
  guest with no account.
- **Chat net-wide mute:** as W1PINE (NCS), shift+click the mute icon on a message; show
  from a second browser that it's gone for everyone else.
- **Multiple monitors:** a real two-screen setup reads better than one wide window. Pop
  out the check-in list and chat.
- **On a phone:** use a real phone on the LAN or Tailscale, mirrored or screen-recorded,
  rather than desktop device emulation.
- **Importing check-ins:** have a small CSV of roster callsigns ready before recording.
- **Cancelling and restoring:** use the Example County SKYWARN Net (scheduled), signed
  in as its manager, W1PORT.

## Open questions

- Host the videos on YouTube (unlisted or public) or on the club site? That decides
  whether the help-site pages can link them.
- Should C2 wait for a seed with real-looking history?
- Whether a separate admin track is worth it for the few peers who run their own
  instance, or the one admin clip is enough.
