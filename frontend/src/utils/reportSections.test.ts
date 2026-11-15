import { describe, expect, it } from 'vitest';
import {
  ReportFormFeatures,
  ReportSectionEntry,
  effectiveSectionKeys,
  isSectionAvailable,
  legacySectionKeys,
  reportPageAllows,
  toggleReportSection,
} from './reportSections';

// A catalogue shaped like GET /report-sections (P2 contract)
const entry = (key: string, requires_any: string[], legacy_plain: boolean, legacy_ics309: boolean): ReportSectionEntry => ({
  key, label: key, help: '', requires_any, legacy_plain, legacy_ics309,
});
const CATALOGUE: ReportSectionEntry[] = [
  entry('report_link', [], false, false),
  entry('figures', [], false, false),
  entry('ics309_log', ['ics309_enabled'], false, true),
  entry('topic', ['topic_of_week_enabled'], true, false),
  entry('poll', ['poll_enabled'], true, false),
  entry('coverage', ['propagation_logging_enabled', 'has_sites'], true, false),
  entry('traffic', ['traffic_enabled'], true, false),
  entry('announcements', [], false, false),
  entry('chat_log', [], true, false),
];

const OFF: ReportFormFeatures = {
  ics309_enabled: false,
  topic_of_week_enabled: false,
  poll_enabled: false,
  propagation_logging_enabled: false,
  has_sites: false,
  traffic_enabled: false,
};

describe('isSectionAvailable', () => {
  it('always offers a section with no requirement', () => {
    expect(isSectionAvailable(CATALOGUE[0], OFF)).toBe(true);
  });
  it('needs one of the named features on', () => {
    const coverage = CATALOGUE.find((e) => e.key === 'coverage')!;
    expect(isSectionAvailable(coverage, OFF)).toBe(false);
    expect(isSectionAvailable(coverage, { ...OFF, has_sites: true })).toBe(true);
    expect(isSectionAvailable(coverage, { ...OFF, propagation_logging_enabled: true })).toBe(true);
  });
});

describe('legacySectionKeys', () => {
  it('uses the plain defaults when ICS-309 is off', () => {
    expect(legacySectionKeys(CATALOGUE, OFF)).toEqual(['topic', 'poll', 'coverage', 'traffic', 'chat_log']);
  });
  it('uses the ICS-309 defaults when ICS-309 is on', () => {
    expect(legacySectionKeys(CATALOGUE, { ...OFF, ics309_enabled: true })).toEqual(['ics309_log']);
  });
});

describe('effectiveSectionKeys', () => {
  it('shows the legacy defaults for null and undefined', () => {
    expect([...effectiveSectionKeys(null, CATALOGUE, OFF)]).toEqual(['topic', 'poll', 'coverage', 'traffic', 'chat_log']);
    expect([...effectiveSectionKeys(undefined, CATALOGUE, OFF)]).toEqual(['topic', 'poll', 'coverage', 'traffic', 'chat_log']);
  });
  it('shows a saved list as saved, even an empty one', () => {
    expect([...effectiveSectionKeys(['figures'], CATALOGUE, OFF)]).toEqual(['figures']);
    expect([...effectiveSectionKeys([], CATALOGUE, OFF)]).toEqual([]);
  });
});

describe('toggleReportSection', () => {
  it('turns null into every default plus the change, features off included', () => {
    const features = { ...OFF, poll_enabled: true };
    expect(toggleReportSection(null, 'figures', true, CATALOGUE, features))
      .toEqual(['figures', 'topic', 'poll', 'coverage', 'traffic', 'chat_log']);
  });
  it('turns null into the defaults minus the switch turned off', () => {
    expect(toggleReportSection(null, 'chat_log', false, CATALOGUE, OFF))
      .toEqual(['topic', 'poll', 'coverage', 'traffic']);
  });
  it('starts from the ICS-309 defaults when ICS-309 is on', () => {
    const features = { ...OFF, ics309_enabled: true };
    expect(toggleReportSection(null, 'announcements', true, CATALOGUE, features))
      .toEqual(['ics309_log', 'announcements']);
    expect(toggleReportSection(null, 'ics309_log', false, CATALOGUE, features)).toEqual([]);
  });
  it('keeps a saved key whose feature is off', () => {
    expect(toggleReportSection(['topic', 'chat_log'], 'figures', true, CATALOGUE, OFF))
      .toEqual(['figures', 'topic', 'chat_log']);
  });
  it('keeps catalogue order and never duplicates', () => {
    expect(toggleReportSection(['chat_log', 'figures'], 'figures', true, CATALOGUE, OFF))
      .toEqual(['figures', 'chat_log']);
  });
});

describe('reportPageAllows', () => {
  it('shows everything for null', () => {
    expect(reportPageAllows('chat', null)).toBe(true);
    expect(reportPageAllows('ics309', undefined)).toBe(true);
  });
  it('hides a switched section missing from the list', () => {
    expect(reportPageAllows('chat', ['figures'])).toBe(false);
    expect(reportPageAllows('chat', ['chat_log'])).toBe(true);
    expect(reportPageAllows('coverage', [])).toBe(false);
  });
  it('always shows sections with no switch', () => {
    expect(reportPageAllows('graphs', [])).toBe(true);
    expect(reportPageAllows('checkins', [])).toBe(true);
    expect(reportPageAllows('activity', [])).toBe(true);
  });
});
