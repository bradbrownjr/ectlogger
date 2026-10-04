import React from 'react';
import { Box, Tooltip } from '@mui/material';

// ========== CHECK-IN LOCATION (town, with the grid on hover) ==========
// A station using location awareness checks in with its town ("Waterboro, ME")
// so net control can read it on the air. The server keeps the grid square it
// came from (grid_square) only while the location is still that town, and it
// shows here on hover, or on tap on a phone. One component for both check-in
// lists, so desktop and mobile can't drift apart.
interface CheckInLocationProps {
  location?: string | null;
  gridSquare?: string | null;
}

const CheckInLocation: React.FC<CheckInLocationProps> = ({ location, gridSquare }) => {
  if (!gridSquare) return <>{location}</>;
  return (
    <Tooltip title={`Grid ${gridSquare}`} enterTouchDelay={0}>
      {/* Dotted underline: the usual hint that hovering reveals more */}
      <Box component="span" sx={{ textDecoration: 'underline dotted', textUnderlineOffset: 3, cursor: 'help' }}>
        {location}
      </Box>
    </Tooltip>
  );
};

export default CheckInLocation;
