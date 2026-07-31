import { useEffect, useRef, useState, useCallback } from 'react';
import { userApi } from '../services/api';

/**
 * Sort-order preference that lives on the user's account (dashboard_sort_order /
 * schedule_sort_order) instead of per-browser localStorage, so the choice follows
 * the user across devices instead of silently resetting on a new browser.
 *
 * On first run for a given legacyStorageKey, if that key still holds a value from
 * before this migration, it's pushed up to the account once (so a user who'd
 * already picked "alpha" doesn't get reset to the new default) and then cleared.
 */
function useAccountSortOrder<T extends string>(
  accountValue: T | undefined,
  field: 'dashboard_sort_order' | 'schedule_sort_order',
  fallback: T,
  legacyStorageKey: string,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(accountValue ?? fallback);
  const migrated = useRef(false);

  useEffect(() => {
    if (accountValue === undefined) return;

    if (!migrated.current) {
      migrated.current = true;
      const legacy = window.localStorage.getItem(legacyStorageKey);
      let legacyValue: T | null = null;
      if (legacy) {
        try {
          legacyValue = JSON.parse(legacy) as T;
        } catch {
          legacyValue = legacy as T;
        }
      }
      window.localStorage.removeItem(legacyStorageKey);

      if (legacyValue && legacyValue !== accountValue) {
        setValue(legacyValue);
        userApi.updateProfile({ [field]: legacyValue }).catch(() => {});
        return;
      }
    }

    setValue(accountValue);
  }, [accountValue, field, legacyStorageKey]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      userApi.updateProfile({ [field]: next }).catch(() => {});
    },
    [field],
  );

  return [value, update];
}

export default useAccountSortOrder;
