import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
  Chip,
  Fab,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RadioIcon from '@mui/icons-material/Radio';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArchiveIcon from '@mui/icons-material/Archive';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import { netApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/dateUtils';

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  owner_id: number;
  owner_callsign?: string | null;
  owner_name?: string | null;
  started_at?: string;
  closed_at?: string;
  created_at: string;
  frequencies: any[];
}

const Dashboard: React.FC = () => {
  const [nets, setNets] = useState<Net[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    fetchNets();
  }, []);

  const fetchNets = async () => {
    try {
      const response = await netApi.list();
      setNets(response.data);
    } catch (error) {
      console.error('Failed to fetch nets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'closed': return 'default';
      case 'scheduled': return 'info';
      default: return 'default';
    }
  };

  const handleStartNet = async (netId: number) => {
    try {
      await netApi.start(netId);
      // Navigate to the net view so owner is automatically "joined"
      navigate(`/nets/${netId}`);
    } catch (error) {
      console.error('Failed to start net:', error);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, px: { xs: 1, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant={isMobile ? "h5" : "h4"} component="h1">
          📻 {isMobile ? 'Active' : 'Active Nets'}
        </Typography>
        {!isMobile && (
          <Typography variant="body1" color="text.secondary">
            {isAuthenticated ? (
              `Welcome, ${user?.callsign || user?.name || user?.email}`
            ) : (
              "Welcome! Feel free to look around, and set up an account if you'd like to participate."
            )}
          </Typography>
        )}
      </Box>

      {loading ? (
        <Typography>Loading nets...</Typography>
      ) : nets.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No nets yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first net to get started
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
          {nets.map((net: Net) => (
            <Grid item xs={12} sm={6} md={4} key={net.id} sx={{ display: 'flex' }}>
              <Card sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <CardContent sx={{ flex: 1 }}>
                  {/* Title with Status */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Typography variant="h6" component="h2">
                      {net.name}
                    </Typography>
                    <Chip 
                      label={net.status} 
                      color={getStatusColor(net.status)} 
                      size="small"
                    />
                  </Box>
                  
                  {/* Description */}
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {net.description || 'No description'}
                  </Typography>
                  
                  {/* Info List */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {/* Time info based on status */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccessTimeIcon fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        {net.status === 'closed' && net.closed_at && (
                          <>Closed: {formatDateTime(net.closed_at, user?.prefer_utc || false)}</>
                        )}
                        {net.status === 'active' && net.started_at && (
                          <>Started: {formatDateTime(net.started_at, user?.prefer_utc || false)}</>
                        )}
                        {(net.status === 'draft' || net.status === 'scheduled') && (
                          <>Created: {formatDateTime(net.created_at, user?.prefer_utc || false)}</>
                        )}
                      </Typography>
                    </Box>
                    
                    {/* Frequencies */}
                    {net.frequencies.length > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                        <Typography variant="body2" color="text.secondary">
                          {net.frequencies.map((f: any) => {
                            if (f.frequency) {
                              return f.frequency;
                            } else if (f.network && f.talkgroup) {
                              return `${f.network} TG${f.talkgroup}`;
                            } else if (f.network) {
                              return f.network;
                            }
                            return '';
                          }).filter((s: string) => s).join(', ')}
                        </Typography>
                      </Box>
                    )}
                    
                    {/* Host/NCS */}
                    {net.owner_callsign && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          <strong>NCS:</strong> {net.owner_callsign}
                          {net.owner_name && ` (${net.owner_name})`}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end' }}>
                  {/* Draft net actions */}
                  {net.status === 'draft' && (user?.id === net.owner_id || user?.role === 'admin') && (
                    <>
                      <Tooltip title="Edit net">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/nets/${net.id}/edit`)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Start net">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleStartNet(net.id)}
                        >
                          <PlayArrowIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  
                  {/* Closed net actions */}
                  {net.status === 'closed' && (
                    <>
                      <Tooltip title="Archive net">
                        <IconButton
                          size="small"
                          onClick={() => console.log('Archive net', net.id)}
                        >
                          <ArchiveIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Export log">
                        <IconButton
                          size="small"
                          onClick={() => console.log('Export net', net.id)}
                        >
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                      {user?.role === 'admin' && (
                        <Tooltip title="Delete net">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => console.log('Delete net', net.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </>
                  )}
                  
                  {/* View - always available */}
                  <Tooltip title="View net">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => navigate(`/nets/${net.id}`)}
                    >
                      <SearchIcon />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {isAuthenticated && (
        <Fab
          color="primary"
          aria-label="create net"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => navigate('/nets/create')}
        >
          <AddIcon />
        </Fab>
      )}
    </Container>
  );
};

export default Dashboard;
