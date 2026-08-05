import { describe, it, expect } from 'vitest';
import { computeCheckInTimeline } from './checkInTimeline';

describe('computeCheckInTimeline', () => {
  it('returns empty for fewer than 2 points', () => {
    expect(computeCheckInTimeline(undefined)).toEqual({ timelineData: [], binSize: 5 });
    expect(computeCheckInTimeline([])).toEqual({ timelineData: [], binSize: 5 });
    expect(computeCheckInTimeline([{ label: '+0m' }])).toEqual({ timelineData: [], binSize: 5 });
  });

  it('bins a normal short net into 2-minute windows', () => {
    const result = computeCheckInTimeline([
      { label: '+0m' }, { label: '+3m' }, { label: '+3m' }, { label: '+9m' },
    ]);
    expect(result.binSize).toBe(2);
    expect(result.timelineData.length).toBeGreaterThan(0);
    expect(result.timelineData.reduce((sum, b) => sum + b.count, 0)).toBe(4);
  });

  // Regression test for the reported crash: beta net 50 had started_at
  // re-stamped to a time AFTER its existing check-ins (a restart that left
  // days-old check-ins attached), so every minutes-from-start value was
  // deeply negative. That drove numBins negative and `new Array()` threw
  // RangeError, which an ErrorBoundary caught as a full page crash.
  it('does not crash when every check-in predates the net start (net 50 scenario)', () => {
    const points = [
      { label: '+-8613m' }, // 2026-07-30 19:27 vs started_at 2026-08-05 01:00
      { label: '+-8594m' },
      { label: '+-4535m' }, // 2026-07-31 21:26
    ];
    expect(() => computeCheckInTimeline(points)).not.toThrow();
    const result = computeCheckInTimeline(points);
    // Clamped to minute 0 -- all three land in the first bin.
    expect(result.timelineData.length).toBeGreaterThan(0);
    expect(result.timelineData[0].count).toBe(3);
  });

  it('handles a mix of pre-start and post-start check-ins without going negative', () => {
    const points = [{ label: '+-30m' }, { label: '+0m' }, { label: '+45m' }];
    const result = computeCheckInTimeline(points);
    expect(result.timelineData.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });

  it('ignores unparseable labels rather than propagating NaN', () => {
    const result = computeCheckInTimeline([{ label: 'garbage' }, { label: '+5m' }, { label: '+10m' }]);
    expect(result.timelineData.reduce((sum, b) => sum + b.count, 0)).toBe(2);
  });
});
