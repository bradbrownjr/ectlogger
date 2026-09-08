import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  MenuItem,
  MenuList,
  Popper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  Snackbar,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  useTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import ReplyIcon from '@mui/icons-material/Reply';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { chatApi, ChatMessage, ChatImagePayload, ChatReplyPreview, ChatNetMute, formatChatMessageText } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { formatTimeWithDate } from '../utils/dateUtils';
import { sneakInFade, SNEAK_IN_HIGHLIGHT_MS } from './netview/sneakInHighlight';
import UserAvatar from './UserAvatar';

interface ChatProps {
  netId: number;
  netStartedAt?: string;
  netStatus?: string;
  searchQuery?: string;
  canManage?: boolean;
  // NCS or Logger on this net -- gates the net-wide mute control
  // (shift+click the mute icon). A superset of canManage, which excludes
  // Logger. Matches the backend's check_net_permission(..., ["NCS", "LOGGER"])
  // gate on POST/DELETE /chat/nets/{id}/net-mutes.
  canManageCheckIns?: boolean;
  chatGracePeriodMinutes?: number;
  closedAt?: string;
  onlineUserIds?: number[];
  onProfileClick?: (userId: number) => void;
  onNewMessage?: (message: ChatMessage) => void;
  onDetach?: () => void;
  onPopOut?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  topicOfWeekEnabled?: boolean;
  topicOfWeekPrompt?: string | null;
  pollEnabled?: boolean;
  pollQuestion?: string | null;
  /** This net's check-ins, cross-referenced with onlineUserIds to build the
   *  @mention roster (see mentionRoster below). Passed raw rather than
   *  pre-derived so all three Chat placements (attached, floating,
   *  popped-out window) hand over the same thing they already hold.
   *  onlineUserIds itself comes from useNetData's own GET /nets/{id}/stats
   *  fetch (manager.get_online_users on the backend -- real live-socket
   *  presence, not a last-active timestamp), which every consumer of that
   *  hook gets for free on mount/reconnect. The popped-out window
   *  (NetPaneWindow.tsx) used to hardcode onlineUserIds to [] instead of
   *  reading it out of the hook it already calls -- fixed 2026-09-06, so
   *  presence (and therefore the mention roster) now works there too. */
  checkIns?: any[];
}

const REACTION_EMOJIS = ['👍', '🙂', '🤣', '🙁', '❤️', '✅'];
const CHAT_IMAGE_PREFIX = '__CHAT_IMAGE__';

// The partial @token the caret is sitting on, matched at the end of the
// composer's text. Deliberately end-of-string rather than caret-aware: a
// multiline TextField makes true caret parsing fiddly, and typing a mention
// mid-sentence and then going back to edit it is rare enough that the
// autocomplete simply staying closed is an acceptable outcome. Token charset
// matches the backend's (callsigns carry digits and portable /P, /M suffixes).
const MENTION_TOKEN_AT_END = /(^|\s)@([A-Za-z0-9/_-]*)$/;
const MAX_MENTION_SUGGESTIONS = 6;

const Chat: React.FC<ChatProps> = ({ netId, netStartedAt, netStatus, searchQuery, canManage, canManageCheckIns, chatGracePeriodMinutes, closedAt, onlineUserIds = [], onProfileClick, onNewMessage, onDetach, onPopOut, minimized, onMinimize, onRestore, topicOfWeekEnabled, topicOfWeekPrompt, pollEnabled, pollQuestion, checkIns = [] }) => {
  const { user } = useAuth();
  const theme = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showClosedToast, setShowClosedToast] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ChatImagePayload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Inline edit of your own message (see the hover pencil below)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  // The message the composer is currently answering, if any
  const [replyingTo, setReplyingTo] = useState<ChatReplyPreview | null>(null);
  // Partial @token being typed, or null when the mention list is closed
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  // Messages briefly flashing gold: you were mentioned, or you jumped here
  // from a reply's quote block
  const [flashedMessageIds, setFlashedMessageIds] = useState<Set<number>>(new Set());
  // Personal, per-net mutes this viewer has set (user_id -> callsign). Hides
  // that station's messages from this browser's view only. See netMutes
  // below for the net-wide, staff-applied counterpart -- hides for every
  // viewer, not just this one.
  const [mutedUsers, setMutedUsers] = useState<Map<number, string>>(new Map());
  // Net-wide mutes, visible to every viewer regardless of role -- everyone's
  // client has to filter these out of its own view, not just staff's.
  const [netMutes, setNetMutes] = useState<Map<number, ChatNetMute>>(new Map());
  const [muteManagerOpen, setMuteManagerOpen] = useState(false);
  const [muteFeedback, setMuteFeedback] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLUListElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const flashTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Same one-shot gold flash the check-in table uses for a self check-in, so
  // "look here" reads identically across the app.
  const flashMessage = useCallback((messageId: number) => {
    setFlashedMessageIds((prev) => new Set(prev).add(messageId));
    const existing = flashTimers.current.get(messageId);
    if (existing) clearTimeout(existing);
    flashTimers.current.set(messageId, setTimeout(() => {
      flashTimers.current.delete(messageId);
      setFlashedMessageIds((prev) => {
        if (!prev.has(messageId)) return prev;
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }, SNEAK_IN_HIGHLIGHT_MS));
  }, []);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => { timers.forEach((timer) => clearTimeout(timer)); };
  }, []);

  // Stations that can be @mentioned: checked in, with an account, AND
  // currently signed into the app (onlineUserIds) -- someone checked in by
  // voice with the app closed has no session to highlight anything on, and
  // offering them in the autocomplete just invites a mention nobody will
  // ever see flash. The backend's own mention resolution still matches
  // against the full roster regardless of online status (so a mention typed
  // by hand still tags them for whenever they next open the message), this
  // only narrows what the autocomplete *suggests*.
  const mentionRoster = useMemo(() => {
    const byUserId = new Map<number, string>();
    for (const checkIn of checkIns) {
      if (checkIn.user_id == null || !checkIn.callsign) continue;
      if (!onlineUserIds.includes(checkIn.user_id)) continue;
      if (!byUserId.has(checkIn.user_id)) byUserId.set(checkIn.user_id, checkIn.callsign);
    }
    return Array.from(byUserId, ([id, callsign]) => ({ id, callsign }));
  }, [checkIns, onlineUserIds]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return mentionRoster
      .filter((entry) => entry.callsign.toLowerCase().includes(query))
      .slice(0, MAX_MENTION_SUGGESTIONS);
  }, [mentionQuery, mentionRoster]);

  const mentionOpen = mentionQuery !== null && mentionMatches.length > 0;

  // A quoted reply preview carries only a callsign, not a user_id, so muted
  // detection there matches by callsign rather than id -- keeps a muted
  // station's words from reappearing inside someone else's reply quote,
  // which would otherwise defeat the mute. Merges personal and net-wide.
  const mutedCallsigns = useMemo(() => {
    const callsigns = Array.from(mutedUsers.values());
    const netCallsigns = Array.from(netMutes.values()).map((m) => m.callsign || `User ${m.muted_user_id}`);
    return new Set([...callsigns, ...netCallsigns].map((c) => c.toUpperCase()));
  }, [mutedUsers, netMutes]);

  // Distinct count across both kinds, for the single combined banner below --
  // a station could in principle be both personally and net-wide muted.
  const totalMutedCount = useMemo(
    () => new Set([...mutedUsers.keys(), ...netMutes.keys()]).size,
    [mutedUsers, netMutes]
  );

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
      // Flash only messages that arrive live. The initial fetchMessages()
      // load deliberately never flashes -- every past mention would light up
      // at once on every page load or reconnect, which is exactly the noise
      // the highlight is meant to cut through.
      if (user?.id && chatMsg.mentioned_user_ids?.includes(user.id)) {
        flashMessage(chatMsg.id);
      }
      if (onNewMessage) onNewMessage(chatMsg);
    };

    // An edit re-resolves mentions server-side, so an edit is also how someone
    // can end up mentioned by a message they already have on screen.
    const handleChatMessageEdited = (event: any) => {
      const updated = event.detail;
      setMessages((prev) =>
        prev.map((msg) => msg.id === updated.id ? { ...msg, ...updated } : msg)
      );
      if (user?.id && updated.mentioned_user_ids?.includes(user.id)) {
        flashMessage(updated.id);
      }
    };

    // Listen for reaction updates dispatched from NetView WebSocket
    const handleReactionUpdate = (event: any) => {
      const { message_id, reactions } = event.detail;
      setMessages((prev) =>
        prev.map((msg) => msg.id === message_id ? { ...msg, reactions } : msg)
      );
    };

    // A net-wide mute was applied or lifted by staff -- update this tab's
    // filter/banner immediately. Without this, only the message-broadcast
    // suppression itself would be live; an already-open tab's own mute list
    // would silently go stale until reloaded.
    const handleNetMuteChanged = (event: any) => {
      const data = event.detail;
      setNetMutes((prev) => {
        const next = new Map(prev);
        if (data.active) {
          next.set(data.muted_user_id, data);
        } else {
          next.delete(data.muted_user_id);
        }
        return next;
      });
    };

    // The socket dropped and came back, so every message sent during the gap
    // was broadcast to nobody here. Refetch the thread wholesale rather than
    // trying to reason about what was missed -- see useNetWebSocket.ts. Also
    // re-fetch net-wide mutes for the same reason: a mute applied or lifted
    // during the gap would otherwise be missed since it's a one-shot event,
    // not something the refetched message list itself would reveal.
    const handleResync = (event: any) => {
      if (event.detail?.netId && String(event.detail.netId) !== String(netId)) return;
      fetchMessages();
      if (user?.id) {
        chatApi.listNetMutes(netId)
          .then((response) => setNetMutes(new Map(response.data.map((m) => [m.muted_user_id, m]))))
          .catch((error) => console.error('Failed to re-fetch net-wide chat mutes on resync:', error));
      }
    };

    window.addEventListener('newChatMessage', handleNewChatMessage);
    window.addEventListener('chatMessageEdited', handleChatMessageEdited);
    window.addEventListener('chatReactionUpdate', handleReactionUpdate);
    window.addEventListener('chatNetMuteChanged', handleNetMuteChanged);
    window.addEventListener('netResync', handleResync);
    return () => {
      window.removeEventListener('newChatMessage', handleNewChatMessage);
      window.removeEventListener('chatMessageEdited', handleChatMessageEdited);
      window.removeEventListener('chatReactionUpdate', handleReactionUpdate);
      window.removeEventListener('chatNetMuteChanged', handleNetMuteChanged);
      window.removeEventListener('netResync', handleResync);
    };
  }, [user?.id, netId, flashMessage]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [netId]);

  // Guests can't set mutes (no account to store a list against), and there's
  // nothing to fetch for them.
  useEffect(() => {
    if (!user?.id) {
      setMutedUsers(new Map());
      return;
    }
    chatApi.listMutes(netId)
      .then((response) => {
        setMutedUsers(new Map(response.data.map((m) => [m.muted_user_id, m.callsign || `User ${m.muted_user_id}`])));
      })
      .catch((error) => console.error('Failed to fetch chat mutes:', error));
  }, [netId, user?.id]);

  // Net-wide mutes affect every viewer's rendering, not just staff's, so this
  // fetches regardless of role -- only applying/lifting one is staff-gated.
  useEffect(() => {
    if (!user?.id) {
      setNetMutes(new Map());
      return;
    }
    chatApi.listNetMutes(netId)
      .then((response) => {
        setNetMutes(new Map(response.data.map((m) => [m.muted_user_id, m])));
      })
      .catch((error) => console.error('Failed to fetch net-wide chat mutes:', error));
  }, [netId, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Filter messages: Chat always shows only non-system messages
  // Chat input is disabled when the net is closed/archived, unless still within the grace period
  const netClosed = (netStatus === 'closed' && !isGracePeriodActive) || netStatus === 'archived';

  const filteredMessages = messages.filter(m => {
      if (m.is_system) return false;
      // A muted station's messages are hidden -- personal mutes from this
      // viewer's own rendering only, net-wide mutes from everyone's -- but
      // never from the author's own view of their own words, even if staff
      // muted them net-wide.
      if (m.user_id != null && m.user_id !== user?.id && (mutedUsers.has(m.user_id) || netMutes.has(m.user_id))) return false;
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
      await chatApi.create(netId, { message: newMessage.trim(), reply_to_message_id: replyingTo?.id ?? null });
      setNewMessage('');
      setReplyingTo(null);
      setMentionQuery(null);
      // Do NOT add message here; rely on WebSocket event to update chat for all clients
      // if (onNewMessage) onNewMessage(response.data);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  // ========== @MENTION AUTOCOMPLETE ==========

  const handleComposerChange = (value: string) => {
    setNewMessage(value);
    const match = value.match(MENTION_TOKEN_AT_END);
    setMentionQuery(match ? match[2] : null);
    setMentionIndex(0);
  };

  const applyMention = (callsign: string) => {
    setNewMessage((prev) => prev.replace(/@([A-Za-z0-9/_-]*)$/, `@${callsign} `));
    setMentionQuery(null);
    setMentionIndex(0);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent) => {
    // While the mention list is open it owns Enter/Tab/arrows, or picking a
    // callsign with the keyboard would send the half-typed message instead.
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mentionMatches[mentionIndex].callsign);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ========== INLINE EDIT (OWN MESSAGES) ==========

  const startEdit = (message: ChatMessage) => {
    setEditingMessageId(message.id);
    setEditingText(message.message);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async () => {
    if (editingMessageId === null || !editingText.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await chatApi.update(netId, editingMessageId, editingText.trim());
      // The chat_message_edited broadcast updates every client including this
      // one, matching how sending and reacting already work.
      cancelEdit();
    } catch (error) {
      console.error('Failed to edit message:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // ========== REPLY ==========

  const startReply = (message: ChatMessage) => {
    setReplyingTo({
      id: message.id,
      callsign: message.callsign,
      message: formatChatMessageText(message.message),
    });
  };

  // Jumps to the quoted message when its quote block is clicked. Does nothing
  // if that message isn't currently rendered (filtered out by search, or older
  // than the loaded thread) rather than fetching it specially.
  const scrollToMessage = (messageId: number) => {
    const node = messageRefs.current.get(messageId);
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flashMessage(messageId);
  };

  // ========== PERSONAL MUTE ==========

  const handleMute = async (targetUserId: number, callsign: string) => {
    try {
      await chatApi.mute(netId, targetUserId);
      setMutedUsers((prev) => new Map(prev).set(targetUserId, callsign));
      setMuteFeedback(`${callsign} muted in this net. Manage mutes from the banner above the chat.`);
    } catch (error) {
      console.error('Failed to mute station:', error);
    }
  };

  const handleUnmute = async (targetUserId: number) => {
    try {
      await chatApi.unmute(netId, targetUserId);
      setMutedUsers((prev) => {
        const next = new Map(prev);
        next.delete(targetUserId);
        return next;
      });
    } catch (error) {
      console.error('Failed to unmute station:', error);
    }
  };

  // ========== NET-WIDE MUTE (NCS/Logger) ==========
  // Shift+click on the mute icon, staff only -- hides the station for every
  // viewer, not just this one. The server re-checks NCS/Logger itself, so a
  // non-staff shift+click (canManageCheckIns false) is never even attempted
  // here -- see the onClick handler below, which falls back to handleMute.

  const handleNetMute = async (targetUserId: number, callsign: string) => {
    try {
      const response = await chatApi.netMute(netId, targetUserId);
      setNetMutes((prev) => new Map(prev).set(targetUserId, response.data));
      setMuteFeedback(`${callsign} muted for everyone in this net. Manage from the banner above the chat.`);
    } catch (error) {
      console.error('Failed to net-wide mute station:', error);
    }
  };

  const handleNetUnmute = async (targetUserId: number) => {
    try {
      await chatApi.netUnmute(netId, targetUserId);
      setNetMutes((prev) => {
        const next = new Map(prev);
        next.delete(targetUserId);
        return next;
      });
    } catch (error) {
      console.error('Failed to lift net-wide mute:', error);
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
            style={{ color: theme.palette.primary.main, textDecoration: 'underline' }}
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
                    {/* Grouped so the two actions that stay within this browser
                        tab (minimize, float) sit together, with the one that
                        leaves to a separate window (pop-out) last. */}
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
                    {onDetach && (
                      <IconButton
                        size="small"
                        onClick={onDetach}
                        title="Detach to floating window"
                        sx={{ p: 0.25, display: { xs: 'none', lg: 'inline-flex' } }}
                      >
                        <PictureInPictureAltIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {onPopOut && (
                      // Unlike float (needs in-page room to drag), a real
                      // window pop-out needs no page space at all, so unlike
                      // the float button, it's never hidden at any width.
                      <IconButton
                        size="small"
                        onClick={onPopOut}
                        title="Open in new window"
                        sx={{ p: 0.25 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
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
      {((topicOfWeekEnabled && topicOfWeekPrompt) || (pollEnabled && pollQuestion)) && (
        <Box
          sx={{
            flexShrink: 0,
            px: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}
        >
          {topicOfWeekEnabled && topicOfWeekPrompt && (
            <Typography variant="body2">
              <strong>Topic of the Week:</strong> {topicOfWeekPrompt}
            </Typography>
          )}
          {pollEnabled && pollQuestion && (
            <Typography variant="body2" sx={{ mt: (topicOfWeekEnabled && topicOfWeekPrompt) ? 0.5 : 0 }}>
              <strong>Poll:</strong> {pollQuestion}
            </Typography>
          )}
        </Box>
      )}
      {totalMutedCount > 0 && (
        // Tells the viewer their own filter is on and lets them undo it --
        // without this, a mute set once and forgotten reads as a bug report.
        // Deliberately doesn't say "(only for you)" here -- a net-wide mute
        // hides the station for everyone, not just this viewer.
        <Box
          sx={{
            flexShrink: 0,
            px: 1.5,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            <VolumeOffIcon sx={{ fontSize: '0.9rem', verticalAlign: 'text-bottom', mr: 0.5 }} />
            {totalMutedCount} station{totalMutedCount !== 1 ? 's' : ''} muted in this net's chat
          </Typography>
          <Button size="small" onClick={() => setMuteManagerOpen(true)} sx={{ minWidth: 'unset', py: 0 }}>
            Manage
          </Button>
        </Box>
      )}
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
              ref={(node: HTMLDivElement | null) => {
                if (node) messageRefs.current.set(message.id, node);
                else messageRefs.current.delete(message.id);
              }}
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
              sx={{
                position: 'relative',
                // Gold flash: you were just mentioned, or you jumped here from
                // a reply's quote block. Same keyframe as the check-in table.
                ...(flashedMessageIds.has(message.id)
                  ? { animation: `${sneakInFade} ${SNEAK_IN_HIGHLIGHT_MS}ms ease-out`, borderRadius: 1 }
                  : {}),
              }}
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
                    // Own messages carry a tint, but it paints over the gold
                    // flash on the wrapper (a child always wins), so it steps
                    // aside while this message is flashing.
                    backgroundColor: message.user_id === user?.id && !flashedMessageIds.has(message.id)
                      ? 'action.selected'
                      : 'transparent',
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
                            onClick={() => message.user_id && onProfileClick?.(message.user_id)}
                            sx={{ fontWeight: 'bold', cursor: message.user_id && onProfileClick ? 'pointer' : 'default' }}
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
                          {/* Marks a message whose text was overwritten after sending */}
                          {message.edited_at && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}
                            >
                              (edited)
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                    secondary={
                      <Box component="span">
                        {/* Quoted message this one replies to (Signal-style:
                            the quote sits above the reply's own text, not in a
                            nested thread). Click jumps to the original. */}
                        {message.reply_to && (() => {
                          const replyMuted = mutedCallsigns.has(message.reply_to.callsign.toUpperCase());
                          return (
                            <Box
                              component="span"
                              onClick={replyMuted ? undefined : () => scrollToMessage(message.reply_to!.id)}
                              sx={{
                                display: 'block',
                                borderLeft: 3,
                                borderColor: 'primary.main',
                                borderRadius: '0 4px 4px 0',
                                backgroundColor: 'action.hover',
                                px: 1,
                                py: 0.25,
                                mb: 0.5,
                                cursor: replyMuted ? 'default' : 'pointer',
                              }}
                            >
                              <Typography component="span" variant="caption" color="primary" sx={{ display: 'block', fontWeight: 'bold' }}>
                                {replyMuted ? 'Muted station' : message.reply_to.callsign}
                              </Typography>
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: replyMuted ? 'italic' : 'normal' }}
                              >
                                {replyMuted ? 'Message hidden (muted)' : formatChatMessageText(message.reply_to.message)}
                              </Typography>
                            </Box>
                          );
                        })()}
                        {editingMessageId === message.id ? (
                          /* Inline edit: Enter saves, Escape cancels */
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 0.5 }}>
                            <TextField
                              fullWidth
                              size="small"
                              autoFocus
                              multiline
                              maxRows={4}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              disabled={savingEdit}
                            />
                            <Tooltip title="Save">
                              <span>
                                <IconButton size="small" color="primary" onClick={handleSaveEdit} disabled={!editingText.trim() || savingEdit}>
                                  <CheckIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Cancel">
                              <span>
                                <IconButton size="small" onClick={cancelEdit} disabled={savingEdit}>
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        ) : (() => {
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
                  {/* Hover action toolbar — hidden on closed/archived nets and
                      while this message is being edited. Reactions only appear
                      on other people's messages (the backend rejects reacting
                      to your own); reply appears on every message; the edit
                      pencil only on your own text messages, since an uploaded
                      image has no text to rewrite. */}
                  {hoveredMessageId === message.id && user && !netClosed && editingMessageId !== message.id && (
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
                      {message.user_id !== user.id && REACTION_EMOJIS.map((emoji) => (
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
                      <Tooltip title="Reply">
                        <IconButton size="small" onClick={() => startReply(message)} sx={{ p: 0.25 }}>
                          <ReplyIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Tooltip>
                      {message.user_id !== user.id && message.user_id != null && (
                        <Tooltip title={canManageCheckIns ? 'Mute this station (only for you) — Shift+click to mute for everyone' : 'Mute this station (only for you)'}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              if (e.shiftKey && canManageCheckIns) {
                                handleNetMute(message.user_id!, message.callsign);
                              } else {
                                handleMute(message.user_id!, message.callsign);
                              }
                            }}
                            sx={{ p: 0.25 }}
                          >
                            <VolumeOffIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {message.user_id === user.id && !parseChatImage(message.message) && (
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => startEdit(message)} sx={{ p: 0.25 }}>
                            <EditIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                      )}
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
        <Box ref={composerRef} sx={{ p: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          {/* Reply target bar — shown while the composer is answering a
              message, dismissible with the X or Escape */}
          {replyingTo && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 0.5,
                px: 1,
                py: 0.5,
                borderLeft: 3,
                borderColor: 'primary.main',
                borderRadius: '0 4px 4px 0',
                backgroundColor: 'action.hover',
              }}
            >
              <ReplyIcon fontSize="small" color="primary" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="primary" sx={{ display: 'block', fontWeight: 'bold' }}>
                  Replying to {replyingTo.callsign}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {replyingTo.message}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setReplyingTo(null)} title="Cancel reply">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={user ? "Type a message, @callsign, or paste an image..." : "Sign in to send messages"}
              value={newMessage}
              onChange={(e) => handleComposerChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
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

          {/* ========== @MENTION AUTOCOMPLETE ==========
              Opens above the composer while an @token is being typed. Only
              stations checked into this net with an account are listed, since
              those are the only ones the backend will resolve to a highlight.
              onMouseDown (not onClick) so picking with the mouse never blurs
              the composer first. */}
          <Popper open={mentionOpen} anchorEl={composerRef.current} placement="top-start" sx={{ zIndex: theme.zIndex.modal }}>
            <Paper elevation={6} sx={{ minWidth: 160, maxHeight: 200, overflowY: 'auto' }}>
              <MenuList dense>
                {mentionMatches.map((entry, index) => (
                  <MenuItem
                    key={entry.id}
                    selected={index === mentionIndex}
                    onMouseDown={(e) => { e.preventDefault(); applyMention(entry.callsign); }}
                  >
                    {entry.callsign}
                  </MenuItem>
                ))}
              </MenuList>
            </Paper>
          </Popper>
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

      <Dialog open={muteManagerOpen} onClose={() => setMuteManagerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Muted Stations</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mt: 0.5 }}>Your personal mutes</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Hides a station's chat messages from your own view of this net only -- nobody else is affected.
          </Typography>
          {mutedUsers.size === 0 ? (
            <Typography variant="body2" color="text.secondary">No stations muted in this net.</Typography>
          ) : (
            Array.from(mutedUsers.entries()).map(([userId, callsign]) => (
              <Box key={userId} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2">{callsign}</Typography>
                <Button size="small" onClick={() => handleUnmute(userId)}>Unmute</Button>
              </Box>
            ))
          )}

          {(netMutes.size > 0 || canManageCheckIns) && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Muted for everyone</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {canManageCheckIns
                  ? "Hides a station's messages live for every viewer in this net. NCS/Logger only -- doesn't carry over to the net's next occurrence."
                  : "Hidden from every viewer in this net by staff."}
              </Typography>
              {netMutes.size === 0 ? (
                <Typography variant="body2" color="text.secondary">No stations muted for everyone.</Typography>
              ) : canManageCheckIns ? (
                Array.from(netMutes.values()).map((mute) => (
                  <Box key={mute.muted_user_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                    <Box>
                      <Typography variant="body2">{mute.callsign || `User ${mute.muted_user_id}`}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        by {mute.applied_by_callsign || `User ${mute.applied_by_user_id}`} · {formatTimeWithDate(mute.created_at)}
                      </Typography>
                    </Box>
                    <Button size="small" onClick={() => handleNetUnmute(mute.muted_user_id)}>Unmute</Button>
                  </Box>
                ))
              ) : (
                // Non-staff sees that a net-wide mute is in effect (so a
                // vanished station doesn't read as a bug), but not who
                // applied it -- that audit detail is staff-only.
                <Typography variant="body2" color="text.secondary">
                  {netMutes.size} station{netMutes.size !== 1 ? 's' : ''} muted for everyone by staff.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMuteManagerOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!muteFeedback}
        autoHideDuration={4000}
        onClose={() => setMuteFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setMuteFeedback(null)} severity="info" sx={{ width: '100%' }}>
          {muteFeedback}
        </Alert>
      </Snackbar>

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
