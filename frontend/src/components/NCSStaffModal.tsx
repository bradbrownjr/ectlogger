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
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import { ncsRotationApi, userApi, templateStaffApi, templateApi } from '../services/api';
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

interface StaffMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
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
  const [staff, setStaff] = useState<StaffMember[]>([]);  // Separate staff list
  const [members, setMembers] = useState<RotationMember[]>([]);  // Rotation members (with position/order)
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

  // ========== MANAGER (OWNER) TRANSFER STATE ==========
  // Lets the current owner or an admin transfer schedule ownership from
  // inside the staff modal. The new manager is set via templateApi.update
  // and onUpdate() refetches the parent so the rest of the UI stays in sync.
  const [editingManager, setEditingManager] = useState(false);
  const [pendingManager, setPendingManager] = useState<User | null>(null);
  const [managerSaving, setManagerSaving] = useState(false);
  // Local override of the displayed manager so the new value sticks even
  // before the parent refetches and passes a fresh `schedule` prop.
  const [localOwner, setLocalOwner] = useState<{ id: number; callsign?: string; name?: string } | null>(null);
  
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Determine context - are we looking at a schedule/template or a net?
  const isScheduleContext = !!schedule && !net;
  const isNetContext = !!net;
  
  // Permissions
  // The schedule "owner" is the Net Manager (ham-radio term) — the person
  // ultimately responsible for the schedule. Owner / admin / active staff /
  // active rotation members can all manage the staff list. This must stay in
  // sync with the backend `check_template_permission` helpers in
  // routers/templates.py and routers/ncs_rotation.py.
  const isOwner = isScheduleContext
    ? user?.id === schedule?.owner_id
    : user?.id === net?.owner_id;
  const isAdmin = user?.role === 'admin';
  // Can't manage staff for closed nets
  const isNetClosed = isNetContext && net?.status === 'closed';

  // Check if user is in the rotation (for schedules)
  // Only owners and admins can edit staff/rotation.
  const canEdit = isAuthenticated && (isOwner || isAdmin) && !isNetClosed;

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

  // Use IDs to prevent refetch when parent re-renders with same data
  const scheduleId = schedule?.id;
  const netId = net?.id;
  
  useEffect(() => {
    if (open) {
      fetchData();
    } else {
      // Reset when modal closes
      setError(null);
      setEditingManager(false);
      setPendingManager(null);
      setLocalOwner(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleId, netId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (isScheduleContext && schedule) {
        // Fetch template staff and rotation data separately
        const [staffRes, membersRes, scheduleRes] = await Promise.all([
          templateStaffApi.list(schedule.id),
          ncsRotationApi.listMembers(schedule.id),
          ncsRotationApi.getSchedule(schedule.id, 12), // 12 weeks ahead
        ]);
        
        setStaff(staffRes.data);
        setMembers(membersRes.data);
        setScheduleEntries(scheduleRes.data.schedule || []);
        
        // Only fetch users list if user can edit
        if (canEdit) {
          const usersRes = await userApi.listDirectory();
          setUsers(usersRes.data);
        }
      } else if (isNetContext && net) {
        // Fetch net roles
        const rolesRes = await api.get(`/nets/${net.id}/roles`);
        setNetRoles(rolesRes.data || []);
        
        // Only fetch users list if user can edit
        if (canEdit) {
          const usersRes = await userApi.listDirectory();
          setUsers(usersRes.data);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load staff data'));
    } finally {
      setLoading(false);
    }
  };

  // ===== SCHEDULE/TEMPLATE STAFF HANDLERS =====

  // Transfer schedule ownership to a new user. Allowed only for the current
  // owner or an admin (enforced both here and by the backend). On success we
  // update the local display and call onUpdate() so the parent (Scheduler)
  // refetches its list with the new owner.
  const handleSaveManager = async () => {
    if (!schedule || !pendingManager || pendingManager.id === (localOwner?.id ?? schedule.owner_id)) {
      setEditingManager(false);
      return;
    }
    setManagerSaving(true);
    try {
      await templateApi.update(schedule.id, { owner_id: pendingManager.id });
      setLocalOwner({
        id: pendingManager.id,
        callsign: pendingManager.callsign,
        name: pendingManager.name || undefined,
      });
      setEditingManager(false);
      setPendingManager(null);
      onUpdate?.();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update manager'));
    } finally {
      setManagerSaving(false);
    }
  };

  const handleAddStaff = async () => {
    if (!schedule || !selectedUser) return;
    
    try {
      const response = await templateStaffApi.add(schedule.id, { user_id: selectedUser.id });
      // Update local state instead of refetching
      setStaff(prev => [...prev, response.data]);
      setSelectedUser(null);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to add staff'));
    }
  };

  const handleRemoveStaff = async (staffId: number) => {
    if (!schedule || !confirm('Remove this operator from the staff? They will also be removed from the rotation if present.')) return;
    
    // Find the staff member to get their user_id
    const staffMember = staff.find((s: StaffMember) => s.id === staffId);
    
    try {
      await templateStaffApi.remove(schedule.id, staffId);
      // Update local state
      setStaff(prev => prev.filter((s: StaffMember) => s.id !== staffId));
      
      // Also remove from rotation if they're in it
      if (staffMember) {
        const rotationMember = members.find((m: RotationMember) => m.user_id === staffMember.user_id);
        if (rotationMember) {
          await ncsRotationApi.removeMember(schedule.id, rotationMember.id);
          setMembers(prev => prev.filter((m: RotationMember) => m.id !== rotationMember.id));
          
          // Refresh schedule entries since rotation changed
          const scheduleRes = await ncsRotationApi.getSchedule(schedule.id, 12);
          setScheduleEntries(scheduleRes.data.schedule || []);
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to remove staff'));
    }
  };

  const handleToggleStaffActive = async (staffMember: StaffMember) => {
    if (!schedule) return;
    
    try {
      await templateStaffApi.updateActive(schedule.id, staffMember.id, !staffMember.is_active);
      // Update local state instead of refetching
      setStaff(prev => prev.map(s => 
        s.id === staffMember.id ? { ...s, is_active: !s.is_active } : s
      ));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update staff'));
    }
  };

  // ===== SCHEDULE/TEMPLATE ROTATION HANDLERS =====
  
  const handleRemoveMember = async (memberId: number) => {
    if (!schedule || !confirm('Remove this operator from the rotation?')) return;
    
    try {
      await ncsRotationApi.removeMember(schedule.id, memberId);
      await fetchData();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to remove member'));
    }
  };

  const handleClearAllMembers = async () => {
    if (!schedule || !confirm('Clear the entire NCS rotation? This will remove all members and swaps. The net owner will be the default NCS for all instances.')) return;
    
    try {
      await ncsRotationApi.clearAllMembers(schedule.id);
      await fetchData();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to clear rotation'));
    }
  };

  const handleCreateRotationFromStaff = async () => {
    if (!schedule) return;
    
    // Get staff members not already in rotation
    const staffNotInRotation = staff.filter(
      (s: StaffMember) => s.is_active && !members.some((m: RotationMember) => m.user_id === s.user_id)
    );
    
    if (staffNotInRotation.length === 0) {
      setError('All active staff members are already in the rotation');
      return;
    }
    
    try {
      // Add each staff member to rotation
      for (const s of staffNotInRotation) {
        await ncsRotationApi.addMember(schedule.id, { user_id: s.user_id });
      }
      await fetchData();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create rotation from staff'));
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
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to reorder members'));
    }
  };

  const handleToggleMemberActive = async (member: RotationMember) => {
    if (!schedule) return;
    
    try {
      await ncsRotationApi.updateMember(schedule.id, member.id, { is_active: !member.is_active });
      await fetchData();
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
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create override'));
    }
  };

  const handleCancelOverride = async (overrideId: number) => {
    if (!schedule || !confirm('Cancel this swap and revert to the normal rotation?')) return;
    
    try {
      await ncsRotationApi.deleteOverride(schedule.id, overrideId);
      await fetchData();
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

  // Filter out users already assigned (staff, not rotation) AND the owner
  const ownerId = isScheduleContext ? schedule?.owner_id : net?.owner_id;
  const availableStaffUsers = isScheduleContext
    ? users.filter((u: User) => u.id !== ownerId && !staff.some((s: StaffMember) => s.user_id === u.id))
    : users.filter((u: User) => u.id !== ownerId && !netRoles.some((r: NetRole) => r.user_id === u.id && r.role === 'NCS'));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get NCS-only roles for display
  const ncsRoles = netRoles.filter((r: NetRole) => r.role === 'NCS');

  // Render the staff list. Owners and admins see inline add/remove/toggle controls.
  const renderStaffList = () => {
    if (isScheduleContext) {
      return (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Authorized Net Control Stations
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Any of these operators can start and run nets from this schedule.
          </Typography>

          {/* Add staff - owners/admins only */}
          {canEdit && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: isMobile ? 'column' : 'row' }}>
              <Autocomplete
                options={availableStaffUsers}
                getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                value={selectedUser}
                onChange={(_: any, value: User | null) => setSelectedUser(value)}
                noOptionsText={users.length === 0 ? 'Loading users…' : 'No other users available'}
                renderInput={(params: any) => (
                  <TextField {...params} label="Add NCS operator" size="small" />
                )}
                sx={{ flex: 1 }}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddStaff}
                disabled={!selectedUser}
              >
                Add
              </Button>
            </Box>
          )}

          {/* Manager (owner) — always shown first */}
          <List dense>
            <ListItem sx={{ py: 0.5, bgcolor: 'action.hover', borderRadius: 1, mb: 0.5 }}>
              <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
              {editingManager ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
                  <Autocomplete
                    size="small"
                    options={users}
                    getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                    value={pendingManager}
                    onChange={(_: any, value: User | null) => setPendingManager(value)}
                    renderInput={(params: any) => (
                      <TextField {...params} label="Transfer to" placeholder="Select new manager" />
                    )}
                    sx={{ flexGrow: 1, minWidth: 220 }}
                  />
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={handleSaveManager}
                    disabled={!pendingManager || managerSaving || pendingManager.id === (localOwner?.id ?? schedule?.owner_id)}
                    title="Save new manager"
                  >
                    <SaveIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => { setEditingManager(false); setPendingManager(null); }}
                    disabled={managerSaving}
                    title="Cancel"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              ) : (
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">
                        {(localOwner?.callsign ?? schedule?.owner_callsign) || 'Manager'}
                        {(localOwner?.name ?? schedule?.owner_name) && ` (${localOwner?.name ?? schedule?.owner_name})`}
                      </Typography>
                      <Chip label="Manager" size="small" color="primary" variant="outlined" />
                    </Box>
                  }
                />
              )}
              {/* Transfer ownership - owners/admins only */}
              {!editingManager && canEdit && (
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => {
                      const currentOwnerId = localOwner?.id ?? schedule?.owner_id;
                      setPendingManager(users.find((u: User) => u.id === currentOwnerId) || null);
                      setEditingManager(true);
                    }}
                    title="Change Manager"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              )}
            </ListItem>

            {/* Additional staff members */}
            {staff.map((s: StaffMember) => (
              <ListItem
                key={s.id}
                sx={{
                  py: 0.5,
                  bgcolor: s.is_active ? undefined : 'action.disabledBackground',
                  borderRadius: 1,
                  mb: 0.5,
                }}
              >
                <PersonIcon sx={{ mr: 1, color: s.is_active ? 'primary.main' : 'action.disabled' }} />
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">
                        {s.user_callsign}
                        {s.user_name && ` (${s.user_name})`}
                      </Typography>
                      {!s.is_active && (
                        <Chip label="Inactive" size="small" variant="outlined" />
                      )}
                    </Box>
                  }
                />
                {/* Edit controls - owners/admins only */}
                {canEdit && (
                  <ListItemSecondaryAction>
                    <Tooltip title={s.is_active ? 'Mark inactive' : 'Mark active'}>
                      <IconButton size="small" onClick={() => handleToggleStaffActive(s)}>
                        <BlockIcon fontSize="small" color={s.is_active ? 'action' : 'error'} />
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" color="error" onClick={() => handleRemoveStaff(s.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>

          {staff.length === 0 && !canEdit && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              No additional NCS assigned. Only the owner can start nets.
            </Typography>
          )}
        </Box>
      );
    } else if (isNetContext) {
      // For nets - show assigned NCS roles (or owner if none assigned)
      return (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {ncsRoles.length > 0
              ? `Assigned Net Control Stations (${ncsRoles.length})`
              : 'Net Control Station'}
          </Typography>

          {/* Add NCS - owners/admins only */}
          {canEdit && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: isMobile ? 'column' : 'row' }}>
              <Autocomplete
                options={availableStaffUsers}
                getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                value={selectedUser}
                onChange={(_: any, value: User | null) => setSelectedUser(value)}
                noOptionsText={users.length === 0 ? 'Loading users…' : 'No other users available'}
                renderInput={(params: any) => (
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
          )}

          <List dense>
            {ncsRoles.length === 0 ? (
              /* No assigned NCS — show the owner as the default */
              <ListItem sx={{ py: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">
                        {net?.owner_callsign || 'Manager'}
                        {net?.owner_name && ` (${net.owner_name})`}
                      </Typography>
                      <Chip label="Manager" size="small" color="primary" variant="outlined" />
                    </Box>
                  }
                />
              </ListItem>
            ) : (
              ncsRoles.map((role: NetRole) => (
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
                  {canEdit && (
                    <ListItemSecondaryAction>
                      <IconButton size="small" color="error" onClick={() => handleRemoveNetRole(role.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              ))
            )}
          </List>

          {ncsRoles.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              No additional NCS assigned. The manager serves as NCS.
            </Typography>
          )}
        </Box>
      );
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
          
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Staff list - all authenticated users can view; owners/admins get inline edit controls */}
              {renderStaffList()}

              {/* Rotation section - schedule context, owners/admins only */}
              {isScheduleContext && canEdit && (
                <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2">
                      Rotation Order
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
                    Optional: cycle NCS duty automatically across upcoming scheduled nets. If empty, nets default to the Manager. Use "Add Staff to Rotation" to populate from your staff list.
                  </Typography>
                  
                  {/* Create from Staff button - only show if there are staff not in rotation */}
                  {staff.filter((s: StaffMember) => s.is_active && !members.some((m: RotationMember) => m.user_id === s.user_id)).length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<AddIcon />}
                        onClick={handleCreateRotationFromStaff}
                        fullWidth={isMobile}
                      >
                        Add Staff to Rotation ({staff.filter((s: StaffMember) => s.is_active && !members.some((m: RotationMember) => m.user_id === s.user_id)).length} available)
                      </Button>
                    </Box>
                  )}
                  
                  {/* Members list with reorder controls */}
                  {members.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <Typography color="text.secondary" sx={{ mb: 1 }}>
                        No rotation configured — nets default to the Manager.
                      </Typography>
                      {staff.length > 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          Use "Add Staff to Rotation" above to populate the order from your staff list.
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Add staff above first, then build the rotation from them.
                        </Typography>
                      )}
                    </Box>
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
                                <Chip label={`#${idx + 1}`} size="small" color="primary" variant="outlined" />
                                <Typography>
                                  {member.user_callsign}
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
                            <Tooltip title={member.is_active ? 'Skip (mark inactive)' : 'Include (mark active)'}>
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
                  
                  {/* Upcoming rotation schedule preview */}
                  {scheduleEntries.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Upcoming Schedule
                      </Typography>
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
                            {scheduleEntries.slice(0, 8).map((entry: ScheduleEntry, idx: number) => (
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
                                </TableCell>
                                <TableCell align="right">
                                  {entry.is_override && entry.override_id && (
                                    <Tooltip title="Revert to normal rotation">
                                      <IconButton 
                                        size="small" 
                                        onClick={() => handleCancelOverride(entry.override_id!)}
                                        color="error"
                                      >
                                        <UndoIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  {!entry.is_cancelled && !entry.is_override && (
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
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
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
              options={staff.filter((s: StaffMember) => s.is_active && s.user_id !== selectedEntry?.user_id)}
              getOptionLabel={(option: StaffMember) => `${option.user_callsign}${option.user_name ? ` (${option.user_name})` : ''}`}
              value={swapUser ? staff.find((s: StaffMember) => s.user_id === swapUser.id) || null : null}
              onChange={(_: any, value: StaffMember | null) => {
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
