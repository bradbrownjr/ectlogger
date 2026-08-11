import { describe, it, expect } from 'vitest';
import {
  parseTransformOrigin,
  correctZoomedCoordinate,
  isEchoOfOwnWrite,
  isPlausiblePosition,
} from './zoomAwarePopovers';

describe('parseTransformOrigin', () => {
  it('parses the "Xpx Ypx" string Popover writes', () => {
    expect(parseTransformOrigin('200px 0px')).toEqual({ x: 200, y: 0 });
  });

  it('parses negative and fractional values', () => {
    expect(parseTransformOrigin('-12.5px 33px')).toEqual({ x: -12.5, y: 33 });
  });

  it('returns null for anything unparseable', () => {
    expect(parseTransformOrigin('')).toBeNull();
    expect(parseTransformOrigin('center')).toBeNull();
  });
});

describe('correctZoomedCoordinate', () => {
  // Worked example from zoomAwarePopovers.ts's own derivation: a
  // right-anchored 200px-wide menu, button's visual right edge at 800,
  // zoom 0.8. Popover (unaware of zoom) writes left = 800 - 200 = 600.
  const zoom = 0.8;
  const writtenLeft = 600;
  const localOriginX = 200; // transformOrigin.horizontal: 'right' -> offsetWidth

  it('lands the menu flush with its anchor, not offset by the menu width', () => {
    const corrected = correctZoomedCoordinate(writtenLeft, localOriginX, zoom);
    // What the browser renders is corrected * zoom (the second, real zoom
    // application) minus the paper's own visual width (localOriginX * zoom,
    // since it's right-anchored) -- that must equal the anchor's visual
    // right edge, 800.
    const renderedRightEdge = corrected * zoom + localOriginX * zoom;
    expect(renderedRightEdge).toBeCloseTo(800, 10);
  });

  it('is a no-op correction beyond the simple divide when the origin is 0 (left/top anchoring)', () => {
    // The default MUI anchoring (transformOrigin horizontal/vertical: 'left'/
    // 'top') has no width/height term at all, so this must reduce to the
    // plain divide-by-zoom the Tooltip fix already uses.
    expect(correctZoomedCoordinate(writtenLeft, 0, zoom)).toBeCloseTo(writtenLeft / zoom, 10);
  });

  it('is unaffected when zoom is 1 (no zoom active)', () => {
    expect(correctZoomedCoordinate(500, 200, 1)).toBeCloseTo(500, 10);
  });
});

describe('isEchoOfOwnWrite', () => {
  // Regression: every Menu/Select on the net view opened at roughly 1e23px --
  // far offscreen, so the control looked completely dead -- on any viewport
  // under 800px tall. The echo check used to compare style strings, but the
  // browser re-serializes the float it is handed, so our own write came back
  // looking like a fresh position from Popover and got corrected again on
  // every mutation, compounding the divide-by-zoom without limit.
  it('recognizes a write that the browser rounded on read-back', () => {
    expect(isEchoOfOwnWrite(253.74999999999997, 253.75)).toBe(true);
  });

  it('still recognizes an exact echo', () => {
    expect(isEchoOfOwnWrite(300, 300)).toBe(true);
  });

  it('does not mistake a genuine reposition for an echo', () => {
    expect(isEchoOfOwnWrite(300, 480)).toBe(false);
  });

  it('treats a never-written axis as matching only another never-written one', () => {
    expect(isEchoOfOwnWrite(null, null)).toBe(true);
    expect(isEchoOfOwnWrite(null, 120)).toBe(false);
    expect(isEchoOfOwnWrite(120, null)).toBe(false);
  });

  it('stops the runaway: a corrected value re-read is never corrected twice', () => {
    const zoom = 0.8;
    let written = correctZoomedCoordinate(200, 0, zoom);
    // Simulate the browser handing the value back with float noise, the way
    // the real CSSOM read-back did.
    for (let i = 0; i < 50; i++) {
      const readBack = parseFloat(written.toFixed(2));
      if (isEchoOfOwnWrite(written, readBack)) break;
      written = correctZoomedCoordinate(readBack, 0, zoom);
    }
    expect(isPlausiblePosition(written)).toBe(true);
    expect(written).toBeCloseTo(250, 1);
  });
});

describe('isPlausiblePosition', () => {
  it('accepts ordinary on-screen coordinates', () => {
    expect(isPlausiblePosition(0)).toBe(true);
    expect(isPlausiblePosition(-40)).toBe(true);
    expect(isPlausiblePosition(4000)).toBe(true);
  });

  it('accepts a never-written axis', () => {
    expect(isPlausiblePosition(null)).toBe(true);
  });

  it('rejects the diverged coordinates the runaway used to produce', () => {
    expect(isPlausiblePosition(1.6164e23)).toBe(false);
    expect(isPlausiblePosition(Infinity)).toBe(false);
    expect(isPlausiblePosition(NaN)).toBe(false);
  });
});
