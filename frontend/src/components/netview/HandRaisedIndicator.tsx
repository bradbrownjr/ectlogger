import React from 'react';
import { Box, Tooltip } from '@mui/material';
import PanToolIcon from '@mui/icons-material/PanTool';

// ========== RAISED HAND (read-only, beside the callsign) ==========
// Shows every viewer, not just staff, which stations have a hand up, so
// participants can see who else is waiting with a question or input. The
// toggle button in the desktop Actions column is still how a station (or
// NCS/Logger) raises and lowers it; this is only the indicator. One component
// for both check-in lists, which share the same callsign cell layout.
interface HandRaisedIndicatorProps {
  handRaised?: boolean;
  status?: string;
}

const HandRaisedIndicator: React.FC<HandRaisedIndicatorProps> = ({ handRaised, status }) => {
  // A checked-out station's hand no longer means anything
  if (!handRaised || status === 'checked_out') return null;
  return (
    <Tooltip title="Hand raised" arrow enterTouchDelay={0}>
      <Box component="span" sx={{ display: 'inline-flex', cursor: 'help' }} aria-label="Hand raised">
        <PanToolIcon fontSize="small" color="warning" />
      </Box>
    </Tooltip>
  );
};

export default HandRaisedIndicator;
