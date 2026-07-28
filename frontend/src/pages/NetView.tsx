import React, { useEffect, useState, useRef } from 'react';
import useDialog from '../hooks/useDialog';
import useLocalStorage from '../hooks/useLocalStorage';
import { useNetWebSocket } from '../hooks/useNetWebSocket';
import { useNetData } from '../hooks/useNetData';
import CsvImportDialog from '../components/netview/CsvImportDialog';
import ArchiveDialogs from '../components/netview/ArchiveDialogs';
import RoleAssignmentDialog from '../components/netview/RoleAssignmentDialog';
import CheckInFormDialog, { CheckInFormState } from '../components/netview/CheckInFormDialog';
import NetControlDialogs from '../components/netview/NetControlDialogs';
import NetViewHeader from '../components/netview/NetViewHeader';
import { getCheckInStatusHelpers } from '../components/netview/checkInStatusHelpers';
import { getCheckInActions } from '../components/netview/checkInActions';
import CheckInMobileList from '../components/netview/CheckInMobileList';
import CheckInTable from '../components/netview/CheckInTable';
import NetViewSidePanels from '../components/netview/NetViewSidePanels';
import { STORAGE_KEYS } from '../utils/localStorageKeys';
import { displayCallsign } from '../utils/userDisplay';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableRow,
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
  Collapse,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { netApi, checkInApi, netRoleApi, templateApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import CheckInMap from '../components/CheckInMap';
import BulkCheckIn from '../components/BulkCheckIn';
import SearchCheckIns from '../components/SearchCheckIns';
import NetScript from '../components/NetScript';
import Announcements from '../components/Announcements';
import ScheduleAnnouncements from '../components/ScheduleAnnouncements';
import TopicHistory from '../components/TopicHistory';
import FloatingWindow from '../components/FloatingWindow';
import UserProfileDialog from '../components/UserProfileDialog';

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
  parent_check_in_id?: number;
  checked_in_at: string;
  frequency_id?: number;
  available_frequencies?: number[];
  user_id?: number;
  hand_raised?: boolean;
  avatar_url?: string | null;
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

// NCS color palette - works in both light and dark modes
const NCS_COLORS = [
  { bg: 'rgba(244, 67, 54, 0.15)', border: '#f44336', text: '#f44336' },   // Red
  { bg: 'rgba(33, 150, 243, 0.15)', border: '#2196f3', text: '#2196f3' },  // Blue
  { bg: 'rgba(76, 175, 80, 0.15)', border: '#4caf50', text: '#4caf50' },   // Green
  { bg: 'rgba(156, 39, 176, 0.15)', border: '#9c27b0', text: '#9c27b0' },  // Purple
  { bg: 'rgba(255, 152, 0, 0.15)', border: '#ff9800', text: '#ff9800' },   // Orange
  { bg: 'rgba(0, 188, 212, 0.15)', border: '#00bcd4', text: '#00bcd4' },   // Cyan
];


const NetView: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    net, setNet,
    checkIns, setCheckIns,
    netRoles,
    netStats,
    onlineUserIds,
    fieldDefinitions,
    allUsers,
    owner,
    pollResponses,
    pollResults,
    topicResponses,
    fetchNet,
    fetchCheckIns,
    fetchNetRoles,
    fetchNetStats,
    fetchAllUsers,
    fetchPollResponses,
    fetchPollResults,
    fetchTopicResponses,
  } = useNetData(netId);
  const roleDialog = useDialog();
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRole, setSelectedRole] = useState<string>('NCS');
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const checkInDialog = useDialog();
  // Mobile-only: collapsed-by-default New Check-in form. NCS/Loggers attending
  // someone else's net don't need the form expanded by default; they can open
  // it on demand when they want to log a check-in.
  const [mobileCheckInExpanded, setMobileCheckInExpanded] = useState(false);
  const frequencyDialog = useDialog();
  const map = useDialog();
  const bulkCheckIn = useDialog();
  const [hideDuplicates, setHideDuplicates] = useLocalStorage<boolean>(STORAGE_KEYS.CHECKIN_HIDE_DUPLICATES, false);
  const search = useDialog();
  const [searchQuery, setSearchQuery] = useState('');
  const closeNetDialog = useDialog();
  const subscribeDialog = useDialog();
  const archiveReminder = useDialog();
  const archiveHelp = useDialog();
  const archiveDeleteConfirm = useDialog();
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [startingNet, setStartingNet] = useState(false);
  const script = useDialog();
  const announcements = useDialog();
  const scheduleAnnouncements = useDialog();
  const topicHistory = useDialog();
  const importDialog = useDialog();
  const [highlightCheckIn, setHighlightCheckIn] = useState(false);
  const [highlightStartNet, setHighlightStartNet] = useState(false);
  // Countdown and duration timer state
  const [countdownTime, setCountdownTime] = useState<string | null>(null);
  const [durationTime, setDurationTime] = useState<string | null>(null);
  // Topic/Poll configuration dialog state
  const topicPollDialog = useDialog();
  const [tempTopicPrompt, setTempTopicPrompt] = useState('');
  const [tempPollQuestion, setTempPollQuestion] = useState('');
  // Check-in prompt for authenticated users viewing active/lobby nets
  const checkInPrompt = useDialog();
  const checkInPromptShownRef = useRef(false);
  const archiveReminderShownRef = useRef(false);
  // Inline editing state
  const [inlineEditingId, setInlineEditingId] = useState<number | null>(null);
  const [inlineEditValues, setInlineEditValues] = useState<Partial<CheckIn>>({});
  const [inlineEditFocusField, setInlineEditFocusField] = useState<string | null>(null);
  const inlineEditRowRef = useRef<HTMLTableRowElement | null>(null);
  const [checkInListDetached, setCheckInListDetached] = useLocalStorage<boolean>(STORAGE_KEYS.FLOATING_CHECKIN_LIST, false);
  const [chatDetached, setChatDetached] = useLocalStorage<boolean>(STORAGE_KEYS.FLOATING_CHAT, false);
  const [chatMinimized, setChatMinimized] = useLocalStorage<boolean>(STORAGE_KEYS.DOCKED_CHAT_MINIMIZED, false);
  // activityLog defaults to minimized (true) when no stored preference exists
  const [activityLogMinimized, setActivityLogMinimized] = useLocalStorage<boolean>(STORAGE_KEYS.DOCKED_ACTIVITY_LOG_MINIMIZED, true);
  // Mobile gets its own independent minimize preference (also defaulting
  // collapsed) instead of sharing the desktop one — the stacked mobile
  // layout has much less room, so a desktop session's "expanded" choice
  // shouldn't force every phone visit to start expanded too.
  const theme = useTheme();
  const isMobileLayout = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileActivityLogMinimized, setMobileActivityLogMinimized] = useLocalStorage<boolean>(STORAGE_KEYS.MOBILE_ACTIVITY_LOG_MINIMIZED, true);
  const effectiveActivityLogMinimized = isMobileLayout ? mobileActivityLogMinimized : activityLogMinimized;
  const setEffectiveActivityLogMinimized = isMobileLayout ? setMobileActivityLogMinimized : setActivityLogMinimized;
  const [activityLogDetached, setActivityLogDetached] = useLocalStorage<boolean>(STORAGE_KEYS.FLOATING_ACTIVITY_LOG, false);
  // Frequency filter state - allows filtering check-ins by selected frequencies
  const [filteredFrequencyIds, setFilteredFrequencyIds] = useState<number[]>([]);
  // Auto-start ref to prevent multiple go-live triggers
  const autoStartTriggeredRef = useRef(false);
  const { user, isAuthenticated } = useAuth();
  const { gridSquare } = useLocation();
  const navigate = useNavigate();

  // Check-in form state - includes custom_fields for dynamic fields
  const [checkInForm, setCheckInForm] = useState<CheckInFormState>({
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
    status: 'checked_in',
  });

  // Panel states are persisted automatically by useLocalStorage; no explicit persist effects needed.

  // Apply viewport-height-based zoom on the net view so the logging panel fits on
  // short/portrait desktop screens (e.g. 13" MacBooks, small Win11 laptops, iPads).
  // Zoom is applied to document.body so MUI portals (dropdowns, dialogs) scale too.
  // Restored to 1 on unmount so other pages are unaffected.
  useEffect(() => {
    const applyZoom = () => {
      const h = window.innerHeight;
      let zoom = 1;
      if (h < 700) zoom = 0.8;
      else if (h < 800) zoom = 0.9;
      // Zoom body so all MUI portals (dropdowns, dialogs) scale with it.
      // --ect-app-h compensates the App shell's height so the layout still
      // fills the full viewport after the zoom shrinks it (100vh alone does
      // not account for CSS zoom, leaving a gap at the bottom).
      (document.body.style as any).zoom = String(zoom);
      document.documentElement.style.setProperty('--ect-app-h', zoom === 1 ? '100vh' : `${h / zoom}px`);
    };
    applyZoom();
    window.addEventListener('resize', applyZoom);
    return () => {
      window.removeEventListener('resize', applyZoom);
      (document.body.style as any).zoom = '1';
      document.documentElement.style.removeProperty('--ect-app-h');
    };
  }, []);

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

  // Auto-open lobby when ?open_lobby=1 is present (from staff reminder email button).
  // Fires once after the net and user permissions are loaded. Uses net.can_manage
  // (server-computed, includes template staff) so the check resolves correctly
  // without a forward reference to canStartNet.
  useEffect(() => {
    if (!net || !user) return;
    if (searchParams.get('open_lobby') !== '1') return;
    if (net.status !== 'draft' && net.status !== 'scheduled') return;
    const serverSaysCanManage = !!net.can_manage;
    const isOwnerOrAdmin = net.owner_id === user.id || user.role === 'admin';
    if (!serverSaysCanManage && !isOwnerOrAdmin) return;

    // Remove the param so a refresh doesn't re-trigger
    setSearchParams(prev => { prev.delete('open_lobby'); return prev; }, { replace: true });
    handleStartNet();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net?.id, net?.can_manage, user?.id]); // Re-check when server permissions arrive

  // Countdown and duration timer effect - updates every second
  useEffect(() => {
    if (!net) return;
    // Reset auto-start flag when net becomes active (e.g., triggered by another client)
    if (net.status === 'active') {
      autoStartTriggeredRef.current = false;
    }
    
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
          // Past scheduled time — auto-start the net if in LOBBY mode
          // Only trigger if current user is NCS/owner/admin (has permission to go live)
          const isOwnerOrAdmin = user?.id === net.owner_id || user?.role === 'admin';
          const isNCSRole = netRoles.some((r: any) => r.user_id === user?.id && r.role === 'NCS');
          const canAutoStart = isOwnerOrAdmin || isNCSRole;
          
          if (net.status === 'lobby' && canAutoStart && !autoStartTriggeredRef.current) {
            autoStartTriggeredRef.current = true;
            setCountdownTime('Starting...');
            api.post(`/nets/${net.id}/go-live`).then(() => {
              fetchNet();
              setToastMessage('Net auto-started at scheduled time!');
            }).catch((err: any) => {
              // Already active or other issue — reset so it can retry
              console.debug('Auto-start not triggered:', err?.response?.data?.detail);
              autoStartTriggeredRef.current = false;
              setCountdownTime('Starting soon');
            });
          } else {
            setCountdownTime('Starting soon');
          }
        }
      } else {
        setCountdownTime(null);
      }
      
      // Duration timer: show elapsed time since net started, minus any time
      // spent with no NCS actively present (only for active nets).
      if (net.started_at && net.status === 'active') {
        // Ensure the timestamp is parsed as UTC (backend stores UTC without 'Z' suffix)
        const startTimeStr = net.started_at.endsWith('Z') ? net.started_at : net.started_at + 'Z';
        const startTime = new Date(startTimeStr);
        let pausedMs = (net.total_paused_seconds || 0) * 1000;
        if (net.paused_at) {
          const pausedAtStr = net.paused_at.endsWith('Z') ? net.paused_at : net.paused_at + 'Z';
          pausedMs += Math.max(0, now.getTime() - new Date(pausedAtStr).getTime());
        }
        const diff = now.getTime() - startTime.getTime() - pausedMs;

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
  }, [net?.scheduled_start_time, net?.started_at, net?.status, net?.owner_id, net?.id, net?.paused_at, net?.total_paused_seconds, user?.id, user?.role, netRoles]);

  // Show check-in prompt for authenticated users viewing an active/lobby net they haven't checked into
  useEffect(() => {
    if (!net || !isAuthenticated || checkInPromptShownRef.current) return;
    if (net.status !== 'active' && net.status !== 'lobby') return;
    // Self check-in may be disabled for this net — staff still check in via manage forms.
    // Duplicates the canManageCheckIns test (declared later, post-null-check) since this
    // effect runs before that guard and must stay null-safe.
    const isStaffForNet = user?.id === net.owner_id || user?.role === 'admin' || net.can_manage
      || netRoles.some((r: any) => r.user_id === user?.id && (r.role === 'NCS' || r.role === 'LOGGER') && r.is_active !== false);
    if (net.self_checkin_enabled === false && !isStaffForNet) return;
    const alreadyCheckedIn = checkIns.some(
      (ci: any) => ci.user_id === user?.id && ci.status !== 'checked_out'
    );
    if (!alreadyCheckedIn) {
      checkInPromptShownRef.current = true;
      // Delay so it doesn't flash during initial data load
      const timer = setTimeout(() => checkInPrompt.onOpen(), 2000);
      return () => clearTimeout(timer);
    }
  }, [net?.status, isAuthenticated, checkIns, user?.id, netRoles]);

  // Show archive reminder once per page load for closed nets when viewed by a manager or staff member
  useEffect(() => {
    if (net?.status === 'closed' && net?.can_manage && !archiveReminderShownRef.current) {
      archiveReminderShownRef.current = true;
      archiveReminder.onOpen();
    }
  }, [net?.status, net?.can_manage]);

  const handleDetachCheckInList = () => setCheckInListDetached(true);
  const handleAttachCheckInList = () => setCheckInListDetached(false);
  const handleDetachChat = () => setChatDetached(true);
  const handleAttachChat = () => setChatDetached(false);
  const handleDetachActivityLog = () => setActivityLogDetached(true);
  const handleAttachActivityLog = () => setActivityLogDetached(false);


  // Live message socket (connection, reconnect, message routing, cleanup).
  // Returns the socket so send-sites below can broadcast active speaker /
  // frequency / check-in events. Placed after the fetch functions so they can
  // be passed in as message handlers.
  const ws = useNetWebSocket({
    netId,
    user,
    fetchCheckIns,
    fetchNet,
    fetchNetRoles,
    fetchNetStats,
    setActiveSpeakerId,
    setCheckIns,
    setToastMessage,
    setHighlightCheckIn,
  });

  const handleAssignRole = async () => {
    if (!selectedUserId) {
      setToastMessage('Please select a user');
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
      setToastMessage(error.response?.data?.detail || 'Failed to assign role');
    }
  };

  const handleRemoveRole = async (roleId: number) => {
    if (!confirm('Remove this role assignment?')) return;

    try {
      await api.delete(`/nets/${netId}/roles/${roleId}`);
      fetchNetRoles();
    } catch (error) {
      console.error('Failed to remove role:', error);
      setToastMessage('Failed to remove role');
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
      handleOpenTopicPollConfig();
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
      topicPollDialog.onClose();
      // Then start the net
      handleStartNet();
    } catch (error) {
      console.error('Failed to save topic/poll config:', error);
      setToastMessage('Failed to save configuration');
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
        status: 'checked_in',
      });
    } catch (error) {
      console.error('Failed to start net:', error);
      setStartingNet(false);
    }
  };

  const handleCloseNet = async () => {
    try {
      // Capture values before closing since net state will change
      const templateId = net?.template_id;
      const currentCheckIns = [...checkIns];
      
      await netApi.close(Number(netId));
      closeNetDialog.onClose();
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
      
      // ========== SUBSCRIPTION PROMPT ==========
      // If net was created from a schedule (has template_id), user is logged in,
      // and user checked in to this net, ask if they want to subscribe
      if (templateId && user && isAuthenticated) {
        // Check if current user checked in to this net
        const userCheckedIn = currentCheckIns.some(ci => ci.user_id === user.id);
        
        if (userCheckedIn) {
          // Check if user is already subscribed to this template
          try {
            const templateResponse = await templateApi.get(templateId);
            const isAlreadySubscribed = templateResponse.data.is_subscribed;
            
            if (!isAlreadySubscribed) {
              // Show subscription dialog
              subscribeDialog.onOpen();
            }
          } catch (err) {
            // Template might not exist anymore, skip the prompt
            console.log('Could not check subscription status:', err);
          }
        }
      }
      archiveReminder.onOpen();
    } catch (error) {
      console.error('Failed to close net:', error);
    }
  };

  // Handle subscribing to the schedule template
  const handleSubscribe = async () => {
    if (!net?.template_id) return;
    
    setSubscribing(true);
    try {
      await templateApi.subscribe(net.template_id);
      subscribeDialog.onClose();
      setToastMessage('Subscribed! You will receive notifications for future instances of this net.');
    } catch (error: any) {
      console.error('Failed to subscribe:', error);
      setToastMessage(error.response?.data?.detail || 'Failed to subscribe');
    } finally {
      setSubscribing(false);
    }
  };
  
  const handleSkipSubscribe = () => {
    subscribeDialog.onClose();
  };

  // Go Live: Transition from LOBBY to ACTIVE mode
  const handleGoLive = async () => {
    try {
      await api.post(`/nets/${netId}/go-live`);
      await fetchNet();
      setToastMessage('Net is now LIVE! Subscribers have been notified.');
    } catch (error: any) {
      console.error('Failed to go live:', error);
      setToastMessage(error.response?.data?.detail || 'Failed to go live');
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
  const archiveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleDeleteConfirmed = async () => {
    try {
      await api.delete(`/nets/${netId}`);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to delete net:', error);
      setToastMessage('Failed to delete net');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this net permanently? This cannot be undone.')) return;
    await handleDeleteConfirmed();
  };

  // Get custom fields (non-builtin) that are enabled for this net
  const getEnabledCustomFields = (): FieldDefinition[] => {
    return (fieldDefinitions as FieldDefinition[]).filter((field: FieldDefinition) =>
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

  // Compute the latest checked_in_at per callsign (for graying prior rows)
  // Must be above all early returns so hook count never changes between renders.
  const latestCheckedInAtByCallsign = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const ci of checkIns) {
      const prev = map.get(ci.callsign);
      if (!prev || ci.checked_in_at > prev) {
        map.set(ci.callsign, ci.checked_in_at);
      }
    }
    return map;
  }, [checkIns]);

  if (!net) {
    return <Container><Typography>Loading...</Typography></Container>;
  }

  const isOwner = user?.id === net.owner_id;
  const isAdmin = user?.role === 'admin';
  
  // Check if user has NCS or Logger role
  const userNetRole = netRoles.find((role: any) => role.user_id === user?.id);
  // isAssignedNCS: has the NCS role record regardless of active state (used for toggle button visibility)
  const isAssignedNCS = userNetRole?.role === 'NCS';
  // isNCS: actively operating as NCS (has role AND is_active is not false)
  const isNCS = isAssignedNCS && userNetRole?.is_active !== false;
  // Role is stored as uppercase 'NCS' or 'LOGGER' in the database
  const isNCSOrLogger = userNetRole && (userNetRole.role === 'NCS' && userNetRole.is_active !== false || userNetRole.role === 'LOGGER');
  
  // NCS users can manage the net (edit settings, close, etc.) - they're co-owners.
  // net.can_manage is also true for active template staff (set server-side).
  const canManage = isOwner || isAdmin || isNCS || !!net?.can_manage;
  const canManageCheckIns = canManage || isNCSOrLogger;

  const canStartNet = canManage;
  
  // Check if net has any NCS assigned
  const hasNCS = netRoles.some((role: any) => role.role === 'NCS');

  // Is there an NCS other than the current user actively acting as NCS right
  // now? Used to warn before stepping away leaves the net with no one
  // actively running it.
  const otherActiveNCSExists = netRoles.some(
    (role: any) => role.role === 'NCS' && role.user_id !== user?.id && role.is_active !== false
  );

  // Get NCS roles sorted by assigned_at for consistent color assignment
  const ncsRoles = netRoles
    .filter((role: any) => role.role === 'NCS')
    .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime());

  // Status display helpers (icon/tooltip/label/NCS crown) shared by all three
  // check-in tables. Depends on ncsRoles, so it's constructed here.
  const { getStatusIcon, getStatusTooltip, getStatusLabel, getNcsIcon } =
    getCheckInStatusHelpers({ net, netRoles, checkIns, ncsRoles });

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
    return role ? (displayCallsign(role) || role.email) : null;
  };

  // Check-in row action handlers: create/edit/delete, status + role changes,
  // inline-edit save/cancel/field-change/keydown/blur, active-speaker/hand
  // toggles, and frequency claim/filter/set-active. Plain factory (not a
  // hook) since some handlers need canManage/ncsRoles/userNetRole, which are
  // computed after the `if (!net) return` above.
  const {
    handleCallsignLookup,
    handleCheckIn,
    handleStatusChange,
    handleDeleteCheckIn,
    handleStartInlineEdit,
    handleInlineFieldChange,
    handleInlineKeyDown,
    handleInlineBlur,
    handleSetActiveSpeaker,
    handleToggleHand,
    handleFrequencyChipClick,
  } = getCheckInActions({
    netId, net, checkIns, netRoles, user, isOwner, isAdmin, owner,
    canManageCheckIns, userNetRole, ws,
    checkInForm, inlineEditingId, inlineEditValues, activeSpeakerId, inlineEditRowRef,
    setCheckInForm, setToastMessage, setInlineEditingId, setInlineEditFocusField,
    setInlineEditValues, setCheckIns, setActiveSpeakerId, setNet, setFilteredFrequencyIds,
    fetchCheckIns, fetchNetRoles, fetchPollResponses,
  });

  // Only promote NCS users who checked in before the first non-NCS station.
  // Template staff are bulk-assigned NCS roles at the same timestamp when a net
  // is created from a template, which would otherwise promote all of them above
  // chronological order. An NCS who joins late (after regular stations) stays
  // in their natural check-in position.
  const firstNonNcsCheckInTime = checkIns
    .filter((ci: CheckIn) => !ncsRoles.some((r: any) => r.user_id === ci.user_id))
    .reduce((min: number, ci: CheckIn) => Math.min(min, new Date(ci.checked_in_at).getTime()), Infinity);

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

    // Hide-duplicates: if enabled, hide prior rows (only show the latest row per callsign)
    if (hideDuplicates) {
      const latest = latestCheckedInAtByCallsign.get(checkIn.callsign);
      if (latest && checkIn.checked_in_at < latest) return false;
    }
    
    return true;
  }).sort((a: CheckIn, b: CheckIn) => {
    // Sort order: NCS first → Mobile second → then original checked_in_at order.
    // Mobile stations may only be reachable briefly, so they surface immediately
    // after NCS to ensure their comments are captured before they drop off.
    const aIsNcs = ncsRoles.some((r: any) => r.user_id === a.user_id) &&
                   new Date(a.checked_in_at).getTime() < firstNonNcsCheckInTime;
    const bIsNcs = ncsRoles.some((r: any) => r.user_id === b.user_id) &&
                   new Date(b.checked_in_at).getTime() < firstNonNcsCheckInTime;
    if (aIsNcs !== bIsNcs) return aIsNcs ? -1 : 1;
    if (net?.mobile_priority_sort !== false) {
      const aIsMobile = a.status === 'mobile';
      const bIsMobile = b.status === 'mobile';
      if (aIsMobile !== bIsMobile) return aIsMobile ? -1 : 1;
    }
    // Preserve server order (checked_in_at ascending)
    return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime();
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
        setToastMessage('Cannot check out: You are the only active NCS. Please assign another NCS first.');
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
      setToastMessage('Failed to check out');
    }
  };

  const handleClaimNCS = async () => {
    try {
      await netApi.claimNcs(Number(netId));
      await fetchNetRoles();
      setToastMessage('You are now NCS');
    } catch (error: any) {
      console.error('Failed to claim NCS:', error);
      setToastMessage(error.response?.data?.detail || 'Failed to claim NCS');
    }
  };

  // Step up/down as NCS for this net (self-service role toggle)
  const handleToggleNCSRole = async () => {
    try {
      await netRoleApi.toggleSelf(Number(netId));
      await fetchNetRoles();
    } catch (err: any) {
      setToastMessage(err.response?.data?.detail || 'Could not toggle NCS role');
    }
  };

  // Open the Topic/Poll configuration dialog, seeded with current values
  const handleOpenTopicPollConfig = () => {
    setTempTopicPrompt(net?.topic_of_week_prompt || '');
    setTempPollQuestion(net?.poll_question || '');
    topicPollDialog.onOpen();
  };

  // Open the NCS/Logger role management dialog (needs the current user list)
  const handleOpenRoleDialog = () => {
    fetchAllUsers();
    roleDialog.onOpen();
  };

  // Open the check-in dialog, pre-filled with the user's profile data
  const handleOpenCheckIn = () => {
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
        status: 'checked_in',
      });
    }
    checkInDialog.onOpen();
  };

  return (
    <Container maxWidth={false} sx={{ height: { xs: 'auto', md: '100%' }, py: 0, px: { xs: 0.5, sm: 0 }, display: 'flex', flexDirection: 'column' }}>
      {/* Frames the whole browser viewport (not just this card) so a paused
          net is unmistakable even above the navbar — see app/net_pause.py */}
      {!!net.paused_at && (
        <Box
          aria-hidden
          sx={{
            position: 'fixed', inset: 0, border: '3px solid', borderColor: 'info.main',
            pointerEvents: 'none', zIndex: (theme) => theme.zIndex.appBar + 1,
          }}
        />
      )}
      <Paper
        sx={{
          p: 0.5, flex: { xs: 'none', md: 1 }, display: 'flex', flexDirection: 'column',
          overflow: { xs: 'visible', md: 'hidden' }, minHeight: 0,
        }}
      >
      <NetViewHeader
        net={net}
        netId={netId}
        canManage={canManage}
        canManageCheckIns={canManageCheckIns}
        canStartNet={canStartNet}
        isAdmin={isAdmin}
        isAuthenticated={isAuthenticated}
        isAssignedNCS={isAssignedNCS}
        isNCS={isNCS}
        hasNCS={hasNCS}
        otherActiveNCSExists={otherActiveNCSExists}
        user={user}
        userNetRole={userNetRole}
        userActiveCheckIn={userActiveCheckIn}
        netStats={netStats}
        countdownTime={countdownTime}
        durationTime={durationTime}
        checkInsCount={checkIns.length}
        searchQuery={searchQuery}
        filteredFrequencyIds={filteredFrequencyIds}
        setFilteredFrequencyIds={setFilteredFrequencyIds}
        startingNet={startingNet}
        highlightStartNet={highlightStartNet}
        highlightCheckIn={highlightCheckIn}
        needsTopicPollConfig={needsTopicPollConfig}
        getNcsColor={getNcsColor}
        getNcsColorForFrequency={getNcsColorForFrequency}
        getNcsForFrequency={getNcsForFrequency}
        onFrequencyChipClick={handleFrequencyChipClick}
        bulkCheckIn={bulkCheckIn}
        search={search}
        map={map}
        script={script}
        scheduleAnnouncements={scheduleAnnouncements}
        announcements={announcements}
        topicHistory={topicHistory}
        importDialog={importDialog}
        closeNetDialog={closeNetDialog}
        onOpenTopicPollConfig={handleOpenTopicPollConfig}
        onOpenRoleDialog={handleOpenRoleDialog}
        onOpenCheckIn={handleOpenCheckIn}
        onStartNetClick={handleStartNetClick}
        onClaimNCS={handleClaimNCS}
        onToggleHand={handleToggleHand}
        onStatusChange={handleStatusChange}
        onToggleNCSRole={handleToggleNCSRole}
        onCheckOut={handleCheckOut}
        onGoLive={handleGoLive}
        onExportCSV={handleExportCSV}
        onExportICS309={handleExportICS309}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={handleDelete}
      />

      {/* Persistent banner while no NCS is actively present — see app/net_pause.py */}
      {!!net.paused_at && (
        <Alert variant="filled" severity="info" sx={{ borderRadius: 0 }}>
          Net Control has stepped away — this net has been paused until they return.
        </Alert>
      )}

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
              {/* ========== CHECK-IN LIST TABLE 1: Desktop Inline (attached) ========== */}
              <CheckInTable
                net={net}
                filteredCheckIns={filteredCheckIns}
                netRoles={netRoles}
                ncsRoles={ncsRoles}
                owner={owner}
                user={user}
                onlineUserIds={onlineUserIds}
                activeSpeakerId={activeSpeakerId}
                latestCheckedInAtByCallsign={latestCheckedInAtByCallsign}
                hasAnyRelayedBy={hasAnyRelayedBy}
                hideDuplicates={hideDuplicates}
                canManage={canManage}
                canManageCheckIns={canManageCheckIns}
                inlineEditingId={inlineEditingId}
                inlineEditValues={inlineEditValues}
                inlineEditFocusField={inlineEditFocusField}
                inlineEditRowRef={inlineEditRowRef}
                getNcsColor={getNcsColor}
                getNcsColorForFrequency={getNcsColorForFrequency}
                getEnabledCustomFields={getEnabledCustomFields}
                isFieldRequired={isFieldRequired}
                formatFrequencyDisplay={formatFrequencyDisplay}
                getStatusIcon={getStatusIcon}
                getStatusTooltip={getStatusTooltip}
                getStatusLabel={getStatusLabel}
                getNcsIcon={getNcsIcon}
                setHideDuplicates={setHideDuplicates}
                handleDetachCheckInList={handleDetachCheckInList}
                handleStartInlineEdit={handleStartInlineEdit}
                handleInlineFieldChange={handleInlineFieldChange}
                handleInlineKeyDown={handleInlineKeyDown}
                handleInlineBlur={handleInlineBlur}
                handleStatusChange={handleStatusChange}
                fetchNetRoles={fetchNetRoles}
                fetchCheckIns={fetchCheckIns}
                handleToggleHand={handleToggleHand}
                handleSetActiveSpeaker={handleSetActiveSpeaker}
                handleDeleteCheckIn={handleDeleteCheckIn}
                setProfileUserId={setProfileUserId}
              />
            
            {/* ========== CHECK-IN LIST TABLE 2: Mobile View (xs only) ========== */}
            <CheckInMobileList
              net={net}
              filteredCheckIns={filteredCheckIns}
              netRoles={netRoles}
              ncsRoles={ncsRoles}
              owner={owner}
              user={user}
              onlineUserIds={onlineUserIds}
              activeSpeakerId={activeSpeakerId}
              latestCheckedInAtByCallsign={latestCheckedInAtByCallsign}
              hasAnyRelayedBy={hasAnyRelayedBy}
              canManage={canManage}
              canManageCheckIns={canManageCheckIns}
              getNcsColor={getNcsColor}
              getEnabledCustomFields={getEnabledCustomFields}
              isFieldRequired={isFieldRequired}
              getStatusIcon={getStatusIcon}
              getStatusLabel={getStatusLabel}
              getNcsIcon={getNcsIcon}
              onStatusChange={handleStatusChange}
              onRefreshRoles={fetchNetRoles}
              onRefreshCheckIns={fetchCheckIns}
              onDeleteCheckIn={handleDeleteCheckIn}
              onShowProfile={setProfileUserId}
            />
            
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
                          autoComplete="off"
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
                      <Select
                        size="small"
                        value={checkInForm.status}
                        onChange={(e) => setCheckInForm({ ...checkInForm, status: e.target.value })}
                        sx={{ fontSize: '0.75rem', minWidth: 90 }}
                      >
                        <MenuItem value="checked_in">✅ In</MenuItem>
                        <MenuItem value="listening">👂 Listening</MenuItem>
                        <MenuItem value="mobile">🚗 Mobile</MenuItem>
                        <MenuItem value="relay">📡 Relay</MenuItem>
                        <MenuItem value="has_traffic">🚨 Traffic</MenuItem>
                        <MenuItem value="announcements">📢 Announce</MenuItem>
                        <MenuItem value="away">⏸️ Away</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {net?.frequencies && net.frequencies.length > 1 && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => frequencyDialog.onOpen()}
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
            
            {/* Mobile check-in form - full version. Collapsed by default so
                NCS/Loggers attending another operator's net don't have a tall
                form pushing the check-in list off-screen. Header is always
                tappable to expand/collapse. */}
            {(net.status === 'active' || net.status === 'lobby') && canManageCheckIns && (
              <Paper sx={{ p: 1.5, mt: 1, display: { xs: 'block', md: 'none' } }}>
                <Box
                  onClick={() => setMobileCheckInExpanded((v) => !v)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    mb: mobileCheckInExpanded ? 1.5 : 0,
                    userSelect: 'none',
                  }}
                >
                  <Typography variant="subtitle2">New Check-in</Typography>
                  <IconButton size="small" aria-label={mobileCheckInExpanded ? 'Collapse' : 'Expand'}>
                    {mobileCheckInExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                <Collapse in={mobileCheckInExpanded} unmountOnExit>
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
                      autoComplete="off"
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
                      onClick={() => frequencyDialog.onOpen()}
                      startIcon={<span>📡</span>}
                      fullWidth
                    >
                      Set Available Frequencies
                    </Button>
                  )}
                  
                  {/* Single frequency display */}
                  {net?.frequencies && net.frequencies.length === 1 && (
                    <Box sx={{
                      p: 1.5,
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      textAlign: 'center',
                      fontSize: '0.9rem',
                      color: 'text.secondary'
                    }}>
                      📡 Frequency: {net.frequencies[0].frequency || net.frequencies[0].network || 'Unknown'}
                    </Box>
                  )}
                  
                  {/* Status selector */}
                  <FormControl size="small" fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={checkInForm.status}
                      label="Status"
                      onChange={(e) => setCheckInForm({ ...checkInForm, status: e.target.value })}
                    >
                      <MenuItem value="checked_in">✅ Checked In</MenuItem>
                      <MenuItem value="listening">👂 Just Listening</MenuItem>
                      <MenuItem value="mobile">🚗 Mobile</MenuItem>
                      <MenuItem value="relay">📡 Relay</MenuItem>
                      <MenuItem value="has_traffic">🚨 Has Traffic</MenuItem>
                      <MenuItem value="announcements">📢 Announcements</MenuItem>
                      <MenuItem value="away">⏸️ Away</MenuItem>
                    </Select>
                  </FormControl>
                  
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
                </Collapse>
              </Paper>
            )}
              </FloatingWindow>
            </Grid>
            )}
            
            <NetViewSidePanels
              netId={netId}
              net={net}
              canManage={canManage}
              searchQuery={searchQuery}
              onlineUserIds={onlineUserIds}
              checkInListDetached={checkInListDetached}
              chatDetached={chatDetached}
              activityLogDetached={activityLogDetached}
              chatMinimized={chatMinimized}
              activityLogMinimized={effectiveActivityLogMinimized}
              setProfileUserId={setProfileUserId}
              setChatMinimized={setChatMinimized}
              setActivityLogMinimized={setEffectiveActivityLogMinimized}
              setActivityLogDetached={setActivityLogDetached}
              handleAttachChat={handleAttachChat}
              handleDetachChat={handleDetachChat}
              handleAttachActivityLog={handleAttachActivityLog}
              handleDetachActivityLog={handleDetachActivityLog}
            />
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
              <CheckInTable
                detached
                net={net}
                filteredCheckIns={filteredCheckIns}
                netRoles={netRoles}
                ncsRoles={ncsRoles}
                owner={owner}
                user={user}
                onlineUserIds={onlineUserIds}
                activeSpeakerId={activeSpeakerId}
                latestCheckedInAtByCallsign={latestCheckedInAtByCallsign}
                hasAnyRelayedBy={hasAnyRelayedBy}
                hideDuplicates={hideDuplicates}
                canManage={canManage}
                canManageCheckIns={canManageCheckIns}
                inlineEditingId={inlineEditingId}
                inlineEditValues={inlineEditValues}
                inlineEditFocusField={inlineEditFocusField}
                inlineEditRowRef={inlineEditRowRef}
                getNcsColor={getNcsColor}
                getNcsColorForFrequency={getNcsColorForFrequency}
                getEnabledCustomFields={getEnabledCustomFields}
                isFieldRequired={isFieldRequired}
                formatFrequencyDisplay={formatFrequencyDisplay}
                getStatusIcon={getStatusIcon}
                getStatusTooltip={getStatusTooltip}
                getStatusLabel={getStatusLabel}
                getNcsIcon={getNcsIcon}
                setHideDuplicates={setHideDuplicates}
                handleDetachCheckInList={handleDetachCheckInList}
                handleStartInlineEdit={handleStartInlineEdit}
                handleInlineFieldChange={handleInlineFieldChange}
                handleInlineKeyDown={handleInlineKeyDown}
                handleInlineBlur={handleInlineBlur}
                handleStatusChange={handleStatusChange}
                fetchNetRoles={fetchNetRoles}
                fetchCheckIns={fetchCheckIns}
                handleToggleHand={handleToggleHand}
                handleSetActiveSpeaker={handleSetActiveSpeaker}
                handleDeleteCheckIn={handleDeleteCheckIn}
                setProfileUserId={setProfileUserId}
              />
              
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
                      <TextField size="small" value={checkInForm.name} onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })} placeholder="Name" autoComplete="off" sx={{ width: 120 }} />
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
                        options={topicResponses.responses.map(r => r.response)}
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

      </Paper>

      {/* Close Net Confirmation Dialog */}
      <NetControlDialogs
        closeNetDialog={closeNetDialog}
        onCloseNet={handleCloseNet}
        subscribeDialog={subscribeDialog}
        netName={net?.name}
        subscribing={subscribing}
        onSkipSubscribe={handleSkipSubscribe}
        onSubscribe={handleSubscribe}
        topicPollDialog={topicPollDialog}
        topicEnabled={!!net?.topic_of_week_enabled}
        pollEnabled={!!net?.poll_enabled}
        tempTopicPrompt={tempTopicPrompt}
        setTempTopicPrompt={setTempTopicPrompt}
        tempPollQuestion={tempPollQuestion}
        setTempPollQuestion={setTempPollQuestion}
        onSaveAndStart={handleTopicPollSaveAndStart}
        frequencyDialog={frequencyDialog}
        frequencies={net?.frequencies}
        availableFrequencyIds={checkInForm.available_frequency_ids}
        onAvailableFrequencyIdsChange={(ids) => setCheckInForm({ ...checkInForm, available_frequency_ids: ids })}
        formatFrequency={formatFrequencyDisplay}
      />

      {/* Role Management Dialog */}
      <RoleAssignmentDialog
        dialog={roleDialog}
        allUsers={allUsers}
        netRoles={netRoles}
        onlineUserIds={onlineUserIds}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        selectedRole={selectedRole}
        setSelectedRole={setSelectedRole}
        onAssignRole={handleAssignRole}
        onRemoveRole={handleRemoveRole}
        onShowProfile={setProfileUserId}
      />


      {/* Check-In Dialog for Regular Users */}
      <CheckInFormDialog
        dialog={checkInDialog}
        netName={net?.name}
        fieldConfig={net?.field_config}
        frequencies={net?.frequencies}
        checkInForm={checkInForm}
        setCheckInForm={setCheckInForm}
        onCallsignLookup={handleCallsignLookup}
        onCheckIn={handleCheckIn}
        formatFrequency={formatFrequencyDisplay}
      />

      {/* Check-in Location Map */}
      <CheckInMap
        open={map.open}
        onClose={map.onClose}
        checkIns={filteredCheckIns}
        netName={net?.name || 'Net'}
        ncsUserIds={netRoles.filter((r: any) => r.role === 'NCS').map((r: any) => r.user_id)}
        loggerUserIds={netRoles.filter((r: any) => r.role === 'LOGGER').map((r: any) => r.user_id)}
        relayUserIds={netRoles.filter((r: any) => r.role === 'Relay').map((r: any) => r.user_id)}
      />

      {/* Bulk Check-In Dialog */}
      <BulkCheckIn
        open={bulkCheckIn.open}
        onClose={bulkCheckIn.onClose}
        netId={Number(netId)}
        onCheckInsAdded={fetchCheckIns}
        fieldConfig={net?.field_config}
      />

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={importDialog.open}
        onClose={importDialog.onClose}
        netId={netId}
        netName={net?.name || 'net'}
        sampleFrequencyDisplay={net?.frequencies?.[0] ? formatFrequencyDisplay(net.frequencies[0]) : ''}
        onToast={setToastMessage}
        onImported={() => Promise.all([fetchCheckIns(), fetchNetStats(), fetchNet()]).then(() => {})}
      />

      {/* Search Dialog */}
      <SearchCheckIns
        open={search.open}
        onClose={search.onClose}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        matchCount={filteredCheckIns.length}
      />

      {/* Net Script Viewer */}
      <NetScript
        open={script.open}
        onClose={script.onClose}
        script={net?.script || ''}
        netName={net?.name || 'Net'}
        netId={Number(netId)}
        templateId={net?.template_id}
        canEdit={canManage && !!net?.template_id}
        onSaved={(newScript) => setNet((prev: any) => prev ? { ...prev, script: newScript } : prev)}
      />

      {/* Per-net notes viewer */}
      <Announcements
        open={announcements.open}
        onClose={announcements.onClose}
        announcements={net?.announcements || ''}
        netName={net?.name || 'Net'}
        netId={Number(netId)}
        templateId={net?.template_id}
        canEdit={canManage && !!net?.template_id}
        onSaved={(newAnnouncements) => setNet((prev: any) => prev ? { ...prev, announcements: newAnnouncements } : prev)}
      />

      {/* Schedule announcements viewer */}
      {net?.template_id && (
        <ScheduleAnnouncements
          open={scheduleAnnouncements.open}
          onClose={scheduleAnnouncements.onClose}
          templateId={net.template_id}
          netName={net?.name || 'Net'}
          canEdit={canManage}
        />
      )}

      {/* Topic History Dialog */}
      {net?.template_id && (
        <TopicHistory
          open={topicHistory.open}
          onClose={topicHistory.onClose}
          templateId={net.template_id}
          templateName={net.name}
          canManage={canManage}
        />
      )}


      {/* ========== WHO IS THIS? PROFILE POPUP ========== */}
      <UserProfileDialog
        userId={profileUserId}
        netId={netId ? Number(netId) : undefined}
        onClose={() => setProfileUserId(null)}
      />

      <ArchiveDialogs
        netName={net?.name}
        archiveReminder={archiveReminder}
        archiveHelp={archiveHelp}
        archiveDeleteConfirm={archiveDeleteConfirm}
        onArchive={handleArchive}
        onDeleteConfirmed={handleDeleteConfirmed}
      />

      {/* ========== CHECK-IN PROMPT FOR VIEWERS ========== */}
      {/* Shows once for authenticated users viewing an active/lobby net they haven't joined */}
      <Snackbar
        open={checkInPrompt.open}
        autoHideDuration={15000}
        onClose={checkInPrompt.onClose}
        message={net?.status === 'lobby' ? 'The lobby is open! Would you like to check in?' : 'This net is active. Would you like to check in?'}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {isNCS ? (
              <>
                <Button
                  color="primary"
                  size="small"
                  variant="contained"
                  onClick={() => {
                    checkInPrompt.onClose();
                    if (user) {
                      const locationValue = (user.location_awareness && gridSquare) ? gridSquare : (user.location || '');
                      setCheckInForm({ callsign: getAppropriateCallsign(), name: user.name || '', location: locationValue, skywarn_number: '', weather_observation: '', power_source: '', power: '', feedback: '', notes: '', relayed_by: '', available_frequency_ids: [], custom_fields: {}, topic_response: '', poll_response: '', status: 'checked_in' });
                    }
                    checkInDialog.onOpen();
                  }}
                >
                  Check In as NCS
                </Button>
                <Button
                  color="inherit"
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: 'rgba(255,255,255,0.5)', color: 'inherit' }}
                  onClick={() => {
                    checkInPrompt.onClose();
                    if (user) {
                      const locationValue = (user.location_awareness && gridSquare) ? gridSquare : (user.location || '');
                      setCheckInForm({ callsign: getAppropriateCallsign(), name: user.name || '', location: locationValue, skywarn_number: '', weather_observation: '', power_source: '', power: '', feedback: '', notes: '', relayed_by: '', available_frequency_ids: [], custom_fields: {}, topic_response: '', poll_response: '', status: 'checked_in' });
                    }
                    checkInDialog.onOpen();
                  }}
                >
                  Check In as Participant
                </Button>
              </>
            ) : (
              <Button
                color="primary"
                size="small"
                variant="contained"
                onClick={() => {
                  checkInPrompt.onClose();
                  if (user) {
                    const locationValue = (user.location_awareness && gridSquare) ? gridSquare : (user.location || '');
                    setCheckInForm({ callsign: getAppropriateCallsign(), name: user.name || '', location: locationValue, skywarn_number: '', weather_observation: '', power_source: '', power: '', feedback: '', notes: '', relayed_by: '', available_frequency_ids: [], custom_fields: {}, topic_response: '', poll_response: '', status: 'checked_in' });
                  }
                  checkInDialog.onOpen();
                }}
              >
                Check In
              </Button>
            )}
            <Button color="inherit" size="small" onClick={checkInPrompt.onClose}>
              Dismiss
            </Button>
          </Box>
        }
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
