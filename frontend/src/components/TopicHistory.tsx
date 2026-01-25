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
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon />
          <Typography variant="h6">
            Prior Topics - {templateName}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
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
