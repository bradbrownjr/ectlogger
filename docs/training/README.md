# ECTLogger video kit

Graphics for the training series planned in `docs/concepts/TRAINING-VIDEOS.md`, designed for the
light theme. Every overlay is a full 1920×1080 PNG with a transparent background, already
placed where it belongs, so in OBS you add it as an Image source at 0,0 and toggle it on
and off. Add a Fade or Slide transition to the scene or source for motion.

| Folder | What | Where it sits on screen |
|---|---|---|
| `titles/` | Opening card for the series, each track video (A1–C2) and each clip | Full frame |
| `end-cards/` | Help-site page for that video, plus "Up next" for track videos. The right half is left empty for YouTube end-screen elements | Full frame |
| `thumbnails/` | 1280×720 YouTube thumbnails | — |
| `channel-banner.png` | 2560×1440 YouTube banner; the text sits inside the 1546×423 safe area | — |
| `lower-thirds/` | You (two role lines), and each demo station, marked "demo station". A band from the left edge to about 2/3 across with a pointed end (set `lowerThirdEnd` in `content.mjs` to `curve` for a rounded one) | Bottom left, full bleed |
| `station-tags/` | "Signed in as W1PINE …" for the two-browser shots | Bottom right |
| `chapters/` | "Step 2 of 5" for each beat of the track videos | Top left |
| `callouts/` | "Click [Bulk add]" and the other button labels, plus Shift+click mute | Top right |
| `notes/` | Known issue (B1), new-account limits (C1), demo sends no email (A1, B3), two browsers (A2, B1), and the "practice copy" pill | Top right / top center |

Lower thirds and station tags use different corners from chapters and callouts, so any
two can be on screen at once.

## Changing the text

All wording lives in `source/content.mjs`: your name line, the station roles, the button
list, beat labels, notes. Edit it, then from `source/`:

```bash
npm i playwright && npx playwright install chromium   # once
node build.mjs          # re-renders everything into this folder
```

The logos in `source/brand/` are copies of `docs/assets/` from the repo; replace them if the
art changes. Fonts are Barlow Semi Condensed and Barlow (SIL Open Font License).
