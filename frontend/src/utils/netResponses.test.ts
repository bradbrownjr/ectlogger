import { describe, expect, it } from 'vitest';
import { distinctPollResponses, summarizePollResults, summarizeTopicResponses } from './netResponses';

const ci = (callsign: string, at: string, extra: Record<string, string | null> = {}) => ({
  callsign, name: callsign.toLowerCase(), checked_in_at: at, ...extra,
});

describe('summarizeTopicResponses', () => {
  it('lists every answered check-in in check-in order, skipping blanks', () => {
    const checkIns = [
      ci('W1BKW', '2026-10-04T14:05:00Z', { topic_response: 'Project Graduation' }),
      ci('AA1LO', '2026-10-04T14:01:00Z', { topic_response: 'Field Day' }),
      ci('W1MTW', '2026-10-04T14:02:00Z', { topic_response: '   ' }),
      ci('W1SUE', '2026-10-04T14:03:00Z'),
    ];
    const summary = summarizeTopicResponses(checkIns, 'What events?');
    expect(summary.prompt).toBe('What events?');
    expect(summary.responses.map((r) => r.callsign)).toEqual(['AA1LO', 'W1BKW']);
    expect(summary.responses[0]).toEqual({ callsign: 'AA1LO', name: 'aa1lo', response: 'Field Day' });
  });

  it('picks up an answer added after the first summary (the stale-list bug)', () => {
    const early = [ci('W1BKW', '2026-10-04T14:05:00Z', { topic_response: 'Project Graduation' })];
    const later = [...early, ci('AA1LO', '2026-10-04T14:01:00Z', { topic_response: 'Field Day' })];
    expect(summarizeTopicResponses(early, null).responses).toHaveLength(1);
    expect(summarizeTopicResponses(later, null).responses).toHaveLength(2);
  });
});

describe('poll summaries', () => {
  const checkIns = [
    ci('A', '2026-10-04T14:00:00Z', { poll_response: 'Yes' }),
    ci('B', '2026-10-04T14:01:00Z', { poll_response: 'No' }),
    ci('C', '2026-10-04T14:02:00Z', { poll_response: 'Yes' }),
    ci('D', '2026-10-04T14:03:00Z', { poll_response: '' }),
    ci('E', '2026-10-04T14:04:00Z', { poll_response: 'Maybe' }),
  ];

  it('counts each answer, most votes first, ties alphabetical', () => {
    expect(summarizePollResults(checkIns, 'Q?')).toEqual({
      question: 'Q?',
      results: [{ response: 'Yes', count: 2 }, { response: 'Maybe', count: 1 }, { response: 'No', count: 1 }],
    });
  });

  it('suggests each distinct answer once, alphabetically', () => {
    expect(distinctPollResponses(checkIns)).toEqual(['Maybe', 'No', 'Yes']);
  });
});
