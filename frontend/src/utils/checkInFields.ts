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

// ========== WHAT EACH FIELD IS CALLED ==========
// The admin can rename a built-in field (Admin > Check-in fields: "Power"
// to "Power (W)"); the field list (/settings/fields, loaded by useNetData)
// carries that label. Every heading, label and placeholder for a built-in
// field goes through fieldLabel. Each one used to type its own wording, so
// a rename never reached the net (2026-10-23). The backend's closing email
// does the same (services/field_labels.py).
export const DEFAULT_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  location: 'Location',
  skywarn_number: 'Spotter #',
  weather_observation: 'Weather',
  power_source: 'Power Src',
  power: 'Power',
  feedback: 'Feedback',
  notes: 'Notes',
  relayed_by: 'Relayed By',
};

export function fieldLabel(fieldDefinitions: { name: string; label?: string | null }[] | null | undefined, name: string): string {
  return fieldDefinitions?.find((f) => f.name === name)?.label || DEFAULT_FIELD_LABELS[name] || name;
}

// ========== RELAYED BY ==========
// "Relayed by" (the callsign that passed a check-in along) is a field a net
// turns on like any other, off by default. Until 2026-10-23 its box was on
// every entry row with no way to turn it off. A net that has it off still
// shows it once it's needed: when a station there is marked Relay, or a
// check-in already carries a relayed-by callsign, so the value is never
// hidden from the NCS. That is also why it isn't in CHECKIN_TOGGLEABLE_FIELDS:
// it's shown whenever it holds a value, so there is nothing hidden to strip.
export function isRelayedByShown(
  fieldConfig: FieldConfig,
  checkIns: { status?: string | null; relayed_by?: string | null }[],
): boolean {
  return isFieldShown(fieldConfig, 'relayed_by')
    || checkIns.some((ci) => ci.relayed_by || ci.status?.toLowerCase() === 'relay');
}

// Fields a net can turn on but never require. Most check-ins on a net that
// uses relays still come in direct, so a required Relayed by would block them.
export const NEVER_REQUIRED_FIELDS = ['relayed_by'];
