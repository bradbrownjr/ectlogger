import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

// ========== useNetWebSocket ==========
// Owns the net's real-time WebSocket: connection, message routing, exponential
// backoff reconnect, and cleanup. Extracted verbatim from NetView so the page
// stays focused on rendering. Returns the live socket so callers can .send().
//
// Behavior preserved from the original inline implementation:
//   - Connects (with optional JWT) on mount and whenever netId changes.
//   - Reconnects with exponential backoff (3s, 6s, 12s ... capped 30s, max 10).
//   - Closes with code 1000 on cleanup so onclose skips the reconnect branch.
// The message handler reads its dependencies through a ref so it always calls
// the current fetch/setter functions (no stale closures), while the connection
// lifecycle stays keyed on netId alone.

interface NetWebSocketDeps {
  netId: string | undefined;
  user: { id?: number } | null;
  fetchCheckIns: () => void;
  fetchNet: () => void;
  fetchNetRoles: () => void;
  fetchNetStats: () => void;
  setActiveSpeakerId: Dispatch<SetStateAction<number | null>>;
  setCheckIns: Dispatch<SetStateAction<any[]>>;
  setToastMessage: Dispatch<SetStateAction<string>>;
  setHighlightCheckIn: Dispatch<SetStateAction<boolean>>;
}

export function useNetWebSocket(deps: NetWebSocketDeps): WebSocket | null {
  const { netId } = deps;
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Keep the latest dependencies in a ref so the long-lived message handler
  // never calls a stale fetch/setter or reads a stale user id.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // WebSocket resilience: live socket, pending retry timeout, attempt count.
  const wsRef = useRef<WebSocket | null>(null);
  const wsRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRetryCountRef = useRef(0);

  useEffect(() => {
    if (!netId) return;

    const connectWebSocket = () => {
      // Get JWT token from localStorage (optional - guests can still connect)
      const token = localStorage.getItem('token');

      // Get WebSocket URL from environment (convert http:// to ws://, https:// to wss://)
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const wsUrl = apiUrl.replace(/^http/, 'ws');

      // Connect with or without token
      const wsUrlWithToken = token ? `${wsUrl}/ws/nets/${netId}?token=${token}` : `${wsUrl}/ws/nets/${netId}`;
      const websocket = new WebSocket(wsUrlWithToken);

      websocket.onopen = () => {
        console.log('WebSocket connected to net', netId);
        wsRetryCountRef.current = 0;
      };

      websocket.onmessage = (event) => {
        const {
          user,
          fetchCheckIns,
          fetchNet,
          fetchNetRoles,
          fetchNetStats,
          setActiveSpeakerId,
          setCheckIns,
          setToastMessage,
          setHighlightCheckIn,
        } = depsRef.current;
        const message = JSON.parse(event.data);
        if (message.type === 'check_in') {
          fetchCheckIns(); // Refresh check-ins on new check-in
        } else if (message.type === 'active_speaker') {
          if (message.data?.checkInId !== undefined) {
            setActiveSpeakerId(message.data.checkInId);
          }
        } else if (message.type === 'active_frequency') {
          if (message.data?.frequencyId !== undefined) {
            fetchNet();
          }
        } else if (message.type === 'chat_message') {
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('newChatMessage', { detail: message.data }));
          }
        } else if (message.type === 'chat_reaction') {
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('chatReactionUpdate', { detail: message.data }));
          }
        } else if (message.type === 'role_change') {
          // Always refresh roles and check-ins for all clients
          fetchNetRoles();
          fetchCheckIns();
          // If the event contains a user_id, and it matches the current user, force a refresh
          if (message.data?.user_id && user?.id === message.data.user_id) {
            fetchNetRoles();
            fetchCheckIns();
          }
        } else if (message.type === 'status_change') {
          fetchCheckIns();
          if (message.data?.user_id && user?.id === message.data.user_id) {
            fetchCheckIns();
          }
        } else if (message.type === 'check_in_deleted') {
          // Remove deleted check-in from local state
          setCheckIns(prev => prev.filter(ci => ci.id !== message.data?.id));
        } else if (message.type === 'hand_raised_changed') {
          // Update the hand_raised state for the affected check-in
          setCheckIns(prev => prev.map(ci =>
            ci.id === message.data?.id
              ? { ...ci, hand_raised: message.data.hand_raised }
              : ci
          ));
        } else if (message.type === 'net_started') {
          // Net has been started - refresh everything first, then highlight check-in
          // Use a small delay to ensure the net status update renders before highlighting
          fetchNet();
          fetchCheckIns();
          fetchNetRoles();
          // Delay the toast and highlight so the check-in button is visible first
          setTimeout(() => {
            setToastMessage(`Net started by ${message.data?.started_by || 'NCS'} - Check in now!`);
            setHighlightCheckIn(true);
            // Remove highlight after 10 seconds
            setTimeout(() => setHighlightCheckIn(false), 10000);
          }, 500);
        } else if (message.type === 'net_lobby_opened') {
          // Lobby is open for early check-ins, either because staff opened it or
          // because the schedule opened it on its own (started_by is null then).
          // Without this branch a viewer already sitting on the net page would
          // never see an automatic open.
          fetchNet();
          fetchCheckIns();
          fetchNetRoles();
          setTimeout(() => {
            setToastMessage(
              message.data?.started_by
                ? `Lobby opened by ${message.data.started_by} - check in early!`
                : 'Lobby is open - check in early!'
            );
            setHighlightCheckIn(true);
            setTimeout(() => setHighlightCheckIn(false), 10000);
          }, 500);
        } else if (message.type === 'net_status_change') {
          // Net status changed (e.g., closed) - refresh net data immediately
          console.log('Net status changed:', message.data);
          fetchNet();
          fetchNetStats();
        } else if (message.type === 'net_pause_change') {
          // No NCS actively present (or one became present again) - refresh
          // net data so paused_at/total_paused_seconds stay in sync for
          // everyone connected, not just the client that triggered it.
          fetchNet();
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      websocket.onclose = (event) => {
        if (event.code === 1008) {
          console.error('WebSocket authentication failed');
        } else if (event.code !== 1000) {
          // Abnormal close — exponential backoff: 3s, 6s, 12s … capped at 30s, max 10 attempts
          const MAX_RETRIES = 10;
          const count = wsRetryCountRef.current;
          if (count >= MAX_RETRIES) {
            console.warn(`WebSocket: max reconnect attempts reached for net ${netId}`);
            return;
          }
          const delay = Math.min(3000 * Math.pow(2, count), 30000);
          console.log(`WebSocket disconnected, reconnecting in ${delay / 1000}s (attempt ${count + 1}/${MAX_RETRIES})...`);
          wsRetryCountRef.current = count + 1;
          wsRetryTimeoutRef.current = setTimeout(() => {
            wsRetryTimeoutRef.current = null;
            if (netId) connectWebSocket();
          }, delay);
        }
      };

      wsRef.current = websocket;
      setWs(websocket);
    };

    connectWebSocket();

    return () => {
      // Cancel any pending reconnect before closing so onclose doesn't reschedule
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
      // Close with code 1000 (Normal Closure) so onclose skips the reconnect branch
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId]);

  return ws;
}
