import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { netApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== EMAIL LOG AGAIN ==========
// Sends a closed net's log again, from the Reports menu (NetViewHeader.tsx),
// built from the log as it stands now (POST /nets/{id}/resend-log). Offered
// to the people who can close the net (actions.close). Distribution list
// shows only when the net has one (NetResponse.has_distribution_list).

export type ResendLogAudience = 'me' | 'subscribers' | 'list';

interface ResendLogDialogProps {
  open: boolean;
  netId: number;
  hasDistributionList: boolean;
  onClose: () => void;
  // The toast NetView shows afterwards
  onDone: (message: string) => void;
}

const SENT_MESSAGE: Record<ResendLogAudience, string> = {
  me: 'Net log sent to you.',
  subscribers: 'Net log sent to the subscribers.',
  list: 'Net log sent to the distribution list.',
};

const ResendLogDialog: React.FC<ResendLogDialogProps> = ({ open, netId, hasDistributionList, onClose, onDone }) => {
  const [to, setTo] = useState<ResendLogAudience>('me');
  const [sending, setSending] = useState(false);

  // Each opening starts from Me
  useEffect(() => {
    if (open) setTo('me');
  }, [open]);

  const handleSend = async () => {
    setSending(true);
    try {
      await netApi.resendLog(netId, to);
      onDone(SENT_MESSAGE[to]);
      onClose();
    } catch (error: any) {
      onDone(getErrorMessage(error, 'The log could not be sent'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={sending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Email log again</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Sends the net's log as it stands now.
        </Typography>
        <RadioGroup value={to} onChange={(e) => setTo(e.target.value as ResendLogAudience)}>
          <FormControlLabel value="me" control={<Radio />} label="Me" />
          <FormControlLabel value="subscribers" control={<Radio />} label="Subscribers" />
          {/* Shows when the net has a distribution list */}
          {hasDistributionList && (
            <FormControlLabel value="list" control={<Radio />} label="Distribution list" />
          )}
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>Cancel</Button>
        <Button variant="contained" onClick={handleSend} disabled={sending}>Send</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ResendLogDialog;
