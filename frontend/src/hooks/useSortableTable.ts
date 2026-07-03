import { useState, useCallback, useRef } from 'react';

export type SortDirection = 'asc' | 'desc';

interface UseSortableTableResult<F extends string> {
  sortField: F;
  sortDirection: SortDirection;
  handleSort: (field: F) => void;
}

/**
 * Manages sort field + direction state for a sortable table column header.
 * Clicking the same field toggles direction; clicking a new field resets
 * to the default direction for that field.
 *
 * `initialDirection` accepts either a fixed direction ('asc' | 'desc') or a
 * function `(field: F) => SortDirection` for tables where different columns
 * have different natural sort orders (e.g. a status column defaults to 'desc'
 * while text columns default to 'asc').
 *
 * The caller is responsible for the actual sort computation since sort logic
 * varies per table. The hook owns only the state and toggle behavior.
 *
 * Usage — fixed default:
 *   const { sortField, sortDirection, handleSort } =
 *     useSortableTable<UserSortField>('name');
 *
 * Usage — per-field default:
 *   const { sortField, sortDirection, handleSort } =
 *     useSortableTable<UserSortField>('online', f => f === 'online' ? 'desc' : 'asc');
 *
 *   const sorted = [...items].sort((a, b) => { ... });
 */
function useSortableTable<F extends string>(
  initialField: F,
  initialDirection: SortDirection | ((field: F) => SortDirection) = 'asc',
): UseSortableTableResult<F> {
  const getDir = (field: F): SortDirection =>
    typeof initialDirection === 'function' ? initialDirection(field) : initialDirection;

  const [sortField, setSortField] = useState<F>(initialField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => getDir(initialField));

  // Ref keeps handleSort's reference stable while always seeing the current sortField
  const sortFieldRef = useRef<F>(initialField);

  // Keep ref in sync with state (runs synchronously before handleSort could be called again)
  sortFieldRef.current = sortField;

  const handleSort = useCallback(
    (field: F) => {
      if (sortFieldRef.current === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection(getDir(field));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // stable — reads current field via ref, getDir is derived from props which are constant
  );

  return { sortField, sortDirection, handleSort };
}

export default useSortableTable;
