import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
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
import LaunchIcon from '@mui/icons-material/Launch';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import TrafficTable from '../traffic/TrafficTable';
import TrafficDetail from '../traffic/TrafficDetail';
import { TrafficForm } from '../../hooks/useTrafficList';

// ========== TRAFFIC SIDE PANEL (per-net) ==========
// A thin net-scoped wrapper around TrafficTable/TrafficDetail (Stage A), fed
// by the net-scoped GET /traffic/nets/{net_id}/forms and the new
// GET /traffic/nets/{net_id}/summary. Deliberately no browse/search UI here
// -- that stays in the canonical /traffic section (Traffic.tsx); "View all
// in Traffic" deep-links there. See TRAFFIC-HANDLING-DESIGN.md section 4.5.
//
// Header chrome (title row, minimize toggle) follows CoveragePanel.tsx's
// "simple Chat-style chrome wrapper" pattern rather than the full
// detach/pop-out-to-window machinery Chat/Activity Log/Coverage carry --
// this panel is always docked once net.traffic_enabled is on, with no
// on-demand open/close toggle, so that extra chrome isn't load-bearing yet.

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
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const TrafficPanel: React.FC<TrafficPanelProps> = ({ netId, currentUserId, minimized, onMinimize, onRestore }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<TrafficForm[]>([]);
  const [summary, setSummary] = useState<TrafficSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);

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

  // Refetch when the WebSocket relays a traffic_logged event for this net
  // (dispatched as a window CustomEvent by useNetWebSocket.ts, matching the
  // newChatMessage/chatReactionUpdate convention already used by Chat.tsx).
  useEffect(() => {
    const handleTrafficLogged = (event: any) => {
      if (event.detail?.net_id === netId) {
        refetch();
      }
    };
    window.addEventListener('trafficLogged', handleTrafficLogged);
    return () => window.removeEventListener('trafficLogged', handleTrafficLogged);
  }, [netId, refetch]);

  const handleViewAll = () => {
    navigate(`/traffic?net_id=${netId}`);
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
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <IconButton size="small" onClick={handleViewAll} title="View all in Traffic" sx={{ p: 0.25 }}>
                      <LaunchIcon sx={{ fontSize: 14 }} />
                    </IconButton>
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
    </Paper>
  );
};

export default TrafficPanel;
