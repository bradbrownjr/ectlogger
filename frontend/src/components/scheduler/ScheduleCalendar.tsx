import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AssessmentIcon from '@mui/icons-material/Assessment';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RadioIcon from '@mui/icons-material/Radio';
import PersonIcon from '@mui/icons-material/Person';
import { templateApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { addMonths, groupByLocalDay, localDayKey, monthGridDays, monthGridWindow } from '../../utils/calendarGrid';
import { formatFrequencyList } from '../../utils/frequencyList';
import useLayoutTier from '../../hooks/useLayoutTier';
import CardActionButton from '../CardActionButton';
import ExpandableDescription from '../ExpandableDescription';
import type { Schedule } from './ScheduleCard';

// ---- Types ----

/** One net on the calendar; mirrors backend schemas.CalendarOccurrence. */
export interface CalendarOccurrence {
  source: 'net' | 'projected';
  start: string;
  name: string;
  template_id: number | null;
  net_id: number | null;
  status: string | null;
  started_at: string | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  is_override: boolean;
  is_fifth_week: boolean;
  ncs_callsign: string | null;
  check_in_count: number | null;
  description: string | null;
  owner_callsign: string | null;
  frequencies: any[];
}

// How far ahead the arrows go; matches the backend's one-year limit.
const MAX_MONTHS_AHEAD = 12;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Occurrence state helpers ----

const isFinished = (o: CalendarOccurrence) => o.status === 'closed' || o.status === 'archived';
const isLive = (o: CalendarOccurrence) => o.status === 'active' || o.status === 'lobby';

/** Short outcome/state line for an entry, or null when there is nothing to add. */
function occurrenceSummary(o: CalendarOccurrence): string | null {
  if (o.is_cancelled) return 'Cancelled';
  if (o.status === 'active') return 'On the air';
  if (o.status === 'lobby') return 'Lobby open';
  if (isFinished(o)) {
    if (!o.started_at) return 'Not held';
    const n = o.check_in_count ?? 0;
    return `${n} check-in${n === 1 ? '' : 's'}`;
  }
  return null;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const formatFullDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

// ---- Props ----

interface ScheduleCalendarProps {
  /** Schedules the page is currently showing (after the filter). */
  visibleSchedules: Schedule[];
  /** Every loaded schedule, for looking one up by id. */
  allSchedules: Schedule[];
  favorites: Set<number>;
  /** The page's filter text, applied to nets that have no schedule. */
  filterText: string;
  /** Renders the usual schedule card, with the page's own handlers and permissions. */
  renderScheduleCard: (schedule: Schedule) => React.ReactNode;
}

// ========== SCHEDULE CALENDAR ==========
// Month view of every net: past days are real nets (what happened), today
// forward adds projected slots from each recurring schedule. Nets that are not
// part of a recurring schedule (no schedule, or an ad-hoc one) are listed below
// the grid instead, so nothing that happened in the month is left out.

const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  visibleSchedules,
  allSchedules,
  favorites,
  filterText,
  renderScheduleCard,
}) => {
  const today = new Date();
  const [{ year, month }, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [occurrences, setOccurrences] = useState<CalendarOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ occurrence: CalendarOccurrence; anchor: HTMLElement } | null>(null);
  const isCompact = useLayoutTier() === 'compact';

  const maxMonth = addMonths(today.getFullYear(), today.getMonth(), MAX_MONTHS_AHEAD);
  const atMax = year > maxMonth.year || (year === maxMonth.year && month >= maxMonth.month);

  // ========== FETCH THE MONTH ==========
  useEffect(() => {
    let cancelled = false;
    const { start, end } = monthGridWindow(year, month);
    setLoading(true);
    setError(null);
    templateApi.calendar(start, end)
      .then((res) => { if (!cancelled) setOccurrences(res.data); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Failed to load the calendar')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, month]);

  // ========== SPLIT: GRID vs AD-HOC LIST ==========
  const scheduleById = useMemo(() => new Map(allSchedules.map((s) => [s.id, s])), [allSchedules]);
  const visibleIds = useMemo(() => new Set(visibleSchedules.map((s) => s.id)), [visibleSchedules]);

  const { gridByDay, adHoc } = useMemo(() => {
    const grid: CalendarOccurrence[] = [];
    const list: CalendarOccurrence[] = [];
    const needle = filterText.trim().toLowerCase();
    for (const o of occurrences) {
      const schedule = o.template_id != null ? scheduleById.get(o.template_id) : undefined;
      // A schedule the filter hides takes its nets with it, wherever they would go.
      if (schedule && !visibleIds.has(schedule.id)) continue;
      if (schedule && schedule.schedule_type !== 'ad_hoc') {
        grid.push(o);
        continue;
      }
      // No schedule (or an ad-hoc/inactive one): listed below the grid, for this month only.
      const start = new Date(o.start);
      if (start.getFullYear() !== year || start.getMonth() !== month) continue;
      if (!schedule && needle) {
        const haystack = [o.name, o.description, o.owner_callsign, o.ncs_callsign, formatFrequencyList(o.frequencies)]
          .join(' ').toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      list.push(o);
    }
    // Favorites lead within a day, then by time.
    const favFirst = (a: CalendarOccurrence, b: CalendarOccurrence) => {
      const af = a.template_id != null && favorites.has(a.template_id) ? 0 : 1;
      const bf = b.template_id != null && favorites.has(b.template_id) ? 0 : 1;
      return af - bf || a.start.localeCompare(b.start);
    };
    const byDay = groupByLocalDay(grid);
    byDay.forEach((items) => items.sort(favFirst));
    return { gridByDay: byDay, adHoc: list };
  }, [occurrences, scheduleById, visibleIds, favorites, filterText, year, month]);

  const days = monthGridDays(year, month);
  const todayKey = localDayKey(today);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const open = (occurrence: CalendarOccurrence) => (e: React.MouseEvent<HTMLElement>) =>
    setSelected({ occurrence, anchor: e.currentTarget });

  // ========== MONTH NAVIGATION HEADER ==========
  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, mb: 1.5 }}>
      <Tooltip title="Previous month">
        <IconButton aria-label="previous month" onClick={() => setMonth(addMonths(year, month, -1))}>
          <ChevronLeftIcon />
        </IconButton>
      </Tooltip>
      <Typography variant="h6" component="h2" noWrap sx={{ minWidth: { sm: 180 }, textAlign: 'center' }}>
        {monthLabel}
      </Typography>
      <Tooltip title={atMax ? 'The calendar goes up to one year ahead' : 'Next month'}>
        <span>
          <IconButton aria-label="next month" disabled={atMax} onClick={() => setMonth(addMonths(year, month, 1))}>
            <ChevronRightIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Button
        size="small"
        variant="outlined"
        sx={{ ml: { xs: 'auto', sm: 1 }, minHeight: { xs: 44, sm: 32 }, flexShrink: 0 }}
        disabled={year === today.getFullYear() && month === today.getMonth()}
        onClick={() => setMonth({ year: today.getFullYear(), month: today.getMonth() })}
      >
        Today
      </Button>
      {loading && <CircularProgress size={20} sx={{ ml: 1 }} />}
    </Box>
  );

  return (
    <Box>
      {header}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {isCompact ? (
        // ========== AGENDA LIST (phones) ==========
        // A seven-column grid is unreadable at phone width, so the same month
        // is listed day by day, only days that have a net.
        <AgendaList
          days={days.filter((d) => d.getMonth() === month)}
          gridByDay={gridByDay}
          todayKey={todayKey}
          loading={loading}
          onOpen={open}
        />
      ) : (
        // ========== MONTH GRID (tablet and up) ==========
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {WEEKDAYS.map((d) => (
              <Typography
                key={d}
                variant="caption"
                color="text.secondary"
                sx={{ py: 0.5, textAlign: 'center', fontWeight: 600, borderBottom: 1, borderColor: 'divider' }}
              >
                {d}
              </Typography>
            ))}
            {days.map((day, i) => {
              const key = localDayKey(day);
              const inMonth = day.getMonth() === month;
              const isToday = key === todayKey;
              return (
                <Box
                  key={key}
                  sx={{
                    minHeight: 104,
                    p: 0.5,
                    borderRight: (i + 1) % 7 ? 1 : 0,
                    borderBottom: i < 35 ? 1 : 0,
                    borderColor: 'divider',
                    bgcolor: inMonth ? 'background.paper' : 'action.hover',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    minWidth: 0,
                  }}
                >
                  {/* Day number; today gets a filled marker */}
                  <Typography
                    variant="caption"
                    sx={{
                      alignSelf: 'flex-end',
                      px: 0.75,
                      borderRadius: 1,
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? 'primary.contrastText' : inMonth ? 'text.primary' : 'text.disabled',
                      bgcolor: isToday ? 'primary.main' : 'transparent',
                    }}
                  >
                    {day.getDate()}
                  </Typography>
                  {(gridByDay.get(key) || []).map((o) => (
                    <OccurrenceEntry key={`${o.source}-${o.net_id ?? o.template_id}-${o.start}`} occurrence={o} onClick={open(o)} />
                  ))}
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      {/* ========== AD-HOC NETS THIS MONTH ==========
          Nets with no recurring schedule have no slot to project, so they are
          listed here rather than left off the calendar. */}
      {adHoc.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>
            Ad-hoc nets in {monthLabel}
          </Typography>
          <Paper variant="outlined">
            {adHoc.map((o, i) => (
              <Box key={`${o.net_id}-${o.start}`} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider', p: 0.5 }}>
                <OccurrenceEntry occurrence={o} onClick={open(o)} showDate />
              </Box>
            ))}
          </Paper>
        </Box>
      )}

      {/* ========== OCCURRENCE DETAILS POPOVER ========== */}
      <Popover
        open={!!selected}
        anchorEl={selected?.anchor}
        onClose={() => setSelected(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh' } } }}
      >
        {selected && (
          <OccurrenceDetails
            occurrence={selected.occurrence}
            schedule={selected.occurrence.template_id != null ? scheduleById.get(selected.occurrence.template_id) : undefined}
            renderScheduleCard={renderScheduleCard}
          />
        )}
      </Popover>
    </Box>
  );
};

// ========== OCCURRENCE ENTRY ==========
// One net inside a day cell, the agenda list, or the ad-hoc list. The left
// border says where it stands: live (green), upcoming (primary), finished
// (neutral), cancelled (struck through, never hidden, or a reader would
// assume the net is on).

const OccurrenceEntry: React.FC<{
  occurrence: CalendarOccurrence;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  showDate?: boolean;
}> = ({ occurrence: o, onClick, showDate }) => {
  const summary = occurrenceSummary(o);
  const past = isFinished(o) || (o.source === 'net' && !isLive(o) && new Date(o.start) < new Date());
  const borderColor = o.is_cancelled ? 'text.disabled' : isLive(o) ? 'success.main' : past ? 'divider' : 'primary.main';
  const when = showDate
    ? new Date(o.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : formatTime(o.start);
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'block',
        width: '100%',
        minWidth: 0,
        px: 0.75,
        py: 0.25,
        borderLeft: 3,
        borderColor,
        borderRadius: 0.5,
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
      }}
    >
      {/* Name wraps to two lines: many nets share a long prefix ("Example
          County ARES ..."), which a single truncated line would hide. */}
      <Typography
        variant="caption"
        component="div"
        sx={{
          fontWeight: 500,
          color: o.is_cancelled ? 'text.disabled' : 'text.primary',
          textDecoration: o.is_cancelled ? 'line-through' : 'none',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        <Box component="span" sx={{ color: o.is_cancelled ? 'text.disabled' : 'text.secondary', mr: 0.5 }}>{when}</Box>
        {o.name}
      </Typography>
      {(o.ncs_callsign || summary) && (
        <Typography variant="caption" component="div" color="text.secondary" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.5 }}>
          {o.ncs_callsign && !o.is_cancelled && <span>NCS {o.ncs_callsign}</span>}
          {(o.is_override || o.is_fifth_week) && !o.is_cancelled && (
            <Tooltip title={o.is_override ? 'NCS swapped for this date' : 'Fifth-week NCS'}>
              <SwapHorizIcon sx={{ fontSize: 14 }} />
            </Tooltip>
          )}
          {summary && o.ncs_callsign && !o.is_cancelled && <span>·</span>}
          {summary && <span>{summary}</span>}
        </Typography>
      )}
    </Box>
  );
};

// ========== AGENDA LIST ==========

const AgendaList: React.FC<{
  days: Date[];
  gridByDay: Map<string, CalendarOccurrence[]>;
  todayKey: string;
  loading: boolean;
  onOpen: (o: CalendarOccurrence) => (e: React.MouseEvent<HTMLElement>) => void;
}> = ({ days, gridByDay, todayKey, loading, onOpen }) => {
  const withNets = days.filter((d) => gridByDay.has(localDayKey(d)));
  if (!withNets.length) {
    return loading ? null : (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No scheduled nets this month
      </Typography>
    );
  }
  return (
    <Paper variant="outlined">
      {withNets.map((d, i) => {
        const key = localDayKey(d);
        return (
          <Box key={key} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider', p: 1 }}>
            <Typography
              variant="subtitle2"
              color={key === todayKey ? 'primary' : 'text.secondary'}
              sx={{ mb: 0.5 }}
            >
              {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              {key === todayKey && ' · Today'}
            </Typography>
            {(gridByDay.get(key) || []).map((o) => (
              <OccurrenceEntry key={`${o.source}-${o.net_id ?? o.template_id}-${o.start}`} occurrence={o} onClick={onOpen(o)} />
            ))}
          </Box>
        );
      })}
    </Paper>
  );
};

// ========== OCCURRENCE DETAILS (popover body) ==========
// What is specific to this date on top, then the usual card: the schedule's
// own card when it has one, or the net's details when it has none.

const OccurrenceDetails: React.FC<{
  occurrence: CalendarOccurrence;
  schedule?: Schedule;
  renderScheduleCard: (schedule: Schedule) => React.ReactNode;
}> = ({ occurrence: o, schedule, renderScheduleCard }) => {
  const navigate = useNavigate();
  const summary = occurrenceSummary(o);
  const held = isFinished(o) && !!o.started_at;

  return (
    <Box>
      {/* ---- This date ---- */}
      <Box sx={{ p: 2, pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{formatFullDate(o.start)}</Typography>
        {(!schedule || o.name !== schedule.name) && (
          <Typography variant="h6" component="p" sx={{ textDecoration: o.is_cancelled ? 'line-through' : 'none' }}>
            {o.name}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, alignItems: 'center' }}>
          {summary && (
            <Chip
              size="small"
              label={summary}
              color={o.is_cancelled ? 'default' : isLive(o) ? 'success' : 'default'}
              variant={isLive(o) ? 'filled' : 'outlined'}
            />
          )}
          {o.source === 'projected' && !o.is_cancelled && <Chip size="small" variant="outlined" label="Upcoming" color="primary" />}
          {o.ncs_callsign && !o.is_cancelled && (
            <Typography variant="body2">
              <strong>NCS:</strong> {o.ncs_callsign}
              {o.is_override && ' (swapped)'}
              {o.is_fifth_week && ' (fifth week)'}
            </Typography>
          )}
        </Box>
        {o.is_cancelled && o.cancel_reason && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {o.cancel_reason}
          </Typography>
        )}
        {/* ---- Actions for this date ---- */}
        {o.net_id != null && !o.is_cancelled && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
            {held ? (
              <CardActionButton
                icon={<AssessmentIcon />}
                label="Report"
                color="primary"
                tooltip="Open this net's report"
                onClick={() => navigate(`/nets/${o.net_id}/report`)}
              />
            ) : (
              <CardActionButton
                icon={<OpenInNewIcon />}
                label="Open"
                color="primary"
                tooltip="Open this net"
                onClick={() => navigate(`/nets/${o.net_id}`)}
              />
            )}
          </Box>
        )}
      </Box>

      {/* ---- The usual card ---- */}
      {schedule ? (
        <Box sx={{ px: 1, pb: 1 }}>{renderScheduleCard(schedule)}</Box>
      ) : (
        <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {o.description && <ExpandableDescription text={o.description} />}
          {o.frequencies.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2" color="text.secondary">{formatFrequencyList(o.frequencies)}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              <strong>Net Manager:</strong> {o.owner_callsign || 'Unknown'}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ScheduleCalendar;
