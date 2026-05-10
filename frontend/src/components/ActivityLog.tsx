import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  IconButton,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import { chatApi, ChatMessage } from '../api/chat';
import { formatTimeWithDate } from '../utils/dateUtils';

interface ActivityLogProps {
  netId: number;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onDetach?: () => void;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ netId, minimized, onMinimize, onRestore, onDetach }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch initial system messages on mount / netId change
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await chatApi.list(netId);
        setMessages(response.data.filter((m) => m.is_system));
      } catch (err) {
        console.error('ActivityLog: failed to fetch messages', err);
      }
    };
    fetchMessages();
  }, [netId]);

  // Listen for new messages from the NetView WebSocket dispatcher
  useEffect(() => {
    const handleNewMessage = (event: Event) => {
      const chatMsg = (event as CustomEvent<ChatMessage>).detail;
      if (!chatMsg.is_system) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        return [...prev, chatMsg];
      });
    };
    window.addEventListener('newChatMessage', handleNewMessage);
    return () => window.removeEventListener('newChatMessage', handleNewMessage);
  }, []);

  // Scroll to bottom whenever messages grow
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', border: 1, borderColor: 'divider', borderRadius: '4px', height: '100%', overflow: 'hidden' }}>
      {/* Title row */}
      <Box sx={{ flexShrink: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ borderBottom: 1, borderColor: 'divider', py: 0.5, backgroundColor: 'background.default' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  Activity Log
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    {onDetach && (
                      <IconButton
                        size="small"
                        onClick={onDetach}
                        title="Detach to floating window"
                        sx={{ p: 0.25, display: { xs: 'none', lg: 'inline-flex' } }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {(onMinimize || onRestore) && (
                      <IconButton
                        size="small"
                        onClick={minimized ? onRestore : onMinimize}
                        title={minimized ? 'Restore' : 'Minimize'}
                        sx={{ p: 0.25 }}
                      >
                        {minimized
                          ? <CropSquareIcon sx={{ fontSize: 14 }} />
                          : <MinimizeIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    )}
                  </Box>
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
      </Box>

      {!minimized && (
      <Box
        ref={containerRef}
        sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        p: 1,
        gap: 0.25,
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
          borderRadius: 3,
        },
      }}
    >
      {messages.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
          No activity yet.
        </Typography>
      ) : (
        messages.map((msg, index) => (
          <Box key={msg.id}>
            {index > 0 && <Divider sx={{ my: 0.25, opacity: 0.4 }} />}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {formatTimeWithDate(msg.created_at)}
              </Typography>
              <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
                {msg.message}
              </Typography>
            </Box>
          </Box>
        ))
      )}
      <div ref={bottomRef} />
    </Box>
      )}
    </Box>
  );
};

export default ActivityLog;
