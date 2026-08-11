import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Tooltip,
  Fab,
  Alert,
  TablePagination,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmailIcon from '@mui/icons-material/Email';
import TimerIcon from '@mui/icons-material/Timer';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ClearIcon from '@mui/icons-material/Clear';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import useSortableTable from '../../hooks/useSortableTable';
import api, { BACKGROUND_REQUEST_CONFIG } from '../../services/api';
import useVisibilityAwareInterval from '../../hooks/useVisibilityAwareInterval';
import { formatDateTime, formatDate } from '../../utils/dateUtils';
import { displayCallsign } from '../../utils/userDisplay';
import { getErrorMessage } from '../../utils/apiErrors';
import { useAuth } from '../../contexts/AuthContext';

interface AdminUser {
  id: number;
  email: string;
  name?: string;
  callsign?: string;
  role: string;
  is_active: boolean;
  last_active?: string;
  created_at: string;
  schedule_age_bypass: boolean;
  // Power-user indicators (Admin Tooling roadmap item) - see docs/USER-GUIDE.md
  is_ncs: boolean;
  notify_whats_new: boolean;
}

type UserSortField = 'online' | 'email' | 'name' | 'callsign' | 'role' | 'status' | 'last_active' | 'created_at' | 'is_ncs' | 'notify_whats_new';
type OnlineStatus = 'online' | 'away' | 'offline';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
  refreshTrigger?: number;
}

const AdminUsersTab: React.FC<Props> = ({ showSnackbar, refreshTrigger }) => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  // Drives the "updated Xs ago" caption so the admin can see the list is live.
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({ email: '', name: '', callsign: '', role: 'user' });
  const [addUserSaving, setAddUserSaving] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [usersPage, setUsersPage] = useState(0);
  const [usersPerPage, setUsersPerPage] = useState(25);
  const [scheduleMinAccountAgeDays, setScheduleMinAccountAgeDays] = useState(0);

  // Columns where "most interesting first" means descending on the first click
  // (has the badge / is active / most recent), unlike the text columns which
  // default to ascending (alphabetical).
  const DESC_DEFAULT_SORT_FIELDS: UserSortField[] = ['online', 'is_ncs', 'notify_whats_new', 'status', 'last_active', 'created_at'];

  const { sortField: userSortField, sortDirection: userSortDirection, handleSort: _handleUserSortBase } =
    useSortableTable<UserSortField>('online', (f) => DESC_DEFAULT_SORT_FIELDS.includes(f) ? 'desc' : 'asc');

  // `background` marks the auto-refresh below so it is not counted as operator
  // activity. Without it this poll would stamp last_active on the admin every
  // 30 s, re-breaking the very signal this table exists to report -- see
  // docs/DEVELOPMENT.md "Background polling and `last_active`".
  const fetchUsers = useCallback(async (background = false) => {
    try {
      const response = await api.get('/users', background ? BACKGROUND_REQUEST_CONFIG : undefined);
      setUsers(response.data);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    api.get('/settings').then((r) => {
      setScheduleMinAccountAgeDays(r.data.schedule_min_account_age_days ?? 7);
    }).catch(() => {});
  }, []);

  // Re-fetch when the parent signals that a new user was created (via invite from Contacts tab)
  useEffect(() => {
    if (refreshTrigger) fetchUsers();
  }, [refreshTrigger]);

  // Keep the online/away/offline column honest without the admin hitting F5.
  // Paused while the tab is hidden (useVisibilityAwareInterval), and refetches
  // immediately on becoming visible again, so returning to the tab shows
  // current data rather than whatever was true when it was last looked at.
  // 30 s is well inside the 5-minute "online" threshold this table renders.
  useVisibilityAwareInterval(
    useCallback(() => { fetchUsers(true); }, [fetchUsers]),
    30000,
    true,
  );

  // ========== ONLINE STATUS HELPERS ==========
  const getOnlineStatusScore = (user: AdminUser): number => {
    if (!user.last_active) return 0;
    const normalizedTimestamp = user.last_active.endsWith('Z') ? user.last_active : user.last_active + 'Z';
    const lastActive = new Date(normalizedTimestamp);
    const now = Date.now();
    const minutesAgo = (now - lastActive.getTime()) / (60 * 1000);

    if (minutesAgo < 5) return 3;
    if (minutesAgo < 15) return 2;
    return 1;
  };

  const getUserOnlineStatus = (user: AdminUser): OnlineStatus => {
    if (!user.last_active) return 'offline';
    const normalizedTimestamp = user.last_active.endsWith('Z') ? user.last_active : user.last_active + 'Z';
    const lastActive = new Date(normalizedTimestamp);
    const now = Date.now();
    const minutesAgo = (now - lastActive.getTime()) / (60 * 1000);

    if (minutesAgo < 5) return 'online';
    if (minutesAgo < 15) return 'away';
    return 'offline';
  };

  const isUserOnline = (user: AdminUser): boolean => getUserOnlineStatus(user) === 'online';

  const getStatusColor = (status: OnlineStatus): string => {
    switch (status) {
      case 'online': return 'success.main';
      case 'away': return 'warning.main';
      case 'offline': return 'error.main';
    }
  };

  const getStatusTooltip = (status: OnlineStatus): string => {
    switch (status) {
      case 'online': return 'Online now';
      case 'away': return 'Away (5-15 min)';
      case 'offline': return 'Offline (15+ min)';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'error';
      case 'ncs': return 'primary';
      case 'user': return 'default';
      case 'guest': return 'secondary';
      default: return 'default';
    }
  };

  // ========== USER FILTERING & SORTING ==========
  const filteredUsers = users.filter((user) => {
    if (!userFilter) return true;
    const searchTerm = userFilter.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchTerm) ||
      (user.name?.toLowerCase().includes(searchTerm)) ||
      (user.callsign?.toLowerCase().includes(searchTerm)) ||
      user.role.toLowerCase().includes(searchTerm)
    );
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aVal: string | number | boolean = '';
    let bVal: string | number | boolean = '';

    switch (userSortField) {
      case 'online': {
        const aScore = getOnlineStatusScore(a);
        const bScore = getOnlineStatusScore(b);
        if (aScore !== bScore) {
          return userSortDirection === 'desc'
            ? bScore - aScore
            : aScore - bScore;
        }
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      }
      case 'email':
        aVal = a.email;
        bVal = b.email;
        break;
      case 'name':
        aVal = a.name || '';
        bVal = b.name || '';
        break;
      case 'callsign':
        aVal = a.callsign || '';
        bVal = b.callsign || '';
        break;
      case 'role':
        aVal = a.role;
        bVal = b.role;
        break;
      case 'status':
        aVal = a.is_active ? 1 : 0;
        bVal = b.is_active ? 1 : 0;
        break;
      case 'is_ncs':
        aVal = a.is_ncs ? 1 : 0;
        bVal = b.is_ncs ? 1 : 0;
        break;
      case 'notify_whats_new':
        aVal = a.notify_whats_new ? 1 : 0;
        bVal = b.notify_whats_new ? 1 : 0;
        break;
      case 'last_active': {
        const aTime = a.last_active ? new Date(a.last_active.endsWith('Z') ? a.last_active : a.last_active + 'Z').getTime() : 0;
        const bTime = b.last_active ? new Date(b.last_active.endsWith('Z') ? b.last_active : b.last_active + 'Z').getTime() : 0;
        aVal = aTime;
        bVal = bTime;
        break;
      }
      case 'created_at':
        aVal = new Date(a.created_at.endsWith('Z') ? a.created_at : a.created_at + 'Z').getTime();
        bVal = new Date(b.created_at.endsWith('Z') ? b.created_at : b.created_at + 'Z').getTime();
        break;
    }

    if (userSortField === 'status' || userSortField === 'last_active' || userSortField === 'created_at' || userSortField === 'is_ncs' || userSortField === 'notify_whats_new') {
      return userSortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }

    const comparison = (aVal as string).localeCompare(bVal as string, undefined, { numeric: true, sensitivity: 'base' });
    return userSortDirection === 'asc' ? comparison : -comparison;
  });

  const handleUserSort = (field: UserSortField) => {
    _handleUserSortBase(field);
    setUsersPage(0);
  };

  const onlineUserCount = users.filter(isUserOnline).length;

  // ========== USER ACTION HANDLERS ==========
  const handleBanUser = async (userId: number) => {
    if (!confirm('Are you sure you want to ban this user?')) return;
    try {
      await api.put(`/users/${userId}/ban`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to ban user:', error);
      alert('Failed to ban user');
    }
  };

  const handleUnbanUser = async (userId: number) => {
    try {
      await api.put(`/users/${userId}/unban`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to unban user:', error);
      alert('Failed to unban user');
    }
  };

  const handleScheduleBypass = async (userId: number, grant: boolean) => {
    try {
      await api.put(`/users/${userId}/schedule-bypass?grant=${grant}`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update schedule bypass:', error);
      alert('Failed to update schedule bypass');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
      await api.delete(`/users/${userId}`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    }
  };

  const handleOpenRoleDialog = (user: AdminUser) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setRoleDialogOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    try {
      await api.put(`/users/${selectedUser.id}/role`, { role: newRole });
      setRoleDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('Failed to update role');
    }
  };

  const handleOpenAddUserDialog = () => {
    setAddUserForm({ email: '', name: '', callsign: '', role: 'user' });
    setAddUserDialogOpen(true);
  };

  const handleAddUser = async () => {
    if (!addUserForm.email) return;
    setAddUserSaving(true);
    try {
      await api.post('/users', {
        email: addUserForm.email,
        name: addUserForm.name || null,
        callsign: addUserForm.callsign || null,
        role: addUserForm.role,
      });
      setAddUserDialogOpen(false);
      showSnackbar('User created successfully. They can log in via magic link.', 'success');
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to create user:', error);
      const message = getErrorMessage(error, 'Failed to create user');
      showSnackbar(message, 'error');
    } finally {
      setAddUserSaving(false);
    }
  };

  const handleSendPlatformEmail = async () => {
    if (!emailForm.subject.trim() || !emailForm.message.trim()) {
      showSnackbar('Subject and message are required', 'error');
      return;
    }
    setEmailSending(true);
    try {
      const response = await api.post('/users/email-all', {
        subject: emailForm.subject,
        message: emailForm.message,
      });
      setEmailDialogOpen(false);
      setEmailForm({ subject: '', message: '' });
      showSnackbar(`Email sent to ${response.data.sent} users`, 'success');
    } catch (error: any) {
      console.error('Failed to send email:', error);
      const message = getErrorMessage(error, 'Failed to send email');
      showSnackbar(message, 'error');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <>
      {/* ========== USERS TAB ========== */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Manage user accounts, change roles, and ban/unban users.
      </Alert>

      {/* ========== USER FILTER INPUT ========== */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField
          size="small"
          placeholder="Filter by email, name, callsign, or role..."
          value={userFilter}
          onChange={(e) => { setUserFilter(e.target.value); setUsersPage(0); }}
          sx={{ flexGrow: 1, maxWidth: 500 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: userFilter && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => { setUserFilter(''); setUsersPage(0); }}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {filteredUsers.length} of {users.length} users
          {onlineUserCount > 0 && (
            <Chip
              size="small"
              label={`${onlineUserCount} online`}
              color="success"
              variant="outlined"
              sx={{ ml: 2 }}
            />
          )}
        </Typography>
        {/* Refresh state: the list updates itself every 30 s, so this exists to
            show that it is current rather than to invite clicking. The button
            is for when an admin wants an answer right now. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          {lastRefreshed && (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              Updated {lastRefreshed.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh now">
            <IconButton size="small" onClick={() => fetchUsers()} aria-label="Refresh user list">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <TableContainer>
        {/* Tighter horizontal padding on non-checkbox cells so this wide table (Name
            through Actions) fits more comfortably in view without shrinking the already-
            compact checkbox-padding columns (online dot, NCS, subscriber). */}
        <Table size="small" sx={{ '& .MuiTableCell-root:not(.MuiTableCell-paddingCheckbox)': { px: 1 } }}>
          <TableHead>
            <TableRow>
              {/* Online status indicator column - sortable */}
              <TableCell padding="checkbox" sx={{ width: 24 }} sortDirection={userSortField === 'online' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'online'}
                  direction={userSortField === 'online' ? userSortDirection : 'desc'}
                  onClick={() => handleUserSort('online')}
                  title="Sort by online status"
                >
                  {/* Empty label - just the sort arrow */}
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'name' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'name'}
                  direction={userSortField === 'name' ? userSortDirection : 'asc'}
                  onClick={() => handleUserSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'callsign' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'callsign'}
                  direction={userSortField === 'callsign' ? userSortDirection : 'asc'}
                  onClick={() => handleUserSort('callsign')}
                >
                  Callsign
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'email' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'email'}
                  direction={userSortField === 'email' ? userSortDirection : 'asc'}
                  onClick={() => handleUserSort('email')}
                >
                  Email
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'role' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'role'}
                  direction={userSortField === 'role' ? userSortDirection : 'asc'}
                  onClick={() => handleUserSort('role')}
                >
                  Role
                </TableSortLabel>
              </TableCell>
              {/* Power-user indicator columns - icon-only headers, sortable, matching the
                  compact "online" status column pattern above so the already-wide table
                  (see commit d552c2b) doesn't grow further than necessary. */}
              <TableCell padding="checkbox" sx={{ width: 32 }} sortDirection={userSortField === 'is_ncs' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'is_ncs'}
                  direction={userSortField === 'is_ncs' ? userSortDirection : 'desc'}
                  onClick={() => handleUserSort('is_ncs')}
                  title="Sort by NCS history"
                >
                  <WorkspacePremiumIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </TableSortLabel>
              </TableCell>
              <TableCell padding="checkbox" sx={{ width: 32 }} sortDirection={userSortField === 'notify_whats_new' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'notify_whats_new'}
                  direction={userSortField === 'notify_whats_new' ? userSortDirection : 'desc'}
                  onClick={() => handleUserSort('notify_whats_new')}
                  title="Sort by What's New subscription"
                >
                  <NewReleasesIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'status' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'status'}
                  direction={userSortField === 'status' ? userSortDirection : 'desc'}
                  onClick={() => handleUserSort('status')}
                >
                  Status
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'last_active' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'last_active'}
                  direction={userSortField === 'last_active' ? userSortDirection : 'desc'}
                  onClick={() => handleUserSort('last_active')}
                >
                  Last Active
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={userSortField === 'created_at' ? userSortDirection : false}>
                <TableSortLabel
                  active={userSortField === 'created_at'}
                  direction={userSortField === 'created_at' ? userSortDirection : 'desc'}
                  onClick={() => handleUserSort('created_at')}
                >
                  Created
                </TableSortLabel>
              </TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(usersPerPage === -1 ? sortedUsers : sortedUsers.slice(usersPage * usersPerPage, (usersPage + 1) * usersPerPage)).map((user) => {
              const onlineStatus = getUserOnlineStatus(user);
              return (
                <TableRow key={user.id}>
                  {/* Online status indicator - three-tier: green/yellow/red */}
                  <TableCell padding="checkbox">
                    {user.last_active && (
                      <Tooltip title={getStatusTooltip(onlineStatus)}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: getStatusColor(onlineStatus),
                            mx: 'auto',
                          }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  {/* Reordered columns: Name, Callsign, Email */}
                  <TableCell>{user.name || '-'}</TableCell>
                  <TableCell>{user.callsign || '-'}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.role.toUpperCase()}
                      color={getRoleColor(user.role) as any}
                      size="small"
                    />
                  </TableCell>
                  {/* Power-user indicator cells - icon-only, blank when not applicable so
                      the column stays quiet for the common case (see the age-bypass
                      TimerIcon column below for the same "blank unless relevant" idiom) */}
                  <TableCell padding="checkbox">
                    {user.is_ncs && (
                      <Tooltip title="Has held NCS on a net">
                        <WorkspacePremiumIcon fontSize="small" sx={{ color: '#ed6c02', display: 'block', mx: 'auto' }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell padding="checkbox">
                    {user.notify_whats_new && (
                      <Tooltip title="Subscribed to What's New emails">
                        <NewReleasesIcon fontSize="small" color="primary" sx={{ display: 'block', mx: 'auto' }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.is_active ? 'Active' : 'Banned'}
                      color={user.is_active ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  {/* Last Active - show date only, full datetime on hover */}
                  <TableCell>
                    {user.last_active ? (
                      <Tooltip title={formatDateTime(user.last_active, currentUser?.prefer_utc || false)}>
                        <span>{formatDate(user.last_active, currentUser?.prefer_utc || false)}</span>
                      </Tooltip>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  {/* Created - show date only, full datetime on hover */}
                  <TableCell>
                    <Tooltip title={formatDateTime(user.created_at, currentUser?.prefer_utc || false)}>
                      <span>{formatDate(user.created_at, currentUser?.prefer_utc || false)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton
                      size="small"
                      onClick={() => handleOpenRoleDialog(user)}
                      title="Change Role"
                      disabled={user.id === currentUser?.id}
                    >
                      <EditIcon />
                    </IconButton>
                    {user.is_active ? (
                      <IconButton
                        size="small"
                        onClick={() => handleBanUser(user.id)}
                        color="warning"
                        title="Ban User"
                        disabled={user.id === currentUser?.id}
                      >
                        <BlockIcon />
                      </IconButton>
                    ) : (
                      <IconButton
                        size="small"
                        onClick={() => handleUnbanUser(user.id)}
                        color="success"
                        title="Unban User"
                      >
                        <CheckCircleIcon />
                      </IconButton>
                    )}
                    {scheduleMinAccountAgeDays > 0 && (() => {
                      const accountAgeDays = Math.floor(
                        (Date.now() - new Date(user.created_at.endsWith('Z') ? user.created_at : user.created_at + 'Z').getTime())
                        / (1000 * 60 * 60 * 24)
                      );
                      const minAge = scheduleMinAccountAgeDays;
                      const underAge = accountAgeDays < minAge;
                      if (!underAge) {
                        return (
                          <Tooltip title={`Age requirement met (${accountAgeDays} day${accountAgeDays !== 1 ? 's' : ''} old)`}>
                            <span>
                              <IconButton size="small" disabled>
                                <TimerIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        );
                      }
                      if (user.schedule_age_bypass) {
                        return (
                          <Tooltip title="Early access granted — bypasses account age and net participation requirements (click to revoke)">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleScheduleBypass(user.id, false)}
                            >
                              <TimerIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        );
                      }
                      return (
                        <Tooltip title={`Account is ${accountAgeDays} of ${minAge} day${minAge !== 1 ? 's' : ''} old — click to grant early access (bypasses age and net participation requirements)`}>
                          <IconButton
                            size="small"
                            onClick={() => handleScheduleBypass(user.id, true)}
                            sx={{ color: 'warning.main' }}
                          >
                            <TimerIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      );
                    })()}
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteUser(user.id)}
                      color="error"
                      title="Delete User"
                      disabled={user.id === currentUser?.id}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={filteredUsers.length}
        page={usersPage}
        onPageChange={(_, newPage) => setUsersPage(newPage)}
        rowsPerPage={usersPerPage}
        onRowsPerPageChange={(e) => { setUsersPerPage(parseInt(e.target.value, 10)); setUsersPage(0); }}
        rowsPerPageOptions={[25, 50, { label: 'All', value: -1 }]}
        labelRowsPerPage="Per page:"
      />

      {/* FABs */}
      <Tooltip title="Email all users">
        <Fab
          color="secondary"
          aria-label="email users"
          sx={{ position: 'fixed', bottom: 16, right: 80 }}
          onClick={() => setEmailDialogOpen(true)}
        >
          <EmailIcon />
        </Fab>
      </Tooltip>
      <Tooltip title="Add user">
        <Fab
          color="primary"
          aria-label="add user"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={handleOpenAddUserDialog}
        >
          <PersonAddIcon />
        </Fab>
      </Tooltip>

      {/* Role Change Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)}>
        <DialogTitle>Change User Role</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, minWidth: 300 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Changing role for: {displayCallsign(selectedUser)}
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={newRole}
                label="Role"
                onChange={(e) => setNewRole(e.target.value)}
              >
                <MenuItem value="guest">Guest</MenuItem>
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="ncs">NCS</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateRole} variant="contained">
            Update Role
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onClose={() => setAddUserDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              value={addUserForm.email}
              onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
              required
              fullWidth
              helperText="User will log in via magic link sent to this email"
            />
            <TextField
              label="Name"
              value={addUserForm.name}
              onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })}
              fullWidth
              helperText="Optional - user can set this in their profile"
            />
            <TextField
              label="Callsign"
              value={addUserForm.callsign}
              onChange={(e) => setAddUserForm({ ...addUserForm, callsign: e.target.value.toUpperCase() })}
              fullWidth
              inputProps={{ style: { textTransform: 'uppercase' } }}
              helperText="Optional - user can set this in their profile"
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={addUserForm.role}
                label="Role"
                onChange={(e) => setAddUserForm({ ...addUserForm, role: e.target.value })}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
              <FormHelperText>User's permission level</FormHelperText>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddUserDialogOpen(false)} disabled={addUserSaving}>Cancel</Button>
          <Button
            onClick={handleAddUser}
            variant="contained"
            disabled={!addUserForm.email || addUserSaving}
          >
            {addUserSaving ? <CircularProgress size={24} /> : 'Add User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== EMAIL USERS DIALOG ========== */}
      <Dialog open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Platform Notice</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Subject"
              value={emailForm.subject}
              onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Message"
              value={emailForm.message}
              onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && e.ctrlKey && emailForm.subject && emailForm.message && !emailSending) {
                  e.preventDefault();
                  handleSendPlatformEmail();
                }
              }}
              required
              multiline
              rows={6}
              fullWidth
              helperText="Ctrl+Enter to send. This message will be sent to all users who have email notifications enabled."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSendPlatformEmail}
            variant="contained"
            disabled={!emailForm.subject || !emailForm.message || emailSending}
          >
            {emailSending ? <CircularProgress size={24} /> : 'Send to All Users'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AdminUsersTab;
