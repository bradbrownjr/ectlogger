import { describe, expect, it } from 'vitest';
import { eventsForSite, groupObjectives, markExerciseText, messageStatus } from './drillPlan';

describe('drill plan rules', () => {
  it('puts a site\'s own rows and every-site rows in its packet', () => {
    const events = [{ site_id: null }, { site_id: 1 }, { site_id: 2 }];
    expect(eventsForSite(events, 1)).toEqual([{ site_id: null }, { site_id: 1 }]);
    expect(eventsForSite(events, null)).toHaveLength(3);
  });

  it('reads a message row\'s status from its form', () => {
    expect(messageStatus({})).toBeNull();
    expect(messageStatus({ message: {} })?.label).toBe('Not sent');
    expect(messageStatus({ message: {}, form_id: 4, form_status: 'originated' })?.label).toBe('Sent');
    expect(messageStatus({ message: {}, form_id: 4, form_status: 'delivered' })?.label).toBe('Delivered');
  });

  it('marks message text once, like the server', () => {
    const marked = markExerciseText('Request 40 cots.');
    expect(marked).toBe('THIS IS AN EXERCISE\n\nRequest 40 cots.\n\nTHIS IS AN EXERCISE');
    expect(markExerciseText(marked)).toBe(marked);
  });

  it('groups runs of objectives under their heading', () => {
    const groups = groupObjectives([
      { heading: 'A', text: '1' }, { heading: 'A', text: '2' }, { heading: '', text: '3' }, { heading: 'B', text: '4' },
    ]);
    expect(groups.map((g) => [g.heading, g.items.length])).toEqual([['A', 2], [null, 1], ['B', 1]]);
  });
});
