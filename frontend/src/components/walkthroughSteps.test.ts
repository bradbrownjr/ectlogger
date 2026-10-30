import { describe, it, expect } from 'vitest';
import { OPERATOR_STEPS, NET_CONTROL_STEPS, netCreationLimitsText } from './walkthroughSteps';

// Collect every docs page's permalink from its front matter, so a "Learn more"
// link that points at a renamed or removed page fails here. Vite reads the
// markdown as raw text, which keeps this free of node-only imports.
const pages = import.meta.glob('../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const permalinks = new Set<string>();
for (const text of Object.values(pages)) {
  const m = /^permalink:\s*(\S+)/m.exec(text.split('\n---')[0]);
  if (m) permalinks.add(m[1]);
}

it('finds the docs pages', () => {
  expect(permalinks.size).toBeGreaterThan(20);
});

describe.each([
  ['operator', OPERATOR_STEPS],
  ['net-control', NET_CONTROL_STEPS],
])('%s walkthrough path', (_name, steps) => {
  it('has steps', () => {
    expect(steps.length).toBeGreaterThan(0);
  });

  it.each(steps.map((s) => [s.title, s] as const))('%s is complete and links to a real page', (_t, s) => {
    expect(s.title.trim()).not.toBe('');
    expect(s.body.trim()).not.toBe('');
    expect(s.learnMore.trim()).not.toBe('');
    expect(s.body).not.toContain('—');
    expect(permalinks.has(s.learnMore)).toBe(true);
  });
});

describe('netCreationLimitsText', () => {
  it('names both limits with this instance\'s numbers', () => {
    expect(netCreationLimitsText({ minAccountAgeDays: 7, minNetsCheckedInto: 1 })).toBe(
      'A new account can create a net once it is at least 7 days old and has checked into at least 1 net. An admin can give you early access.',
    );
  });

  it('leaves out a limit set to 0', () => {
    expect(netCreationLimitsText({ minAccountAgeDays: 0, minNetsCheckedInto: 3 })).toBe(
      'A new account can create a net once it has checked into at least 3 nets. An admin can give you early access.',
    );
    expect(netCreationLimitsText({ minAccountAgeDays: 1, minNetsCheckedInto: 0 })).toBe(
      'A new account can create a net once it is at least 1 day old. An admin can give you early access.',
    );
  });

  it('says nothing when both are off', () => {
    expect(netCreationLimitsText({ minAccountAgeDays: 0, minNetsCheckedInto: 0 })).toBe('');
  });

  it('gives a general version when the limits are unknown', () => {
    expect(netCreationLimitsText(null)).toMatch(/^A new account may need/);
  });

  it('is on the Create a net card only', () => {
    expect(NET_CONTROL_STEPS.filter((s) => s.showsCreationLimits).map((s) => s.title)).toEqual(['Create a net']);
    expect(OPERATOR_STEPS.some((s) => s.showsCreationLimits)).toBe(false);
  });
});
