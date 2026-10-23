// ========== MERGE CONFLICT ROWS ==========
// The Merge Schedules dialog lists the settings where a schedule being merged
// differs from the master. The server reports each as raw stored values
// (templates_merge.py::_compare_template_fields), which read as JSON for the
// schedule and the check-in fields: `{"day_of_week": 2, "time": "19:00"}`.
// This turns them into rows a net manager can read: one "When it runs" row
// in the same words as the schedule card, and the check-in fields named
// without dumping their configuration.

export interface MergeConflict {
  field: string;
  target_value?: string | null;
  source_value?: string | null;
  source_template_name: string;
  source_template_id?: number | null;
}

export interface MergeConflictRow {
  field: string;
  sourceName: string;
  /** Both null when the values can't be shown in a line. */
  masterValue: string | null;
  sourceValue: string | null;
}

const SCHEDULE_FIELDS = new Set(['Schedule type', 'Schedule config']);
const UNSHOWABLE_FIELDS = new Set(['Field configuration']);

/**
 * @param describeSchedule how a schedule card words a schedule's recurrence,
 *   by schedule id (Scheduler.tsx passes formatSchedule over its list).
 */
export function describeMergeConflicts(
  conflicts: MergeConflict[],
  targetId: number | null,
  describeSchedule: (id: number) => string | undefined,
): MergeConflictRow[] {
  const rows: MergeConflictRow[] = [];
  const scheduleRowFor = new Set<string>();

  for (const c of conflicts) {
    const sourceKey = String(c.source_template_id ?? c.source_template_name);
    if (SCHEDULE_FIELDS.has(c.field)) {
      // Type and config describe one thing, when the net runs: one row.
      if (scheduleRowFor.has(sourceKey)) continue;
      scheduleRowFor.add(sourceKey);
      const master = targetId != null ? describeSchedule(targetId) : undefined;
      const source = c.source_template_id != null ? describeSchedule(c.source_template_id) : undefined;
      rows.push({
        field: 'When it runs',
        sourceName: c.source_template_name,
        masterValue: master ?? null,
        sourceValue: source ?? null,
      });
      continue;
    }
    if (UNSHOWABLE_FIELDS.has(c.field)) {
      rows.push({ field: 'Check-in fields', sourceName: c.source_template_name, masterValue: null, sourceValue: null });
      continue;
    }
    rows.push({
      field: c.field,
      sourceName: c.source_template_name,
      masterValue: c.target_value ?? '(empty)',
      sourceValue: c.source_value ?? '(empty)',
    });
  }
  return rows;
}
