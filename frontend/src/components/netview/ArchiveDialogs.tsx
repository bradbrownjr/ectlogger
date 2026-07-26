import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Snackbar,
  SnackbarContent,
  IconButton,
  Tooltip,
} from '@mui/material';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteIcon from '@mui/icons-material/Delete';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { UseDialogResult } from '../../hooks/useDialog';

// ========== ARCHIVE DIALOGS ==========
// The post-close archive cluster: the "please archive" reminder snackbar, the
// Archive-vs-Delete explainer, and the delete confirmation. Extracted verbatim
// from NetView; the parent owns the dialog flags and the archive/delete actions.

interface ArchiveDialogsProps {
  netName: string | undefined;
  archiveReminder: UseDialogResult;
  archiveHelp: UseDialogResult;
  archiveDeleteConfirm: UseDialogResult;
  onArchive: () => void;
  onDeleteConfirmed: () => void | Promise<void>;
}

const ArchiveDialogs: React.FC<ArchiveDialogsProps> = ({
  netName,
  archiveReminder,
  archiveHelp,
  archiveDeleteConfirm,
  onArchive,
  onDeleteConfirmed,
}) => {
  return (
    <>
      {/* ========== ARCHIVE REMINDER SNACKBAR ========== */}
      {/* Shown to net managers after closing a net, offering archive or delete */}
      <Snackbar
        open={archiveReminder.open}
        autoHideDuration={null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <SnackbarContent
          message={
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" component="span">
                  Net closed - Please archive it when you're done to hide it from the Active Nets dashboard and preserve your log and statistics.
                </Typography>
                <Tooltip title="What's the difference between archive and delete?">
                  <IconButton size="small" color="inherit" onClick={() => archiveHelp.onOpen()} sx={{ ml: 1, mt: -0.5, flexShrink: 0 }}>
                    <HelpOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" variant="contained" color="error" onClick={() => archiveDeleteConfirm.onOpen()}>
                  Delete
                </Button>
                <Button size="small" variant="contained" color="success" onClick={() => { archiveReminder.onClose(); onArchive(); }}>
                  Archive Now
                </Button>
                <Button size="small" variant="contained" color="primary" onClick={archiveReminder.onClose}>
                  Dismiss
                </Button>
              </Box>
            </Box>
          }
        />
      </Snackbar>

      {/* ========== ARCHIVE vs DELETE HELP DIALOG ========== */}
      <Dialog
        open={archiveHelp.open}
        onClose={archiveHelp.onClose}
        maxWidth="sm"
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle>Archive vs. Delete</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom sx={{ color: 'success.main', fontWeight: 'bold' }}>
            Archive (recommended)
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Archiving hides the net from the active list but preserves everything: all check-ins, chat
            messages, statistics, and PDF reports. Archived nets are fully searchable in the Archived
            Nets list and remain available in net history. You can unarchive at any time.
          </Typography>
          <Typography variant="subtitle2" gutterBottom sx={{ color: 'error.main', fontWeight: 'bold' }}>
            Delete (permanent)
          </Typography>
          <Typography variant="body2">
            Deleting permanently removes the net and all its data — check-ins, chat, and statistics —
            with no way to recover it. Use this only for test runs or entries you never want stored.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={archiveHelp.onClose} variant="contained">Got It</Button>
        </DialogActions>
      </Dialog>

      {/* ========== DELETE CONFIRMATION FROM ARCHIVE REMINDER ========== */}
      <Dialog
        open={archiveDeleteConfirm.open}
        onClose={archiveDeleteConfirm.onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Delete "{netName}"?
            <Tooltip title="Learn about archive vs. delete">
              <IconButton size="small" onClick={() => archiveHelp.onOpen()}>
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Deleting this net will <strong>permanently remove</strong> every record tied to it, including:
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
            <li><Typography variant="body2">All check-ins logged during this net</Typography></li>
            <li><Typography variant="body2">All chat messages sent in this net</Typography></li>
            <li><Typography variant="body2">Net statistics and history for this session</Typography></li>
          </Box>
          <Typography color="error" sx={{ mb: 2, fontWeight: 'bold' }}>
            This cannot be undone.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            If you only want to hide this net from the active list while keeping the log, choose
            <strong> Archive Instead</strong>. Archived nets stay searchable in the Archived Nets
            list and can be restored at any time.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={archiveDeleteConfirm.onClose}
            variant="contained"
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              archiveDeleteConfirm.onClose();
              archiveReminder.onClose();
              onArchive();
            }}
            variant="contained"
            color="warning"
            startIcon={<ArchiveIcon />}
          >
            Archive Instead
          </Button>
          <Button
            onClick={async () => {
              archiveDeleteConfirm.onClose();
              archiveReminder.onClose();
              await onDeleteConfirmed();
            }}
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
          >
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ArchiveDialogs;
