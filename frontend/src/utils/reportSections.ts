// ========== REPORT SECTIONS ==========
// What goes into a net's closing email and onto its report page, chosen on
// the Reports tab of the net and schedule forms and saved as
// `report_sections` (a list of section keys, or null).
//
// The catalogue itself (labels, help, which feature each section needs, and
// the legacy defaults) comes from GET /report-sections
// (backend services/report_sections.py), so the key list lives in one place.
// This file holds the rules the form and the report page apply to it.
//
// Null means "never configured": the email is the one sent before the Reports
// tab existed, and the report page shows every section. The switches then
// show those legacy defaults, and saving keeps sending null until somebody
// changes a switch. The first change saves an explicit list: every default
// key for the current format, including ones whose feature is off right now,
// plus or minus the change. Keeping those means a net that turns on Topic of
// the Week later still gets the topic in its email, as it would have before
// the change. A key in a saved list stays in it while its feature is off: the
// switch is hidden, the backend skips it, and it comes back with the feature.
// "Use the default sections" sets the value back to null.

export type ReportSectionKey =
  | 'figures'
  | 'ics309_log'
  | 'topic'
  | 'poll'
  | 'coverage'
  | 'traffic'
  | 'announcements'
  | 'chat_log'
  | 'report_link';

// One entry from GET /report-sections, in display order.
export interface ReportSectionEntry {
  key: string;
  label: string;
  help: string;
  // Form fields of which at least one must be on; empty = always available
  requires_any: string[];
  legacy_plain: boolean;
  legacy_ics309: boolean;
}

// The form state the catalogue's requires_any names. has_sites is true on a
// net with coverage sites and always false on a schedule.
export interface ReportFormFeatures {
  ics309_enabled: boolean;
  topic_of_week_enabled: boolean;
  poll_enabled: boolean;
  propagation_logging_enabled: boolean;
  has_sites: boolean;
  traffic_enabled: boolean;
}

export type SavedReportSections = string[] | null | undefined;

// A section's switch shows only when its feature is on in the form.
export function isSectionAvailable(entry: ReportSectionEntry, features: ReportFormFeatures): boolean {
  if (entry.requires_any.length === 0) return true;
  return entry.requires_any.some((field) => Boolean((features as unknown as Record<string, boolean>)[field]));
}

// The keys a null value stands for: the ICS-309 defaults when ICS-309 is on
// in ARES & EmComm, the plain-log defaults otherwise.
export function legacySectionKeys(catalogue: ReportSectionEntry[], features: ReportFormFeatures): string[] {
  return catalogue
    .filter((entry) => (features.ics309_enabled ? entry.legacy_ics309 : entry.legacy_plain))
    .map((entry) => entry.key);
}

// Which switches show as on.
export function effectiveSectionKeys(
  saved: SavedReportSections,
  catalogue: ReportSectionEntry[],
  features: ReportFormFeatures,
): Set<string> {
  return new Set(saved == null ? legacySectionKeys(catalogue, features) : saved);
}

// The value to save after one switch changes. Always an explicit list, in
// catalogue order; see the file header for how a null value converts.
export function toggleReportSection(
  saved: SavedReportSections,
  key: string,
  on: boolean,
  catalogue: ReportSectionEntry[],
  features: ReportFormFeatures,
): string[] {
  const base = saved == null ? legacySectionKeys(catalogue, features) : saved;
  const next = new Set(base);
  if (on) next.add(key);
  else next.delete(key);
  const order = new Map(catalogue.map((entry, i) => [entry.key, i]));
  // Keys the catalogue no longer lists keep their place at the end.
  return Array.from(next).sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
}

// ========== REPORT PAGE ==========
// The sections of a net's report page, in page order. A section tied to a
// catalogue key follows the net's saved switches; the rest always show.
// Masthead, NCS and frequencies are not listed: they are the report's header.

export type ReportPageSectionId =
  | 'figures'
  | 'graphs'
  | 'map'
  | 'coverage'
  | 'checkins'
  | 'announcements'
  | 'topic'
  | 'poll'
  | 'chat'
  | 'ics309'
  | 'activity';

export interface ReportPageSection {
  id: ReportPageSectionId;
  label: string;
  // The saved switch this section follows; none = always shown
  key?: ReportSectionKey;
  // Always in an export (the check-in log is the point of the report)
  required?: boolean;
  // Also part of the Export PNG images
  inImages?: boolean;
}

export const REPORT_PAGE_SECTIONS: ReportPageSection[] = [
  { id: 'figures', label: 'Headline figures', key: 'figures', inImages: true },
  { id: 'graphs', label: 'Graphs', inImages: true },
  { id: 'map', label: 'Check-in map', inImages: true },
  { id: 'coverage', label: 'Sites and station coverage', key: 'coverage' },
  { id: 'checkins', label: 'Check-in log', required: true, inImages: true },
  { id: 'announcements', label: 'Announcements and notes', key: 'announcements' },
  { id: 'topic', label: 'Topic of the Week', key: 'topic' },
  { id: 'poll', label: 'Poll results', key: 'poll' },
  { id: 'chat', label: 'Chat messages', key: 'chat_log' },
  { id: 'ics309', label: 'ICS-309 log', key: 'ics309_log' },
  { id: 'activity', label: 'Activity log' },
];

// Whether the net's saved switches let a report page section show. Null
// shows everything, as the report did before the Reports tab.
export function reportPageAllows(id: ReportPageSectionId, saved: SavedReportSections): boolean {
  const section = REPORT_PAGE_SECTIONS.find((s) => s.id === id);
  if (!section?.key || saved == null) return true;
  return saved.includes(section.key);
}
