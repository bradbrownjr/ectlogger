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
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import { ncsRotationApi, templateStaffApi, templateApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import SubscribeLinkField from '../scheduler/SubscribeLinkField';
import AddStaffField, { AddStaffRequest } from '../ncs-staff/AddStaffField';
import PlaceholderChips from '../ncs-staff/PlaceholderChips';
import PlaceholderEditDialog from '../ncs-staff/PlaceholderEditDialog';
import { linkConfirmText, personKey, personLabel, personPayload, samePerson, SchedulePerson, toPerson, userToPerson, uniquePeople } from '../../utils/staffPeople';
import {
  useCreateScheduleContext,
  User,
  RotationMember,
  StaffMember,
  TemplateSubscriber,
  PendingStaff,
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
  const [selectedForRotation, setSelectedForRotation] = useState<SchedulePerson | null>(null);
  // The callsign-only staff member whose typo/invite dialog is open.
  const [editingPlaceholder, setEditingPlaceholder] = useState<StaffMember | null>(null);
  const [subscribers, setSubscribers] = useState<TemplateSubscriber[]>([]);

  // ---- Permission checks ----
  const canViewSubscribers = !!currentUser && (
    currentUser.role === 'admin' ||
    currentUser.id === originalOwnerId ||
    staff.some((s: StaffMember) => s.user_id === currentUser.id && s.is_active && s.is_co_manager)
  );

  // ---- Derived user lists ----
  // Staff and rotation rows can name a callsign with no account (user_id
  // null), so rows are compared with samePerson, never by user_id alone.
  const availableUsersForStaff = users.filter(
    (u: User) => u.id !== ownerId && !staff.some((s: StaffMember) => s.user_id === u.id)
  );
  const owner = users.find((u: User) => u.id === ownerId);
  // Who can go in the rotation: the manager plus active staff.
  const rotationEligible = uniquePeople([
    ...(owner ? [userToPerson(owner)] : []),
    ...staff.filter((s: StaffMember) => s.is_active).map((s: StaffMember) => toPerson(s)),
  ]);
  const notInRotation = rotationEligible.filter(
    (p) => !rotationMembers.some((m: RotationMember) => samePerson(m, p))
  );
  const hasActiveStaffMissingFromRotation = notInRotation.some((p) => p.user_id == null || p.user_id !== ownerId);
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
  // An account picked from the directory, or a callsign with no account yet
  // (optionally invited). AddStaffField clears itself when this returns true.
  const handleAddStaff = async (request: AddStaffRequest): Promise<boolean> => {
    if (!scheduleId) return false;
    try {
      const response = await templateStaffApi.add(Number(scheduleId), request);
      setStaff([...staff, response.data]);
      return true;
    } catch (error: any) {
      console.error('Failed to add staff:', error);
      alert(getErrorMessage(error, 'Failed to add staff'));
      return false;
    }
  };

  // Fix a callsign-only operator's callsign and/or invite them. The backend
  // renames the matching rotation entry and swaps too, and links straight
  // away when the corrected callsign belongs to an account.
  const handleEditPlaceholder = async (s: StaffMember, changes: { callsign?: string; invite_email?: string }) => {
    if (!scheduleId) return;
    try {
      await templateStaffApi.updatePlaceholder(Number(scheduleId), s.id, changes);
    } catch (error: any) {
      alert(getErrorMessage(error, 'Failed to update operator'));
    }
    await Promise.all([fetchStaff(), fetchRotationMembers()]);
  };

  // The callsign now has an account that wasn't linked automatically (it was
  // invited at a different address); the manager confirms it's them.
  const handleLinkStaff = async (s: StaffMember) => {
    if (!scheduleId) return;
    if (!confirm(linkConfirmText(s))) return;
    try {
      await templateStaffApi.updatePlaceholder(Number(scheduleId), s.id, { link: true });
    } catch (error: any) {
      alert(getErrorMessage(error, 'Failed to link operator'));
    }
    await Promise.all([fetchStaff(), fetchRotationMembers()]);
  };

  // New schedule: staff are held until it is saved and has an id.
  const handleAddPendingStaff = async (request: AddStaffRequest): Promise<boolean> => {
    const user = 'user_id' in request ? users.find((u: User) => u.id === request.user_id) : undefined;
    const callsign = user ? user.callsign : (request as { callsign: string }).callsign;
    const key = personKey(user ? user.id : null, callsign);
    if (pendingNCSUsers.some((p: PendingStaff) => p.key === key)) return true;
    setPendingNCSUsers([...pendingNCSUsers, { key, callsign, name: user?.name ?? null, request }]);
    return true;
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

  // Co-Manager is a schedule-ownership tier: transferring ownership, merging
  // templates, archiving or deleting a net. It is NOT what lets somebody run
  // a net -- plain active staff can start a net from this schedule and can
  // self-grant NCS or Logger by checking in, which is what
  // permissions.is_active_template_staff has meant since 2026-09-18. This
  // comment and the tooltip below both still described the older, narrower
  // rule until 2026-09-19.
  //
  // This control used to exist only in the separate Net Staff popup
  // (NCSStaffRosterTab.tsx), so a schedule manager who only ever used this
  // Edit Schedule page had no way to promote anyone.
  const handleToggleCoManager = async (staffId: number, currentCoManager: boolean) => {
    if (!scheduleId) return;
    try {
      await templateStaffApi.updateCoManager(Number(scheduleId), staffId, !currentCoManager);
      setStaff(staff.map((s: StaffMember) => (s.id === staffId ? { ...s, is_co_manager: !currentCoManager } : s)));
    } catch (error) {
      console.error('Failed to update staff:', error);
      alert(getErrorMessage(error, 'Failed to update staff'));
    }
  };

  // Build the rotation from the active staff list. Adds any active staff
  // members (and the manager) not already in the rotation, preserving the
  // existing rotation order. Callsign-only staff are included.
  const handleBuildRotationFromStaff = async () => {
    if (!scheduleId) return;
    if (notInRotation.length === 0) {
      alert('All active staff and the manager are already in the rotation.');
      return;
    }
    try {
      for (const person of notInRotation) {
        await ncsRotationApi.addMember(Number(scheduleId), personPayload(person));
      }
      await fetchRotationMembers();
    } catch (error: any) {
      console.error('Failed to build rotation from staff:', error);
      alert(getErrorMessage(error, 'Failed to build rotation from staff'));
    }
  };

  // ---- Rotation handlers ----
  // The backend appends a new member at the end of the rotation.
  const handleAddRotationMember = async () => {
    if (!selectedForRotation || !scheduleId) return;
    try {
      const response = await ncsRotationApi.addMember(Number(scheduleId), personPayload(selectedForRotation));
      setRotationMembers([...rotationMembers, response.data]);
      setSelectedForRotation(null);
    } catch (error: any) {
      console.error('Failed to add rotation member:', error);
      alert(getErrorMessage(error, 'Failed to add rotation member'));
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

          {/* Add NCS operator input: an account, or a callsign with no account yet */}
          <AddStaffField
            options={users.filter((u: User) => {
              const effectiveOwnerId = ownerId || currentUser?.id;
              return u.id !== effectiveOwnerId && !pendingNCSUsers.some((p: PendingStaff) => p.key === personKey(u.id, null));
            })}
            loading={users.length === 0}
            onAdd={handleAddPendingStaff}
          />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Additional NCS Operators</Typography>
          {pendingNCSUsers.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No additional NCS operators added yet.
            </Typography>
          ) : (
            <List>
              {pendingNCSUsers.map((pending: PendingStaff) => (
                <ListItem
                  key={pending.key}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight="bold">{pending.callsign}</Typography>
                        {pending.name && (
                          <Typography color="text.secondary">({pending.name})</Typography>
                        )}
                        {/* Typed callsign with no account yet */}
                        {!('user_id' in pending.request) && (
                          <PlaceholderChips invited={!!pending.request.invite_email} />
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      type="button"
                      edge="end"
                      onClick={() => setPendingNCSUsers(pendingNCSUsers.filter((p: PendingStaff) => p.key !== pending.key))}
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

          <AddStaffField
            options={availableUsersForStaff}
            loading={users.length === 0}
            label="Add Net Staff Operator"
            onAdd={handleAddStaff}
          />

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
                        {s.is_co_manager && (
                          <Chip label="Co-Manager" size="small" color="primary" variant="outlined" />
                        )}
                        {!s.is_active && (
                          <Chip label="Inactive" size="small" variant="outlined" />
                        )}
                        {/* Callsign-only operator: no access until they sign up */}
                        {s.user_id == null && <PlaceholderChips invited={s.invited} accountAvailable={s.account_available} />}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    {/* Shows when a callsign-only operator's callsign now has an account */}
                    {s.user_id == null && s.account_available && (
                      <Tooltip title={`Link to the account that now has ${s.user_callsign}`}>
                        <IconButton type="button" color="primary" onClick={() => handleLinkStaff(s)}>
                          <LinkIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {s.user_id == null && (
                      <Tooltip title="Fix the callsign or send an invite">
                        <IconButton type="button" onClick={() => setEditingPlaceholder(s)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={s.user_id == null ? 'They need an account before they can be a co-manager' : s.is_co_manager ? 'Remove co-manager role' : 'Promote to co-manager (can also transfer ownership, merge schedules, and archive or delete nets)'}>
                      <span>
                        <IconButton
                          type="button"
                          onClick={() => handleToggleCoManager(s.id, s.is_co_manager)}
                          disabled={s.user_id == null}
                        >
                          {s.is_co_manager
                            ? <StarIcon color="primary" />
                            : <StarBorderIcon />}
                        </IconButton>
                      </span>
                    </Tooltip>
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

          {/* ========== CALLSIGN-ONLY OPERATOR: FIX CALLSIGN / INVITE ========== */}
          <PlaceholderEditDialog
            staffMember={editingPlaceholder}
            onClose={() => setEditingPlaceholder(null)}
            onSave={(changes) => {
              if (editingPlaceholder) handleEditPlaceholder(editingPlaceholder, changes);
              setEditingPlaceholder(null);
            }}
          />

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
              options={notInRotation}
              getOptionLabel={(option: SchedulePerson) => personLabel(option)}
              isOptionEqualToValue={(a: SchedulePerson, b: SchedulePerson) => a.key === b.key}
              value={selectedForRotation}
              onChange={(_: any, value: SchedulePerson | null) => setSelectedForRotation(value)}
              noOptionsText="Add them to the staff list first"
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
              disabled={!selectedForRotation}
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
                        {member.user_id == null && (
                          <Chip label="No account yet" size="small" variant="outlined" color="warning" />
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
                Users who clicked the bell, accepted the reminder prompt, or used the subscribe link for this schedule.
              </Typography>
              {scheduleId && <SubscribeLinkField scheduleId={scheduleId} />}

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
