import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  IconButton,
  Tooltip,
  TableContainer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import { displayCallsign } from '../../utils/userDisplay';
import { useAuth } from '../../contexts/AuthContext';
import { exportElementToPdf } from '../../utils/pdfExport';
import { useUserStats } from '../../hooks/useUserStats';
import DrillDownTable from './DrillDownTable';

// ========== ACTIVITY TAB ==========
// The Profile page's Activity tab: stat cards with drill-down, favorite-nets
// table with per-row expandable drill-down, and PDF export. Fully self-
// contained — calls useUserStats()/useAuth()/useNavigate() itself since
// nothing outside this tab needs any of this state.

const DRILL_PAGE_SIZE = 25;

type StatCardKey = 'total_check_ins' | 'nets_joined' | 'as_ncs' | 'last_30_days';

const ActivityTab: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userStats, statsLoading } = useUserStats();

  const [netDrillDown, setNetDrillDown] = useState<{ title: string; nets: any[] } | null>(null);
  const [activeStatCard, setActiveStatCard] = useState<StatCardKey | null>(null);
  const [drillDownPage, setDrillDownPage] = useState(0);
  const [netDrillDownPage, setNetDrillDownPage] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleStatCardClick = (card: StatCardKey) => {
    setActiveStatCard(prev => (prev === card ? null : card));
    setDrillDownPage(0);
  };

  const getStatCardDrillDown = (): { label: string; rows: any[]; columns: string[] } | null => {
    if (!activeStatCard || !userStats) return null;
    const participated: any[] = userStats.nets_participated_list ?? [];
    if (activeStatCard === 'total_check_ins') {
      return {
        label: 'All nets by check-in count',
        rows: [...participated].sort((a, b) => b.check_in_count - a.check_in_count),
        columns: ['net', 'date', 'check_ins'],
      };
    }
    if (activeStatCard === 'nets_joined') {
      return {
        label: 'All nets attended, most recent first',
        rows: [...participated].sort(
          (a, b) => new Date(b.last_check_in).getTime() - new Date(a.last_check_in).getTime()
        ),
        columns: ['net', 'date', 'check_ins'],
      };
    }
    if (activeStatCard === 'as_ncs') {
      const ncsList: any[] = userStats.nets_as_ncs_list ?? [];
      return {
        label: 'Nets you ran as NCS',
        rows: [...ncsList].sort(
          (a, b) => new Date(b.started_at ?? b.closed_at ?? 0).getTime() - new Date(a.started_at ?? a.closed_at ?? 0).getTime()
        ),
        columns: ['net', 'date'],
      };
    }
    if (activeStatCard === 'last_30_days') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return {
        label: 'Nets attended in the last 30 days',
        rows: [...participated]
          .filter(p => new Date(p.last_check_in).getTime() >= cutoff)
          .sort(
            (a, b) => new Date(b.last_check_in).getTime() - new Date(a.last_check_in).getTime()
          ),
        columns: ['net', 'date', 'check_ins'],
      };
    }
    return null;
  };

  const handleFavoriteNetClick = (net: any) => {
    if (netDrillDown?.title === net.net_name) {
      setNetDrillDown(null);
      return;
    }
    const sessions = ((userStats?.nets_participated_list as any[]) || [])
      .filter((p: any) =>
        net.template_id != null
          ? p.template_id === net.template_id
          : p.net_name === net.net_name && p.template_id == null
      )
      .sort((a: any, b: any) =>
        new Date(b.last_check_in).getTime() - new Date(a.last_check_in).getTime()
      );
    setNetDrillDown({ title: net.net_name, nets: sessions });
    setNetDrillDownPage(0);
  };

  // Handle PDF export for activity stats
  const handleExportActivityPdf = async () => {
    setExportingPdf(true);
    try {
      const callsign = displayCallsign(user) || 'User';
      await exportElementToPdf('activity-stats-content', {
        filename: `${callsign.replace(/[^a-zA-Z0-9]/g, '_')}_Activity_Stats`,
        orientation: 'landscape',
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  if (statsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!userStats) {
    return (
      <Typography color="text.secondary">
        No activity statistics available yet. Check into some nets to build your history!
      </Typography>
    );
  }

  const dd = getStatCardDrillDown();

  return (
    <>
      {/* PDF Export Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          onClick={handleExportActivityPdf}
          disabled={exportingPdf}
          startIcon={exportingPdf ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
        >
          {exportingPdf ? 'Exporting...' : 'PDF'}
        </Button>
      </Box>

      {/* Content wrapper for PDF export */}
      <Box id="activity-stats-content">
        <Grid container spacing={2} sx={{ mb: 1 }}>
          {([
            { key: 'total_check_ins', value: userStats.total_check_ins, label: 'Total Check-ins' },
            { key: 'nets_joined', value: userStats.nets_participated, label: 'Nets Joined' },
            { key: 'as_ncs', value: userStats.nets_as_ncs, label: 'As NCS' },
            { key: 'last_30_days', value: userStats.last_30_days_check_ins, label: 'Last 30 Days' },
          ] as const).map(({ key, value, label }) => (
            <Grid item xs={6} sm={3} key={key}>
              <Card
                variant="outlined"
                onClick={() => handleStatCardClick(key)}
                sx={{
                  cursor: 'pointer',
                  borderColor: activeStatCard === key ? 'primary.main' : undefined,
                  borderWidth: activeStatCard === key ? 2 : 1,
                  transition: 'border-color 0.15s',
                  '&:hover': { borderColor: 'primary.light' },
                }}
              >
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" color="primary">{value}</Typography>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {dd && (
          <Box sx={{ mb: 3, pl: 1, borderLeft: 3, borderColor: 'primary.main' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, mt: 1 }}>
              <Tooltip title="Close">
                <IconButton size="small" onClick={() => setActiveStatCard(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Typography variant="subtitle2">{dd.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                ({dd.rows.length} net{dd.rows.length !== 1 ? 's' : ''})
              </Typography>
            </Box>
            <DrillDownTable
              rows={dd.rows.map((row: any) => ({
                net_id: row.net_id,
                net_name: row.net_name,
                date: row.started_at ?? row.last_check_in,
                check_in_count: row.check_in_count,
              }))}
              showNetName
              showCheckIns={dd.columns.includes('check_ins')}
              page={drillDownPage}
              onPageChange={setDrillDownPage}
              pageSize={DRILL_PAGE_SIZE}
              emptyMessage="No records found."
              onView={(netId) => navigate(`/nets/${netId}`)}
            />
          </Box>
        )}

        {userStats.frequent_nets && userStats.frequent_nets.length > 0 && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <EmojiEventsIcon color="warning" />
              <Typography variant="h6">Your Favorite Nets</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Nets you check into the most.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Net Name</TableCell>
                    <TableCell align="right">Check-ins</TableCell>
                    <TableCell align="right">Participation Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {userStats.frequent_nets.slice(0, 5).map((net: any, index: number) => (
                    <React.Fragment key={net.net_name}>
                      <TableRow
                        hover
                        sx={{
                          backgroundColor: index === 0 ? 'rgba(255, 215, 0, 0.1)' : 'inherit',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleFavoriteNetClick(net)}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {index === 0 && <EmojiEventsIcon sx={{ color: 'gold', fontSize: 20 }} />}
                            {index === 1 && <EmojiEventsIcon sx={{ color: 'silver', fontSize: 20 }} />}
                            {index === 2 && <EmojiEventsIcon sx={{ color: '#CD7F32', fontSize: 20 }} />}
                            <Typography
                              component="span"
                              sx={{
                                color: 'primary.main',
                                '&:hover': { textDecoration: 'underline' },
                                fontWeight: netDrillDown?.title === net.net_name ? 'bold' : 'normal',
                              }}
                            >
                              {net.net_name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">{net.check_ins}</TableCell>
                        <TableCell align="right">
                          {net.participation_rate ? `${(net.participation_rate * 100).toFixed(0)}%` : '-'}
                        </TableCell>
                      </TableRow>
                      {netDrillDown && netDrillDown.title === net.net_name && (
                        <TableRow>
                          <TableCell colSpan={3} sx={{ p: 0, bgcolor: 'action.hover' }}>
                            <Box sx={{ px: 2, py: 1.5 }}>
                              <DrillDownTable
                                rows={netDrillDown.nets.map((session: any) => ({
                                  net_id: session.net_id,
                                  date: session.last_check_in,
                                  check_in_count: session.check_in_count,
                                }))}
                                showNetName={false}
                                showCheckIns
                                page={netDrillDownPage}
                                onPageChange={setNetDrillDownPage}
                                pageSize={DRILL_PAGE_SIZE}
                                emptyMessage="No session records found."
                                onView={(netId, e) => { e.stopPropagation(); navigate(`/nets/${netId}`); }}
                              />
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>
    </>
  );
};

export default ActivityTab;
