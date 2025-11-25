import api from '../services/api';

export interface ChatMessage {
  id: number;
  net_id: number;
  user_id: number | null;
  callsign: string;
  message: string;
  created_at: string;
  is_system: boolean;
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
};
