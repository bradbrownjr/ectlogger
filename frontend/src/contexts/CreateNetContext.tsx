import { createContext, useContext, Dispatch, SetStateAction } from 'react';
import { FrequencyItem } from '../components/forms/CommunicationPlanPanel';
import { FieldDefinitionItem, FieldConfigEntry } from '../components/forms/CheckInFieldsPanel';

// ---- Shared domain types ----

export interface NetUser {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

// ---- Context value interface ----

export interface CreateNetContextValue {
  // Route / mode
  netId: string | undefined;
  isEditMode: boolean;
  isInfoMode: boolean;
  currentUser: { id: number; role: string; callsign?: string; name?: string; [key: string]: any } | null;

  // Core form text fields
  name: string; setName: Dispatch<SetStateAction<string>>;
  description: string; setDescription: Dispatch<SetStateAction<string>>;
  infoUrl: string; setInfoUrl: Dispatch<SetStateAction<string>>;
  streamUrl: string; setStreamUrl: Dispatch<SetStateAction<string>>;
  script: string; setScript: Dispatch<SetStateAction<string>>;
  announcements: string; setAnnouncements: Dispatch<SetStateAction<string>>;

  // ARES / EmComm features
  ics309Enabled: boolean; setIcs309Enabled: Dispatch<SetStateAction<boolean>>;
  mobilePrioritySort: boolean; setMobilePrioritySort: Dispatch<SetStateAction<boolean>>;
  chatGracePeriodEnabled: boolean; setChatGracePeriodEnabled: Dispatch<SetStateAction<boolean>>;
  chatGracePeriodMinutes: number; setChatGracePeriodMinutes: Dispatch<SetStateAction<number>>;
  selfCheckinEnabled: boolean; setSelfCheckinEnabled: Dispatch<SetStateAction<boolean>>;
  // Auto-open lobby for this net only; sent as a nullable auto_lobby_minutes
  autoLobbyEnabled: boolean; setAutoLobbyEnabled: Dispatch<SetStateAction<boolean>>;
  autoLobbyMinutes: number; setAutoLobbyMinutes: Dispatch<SetStateAction<number>>;

  // Community features
  topicOfWeekEnabled: boolean; setTopicOfWeekEnabled: Dispatch<SetStateAction<boolean>>;
  topicOfWeekPrompt: string; setTopicOfWeekPrompt: Dispatch<SetStateAction<string>>;
  pollEnabled: boolean; setPollEnabled: Dispatch<SetStateAction<boolean>>;
  pollQuestion: string; setPollQuestion: Dispatch<SetStateAction<string>>;

  // Scheduled start time (countdown timer)
  scheduledStartTime: string; setScheduledStartTime: Dispatch<SetStateAction<string>>;

  // Actual start/end time (staff correction, once the net has run)
  startedAt: string; setStartedAt: Dispatch<SetStateAction<string>>;
  closedAt: string; setClosedAt: Dispatch<SetStateAction<string>>;
  onSaveTimes: () => Promise<void>;

  // Frequency selection
  frequencies: FrequencyItem[]; setFrequencies: Dispatch<SetStateAction<FrequencyItem[]>>;
  selectedFrequencyIds: number[]; setSelectedFrequencyIds: Dispatch<SetStateAction<number[]>>;

  // Check-in fields
  fieldDefinitions: FieldDefinitionItem[];
  fieldConfig: Record<string, FieldConfigEntry>;
  setFieldConfig: Dispatch<SetStateAction<Record<string, FieldConfigEntry>>>;

  // NCS Staff (pending for new nets; handled via API in edit mode)
  users: NetUser[];
  pendingNCSUsers: NetUser[]; setPendingNCSUsers: Dispatch<SetStateAction<NetUser[]>>;

  // Reference / template data
  topicHistory: string[];
  templateId: number | null;

  // Toast notification
  showToast: (message: string, severity?: 'info' | 'success' | 'error' | 'warning') => void;
}

export const CreateNetContext = createContext<CreateNetContextValue | null>(null);

export function useCreateNetContext(): CreateNetContextValue {
  const ctx = useContext(CreateNetContext);
  if (!ctx) {
    throw new Error('useCreateNetContext must be used within CreateNet');
  }
  return ctx;
}
