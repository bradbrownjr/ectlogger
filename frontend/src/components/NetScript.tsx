import React, { useState, useEffect } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Rnd } from 'react-rnd';

interface NetScriptProps {
  open: boolean;
  onClose: () => void;
  script: string;
  netName: string;
  netId: number;
}

const NetScript: React.FC<NetScriptProps> = ({ 
  open, 
  onClose, 
  script,
  netName,
  netId
}) => {
  const [minimized, setMinimized] = useState(false);

  // Window position and size state
  const [windowState, setWindowState] = useState({
    x: 50,
    y: 100,
    width: 500,
    height: minimized ? 48 : 400,
  });

  // Update height when minimized state changes
  useEffect(() => {
    setWindowState(prev => ({
      ...prev,
      height: minimized ? 48 : 400,
    }));
  }, [minimized]);

  const handleOpenInNewTab = () => {
    // Open script in a new browser tab with simple HTML formatting
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Net Script - ${netName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 20px;
              line-height: 1.6;
              background-color: #f5f5f5;
            }
            h1 {
              color: #1976d2;
              border-bottom: 2px solid #1976d2;
              padding-bottom: 10px;
            }
            pre {
              background-color: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              white-space: pre-wrap;
              word-wrap: break-word;
              font-family: inherit;
              font-size: 14px;
            }
            @media print {
              body { background: white; }
              pre { box-shadow: none; border: 1px solid #ccc; }
            }
          </style>
        </head>
        <body>
          <h1>📻 ${netName} - Net Script</h1>
          <pre>${script.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  if (!open) return null;

  return (
    <Rnd
      size={{ width: windowState.width, height: windowState.height }}
      position={{ x: windowState.x, y: windowState.y }}
      onDragStop={(_e: any, d: any) => {
        setWindowState(prev => ({ ...prev, x: d.x, y: d.y }));
      }}
      onResizeStop={(_e: any, _direction: any, ref: any, _delta: any, position: any) => {
        setWindowState({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
          x: position.x,
          y: position.y,
        });
      }}
      minWidth={300}
      minHeight={minimized ? 48 : 200}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={!minimized}
      style={{ zIndex: 1300 }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {/* Title bar - draggable */}
        <Box
          className="drag-handle"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            cursor: 'move',
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle1" fontWeight="bold">
            Net Script
          </Typography>
          <Box>
            <IconButton
              size="small"
              onClick={handleOpenInNewTab}
              sx={{ color: 'inherit', mr: 0.5 }}
              title="Open in new tab"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setMinimized(!minimized)}
              sx={{ color: 'inherit', mr: 0.5 }}
            >
              {minimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              onClick={onClose}
              sx={{ color: 'inherit' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Content */}
        {!minimized && (
          <Box 
            sx={{ 
              flex: 1, 
              p: 2, 
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              lineHeight: 1.6,
            }}
          >
            {script || <Typography color="text.secondary" fontStyle="italic">No script defined for this net.</Typography>}
          </Box>
        )}
      </Paper>
    </Rnd>
  );
};

export default NetScript;
