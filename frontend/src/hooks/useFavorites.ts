import { useCallback, useEffect, useRef, useState } from 'react';
import { userApi } from '../services/api';

// ========== useFavorites ==========
// The schedules someone starred, shared by the Dashboard and the Scheduler
// (keyed by schedule id). Signed in, they are saved on the account so they
// follow the person to every device (routers/schedule_favorites.py); until
// 2026-10-30 each browser kept its own list (Brad). A guest has no account,
// so a guest's stars stay in this browser.
//
// The first time someone signs in on a browser that still holds stars from
// before, those are added to the account and the browser's copy is cleared,
// so nothing starred is lost and stars from several devices combine.

const legacyKey = (userId: number | 'anon') => `scheduler-favorites-${userId}`;

function readStored(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function useFavorites(
  userId: number | undefined | null,
  onError?: (message: string) => void,
): [Set<number>, (id: number) => void] {
  const signedIn = userId != null;
  const [favorites, setFavorites] = useState<Set<number>>(
    () => new Set(signedIn ? [] : readStored(legacyKey('anon'))),
  );
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Load the account's stars, adding this browser's old ones first.
  useEffect(() => {
    if (!signedIn) {
      setFavorites(new Set(readStored(legacyKey('anon'))));
      return;
    }
    let cancelled = false;
    const key = legacyKey(userId);
    const stored = readStored(key);
    const load = stored.length > 0 ? userApi.addFavoriteSchedules(stored) : userApi.listFavoriteSchedules();
    load
      .then((res) => {
        if (stored.length > 0) {
          try { localStorage.removeItem(key); } catch { /* private mode */ }
        }
        if (!cancelled) setFavorites(new Set(res.data));
      })
      .catch(() => {
        // Keep the browser's copy so a later visit can try again, and show it meanwhile.
        if (!cancelled) setFavorites(new Set(stored));
      });
    return () => { cancelled = true; };
  }, [signedIn, userId]);

  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const setStar = (id: number, starred: boolean) => setFavorites((prev) => {
    const next = new Set(prev);
    if (starred) next.add(id); else next.delete(id);
    return next;
  });

  const toggleFavorite = useCallback((id: number) => {
    const starring = !favoritesRef.current.has(id);
    setStar(id, starring);

    if (!signedIn) {
      const next = new Set(favoritesRef.current);
      if (starring) next.add(id); else next.delete(id);
      try { localStorage.setItem(legacyKey('anon'), JSON.stringify([...next])); } catch { /* private mode */ }
      return;
    }
    // Shown at once; put back if the account didn't take it.
    (starring ? userApi.starSchedule(id) : userApi.unstarSchedule(id)).catch(() => {
      setStar(id, !starring);
      onErrorRef.current?.(starring ? "Couldn't save that star. Try again." : "Couldn't remove that star. Try again.");
    });
  }, [signedIn]);

  return [favorites, toggleFavorite];
}
