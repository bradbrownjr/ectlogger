import { useState } from 'react';
import useLocalStorage from './useLocalStorage';
import { STORAGE_KEYS } from '../utils/localStorageKeys';

// Drop-in replacement for useLocalStorage, for Net View layout state only
// (panel open/docked/minimized flags, resizable split weights). Respects
// the user's "Remember Net View Layout" preference (Profile -> Settings,
// default on): when it's off, this behaves like plain in-memory useState -
// nothing is read from or written to localStorage - so layout doesn't
// survive leaving the page. When it's on, behaves exactly like
// useLocalStorage (today's behavior, unchanged).
//
// Both underlying hooks are always called, unconditionally, so this never
// violates the rules of hooks - only which pair's value/setter gets
// returned depends on the preference, evaluated fresh each render.
function useNetViewLayoutStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [remember] = useLocalStorage<boolean>(STORAGE_KEYS.REMEMBER_NET_VIEW_LAYOUT, true);
  const [sessionValue, setSessionValue] = useState<T>(initialValue);
  const [persistedValue, setPersistedValue] = useLocalStorage<T>(key, initialValue);

  return remember ? [persistedValue, setPersistedValue] : [sessionValue, setSessionValue];
}

export default useNetViewLayoutStorage;
