import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  TextField,
  Autocomplete,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import BlockIcon from '@mui/icons-material/Block';
import { ncsRotationApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

interface ScheduleEntry {
  date: string;
  user_id: number | null;
  user_callsign: string | null;
  user_name: string | null;
  is_override: boolean;
  is_fifth_week: boolean;
  is_cancelled: boolean;
  override_reason: string | null;
  override_id: number | null;
}

interface StaffMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_co_manager: boolean;
}

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

interface TemplateSummary {
  id: number;
  name: string;
  schedule_type?: string;
  schedule_config?: Record<string, any>;
  fifth_week_user_id: number | null;
  fifth_week_user_callsign: string | null;
  fifth_week_user_name: string | null;
}

interface NCSStaffScheduleTabProps {
  hasTemplateContext: boolean;
  templateSummary: TemplateSummary | null;
  scheduleEntries: ScheduleEntry[];
  canEdit: boolean;
  isScheduleContext: boolean;
  scheduleId?: number;
  scheduleOwnerId?: number;
  staff: StaffMember[];
  users: User[];
  refetch: () => Promise<void>;
  reportError: (message: string) => void;
}

// ========== SCHEDULE TAB ==========
// The Schedule tab of NCSStaffModal: the upcoming-instances table plus the
// swap/cancel dialog for creating rotation overrides. The swap dialog's
// state and handlers (handleOpenSwapDialog/handleCreateOverride/
// handleCancelOverride) are exclusive to this tab — nothing else in the
// modal reads them — so they're fully self-contained here rather than
// prop-drilled from the parent. `refetch`/`reportError` map to the parent's
// shared fetchData/setError, since a successful swap needs to refresh
// scheduleEntries (owned by the parent, shared with the Rotation tab).

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const NCSStaffScheduleTab: React.FC<NCSStaffScheduleTabProps> = ({
  hasTemplateContext,
  templateSummary,
  scheduleEntries,
  canEdit,
  isScheduleContext,
  scheduleId,
  scheduleOwnerId,
  staff,
  users,
  refetch,
  reportError,
}) => {
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [swapUser, setSwapUser] = useState<User | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [isCancellation, setIsCancellation] = useState(false);

  const handleOpenSwapDialog = (entry: ScheduleEntry) => {
    setSelectedEntry(entry);
    setSwapUser(null);
    setSwapReason('');
    setIsCancellation(false);
    setSwapDialogOpen(true);
  };

  const handleCreateOverride = async () => {
    if (!scheduleId || !selectedEntry) return;

    try {
      await ncsRotationApi.createOverride(scheduleId, {
        scheduled_date: selectedEntry.date,
        replacement_user_id: isCancellation ? null : swapUser?.id || null,
        reason: swapReason || undefined,
      });

      setSwapDialogOpen(false);
      await refetch();
    } catch (err: any) {
      reportError(getErrorMessage(err, 'Failed to create override'));
    }
  };

  const handleCancelOverride = async (overrideId: number) => {
    if (!scheduleId || !confirm('Cancel this swap and revert to the normal rotation?')) return;

    try {
      await ncsRotationApi.deleteOverride(scheduleId, overrideId);
      await refetch();
    } catch (err: any) {
      reportError(getErrorMessage(err, 'Failed to cancel swap'));
    }
  };

  if (!hasTemplateContext) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        This net is not linked to a schedule.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Schedule
      </Typography>
      {templateSummary && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          {templateSummary.name}
          {templateSummary.schedule_type ? ` • ${templateSummary.schedule_type}` : ''}
        </Typography>
      )}

      {scheduleEntries.length > 0 ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>NCS</TableCell>
                {canEdit && isScheduleContext && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {scheduleEntries.slice(0, 12).map((entry: ScheduleEntry, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{formatDate(entry.date)}</TableCell>
                  <TableCell>
                    {entry.is_cancelled ? (
                      <Chip icon={<BlockIcon />} label="Cancelled" size="small" color="default" />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">
                          {entry.user_callsign || 'TBD'}
                          {entry.user_name && ` (${entry.user_name})`}
                        </Typography>
                        {entry.is_override && <Chip label="Swap" size="small" color="warning" />}
                        {entry.is_fifth_week && <Chip label="5th" size="small" color="info" variant="outlined" />}
                      </Box>
                    )}
                  </TableCell>
                  {canEdit && isScheduleContext && (
                    <TableCell align="right">
                      {entry.is_override && entry.override_id && (
                        <Tooltip title="Revert to normal rotation">
                          <IconButton size="small" onClick={() => handleCancelOverride(entry.override_id!)} color="error">
                            <UndoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!entry.is_cancelled && !entry.is_override && (
                        <Tooltip title="Swap or cancel">
                          <IconButton size="small" onClick={() => handleOpenSwapDialog(entry)}>
                            <SwapHorizIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No upcoming schedule entries.
        </Typography>
      )}

      {/* Swap/Cancel Dialog for schedule overrides */}
      <Dialog open={swapDialogOpen} onClose={() => setSwapDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {isCancellation ? 'Cancel Net' : 'Swap NCS Duty'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selectedEntry && (
              <>
                <strong>Date:</strong> {formatDate(selectedEntry.date)}<br />
                <strong>Current NCS:</strong> {selectedEntry.user_callsign || 'TBD'}
              </>
            )}
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Button
              variant={isCancellation ? 'contained' : 'outlined'}
              color={isCancellation ? 'error' : 'inherit'}
              size="small"
              onClick={() => setIsCancellation(!isCancellation)}
              sx={{ mr: 1 }}
            >
              Cancel this net
            </Button>
            <Typography variant="caption" color="text.secondary">
              (no replacement)
            </Typography>
          </Box>

          {!isCancellation && (
            <Autocomplete
              options={users.filter((u: User) =>
                (staff.some((s: StaffMember) => s.user_id === u.id && s.is_active) || u.id === scheduleOwnerId) &&
                u.id !== selectedEntry?.user_id
              )}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={swapUser}
              onChange={(_: any, value: User | null) => {
                setSwapUser(value);
              }}
              renderInput={(params: any) => (
                <TextField {...params} label="Replacement NCS" fullWidth />
              )}
              sx={{ mb: 2 }}
            />
          )}

          <TextField
            label="Reason (optional)"
            value={swapReason}
            onChange={(e) => setSwapReason(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSwapDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateOverride}
            color={isCancellation ? 'error' : 'primary'}
          >
            {isCancellation ? 'Cancel Net' : 'Create Swap'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NCSStaffScheduleTab;
