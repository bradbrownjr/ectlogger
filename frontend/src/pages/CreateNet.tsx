import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Tabs,
  Tab,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { netApi, frequencyApi, userApi, templateApi } from '../services/api';
import api from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import { useAuth } from '../contexts/AuthContext';
import { CreateNetContext, CreateNetContextValue, NetUser } from '../contexts/CreateNetContext';
import { FrequencyItem } from '../components/forms/CommunicationPlanPanel';
import { FieldDefinitionItem, FieldConfigEntry } from '../components/forms/CheckInFieldsPanel';
import BasicInfoTab from '../components/create-net/BasicInfoTab';
import NCSStaffTab from '../components/create-net/NCSStaffTab';
import CommunicationPlanPanel from '../components/forms/CommunicationPlanPanel';
import NetScriptPanel from '../components/forms/NetScriptPanel';
import AnnouncementsPanel from '../components/forms/AnnouncementsPanel';
import CheckInFieldsPanel from '../components/forms/CheckInFieldsPanel';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`net-tabpanel-${index}`}
      aria-labelledby={`net-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const CreateNet: React.FC = () => {
  const { netId } = useParams<{ netId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isEditMode = !!netId;
  const isInfoMode = location.pathname.endsWith('/info');

  // ---- UI state ----
  const [activeTab, setActiveTab] = useState(0);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'error' | 'warning'>('info');
  const [saveToScheduleConfirmOpen, setSaveToScheduleConfirmOpen] = useState(false);
  const [savingToSchedule, setSavingToSchedule] = useState(false);
  // The net's own status, fetched alongside its other fields. Used only to
  // show the closed/archived notice below -- nothing here is status-gated.
  const [netStatus, setNetStatus] = useState<string | null>(null);

  // ---- Core form fields ----
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [infoUrl, setInfoUrl] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [script, setScript] = useState('');
  const [announcements, setAnnouncements] = useState('');

  // ---- Feature toggles ----
  const [ics309Enabled, setIcs309Enabled] = useState(false);
  const [propagationLoggingEnabled, setPropagationLoggingEnabled] = useState(false);
  // Assisted Traffic Handling. Opt-in like the two above; an empty
  // trafficFormTypes means "offer every form type", not "none".
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [trafficFormTypes, setTrafficFormTypes] = useState<string[]>([]);
  const [trafficStripFormType, setTrafficStripFormType] = useState('');
  const [trafficStripTemplate, setTrafficStripTemplate] = useState('');
  const [mobilePrioritySort, setMobilePrioritySort] = useState(true);
  const [chatGracePeriodEnabled, setChatGracePeriodEnabled] = useState(false);
  const [chatGracePeriodMinutes, setChatGracePeriodMinutes] = useState(15);
  const [selfCheckinEnabled, setSelfCheckinEnabled] = useState(true);
  // Auto-open lobby: inherited from the schedule when the net was created, and
  // overridable here for this net alone. Off by default.
  const [autoLobbyEnabled, setAutoLobbyEnabled] = useState(false);
  const [autoLobbyMinutes, setAutoLobbyMinutes] = useState(15);

  // ---- Community net features ----
  const [topicOfWeekEnabled, setTopicOfWeekEnabled] = useState(false);
  const [topicOfWeekPrompt, setTopicOfWeekPrompt] = useState('');
  const [topicHistory, setTopicHistory] = useState<string[]>([]);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');

  // ---- Scheduled start time (countdown timer) ----
  const [scheduledStartTime, setScheduledStartTime] = useState('');

  // ---- Actual start/end time (staff correction, once the net has run) ----
  const [startedAt, setStartedAt] = useState('');
  const [closedAt, setClosedAt] = useState('');

  // ---- Template reference ----
  const [templateId, setTemplateId] = useState<number | null>(null);

  // ---- Frequencies ----
  const [frequencies, setFrequencies] = useState<FrequencyItem[]>([]);
  const [selectedFrequencyIds, setSelectedFrequencyIds] = useState<number[]>([]);

  // ---- Check-in fields ----
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinitionItem[]>([]);
  const [fieldConfig, setFieldConfig] = useState<Record<string, FieldConfigEntry>>({});

  // ---- NCS staff ----
  const [users, setUsers] = useState<NetUser[]>([]);
  const [pendingNCSUsers, setPendingNCSUsers] = useState<NetUser[]>([]);

  // ---- Data loading ----
  useEffect(() => {
    fetchFrequencies();
    fetchFieldDefinitions();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (netId && fieldDefinitions.length > 0) {
      fetchNetData();
    }
  }, [netId, fieldDefinitions]);

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
      response.data.forEach((field: FieldDefinitionItem) => {
        defaultConfig[field.name] = { enabled: field.default_enabled, required: field.default_required };
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

  const fetchNetData = async () => {
    if (!netId) return;
    try {
      const response = await netApi.get(parseInt(netId));
      const net = response.data;
      // Net Info is a read-only render of this same form, and shows
      // config fields (rotation, custom fields, ICS-309 settings) that
      // aren't meant for standard/guest visitors — direct-URL access is
      // blocked the same way the toolbar button is hidden from them.
      // user?.role (from useAuth(), already masked by simulateRegularUser)
      // plus net.is_owner_or_ncs (never carries the admin bypass) -- NOT
      // net.can_manage alone, which is computed from the real/unmasked
      // identity and so stays true for an admin using "View as Regular
      // User" regardless of that toggle. A real (non-simulating) admin
      // still passes via the explicit role check, same as everywhere else
      // this pattern appears.
      if (isInfoMode && user?.role !== 'admin' && !net.is_owner_or_ncs) {
        navigate(`/nets/${netId}`, { replace: true });
        return;
      }
      setNetStatus(net.status);
      setName(net.name);
      setDescription(net.description || '');
      setInfoUrl(net.info_url || '');
      setStreamUrl(net.stream_url || '');
      setScript(net.script || '');
      setAnnouncements(net.announcements || '');
      setIcs309Enabled(net.ics309_enabled || false);
      setPropagationLoggingEnabled(net.propagation_logging_enabled || false);
      setTrafficEnabled(net.traffic_enabled || false);
      setTrafficFormTypes(net.traffic_form_types || []);
      setTrafficStripFormType(net.traffic_strip_form_type || '');
      setTrafficStripTemplate(net.traffic_strip_template || '');
      setMobilePrioritySort(net.mobile_priority_sort !== false);
      const grace = net.chat_grace_period_minutes;
      setChatGracePeriodEnabled(!!grace);
      if (grace) setChatGracePeriodMinutes(grace);
      setSelfCheckinEnabled(net.self_checkin_enabled !== false);
      const autoLobby = net.auto_lobby_minutes;
      setAutoLobbyEnabled(!!autoLobby);
      if (autoLobby) setAutoLobbyMinutes(autoLobby);
      setTopicOfWeekEnabled(net.topic_of_week_enabled || false);
      setTopicOfWeekPrompt(net.topic_of_week_prompt || '');
      if (net.template_id) {
        setTemplateId(net.template_id);
        loadTopicHistory(net.template_id);
      }
      setPollEnabled(net.poll_enabled || false);
      setPollQuestion(net.poll_question || '');
      // Convert UTC from server to local datetime-local format.
      // The server omits the 'Z' suffix; append it so the browser parses as UTC.
      if (net.scheduled_start_time) {
        const isoStr = net.scheduled_start_time.endsWith('Z')
          ? net.scheduled_start_time
          : net.scheduled_start_time + 'Z';
        const dt = new Date(isoStr);
        const tzOffset = dt.getTimezoneOffset() * 60000;
        const localDt = new Date(dt.getTime() - tzOffset);
        setScheduledStartTime(localDt.toISOString().slice(0, 16));
      }
      // Actual start/end times (only set once the net has gone active).
      // Reuses the same UTC-to-local conversion as scheduled_start_time above.
      const toLocalDateTime = (isoStr?: string) => {
        if (!isoStr) return '';
        const withZ = isoStr.endsWith('Z') ? isoStr : isoStr + 'Z';
        const dt = new Date(withZ);
        const tzOffset = dt.getTimezoneOffset() * 60000;
        return new Date(dt.getTime() - tzOffset).toISOString().slice(0, 16);
      };
      setStartedAt(toLocalDateTime(net.started_at));
      setClosedAt(toLocalDateTime(net.closed_at));
      setSelectedFrequencyIds(net.frequencies.map((f: FrequencyItem) => f.id!));
      if (net.field_config) {
        const mergedConfig: Record<string, FieldConfigEntry> = {};
        fieldDefinitions.forEach((field) => {
          mergedConfig[field.name] = net.field_config[field.name] || {
            enabled: field.default_enabled,
            required: field.default_required,
          };
        });
        setFieldConfig(mergedConfig);
      }
    } catch (error) {
      console.error('Failed to fetch net:', error);
      alert('Failed to load net data');
    }
  };

  const loadTopicHistory = async (templateIdToLoad: number) => {
    try {
      const response = await api.get(`/templates/${templateIdToLoad}/topic-history`);
      setTopicHistory(response.data.map((entry: any) => entry.topic));
    } catch (error) {
      console.error('Error loading topic history:', error);
    }
  };

  // ---- Helpers ----
  const showToast = (message: string, severity: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
  };

  const canProceedFromTab = (tab: number): boolean => {
    if (tab === 0) return name.trim().length > 0;
    if (tab === 2) return selectedFrequencyIds.length > 0;
    return true;
  };

  // ---- Submit handlers ----
  const handleCreateNet = async () => {
    try {
      const scheduledStartTimeISO = scheduledStartTime ? new Date(scheduledStartTime).toISOString() : null;
      const payload = {
        name,
        description,
        info_url: infoUrl || null,
        stream_url: streamUrl || null,
        script,
        announcements,
        frequency_ids: selectedFrequencyIds,
        field_config: fieldConfig,
        ics309_enabled: ics309Enabled,
        propagation_logging_enabled: propagationLoggingEnabled,
        traffic_enabled: trafficEnabled,
        traffic_form_types: trafficFormTypes,
        traffic_strip_form_type: trafficStripFormType || null,
        traffic_strip_template: trafficStripTemplate || null,
        mobile_priority_sort: mobilePrioritySort,
        chat_grace_period_minutes: chatGracePeriodEnabled ? chatGracePeriodMinutes : null,
        self_checkin_enabled: selfCheckinEnabled,
        auto_lobby_minutes: autoLobbyEnabled ? autoLobbyMinutes : null,
        topic_of_week_enabled: topicOfWeekEnabled,
        topic_of_week_prompt: topicOfWeekPrompt || null,
        poll_enabled: pollEnabled,
        poll_question: pollQuestion || null,
        scheduled_start_time: scheduledStartTimeISO,
      };

      if (isEditMode) {
        const response = await netApi.update(parseInt(netId!), payload);
        navigate(`/nets/${response.data.id}`);
      } else {
        const response = await netApi.create(payload);
        const newNetId = response.data.id;
        for (const ncsUser of pendingNCSUsers) {
          try {
            await api.post(`/nets/${newNetId}/roles?user_id=${ncsUser.id}&role=NCS`);
          } catch (error) {
            console.error(`Failed to assign NCS role to ${ncsUser.callsign}:`, error);
          }
        }
        navigate(`/nets/${newNetId}`);
      }
    } catch (error: any) {
      console.error('Failed to save net:', error);
      alert(getErrorMessage(error, 'Failed to save net'));
    }
  };

  const handleSaveToSchedule = async () => {
    if (!templateId) return;
    setSavingToSchedule(true);
    try {
      await templateApi.update(templateId, {
        name,
        description,
        info_url: infoUrl || null,
        stream_url: streamUrl || null,
        script,
        announcements,
        frequency_ids: selectedFrequencyIds,
        field_config: fieldConfig,
        ics309_enabled: ics309Enabled,
        propagation_logging_enabled: propagationLoggingEnabled,
        traffic_enabled: trafficEnabled,
        traffic_form_types: trafficFormTypes,
        traffic_strip_form_type: trafficStripFormType || null,
        traffic_strip_template: trafficStripTemplate || null,
        auto_lobby_minutes: autoLobbyEnabled ? autoLobbyMinutes : null,
        topic_of_week_enabled: topicOfWeekEnabled,
        topic_of_week_prompt: topicOfWeekPrompt || null,
        poll_enabled: pollEnabled,
        poll_question: pollQuestion || null,
      });
      setSaveToScheduleConfirmOpen(false);
      showToast('Schedule updated. Future nets opened from this schedule will use these values.', 'success');
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 403) {
        showToast(getErrorMessage(error, "You don't have permission to edit this schedule."), 'error');
      } else {
        console.error('Failed to save to schedule:', error);
        showToast(getErrorMessage(error, 'Failed to save changes to the schedule.'), 'error');
      }
    } finally {
      setSavingToSchedule(false);
    }
  };

  // Correct the actual start/end times (independent of the main form save,
  // since this is available on the read-only Net Info page too)
  const handleSaveTimes = async () => {
    if (!netId) return;
    try {
      const updateData: { started_at?: string; closed_at?: string } = {};
      if (startedAt) updateData.started_at = new Date(startedAt).toISOString();
      if (closedAt) updateData.closed_at = new Date(closedAt).toISOString();
      await netApi.update(parseInt(netId), updateData);
      showToast('Net times updated', 'success');
    } catch (error: any) {
      console.error('Failed to update net times:', error);
      showToast(getErrorMessage(error, 'Failed to update net times'), 'error');
    }
  };

  // ---- Context value ----
  const contextValue: CreateNetContextValue = {
    netId,
    isEditMode,
    isInfoMode,
    currentUser: user,
    name, setName,
    description, setDescription,
    infoUrl, setInfoUrl,
    streamUrl, setStreamUrl,
    script, setScript,
    announcements, setAnnouncements,
    ics309Enabled, setIcs309Enabled,
    propagationLoggingEnabled, setPropagationLoggingEnabled,
    trafficEnabled, setTrafficEnabled,
    trafficFormTypes, setTrafficFormTypes,
    trafficStripFormType, setTrafficStripFormType,
    trafficStripTemplate, setTrafficStripTemplate,
    mobilePrioritySort, setMobilePrioritySort,
    chatGracePeriodEnabled, setChatGracePeriodEnabled,
    chatGracePeriodMinutes, setChatGracePeriodMinutes,
    selfCheckinEnabled, setSelfCheckinEnabled,
    autoLobbyEnabled, setAutoLobbyEnabled,
    autoLobbyMinutes, setAutoLobbyMinutes,
    topicOfWeekEnabled, setTopicOfWeekEnabled,
    topicOfWeekPrompt, setTopicOfWeekPrompt,
    pollEnabled, setPollEnabled,
    pollQuestion, setPollQuestion,
    scheduledStartTime, setScheduledStartTime,
    startedAt, setStartedAt,
    closedAt, setClosedAt,
    onSaveTimes: handleSaveTimes,
    frequencies, setFrequencies: setFrequencies as React.Dispatch<React.SetStateAction<FrequencyItem[]>>,
    selectedFrequencyIds, setSelectedFrequencyIds,
    fieldDefinitions,
    fieldConfig, setFieldConfig,
    users,
    pendingNCSUsers, setPendingNCSUsers,
    topicHistory,
    templateId,
    showToast,
  };

  // ---- Render ----
  return (
    <CreateNetContext.Provider value={contextValue}>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            {isInfoMode ? 'Net Information' : isEditMode ? 'Edit Net' : 'Create New Net'}
          </Typography>

          {/* Shown once, above the tabs, so it's visible no matter which tab an
              editor lands on -- editing a closed/archived net is allowed (a typo
              or a wrong setting still needs fixing), but its log and any
              close-out notifications already went out, so a change here updates
              the record only. */}
          {isEditMode && !isInfoMode && (netStatus === 'closed' || netStatus === 'archived') && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This net is {netStatus}, and its log has already gone out to anyone subscribed.
              Changes made here update the record for future reference only — they won't be
              re-sent or re-triggered.
            </Alert>
          )}

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              aria-label="net configuration tabs"
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Basic Info" />
              <Tab label="Net Staff" />
              <Tab label="Communication Plan" />
              <Tab label="Net Script" />
              <Tab label="Announcements" />
              <Tab label="Check-In Fields" />
            </Tabs>
          </Box>

          {/* ========== TAB 0: BASIC INFO ========== */}
          <TabPanel value={activeTab} index={0}>
            <BasicInfoTab />
          </TabPanel>

          {/* ========== TAB 1: NET STAFF ========== */}
          <TabPanel value={activeTab} index={1}>
            <NCSStaffTab />
          </TabPanel>

          {/* ========== TAB 2: COMMUNICATION PLAN ========== */}
          <TabPanel value={activeTab} index={2}>
            <CommunicationPlanPanel
              frequencies={frequencies}
              setFrequencies={setFrequencies as React.Dispatch<React.SetStateAction<FrequencyItem[]>>}
              selectedFrequencyIds={selectedFrequencyIds}
              setSelectedFrequencyIds={setSelectedFrequencyIds}
            />
          </TabPanel>

          {/* ========== TAB 3: NET SCRIPT ========== */}
          <TabPanel value={activeTab} index={3}>
            <NetScriptPanel script={script} setScript={setScript} />
          </TabPanel>

          {/* ========== TAB 4: ANNOUNCEMENTS ========== */}
          <TabPanel value={activeTab} index={4}>
            <Typography variant="h6" gutterBottom>Announcements / General Traffic</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              List announcements and general traffic items for NCS to reference during the net.
              This is visible to all users viewing the net. Use the formatting toolbar for markdown styling.
            </Typography>
            <AnnouncementsPanel
              announcements={announcements}
              setAnnouncements={setAnnouncements}
              rows={15}
              footerCaption={`${announcements.length} characters • Supports Markdown formatting`}
              headerContent={templateId ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Recurring weekly announcements (club news, events, reminders) are managed in the
                  Schedule editor under the Announcements tab. Those appear via the toolbar button during
                  a live net and are separate from these per-net notes.
                </Alert>
              ) : undefined}
            />
          </TabPanel>

          {/* ========== TAB 5: CHECK-IN FIELDS ========== */}
          <TabPanel value={activeTab} index={5}>
            <Typography variant="h6" gutterBottom>Check-In Fields</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Configure which fields are available during check-in. Callsign is always required.
              Check "Enabled" to show the field, and "Required" to make it mandatory.
            </Typography>
            <CheckInFieldsPanel
              fieldDefinitions={fieldDefinitions}
              fieldConfig={fieldConfig}
              setFieldConfig={setFieldConfig}
              pollEnabled={pollEnabled}
              topicOfWeekEnabled={topicOfWeekEnabled}
              showToast={showToast}
            />
          </TabPanel>

          {/* ========== ACTION BUTTONS ========== */}
          <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 2, justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => navigate(isEditMode || isInfoMode ? `/nets/${netId}` : '/dashboard')}
                startIcon={<CloseIcon />}
              >
                {isInfoMode ? 'Back' : 'Cancel'}
              </Button>
              {activeTab > 0 && (
                <Button variant="outlined" onClick={() => setActiveTab(activeTab - 1)} startIcon={<ArrowBackIcon />}>
                  Previous
                </Button>
              )}
              {!isInfoMode && activeTab < 4 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Button
                    variant="outlined"
                    onClick={() => setActiveTab(activeTab + 1)}
                    endIcon={<ArrowForwardIcon />}
                    disabled={!canProceedFromTab(activeTab)}
                  >
                    Next
                  </Button>
                  {activeTab === 2 && selectedFrequencyIds.length === 0 && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                      Select at least one frequency to continue
                    </Typography>
                  )}
                  {activeTab === 0 && !name.trim() && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                      Enter a net name to continue
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
            {!isInfoMode && (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {/* Save for this Net: persists changes to the current net only.
                    The schedule (template) is left alone so per-session edits
                    don't accidentally rewrite the schedule's defaults. */}
                <Button
                  variant="contained"
                  onClick={handleCreateNet}
                  disabled={!name || selectedFrequencyIds.length === 0}
                  startIcon={<SaveIcon />}
                >
                  {isEditMode ? 'Save for this Net' : 'Create Net'}
                </Button>
                {/* Save to Schedule: only available when editing a net created from a schedule.
                    Pushes editable fields back to the parent schedule so future nets inherit them.
                    Backend enforces permission (owner/admin/staff/rotation). */}
                {isEditMode && templateId && (
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => setSaveToScheduleConfirmOpen(true)}
                    disabled={!name || selectedFrequencyIds.length === 0 || savingToSchedule}
                    startIcon={<SaveIcon />}
                  >
                    Save to Schedule
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Paper>

        {/* ---- Toast notification ---- */}
        <Snackbar
          open={toastOpen}
          autoHideDuration={5000}
          onClose={() => setToastOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setToastOpen(false)} severity={toastSeverity} sx={{ width: '100%' }}>
            {toastMessage}
          </Alert>
        </Snackbar>

        {/* ---- Save to Schedule confirmation dialog ----
            Pushing back to the schedule overwrites that schedule's defaults
            (name, description, frequencies, script, announcements, stream URL,
            field config, ICS-309/topic/poll toggles), so we always confirm. */}
        <Dialog
          open={saveToScheduleConfirmOpen}
          onClose={() => !savingToSchedule && setSaveToScheduleConfirmOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Save changes to the schedule?</DialogTitle>
          <DialogContent>
            <DialogContentText component="div">
              This will replace the schedule's saved defaults with the values
              currently on this net, including:
              <ul style={{ marginTop: 8, marginBottom: 8 }}>
                <li>Name, description, info URL, stream URL</li>
                <li>Net script and announcements</li>
                <li>Selected frequencies</li>
                <li>Check-in field configuration</li>
                <li>ICS-309, Topic of the Week, and Poll settings</li>
              </ul>
              Future nets opened from this schedule will inherit these values.
              Net staff/rotation are managed separately from the Net Staff dialog
              and aren't changed here.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSaveToScheduleConfirmOpen(false)} disabled={savingToSchedule}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleSaveToSchedule}
              disabled={savingToSchedule}
              startIcon={<SaveIcon />}
            >
              {savingToSchedule ? 'Saving...' : 'Save to Schedule'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </CreateNetContext.Provider>
  );
};

export default CreateNet;
