import React, { useState } from 'react';
import { Box, Button, Snackbar, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { collectDiagnostics, formatDiagnostics } from '../utils/clientDiagnostics';

// ========== DIAGNOSTICS PANEL ==========
// Read-only summary of this browser's environment plus anything the app's own
// self-checks flagged, with a one-click copy for pasting into a support email.
//
// Rendered by DiagnosticsModal (Help menu), which supplies the "Diagnostics"
// heading via its dialog title -- hence none here.
//
// Nothing here is transmitted: the values are gathered in the browser when the
// section renders, and leave it only if the operator copies and pastes them
// themselves. See utils/clientDiagnostics.ts for what is (and is not)
// collected -- environment only, never net or personal content.

const DiagnosticsPanel: React.FC = () => {
  // Snapshot once per mount so the values can't shift under the operator
  // between reading them and copying them.
  const [snapshot] = useState(() => collectDiagnostics());
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async () => {
    const text = formatDiagnostics(snapshot);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard API needs a secure context and permission; if it's refused
      // the text is still on screen and selectable, so say so rather than
      // failing silently.
      setCopyFailed(true);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        If something in the app isn't behaving, copy this and include it in your message.
        It describes this browser and window only — your screen size, browser version, and
        whether the app noticed anything wrong with itself. It contains no callsigns, names,
        locations, or net activity, and nothing is sent anywhere unless you paste it.
      </Typography>

      <Box
        component="dl"
        sx={{
          m: 0,
          mb: 2,
          p: 2,
          borderRadius: 1,
          bgcolor: 'action.hover',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
          columnGap: 2,
          rowGap: 0.5,
          fontSize: '0.875rem',
          // Long values (the UA fallback string especially) must wrap rather
          // than force the settings page to scroll sideways.
          overflowWrap: 'anywhere',
        }}
      >
        {Object.entries(snapshot).map(([label, value]) => (
          <React.Fragment key={label}>
            <Typography component="dt" variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {label}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, fontFamily: 'monospace' }}>
              {value}
            </Typography>
          </React.Fragment>
        ))}
      </Box>

      <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy}>
        Copy Diagnostics
      </Button>

      <Snackbar
        open={copied}
        autoHideDuration={4000}
        onClose={() => setCopied(false)}
        message="Diagnostics copied — paste them into your message"
      />
      <Snackbar
        open={copyFailed}
        autoHideDuration={6000}
        onClose={() => setCopyFailed(false)}
        message="Couldn't copy automatically — select the text above and copy it manually"
      />
    </Box>
  );
};

export default DiagnosticsPanel;
