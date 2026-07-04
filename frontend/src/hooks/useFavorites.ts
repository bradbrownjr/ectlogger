import { useState } from 'react';

// ========== useFavorites ==========
// Shared hook for star/favorite toggles on net schedules.
// Both Dashboard and Scheduler use the same localStorage key so favorites
// stay in sync across both pages.

export function useFavorites(userId: number | undefined | null): [Set<number>, (id: number) => void] {
  const favKey = `scheduler-favorites-${userId ?? 'anon'}`;

  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(favKey);
      return raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      try { localStorage.setItem(favKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  return [favorites, toggleFavorite];
}
