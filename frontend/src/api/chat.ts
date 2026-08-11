import api from '../services/api';

export interface ChatMessage {
  id: number;
  net_id: number;
  user_id: number | null;
  callsign: string;
  sender_callsign?: string;
  sender_display_name?: string;
  message: string;
  created_at: string;
  is_system: boolean;
  reactions?: Record<string, number[]>;  // emoji -> [user_ids]
  avatar_url?: string | null;
}

export interface ChatImagePayload {
  type: 'chat_image';
  id: number;
  image_url: string;
  thumb_url: string;
  width: number;
  height: number;
}

export interface ChatImageUploadResponse {
  id: number;
  image_url: string;
  thumb_url: string;
  width: number;
  height: number;
  size_bytes: number;
  marker: string;
}

export interface ChatMessageCreate {
  message: string;
}

const CHAT_IMAGE_PREFIX = '__CHAT_IMAGE__';

/** Returns a display-safe version of a chat message, replacing image payloads with "[Photo]". */
export function formatChatMessageText(message: string): string {
  return message.startsWith(CHAT_IMAGE_PREFIX) ? '[Photo]' : message;
}

// ========== IN-FLIGHT COALESCING FOR chatApi.list ==========
// Chat.tsx and ActivityLog.tsx are separate panels that both render this net's
// messages (ActivityLog filters to is_system), so they each fetch the full
// thread independently -- on mount, and again on every netResync after a
// dropped connection. That doubled a potentially large payload at the exact
// moment bandwidth is worst, which matters for the degraded links this app is
// built to survive.
//
// They genuinely cannot share state: a popped-out panel is a real window.open
// document with its own React root (see usePoppedOutWindow.ts), so a context
// or shared hook can't span them. Coalescing at the request layer works
// regardless of how the panels are arranged.
//
// Scoped to this one call deliberately -- a blanket app-wide GET cache would
// change behavior for callers that legitimately expect an independent read.
//
// Note: incremental catch-up ("only messages newer than id N") is NOT a valid
// alternative here. Chat supports deletion and reactions, so a message removed
// or reacted to during an outage would never update. The full refetch is the
// correct behavior; this only stops us paying for it twice.
const inFlightLists = new Map<number, Promise<{ data: ChatMessage[] }>>();

export const chatApi = {
  list: (netId: number) => {
    const pending = inFlightLists.get(netId);
    // Hand every caller its own array so no panel can disturb another's copy.
    const copy = (r: { data: ChatMessage[] }) => ({ ...r, data: [...r.data] });
    if (pending) return pending.then(copy);

    const request = api.get<ChatMessage[]>(`/chat/nets/${netId}/messages`)
      .finally(() => { inFlightLists.delete(netId); });
    inFlightLists.set(netId, request);
    return request.then(copy);
  },

  create: (netId: number, data: ChatMessageCreate) =>
    api.post<ChatMessage>(`/chat/nets/${netId}/messages`, data),

  delete: (netId: number, messageId: number) =>
    api.delete(`/chat/nets/${netId}/messages/${messageId}`),

  toggleReaction: (netId: number, messageId: number, emoji: string) =>
    api.post(`/chat/nets/${netId}/messages/${messageId}/reactions`, { emoji }),

  uploadImage: (netId: number, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<ChatImageUploadResponse>(`/chat/nets/${netId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
