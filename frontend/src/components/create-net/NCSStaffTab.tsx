import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Autocomplete,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import api, { callsignRoleApi, templateStaffApi } from '../../services/api';
import { SchedulePerson, toPerson, uniquePeople } from '../../utils/staffPeople';
import { ScheduleStaffButton } from '../NCSStaffModal';
import { useCreateNetContext, NetUser } from '../../contexts/CreateNetContext';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== TAB 1: NET STAFF ==========
// Manages NCS role assignments.
// Create mode: builds a pendingNCSUsers list that is submitted with the form.
// Edit mode: issues API calls immediately (roles are persisted per-change).
// Edit mode on a net created from a schedule: read-only. Who runs it comes
// from the schedule (staff, rotation, swaps), managed in the schedule's
// Staff dialog, which opens on top of this page (ScheduleStaffButton).

interface ExistingNCSRole {
  id: number;  // negative for a callsign-only credit (no account)
  user_id: number | null;
  callsign: string;
  name: string | null;
}

const NCSStaffTab: React.FC = () => {
  const {
    users,
    pendingNCSUsers, setPendingNCSUsers,
    currentUser,
    netId,
    isEditMode,
    templateId,
  } = useCreateNetContext();
  const scheduleManaged = isEditMode && !!templateId;

  // Edit-mode: roles loaded from API and managed per-change
  const [existingNCSRoles, setExistingNCSRoles] = useState<ExistingNCSRole[]>([]);
  const [selectedUser, setSelectedUser] = useState<NetUser | null>(null);
  const [ncsError, setNcsError] = useState<string | null>(null);
  // Edit mode: the net's own manager, not whoever is editing (an admin or a
  // staff member can open Edit Net too).
  const [netOwner, setNetOwner] = useState<{ callsign?: string; name?: string | null } | null>(null);

  // Net from a schedule: the schedule's active staff, who can start this net
  // and take NCS or Logger by checking in (permissions.is_active_template_staff).
  // Listed read-only so the tab doesn't look as if nobody is attached; until
  // 2026-10-22 it showed only NCS roles, and a schedule's staff hold none
  // until the night (net 137).
  const [scheduleStaff, setScheduleStaff] = useState<SchedulePerson[]>([]);
  const fetchScheduleStaff = async () => {
    if (!templateId) return;
    try {
      const { data } = await templateStaffApi.list(templateId);
      setScheduleStaff(uniquePeople((data || []).filter((s: any) => s.is_active).map(toPerson)));
    } catch {
      // non-fatal; the schedule's Staff dialog still shows them
    }
  };
  useEffect(() => {
    if (scheduleManaged) fetchScheduleStaff();
  }, [scheduleManaged, templateId]);

  // Load existing NCS roles in edit mode
  useEffect(() => {
    if (!isEditMode || !netId) return;
    fetchNetRoles();
  }, [isEditMode, netId]);

  const fetchNetRoles = async () => {
    if (!netId) return;
    try {
      const netRes = await api.get(`/nets/${netId}`);
      setNetOwner({ callsign: netRes.data.owner_callsign, name: netRes.data.owner_name });
    } catch {
      // non-fatal; falls back to the current user below
    }
    try {
      const response = await api.get(`/nets/${netId}/roles`);
      const ncsRoles = response.data
        .filter((r: any) => r.role === 'NCS' || r.role === 'ncs')
        .map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          callsign: r.callsign,
          name: r.name,
        }));
      // Operators with no account are credited by callsign (a rotation or
      // swap pick); shown alongside, never editable here.
      const callsignRes = await callsignRoleApi.list(Number(netId));
      const callsignNcs = (callsignRes.data || [])
        .filter((r: any) => r.role === 'NCS')
        .map((r: any) => ({ id: -r.id, user_id: null, callsign: r.callsign, name: null }));
      setExistingNCSRoles([...ncsRoles, ...callsignNcs]);
    } catch {
      // silently ignore — non-fatal; table shows empty
    }
  };

  const handleAddPendingNCS = () => {
    if (!selectedUser) return;
    if (pendingNCSUsers.some(u => u.id === selectedUser.id)) return;
    setPendingNCSUsers([...pendingNCSUsers, selectedUser]);
    setSelectedUser(null);
  };

  const handleRemovePendingNCS = (userId: number) => {
    setPendingNCSUsers(pendingNCSUsers.filter(u => u.id !== userId));
  };

  const handleAddExistingNCS = async () => {
    if (!selectedUser || !netId) return;
    setNcsError(null);
    try {
      await api.post(`/nets/${netId}/roles?user_id=${selectedUser.id}&role=NCS`);
      await fetchNetRoles();
      setSelectedUser(null);
    } catch (error: any) {
      setNcsError(getErrorMessage(error, 'Failed to add NCS'));
    }
  };

  const handleRemoveExistingNCS = async (roleId: number) => {
    if (!netId) return;
    setNcsError(null);
    try {
      await api.delete(`/nets/${netId}/roles/${roleId}`);
      await fetchNetRoles();
    } catch (error: any) {
      setNcsError(getErrorMessage(error, 'Failed to remove NCS'));
    }
  };

  // Filter out already-assigned users from the autocomplete options
  const availableUsers = users.filter(u => {
    if (pendingNCSUsers.some(p => p.id === u.id)) return false;
    if (existingNCSRoles.some(r => r.user_id === u.id)) return false;
    return true;
  });

  const user = isEditMode && netOwner ? netOwner : currentUser;

  return (
    <>
      <Typography variant="h6" gutterBottom>Net Staff</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {scheduleManaged
          ? "Who runs this net comes from its schedule. To change it, open the schedule's staff; a swap on the schedule's Schedule tab changes who runs this night."
          : isEditMode
          ? 'Assign additional Net Control Stations who can manage check-ins and control this net.'
          : 'Pre-assign Net Control Stations who will be able to manage check-ins and control this net. You (as the manager) always have full access.'
        }
      </Typography>

      {ncsError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setNcsError(null)}>
          {ncsError}
        </Alert>
      )}

      {/* Current manager always has full access */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Net Manager (always has full access)
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <PersonIcon color="primary" />
          <Typography>
            {user?.callsign || 'You'}
            {user?.name && ` (${user.name})`}
          </Typography>
          <Chip label="Manager" size="small" color="primary" />
        </Box>
      </Box>

      {/* Net from a schedule: its staff, read-only */}
      {scheduleManaged && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Schedule staff (can start this net and take NCS or Logger by checking in)
          </Typography>
          {scheduleStaff.length === 0 ? (
            <Typography color="text.secondary" variant="body2">The schedule has no staff.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {scheduleStaff.map((person) => (
                <Chip
                  key={person.key}
                  icon={<PersonIcon />}
                  label={person.name ? `${person.callsign} (${person.name})` : person.callsign}
                  variant="outlined"
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Net from a schedule: open its Staff dialog instead of editing here */}
      {scheduleManaged && (
        <Box sx={{ mb: 2 }}>
          <ScheduleStaffButton templateId={templateId!} onClosed={() => { fetchNetRoles(); fetchScheduleStaff(); }} />
        </Box>
      )}

      {/* Net from a schedule: who holds NCS on this net right now */}
      {scheduleManaged && (
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Net Control for this net
        </Typography>
      )}

      {/* Add NCS autocomplete (ad hoc nets, and new nets) */}
      {!scheduleManaged && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Autocomplete
            options={availableUsers}
            getOptionLabel={(option) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
            value={selectedUser}
            onChange={(_, value) => setSelectedUser(value)}
            renderInput={(params) => (
              <TextField {...params} label="Add Net Control Station" size="small" />
            )}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={isEditMode ? handleAddExistingNCS : handleAddPendingNCS}
            disabled={!selectedUser}
          >
            Add
          </Button>
        </Box>
      )}

      {/* NCS list */}
      {isEditMode ? (
        existingNCSRoles.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            {scheduleManaged ? 'Nobody is assigned as NCS for this net yet.' : 'No additional NCS assigned yet.'}
          </Typography>
        ) : (
          <List>
            {existingNCSRoles.map((role) => (
              <ListItem
                key={role.id}
                sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, mb: 0.5 }}
              >
                <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                <ListItemText
                  primary={
                    <Typography>
                      {role.callsign}{role.name && ` (${role.name})`}
                    </Typography>
                  }
                />
                {!scheduleManaged && role.id > 0 && (
                  <ListItemSecondaryAction>
                    <IconButton size="small" color="error" onClick={() => handleRemoveExistingNCS(role.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>
        )
      ) : (
        pendingNCSUsers.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No additional NCS assigned yet. The manager will serve as NCS by default.
          </Typography>
        ) : (
          <List>
            {pendingNCSUsers.map((ncsUser) => (
              <ListItem
                key={ncsUser.id}
                sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, mb: 0.5 }}
              >
                <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                <ListItemText
                  primary={
                    <Typography>
                      {ncsUser.callsign}{ncsUser.name && ` (${ncsUser.name})`}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton size="small" color="error" onClick={() => handleRemovePendingNCS(ncsUser.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )
      )}
    </>
  );
};

export default NCSStaffTab;
