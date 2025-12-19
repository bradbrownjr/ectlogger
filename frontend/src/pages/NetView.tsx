import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Autocomplete,
  Grid,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { keyframes } from '@mui/system';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import MapIcon from '@mui/icons-material/Map';
import BarChartIcon from '@mui/icons-material/BarChart';
import FastForwardIcon from '@mui/icons-material/FastForward';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArticleIcon from '@mui/icons-material/Article';
import GroupIcon from '@mui/icons-material/Group';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LanguageIcon from '@mui/icons-material/Language';
import InfoIcon from '@mui/icons-material/Info';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TimerIcon from '@mui/icons-material/Timer';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { netApi, checkInApi, userApi, netRoleApi } from '../services/api';
import api from '../services/api';
import { formatTimeWithDate } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import Chat from '../components/Chat';
import CheckInMap from '../components/CheckInMap';
import BulkCheckIn from '../components/BulkCheckIn';
import SearchCheckIns from '../components/SearchCheckIns';
import NetScript from '../components/NetScript';
import FloatingWindow from '../components/FloatingWindow';

interface Net {
  id: number;
  name: string;
  description: string;
  info_url?: string;
  script?: string;
  status: string;
  owner_id: number;
  active_frequency_id?: number;
  ics309_enabled?: boolean;
  // Topic of the Week / Poll features
  topic_of_week_enabled?: boolean;
  topic_of_week_prompt?: string;
  poll_enabled?: boolean;
  poll_question?: string;
  field_config?: {
    [key: string]: {
      enabled: boolean;
      required: boolean;
    };
  };
  frequencies: Frequency[];
  scheduled_start_time?: string;  // Scheduled start time for countdown timer
  started_at?: string;
  closed_at?: string;
  created_at: string;
}

interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

interface CheckIn {
  id: number;
  callsign: string;
  name: string;
  location: string;
  skywarn_number?: string;
  weather_observation?: string;
  power_source?: string;
  power?: string;
  notes?: string;
  custom_fields?: Record<string, string>;
  relayed_by?: string;
  topic_response?: string;
  poll_response?: string;
  status: string;
  is_recheck: boolean;
  checked_in_at: string;
  frequency_id?: number;
  available_frequencies?: number[];
  user_id?: number;
}

interface FieldDefinition {
  id: number;
  name: string;
  label: string;
  field_type: string;
  options?: string[];
  placeholder?: string;
  default_enabled: boolean;
  default_required: boolean;
  is_builtin: boolean;
  is_archived: boolean;
  sort_order: number;
}

interface NetRole {
  id: number;
  user_id: number;
  email: string;
  name?: string;
  callsign?: string;
  role: string;
  active_frequency_id?: number;
  assigned_at: string;
}

// NCS color palette - works in both light and dark modes
const NCS_COLORS = [
  { bg: 'rgba(244, 67, 54, 0.15)', border: '#f44336', text: '#f44336' },   // Red
  { bg: 'rgba(33, 150, 243, 0.15)', border: '#2196f3', text: '#2196f3' },  // Blue
  { bg: 'rgba(76, 175, 80, 0.15)', border: '#4caf50', text: '#4caf50' },   // Green
  { bg: 'rgba(156, 39, 176, 0.15)', border: '#9c27b0', text: '#9c27b0' },  // Purple
  { bg: 'rgba(255, 152, 0, 0.15)', border: '#ff9800', text: '#ff9800' },   // Orange
  { bg: 'rgba(0, 188, 212, 0.15)', border: '#00bcd4', text: '#00bcd4' },   // Cyan
];

// Pulse animation for highlighting the check-in button (blue)
const pulseAnimation = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(25, 118, 210, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);
  }
`;

// Pulse animation for highlighting the start net button (green)
const pulseAnimationGreen = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(46, 125, 50, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(46, 125, 50, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(46, 125, 50, 0);
  }
`;

// Yellow shimmer animation for topic/poll config needed indicator
const shimmerYellow = keyframes`
  0% {
    background-color: rgba(255, 193, 7, 0.3);
  }
  50% {
    background-color: rgba(255, 193, 7, 0.7);
  }
  100% {
    background-color: rgba(255, 193, 7, 0.3);
  }
`;

const NetView: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const [net, setNet] = useState<Net | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [netRoles, setNetRoles] = useState<NetRole[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [owner, setOwner] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRole, setSelectedRole] = useState<string>('NCS');
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [netStats, setNetStats] = useState<{total_check_ins: number, online_count: number, guest_count: number} | null>(null);
  const [frequencyDialogOpen, setFrequencyDialogOpen] = useState(false);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [bulkCheckInOpen, setBulkCheckInOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [closeNetDialogOpen, setCloseNetDialogOpen] = useState(false);
  const [startingNet, setStartingNet] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [highlightCheckIn, setHighlightCheckIn] = useState(false);
  const [highlightStartNet, setHighlightStartNet] = useState(false);
  // Countdown and duration timer state
  const [countdownTime, setCountdownTime] = useState<string | null>(null);
  const [durationTime, setDurationTime] = useState<string | null>(null);
  // Topic/Poll configuration dialog state
  const [topicPollDialogOpen, setTopicPollDialogOpen] = useState(false);
  const [tempTopicPrompt, setTempTopicPrompt] = useState('');
  const [tempPollQuestion, setTempPollQuestion] = useState('');
  // Inline editing state
  const [inlineEditingId, setInlineEditingId] = useState<number | null>(null);
  const [inlineEditValues, setInlineEditValues] = useState<Partial<CheckIn>>({});
  const [inlineEditFocusField, setInlineEditFocusField] = useState<string | null>(null);
  const inlineEditRowRef = useRef<HTMLTableRowElement | null>(null);
  const [checkInListDetached, setCheckInListDetached] = useState(() => {
    return localStorage.getItem('floatingWindow_checkInList_detached') === 'true';
  });
  const [chatDetached, setChatDetached] = useState(() => {
    return localStorage.getItem('floatingWindow_chat_detached') === 'true';
  });
  // Frequency filter state - allows filtering check-ins by selected frequencies
  const [filteredFrequencyIds, setFilteredFrequencyIds] = useState<number[]>([]);
  const { user, isAuthenticated } = useAuth();
  const { gridSquare } = useLocation();
  const navigate = useNavigate();

  // Check-in form state - includes custom_fields for dynamic fields
  const [checkInForm, setCheckInForm] = useState({
    callsign: '',
    name: '',
    location: '',
    skywarn_number: '',
    weather_observation: '',
    power_source: '',
    power: '',
    feedback: '',
    notes: '',
    relayed_by: '',
    available_frequency_ids: [] as number[],
    custom_fields: {} as Record<string, string>,
    topic_response: '',
    poll_response: '',
  });
  
  // Poll autocomplete responses
  const [pollResponses, setPollResponses] = useState<string[]>([]);
  
  // Poll results and topic responses for display
  const [pollResults, setPollResults] = useState<{ question: string | null, results: { response: string, count: number }[] }>({ question: null, results: [] });
  const [topicResponses, setTopicResponses] = useState<{ prompt: string | null, responses: { callsign: string, name: string, response: string }[] }>({ prompt: null, responses: [] });

  useEffect(() => {
    if (netId) {
      fetchNet();
      fetchCheckIns();
      fetchNetRoles();
      fetchNetStats();
      fetchFieldDefinitions();
      connectWebSocket();
      
      // Poll stats every 10 seconds to update online users
      const statsInterval = setInterval(fetchNetStats, 10000);
      

      return () => {
        if (ws) {
          ws.close();
        }
        clearInterval(statsInterval);
      };
    }
  }, [netId]);

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
  }, [net?.owner_id, net?.poll_enabled, net?.topic_of_week_enabled]);

  // Persist detached panel states to localStorage
  useEffect(() => {
    localStorage.setItem('floatingWindow_checkInList_detached', String(checkInListDetached));
  }, [checkInListDetached]);

  useEffect(() => {
    localStorage.setItem('floatingWindow_chat_detached', String(chatDetached));
  }, [chatDetached]);

  // Show start net reminder when viewing a draft/scheduled net that user can start
  // Only runs once when net data is first loaded
  useEffect(() => {
    if (!net || !user) return;
    if (net.status !== 'draft' && net.status !== 'scheduled') return;
    
    const isOwner = net.owner_id === user.id;
    const isAdmin = user.role === 'admin';
    
    // Only show reminder for owner/admin (NCS check would require netRoles which causes re-renders)
    if (isOwner || isAdmin) {
      const timer = setTimeout(() => {
        // Build reminder message with topic/poll hints
        let message = 'Ready to start? Click the green play button to begin the net!';
        const needsConfig: string[] = [];
        if (net.topic_of_week_enabled && !net.topic_of_week_prompt) {
          needsConfig.push('topic');
        }
        if (net.poll_enabled && !net.poll_question) {
          needsConfig.push('poll question');
        }
        if (needsConfig.length > 0) {
          message += ` Don't forget to set the ${needsConfig.join(' and ')}!`;
        }
        setToastMessage(message);
        setHighlightStartNet(true);
        setTimeout(() => setHighlightStartNet(false), 10000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [net?.id]); // Only depend on net.id to run once

  // Countdown and duration timer effect - updates every second
  useEffect(() => {
    if (!net) return;
    
    const updateTimers = () => {
      const now = new Date();
      
      // Countdown timer: show time until scheduled start (for draft/scheduled/lobby nets)
      if (net.scheduled_start_time && (net.status === 'draft' || net.status === 'scheduled' || net.status === 'lobby')) {
        // Ensure the timestamp is parsed as UTC (backend stores UTC without 'Z' suffix)
        const scheduledTimeStr = net.scheduled_start_time.endsWith('Z') ? net.scheduled_start_time : net.scheduled_start_time + 'Z';
        const scheduledTime = new Date(scheduledTimeStr);
        const diff = scheduledTime.getTime() - now.getTime();
        
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          
          if (hours > 0) {
            setCountdownTime(`${hours}h ${minutes}m ${seconds}s`);
          } else if (minutes > 0) {
            setCountdownTime(`${minutes}m ${seconds}s`);
          } else {
            setCountdownTime(`${seconds}s`);
          }
        } else {
          // Past scheduled time - show "Starting soon" or similar
          setCountdownTime('Starting soon');
        }
      } else {
        setCountdownTime(null);
      }
      
      // Duration timer: show elapsed time since net started (only for active nets)
      if (net.started_at && net.status === 'active') {
        // Ensure the timestamp is parsed as UTC (backend stores UTC without 'Z' suffix)
        const startTimeStr = net.started_at.endsWith('Z') ? net.started_at : net.started_at + 'Z';
        const startTime = new Date(startTimeStr);
        const diff = now.getTime() - startTime.getTime();
        
        // Only show duration if it's positive (started_at is in the past)
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          
          if (hours > 0) {
            setDurationTime(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
          } else {
            setDurationTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
          }
        } else {
          // Edge case: started_at is in the future (shouldn't happen, but handle gracefully)
          setDurationTime(null);
        }
      } else {
        setDurationTime(null);
      }
    };
    
    // Update immediately
    updateTimers();
    
    // Update every second
    const interval = setInterval(updateTimers, 1000);
    
    return () => clearInterval(interval);
  }, [net?.scheduled_start_time, net?.started_at, net?.status]);

  const handleDetachCheckInList = () => setCheckInListDetached(true);
  const handleAttachCheckInList = () => setCheckInListDetached(false);
  const handleDetachChat = () => setChatDetached(true);
  const handleAttachChat = () => setChatDetached(false);

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
    };
    
    websocket.onmessage = (event) => {
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
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    websocket.onclose = (event) => {
      if (event.code === 1008) {
        console.error('WebSocket authentication failed');
      }
    };

    setWs(websocket);
  };

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

  const fetchNetStats = async () => {
    try {
      const response = await api.get(`/nets/${netId}/stats`);
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
      const response = await api.get('/users');
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

  const handleAssignRole = async () => {
    if (!selectedUserId) {
      alert('Please select a user');
      return;
    }

    try {
      // Remove any existing role for this user
      const existingRole = netRoles.find((r: any) => r.user_id === selectedUserId);
      if (existingRole) {
        await api.delete(`/nets/${netId}/roles/${existingRole.id}`);
      }
      // Assign new role
      await api.post(`/nets/${netId}/roles`, null, {
        params: {
          user_id: selectedUserId,
          role: selectedRole
        }
      });
      setSelectedUserId('');
      setSelectedRole('NCS');
      // Auto-refresh roles and check-ins for all users
      await fetchNetRoles();
      await fetchCheckIns();
    } catch (error: any) {
      console.error('Failed to assign role:', error);
      alert(error.response?.data?.detail || 'Failed to assign role');
    }
  };

  const handleRemoveRole = async (roleId: number) => {
    if (!confirm('Remove this role assignment?')) return;

    try {
      await api.delete(`/nets/${netId}/roles/${roleId}`);
      fetchNetRoles();
    } catch (error) {
      console.error('Failed to remove role:', error);
      alert('Failed to remove role');
    }
  };

  // Check if topic/poll config is needed before starting
  const needsTopicPollConfig = () => {
    if (!net) return false;
    const needsTopic = net.topic_of_week_enabled && !net.topic_of_week_prompt;
    const needsPoll = net.poll_enabled && !net.poll_question;
    return needsTopic || needsPoll;
  };

  const handleStartNetClick = () => {
    if (needsTopicPollConfig()) {
      // Open dialog to configure topic/poll
      setTempTopicPrompt(net?.topic_of_week_prompt || '');
      setTempPollQuestion(net?.poll_question || '');
      setTopicPollDialogOpen(true);
    } else {
      handleStartNet();
    }
  };

  const handleTopicPollSaveAndStart = async () => {
    // Save the topic/poll configuration first
    try {
      const updates: any = {};
      if (net?.topic_of_week_enabled) {
        updates.topic_of_week_prompt = tempTopicPrompt || null;
      }
      if (net?.poll_enabled) {
        updates.poll_question = tempPollQuestion || null;
      }
      await netApi.update(Number(netId), updates);
      setTopicPollDialogOpen(false);
      // Then start the net
      handleStartNet();
    } catch (error) {
      console.error('Failed to save topic/poll config:', error);
      alert('Failed to save configuration');
    }
  };

  const handleStartNet = async () => {
    setStartingNet(true);
    try {
      await netApi.start(Number(netId));
      fetchNet();
      fetchCheckIns();
      fetchNetRoles();  // Fetch roles since NCS is assigned when starting
      // Clear the form so it's ready for the next check-in
      setCheckInForm({
        callsign: '',
        name: '',
        location: '',
        skywarn_number: '',
        weather_observation: '',
        power_source: '',
        power: '',
        feedback: '',
        notes: '',
        relayed_by: '',
        available_frequency_ids: [],
        custom_fields: {},
        topic_response: '',
        poll_response: '',
      });
    } catch (error) {
      console.error('Failed to start net:', error);
      setStartingNet(false);
    }
  };

  const handleCloseNet = async () => {
    try {
      await netApi.close(Number(netId));
      setCloseNetDialogOpen(false);
      // fetchNet will trigger the useEffect that fetches poll results/topic responses
      // based on whether those features are enabled
      await fetchNet();
      // Explicitly fetch poll/topic data if features are enabled
      if (net?.poll_enabled) {
        fetchPollResults();
      }
      if (net?.topic_of_week_enabled) {
        fetchTopicResponses();
      }
    } catch (error) {
      console.error('Failed to close net:', error);
    }
  };

  // Go Live: Transition from LOBBY to ACTIVE mode
  const handleGoLive = async () => {
    try {
      await api.post(`/nets/${netId}/go-live`);
      await fetchNet();
      setSnackbarMessage('Net is now LIVE! Subscribers have been notified.');
      setSnackbarOpen(true);
    } catch (error: any) {
      console.error('Failed to go live:', error);
      setSnackbarMessage(error.response?.data?.detail || 'Failed to go live');
      setSnackbarOpen(true);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await api.get(`/nets/${netId}/export/csv`, {
        responseType: 'blob',
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${net?.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    }
  };

  const handleExportICS309 = async () => {
    try {
      const response = await api.get(`/nets/${netId}/export/ics309`, {
        responseType: 'blob',
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ICS309_${net?.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export ICS-309:', error);
    }
  };

  // State for archive undo functionality
  const [pendingArchive, setPendingArchive] = React.useState<boolean>(false);
  const archiveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleArchive = async () => {
    // Show actionable toast with undo option
    setPendingArchive(true);
    setToastMessage('Net archived. Click UNDO to restore.');
    
    // Set timeout to actually perform archive after 5 seconds
    archiveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.post(`/nets/${netId}/archive`);
        setPendingArchive(false);
        navigate('/dashboard');
      } catch (error) {
        console.error('Failed to archive net:', error);
        setPendingArchive(false);
        setToastMessage('Failed to archive net');
      }
    }, 5000);
  };

  const handleUndoArchive = () => {
    if (archiveTimeoutRef.current) {
      clearTimeout(archiveTimeoutRef.current);
      archiveTimeoutRef.current = null;
    }
    setPendingArchive(false);
    setToastMessage('Archive cancelled');
  };

  const handleUnarchive = async () => {
    try {
      await api.post(`/nets/${netId}/unarchive`);
      setToastMessage('Net unarchived and moved back to closed status');
      fetchNet(); // Refresh net data to update status
    } catch (error) {
      console.error('Failed to unarchive net:', error);
      setToastMessage('Failed to unarchive net');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this net permanently? This cannot be undone.')) return;
    try {
      await api.delete(`/nets/${netId}`);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to delete net:', error);
      alert('Failed to delete net');
    }
  };

  // Get custom fields (non-builtin) that are enabled for this net
  const getEnabledCustomFields = () => {
    return fieldDefinitions.filter((field: FieldDefinition) => 
      !field.is_builtin && 
      net?.field_config?.[field.name]?.enabled
    );
  };

  // Check if a field is required
  const isFieldRequired = (fieldName: string) => {
    return net?.field_config?.[fieldName]?.required ?? false;
  };

  // Check if any check-in has a relayed_by value (to conditionally show the column)
  const hasAnyRelayedBy = checkIns.some((ci: CheckIn) => ci.relayed_by);

  // Get appropriate callsign based on active frequency mode
  const getAppropriateCallsign = (): string => {
    if (!user) return '';
    
    // Check if active frequency is GMRS mode
    const activeFreq = net?.frequencies?.find((f: Frequency) => f.id === net?.active_frequency_id);
    const isGmrsFrequency = activeFreq?.mode === 'GMRS';
    
    // If GMRS frequency and user has a GMRS callsign, use it
    if (isGmrsFrequency && user.gmrs_callsign) {
      return user.gmrs_callsign;
    }
    
    // Otherwise use primary (amateur) callsign
    return user.callsign || '';
  };

  // Look up user info by callsign and auto-fill form fields (for NCS)
  const handleCallsignLookup = async (callsign: string) => {
    if (!callsign || callsign.length < 3) return;
    
    try {
      const response = await userApi.lookupByCallsign(callsign);
      const userData = response.data;
      
      // Only auto-fill fields that are currently empty
      if (userData.name || userData.location || userData.skywarn_number) {
        setCheckInForm(prev => ({
          ...prev,
          name: prev.name || userData.name || '',
          location: prev.location || userData.location || '',
          skywarn_number: prev.skywarn_number || userData.skywarn_number || '',
        }));
      }
    } catch (error) {
      // Silently fail - user may not be registered
      console.debug('Callsign lookup failed:', error);
    }
  };

  const handleCheckIn = async () => {
    // Validate required fields
    if (!checkInForm.callsign) {
      alert('Callsign is required');
      return;
    }

    try {
      // Prepare check-in data with custom fields
      const checkInData = {
        ...checkInForm,
        custom_fields: checkInForm.custom_fields,
      };
      await checkInApi.create(Number(netId), checkInData);
      
      // Clear form for next check-in
      setCheckInForm({
        callsign: '',
        name: '',
        location: '',
        skywarn_number: '',
        weather_observation: '',
        power_source: '',
        power: '',
        feedback: '',
        notes: '',
        relayed_by: '',
        available_frequency_ids: [],
        custom_fields: {},
        topic_response: '',
        poll_response: '',
      });
      
      fetchCheckIns();
      
      // Refresh poll responses after new check-in (in case new response was added)
      if (net?.poll_enabled) {
        fetchPollResponses();
      }
      
      // Focus back on callsign field
      setTimeout(() => {
        const callsignInput = document.querySelector('input[placeholder="Callsign"]') as HTMLInputElement;
        if (callsignInput) callsignInput.focus();
      }, 100);
      
      // Broadcast via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'check_in',
          data: checkInForm,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Failed to create check-in:', error);
      alert('Failed to check in station');
    }
  };

  const getStatusIcon = (status: string, checkIn?: CheckIn) => {
    // Show role icons for users with active roles
    if (checkIn) {
      // Owner always gets the primary crown
      if (net?.owner_id === checkIn.user_id) return '👑';
      
      const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
      if (userRole?.role?.toUpperCase() === 'NCS') {
        // Check if owner is checked in - if so, this NCS is secondary
        const ownerCheckedIn = net?.owner_id && checkIns.some(c => c.user_id === net.owner_id && c.status !== 'checked_out');
        if (ownerCheckedIn) {
          // Owner is present - all other NCS are secondary
          return '🤴';
        }
        
        // Owner not present - check if this is first NCS in the list (acting primary)
        const ncsIndex = ncsRoles.findIndex((r: any) => r.user_id === checkIn.user_id);
        if (ncsIndex > 0) {
          // This is a secondary NCS - check if primary NCS is checked in
          const primaryNCS = ncsRoles[0];
          const primaryCheckedIn = checkIns.some(c => c.user_id === primaryNCS.user_id && c.status !== 'checked_out');
          if (primaryCheckedIn) {
            // Primary NCS is present - show 2nd crown for secondary
            return '🤴';
          }
        }
        // Primary NCS or acting primary (primary not present)
        return '👑';
      }
      if (userRole?.role?.toUpperCase() === 'LOGGER') return '📋';
      if (userRole?.role?.toUpperCase() === 'RELAY') return '📡';
      
      // Show recheck icon for rechecked stations (replaces standard check-in)
      if (checkIn.is_recheck && status === 'checked_in') return '🔄';
    }
    
    // Show standard status icons
    switch (status) {
      case 'checked_in': return '✅'; // Standard
      case 'listening': return '👂'; // Just listening
      case 'relay': return '📡'; // Relay station
      case 'away': return '⏸️'; // Short term
      case 'available': return '🚨'; // Has traffic
      case 'announcements': return '📢'; // Has announcements
      case 'mobile': return '🚗'; // Mobile station
      case 'checked_out': return '👋'; // Checked out
      default: return '✅';
    }
  };

  const getStatusTooltip = (status: string, checkIn?: CheckIn) => {
    // Check for role-based tooltips first
    if (checkIn) {
      if (net?.owner_id === checkIn.user_id) return 'Net Control Station - manages the net';
      const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
      if (userRole?.role?.toUpperCase() === 'NCS') {
        // Check if owner is checked in - if so, this NCS is secondary
        const ownerCheckedIn = net?.owner_id && checkIns.some(c => c.user_id === net.owner_id && c.status !== 'checked_out');
        if (ownerCheckedIn) {
          return '2nd NCS - assists primary Net Control Station';
        }
        
        // Check if this is a secondary NCS (not first in the list)
        const ncsIndex = ncsRoles.findIndex((r: any) => r.user_id === checkIn.user_id);
        if (ncsIndex > 0) {
          const primaryNCS = ncsRoles[0];
          const primaryCheckedIn = checkIns.some(c => c.user_id === primaryNCS.user_id && c.status !== 'checked_out');
          if (primaryCheckedIn) {
            return '2nd NCS - assists primary Net Control Station';
          }
        }
        return 'Net Control Station - manages the net';
      }
      if (userRole?.role?.toUpperCase() === 'LOGGER') return 'Logger - assists NCS with logging';
      if (userRole?.role?.toUpperCase() === 'RELAY') return 'Relay - checks in stations on behalf of NCS';
      if (checkIn.is_recheck && status === 'checked_in') return 'Re-checked into the net';
    }
    
    switch (status) {
      case 'checked_in': return 'Checked in and available';
      case 'listening': return 'Monitoring only, not transmitting';
      case 'relay': return 'Relay station - can relay stations NCS cannot hear';
      case 'away': return 'Temporarily away, will return';
      case 'available': return 'Has traffic or emergency to report';
      case 'announcements': return 'Has announcements to share';
      case 'mobile': return 'Mobile - may only be available briefly';
      case 'checked_out': return 'Checked out of net';
      default: return 'Checked in and available';
    }
  };

  // Helper to get the NCS icon for a specific check-in (primary crown or secondary prince)
  const getNcsIcon = (checkIn: CheckIn) => {
    // Owner is always primary
    if (net?.owner_id === checkIn.user_id) return '👑';
    
    // Check if owner is checked in - if so, all other NCS are secondary
    const ownerCheckedIn = net?.owner_id && checkIns.some(c => c.user_id === net.owner_id && c.status !== 'checked_out');
    if (ownerCheckedIn) return '🤴';
    
    // Owner not present - check if this is first NCS in the list
    const ncsIndex = ncsRoles.findIndex((r: any) => r.user_id === checkIn.user_id);
    if (ncsIndex > 0) {
      const primaryNCS = ncsRoles[0];
      const primaryCheckedIn = checkIns.some(c => c.user_id === primaryNCS.user_id && c.status !== 'checked_out');
      if (primaryCheckedIn) return '🤴';
    }
    
    return '👑';
  };

  const formatFrequencyDisplay = (freq: any) => {
    if (!freq) return '';
    if (freq.frequency) {
      return `${freq.frequency} MHz${freq.mode ? ` (${freq.mode})` : ''}`;
    }
    // Digital mode without frequency (DMR/YSF)
    // For YSF: show channel name (e.g., "UFB YSF")
    // For DMR: show talkgroup (e.g., "NEDECON TG7123 DMR")
    const label = freq.channel || freq.talkgroup || 'Digital';
    return freq.mode ? `${label} ${freq.mode}` : label;
  };

  const handleStatusChange = async (checkInId: number, newStatus: string) => {
    const checkIn = checkIns.find((ci: any) => ci.id === checkInId);
    if (!checkIn) {
      return;
    }

    try {
          if ((newStatus === 'ncs' || newStatus === 'logger') && checkIn.user_id) {
            // Remove any existing role
            const existingRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
            if (existingRole) {
              await api.delete(`/nets/${netId}/roles/${existingRole.id}`);
            }
            // Assign new role
            await api.post(`/nets/${netId}/roles`, null, {
              params: {
                user_id: checkIn.user_id,
                role: newStatus.toUpperCase()
              }
            });
            // Always set status to checked_in for roles
            await checkInApi.update(checkInId, { status: 'checked_in' });
            await fetchNetRoles();
            await fetchCheckIns();
          } else if (newStatus === 'ncs' || newStatus === 'logger') {
            setToastMessage('Cannot assign roles to stations without user accounts');
            return;
          } else {
            // Remove role if switching to a regular status
            if (checkIn.user_id) {
              const existingRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
              if (existingRole && owner?.id !== checkIn.user_id) {
                await api.delete(`/nets/${netId}/roles/${existingRole.id}`);
                await fetchNetRoles();
              }
            }
            await checkInApi.update(checkInId, { status: newStatus });
            await fetchCheckIns();
      }
      } catch (error: any) {
        console.error('Failed to update status:', error);
        const message = error.response?.data?.detail || 'Failed to update status';
        setToastMessage(message);
    }
  };

  const handleDeleteCheckIn = async (checkInId: number) => {
    if (!confirm('Delete this check-in entry?')) return;
    try {
      await checkInApi.delete(checkInId);
      fetchCheckIns();
    } catch (error) {
      console.error('Failed to delete check-in:', error);
      alert('Failed to delete check-in');
    }
  };

  // ========== INLINE EDITING HANDLERS ==========
  // Start inline editing when a row is clicked (except on certain elements)
  // focusField: the field name to focus (e.g., 'callsign', 'name', 'location', etc.)
  const handleStartInlineEdit = (checkIn: CheckIn, focusField: string = 'callsign') => {
    if (!canManageCheckIns) return;
    setInlineEditingId(checkIn.id);
    setInlineEditFocusField(focusField);
    setInlineEditValues({
      callsign: checkIn.callsign,
      name: checkIn.name || '',
      location: checkIn.location || '',
      skywarn_number: checkIn.skywarn_number || '',
      weather_observation: checkIn.weather_observation || '',
      power_source: checkIn.power_source || '',
      power: checkIn.power || '',
      notes: checkIn.notes || '',
      relayed_by: checkIn.relayed_by || '',
      topic_response: checkIn.topic_response || '',
      poll_response: checkIn.poll_response || '',
      custom_fields: checkIn.custom_fields || {},
    });
  };

  // Save inline edit
  const handleSaveInlineEdit = async () => {
    if (!inlineEditingId) return;
    
    const checkIn = checkIns.find((c: CheckIn) => c.id === inlineEditingId);
    if (!checkIn) return;
    
    try {
      await checkInApi.update(inlineEditingId, {
        callsign: inlineEditValues.callsign || checkIn.callsign,
        name: inlineEditValues.name,
        location: inlineEditValues.location,
        skywarn_number: inlineEditValues.skywarn_number,
        weather_observation: inlineEditValues.weather_observation,
        power_source: inlineEditValues.power_source,
        power: inlineEditValues.power,
        notes: inlineEditValues.notes,
        relayed_by: inlineEditValues.relayed_by,
        topic_response: inlineEditValues.topic_response,
        poll_response: inlineEditValues.poll_response,
        custom_fields: inlineEditValues.custom_fields,
        // Keep existing frequency settings
        available_frequency_ids: checkIn.available_frequencies || [],
      });
      setInlineEditingId(null);
      setInlineEditValues({});
      setInlineEditFocusField(null);
      fetchCheckIns();
      // Refresh poll responses in case a new answer was added
      if (net?.poll_enabled) {
        fetchPollResponses();
      }
    } catch (error) {
      console.error('Failed to update check-in:', error);
      alert('Failed to update check-in');
    }
  };

  // Cancel inline edit
  const handleCancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineEditValues({});
    setInlineEditFocusField(null);
  };

  // Handle inline field change
  const handleInlineFieldChange = (field: string, value: string) => {
    if (field.startsWith('custom_')) {
      const customFieldName = field.replace('custom_', '');
      setInlineEditValues(prev => ({
        ...prev,
        custom_fields: {
          ...prev.custom_fields,
          [customFieldName]: value,
        },
      }));
    } else {
      setInlineEditValues(prev => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  // Handle key press in inline edit (Enter to save, Escape to cancel, Tab to navigate)
  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveInlineEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelInlineEdit();
    }
    // Tab is handled naturally by the browser - don't prevent it
  };

  // Handle blur on inline edit fields - only save if focus leaves the editing row entirely
  const handleInlineBlur = (e: React.FocusEvent) => {
    // Use setTimeout to allow the new focus target to be set before checking
    setTimeout(() => {
      // Check if focus moved to another element within the same editing row
      const activeElement = document.activeElement;
      if (inlineEditRowRef.current && inlineEditRowRef.current.contains(activeElement)) {
        // Focus is still within the editing row, don't save
        return;
      }
      // Focus left the row, save the edit
      handleSaveInlineEdit();
    }, 0);
  };

  const handleSetActiveSpeaker = (checkInId: number | null) => {
    const newActiveSpeakerId = activeSpeakerId === checkInId ? null : checkInId;
    
    // Show toast if setting someone with "listening" status as active speaker
    const checkIn = checkIns.find((ci: CheckIn) => ci.id === checkInId);
    if (checkIn && checkIn.status === 'listening' && newActiveSpeakerId !== null) {
      setToastMessage(`${checkIn.callsign} is set to "Just Listening"`);
    }
    
    setActiveSpeakerId(newActiveSpeakerId);
    
    // Broadcast active speaker change via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'active_speaker',
        data: { checkInId: newActiveSpeakerId },
        timestamp: new Date().toISOString()
      }));
    }
  };

  const handleSetActiveFrequency = async (frequencyId: number) => {
    try {
      const response = await netApi.setActiveFrequency(netId!, frequencyId);
      setNet(response.data);
      
      // Broadcast frequency change via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'active_frequency',
          data: { frequencyId },
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Failed to set active frequency:', error);
      alert('Failed to change frequency');
    }
  };

  if (!net) {
    return <Container><Typography>Loading...</Typography></Container>;
  }

  const isOwner = user?.id === net.owner_id;
  const isAdmin = user?.role === 'admin';
  
  // Check if user has NCS or Logger role
  const userNetRole = netRoles.find((role: any) => role.user_id === user?.id);
  const isNCS = userNetRole && userNetRole.role === 'NCS';
  const isNCSOrLogger = userNetRole && (userNetRole.role === 'NCS' || userNetRole.role === 'Logger');
  
  // NCS users can manage the net (edit settings, close, etc.) - they're co-owners
  const canManage = isOwner || isAdmin || isNCS;
  const canManageCheckIns = canManage || isNCSOrLogger;
  
  // NCS can start/manage the net even if they're not the owner
  const canStartNet = canManage || isNCS;
  
  // Check if net has any NCS assigned
  const hasNCS = netRoles.some((role: any) => role.role === 'NCS');

  // Get NCS roles sorted by assigned_at for consistent color assignment
  const ncsRoles = netRoles
    .filter((role: any) => role.role === 'NCS')
    .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime());

  // Helper to get NCS color by user_id
  const getNcsColor = (userId: number) => {
    const index = ncsRoles.findIndex((r: any) => r.user_id === userId);
    return index >= 0 ? NCS_COLORS[index % NCS_COLORS.length] : null;
  };

  // Helper to get NCS color by frequency_id
  const getNcsColorForFrequency = (frequencyId: number) => {
    const role = ncsRoles.find((r: any) => r.active_frequency_id === frequencyId);
    if (role) {
      const index = ncsRoles.findIndex((r: any) => r.user_id === role.user_id);
      return index >= 0 ? NCS_COLORS[index % NCS_COLORS.length] : null;
    }
    return null;
  };

  // Helper to get NCS callsign for a frequency
  const getNcsForFrequency = (frequencyId: number) => {
    const role = ncsRoles.find((r: any) => r.active_frequency_id === frequencyId);
    return role ? (role.callsign || role.name || role.email) : null;
  };

  // Handle frequency chip click - NCS claims frequency, or Ctrl+click filters
  // For closed/archived nets, only allow Ctrl+click filtering (no claiming/setting active)
  const handleFrequencyChipClick = async (frequencyId: number, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle frequency filter (always allowed)
      setFilteredFrequencyIds(prev => 
        prev.includes(frequencyId) 
          ? prev.filter(id => id !== frequencyId)
          : [...prev, frequencyId]
      );
    } else if (net?.status === 'closed' || net?.status === 'archived') {
      // For closed/archived nets, regular clicks do nothing (chips are view-only)
      return;
    } else if (canManageCheckIns && userNetRole?.role === 'NCS') {
      // NCS clicking: claim this frequency and add to their available frequencies
      try {
        await netRoleApi.claimFrequency(Number(netId), userNetRole.id, frequencyId);
        // Also add this frequency to the NCS's check-in available_frequencies
        const ncsCheckIn = checkIns.find((ci: CheckIn) => ci.user_id === user?.id && ci.status !== 'checked_out');
        if (ncsCheckIn) {
          const currentFreqs = ncsCheckIn.available_frequencies || [];
          if (!currentFreqs.includes(frequencyId)) {
            await checkInApi.update(ncsCheckIn.id, {
              available_frequency_ids: [...currentFreqs, frequencyId]
            });
          }
        }
        await fetchNetRoles();
        await fetchCheckIns();
        // Show reminder toast if multiple frequencies
        if (net.frequencies.length > 1) {
          setToastMessage('You are now monitoring this frequency. Other NCS operators can claim different frequencies.');
        }
      } catch (error: any) {
        setToastMessage(error.response?.data?.detail || 'Failed to claim frequency');
      }
    } else if (canManageCheckIns) {
      // Non-NCS managers: set active frequency (existing behavior)
      handleSetActiveFrequency(frequencyId);
    }
  };

  // Filter check-ins based on search query AND frequency filter
  const filteredCheckIns = checkIns.filter((checkIn: CheckIn) => {
    // First apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        checkIn.callsign?.toLowerCase().includes(query) ||
        checkIn.name?.toLowerCase().includes(query) ||
        checkIn.location?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }
    
    // Then apply frequency filter (if any frequencies are selected)
    if (filteredFrequencyIds.length > 0) {
      // Always show NCS operators regardless of frequency filter
      const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
      if (isNcsUser) return true;
      
      // Check if the check-in has any of the filtered frequencies in available_frequencies
      const checkInFreqs = checkIn.available_frequencies || [];
      const hasMatchingFreq = filteredFrequencyIds.some(fid => checkInFreqs.includes(fid));
      if (!hasMatchingFreq) return false;
    }
    
    return true;
  });

  // Find the user's active check-in (not checked out)
  const userActiveCheckIn = checkIns.find(
    (checkIn: any) => checkIn.user_id === user?.id && checkIn.status !== 'checked_out'
  );

  const handleCheckOut = async () => {
    if (!userActiveCheckIn) return;
    
    // Check if user is NCS and if there are other NCS members
    const isUserNCS = netRoles.some((role: any) => role.user_id === user?.id && role.role === 'NCS');
    if (isUserNCS) {
      const otherNCS = netRoles.filter((role: any) => 
        role.role === 'NCS' && 
        role.user_id !== user?.id &&
        checkIns.some((ci: any) => ci.user_id === role.user_id && ci.status !== 'checked_out')
      );
      if (otherNCS.length === 0) {
        alert('Cannot check out: You are the only active NCS. Please assign another NCS first.');
        return;
      }
    }
    
    try {
      await checkInApi.update(userActiveCheckIn.id, {
        status: 'checked_out',
        checked_out_at: new Date().toISOString(),
      });
      fetchCheckIns();
    } catch (error) {
      console.error('Failed to check out:', error);
      alert('Failed to check out');
    }
  };

  const handleClaimNCS = async () => {
    try {
      await netApi.claimNcs(netId);
      await fetchNetRoles();
      setToastMessage('You are now NCS');
    } catch (error: any) {
      console.error('Failed to claim NCS:', error);
      setToastMessage(error.response?.data?.detail || 'Failed to claim NCS');
    }
  };

  return (
    <Container maxWidth={false} sx={{ height: { xs: 'auto', md: '100%' }, py: 0, px: { xs: 0.5, sm: 0 }, display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 0.5, flex: { xs: 'none', md: 1 }, display: 'flex', flexDirection: 'column', overflow: { xs: 'visible', md: 'hidden' }, minHeight: 0 }}>
        <Box sx={{ flexShrink: 0 }}>
          <Grid container spacing={0} sx={{ mt: 0.5, flex: 1, minHeight: 0 }}>
            <Grid item xs={12} md={8} sx={{ pr: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="h5" component="h1" sx={{ mb: 0 }}>
                  {net.name}
                </Typography>
                {net.description && (
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ fontStyle: 'italic' }}
                  >
                    — {net.description}
                  </Typography>
                )}
              </Box>
              {/* Stats and Frequency chips row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mb: 0.5, gap: 0.5 }}>
                {/* Left side: Status, timers, and stats */}
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip label={net.status === 'lobby' ? 'LOBBY' : net.status} size="small" color={net.status === 'active' ? 'success' : net.status === 'lobby' ? 'warning' : 'default'} />
                  {/* Countdown timer - shows time until scheduled start */}
                  {countdownTime && (
                    <Chip 
                      icon={<TimerIcon />}
                      label={countdownTime === 'Starting soon' ? countdownTime : `Starts in ${countdownTime}`}
                      size="small" 
                      color="warning" 
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  )}
                  {/* Duration timer - shows elapsed time since net started */}
                  {durationTime && (
                    <Chip 
                      icon={<AccessTimeIcon />}
                      label={`Duration: ${durationTime}`}
                      size="small" 
                      color="info" 
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  )}
                  {netStats && (
                    <>
                      <Chip label={`${netStats.total_check_ins} Check-ins`} size="small" color="primary" variant="outlined" />
                      <Chip label={`${netStats.online_count} Online`} size="small" color="success" variant="outlined" />
                      {netStats.guest_count > 0 && (
                        <Chip label={`${netStats.guest_count} Guests`} size="small" color="default" variant="outlined" />
                      )}
                    </>
                  )}
                </Box>
                {/* Right side: Frequency chips - always show so attendees know where to tune */}
                {net.frequencies && net.frequencies.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Show All chip when filtering is active */}
                    {filteredFrequencyIds.length > 0 && (
                      <Chip
                        label="Show All"
                        size="small"
                        color="secondary"
                        onClick={() => setFilteredFrequencyIds([])}
                        onDelete={() => setFilteredFrequencyIds([])}
                        sx={{ height: 24 }}
                      />
                    )}
                    {net.frequencies.map((freq) => {
                      const ncsColor = getNcsColorForFrequency(freq.id);
                      const ncsCallsign = getNcsForFrequency(freq.id);
                      const isFiltered = filteredFrequencyIds.includes(freq.id);
                      const isActive = freq.id === net.active_frequency_id;
                      // Check if current user is the NCS who claimed this frequency
                      const isMyFrequency = userNetRole?.role === 'NCS' && userNetRole?.active_frequency_id === freq.id;
                      const myNcsColor = isMyFrequency && user?.id ? getNcsColor(user.id) : null;
                      // For closed/archived nets, chips are view-only except Ctrl+click filter
                      const isInactiveNet = net.status === 'closed' || net.status === 'archived';
                      
                      // Build tooltip text
                      let tooltipText = '';
                      if (isMyFrequency) {
                        tooltipText = '⭐ YOUR claimed frequency\n';
                      } else if (ncsCallsign) {
                        tooltipText = `${ncsCallsign} is monitoring this frequency\n`;
                      }
                      if (!isInactiveNet && canManageCheckIns) {
                        if (userNetRole?.role === 'NCS') {
                          tooltipText += 'Click to claim • ';
                        } else {
                          tooltipText += 'Click to set active • ';
                        }
                      }
                      tooltipText += 'Ctrl+click to filter';
                      
                      return (
                        <Tooltip key={freq.id} title={tooltipText} arrow>
                          <Chip
                            label={freq.frequency 
                              ? `${freq.frequency} MHz ${freq.mode || ''}`.trim()
                              : `${freq.network || ''}${freq.talkgroup ? ` TG${freq.talkgroup}` : ''} ${freq.mode || ''}`.trim()
                            }
                            size="small"
                            color={isActive ? 'primary' : isFiltered ? 'info' : 'default'}
                            variant={isFiltered ? 'filled' : 'outlined'}
                            onClick={(e) => handleFrequencyChipClick(freq.id, e)}
                            clickable
                            sx={{ 
                              height: 24,
                              cursor: 'pointer',
                              fontWeight: isActive ? 'bold' : 'normal',
                              // Highlight current user's claimed frequency with thick ring
                              ...(isMyFrequency && myNcsColor && {
                                backgroundColor: myNcsColor.bg,
                                borderColor: myNcsColor.border,
                                borderWidth: 3,
                                boxShadow: `0 0 8px ${myNcsColor.border}`,
                                '& .MuiChip-label': {
                                  color: myNcsColor.text,
                                  fontWeight: 'bold',
                                },
                                '&:hover': {
                                  backgroundColor: myNcsColor.bg,
                                  opacity: 0.9,
                                },
                              }),
                              // Apply NCS color if assigned (but not current user)
                              ...(!isMyFrequency && ncsColor && {
                                backgroundColor: ncsColor.bg,
                                borderColor: ncsColor.border,
                                '& .MuiChip-label': {
                                  color: ncsColor.text,
                                },
                                '&:hover': {
                                  backgroundColor: ncsColor.bg,
                                  opacity: 0.8,
                                },
                              }),
                              // Override with filter styling if filtered
                              ...(isFiltered && {
                                backgroundColor: 'info.main',
                                '& .MuiChip-label': {
                                  color: 'white',
                                },
                              }),
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={4} sx={{ pl: { md: 0.5 } }}>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                {/* Start Net button - prominent, green, leftmost */}
                {canStartNet && (net.status === 'draft' || net.status === 'scheduled') && (
                  <>
                    <Tooltip title="Start the net">
                      <Button 
                        size="small" 
                        variant="contained" 
                        color="success"
                        onClick={handleStartNetClick} 
                        disabled={startingNet}
                        sx={{ 
                          minWidth: 'auto', 
                          px: 1,
                          ...(highlightStartNet && {
                            animation: `${pulseAnimationGreen} 1s infinite`,
                          })
                        }}
                      >
                        {startingNet ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <PlayArrowIcon fontSize="small" />
                        )}
                      </Button>
                    </Tooltip>
                    {/* Show yellow shimmer ? icon if topic/poll needs configuration */}
                    {needsTopicPollConfig() && (
                      <Tooltip title="Topic or poll question needs to be set before starting">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setTempTopicPrompt(net?.topic_of_week_prompt || '');
                            setTempPollQuestion(net?.poll_question || '');
                            setTopicPollDialogOpen(true);
                          }}
                          sx={{
                            p: 0.5,
                            borderRadius: '50%',
                            animation: `${shimmerYellow} 2s ease-in-out infinite`,
                          }}
                        >
                          <HelpOutlineIcon fontSize="small" sx={{ color: 'warning.dark' }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </>
                )}
                {canManage && (net.status === 'draft' || net.status === 'scheduled') && (
                  <>
                    <Tooltip title="Edit net settings">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => navigate(`/nets/${netId}/edit`)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <EditIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Assign NCS and logger roles (any assigned NCS can start the net)">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => {
                          fetchAllUsers();
                          setRoleDialogOpen(true);
                        }}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <GroupIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                  </>
                )}
                {(net.status === 'active' || net.status === 'lobby') && checkIns.length > 0 && (
                  <Tooltip title="Bulk add multiple check-ins">
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => setBulkCheckInOpen(true)}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <FastForwardIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {checkIns.length > 0 && (
                  <>
                    <Tooltip title="Search check-ins">
                      <Button 
                        size="small" 
                        variant={searchQuery ? "contained" : "outlined"}
                        onClick={() => setSearchOpen(true)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <SearchIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="View check-in locations on map">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => setMapOpen(true)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <MapIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Net statistics">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => navigate(`/statistics/nets/${netId}`)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <BarChartIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    {net.script && (
                      <Tooltip title="View net script">
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => setScriptOpen(true)}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          <ArticleIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}
                {net.info_url && (
                  <Tooltip title="Net/Club info">
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => window.open(net.info_url, '_blank')}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <LanguageIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {canManage && (net.status === 'active' || net.status === 'lobby') ? (
                  <>
                    <Tooltip title="Edit net settings">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => navigate(`/nets/${netId}/edit`)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <EditIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Manage NCS and logger roles">
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => {
                          fetchAllUsers();
                          setRoleDialogOpen(true);
                        }}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <GroupIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    {!hasNCS && (
                      <Button 
                        size="small" 
                        variant="contained" 
                        color="warning"
                        onClick={handleClaimNCS}
                      >
                        Claim NCS
                      </Button>
                    )}
                  </>
                ) : (
                  <Tooltip title="View net info">
                    <Button 
                      size="small" 
                      variant="outlined" 
                      onClick={() => navigate(`/nets/${netId}/info`)}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <InfoIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {isAuthenticated && (net.status === 'active' || net.status === 'lobby') && (
                  userActiveCheckIn ? (
                    <Tooltip title="Check out of net">
                      <Button 
                        size="small"
                        variant="outlined" 
                        color="error"
                        onClick={handleCheckOut}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <LogoutIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Check into net">
                      <Button 
                        size="small"
                        variant="contained" 
                        color="primary"
                        onClick={() => {
                          // Pre-fill form with user's profile data
                          if (user) {
                            // Use grid square if location_awareness is enabled and available, otherwise use profile location
                            const locationValue = (user.location_awareness && gridSquare) 
                              ? gridSquare 
                              : (user.location || '');
                            setCheckInForm({
                              callsign: getAppropriateCallsign(),
                              name: user.name || '',
                              location: locationValue,
                              skywarn_number: '',
                              weather_observation: '',
                              power_source: '',
                              power: '',
                              feedback: '',
                              notes: '',
                              relayed_by: '',
                              available_frequency_ids: [],
                              custom_fields: {},
                              topic_response: '',
                              poll_response: '',
                            });
                          }
                          if (canManageCheckIns) {
                            // NCS/Logger: Scroll to and focus the callsign field
                            const callsignField = document.querySelector('input[placeholder="Callsign"]') as HTMLInputElement;
                            if (callsignField) {
                              callsignField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              callsignField.focus();
                            }
                          } else {
                            // Regular user: Open check-in dialog
                            setCheckInDialogOpen(true);
                          }
                        }}
                        sx={{ 
                          minWidth: 'auto', 
                          px: 1,
                          ...(highlightCheckIn && {
                            animation: `${pulseAnimation} 1s infinite`,
                          })
                        }}
                      >
                        <LoginIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                  )
                )}
                {canManage && net.status === 'lobby' && (
                  <Tooltip title="Go live - Start the net officially and notify subscribers">
                    <Button 
                      size="small" 
                      variant="contained" 
                      color="success" 
                      onClick={handleGoLive}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <PlayArrowIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {canManage && (net.status === 'active' || net.status === 'lobby') && (
                  <Tooltip title="Close net">
                    <Button 
                      size="small" 
                      variant="contained" 
                      color="error" 
                      onClick={() => setCloseNetDialogOpen(true)}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <CloseIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
                {net.status === 'closed' && (
                  <>
                    <Tooltip title="Export check-ins to CSV">
                      <Button 
                        size="small"
                        variant="outlined" 
                        onClick={handleExportCSV}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <DownloadIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Download ICS-309 Communications Log">
                      <Button 
                        size="small"
                        variant="outlined" 
                        onClick={handleExportICS309}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <DescriptionIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Generate comprehensive net report (PDF)">
                      <Button 
                        size="small"
                        variant="outlined" 
                        onClick={() => navigate(`/nets/${netId}/report`)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    {canManage && (
                      <Tooltip title="Archive net">
                        <Button 
                          size="small"
                          variant="outlined" 
                          onClick={handleArchive}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          <ArchiveIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    )}
                    {isAdmin && (
                      <Tooltip title="Delete net">
                        <Button 
                          size="small"
                          variant="outlined" 
                          color="error"
                          onClick={handleDelete}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}
                {/* ========== ARCHIVED NET TOOLBAR BUTTONS ========== */}
                {net.status === 'archived' && (
                  <>
                    <Tooltip title="Export check-ins to CSV">
                      <Button 
                        size="small"
                        variant="outlined" 
                        onClick={handleExportCSV}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <DownloadIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Download ICS-309 Communications Log">
                      <Button 
                        size="small"
                        variant="outlined" 
                        onClick={handleExportICS309}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <DescriptionIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    <Tooltip title="Generate comprehensive net report (PDF)">
                      <Button 
                        size="small"
                        variant="outlined" 
                        onClick={() => navigate(`/nets/${netId}/report`)}
                        sx={{ minWidth: 'auto', px: 1 }}
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </Button>
                    </Tooltip>
                    {canManage && (
                      <Tooltip title="Unarchive net - restore to closed status">
                        <Button 
                          size="small"
                          variant="outlined" 
                          onClick={handleUnarchive}
                          sx={{ minWidth: 'auto', px: 1 }}
                        >
                          <UnarchiveIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}
                {/* ========== DELETE BUTTON FOR DRAFT/ARCHIVED NETS ========== */}
                {canManage && (net.status === 'draft' || net.status === 'archived') && (
                  <Tooltip title="Delete net">
                    <Button 
                      size="small"
                      variant="outlined" 
                      color="error"
                      onClick={handleDelete}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </Button>
                  </Tooltip>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>

        {(net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
          <Grid container spacing={0} sx={{ mt: 0.5, flex: { xs: 'none', md: 1 }, minHeight: 0 }}>
            {/* Check-in list - hide Grid if detached */}
            {!checkInListDetached && (
            <Grid item xs={12} md={chatDetached ? 12 : 8} sx={{ pr: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: { xs: 'auto', md: 0 }, height: { xs: 'auto', md: '100%' }, mb: { xs: 2, md: 0 } }}>
              <FloatingWindow
                title="Check-in List"
                isDetached={false}
                onDetach={handleDetachCheckInList}
                onAttach={handleAttachCheckInList}
                defaultWidth={900}
                defaultHeight={600}
                minWidth={400}
                minHeight={300}
                storageKey="checkInList"
              >
              {/* Desktop: Combined table with sticky header */}
              <TableContainer sx={{ 
                flex: { xs: 'none', md: 1 }, 
                overflow: 'auto', 
                border: 1, 
                borderColor: 'divider', 
                borderRadius: '4px', 
                minHeight: 0, 
                display: { xs: 'none', md: 'block' },
                '&::-webkit-scrollbar': {
                  width: 8,
                  height: 8,
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                  borderRadius: 4,
                  '&:hover': {
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                  },
                },
              }}>
                {/* ========== CHECK-IN LIST TABLE 1: Desktop Inline (attached) ========== */}
                {/* This table displays when check-in list is NOT detached, on medium+ screens */}
                <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead sx={{ position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
                    <TableRow>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>#</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Callsign *</TableCell>
                      {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Name {net.field_config.name.required && '*'}</TableCell>}
                      {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Location {net.field_config.location.required && '*'}</TableCell>}
                      {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Spotter {net.field_config.skywarn_number.required && '*'}</TableCell>}
                      {net?.field_config?.weather_observation?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Weather {net.field_config.weather_observation.required && '*'}</TableCell>}
                      {net?.field_config?.power_source?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power Src {net.field_config.power_source.required && '*'}</TableCell>}
                      {net?.field_config?.power?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power {net.field_config.power.required && '*'}</TableCell>}
                      {net?.field_config?.notes?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Notes {net.field_config.notes.required && '*'}</TableCell>}
                      {/* Custom fields */}
                      {getEnabledCustomFields().map((field) => (
                        <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                          {field.label} {isFieldRequired(field.name) && '*'}
                        </TableCell>
                      ))}
                      {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Topic</TableCell>}
                      {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Poll</TableCell>}
                      {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                      {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>Actions</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap', width: 30, p: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={handleDetachCheckInList}
                          title="Detach to floating window"
                          sx={{ p: 0.25 }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                  {/* Existing check-ins */}
                  {filteredCheckIns.map((checkIn, index) => {
                    // Check if this station is available on the active frequency
                    const isOnActiveFrequency = net.active_frequency_id && 
                      checkIn.available_frequencies && 
                      checkIn.available_frequencies.includes(net.active_frequency_id);
                    // Get NCS color if this user is an NCS
                    const ncsColor = checkIn.user_id ? getNcsColor(checkIn.user_id) : null;
                    const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
                    
                    // Calculate column count for frequency chip row colspan
                    const hasFrequencyChips = net.frequencies && net.frequencies.length > 1 && checkIn.available_frequencies && checkIn.available_frequencies.length > 0;
                    let columnCount = 5; // #, Status, Callsign, Time, pop-out icon
                    if (net?.field_config?.name?.enabled) columnCount++;
                    if (net?.field_config?.location?.enabled) columnCount++;
                    if (net?.field_config?.skywarn_number?.enabled) columnCount++;
                    if (net?.field_config?.weather_observation?.enabled) columnCount++;
                    if (net?.field_config?.power_source?.enabled) columnCount++;
                    if (net?.field_config?.power?.enabled) columnCount++;
                    if (net?.field_config?.notes?.enabled) columnCount++;
                    columnCount += getEnabledCustomFields().length;
                    if (hasAnyRelayedBy) columnCount++;
                    if (canManage) columnCount++;
                    
                    // Check if this row is being inline edited
                    const isInlineEditing = inlineEditingId === checkIn.id;
                    
                    return (
                    <React.Fragment key={checkIn.id}>
                    <TableRow
                      ref={isInlineEditing ? inlineEditRowRef : undefined}
                      onClick={(e) => {
                        // Don't start editing if clicking on interactive elements
                        const target = e.target as HTMLElement;
                        if (target.closest('button, select, input, .MuiSelect-root, .MuiIconButton-root')) return;
                        // Don't start editing if already editing this row
                        if (isInlineEditing) return;
                        // Determine which field was clicked based on the cell's data-field attribute
                        const cell = target.closest('td[data-field]') as HTMLElement | null;
                        const focusField = cell?.dataset.field || 'callsign';
                        // Start inline editing
                        if (canManageCheckIns && checkIn.status !== 'checked_out') {
                          handleStartInlineEdit(checkIn, focusField);
                        }
                      }}
                      sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : isNcsUser && ncsColor ? ncsColor.bg
                          : isOnActiveFrequency
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)'
                          : 'transparent',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                        border: checkIn.id === activeSpeakerId ? 2 : 0,
                        borderColor: checkIn.id === activeSpeakerId ? 'success.main' : 'transparent',
                        // Add left border for NCS users
                        ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                          borderLeft: `3px solid ${ncsColor.border}`,
                        }),
                        // Cursor pointer when row is editable
                        cursor: canManageCheckIns && checkIn.status !== 'checked_out' && !isInlineEditing ? 'pointer' : 'default',
                        // Highlight row being edited
                        ...(isInlineEditing && {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                        }),
                        '& td, & th': {
                          ...(checkIn.id === activeSpeakerId ? { fontWeight: 'bold' } : {}),
                          verticalAlign: 'middle',
                          whiteSpace: 'nowrap',
                          // Remove bottom border and padding if frequency chips row follows
                          ...(hasFrequencyChips ? { border: 0, paddingBottom: 0 } : {}),
                        }
                      }}
                    >
                      <TableCell sx={{ width: 35 }}>{index + 1}</TableCell>
                      <TableCell sx={{ width: 75 }} onClick={(e) => e.stopPropagation()}>
                        {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                          // Calculate value once

                          // Ensure selectValue matches MenuItem values exactly
                          // Determine selectValue: show role if present, else status
                          const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
                          let selectValue = checkIn.status.toLowerCase();
                          if (userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                            selectValue = userRole.role.toLowerCase();
                          } else if (userRole && ['NCS', 'LOGGER'].includes(userRole.role)) {
                            selectValue = userRole.role.toLowerCase();
                          }
                          // Only allow lowercase values for Select and MenuItem
                          const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'available', 'announcements', 'mobile', 'checked_out'];
                          if (!validValues.includes(selectValue)) {
                            selectValue = 'checked_in';
                          }

                          return (
                            <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} placement="right" arrow>
                              <Select
                                size="small"
                                value={selectValue}
                                onChange={async (e) => {
                                  await handleStatusChange(checkIn.id, e.target.value);
                                  // Force refresh after role assignment
                                  await fetchNetRoles();
                                  await fetchCheckIns();
                                }}
                                sx={{ minWidth: 50 }}
                                disabled={owner?.id === checkIn.user_id}
                                MenuProps={{
                                  disableScrollLock: true,
                                  disableAutoFocusItem: false,
                                  autoFocus: true,
                                }}
                              >
                                {/* Always render the current value as an option to prevent MUI errors */}
                                {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">{getNcsIcon(checkIn)}</MenuItem>)}
                                {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋</MenuItem>)}
                                <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}</MenuItem>
                                <MenuItem value="listening">👂</MenuItem>
                                <MenuItem value="relay">📡</MenuItem>
                                <MenuItem value="away">⏸️</MenuItem>
                                <MenuItem value="available">🚨</MenuItem>
                                <MenuItem value="announcements">📢</MenuItem>
                                <MenuItem value="mobile">🚗</MenuItem>
                                {canManageCheckIns && <MenuItem value="checked_out">👋</MenuItem>}
                              </Select>
                            </Tooltip>
                          );
                        })() : (
                          <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} placement="right" arrow>
                            <span style={{ cursor: 'help' }}>{getStatusIcon(checkIn.status, checkIn)}</span>
                          </Tooltip>
                        )}
                      </TableCell>
                      {/* Callsign cell - inline editable */}
                      <TableCell data-field="callsign" sx={{ width: 140 }}>
                        {isInlineEditing ? (
                          <TextField
                            size="small"
                            value={inlineEditValues.callsign || ''}
                            onChange={(e) => handleInlineFieldChange('callsign', e.target.value.toUpperCase())}
                            onKeyDown={handleInlineKeyDown}
                            onBlur={handleInlineBlur}
                            autoFocus={inlineEditFocusField === 'callsign'}
                            inputProps={{ style: { textTransform: 'uppercase', padding: '4px 8px' } }}
                            sx={{ width: '100%' }}
                          />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {checkIn.user_id && onlineUserIds.includes(checkIn.user_id) && (
                              <Box 
                                sx={{ 
                                  width: 8, 
                                  height: 8, 
                                  borderRadius: '50%', 
                                  backgroundColor: 'success.main',
                                  flexShrink: 0
                                }} 
                                title="Online"
                              />
                            )}
                            <Box sx={{ fontWeight: 500 }}>
                              {checkIn.callsign}
                            </Box>
                            {checkIn.relayed_by && (
                              <Tooltip title={`Relayed by ${checkIn.relayed_by}`} arrow>
                                <span style={{ cursor: 'help' }}>📡</span>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      {/* Name cell - inline editable */}
                      {net?.field_config?.name?.enabled && (
                        <TableCell data-field="name">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.name || ''}
                              onChange={(e) => handleInlineFieldChange('name', e.target.value)}
                              onKeyDown={handleInlineKeyDown} 
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'name'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.name}
                        </TableCell>
                      )}
                      {/* Location cell - inline editable */}
                      {net?.field_config?.location?.enabled && (
                        <TableCell data-field="location">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.location || ''}
                              onChange={(e) => handleInlineFieldChange('location', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'location'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.location}
                        </TableCell>
                      )}
                      {/* Skywarn Number - inline editable */}
                      {net?.field_config?.skywarn_number?.enabled && (
                        <TableCell data-field="skywarn_number" sx={{ width: 70 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.skywarn_number || ''}
                              onChange={(e) => handleInlineFieldChange('skywarn_number', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'skywarn_number'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.skywarn_number}
                        </TableCell>
                      )}
                      {/* Weather Observation - inline editable */}
                      {net?.field_config?.weather_observation?.enabled && (
                        <TableCell data-field="weather_observation">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.weather_observation || ''}
                              onChange={(e) => handleInlineFieldChange('weather_observation', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'weather_observation'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.weather_observation}
                        </TableCell>
                      )}
                      {/* Power Source - inline editable */}
                      {net?.field_config?.power_source?.enabled && (
                        <TableCell data-field="power_source" sx={{ width: 70 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.power_source || ''}
                              onChange={(e) => handleInlineFieldChange('power_source', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'power_source'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.power_source}
                        </TableCell>
                      )}
                      {/* Power - inline editable */}
                      {net?.field_config?.power?.enabled && (
                        <TableCell data-field="power" sx={{ width: 70 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.power || ''}
                              onChange={(e) => handleInlineFieldChange('power', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'power'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.power}
                        </TableCell>
                      )}
                      {/* Notes - inline editable */}
                      {net?.field_config?.notes?.enabled && (
                        <TableCell data-field="notes">
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.notes || ''}
                              onChange={(e) => handleInlineFieldChange('notes', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'notes'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.notes}
                        </TableCell>
                      )}
                      {/* Custom field values - inline editable */}
                      {getEnabledCustomFields().map((field) => (
                        <TableCell key={field.name} data-field={`custom_${field.name}`}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.custom_fields?.[field.name] || ''}
                              onChange={(e) => handleInlineFieldChange(`custom_${field.name}`, e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === `custom_${field.name}`}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.custom_fields?.[field.name] || ''}
                        </TableCell>
                      ))}
                      {/* Topic response - inline editable */}
                      {net?.topic_of_week_enabled && (
                        <TableCell data-field="topic_response" sx={{ whiteSpace: 'nowrap' }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.topic_response || ''}
                              onChange={(e) => handleInlineFieldChange('topic_response', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'topic_response'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.topic_response || ''}
                        </TableCell>
                      )}
                      {/* Poll response - inline editable */}
                      {net?.poll_enabled && (
                        <TableCell data-field="poll_response" sx={{ whiteSpace: 'nowrap' }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.poll_response || ''}
                              onChange={(e) => handleInlineFieldChange('poll_response', e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'poll_response'}
                              inputProps={{ style: { padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.poll_response || ''}
                        </TableCell>
                      )}
                      {/* Relayed By - inline editable */}
                      {hasAnyRelayedBy && (
                        <TableCell data-field="relayed_by" sx={{ width: 80 }}>
                          {isInlineEditing ? (
                            <TextField
                              size="small"
                              value={inlineEditValues.relayed_by || ''}
                              onChange={(e) => handleInlineFieldChange('relayed_by', e.target.value.toUpperCase())}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={handleInlineBlur}
                              autoFocus={inlineEditFocusField === 'relayed_by'}
                              inputProps={{ style: { textTransform: 'uppercase', padding: '4px 8px' } }}
                              sx={{ width: '100%' }}
                            />
                          ) : checkIn.relayed_by || ''}
                        </TableCell>
                      )}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {formatTimeWithDate(checkIn.checked_in_at, user?.prefer_utc || false, net?.started_at)}
                      </TableCell>
                      {/* Actions column - remove edit pencil, keep active speaker and delete */}
                      {canManage && (
                      <TableCell sx={{ width: 70 }} onClick={(e) => e.stopPropagation()}>
                        {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (
                          <IconButton
                            size="small"
                            onClick={() => handleSetActiveSpeaker(checkIn.id)}
                            color={checkIn.id === activeSpeakerId ? 'primary' : 'default'}
                            title="Mark as active speaker"
                          >
                            🗣️
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCheckIn(checkIn.id)}
                          title="Delete check-in"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                      )}
                      <TableCell />
                    </TableRow>
                    {/* Frequency chips row - only show if net has multiple frequencies */}
                    {hasFrequencyChips && (
                      <TableRow sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : isNcsUser && ncsColor ? ncsColor.bg
                          : isOnActiveFrequency
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)'
                          : 'transparent',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                        // Add left border for NCS users
                        ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                          borderLeft: `3px solid ${ncsColor.border}`,
                        }),
                      }}>
                        <TableCell colSpan={columnCount} sx={{ pt: 0, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 4 }}>
                            {checkIn.available_frequencies!.map((freqId: number) => {
                              const freq = net.frequencies.find((f: any) => f.id === freqId);
                              const isActive = freqId === checkIn.frequency_id;
                              // Get NCS color for this frequency
                              const freqNcsColor = getNcsColorForFrequency(freqId);
                              return freq ? (
                                <Chip 
                                  key={freqId}
                                  label={isActive ? `📡 ${formatFrequencyDisplay(freq)}` : formatFrequencyDisplay(freq)}
                                  size="small"
                                  variant="filled"
                                  sx={{ 
                                    height: 18, 
                                    fontSize: '0.7rem',
                                    // Use NCS color if available, otherwise default styling
                                    ...(freqNcsColor ? {
                                      backgroundColor: freqNcsColor.bg,
                                      borderColor: freqNcsColor.border,
                                      border: `1px solid ${freqNcsColor.border}`,
                                      '& .MuiChip-label': {
                                        color: freqNcsColor.text,
                                      },
                                    } : isActive ? {
                                      backgroundColor: 'primary.main',
                                      '& .MuiChip-label': { color: 'white' },
                                    } : {
                                      backgroundColor: 'action.selected',
                                    }),
                                  }}
                                />
                              ) : null;
                            })}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  )})}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Mobile: Scrollable table */}
            <TableContainer sx={{ 
              display: { xs: 'block', md: 'none' }, 
              overflow: 'auto', 
              border: 1, 
              borderColor: 'divider', 
              borderRadius: '4px', 
              maxHeight: 400,
              '&::-webkit-scrollbar': {
                width: 8,
                height: 8,
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                borderRadius: 4,
                '&:hover': {
                  backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                },
              },
            }}>
              {/* ========== CHECK-IN LIST TABLE 2: Mobile View ========== */}
              {/* This table displays on small screens (xs) only */}
              <Table size="small">
                <TableHead sx={{ position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>#</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>Callsign *</TableCell>
                    {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Name {net.field_config.name.required && '*'}</TableCell>}
                    {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Location {net.field_config.location.required && '*'}</TableCell>}
                    {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Spotter {net.field_config.skywarn_number.required && '*'}</TableCell>}
                    {net?.field_config?.weather_observation?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Weather {net.field_config.weather_observation.required && '*'}</TableCell>}
                    {net?.field_config?.power_source?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power Src {net.field_config.power_source.required && '*'}</TableCell>}
                    {net?.field_config?.power?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power {net.field_config.power.required && '*'}</TableCell>}
                    {net?.field_config?.notes?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Notes {net.field_config.notes.required && '*'}</TableCell>}
                    {getEnabledCustomFields().map((field) => (
                      <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>
                        {field.label} {isFieldRequired(field.name) && '*'}
                      </TableCell>
                    ))}
                    {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Topic</TableCell>}
                    {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Poll</TableCell>}
                    {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                    {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCheckIns.map((checkIn, index) => {
                    const isOnActiveFrequency = net.active_frequency_id && checkIn.available_frequencies?.includes(net.active_frequency_id);
                    // Get NCS color if this user is an NCS
                    const ncsColor = checkIn.user_id ? getNcsColor(checkIn.user_id) : null;
                    const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
                    
                    return (
                      <TableRow key={checkIn.id} sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' ? 'action.disabledBackground' 
                          : isNcsUser && ncsColor ? ncsColor.bg
                          : isOnActiveFrequency ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)' : 'inherit',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                        // Add left border for NCS users
                        ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                          borderLeft: `3px solid ${ncsColor.border}`,
                        }),
                      }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{index + 1}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                            const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
                            let selectValue = checkIn.status.toLowerCase();
                            if (userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                              selectValue = userRole.role.toLowerCase();
                            }
                            const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'available', 'announcements', 'mobile', 'checked_out'];
                            if (!validValues.includes(selectValue)) {
                              selectValue = 'checked_in';
                            }
                            return (
                              <Select
                                size="small"
                                value={selectValue}
                                onChange={async (e) => {
                                  await handleStatusChange(checkIn.id, e.target.value);
                                  await fetchNetRoles();
                                  await fetchCheckIns();
                                }}
                                sx={{ minWidth: 45 }}
                                disabled={owner?.id === checkIn.user_id}
                                MenuProps={{ disableScrollLock: true }}
                              >
                                {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">{getNcsIcon(checkIn)}</MenuItem>)}
                                {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋</MenuItem>)}
                                <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}</MenuItem>
                                <MenuItem value="listening">👂</MenuItem>
                                <MenuItem value="relay">📡</MenuItem>
                                <MenuItem value="away">⏸️</MenuItem>
                                <MenuItem value="available">🚨</MenuItem>
                                <MenuItem value="announcements">📢</MenuItem>
                                <MenuItem value="mobile">🚗</MenuItem>
                                {canManageCheckIns && <MenuItem value="checked_out">👋</MenuItem>}
                              </Select>
                            );
                          })() : (
                            <span>{getStatusIcon(checkIn.status, checkIn)}</span>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {checkIn.user_id && onlineUserIds.includes(checkIn.user_id) && (
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'success.main', flexShrink: 0 }} />
                            )}
                            {checkIn.callsign}
                            {checkIn.relayed_by && (
                              <Tooltip title={`Relayed by ${checkIn.relayed_by}`} arrow>
                                <span>📡</span>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.name}</TableCell>}
                        {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.location}</TableCell>}
                        {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.skywarn_number}</TableCell>}
                        {net?.field_config?.weather_observation?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.weather_observation}</TableCell>}
                        {net?.field_config?.power_source?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.power_source}</TableCell>}
                        {net?.field_config?.power?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.power}</TableCell>}
                        {net?.field_config?.notes?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.notes}</TableCell>}
                        {getEnabledCustomFields().map((field) => (
                          <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>{checkIn.custom_fields?.[field.name] || ''}</TableCell>
                        ))}
                        {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.topic_response || ''}</TableCell>}
                        {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.poll_response || ''}</TableCell>}
                        {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.relayed_by || ''}</TableCell>}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTimeWithDate(checkIn.checked_in_at, user?.prefer_utc || false, net?.started_at)}</TableCell>
                        {canManage && (
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <IconButton size="small" onClick={() => handleDeleteCheckIn(checkIn.id)}><DeleteIcon fontSize="small" /></IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Legend - desktop only */}
            <Box sx={{ p: 0.5, backgroundColor: 'action.hover', border: 1, borderColor: 'divider', borderTop: 0, borderBottom: 0, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Legend:</Typography>
                <Tooltip title="Net Control Station - manages the net" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👑 NCS</Typography></Tooltip>
                <Tooltip title="2nd NCS - assists primary Net Control Station" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🤴 2nd NCS</Typography></Tooltip>
                <Tooltip title="Logger - assists NCS with logging" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📋 Logger</Typography></Tooltip>
                <Tooltip title="Checked in and available" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>✅ Standard</Typography></Tooltip>
                <Tooltip title="Re-checked into the net" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🔄 Recheck</Typography></Tooltip>
                <Tooltip title="Monitoring only, not transmitting" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👂 Listening</Typography></Tooltip>
                <Tooltip title="Relay station - can relay stations NCS cannot hear" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📡 Relay</Typography></Tooltip>
                <Tooltip title="Temporarily away, will return" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>⏸️ Away</Typography></Tooltip>
                <Tooltip title="Has traffic or emergency to report" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🚨 Traffic</Typography></Tooltip>
                <Tooltip title="Has announcements to share" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📢 Announce</Typography></Tooltip>
                <Tooltip title="Checked out of net" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👋 Out</Typography></Tooltip>
                {net.frequencies && net.frequencies.length > 1 && net.active_frequency_id && (
                  <Tooltip title="Station is available on the active frequency" placement="top" arrow>
                    <Typography variant="caption" sx={{ cursor: 'help', backgroundColor: 'rgba(25, 118, 210, 0.15)', px: 0.5, borderRadius: 0.5 }}>
                      🔵 On Active Freq
                    </Typography>
                  </Tooltip>
                )}
                {/* Inline edit hint - only shown to NCS/Loggers when net is active or in lobby */}
                {(net.status === 'active' || net.status === 'lobby') && canManageCheckIns && (
                  <Tooltip title="Click any row to edit check-in details inline" placement="top" arrow>
                    <Typography variant="caption" sx={{ cursor: 'help', color: 'primary.main', fontStyle: 'italic' }}>
                      💡 Click row to edit
                    </Typography>
                  </Tooltip>
                )}
              </Box>
            </Box>
            
            {/* Poll Results and Topic Responses Summary - shown for closed/archived nets */}
            {(net.status === 'closed' || net.status === 'archived') && (net.poll_enabled || net.topic_of_week_enabled) && (
              <Box sx={{ border: 1, borderColor: 'divider', borderTop: 0, p: 2, backgroundColor: 'background.paper' }}>
                <Grid container spacing={2}>
                  {/* Poll Results */}
                  {net.poll_enabled && pollResults.question && pollResults.results.length > 0 && (
                    <Grid item xs={12} md={net.topic_of_week_enabled ? 6 : 12}>
                      <Typography variant="subtitle2" gutterBottom>📊 Poll Results: {pollResults.question}</Typography>
                      <Box sx={{ mt: 1 }}>
                        {pollResults.results.map((result, idx) => {
                          const totalVotes = pollResults.results.reduce((sum, r) => sum + r.count, 0);
                          const percentage = totalVotes > 0 ? (result.count / totalVotes) * 100 : 0;
                          return (
                            <Box key={idx} sx={{ mb: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="body2">{result.response}</Typography>
                                <Typography variant="body2" color="text.secondary">{result.count} ({percentage.toFixed(0)}%)</Typography>
                              </Box>
                              <Box sx={{ width: '100%', backgroundColor: 'action.hover', borderRadius: 1, height: 8 }}>
                                <Box sx={{ width: `${percentage}%`, backgroundColor: 'primary.main', borderRadius: 1, height: '100%' }} />
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </Grid>
                  )}
                  
                  {/* Topic Responses */}
                  {net.topic_of_week_enabled && topicResponses.prompt && topicResponses.responses.length > 0 && (
                    <Grid item xs={12} md={net.poll_enabled ? 6 : 12}>
                      <Typography variant="subtitle2" gutterBottom>💬 Topic of the Week: {topicResponses.prompt}</Typography>
                      <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                        {topicResponses.responses.map((resp, idx) => (
                          <ListItem key={idx} sx={{ py: 0.5 }}>
                            <ListItemText
                              primary={
                                <Typography variant="body2">
                                  <strong>{resp.callsign}</strong>
                                  {resp.name && ` (${resp.name})`}: {resp.response}
                                </Typography>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}
            
            {/* New check-in form - desktop only */}
            {(net.status === 'active' || net.status === 'lobby') && canManageCheckIns && (
              <Paper sx={{ border: 1, borderColor: 'divider', borderTop: 0, borderRadius: '0 0 4px 4px', p: 1, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
                <Table size="small">
                  <TableBody>
                  <TableRow sx={{ '& .MuiTableCell-root': { border: 0, py: 0.25 } }}>
                    <TableCell>{checkIns.length + 1}</TableCell>
                    <TableCell>➕</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={checkInForm.callsign}
                        onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
                        onBlur={(e) => handleCallsignLookup(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCheckIn();
                          }
                        }}
                        placeholder="Callsign"
                        inputProps={{ style: { textTransform: 'uppercase', fontSize: '0.875rem' } }}
                        fullWidth
                        required
                      />
                    </TableCell>
                    {net?.field_config?.name?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.name}
                          onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Name"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.name.required}
                        />
                      </TableCell>
                    )}
                    {net?.field_config?.location?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.location}
                          onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Location"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.location.required}
                        />
                      </TableCell>
                    )}
                    {net?.field_config?.skywarn_number?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.skywarn_number}
                          onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Spotter #"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.skywarn_number.required}
                        />
                      </TableCell>
                    )}
                    {net?.field_config?.weather_observation?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.weather_observation}
                          onChange={(e) => setCheckInForm({ ...checkInForm, weather_observation: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Weather"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.weather_observation.required}
                        />
                      </TableCell>
                    )}
                    {net?.field_config?.power_source?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.power_source}
                          onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Pwr Src"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.power_source.required}
                        />
                      </TableCell>
                    )}
                    {net?.field_config?.power?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.power}
                          onChange={(e) => setCheckInForm({ ...checkInForm, power: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Power"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.power.required}
                        />
                      </TableCell>
                    )}
                    {net?.field_config?.notes?.enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.notes}
                          onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Notes"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.notes.required}
                        />
                      </TableCell>
                    )}
                    {/* Custom field inputs */}
                    {getEnabledCustomFields().map((field) => (
                      <TableCell key={field.name}>
                        {field.field_type === 'select' && field.options ? (
                          <FormControl size="small" fullWidth>
                            <Select
                              value={checkInForm.custom_fields[field.name] || ''}
                              onChange={(e) => setCheckInForm({ 
                                ...checkInForm, 
                                custom_fields: { 
                                  ...checkInForm.custom_fields, 
                                  [field.name]: e.target.value as string 
                                } 
                              })}
                              displayEmpty
                            >
                              <MenuItem value="">
                                <em>{field.placeholder || field.label}</em>
                              </MenuItem>
                              {field.options.map((option) => (
                                <MenuItem key={option} value={option}>{option}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : (
                          <TextField
                            size="small"
                            value={checkInForm.custom_fields[field.name] || ''}
                            onChange={(e) => setCheckInForm({ 
                              ...checkInForm, 
                              custom_fields: { 
                                ...checkInForm.custom_fields, 
                                [field.name]: e.target.value 
                              } 
                            })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCheckIn();
                              }
                            }}
                            placeholder={field.placeholder || field.label}
                            inputProps={{ style: { fontSize: '0.875rem' } }}
                            fullWidth
                            required={isFieldRequired(field.name)}
                            type={field.field_type === 'number' ? 'number' : 'text'}
                            multiline={field.field_type === 'textarea'}
                            rows={field.field_type === 'textarea' ? 2 : 1}
                          />
                        )}
                      </TableCell>
                    ))}
                    {/* Topic of the Week input */}
                    {net?.topic_of_week_enabled && (
                      <TableCell>
                        <TextField
                          size="small"
                          value={checkInForm.topic_response}
                          onChange={(e) => setCheckInForm({ ...checkInForm, topic_response: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckIn();
                            }
                          }}
                          placeholder="Topic response"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          multiline
                          maxRows={2}
                        />
                      </TableCell>
                    )}
                    {/* Poll response input with autocomplete */}
                    {/* NOTE: No onKeyDown Enter handler here - selecting from dropdown would submit prematurely */}
                    {/* User should press Enter in another field or click Add button */}
                    {net?.poll_enabled && (
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={pollResponses}
                          value={checkInForm.poll_response}
                          onChange={(_, newValue) => setCheckInForm({ ...checkInForm, poll_response: newValue || '' })}
                          onInputChange={(_, newInputValue) => setCheckInForm({ ...checkInForm, poll_response: newInputValue })}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder="Poll answer"
                              inputProps={{ ...params.inputProps, style: { fontSize: '0.875rem' } }}
                            />
                          )}
                          sx={{ minWidth: 120 }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <TextField
                        size="small"
                        value={checkInForm.relayed_by}
                        onChange={(e) => setCheckInForm({ ...checkInForm, relayed_by: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCheckIn();
                          }
                        }}
                        placeholder="Relay"
                        inputProps={{ style: { textTransform: 'uppercase', fontSize: '0.75rem' } }}
                        sx={{ width: 70 }}
                      />
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {net?.frequencies && net.frequencies.length > 1 && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setFrequencyDialogOpen(true)}
                            title="Set available frequencies"
                          >
                            📡
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleCheckIn}
                          disabled={!checkInForm.callsign}
                        >
                          Add
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                  </TableBody>
                </Table>
              </Paper>
            )}
            
            {/* Mobile check-in form - full version */}
            {(net.status === 'active' || net.status === 'lobby') && canManageCheckIns && (
              <Paper sx={{ p: 1.5, mt: 1, display: { xs: 'block', md: 'none' } }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>New Check-in</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {/* Callsign - always required */}
                  <TextField
                    size="small"
                    label="Callsign *"
                    value={checkInForm.callsign}
                    onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
                    onBlur={(e) => handleCallsignLookup(e.target.value)}
                    placeholder="Callsign"
                    inputProps={{ style: { textTransform: 'uppercase' } }}
                    fullWidth
                    required
                  />
                  
                  {/* Built-in fields based on net config */}
                  {net?.field_config?.name?.enabled && (
                    <TextField
                      size="small"
                      label={`Name${net.field_config.name.required ? ' *' : ''}`}
                      value={checkInForm.name}
                      onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
                      placeholder="Name"
                      fullWidth
                      required={net.field_config.name.required}
                    />
                  )}
                  
                  {net?.field_config?.location?.enabled && (
                    <TextField
                      size="small"
                      label={`Location${net.field_config.location.required ? ' *' : ''}`}
                      value={checkInForm.location}
                      onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
                      placeholder="Location"
                      fullWidth
                      required={net.field_config.location.required}
                    />
                  )}
                  
                  {net?.field_config?.skywarn_number?.enabled && (
                    <TextField
                      size="small"
                      label={`Spotter #${net.field_config.skywarn_number.required ? ' *' : ''}`}
                      value={checkInForm.skywarn_number}
                      onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })}
                      placeholder="Spotter #"
                      fullWidth
                      required={net.field_config.skywarn_number.required}
                    />
                  )}
                  
                  {net?.field_config?.weather_observation?.enabled && (
                    <TextField
                      size="small"
                      label={`Weather${net.field_config.weather_observation.required ? ' *' : ''}`}
                      value={checkInForm.weather_observation}
                      onChange={(e) => setCheckInForm({ ...checkInForm, weather_observation: e.target.value })}
                      placeholder="Weather observation"
                      fullWidth
                      multiline
                      rows={2}
                      required={net.field_config.weather_observation.required}
                    />
                  )}
                  
                  {net?.field_config?.power_source?.enabled && (
                    <TextField
                      size="small"
                      label={`Power Src${net.field_config.power_source.required ? ' *' : ''}`}
                      value={checkInForm.power_source}
                      onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
                      placeholder="Power source"
                      fullWidth
                      required={net.field_config.power_source.required}
                    />
                  )}
                  
                  {net?.field_config?.power?.enabled && (
                    <TextField
                      size="small"
                      label={`Power${net.field_config.power.required ? ' *' : ''}`}
                      value={checkInForm.power}
                      onChange={(e) => setCheckInForm({ ...checkInForm, power: e.target.value })}
                      placeholder="Power output"
                      fullWidth
                      required={net.field_config.power.required}
                    />
                  )}
                  
                  {net?.field_config?.notes?.enabled && (
                    <TextField
                      size="small"
                      label={`Notes${net.field_config.notes.required ? ' *' : ''}`}
                      value={checkInForm.notes}
                      onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                      placeholder="Notes"
                      fullWidth
                      multiline
                      rows={2}
                      required={net.field_config.notes.required}
                    />
                  )}
                  
                  {/* Custom fields */}
                  {getEnabledCustomFields().map((field) => (
                    field.field_type === 'select' && field.options ? (
                      <FormControl key={field.name} size="small" fullWidth>
                        <InputLabel>{field.label}{isFieldRequired(field.name) ? ' *' : ''}</InputLabel>
                        <Select
                          value={checkInForm.custom_fields[field.name] || ''}
                          label={`${field.label}${isFieldRequired(field.name) ? ' *' : ''}`}
                          onChange={(e) => setCheckInForm({ 
                            ...checkInForm, 
                            custom_fields: { 
                              ...checkInForm.custom_fields, 
                              [field.name]: e.target.value as string 
                            } 
                          })}
                        >
                          <MenuItem value="">
                            <em>Select {field.label}</em>
                          </MenuItem>
                          {field.options.map((option) => (
                            <MenuItem key={option} value={option}>{option}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        key={field.name}
                        size="small"
                        label={`${field.label}${isFieldRequired(field.name) ? ' *' : ''}`}
                        value={checkInForm.custom_fields[field.name] || ''}
                        onChange={(e) => setCheckInForm({ 
                          ...checkInForm, 
                          custom_fields: { 
                            ...checkInForm.custom_fields, 
                            [field.name]: e.target.value 
                          } 
                        })}
                        placeholder={field.placeholder || field.label}
                        fullWidth
                        required={isFieldRequired(field.name)}
                        type={field.field_type === 'number' ? 'number' : 'text'}
                        multiline={field.field_type === 'textarea'}
                        rows={field.field_type === 'textarea' ? 2 : 1}
                      />
                    )
                  ))}
                  
                  {/* Relayed By field */}
                  <TextField
                    size="small"
                    label="Relayed By"
                    value={checkInForm.relayed_by}
                    onChange={(e) => setCheckInForm({ ...checkInForm, relayed_by: e.target.value.toUpperCase() })}
                    placeholder="Relay callsign"
                    inputProps={{ style: { textTransform: 'uppercase' } }}
                    fullWidth
                    helperText="Callsign of station who relayed this check-in"
                  />
                  
                  {/* Frequency selector if multiple frequencies */}
                  {net?.frequencies && net.frequencies.length > 1 && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setFrequencyDialogOpen(true)}
                      startIcon={<span>📡</span>}
                      fullWidth
                    >
                      Set Available Frequencies
                    </Button>
                  )}
                  
                  {/* Add button */}
                  <Button
                    variant="contained"
                    onClick={handleCheckIn}
                    disabled={!checkInForm.callsign}
                    size="large"
                    fullWidth
                  >
                    Add Check-in
                  </Button>
                </Box>
              </Paper>
            )}
              </FloatingWindow>
            </Grid>
            )}
            
            {/* Chat panel - hide Grid if detached */}
            {!chatDetached && (
            <Grid item xs={12} md={checkInListDetached ? 12 : 4} sx={{ pl: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: { xs: 300, md: 0 }, height: { xs: 350, md: '100%' } }}>
              <FloatingWindow
                title="Chat"
                isDetached={false}
                onDetach={handleDetachChat}
                onAttach={handleAttachChat}
                defaultWidth={450}
                defaultHeight={500}
                minWidth={300}
                minHeight={250}
                storageKey="chat"
              >
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <Chat netId={Number(netId)} netStartedAt={net?.started_at} netStatus={net?.status} searchQuery={searchQuery} onDetach={handleDetachChat} />
                </Box>
              </Box>
              </FloatingWindow>
            </Grid>
            )}
          </Grid>
        )}

        {/* Floating Check-in List when detached - renders same content as docked version */}
        {checkInListDetached && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
          <FloatingWindow
            title="Check-in List"
            isDetached={true}
            onDetach={handleDetachCheckInList}
            onAttach={handleAttachCheckInList}
            defaultWidth={1100}
            defaultHeight={600}
            minWidth={600}
            minHeight={400}
            storageKey="checkInList"
          >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* ========== CHECK-IN LIST TABLE 3: Detached Floating Window ========== */}
              {/* This table displays when check-in list is popped out into a floating window */}
              <TableContainer sx={{ 
                flex: 1, 
                overflow: 'auto', 
                minHeight: 0,
                border: 1,
                borderColor: 'divider',
                borderRadius: '4px 4px 0 0',
                '&::-webkit-scrollbar': { width: 8, height: 8 },
                '&::-webkit-scrollbar-track': { backgroundColor: (thm) => thm.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                '&::-webkit-scrollbar-thumb': { backgroundColor: (thm) => thm.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', borderRadius: 4 },
              }}>
                <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                  <TableHead sx={{ position: 'sticky', top: 0, backgroundColor: 'background.paper', zIndex: 1 }}>
                    <TableRow>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>#</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Callsign *</TableCell>
                      {net?.field_config?.name?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Name</TableCell>}
                      {net?.field_config?.location?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Location</TableCell>}
                      {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Spotter</TableCell>}
                      {net?.field_config?.weather_observation?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Weather</TableCell>}
                      {net?.field_config?.power_source?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power Src</TableCell>}
                      {net?.field_config?.power?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Power</TableCell>}
                      {net?.field_config?.notes?.enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Notes</TableCell>}
                      {getEnabledCustomFields().map((field) => (
                        <TableCell key={field.name} sx={{ whiteSpace: 'nowrap' }}>{field.label}</TableCell>
                      ))}
                      {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Topic</TableCell>}
                      {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>Poll</TableCell>}
                      {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                      {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCheckIns.map((checkIn, index) => {
                      const isOnActiveFrequency = net.active_frequency_id && checkIn.available_frequencies?.includes(net.active_frequency_id);
                      // Get NCS color if this user is an NCS
                      const ncsColor = checkIn.user_id ? getNcsColor(checkIn.user_id) : null;
                      const isNcsUser = ncsRoles.some((r: any) => r.user_id === checkIn.user_id);
                      return (
                        <TableRow 
                          key={checkIn.id}
                          sx={{ 
                            backgroundColor: checkIn.id === activeSpeakerId 
                              ? (thm) => thm.palette.mode === 'dark' ? thm.palette.success.dark : thm.palette.success.light
                              : checkIn.status === 'checked_out' ? 'action.disabledBackground' 
                              : isNcsUser && ncsColor ? ncsColor.bg
                              : isOnActiveFrequency ? (thm) => thm.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)' : 'inherit',
                            opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                            // Add left border for NCS users
                            ...(isNcsUser && ncsColor && checkIn.status !== 'checked_out' && {
                              borderLeft: `3px solid ${ncsColor.border}`,
                            }),
                          }}
                        >
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                              const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
                              let selectValue = checkIn.status.toLowerCase();
                              if (userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                                selectValue = userRole.role.toLowerCase();
                              }
                              const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'available', 'announcements', 'mobile', 'checked_out'];
                              if (!validValues.includes(selectValue)) selectValue = 'checked_in';
                              return (
                                <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} placement="right" arrow>
                                  <Select
                                    size="small"
                                    value={selectValue}
                                    onChange={async (e) => { await handleStatusChange(checkIn.id, e.target.value); await fetchNetRoles(); await fetchCheckIns(); }}
                                    sx={{ minWidth: 50 }}
                                    disabled={owner?.id === checkIn.user_id}
                                    MenuProps={{ disableScrollLock: true }}
                                  >
                                    {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">{getNcsIcon(checkIn)}</MenuItem>)}
                                    {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋</MenuItem>)}
                                    <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}</MenuItem>
                                    <MenuItem value="listening">👂</MenuItem>
                                    <MenuItem value="relay">📡</MenuItem>
                                    <MenuItem value="away">⏸️</MenuItem>
                                    <MenuItem value="available">🚨</MenuItem>
                                    <MenuItem value="announcements">📢</MenuItem>
                                    <MenuItem value="mobile">🚗</MenuItem>
                                    {canManageCheckIns && <MenuItem value="checked_out">👋</MenuItem>}
                                  </Select>
                                </Tooltip>
                              );
                            })() : (
                              <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} placement="right" arrow>
                                <span style={{ cursor: 'help' }}>{getStatusIcon(checkIn.status, checkIn)}</span>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {checkIn.user_id && onlineUserIds.includes(checkIn.user_id) && (
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'success.main', flexShrink: 0 }} />
                              )}
                              {checkIn.callsign}
                              {checkIn.relayed_by && (
                                <Tooltip title={`Relayed by ${checkIn.relayed_by}`} arrow><span>📡</span></Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          {net?.field_config?.name?.enabled && <TableCell>{checkIn.name}</TableCell>}
                          {net?.field_config?.location?.enabled && <TableCell>{checkIn.location}</TableCell>}
                          {net?.field_config?.skywarn_number?.enabled && <TableCell>{checkIn.skywarn_number}</TableCell>}
                          {net?.field_config?.weather_observation?.enabled && <TableCell>{checkIn.weather_observation}</TableCell>}
                          {net?.field_config?.power_source?.enabled && <TableCell>{checkIn.power_source}</TableCell>}
                          {net?.field_config?.power?.enabled && <TableCell>{checkIn.power}</TableCell>}
                          {net?.field_config?.notes?.enabled && <TableCell>{checkIn.notes}</TableCell>}
                          {getEnabledCustomFields().map((field) => (
                            <TableCell key={field.name}>{checkIn.custom_fields?.[field.name] || ''}</TableCell>
                          ))}
                          {net?.topic_of_week_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.topic_response || ''}</TableCell>}
                          {net?.poll_enabled && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.poll_response || ''}</TableCell>}
                          {hasAnyRelayedBy && <TableCell>{checkIn.relayed_by || ''}</TableCell>}
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTimeWithDate(checkIn.checked_in_at, user?.prefer_utc || false, net?.started_at)}</TableCell>
                          {canManage && (
                            <TableCell>
                              {(net.status === 'active' || net.status === 'lobby') && checkIn.status !== 'checked_out' && (
                                <IconButton size="small" onClick={() => handleSetActiveSpeaker(checkIn.id)} color={checkIn.id === activeSpeakerId ? 'primary' : 'default'} title="Mark as active speaker">🗣️</IconButton>
                              )}
                              <IconButton size="small" onClick={() => handleDeleteCheckIn(checkIn.id)} title="Delete"><DeleteIcon fontSize="small" /></IconButton>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {/* Legend */}
              <Box sx={{ p: 0.5, backgroundColor: 'action.hover', border: 1, borderColor: 'divider', borderTop: 0, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Legend:</Typography>
                  <Tooltip title="Net Control Station" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👑 NCS</Typography></Tooltip>
                  <Tooltip title="2nd NCS" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🤴 2nd NCS</Typography></Tooltip>
                  <Tooltip title="Logger" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📋 Logger</Typography></Tooltip>
                  <Tooltip title="Checked in" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>✅ Standard</Typography></Tooltip>
                  <Tooltip title="Re-check" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🔄 Recheck</Typography></Tooltip>
                  <Tooltip title="Listening only" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👂 Listening</Typography></Tooltip>
                  <Tooltip title="Relay station" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📡 Relay</Typography></Tooltip>
                  <Tooltip title="Away" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>⏸️ Away</Typography></Tooltip>
                  <Tooltip title="Has traffic" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🚨 Traffic</Typography></Tooltip>
                  <Tooltip title="Has announcements" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📢 Announce</Typography></Tooltip>
                  <Tooltip title="Checked out" placement="top" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👋 Out</Typography></Tooltip>
                  {/* Inline edit hint - only shown to NCS/Loggers when net is active or in lobby */}
                  {(net.status === 'active' || net.status === 'lobby') && canManageCheckIns && (
                    <Tooltip title="Click any row to edit check-in details inline" placement="top" arrow>
                      <Typography variant="caption" sx={{ cursor: 'help', color: 'primary.main', fontStyle: 'italic' }}>
                        💡 Click row to edit
                      </Typography>
                    </Tooltip>
                  )}
                </Box>
              </Box>
              
              {/* Check-in form */}
              {(net.status === 'active' || net.status === 'lobby') && canManageCheckIns && (
                <Paper sx={{ border: 1, borderColor: 'divider', borderTop: 0, borderRadius: '0 0 4px 4px', p: 1, flexShrink: 0 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <TextField
                      size="small"
                      value={checkInForm.callsign}
                      onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
                      onBlur={(e) => handleCallsignLookup(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCheckIn(); } }}
                      placeholder="Callsign *"
                      inputProps={{ style: { textTransform: 'uppercase' } }}
                      sx={{ width: 120 }}
                      required
                    />
                    {net?.field_config?.name?.enabled && (
                      <TextField size="small" value={checkInForm.name} onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })} placeholder="Name" sx={{ width: 120 }} />
                    )}
                    {net?.field_config?.location?.enabled && (
                      <TextField size="small" value={checkInForm.location} onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })} placeholder="Location" sx={{ width: 150 }} />
                    )}
                    {net?.field_config?.skywarn_number?.enabled && (
                      <TextField size="small" value={checkInForm.skywarn_number} onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })} placeholder="Spotter #" sx={{ width: 100 }} />
                    )}
                    {net?.field_config?.notes?.enabled && (
                      <TextField size="small" value={checkInForm.notes} onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })} placeholder="Notes" sx={{ flex: 1, minWidth: 150 }} />
                    )}
                    {net?.topic_of_week_enabled && (
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={topicResponses}
                        value={checkInForm.topic_response || ''}
                        onChange={(_, newValue) => setCheckInForm({ ...checkInForm, topic_response: newValue || '' })}
                        onInputChange={(_, newInputValue) => setCheckInForm({ ...checkInForm, topic_response: newInputValue })}
                        renderInput={(params) => (
                          <TextField {...params} placeholder={net?.topic_of_week_prompt?.substring(0, 15) + '...' || 'Topic...'} sx={{ width: 120 }} />
                        )}
                        sx={{ width: 120 }}
                      />
                    )}
                    {net?.poll_enabled && (
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={pollResponses}
                        value={checkInForm.poll_response || ''}
                        onChange={(_, newValue) => setCheckInForm({ ...checkInForm, poll_response: newValue || '' })}
                        onInputChange={(_, newInputValue) => setCheckInForm({ ...checkInForm, poll_response: newInputValue })}
                        renderInput={(params) => (
                          <TextField {...params} placeholder={net?.poll_question?.substring(0, 15) + '...' || 'Poll...'} sx={{ width: 120 }} />
                        )}
                        sx={{ width: 120 }}
                      />
                    )}
                    <TextField
                      size="small"
                      value={checkInForm.relayed_by}
                      onChange={(e) => setCheckInForm({ ...checkInForm, relayed_by: e.target.value.toUpperCase() })}
                      placeholder="Relayed By"
                      inputProps={{ style: { textTransform: 'uppercase' } }}
                      sx={{ width: 100 }}
                    />
                    <Button variant="contained" onClick={handleCheckIn} disabled={!checkInForm.callsign} size="small">
                      Add
                    </Button>
                  </Box>
                </Paper>
              )}
            </Box>
          </FloatingWindow>
        )}

        {/* Floating Chat when detached */}
        {chatDetached && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
          <FloatingWindow
            title="Chat"
            isDetached={true}
            onDetach={handleDetachChat}
            onAttach={handleAttachChat}
            defaultWidth={450}
            defaultHeight={500}
            minWidth={300}
            minHeight={250}
            storageKey="chat"
          >
            <Chat netId={Number(netId)} netStartedAt={net?.started_at} netStatus={net?.status} searchQuery={searchQuery} />
          </FloatingWindow>
        )}
      </Paper>

      {/* Close Net Confirmation Dialog */}
      <Dialog 
        open={closeNetDialogOpen} 
        onClose={() => setCloseNetDialogOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleCloseNet();
          }
        }}
      >
        <DialogTitle>Close Net?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to close this net? This will end the session and send log emails to subscribers.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseNetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCloseNet} variant="contained" color="error">
            Close Net
          </Button>
        </DialogActions>
      </Dialog>

      {/* Topic/Poll Configuration Dialog */}
      <Dialog 
        open={topicPollDialogOpen} 
        onClose={() => setTopicPollDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleTopicPollSaveAndStart();
          }
        }}
      >
        <DialogTitle>Configure Community Net Features</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Set the topic and/or poll question for this net session. These prompts will be shown to participants during check-in.
            </Typography>
            {net?.topic_of_week_enabled && (
              <TextField
                fullWidth
                label="Topic of the Week"
                value={tempTopicPrompt}
                onChange={(e) => setTempTopicPrompt(e.target.value)}
                placeholder="e.g., What's your favorite radio memory?"
                helperText="What would you like participants to share?"
                sx={{ mb: 3 }}
              />
            )}
            {net?.poll_enabled && (
              <TextField
                fullWidth
                label="Poll Question"
                value={tempPollQuestion}
                onChange={(e) => setTempPollQuestion(e.target.value)}
                placeholder="e.g., What band do you operate most?"
                helperText="Answers will be tracked and displayed as a chart"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTopicPollDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleTopicPollSaveAndStart} variant="contained" color="success">
            Save & Start Net
          </Button>
        </DialogActions>
      </Dialog>

      {/* Role Management Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Manage Net Control Staff</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Assign NCS (Net Control Station) or Logger roles. You can assign multiple people as NCS — any of them can start or manage the net, providing backup if the primary NCS is unavailable.
            </Typography>
            
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Select User</InputLabel>
              <Select
                value={selectedUserId}
                label="Select User"
                onChange={(e) => setSelectedUserId(e.target.value as number)}
              >
                <MenuItem value="">
                  <em>Choose a user...</em>
                </MenuItem>
                {allUsers.map((u: any) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.callsign || u.name || u.email} ({u.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Role</InputLabel>
              <Select
                value={selectedRole}
                label="Role"
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <MenuItem value="NCS">NCS (Net Control Station)</MenuItem>
                <MenuItem value="LOGGER">Logger</MenuItem>
                <MenuItem value="RELAY">Relay Station</MenuItem>
              </Select>
            </FormControl>

            <Button 
              variant="contained" 
              onClick={handleAssignRole}
              disabled={!selectedUserId}
              fullWidth
            >
              Assign Role
            </Button>

            {netRoles.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                  Current Assignments:
                </Typography>
                <List>
                  {netRoles.map((role) => (
                    <ListItem 
                      key={role.id}
                      secondaryAction={
                        <IconButton edge="end" onClick={() => handleRemoveRole(role.id)}>
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={role.callsign || role.name || role.email}
                        secondary={`${role.role} • ${new Date(role.assigned_at).toLocaleDateString()}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Available Frequencies Dialog */}
      <Dialog 
        open={frequencyDialogOpen} 
        onClose={() => setFrequencyDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setFrequencyDialogOpen(false);
          }
        }}
      >
        <DialogTitle>Available Frequencies</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              For SKYWARN nets: indicate which frequencies this station can monitor.
            </Typography>
            <Autocomplete
              multiple
              options={net?.frequencies || []}
              getOptionLabel={(option: any) => formatFrequencyDisplay(option)}
              value={net?.frequencies.filter((f: any) => (checkInForm.available_frequency_ids || []).includes(f.id)) || []}
              onChange={(_, newValue: any[]) => {
                setCheckInForm({
                  ...checkInForm,
                  available_frequency_ids: newValue.map(f => f.id)
                });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Frequencies"
                  placeholder="Choose frequencies..."
                />
              )}
              renderTags={(value: any[], getTagProps) =>
                value.map((option: any, index: number) => (
                  <Chip
                    {...getTagProps({ index })}
                    label={formatFrequencyDisplay(option)}
                    size="small"
                  />
                ))
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFrequencyDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* Check-In Dialog for Regular Users */}
      <Dialog 
        open={checkInDialogOpen} 
        onClose={() => setCheckInDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
        disableRestoreFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCheckIn();
            setCheckInDialogOpen(false);
          }
        }}
      >
        <DialogTitle>Check In to {net?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Callsign"
              value={checkInForm.callsign}
              onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
              onBlur={(e) => handleCallsignLookup(e.target.value)}
              fullWidth
              required
              inputProps={{ style: { textTransform: 'uppercase' } }}
            />
            
            {net?.field_config?.name?.enabled && (
              <TextField
                label="Name"
                value={checkInForm.name}
                onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
                fullWidth
                required={net.field_config.name.required}
              />
            )}
            
            {net?.field_config?.location?.enabled && (
              <TextField
                label="Location"
                value={checkInForm.location}
                onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
                fullWidth
                required={net.field_config.location.required}
              />
            )}
            
            {net?.field_config?.skywarn_number?.enabled && (
              <TextField
                label="Spotter #"
                value={checkInForm.skywarn_number}
                onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })}
                fullWidth
                required={net.field_config.skywarn_number.required}
              />
            )}
            
            {net?.field_config?.weather_observation?.enabled && (
              <TextField
                label="Weather Observation"
                value={checkInForm.weather_observation}
                onChange={(e) => setCheckInForm({ ...checkInForm, weather_observation: e.target.value })}
                fullWidth
                multiline
                rows={2}
                required={net.field_config.weather_observation.required}
              />
            )}
            
            {net?.field_config?.power_source?.enabled && (
              <TextField
                label="Power Src"
                value={checkInForm.power_source}
                onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
                fullWidth
                required={net.field_config.power_source.required}
              />
            )}
            
            {net?.field_config?.power?.enabled && (
              <TextField
                label="Power"
                value={checkInForm.power}
                onChange={(e) => setCheckInForm({ ...checkInForm, power: e.target.value })}
                fullWidth
                required={net.field_config.power.required}
              />
            )}
            
            {net?.field_config?.notes?.enabled && (
              <TextField
                label="Notes"
                value={checkInForm.notes}
                onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
                required={net.field_config.notes.required}
              />
            )}
            
            {net?.frequencies && net.frequencies.length > 1 && (
              <Autocomplete
                multiple
                options={net.frequencies || []}
                getOptionLabel={(option: any) => formatFrequencyDisplay(option)}
                value={net.frequencies.filter((f: any) => checkInForm.available_frequency_ids.includes(f.id))}
                onChange={(_, newValue: any[]) => {
                  setCheckInForm({
                    ...checkInForm,
                    available_frequency_ids: newValue.map(f => f.id)
                  });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Available Frequencies (optional)"
                    helperText="For SKYWARN nets: indicate which frequencies you can reach"
                  />
                )}
                renderTags={(value: any[], getTagProps) =>
                  value.map((option: any, index: number) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return (
                      <Chip
                        key={key}
                        {...tagProps}
                        label={formatFrequencyDisplay(option)}
                        size="small"
                      />
                    );
                  })
                }
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckInDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              handleCheckIn();
              setCheckInDialogOpen(false);
            }} 
            variant="contained" 
            color="primary"
            disabled={!checkInForm.callsign}
          >
            Check In
          </Button>
        </DialogActions>
      </Dialog>

      {/* Check-in Location Map */}
      <CheckInMap
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        checkIns={filteredCheckIns}
        netName={net?.name || 'Net'}
        ncsUserIds={netRoles.filter((r: any) => r.role === 'NCS').map((r: any) => r.user_id)}
        loggerUserIds={netRoles.filter((r: any) => r.role === 'Logger').map((r: any) => r.user_id)}
        relayUserIds={netRoles.filter((r: any) => r.role === 'Relay').map((r: any) => r.user_id)}
      />

      {/* Bulk Check-In Dialog */}
      <BulkCheckIn
        open={bulkCheckInOpen}
        onClose={() => setBulkCheckInOpen(false)}
        netId={Number(netId)}
        onCheckInsAdded={fetchCheckIns}
        fieldConfig={net?.field_config}
      />

      {/* Search Dialog */}
      <SearchCheckIns
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        matchCount={filteredCheckIns.length}
      />

      {/* Net Script Viewer */}
      <NetScript
        open={scriptOpen}
        onClose={() => setScriptOpen(false)}
        script={net?.script || ''}
        netName={net?.name || 'Net'}
        netId={Number(netId)}
      />

      <Snackbar
        open={toastMessage !== ''}
        autoHideDuration={pendingArchive ? null : 6000}
        onClose={() => {
          if (!pendingArchive) setToastMessage('');
        }}
        message={toastMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        action={pendingArchive ? (
          <Button color="secondary" size="small" onClick={handleUndoArchive}>
            UNDO
          </Button>
        ) : undefined}
      />
    </Container>
  );
};

export default NetView;
