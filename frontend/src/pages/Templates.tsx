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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { templateApi, netApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Template {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  is_active: boolean;
  subscriber_count: number;
  frequencies: any[];
}

const Templates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [subscribedTemplates, setSubscribedTemplates] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await templateApi.list();
      setTemplates(response.data);
      
      // Check which templates user is subscribed to (would need separate endpoint)
      // For now, we'll track subscriptions locally
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (templateId: number) => {
    try {
      await templateApi.subscribe(templateId);
      setSubscribedTemplates(prev => new Set(prev).add(templateId));
      fetchTemplates(); // Refresh to update subscriber count
    } catch (error: any) {
      console.error('Failed to subscribe:', error);
      alert(error.response?.data?.detail || 'Failed to subscribe');
    }
  };

  const handleUnsubscribe = async (templateId: number) => {
    try {
      await templateApi.unsubscribe(templateId);
      setSubscribedTemplates(prev => {
        const newSet = new Set(prev);
        newSet.delete(templateId);
        return newSet;
      });
      fetchTemplates(); // Refresh to update subscriber count
    } catch (error: any) {
      console.error('Failed to unsubscribe:', error);
      alert(error.response?.data?.detail || 'Failed to unsubscribe');
    }
  };

  const handleCreateNetFromTemplate = async (templateId: number) => {
    try {
      const response = await templateApi.createNetFromTemplate(templateId);
      const netId = response.data.id;
      navigate(`/nets/${netId}/edit`);
    } catch (error: any) {
      console.error('Failed to create net from template:', error);
      alert(error.response?.data?.detail || 'Failed to create net');
    }
  };

  const handleDelete = async (templateId: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await templateApi.delete(templateId);
      fetchTemplates();
    } catch (error: any) {
      console.error('Failed to delete template:', error);
      alert(error.response?.data?.detail || 'Failed to delete template');
    }
  };

  const isOwner = (template: Template) => user?.id === template.owner_id;
  const isAdmin = user?.role === 'admin';

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          📋 Net Templates
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create reusable templates for recurring nets
        </Typography>
      </Box>

      {loading ? (
        <Typography>Loading templates...</Typography>
      ) : templates.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No templates yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first template to get started
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {templates.map((template: Template) => (
            <Grid item xs={12} sm={6} md={4} key={template.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6" component="h2">
                      {template.name}
                    </Typography>
                    {!template.is_active && (
                      <Chip label="Inactive" color="default" size="small" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {template.description || 'No description'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <NotificationsActiveIcon fontSize="small" color="action" />
                    <Typography variant="caption" color="text.secondary">
                      {template.subscriber_count} subscriber{template.subscriber_count !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  {template.frequencies.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Frequencies: {template.frequencies.map((f: any) => {
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
                <CardActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Box>
                    <Button
                      size="small"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => handleCreateNetFromTemplate(template.id)}
                    >
                      Create Net
                    </Button>
                  </Box>
                  <Box>
                    {subscribedTemplates.has(template.id) ? (
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleUnsubscribe(template.id)}
                        title="Unsubscribe from notifications"
                      >
                        <NotificationsActiveIcon />
                      </IconButton>
                    ) : (
                      <IconButton
                        size="small"
                        onClick={() => handleSubscribe(template.id)}
                        title="Subscribe to notifications"
                      >
                        <NotificationsOffIcon />
                      </IconButton>
                    )}
                    {(isOwner(template) || isAdmin) && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/templates/${template.id}/edit`)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(template.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Fab
        color="primary"
        aria-label="create template"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => navigate('/templates/create')}
      >
        <AddIcon />
      </Fab>
    </Container>
  );
};

export default Templates;
