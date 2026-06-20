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
  Tooltip,
  Dialog,
  DialogContent,
  CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import CloseIcon from '@mui/icons-material/Close';
import { chatApi, ChatMessage, ChatImagePayload } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { formatTimeWithDate } from '../utils/dateUtils';
import UserAvatar from './UserAvatar';

interface ChatProps {
  netId: number;
  netStartedAt?: string;
  netStatus?: string;
  searchQuery?: string;
  canManage?: boolean;
  chatGracePeriodMinutes?: number;
  closedAt?: string;
  onlineUserIds?: number[];
  onProfileClick?: (userId: number) => void;
  onNewMessage?: (message: ChatMessage) => void;
  onDetach?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const REACTION_EMOJIS = ['👍', '🙂', '🙁', '❤️', '✅'];
const CHAT_IMAGE_PREFIX = '__CHAT_IMAGE__';

const Chat: React.FC<ChatProps> = ({ netId, netStartedAt, netStatus, searchQuery, canManage, chatGracePeriodMinutes, closedAt, onlineUserIds = [], onProfileClick, onNewMessage, onDetach, minimized, onMinimize, onRestore }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showClosedToast, setShowClosedToast] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ChatImagePayload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLUListElement>(null);

  // Tick every 30 s so grace period expiry is reflected without a page reload
  useEffect(() => {
    if (netStatus !== 'closed' || !chatGracePeriodMinutes || !closedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [netStatus, chatGracePeriodMinutes, closedAt]);

  // Chat remains open while within the grace window after close
  const isGracePeriodActive =
    netStatus === 'closed' &&
    !!chatGracePeriodMinutes &&
    !!closedAt &&
    now - new Date(closedAt).getTime() < chatGracePeriodMinutes * 60_000;

  // Show toast when net is closed/archived — suppressed for managers since NetView shows the archive reminder instead
  useEffect(() => {
    if ((netStatus === 'closed' || netStatus === 'archived') && !canManage) {
      setShowClosedToast(true);
    }
  }, [netStatus, canManage]);

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

    // Listen for reaction updates dispatched from NetView WebSocket
    const handleReactionUpdate = (event: any) => {
      const { message_id, reactions } = event.detail;
      setMessages((prev) =>
        prev.map((msg) => msg.id === message_id ? { ...msg, reactions } : msg)
      );
    };

    window.addEventListener('newChatMessage', handleNewChatMessage);
    window.addEventListener('chatReactionUpdate', handleReactionUpdate);
    return () => {
      window.removeEventListener('newChatMessage', handleNewChatMessage);
      window.removeEventListener('chatReactionUpdate', handleReactionUpdate);
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

  // Filter messages: Chat always shows only non-system messages
  // Chat input is disabled when the net is closed/archived, unless still within the grace period
  const netClosed = (netStatus === 'closed' && !isGracePeriodActive) || netStatus === 'archived';

  const filteredMessages = messages.filter(m => {
      if (m.is_system) return false;
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
      await chatApi.create(netId, { message: newMessage.trim() });
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

  const handleReaction = async (messageId: number, emoji: string) => {
    if (!user) return;
    try {
      await chatApi.toggleReaction(netId, messageId, emoji);
      // Optimistic UI: the WS broadcast will arrive and update all clients including this one
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  };

  const parseChatImage = (messageText: string): ChatImagePayload | null => {
    if (!messageText.startsWith(CHAT_IMAGE_PREFIX)) {
      return null;
    }
    try {
      const parsed = JSON.parse(messageText.slice(CHAT_IMAGE_PREFIX.length));
      if (
        parsed &&
        parsed.type === 'chat_image' &&
        typeof parsed.id === 'number' &&
        typeof parsed.image_url === 'string' &&
        typeof parsed.thumb_url === 'string'
      ) {
        return parsed as ChatImagePayload;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!user || netClosed) return;

    const file = Array.from(e.clipboardData.items)
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .find((f) => !!f);

    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return;
    }

    e.preventDefault();
    if (uploadingImage || sending) return;

    setUploadingImage(true);
    try {
      const upload = await chatApi.uploadImage(netId, file);
      await chatApi.create(netId, { message: upload.data.marker });
    } catch (error) {
      console.error('Failed to paste/upload chat image:', error);
      setUploadError('Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
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
      <Box sx={{ flexShrink: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.default' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  Chat
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
        <>
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
            <Box
              key={message.id}
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
              sx={{ position: 'relative' }}
            >
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
                    borderRadius: 1,
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box
                          onClick={() => message.user_id && onProfileClick?.(message.user_id)}
                          sx={{ cursor: message.user_id && onProfileClick ? 'pointer' : 'default', display: 'inline-flex' }}
                        >
                          <UserAvatar
                            avatarUrl={message.avatar_url}
                            callsign={message.callsign}
                            size={24}
                            hasProfile={!!message.user_id}
                            isOnline={!!(message.user_id && onlineUserIds.includes(message.user_id))}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
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
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {formatTimeWithDate(message.created_at, user?.prefer_utc || false, netStartedAt)}
                          </Typography>
                        </Box>
                      </Box>
                    }
                    secondary={
                      <Box component="span">
                        {(() => {
                          const imagePayload = parseChatImage(message.message);
                          if (!imagePayload) {
                            return (
                              <Typography
                                component="span"
                                variant="body2"
                                sx={{
                                  wordBreak: 'break-word',
                                  whiteSpace: 'pre-wrap',
                                  display: 'block',
                                }}
                              >
                                {linkify(message.message)}
                              </Typography>
                            );
                          }
                          return (
                            <Box sx={{ mt: 0.5 }}>
                              <Box
                                component="img"
                                src={imagePayload.thumb_url}
                                alt="Chat upload"
                                onClick={() => setLightboxImage(imagePayload)}
                                sx={{
                                  display: 'block',
                                  maxWidth: 220,
                                  maxHeight: 220,
                                  borderRadius: 1,
                                  border: 1,
                                  borderColor: 'divider',
                                  cursor: 'zoom-in',
                                  backgroundColor: 'background.default',
                                }}
                              />
                            </Box>
                          );
                        })()}
                        {/* Reaction counts */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            {Object.entries(message.reactions).map(([emoji, userIds]) =>
                              userIds.length > 0 ? (
                                <Tooltip
                                  key={emoji}
                                  title={`${userIds.length} reaction${userIds.length !== 1 ? 's' : ''}`}
                                >
                                  <Box
                                    component="span"
                                    onClick={!netClosed ? () => handleReaction(message.id, emoji) : undefined}
                                    sx={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 0.25,
                                      px: 0.75,
                                      py: 0.25,
                                      borderRadius: 3,
                                      fontSize: '0.75rem',
                                      cursor: user && !netClosed ? 'pointer' : 'default',
                                      border: 1,
                                      borderColor: userIds.includes(user?.id ?? -1) ? 'primary.main' : 'divider',
                                      backgroundColor: userIds.includes(user?.id ?? -1) ? 'primary.light' : 'action.hover',
                                      opacity: userIds.includes(user?.id ?? -1) ? 1 : 0.85,
                                      '&:hover': user && !netClosed ? { borderColor: 'primary.main', opacity: 1 } : {},
                                    }}
                                  >
                                    {emoji} {userIds.length}
                                  </Box>
                                </Tooltip>
                              ) : null
                            )}
                          </Box>
                        )}
                      </Box>
                    }
                  />
                  {/* Hover emoji toolbar — hidden on your own messages and on closed/archived nets */}
                  {hoveredMessageId === message.id && user && message.user_id !== user.id && !netClosed && (
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 4,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        gap: 0.25,
                        backgroundColor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 2,
                        px: 0.5,
                        py: 0.25,
                        boxShadow: 1,
                        zIndex: 1,
                      }}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <Tooltip key={emoji} title={emoji}>
                          <IconButton
                            size="small"
                            onClick={() => handleReaction(message.id, emoji)}
                            sx={{
                              fontSize: '1rem',
                              p: 0.25,
                              minWidth: 'unset',
                              opacity: (message.reactions?.[emoji] ?? []).includes(user.id) ? 1 : 0.6,
                              '&:hover': { opacity: 1 },
                            }}
                          >
                            {emoji}
                          </IconButton>
                        </Tooltip>
                      ))}
                    </Box>
                  )}
                </ListItem>
              )}
              {index < filteredMessages.length - 1 && <Divider component="li" />}
            </Box>
          ))
        )}
        <div ref={messagesEndRef} />
      </List>

      {!netClosed && (
        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={user ? "Type a message or paste an image..." : "Sign in to send messages"}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              disabled={sending || uploadingImage || !user}
              multiline
              maxRows={3}
            />
            <IconButton 
              color="primary" 
              onClick={handleSend}
              disabled={!newMessage.trim() || sending || uploadingImage || !user}
            >
              {uploadingImage ? <CircularProgress size={20} /> : <SendIcon />}
            </IconButton>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {uploadingImage ? 'Uploading pasted image...' : 'Tip: paste PNG/JPEG/WEBP images directly into chat.'}
          </Typography>
        </Box>
      )}
      </>)}

      <Dialog
        open={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        maxWidth="lg"
      >
        <DialogContent sx={{ p: 1, bgcolor: 'background.default', position: 'relative' }}>
          <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
            {lightboxImage && (
              <IconButton
                size="small"
                component="a"
                href={lightboxImage.image_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton
              size="small"
              onClick={() => setLightboxImage(null)}
              sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          {lightboxImage && (
            <Box
              component="img"
              src={lightboxImage.image_url}
              alt="Full chat upload"
              sx={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '85vh',
                width: 'auto',
                height: 'auto',
                borderRadius: 1,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={!!uploadError}
        autoHideDuration={5000}
        onClose={() => setUploadError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setUploadError(null)} severity="error" sx={{ width: '100%' }}>
          {uploadError}
        </Alert>
      </Snackbar>

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
