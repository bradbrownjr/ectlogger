import React from 'react';
import { Avatar, Box } from '@mui/material';

interface UserAvatarProps {
  avatarUrl?: string | null;
  callsign?: string | null;
  size?: number;
  isOnline?: boolean;
}

/**
 * Compact user avatar with optional online presence badge.
 * Shows the Gravatar (or uploaded profile image) at the requested size.
 * Falls back to the first character of the callsign when no image is available.
 * If isOnline is true, renders a small green dot in the bottom-right corner.
 */
const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  callsign,
  size = 24,
  isOnline = false,
}) => {
  const initial = callsign ? callsign.charAt(0).toUpperCase() : '?';
  const fontSize = Math.max(8, Math.round(size * 0.45));
  const badgeSize = Math.max(5, Math.round(size * 0.28));

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <Avatar
        src={avatarUrl ?? undefined}
        alt={callsign ?? undefined}
        sx={{
          width: size,
          height: size,
          fontSize,
          bgcolor: 'primary.main',
        }}
      >
        {!avatarUrl && initial}
      </Avatar>
      {isOnline && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            backgroundColor: 'success.main',
            border: '1.5px solid',
            borderColor: 'background.paper',
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  );
};

export default UserAvatar;
