import type { FormDefinition } from '../hooks/useFormDefinitions';

// ========== RRI STRIP SETTINGS RULES ==========
// Shared by the two halves of components/forms/TrafficSettingsPanel.tsx:
// the traffic list (General Net Features) and the strip fields (SKYWARN
// Features). Pure, so the rules are unit-tested (trafficStripSettings.test.ts).

// The "Strip type" picker offers only types with real named fields (WXOBS,
// GYX-CAR-SKYWARN, anything defined via "Parse and name the fields"), found
// by output_format rather than a hardcoded form_type list so a type defined
// at runtime appears with no further change. RRI_STRIP_OTHER (output_format
// 'rri_strip_raw') is deliberately excluded even though it is a strip: it's
// the raw catch-all with generic Label/Call Sign/Strip Text fields, not named
// RI answer fields, so pointing a net at it as "the strip type this net
// collects" would show staff the catch-all form instead of the origin
// strip's actual fields.
export const isNamedStripDefinition = (d: FormDefinition) => d.output_format === 'rri_strip';

// The form type a pasted originating strip is filed as: the raw catch-all
// (RRI_STRIP_OTHER on a stock install; TrafficComposer.tsx files the net's
// own strip under it). Looked up by output_format, not by name, for the same
// reason. Null when the instance has it disabled.
export const rawStripFormType = (definitions: FormDefinition[]): string | null =>
  definitions.find((d) => d.output_format === 'rri_strip_raw')?.form_type ?? null;

// Strips are filed as traffic, so a strip the net collects has to be on the
// net's accepted list. An empty list already means "every form type", and
// adding one entry to it would narrow the net to that type alone, so an
// empty list is returned unchanged. Returns the same array when nothing
// changes, so callers can skip the state update.
export function acceptStripFormType(formTypes: string[], formType: string | null): string[] {
  if (!formType || formTypes.length === 0 || formTypes.includes(formType)) return formTypes;
  return [...formTypes, formType];
}
