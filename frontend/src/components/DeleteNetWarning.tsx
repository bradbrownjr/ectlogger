import React from 'react';
import { Box, Typography } from '@mui/material';

// ========== DELETE NET WARNING ==========
// What deleting a net destroys, shown in every "Delete net?" dialog: the
// Dashboard's, the net toolbar's, and the one reached from the post-close
// archive reminder. One copy so the three can't drift apart. Callers add
// their own title, the alternative they offer (Archive, Close & Archive),
// and the buttons.
const DeleteNetWarning: React.FC = () => (
  <>
    <Typography sx={{ mb: 2 }}>
      Deleting this net <strong>permanently destroys</strong> everything tied to it:
    </Typography>
    <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
      <li><Typography variant="body2">Every check-in logged on it</Typography></li>
      <li><Typography variant="body2">Every chat message sent in it</Typography></li>
      <li>
        <Typography variant="body2">
          Its statistics: the net drops out of the schedule's statistics and leaderboards,
          and out of every operator's activity history
        </Typography>
      </li>
      <li><Typography variant="body2">Its report and ICS-309, which can't be produced again</Typography></li>
    </Box>
    <Typography color="error" sx={{ mb: 2, fontWeight: 'bold' }}>
      This cannot be undone, not even by an admin.
    </Typography>
  </>
);

export default DeleteNetWarning;
