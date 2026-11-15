import { describe, it, expect } from 'vitest';
import { wheelToTabScroll, isDrag, selectedTabOverflow } from './tabScroll';

const overflowing = { scrollLeft: 100, scrollWidth: 1000, clientWidth: 400 };

describe('wheelToTabScroll', () => {
  it('turns a vertical wheel turn into sideways movement', () => {
    expect(wheelToTabScroll({ deltaX: 0, deltaY: 120, deltaMode: 0 }, overflowing)).toBe(120);
    expect(wheelToTabScroll({ deltaX: 0, deltaY: -120, deltaMode: 0 }, overflowing)).toBe(-120);
  });

  it('scales line and page wheel modes to pixels', () => {
    expect(wheelToTabScroll({ deltaX: 0, deltaY: 3, deltaMode: 1 }, overflowing)).toBe(48);
    expect(wheelToTabScroll({ deltaX: 0, deltaY: 1, deltaMode: 2 }, overflowing)).toBe(400);
  });

  it('leaves the wheel alone when every tab already fits', () => {
    const fits = { scrollLeft: 0, scrollWidth: 400, clientWidth: 400 };
    expect(wheelToTabScroll({ deltaX: 0, deltaY: 120, deltaMode: 0 }, fits)).toBeNull();
  });

  it('leaves sideways gestures to the browser', () => {
    expect(wheelToTabScroll({ deltaX: 80, deltaY: 10, deltaMode: 0 }, overflowing)).toBeNull();
  });

  it('hands scrolling back to the page at either end of the row', () => {
    const atStart = { ...overflowing, scrollLeft: 0 };
    const atEnd = { ...overflowing, scrollLeft: 600 };
    expect(wheelToTabScroll({ deltaX: 0, deltaY: -120, deltaMode: 0 }, atStart)).toBeNull();
    expect(wheelToTabScroll({ deltaX: 0, deltaY: 120, deltaMode: 0 }, atEnd)).toBeNull();
    expect(wheelToTabScroll({ deltaX: 0, deltaY: 120, deltaMode: 0 }, atStart)).toBe(120);
    expect(wheelToTabScroll({ deltaX: 0, deltaY: -120, deltaMode: 0 }, atEnd)).toBe(-120);
  });
});

describe('isDrag', () => {
  it('treats a small wobble as a click', () => {
    expect(isDrag(100, 104)).toBe(false);
    expect(isDrag(100, 96)).toBe(false);
  });

  it('treats a longer move as a drag', () => {
    expect(isDrag(100, 110)).toBe(true);
    expect(isDrag(100, 90)).toBe(true);
  });
});

describe('selectedTabOverflow', () => {
  const row = { left: 88, right: 712 };

  it('scrolls a tab cut off on the right into view', () => {
    // Admin's Activity tab once the arrows appeared (measured 2026-11-15).
    expect(selectedTabOverflow({ left: 665, right: 792 }, row)).toBe(80);
  });

  it('scrolls a tab cut off on the left into view', () => {
    expect(selectedTabOverflow({ left: 40, right: 160 }, row)).toBe(-48);
  });

  it('leaves a tab that fits', () => {
    expect(selectedTabOverflow({ left: 200, right: 320 }, row)).toBe(0);
  });

  it('lines up the start of a tab wider than the row', () => {
    expect(selectedTabOverflow({ left: 100, right: 900 }, row)).toBe(12);
  });
});
