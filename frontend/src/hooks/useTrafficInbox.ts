import { useCallback, useEffect, useState } from 'react';
import useVisibilityAwareInterval from './useVisibilityAwareInterval';
import { useAuth } from '../contexts/AuthContext';
import { trafficApi } from '../services/api';
import { TrafficForm } from './useTrafficList';

// ========== useTrafficInbox ==========
// Fetches GET /traffic/inbox: the caller's pending-held traffic, oldest
// first. Shared by the Navbar badge (count only) and the Profile "My
// Traffic" tab (count + items), per docs/concepts/TRAFFIC-HANDLING-DESIGN.md
// section 4.4. Refetches when a traffic_log_changed WebSocket event fires
// for any net (the badge has no single net_id to filter on, unlike
// TrafficPanel.tsx's per-net refetch), and on a slow poll as a fallback for
// hops logged while the caller isn't viewing an active net at all.

const POLL_INTERVAL_MS = 60000;

export function useTrafficInbox() {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<TrafficForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `background` is set by the poll below, so an idle open tab stops counting
  // as operator activity on the backend (see services/api.ts's
  // BACKGROUND_REQUEST_CONFIG). A user-initiated load leaves it false.
  const refetch = useCallback(async (background = false) => {
    if (!isAuthenticated) {
      setCount(0);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await trafficApi.getInbox(background);
      setCount(res.data.count);
      setItems(res.data.items);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to load your traffic inbox');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Paused while the tab is hidden, and refetched on return -- see
  // useVisibilityAwareInterval for why.
  useVisibilityAwareInterval(
    useCallback(() => { refetch(true); }, [refetch]),
    POLL_INTERVAL_MS,
    isAuthenticated,
  );

  // A hop logged on any net this tab is connected to should refresh the
  // badge -- dispatched as a window CustomEvent by useNetWebSocket.ts,
  // matching the trafficLogged/TrafficPanel.tsx convention.
  useEffect(() => {
    const handleTrafficLogChanged = () => refetch();
    // Hops relayed while a net socket was down never reached the badge, so
    // refresh it on reconnect too (see useNetWebSocket.ts).
    const handleResync = () => refetch();
    window.addEventListener('trafficLogChanged', handleTrafficLogChanged);
    window.addEventListener('netResync', handleResync);
    return () => {
      window.removeEventListener('trafficLogChanged', handleTrafficLogChanged);
      window.removeEventListener('netResync', handleResync);
    };
  }, [refetch]);

  return { count, items, loading, error, refetch };
}

export default useTrafficInbox;
