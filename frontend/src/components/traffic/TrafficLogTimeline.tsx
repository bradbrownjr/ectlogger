import React from 'react';
import { Box, Chip, Tooltip, Typography } from '@mui/material';
import { formatDateTime } from '../../utils/dateUtils';

// ========== TrafficLogTimeline ==========
// Read-only, append-only vertical timeline of a form's chain of custody
// (TrafficLogEntry rows, ordered by sequence). See
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md D7 and section 4.3. An entry
// whose reported_by_user_id differs from the form's created_by_id is a
// "second-hand" report (D7: "an entry entered second-hand... is
// structurally distinguishable from a first-hand one") and gets a distinct
// chip so the reader knows the entry wasn't logged by whoever the action
// actually happened to.

export interface TrafficLogEntry {
  id: number;
  form_id: number;
  sequence: number;
  action: string;
  method: string | null;
  method_note: string | null;
  path_name: string | null;
  handed_to: string | null;
  handed_to_user_id: number | null;
  reported_by_user_id: number | null;
  net_id: number | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  originated: 'Originated',
  received: 'Received',
  relayed: 'Relayed',
  delivered: 'Delivered',
  serviced: 'Serviced',
  cancelled: 'Cancelled',
};

const ACTION_COLORS: Record<string, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  originated: 'default',
  received: 'info',
  relayed: 'info',
  delivered: 'success',
  serviced: 'warning',
  cancelled: 'error',
};

const METHOD_LABELS: Record<string, string> = {
  voice_net: 'Voice net',
  cw_net: 'CW net',
  digital_net: 'Digital net',
  phone: 'Phone',
  email: 'Email',
  in_person: 'In person',
  postal: 'Postal',
  other: 'Other',
};

interface TrafficLogTimelineProps {
  entries: TrafficLogEntry[];
  formCreatedById: number | null;
}

const TrafficLogTimeline: React.FC<TrafficLogTimelineProps> = ({ entries, formCreatedById }) => {
  if (entries.length === 0) {
    return <Typography variant="body2" color="text.secondary">No log entries yet.</Typography>;
  }

  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {sorted.map((entry, index) => {
        const isSecondHand = entry.reported_by_user_id != null
          && formCreatedById != null
          && entry.reported_by_user_id !== formCreatedById;
        const isLast = index === sorted.length - 1;

        return (
          <Box key={entry.id} sx={{ display: 'flex', gap: 1.5 }}>
            {/* ========== Timeline rail: dot + connecting line ========== */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: `${ACTION_COLORS[entry.action] || 'default'}.main`,
                  mt: 0.6,
                  flexShrink: 0,
                }}
              />
              {!isLast && <Box sx={{ flex: 1, width: 2, bgcolor: 'divider', minHeight: 24 }} />}
            </Box>

            {/* ========== Entry content ========== */}
            <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={ACTION_LABELS[entry.action] || entry.action}
                  color={ACTION_COLORS[entry.action] || 'default'}
                />
                {entry.method && (
                  <Typography variant="caption" color="text.secondary">
                    via {METHOD_LABELS[entry.method] || entry.method}
                    {entry.method_note ? ` (${entry.method_note})` : ''}
                  </Typography>
                )}
                {isSecondHand && (
                  <Tooltip title="Logged by someone other than the form's submitter -- a second-hand report of this hop">
                    <Chip size="small" variant="outlined" label="Second-hand" />
                  </Tooltip>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" display="block">
                {formatDateTime(entry.occurred_at)}
              </Typography>
              {(entry.handed_to || entry.path_name) && (
                <Typography variant="body2">
                  {entry.handed_to ? `To ${entry.handed_to}` : ''}
                  {entry.handed_to && entry.path_name ? ' ' : ''}
                  {entry.path_name ? `via ${entry.path_name}` : ''}
                </Typography>
              )}
              {entry.note && (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {entry.note}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default TrafficLogTimeline;
