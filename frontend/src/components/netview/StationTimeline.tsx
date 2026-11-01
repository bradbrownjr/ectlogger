import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { formatTimeWithDate } from '../../utils/dateUtils';
import { checkInTimeText } from '../../utils/netLog';
import { StationRow } from '../../utils/stationRows';

// ========== A STATION'S TIMELINE AT ONE PLACE ==========
// Every check-in the station's row stands for, oldest first, with the
// channels marked offline and brought back between them. This is what the
// "Hide duplicate rows" toggle used to hide: the rows are still each their
// own logged event (and their own ICS-309 line), shown here under the
// station instead of scattered down the list. Net control can delete one
// event without touching the rest. Shared by the desktop table and mobile.

interface StationTimelineProps {
  group: StationRow<any>;
  frequencies: any[];
  formatFrequencyDisplay: (freq: any) => string;
  getStatusLabel: (status: string) => string;
  preferUtc: boolean;
  netStartedAt?: string;
  onDelete?: (checkInId: number) => void;
}

interface TimelineEvent {
  at: string;
  sortAt: number;
  text: string;
  checkIn?: any;
}

const stamp = (value: string) => new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).getTime();

const StationTimeline: React.FC<StationTimelineProps> = ({
  group, frequencies, formatFrequencyDisplay, getStatusLabel, preferUtc, netStartedAt, onDelete,
}) => {
  const channel = (fid?: number | null) => {
    const freq = frequencies.find((f: any) => f.id === fid);
    return freq ? formatFrequencyDisplay(freq) : null;
  };
  const events: TimelineEvent[] = [];
  group.rows.forEach((row, i) => {
    const on = channel(row.frequency_id);
    const what = i === 0 ? 'Checked in' : 'Rechecked';
    const status = row.status && !['checked_in', 'checked_out'].includes(row.status) ? ` (${getStatusLabel(row.status)})` : '';
    events.push({
      at: row.checked_in_at,
      // A station from a paper log with no time goes last (utils/netLog.ts).
      sortAt: row.time_not_recorded ? Number.MAX_SAFE_INTEGER : stamp(row.checked_in_at),
      text: `${what}${on ? ` on ${on}` : ''}${status}`,
      checkIn: row,
    });
  });
  group.marks.forEach((mark) => {
    const on = channel(mark.frequency_id) ?? 'a channel';
    events.push({ at: mark.offline_at, sortAt: stamp(mark.offline_at), text: `${on} marked offline` });
    if (mark.restored_at) events.push({ at: mark.restored_at, sortAt: stamp(mark.restored_at), text: `${on} back online` });
  });
  events.sort((a, b) => a.sortAt - b.sortAt);

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {events.map((event, i) => (
        <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 26 }}>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72, whiteSpace: 'nowrap' }}>
            {event.checkIn
              ? checkInTimeText(event.checkIn, (at) => formatTimeWithDate(at, preferUtc, netStartedAt))
              : formatTimeWithDate(event.at, preferUtc, netStartedAt)}
          </Typography>
          <Typography variant="caption">{event.text}</Typography>
          {/* One event only; the row's own Delete removes them all */}
          {event.checkIn && onDelete && group.rows.length > 1 && (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onDelete(event.checkIn.id); }}
              title="Delete this check-in"
              sx={{ p: 0.25 }}
            >
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default StationTimeline;
