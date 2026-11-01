import React, { useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import MapIcon from '@mui/icons-material/Map';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime } from '../../utils/dateUtils';
import { canHearApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { exportToPdf } from '../../utils/pdfExport';
import { frozenPanelSx } from '../../utils/frozenTable';
import FloatingWindow from '../FloatingWindow';
import MaximizedPanel from '../shared/MaximizedPanel';
import CoverageReport, { CanHearReportEntry, buildCoverageRows, formatFrequencyCell } from './CoverageReport';
import SiteCoverageView, { siteCoverageCsv } from './SiteCoverageView';
import { SiteCoverageSummary } from '../../utils/coverageSites';

// ========== STATION COVERAGE PANEL ==========
// The Coverage panel in all four of its places, so it has the same buttons
// in each (Brad, 2026-10-31: buttons present docked went missing floating,
// and the popped-out window had none):
//   docked    a pane in Net View's right column, with a Chat-style header
//   floating  a FloatingWindow, its buttons on the window's title bar
//   maximized shared/MaximizedPanel.tsx, from docked or floating
//   window    the popped-out browser window (NetPaneWindow.tsx), where the
//             browser's own window controls stand in for ours
// The panel's own buttons (filter, clear highlight, PDF, CSV, show on map)
// are one list, panelActions below; only the window controls differ.
//
// Its tables keep their heading row and first column in view while they
// scroll (utils/frozenTable.ts), sized to this panel's height.
//
// The callsign highlight is lifted to NetView.tsx, since it's shared with
// CheckInMap's coverage overlay: clicking a callsign here highlights it on
// the map too. The popped-out window keeps its own.

export type CoveragePanelMode = 'docked' | 'floating' | 'window';

interface CoveragePanelProps {
  mode: CoveragePanelMode;
  netId: number;
  // For the PDF's heading and file name
  netName?: string;
  reports: CanHearReportEntry[];
  frequencyLabels?: Record<number, string>;
  showFrequencyColumn?: boolean;
  highlightedCallsign: string | null;
  onHighlightCallsign: (callsign: string | null) => void;
  // "Reveal on map with overlay on": this panel's one cross-link into the
  // map, so not in the popped-out window, which has no map beside it.
  onShowOnMap?: () => void;
  // Window controls. onClose hides the panel; onDetach floats a docked
  // panel; onDock docks a floating one; onPopOut opens the browser window.
  onClose?: () => void;
  onDetach?: () => void;
  onDock?: () => void;
  onPopOut?: () => void;
  // Docked only: minimize is lifted so NetViewSidePanels can give the space
  // to the panes beside it. A floating window minimizes itself.
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  // Frequency-correction dropdown in the reports table - all three needed
  // together, since without a permission gate or somewhere to send the
  // request the dropdown has nothing safe to do. canManage mirrors
  // NetView.tsx's canReportCanHear (NCS/Logger/Relay); a report's own
  // reporter can also correct it regardless of canManage.
  netFrequencyOptions?: { id: number; label: string }[];
  canManage?: boolean;
  currentUserId?: number;
  onToast?: (message: string) => void;
  // Coverage by site (useSiteCoverage). The "By site" view is offered only
  // when the net has sites, repeaters/nodes or outside contacts.
  siteCoverage?: SiteCoverageSummary;
}

const CoveragePanel: React.FC<CoveragePanelProps> = ({
  mode,
  netId,
  netName,
  reports,
  frequencyLabels,
  showFrequencyColumn,
  highlightedCallsign,
  onHighlightCallsign,
  onShowOnMap,
  onClose,
  onDetach,
  onDock,
  onPopOut,
  minimized,
  onMinimize,
  onRestore,
  netFrequencyOptions,
  canManage,
  currentUserId,
  onToast,
  siteCoverage,
}) => {
  const hasSiteView = !!siteCoverage && (
    siteCoverage.nodes.some((n) => n.kind === 'site') || siteCoverage.targets.length > 0 || siteCoverage.contacts.length > 0
  );
  // Which view: coverage by site, or the station-by-station report list. A
  // net set up with sites opens on the site view, since that's the drill's
  // question; the choice is per panel, not saved.
  const [view, setView] = useState<'reports' | 'sites'>('sites');
  const showSites = hasSiteView && view === 'sites';
  const [maximized, setMaximized] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  // Whether the filter box is open. The callsign filter only applies to the
  // reports list, so its button and box are shown there only.
  const [filterOpen, setFilterOpen] = useState(false);
  // Typed search text is intentionally separate from highlightedCallsign:
  // typing a filter is a deliberate, visible action that hides non-matching
  // rows (with a Clear button right there to undo it), whereas clicking a
  // callsign in the table only highlights it (on the map and in the table)
  // without hiding anything else - the two must not share state, or a click
  // would silently hide rows with no visible indication or way back.
  const [searchText, setSearchText] = useState('');
  const { user } = useAuth();
  const preferUtc = user?.prefer_utc || false;

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

  // ========== EXPORTS ==========
  // Both export what the view shows: the by-site tables, or the reports list
  // with the same two-way detection and callsign filter as the table (the
  // shared buildCoverageRows helper), not the raw unfiltered report list.
  const fileStem = `${showSites ? 'coverage-by-site' : 'station-coverage'}-net-${netId}`;
  const downloadCsv = (text: string) => {
    const blob = new Blob([text], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${fileStem}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (showSites && siteCoverage) {
      downloadCsv(siteCoverageCsv(siteCoverage, frequencyLabels || {}));
      return;
    }
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
          formatDateTime(r.reported_at, preferUtc),
        ]
          .map(escape)
          .join(',')
      );
    });
    downloadCsv(lines.join('\n'));
  };

  // A light copy laid out at page width (pdfExport's clone mode), so the
  // tables print whole however small the panel is on screen.
  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      await exportToPdf(exportRef.current, {
        filename: fileStem,
        orientation: 'landscape',
        pageFooter: `${netName || `Net ${netId}`} · Station Coverage`,
      });
    } catch {
      onToast?.('Could not make the PDF');
    } finally {
      setExporting(false);
    }
  };

  // ========== THE PANEL'S OWN BUTTONS ==========
  // One list for every mode. onBar: drawn on a blue title bar (floating,
  // maximized), so the icons take its text color.
  const hasContent = reports.length > 0 || showSites;
  const panelActions = (onBar: boolean) => {
    const sx = { p: 0.25, ...(onBar && { color: 'inherit' }) };
    const icon = { fontSize: onBar ? 18 : 14 } as const;
    return (
      <>
        {!showSites && (
          <IconButton
            size="small"
            onClick={() => {
              if (filterOpen) setSearchText('');
              setFilterOpen((v) => !v);
            }}
            title={filterOpen ? 'Close filter' : 'Filter by callsign'}
            sx={sx}
          >
            <SearchIcon sx={icon} />
          </IconButton>
        )}
        {highlightedCallsign && (
          <IconButton size="small" onClick={() => onHighlightCallsign(null)} title={`Clear highlight (${highlightedCallsign})`} sx={sx}>
            <HighlightOffIcon sx={icon} />
          </IconButton>
        )}
        {hasContent && (
          <IconButton size="small" onClick={handleExportPdf} disabled={exporting} title="Export to PDF" sx={sx}>
            {exporting ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfIcon sx={icon} />}
          </IconButton>
        )}
        {hasContent && (
          <IconButton size="small" onClick={handleExportCsv} title="Export to CSV" sx={sx}>
            <DownloadIcon sx={icon} />
          </IconButton>
        )}
        {onShowOnMap && (
          <IconButton size="small" onClick={onShowOnMap} title="Show on map" sx={sx}>
            <MapIcon sx={icon} />
          </IconButton>
        )}
      </>
    );
  };

  // ========== CONTENT (every mode) ==========
  const content = (
    <Box
      sx={{
        flex: '1 1 0',
        minHeight: 0,
        p: 1,
        // The by-site tables size themselves to this box, which scrolls past
        // them. The reports list is one table, so instead it fills what's
        // left of the box and scrolls itself. Docked on a phone the pane has
        // no height of its own (the page scrolls), so no size container there.
        ...(showSites
          ? { overflow: 'auto' }
          : { overflow: 'hidden', display: 'flex', flexDirection: 'column' }),
        ...(mode === 'docked' && !maximized ? { containerType: { xs: 'normal', md: 'size' } } : frozenPanelSx),
      }}
    >
      {/* ========== VIEW SWITCH AND FILTER ========== */}
      {(hasSiteView || (filterOpen && !showSites)) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap', flexShrink: 0 }}>
          {/* Shown only on a net with sites, repeaters/nodes or outside contacts */}
          {hasSiteView && (
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              <ToggleButton value="sites">By site</ToggleButton>
              <ToggleButton value="reports">Reports</ToggleButton>
            </ToggleButtonGroup>
          )}
          {filterOpen && !showSites && (
            <TextField
              size="small"
              variant="standard"
              autoFocus
              placeholder="Filter by callsign..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                endAdornment: searchText ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchText('')} sx={{ p: 0.25 }} title="Clear filter">
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              }}
              sx={{ flex: '1 1 160px', maxWidth: 280 }}
            />
          )}
        </Box>
      )}
      <Box ref={exportRef} sx={showSites ? undefined : { flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Heading for the PDF only */}
        <Box data-export-show="block" sx={{ display: 'none', mb: 1 }}>
          <Typography variant="h6">{netName || `Net ${netId}`}</Typography>
          <Typography variant="body2">
            Station Coverage{hasSiteView ? (showSites ? ': by site' : ': reports') : ''}, as of {formatDateTime(new Date().toISOString(), preferUtc)}
          </Typography>
        </Box>
        {showSites && siteCoverage ? (
          <SiteCoverageView summary={siteCoverage} frequencyLabels={frequencyLabels || {}} frozen />
        ) : (
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
            frozen
          />
        )}
      </Box>
    </Box>
  );

  const title = 'Station Coverage';
  const toggleMaximize = () => {
    // The button that was clicked is about to be unmounted
    (document.activeElement as HTMLElement | null)?.blur();
    setMaximized((v) => !v);
  };

  // ========== MAXIMIZED (from docked or floating) ==========
  if (maximized) {
    return (
      <MaximizedPanel
        title={title}
        actions={panelActions(true)}
        onRestore={toggleMaximize}
        onPopOut={onPopOut}
        onDock={mode === 'floating' ? onDock : undefined}
        onClose={onClose}
      >
        {content}
      </MaximizedPanel>
    );
  }

  // ========== FLOATING ==========
  if (mode === 'floating') {
    return (
      <FloatingWindow
        title={title}
        isDetached
        actions={panelActions(true)}
        onMaximize={toggleMaximize}
        onAttach={onDock}
        onClose={onClose}
        onPopOut={onPopOut}
        // Room for the by-site grids; fitted to the page on smaller screens
        defaultWidth={1100}
        defaultHeight={650}
        minWidth={350}
        minHeight={250}
        storageKey="coverage"
      >
        {content}
      </FloatingWindow>
    );
  }

  // ========== DOCKED, OR ITS OWN BROWSER WINDOW ==========
  // A header row structured like Chat.tsx's (Table > TableHead > TableRow >
  // TableCell) so it matches the docked Chat/Activity Log/Map headers.
  const docked = mode === 'docked';
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
                  <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </Box>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    {!minimized && panelActions(false)}
                    {/* Window controls, in the same order as the floating
                        window's: minimize, maximize, float, pop out, close */}
                    {docked && (onMinimize || onRestore) && (
                      <IconButton size="small" onClick={minimized ? onRestore : onMinimize} title={minimized ? 'Restore' : 'Minimize'} sx={{ p: 0.25 }}>
                        {minimized ? <CropSquareIcon sx={{ fontSize: 14 }} /> : <MinimizeIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    )}
                    {docked && (
                      <IconButton size="small" onClick={toggleMaximize} title="Maximize" sx={{ p: 0.25 }}>
                        <FullscreenIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {docked && onDetach && (
                      <IconButton size="small" onClick={onDetach} title="Detach to floating window" sx={{ p: 0.25, display: { xs: 'none', lg: 'inline-flex' } }}>
                        <PictureInPictureAltIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {docked && onPopOut && (
                      <IconButton size="small" onClick={onPopOut} title="Open in new window" sx={{ p: 0.25 }}>
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {docked && onClose && (
                      <IconButton size="small" onClick={onClose} title="Close" sx={{ p: 0.25 }}>
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
      {!minimized && content}
    </Paper>
  );
};

export default CoveragePanel;
