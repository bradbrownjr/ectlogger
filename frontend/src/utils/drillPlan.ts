// ========== DRILL PLAN TYPES AND RULES ==========
// The exercise plan on a net (backend routers/drill_plans.py). Shapes match
// schemas.DrillPlanResponse; the helpers decide which rows go in a site's
// packet and how a row's status reads, so the page and the printed copies
// never disagree.

export type ObjectiveRating = 'P' | 'S' | 'M' | 'U';

// HSEEP AAR/IP ratings (backend models.DRILL_OBJECTIVE_RATINGS).
export const OBJECTIVE_RATING_LABELS: Record<ObjectiveRating, string> = {
  P: 'Performed without challenges',
  S: 'Performed with some challenges',
  M: 'Performed with major challenges',
  U: 'Unable to be performed',
};

export const EXERCISE_MARKING = 'THIS IS AN EXERCISE';

export interface DrillMessage {
  to_name?: string | null;
  to_position?: string | null;
  from_name?: string | null;
  from_position?: string | null;
  subject?: string | null;
  message?: string | null;
  priority?: 'Routine' | 'Urgent' | 'Emergency' | null;
  reply_requested?: 'Yes' | 'No' | null;
}

export interface DrillObjective {
  id?: number;
  heading?: string | null;
  text: string;
  rating?: ObjectiveRating | null;
  result_note?: string | null;
}

export interface DrillEvent {
  id?: number;
  time_label?: string | null;
  initiator?: string | null;
  receiver?: string | null;
  event_type?: string | null;
  method?: string | null;
  description?: string | null;
  expected_actions?: string | null;
  site_id?: number | null;
  message?: DrillMessage | null;
  form_id?: number | null;
  form_status?: string | null;
  form_message_number?: string | null;
  sent_at?: string | null;
}

export interface DrillPlan {
  id?: number;
  net_id?: number;
  exercise_name?: string | null;
  exercise_when?: string | null;
  location?: string | null;
  purpose?: string | null;
  scenario?: string | null;
  announcement?: string | null;
  objectives: DrillObjective[];
  events: DrillEvent[];
  updated_at?: string | null;
  can_edit?: boolean;
}

export const DEFAULT_ANNOUNCEMENT =
  'Every net announces that it is an exercise at its start, during, and at its end. ' +
  'Every formal or tactical message says "This is an exercise" at its beginning and end.';

export const newPlan = (netName: string): DrillPlan => ({
  exercise_name: netName,
  announcement: DEFAULT_ANNOUNCEMENT,
  objectives: [],
  events: [],
});

export const newMessage = (): DrillMessage => ({ priority: 'Routine', reply_requested: 'No' });

// Rows in a site's packet: its own rows plus the ones for every site.
export const eventsForSite = (events: DrillEvent[], siteId: number | null): DrillEvent[] =>
  siteId == null ? events : events.filter((e) => e.site_id == null || e.site_id === siteId);

// What a message row's status reads. Not sent until it is filed; then the
// form's latest step in the chain of custody.
export function messageStatus(event: DrillEvent): { label: string; tone: 'default' | 'warning' | 'info' | 'success' | 'error' } | null {
  if (!event.message) return null;
  if (!event.form_id) return { label: 'Not sent', tone: 'default' };
  switch (event.form_status) {
    case 'received': return { label: 'Received', tone: 'info' };
    case 'relayed': return { label: 'Relayed', tone: 'info' };
    case 'delivered': return { label: 'Delivered', tone: 'success' };
    case 'cancelled': return { label: 'Cancelled', tone: 'error' };
    default: return { label: 'Sent', tone: 'warning' };
  }
}

// The message text as it goes out: opened and closed with the marking,
// matching backend app/traffic/exercise.py::mark_exercise_text.
export function markExerciseText(text: string | null | undefined): string {
  const body = (text || '').trim();
  const upper = body.toUpperCase();
  if (upper.startsWith(EXERCISE_MARKING) && upper.endsWith(EXERCISE_MARKING)) return body;
  return body ? `${EXERCISE_MARKING}\n\n${body}\n\n${EXERCISE_MARKING}` : EXERCISE_MARKING;
}

// Objectives grouped under their headings, in order. A run of rows with the
// same heading is one group, numbered from 1.
export function groupObjectives(objectives: DrillObjective[]): { heading: string | null; items: DrillObjective[] }[] {
  const groups: { heading: string | null; items: DrillObjective[] }[] = [];
  for (const o of objectives) {
    const heading = (o.heading || '').trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(o);
    else groups.push({ heading, items: [o] });
  }
  return groups;
}
