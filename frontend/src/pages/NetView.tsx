import React, { useEffect, useState } from 'react';
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
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Snackbar,
  Autocomplete,
  Grid,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DownloadIcon from '@mui/icons-material/Download';
import ArchiveIcon from '@mui/icons-material/Archive';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import CloseIcon from '@mui/icons-material/Close';
import { netApi, checkInApi } from '../services/api';
import api from '../services/api';
import { formatDateTime, formatTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import Chat from '../components/Chat';
import CheckInMap from '../components/CheckInMap';

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  owner_id: number;
  active_frequency_id?: number;
  field_config?: {
    [key: string]: {
      enabled: boolean;
      required: boolean;
    };
  };
  frequencies: Frequency[];
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
  assigned_at: string;
}

const NetView: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
  const [editCheckInDialogOpen, setEditCheckInDialogOpen] = useState(false);
  const [editingCheckIn, setEditingCheckIn] = useState<CheckIn | null>(null);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [netStats, setNetStats] = useState<{total_check_ins: number, online_count: number, guest_count: number} | null>(null);
  const [frequencyDialogOpen, setFrequencyDialogOpen] = useState(false);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
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
  });

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
  }, [net?.owner_id]);

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

  const handleStartNet = async () => {
    try {
      await netApi.start(Number(netId));
      fetchNet();
      fetchCheckIns();
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
        available_frequency_ids: [],
      });
    } catch (error) {
      console.error('Failed to start net:', error);
    }
  };

  const handleCloseNet = async () => {
    try {
      await netApi.close(Number(netId));
      fetchNet();
    } catch (error) {
      console.error('Failed to close net:', error);
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

  const handleArchive = async () => {
    if (!confirm('Archive this net? It will be hidden from the main dashboard.')) return;
    try {
      await api.post(`/nets/${netId}/archive`);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to archive net:', error);
      alert('Failed to archive net');
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
    return fieldDefinitions.filter(field => 
      !field.is_builtin && 
      net?.field_config?.[field.name]?.enabled
    );
  };

  // Check if a builtin field is enabled
  const isFieldEnabled = (fieldName: string) => {
    return net?.field_config?.[fieldName]?.enabled ?? false;
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
      });
      
      fetchCheckIns();
      
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
      if (owner?.id === checkIn.user_id) return '👑';
      const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
      if (userRole?.role?.toUpperCase() === 'NCS') return '👑';
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
      case 'checked_out': return '👋'; // Checked out
      default: return '✅';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'checked_in': return 'Standard';
      case 'listening': return 'Just Listening';
      case 'relay': return 'Relay Station';
      case 'away': return 'Short Term';
      case 'available': return 'Has Traffic';
      case 'announcements': return 'Announcements';
      case 'checked_out': return 'Checked Out';
      default: return 'Standard';
    }
  };

  const getStatusTooltip = (status: string, checkIn?: CheckIn) => {
    // Check for role-based tooltips first
    if (checkIn) {
      if (owner?.id === checkIn.user_id) return 'Net Control Station - manages the net';
      const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
      if (userRole?.role?.toUpperCase() === 'NCS') return 'Net Control Station - manages the net';
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
      case 'checked_out': return 'Checked out of net';
      default: return 'Checked in and available';
    }
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

  const handleEditCheckIn = (checkIn: CheckIn) => {
    setEditingCheckIn(checkIn);
    setEditCheckInDialogOpen(true);
  };

  const handleSaveEditCheckIn = async () => {
    if (!editingCheckIn) return;
    
    try {
      await checkInApi.update(editingCheckIn.id, {
        callsign: editingCheckIn.callsign,
        name: editingCheckIn.name,
        location: editingCheckIn.location,
        skywarn_number: editingCheckIn.skywarn_number,
        weather_observation: editingCheckIn.weather_observation,
        power_source: editingCheckIn.power_source,
        power: editingCheckIn.power,
        notes: editingCheckIn.notes,
        available_frequency_ids: editingCheckIn.available_frequencies || [],
      });
      setEditCheckInDialogOpen(false);
      setEditingCheckIn(null);
      fetchCheckIns();
    } catch (error) {
      console.error('Failed to update check-in:', error);
      alert('Failed to update check-in');
    }
  };

  const handleSetActiveSpeaker = (checkInId: number | null) => {
    const newActiveSpeakerId = activeSpeakerId === checkInId ? null : checkInId;
    
    // Show toast if setting someone with "listening" status as active speaker
    const checkIn = checkIns.find(ci => ci.id === checkInId);
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
  const canManage = isOwner || isAdmin;

  // Check if user has NCS or Logger role
  const userNetRole = netRoles.find((role: any) => role.user_id === user?.id);
  const isNCSOrLogger = userNetRole && (userNetRole.role === 'NCS' || userNetRole.role === 'Logger');
  const canManageCheckIns = canManage || isNCSOrLogger;
  
  // Check if net has any NCS assigned
  const hasNCS = netRoles.some((role: any) => role.role === 'NCS');

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
                {/* Left side: Status and stats */}
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip label={net.status} size="small" color={net.status === 'active' ? 'success' : 'default'} />
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
                    {net.frequencies.map((freq) => (
                      <Chip
                        key={freq.id}
                        label={freq.frequency 
                          ? `${freq.frequency} MHz ${freq.mode || ''}`.trim()
                          : `${freq.network || ''}${freq.talkgroup ? ` TG${freq.talkgroup}` : ''} ${freq.mode || ''}`.trim()
                        }
                        size="small"
                        color={freq.id === net.active_frequency_id ? 'primary' : 'default'}
                        onClick={canManageCheckIns ? () => handleSetActiveFrequency(freq.id) : undefined}
                        clickable={canManageCheckIns}
                        sx={{ 
                          height: 24,
                          cursor: canManageCheckIns ? 'pointer' : 'default',
                          fontWeight: freq.id === net.active_frequency_id ? 'bold' : 'normal',
                        }}
                        title={canManageCheckIns ? 'Click to set as active frequency' : undefined}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </Grid>
            <Grid item xs={12} md={4} sx={{ pl: { md: 0.5 } }}>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                {canManage && net.status === 'draft' && (
                  <>
                    <Button size="small" variant="outlined" onClick={() => navigate(`/nets/${netId}/edit`)}>
                      Edit
                    </Button>
                    <Button size="small" variant="contained" onClick={handleStartNet}>
                      Start Net
                    </Button>
                  </>
                )}
                {net.status === 'active' && checkIns.length > 0 && (
                  <Button 
                    size="small" 
                    variant="outlined" 
                    startIcon={<MapIcon fontSize="small" />}
                    onClick={() => setMapOpen(true)}
                  >
                    Map
                  </Button>
                )}
                {canManage && net.status === 'active' && (
                  <>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      startIcon={<EditIcon fontSize="small" />}
                      onClick={() => navigate(`/nets/${netId}/edit`)}
                    >
                      Net
                    </Button>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      startIcon={<GroupIcon fontSize="small" />}
                      onClick={() => {
                        fetchAllUsers();
                        setRoleDialogOpen(true);
                      }}
                    >
                      Roles
                    </Button>
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
                )}
                {isAuthenticated && net.status === 'active' && (
                  userActiveCheckIn ? (
                    <Button 
                      size="small"
                      variant="outlined" 
                      color="error"
                      startIcon={<LogoutIcon fontSize="small" />}
                      onClick={handleCheckOut}
                    >
                      Out
                    </Button>
                  ) : (
                    <Button 
                      size="small"
                      variant="contained" 
                      color="primary"
                      startIcon={<LoginIcon fontSize="small" />}
                      onClick={() => {
                        // Pre-fill form with user's profile data
                        if (user) {
                          setCheckInForm({
                            callsign: getAppropriateCallsign(),
                            name: user.name || '',
                            location: user.location || '',
                            skywarn_number: '',
                            weather_observation: '',
                            power_source: '',
                            power: '',
                            feedback: '',
                            notes: '',
                            available_frequency_ids: [],
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
                    >
                      In
                    </Button>
                  )
                )}
                {canManage && net.status === 'active' && (
                  <Button 
                    size="small" 
                    variant="contained" 
                    color="error" 
                    startIcon={<CloseIcon fontSize="small" />}
                    onClick={handleCloseNet}
                  >
                    Close
                  </Button>
                )}
                {net.status === 'closed' && (
                  <>
                    <Button 
                      size="small"
                      variant="outlined" 
                      startIcon={<DownloadIcon fontSize="small" />} 
                      onClick={handleExportCSV}
                    >
                      CSV
                    </Button>
                    {canManage && (
                      <Button 
                        size="small"
                        variant="outlined" 
                        startIcon={<ArchiveIcon fontSize="small" />} 
                        onClick={handleArchive}
                      >
                        Archive
                      </Button>
                    )}
                  </>
                )}
                {canManage && (net.status === 'draft' || net.status === 'archived') && (
                  <Button 
                    size="small"
                    variant="outlined" 
                    color="error"
                    startIcon={<DeleteIcon fontSize="small" />} 
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>

        {(net.status === 'active' || net.status === 'closed' || net.status === 'archived') && (
          <Grid container spacing={0} sx={{ mt: 0.5, flex: { xs: 'none', md: 1 }, minHeight: 0 }}>
            {(net.status === 'closed' || net.status === 'archived') && (
              <Grid item xs={12} sx={{ mb: 1 }}>
                <Alert severity="info">
                  {net.status === 'archived' 
                    ? 'This net has been archived. You are viewing historical data.'
                    : 'This net has been closed. Check-ins are no longer accepted.'}
                </Alert>
              </Grid>
            )}
            <Grid item xs={12} md={8} sx={{ pr: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: { xs: 'auto', md: 0 }, height: { xs: 'auto', md: '100%' }, mb: { xs: 2, md: 0 } }}>
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
                      {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                      {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                  {/* Existing check-ins */}
                  {checkIns.map((checkIn, index) => {
                    // Check if this station is available on the active frequency
                    const isOnActiveFrequency = net.active_frequency_id && 
                      checkIn.available_frequencies && 
                      checkIn.available_frequencies.includes(net.active_frequency_id);
                    
                    // Calculate column count for frequency chip row colspan
                    const hasFrequencyChips = net.frequencies && net.frequencies.length > 1 && checkIn.available_frequencies && checkIn.available_frequencies.length > 0;
                    let columnCount = 4; // #, Status, Callsign, Time
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
                    
                    return (
                    <React.Fragment key={checkIn.id}>
                    <TableRow
                      sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : isOnActiveFrequency
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)'
                          : 'transparent',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                        border: checkIn.id === activeSpeakerId ? 2 : 0,
                        borderColor: checkIn.id === activeSpeakerId ? 'success.main' : 'transparent',
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
                      <TableCell sx={{ width: 75 }}>
                        {net.status === 'active' && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
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
                          const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'available', 'announcements', 'checked_out'];
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
                                {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">👑</MenuItem>)}
                                {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋</MenuItem>)}
                                <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}</MenuItem>
                                <MenuItem value="listening">👂</MenuItem>
                                <MenuItem value="relay">📡</MenuItem>
                                <MenuItem value="away">⏸️</MenuItem>
                                <MenuItem value="available">🚨</MenuItem>
                                <MenuItem value="announcements">📢</MenuItem>
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
                      <TableCell sx={{ width: 140 }}>
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
                      </TableCell>
                      {net?.field_config?.name?.enabled && <TableCell>{checkIn.name}</TableCell>}
                      {net?.field_config?.location?.enabled && <TableCell>{checkIn.location}</TableCell>}
                      {net?.field_config?.skywarn_number?.enabled && <TableCell sx={{ width: 70 }}>{checkIn.skywarn_number}</TableCell>}
                      {net?.field_config?.weather_observation?.enabled && <TableCell>{checkIn.weather_observation}</TableCell>}
                      {net?.field_config?.power_source?.enabled && <TableCell sx={{ width: 70 }}>{checkIn.power_source}</TableCell>}
                      {net?.field_config?.power?.enabled && <TableCell sx={{ width: 70 }}>{checkIn.power}</TableCell>}
                      {net?.field_config?.notes?.enabled && <TableCell>{checkIn.notes}</TableCell>}
                      {/* Custom field values */}
                      {getEnabledCustomFields().map((field) => (
                        <TableCell key={field.name}>
                          {checkIn.custom_fields?.[field.name] || ''}
                        </TableCell>
                      ))}
                      {hasAnyRelayedBy && <TableCell sx={{ width: 80 }}>{checkIn.relayed_by || ''}</TableCell>}
                      <TableCell sx={{ width: 95 }}>
                        {formatTime(checkIn.checked_in_at, user?.prefer_utc || false)}
                      </TableCell>
                      {canManage && (
                      <TableCell sx={{ width: 100 }}>
                        {net.status === 'active' && checkIn.status !== 'checked_out' && (
                          <IconButton
                            size="small"
                            onClick={() => handleSetActiveSpeaker(checkIn.id)}
                            color={checkIn.id === activeSpeakerId ? 'primary' : 'default'}
                            title="Mark as active speaker"
                          >
                            🎤
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleEditCheckIn(checkIn)}
                          title="Edit check-in"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCheckIn(checkIn.id)}
                          title="Delete check-in"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                      )}
                    </TableRow>
                    {/* Frequency chips row - only show if net has multiple frequencies */}
                    {hasFrequencyChips && (
                      <TableRow sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : isOnActiveFrequency
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)'
                          : 'transparent',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                      }}>
                        <TableCell colSpan={columnCount} sx={{ pt: 0, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 4 }}>
                            {checkIn.available_frequencies!.map((freqId: number) => {
                              const freq = net.frequencies.find((f: any) => f.id === freqId);
                              const isActive = freqId === checkIn.frequency_id;
                              return freq ? (
                                <Chip 
                                  key={freqId}
                                  label={isActive ? `📡 ${formatFrequencyDisplay(freq)}` : formatFrequencyDisplay(freq)}
                                  size="small"
                                  variant={isActive ? "filled" : "outlined"}
                                  color={isActive ? "primary" : "default"}
                                  sx={{ height: 18, fontSize: '0.7rem' }}
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
                    {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>Relayed By</TableCell>}
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>Time</TableCell>
                    {canManage && <TableCell sx={{ whiteSpace: 'nowrap' }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {checkIns.map((checkIn, index) => {
                    const isOnActiveFrequency = net.active_frequency_id && checkIn.available_frequencies?.includes(net.active_frequency_id);
                    return (
                      <TableRow key={checkIn.id} sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' ? 'action.disabledBackground' 
                          : isOnActiveFrequency ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)' : 'inherit',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                      }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{index + 1}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {net.status === 'active' && checkIn.status !== 'checked_out' && (canManageCheckIns || checkIn.user_id === user?.id) ? (() => {
                            const userRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
                            let selectValue = checkIn.status.toLowerCase();
                            if (userRole && ['ncs', 'logger'].includes(userRole.role.toLowerCase())) {
                              selectValue = userRole.role.toLowerCase();
                            }
                            const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'relay', 'away', 'available', 'announcements', 'checked_out'];
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
                                {((canManageCheckIns || selectValue === 'ncs') && <MenuItem value="ncs">👑</MenuItem>)}
                                {((canManageCheckIns || selectValue === 'logger') && <MenuItem value="logger">📋</MenuItem>)}
                                <MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}</MenuItem>
                                <MenuItem value="listening">👂</MenuItem>
                                <MenuItem value="relay">📡</MenuItem>
                                <MenuItem value="away">⏸️</MenuItem>
                                <MenuItem value="available">🚨</MenuItem>
                                <MenuItem value="announcements">📢</MenuItem>
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
                        {hasAnyRelayedBy && <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkIn.relayed_by || ''}</TableCell>}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTime(checkIn.checked_in_at, user?.prefer_utc || false)}</TableCell>
                        {canManage && (
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <IconButton size="small" onClick={() => handleEditCheckIn(checkIn)}><EditIcon fontSize="small" /></IconButton>
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
              </Box>
            </Box>
            
            {/* New check-in form - desktop only */}
            {net.status === 'active' && canManageCheckIns && (
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
            {net.status === 'active' && canManageCheckIns && (
              <Paper sx={{ p: 1.5, mt: 1, display: { xs: 'block', md: 'none' } }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>New Check-in</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {/* Callsign - always required */}
                  <TextField
                    size="small"
                    label="Callsign *"
                    value={checkInForm.callsign}
                    onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
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
            </Grid>
            
            <Grid item xs={12} md={4} sx={{ pl: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: { xs: 300, md: 0 }, height: { xs: 350, md: '100%' } }}>
              <Chat netId={Number(netId)} />
            </Grid>
          </Grid>
        )}
      </Paper>

      {/* Role Management Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Manage Net Control Staff</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Assign NCS (Net Control Station) or LOGGER roles to users. They will be able to edit and manage this net.
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

      {/* Edit Check-In Dialog */}
      <Dialog 
        open={editCheckInDialogOpen} 
        onClose={() => setEditCheckInDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle>Edit Check-In</DialogTitle>
        <DialogContent>
          {editingCheckIn && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Callsign"
                value={editingCheckIn.callsign}
                onChange={(e) => setEditingCheckIn({ ...editingCheckIn, callsign: e.target.value.toUpperCase() })}
                fullWidth
                required
              />
              {net?.field_config?.name?.enabled && (
                <TextField
                  label="Name"
                  value={editingCheckIn.name || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, name: e.target.value })}
                  fullWidth
                />
              )}
              {net?.field_config?.location?.enabled && (
                <TextField
                  label="Location"
                  value={editingCheckIn.location || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, location: e.target.value })}
                  fullWidth
                />
              )}
              {net?.field_config?.skywarn_number?.enabled && (
                <TextField
                  label="Spotter #"
                  value={editingCheckIn.skywarn_number || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, skywarn_number: e.target.value })}
                  fullWidth
                />
              )}
              {net?.field_config?.weather_observation?.enabled && (
                <TextField
                  label="Weather Observation"
                  value={editingCheckIn.weather_observation || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, weather_observation: e.target.value })}
                  fullWidth
                />
              )}
              {net?.field_config?.power_source?.enabled && (
                <TextField
                  label="Power Src"
                  value={editingCheckIn.power_source || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, power_source: e.target.value })}
                  fullWidth
                />
              )}
              {net?.field_config?.power?.enabled && (
                <TextField
                  label="Power"
                  value={editingCheckIn.power || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, power: e.target.value })}
                  fullWidth
                />
              )}
              {net?.field_config?.notes?.enabled && (
                <TextField
                  label="Notes"
                  value={editingCheckIn.notes || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, notes: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />
              )}
              <TextField
                label="Relayed By"
                value={editingCheckIn.relayed_by || ''}
                onChange={(e) => setEditingCheckIn({ ...editingCheckIn, relayed_by: e.target.value.toUpperCase() })}
                fullWidth
                inputProps={{ style: { textTransform: 'uppercase' } }}
                helperText="Callsign of station who relayed this check-in"
              />
              {net?.frequencies && net.frequencies.length > 1 && (
                <Autocomplete
                  multiple
                  options={net.frequencies || []}
                  getOptionLabel={(option: any) => formatFrequencyDisplay(option)}
                  value={net.frequencies.filter((f: any) => (editingCheckIn.available_frequencies || []).includes(f.id))}
                  onChange={(_, newValue: any[]) => {
                    setEditingCheckIn({
                      ...editingCheckIn,
                      available_frequencies: newValue.map(f => f.id)
                    });
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Available Frequencies"
                      helperText="Select all frequencies this station can monitor"
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
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCheckInDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEditCheckIn} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Check-In Dialog for Regular Users */}
      <Dialog 
        open={checkInDialogOpen} 
        onClose={() => setCheckInDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle>Check In to {net?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Callsign"
              value={checkInForm.callsign}
              onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
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
        checkIns={checkIns}
        netName={net?.name || 'Net'}
      />

      <Snackbar
        open={toastMessage !== ''}
        autoHideDuration={3000}
        onClose={() => setToastMessage('')}
        message={toastMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
};

export default NetView;
