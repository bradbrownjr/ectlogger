import { useState, useEffect } from 'react';
import { userApi } from '../services/api';

// ========== useCoverageStations ==========
// Fetches the current user's personal "can hear" coverage rollup (Phase 5 of
// the "Can hear" inter-station propagation logging feature - see
// docs/ROADMAP.md "Relaying & Propagation Mapping"): stations the user has
// personally confirmed hearing from a "Home" operating position, aggregated
// across all their own reports over time. The query is scoped entirely
// server-side to the current user's own reports (see
// backend/app/routers/users.py get_my_can_hear_coverage for the privacy
// rationale) - this hook just fetches once on mount, same shape as
// useUserStats.ts.

export interface CoverageStation {
  callsign: string;
  // Amateur band label (e.g. "2m", "40m") this rollup entry was heard on.
  // Rows are grouped by (callsign, band) server-side, so the same station
  // heard on two bands appears as two entries.
  band: string | null;
  last_heard: string;
  confirmation_count: number;
  location: string | null;
}

export function useCoverageStations() {
  const [stations, setStations] = useState<CoverageStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoverage = async () => {
      try {
        const response = await userApi.getCanHearCoverage();
        setStations(response.data);
      } catch (err) {
        console.error('Failed to fetch coverage stations:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCoverage();
  }, []);

  return { stations, loading };
}
