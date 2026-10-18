import { describe, it, expect } from 'vitest';
import { fitFloatingRect } from './floatingWindow';

// Announcements' default window, the shape reported on 2026-10-18.
const ANNOUNCEMENTS = { x: 100, y: 100, width: 500, height: 400 };

describe('fitFloatingRect', () => {
  it('leaves a window that already fits alone', () => {
    expect(fitFloatingRect(ANNOUNCEMENTS, { width: 1440, height: 900 })).toEqual(ANNOUNCEMENTS);
  });

  it('fits a phone in portrait, keeping the title-bar buttons on screen', () => {
    const fitted = fitFloatingRect(ANNOUNCEMENTS, { width: 360, height: 780 });
    expect(fitted).toEqual({ x: 8, y: 100, width: 344, height: 400 });
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(360);
  });

  it('brings a window back onto a landscape page instead of leaving it below it', () => {
    // A window dragged low in portrait, then the phone turned: NetView's zoom
    // leaves a page about 450 local pixels tall.
    const fitted = fitFloatingRect({ x: 0, y: 480, width: 344, height: 400 }, { width: 975, height: 450 });
    expect(fitted).toEqual({ x: 0, y: 42, width: 344, height: 400 });
  });

  it('shrinks a window taller than the page', () => {
    const fitted = fitFloatingRect({ x: 0, y: 60, width: 300, height: 500 }, { width: 975, height: 300 });
    expect(fitted).toEqual({ x: 0, y: 8, width: 300, height: 284 });
  });

  it('never returns a negative position or size', () => {
    const fitted = fitFloatingRect({ x: -40, y: -10, width: 500, height: 400 }, { width: 10, height: 10 });
    expect(fitted.x).toBeGreaterThanOrEqual(0);
    expect(fitted.y).toBeGreaterThanOrEqual(0);
    expect(fitted.width).toBeGreaterThanOrEqual(0);
    expect(fitted.height).toBeGreaterThanOrEqual(0);
  });
});
