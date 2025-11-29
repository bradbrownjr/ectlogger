import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  Snackbar,
  Alert,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { chatApi, ChatMessage } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { formatTimeWithDate } from '../utils/dateUtils';

interface ChatProps {
  netId: number;
  netStartedAt?: string;
  netStatus?: string;
  searchQuery?: string;
  onNewMessage?: (message: ChatMessage) => void;
}

const Chat: React.FC<ChatProps> = ({ netId, netStartedAt, netStatus, searchQuery, onNewMessage }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showClosedToast, setShowClosedToast] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Show toast when net is closed/archived
  useEffect(() => {
    if (netStatus === 'closed' || netStatus === 'archived') {
      setShowClosedToast(true);
    }
  }, [netStatus]);

  useEffect(() => {
    // Listen for chat_message events dispatched from NetView WebSocket
    const handleNewChatMessage = (event: any) => {
      const chatMsg = event.detail;
      setMessages((prev) => {
        // Only add if not already present (deduplication by id)
        if (prev.some((msg) => msg.id === chatMsg.id)) {
          return prev;
        }
        return [...prev, chatMsg];
      });
      if (onNewMessage) onNewMessage(chatMsg);
    };
    window.addEventListener('newChatMessage', handleNewChatMessage);
    return () => {
      window.removeEventListener('newChatMessage', handleNewChatMessage);
    };
  }, [user?.id]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [netId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Filter messages based on user preference for system messages AND search query
  const filteredMessages = messages.filter(m => {
    // First filter by system message preference
    if (user?.show_activity_in_chat === false && m.is_system) {
      return false;
    }
    // Then filter by search query if present
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const senderMatch = m.sender_callsign?.toLowerCase().includes(query) || 
                          m.sender_display_name?.toLowerCase().includes(query);
      const messageMatch = m.message?.toLowerCase().includes(query);
      return senderMatch || messageMatch;
    }
    return true;
  });

  const fetchMessages = async () => {
    try {
      const response = await chatApi.list(netId);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch chat messages:', error);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const response = await chatApi.create(netId, { message: newMessage.trim() });
      setNewMessage('');
      // Do NOT add message here; rely on WebSocket event to update chat for all clients
      // if (onNewMessage) onNewMessage(response.data);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const linkify = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#1976d2', textDecoration: 'underline' }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <Paper 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        border: 1,
        borderColor: 'divider',
        borderRadius: '4px',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Chat</TableCell>
            </TableRow>
          </TableHead>
        </Table>
      </Box>

      <List 
        ref={messagesContainerRef}
        sx={{ 
          flex: '1 1 auto',
          overflow: 'auto',
          p: 0.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          minHeight: 0,
          '&::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
            borderRadius: 4,
            '&:hover': {
              backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
            },
          },
        }}
      >
        {filteredMessages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No messages yet. Start the conversation!
          </Typography>
        ) : (
          filteredMessages.map((message, index) => (
            <Box key={message.id}>
              {message.is_system ? (
                // System message - IRC-style activity log
                <ListItem sx={{ px: 0.5, py: 0.25 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography 
                          component="span" 
                          variant="caption" 
                          color="text.secondary"
                        >
                          {formatTimeWithDate(message.created_at, user?.prefer_utc || false, netStartedAt)}
                        </Typography>
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{ 
                            color: 'text.secondary',
                            fontStyle: 'italic'
                          }}
                        >
                          *** {message.message} ***
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ) : (
                // Regular user message
                <ListItem 
                  alignItems="flex-start" 
                  sx={{ 
                    px: 0.5,
                    py: 0.25,
                    backgroundColor: message.user_id === user?.id ? 'action.selected' : 'transparent',
                    borderRadius: 1
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography 
                          component="span" 
                          variant="subtitle2" 
                          color="primary"
                          sx={{ fontWeight: 'bold' }}
                        >
                          {message.callsign}
                        </Typography>
                        <Typography 
                          component="span" 
                          variant="caption" 
                          color="text.secondary"
                        >
                          {formatTimeWithDate(message.created_at, user?.prefer_utc || false, netStartedAt)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ 
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {linkify(message.message)}
                      </Typography>
                    }
                  />
                </ListItem>
              )}
              {index < filteredMessages.length - 1 && <Divider component="li" />}
            </Box>
          ))
        )}
        <div ref={messagesEndRef} />
      </List>

      {netStatus !== 'closed' && netStatus !== 'archived' && (
        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={user ? "Type a message..." : "Sign in to send messages"}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sending || !user}
              multiline
              maxRows={3}
            />
            <IconButton 
              color="primary" 
              onClick={handleSend}
              disabled={!newMessage.trim() || sending || !user}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      )}

      <Snackbar
        open={showClosedToast}
        autoHideDuration={5000}
        onClose={() => setShowClosedToast(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowClosedToast(false)} severity="info" sx={{ width: '100%' }}>
          {netStatus === 'archived' 
            ? 'This net has been archived. You are viewing historical data.'
            : 'This net has been closed. Check-ins are no longer accepted.'}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default Chat;
