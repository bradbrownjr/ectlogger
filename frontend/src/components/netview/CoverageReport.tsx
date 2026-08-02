import React, { useMemo } from 'react';
import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import { useAuth } from '../../contexts/AuthContext';
import { formatTimeWithDate } from '../../utils/dateUtils';

// ========== STATION COVERAGE REPORT ==========
// Phase 3 of the "can hear" inter-station propagation logging feature (see
// docs/ROADMAP.md "Relaying & Propagation Mapping"). Read-only, presentational
// rendering of the per-net "can hear" edge list: one row per directional
// report, with reciprocal (two-way) pairs detected and visually distinguished
// from one-way ones. No dialogs, no writes - the CanHearDialog (Phase 2)
// owns all mutation.
//
// Reused in two places: embedded live in NetView.tsx, and inlined into the
// PDF-exportable content in NetReport.tsx. Both pass the same shape of data
// (the CanHearReportResponse[] already fetched by their own parent), so this
// component never fetches on its own - avoids a duplicate network call when
// the parent already holds the list in state.

export interface CanHearReportEntry {
  id: number;
  net_id: number;
  reporter_check_in_id: number;
  heard_check_in_id: number;
  reporter_callsign: string;
  heard_callsign: string;
  frequency_id: number | null;
  reported_by_user_id: number | null;
  reported_at: string;
}

interface CoverageReportProps {
  netId: number;
  reports: CanHearReportEntry[];
  // Frequency label lookup (e.g. "146.520 FM") - optional since a net may
  // have no frequencies defined, matching the same nullable relationship as
  // CanHearReport.frequency_id itself.
  frequencyLabels?: Record<number, string>;
}

// A directional edge is part of a confirmed two-way pair when the reverse
// edge (heard reports hearing reporter) also exists for the same frequency.
// Realistic edge counts are dozens per net (see ROADMAP.md's own volume
// argument), so a plain Set membership check is simple and fast enough -
// no need for a graph library or memoized adjacency structure.
function edgeKey(reporterId: number, heardId: number, frequencyId: number | null): string {
  return `${reporterId}-${heardId}-${frequencyId ?? 'none'}`;
}

const CoverageReport: React.FC<CoverageReportProps> = ({ reports, frequencyLabels = {} }) => {
  const theme = useTheme();
  const { user } = useAuth();

  const rows = useMemo(() => {
    const allKeys = new Set(
      reports.map((r) => edgeKey(r.reporter_check_in_id, r.heard_check_in_id, r.frequency_id))
    );

    return reports
      .map((r) => {
        const reverseKey = edgeKey(r.heard_check_in_id, r.reporter_check_in_id, r.frequency_id);
        const isTwoWay = allKeys.has(reverseKey);
        return { ...r, isTwoWay };
      })
      // Two-way pairs first (the more informative confirmation), then by
      // most recently reported.
      .sort((a, b) => {
        if (a.isTwoWay !== b.isTwoWay) return a.isTwoWay ? -1 : 1;
        return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
      });
  }, [reports]);

  if (reports.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No station-to-station coverage reports have been recorded for this net yet.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
            <TableCell sx={{ fontWeight: 'bold' }}>Reporter</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 40 }} align="center" />
            <TableCell sx={{ fontWeight: 'bold' }}>Heard Station</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Frequency</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Reported</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: theme.palette.action.hover } }}>
              <TableCell>
                <Typography variant="body2" fontWeight="medium">{r.reporter_callsign}</Typography>
              </TableCell>
              <TableCell align="center">
                {r.isTwoWay ? (
                  <Chip
                    icon={<SyncAltIcon fontSize="small" />}
                    label="Two-way"
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                ) : (
                  <Chip
                    icon={<ArrowRightAltIcon fontSize="small" />}
                    label="One-way"
                    size="small"
                    variant="outlined"
                  />
                )}
              </TableCell>
              <TableCell>{r.heard_callsign}</TableCell>
              <TableCell>{r.frequency_id != null ? (frequencyLabels[r.frequency_id] || '—') : '—'}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                {formatTimeWithDate(r.reported_at, user?.prefer_utc || false)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default CoverageReport;
