import React, { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { userApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import type { BackupEmail } from '../profile/BackupEmailsSection';

// ========== BACKUP EMAILS (Edit User dialog) ==========
// The account's backup sign-in addresses, which its owner adds from Profile >
// Security. An admin can remove one here (say, an address the owner says
// isn't theirs); every address on the account is told. Hidden when there
// are none.
const BackupEmailsAdminSection: React.FC<{ userId: number }> = ({ userId }) => {
  const [backups, setBackups] = useState<BackupEmail[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userApi.listBackupEmails(userId)
      .then((response) => setBackups(response.data.backups))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load backup emails')));
  }, [userId]);

  const handleRemove = async (backup: BackupEmail) => {
    if (!confirm(`Remove ${backup.email}? Sign-in links sent to it will stop opening this account. Every address on the account is told.`)) return;
    try {
      const response = await userApi.removeBackupEmail(userId, backup.id);
      setBackups(response.data.backups);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to remove the address'));
    }
  };

  if (backups.length === 0 && !error) return null;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Backup emails</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        These also sign in to this account. Email still goes only to the address above.
      </Typography>
      {error && <Typography variant="body2" color="error">{error}</Typography>}
      {backups.map((backup) => (
        <Box key={backup.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: '1 1 200px', minWidth: 0, wordBreak: 'break-all' }}>{backup.email}</Typography>
          <Button size="small" variant="outlined" color="error" onClick={() => handleRemove(backup)} sx={{ minHeight: 44 }}>
            Remove
          </Button>
        </Box>
      ))}
    </Box>
  );
};

export default BackupEmailsAdminSection;
