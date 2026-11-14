// ========== NET FEATURE SECTIONS ==========
// Which options are on in each folding section of the net and schedule
// forms' Basic Info tab (components/forms/NetFeaturesPanel.tsx), and whether
// each section starts open. Pure, so the rule is unit-tested
// (netFeatureSections.test.ts) and both forms read it from one place.
//
// The rule: a section starts open when any of its options is on, and folded
// otherwise. A switch that is on by default and only refines another option
// (Hide muted stations from ICS-309, Allow stations to self-report) does not
// count, or the ARES section would open on every new net.

export type FeatureSectionId = 'community' | 'ares' | 'skywarn';

export type FeatureSectionExpansion = Record<FeatureSectionId, boolean>;

// The values the chips are read from. Both form contexts carry these under
// the same names.
export interface FeatureSectionValues {
  topicOfWeekEnabled: boolean;
  pollEnabled: boolean;
  ics309Enabled: boolean;
  propagationLoggingEnabled: boolean;
  authenticated: boolean;
  trafficStripFormType: string;
  trafficStripTemplate: string;
  // Net form only: saved sites (blank rows excluded). Omit on the schedule.
  siteCount?: number;
}

// One chip per option that is on, in the order the options appear.
export function featureSectionChips(values: FeatureSectionValues): Record<FeatureSectionId, string[]> {
  const community: string[] = [];
  if (values.topicOfWeekEnabled) community.push('Topic of the Week');
  if (values.pollEnabled) community.push('Poll');

  const ares: string[] = [];
  if (values.ics309Enabled) ares.push('ICS-309');
  if (values.propagationLoggingEnabled) ares.push('Coverage logging');
  if (values.siteCount) ares.push(`Sites (${values.siteCount})`);
  if (values.authenticated) ares.push('Authenticated');

  const skywarn: string[] = [];
  if (values.trafficStripFormType || values.trafficStripTemplate.trim()) skywarn.push('RRI strips');

  return { community, ares, skywarn };
}

// Top-level options in each section, for the "N options" count. The net
// form's ARES section has one more (Sites) than the schedule's.
export function featureSectionOptionCounts(scope: 'net' | 'schedule'): Record<FeatureSectionId, number> {
  return {
    community: 2, // Topic of the Week, Participant Poll
    // ICS-309, Hide muted stations, Coverage logging, Authenticated Net (+ Sites on a net)
    ares: scope === 'net' ? 5 : 4,
    skywarn: 2, // Strip type, Originating strip
  };
}

// Open the sections that have something on. Decided once, after the form's
// data has loaded; the panel never folds a section on its own afterwards.
export function initialFeatureSectionExpansion(values: FeatureSectionValues): FeatureSectionExpansion {
  const chips = featureSectionChips(values);
  return {
    community: chips.community.length > 0,
    ares: chips.ares.length > 0,
    skywarn: chips.skywarn.length > 0,
  };
}
