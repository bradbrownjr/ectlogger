import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { checkInApi } from '../../services/api';

// ========== EDIT OWN TOPIC OF THE WEEK ANSWER ==========
// Lets the checked-in station change the topic_response it gave at check-in.
// CheckInFormDialog only ever offers the field once, during check-in itself
// (docs: CheckInFormDialog.tsx line ~233) - this reuses the same PUT
// /check-ins/{id} endpoint, which already allows a station to edit its own
// check-in unconditionally (check_ins.py::update_check_in, is_own_check_in).

interface EditTopicResponseDialogProps {
  open: boolean;
  onClose: () => void;
  checkInId: number;
  currentResponse: string | null | undefined;
  topicPrompt: string;
  onSaved: (newResponse: string) => void;
  onToast: (message: string) => void;
}

const EditTopicResponseDialog: React.FC<EditTopicResponseDialogProps> = ({
  open,
  onClose,
  checkInId,
  currentResponse,
  topicPrompt,
  onSaved,
  onToast,
}) => {
  const [response, setResponse] = useState(currentResponse || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await checkInApi.update(checkInId, { topic_response: response });
      onSaved(response);
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      onToast(typeof detail === 'string' ? detail : 'Failed to save topic answer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Edit your topic answer</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Topic of the Week: {topicPrompt}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label="Your answer"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditTopicResponseDialog;
