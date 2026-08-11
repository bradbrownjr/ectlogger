import { useState, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { netApi, checkInApi, userApi, BACKGROUND_REQUEST_CONFIG } from '../services/api';
import api from '../services/api';
import useVisibilityAwareInterval from './useVisibilityAwareInterval';

// ========== useNetData ==========
// Owns the net's core data: the net itself, check-ins, roles, live stats,
// field definitions, the directory of all users, the owner profile, and
// poll/topic responses. Extracted verbatim from NetView so the page stays
// focused on rendering; every fetch function and its backing state moved
// together since they're a 1:1 pair (fetchX always sets stateX).
//
// Behavior preserved from the original inline implementation:
//   - On mount (and whenever netId changes): fetch net, check-ins, roles,
//     stats, and field definitions; poll stats every 10s for online users.
//   - Whenever net.owner_id / poll_enabled / topic_of_week_enabled become
//     available: fetch the owner profile and poll/topic data.

interface PollResults {
  question: string | null;
  results: { response: string; count: number }[];
}

interface TopicResponses {
  prompt: string | null;
  responses: { callsign: string; name: string; response: string }[];
}

export interface UseNetDataResult {
  net: any | null;
  setNet: Dispatch<SetStateAction<any | null>>;
  checkIns: any[];
  setCheckIns: Dispatch<SetStateAction<any[]>>;
  netRoles: any[];
  setNetRoles: Dispatch<SetStateAction<any[]>>;
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
  fetchPollResponses: () => Promise<void>;
  fetchPollResults: () => Promise<void>;
  fetchTopicResponses: () => Promise<void>;
}

export function useNetData(netId: string | undefined): UseNetDataResult {
  const [net, setNet] = useState<any | null>(null);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [netRoles, setNetRoles] = useState<any[]>([]);
  const [netStats, setNetStats] = useState<any | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [owner, setOwner] = useState<any | null>(null);
  const [pollResponses, setPollResponses] = useState<string[]>([]);
  const [pollResults, setPollResults] = useState<PollResults>({ question: null, results: [] });
  const [topicResponses, setTopicResponses] = useState<TopicResponses>({ prompt: null, responses: [] });

  const fetchNet = async () => {
    try {
      const response = await netApi.get(Number(netId));
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

  const fetchPollResponses = async () => {
    if (!netId) return;
    try {
      const response = await api.get(`/nets/${netId}/poll-responses`);
      setPollResponses(response.data);
    } catch (error) {
      console.error('Failed to fetch poll responses:', error);
    }
  };

  const fetchPollResults = async () => {
    if (!netId) return;
    try {
      const response = await api.get(`/nets/${netId}/poll-results`);
      setPollResults(response.data);
    } catch (error) {
      console.error('Failed to fetch poll results:', error);
    }
  };

  const fetchTopicResponses = async () => {
    if (!netId) return;
    try {
      const response = await api.get(`/nets/${netId}/topic-responses`);
      setTopicResponses(response.data);
    } catch (error) {
      console.error('Failed to fetch topic responses:', error);
    }
  };

  const fetchCheckIns = async () => {
    try {
      const response = await checkInApi.list(Number(netId));
      setCheckIns(response.data);
    } catch (error) {
      console.error('Failed to fetch check-ins:', error);
    }
  };

  // `background` marks the 10s poll below so it doesn't count as operator
  // activity; the initial load and WebSocket-driven refreshes leave it off.
  const fetchNetStats = async (background = false) => {
    try {
      const response = await api.get(`/nets/${netId}/stats`, background ? BACKGROUND_REQUEST_CONFIG : undefined);
      setNetStats(response.data);
      setOnlineUserIds(response.data.online_user_ids || []);
    } catch (error) {
      console.error('Failed to fetch net stats:', error);
    }
  };

  const fetchNetRoles = async () => {
    try {
      const response = await api.get(`/nets/${netId}/roles`);
      setNetRoles(response.data);
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
    // Fetch poll responses if poll is enabled
    if (net?.poll_enabled) {
      fetchPollResponses();
    }
    // Fetch poll results and topic responses for summary display (any status, shown for closed/archived)
    if (net?.poll_enabled) {
      fetchPollResults();
    }
    if (net?.topic_of_week_enabled) {
      fetchTopicResponses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net?.owner_id, net?.poll_enabled, net?.topic_of_week_enabled]);

  return {
    net,
    setNet,
    checkIns,
    setCheckIns,
    netRoles,
    setNetRoles,
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
    fetchPollResponses,
    fetchPollResults,
    fetchTopicResponses,
  };
}
