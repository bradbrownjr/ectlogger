import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import {
  Paper,
  Box,
  Typography,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import { isNetViewLayoutRemembered } from '../utils/localStorageKeys';

interface FloatingWindowProps {
  title: string;
  children: React.ReactNode;
  isDetached: boolean;
  // Optional: renders a "Dock to layout" icon (matching CheckInMap.tsx's own
  // floating chrome), distinct from onClose below. Chat/Activity Log always
  // pass this since they have no separate open/closed state -- docking back
  // is their only "put this away" action. On-demand panels like Coverage
  // pass both this and onClose, same as CheckInMap's onDock+onClose.
  onAttach?: () => void;
  // Optional: renders the real Close icon (hides the panel entirely). Only
  // on-demand panels with their own open/closed state need this -- Chat/
  // Activity Log have no "closed" state to return to, so they omit it.
  onClose?: () => void;
  // Optional: lets a floated pane jump straight to a real popped-out window
  // without re-docking first. Only rendered when supplied.
  onPopOut?: () => void;
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
  onAttach,
  onClose,
  onPopOut,
  defaultWidth = 500,
  defaultHeight = 400,
  minWidth = 300,
  minHeight = 200,
  storageKey,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<WindowPosition>(() => {
    // Try to load saved position from localStorage
    if (storageKey && isNetViewLayoutRemembered()) {
      const saved = localStorage.getItem(`floatingWindow_${storageKey}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Ignore parse errors
        }
      }
    }
    // Default position - center of viewport. document.body.offsetWidth/
    // offsetHeight, not window.innerWidth/innerHeight -- see the bounds
    // comment below on the same local-vs-visual distinction; identical
    // numbers outside a zoomed context, so this is a no-op anywhere but
    // NetView.
    return {
      x: Math.max(50, (document.body.offsetWidth - defaultWidth) / 2),
      y: Math.max(50, (document.body.offsetHeight - defaultHeight) / 3),
      width: defaultWidth,
      height: defaultHeight,
    };
  });

  // Save position to localStorage when it changes
  useEffect(() => {
    if (storageKey && isDetached && isNetViewLayoutRemembered()) {
      localStorage.setItem(`floatingWindow_${storageKey}`, JSON.stringify(position));
    }
  }, [position, storageKey, isDetached]);

  // Handle window resize to keep floating window in bounds. Same local-vs-
  // visual distinction as the Rnd's own `bounds="body"` below -- position.x/y
  // are LOCAL units, so the clamp must compare against document.body's own
  // LOCAL offsetWidth/offsetHeight, not the VISUAL window.innerWidth/Height
  // (identical numerically outside a zoomed context, so this is a no-op
  // anywhere but NetView).
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev: WindowPosition) => ({
        ...prev,
        x: Math.min(prev.x, document.body.offsetWidth - 100),
        y: Math.min(prev.y, document.body.offsetHeight - 100),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isDetached) {
    // Docked mode: children own their own headers (Chat/ActivityLog render their own title rows).
    // Just passthrough regardless of whether minimize props are provided.
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
      // Not "window": react-rnd's own "window" bounds mode clamps drag/
      // resize against window.innerWidth/innerHeight, which are TRUE/visual
      // viewport pixels -- but this Rnd's own tracked position/size are in
      // the LOCAL pixel space of its nearest zoomed ancestor (NetView.tsx
      // applies a CSS `zoom` to <body> to fit the logging panel on short
      // screens; see DESIGN.md "Tooltip Positioning" for the same local-vs-
      // visual distinction elsewhere in this app). Under zoom<1, local
      // units are inflated by 1/zoom relative to visual ones (confirmed by
      // direct measurement on beta: document.body.offsetWidth 1000 vs
      // window.innerWidth 800 at zoom 0.8) -- react-rnd's "window" mode
      // mixes the two directly, undercounting how far the window can
      // travel by exactly the zoom factor. Reported: a floating window
      // could not be dragged into the bottom-right quarter of the screen.
      // "body" mode uses document.body.offsetWidth/offsetHeight instead,
      // which -- confirmed by that same measurement -- are in the same
      // LOCAL units as this Rnd's own size, making the comparison
      // zoom-safe. Outside NetView (zoom always 1), "body" and "window"
      // bounds are numerically identical, so this is a no-op everywhere
      // else in the app.
      bounds="body"
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
          borderColor: 'primary.main',
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
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {title}
          </Typography>
          {/* Close is always the rightmost icon (common window-chrome
              convention: minimize, [actions], close-last), matching
              CheckInMap.tsx's own floating chrome. Dock (onAttach) and
              Close (onClose) are two distinct actions, never conflated --
              docking back does not hide an on-demand panel like Coverage
              (its docked pane only renders when the viewport is wide
              enough), so a floating panel with no real onClose would have
              no way to be dismissed at all. */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setIsMinimized(!isMinimized)}
              title={isMinimized ? 'Restore' : 'Minimize'}
              sx={{ color: 'inherit', p: 0.25 }}
            >
              {isMinimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            {onPopOut && (
              <IconButton
                size="small"
                onClick={onPopOut}
                title="Open in new window"
                sx={{ color: 'inherit', p: 0.25 }}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            {onAttach && (
              <IconButton
                size="small"
                onClick={onAttach}
                title="Dock to layout"
                sx={{ color: 'inherit', p: 0.25 }}
              >
                <ViewSidebarIcon fontSize="small" />
              </IconButton>
            )}
            {onClose && (
              <IconButton
                size="small"
                onClick={onClose}
                title="Close"
                sx={{ color: 'inherit', p: 0.25 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
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
