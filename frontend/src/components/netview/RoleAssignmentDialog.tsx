import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UserAvatar from '../UserAvatar';
import { displayCallsign } from '../../utils/userDisplay';
import type { UseDialogResult } from '../../hooks/useDialog';

// ========== ROLE ASSIGNMENT DIALOG ==========
// "Manage Net Control Staff" modal: assign NCS/Logger/Relay roles and list
// current assignments. Purely presentational — the parent owns the form state,
// assign/remove actions (which hit the API and refresh), and profile popup.

interface RoleAssignmentDialogProps {
  dialog: UseDialogResult;
  allUsers: any[];
  netRoles: any[];
  onlineUserIds: number[];
  selectedUserId: number | '';
  setSelectedUserId: (v: number | '') => void;
  selectedRole: string;
  setSelectedRole: (v: string) => void;
  onAssignRole: () => void;
  onRemoveRole: (roleId: number) => void;
  onShowProfile: (userId: number) => void;
}

const RoleAssignmentDialog: React.FC<RoleAssignmentDialogProps> = ({
  dialog,
  allUsers,
  netRoles,
  onlineUserIds,
  selectedUserId,
  setSelectedUserId,
  selectedRole,
  setSelectedRole,
  onAssignRole,
  onRemoveRole,
  onShowProfile,
}) => {
  return (
    <Dialog open={dialog.open} onClose={dialog.onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Manage Net Control Staff</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Assign NCS (Net Control Station) or Logger roles. You can assign multiple people as NCS — any of them can start or manage the net, providing backup if the primary NCS is unavailable.
          </Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select User</InputLabel>
            <Select
              value={selectedUserId}
              label="Select User"
              onChange={(e) => setSelectedUserId(e.target.value as number)}
            >
              <MenuItem value="">
                <em>Choose a user...</em>
              </MenuItem>
              {allUsers.map((u: any) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.callsign}{u.name ? ` (${u.name})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Role</InputLabel>
            <Select
              value={selectedRole}
              label="Role"
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <MenuItem value="NCS">NCS (Net Control Station)</MenuItem>
              <MenuItem value="LOGGER">Logger</MenuItem>
              <MenuItem value="RELAY">Relay Station</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="contained"
            onClick={onAssignRole}
            disabled={!selectedUserId}
            fullWidth
          >
            Assign Role
          </Button>

          {netRoles.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Current Assignments:
              </Typography>
              <List>
                {netRoles.map((role) => (
                  <ListItem
                    key={role.id}
                    secondaryAction={
                      <IconButton edge="end" onClick={() => onRemoveRole(role.id)}>
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemAvatar>
                      <Box
                        onClick={() => onShowProfile(role.user_id)}
                        sx={{ cursor: 'pointer', display: 'inline-flex' }}
                      >
                        <UserAvatar
                          avatarUrl={role.avatar_url}
                          callsign={role.callsign}
                          name={role.name}
                          size={36}
                          hasProfile
                          isOnline={onlineUserIds.includes(role.user_id)}
                        />
                      </Box>
                    </ListItemAvatar>
                    <ListItemText
                      primary={displayCallsign(role) || role.email}
                      secondary={`${role.role} • ${new Date(role.assigned_at).toLocaleDateString()}`}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={dialog.onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RoleAssignmentDialog;
