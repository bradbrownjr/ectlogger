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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DownloadIcon from '@mui/icons-material/Download';
import { netApi, checkInApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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
  status: string;
  is_recheck: boolean;
  checked_in_at: string;
  frequency_id?: number;
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
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [netRoles, setNetRoles] = useState<NetRole[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [owner, setOwner] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRole, setSelectedRole] = useState<string>('NCS');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [useCustomCallsign, setUseCustomCallsign] = useState(false);

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
  });

  useEffect(() => {
    if (netId) {
      fetchNet();
      fetchCheckIns();
      fetchNetRoles();
      connectWebSocket();
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [netId]);

  useEffect(() => {
    if (net?.owner_id) {
      fetchOwner();
    }
  }, [net?.owner_id]);

  useEffect(() => {
    // Initialize form with user data
    if (user) {
      setCheckInForm(prev => ({
        ...prev,
        callsign: user.callsign || prev.callsign,
        name: user.name || prev.name,
        location: user.location || prev.location,
      }));
    }
  }, [user]);

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
      console.log('WebSocket connected');
    };
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'check_in') {
        fetchCheckIns(); // Refresh check-ins on new check-in
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
      await api.post(`/nets/${netId}/roles`, null, {
        params: {
          user_id: selectedUserId,
          role: selectedRole
        }
      });
      setSelectedUserId('');
      setSelectedRole('NCS');
      fetchNetRoles();
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

  const handleCheckIn = async () => {
    try {
      await checkInApi.create(Number(netId), checkInForm);
      setCheckInDialogOpen(false);
      setUseCustomCallsign(false);
      setCheckInForm({
        callsign: user?.callsign || '',
        name: user?.name || '',
        location: user?.location || '',
        skywarn_number: '',
        weather_observation: '',
        power_source: '',
        feedback: '',
        notes: '',
      });
      fetchCheckIns();
      
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
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked_in': return '✅';
      case 'listening': return '👂';
      case 'available': return '📻';
      case 'away': return '⏸️';
      case 'checked_out': return '👋';
      default: return '';
    }
  };

  if (!net) {
    return <Container><Typography>Loading...</Typography></Container>;
  }

  const isOwner = user?.id === net.owner_id;
  const isAdmin = user?.role === 'admin';
  const canManage = isOwner || isAdmin;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              {net.name}
            </Typography>
            <Chip label={net.status} color={net.status === 'active' ? 'success' : 'default'} />
          </Box>
          <Box>
            {canManage && net.status === 'draft' && (
              <>
                <Button variant="outlined" onClick={() => navigate(`/nets/${netId}/edit`)} sx={{ mr: 1 }}>
                  Edit
                </Button>
                <Button variant="contained" onClick={handleStartNet} sx={{ mr: 1 }}>
                  Start Net
                </Button>
              </>
            )}
            {canManage && net.status === 'active' && (
              <Button variant="contained" color="error" onClick={handleCloseNet} sx={{ mr: 1 }}>
                Close Net
              </Button>
            )}
            {net.status === 'closed' && (
              <Button 
                variant="outlined" 
                startIcon={<DownloadIcon />}
                onClick={handleExportCSV} 
                sx={{ mr: 1 }}
              >
                Export CSV
              </Button>
            )}
            <Button variant="outlined" onClick={() => navigate('/dashboard')}>
              Back
            </Button>
          </Box>
        </Box>

        {net.description && (
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {net.description}
          </Typography>
        )}

        {net.frequencies.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>Frequencies</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {net.frequencies.map((freq) => (
                <Chip 
                  key={freq.id}
                  label={`${freq.frequency || `${freq.network}${freq.talkgroup ? ` TG${freq.talkgroup}` : ''}`} ${freq.mode}`}
                  color={freq.id === net.active_frequency_id ? 'primary' : 'default'}
                />
              ))}
            </Box>
          </Box>
        )}

        {(netRoles.length > 0 || canManage) && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Net Control Staff</Typography>
              {canManage && (
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
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {owner && (
                <Chip 
                  label={`${owner.callsign || owner.name || owner.email} (OWNER)`}
                  color="primary"
                  size="small"
                />
              )}
              {netRoles.map((role) => (
                <Chip 
                  key={role.id}
                  label={`${role.callsign || role.name || role.email} (${role.role})`}
                  color="secondary"
                  size="small"
                  onDelete={canManage ? () => handleRemoveRole(role.id) : undefined}
                />
              ))}
              {!owner && netRoles.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No staff roles assigned yet
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {net.status === 'active' && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Check-ins ({checkIns.length})</Typography>
              <Button 
                variant="contained" 
                onClick={() => setCheckInDialogOpen(true)}
              >
                Check In Station
              </Button>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Callsign</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {checkIns.map((checkIn, index) => (
                    <TableRow key={checkIn.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{getStatusIcon(checkIn.status)}</TableCell>
                      <TableCell>
                        {checkIn.callsign}
                        {checkIn.is_recheck && ' 🔄'}
                      </TableCell>
                      <TableCell>{checkIn.name}</TableCell>
                      <TableCell>{checkIn.location}</TableCell>
                      <TableCell>
                        {new Date(checkIn.checked_in_at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <IconButton size="small">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        {canManage && (
                          <IconButton size="small" color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {net.status === 'closed' && (
          <Alert severity="info">
            This net has been closed. Check-ins are no longer accepted.
          </Alert>
        )}
      </Paper>

      {/* Check-in Dialog */}
      <Dialog open={checkInDialogOpen} onClose={() => setCheckInDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Check In Station</DialogTitle>
        <DialogContent>
          {!useCustomCallsign && user?.callsigns && user.callsigns.length > 0 ? (
            <FormControl fullWidth margin="normal" required>
              <InputLabel>Callsign *</InputLabel>
              <Select
                value={checkInForm.callsign}
                label="Callsign *"
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setUseCustomCallsign(true);
                    setCheckInForm({ ...checkInForm, callsign: '' });
                  } else {
                    setCheckInForm({ ...checkInForm, callsign: e.target.value as string });
                  }
                }}
              >
                {user.callsign && (
                  <MenuItem value={user.callsign}>{user.callsign} (Primary)</MenuItem>
                )}
                {user.callsigns.map((cs: string) => (
                  <MenuItem key={cs} value={cs}>{cs}</MenuItem>
                ))}
                <MenuItem value="__custom__">
                  <em>Custom / Tactical Callsign...</em>
                </MenuItem>
              </Select>
            </FormControl>
          ) : (
            <TextField
              fullWidth
              label="Callsign *"
              value={checkInForm.callsign}
              onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value.toUpperCase() })}
              margin="normal"
              required
              helperText={useCustomCallsign ? "Enter tactical or building callsign (e.g., WS1EC, WX1GYX)" : undefined}
              inputProps={{ style: { textTransform: 'uppercase' } }}
            />
          )}
          {net?.field_config?.name?.enabled && (
            <TextField
              fullWidth
              label={`Name ${net.field_config.name.required ? '*' : ''}`}
              value={checkInForm.name}
              onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
              margin="normal"
              required={net.field_config.name.required}
            />
          )}
          {net?.field_config?.location?.enabled && (
            <TextField
              fullWidth
              label={`Location ${net.field_config.location.required ? '*' : ''}`}
              value={checkInForm.location}
              onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
              margin="normal"
              required={net.field_config.location.required}
            />
          )}
          {net?.field_config?.skywarn_number?.enabled && (
            <TextField
              fullWidth
              label={`SKYWARN Number ${net.field_config.skywarn_number.required ? '*' : ''}`}
              value={checkInForm.skywarn_number}
              onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })}
              margin="normal"
              required={net.field_config.skywarn_number.required}
            />
          )}
          {net?.field_config?.weather_observation?.enabled && (
            <TextField
              fullWidth
              label={`Weather Observation ${net.field_config.weather_observation.required ? '*' : ''}`}
              value={checkInForm.weather_observation}
              onChange={(e) => setCheckInForm({ ...checkInForm, weather_observation: e.target.value })}
              margin="normal"
              required={net.field_config.weather_observation.required}
              multiline
              rows={2}
            />
          )}
          {net?.field_config?.power_source?.enabled && (
            <TextField
              fullWidth
              label={`Power Source ${net.field_config.power_source.required ? '*' : ''}`}
              value={checkInForm.power_source}
              onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
              margin="normal"
              required={net.field_config.power_source.required}
            />
          )}
          {net?.field_config?.notes?.enabled && (
            <TextField
              fullWidth
              label={`Notes ${net.field_config.notes.required ? '*' : ''}`}
              value={checkInForm.notes}
              onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
              margin="normal"
              required={net.field_config.notes.required}
              multiline
              rows={2}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckInDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCheckIn}
            variant="contained"
            disabled={!checkInForm.callsign || !checkInForm.name || !checkInForm.location}
          >
            Check In
          </Button>
        </DialogActions>
      </Dialog>

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
    </Container>
  );
};

export default NetView;
