// ========== COMMUNICATION PLAN TABLE ==========
// Filtering, ordering and paging for the shared frequency list on the
// Communication Plan tab (components/forms/CommunicationPlanPanel.tsx).
// Pure, so the rules are unit-tested (communicationPlanTable.test.ts).
//
// The list is every frequency on the site (48 on production in 2026-11), so
// it is paged. Filter and "Selected only" narrow the whole list before it is
// paged. By default the frequencies the net or schedule already used when
// the tab opened are listed first, so they are on page 1; clicking a column
// heading sorts by that column alone.

export type FrequencySortField = 'mode' | 'frequency' | 'talkgroup' | 'description';
export type SortDirection = 'asc' | 'desc';

export interface FrequencyRow {
  id?: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

// Case-insensitive match on any text column. Selected only keeps the rows
// whose box is ticked.
export function filterFrequencies<T extends FrequencyRow>(
  frequencies: T[],
  filter: string,
  selectedOnly: boolean,
  selectedIds: number[],
): T[] {
  const s = filter.toLowerCase();
  return frequencies.filter((freq) => {
    if (selectedOnly && !(freq.id != null && selectedIds.includes(freq.id))) return false;
    if (!s) return true;
    return [freq.frequency, freq.mode, freq.network, freq.talkgroup, freq.description]
      .some((value) => value?.toLowerCase().includes(s));
  });
}

const sortValue = (f: FrequencyRow, field: FrequencySortField): string => {
  switch (field) {
    case 'mode': return f.mode || '';
    case 'frequency': return f.frequency || f.network || '';
    case 'talkgroup': return f.talkgroup || '';
    case 'description': return f.description || '';
  }
};

// Sort by one column, numbers in order (146.52 before 446.0). With
// `pinnedIds`, those rows come first, each group in column order. The
// caller passes a snapshot of the ids selected when the tab opened, not the
// live selection, so ticking a box doesn't move its row.
export function sortFrequencies<T extends FrequencyRow>(
  frequencies: T[],
  field: FrequencySortField,
  direction: SortDirection,
  pinnedIds: number[] | null,
): T[] {
  const pinned = new Set(pinnedIds ?? []);
  const isPinned = (f: T) => f.id != null && pinned.has(f.id);
  return [...frequencies].sort((a, b) => {
    if (pinnedIds) {
      const pa = isPinned(a);
      const pb = isPinned(b);
      if (pa !== pb) return pa ? -1 : 1;
    }
    const cmp = sortValue(a, field).localeCompare(sortValue(b, field), undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? cmp : -cmp;
  });
}

// The last page that has rows (0 when there are none). Keeps the page in
// range when the list shrinks under it, e.g. a row deleted or unticked
// with Selected only on. rowsPerPage -1 means All.
export function clampPage(page: number, count: number, rowsPerPage: number): number {
  if (rowsPerPage < 0 || count === 0) return 0;
  const lastPage = Math.ceil(count / rowsPerPage) - 1;
  return Math.min(Math.max(page, 0), lastPage);
}

export function pageRows<T>(rows: T[], page: number, rowsPerPage: number): T[] {
  if (rowsPerPage < 0) return rows;
  const start = clampPage(page, rows.length, rowsPerPage) * rowsPerPage;
  return rows.slice(start, start + rowsPerPage);
}
