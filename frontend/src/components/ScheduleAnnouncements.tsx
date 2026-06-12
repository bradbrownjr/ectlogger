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
import remarkGfm from 'remark-gfm';
import { templateApi } from '../services/api';

interface ScheduleAnnouncementsProps {
  open: boolean;
  onClose: () => void;
  templateId: number;
  netName: string;
}

const ScheduleAnnouncements: React.FC<ScheduleAnnouncementsProps> = ({
  open,
  onClose,
  templateId,
  netName,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [minimized, setMinimized] = useState(false);
  const [announcements, setAnnouncements] = useState('');

  useEffect(() => {
    if (open && templateId) {
      templateApi.get(templateId)
        .then(res => setAnnouncements(res.data.announcements || ''))
        .catch(() => setAnnouncements(''));
    }
  }, [open, templateId]);

  const [windowState, setWindowState] = useState({
    x: 100,
    y: 100,
    width: 500,
    height: minimized ? 48 : 400,
  });

  useEffect(() => {
    setWindowState(prev => ({
      ...prev,
      height: minimized ? 48 : 400,
    }));
  }, [minimized]);

  const handleOpenInNewTab = () => {
    const newWindow = window.open('', '_blank');
    if (newWindow) {
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
          <title>Schedule Announcements - ${netName}</title>
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
            ul, ol { padding-left: 1.5em; }
            li { margin: 0.3em 0; }
            hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
            @media print {
              body { background: white; }
              .content { box-shadow: none; border: 1px solid #ccc; }
            }
          </style>
        </head>
        <body>
          <h1 class="header">Schedule Announcements - ${netName}</h1>
          <div class="content">${htmlContent}</div>
        </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  if (!open) return null;

  return (
    <Rnd
      style={{ zIndex: 1300 }}
      position={{ x: windowState.x, y: windowState.y }}
      size={{ width: windowState.width, height: windowState.height }}
      onDragStop={(_e: any, d: any) => {
        setWindowState(prev => ({ ...prev, x: d.x, y: d.y }));
      }}
      onResizeStop={(_e: any, _direction: any, ref: any, _delta: any, position: any) => {
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
        <Box
          className="drag-handle"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            bgcolor: isDarkMode ? '#1565c0' : 'primary.main',
            color: '#ffffff',
            cursor: 'move',
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle1" fontWeight="bold">
            Schedule Announcements
          </Typography>
          <Box>
            <IconButton size="small" onClick={handleOpenInNewTab} sx={{ color: 'inherit', mr: 0.5 }} title="Open in new tab">
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => setMinimized(!minimized)}
              sx={{ color: 'inherit', mr: 0.5 }}
            >
              {minimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

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
              '& ul, & ol': { pl: 3, my: 1 },
              '& li': { my: 0.5 },
              '& hr': {
                border: 'none',
                borderTop: `1px solid ${isDarkMode ? '#444' : '#e0e0e0'}`,
                my: 2,
              },
              '& p': { my: 1 },
            }}
          >
            {announcements ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{announcements}</ReactMarkdown>
            ) : (
              <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No schedule announcements have been defined.
              </Typography>
            )}
          </Box>
        )}
      </Paper>
    </Rnd>
  );
};

export default ScheduleAnnouncements;
