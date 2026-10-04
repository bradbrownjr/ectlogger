// ========== POLL AND TOPIC SUMMARIES (derived from check-ins) ==========
// The poll results, the poll answer suggestions, and the Topic of the Week
// answer list are all computed from the net's check-in list, which the page
// already keeps live over the WebSocket. Until 2026-10-04 each was fetched
// once when the net loaded and never again, so anyone who had the page open
// during the net saw the answers as they stood when they arrived: on the ME
// Dirigo Net (net 114) the closed-net summary showed only W1BKW's answer while
// the table beside it showed a dozen. Deriving them means they can never
// disagree with the table.
//
// Same rules as the backend's /poll-results, /poll-responses and
// /topic-responses (routers/nets_polls.py), which the net report still uses:
// every row counts (a recheck's answer included), blank answers are skipped.

export interface ResponseCheckIn {
  callsign: string;
  name?: string | null;
  topic_response?: string | null;
  poll_response?: string | null;
  checked_in_at: string;
}

export interface TopicResponses {
  prompt: string | null;
  responses: { callsign: string; name: string; response: string }[];
}

export interface PollResults {
  question: string | null;
  results: { response: string; count: number }[];
}

const answered = (value?: string | null): value is string => !!value && value.trim() !== '';

/** Topic answers in check-in order, with the net's prompt. */
export function summarizeTopicResponses(checkIns: ResponseCheckIn[], prompt: string | null): TopicResponses {
  const responses = checkIns
    .filter((c) => answered(c.topic_response))
    .sort((a, b) => new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime())
    .map((c) => ({ callsign: c.callsign, name: c.name || '', response: c.topic_response as string }));
  return { prompt, responses };
}

/** Each distinct poll answer with how many check-ins gave it, most votes first. */
export function summarizePollResults(checkIns: ResponseCheckIn[], question: string | null): PollResults {
  const counts = new Map<string, number>();
  for (const c of checkIns) {
    if (answered(c.poll_response)) counts.set(c.poll_response, (counts.get(c.poll_response) || 0) + 1);
  }
  const results = [...counts.entries()]
    .map(([response, count]) => ({ response, count }))
    .sort((a, b) => b.count - a.count || a.response.localeCompare(b.response));
  return { question, results };
}

/** Distinct poll answers given so far, alphabetical: suggestions for the next one. */
export function distinctPollResponses(checkIns: ResponseCheckIn[]): string[] {
  return [...new Set(checkIns.map((c) => c.poll_response).filter(answered))].sort((a, b) => a.localeCompare(b));
}
