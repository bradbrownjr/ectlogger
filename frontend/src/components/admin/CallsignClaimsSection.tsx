import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import { userApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

interface CallsignClaim {
  id: number;
  callsign: string;
  schedule_name: string | null;
  status: 'linked' | 'held';
  linked_by_manager: boolean;
  claimed_at: string;
  via_invite: boolean;
  reverted_at: string | null;
  entries: number;
}

// ========== CALLSIGN CLAIMS (Edit User dialog) ==========
// Schedules where this account took over (or is waiting for the manager to
// confirm it for) a team spot listed under its callsign without an account.
// Revert hands a spot back to the callsign, for someone who signed up with a
// callsign that isn't theirs. Banning the account reverts all of them.
const CallsignClaimsSection: React.FC<{ userId: number }> = ({ userId }) => {
  const [claims, setClaims] = useState<CallsignClaim[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await userApi.listCallsignClaims(userId);
      setClaims(response.data);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load callsign claims'));
    }
  };

  useEffect(() => { load(); }, [userId]);

  const handleRevert = async (claim: CallsignClaim) => {
    const what = claim.status === 'held'
      ? `Dismiss this account's request for ${claim.callsign}'s spot on ${claim.schedule_name || 'the schedule'}?`
      : `Give ${claim.callsign}'s spot on ${claim.schedule_name || 'the schedule'} back to the callsign? This account loses it and can't take it back by editing its profile.`;
    if (!confirm(what)) return;
    try {
      await userApi.revertCallsignClaim(userId, claim.id);
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to revert'));
    }
  };

  if (claims.length === 0 && !error) return null;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Teams joined by callsign</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Spots on net staff lists and rotations this account took over by its callsign, or is waiting for a schedule's manager to confirm.
      </Typography>
      {error && <Typography variant="body2" color="error">{error}</Typography>}
      {claims.map((claim) => (
        <Box key={claim.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.5 }}>
          <Typography variant="body2" fontWeight="bold">{claim.callsign}</Typography>
          <Typography variant="body2" color="text.secondary">
            {claim.schedule_name || 'Deleted schedule'}
            {claim.status === 'linked' && `, ${claim.entries} ${claim.entries === 1 ? 'entry' : 'entries'}`}
            {`, ${new Date(claim.claimed_at).toLocaleDateString()}`}
          </Typography>
          {/* How it was trusted, or that it is still waiting */}
          {claim.status === 'held' && <Chip label="Waiting for manager" size="small" variant="outlined" />}
          {claim.via_invite && <Chip label="Invited" size="small" variant="outlined" />}
          {claim.linked_by_manager && <Chip label="Linked by manager" size="small" variant="outlined" />}
          {/* Reverted claims stay listed for the record */}
          {claim.reverted_at ? (
            <Chip label="Reverted" size="small" color="warning" variant="outlined" />
          ) : (
            <Button size="small" color="error" onClick={() => handleRevert(claim)} sx={{ ml: 'auto' }}>
              {claim.status === 'held' ? 'Dismiss' : 'Revert'}
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default CallsignClaimsSection;
