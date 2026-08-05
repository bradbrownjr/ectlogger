import { describe, it, expect } from 'vitest';
import { parseLocation } from './locationParser';

describe('parseLocation', () => {
  it('parses a bare Maidenhead grid square, landing in southern Maine', () => {
    const result = parseLocation('FN43si');
    expect(result?.type).toBe('maidenhead');
    expect(result?.lat).toBeGreaterThan(43);
    expect(result?.lat).toBeLessThan(44);
    expect(result?.lon).toBeGreaterThan(-71);
    expect(result?.lon).toBeLessThan(-70);
  });

  // Regression test: production net 56's KC1UIX logged "KENNEBUNK FN43SI"
  // (place name + grid, a common convention) and never mapped at all --
  // parseMaidenhead's whole-string match rejected it, it fell through to
  // geocoding "KENNEBUNK FN43SI" as a literal address (which fails), and
  // since KC1UIX was the reporting station in nearly every can-hear report,
  // no coverage line involving it could ever be drawn.
  it('extracts an embedded Maidenhead grid from "City GRIDSQUARE"', () => {
    const withCity = parseLocation('KENNEBUNK FN43SI');
    const bareGrid = parseLocation('FN43SI');
    expect(withCity?.type).toBe('maidenhead');
    expect(withCity?.lat).toBeCloseTo(bareGrid!.lat, 10);
    expect(withCity?.lon).toBeCloseTo(bareGrid!.lon, 10);
    // The displayed/stored text should stay the full original string, not
    // just the extracted grid token.
    expect(withCity?.original).toBe('KENNEBUNK FN43SI');
  });

  it('extracts an embedded grid regardless of which word it is', () => {
    const result = parseLocation('FN43si Kennebunk Maine');
    expect(result?.type).toBe('maidenhead');
  });

  it('still geocodes a plain address with no grid token', () => {
    const result = parseLocation('Biddeford, ME');
    expect(result?.type).toBe('address');
    expect(result?.lat).toBe(0);
    expect(result?.lon).toBe(0);
  });

  it('does not misparse an ordinary town name as a grid square', () => {
    // "Acton" is 5 letters; nothing here should coincidentally match the
    // grid pattern (2 letters + 2 digits [+ 2 letters [+ 2 digits]]).
    const result = parseLocation('Acton');
    expect(result?.type).not.toBe('maidenhead');
  });

  it('parses plain GPS coordinates before trying grid extraction', () => {
    const result = parseLocation('43.6591, -70.2568');
    expect(result?.type).toBe('gps');
  });
});
