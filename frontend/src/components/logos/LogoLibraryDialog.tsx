import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { logoApi, LogoLibraryEntry } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== LOGO LIBRARY (Choose existing) ==========
// Every logo some net or schedule on the site already uses, one tile per
// image, labelled with the schedules and nets using it. Picking one sets
// it without finding and uploading the original file again
// (routers/net_logos.py). The current logo is marked and can't be chosen.

interface LogoLibraryDialogProps {
  open: boolean;
  currentLogoUrl: string | null | undefined;
  onClose: () => void;
  onChoose: (logoUrl: string) => void;
}

const LogoLibraryDialog: React.FC<LogoLibraryDialogProps> = ({ open, currentLogoUrl, onClose, onChoose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [logos, setLogos] = useState<LogoLibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setError(null);
    logoApi.list()
      .then((resp) => setLogos(resp.data))
      .catch((err) => setError(getErrorMessage(err, 'Could not load logos.')));
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle>Choose a logo</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error">{error}</Alert>}
        {!error && logos === null && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        )}
        {logos && logos.length === 0 && (
          <Typography color="text.secondary">No net or schedule has a logo yet.</Typography>
        )}
        {logos && logos.length > 0 && (
          <Box
            role="listbox"
            aria-label="Logos on this site"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}
          >
            {logos.map((logo) => {
              const isCurrent = logo.logo_url === currentLogoUrl;
              const isSelected = logo.logo_url === selected;
              const label = logo.used_by.join(', ');
              return (
                <Box
                  key={logo.logo_url}
                  component="button"
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isCurrent}
                  onClick={() => setSelected(logo.logo_url)}
                  onDoubleClick={() => !isCurrent && onChoose(logo.logo_url)}
                  sx={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    p: 1.5, minHeight: 44, cursor: isCurrent ? 'default' : 'pointer',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    color: 'text.primary', font: 'inherit', textAlign: 'center',
                    border: 2, borderRadius: 1,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    opacity: isCurrent ? 0.6 : 1,
                    '&:hover': isCurrent ? undefined : { borderColor: 'primary.light' },
                  }}
                >
                  <Box component="img" src={logo.logo_url} alt="" sx={{ width: 88, height: 88, objectFit: 'contain' }} />
                  <Typography variant="caption" sx={{ lineHeight: 1.3, wordBreak: 'break-word' }} title={label}>
                    {logo.used_by.slice(0, 2).join(', ')}
                    {logo.used_by.length > 2 && ` +${logo.used_by.length - 2} more`}
                  </Typography>
                  {isCurrent && <Typography variant="caption" color="text.secondary">Current logo</Typography>}
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!selected} onClick={() => selected && onChoose(selected)}>
          Use logo
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LogoLibraryDialog;
