import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Link,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LanguageIcon from '@mui/icons-material/Language';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { userApi } from '../services/api';

interface PopupNetEntry {
  net_id: number;
  net_name: string;
  date?: string;
  check_in_count: number;
}

interface UserPopup {
  user_id: number | null;
  callsign: string;
  name?: string;
  avatar_url?: string;
  website_url?: string;
  net_role?: string;
  total_check_ins: number;
  unique_nets: number;
  recent_nets: PopupNetEntry[];
  top_nets: PopupNetEntry[];
}

interface UserProfileDialogProps {
  // Exactly one of userId/callsign should be set at a time -- userId for a
  // registered account, callsign for a guest/accountless check-in (no
  // user_id to look up by). netId only applies to the userId path.
  userId: number | null;
  callsign?: string | null;
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

const UserProfileDialog: React.FC<UserProfileDialogProps> = ({ userId, callsign, netId, onClose }) => {
  const [popup, setPopup] = useState<UserPopup | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId && !callsign) {
      setPopup(null);
      return;
    }
    setLoading(true);
    setPopup(null);
    const request = userId ? userApi.getPopup(userId, netId) : userApi.getPopupByCallsign(callsign!);
    request
      .then(res => setPopup(res.data))
      .catch(() => setPopup(null))
      .finally(() => setLoading(false));
  }, [userId, callsign, netId]);

  const open = userId !== null || !!callsign;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 3 } } }}>
      {/* Close button — no title bar */}
      <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}>
        <CloseIcon fontSize="small" />
      </IconButton>

      <DialogContent sx={{ pt: 2.5, pb: 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!loading && !popup && (userId || callsign) && (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            Could not load profile.
          </Typography>
        )}

        {!loading && popup && (
          <Box>
            {/* Avatar + identity */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
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
                <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {popup.callsign && (
                    <Link
                      href={`https://www.qrz.com/db/${encodeURIComponent(popup.callsign)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="caption"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
                    >
                      QRZ.com <OpenInNewIcon sx={{ fontSize: 12 }} />
                    </Link>
                  )}
                  {popup.website_url && (
                    <Link
                      href={popup.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="caption"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
                    >
                      <LanguageIcon sx={{ fontSize: 12 }} /> Website
                    </Link>
                  )}
                </Box>
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
                <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>Recent</Typography>
                <Box sx={{ mb: 1.5 }}>
                  {popup.recent_nets.map((n) => (
                    <Box key={n.net_id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3 }}>
                      <Typography variant="body2" noWrap sx={{ flex: 1, mr: 2 }}>
                        {n.net_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {formatDate(n.date)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {/* Most-attended nets */}
            {popup.top_nets.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>Most attended</Typography>
                <Box>
                  {popup.top_nets.map((n, i) => (
                    <Box key={`${n.net_id}-${i}`} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3 }}>
                      <Typography variant="body2" noWrap sx={{ flex: 1, mr: 2 }}>
                        {n.net_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {n.check_in_count}x
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;
