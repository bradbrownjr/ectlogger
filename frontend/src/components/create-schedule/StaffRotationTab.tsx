import React, { useState, useEffect } from 'react';
import {
  TextField,
  Typography,
  Box,
  Button,
  Autocomplete,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Switch,
  Chip,
  Divider,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { ncsRotationApi, templateStaffApi, templateApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import {
  useCreateScheduleContext,
  User,
  RotationMember,
  StaffMember,
  TemplateSubscriber,
} from '../../contexts/CreateScheduleContext';

// ========== TAB 2: NET STAFF ==========
// Schedule Manager (owner), authorized Net Staff, NCS rotation, and subscribers

const StaffRotationTab: React.FC = () => {
  const {
    isEdit,
    scheduleId,
    currentUser,
    ownerId, setOwnerId,
    originalOwnerId,
    users,
    staff, setStaff,
    rotationMembers, setRotationMembers,
    pendingNCSUsers, setPendingNCSUsers,
  } = useCreateScheduleContext();

  // ---- Local state ----
  const [selectedUserForRotation, setSelectedUserForRotation] = useState<User | null>(null);
  const [selectedUserForStaff, setSelectedUserForStaff] = useState<User | null>(null);
  const [subscribers, setSubscribers] = useState<TemplateSubscriber[]>([]);

  // ---- Permission checks ----
  const canViewSubscribers = !!currentUser && (
    currentUser.role === 'admin' ||
    currentUser.id === originalOwnerId ||
    staff.some((s: StaffMember) => s.user_id === currentUser.id && s.is_active && s.is_co_manager)
  );

  // ---- Derived user lists ----
  const availableUsersForStaff = users.filter(
    (u: User) => u.id !== ownerId && !staff.some((s: StaffMember) => s.user_id === u.id)
  );
  const eligibleForRotationIds = new Set<number>([
    ...(ownerId ? [ownerId] : []),
    ...staff.filter((s: StaffMember) => s.is_active).map((s: StaffMember) => s.user_id),
  ]);
  const availableUsersForRotation = users.filter(
    (u: User) => eligibleForRotationIds.has(u.id) && !rotationMembers.some((m: RotationMember) => m.user_id === u.id)
  );
  const hasActiveStaffMissingFromRotation = staff.some(
    (s: StaffMember) => s.is_active && !rotationMembers.some((m: RotationMember) => m.user_id === s.user_id)
  );
  const managerMissingFromRotation = !!ownerId && !rotationMembers.some(
    (m: RotationMember) => m.user_id === ownerId
  );

  // ---- Data fetching (edit mode only) ----
  useEffect(() => {
    if (!isEdit || !scheduleId) return;
    fetchStaff();
    fetchRotationMembers();
  }, [isEdit, scheduleId]);

  useEffect(() => {
    if (!isEdit || !scheduleId || !canViewSubscribers) return;
    fetchSubscribers();
  }, [isEdit, scheduleId, canViewSubscribers]);

  const fetchStaff = async () => {
    if (!scheduleId) return;
    try {
      const response = await templateStaffApi.list(Number(scheduleId));
      setStaff(response.data);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    }
  };

  const fetchRotationMembers = async () => {
    if (!scheduleId) return;
    try {
      const response = await ncsRotationApi.listMembers(Number(scheduleId));
      setRotationMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch rotation members:', error);
    }
  };

  const fetchSubscribers = async () => {
    if (!scheduleId) return;
    try {
      const response = await templateApi.listSubscriptions(Number(scheduleId));
      setSubscribers(response.data);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        setSubscribers([]);
        return;
      }
      console.error('Failed to fetch subscribers:', error);
    }
  };

  // ---- Staff handlers ----
  const handleAddStaff = async () => {
    if (!selectedUserForStaff || !scheduleId) return;
    try {
      const response = await templateStaffApi.add(Number(scheduleId), {
        user_id: selectedUserForStaff.id,
      });
      setStaff([...staff, response.data]);
      setSelectedUserForStaff(null);
    } catch (error: any) {
      console.error('Failed to add staff:', error);
      alert(getErrorMessage(error, 'Failed to add staff'));
    }
  };

  const handleRemoveStaff = async (staffId: number) => {
    if (!scheduleId) return;
    if (!confirm('Remove this operator from the staff list?')) return;
    try {
      await templateStaffApi.remove(Number(scheduleId), staffId);
      setStaff(staff.filter((s: StaffMember) => s.id !== staffId));
    } catch (error) {
      console.error('Failed to remove staff:', error);
    }
  };

  const handleToggleStaffActive = async (staffId: number, currentActive: boolean) => {
    if (!scheduleId) return;
    try {
      await templateStaffApi.updateActive(Number(scheduleId), staffId, !currentActive);
      setStaff(staff.map((s: StaffMember) => (s.id === staffId ? { ...s, is_active: !currentActive } : s)));
    } catch (error) {
      console.error('Failed to update staff:', error);
      alert(getErrorMessage(error, 'Failed to update staff'));
    }
  };

  // Build the rotation from the active staff list. Adds any active staff
  // members not already in the rotation, preserving existing rotation order.
  const handleBuildRotationFromStaff = async () => {
    if (!scheduleId) return;
    const userIdsToAdd = new Set<number>(
      staff.filter((s: StaffMember) => s.is_active).map((s: StaffMember) => s.user_id)
    );
    if (ownerId) userIdsToAdd.add(ownerId);

    const toAddIds = Array.from(userIdsToAdd).filter(
      (userId) => !rotationMembers.some((m: RotationMember) => m.user_id === userId)
    );
    if (toAddIds.length === 0) {
      alert('All active staff and the manager are already in the rotation.');
      return;
    }
    try {
      for (const userId of toAddIds) {
        await ncsRotationApi.addMember(Number(scheduleId), { user_id: userId });
      }
      await fetchRotationMembers();
    } catch (error: any) {
      console.error('Failed to build rotation from staff:', error);
      alert(getErrorMessage(error, 'Failed to build rotation from staff'));
    }
  };

  // ---- Rotation handlers ----
  const handleAddRotationMember = async () => {
    if (!selectedUserForRotation || !scheduleId) return;
    try {
      const response = await ncsRotationApi.addMember(Number(scheduleId), {
        user_id: selectedUserForRotation.id,
        position: rotationMembers.length + 1,
      });
      setRotationMembers([...rotationMembers, response.data]);
      setSelectedUserForRotation(null);
    } catch (error) {
      console.error('Failed to add rotation member:', error);
      alert('Failed to add rotation member');
    }
  };

  const handleRemoveRotationMember = async (memberId: number) => {
    if (!scheduleId) return;
    try {
      await ncsRotationApi.removeMember(Number(scheduleId), memberId);
      setRotationMembers(rotationMembers.filter((m: RotationMember) => m.id !== memberId));
    } catch (error) {
      console.error('Failed to remove rotation member:', error);
    }
  };

  const handleToggleRotationMemberActive = async (memberId: number, currentActive: boolean) => {
    if (!scheduleId) return;
    try {
      await ncsRotationApi.updateMember(Number(scheduleId), memberId, { is_active: !currentActive });
      setRotationMembers(rotationMembers.map((m: RotationMember) =>
        m.id === memberId ? { ...m, is_active: !currentActive } : m
      ));
    } catch (error) {
      console.error('Failed to update rotation member:', error);
      alert(getErrorMessage(error, 'Failed to update rotation member'));
    }
  };

  const handleMoveRotationMember = async (memberId: number, direction: 'up' | 'down') => {
    if (!scheduleId) return;
    const currentIndex = rotationMembers.findIndex((m: RotationMember) => m.id === memberId);
    if (currentIndex === -1) return;
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= rotationMembers.length) return;
    const newOrder = [...rotationMembers];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    try {
      await ncsRotationApi.reorderMembers(Number(scheduleId), newOrder.map((m: RotationMember) => m.id));
      setRotationMembers(newOrder.map((m: RotationMember, i: number) => ({ ...m, position: i + 1 })));
    } catch (error) {
      console.error('Failed to reorder rotation members:', error);
    }
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {isEdit
          ? 'Manage the Schedule Manager, the authorized Net Staff (who can start and run nets), and an optional NCS rotation order.'
          : 'Add Net Staff operators who will be authorized to start and run nets from this schedule. After saving, you can also configure an optional NCS rotation order.'}
      </Typography>

      {/* ========== NEW SCHEDULE: owner + pending staff input ========== */}
      {!isEdit && (
        <>
          {/* Owner display and selector */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Schedule Owner</Typography>
            <Autocomplete
              options={users}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={users.find((u: User) => u.id === (ownerId || currentUser?.id)) || null}
              onChange={(_: any, value: User | null) => setOwnerId(value?.id || null)}
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  size="small"
                  helperText="You can assign this schedule to another user"
                />
              )}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Add NCS operator input */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Autocomplete
              options={users.filter((u: User) => {
                const effectiveOwnerId = ownerId || currentUser?.id;
                return u.id !== effectiveOwnerId && !pendingNCSUsers.some((p: User) => p.id === u.id);
              })}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={selectedUserForRotation}
              onChange={(_: any, value: User | null) => setSelectedUserForRotation(value)}
              renderInput={(params: any) => (
                <TextField {...params} label="Add NCS Operator" size="small" />
              )}
              sx={{ flexGrow: 1 }}
            />
            <Button
              type="button"
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => {
                if (selectedUserForRotation) {
                  setPendingNCSUsers([...pendingNCSUsers, selectedUserForRotation]);
                  setSelectedUserForRotation(null);
                }
              }}
              disabled={!selectedUserForRotation}
            >
              Add
            </Button>
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Additional NCS Operators</Typography>
          {pendingNCSUsers.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No additional NCS operators added yet.
            </Typography>
          ) : (
            <List>
              {pendingNCSUsers.map((user: User) => (
                <ListItem
                  key={user.id}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight="bold">{user.callsign}</Typography>
                        {user.name && (
                          <Typography color="text.secondary">({user.name})</Typography>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      type="button"
                      edge="end"
                      onClick={() => setPendingNCSUsers(pendingNCSUsers.filter((u: User) => u.id !== user.id))}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}

      {/* ========== EDIT MODE: Manager + Staff + Rotation + Subscribers ========== */}
      {isEdit && (
        <>
          {/* ========== SCHEDULE MANAGER (OWNER) ========== */}
          {/* Manager is the schedule owner (ham-radio Net Manager term).
              They are always implicitly authorized to start/run nets and
              serve as the default NCS when no rotation is configured.
              Only the current owner or an admin can transfer ownership. */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Schedule Manager
            </Typography>
            {users.length > 0 && (currentUser?.role === 'admin' || currentUser?.id === originalOwnerId) ? (
              <Autocomplete
                options={users}
                getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                value={users.find((u: User) => u.id === ownerId) || null}
                onChange={(_: any, value: User | null) => setOwnerId(value?.id || null)}
                renderInput={(params: any) => (
                  <TextField
                    {...params}
                    size="small"
                    helperText="The Manager is implicitly authorized as NCS and serves as the default NCS when no rotation is configured."
                  />
                )}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  {users.find((u: User) => u.id === ownerId)?.callsign || 'Unknown'}
                  {users.find((u: User) => u.id === ownerId)?.name && ` (${users.find((u: User) => u.id === ownerId)?.name})`}
                </Typography>
                <Chip label="Manager" size="small" color="primary" variant="outlined" />
              </Box>
            )}
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* ========== AUTHORIZED NET STAFF ========== */}
          {/* Operators in this list can start and run nets from this schedule.
              This is the primary, recommended workflow. The rotation below
              is optional and only matters when you want NCS duty to cycle
              automatically across upcoming scheduled nets. */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Authorized Net Staff
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Operators listed here can start and run nets from this schedule. The Manager always has access — add others to share the workload.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Autocomplete
              options={availableUsersForStaff}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={selectedUserForStaff}
              onChange={(_: any, value: User | null) => setSelectedUserForStaff(value)}
              noOptionsText={users.length === 0 ? 'Loading users…' : 'No other users available'}
              renderInput={(params: any) => (
                <TextField {...params} label="Add Net Staff Operator" size="small" />
              )}
              sx={{ flexGrow: 1 }}
            />
            <Button
              type="button"
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={handleAddStaff}
              disabled={!selectedUserForStaff}
            >
              Add
            </Button>
          </Box>

          {staff.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No additional staff assigned. Only the Manager can start nets.
            </Typography>
          ) : (
            <List dense>
              {staff.map((s: StaffMember) => (
                <ListItem
                  key={s.id}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: s.is_active ? 'background.paper' : 'action.disabledBackground',
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight="bold">{s.user_callsign}</Typography>
                        {s.user_name && (
                          <Typography color="text.secondary">({s.user_name})</Typography>
                        )}
                        {!s.is_active && (
                          <Chip label="Inactive" size="small" variant="outlined" />
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', mr: 1 }}>
                      <Switch
                        checked={s.is_active}
                        onChange={() => handleToggleStaffActive(s.id, s.is_active)}
                        title={s.is_active ? 'Active (can run nets)' : 'Inactive (temporarily disabled)'}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                        {s.is_active ? 'Can run nets' : 'Disabled'}
                      </Typography>
                    </Box>
                    <IconButton
                      type="button"
                      edge="end"
                      onClick={() => handleRemoveStaff(s.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}

          <Divider sx={{ my: 3 }} />

          {/* ========== NCS ROTATION (OPTIONAL) ========== */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">
              NCS Rotation <Typography component="span" variant="caption" color="text.secondary">(optional)</Typography>
            </Typography>
            {(hasActiveStaffMissingFromRotation || managerMissingFromRotation) && (
              <Button
                type="button"
                size="small"
                variant="outlined"
                onClick={handleBuildRotationFromStaff}
              >
                Build rotation from staff
              </Button>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Optional: define an order to cycle NCS duty across upcoming scheduled nets. If empty, nets default to the Manager. Use the up/down arrows to set the order.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Autocomplete
              options={availableUsersForRotation}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={selectedUserForRotation}
              onChange={(_: any, value: User | null) => setSelectedUserForRotation(value)}
              noOptionsText={users.length === 0 ? 'Loading users…' : 'No other users available'}
              renderInput={(params: any) => (
                <TextField {...params} label="Add NCS Operator to rotation" size="small" />
              )}
              sx={{ flexGrow: 1 }}
            />
            <Button
              type="button"
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={handleAddRotationMember}
              disabled={!selectedUserForRotation}
            >
              Add
            </Button>
          </Box>

          {rotationMembers.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No rotation configured — nets default to the Manager. Add operators above (or click "Build rotation from staff") to cycle NCS duty automatically.
            </Typography>
          ) : (
            <List>
              {rotationMembers.map((member: RotationMember, index: number) => (
                <ListItem
                  key={member.id}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    bgcolor: member.is_active ? 'background.paper' : 'action.disabledBackground',
                  }}
                >
                  <ListItemIcon>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <IconButton
                        type="button"
                        size="small"
                        onClick={() => handleMoveRotationMember(member.id, 'up')}
                        disabled={index === 0}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        type="button"
                        size="small"
                        onClick={() => handleMoveRotationMember(member.id, 'down')}
                        disabled={index === rotationMembers.length - 1}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={`#${index + 1}`} size="small" color="primary" variant="outlined" />
                        <Typography fontWeight="bold">{member.user_callsign}</Typography>
                        {member.user_name && (
                          <Typography color="text.secondary">({member.user_name})</Typography>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', mr: 1 }}>
                      <Switch
                        checked={member.is_active}
                        onChange={() => handleToggleRotationMemberActive(member.id, member.is_active)}
                        title={member.is_active ? 'Active in rotation' : 'Inactive (skipped)'}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                        {member.is_active ? 'In rotation' : 'Skipped'}
                      </Typography>
                    </Box>
                    <IconButton
                      type="button"
                      edge="end"
                      onClick={() => handleRemoveRotationMember(member.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}

          {/* ========== SUBSCRIBERS ========== */}
          {canViewSubscribers && (
            <>
              <Divider sx={{ my: 3 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">Subscribers</Typography>
                <Chip label={`${subscribers.length} subscribed`} size="small" variant="outlined" />
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                Users who clicked the bell or accepted the reminder prompt for this schedule.
              </Typography>

              {subscribers.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No subscribers yet.
                </Typography>
              ) : (
                <List dense>
                  {subscribers.map((subscriber: TemplateSubscriber) => (
                    <ListItem
                      key={subscriber.id}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography fontWeight="bold">{subscriber.user_callsign || 'Unknown callsign'}</Typography>
                            {subscriber.user_name && (
                              <Typography color="text.secondary">({subscriber.user_name})</Typography>
                            )}
                            <Chip label="Subscribed" size="small" color="primary" variant="outlined" />
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
        </>
      )}
    </>
  );
};

export default StaffRotationTab;
