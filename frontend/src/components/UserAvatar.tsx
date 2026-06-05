import React from 'react';
import { Avatar, Box } from '@mui/material';

// Visually distinct hues — 24 colors to minimize collisions across users.
const AVATAR_COLORS = [
  '#1565C0', // deep blue
  '#2E7D32', // deep green
  '#6A1B9A', // deep purple
  '#AD1457', // deep pink
  '#00695C', // teal
  '#E65100', // deep orange
  '#4527A0', // indigo
  '#558B2F', // olive green
  '#00838F', // cyan
  '#C62828', // deep red
  '#4E342E', // brown
  '#37474F', // blue-grey
  '#0097A7', // dark cyan
  '#7B1FA2', // deep purple (alt)
  '#C2185B', // pink
  '#F57F17', // amber
  '#00897B', // teal (alt)
  '#1976D2', // light blue
  '#388E3C', // green
  '#7E57C2', // light purple
  '#D32F2F', // red
  '#F57C00', // orange
  '#455A64', // slate
  '#6D4C41', // brown (alt)
];

/** Deterministic color from callsign + name — combines both for better distribution. */
function avatarColor(callsign: string | null | undefined, name: string | null | undefined): string {
  const seed = `${callsign || ''}${name || ''}`;
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface UserAvatarProps {
  avatarUrl?: string | null;
  callsign?: string | null;
  name?: string | null;
  size?: number;
  isOnline?: boolean;
}

/**
 * Compact user avatar with optional online presence badge.
 * Shows the Gravatar (or uploaded profile image) at the requested size.
 * Falls back to the first character of the name (if available) then callsign.
 * Placeholder color is derived from the callsign so each person gets a
 * consistent, distinct color regardless of shared initials.
 * If isOnline is true, renders a small green dot in the bottom-right corner.
 */
const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  callsign,
  name,
  size = 24,
  isOnline = false,
}) => {
  const initial = (name || callsign || '?').charAt(0).toUpperCase();
  const fontSize = Math.max(8, Math.round(size * 0.45));
  const badgeSize = Math.max(5, Math.round(size * 0.28));
  const bgColor = avatarColor(callsign, name);

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <Avatar
        src={avatarUrl ?? undefined}
        alt={callsign ?? undefined}
        sx={{
          width: size,
          height: size,
          fontSize,
          bgcolor: bgColor,
        }}
      >
        {initial}
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
