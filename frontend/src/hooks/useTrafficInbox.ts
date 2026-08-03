import { useCallback, useEffect, useState } from 'react';
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

  const refetch = useCallback(async () => {
    if (!isAuthenticated) {
      setCount(0);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await trafficApi.getInbox();
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

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, refetch]);

  // A hop logged on any net this tab is connected to should refresh the
  // badge -- dispatched as a window CustomEvent by useNetWebSocket.ts,
  // matching the trafficLogged/TrafficPanel.tsx convention.
  useEffect(() => {
    const handleTrafficLogChanged = () => refetch();
    window.addEventListener('trafficLogChanged', handleTrafficLogChanged);
    return () => window.removeEventListener('trafficLogChanged', handleTrafficLogChanged);
  }, [refetch]);

  return { count, items, loading, error, refetch };
}

export default useTrafficInbox;
