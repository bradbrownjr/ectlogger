import type { CheckInFormState } from '../components/netview/CheckInFormDialog';
import { DETAIL_FIELDS, type DetailField, withOnlyShownFields } from './checkInFields';

// ========== EDIT YOUR OWN CHECK-IN: FORM AND SAVE ==========
// What EditOwnCheckInDialog loads from a check-in and sends back when a
// station saves its own row (PUT /check-ins/{id}, routers/check_ins.py).

// Spotter # through Notes (utils/checkInFields.ts). The save listed these by
// hand and left Feedback out.
const detailFieldsOf = (source: any) =>
  Object.fromEntries(DETAIL_FIELDS.map((field) => [field, source[field] || ''])) as Record<DetailField, string>;

export const formFromCheckIn = (checkIn: any): CheckInFormState => ({
  callsign: checkIn.callsign || '',
  name: checkIn.name || '',
  location: checkIn.location || '',
  ...detailFieldsOf(checkIn),
  relayed_by: checkIn.relayed_by || '',
  frequency_id: checkIn.frequency_id ?? null,
  available_frequency_ids: checkIn.available_frequencies || [],
  custom_fields: { ...(checkIn.custom_fields || {}) },
  topic_response: checkIn.topic_response || '',
  poll_response: checkIn.poll_response || '',
  status: checkIn.status,
  coverage_site_id: checkIn.coverage_site_id ?? null,
  operating_position: checkIn.operating_position ?? null,
});

// The update to send. Fields the dialog shows always go (minus any the net
// hides); a frequency, site or status only when it moved, since the server
// re-checks each one it is sent, and a status changes here only through
// the Site box (Traveling). In person has no frequency, and the server
// refuses one (_settle_frequencies).
export function ownCheckInChanges(
  original: CheckInFormState,
  form: CheckInFormState,
  fieldConfig: any,
): Record<string, any> {
  const inPerson = form.status === 'in_person';
  const changes: Record<string, any> = {
    callsign: form.callsign,
    name: form.name,
    location: form.location,
    ...detailFieldsOf(form),
    custom_fields: form.custom_fields,
    topic_response: form.topic_response,
    poll_response: form.poll_response,
  };
  if (!inPerson) {
    changes.available_frequency_ids = form.available_frequency_ids;
    if (form.frequency_id !== original.frequency_id) changes.frequency_id = form.frequency_id;
  }
  if (form.coverage_site_id !== original.coverage_site_id || form.operating_position !== original.operating_position) {
    changes.coverage_site_id = form.coverage_site_id;
    changes.operating_position = form.operating_position;
  }
  if (form.status !== original.status) changes.status = form.status;
  return withOnlyShownFields(changes, fieldConfig);
}
