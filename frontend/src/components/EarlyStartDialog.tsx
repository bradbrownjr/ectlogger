import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { formatDateTime } from '../utils/dateUtils';

// ========== START NET EARLY CONFIRMATION ==========
// Shown when Start net is clicked before the net's scheduled start time
// (utils/netStart.ts::isBeforeScheduledStart), on the net page and on the
// Dashboard. Start net used to open the lobby in that case, so a manager used
// to that gets the lobby one click away instead of an early start by habit.

interface EarlyStartDialogProps {
  open: boolean;
  scheduledStartTime: string | null | undefined;
  preferUtc: boolean;
  onClose: () => void;
  onOpenLobby: () => void;
  onStartNow: () => void;
}

const EarlyStartDialog: React.FC<EarlyStartDialogProps> = ({
  open,
  scheduledStartTime,
  preferUtc,
  onClose,
  onOpenLobby,
  onStartNow,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
    <DialogTitle>Start the net early?</DialogTitle>
    <DialogContent>
      <Typography sx={{ mb: 2 }}>
        This net is scheduled to start at{' '}
        <strong>{scheduledStartTime ? formatDateTime(scheduledStartTime, preferUtc) : 'a later time'}</strong>.
        Starting it now begins the net immediately.
      </Typography>
      <Typography color="text.secondary">
        Open the lobby instead to let stations check in and chat until the scheduled start.
      </Typography>
    </DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
      <Button onClick={onClose} color="inherit">Cancel</Button>
      <Button onClick={onOpenLobby} variant="outlined">Open lobby</Button>
      <Button onClick={onStartNow} variant="contained" color="success">Start net now</Button>
    </DialogActions>
  </Dialog>
);

export default EarlyStartDialog;
