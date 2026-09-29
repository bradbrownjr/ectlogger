// ========== CHECK-IN FIELDS SHOWN ON A NET ==========
// Each net turns its check-in fields on and off (net.field_config). A field
// that is off is never rendered, so the NCS can't see or clear what's in it,
// which means it must never be sent either. Callsign lookup used to fill
// the Spotter # from a station's profile even when the net didn't show it;
// NB9D's profile held "YOUTUBE.COM/@NB9D", the server's spam guard rejected
// it, and because the form keeps its values after a failed save, the NCS
// couldn't check in that station or anyone after it until they turned the
// field on to clear it (NH SKYWARN net, 2026-09-29).

// The built-in fields a net can turn off. Anything else in field_config is
// a custom field, whose value lives in custom_fields.
export const CHECKIN_TOGGLEABLE_FIELDS = [
  'name', 'location', 'skywarn_number', 'weather_observation',
  'power_source', 'power', 'feedback', 'notes',
] as const;

type FieldConfig = Record<string, { enabled?: boolean } | undefined> | null | undefined;

export function isFieldShown(fieldConfig: FieldConfig, fieldName: string): boolean {
  return !!fieldConfig?.[fieldName]?.enabled;
}

// A copy of a check-in payload with every field the net doesn't show
// removed, including hidden custom fields. On an update the server merges
// custom_fields and leaves omitted fields alone, so dropping a hidden value
// here never erases it. With no field_config loaded there is nothing to go
// on, so the payload is returned unchanged.
export function withOnlyShownFields<T extends Record<string, any>>(values: T, fieldConfig: FieldConfig): T {
  if (!fieldConfig) return values;
  const result: Record<string, any> = { ...values };
  for (const field of CHECKIN_TOGGLEABLE_FIELDS) {
    if (!isFieldShown(fieldConfig, field)) delete result[field];
  }
  if (result.custom_fields) {
    result.custom_fields = Object.fromEntries(
      Object.entries(result.custom_fields).filter(([key]) => isFieldShown(fieldConfig, key)),
    );
  }
  return result as T;
}
