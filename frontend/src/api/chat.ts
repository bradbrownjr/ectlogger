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

export const chatApi = {
  list: (netId: number) => api.get<ChatMessage[]>(`/chat/nets/${netId}/messages`),

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
