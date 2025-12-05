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
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  useMediaQuery,
  useTheme,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import BlockIcon from '@mui/icons-material/Block';
import PersonIcon from '@mui/icons-material/Person';
import { ncsRotationApi, userApi, netApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface NCSStaffModalProps {
  open: boolean;
  onClose: () => void;
  // For templates/schedules (NCS rotation)
  schedule?: {
    id: number;
    name: string;
    owner_id: number;
    owner_callsign?: string;
    owner_name?: string;
  } | null;
  // For individual nets (NetRole)
  net?: {
    id: number;
    name: string;
    owner_id: number;
    owner_callsign?: string;
    owner_name?: string;
    status?: string;
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

interface NetRole {
  id: number;
  user_id: number;
  email: string;
  name: string | null;
  callsign: string;
  role: string;
  assigned_at: string;
}

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

const NCSStaffModal: React.FC<NCSStaffModalProps> = ({
  open,
  onClose,
  schedule,
  net,
  onUpdate,
}) => {
  const [tabValue, setTabValue] = useState<number>(0);
  const [members, setMembers] = useState<RotationMember[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [netRoles, setNetRoles] = useState<NetRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [swapUser, setSwapUser] = useState<User | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [isCancellation, setIsCancellation] = useState(false);
  
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Determine context - are we looking at a schedule/template or a net?
  const isScheduleContext = !!schedule && !net;
  const isNetContext = !!net;
  
  // Permissions
  const isOwner = isScheduleContext 
    ? user?.id === schedule?.owner_id 
    : user?.id === net?.owner_id;
  const isAdmin = user?.role === 'admin';
  const canManage = isAuthenticated && (isOwner || isAdmin);
  
  // Check if user is in the rotation (for schedules)
  const isRotationMember = members.some((m: RotationMember) => m.user_id === user?.id);

  // Title based on context
  const getTitle = () => {
    if (isScheduleContext) {
      return `Net Staff - ${schedule?.name}`;
    }
    if (isNetContext) {
      return `Net Staff - ${net?.name}`;
    }
    return 'Net Staff';
  };

  // Helper to extract error message from API response
  const getErrorMessage = (err: any, fallback: string): string => {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((e: any) => e.msg || String(e)).join(', ');
    }
    return fallback;
  };

  useEffect(() => {
    if (open) {
      fetchData();
    } else {
      // Reset when modal closes
      setTabValue(0);
      setError(null);
    }
  }, [open, schedule, net]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (isScheduleContext && schedule) {
        // Fetch template rotation data
        const [membersRes, scheduleRes] = await Promise.all([
          ncsRotationApi.listMembers(schedule.id),
          ncsRotationApi.getSchedule(schedule.id, 12), // 12 weeks ahead
        ]);
        
        setMembers(membersRes.data);
        setScheduleEntries(scheduleRes.data.schedule || []);
        
        // Only fetch users list if user can manage
        if (canManage) {
          const usersRes = await userApi.listUsers();
          setUsers(usersRes.data);
        }
      } else if (isNetContext && net) {
        // Fetch net roles
        const rolesRes = await api.get(`/nets/${net.id}/roles`);
        setNetRoles(rolesRes.data || []);
        
        // Only fetch users list if user can manage
        if (canManage) {
          const usersRes = await userApi.listUsers();
          setUsers(usersRes.data);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load staff data'));
    } finally {
      setLoading(false);
    }
  };

  // ===== SCHEDULE/TEMPLATE HANDLERS =====
  
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

  const handleClearAllMembers = async () => {
    if (!schedule || !confirm('Clear the entire NCS rotation? This will remove all members and swaps. The net owner will be the default NCS for all instances.')) return;
    
    try {
      await ncsRotationApi.clearAllMembers(schedule.id);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to clear rotation'));
    }
  };

  const handleMoveMember = async (memberId: number, direction: 'up' | 'down') => {
    if (!schedule) return;
    
    const currentIndex = members.findIndex((m: RotationMember) => m.id === memberId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= members.length) return;
    
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

  // ===== NET ROLE HANDLERS =====
  
  const handleAddNetRole = async () => {
    if (!net || !selectedUser) return;
    
    try {
      await api.post(`/nets/${net.id}/roles?user_id=${selectedUser.id}&role=NCS`);
      setSelectedUser(null);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to add NCS'));
    }
  };

  const handleRemoveNetRole = async (roleId: number) => {
    if (!net || !confirm('Remove this NCS from the net?')) return;
    
    try {
      await api.delete(`/nets/${net.id}/roles/${roleId}`);
      await fetchData();
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to remove NCS'));
    }
  };

  // Filter out users already assigned
  const availableUsers = isScheduleContext
    ? users.filter((u: User) => !members.some((m: RotationMember) => m.user_id === u.id))
    : users.filter((u: User) => !netRoles.some((r: NetRole) => r.user_id === u.id && r.role === 'NCS'));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get NCS-only roles for display
  const ncsRoles = netRoles.filter(r => r.role === 'NCS');
  
  // Determine if we have rotation data
  const hasRotation = members.length > 0;

  // Render the staff list section (always visible for both contexts)
  const renderStaffList = () => {
    if (isScheduleContext) {
      // For schedules - show rotation members OR owner if no rotation
      if (hasRotation) {
        return (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              NCS Rotation ({members.length} {members.length === 1 ? 'member' : 'members'})
            </Typography>
            <List dense>
              {members.map((member, idx) => (
                <ListItem key={member.id} sx={{ py: 0.5 }}>
                  <PersonIcon sx={{ mr: 1, color: member.is_active ? 'primary.main' : 'action.disabled' }} />
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">
                          {idx + 1}. {member.user_callsign}
                          {member.user_name && ` (${member.user_name})`}
                        </Typography>
                        {!member.is_active && (
                          <Chip label="Inactive" size="small" variant="outlined" />
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        );
      } else {
        // No rotation - show owner as default NCS
        return (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Net Control Station
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
              <PersonIcon color="primary" />
              <Typography>
                {schedule?.owner_callsign || 'Owner'}
                {schedule?.owner_name && ` (${schedule.owner_name})`}
              </Typography>
              <Chip label="Host" size="small" color="primary" variant="outlined" />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              No rotation schedule configured. The host serves as NCS.
            </Typography>
          </Box>
        );
      }
    } else if (isNetContext) {
      // For nets - show assigned NCS roles OR owner if none assigned
      if (ncsRoles.length > 0) {
        return (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Assigned Net Control Stations ({ncsRoles.length})
            </Typography>
            <List dense>
              {ncsRoles.map((role) => (
                <ListItem key={role.id} sx={{ py: 0.5 }}>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <ListItemText
                    primary={
                      <Typography variant="body2">
                        {role.callsign}
                        {role.name && ` (${role.name})`}
                      </Typography>
                    }
                  />
                  {canManage && (
                    <ListItemSecondaryAction>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveNetRole(role.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              ))}
            </List>
          </Box>
        );
      } else {
        // No assigned NCS - show owner as default
        return (
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Net Control Station
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
              <PersonIcon color="primary" />
              <Typography>
                {net?.owner_callsign || 'Owner'}
                {net?.owner_name && ` (${net.owner_name})`}
              </Typography>
              <Chip label="Host" size="small" color="primary" variant="outlined" />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              No additional NCS assigned. The host serves as NCS.
            </Typography>
          </Box>
        );
      }
    }
    return null;
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
        <DialogTitle>{getTitle()}</DialogTitle>
        
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          {/* Tabs - only show if user can manage or if there's rotation data to show */}
          {(canManage || (isScheduleContext && hasRotation)) && (
            <Tabs 
              value={tabValue} 
              onChange={(_, v) => setTabValue(v)} 
              sx={{ mb: 2 }}
              variant={isMobile ? 'fullWidth' : 'standard'}
            >
              <Tab label="Staff" id="tab-staff" />
              {isScheduleContext && hasRotation && (
                <Tab label="Schedule" id="tab-schedule" />
              )}
              {canManage && (
                <Tab label={isScheduleContext ? "Manage Rotation" : "Manage Staff"} id="tab-manage" />
              )}
            </Tabs>
          )}
          
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Staff Tab - always visible, default view */}
              {tabValue === 0 && renderStaffList()}
              
              {/* Schedule Tab - only for templates with rotation */}
              {tabValue === 1 && isScheduleContext && hasRotation && (
                <Box>
                  {scheduleEntries.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                      No upcoming dates scheduled.
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>NCS</TableCell>
                            {canManage && <TableCell align="right">Actions</TableCell>}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {scheduleEntries.map((entry, idx) => (
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
                                    <Typography variant="body2">
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
                              {canManage && (
                                <TableCell align="right">
                                  {entry.is_override && entry.override_id && (
                                    <Tooltip title="Revert to normal rotation">
                                      <IconButton 
                                        size="small" 
                                        onClick={() => handleCancelOverride(entry.override_id!)}
                                        sx={{ 
                                          color: 'white',
                                          bgcolor: 'error.main',
                                          '&:hover': { bgcolor: 'error.dark' },
                                          width: 28,
                                          height: 28,
                                        }}
                                      >
                                        <UndoIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  {(canManage || (isRotationMember && entry.user_id === user?.id)) && 
                                   !entry.is_cancelled && !entry.is_override && (
                                    <Tooltip title="Swap or cancel">
                                      <IconButton 
                                        size="small" 
                                        onClick={() => handleOpenSwapDialog(entry)}
                                      >
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
                  )}
                </Box>
              )}
              
              {/* Manage Tab - for owners/admins */}
              {((isScheduleContext && tabValue === (hasRotation ? 2 : 1)) || 
                (isNetContext && tabValue === 1)) && canManage && (
                <Box>
                  {isScheduleContext ? (
                    // Manage rotation members for schedules
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2">
                          Rotation Members
                        </Typography>
                        {members.length > 0 && (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            startIcon={<DeleteIcon />}
                            onClick={handleClearAllMembers}
                          >
                            Clear All
                          </Button>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                        NCS duties rotate through active members in order. Clear all to use the host as default NCS.
                      </Typography>
                      
                      {/* Add member */}
                      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: isMobile ? 'column' : 'row' }}>
                        <Autocomplete
                          options={availableUsers}
                          getOptionLabel={(option) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                          value={selectedUser}
                          onChange={(_, value) => setSelectedUser(value)}
                          renderInput={(params) => (
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
                          {members.map((member, idx) => (
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
                                <Tooltip title={member.is_active ? 'Mark inactive' : 'Mark active'}>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleToggleMemberActive(member)}
                                  >
                                    <BlockIcon 
                                      fontSize="small" 
                                      color={member.is_active ? 'action' : 'error'} 
                                    />
                                  </IconButton>
                                </Tooltip>
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
                    </>
                  ) : (
                    // Manage NCS roles for nets
                    <>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Assign Net Control Stations
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                        Any assigned NCS can manage check-ins and control the net. The host always has full access.
                      </Typography>
                      
                      {/* Add NCS */}
                      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: isMobile ? 'column' : 'row' }}>
                        <Autocomplete
                          options={availableUsers}
                          getOptionLabel={(option) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                          value={selectedUser}
                          onChange={(_, value) => setSelectedUser(value)}
                          renderInput={(params) => (
                            <TextField {...params} label="Add NCS" size="small" />
                          )}
                          sx={{ flex: 1 }}
                        />
                        <Button
                          variant="contained"
                          startIcon={<AddIcon />}
                          onClick={handleAddNetRole}
                          disabled={!selectedUser}
                        >
                          Add
                        </Button>
                      </Box>
                      
                      {/* Current NCS list */}
                      {ncsRoles.length === 0 ? (
                        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                          No additional NCS assigned. The host ({net?.owner_callsign}) serves as NCS.
                        </Typography>
                      ) : (
                        <List>
                          {ncsRoles.map((role) => (
                            <ListItem
                              key={role.id}
                              sx={{ 
                                bgcolor: 'background.paper',
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 1,
                                mb: 0.5,
                              }}
                            >
                              <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                              <ListItemText
                                primary={
                                  <Typography>
                                    {role.callsign}
                                    {role.name && ` (${role.name})`}
                                  </Typography>
                                }
                              />
                              <ListItemSecondaryAction>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleRemoveNetRole(role.id)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </ListItemSecondaryAction>
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </>
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
              options={members.filter((m) => m.is_active && m.user_id !== selectedEntry?.user_id)}
              getOptionLabel={(option) => `${option.user_callsign}${option.user_name ? ` (${option.user_name})` : ''}`}
              value={swapUser ? members.find((m) => m.user_id === swapUser.id) || null : null}
              onChange={(_, value) => {
                if (value) {
                  const foundUser = users.find((u) => u.id === value.user_id);
                  setSwapUser(foundUser || null);
                } else {
                  setSwapUser(null);
                }
              }}
              renderInput={(params) => (
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
    </>
  );
};

export default NCSStaffModal;
