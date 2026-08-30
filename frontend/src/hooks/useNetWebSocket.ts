import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

// BulkCheckIn.tsx renews its 'bulk_check_in_status' ping every 8s while its
// window is open (see that file). This just needs to comfortably outlast one
// missed ping so a self-clear never races a healthy renewal; it also bounds
// how long the indicator can be stuck on if a sender's tab vanishes (crash,
// force-quit) without ever sending the active:false it sends on close.
const BULK_STATUS_TIMEOUT_MS = 20000;

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
  fetchCanHearReports: () => void;
  setActiveSpeakerId: Dispatch<SetStateAction<number | null>>;
  setCheckIns: Dispatch<SetStateAction<any[]>>;
  setToastMessage: Dispatch<SetStateAction<string>>;
  setHighlightCheckIn: Dispatch<SetStateAction<boolean>>;
  setBulkCheckInActive: Dispatch<SetStateAction<boolean>>;
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
  // Distinguishes the first connection from a reconnection. Only a
  // reconnection needs to resync -- the initial mount already fetches
  // everything through useNetData.
  const hasConnectedRef = useRef(false);

  // Timestamp of the last message received on the current socket (any type,
  // including the server's 30s 'ping' heartbeat -- see STALE_CONNECTION_MS
  // below). Used to detect a "zombie" connection: one where readyState still
  // reports OPEN and neither onclose nor onerror ever fires, but the
  // underlying path is dead (a NAT/proxy silently dropping an idle mapping,
  // a phone locking its screen, a wifi<->cellular handoff). Without this the
  // page can sit showing arbitrarily stale data -- in one case, a net from a
  // week earlier -- because nothing else observes that the socket stopped
  // delivering.
  const lastMessageAtRef = useRef<number>(Date.now());

  // Pending "clear the bulk check-in indicator" timeout -- see
  // BULK_STATUS_TIMEOUT_MS below.
  const bulkCheckInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!netId) return;
    hasConnectedRef.current = false;

    // ========== RESYNC AFTER RECONNECT ==========
    // Every update between the drop and the reconnect was broadcast to a
    // socket that wasn't listening, and broadcasts are fire-and-forget -- the
    // server never replays them. Without this the operator comes back to a
    // connected socket and a silently stale page, which is more dangerous than
    // a visible disconnect because nothing looks wrong.
    //
    // Panels that own their own data (chat, activity log, traffic) can't be
    // refetched from here, so they get a 'netResync' window event -- the same
    // relay convention already used for newChatMessage/trafficLogged. Their
    // lists dedupe by id, so a full refetch merges cleanly.
    const resyncAfterReconnect = () => {
      const {
        fetchNet, fetchCheckIns, fetchNetRoles, fetchNetStats,
        fetchCanHearReports, setToastMessage, setBulkCheckInActive,
      } = depsRef.current;

      fetchNet();
      fetchCheckIns();
      fetchNetRoles();
      fetchNetStats();
      fetchCanHearReports();

      // Ephemeral relay state, not something a REST refetch can recover --
      // an active:false sent while this socket was down would never be seen.
      // Default to off and let a fresh renewal (every 8s while BulkCheckIn
      // is actually still open) restore it within one interval if needed.
      if (bulkCheckInTimeoutRef.current) {
        clearTimeout(bulkCheckInTimeoutRef.current);
        bulkCheckInTimeoutRef.current = null;
      }
      setBulkCheckInActive(false);

      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('netResync', { detail: { netId } }));
      }
      setToastMessage('Reconnected - catching up on anything missed.');
    };

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
        lastMessageAtRef.current = Date.now();
        if (hasConnectedRef.current) {
          resyncAfterReconnect();
        } else {
          hasConnectedRef.current = true;
        }
      };

      websocket.onmessage = (event) => {
        const {
          user,
          fetchCheckIns,
          fetchNet,
          fetchNetRoles,
          fetchNetStats,
          fetchCanHearReports,
          setActiveSpeakerId,
          setCheckIns,
          setToastMessage,
          setHighlightCheckIn,
          setBulkCheckInActive,
        } = depsRef.current;
        // Proof of life for the watchdog below -- counts every message,
        // including the server's unhandled 'ping' heartbeat type.
        lastMessageAtRef.current = Date.now();
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
        } else if (message.type === 'bulk_check_in_status') {
          // Client-relayed presence signal from BulkCheckIn.tsx -- purely
          // cosmetic (it only controls a "may arrive in bursts" notice, not
          // real check-in data, which the server now broadcasts reliably on
          // its own), so a relay is an acceptable pattern here unlike the
          // check-in broadcast itself. Self-clearing via BULK_STATUS_TIMEOUT_MS
          // covers the case that relay is ever missed or the sender's tab
          // vanishes mid-session.
          if (bulkCheckInTimeoutRef.current) {
            clearTimeout(bulkCheckInTimeoutRef.current);
            bulkCheckInTimeoutRef.current = null;
          }
          if (message.data?.active) {
            setBulkCheckInActive(true);
            bulkCheckInTimeoutRef.current = setTimeout(() => {
              bulkCheckInTimeoutRef.current = null;
              setBulkCheckInActive(false);
            }, BULK_STATUS_TIMEOUT_MS);
          } else {
            setBulkCheckInActive(false);
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
        } else if (message.type === 'can_hear_changed') {
          // A save can insert/delete/touch a variable number of edges, so
          // always refetch the full list rather than patching state locally.
          fetchCanHearReports();
        } else if (message.type === 'traffic_logged') {
          // A form was filed on this net. Relayed as a window event (rather
          // than fetched here directly) since the Traffic side panel isn't
          // known to this hook, matching the newChatMessage/chatReactionUpdate
          // convention Chat.tsx already uses.
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('trafficLogged', { detail: message.data }));
          }
        } else if (message.type === 'traffic_log_changed') {
          // A chain-of-custody hop was appended to a form on this net.
          // Same window-event relay as traffic_logged -- TrafficPanel.tsx,
          // TrafficDetail.tsx, and useTrafficInbox.ts all listen for this.
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('trafficLogChanged', { detail: message.data }));
          }
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      websocket.onclose = (event) => {
        if (event.code === 1008) {
          console.error('WebSocket authentication failed');
        } else if (event.code !== 1000) {
          // Abnormal close — exponential backoff: 3s, 6s, 12s … capped at 30s.
          //
          // Deliberately unbounded. This previously gave up after 10 attempts
          // (~3.75 minutes), which left an NCS running a dead page that still
          // looked live -- exactly the wrong failure for a served ARES/SKYWARN
          // net, where an outage longer than a few minutes is routine and the
          // operator is least able to notice a silent stall. The 30s cap keeps
          // a long outage cheap, and the cleanup below stops retries when the
          // page goes away.
          const count = wsRetryCountRef.current;
          const delay = Math.min(3000 * Math.pow(2, count), 30000);
          if (count === 0) {
            depsRef.current.setToastMessage('Connection lost - reconnecting...');
          }
          console.log(`WebSocket disconnected, reconnecting in ${delay / 1000}s (attempt ${count + 1})...`);
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

    // ========== IMMEDIATE RECONNECT ON REGAINED CONNECTIVITY ==========
    // Backoff alone means a link that returns one second after a failed
    // attempt still waits out the rest of the delay (up to 30s) before the
    // page catches up. The browser already knows the moment the interface is
    // back, so use it: cancel the pending retry, reset the backoff, and
    // reconnect now. Harmless if the socket is already healthy.
    const handleOnline = () => {
      const live = wsRef.current;
      if (live && (live.readyState === WebSocket.OPEN || live.readyState === WebSocket.CONNECTING)) return;
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
      wsRetryCountRef.current = 0;
      connectWebSocket();
    };
    window.addEventListener('online', handleOnline);

    // ========== ZOMBIE-CONNECTION WATCHDOG ==========
    // onclose/onerror only fire when the browser itself notices the socket
    // died. A connection that goes silent without either -- a NAT/proxy
    // dropping an idle mapping, a phone locking its screen, a wifi<->cellular
    // handoff -- leaves readyState reporting OPEN forever with nothing to
    // trigger the reconnect above. That's silently worse than a visible
    // disconnect: reported in production as a page that just stopped
    // updating (and separately, a tab left open across days landing back on
    // a stale net) with no error in the console. The server sends a 'ping'
    // every 30s specifically so something is always arriving on a healthy
    // connection (see _ws_heartbeat_loop in main.py); STALE_CONNECTION_MS
    // gives that two full intervals of margin before treating silence as
    // proof the connection is dead.
    const STALE_CONNECTION_MS = 60000;
    const isStale = () => Date.now() - lastMessageAtRef.current > STALE_CONNECTION_MS;

    const forceReconnect = (reason: string) => {
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
      wsRetryCountRef.current = 0;
      const live = wsRef.current;
      if (live && live.readyState === WebSocket.OPEN) {
        console.log(`WebSocket ${reason} - forcing reconnect`);
        // A non-1000 code routes through onclose's reconnect branch, which
        // reuses the existing backoff + resyncAfterReconnect flow below.
        live.close(4000, reason);
      } else if (!live || live.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
      // CONNECTING/CLOSING: already in flight, let it resolve on its own.
    };

    const staleCheckInterval = setInterval(() => {
      if (isStale()) forceReconnect('no heartbeat received');
    }, 15000);

    // Catches the case a periodic check alone would leave stale the longest:
    // a backgrounded/locked device where the connection died hours or days
    // ago. Re-checking the instant the tab is looked at again means the
    // operator never sees the stale content in the first place.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || isStale()) {
        forceReconnect('tab regained visibility on a stale connection');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(staleCheckInterval);
      if (bulkCheckInTimeoutRef.current) {
        clearTimeout(bulkCheckInTimeoutRef.current);
        bulkCheckInTimeoutRef.current = null;
      }
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
