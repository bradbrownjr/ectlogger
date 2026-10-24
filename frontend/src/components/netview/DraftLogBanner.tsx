import React, { useState } from 'react';
import {
  Alert, AlertTitle, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { DRAFT_LOG_NOTICE } from '../../utils/netLog';

interface DraftLogBannerProps {
  // Net control (actions.close) gets Send the log; everyone else the notice.
  canSend: boolean;
  onSendLog: () => Promise<void>;
}

// ========== DRAFT LOG BANNER ==========
// Shown on a net closed with "Finish the log later" (utils/netLog.ts::isLogHeld)
// until its log is sent. Not dismissible: it is the only way to send it.
const DraftLogBanner: React.FC<DraftLogBannerProps> = ({ canSend, onSendLog }) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await onSendLog();
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Alert
        variant="filled"
        severity="info"
        icon={<EditNoteIcon fontSize="inherit" />}
        action={canSend ? (
          <Button color="inherit" variant="outlined" size="small" onClick={() => setConfirmOpen(true)}
            sx={{ whiteSpace: 'nowrap', alignSelf: 'center' }}>
            Send the log
          </Button>
        ) : undefined}
        sx={{ mb: 1, '& .MuiAlert-message': { flexGrow: 1 } }}
        data-testid="draft-log-banner"
      >
        {canSend ? (
          <>
            <AlertTitle sx={{ mb: 0 }}>The log hasn't been sent</AlertTitle>
            This net is closed. Add offline logs and fix entries, then send the log. Until then the
            report is a draft and the net can't be archived.
          </>
        ) : <><strong>Draft copy.</strong> {DRAFT_LOG_NOTICE}</>}
      </Alert>

      {/* Confirms before the closing email goes out, since it can't be recalled */}
      <Dialog open={confirmOpen} onClose={() => !sending && setConfirmOpen(false)}>
        <DialogTitle>Send the log?</DialogTitle>
        <DialogContent>
          <Typography>
            The closing email and ICS-309 go to subscribers and net control, built from the log as it is now.
            The report stops being a draft, and the net can then be archived.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} variant="contained" disabled={sending}>Send the log</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DraftLogBanner;
