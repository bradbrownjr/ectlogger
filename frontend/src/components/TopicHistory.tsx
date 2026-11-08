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
  IconButton,
  Tooltip,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import api, { netApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';

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
  // Only staff (owner/admin/NCS/co-manager) may add historical topic
  // entries — everyone else gets a read-only list.
  canManage: boolean;
  // The net the dialog was opened from. Its current topic is shown at the
  // top, so a stale question (one inherited from the schedule) is obvious,
  // and whoever may edit the net can set it here: this is where net control
  // goes looking for it (Brad, 2026-11-08, after KC1UIX couldn't find where
  // to change the ME Dirigo Net's question).
  netId: number;
  netTopicEnabled: boolean;
  netTopic: string | null | undefined;
  // permissions.may_edit_net (net manager or active NCS), the rule the
  // server applies to PUT /nets/{id}.
  canSetNetTopic: boolean;
  onNetTopicSaved: () => void;
}

const TopicHistory: React.FC<TopicHistoryProps> = ({
  open,
  onClose,
  templateId,
  templateName,
  canManage,
  netId,
  netTopicEnabled,
  netTopic,
  canSetNetTopic,
  onNetTopicSaved,
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editDate, setEditDate] = useState('');
  const [showNetTopicForm, setShowNetTopicForm] = useState(false);
  const [netTopicDraft, setNetTopicDraft] = useState('');

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
      setError(getErrorMessage(err, 'Failed to load topic history'));
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
      setError(getErrorMessage(err, 'Failed to add topic'));
    } finally {
      setSaving(false);
    }
  };

  // ---- This net's topic ----
  // Saved on the net itself (PUT /nets/{id}), which also records it in the
  // schedule's topic history, so the list below picks it up on reload.
  const handleToggleNetTopicForm = () => {
    if (!showNetTopicForm) {
      setNetTopicDraft(netTopic || '');
      setShowAddForm(false);
    }
    setShowNetTopicForm(!showNetTopicForm);
  };

  const handleSaveNetTopic = async () => {
    setSaving(true);
    setError(null);
    try {
      await netApi.update(netId, { topic_of_week_prompt: netTopicDraft.trim() || null });
      setShowNetTopicForm(false);
      onNetTopicSaved();
      await loadTopicHistory();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to save the topic'));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (entry: TopicHistoryEntry) => {
    setEditingId(entry.id);
    setEditTopic(entry.topic);
    setEditDate(entry.used_date.split('T')[0]);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTopic('');
    setEditDate('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editTopic.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/templates/${templateId}/topic-history/${editingId}`, {
        topic: editTopic,
        used_date: new Date(editDate).toISOString(),
      });
      handleCancelEdit();
      await loadTopicHistory();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to save topic'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTopic = async (id: number) => {
    if (!confirm('Delete this topic entry?')) return;
    setError(null);
    try {
      await api.delete(`/templates/${templateId}/topic-history/${id}`);
      await loadTopicHistory();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to delete topic'));
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
      {/* ========== HEADER: TITLE + STAFF BUTTONS ==========
          Buttons sit below the title on phones (the title wrapped to a
          narrow column beside them) and beside it from sm up. */}
      <DialogTitle>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            <Typography variant="h6">Prior Topics — {templateName}</Typography>
          </Box>
          {(canSetNetTopic || canManage) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexShrink: 0 }}>
              {/* Shows for net managers and active NCS (may_edit_net) */}
              {canSetNetTopic && (
                <Button
                  startIcon={<EditIcon />}
                  size="small"
                  onClick={handleToggleNetTopicForm}
                  variant={showNetTopicForm ? 'contained' : 'outlined'}
                >
                  Set This Net's Topic
                </Button>
              )}
              {/* Adding historical entries is a staff action — regular
                  participants only get the read-only list below. */}
              {canManage && (
                <Button
                  startIcon={<AddIcon />}
                  size="small"
                  onClick={() => { setShowAddForm(!showAddForm); setShowNetTopicForm(false); }}
                  variant={showAddForm ? 'contained' : 'outlined'}
                >
                  Add Historical Topic
                </Button>
              )}
            </Box>
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* ========== THIS NET'S TOPIC ==========
            Shown to everyone when the net has Topic of the Week on, so anyone
            can see which question tonight's net is asking; the form is for
            may_edit_net only. */}
        {netTopicEnabled && (
        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            This net's topic
          </Typography>
          {showNetTopicForm && canSetNetTopic ? (
            <>
              <TextField
                fullWidth
                label="Topic"
                value={netTopicDraft}
                onChange={(e) => setNetTopicDraft(e.target.value)}
                placeholder="What was your favorite radio moment this year?"
                sx={{ mt: 1, mb: 2 }}
                multiline
                minRows={2}
                autoFocus
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button onClick={handleSaveNetTopic} disabled={saving} variant="contained" size="small">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button onClick={() => setShowNetTopicForm(false)} size="small">
                  Cancel
                </Button>
              </Box>
            </>
          ) : (
            <Typography variant="body1" color={netTopic ? 'text.primary' : 'text.secondary'} sx={{ mt: 0.5 }}>
              {netTopic || 'Not set'}
            </Typography>
          )}
        </Box>
        )}

        {/* ========== ADD FORM (staff only) ========== */}
        <Collapse in={canManage && showAddForm}>
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
              Topics are logged as soon as NCS sets one for a net with "Topic of the Week" enabled, or you can add one below for a future date to plan it ahead of time.
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
                {/* Rows wrap on phones: date and icons on one line, the
                    topic full width under them. One row of three columns
                    left the topic a word wide and pushed the icons off
                    the dialog's edge. */}
                {editingId === topic.id ? (
                  <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'flex-start', gap: { xs: 1, sm: 2 }, py: 1.5, px: 1 }}>
                    <TextField
                      type="date"
                      size="small"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ flexShrink: 0, width: 160 }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      multiline
                      value={editTopic}
                      onChange={(e) => setEditTopic(e.target.value)}
                      sx={{ flex: { xs: '1 1 100%', sm: 1 }, order: { xs: 2, sm: 0 } }}
                    />
                    <Tooltip title="Save">
                      <span>
                        <IconButton size="small" color="primary" disabled={!editTopic.trim() || saving} onClick={handleSaveEdit} sx={{ flexShrink: 0 }}>
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Cancel">
                      <IconButton size="small" onClick={handleCancelEdit} sx={{ flexShrink: 0 }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: { xs: 'wrap', sm: 'nowrap' },
                      alignItems: 'baseline',
                      columnGap: 2,
                      rowGap: 0.5,
                      py: 1.5,
                      px: 1,
                    }}
                  >
                    {/* Date stamp — fixed width so topic column aligns */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ flexShrink: 0, width: { xs: 'auto', sm: 100 }, alignSelf: { xs: 'center', sm: 'baseline' } }}
                    >
                      {formatDate(topic.used_date)}
                    </Typography>
                    <Typography variant="body1" sx={{ flex: { xs: '1 1 100%', sm: 1 }, order: { xs: 2, sm: 0 } }}>
                      {topic.topic}
                    </Typography>
                    <Box sx={{ display: 'flex', flexShrink: 0, ml: { xs: 'auto', sm: 0 } }}>
                    {/* Opens in a new tab so browsing history doesn't lose
                        the visitor's place in the currently-open net. */}
                    {topic.net_id && (
                      <Tooltip title="Open that net in a new tab">
                        <IconButton
                          size="small"
                          component="a"
                          href={`/nets/${topic.net_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ flexShrink: 0 }}
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* Editing/deleting a topic entry is a staff action,
                        same gate as adding one above. */}
                    {canManage && (
                      <>
                        <Tooltip title="Edit topic">
                          <IconButton size="small" onClick={() => handleStartEdit(topic)} sx={{ flexShrink: 0 }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete topic">
                          <IconButton size="small" onClick={() => handleDeleteTopic(topic.id)} sx={{ flexShrink: 0 }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    </Box>
                  </Box>
                )}
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
