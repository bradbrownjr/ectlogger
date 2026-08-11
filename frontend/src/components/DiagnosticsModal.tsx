import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import DiagnosticsPanel from './DiagnosticsPanel';

// ========== DIAGNOSTICS MODAL ==========
// Wraps DiagnosticsPanel for the Help menu. Lives in Help rather than in
// Profile settings because it is something an operator reaches for at the
// moment something is misbehaving -- the same moment they go looking for the
// User Guide or Submit Feedback -- not a preference they set once.
//
// Deliberately available signed out as well: the environment details it shows
// are exactly what's needed to explain a problem that stops someone getting
// in, and none of them require an account to gather.

interface DiagnosticsModalProps {
  open: boolean;
  onClose: () => void;
}

const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ open, onClose }) => (
  // keepMounted={false} is the default, so the panel remounts on each open and
  // re-reads the environment -- a snapshot taken when the window was a
  // different size would be worse than useless.
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ pb: 1 }}>Diagnostics</DialogTitle>
    <DialogContent>
      <DiagnosticsPanel />
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

export default DiagnosticsModal;
