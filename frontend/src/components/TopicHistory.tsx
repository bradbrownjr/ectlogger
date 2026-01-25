import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  Box,
  CircularProgress,
  Alert,
  TextField,
  IconButton,
  Collapse,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import api from '../services/api';

interface TopicHistoryEntry {
  id: number;
  topic: string;
  used_date: string;
  net_id?: number;
}

interface TopicHistoryProps {
  open: boolean;
  onClose: () => void;
  templateId: number;
  templateName: string;
}

const TopicHistory: React.FC<TopicHistoryProps> = ({
  open,
  onClose,
  templateId,
  templateName,
}) => {
  const [topics, setTopics] = useState<TopicHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newTopicDate, setNewTopicDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && templateId) {
      loadTopicHistory();
    }
  }, [open, templateId]);

  const loadTopicHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/templates/${templateId}/topic-history`);
      setTopics(response.data);
    } catch (err: any) {
      console.error('Failed to load topic history:', err);
      setError(err.response?.data?.detail || 'Failed to load topic history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleAddTopic = async () => {
    if (!newTopic.trim()) return;
    
    setSaving(true);
    setError(null);
    try {
      await api.post(`/templates/${templateId}/topic-history`, {
        topic: newTopic,
        used_date: new Date(newTopicDate).toISOString(),
      });
      setNewTopic('');
      setNewTopicDate(new Date().toISOString().split('T')[0]);
      setShowAddForm(false);
      await loadTopicHistory();
    } catch (err: any) {
      console.error('Failed to add topic:', err);
      setError(err.response?.data?.detail || 'Failed to add topic');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            <Typography variant="h6">
              Prior Topics - {templateName}
            </Typography>
          </Box>
          <Button
            startIcon={<AddIcon />}
            size="small"
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? 'contained' : 'outlined'}
          >
            Add Historical Topic
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Collapse in={showAddForm}>
          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Add a historical topic (for nets run before ECTLogger)
            </Typography>
            <TextField
              fullWidth
              label="Topic"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="What was your favorite radio moment this year?"
              sx={{ mt: 1, mb: 2 }}
              multiline
              rows={2}
            />
            <TextField
              type="date"
              label="Date Used"
              value={newTopicDate}
              onChange={(e) => setNewTopicDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                onClick={handleAddTopic}
                disabled={!newTopic.trim() || saving}
                variant="contained"
                size="small"
              >
                {saving ? 'Adding...' : 'Add Topic'}
              </Button>
              <Button
                onClick={() => {
                  setShowAddForm(false);
                  setNewTopic('');
                  setError(null);
                }}
                size="small"
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </Collapse>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : topics.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No topics have been used for this net yet.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Topics are logged when a net closes with the "Topic of the Week" feature enabled.
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {topics.map((topic, index) => (
              <ListItem
                key={topic.id}
                divider={index < topics.length - 1}
                sx={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  py: 2,
                }}
              >
                <ListItemText
                  primary={topic.topic}
                  primaryTypographyProps={{
                    variant: 'body1',
                    fontWeight: 500,
                  }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Used on {formatDate(topic.used_date)}
                </Typography>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TopicHistory;
