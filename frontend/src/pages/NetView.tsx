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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DownloadIcon from '@mui/icons-material/Download';
import ArchiveIcon from '@mui/icons-material/Archive';
import { netApi, checkInApi } from '../services/api';
import api from '../services/api';
import { formatDateTime, formatTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import Chat from '../components/Chat';

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
  notes?: string;
  status: string;
  is_recheck: boolean;
  checked_in_at: string;
  frequency_id?: number;
  available_frequencies?: number[];
  user_id?: number;
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
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Check-in form state
  const [checkInForm, setCheckInForm] = useState({
    callsign: '',
    name: '',
    location: '',
    skywarn_number: '',
    weather_observation: '',
    power_source: '',
    feedback: '',
    notes: '',
    available_frequency_ids: [] as number[],
  });

  useEffect(() => {
    if (netId) {
      fetchNet();
      fetchCheckIns();
      fetchNetRoles();
      fetchNetStats();
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
    // Get JWT token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      return;
    }
    
    // Get WebSocket URL from environment (convert http:// to ws://, https:// to wss://)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws');
    
    const websocket = new WebSocket(`${wsUrl}/ws/nets/${netId}?token=${token}`);
    
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
      const response = await api.get('/users/');
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
        feedback: '',
        notes: '',
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

  const handleCheckIn = async () => {
    // Validate required fields
    if (!checkInForm.callsign) {
      alert('Callsign is required');
      return;
    }

    try {
      await checkInApi.create(Number(netId), checkInForm);
      
      // Clear form for next check-in
      setCheckInForm({
        callsign: '',
        name: '',
        location: '',
        skywarn_number: '',
        weather_observation: '',
        power_source: '',
        feedback: '',
        notes: '',
        available_frequency_ids: [],
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
      if (userRole?.role === 'ncs') return '👑';
      if (userRole?.role === 'logger') return '📋';
      
      // Show recheck icon for rechecked stations (replaces standard check-in)
      if (checkIn.is_recheck && status === 'checked_in') return '🔄';
    }
    
    // Show standard status icons
    switch (status) {
      case 'checked_in': return '✅'; // Standard
      case 'listening': return '👂'; // Just listening
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
      if (userRole?.role === 'ncs') return 'Net Control Station - manages the net';
      if (userRole?.role === 'logger') return 'Logger - assists NCS with logging';
      if (checkIn.is_recheck && status === 'checked_in') return 'Re-checked into the net';
    }
    
    switch (status) {
      case 'checked_in': return 'Checked in and available';
      case 'listening': return 'Monitoring only, not transmitting';
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
      } catch (error) {
        console.error('Failed to update status:', error);
        setToastMessage('Failed to update status');
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

  return (
    <Container maxWidth={false} sx={{ height: '100%', py: 0, px: 0, display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 0.5, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <Box sx={{ flexShrink: 0 }}>
          <Grid container spacing={0} sx={{ mt: 0.5, flex: 1, minHeight: 0 }}>
            <Grid item xs={12} md={8} sx={{ pr: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h5" component="h1" sx={{ mb: 0 }}>
                  {net.name}
                </Typography>
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
                {/* Right side: Frequency chips */}
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
                {canManage && net.status === 'active' && (
                  <Button 
                    size="small" 
                    variant="outlined" 
                    onClick={() => {
                      fetchAllUsers();
                      setRoleDialogOpen(true);
                    }}
                  >
                    Manage Roles
                  </Button>
                )}
                {isAuthenticated && net.status === 'active' && (
                  userActiveCheckIn ? (
                    <Button 
                      size="small"
                      variant="outlined" 
                      color="error"
                      onClick={handleCheckOut}
                    >
                      Check Out
                    </Button>
                  ) : (
                    <Button 
                      size="small"
                      variant="contained" 
                      color="primary" 
                      onClick={() => {
                        // Pre-fill form with user's profile data
                        if (user) {
                          setCheckInForm({
                            callsign: user.callsign || '',
                            name: user.name || '',
                            location: user.location || '',
                            skywarn_number: '',
                            weather_observation: '',
                            power_source: '',
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
                      Check In
                    </Button>
                  )
                )}
                {canManage && net.status === 'active' && (
                  <Button size="small" variant="contained" color="error" onClick={handleCloseNet}>
                    Close Net
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

        {net.status === 'active' && (
          <Grid container spacing={0} sx={{ mt: 0.5, flex: 1, minHeight: 0 }}>
            <Grid item xs={12} md={8} sx={{ pr: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '4px 4px 0 0', borderBottom: 0, flexShrink: 0 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Callsign *</TableCell>
                      {net?.field_config?.name?.enabled && <TableCell>Name {net.field_config.name.required && '*'}</TableCell>}
                      {net?.field_config?.location?.enabled && <TableCell>Location {net.field_config.location.required && '*'}</TableCell>}
                      {net?.field_config?.skywarn_number?.enabled && <TableCell>SKYWARN # {net.field_config.skywarn_number.required && '*'}</TableCell>}
                      {net?.field_config?.weather_observation?.enabled && <TableCell>Weather {net.field_config.weather_observation.required && '*'}</TableCell>}
                      {net?.field_config?.power_source?.enabled && <TableCell>Power {net.field_config.power_source.required && '*'}</TableCell>}
                      {net?.field_config?.notes?.enabled && <TableCell>Notes {net.field_config.notes.required && '*'}</TableCell>}
                      <TableCell>Time</TableCell>
                      {canManage && <TableCell>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                </Table>
              </Box>
              <TableContainer sx={{ flex: 1, overflow: 'auto', border: 1, borderColor: 'divider', borderTop: 0, minHeight: 0 }}>
                <Table size="small">
                  <TableBody>
                  {/* Existing check-ins */}
                  {checkIns.map((checkIn, index) => (
                    <TableRow 
                      key={checkIn.id}
                      sx={{ 
                        backgroundColor: checkIn.id === activeSpeakerId 
                          ? (theme) => theme.palette.mode === 'dark' ? theme.palette.success.dark : theme.palette.success.light
                          : checkIn.status === 'checked_out' 
                          ? 'action.disabledBackground' 
                          : 'inherit',
                        opacity: checkIn.status === 'checked_out' ? 0.6 : 1,
                        border: checkIn.id === activeSpeakerId ? 2 : 0,
                        borderColor: checkIn.id === activeSpeakerId ? 'success.main' : 'transparent',
                        '& .MuiTableCell-root': checkIn.id === activeSpeakerId ? {
                          fontWeight: 'bold'
                        } : {}
                      }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
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
                          const validValues = ['ncs', 'logger', 'checked_in', 'listening', 'away', 'available', 'announcements'];
                          if (!validValues.includes(selectValue)) {
                            selectValue = 'checked_in';
                          }

                          return (
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
                                PaperProps: {
                                  style: {
                                    maxHeight: 300,
                                  },
                                },
                              }}
                            >
                              {/* Always render the current value as an option to prevent MUI errors */}
                              {((canManageCheckIns || selectValue === 'ncs') && <Tooltip title="Net Control Station" arrow><MenuItem value="ncs">👑</MenuItem></Tooltip>)}
                              {((canManageCheckIns || selectValue === 'logger') && <Tooltip title="Logger" arrow><MenuItem value="logger">📋</MenuItem></Tooltip>)}
                              <Tooltip title={checkIn.is_recheck ? 'Rechecked' : 'Standard'} arrow><MenuItem value="checked_in">{checkIn.is_recheck ? '🔄' : '✅'}</MenuItem></Tooltip>
                              <Tooltip title="Listening only" arrow><MenuItem value="listening">👂</MenuItem></Tooltip>
                              <Tooltip title="Away" arrow><MenuItem value="away">⏸️</MenuItem></Tooltip>
                              <Tooltip title="Has traffic" arrow><MenuItem value="available">🚨</MenuItem></Tooltip>
                              <Tooltip title="Announcements" arrow><MenuItem value="announcements">📢</MenuItem></Tooltip>
                            </Select>
                          );
                        })() : (
                          <Tooltip title={getStatusTooltip(checkIn.status, checkIn)} arrow>
                            <span style={{ cursor: 'help' }}>{getStatusIcon(checkIn.status, checkIn)}</span>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
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
                          <Box>
                            {checkIn.callsign}
                          </Box>
                        </Box>
                        <Box>
                          {checkIn.frequency_id && (() => {
                            const freq = net.frequencies.find((f: any) => f.id === checkIn.frequency_id);
                            return freq ? (
                              <Chip 
                                label={`📡 ${formatFrequencyDisplay(freq)}`}
                                size="small"
                                sx={{ ml: 1, height: 20, fontSize: '0.75rem' }}
                              />
                            ) : null;
                          })()}
                          {checkIn.available_frequencies && checkIn.available_frequencies.length > 0 && (
                            <Box sx={{ mt: 0.5 }}>
                              {checkIn.available_frequencies.map((freqId: number) => {
                                const freq = net.frequencies.find((f: any) => f.id === freqId);
                                return freq ? (
                                  <Chip 
                                    key={freqId}
                                    label={formatFrequencyDisplay(freq)}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mr: 0.5, height: 18, fontSize: '0.7rem' }}
                                  />
                                ) : null;
                              })}
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      {net?.field_config?.name?.enabled && <TableCell>{checkIn.name}</TableCell>}
                      {net?.field_config?.location?.enabled && <TableCell>{checkIn.location}</TableCell>}
                      {net?.field_config?.skywarn_number?.enabled && <TableCell>{checkIn.skywarn_number}</TableCell>}
                      {net?.field_config?.weather_observation?.enabled && <TableCell>{checkIn.weather_observation}</TableCell>}
                      {net?.field_config?.power_source?.enabled && <TableCell>{checkIn.power_source}</TableCell>}
                      {net?.field_config?.notes?.enabled && <TableCell>{checkIn.notes}</TableCell>}
                      <TableCell>
                        {formatTime(checkIn.checked_in_at, user?.prefer_utc || false)}
                      </TableCell>
                      {canManage && (
                      <TableCell>
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
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Legend */}
            <Box sx={{ p: 0.5, backgroundColor: 'action.hover', border: 1, borderColor: 'divider', borderTop: 0, borderBottom: 0, flexShrink: 0 }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Legend:</Typography>
                <Tooltip title="Net Control Station - manages the net" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👑 NCS</Typography></Tooltip>
                <Tooltip title="Logger - assists NCS with logging" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📋 Logger</Typography></Tooltip>
                <Tooltip title="Checked in and available" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>✅ Standard</Typography></Tooltip>
                <Tooltip title="Re-checked into the net" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🔄 Recheck</Typography></Tooltip>
                <Tooltip title="Monitoring only, not transmitting" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👂 Listening</Typography></Tooltip>
                <Tooltip title="Temporarily away, will return" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>⏸️ Away</Typography></Tooltip>
                <Tooltip title="Has traffic or emergency to report" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>🚨 Traffic</Typography></Tooltip>
                <Tooltip title="Has announcements to share" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>📢 Announce</Typography></Tooltip>
                <Tooltip title="Checked out of net" arrow><Typography variant="caption" sx={{ cursor: 'help' }}>👋 Out</Typography></Tooltip>
              </Box>
            </Box>
            
            {/* New check-in form - fixed below table */}
            {canManageCheckIns && (
              <Paper sx={{ border: 1, borderColor: 'divider', borderTop: 0, borderRadius: '0 0 4px 4px', p: 1, flexShrink: 0 }}>
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
                          placeholder="SKYWARN #"
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
                          placeholder="Power"
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                          fullWidth
                          required={net.field_config.power_source.required}
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
            </Grid>
            
            <Grid item xs={12} md={4} sx={{ pl: { md: 0.5 }, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
              <Chat netId={Number(netId)} />
            </Grid>
          </Grid>
        )}

        {net.status === 'closed' && (
          <Alert severity="info">
            This net has been closed. Check-ins are no longer accepted.
          </Alert>
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
              value={net?.frequencies.filter((f: any) => checkInForm.available_frequency_ids.includes(f.id)) || []}
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
                  label="SKYWARN #"
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
                  label="Power Source"
                  value={editingCheckIn.power_source || ''}
                  onChange={(e) => setEditingCheckIn({ ...editingCheckIn, power_source: e.target.value })}
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
                label="SKYWARN Number"
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
                label="Power Source"
                value={checkInForm.power_source}
                onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
                fullWidth
                required={net.field_config.power_source.required}
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
