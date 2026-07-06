import { useState, useEffect } from 'react';
import { statisticsApi } from '../services/api';

// ========== useUserStats ==========
// Fetches the current user's activity statistics (check-in counts, NCS
// history, frequent nets, etc.) once on mount. Extracted verbatim from
// Profile.tsx.

export function useUserStats() {
  const [userStats, setUserStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        const response = await statisticsApi.getUserStats();
        setUserStats(response.data);
      } catch (err) {
        console.error('Failed to fetch user stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchUserStats();
  }, []);

  return { userStats, statsLoading };
}
