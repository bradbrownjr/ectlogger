# WSSM presentation, November 12, 2026

Work in progress. This is the deck for the Wireless Society of Southern Maine club
presentation at the CCEMA bunker, 22 High Street, Windham (Nov 12, 7 to 8 PM EST,
`training_sessions` id 1 on production). It is kept off the docs site by
`_config.yml`, the same way as `video-kit/`. Once it has been given, export the final
version as a PDF and list it under "Slide decks" on `docs/training/index.md`.

## What is here

| Path | What it is |
|---|---|
| `ECTLogger_WSSM_Presentation.pptx` | The deck for this talk (27 slides). Edit this file |
| `source/deck.json` | Slide order, sections, and fonts the deck was built from |
| `source/slides/<id>.html` | One slide each, 1920x1080, speaker notes in the closing `<aside>` |
| `qr-app-ectlogger-us.png` | QR code for https://app.ectlogger.us, used on `p1-demo` and `thanks` |

The repo is the source of truth. The `.pptx` is the copy presented on Nov 12, and
`source/` is the material it was built from, kept for reuse in later presentations.
When a slide's content changes, change it in both. The deck was first built as the
Claude Slides artifact https://claude.ai/artifact/HhDnkR6nJ15rm4yZTb9QdU (private to
Brad). `source/` was republished to it on 2026-11-12 (version 8), and its PowerPoint
download is one way to rebuild the `.pptx` from `source/`.

## Images

The slides in `source/` point at images stored with the artifact (`/_blob/<id>`).
Every one is a file already in this repo:

| Asset id | Repo file | Used on |
|---|---|---|
| `5580d208d71ddbe7ee0e2b025d4e7f30` | `docs/assets/lockup-dark.svg` | cover |
| `4129b9ff35e936ee071cbcd66dbf2937` | `docs/img/landing/hero.png` | what |
| `c5a04c180c73c359d3f9a967b332863d` | `docs/img/operators/dashboard-net-list.png` | p1-find |
| `b125ff4b49837b719102fb24bca6c9cc` | `docs/img/operators/check-in-dialog.png` | p1-checkin |
| `8b26d8b2cc5e0c24413ef8494059e66a` | `docs/img/operators/schedule-calendar.png` | p1-chat |
| `347d23990d9e14d92a67e3108511ad93` | `docs/img/net-managers/staff-and-rotation.png` | p2-schedule |
| `be61e0b5483dd11206e13797c2424d8d` | `docs/img/net-control/check-in-entry-row.png`, bottom 985 px | p2-desk |
| `fb44f706c72205e7c993a99a23cbd97a` | `docs/img/start/bulk-add-window.png` | p2-bulk |
| `9b5f6d99d296e3ce1f7c414d6bd65c33` | `docs/img/net-control/muted-stations-dialog.png` | p2-order |
| `4d11de8b082765e907ff908c5321af3c` | `docs/img/net-control/close-net-dialog.png` | p2-close |
| `b9ae6753533d088ce082762139094d48` | `docs/img/net-control/ultrawide-desk.png` | p3-freq |
| `2fb2ea18ae9899fb3a9ea9efed44215c` | `docs/img/net-control/coverage-panel.png` | p3-coverage |
| `9cf298ca04a95d08e0c4b0b538005d4d` | `qr-app-ectlogger-us.png` | p1-demo, thanks |
| `6d91b4aa2be5198b624c359dc2c09de2` | `changelog-button.png` (What's New button, from Brad) | thanks |

Uploaded but not used yet: `docs/img/operators/mobile-checkin-list.png`
(`3e2f2068...`), `docs/img/net-control/sites-board.png` (`bd8bd784...`),
`docs/img/net-control/off-net-log-dialog.png` (`e99b6afe...`).

The QR code was made with
`qrencode -t PNG -s 16 -m 2 -l M --foreground=14213D --background=FCFCFA https://app.ectlogger.us`.

## Still to do before the talk

The demos run on production (app.ectlogger.us), which is reachable from the bunker.

- **p1-demo, p2-demo:** create **Demo Club Net** on production and open its lobby so it
  shows on Nets. The Logger volunteer is picked in the room; they will have signed in
  during the first demo, so Roles can give them Logger.
- **p3-demo:** create **Demo ARES Net** with two frequencies (the repeater and a simplex
  frequency) and station coverage turned on, and open its lobby. The second NCS is a
  volunteer from the room, given NCS from Roles.
- Optional: generated art for the cover and part title slides.
