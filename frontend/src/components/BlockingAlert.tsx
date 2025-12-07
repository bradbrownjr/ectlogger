import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface BlockingAlertProps {
  open: boolean;
  onClose: () => void;
  message: string;
  title?: string;
  severity?: 'error' | 'warning' | 'info' | 'success';
}

const severityConfig = {
  error: {
    icon: ErrorIcon,
    color: 'error.main',
    bgColor: 'error.dark',
    title: 'Error',
  },
  warning: {
    icon: WarningIcon,
    color: 'warning.main',
    bgColor: 'warning.dark',
    title: 'Warning',
  },
  info: {
    icon: InfoIcon,
    color: 'info.main',
    bgColor: 'info.dark',
    title: 'Notice',
  },
  success: {
    icon: CheckCircleIcon,
    color: 'success.main',
    bgColor: 'success.dark',
    title: 'Success',
  },
};

const BlockingAlert: React.FC<BlockingAlertProps> = ({
  open,
  onClose,
  message,
  title,
  severity = 'error',
}) => {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: 4,
          borderColor: config.color,
        },
      }}
    >
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Icon sx={{ fontSize: 40, color: config.color, flexShrink: 0, mt: 0.5 }} />
          <Box>
            <Typography variant="h6" gutterBottom>
              {title || config.title}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {message}
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          color={severity === 'success' ? 'success' : severity === 'warning' ? 'warning' : severity === 'info' ? 'info' : 'primary'}
          startIcon={<CheckCircleIcon />}
          autoFocus
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BlockingAlert;
