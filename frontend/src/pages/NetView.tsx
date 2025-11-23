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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { netApi, checkInApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  owner_id: number;
  active_frequency_id?: number;
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

const NetView: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const [net, setNet] = useState<Net | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useAuth();
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
  });

  useEffect(() => {
    if (netId) {
      fetchNet();
      fetchCheckIns();
      connectWebSocket();
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [netId]);

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

  const handleCheckIn = async () => {
    try {
      await checkInApi.create(Number(netId), checkInForm);
      setCheckInDialogOpen(false);
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
          <TextField
            fullWidth
            label="Callsign *"
            value={checkInForm.callsign}
            onChange={(e) => setCheckInForm({ ...checkInForm, callsign: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Name *"
            value={checkInForm.name}
            onChange={(e) => setCheckInForm({ ...checkInForm, name: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Location *"
            value={checkInForm.location}
            onChange={(e) => setCheckInForm({ ...checkInForm, location: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="SKYWARN Number"
            value={checkInForm.skywarn_number}
            onChange={(e) => setCheckInForm({ ...checkInForm, skywarn_number: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Weather Observation"
            value={checkInForm.weather_observation}
            onChange={(e) => setCheckInForm({ ...checkInForm, weather_observation: e.target.value })}
            margin="normal"
            multiline
            rows={2}
          />
          <TextField
            fullWidth
            label="Power Source"
            value={checkInForm.power_source}
            onChange={(e) => setCheckInForm({ ...checkInForm, power_source: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Notes"
            value={checkInForm.notes}
            onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
            margin="normal"
            multiline
            rows={2}
          />
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
    </Container>
  );
};

export default NetView;
