import React from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSnackbar } from 'notistack';
import { subscribeLink } from '../../utils/subscribeLink';

interface SubscribeLinkFieldProps {
  scheduleId: number | string;
}

// ========== SUBSCRIBE LINK ==========
// The link staff share so people can subscribe to this schedule. Shared by
// the Staff dialog's Subscribers tab and the schedule editor's Net Staff
// tab, so it looks and behaves the same in both.

const SubscribeLinkField: React.FC<SubscribeLinkFieldProps> = ({ scheduleId }) => {
  const { enqueueSnackbar } = useSnackbar();
  const link = subscribeLink(scheduleId);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      enqueueSnackbar('Subscribe link copied', { variant: 'success' });
    } catch {
      enqueueSnackbar("Couldn't copy automatically. Select the link and copy it manually.", { variant: 'error' });
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Share this link to invite people to subscribe. They sign in first if they need to.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          value={link}
          size="small"
          label="Subscribe link"
          // Select-all on focus: the manual fallback when the clipboard is blocked
          onFocus={(e) => e.target.select()}
          InputProps={{ readOnly: true }}
          sx={{ flex: '1 1 240px' }}
        />
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopy}
          sx={{ minHeight: 44 }}
        >
          Copy link
        </Button>
      </Box>
    </Box>
  );
};

export default SubscribeLinkField;
