import React from 'react';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  TextField,
  Autocomplete,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import UserAvatar from '../UserAvatar';

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
  avatar_url?: string | null;
  is_active: boolean;
  is_co_manager: boolean;
}

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

interface NetRole {
  id: number;
  user_id: number;
  email: string;
  name: string | null;
  callsign: string;
  avatar_url?: string | null;
  role: string;
  assigned_at: string;
}

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

interface NCSStaffRosterTabProps {
  isScheduleContext: boolean;
  isNetContext: boolean;
  canEdit: boolean;
  isMobile: boolean;
  availableStaffUsers: User[];
  selectedUser: User | null;
  setSelectedUser: (user: User | null) => void;
  users: User[];
  handleAddStaff: () => void;
  localOwner: { id: number; callsign?: string; name?: string } | null;
  schedule?: {
    id: number;
    name: string;
    owner_id: number;
    owner_callsign?: string;
    owner_name?: string;
  } | null;
  net?: {
    id: number;
    name: string;
    owner_id: number;
    owner_callsign?: string;
    owner_name?: string;
    status?: string;
    template_id?: number | null;
  } | null;
  setProfileUserId: (userId: number | null) => void;
  editingManager: boolean;
  setEditingManager: (value: boolean) => void;
  pendingManager: User | null;
  setPendingManager: (user: User | null) => void;
  managerSaving: boolean;
  handleSaveManager: () => void;
  staff: StaffMember[];
  handleToggleCoManager: (staffMember: StaffMember) => void;
  handleToggleStaffActive: (staffMember: StaffMember) => void;
  handleRemoveStaff: (staffId: number) => void;
  members: RotationMember[];
  scheduleEntries: ScheduleEntry[];
  ncsRoles: NetRole[];
  handleAddNetRole: () => void;
  handleRemoveNetRole: (roleId: number) => void;
}

// ========== ROSTER TAB (Net Control Stations) ==========
// The "ncs" tab of NCSStaffModal: three distinct display modes depending on
// context — schedule staff list with manager transfer (isScheduleContext),
// net-level rotation duty view (isNetContext with an active rotation), or a
// plain net-role list (isNetContext, no rotation). Extracted verbatim from
// renderStaffList; kept as one component (rather than split further) since
// the three branches share the UserAvatar+ListItemText+edit-icons shape but
// differ enough in business logic (manager transfer vs. duty highlighting
// vs. plain role list) that forcing a single shared sub-component would
// obscure more than it would save. All handlers/state stay owned by the
// parent NCSStaffModal — this component is purely presentational.

const NCSStaffRosterTab: React.FC<NCSStaffRosterTabProps> = ({
  isScheduleContext,
  isNetContext,
  canEdit,
  isMobile,
  availableStaffUsers,
  selectedUser,
  setSelectedUser,
  users,
  handleAddStaff,
  localOwner,
  schedule,
  net,
  setProfileUserId,
  editingManager,
  setEditingManager,
  pendingManager,
  setPendingManager,
  managerSaving,
  handleSaveManager,
  staff,
  handleToggleCoManager,
  handleToggleStaffActive,
  handleRemoveStaff,
  members,
  scheduleEntries,
  ncsRoles,
  handleAddNetRole,
  handleRemoveNetRole,
}) => {
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
            <Box
              onClick={() => { const id = localOwner?.id ?? schedule?.owner_id; if (id) setProfileUserId(id); }}
              sx={{ cursor: 'pointer', display: 'inline-flex', mr: 1 }}
            >
              <UserAvatar
                callsign={localOwner?.callsign ?? schedule?.owner_callsign}
                name={localOwner?.name ?? schedule?.owner_name}
                size={32}
                hasProfile
              />
            </Box>
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

          {/* Additional staff members — skip owner, already shown above as Manager */}
          {staff.filter((s: StaffMember) => s.user_id !== (localOwner?.id ?? schedule?.owner_id)).map((s: StaffMember) => (
            <ListItem
              key={s.id}
              sx={{
                py: 0.5,
                bgcolor: s.is_active ? undefined : 'action.disabledBackground',
                borderRadius: 1,
                mb: 0.5,
              }}
            >
              <Box
                onClick={() => setProfileUserId(s.user_id)}
                sx={{ cursor: 'pointer', display: 'inline-flex', mr: 1 }}
              >
                <UserAvatar
                  avatarUrl={s.avatar_url}
                  callsign={s.user_callsign}
                  name={s.user_name}
                  size={32}
                  hasProfile
                />
              </Box>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">
                      {s.user_callsign}
                      {s.user_name && ` (${s.user_name})`}
                    </Typography>
                    {s.is_co_manager && (
                      <Chip label="Co-Manager" size="small" color="primary" variant="outlined" />
                    )}
                    {!s.is_active && (
                      <Chip label="Inactive" size="small" variant="outlined" />
                    )}
                  </Box>
                }
              />
              {/* Edit controls - owners/admins/co-managers only */}
              {canEdit && (
                <ListItemSecondaryAction>
                  <Tooltip title={s.is_co_manager ? 'Remove co-manager role' : 'Promote to co-manager'}>
                    <IconButton size="small" onClick={() => handleToggleCoManager(s)}>
                      {s.is_co_manager
                        ? <StarIcon fontSize="small" color="primary" />
                        : <StarBorderIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
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
    // If this net belongs to a rotation schedule, show the full rotation list
    // and highlight today's duty NCS. Fall back to net-role list for ad-hoc nets.
    const activeRotationMembers = members
      .filter((m: RotationMember) => m.is_active)
      .sort((a: RotationMember, b: RotationMember) => a.position - b.position);

    if (activeRotationMembers.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const dutyEntry = scheduleEntries.find(
        (e: ScheduleEntry) => e.date && e.date.slice(0, 10) === todayStr
      );
      const dutyUserId = dutyEntry?.user_id ?? null;
      const assignedUserIds = new Set(ncsRoles.map((r: NetRole) => r.user_id));
      const dutyIsSubstitute =
        dutyEntry?.user_id != null &&
        !activeRotationMembers.some((m: RotationMember) => m.user_id === dutyEntry.user_id);

      return (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            NCS Rotation ({activeRotationMembers.length} members)
          </Typography>

          {canEdit && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: isMobile ? 'column' : 'row' }}>
              <Autocomplete
                options={availableStaffUsers}
                getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                value={selectedUser}
                onChange={(_: any, value: User | null) => setSelectedUser(value)}
                noOptionsText={users.length === 0 ? 'Loading users…' : 'No other users available'}
                renderInput={(params: any) => (
                  <TextField {...params} label="Assign NCS Override" size="small" />
                )}
                sx={{ flex: 1 }}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddNetRole}
                disabled={!selectedUser}
              >
                Assign
              </Button>
            </Box>
          )}

          <List dense>
            {activeRotationMembers.map((member: RotationMember) => {
              const isOnDuty = member.user_id === dutyUserId;
              const isAssigned = assignedUserIds.has(member.user_id);
              const netRole = ncsRoles.find((r: NetRole) => r.user_id === member.user_id);
              return (
                <ListItem
                  key={member.user_id}
                  sx={{
                    py: 0.5, borderRadius: 1, mb: 0.5,
                    ...(isOnDuty && { bgcolor: 'success.light' }),
                  }}
                >
                  <Box
                    onClick={() => setProfileUserId(member.user_id)}
                    sx={{ cursor: 'pointer', display: 'inline-flex', mr: 1 }}
                  >
                    <UserAvatar
                      callsign={member.user_callsign}
                      name={member.user_name}
                      size={32}
                      hasProfile
                    />
                  </Box>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={isOnDuty ? { color: 'success.contrastText' } : {}}>
                          {member.user_callsign}
                          {member.user_name && ` (${member.user_name})`}
                        </Typography>
                        {isOnDuty && <Chip label="Today's NCS" size="small" color="success" />}
                        {isAssigned && !isOnDuty && <Chip label="Assigned" size="small" color="primary" variant="outlined" />}
                      </Box>
                    }
                  />
                  {canEdit && isAssigned && netRole && (
                    <ListItemSecondaryAction>
                      <IconButton size="small" color="error" onClick={() => handleRemoveNetRole(netRole.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}

            {/* Substitute NCS not in the regular rotation */}
            {dutyIsSubstitute && dutyEntry && (
              <ListItem sx={{ py: 0.5, borderRadius: 1, mb: 0.5, bgcolor: 'success.light' }}>
                <Box
                  onClick={() => dutyEntry.user_id && setProfileUserId(dutyEntry.user_id)}
                  sx={{ cursor: 'pointer', display: 'inline-flex', mr: 1 }}
                >
                  <UserAvatar
                    callsign={dutyEntry.user_callsign ?? undefined}
                    name={dutyEntry.user_name}
                    size={32}
                    hasProfile
                  />
                </Box>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ color: 'success.contrastText' }}>
                        {dutyEntry.user_callsign}
                        {dutyEntry.user_name && ` (${dutyEntry.user_name})`}
                      </Typography>
                      <Chip label="Today's NCS" size="small" color="success" />
                      <Chip label="Substitute" size="small" variant="outlined" />
                    </Box>
                  }
                />
              </ListItem>
            )}
          </List>
        </Box>
      );
    }

    // No rotation — show assigned NCS roles (or owner if none assigned)
    return (
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {ncsRoles.length > 0
            ? `Assigned Net Control Stations (${ncsRoles.length})`
            : 'Net Control Station'}
        </Typography>

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
            <ListItem sx={{ py: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Box
                onClick={() => net?.owner_id && setProfileUserId(net.owner_id)}
                sx={{ cursor: net?.owner_id ? 'pointer' : 'default', display: 'inline-flex', mr: 1 }}
              >
                <UserAvatar
                  callsign={net?.owner_callsign}
                  name={net?.owner_name}
                  size={32}
                  hasProfile={!!net?.owner_id}
                />
              </Box>
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
                <Box
                  onClick={() => setProfileUserId(role.user_id)}
                  sx={{ cursor: 'pointer', display: 'inline-flex', mr: 1 }}
                >
                  <UserAvatar
                    avatarUrl={role.avatar_url}
                    callsign={role.callsign}
                    name={role.name}
                    size={32}
                    hasProfile
                  />
                </Box>
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

export default NCSStaffRosterTab;
