import React from 'react';
import { IconButton } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

interface OffscreenArrivalArrowProps {
  visible: boolean;
  direction: 'above' | 'below';
  onClick: () => void;
}

// Floating button announcing "a self check-in just landed outside the
// visible area of this table" -- click scrolls it into view. Shared by
// CheckInTable.tsx and CheckInMobileList.tsx (previously two near-verbatim
// copies that had all three of the same bugs). Must be rendered inside a
// non-scrolling `position: relative` wrapper placed AROUND the table's own
// scrolling container, not inside it -- an absolutely positioned descendant
// of the scroll container itself is placed against that container's full
// scrollable content box, so `bottom`/`top` would scroll away with the
// table instead of staying pinned to the visible edge. See
// sneakInHighlight.ts's useOffscreenArrivalIndicator for the
// arrival-detection/dismissal logic behind `visible`/`direction`.
const OffscreenArrivalArrow: React.FC<OffscreenArrivalArrowProps> = ({ visible, direction, onClick }) => (
  <IconButton
    onClick={onClick}
    aria-label={`Scroll to new check-in ${direction === 'above' ? 'above' : 'below'} the visible area`}
    sx={{
      position: 'absolute',
      [direction === 'above' ? 'top' : 'bottom']: 6,
      right: 12,
      zIndex: 3,
      width: 44,
      height: 44,
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.4s ease',
      color: 'warning.main',
      backgroundColor: 'background.paper',
      boxShadow: 2,
      '&:hover': { backgroundColor: 'background.paper', boxShadow: 4 },
    }}
  >
    {direction === 'above' ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
  </IconButton>
);

export default OffscreenArrivalArrow;
