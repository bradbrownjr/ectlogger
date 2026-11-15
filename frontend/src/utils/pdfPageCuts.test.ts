import { describe, expect, it } from 'vitest';
import { computeSmartBoundaries } from './pdfExport';

// Lines of text 20 px tall every 30 px, as measureAvoidRanges reports them.
const lines = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ top: i * 30 + 5, bottom: i * 30 + 25 }));

describe('computeSmartBoundaries', () => {
  it('moves a cut that would split a line of text to just above that line', () => {
    // The natural cut at 100 falls inside the line at 95-115
    expect(computeSmartBoundaries(300, 100, lines(10))).toEqual([0, 95, 185, 275, 300]);
  });

  it('keeps the natural cut when it falls between lines', () => {
    expect(computeSmartBoundaries(200, 90, lines(6))).toEqual([0, 90, 180, 200]);
  });

  it('ignores something taller than a page instead of leaving a near-empty page', () => {
    const tall = [{ top: 0, bottom: 250 }];
    expect(computeSmartBoundaries(250, 100, tall)).toEqual([0, 100, 200, 250]);
  });
});
