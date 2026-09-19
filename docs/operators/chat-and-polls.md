---
title: Chat, polls, and topics
summary: Talking alongside the net without talking over it — replying, editing, muting, and answering the topic or poll of the week.
kind: How-to
audience: Operators
owner: KC1JMH
revised: 2026-09-19
applies_to: ECTLogger, hosted instance
permalink: /docs/operators/chat-and-polls/
---

# Chat, polls, and topics

Every net has a text chat alongside it. It's a second channel, not a transcript of the net — useful for a side comment, a link, a question you don't want to key up to ask, or just following along if you're listening rather than transmitting.

You need to be [signed in](/docs/operators/account-and-profile/) to send a message. Signed-out visitors can still read chat on a net they're viewing.

## Sending a message

Type into the box at the bottom and press Enter. You can:

- **@mention** a station by typing `@` and picking from the list that pops up — only stations currently checked into this net with an account are offered, since those are the only ones who can actually be notified.
- **Paste an image** (PNG, JPEG, or WEBP) directly into the composer.
- **Reply** to a specific message by hovering it and clicking the reply icon — your reply carries a small quote of the original above your text, Signal-style. Clicking the quote jumps back to the original message.

<figure>
  <img src="/docs/img/operators/chat-mention-composer.png"
       alt="The chat composer with an @mention autocomplete list open above it, showing checked-in stations to tag.">
  <figcaption>Typing @ offers only stations actually checked into this net.</figcaption>
</figure>

## Reacting to a message

Hovering over someone else's message shows a small row of emoji reactions. Click one to add it; the count appears under the message, and clicking a reaction you've already added removes it. You can't react to your own messages — the backend rejects it — which is why the reaction row only appears when you hover a message from someone else.

## Editing and muting

Hovering your own message shows an edit pencil (text messages only — an uploaded image can't be rewritten). Editing replaces the message in place and marks it "(edited)"; there's no version history, because the point is a corrected net log, not a paper trail of typos.

Hovering anyone else's message shows a mute icon: **mute this station**, for you only. It hides that callsign's messages in your own view of this one net — nobody else is affected, and it doesn't touch the net's actual log or export. A banner above the chat shows how many stations you (or, on a net with staff-applied mutes, anyone) currently have muted, with a manage list to undo it. If Net Control has muted someone for the whole net (a moderation action, not something a participant can do), you won't be told who did it — only that the station is muted.

## Topic of the Week and the poll

If a net has a **Topic of the Week** or a **poll** running, you don't answer it in chat — you answer it right in the [check-in form](/docs/operators/checking-in/), which shows the live question as context above a text field for your response. Results (a tally for a poll, a list of responses for a topic) are shown as a summary once the net closes.

This is a separate feature from chat itself; the two happen to be enabled by the same kind of net (a community/club net rather than a formal traffic net), which is why they're covered on one page.

## Activity, separately from chat

Chat itself never shows check-in, check-out, or other system events — those post to a separate **Activity Log** panel next to chat, not into the conversation. If you want to follow who's coming and going without it mixing into the actual conversation, that's the panel to open. There's no way to turn chat off entirely for a net you're viewing; muting individual stations (above) is the tool for filtering what you see there.
