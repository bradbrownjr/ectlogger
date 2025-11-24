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
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { chatApi, ChatMessage } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';

interface ChatProps {
  netId: number;
  onNewMessage?: (message: ChatMessage) => void;
}

const Chat: React.FC<ChatProps> = ({ netId, onNewMessage }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchMessages();
  }, [netId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      setMessages([...messages, response.data]);
      setNewMessage('');
      
      if (onNewMessage) {
        onNewMessage(response.data);
      }
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

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <Paper 
      sx={{ 
        height: { xs: '400px', md: '100%' },
        display: 'flex', 
        flexDirection: 'column'
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">Chat</Typography>
      </Box>

      <List 
        sx={{ 
          flexGrow: 1, 
          overflow: 'auto', 
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1
        }}
      >
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No messages yet. Start the conversation!
          </Typography>
        ) : (
          messages.map((message, index) => (
            <Box key={message.id}>
              <ListItem 
                alignItems="flex-start" 
                sx={{ 
                  px: 0,
                  py: 1,
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
                        {formatTime(message.created_at)}
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
              {index < messages.length - 1 && <Divider component="li" />}
            </Box>
          ))
        )}
        <div ref={messagesEndRef} />
      </List>

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Type a message..."
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
        {!user && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Sign in to send messages
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default Chat;
