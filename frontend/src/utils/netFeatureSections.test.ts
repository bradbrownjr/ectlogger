import { describe, expect, it } from 'vitest';
import {
  FeatureSectionValues,
  featureSectionChips,
  featureSectionOptionCounts,
  initialFeatureSectionExpansion,
} from './netFeatureSections';

// A new net's defaults: nothing in a folding section is on
const OFF: FeatureSectionValues = {
  topicOfWeekEnabled: false,
  pollEnabled: false,
  ics309Enabled: false,
  propagationLoggingEnabled: false,
  authenticated: false,
  trafficStripFormType: '',
  trafficStripTemplate: '',
};

describe('featureSectionChips', () => {
  it('has no chips when nothing is on', () => {
    expect(featureSectionChips(OFF)).toEqual({ community: [], ares: [], skywarn: [] });
  });
  it('names each option that is on, in form order', () => {
    expect(featureSectionChips({
      ...OFF,
      topicOfWeekEnabled: true,
      pollEnabled: true,
      ics309Enabled: true,
      propagationLoggingEnabled: true,
      authenticated: true,
      siteCount: 3,
    })).toEqual({
      community: ['Topic of the Week', 'Poll'],
      ares: ['ICS-309', 'Coverage logging', 'Sites (3)', 'Authenticated'],
      skywarn: [],
    });
  });
  it('shows a strip chip for a strip type or a pasted strip', () => {
    expect(featureSectionChips({ ...OFF, trafficStripFormType: 'WXOBS' }).skywarn).toEqual(['RRI strips']);
    expect(featureSectionChips({ ...OFF, trafficStripTemplate: 'SITREP/A/B//' }).skywarn).toEqual(['RRI strips']);
    expect(featureSectionChips({ ...OFF, trafficStripTemplate: '   ' }).skywarn).toEqual([]);
  });
  it('leaves Sites out with no sites, and on the schedule form', () => {
    expect(featureSectionChips({ ...OFF, siteCount: 0 }).ares).toEqual([]);
    expect(featureSectionChips(OFF).ares).toEqual([]);
  });
});

describe('initialFeatureSectionExpansion', () => {
  it('folds every section on a new net', () => {
    expect(initialFeatureSectionExpansion(OFF)).toEqual({ community: false, ares: false, skywarn: false });
  });
  it('opens only the sections with something on', () => {
    expect(initialFeatureSectionExpansion({ ...OFF, ics309Enabled: true })).toEqual({ community: false, ares: true, skywarn: false });
    expect(initialFeatureSectionExpansion({ ...OFF, pollEnabled: true, trafficStripFormType: 'WXOBS' }))
      .toEqual({ community: true, ares: false, skywarn: true });
  });
  it('opens ARES for a net that has sites and nothing else', () => {
    expect(initialFeatureSectionExpansion({ ...OFF, siteCount: 12 }).ares).toBe(true);
  });
});

describe('featureSectionOptionCounts', () => {
  it('counts Sites on the net form only', () => {
    expect(featureSectionOptionCounts('net')).toEqual({ community: 2, ares: 5, skywarn: 2 });
    expect(featureSectionOptionCounts('schedule')).toEqual({ community: 2, ares: 4, skywarn: 2 });
  });
});
