import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Tabs,
  Tab,
  TextField,
  Autocomplete,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import BlockIcon from '@mui/icons-material/Block';
import { ncsRotationApi, userApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface NCSRotationModalProps {
  open: boolean;
  onClose: () => void;
  schedule: {
    id: number;
    name: string;
    owner_id: number;
  } | null;
  onUpdate?: () => void;
}

interface RotationMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  position: number;
  is_active: boolean;
}

interface ScheduleEntry {
  date: string;
  user_id: number | null;
  user_callsign: string | null;
  user_name: string | null;
  is_override: boolean;
  is_cancelled: boolean;
  override_reason: string | null;
  override_id: number | null;
}

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

const NCSRotationModal: React.FC<NCSRotationModalProps> = ({
  open,
  onClose,
  schedule,
  onUpdate,
}: NCSRotationModalProps) => {
  const [tabValue, setTabValue] = useState<number | null>(null); // null until data loads
  const [members, setMembers] = useState<RotationMember[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [swapUser, setSwapUser] = useState<User | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [isCancellation, setIsCancellation] = useState(false);
  
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const isOwner = user?.id === schedule?.owner_id;
  const isAdmin = user?.role === 'admin';
  const canManage = isOwner || isAdmin;
  
  // Check if user is in the rotation
  const isRotationMember = members.some((m: RotationMember) => m.user_id === user?.id);

  // Helper to extract error message from API response
  const getErrorMessage = (err: any, fallback: string): string => {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      // Pydantic validation error format
      return detail.map((e: any) => e.msg || String(e)).join(', ');
    }
    return fallback;
  };

  useEffect(() => {
    if (open && schedule) {
      fetchData();
    } else if (!open) {
      // Reset tab when modal closes
      setTabValue(null);
    }
  }, [open, schedule]);

  const fetchData = async () => {
    if (!schedule) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [membersRes, scheduleRes, usersRes] = await Promise.all([
        ncsRotationApi.listMembers(schedule.id),
        ncsRotationApi.getSchedule(schedule.id, 12), // 12 weeks ahead
        userApi.listUsers(),
      ]);
      
      const loadedMembers = membersRes.data;
      setMembers(loadedMembers);
      setScheduleEntries(scheduleRes.data.schedule || []);
      setUsers(usersRes.data);
      
      // Set initial tab: show Manage Rotation if no members yet (for owners/admins), otherwise Schedule
      const canManageNow = user?.id === schedule?.owner_id || user?.role === 'admin';
      if (tabValue === null) {
        setTabValue(loadedMembers.length === 0 && canManageNow ? 1 : 0);
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load rotation data'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!schedule || !selectedUser) return;
    
    try {
      await ncsRotationApi.addMember(schedule.id, { user_id: selectedUser.id });
      setSelectedUser(null);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to add member'));
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!schedule || !confirm('Remove this operator from the rotation?')) return;
    
    try {
      await ncsRotationApi.removeMember(schedule.id, memberId);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to remove member'));
    }
  };

  const handleMoveMember = async (memberId: number, direction: 'up' | 'down') => {
    if (!schedule) return;
    
    const currentIndex = members.findIndex((m: RotationMember) => m.id === memberId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= members.length) return;
    
    // Create new order
    const newMembers = [...members];
    [newMembers[currentIndex], newMembers[newIndex]] = [newMembers[newIndex], newMembers[currentIndex]];
    const memberIds = newMembers.map(m => m.id);
    
    try {
      await ncsRotationApi.reorderMembers(schedule.id, memberIds);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to reorder members'));
    }
  };

  const handleToggleMemberActive = async (member: RotationMember) => {
    if (!schedule) return;
    
    try {
      await ncsRotationApi.updateMember(schedule.id, member.id, { is_active: !member.is_active });
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update member'));
    }
  };

  const handleOpenSwapDialog = (entry: ScheduleEntry) => {
    setSelectedEntry(entry);
    setSwapUser(null);
    setSwapReason('');
    setIsCancellation(false);
    setSwapDialogOpen(true);
  };

  const handleCreateOverride = async () => {
    if (!schedule || !selectedEntry) return;
    
    try {
      await ncsRotationApi.createOverride(schedule.id, {
        scheduled_date: selectedEntry.date,
        replacement_user_id: isCancellation ? null : swapUser?.id || null,
        reason: swapReason || undefined,
      });
      
      setSwapDialogOpen(false);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create override'));
    }
  };

  const handleCancelOverride = async (overrideId: number) => {
    if (!schedule || !confirm('Cancel this swap and revert to the normal rotation?')) return;
    
    try {
      await ncsRotationApi.deleteOverride(schedule.id, overrideId);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to cancel swap'));
    }
  };

  // Filter out users already in rotation
  const availableUsers = users.filter((u: User) => !members.some((m: RotationMember) => m.user_id === u.id));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="md" 
        fullWidth
        fullScreen={isMobile}
        disableEnforceFocus
      >
        <DialogTitle>
          NCS Rotation - {schedule?.name}
        </DialogTitle>
        
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          <Tabs 
            value={tabValue ?? 0} 
            onChange={(_: React.SyntheticEvent, v: number) => setTabValue(v)} 
            sx={{ mb: 2 }}
            variant={isMobile ? 'fullWidth' : 'standard'}
          >
            <Tab label="Schedule" id="tab-schedule" />
            {canManage && <Tab label="Manage Rotation" id="tab-manage" />}
          </Tabs>
          
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Schedule Tab */}
              {tabValue === 0 && (
                <Box>
                  {scheduleEntries.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                      No rotation schedule configured. 
                      {canManage && ' Add members to the rotation to generate a schedule.'}
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>NCS</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {scheduleEntries.map((entry: ScheduleEntry, idx: number) => (
                            <TableRow 
                              key={idx}
                              sx={{ 
                                bgcolor: entry.is_cancelled 
                                  ? 'action.disabledBackground' 
                                  : entry.is_override 
                                    ? 'warning.light' 
                                    : undefined 
                              }}
                            >
                              <TableCell>{formatDate(entry.date)}</TableCell>
                              <TableCell>
                                {entry.is_cancelled ? (
                                  <Chip 
                                    icon={<BlockIcon />} 
                                    label="Cancelled" 
                                    size="small" 
                                    color="default"
                                  />
                                ) : (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography>
                                      {entry.user_callsign || 'TBD'}
                                      {entry.user_name && ` (${entry.user_name})`}
                                    </Typography>
                                    {entry.is_override && (
                                      <Chip label="Swap" size="small" color="warning" />
                                    )}
                                  </Box>
                                )}
                                {entry.override_reason && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {entry.override_reason}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {/* Show cancel swap button for overrides */}
                                {entry.is_override && entry.override_id && canManage && (
                                  <IconButton 
                                    size="small" 
                                    onClick={() => handleCancelOverride(entry.override_id!)}
                                    title="Cancel swap (revert to normal rotation)"
                                    color="warning"
                                  >
                                    <UndoIcon fontSize="small" />
                                  </IconButton>
                                )}
                                {/* Allow swaps for managers or if user is the scheduled NCS */}
                                {(canManage || (isRotationMember && entry.user_id === user?.id)) && !entry.is_cancelled && !entry.is_override && (
                                  <IconButton 
                                    size="small" 
                                    onClick={() => handleOpenSwapDialog(entry)}
                                    title="Request swap or cancel"
                                  >
                                    <SwapHorizIcon fontSize="small" />
                                  </IconButton>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}
              
              {/* Manage Rotation Tab */}
              {tabValue === 1 && canManage && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Rotation Members
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                    NCS duties rotate through active members in order. Drag to reorder.
                  </Typography>
                  
                  {/* Add member */}
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: isMobile ? 'column' : 'row' }}>
                    <Autocomplete
                      options={availableUsers}
                      getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                      value={selectedUser}
                      onChange={(_: React.SyntheticEvent, value: User | null) => setSelectedUser(value)}
                      renderInput={(params: any) => (
                        <TextField {...params} label="Add operator" size="small" />
                      )}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddMember}
                      disabled={!selectedUser}
                    >
                      Add
                    </Button>
                  </Box>
                  
                  {/* Members list */}
                  {members.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                      No operators in rotation yet
                    </Typography>
                  ) : (
                    <List>
                      {members.map((member: RotationMember, idx: number) => (
                        <ListItem
                          key={member.id}
                          sx={{ 
                            bgcolor: member.is_active ? 'background.paper' : 'action.disabledBackground',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            mb: 0.5,
                          }}
                        >
                          <DragIndicatorIcon sx={{ mr: 1, color: 'action.disabled' }} />
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography>
                                  {idx + 1}. {member.user_callsign}
                                  {member.user_name && ` (${member.user_name})`}
                                </Typography>
                                {!member.is_active && (
                                  <Chip label="Inactive" size="small" color="default" />
                                )}
                              </Box>
                            }
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              size="small"
                              onClick={() => handleMoveMember(member.id, 'up')}
                              disabled={idx === 0}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleMoveMember(member.id, 'down')}
                              disabled={idx === members.length - 1}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleMemberActive(member)}
                              title={member.is_active ? 'Mark inactive' : 'Mark active'}
                            >
                              <BlockIcon 
                                fontSize="small" 
                                color={member.is_active ? 'action' : 'error'} 
                              />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
      
      {/* Swap/Cancel Dialog */}
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
          
          <FormControlLabel
            control={
              <Checkbox
                checked={isCancellation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsCancellation(e.target.checked)}
              />
            }
            label="Cancel this net (no replacement)"
            sx={{ mb: 2, display: 'block' }}
          />
          
          {!isCancellation && (
            <Autocomplete
              options={members.filter((m: RotationMember) => m.is_active && m.user_id !== selectedEntry?.user_id)}
              getOptionLabel={(option: RotationMember) => `${option.user_callsign}${option.user_name ? ` (${option.user_name})` : ''}`}
              value={swapUser ? members.find((m: RotationMember) => m.user_id === swapUser.id) || null : null}
              onChange={(_: React.SyntheticEvent, value: RotationMember | null) => {
                if (value) {
                  const foundUser = users.find((u: User) => u.id === value.user_id);
                  setSwapUser(foundUser || null);
                } else {
                  setSwapUser(null);
                }
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSwapReason(e.target.value)}
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
    </>
  );
};

export default NCSRotationModal;
