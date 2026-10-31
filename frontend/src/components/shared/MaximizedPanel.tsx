import React from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton, Paper, Typography } from '@mui/material';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import CloseIcon from '@mui/icons-material/Close';

// ========== MAXIMIZED PANEL ==========
// A Net View panel filling the page below the navbar: the Check-in Map and
// Station Coverage, from docked or floating. Its title bar is the floating
// window's (FloatingWindow.tsx): title, the panel's own buttons, then
// Restore, Open in new window, Dock, and Close last.
//
// Rendered into document.body, so a docked pane's overflow:hidden column
// can't clip it. Fixed-position under NetView's CSS zoom works the same way
// the floating windows already rely on (see FloatingWindow's `bounds`).

interface MaximizedPanelProps {
  title: React.ReactNode;
  // The panel's own buttons (export, filter...), drawn on the title bar
  actions?: React.ReactNode;
  onRestore: () => void;
  onPopOut?: () => void;
  onDock?: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}

const navbarHeight = () => {
  const navbar = document.querySelector('header, nav, .MuiAppBar-root');
  return navbar ? navbar.getBoundingClientRect().height : 48;
};

const MaximizedPanel: React.FC<MaximizedPanelProps> = ({ title, actions, onRestore, onPopOut, onDock, onClose, children }) => {
  const top = navbarHeight();
  return createPortal(
    <div style={{ position: 'fixed', top, left: 0, right: 0, bottom: 0, zIndex: 1300 }}>
      <Paper elevation={8} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Title bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 1.5,
            py: 0.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {typeof title === 'string'
              ? <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{title}</Typography>
              : title}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {actions}
            <IconButton size="small" onClick={onRestore} title="Restore" sx={{ color: 'inherit', p: 0.25 }}>
              <FullscreenExitIcon fontSize="small" />
            </IconButton>
            {onPopOut && (
              <IconButton size="small" onClick={onPopOut} title="Open in new window" sx={{ color: 'inherit', p: 0.25 }}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            {onDock && (
              <IconButton size="small" onClick={onDock} title="Dock to layout" sx={{ color: 'inherit', p: 0.25 }}>
                <ViewSidebarIcon fontSize="small" />
              </IconButton>
            )}
            {onClose && (
              <IconButton size="small" onClick={onClose} title="Close" sx={{ color: 'inherit', p: 0.25 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </Box>
      </Paper>
    </div>,
    document.body,
  );
};

export default MaximizedPanel;
