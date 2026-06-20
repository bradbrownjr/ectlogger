import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { userApi } from '../services/api';

interface PopupNetEntry {
  net_id: number;
  net_name: string;
  date?: string;
  check_in_count: number;
}

interface UserPopup {
  user_id: number;
  callsign: string;
  name?: string;
  avatar_url?: string;
  net_role?: string;
  total_check_ins: number;
  unique_nets: number;
  recent_nets: PopupNetEntry[];
  top_nets: PopupNetEntry[];
}

interface UserProfileDialogProps {
  userId: number | null;
  netId?: number;
  onClose: () => void;
}

const AVATAR_COLORS = [
  '#1565C0', '#2E7D32', '#6A1B9A', '#AD1457', '#00695C',
  '#E65100', '#4527A0', '#558B2F', '#00838F', '#C62828',
];

function avatarColor(callsign: string): string {
  let hash = 0;
  for (let i = 0; i < callsign.length; i++) {
    hash = callsign.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const UserProfileDialog: React.FC<UserProfileDialogProps> = ({ userId, netId, onClose }) => {
  const [popup, setPopup] = useState<UserPopup | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPopup(null);
      return;
    }
    setLoading(true);
    setPopup(null);
    userApi.getPopup(userId, netId)
      .then(res => setPopup(res.data))
      .catch(() => setPopup(null))
      .finally(() => setLoading(false));
  }, [userId, netId]);

  const open = userId !== null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 3 } } }}>
      <DialogTitle sx={{ pb: 0, pr: 6 }}>
        Who is this?
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!loading && !popup && userId && (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            Could not load profile.
          </Typography>
        )}

        {!loading && popup && (
          <Box>
            {/* Avatar + identity */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, mt: 1 }}>
              <Avatar
                src={popup.avatar_url ?? undefined}
                alt={popup.callsign}
                sx={{
                  width: 64,
                  height: 64,
                  fontSize: 28,
                  bgcolor: avatarColor(popup.callsign),
                  flexShrink: 0,
                }}
              >
                {(popup.name || popup.callsign || '?').charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                  {popup.callsign}
                </Typography>
                {popup.name && (
                  <Typography variant="body2" color="text.secondary">
                    {popup.name}
                  </Typography>
                )}
                {popup.net_role && (
                  <Chip
                    label={popup.net_role.toUpperCase()}
                    size="small"
                    color="primary"
                    sx={{ mt: 0.5, fontSize: '0.7rem' }}
                  />
                )}
              </Box>
            </Box>

            <Divider sx={{ mb: 1.5 }} />

            {/* Stats */}
            <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ lineHeight: 1 }}>{popup.total_check_ins}</Typography>
                <Typography variant="caption" color="text.secondary">Check-ins</Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ lineHeight: 1 }}>{popup.unique_nets}</Typography>
                <Typography variant="caption" color="text.secondary">Nets</Typography>
              </Box>
            </Box>

            {/* Recent nets */}
            {popup.recent_nets.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Recent</Typography>
                <List dense disablePadding sx={{ mb: 1.5 }}>
                  {popup.recent_nets.map((n) => (
                    <ListItem key={n.net_id} disablePadding>
                      <ListItemText
                        primary={n.net_name}
                        secondary={formatDate(n.date)}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {/* Most-attended nets (only show if different from recent) */}
            {popup.top_nets.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Most attended</Typography>
                <List dense disablePadding>
                  {popup.top_nets.map((n) => (
                    <ListItem key={n.net_id} disablePadding
                      secondaryAction={
                        <Typography variant="caption" color="text.secondary">
                          {n.check_in_count}x
                        </Typography>
                      }
                    >
                      <ListItemText
                        primary={n.net_name}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;
