import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlaceIcon from '@mui/icons-material/Place';
import VideocamIcon from '@mui/icons-material/Videocam';
import { useAuth } from '../contexts/AuthContext';
import { TrainingSession, trainingApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import {
  formatSessionRange,
  fromLocalInput,
  isWebUrl,
  toLocalInput,
} from '../utils/trainingSessions';
import MarkdownRender from './shared/MarkdownRender';

// ========== TRAINING DIALOG ==========
// Help > Training. Lists the training sessions an admin has posted that are
// not over yet, with links to the written training materials and the YouTube
// channel. Open to guests; a session's online meeting link is only sent to
// signed-in viewers (backend routers/training.py), so a guest is told to sign
// in. Admins add, edit and delete sessions here, with no separate admin page.

interface TrainingDialogProps {
  open: boolean;
  onClose: () => void;
}

const MATERIALS_URL = 'https://ectlogger.us/docs/training/';
const YOUTUBE_URL = 'https://www.youtube.com/@ectlogger';

// The add / edit form. Times are datetime-local values on the viewer's clock.
interface Draft {
  id: number | null;
  title: string;
  starts: string;
  ends: string;
  location: string;
  online_url: string;
  details: string;
}

const emptyDraft = (): Draft => ({ id: null, title: '', starts: '', ends: '', location: '', online_url: '', details: '' });

const draftFrom = (s: TrainingSession): Draft => ({
  id: s.id,
  title: s.title,
  starts: toLocalInput(s.starts_at),
  ends: s.ends_at ? toLocalInput(s.ends_at) : '',
  location: s.location || '',
  online_url: s.online_url || '',
  details: s.details || '',
});

/** The first thing wrong with the form, or '' when it can be saved. */
const draftProblem = (d: Draft): string => {
  if (!d.title.trim()) return 'Enter a title.';
  if (!d.starts) return 'Enter when the session starts.';
  if (d.ends && new Date(d.ends).getTime() <= new Date(d.starts).getTime()) return 'The end time must be after the start time.';
  if (d.online_url.trim() && !isWebUrl(d.online_url)) return 'The online meeting link must start with http:// or https://.';
  return '';
};

const TrainingDialog: React.FC<TrainingDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, isAuthenticated } = useAuth();
  // "View as Regular User" makes user.role 'user', so the editing controls follow it
  const isAdmin = user?.role === 'admin';

  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TrainingSession | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const { data } = await trainingApi.list();
      setSessions(data);
    } catch (err) {
      setError(getErrorMessage(err, 'The training sessions could not be loaded.'));
    }
  }, []);

  // Load on every open (and after signing in), so a session posted or ended since is current
  useEffect(() => {
    if (open) fetchSessions();
  }, [open, isAuthenticated, fetchSessions]);

  // Each open starts without a half-filled form or an old message
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setDeleting(null);
      setError('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!draft) return;
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const payload = {
      title: draft.title.trim(),
      starts_at: fromLocalInput(draft.starts),
      ends_at: draft.ends ? fromLocalInput(draft.ends) : null,
      location: draft.location.trim() || null,
      online_url: draft.online_url.trim() || null,
      details: draft.details.trim() || null,
    };
    setSaving(true);
    setError('');
    try {
      await (draft.id ? trainingApi.update(draft.id, payload) : trainingApi.create(payload));
      setDraft(null);
      await fetchSessions();
    } catch (err) {
      setError(getErrorMessage(err, 'The session could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError('');
    try {
      await trainingApi.remove(deleting.id);
      setDeleting(null);
      await fetchSessions();
    } catch (err) {
      setError(getErrorMessage(err, 'The session could not be removed.'));
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ pr: 6 }}>
          Training
          <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" paragraph>
            Training materials and videos are still being developed. More are on the way.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

          {/* ========== TRAINING LINKS ========== */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            <Button
              variant="outlined"
              component="a"
              href={MATERIALS_URL}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              sx={{ minHeight: 44 }}
            >
              Training materials
            </Button>
            <Button
              variant="outlined"
              component="a"
              href={YOUTUBE_URL}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              sx={{ minHeight: 44 }}
            >
              YouTube channel
            </Button>
          </Box>

          {/* ========== UPCOMING SESSIONS ========== */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">Upcoming sessions</Typography>
            {/* Admin only: post a session */}
            {isAdmin && !draft && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDraft(emptyDraft())} sx={{ minHeight: 44 }}>
                Add session
              </Button>
            )}
          </Box>

          {/* ========== ADD / EDIT FORM (admin only) ========== */}
          {isAdmin && draft && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Stack spacing={2}>
                <TextField
                  label="Title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  size="small"
                  required
                  inputProps={{ maxLength: 200 }}
                />
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  <TextField
                    label="Starts"
                    type="datetime-local"
                    value={draft.starts}
                    onChange={(e) => setDraft({ ...draft, starts: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    required
                  />
                  <TextField
                    label="Ends"
                    type="datetime-local"
                    value={draft.ends}
                    onChange={(e) => setDraft({ ...draft, ends: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    helperText="Optional. With no end time, it stays listed 2 hours."
                    size="small"
                  />
                </Box>
                <TextField
                  label="Location"
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  size="small"
                  inputProps={{ maxLength: 300 }}
                />
                <TextField
                  label="Online meeting link"
                  value={draft.online_url}
                  onChange={(e) => setDraft({ ...draft, online_url: e.target.value })}
                  placeholder="https://"
                  helperText="Shown to signed-in users only."
                  size="small"
                  inputProps={{ maxLength: 500 }}
                />
                <TextField
                  label="Details"
                  value={draft.details}
                  onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                  helperText="Optional. Markdown is supported."
                  size="small"
                  multiline
                  minRows={3}
                  inputProps={{ maxLength: 4000 }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="outlined" color="inherit" onClick={() => { setDraft(null); setError(''); }} disabled={saving} sx={{ minHeight: 44 }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSave}
                    disabled={saving || !!draftProblem(draft)}
                    startIcon={saving ? <CircularProgress size={20} /> : undefined}
                    sx={{ minHeight: 44 }}
                  >
                    {draft.id ? 'Save changes' : 'Add session'}
                  </Button>
                </Box>
              </Stack>
            </Paper>
          )}

          {sessions === null && !error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={28} /></Box>
          )}

          {sessions !== null && sessions.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No training sessions are scheduled right now.
            </Typography>
          )}

          {/* One card per session, soonest first (the server sorts them) */}
          <Stack spacing={1.5}>
            {sessions?.map((s) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ overflowWrap: 'anywhere' }}>{s.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatSessionRange(s.starts_at, s.ends_at)}
                    </Typography>
                  </Box>
                  {/* Admin only: edit and delete this session */}
                  {isAdmin && (
                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                      <Tooltip title="Edit session">
                        <IconButton aria-label="Edit session" onClick={() => { setDraft(draftFrom(s)); setError(''); }} sx={{ width: 44, height: 44 }}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete session">
                        <IconButton aria-label="Delete session" color="error" onClick={() => setDeleting(s)} sx={{ width: 44, height: 44 }}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>

                {s.location && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <PlaceIcon fontSize="small" color="action" />
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{s.location}</Typography>
                  </Box>
                )}

                {s.details && (
                  <MarkdownRender content={s.details} emptyText="" sx={{ mt: 1, fontSize: '0.875rem', overflowWrap: 'anywhere' }} />
                )}

                {/* The link goes to signed-in viewers only; a guest is told one exists */}
                {s.online_url && (
                  <Button
                    variant="contained"
                    color="primary"
                    component="a"
                    href={s.online_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    startIcon={<VideocamIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                    sx={{ mt: 1.5, minHeight: 44 }}
                  >
                    Join online
                  </Button>
                )}
                {!s.online_url && s.has_online_link && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Sign in to see the online meeting link.
                  </Typography>
                )}
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} sx={{ minHeight: 44 }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ========== DELETE CONFIRMATION (admin only) ========== */}
      <Dialog open={!!deleting} onClose={() => !saving && setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleting ? `"${deleting.title}" will be removed from the list for everyone.` : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" color="inherit" onClick={() => setDeleting(null)} disabled={saving} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : undefined}
            sx={{ minHeight: 44 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TrainingDialog;
