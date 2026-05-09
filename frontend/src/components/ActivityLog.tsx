import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Divider,
} from '@mui/material';
import { chatApi, ChatMessage } from '../api/chat';
import { formatTimeWithDate } from '../utils/dateUtils';

interface ActivityLogProps {
  netId: number;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ netId }) => {
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
  );
};

export default ActivityLog;
