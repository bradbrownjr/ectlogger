import React from 'react';
import { Chip, Tooltip } from '@mui/material';

// ========== CALLSIGN-ONLY OPERATOR CHIPS ==========
// Shown beside a staff row that names a callsign with no account yet. Shared
// by the Staff dialog (NCSStaffRosterTab) and the schedule editor's Net Staff
// tab (create-schedule/StaffRotationTab) so the two lists read the same.
const PlaceholderChips: React.FC<{ invited?: boolean; accountAvailable?: boolean }> = ({ invited, accountAvailable }) => (
  <>
    <Tooltip title="On the list by callsign. They can't use the app's net controls until they sign up with this callsign.">
      <Chip label={invited ? 'Invited' : 'No account yet'} size="small" variant="outlined" color="warning" />
    </Tooltip>
    {/* The callsign now has an account that wasn't linked automatically */}
    {accountAvailable && (
      <Chip label="Signed up with another address" size="small" color="info" variant="outlined" />
    )}
  </>
);

export default PlaceholderChips;
