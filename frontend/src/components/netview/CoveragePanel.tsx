import React, { useState } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import MapIcon from '@mui/icons-material/Map';
import DownloadIcon from '@mui/icons-material/Download';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime } from '../../utils/dateUtils';
import { canHearApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import CoverageReport, { CanHearReportEntry, buildCoverageRows, formatFrequencyCell } from './CoverageReport';

// ========== STATION COVERAGE SIDE PANEL ==========
// Header-chrome wrapper around CoverageReport (Phase 3 of the "can hear"
// propagation logging feature - see docs/ROADMAP.md "Relaying & Propagation
// Mapping"), structured like Chat.tsx's header (Box(flexShrink:0) > Table >
// TableHead > TableRow > TableCell) so it visually matches Chat/Activity
// Log/Map's docked headers instead of being a plain Box.
//
// The callsign highlight/filter state (highlightedCallsign) is lifted all
// the way up to NetView.tsx, since it's shared with CheckInMap's coverage
// overlay - clicking a callsign here highlights it on the map too, and vice
// versa is not needed since the map doesn't originate clicks, only reads
// the shared value.

interface CoveragePanelProps {
  netId: number;
  reports: CanHearReportEntry[];
  frequencyLabels?: Record<number, string>;
  showFrequencyColumn?: boolean;
  // Lifted to NetView.tsx - shared with the map overlay.
  highlightedCallsign: string | null;
  onHighlightCallsign: (callsign: string | null) => void;
  // "Reveal on map with overlay on" button - title bar only, since it's
  // this panel's one cross-link into the map.
  onShowOnMap?: () => void;
  // On-demand panel needs a way to fully hide itself - unlike FloatingWindow's
  // own close icon, which only re-docks.
  onClose?: () => void;
  onDetach?: () => void; // docked mode only
  onPopOut?: () => void; // docked mode only (floating mode gets none - FloatingWindow supplies its own)
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  // Frequency-correction dropdown in the table below - all three needed
  // together, since without a permission gate or somewhere to send the
  // request the dropdown has nothing safe to do. canManage mirrors
  // NetView.tsx's canReportCanHear (NCS/Logger/Relay); a report's own
  // reporter can also correct it regardless of canManage.
  netFrequencyOptions?: { id: number; label: string }[];
  canManage?: boolean;
  currentUserId?: number;
  onToast?: (message: string) => void;
}

const CoveragePanel: React.FC<CoveragePanelProps> = ({
  netId,
  reports,
  frequencyLabels,
  showFrequencyColumn,
  highlightedCallsign,
  onHighlightCallsign,
  onShowOnMap,
  onClose,
  onDetach,
  onPopOut,
  minimized,
  onMinimize,
  onRestore,
  netFrequencyOptions,
  canManage,
  currentUserId,
  onToast,
}) => {
  // Local UI toggle only - whether the title is replaced by the filter
  // TextField.
  const [filterOpen, setFilterOpen] = useState(false);
  // Typed search text is intentionally separate from highlightedCallsign:
  // typing a filter is a deliberate, visible action that hides non-matching
  // rows (with a Clear button right there to undo it), whereas clicking a
  // callsign in the table only highlights it (on the map and in the table)
  // without hiding anything else - the two must not share state, or a click
  // would silently hide rows with no visible indication or way back.
  const [searchText, setSearchText] = useState('');
  const { user } = useAuth();

  // Staff can correct any report; a station can also correct its own past
  // entry, matching the backend's self-report-or-staff rule. reported_by_user_id
  // is the closest client-side signal to "whoever submitted this" - the
  // reporter's *current* user_id isn't loaded onto CanHearReportEntry, and
  // the backend re-checks the authoritative rule anyway (including whether
  // self-reporting is still enabled for the net) before applying the change.
  const canEditFrequency = (report: CanHearReportEntry) =>
    !!canManage || (!!currentUserId && report.reported_by_user_id === currentUserId);

  // State is intentionally NOT patched optimistically - the can_hear_changed
  // WebSocket broadcast (received by every viewer, including this one)
  // refreshes the parent's report list, matching CanHearDialog's own save
  // flow. A 403/409 surfaces via onToast and the dropdown just reverts to
  // its last known value once that refresh arrives.
  const handleFrequencyChange = async (reportId: number, frequencyId: number | null) => {
    try {
      await canHearApi.updateFrequency(netId, reportId, frequencyId);
    } catch (error: any) {
      onToast?.(getErrorMessage(error, 'Failed to update this report\'s frequency'));
    }
  };

  // Exports exactly what's currently visible in the table (same two-way
  // detection and callsign filter as CoverageReport itself, via the shared
  // buildCoverageRows helper) rather than the raw unfiltered report list.
  const handleExportCsv = () => {
    const rows = buildCoverageRows(reports, searchText || undefined);
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Reporter', 'Link Type', 'Heard Station', 'Frequency', 'Reported'];
    const lines = [header.map(escape).join(',')];
    rows.forEach((r) => {
      lines.push(
        [
          r.reporter_callsign,
          r.isTwoWay ? 'Two-way' : 'One-way',
          r.heard_callsign,
          formatFrequencyCell(r, frequencyLabels || {}),
          formatDateTime(r.reported_at, user?.prefer_utc || false),
        ]
          .map(escape)
          .join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `station-coverage-net-${netId}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Paper
      sx={{
        display: 'flex',
        flexDirection: 'column',
        border: 1,
        borderColor: 'divider',
        borderRadius: '4px',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.default' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  {filterOpen ? (
                    <TextField
                      size="small"
                      variant="standard"
                      autoFocus
                      fullWidth
                      placeholder="Filter by callsign..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      InputProps={{
                        endAdornment: searchText ? (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setSearchText('')} sx={{ p: 0.25 }}>
                              <ClearIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </InputAdornment>
                        ) : undefined,
                      }}
                      sx={{ flex: 1, minWidth: 0 }}
                    />
                  ) : (
                    <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Station Coverage
                    </Box>
                  )}
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (filterOpen) setSearchText('');
                        setFilterOpen((v) => !v);
                      }}
                      title={filterOpen ? 'Close filter' : 'Filter by callsign'}
                      sx={{ p: 0.25 }}
                    >
                      <SearchIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    {highlightedCallsign && (
                      <IconButton
                        size="small"
                        onClick={() => onHighlightCallsign(null)}
                        title={`Clear highlight (${highlightedCallsign})`}
                        sx={{ p: 0.25 }}
                      >
                        <HighlightOffIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {reports.length > 0 && (
                      <IconButton
                        size="small"
                        onClick={handleExportCsv}
                        title="Export to CSV"
                        sx={{ p: 0.25 }}
                      >
                        <DownloadIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {onShowOnMap && (
                      <IconButton
                        size="small"
                        onClick={onShowOnMap}
                        title="Show on map"
                        sx={{ p: 0.25 }}
                      >
                        <MapIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {/* Grouped so the two actions that stay within this browser
                        tab (minimize, float) sit together, with the one that
                        leaves to a separate window (pop-out) last - mirrors
                        Chat.tsx's icon group exactly. */}
                    {(onMinimize || onRestore) && (
                      <IconButton
                        size="small"
                        onClick={minimized ? onRestore : onMinimize}
                        title={minimized ? 'Restore' : 'Minimize'}
                        sx={{ p: 0.25 }}
                      >
                        {minimized
                          ? <CropSquareIcon sx={{ fontSize: 14 }} />
                          : <MinimizeIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    )}
                    {onDetach && (
                      <IconButton
                        size="small"
                        onClick={onDetach}
                        title="Detach to floating window"
                        sx={{ p: 0.25, display: { xs: 'none', lg: 'inline-flex' } }}
                      >
                        <PictureInPictureAltIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {onPopOut && (
                      <IconButton
                        size="small"
                        onClick={onPopOut}
                        title="Open in new window"
                        sx={{ p: 0.25 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {onClose && (
                      <IconButton
                        size="small"
                        onClick={onClose}
                        title="Close"
                        sx={{ p: 0.25 }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
      </Box>

      {!minimized && (
        <Box sx={{ flex: '1 1 auto', overflow: 'auto', p: 1 }}>
          <CoverageReport
            netId={netId}
            reports={reports}
            frequencyLabels={frequencyLabels}
            showFrequencyColumn={showFrequencyColumn}
            filterCallsign={searchText || undefined}
            highlightCallsign={highlightedCallsign ?? undefined}
            onCallsignClick={(cs) => onHighlightCallsign(highlightedCallsign === cs ? null : cs)}
            netFrequencyOptions={netFrequencyOptions}
            canEditFrequency={canEditFrequency}
            onFrequencyChange={handleFrequencyChange}
          />
        </Box>
      )}
    </Paper>
  );
};

export default CoveragePanel;
