import React from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSnackbar } from 'notistack';

interface ShareLinkFieldProps {
  link: string;
  label: string;
  hint?: string;
  copiedMessage: string;
}

// ========== SHARE LINK ==========
// A read-only link with a Copy button. Used for the subscribe link (Staff >
// Subscribers, the schedule editor) and the schedule home page's own links,
// so every link staff copy looks and behaves the same.

const ShareLinkField: React.FC<ShareLinkFieldProps> = ({ link, label, hint, copiedMessage }) => {
  const { enqueueSnackbar } = useSnackbar();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      enqueueSnackbar(copiedMessage, { variant: 'success' });
    } catch {
      enqueueSnackbar("Couldn't copy automatically. Select the link and copy it manually.", { variant: 'error' });
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      {/* Shows only when the field needs more than its label */}
      {hint && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          value={link}
          size="small"
          label={label}
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

export default ShareLinkField;
