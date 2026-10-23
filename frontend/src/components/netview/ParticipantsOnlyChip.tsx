import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import LockPersonIcon from '@mui/icons-material/LockPerson';

// ========== PARTICIPANTS ONLY CHIP ==========
// The red label on a participants-only net (Net.participants_only), ahead of
// its status chip in the net view's title row and on the Net info card. Not
// "Closed net": a net that has ended already shows a "closed" status chip.
export const PARTICIPANTS_ONLY_HINT =
  "For the stations taking part in this event or incident. If you aren't, please listen without checking in.";

const ParticipantsOnlyChip: React.FC = () => (
  <Tooltip title={PARTICIPANTS_ONLY_HINT}>
    <Chip icon={<LockPersonIcon />} label="Participants only" size="small" color="error" sx={{ fontWeight: 600 }} />
  </Tooltip>
);

export default ParticipantsOnlyChip;
