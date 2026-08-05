import { describe, it, expect } from 'vitest';
import { parseTransformOrigin, correctZoomedCoordinate } from './zoomAwarePopovers';

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
