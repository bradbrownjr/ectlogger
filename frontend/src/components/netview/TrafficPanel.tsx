import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
// "View all in Traffic" uses the Traffic section's own Browse-tab icon.
// It must NOT be LaunchIcon -- that is the same glyph as OpenInNewIcon, which
// means "pop out to a window" in every other panel, so using it here made a
// navigation link look like a pop-out.
import ListAltIcon from '@mui/icons-material/ListAlt';
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import api, { netApi, trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import TrafficTable from '../traffic/TrafficTable';
import TrafficDetail from '../traffic/TrafficDetail';
import TrafficComposer from '../traffic/TrafficComposer';
import { TrafficForm } from '../../hooks/useTrafficList';
import { useFormDefinitions } from '../../hooks/useFormDefinitions';

// ========== TRAFFIC SIDE PANEL (per-net) ==========
// A thin net-scoped wrapper around TrafficTable/TrafficDetail (Stage A), fed
// by the net-scoped GET /traffic/nets/{net_id}/forms and the new
// GET /traffic/nets/{net_id}/summary. Deliberately no browse/search UI here
// -- that stays in the canonical /traffic section (Traffic.tsx); "View all
// in Traffic" deep-links there. See TRAFFIC-HANDLING-DESIGN.md section 4.5.
//
// Header chrome follows CoveragePanel.tsx exactly -- close, detach to a
// floating overlay, pop out to a real window, minimize -- because this panel
// is on-demand in the same way: the toolbar's Traffic button opens it, and it
// is not force-docked just because the net has traffic handling turned on.

interface TrafficSummary {
  net_id: number;
  draft: number;
  pending: number;
  relayed: number;
  delivered: number;
  cancelled: number;
  outstanding: number;
}

const DISPOSITION_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  pending: 'warning',
  relayed: 'info',
  delivered: 'success',
  cancelled: 'error',
};

interface TrafficPanelProps {
  netId: number;
  currentUserId?: number;
  // On-demand panel needs a real close, unlike FloatingWindow's own close
  // icon which only re-docks. onDetach/onPopOut are docked-mode only -- in
  // floating mode FloatingWindow supplies its own, same as CoveragePanel.
  onClose?: () => void;
  onDetach?: () => void;
  onPopOut?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const TrafficPanel: React.FC<TrafficPanelProps> = ({
  netId,
  currentUserId,
  onClose,
  onDetach,
  onPopOut,
  minimized,
  onMinimize,
  onRestore,
}) => {
  const [items, setItems] = useState<TrafficForm[]>([]);
  const [summary, setSummary] = useState<TrafficSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);

  // ========== FILE TRAFFIC ON THIS NET ==========
  // The reason the panel exists: logging what's passed on the air, attached
  // to this net. TrafficComposer is the same component the Traffic section's
  // New tab uses -- the only difference here is that netId is supplied, which
  // is what makes the form belong to the net (FormCreate.net_id).
  const [composeOpen, setComposeOpen] = useState(false);
  const { definitions } = useFormDefinitions();
  const [net, setNet] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    netApi.get(netId)
      .then((res) => {
        if (!cancelled) setNet(res.data);
      })
      .catch(() => {
        // Only used for the net's optional traffic restrictions -- without it
        // the composer just offers every form type.
        if (!cancelled) setNet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [netId]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, summaryRes] = await Promise.all([
        trafficApi.listForNet(netId, { limit: 10 }),
        trafficApi.summary(netId),
      ]);
      setItems(listRes.data.items);
      setSummary(summaryRes.data);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load this net\'s traffic'));
    } finally {
      setLoading(false);
    }
  }, [netId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Refetch when the WebSocket relays a traffic_logged or traffic_log_changed
  // event for this net (dispatched as window CustomEvents by
  // useNetWebSocket.ts, matching the newChatMessage/chatReactionUpdate
  // convention already used by Chat.tsx). traffic_log_changed fires whenever
  // a chain-of-custody hop is appended (disposition/holder may have moved).
  useEffect(() => {
    const handleTrafficLogged = (event: any) => {
      if (event.detail?.net_id === netId) {
        refetch();
      }
    };
    window.addEventListener('trafficLogged', handleTrafficLogged);
    window.addEventListener('trafficLogChanged', handleTrafficLogged);
    return () => {
      window.removeEventListener('trafficLogged', handleTrafficLogged);
      window.removeEventListener('trafficLogChanged', handleTrafficLogged);
    };
  }, [netId, refetch]);

  // Opens in a new tab rather than navigating this one -- clicking it from
  // an active net shouldn't cost the operator their place on the net page.
  const handleViewAll = () => {
    window.open(`/traffic?net_id=${netId}`, '_blank', 'noopener');
  };

  // ========== TRAFFIC EXPORT ==========
  // One line per report on the net, oldest first -- every form type via
  // format_form()'s own per-type dispatch, not just RRI/WX strips (that was
  // this endpoint's original scope, and left a Radiogram-only net downloading
  // an empty file under the generic "Export traffic" label). "Raw" matches
  // what a receiving station actually does with RRI/WX strip data;
  // "radiogram-safe" is only for the rare case of relaying that content
  // inside a Radiogram/ICS-213 body over voice/CW -- a no-op on lines that
  // are already Radiogram/ICS-213 text. See
  // routers/nets_export.py::export_net_rri_strips.
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);

  const handleExportTraffic = async (format: 'raw' | 'radiogram_safe') => {
    setExportMenuAnchor(null);
    try {
      const response = await api.get(`/nets/${netId}/export/rri-strips`, {
        params: { format },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Traffic_net${netId}_${format}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export traffic:', err);
    }
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
                  <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Traffic
                  </Box>
                  {/* overflowX: auto is defensive -- the Paper this table sits
                      in clips (overflow: hidden) rather than scrolls, so on a
                      narrow docked panel with this many icons, without this
                      the rightmost ones (Minimize/Close) would be unreachable
                      rather than merely hidden-until-resize. */}
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, overflowX: 'auto', maxWidth: '100%' }}>
                    <IconButton
                      size="small"
                      onClick={() => setComposeOpen(true)}
                      title="File traffic on this net"
                      sx={{ p: 0.25 }}
                    >
                      <AddIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => setExportMenuAnchor(e.currentTarget)}
                      title="Export traffic"
                      sx={{ p: 0.25 }}
                    >
                      <FileDownloadIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    <Menu
                      anchorEl={exportMenuAnchor}
                      open={Boolean(exportMenuAnchor)}
                      onClose={() => setExportMenuAnchor(null)}
                    >
                      <MenuItem onClick={() => handleExportTraffic('raw')} sx={{ minHeight: 44 }}>
                        Raw (as filed)
                      </MenuItem>
                      <MenuItem onClick={() => handleExportTraffic('radiogram_safe')} sx={{ minHeight: 44 }}>
                        Radiogram-safe (for NTS/CW relay)
                      </MenuItem>
                    </Menu>
                    <IconButton size="small" onClick={handleViewAll} title="View all in Traffic" sx={{ p: 0.25 }}>
                      <ListAltIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    {onDetach && (
                      <IconButton size="small" onClick={onDetach} title="Detach panel" sx={{ p: 0.25 }}>
                        <PictureInPictureAltIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                    {onPopOut && (
                      <IconButton size="small" onClick={onPopOut} title="Open in new window" sx={{ p: 0.25 }}>
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
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
                    {onClose && (
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

      {!minimized && (
        <Box sx={{ flex: '1 1 auto', overflow: 'auto', p: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : error ? (
            <Typography variant="body2" color="error">{error}</Typography>
          ) : selectedFormId ? (
            <Box>
              <IconButton size="small" onClick={() => setSelectedFormId(null)} title="Back to list" sx={{ mb: 1 }}>
                <ArrowBackIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <TrafficDetail formId={selectedFormId} />
            </Box>
          ) : (
            <>
              {/* ========== SUMMARY STRIP ========== */}
              {summary && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {(['draft', 'pending', 'relayed', 'delivered', 'cancelled'] as const)
                    .filter((key) => summary[key] > 0)
                    .map((key) => (
                      <Chip
                        key={key}
                        size="small"
                        label={`${key}: ${summary[key]}`}
                        color={DISPOSITION_COLOR[key]}
                      />
                    ))}
                  {summary.outstanding > 0 && (
                    <Chip
                      size="small"
                      label={`Outstanding: ${summary.outstanding}`}
                      color="error"
                      variant="outlined"
                    />
                  )}
                </Box>
              )}

              {items.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No traffic logged on this net yet.</Typography>
              ) : (
                <TrafficTable items={items} currentUserId={currentUserId} onRowClick={setSelectedFormId} />
              )}
            </>
          )}
        </Box>
      )}

      {/* ========== FILE TRAFFIC DIALOG ========== */}
      {/* Deliberately a dialog rather than an inline mode: the panel is often
          narrow and docked beside the check-in list, and a Radiogram needs
          real room. Closing refetches so the new item shows in the list
          immediately even if the WebSocket event is missed. */}
      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          File traffic
          <IconButton onClick={() => setComposeOpen(false)} title="Close" size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <TrafficComposer
            definitions={definitions}
            netId={netId}
            allowedFormTypes={net?.traffic_form_types}
            // TrafficComposer resolves whether stripFormType actually points
            // at a real structured type; stripTemplateRaw is only used as a
            // fallback when it doesn't.
            stripFormType={net?.traffic_strip_form_type}
            stripTemplateRaw={net?.traffic_strip_template}
            contextLabel={net ? `Filing for ${net.name}` : undefined}
            onCreated={(id) => {
              setComposeOpen(false);
              refetch();
              setSelectedFormId(id);
            }}
          />
        </DialogContent>
      </Dialog>
    </Paper>
  );
};

export default TrafficPanel;
