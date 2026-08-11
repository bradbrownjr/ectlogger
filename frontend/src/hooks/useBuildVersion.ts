import { useCallback, useEffect, useState } from 'react';
import useVisibilityAwareInterval from './useVisibilityAwareInterval';

// Checked infrequently and only while the tab is visible (via
// useVisibilityAwareInterval) -- unlike the maintenance banner, a stale
// build is never time-critical to surface, and we never auto-reload, so
// there is no benefit to polling faster than a user might plausibly notice.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

interface UseBuildVersionResult {
  stale: boolean;
  latestBuildId: string | null;
}

// Compares this tab's own build id (embedded at build time, see
// vite.config.ts) against dist/version.json, fetched fresh each poll. A
// mismatch means the server has shipped a newer frontend since this tab
// loaded -- it is running stale JS and no page-load event will ever tell it.
export function useBuildVersion(): UseBuildVersionResult {
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.buildId === 'string') {
        setLatestBuildId(data.buildId);
      }
    } catch {
      // Network hiccup or file briefly missing mid-deploy; next poll retries.
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useVisibilityAwareInterval(check, POLL_INTERVAL_MS, true);

  return {
    stale: latestBuildId !== null && latestBuildId !== __BUILD_ID__,
    latestBuildId,
  };
}

export default useBuildVersion;
