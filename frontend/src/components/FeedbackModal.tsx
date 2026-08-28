import React, { useEffect, useRef, useState } from 'react';
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
  Checkbox,
  FormControlLabel,
  IconButton,
  Typography,
} from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CloseIcon from '@mui/icons-material/Close';
import { feedbackApi } from '../services/api';
import { formatDiagnostics } from '../utils/clientDiagnostics';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

// Kept in sync with backend/app/routers/feedback.py's ALLOWED_SCREENSHOT_MIME_TYPES
// and MAX_SCREENSHOT_BYTES -- rejecting client-side gives an instant error
// instead of a round trip, but the backend re-checks both since this is a
// network boundary.
const ALLOWED_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const FeedbackModal: React.FC<FeedbackModalProps> = ({ open, onClose }) => {
  const [type, setType] = useState<'bug' | 'feature'>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [issueNumber, setIssueNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default the checkbox for the recommended case (bug reports) without
  // clobbering it if the reporter has already made their own choice for the
  // currently-selected type.
  useEffect(() => {
    setIncludeDiagnostics(type === 'bug');
  }, [type]);

  // Revoke the object URL when it's replaced or the modal unmounts, so we
  // don't leak blob URLs across repeated open/attach/remove cycles.
  useEffect(() => {
    return () => {
      if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    };
  }, [screenshotPreviewUrl]);

  const handleClose = () => {
    if (submitting) return;
    setSuccess(false);
    setIssueUrl(null);
    setIssueNumber(null);
    setError(null);
    setSubject('');
    setBody('');
    setType('bug');
    setScreenshot(null);
    setScreenshotPreviewUrl(null);
    setScreenshotError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after removing it
    if (!file) return;
    setScreenshotError(null);
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      setScreenshotError('Unsupported image type — use PNG, JPEG, WebP, or GIF.');
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshotError('Screenshot is too large (max 5 MB).');
      return;
    }
    setScreenshot(file);
    setScreenshotPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreviewUrl(null);
    setScreenshotError(null);
  };

  /** Reads the attached file as base64, stripped of its data: URL prefix. */
  const readScreenshotAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: Parameters<typeof feedbackApi.submit>[0] = { type, subject, body };
      if (includeDiagnostics) {
        payload.diagnostics = formatDiagnostics();
      }
      if (screenshot) {
        payload.screenshot_data = await readScreenshotAsBase64(screenshot);
        payload.screenshot_filename = screenshot.name;
        payload.screenshot_mime = screenshot.type;
      }
      const response = await feedbackApi.submit(payload);
      setIssueUrl(response.data?.github_issue_url || null);
      setIssueNumber(response.data?.github_issue_number ?? null);
      setSuccess(true);
    } catch (e: any) {
      if (e.response?.status === 429) {
        setError('Too many submissions. Please wait before trying again.');
      } else if (e.response?.status === 400) {
        setError(e.response?.data?.detail || 'Failed to submit feedback. Please try again.');
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
            {issueUrl && (
              <>
                {' '}You can track it as{' '}
                <a href={issueUrl} target="_blank" rel="noopener noreferrer">
                  issue {issueNumber ? `#${issueNumber}` : ''}
                </a>{' '}
                on GitHub.
              </>
            )}
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

            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeDiagnostics}
                    onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                  />
                }
                label="Include diagnostics (browser, screen size, recent errors)"
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mt: -0.5 }}>
                No callsigns, names, locations, or net activity — environment details only.
              </Typography>
            </Box>

            <Box>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_SCREENSHOT_TYPES.join(',')}
                onChange={handleScreenshotChange}
                style={{ display: 'none' }}
              />
              {screenshotError && (
                <Alert severity="error" sx={{ mb: 1 }} onClose={() => setScreenshotError(null)}>
                  {screenshotError}
                </Alert>
              )}
              {screenshotPreviewUrl ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    component="img"
                    src={screenshotPreviewUrl}
                    alt="Screenshot preview"
                    sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                  />
                  <Typography variant="body2" sx={{ flexGrow: 1, overflowWrap: 'anywhere' }}>
                    {screenshot?.name}
                  </Typography>
                  <IconButton aria-label="remove screenshot" size="small" onClick={handleRemoveScreenshot}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddPhotoAlternateIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Attach a Screenshot
                </Button>
              )}
            </Box>
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
