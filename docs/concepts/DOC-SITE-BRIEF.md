# Brief for writing a documentation path

Internal working document. `docs/concepts/` is excluded from the published site
in `_config.yml`, so this is not user-facing and does not need the site voice.

Read this end to end before writing a word. It is the shared half of every
path-writing assignment; your own assignment adds the page list.

## Read first, in this order

1. **`docs/DEVELOPMENT.md`, the section "Documentation site (ectlogger.us)"** at
   the end of the file. Binding: the front-matter template, the Diataxis `kind`
   rule, the figure rules, the example callsign roster, and the voice.
2. **Your path's `index.md`.** Already written. It sets the tone and it
   *promises what each of your pages covers*. Your pages must deliver what it
   says they do.
3. **`docs/index.md`** for the surrounding voice.
4. **`.github/copilot-instructions.md`, the "Feature Registry" table.** Dense,
   current, and accurate, with the history behind several behaviors. Reading it
   will save you hours and stop you repeating mistakes the old docs made.
5. **`docs/USER-GUIDE.md`**, the 1,084-line guide this site replaces. The prose
   is often good and the *structure* is the problem. Harvest sentences and
   explanations that are accurate and well put, rewrite what is vague, drop what
   is wrong. Do not copy its organization.

## Accuracy is the whole job

Verify every factual claim against the code before writing it. Repeating a wrong
claim in a nicer voice is worse than useless. If you cannot confirm something,
**leave it out and report it** rather than writing a plausible sentence.

Authoritative sources: `backend/app/models.py` for the data model,
`backend/app/routers/` for what each action does, `backend/app/permissions.py`
for who may do it, `frontend/src/pages/` and `frontend/src/components/` for what
the user sees and what the controls are named.

### Use the label that is on the screen

Where the code, the old docs, and the interface disagree about what something is
called, **the interface wins**, and the page mentions the other name once so
search finds it.

Worked example: the feature the README and roadmap call "Speed Entry" is a
button labelled **Bulk add**, with the tooltip "Bulk add multiple check-ins",
implemented in `BulkCheckIn.tsx`. A reader hunting for a Speed Entry button will
not find one. Write "Bulk add", and say that it is sometimes called speed entry.

### Confirmed facts, and the traps around them

- **`StationStatus` is exactly**: CHECKED_IN, HAS_TRAFFIC, LISTENING, RELAY,
  AWAY, ANNOUNCEMENTS, MOBILE, CHECKED_OUT. The old README invented "Available"
  and omitted four real ones.
- **A recheck is not a status.** It is what happens when an already-checked-in
  callsign checks in again: the existing row updates rather than a second row
  appearing. **But** the check-in list legend does show a "Recheck" marker, so
  a reader will see that word on screen. Explain the distinction; do not simply
  assert that recheck is not a thing.
- **"2nd NCS" is a real label in the check-in list legend**, with the tooltip
  "2nd NCS - assists primary Net Control Station". It is **not** a separate
  assignable role: there is no such `NetRole` value. It is how the list marks an
  additional active NCS. The old README was wrong to put it in a table of roles
  you can assign, and a page that flatly denies the term exists will contradict
  the reader's screen. Get this one exactly right.
- **The legend mixes three different kinds of thing** — per-net roles, station
  statuses, and the recheck marker — which is the root of both confusions above.
  Saying so plainly is probably worth a short section wherever the legend is
  covered.
- **`UserRole` is** ADMIN, NCS, USER, GUEST.
- **OAuth sign-in does not work.** The callback is a 501 stub. The real ways in
  are a magic link and an optional password. Never present OAuth as available.
- **Who may take NCS or Logger by checking themselves in widened on 2026-09-18**
  (commit `58b99cf`) to **any active net staff** on the schedule, not only
  co-managers and rotation members. Co-manager remains a strictly higher tier
  for schedule ownership actions. A staff-entered check-in (somebody logged in
  by voice) never grants a role; only a genuine self-check-in does.
- **An auto-created scheduled net with nobody assigned as NCS is intended**, not
  a bug. Pre-assignment only happens when the schedule has a rotation.
- **Admins must have MFA**, enforced on every admin route, not just at login.

## Front matter

Every page gets the full block. `kind` is one of Tutorial, How-to, Reference, or
Explanation, chosen honestly, and **a page does not mix modes**.

```yaml
---
title: Checking in
summary: One sentence. Shown under the title, in search results, and as the page description.
kind: How-to
audience: Operators
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/checking-in/
---
```

## Figures

Do not take screenshots yourself and do not invent image files.

1. Declare each figure in `scripts/docs-screenshots/requests/<your-section>.yml`.
   You own that one file; nobody else writes to it. The schema, the field
   reference, and the placeholder syntax are in
   `scripts/docs-screenshots/README.md`.
2. Embed it in the page with the `<figure>` HTML from that README, pointing at
   `/docs/img/<your-section>/<id>.png`.
3. **Where a figure tells the reader where to click, add a red `box` or
   `underline` annotation on that control.** This was a specific request from
   the project owner. Use `underline` where a box would swallow half the screen.
4. **No instruction may exist only inside an image** (WCAG 1.4.5). The prose
   names the control by its label and the alt text carries the same instruction
   in words. A red box is invisible to a screen reader.

### Getting selectors right

A demo instance is running with seeded fictional data. Use it to find real
selectors instead of guessing from the source:

```bash
node scripts/docs-screenshots/inspect.mjs /nets/1 --as W1PINE --wait-for 'table:visible tbody tr'
node scripts/docs-screenshots/inspect.mjs /nets/1 --as W1PINE --click 'span[aria-label="Search check-ins"]'
node scripts/docs-screenshots/inspect.mjs /nets/1 --as W1PINE --ancestors 'span[aria-label="Bulk add multiple check-ins"]'
```

It prints every visible `aria-label`, button, table, and dialog on the page.
Prefer `aria-label` selectors. **Avoid emotion class names** like
`css-6su6fj` — they change whenever the styles are touched.

Be sparing: it drives a shared headless browser, and several agents may be
running. A handful of calls each, not dozens. **Do not run `capture.mjs`** — the
figures are captured centrally once every request file is in.

Seeded data: net 1 is the active ARES net (14 check-ins, every station status,
two active NCS, custom fields), net 2 is scheduled, net 3 is closed with a full
log. `W1PINE` is NCS, `K1COVE` Logger, `N1LAKE` Relay, `KC1HILL` a participant,
`W1DEMO` the admin.

## Constraints

- **Never write bare double braces** in a markdown page.
- No emoji in body copy. Sentence case headings. Do not skip heading levels.
- Wrap any wide table in `<div class="table-scroll" markdown="1"> ... </div>`.
- Kramdown does not parse Markdown inside block HTML unless the element carries
  `markdown="1"`.
- Use only the roster in `docs/DEVELOPMENT.md` for examples. Never invent a
  callsign.
- Cross-link to sibling and reference pages by permalink. Paths are being
  written in parallel, so some targets do not exist yet. Link to them anyway.
  Reference pages: `station-statuses`, `roles-and-permissions`,
  `check-in-fields`, `speed-entry-syntax`, `location-formats`, `emails`,
  `feeds`, `glossary`, all under `/docs/reference/`.
- **Do not edit** `_data/nav.yml`, `_config.yml`, any layout, your path's
  `index.md`, or anything outside your own path directory and your one requests
  file.
- **Do not touch beta** (`/home/bradb/ectlogger`), **do not use port 8000**,
  **do not restart the demo instance**, and **do not commit anything.**

## Report back

- One line per page: what it covers and roughly how long it is.
- Anything you could not verify and therefore left out.
- Anything that looks like a real bug or a real inaccuracy in the app or its
  other documentation. Note it; do not fix it.
- Any page that turned out to be the wrong shape, or any missing page the path
  needs.
