import React, { useState, useEffect } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Rnd } from 'react-rnd';
import ReactMarkdown from 'react-markdown';

interface AnnouncementsProps {
  open: boolean;
  onClose: () => void;
  announcements: string;
  netName: string;
  netId: number;
}

const Announcements: React.FC<AnnouncementsProps> = ({ 
  open, 
  onClose, 
  announcements,
  netName,
  netId
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
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
    // Open announcements in a new browser tab with markdown converted to HTML
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      // Simple markdown to HTML conversion
      const htmlContent = announcements
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>')
        .replace(/^---$/gim, '<hr>')
        .replace(/\n/g, '<br>')
        .replace(/<br><h/g, '<h')
        .replace(/<\/h(\d)><br>/g, '</h$1>')
        .replace(/<br><hr><br>/g, '<hr>')
        .replace(/<br><li>/g, '<li>')
        .replace(/<\/li><br>/g, '</li>');
      
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Announcements - ${netName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 20px;
              line-height: 1.6;
              background-color: #f5f5f5;
            }
            .header {
              color: #1976d2;
              border-bottom: 2px solid #1976d2;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .content {
              background-color: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
            h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
            h1 { font-size: 1.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
            h2 { font-size: 1.3em; }
            h3 { font-size: 1.1em; }
            ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
            li { margin: 0.3em 0; }
            hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
            @media print {
              body { background-color: white; }
              .content { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Announcements / General Traffic</h1>
            <p><strong>Net:</strong> ${netName}</p>
          </div>
          <div class="content">
            ${htmlContent}
          </div>
        </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  if (!open) return null;

  return (
    <Rnd
      style={{
        zIndex: 1300,
      }}
      position={{ x: windowState.x, y: windowState.y }}
      size={{ width: windowState.width, height: windowState.height }}
      onDragStop={(e, d) => {
        setWindowState(prev => ({ ...prev, x: d.x, y: d.y }));
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        setWindowState({
          x: position.x,
          y: position.y,
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
        });
      }}
      minWidth={300}
      minHeight={minimized ? 48 : 200}
      bounds="window"
      dragHandleClassName="drag-handle"
      disableDragging={false}
      enableResizing={!minimized}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
          overflow: 'hidden',
        }}
      >
        {/* ========== TITLE BAR ========== */}
        <Box
          className="drag-handle"
          sx={{
            px: 2,
            py: 1,
            backgroundColor: isDarkMode ? '#2d2d2d' : '#f5f5f5',
            borderBottom: `1px solid ${isDarkMode ? '#444' : '#e0e0e0'}`,
            cursor: 'move',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Announcements / General Traffic
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleOpenInNewTab}
              title="Open in new tab"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setMinimized(!minimized)}
              title={minimized ? "Restore" : "Minimize"}
            >
              {minimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              onClick={onClose}
              title="Close"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* ========== CONTENT AREA ========== */}
        {!minimized && (
          <Box
            sx={{
              flex: 1,
              p: 2,
              overflowY: 'auto',
              backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff',
              '& h1, & h2, & h3': {
                mt: 2,
                mb: 1,
                color: isDarkMode ? '#90caf9' : '#1976d2',
              },
              '& h1:first-of-type, & h2:first-of-type, & h3:first-of-type': {
                mt: 0,
              },
              '& ul, & ol': {
                pl: 3,
                my: 1,
              },
              '& li': {
                my: 0.5,
              },
              '& hr': {
                border: 'none',
                borderTop: `1px solid ${isDarkMode ? '#444' : '#e0e0e0'}`,
                my: 2,
              },
              '& p': {
                my: 1,
              },
            }}
          >
            {announcements ? (
              <ReactMarkdown>{announcements}</ReactMarkdown>
            ) : (
              <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No announcements or general traffic have been added for this net.
              </Typography>
            )}
          </Box>
        )}
      </Paper>
    </Rnd>
  );
};

export default Announcements;
