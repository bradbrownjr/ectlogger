import React, { useState, useEffect, useRef } from 'react';
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
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UndoIcon from '@mui/icons-material/Undo';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import BlockIcon from '@mui/icons-material/Block';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EmailIcon from '@mui/icons-material/Email';
import { ncsRotationApi, userApi, templateStaffApi, templateApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';
import UserProfileDialog from './UserProfileDialog';

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
    // ID of the parent schedule (NetTemplate) this net was created from.
    // When present, the modal exposes a "Push staff to schedule" action so
    // changes made on the net can be promoted into the schedule's staff pool.
    template_id?: number | null;
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

interface TemplateSubscriber {
  id: number;
  user_id: number;
  user_email: string | null;
  user_name: string | null;
  user_callsign: string | null;
  subscribed_at: string;
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
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  // ========== PUSH-STAFF-TO-SCHEDULE STATE ==========
  // When viewing a net created from a schedule (template), the modal exposes
  // a one-shot button that copies the net's NCS NetRole users into the
  // schedule's TemplateStaff pool (skipping anyone already on it). This lets
  // ad-hoc NCS additions made for a single net be promoted to the schedule
  // so future nets opened from the schedule see them too.
  const [pushingStaff, setPushingStaff] = useState(false);
  const [pushStaffResult, setPushStaffResult] = useState<{ severity: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragItemIdx = useRef<number | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [subscribers, setSubscribers] = useState<TemplateSubscriber[]>([]);
  const [templateSummary, setTemplateSummary] = useState<TemplateSummary | null>(null);
  const [fifthWeekSaving, setFifthWeekSaving] = useState(false);

  // Email dialog state (staff/subscribers/all)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailRecipientGroup, setEmailRecipientGroup] = useState<'staff' | 'subscribers' | 'all'>('staff');
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const [emailSending, setEmailSending] = useState(false);

  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Determine context - are we looking at a schedule/template or a net?
  const isScheduleContext = !!schedule && !net;
  const isNetContext = !!net;
  const templateId = isScheduleContext ? schedule?.id : (net?.template_id || null);
  
  // Permissions
  // The schedule "owner" is the Net Manager (ham-radio term) — the person
  // ultimately responsible for the schedule. Owner / admin / active staff /
  // active rotation members can all manage the staff list. This must stay in
  // sync with the backend `check_template_permission` helpers in
  // routers/templates.py and routers/ncs_rotation.py.
  const isOwner = isScheduleContext
    ? user?.id === schedule?.owner_id
    : user?.id === net?.owner_id;
  const normalizedRole = (user?.role || '').toLowerCase();
  const isAdmin = normalizedRole === 'admin';
  // Can't manage staff for closed nets
  const isNetClosed = isNetContext && net?.status === 'closed';
  // Co-managers (staff with is_co_manager flag) also get edit access
  const isCoManager = isScheduleContext
    ? staff.some((s: StaffMember) => s.user_id === user?.id && s.is_co_manager && s.is_active)
    : false;

  const isTemplateCoManagerInNetContext = isNetContext
    ? staff.some((s: StaffMember) => s.user_id === user?.id && s.is_co_manager && s.is_active)
    : false;

  // Check if user is in the rotation (for schedules)
  // Owners, admins, and co-managers can edit staff/rotation.
  const canEdit = isAuthenticated && (isOwner || isAdmin || isCoManager) && !isNetClosed;
  const canCommunicate = isAuthenticated && (isOwner || isAdmin || isCoManager || isTemplateCoManagerInNetContext);
  const canViewSubscribers = canCommunicate;

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
      setPushStaffResult(null);
      setActiveTab(0);
      setSubscribers([]);
      setTemplateSummary(null);
      setEmailDialogOpen(false);
      setEmailForm({ subject: '', message: '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleId, netId]);

  const visibleTabs: Array<{ key: 'ncs' | 'rotation' | 'schedule' | 'subscribers'; label: string }> = canCommunicate
    ? [
        { key: 'ncs', label: 'Net Control Stations' },
        { key: 'rotation', label: 'Rotation Order' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'subscribers', label: 'Subscribers' },
      ]
    : [
        { key: 'ncs', label: 'Net Control Stations' },
        { key: 'schedule', label: 'Schedule' },
      ];

  useEffect(() => {
    if (activeTab >= visibleTabs.length) {
      setActiveTab(0);
    }
  }, [activeTab, visibleTabs.length]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (isScheduleContext && schedule) {
        // Fetch template staff and rotation data separately
        const [tplRes, staffRes, membersRes, scheduleRes] = await Promise.all([
          templateApi.get(schedule.id),
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

        setTemplateSummary({
          id: tplRes.data.id,
          name: tplRes.data.name,
          schedule_type: tplRes.data.schedule_type,
          schedule_config: tplRes.data.schedule_config,
          fifth_week_user_id: tplRes.data.fifth_week_user_id ?? null,
          fifth_week_user_callsign: tplRes.data.fifth_week_user_callsign ?? null,
          fifth_week_user_name: tplRes.data.fifth_week_user_name ?? null,
        });

        if (canViewSubscribers) {
          const subscribersRes = await templateApi.listSubscriptions(schedule.id);
          setSubscribers(subscribersRes.data || []);
        } else {
          setSubscribers([]);
        }
      } else if (isNetContext && net) {
        // Fetch net roles
        const rolesRes = await api.get(`/nets/${net.id}/roles`);
        setNetRoles(rolesRes.data || []);

        // For nets linked to schedules, also load schedule-level views
        // (staff/rotation/schedule/subscribers) for tabbed modal sections.
        if (net.template_id) {
          const [tplRes, tplStaffRes, membersRes, scheduleRes] = await Promise.all([
            templateApi.get(net.template_id),
            templateStaffApi.list(net.template_id),
            ncsRotationApi.listMembers(net.template_id),
            ncsRotationApi.getSchedule(net.template_id, 12),
          ]);

          setTemplateSummary({
            id: tplRes.data.id,
            name: tplRes.data.name,
            schedule_type: tplRes.data.schedule_type,
            schedule_config: tplRes.data.schedule_config,
            fifth_week_user_id: tplRes.data.fifth_week_user_id ?? null,
            fifth_week_user_callsign: tplRes.data.fifth_week_user_callsign ?? null,
            fifth_week_user_name: tplRes.data.fifth_week_user_name ?? null,
          });
          setStaff(tplStaffRes.data || []);
          setMembers(membersRes.data || []);
          setScheduleEntries(scheduleRes.data.schedule || []);

          if (canViewSubscribers) {
            const subscribersRes = await templateApi.listSubscriptions(net.template_id);
            setSubscribers(subscribersRes.data || []);
          } else {
            setSubscribers([]);
          }
        } else {
          setTemplateSummary(null);
          setStaff([]);
          setMembers([]);
          setScheduleEntries([]);
          setSubscribers([]);
        }
        
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

  const handleOpenEmailDialog = () => {
    setEmailRecipientGroup('staff');
    setEmailForm({ subject: '', message: '' });
    setEmailDialogOpen(true);
  };

  const handleSendEmail = async () => {
    const targetId = isNetContext ? net?.id : (isScheduleContext ? schedule?.id : null);
    if (!targetId || !emailForm.subject.trim() || !emailForm.message.trim()) return;

    setEmailSending(true);
    try {
      const url = isNetContext
        ? `/nets/${targetId}/email-subscribers`
        : `/templates/${targetId}/email-subscribers`;

      const response = await api.post(url, {
        recipient_group: emailRecipientGroup,
        subject: emailForm.subject,
        message: emailForm.message,
      });

      setPushStaffResult({
        severity: 'success',
        message: `Email sent to ${response.data.sent} recipient(s) (${response.data.failed} failed).`,
      });
      setEmailDialogOpen(false);
    } catch (err: any) {
      setPushStaffResult({
        severity: 'error',
        message: getErrorMessage(err, 'Failed to send email'),
      });
    } finally {
      setEmailSending(false);
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
      // Refetch staff + users so the "Add Staff" dropdown reflects the new
      // owner immediately — without this the stale staff list would exclude
      // or incorrectly filter the previous owner after a manager transfer.
      await fetchData();
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

  const handleToggleCoManager = async (staffMember: StaffMember) => {
    if (!schedule) return;
    try {
      await templateStaffApi.updateCoManager(schedule.id, staffMember.id, !staffMember.is_co_manager);
      setStaff(prev => prev.map(s =>
        s.id === staffMember.id ? { ...s, is_co_manager: !s.is_co_manager } : s
      ));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update co-manager status'));
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
    
    const userIdsToAdd = new Set<number>(
      staff
        .filter((s: StaffMember) => s.is_active)
        .map((s: StaffMember) => s.user_id)
    );
    if (schedule.owner_id) {
      userIdsToAdd.add(schedule.owner_id);
    }

    const missingUserIds = Array.from(userIdsToAdd).filter(
      (userId) => !members.some((m: RotationMember) => m.user_id === userId)
    );

    if (missingUserIds.length === 0) {
      setError('All active staff and the manager are already in the rotation');
      return;
    }
    
    try {
      for (const userId of missingUserIds) {
        await ncsRotationApi.addMember(schedule.id, { user_id: userId });
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

    // Optimistic update — swap immediately so the UI doesn't flash
    const newMembers = [...members];
    [newMembers[currentIndex], newMembers[newIndex]] = [newMembers[newIndex], newMembers[currentIndex]];
    const memberIds = newMembers.map(m => m.id);
    setMembers(newMembers);

    try {
      await ncsRotationApi.reorderMembers(schedule.id, memberIds);
    } catch (err: any) {
      setReorderError(getErrorMessage(err, 'Failed to sync rotation order — please try again.'));
      await fetchData(); // revert on error
    }
  };

  const handleDragReorder = async (fromIdx: number, toIdx: number) => {
    if (!schedule || fromIdx === toIdx) return;

    // Optimistic update — reorder immediately so the UI doesn't flash
    const newMembers = [...members];
    const [moved] = newMembers.splice(fromIdx, 1);
    newMembers.splice(toIdx, 0, moved);
    const memberIds = newMembers.map(m => m.id);
    setMembers(newMembers);

    try {
      await ncsRotationApi.reorderMembers(schedule.id, memberIds);
    } catch (err: any) {
      setReorderError(getErrorMessage(err, 'Failed to sync rotation order — please try again.'));
      await fetchData(); // revert on error
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

  // Push the net's NCS roster into the parent schedule's TemplateStaff pool.
  // Idempotent: anyone already on the schedule's staff list is skipped, so
  // clicking twice is harmless. Backend enforces edit permission on the
  // schedule (owner / admin / active staff / rotation member).
  const handlePushStaffToSchedule = async () => {
    if (!net?.template_id) return;
    setPushStaffResult(null);
    setPushingStaff(true);
    try {
      // Snapshot the schedule's current staff to avoid duplicate adds.
      const existingRes = await templateStaffApi.list(net.template_id);
      const existingUserIds = new Set<number>(existingRes.data.map((s: StaffMember) => s.user_id));
      const ncsUsers = netRoles.filter((r: NetRole) => r.role === 'NCS');
      const toAdd = ncsUsers.filter((r: NetRole) => !existingUserIds.has(r.user_id));

      if (ncsUsers.length === 0) {
        setPushStaffResult({ severity: 'info', message: 'This net has no NCS operators to push to the schedule.' });
        return;
      }
      if (toAdd.length === 0) {
        setPushStaffResult({ severity: 'info', message: 'All NCS operators on this net are already on the schedule\u2019s staff list.' });
        return;
      }

      let added = 0;
      const failures: string[] = [];
      for (const role of toAdd) {
        try {
          await templateStaffApi.add(net.template_id, { user_id: role.user_id });
          added += 1;
        } catch (err: any) {
          // Permission failure on the very first add is the common case
          // (backend rejects all subsequent adds the same way), so bail
          // early with a clean message rather than spamming N errors.
          if (err?.response?.status === 403) {
            const detail = err?.response?.data?.detail;
            setPushStaffResult({
              severity: 'error',
              message: typeof detail === 'string'
                ? detail
                : "You don\u2019t have permission to edit this schedule\u2019s staff.",
            });
            return;
          }
          failures.push(role.callsign);
        }
      }

      if (failures.length > 0) {
        setPushStaffResult({
          severity: 'error',
          message: `Added ${added} operator(s). Failed to add: ${failures.join(', ')}.`,
        });
      } else {
        setPushStaffResult({
          severity: 'success',
          message: `Added ${added} NCS operator(s) to the schedule\u2019s staff list.`,
        });
      }
      onUpdate?.();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setPushStaffResult({
          severity: 'error',
          message: typeof detail === 'string' ? detail : "You don\u2019t have permission to edit this schedule\u2019s staff.",
        });
      } else {
        setPushStaffResult({
          severity: 'error',
          message: typeof detail === 'string' ? detail : 'Failed to push staff to the schedule.',
        });
      }
    } finally {
      setPushingStaff(false);
    }
  };

  // Filter out users already assigned (staff, not rotation) AND the owner
  const ownerId = isScheduleContext ? schedule?.owner_id : net?.owner_id;
  const availableStaffUsers = isScheduleContext
    ? users.filter((u: User) => u.id !== ownerId && !staff.some((s: StaffMember) => s.user_id === u.id))
    : users.filter((u: User) => u.id !== ownerId && !netRoles.some((r: NetRole) => r.user_id === u.id && r.role === 'NCS'));
  const eligibleFifthWeekUserIds = new Set<number>([
    ...(ownerId ? [ownerId] : []),
    ...staff.filter((s: StaffMember) => s.is_active).map((s: StaffMember) => s.user_id),
    ...(templateSummary?.fifth_week_user_id ? [templateSummary.fifth_week_user_id] : []),
  ]);
  const availableFifthWeekUsers = users.filter((u: User) => eligibleFifthWeekUserIds.has(u.id));

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

  const hasTemplateContext = !!templateId;

  const handleUpdateFifthWeekUser = async (selected: User | null) => {
    if (!schedule) return;
    setFifthWeekSaving(true);
    try {
      await templateApi.update(schedule.id, { fifth_week_user_id: selected?.id ?? null });
      setTemplateSummary(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          fifth_week_user_id: selected?.id ?? null,
          fifth_week_user_callsign: selected?.callsign ?? null,
          fifth_week_user_name: selected?.name ?? null,
        };
      });
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update fifth-week operator'));
    } finally {
      setFifthWeekSaving(false);
    }
  };

  const renderRotationTab = () => {
    if (!hasTemplateContext) {
      return (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          This net is not linked to a schedule, so there is no rotation order.
        </Typography>
      );
    }

    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2">Rotation Order</Typography>
          {canEdit && members.length > 0 && isScheduleContext && (
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
          Optional: cycle NCS duty automatically across upcoming scheduled nets. If empty, nets default to the Manager.
        </Typography>

        {canEdit && isScheduleContext && staff.filter((s: StaffMember) => s.is_active && !members.some((m: RotationMember) => m.user_id === s.user_id)).length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleCreateRotationFromStaff}
              fullWidth={isMobile}
            >
              Add Staff to Rotation
            </Button>
          </Box>
        )}

        {members.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No rotation configured — nets default to the Manager.
          </Typography>
        ) : (
          <List>
            {members.map((member: RotationMember, idx: number) => (
              <ListItem
                key={member.id}
                draggable={canEdit && isScheduleContext}
                onDragStart={canEdit && isScheduleContext ? () => { dragItemIdx.current = idx; } : undefined}
                onDragOver={canEdit && isScheduleContext ? (e) => { e.preventDefault(); setDragOverIdx(idx); } : undefined}
                onDragEnd={canEdit && isScheduleContext ? () => {
                  if (dragItemIdx.current !== null && dragOverIdx !== null) {
                    handleDragReorder(dragItemIdx.current, dragOverIdx);
                  }
                  dragItemIdx.current = null;
                  setDragOverIdx(null);
                } : undefined}
                onDrop={canEdit && isScheduleContext ? (e) => e.preventDefault() : undefined}
                sx={{
                  bgcolor: member.is_active ? 'background.paper' : 'action.disabledBackground',
                  border: 2,
                  borderColor: dragOverIdx === idx ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  mb: 0.5,
                  cursor: canEdit && isScheduleContext ? 'grab' : 'default',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: dragOverIdx === idx ? '0 0 0 2px rgba(25,118,210,0.25)' : 'none',
                  '&:active': { cursor: canEdit && isScheduleContext ? 'grabbing' : 'default' },
                }}
              >
                <DragIndicatorIcon sx={{ mr: 1, color: canEdit && isScheduleContext ? 'action.active' : 'action.disabled', cursor: canEdit && isScheduleContext ? 'grab' : 'default' }} />
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`#${idx + 1}`} size="small" color="primary" variant="outlined" />
                      <Typography>
                        {member.user_callsign}
                        {member.user_name && ` (${member.user_name})`}
                      </Typography>
                    </Box>
                  }
                />
                {canEdit && isScheduleContext && (
                  <ListItemSecondaryAction>
                    <IconButton size="small" onClick={() => handleMoveMember(member.id, 'up')} disabled={idx === 0}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleMoveMember(member.id, 'down')} disabled={idx === members.length - 1}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <Tooltip title={member.is_active ? 'Skip (mark inactive)' : 'Include (mark active)'}>
                      <IconButton size="small" onClick={() => handleToggleMemberActive(member)}>
                        <BlockIcon fontSize="small" color={member.is_active ? 'action' : 'error'} />
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" color="error" onClick={() => handleRemoveMember(member.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>
        )}

        {templateSummary?.schedule_type === 'weekly' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Fifth Week Operator
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              On months with a fifth Sunday (or whichever weekday this net falls on), this operator runs the net. The main rotation pauses and resumes the following week.
            </Typography>

            {canEdit && isScheduleContext ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Autocomplete
                  options={availableFifthWeekUsers}
                  getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                  value={availableFifthWeekUsers.find((u: User) => u.id === templateSummary.fifth_week_user_id) || null}
                  onChange={(_: any, value: User | null) => { void handleUpdateFifthWeekUser(value); }}
                  renderInput={(params: any) => (
                    <TextField
                      {...params}
                      size="small"
                      label="Fifth Week Operator"
                    />
                  )}
                  sx={{ flex: 1 }}
                  disabled={fifthWeekSaving}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { void handleUpdateFifthWeekUser(null); }}
                  disabled={fifthWeekSaving || !templateSummary.fifth_week_user_id}
                >
                  Clear
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {templateSummary.fifth_week_user_callsign
                  ? `${templateSummary.fifth_week_user_callsign}${templateSummary.fifth_week_user_name ? ` (${templateSummary.fifth_week_user_name})` : ''}`
                  : 'Not configured'}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const renderScheduleTab = () => {
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
      </Box>
    );
  };

  const renderSubscribersTab = () => {
    if (!hasTemplateContext) {
      return (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          This net is not linked to a schedule, so it has no subscriber list.
        </Typography>
      );
    }

    if (!canViewSubscribers) {
      return (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          Subscriber details are visible to admins, schedule managers, and co-managers.
        </Typography>
      );
    }

    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2">Subscribers</Typography>
          <Chip label={`${subscribers.length} subscribed`} size="small" variant="outlined" />
        </Box>
        {subscribers.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No subscribers yet.
          </Typography>
        ) : (
          <List dense>
            {subscribers.map((subscriber) => (
              <ListItem
                key={subscriber.id}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography fontWeight="bold">{subscriber.user_callsign || 'Unknown callsign'}</Typography>
                      {subscriber.user_name && <Typography color="text.secondary">({subscriber.user_name})</Typography>}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    );
  };

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
            <Box>
              <Tabs
                value={activeTab}
                onChange={(_: React.SyntheticEvent, next: number) => setActiveTab(next)}
                variant={isMobile ? 'scrollable' : 'standard'}
                scrollButtons="auto"
                sx={{ mb: 2 }}
              >
                {visibleTabs.map((tab) => (
                  <Tab key={tab.key} label={tab.label} />
                ))}
              </Tabs>

              {visibleTabs[activeTab]?.key === 'ncs' && renderStaffList()}
              {visibleTabs[activeTab]?.key === 'rotation' && renderRotationTab()}
              {visibleTabs[activeTab]?.key === 'schedule' && renderScheduleTab()}
              {visibleTabs[activeTab]?.key === 'subscribers' && renderSubscribersTab()}
            </Box>
          )}
        </DialogContent>
        
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, p: 2 }}>
          {/* Inline result for the Push-to-Schedule action. Lives in the
              footer (not the toast layer) so it stays visible alongside the
              button that triggered it. */}
          {pushStaffResult && (
            <Alert
              severity={pushStaffResult.severity}
              onClose={() => setPushStaffResult(null)}
              sx={{ width: '100%' }}
            >
              {pushStaffResult.message}
            </Alert>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            {/* Push staff to schedule: net-context only, requires that the
                net was created from a schedule. Hidden otherwise so the
                action area stays uncluttered for one-off (ad-hoc) nets. */}
            <Box>
              {isNetContext && net?.template_id && canEdit && (
                <Tooltip title="Copy this net's NCS operators into the parent schedule's staff list. Anyone already on the schedule is skipped.">
                  <span>
                    <Button
                      onClick={handlePushStaffToSchedule}
                      disabled={pushingStaff || netRoles.filter((r: NetRole) => r.role === 'NCS').length === 0}
                      startIcon={<SaveIcon />}
                      color="secondary"
                      variant="outlined"
                    >
                      {pushingStaff ? 'Creating schedule…' : 'Create schedule'}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {canCommunicate && (
                <Button
                  onClick={handleOpenEmailDialog}
                  startIcon={<EmailIcon />}
                  variant="contained"
                  color="primary"
                >
                  Email
                </Button>
              )}
              <Button onClick={onClose} color="success" variant="contained">
                Close
              </Button>
            </Box>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Email dialog (staff/subscribers/all) */}
      <Dialog open={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Email {emailRecipientGroup === 'all' ? 'ALL' : emailRecipientGroup === 'staff' ? 'Staff' : 'Subscribers'} - {net?.name || schedule?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth required>
              <InputLabel id="email-recipient-group-label">To</InputLabel>
              <Select
                labelId="email-recipient-group-label"
                value={emailRecipientGroup}
                label="To"
                onChange={(e) => setEmailRecipientGroup(e.target.value as 'staff' | 'subscribers' | 'all')}
              >
                <MenuItem value="staff">Net Staff</MenuItem>
                {hasTemplateContext && <MenuItem value="subscribers">Net Subscribers</MenuItem>}
                {hasTemplateContext && <MenuItem value="all">Both Staff and Subscribers</MenuItem>}
              </Select>
            </FormControl>
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
                  handleSendEmail();
                }
              }}
              required
              multiline
              rows={6}
              fullWidth
              helperText="Ctrl+Enter to send"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSendEmail}
            variant="contained"
            disabled={!emailForm.subject.trim() || !emailForm.message.trim() || emailSending}
          >
            {emailSending ? <CircularProgress size={20} /> : 'Send Email'}
          </Button>
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
              options={users.filter((u: User) =>
                (staff.some((s: StaffMember) => s.user_id === u.id && s.is_active) || u.id === schedule?.owner_id) &&
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

      {/* Who is this? profile popup */}
      <UserProfileDialog
        userId={profileUserId}
        netId={net?.id}
        onClose={() => setProfileUserId(null)}
      />

      {/* Reorder sync error toast */}
      <Snackbar
        open={!!reorderError}
        autoHideDuration={5000}
        onClose={() => setReorderError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setReorderError(null)} sx={{ width: '100%' }}>
          {reorderError}
        </Alert>
      </Snackbar>
    </>
  );
};

export default NCSStaffModal;
