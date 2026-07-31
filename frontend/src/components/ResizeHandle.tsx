import React from 'react';
import { Box } from '@mui/material';

interface ResizeHandleProps {
  // Matches the CSS flexDirection of the container the panes live in - see
  // useResizableSplit.ts. 'row' renders as a vertical bar (drag left/right);
  // 'column' renders as a horizontal bar (drag up/down).
  direction: 'row' | 'column';
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onDragStart }) => (
  <Box
    onMouseDown={onDragStart}
    onTouchStart={onDragStart}
    sx={{
      flexShrink: 0,
      position: 'relative',
      cursor: direction === 'row' ? 'col-resize' : 'row-resize',
      touchAction: 'none',
      ...(direction === 'row' ? { width: 10 } : { height: 10 }),
      zIndex: 1,
      '&::after': {
        content: '""',
        position: 'absolute',
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s',
        ...(direction === 'row'
          ? { left: '50%', top: 0, bottom: 0, width: '2px', transform: 'translateX(-50%)' }
          : { top: '50%', left: 0, right: 0, height: '2px', transform: 'translateY(-50%)' }),
      },
      '&:hover::after, &:active::after': {
        backgroundColor: 'primary.main',
      },
    }}
  />
);

export default ResizeHandle;
