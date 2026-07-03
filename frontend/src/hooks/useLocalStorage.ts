import { useState, useCallback } from 'react';

/**
 * useState that automatically reads from and writes to localStorage.
 * Drop-in replacement for useState when the value should survive a page refresh.
 *
 * Values are JSON-serialized on write and deserialized on read. Old values
 * written as raw strings (before this hook existed) are returned as-is via
 * a fallback if JSON.parse fails, so the migration is backward-compatible.
 *
 * Usage:
 *   const [viewMode, setViewMode] = useLocalStorage<'card' | 'list'>(
 *     STORAGE_KEYS.DASHBOARD_VIEW_MODE, 'card'
 *   );
 */
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      // Try JSON first; fall back to raw string for values written before this hook
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // localStorage unavailable (private mode, storage quota exceeded, etc.)
      }
    },
    [key],
  );

  return [storedValue, setValue];
}

export default useLocalStorage;
