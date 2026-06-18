import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  TextField,
  Collapse,
  InputAdornment,
  Pagination,
  Divider,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import api from '../services/api';

const PAGE_SIZE = 25;

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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open && templateId) {
      loadTopicHistory();
    }
  }, [open, templateId]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadTopicHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/templates/${templateId}/topic-history`);
      setTopics(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load topic history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

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
      setError(err.response?.data?.detail || 'Failed to add topic');
    } finally {
      setSaving(false);
    }
  };

  // Client-side filter and paginate
  const filtered = topics.filter(t =>
    t.topic.toLowerCase().includes(search.toLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            <Typography variant="h6">Prior Topics — {templateName}</Typography>
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
        {/* ========== ADD FORM ========== */}
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
                onClick={() => { setShowAddForm(false); setNewTopic(''); setError(null); }}
                size="small"
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </Collapse>

        {/* ========== SEARCH BAR ========== */}
        {!loading && !error && topics.length > 0 && (
          <TextField
            fullWidth
            size="small"
            placeholder="Search topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        )}

        {/* ========== TOPIC LIST ========== */}
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
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No topics match "{search}".
            </Typography>
          </Box>
        ) : (
          <Box>
            {paginated.map((topic, index) => (
              <React.Fragment key={topic.id}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 2,
                    py: 1.5,
                    px: 1,
                  }}
                >
                  {/* Date stamp — fixed width so topic column aligns */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ flexShrink: 0, width: 100 }}
                  >
                    {formatDate(topic.used_date)}
                  </Typography>
                  <Typography variant="body1">
                    {topic.topic}
                  </Typography>
                </Box>
                {index < paginated.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Box>
        )}
      </DialogContent>

      {/* ========== FOOTER: PAGINATION + CLOSE ========== */}
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5 }}>
        {pageCount > 1 ? (
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_e, value) => setPage(value)}
            size="small"
            color="primary"
          />
        ) : (
          // Result count when no pagination needed
          !loading && !error && filtered.length > 0 ? (
            <Typography variant="body2" color="text.secondary">
              {filtered.length} {filtered.length === 1 ? 'topic' : 'topics'}
              {search ? ` matching "${search}"` : ''}
            </Typography>
          ) : (
            <Box />
          )
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TopicHistory;
