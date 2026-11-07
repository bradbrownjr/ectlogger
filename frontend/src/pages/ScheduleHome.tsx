import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CellTowerIcon from '@mui/icons-material/CellTower';
import GroupsIcon from '@mui/icons-material/Groups';
import LanguageIcon from '@mui/icons-material/Language';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RadioIcon from '@mui/icons-material/Radio';
import ExpandableDescription from '../components/ExpandableDescription';
import NCSStaffModal from '../components/NCSStaffModal';
import { formatScheduleEntryDate } from '../components/ncs-staff/NCSStaffScheduleTab';
import { Schedule, formatSchedule } from '../components/scheduler/ScheduleCard';
import ScheduleSubscribePanel from '../components/scheduler/ScheduleSubscribePanel';
import ShareLinkField from '../components/scheduler/ShareLinkField';
import { useAuth } from '../contexts/AuthContext';
import { netApi, ncsRotationApi, templateApi, templateStaffApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import { formatDateTime } from '../utils/dateUtils';
import { formatFrequencyList } from '../utils/frequencyList';
import { absoluteLink, scheduleHomePath, scheduleLivePath } from '../utils/scheduleLinks';

// The few NetResponse fields this page shows
interface ScheduleNet {
  id: number;
  name: string;
  status: string;
  scheduled_start_time?: string | null;
  started_at?: string | null;
  closed_at?: string | null;
  check_in_count?: number | null;
  ncs_callsign?: string | null;
}

interface UpcomingEntry {
  date: string;
  user_callsign: string | null;
  user_name: string | null;
  is_cancelled: boolean;
  is_override: boolean;
}

interface StaffRow {
  id: number;
  user_callsign: string;
  user_name: string | null;
  is_active: boolean;
}

// Statuses for each list. A created net that hasn't started is shown beside the
// running ones, so staff open it instead of creating a second net.
export const ON_AIR_STATUSES = ['lobby', 'active'];
const NOT_STARTED_STATUSES = ['draft', 'scheduled'];
const PAST_STATUSES = ['closed', 'archived'];
const PAST_NETS_SHOWN = 10;
const UPCOMING_SHOWN = 5;

const STATUS_LABEL: Record<string, string> = {
  active: 'On the air',
  lobby: 'Lobby open',
  draft: 'Not started',
  scheduled: 'Not started',
};

/**
 * Schedule home page (/scheduler/:scheduleId).
 *
 * One link per schedule that never changes, for a club to put on its own
 * website: the schedule's details, the net on the air right now, upcoming
 * dates, its staff, and its past nets. Public: it reads only what the
 * schedule list, staff dialog and net list already give a guest. Staff who
 * may create a net get Create here, using the same server rule as the
 * schedule card. The subscribe link (/subscribe/:id) lands here with the
 * Subscribe panel highlighted (?subscribe=1).
 */
const ScheduleHome: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, simulateRegularUser } = useAuth();
  const preferUtc = user?.prefer_utc || false;

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [currentNets, setCurrentNets] = useState<ScheduleNet[]>([]);
  const [pastNets, setPastNets] = useState<ScheduleNet[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEntry[]>([]);
  const [hasRotation, setHasRotation] = useState(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const id = Number(scheduleId);
  const validId = Number.isInteger(id) && id > 0;

  const fetchSchedule = useCallback(async () => {
    if (!validId) {
      setStatus('not_found');
      return;
    }
    try {
      const response = await templateApi.get(id);
      setSchedule(response.data);
      setStatus('ready');
    } catch (error: any) {
      setStatus(error?.response?.status === 404 ? 'not_found' : 'error');
    }
  }, [id, validId]);

  // The sections below the header. Each fails on its own, so one slow or
  // refused read never blanks the page.
  const fetchSections = useCallback(async () => {
    if (!validId) return;
    const [current, past, rotation, staffRows] = await Promise.allSettled([
      netApi.listForSchedule(id, [...ON_AIR_STATUSES, ...NOT_STARTED_STATUSES]),
      netApi.listForSchedule(id, PAST_STATUSES, PAST_NETS_SHOWN),
      ncsRotationApi.getSchedule(id),
      templateStaffApi.list(id),
    ]);
    if (current.status === 'fulfilled') {
      // Running nets first, then created-but-not-started ones
      const nets: ScheduleNet[] = current.value.data;
      setCurrentNets([
        ...nets.filter((n) => ON_AIR_STATUSES.includes(n.status)),
        ...nets.filter((n) => NOT_STARTED_STATUSES.includes(n.status)),
      ]);
    }
    if (past.status === 'fulfilled') setPastNets(past.value.data);
    if (rotation.status === 'fulfilled') {
      setUpcoming((rotation.value.data.schedule || []).slice(0, UPCOMING_SHOWN));
      setHasRotation((rotation.value.data.rotation_members || []).length > 0);
    }
    if (staffRows.status === 'fulfilled') {
      setStaff((staffRows.value.data as StaffRow[]).filter((s) => s.is_active));
    }
  }, [id, validId]);

  // Re-read after sign-in too, so "already subscribed" and Create reflect this account
  useEffect(() => {
    fetchSchedule();
    fetchSections();
  }, [fetchSchedule, fetchSections, isAuthenticated]);

  // Same rule as the schedule card's Create button (Scheduler.tsx::canManageSchedule):
  // in "View as Regular User" an admin sees only what their own staff access allows.
  const canCreateNet = !!schedule && (simulateRegularUser
    ? (schedule.is_owner_or_staff ?? false)
    : (schedule.can_create_net ?? false));

  const handleCreateNet = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await templateApi.createNetFromTemplate(id);
      navigate(`/nets/${response.data.id}`);
    } catch (error: any) {
      setCreateError(getErrorMessage(error, 'Failed to create net'));
      setCreating(false);
    }
  };

  // ========== LOADING / NOT FOUND / ERROR ==========
  if (status !== 'ready' || !schedule) {
    return (
      <Container maxWidth="sm" sx={{ mt: { xs: 2, sm: 8 }, mb: 4 }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: 'center' }}>
          {/* Shows while the schedule is being read */}
          {status === 'loading' && <CircularProgress size={48} sx={{ my: 4 }} />}

          {/* Shows when the link's schedule does not exist */}
          {status === 'not_found' && (
            <>
              <Typography variant="h5" component="h1" gutterBottom>
                Net not found
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                This link does not match a net on this site.
              </Typography>
              <Button component={RouterLink} to="/scheduler" variant="outlined" sx={{ minHeight: 44 }}>
                Browse the net schedule
              </Button>
            </>
          )}

          {/* Shows when the schedule could not be read (network or server error) */}
          {status === 'error' && (
            <>
              <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
                This net could not be loaded. Check your connection and try again.
              </Alert>
              <Button variant="contained" onClick={fetchSchedule} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            </>
          )}
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: { xs: 2, sm: 4 }, mb: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ========== HEADER: identity, details, subscribe ========== */}
      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          {schedule.logo_url && (
            <Avatar
              variant="rounded"
              src={schedule.logo_url}
              alt=""
              sx={{ width: { xs: 64, sm: 96 }, height: { xs: 64, sm: 96 } }}
            />
          )}
          <Typography
            variant="h4"
            component="h1"
            sx={{ typography: { xs: 'h5', sm: 'h4' }, overflowWrap: 'anywhere' }}
          >
            {schedule.name}
          </Typography>
        </Box>

        <ExpandableDescription text={schedule.description} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarMonthIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {formatSchedule(schedule)}
            </Typography>
          </Box>
          {schedule.frequencies.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2" color="text.secondary">
                {formatFrequencyList(schedule.frequencies)}
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
          {schedule.info_url && (
            <Button
              variant="outlined"
              startIcon={<LanguageIcon />}
              href={schedule.info_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ minHeight: 44 }}
            >
              Website
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<BarChartIcon sx={{ color: '#ff9800' }} />}
            component={RouterLink}
            to={`/statistics/schedules/${schedule.id}`}
            sx={{ minHeight: 44 }}
          >
            Stats
          </Button>
        </Box>

        <ScheduleSubscribePanel
          schedule={schedule}
          onChanged={fetchSchedule}
          highlighted={searchParams.get('subscribe') === '1'}
        />
      </Paper>

      {/* ========== ON THE AIR: running and created nets, Create for staff ========== */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CellTowerIcon fontSize="small" />
          On the air
        </Typography>

        {/* Shows when nothing is running or waiting to start */}
        {currentNets.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: canCreateNet ? 2 : 0 }}>
            No net is running right now.
          </Typography>
        )}

        {currentNets.length > 0 && (
          <List disablePadding sx={{ mb: canCreateNet ? 2 : 0 }}>
            {currentNets.map((net) => (
              <ListItemButton
                key={net.id}
                component={RouterLink}
                to={`/nets/${net.id}`}
                sx={{ borderRadius: 1, minHeight: 56, gap: 1, flexWrap: 'wrap' }}
              >
                <ListItemText
                  primary={net.name}
                  secondary={[
                    net.ncs_callsign && `NCS ${net.ncs_callsign}`,
                    ON_AIR_STATUSES.includes(net.status) && `${net.check_in_count ?? 0} checked in`,
                    !ON_AIR_STATUSES.includes(net.status) && net.scheduled_start_time
                      && `Starts ${formatDateTime(net.scheduled_start_time, preferUtc)}`,
                  ].filter(Boolean).join(' · ') || undefined}
                />
                <Chip
                  label={STATUS_LABEL[net.status] || net.status}
                  color={net.status === 'active' ? 'success' : net.status === 'lobby' ? 'info' : 'default'}
                  size="small"
                />
              </ListItemButton>
            ))}
          </List>
        )}

        {/* Shows to staff who may create a net from this schedule. Secondary
            when a net already exists, so the obvious click opens that one. */}
        {canCreateNet && (
          <>
            <Button
              variant={currentNets.length === 0 ? 'contained' : 'outlined'}
              startIcon={creating ? <CircularProgress size={20} /> : <PlayArrowIcon />}
              disabled={creating}
              onClick={handleCreateNet}
              sx={{ minHeight: 44 }}
            >
              {currentNets.length === 0 ? 'Create net' : 'Create another net'}
            </Button>
            {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
          </>
        )}

        {/* Shows to staff: the links to put on a club website */}
        {canCreateNet && (
          <>
            <Divider sx={{ my: 2 }} />
            <ShareLinkField
              link={absoluteLink(scheduleHomePath(schedule.id))}
              label="This page"
              hint="A link to this page that never changes."
              copiedMessage="Link copied"
            />
            <ShareLinkField
              link={absoluteLink(scheduleLivePath(schedule.id))}
              label="Live net"
              hint="For a club website: opens the net on the air when there is exactly one, and this page otherwise."
              copiedMessage="Link copied"
            />
          </>
        )}
      </Paper>

      {/* ========== UPCOMING: next dates, with the NCS when there is a rotation ========== */}
      {/* Hidden for an ad hoc schedule, which has no dates */}
      {upcoming.length > 0 && (
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <CalendarMonthIcon fontSize="small" />
            Upcoming
          </Typography>
          <Box>
            {upcoming.map((entry) => (
              <Box key={entry.date} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                <Typography variant="body2" sx={{ minWidth: 110 }}>
                  {formatScheduleEntryDate(entry.date)}
                </Typography>
                {entry.is_cancelled ? (
                  <Chip label="Cancelled" size="small" />
                ) : (
                  hasRotation && (
                    <Typography variant="body2" color="text.secondary">
                      NCS {entry.user_callsign || 'TBD'}
                      {entry.user_name && ` (${entry.user_name})`}
                    </Typography>
                  )
                )}
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* ========== NET STAFF ========== */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <GroupsIcon fontSize="small" sx={{ color: '#9c27b0' }} />
          Net staff
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Net manager: {schedule.owner_callsign || 'Unknown'}
          {schedule.owner_name && ` (${schedule.owner_name})`}
        </Typography>
        {staff.length > 0 ? (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
            {staff.map((s) => (
              <Chip key={s.id} label={s.user_name ? `${s.user_callsign} (${s.user_name})` : s.user_callsign} />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No other staff listed.
          </Typography>
        )}
        <Button variant="outlined" startIcon={<GroupsIcon />} onClick={() => setStaffOpen(true)} sx={{ minHeight: 44 }}>
          {hasRotation ? 'Staff and rotation' : 'Staff'}
        </Button>
      </Paper>

      {/* ========== PAST NETS: the latest few, each opening its report ========== */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          Past nets
        </Typography>
        {pastNets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No nets have run from this schedule yet.
          </Typography>
        ) : (
          <>
            <List disablePadding>
              {pastNets.map((net) => (
                <ListItemButton
                  key={net.id}
                  component={RouterLink}
                  to={`/nets/${net.id}/report`}
                  sx={{ borderRadius: 1, minHeight: 48 }}
                >
                  <ListItemText
                    primary={net.started_at ? formatDateTime(net.started_at, preferUtc) : net.name}
                    secondary={[
                      net.ncs_callsign && `NCS ${net.ncs_callsign}`,
                      `${net.check_in_count ?? 0} check-ins`,
                    ].filter(Boolean).join(' · ')}
                  />
                </ListItemButton>
              ))}
            </List>
            <Button
              component={RouterLink}
              to={`/statistics/schedules/${schedule.id}`}
              sx={{ mt: 1, minHeight: 44 }}
            >
              All past nets and statistics
            </Button>
          </>
        )}
      </Paper>

      <NCSStaffModal
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        schedule={{
          id: schedule.id,
          name: schedule.name,
          owner_id: schedule.owner_id,
          owner_callsign: schedule.owner_callsign || undefined,
          owner_name: schedule.owner_name || undefined,
        }}
        onUpdate={() => {
          fetchSchedule();
          fetchSections();
        }}
      />
    </Container>
  );
};

export default ScheduleHome;
