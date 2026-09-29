import { describe, it, expect } from 'vitest';
import { withOnlyShownFields } from './checkInFields';
import { isValidSpotterNumber } from './spotterNumber';

describe('withOnlyShownFields', () => {
  const fieldConfig = {
    name: { enabled: true },
    location: { enabled: true },
    skywarn_number: { enabled: false },
    county: { enabled: true },
    hidden_custom: { enabled: false },
  };

  it('drops a hidden field so its value can never block a check-in', () => {
    // The 2026-09-29 shape: lookup had put a link in Spotter #, which the net didn't show.
    const payload = withOnlyShownFields(
      { callsign: 'NB9D', name: 'Neil', location: 'NH', skywarn_number: 'YOUTUBE.COM/@NB9D', status: 'checked_in' },
      fieldConfig,
    );
    expect(payload).toEqual({ callsign: 'NB9D', name: 'Neil', location: 'NH', status: 'checked_in' });
  });

  it('keeps shown custom fields and drops hidden ones', () => {
    const payload = withOnlyShownFields({ callsign: 'W1AW', custom_fields: { county: 'York', hidden_custom: 'x' } }, fieldConfig);
    expect(payload.custom_fields).toEqual({ county: 'York' });
  });

  it('leaves the payload alone when no field config is loaded', () => {
    const values = { callsign: 'W1AW', skywarn_number: 'YO248' };
    expect(withOnlyShownFields(values, undefined)).toBe(values);
  });
});

describe('isValidSpotterNumber', () => {
  it.each(['YO248', 'CU-330', 'WST150', '21-028', 'oun 42', ''])('accepts %s', (value) => {
    expect(isValidSpotterNumber(value)).toBe(true);
  });

  it.each(['YOUTUBE.COM/@NB9D', 'me@example.com', '-248', 'A'.repeat(21)])('rejects %s', (value) => {
    expect(isValidSpotterNumber(value)).toBe(false);
  });
});
