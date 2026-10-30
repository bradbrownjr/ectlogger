import { describe, expect, it } from 'vitest';
import { formFromCheckIn, ownCheckInChanges } from './ownCheckInEdit';

const checkIn = {
  id: 7, callsign: 'KC1VYM', name: 'Pat', location: 'Manchester, NH', status: 'checked_in',
  frequency_id: 1, available_frequencies: [1], custom_fields: {},
  coverage_site_id: null, operating_position: null,
};
const fieldConfig = {
  name: { enabled: true }, location: { enabled: true }, fldigi: { enabled: true },
  skywarn_number: { enabled: false }, notes: { enabled: false },
};

describe('ownCheckInChanges', () => {
  it('sends a ticked custom field, and leaves the frequency, site and status alone', () => {
    const original = formFromCheckIn(checkIn);
    const form = { ...original, custom_fields: { fldigi: 'true' } };
    const changes = ownCheckInChanges(original, form, fieldConfig);
    expect(changes.custom_fields).toEqual({ fldigi: 'true' });
    expect(changes).not.toHaveProperty('frequency_id');
    expect(changes).not.toHaveProperty('coverage_site_id');
    expect(changes).not.toHaveProperty('status');
  });

  it('drops the fields this net hides', () => {
    const original = formFromCheckIn(checkIn);
    const changes = ownCheckInChanges(original, original, fieldConfig);
    expect(changes).not.toHaveProperty('skywarn_number');
    expect(changes).not.toHaveProperty('notes');
    expect(changes.name).toBe('Pat');
  });

  it('sends a changed frequency', () => {
    const original = formFromCheckIn(checkIn);
    const changes = ownCheckInChanges(original, { ...original, frequency_id: 2 }, fieldConfig);
    expect(changes.frequency_id).toBe(2);
  });

  it('sends no frequency for an In person station', () => {
    const original = formFromCheckIn({ ...checkIn, status: 'in_person', frequency_id: null, available_frequencies: [] });
    const changes = ownCheckInChanges(original, original, fieldConfig);
    expect(changes).not.toHaveProperty('frequency_id');
    expect(changes).not.toHaveProperty('available_frequency_ids');
  });

  it('sends the site and status the Site box changed', () => {
    const original = formFromCheckIn(checkIn);
    const form = { ...original, status: 'mobile', operating_position: null, coverage_site_id: 3 };
    const changes = ownCheckInChanges(original, form, fieldConfig);
    expect(changes.coverage_site_id).toBe(3);
    expect(changes.status).toBe('mobile');
  });
});
