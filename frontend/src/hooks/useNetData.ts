import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { netApi, checkInApi, userApi, netRoleApi, callsignRoleApi, BACKGROUND_REQUEST_CONFIG } from '../services/api';
import api from '../services/api';
import useVisibilityAwareInterval from './useVisibilityAwareInterval';
import type { CallsignRole } from '../utils/stationRoles';
import {
  distinctPollResponses, summarizePollResults, summarizeTopicResponses,
  type PollResults, type TopicResponses,
} from '../utils/netResponses';

// ========== useNetData ==========
// Owns the net's core data: the net itself, check-ins, roles, live stats,
// field definitions, the directory of all users, the owner profile, and the
// poll/topic summaries (derived from check-ins, see utils/netResponses.ts). Extracted verbatim from NetView so the page stays
// focused on rendering; every fetch function and its backing state moved
// together since they're a 1:1 pair (fetchX always sets stateX).
//
// Behavior preserved from the original inline implementation:
//   - On mount (and whenever netId changes): fetch net, check-ins, roles,
//     stats, and field definitions; poll stats every 10s for online users.
//   - Whenever net.owner_id becomes available: fetch the owner profile.

export interface UseNetDataResult {
  net: any | null;
  setNet: Dispatch<SetStateAction<any | null>>;
  checkIns: any[];
  setCheckIns: Dispatch<SetStateAction<any[]>>;
  netRoles: any[];
  setNetRoles: Dispatch<SetStateAction<any[]>>;
  // Roles held by stations with no account (credit only, grants nothing).
  // Fetched with netRoles; merge them for display via utils/stationRoles.ts.
  callsignRoles: CallsignRole[];
  netStats: any | null;
  onlineUserIds: number[];
  setOnlineUserIds: Dispatch<SetStateAction<number[]>>;
  fieldDefinitions: any[];
  allUsers: any[];
  setAllUsers: Dispatch<SetStateAction<any[]>>;
  owner: any | null;
  pollResponses: string[];
  pollResults: PollResults;
  topicResponses: TopicResponses;
  fetchNet: () => Promise<void>;
  fetchCheckIns: () => Promise<void>;
  fetchNetRoles: () => Promise<void>;
  fetchNetStats: () => Promise<void>;
  fetchFieldDefinitions: () => Promise<void>;
  fetchAllUsers: () => Promise<void>;
  fetchOwner: () => Promise<void>;
}

export function useNetData(netId: string | undefined): UseNetDataResult {
  const [net, setNet] = useState<any | null>(null);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [netRoles, setNetRoles] = useState<any[]>([]);
  const [callsignRoles, setCallsignRoles] = useState<CallsignRole[]>([]);
  const [netStats, setNetStats] = useState<any | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [owner, setOwner] = useState<any | null>(null);

  // Derived from the live check-in list rather than fetched: a one-time fetch
  // went stale the moment anyone answered (see utils/netResponses.ts).
  const pollResponses = useMemo(() => distinctPollResponses(checkIns), [checkIns]);
  const pollResults = useMemo<PollResults>(
    () => (net?.poll_enabled ? summarizePollResults(checkIns, net.poll_question ?? null) : { question: null, results: [] }),
    [checkIns, net?.poll_enabled, net?.poll_question],
  );
  const topicResponses = useMemo<TopicResponses>(
    () => (net?.topic_of_week_enabled ? summarizeTopicResponses(checkIns, net.topic_of_week_prompt ?? null) : { prompt: null, responses: [] }),
    [checkIns, net?.topic_of_week_enabled, net?.topic_of_week_prompt],
  );

  // `background` (on fetchNet, fetchCheckIns, fetchNetRoles and
  // fetchNetStats) marks a fetch no one asked for -- the 10s stats poll and
  // the catch-up after a WebSocket reconnect -- so it doesn't count as
  // operator activity. The initial load and refreshes driven by a live
  // WebSocket event leave it off.
  const fetchNet = async (background = false) => {
    try {
      const response = await netApi.get(Number(netId), background);
      setNet(response.data);
    } catch (error) {
      console.error('Failed to fetch net:', error);
    }
  };

  const fetchFieldDefinitions = async () => {
    try {
      const response = await api.get('/settings/fields');
      setFieldDefinitions(response.data);
    } catch (error) {
      console.error('Failed to fetch field definitions:', error);
    }
  };

  const fetchCheckIns = async (background = false) => {
    try {
      const response = await checkInApi.list(Number(netId), background);
      setCheckIns(response.data);
    } catch (error) {
      console.error('Failed to fetch check-ins:', error);
    }
  };

  const fetchNetStats = async (background = false) => {
    try {
      const response = await api.get(`/nets/${netId}/stats`, background ? BACKGROUND_REQUEST_CONFIG : undefined);
      setNetStats(response.data);
      setOnlineUserIds(response.data.online_user_ids || []);
    } catch (error) {
      console.error('Failed to fetch net stats:', error);
    }
  };

  const fetchNetRoles = async (background = false) => {
    try {
      const [response, callsignResponse] = await Promise.all([
        netRoleApi.list(Number(netId), background),
        callsignRoleApi.list(Number(netId), background),
      ]);
      setNetRoles(response.data);
      setCallsignRoles(callsignResponse.data);
    } catch (error) {
      console.error('Failed to fetch net roles:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      // /users is admin-only; the role-assignment picker (opened by any net
      // owner/NCS, not just admins) needs the unrestricted minimal directory
      // instead — same endpoint NCSStaffModal already uses for its pickers.
      const response = await userApi.listDirectory();
      setAllUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchOwner = async () => {
    if (!net) return;
    try {
      const response = await api.get(`/users/${net.owner_id}`);
      setOwner(response.data);
    } catch (error) {
      console.error('Failed to fetch owner:', error);
    }
  };

  useEffect(() => {
    if (netId) {
      fetchNet();
      fetchCheckIns();
      fetchNetRoles();
      fetchNetStats();
      fetchFieldDefinitions();
      // The live message socket is owned by useNetWebSocket, in NetView.

      // The 10s stats poll now lives in the visibility-aware effect below, so
      // it stops while the tab is hidden.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId]);

  // Poll stats to refresh the online-user list. Paused while the tab is
  // hidden -- see useVisibilityAwareInterval.
  useVisibilityAwareInterval(
    useCallback(() => { fetchNetStats(true); }, [netId]),
    10000,
    !!netId,
  );

  useEffect(() => {
    if (net?.owner_id) {
      fetchOwner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net?.owner_id]);

  return {
    net,
    setNet,
    checkIns,
    setCheckIns,
    netRoles,
    setNetRoles,
    callsignRoles,
    netStats,
    onlineUserIds,
    setOnlineUserIds,
    fieldDefinitions,
    allUsers,
    setAllUsers,
    owner,
    pollResponses,
    pollResults,
    topicResponses,
    fetchNet,
    fetchCheckIns,
    fetchNetRoles,
    fetchNetStats,
    fetchFieldDefinitions,
    fetchAllUsers,
    fetchOwner,
  };
}
