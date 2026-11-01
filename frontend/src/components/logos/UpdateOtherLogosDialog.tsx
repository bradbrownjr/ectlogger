import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { logoApi, LogoUses } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatDate } from '../../utils/dateUtils';

// ========== UPDATE OTHER LOGOS ==========
// Shown after a manager replaces a logo, when other nets or schedules they
// can change still show the old one (GET /logos/uses). Everything starts
// ticked; unticking a past net keeps its report as it was.

interface UpdateOtherLogosDialogProps {
  open: boolean;
  newLogoUrl: string;
  uses: LogoUses;
  onClose: () => void;
}

const UpdateOtherLogosDialog: React.FC<UpdateOtherLogosDialogProps> = ({ open, newLogoUrl, uses, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [netIds, setNetIds] = useState<Set<number>>(new Set());
  const [scheduleIds, setScheduleIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNetIds(new Set(uses.nets.map((n) => n.id)));
    setScheduleIds(new Set(uses.schedules.map((s) => s.id)));
    setError(null);
  }, [open, uses]);

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const total = netIds.size + scheduleIds.size;

  const handleUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      await logoApi.apply(newLogoUrl, [...netIds], [...scheduleIds]);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the other logos.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>Update your other nets and schedules?</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
          <Box component="img" src={newLogoUrl} alt="New logo" sx={{ width: 56, height: 56, objectFit: 'contain' }} />
          <Typography variant="body2">
            These still show the old logo. The ones you tick get the new one.
          </Typography>
        </Stack>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Schedules: their future nets start with this logo */}
        {uses.schedules.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>Schedules</Typography>
            {uses.schedules.map((s) => (
              <FormControlLabel
                key={`s-${s.id}`}
                sx={{ display: 'flex', minHeight: 44 }}
                control={<Checkbox checked={scheduleIds.has(s.id)} onChange={() => toggle(scheduleIds, setScheduleIds, s.id)} />}
                label={s.name}
              />
            ))}
          </>
        )}

        {/* Nets, newest first, including past ones (their reports) */}
        {uses.nets.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>Nets</Typography>
            {uses.nets.map((n) => (
              <FormControlLabel
                key={`n-${n.id}`}
                sx={{ display: 'flex', minHeight: 44 }}
                control={<Checkbox checked={netIds.has(n.id)} onChange={() => toggle(netIds, setNetIds, n.id)} />}
                label={
                  <Box>
                    <Typography variant="body1">{n.name}</Typography>
                    {n.date && (
                      <Typography variant="body2" color="text.secondary">{formatDate(n.date)}</Typography>
                    )}
                  </Box>
                }
              />
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Leave them</Button>
        <Button variant="contained" onClick={handleUpdate} disabled={saving || total === 0}>
          Update {total}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpdateOtherLogosDialog;
