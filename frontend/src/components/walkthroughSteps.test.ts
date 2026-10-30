import { describe, it, expect } from 'vitest';
import { OPERATOR_STEPS, NET_CONTROL_STEPS } from './walkthroughSteps';

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
