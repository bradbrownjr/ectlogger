import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLocation, geocodeAddress } from './locationParser';

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

describe('geocodeAddress', () => {
  // Regression test: production net 56's K1DQ logged "County Rd, Shapliegh,
  // ME" -- a rural road Nominatim has no named entity for -- and never
  // mapped at all, even though "Shapliegh, ME" alone resolves fine. K1DQ
  // was described as at a strategic location heard by many other stations,
  // so no pin at all was worse than an approximate town-level one.
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const q = decodeURIComponent(url.split('q=')[1] || '');
      calls.push(q);
      // Only a query with exactly two comma-segments ("City, State") ever
      // resolves in this mock, mirroring Nominatim's real behavior for a
      // road with no named-entity match.
      const resolves = q.split(',').map(s => s.trim()).filter(Boolean).length === 2;
      return {
        ok: true,
        json: async () => (resolves ? { lat: 43.4, lon: -70.8 } : null),
      } as Response;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to "City, State" when the full street address fails', async () => {
    const result = await geocodeAddress('County Rd, Shapliegh, ME');
    expect(result).toEqual({ lat: 43.4, lon: -70.8 });
    expect(calls).toEqual(['County Rd, Shapliegh, ME', 'Shapliegh, ME']);
  });

  it('does not retry when the full address already resolves', async () => {
    const result = await geocodeAddress('Shapliegh, ME');
    expect(result).toEqual({ lat: 43.4, lon: -70.8 });
    expect(calls).toEqual(['Shapliegh, ME']);
  });

  it('never drops down to a single bare segment', async () => {
    const result = await geocodeAddress('123 County Rd, Shapliegh, ME, USA');
    // Stops as soon as a 2-segment fallback ("ME, USA") resolves, without
    // ever trying a lone "ME" or "USA".
    expect(result).toEqual({ lat: 43.4, lon: -70.8 });
    expect(calls).toEqual(['123 County Rd, Shapliegh, ME, USA', 'Shapliegh, ME, USA', 'ME, USA']);
    expect(calls.every(c => c.includes(','))).toBe(true);
  });

  it('returns null without retrying when there is nothing left to drop', async () => {
    const result = await geocodeAddress('Nowhereville');
    expect(result).toBeNull();
    expect(calls).toEqual(['Nowhereville']);
  });
});
