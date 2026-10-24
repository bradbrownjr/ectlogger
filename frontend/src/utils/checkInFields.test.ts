import { describe, it, expect } from 'vitest';
import { fieldLabel, isRelayedByShown, withOnlyShownFields } from './checkInFields';
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

// A built-in field the admin renamed is called that on the net (2026-10-23:
// "Power" renamed "Power (W)" still read "Power" on the check-in row).
describe('fieldLabel', () => {
  it("uses the admin's label", () => {
    expect(fieldLabel([{ name: 'power', label: 'Power (W)' }], 'power')).toBe('Power (W)');
  });
  it('falls back to the built-in wording, then the field name', () => {
    expect(fieldLabel([], 'skywarn_number')).toBe('Spotter #');
    expect(fieldLabel(undefined, 'power_source')).toBe('Power Src');
    expect(fieldLabel([{ name: 'notes', label: '' }], 'notes')).toBe('Notes');
    expect(fieldLabel([], 'mystery')).toBe('mystery');
  });
});

describe('isRelayedByShown', () => {
  const off = { relayed_by: { enabled: false } };

  it('follows the net setting', () => {
    expect(isRelayedByShown({ relayed_by: { enabled: true } }, [])).toBe(true);
    expect(isRelayedByShown(off, [{ status: 'checked_in' }])).toBe(false);
    expect(isRelayedByShown(undefined, [])).toBe(false);
  });

  it('appears on a net that has it off once a station is marked Relay', () => {
    expect(isRelayedByShown(off, [{ status: 'checked_in' }, { status: 'relay' }])).toBe(true);
    expect(isRelayedByShown(off, [{ status: 'RELAY' }])).toBe(true);
  });

  it('never hides a relayed-by callsign already logged', () => {
    expect(isRelayedByShown(off, [{ status: 'checked_in', relayed_by: 'K1COVE' }])).toBe(true);
  });
});
