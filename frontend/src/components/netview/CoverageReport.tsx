import React, { useMemo } from 'react';
import {
  alpha,
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  useTheme,
} from '@mui/material';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import { useAuth } from '../../contexts/AuthContext';
import { formatTimeWithDate } from '../../utils/dateUtils';
import useSortableTable from '../../hooks/useSortableTable';

// ========== STATION COVERAGE REPORT ==========
// Phase 3 of the "can hear" inter-station propagation logging feature (see
// docs/ROADMAP.md "Relaying & Propagation Mapping"). Read-only, presentational
// rendering of the per-net "can hear" edge list: one row per directional
// report, with reciprocal (two-way) pairs detected and visually distinguished
// from one-way ones. No dialogs, no writes - the CanHearDialog (Phase 2)
// owns all mutation.
//
// Reused in three places: docked/floating in NetView.tsx (via CoveragePanel's
// chrome wrapper), inlined into the PDF-exportable content in NetReport.tsx,
// and bare inside a popped-out browser window in NetPaneWindow.tsx. All pass
// the same shape of data (the CanHearReportResponse[] already fetched by
// their own parent), so this component never fetches on its own - avoids a
// duplicate network call when the parent already holds the list in state.

export interface CanHearReportEntry {
  id: number;
  net_id: number;
  reporter_check_in_id: number;
  heard_check_in_id: number;
  reporter_callsign: string;
  heard_callsign: string;
  frequency_id: number | null;
  // Amateur band label (e.g. "2m", "40m") the backend derives from
  // frequency_id, or - when frequency_id is null - from the net's PACE plan
  // if it has exactly one frequency. Null when neither resolves.
  band: string | null;
  reported_by_user_id: number | null;
  reported_at: string;
}

type CoverageSortField = 'reporter' | 'link_type' | 'heard' | 'frequency' | 'reported_at';

interface CoverageReportProps {
  netId: number;
  reports: CanHearReportEntry[];
  // Frequency label lookup (e.g. "146.520 FM") - optional since a net may
  // have no frequencies defined, matching the same nullable relationship as
  // CanHearReport.frequency_id itself.
  frequencyLabels?: Record<number, string>;
  // Omits the Frequency header cell and body cells entirely when false -
  // simplex (single-frequency) nets have nothing to distinguish, so the
  // column is just noise. Defaults true to match NetReport.tsx's existing
  // PDF usage, which never passed this prop before it existed.
  showFrequencyColumn?: boolean;
  // Substring match (case-insensitive) against reporter_callsign OR
  // heard_callsign. Computed AFTER two-way/one-way detection (over the full
  // unfiltered report list) but BEFORE sorting - filtering before computing
  // reciprocity would make a genuinely two-way edge look one-way whenever
  // its partner's callsign happens to be filtered out.
  filterCallsign?: string;
  // Exact (case-insensitive) match against reporter_callsign OR
  // heard_callsign - visually marks matching rows (background tint) WITHOUT
  // hiding any other rows. This is deliberately separate from filterCallsign:
  // clicking a callsign in the table must never make other stations vanish
  // with no visible way back - only the typed filter above does that, and it
  // always shows a Clear button while active.
  highlightCallsign?: string;
  // Fired when a reporter/heard callsign cell is clicked. The toggle
  // behavior (click again to clear the highlight) lives in the parent's
  // state (CoveragePanel), not here - this component just reports which
  // callsign was clicked.
  onCallsignClick?: (callsign: string) => void;
}

// A directional edge is part of a confirmed two-way pair when the reverse
// edge (heard reports hearing reporter) also exists for the same frequency.
// Realistic edge counts are dozens per net (see ROADMAP.md's own volume
// argument), so a plain Set membership check is simple and fast enough -
// no need for a graph library or memoized adjacency structure.
function edgeKey(reporterId: number, heardId: number, frequencyId: number | null): string {
  return `${reporterId}-${heardId}-${frequencyId ?? 'none'}`;
}

// Frequency cell text: the looked-up label plus, when known, the band in
// parentheses. A report saved with no specific frequency but a
// server-inferred band (single-frequency net) shows "Net frequency (2m)"
// rather than a bare "—", since the band is still useful information.
export function formatFrequencyCell(report: CanHearReportEntry, frequencyLabels: Record<number, string>): string {
  let label: string;
  if (report.frequency_id != null) {
    label = frequencyLabels[report.frequency_id] || '—';
  } else if (report.band) {
    label = 'Net frequency';
  } else {
    label = '—';
  }
  return report.band ? `${label} (${report.band})` : label;
}

// Two-way/one-way detection + optional callsign filter, factored out of the
// table's own useMemo so CoveragePanel's CSV export can build the exact same
// rows (including which pairs are reciprocal) without duplicating the logic.
// Exact frequency_id match only - a report logged with no specific frequency
// is never assumed to be the same edge as one logged against an explicit
// frequency on a multi-frequency net, since that would be guessing which
// frequency it was actually heard on.
export function buildCoverageRows(
  reports: CanHearReportEntry[],
  filterCallsign?: string
): (CanHearReportEntry & { isTwoWay: boolean })[] {
  const allKeys = new Set(
    reports.map((r) => edgeKey(r.reporter_check_in_id, r.heard_check_in_id, r.frequency_id))
  );
  const withTwoWay = reports.map((r) => {
    const reverseKey = edgeKey(r.heard_check_in_id, r.reporter_check_in_id, r.frequency_id);
    return { ...r, isTwoWay: allKeys.has(reverseKey) };
  });

  if (!filterCallsign) return withTwoWay;
  const needle = filterCallsign.toLowerCase();
  return withTwoWay.filter(
    (r) =>
      r.reporter_callsign.toLowerCase().includes(needle) ||
      r.heard_callsign.toLowerCase().includes(needle)
  );
}

const CoverageReport: React.FC<CoverageReportProps> = ({
  reports,
  frequencyLabels = {},
  showFrequencyColumn = true,
  filterCallsign,
  highlightCallsign,
  onCallsignClick,
}) => {
  const theme = useTheme();
  const { user } = useAuth();

  // Default sort: reported_at desc. Link type (two-way/one-way) also
  // defaults to desc so two-way (the more informative confirmation) sorts
  // first on its first click, matching today's old hardcoded ordering.
  const { sortField, sortDirection, handleSort } = useSortableTable<CoverageSortField>(
    'reported_at',
    (field) => (field === 'reported_at' || field === 'link_type') ? 'desc' : 'asc'
  );

  const rows = useMemo(() => {
    // Reciprocity is computed over the FULL unfiltered report list first -
    // filtering before this would make a genuinely two-way edge look
    // one-way whenever its partner's callsign is filtered out.
    const filtered = buildCoverageRows(reports, filterCallsign);

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'reporter':
          cmp = a.reporter_callsign.localeCompare(b.reporter_callsign);
          break;
        case 'heard':
          cmp = a.heard_callsign.localeCompare(b.heard_callsign);
          break;
        case 'frequency': {
          const aLabel = a.frequency_id != null ? (frequencyLabels[a.frequency_id] || '') : '';
          const bLabel = b.frequency_id != null ? (frequencyLabels[b.frequency_id] || '') : '';
          cmp = aLabel.localeCompare(bLabel);
          break;
        }
        case 'link_type':
          cmp = a.isTwoWay === b.isTwoWay ? 0 : (a.isTwoWay ? 1 : -1);
          break;
        case 'reported_at':
        default:
          cmp = new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [reports, filterCallsign, sortField, sortDirection, frequencyLabels]);

  // Distinguish "nothing recorded yet" from "nothing matches the filter" -
  // the latter needs a different message since reports.length > 0.
  if (reports.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No station-to-station coverage reports have been recorded for this net yet.
      </Typography>
    );
  }

  const renderCallsign = (callsign: string) => {
    const text = <Typography variant="body2" fontWeight="medium" component="span">{callsign}</Typography>;
    if (!onCallsignClick) return text;
    return (
      <Box
        component="span"
        onClick={() => onCallsignClick(callsign)}
        sx={{
          cursor: 'pointer',
          color: 'primary.main',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          '& .MuiTypography-root': { color: 'inherit' },
        }}
      >
        {text}
      </Box>
    );
  };

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
            <TableCell sx={{ fontWeight: 'bold' }} sortDirection={sortField === 'reporter' ? sortDirection : false}>
              <TableSortLabel
                active={sortField === 'reporter'}
                direction={sortField === 'reporter' ? sortDirection : 'asc'}
                onClick={() => handleSort('reporter')}
              >
                Reporter
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 40 }} align="center" sortDirection={sortField === 'link_type' ? sortDirection : false}>
              <TableSortLabel
                active={sortField === 'link_type'}
                direction={sortField === 'link_type' ? sortDirection : 'desc'}
                onClick={() => handleSort('link_type')}
                title="Sort by two-way/one-way"
              >
                {/* Empty label - just the sort arrow, matching AdminUsersTab's icon-only columns */}
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold' }} sortDirection={sortField === 'heard' ? sortDirection : false}>
              <TableSortLabel
                active={sortField === 'heard'}
                direction={sortField === 'heard' ? sortDirection : 'asc'}
                onClick={() => handleSort('heard')}
              >
                Heard Station
              </TableSortLabel>
            </TableCell>
            {showFrequencyColumn && (
              <TableCell sx={{ fontWeight: 'bold' }} sortDirection={sortField === 'frequency' ? sortDirection : false}>
                <TableSortLabel
                  active={sortField === 'frequency'}
                  direction={sortField === 'frequency' ? sortDirection : 'asc'}
                  onClick={() => handleSort('frequency')}
                >
                  Frequency
                </TableSortLabel>
              </TableCell>
            )}
            <TableCell sx={{ fontWeight: 'bold' }} sortDirection={sortField === 'reported_at' ? sortDirection : false}>
              <TableSortLabel
                active={sortField === 'reported_at'}
                direction={sortField === 'reported_at' ? sortDirection : 'desc'}
                onClick={() => handleSort('reported_at')}
              >
                Reported
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showFrequencyColumn ? 5 : 4}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                  No reports match your filter.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const isHighlighted = !!highlightCallsign && (
                r.reporter_callsign.toLowerCase() === highlightCallsign.toLowerCase() ||
                r.heard_callsign.toLowerCase() === highlightCallsign.toLowerCase()
              );
              return (
              <TableRow
                key={r.id}
                sx={{
                  '&:nth-of-type(odd)': { backgroundColor: isHighlighted ? undefined : theme.palette.action.hover },
                  ...(isHighlighted && { backgroundColor: alpha(theme.palette.info.main, 0.16) }),
                }}
              >
                <TableCell>
                  {renderCallsign(r.reporter_callsign)}
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
                <TableCell>
                  {renderCallsign(r.heard_callsign)}
                </TableCell>
                {showFrequencyColumn && (
                  <TableCell>{formatFrequencyCell(r, frequencyLabels)}</TableCell>
                )}
                <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                  {formatTimeWithDate(r.reported_at, user?.prefer_utc || false)}
                </TableCell>
              </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default CoverageReport;
