import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import {
  Paper,
  Box,
  Typography,
  IconButton,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';

interface FloatingWindowProps {
  title: string;
  children: React.ReactNode;
  isDetached: boolean;
  onDetach: () => void;
  onAttach: () => void;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  storageKey?: string;
}

interface WindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FloatingWindow: React.FC<FloatingWindowProps> = ({
  title,
  children,
  isDetached,
  onDetach,
  onAttach,
  defaultWidth = 500,
  defaultHeight = 400,
  minWidth = 300,
  minHeight = 200,
  storageKey,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<WindowPosition>(() => {
    // Try to load saved position from localStorage
    if (storageKey) {
      const saved = localStorage.getItem(`floatingWindow_${storageKey}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Ignore parse errors
        }
      }
    }
    // Default position - center of viewport
    return {
      x: Math.max(50, (window.innerWidth - defaultWidth) / 2),
      y: Math.max(50, (window.innerHeight - defaultHeight) / 3),
      width: defaultWidth,
      height: defaultHeight,
    };
  });

  // Save position to localStorage when it changes
  useEffect(() => {
    if (storageKey && isDetached) {
      localStorage.setItem(`floatingWindow_${storageKey}`, JSON.stringify(position));
    }
  }, [position, storageKey, isDetached]);

  // Handle window resize to keep floating window in bounds
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev: WindowPosition) => ({
        ...prev,
        x: Math.min(prev.x, window.innerWidth - 100),
        y: Math.min(prev.y, window.innerHeight - 100),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isDetached) {
    // When attached, just render children directly - no wrapper header
    // The parent component is responsible for placing the detach button
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </Box>
    );
  }

  // Floating window mode
  return (
    <Rnd
      size={{ width: position.width, height: isMinimized ? 40 : position.height }}
      position={{ x: position.x, y: position.y }}
      onDragStop={(_e, d) => {
        setPosition((prev: WindowPosition) => ({ ...prev, x: d.x, y: d.y }));
      }}
      onResizeStop={(_e, _direction, ref, _delta, pos) => {
        setPosition({
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
          x: pos.x,
          y: pos.y,
        });
      }}
      minWidth={minWidth}
      minHeight={isMinimized ? 40 : minHeight}
      bounds="window"
      dragHandleClassName="floating-window-handle"
      enableResizing={!isMinimized}
      style={{
        zIndex: 1300, // Above MUI dialogs
      }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: 2,
          borderColor: isDarkMode ? '#1565c0' : 'primary.main',
          borderRadius: 1,
        }}
      >
        {/* Title bar */}
        <Box
          className="floating-window-handle"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 0.5,
            backgroundColor: isDarkMode ? '#1565c0' : 'primary.main',
            color: '#ffffff',
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setIsMinimized(!isMinimized)}
              title={isMinimized ? 'Restore' : 'Minimize'}
              sx={{ color: 'inherit', p: 0.25 }}
            >
              {isMinimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              onClick={onAttach}
              title="Dock back to main view"
              sx={{ color: 'inherit', p: 0.25 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Content */}
        {!isMinimized && (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </Box>
        )}
      </Paper>
    </Rnd>
  );
};

export default FloatingWindow;
