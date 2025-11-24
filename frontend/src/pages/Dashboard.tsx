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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { netApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  owner_id: number;
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
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          📻 Net Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome, {user?.callsign || user?.name || user?.email}
        </Typography>
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
        <Grid container spacing={3}>
          {nets.map((net: Net) => (
            <Grid item xs={12} sm={6} md={4} key={net.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h6" component="h2">
                      {net.name}
                    </Typography>
                    <Chip 
                      label={net.status} 
                      color={getStatusColor(net.status)} 
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {net.description || 'No description'}
                  </Typography>
                  {(net.status === 'closed' && net.closed_at) && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                      Closed: {new Date(net.closed_at).toLocaleString()}
                    </Typography>
                  )}
                  {(net.status === 'active' && net.started_at) && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                      Started: {new Date(net.started_at).toLocaleString()}
                    </Typography>
                  )}
                  {(net.status === 'draft' || net.status === 'scheduled') && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                      Created: {new Date(net.created_at).toLocaleString()}
                    </Typography>
                  )}
                  {net.frequencies.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Frequencies: {net.frequencies.map((f: any) => {
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
                  )}
                </CardContent>
                <CardActions>
                  {net.status === 'draft' && (user?.id === net.owner_id || user?.role === 'admin') && (
                    <>
                      <Button
                        size="small"
                        onClick={() => navigate(`/nets/${net.id}/edit`)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        onClick={() => handleStartNet(net.id)}
                      >
                        Start Net
                      </Button>
                    </>
                  )}
                  <Button size="small" onClick={() => navigate(`/nets/${net.id}`)}>
                    View
                  </Button>
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
