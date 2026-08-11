import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordDiagnosticIssue,
  getDiagnosticIssues,
  resetDiagnosticIssues,
  formatDiagnostics,
} from './clientDiagnostics';

describe('recordDiagnosticIssue', () => {
  beforeEach(() => {
    resetDiagnosticIssues();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('records an issue', () => {
    recordDiagnosticIssue('popover-offscreen', 'a menu rendered offscreen');
    const issues = getDiagnosticIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('popover-offscreen');
  });

  it('collapses repeats of the same problem instead of filling the buffer', () => {
    // A mispositioned menu can re-report on every scroll; ten copies of one
    // problem is less useful to a support reader than ten distinct ones.
    for (let i = 0; i < 25; i++) recordDiagnosticIssue('popover-offscreen', 'same detail');
    expect(getDiagnosticIssues()).toHaveLength(1);
  });

  it('keeps distinct problems, bounded to the buffer size', () => {
    for (let i = 0; i < 25; i++) recordDiagnosticIssue('kind', `detail ${i}`);
    const issues = getDiagnosticIssues();
    expect(issues.length).toBeLessThanOrEqual(10);
    // The most recent survive; the oldest are dropped.
    expect(issues[issues.length - 1].detail).toBe('detail 24');
  });

  it('never throws, so diagnostics cannot break the page they diagnose', () => {
    expect(() => recordDiagnosticIssue('kind', undefined as unknown as string)).not.toThrow();
  });
});

describe('formatDiagnostics', () => {
  beforeEach(() => resetDiagnosticIssues());

  it('renders one "Label: value" line per field', () => {
    const text = formatDiagnostics({ 'App version': '2026.08.11', Viewport: '1600 x 650 px' });
    expect(text).toBe('App version: 2026.08.11\nViewport: 1600 x 650 px');
  });

  it('carries no personal or net content in a default snapshot', () => {
    // Guard rail: the whole premise of this panel is that it is safe to paste
    // into an email, so a field naming a person or a net must never appear.
    const text = formatDiagnostics().toLowerCase();
    for (const forbidden of ['callsign', 'email', '@', 'net_id', 'password', 'token']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
