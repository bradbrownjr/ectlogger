import { createContext, useContext, Dispatch, SetStateAction } from 'react';

// ---- Shared domain types (exported for tab components) ----

export interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

export interface RotationMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  position: number;
  is_active: boolean;
}

export interface StaffMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  is_active: boolean;
  is_co_manager: boolean;
}

export interface TemplateSubscriber {
  id: number;
  user_id: number;
  user_callsign: string | null;
  user_name: string | null;
  user_email: string | null;
  subscribed_at: string;
}

export interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

export interface FieldDefinition {
  id: number;
  name: string;
  label: string;
  field_type: string;
  options?: string[];
  placeholder?: string;
  default_enabled: boolean;
  default_required: boolean;
  is_builtin: boolean;
  is_archived: boolean;
  sort_order: number;
}

export interface ScheduleConfig {
  day_of_week: number;
  week_of_month: number[];
  time: string;
}

export type FieldConfigEntry = { enabled: boolean; required: boolean };

// ---- Context value interface ----

export interface CreateScheduleContextValue {
  // Route / session
  isEdit: boolean;
  scheduleId: string | undefined;
  currentUser: { id: number; role: string; [key: string]: any } | null;
  timezoneAbbr: string;

  // Core form text fields
  name: string; setName: Dispatch<SetStateAction<string>>;
  description: string; setDescription: Dispatch<SetStateAction<string>>;
  infoUrl: string; setInfoUrl: Dispatch<SetStateAction<string>>;
  script: string; setScript: Dispatch<SetStateAction<string>>;
  announcements: string; setAnnouncements: Dispatch<SetStateAction<string>>;

  // ARES / EmComm features
  ics309Enabled: boolean; setIcs309Enabled: Dispatch<SetStateAction<boolean>>;
  mobilePrioritySort: boolean; setMobilePrioritySort: Dispatch<SetStateAction<boolean>>;
  chatGracePeriodEnabled: boolean; setChatGracePeriodEnabled: Dispatch<SetStateAction<boolean>>;
  chatGracePeriodMinutes: number; setChatGracePeriodMinutes: Dispatch<SetStateAction<number>>;
  selfCheckinEnabled: boolean; setSelfCheckinEnabled: Dispatch<SetStateAction<boolean>>;
  // Auto-open lobby: presentation varies by scheduleType (see ScheduleTab), but all
  // three collapse to the same nullable auto_lobby_minutes on the schedule/net (null
  // = disabled; 0 = "enabled, no offset" for ad-hoc and one-time "now").
  autoLobbyEnabled: boolean; setAutoLobbyEnabled: Dispatch<SetStateAction<boolean>>;
  autoLobbyMinutes: number; setAutoLobbyMinutes: Dispatch<SetStateAction<number>>;
  // One-time only: "now" opens the lobby as soon as the net is created; "at" gives
  // the net a real start time (oneTimeScheduledStartTime) and the usual offset.
  autoLobbyMode: 'now' | 'at'; setAutoLobbyMode: Dispatch<SetStateAction<'now' | 'at'>>;
  oneTimeScheduledStartTime: string; setOneTimeScheduledStartTime: Dispatch<SetStateAction<string>>;

  // Community net features
  topicOfWeekEnabled: boolean; setTopicOfWeekEnabled: Dispatch<SetStateAction<boolean>>;
  topicOfWeekPrompt: string; setTopicOfWeekPrompt: Dispatch<SetStateAction<string>>;
  pollEnabled: boolean; setPollEnabled: Dispatch<SetStateAction<boolean>>;
  pollQuestion: string; setPollQuestion: Dispatch<SetStateAction<string>>;

  // Schedule status
  isActive: boolean; setIsActive: Dispatch<SetStateAction<boolean>>;
  ownerId: number | null; setOwnerId: Dispatch<SetStateAction<number | null>>;
  originalOwnerId: number | null; setOriginalOwnerId: Dispatch<SetStateAction<number | null>>;

  // Schedule recurrence config
  scheduleType: string; setScheduleType: Dispatch<SetStateAction<string>>;
  scheduleConfig: ScheduleConfig; setScheduleConfig: Dispatch<SetStateAction<ScheduleConfig>>;
  fifthWeekUserId: number | null; setFifthWeekUserId: Dispatch<SetStateAction<number | null>>;

  // Frequency selection (Communication Plan tab + submit)
  selectedFrequencyIds: number[]; setSelectedFrequencyIds: Dispatch<SetStateAction<number[]>>;

  // Check-in field config
  fieldConfig: Record<string, FieldConfigEntry>;
  setFieldConfig: Dispatch<SetStateAction<Record<string, FieldConfigEntry>>>;

  // Pending NCS staff for new-schedule submit (added before the schedule exists)
  pendingNCSUsers: User[]; setPendingNCSUsers: Dispatch<SetStateAction<User[]>>;

  // Reference data fetched once by the parent shell
  frequencies: Frequency[]; setFrequencies: Dispatch<SetStateAction<Frequency[]>>;
  fieldDefinitions: FieldDefinition[];
  users: User[];

  // Staff / rotation — populated by StaffRotationTab, read by ScheduleTab for 5th-week calc
  staff: StaffMember[]; setStaff: Dispatch<SetStateAction<StaffMember[]>>;
  rotationMembers: RotationMember[]; setRotationMembers: Dispatch<SetStateAction<RotationMember[]>>;

  // Toast notification (Snackbar rendered by parent shell)
  showToast: (message: string) => void;
}

export const CreateScheduleContext = createContext<CreateScheduleContextValue | null>(null);

export function useCreateScheduleContext(): CreateScheduleContextValue {
  const ctx = useContext(CreateScheduleContext);
  if (!ctx) {
    throw new Error('useCreateScheduleContext must be used within CreateSchedule');
  }
  return ctx;
}
