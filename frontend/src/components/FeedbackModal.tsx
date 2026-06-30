import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  Box,
  Typography,
} from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { feedbackApi } from '../services/api';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose }) => {
  const [type, setType] = useState<'bug' | 'feature'>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setSuccess(false);
    setError(null);
    setSubject('');
    setBody('');
    setType('bug');
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await feedbackApi.submit({ type, subject, body });
      setSuccess(true);
    } catch (e: any) {
      if (e.response?.status === 429) {
        setError('Too many submissions. Please wait before trying again.');
      } else {
        setError('Failed to submit feedback. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 10 && !submitting;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Submit Feedback</DialogTitle>
      <DialogContent>
        {success ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Thank you! Your feedback has been sent to the administrator.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Feedback type
              </Typography>
              <ToggleButtonGroup
                value={type}
                exclusive
                onChange={(_, v) => { if (v) setType(v); }}
                size="small"
              >
                <ToggleButton value="bug">
                  <BugReportIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  Bug Report
                </ToggleButton>
                <ToggleButton value="feature">
                  <LightbulbIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  Feature Request
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ maxLength: 200 }}
            />
            <TextField
              label="Description"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              fullWidth
              multiline
              rows={5}
              inputProps={{ maxLength: 5000 }}
              helperText={`${body.length} / 5000`}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          {success ? 'Close' : 'Cancel'}
        </Button>
        {!success && (
          <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit}>
            {submitting ? 'Sending…' : 'Submit'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default FeedbackModal;
