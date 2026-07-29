import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Tabs,
  Tab,
  Snackbar,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveIcon from '@mui/icons-material/Save';
import { templateApi, frequencyApi, userApi, templateStaffApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import BlockingAlert from '../components/BlockingAlert';
import {
  CreateScheduleContext,
  CreateScheduleContextValue,
  Frequency,
  FieldDefinition,
  User,
  StaffMember,
  RotationMember,
  ScheduleConfig,
  FieldConfigEntry,
} from '../contexts/CreateScheduleContext';
import BasicInfoTab from '../components/create-schedule/BasicInfoTab';
import ScheduleTab from '../components/create-schedule/ScheduleTab';
import StaffRotationTab from '../components/create-schedule/StaffRotationTab';
import CommunicationPlanTab from '../components/create-schedule/CommunicationPlanTab';
import NetScriptTab from '../components/create-schedule/NetScriptTab';
import AnnouncementsTab from '../components/create-schedule/AnnouncementsTab';
import CheckInFieldsTab from '../components/create-schedule/CheckInFieldsTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const getTimezoneAbbr = () => {
  const date = new Date();
  const timeString = date.toLocaleTimeString('en-US', { timeZoneName: 'short' });
  const match = timeString.match(/[A-Z]{2,5}$/);
  return match ? match[0] : Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const CreateSchedule: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(scheduleId);
  const timezoneAbbr = getTimezoneAbbr();
  const { user: currentUser } = useAuth();
  const initialType = searchParams.get('type') || 'ad_hoc';

  // ---- Form text fields ----
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [infoUrl, setInfoUrl] = useState('');
  const [script, setScript] = useState('');
  const [announcements, setAnnouncements] = useState('');

  // ---- ARES / EmComm features ----
  const [ics309Enabled, setIcs309Enabled] = useState(false);
  const [mobilePrioritySort, setMobilePrioritySort] = useState(true);
  const [chatGracePeriodEnabled, setChatGracePeriodEnabled] = useState(false);
  const [chatGracePeriodMinutes, setChatGracePeriodMinutes] = useState(15);
  const [selfCheckinEnabled, setSelfCheckinEnabled] = useState(true);
  // Auto-open lobby is off by default; existing schedules keep their current behavior
  const [autoLobbyEnabled, setAutoLobbyEnabled] = useState(false);
  const [autoLobbyMinutes, setAutoLobbyMinutes] = useState(15);
  const [oneTimeScheduledStartTime, setOneTimeScheduledStartTime] = useState('');

  // ---- Community net features ----
  const [topicOfWeekEnabled, setTopicOfWeekEnabled] = useState(false);
  const [topicOfWeekPrompt, setTopicOfWeekPrompt] = useState('');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');

  // ---- Schedule status ----
  const [isActive, setIsActive] = useState(true);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [originalOwnerId, setOriginalOwnerId] = useState<number | null>(null);

  // ---- Recurrence config ----
  const [scheduleType, setScheduleType] = useState(initialType);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    day_of_week: 1,
    week_of_month: [],
    time: '18:00',
  });
  const [fifthWeekUserId, setFifthWeekUserId] = useState<number | null>(null);

  // ---- Frequency selection ----
  const [selectedFrequencyIds, setSelectedFrequencyIds] = useState<number[]>([]);

  // ---- Check-in field config ----
  const [fieldConfig, setFieldConfig] = useState<Record<string, FieldConfigEntry>>({});

  // ---- Pending NCS staff (new-schedule flow) ----
  const [pendingNCSUsers, setPendingNCSUsers] = useState<User[]>([]);

  // ---- Reference data (fetched once) ----
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // ---- Staff / rotation (populated by StaffRotationTab, read by ScheduleTab for 5th-week calc) ----
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rotationMembers, setRotationMembers] = useState<RotationMember[]>([]);

  // ---- Shell UI state ----
  const [activeTab, setActiveTab] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [blockingAlert, setBlockingAlert] = useState<{
    open: boolean;
    message: string;
    title?: string;
    severity?: 'error' | 'warning' | 'info' | 'success';
  }>({ open: false, message: '' });

  // ---- Reference data fetches ----
  useEffect(() => {
    fetchFrequencies();
    fetchFieldDefinitions();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (isEdit && fieldDefinitions.length > 0) {
      fetchScheduleData();
    }
  }, [scheduleId, fieldDefinitions]);

  const fetchFrequencies = async () => {
    try {
      const response = await frequencyApi.list();
      setFrequencies(response.data);
    } catch (error) {
      console.error('Failed to fetch frequencies:', error);
    }
  };

  const fetchFieldDefinitions = async () => {
    try {
      const response = await api.get('/settings/fields');
      setFieldDefinitions(response.data);
      const defaultConfig: Record<string, FieldConfigEntry> = {};
      response.data.forEach((field: FieldDefinition) => {
        defaultConfig[field.name] = {
          enabled: field.default_enabled,
          required: field.default_required,
        };
      });
      setFieldConfig(defaultConfig);
    } catch (error) {
      console.error('Failed to fetch field definitions:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await userApi.listDirectory();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchScheduleData = async () => {
    if (!scheduleId) return;
    try {
      const response = await templateApi.get(Number(scheduleId));
      const schedule = response.data;
      setName(schedule.name);
      setDescription(schedule.description || '');
      setInfoUrl(schedule.info_url || '');
      setScript(schedule.script || '');
      setIcs309Enabled(schedule.ics309_enabled || false);
      setMobilePrioritySort(schedule.mobile_priority_sort !== false);
      const grace = schedule.chat_grace_period_minutes;
      setChatGracePeriodEnabled(!!grace);
      if (grace) setChatGracePeriodMinutes(grace);
      setSelfCheckinEnabled(schedule.self_checkin_enabled !== false);
      const autoLobby = schedule.auto_lobby_minutes;
      setAutoLobbyEnabled(!!autoLobby);
      if (autoLobby) setAutoLobbyMinutes(autoLobby);
      setTopicOfWeekEnabled(schedule.topic_of_week_enabled || false);
      setTopicOfWeekPrompt(schedule.topic_of_week_prompt || '');
      setPollEnabled(schedule.poll_enabled || false);
      setPollQuestion(schedule.poll_question || '');
      setSelectedFrequencyIds(schedule.frequencies.map((f: any) => f.id));
      setOwnerId(schedule.owner_id);
      setOriginalOwnerId(schedule.owner_id);
      if (schedule.field_config) {
        const mergedConfig: Record<string, FieldConfigEntry> = {};
        fieldDefinitions.forEach((field: FieldDefinition) => {
          mergedConfig[field.name] = schedule.field_config[field.name] || {
            enabled: field.default_enabled,
            required: field.default_required,
          };
        });
        setFieldConfig(mergedConfig);
      }
      setIsActive(schedule.is_active);
      setScheduleType(schedule.schedule_type || 'ad_hoc');
      setScheduleConfig(schedule.schedule_config || { day_of_week: 1, week_of_month: [], time: '18:00' });
      setFifthWeekUserId(schedule.fifth_week_user_id ?? null);
      setAnnouncements(schedule.announcements || '');
    } catch (error) {
      console.error('Failed to fetch schedule:', error);
    }
  };

  // ---- Tab navigation ----
  const handleNextTab = () => {
    if (activeTab === 5) {
      // Brief disable to prevent accidental double-submit when advancing to the final tab
      setIsTransitioning(true);
      setActiveTab(6);
      setTimeout(() => setIsTransitioning(false), 500);
    } else {
      setActiveTab(activeTab + 1);
    }
  };

  // ---- Form submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // auto_lobby_minutes is one nullable number everywhere, but what it means
    // depends on whether there's a scheduled time to count down from: ad-hoc
    // never has one, and neither does a one-time net whose start time was left
    // blank, so 0 just means "enabled, no offset" (see start_net()'s
    // manual-start branch). A one-time net with a start time, and the recurring
    // types, use it as a real minutes-before offset for the background scheduler.
    const oneTimeHasStartTime = scheduleType === 'one_time' && !!oneTimeScheduledStartTime;
    const effectiveAutoLobbyMinutes = !autoLobbyEnabled
      ? null
      : (scheduleType === 'ad_hoc' || (scheduleType === 'one_time' && !oneTimeHasStartTime))
        ? 0
        : autoLobbyMinutes;

    const scheduleData: any = {
      name,
      description,
      info_url: infoUrl || null,
      script,
      frequency_ids: selectedFrequencyIds,
      field_config: fieldConfig,
      is_active: isActive,
      schedule_type: scheduleType,
      schedule_config: scheduleConfig,
      fifth_week_user_id: fifthWeekUserId,
      ics309_enabled: ics309Enabled,
      mobile_priority_sort: mobilePrioritySort,
      chat_grace_period_minutes: chatGracePeriodEnabled ? chatGracePeriodMinutes : null,
      self_checkin_enabled: selfCheckinEnabled,
      auto_lobby_minutes: effectiveAutoLobbyMinutes,
      topic_of_week_enabled: topicOfWeekEnabled,
      topic_of_week_prompt: topicOfWeekPrompt || null,
      poll_enabled: pollEnabled,
      poll_question: pollQuestion || null,
      announcements: announcements || null,
    };

    if (isEdit && ownerId && ownerId !== originalOwnerId) {
      scheduleData.owner_id = ownerId;
    } else if (!isEdit && ownerId && ownerId !== currentUser?.id) {
      scheduleData.owner_id = ownerId;
    }

    try {
      if (isEdit) {
        await templateApi.update(Number(scheduleId), scheduleData);
        navigate('/scheduler');
      } else {
        const response = await templateApi.create(scheduleData);
        const newScheduleId = response.data.id;

        for (const user of pendingNCSUsers) {
          try {
            await templateStaffApi.add(newScheduleId, { user_id: user.id });
          } catch (err) {
            console.error(`Failed to add staff ${user.callsign}:`, err);
          }
        }

        if (scheduleType === 'one_time') {
          try {
            // The start-time field is independent of the lobby toggle - it's
            // the net's actual scheduled start regardless of whether auto-lobby
            // is on, same as Daily/Weekly/Monthly's time field.
            const overridePayload = oneTimeScheduledStartTime
              ? { scheduled_start_time: new Date(oneTimeScheduledStartTime).toISOString() }
              : undefined;
            const netResponse = await templateApi.createNetFromTemplate(newScheduleId, overridePayload);
            navigate(`/nets/${netResponse.data.id}`);
            return;
          } catch (err) {
            console.error('Failed to auto-create net:', err);
          }
        }
        navigate('/scheduler');
      }
    } catch (error: any) {
      console.error('Failed to save schedule:', error);
      setBlockingAlert({
        open: true,
        message: error.response?.data?.detail || 'Failed to save Schedule',
        title: 'Cannot Create Schedule',
        severity: 'error',
      });
    }
  };

  // ---- Context value ----
  const contextValue: CreateScheduleContextValue = {
    isEdit, scheduleId, currentUser, timezoneAbbr,
    name, setName, description, setDescription, infoUrl, setInfoUrl,
    script, setScript, announcements, setAnnouncements,
    ics309Enabled, setIcs309Enabled, mobilePrioritySort, setMobilePrioritySort,
    chatGracePeriodEnabled, setChatGracePeriodEnabled,
    chatGracePeriodMinutes, setChatGracePeriodMinutes,
    selfCheckinEnabled, setSelfCheckinEnabled,
    autoLobbyEnabled, setAutoLobbyEnabled,
    autoLobbyMinutes, setAutoLobbyMinutes,
    oneTimeScheduledStartTime, setOneTimeScheduledStartTime,
    topicOfWeekEnabled, setTopicOfWeekEnabled, topicOfWeekPrompt, setTopicOfWeekPrompt,
    pollEnabled, setPollEnabled, pollQuestion, setPollQuestion,
    isActive, setIsActive,
    ownerId, setOwnerId, originalOwnerId, setOriginalOwnerId,
    scheduleType, setScheduleType, scheduleConfig, setScheduleConfig,
    fifthWeekUserId, setFifthWeekUserId,
    selectedFrequencyIds, setSelectedFrequencyIds,
    fieldConfig, setFieldConfig,
    pendingNCSUsers, setPendingNCSUsers,
    frequencies, setFrequencies,
    fieldDefinitions,
    users,
    staff, setStaff,
    rotationMembers, setRotationMembers,
    showToast: (message: string) => setToastMessage(message),
  };

  return (
    <CreateScheduleContext.Provider value={contextValue}>
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <Typography variant="h4" component="h1">
              {isEdit
                ? (scheduleType === 'ad_hoc' || scheduleType === 'one_time' ? 'Edit Net' : 'Edit Schedule')
                : (scheduleType === 'ad_hoc' || scheduleType === 'one_time' ? 'Create Net' : 'Create Schedule')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </Typography>
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Basic Info" />
              <Tab label="Schedule" />
              <Tab label="Net Staff" />
              <Tab label="Communication Plan" />
              <Tab label="Net Script" />
              <Tab label="Announcements" />
              <Tab label="Check-In Fields" />
            </Tabs>
          </Box>

          <Box component="form" onSubmit={handleSubmit}>
            {/* ========== TAB 0: BASIC INFO ========== */}
            <TabPanel value={activeTab} index={0}>
              <BasicInfoTab />
            </TabPanel>

            {/* ========== TAB 1: SCHEDULE CONFIGURATION ========== */}
            <TabPanel value={activeTab} index={1}>
              <ScheduleTab />
            </TabPanel>

            {/* ========== TAB 2: NET STAFF ========== */}
            <TabPanel value={activeTab} index={2}>
              <StaffRotationTab />
            </TabPanel>

            {/* ========== TAB 3: COMMUNICATION PLAN (FREQUENCIES) ========== */}
            <TabPanel value={activeTab} index={3}>
              <CommunicationPlanTab />
            </TabPanel>

            {/* ========== TAB 4: NET SCRIPT ========== */}
            <TabPanel value={activeTab} index={4}>
              <NetScriptTab />
            </TabPanel>

            {/* ========== TAB 5: ANNOUNCEMENTS ========== */}
            <TabPanel value={activeTab} index={5}>
              <AnnouncementsTab />
            </TabPanel>

            {/* ========== TAB 6: CHECK-IN FIELDS ========== */}
            <TabPanel value={activeTab} index={6}>
              <CheckInFieldsTab />
            </TabPanel>

            {/* ========== NAVIGATION BUTTONS ========== */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button type="button" variant="outlined" onClick={() => navigate('/scheduler')} startIcon={<CloseIcon />}>
                  Cancel
                </Button>
                {activeTab > 0 && (
                  <Button type="button" variant="outlined" onClick={() => setActiveTab(activeTab - 1)} startIcon={<ArrowBackIcon />}>
                    Previous
                  </Button>
                )}
                {activeTab < 6 && (
                  <Button type="button" variant="outlined" onClick={handleNextTab} endIcon={<ArrowForwardIcon />}>
                    Next
                  </Button>
                )}
              </Box>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isTransitioning || !name || selectedFrequencyIds.length === 0}
                startIcon={<SaveIcon />}
              >
                {isEdit ? 'Save Changes' : (scheduleType === 'ad_hoc' || scheduleType === 'one_time' ? 'Create Net' : 'Create Schedule')}
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* ========== BLOCKING ALERT FOR ERRORS ========== */}
        <BlockingAlert
          open={blockingAlert.open}
          onClose={() => setBlockingAlert({ ...blockingAlert, open: false })}
          message={blockingAlert.message}
          title={blockingAlert.title}
          severity={blockingAlert.severity}
        />

        {/* Toast for locked check-in field clicks */}
        <Snackbar
          open={!!toastMessage}
          autoHideDuration={4000}
          onClose={() => setToastMessage('')}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setToastMessage('')} severity="info" sx={{ width: '100%' }}>
            {toastMessage}
          </Alert>
        </Snackbar>
      </Container>
    </CreateScheduleContext.Provider>
  );
};

export default CreateSchedule;
