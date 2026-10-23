import { describe, expect, it } from 'vitest';
import { describeMergeConflicts } from './mergeConflicts';

const words: Record<number, string> = { 1: 'Tuesdays at 7:00 PM', 2: 'Thursdays at 7:30 PM' };
const describeSchedule = (id: number) => words[id];

describe('describeMergeConflicts', () => {
  it('shows a schedule difference in words, once, not as JSON', () => {
    const rows = describeMergeConflicts([
      { field: 'Schedule type', target_value: 'weekly', source_value: 'monthly', source_template_name: 'SKYWARN', source_template_id: 2 },
      { field: 'Schedule config', target_value: '{"day_of_week": 2}', source_value: '{"day_of_week": 4}', source_template_name: 'SKYWARN', source_template_id: 2 },
    ], 1, describeSchedule);
    expect(rows).toEqual([
      { field: 'When it runs', sourceName: 'SKYWARN', masterValue: 'Tuesdays at 7:00 PM', sourceValue: 'Thursdays at 7:30 PM' },
    ]);
  });

  it('gives each source schedule its own When it runs row', () => {
    const rows = describeMergeConflicts([
      { field: 'Schedule config', source_template_name: 'A', source_template_id: 2 },
      { field: 'Schedule config', source_template_name: 'B', source_template_id: 3 },
    ], 1, describeSchedule);
    expect(rows.map((r) => r.sourceName)).toEqual(['A', 'B']);
  });

  it('names check-in fields without their configuration', () => {
    const [row] = describeMergeConflicts([
      { field: 'Field configuration', target_value: '{"name": {}}', source_value: '{}', source_template_name: 'A', source_template_id: 2 },
    ], 1, describeSchedule);
    expect(row).toEqual({ field: 'Check-in fields', sourceName: 'A', masterValue: null, sourceValue: null });
  });

  it('passes plain values through, with empty ones marked', () => {
    const [row] = describeMergeConflicts([
      { field: 'Topic prompt', target_value: null, source_value: 'Favorite antenna?', source_template_name: 'A', source_template_id: 2 },
    ], 1, describeSchedule);
    expect(row).toEqual({ field: 'Topic prompt', sourceName: 'A', masterValue: '(empty)', sourceValue: 'Favorite antenna?' });
  });
});
