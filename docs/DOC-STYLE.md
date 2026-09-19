# Documentation design scheme

**Read this before writing or changing a page under `docs/`.** It is to the
documentation site what `docs/DESIGN.md` is to the application: the standing
rules, the reasons behind them, and the decisions already made so they do not
get re-litigated per page.

Internal working document. `_config.yml` excludes it from the published site.

Operational facts (how the site is built, the layouts, the commands) stay in
`docs/DEVELOPMENT.md` under "Documentation site". This file is the scheme.

Built against ISO/IEC/IEEE 26514:2022 (design and development of information
for users), ITIL 4 knowledge management, Diataxis, and WCAG 2.2 AA.

---

## 1. Information architecture

### The site is organized by audience, never by feature

Seven top-level directories, each addressed to one person doing one job:

| Path | Reader | Question it answers |
|---|---|---|
| `docs/start/` | Somebody who has never used ECTLogger | "Walk me through it once" |
| `docs/operators/` | Anyone checking into a net | "How do I take part?" |
| `docs/net-control/` | NCS, Logger, Relay, during a net | "How do I run this?" |
| `docs/net-managers/` | Whoever owns a net or a schedule | "How do I set this up?" |
| `docs/admins/` | The admin panel and instance settings | "How do I run the instance?" |
| `docs/reference/` | Anyone, mid-task | "What exactly are the values?" |
| `docs/about/` | Anyone deciding or stuck | "What is this, and who do I ask?" |
| `docs/self-hosting/` | Somebody running their own copy | "How do I deploy it?" |

A feature that three audiences touch gets written three times, from three
seats, not once in a shared page all three are sent to. Chat is the worked
example: operators get "talking alongside the net", net control gets
"moderation and mutes", and they overlap barely at all.

**The retired `docs/USER-GUIDE.md` is the counterexample.** 1,084 lines, one
document, five audiences, four Diataxis modes at once. It served nobody, and
roughly a third of it had drifted out of true with the app. Never rebuild it.

### Deciding where a new page goes

1. Name the one reader. If you name two, it is two pages.
2. Name the seat they are sitting in. Checking in from a phone in the field is
   the operator path; logging somebody else's check-in is net control.
3. If the answer is a table of values rather than a procedure, it is
   `docs/reference/`, and the procedure pages link to it.

### The index contract

Every path has an `index.md` that names each of its pages and says what that
page covers. **That listing is a promise.** A page must deliver what its index
line says it does, and the index line changes when the page does. Adding a page
without adding its index line makes it unreachable: `scripts/check-docs.py`
fails the build for exactly that reason.

### Depth

Two levels under `docs/`, no more: `docs/<path>/<page>.md`. A topic that wants
a third level is a sign the path needs splitting, not nesting.

---

## 2. Page shape, by Diataxis `kind`

Front matter carries `kind`, and it is not decoration. **A page does not mix
modes.** Most bad documentation is a how-to with explanation smeared through it.

| `kind` | Reader's state | Shape | Never |
|---|---|---|---|
| **Tutorial** | Has never done this | One path, no choices, stated outcome, numbered steps, ends having produced something real | Offers alternatives, explains internals |
| **How-to** | Knows what they want | Goal stated first, numbered steps, one action per step, imperative mood | Teaches concepts, wanders |
| **Reference** | Mid-task, needs a value | Complete, scannable, tables, alphabetical or structural order | Narrates, recommends |
| **Explanation** | Wants to understand | Discursive, dense, technically specific, history where it earns its place | Tells you to click anything |

Only `docs/start/` holds Tutorials, and there are exactly three.

**Standard section order for a How-to page:** what this is and who sees it,
then the procedure, then the parts that surprise people, then "Next" linking
one or two sibling pages. Do not invent a new skeleton per page; symmetry is
worth more than novelty here, the same as it is in the UI.

---

## 3. Voice

The site is written the way a sysop writes to other operators: practical,
specific, never breathless. It has to read like a person wrote it, because a
person did.

- **"You"** for the reader-operator. "We" sparingly, for the project.
- **Sentence case** for headings, buttons, and labels. Protocol literals keep
  their real casing: callsigns, `ICS-309`, `WXOBS`, `@MAINE`.
- **Contractions are normal, in moderation.** The natural rate measured against
  KC1JMH's own prose is roughly one per seventy words. Writing them all out
  reads stiff; leaning on them reads chatty.
- **Em-dashes: sparingly.** Written as the real character, as a scoped
  exception to the baseline no-em-dash rule in
  `.github/copilot-instructions.md`, and only in `docs/` path pages, never in
  source, comments, or commit messages. The site was rebalanced on 2026-09-19
  from one per 66 words (roughly one every three sentences, which reads as a
  tic) to about one per 650. Two rules keep it there:
  - **Never two in one sentence.** A pair of em-dashes bracketing an aside is
    almost always better as parentheses or as its own sentence.
  - **The definition pattern is exempt** and stays: `**Term** — definition` in
    a list, a table cell, or a link listing. That is the project's own
    changelog format and it reads correctly.
  - Reach for a colon, a semicolon, parentheses, or a full stop first. Use the
    em-dash when the aside genuinely needs a harder break than a comma.
- **Always give the why.** A sentence that says what a control does without
  saying what problem it solves gets rewritten. This is the single rule that
  most separates this site from the guide it replaced.
- **Expand an acronym on first use per page**, then use it freely. Assume the
  reader knows amateur radio. Do not assume they know ARES, RRI, or ICS.
- **Be honest about limits**, where the reader will hit them, not in a footnote.
  A known defect is named on the page it affects and linked to
  `docs/about/known-issues.md`.
- **No developer vocabulary.** The changelog's forbidden-terms list applies:
  no "component", "endpoint", "modal", "boolean", "refactor", "schema".
- **No emoji in body copy.** They stay in exactly two places, where they are
  load-bearing: the roadmap's type tags and the changelog.

### Use the label that is on the screen

Where the code, the roadmap, and the interface disagree about what something is
called, **the interface wins**, and the page mentions the other name once so
search finds it.

The worked example: the feature the README and roadmap call "Speed Entry" is a
button labelled **Bulk add** with the tooltip "Bulk add multiple check-ins". A
reader hunting for a Speed Entry button will not find one. Write "Bulk add",
and say it is sometimes called speed entry.

**Quoted UI text is verbatim**, including its own punctuation. If the app's
banner reads "Net Control has stepped away — this net has been paused until
they return", the page quotes it with that em-dash, whatever the density rule
says. Changing quoted strings to match house style makes them unsearchable.

---

## 4. Accuracy

**Verify every factual claim against the code before writing it.** Repeating a
wrong claim in a nicer voice is worse than useless. If you cannot confirm
something, leave it out and say so, rather than writing a plausible sentence.

Authoritative sources, in order: `backend/app/models.py` for the data model,
`backend/app/routers/` for what each action does, `backend/app/permissions.py`
for who may do it, `frontend/src/pages/` and `frontend/src/components/` for
what the user sees and what the controls are named.

**A confident sentence in an existing document is not evidence.** The
"a recheck updates the existing row" claim lived in `copilot-instructions.md`,
propagated to the README and the user guide, and was wrong in all three for
months. Check `create_check_in`, not the last document that mentioned it.

Corollary, from `docs/DEVELOPMENT.md`'s own rule: **never document a feature
that is not in production.** A page describing unshipped work is a bug.
Feature-branch pages get written on that branch and merged with it.

---

## 5. Figures

**Screenshots are generated, never hand-captured.** Declare the shot in
`scripts/docs-screenshots/requests/<path>.yml` and run
`scripts/docs-screenshots/run.sh`. Adding a figure means adding a manifest
entry, not opening an image editor: a hand-annotated PNG cannot be regenerated,
which is how the site ended up serving eight-month-old screenshots of a UI that
had been redesigned twice.

Non-negotiable:

- **Captures run against the seeded demo instance**, never beta and never
  production. Beta holds a copy of production's database, real names and email
  addresses included. A screenshot of it is a privacy incident.
- **Any figure that tells the reader where to click or navigate carries a
  bright red box** (`--annotate`, `#e53935`) around the target, or a red
  underline where a box would swallow half the screen. Drawn at capture time
  from a selector, so it follows the control when the layout moves.
- **No instruction may exist only inside an image** (WCAG 1.4.5). The prose
  names the control by its label, and the alt text carries the same instruction
  in words. A red box is invisible to a screen reader.
- **Light mode only**, except the one figure that exists to show dark mode.
- **Alt text describes what is on screen**, in plain sentences, including the
  red annotation and what it marks. It is not a caption and not a repeat of the
  caption.
- **Prefer `aria-label` selectors** in a manifest. Emotion class names like
  `css-6su6fj` change whenever the styles are touched.

Captions say why the figure is there, not what it is.

---

## 6. Examples

Every worked example, screenshot, and speed-entry sample uses one roster, kept
in `docs/DEVELOPMENT.md`. **Do not invent a callsign.**

The rule behind it: **every example callsign carries a four-letter suffix.**
The FCC's sequential system tops out at a three-letter suffix, so a four-letter
suffix is structurally unassignable in perpetuity, the same reasoning behind
`N0CALL`. No screenshot can put words in a real licensee's mouth, and a ham
reading closely recognizes the shape as a placeholder. The guide this site
replaced used `KC1ABC`, `N1XYZ`, and `W1DEF`, all of which the FCC can issue.

Organizations are **Example County ARES**, **Example County SKYWARN**, and the
**Tuesday Evening Club Net**. Locations stay real New England towns, because
the map pages need addresses that actually geocode.

---

## 7. Visual scheme

The stylesheet is `assets/css/site.css`, and it deliberately mirrors the
application's Material UI palette so the docs and the app do not look like two
different products. Tokens are defined once on `:root` and redefined for dark
mode; **never hardcode a color in a page.**

| Token | Light | Role |
|---|---|---|
| `--primary` | `#1976d2` | Header, links, current sidebar item |
| `--background` | `#e8eef4` | Page ground |
| `--surface` | `#ffffff` | Content card |
| `--surface-alt` | `#f5f7fa` | Table headers, code blocks |
| `--text-primary` / `--text-secondary` | 87% / 60% black | Body, metadata |
| `--border` | 12% black | Rules, table cells |
| `--annotate` | `#e53935` | The screenshot annotation red, nothing else |

Dark mode is both `prefers-color-scheme` and an explicit `.dark-mode` class on
the root, so the toggle wins in both directions.

Three reusable blocks, and no fourth without a reason:

```html
<div class="callout">
  <span class="callout-label">Note</span>
  <p>Body.</p>
</div>
```

`callout` also takes `warning` and `danger`. **The label word is required**: a
callout must never rely on its color alone to say what it is (WCAG 1.4.1).

```html
<figure>
  <img src="/docs/img/operators/check-in-dialog.png"
       alt="The check-in dialog, with the Check In button outlined in red at the bottom right.">
  <figcaption>The check-in dialog. Only the callsign is required.</figcaption>
</figure>
```

Add `class="control-figure"` for a partial capture of one control, so it
renders at its own size instead of stretched to the column.

Wide tables go in `<div class="table-scroll" markdown="1"> ... </div>`.
Kramdown does not parse Markdown inside block HTML without `markdown="1"`.

---

## 8. Accessibility

WCAG 2.2 AA is the target, and three of its rules do real work here:

- **1.1.1** every figure has alt text that carries the same information.
- **1.4.1** nothing is described by color alone. Not a callout, not a chip, not
  a map marker. Name the shape, the label, or the position as well.
- **1.4.5** no instruction exists only inside an image.

Plus: headings descend without skipping a level, link text says where it goes
(never "click here"), and every table has a real header row.

---

## 9. Keeping it true

This is the part that decides whether the site is still accurate in a year.

- **Every user-facing change updates at least one audience path.** That is in
  the Definition of Done in `.github/copilot-instructions.md`, not a
  suggestion. A change nobody on any path would notice is not user-facing.
- **A roadmap item's `Docs:` line** names the paths before the work starts,
  when there is still budget for it, rather than at the end when there is not.
- **`review_by`** turns "is the documentation still accurate" into a bounded,
  listable task: pages past their date, in order. Bump `revised` and
  `review_by` together when you genuinely re-read a page, and neither for a
  typo fix.
- **Run `python3 scripts/check-docs.py` before every documentation commit.** It
  checks internal links, that every referenced figure exists and has alt text,
  that front matter is complete and `kind` is valid, that no page has a bare
  Liquid brace, and that every page is reachable from `_data/nav.yml`.
- **Re-run the figures** after any release that changes the check-in table, the
  net toolbar, or the card buttons.

---

## 10. Never do this

- Never rebuild a single all-audiences guide.
- Never document a feature that is not in production.
- Never take "just one" screenshot from beta.
- Never hand-edit a PNG under `docs/img/`.
- Never invent a callsign, a name, or an organization.
- Never write bare double braces in a page. Liquid is off for page content in
  `_config.yml`, but the search index and the layouts still process it.
- Never describe something by color alone.
- Never let a page contradict the label on the screen.
