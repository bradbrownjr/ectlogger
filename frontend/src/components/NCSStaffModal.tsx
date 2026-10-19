import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
} from '@mui/material';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import EmailIcon from '@mui/icons-material/Email';
import { ncsRotationApi, userApi, templateStaffApi, templateApi } from '../services/api';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import UserProfileDialog from './UserProfileDialog';
import { getErrorMessage } from '../utils/apiErrors';
import NCSStaffScheduleTab from './ncs-staff/NCSStaffScheduleTab';
import NCSStaffRotationTab from './ncs-staff/NCSStaffRotationTab';
import NCSStaffSubscribersTab from './ncs-staff/NCSStaffSubscribersTab';
import NCSStaffRosterTab from './ncs-staff/NCSStaffRosterTab';
import { AddStaffRequest } from './ncs-staff/AddStaffField';
import { linkConfirmText, personPayload, samePerson, SchedulePerson, toPerson, userToPerson, uniquePeople } from '../utils/staffPeople';

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
    // When present, the net's staff are shown read-only and managed on the
    // schedule (ScheduleStaffButton).
    template_id?: number | null;
  } | null;
  onUpdate?: () => void;
}

// user_id is null for an operator added by callsign who has no account yet;
// compare rows with utils/staffPeople.ts, never by user_id alone.
interface RotationMember {
  id: number;
  user_id: number | null;
  user_callsign: string;
  user_name: string | null;
  position: number;
  is_active: boolean;
  has_account?: boolean;
  account_available?: boolean;
  available_account_name?: string | null;
  available_account_email?: string | null;
}

interface StaffMember {
  id: number;
  user_id: number | null;
  user_callsign: string;
  user_name: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_co_manager: boolean;
  has_account?: boolean;
  account_available?: boolean;
  available_account_name?: string | null;
  available_account_email?: string | null;
  invited?: boolean;
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
  fifth_week_has_account?: boolean;
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
  // What's typed in the Add box: lets a manager add a callsign that has no
  // account yet, with an optional address to invite them at.

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

  // Result line in the dialog footer (the Email action's sent/failed count).
  const [footerNotice, setFooterNotice] = useState<{ severity: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState(0);
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
  // A net created from a schedule shows its staff read-only: who runs it
  // comes from the schedule (staff, rotation, swaps), so changes are made
  // there and never on one net, where they'd look like schedule changes.
  const netFromSchedule = isNetContext && !!net?.template_id;
  
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
      setFooterNotice(null);
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
          fifth_week_has_account: tplRes.data.fifth_week_has_account ?? true,
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
            fifth_week_has_account: tplRes.data.fifth_week_has_account ?? true,
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

      setFooterNotice({
        severity: 'success',
        message: `Email sent to ${response.data.sent} recipient(s) (${response.data.failed} failed).`,
      });
      setEmailDialogOpen(false);
    } catch (err: any) {
      setFooterNotice({
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

  // Someone picked from the directory, or a callsign with no account yet
  // (added as a callsign-only operator, optionally invited). The Add box is
  // the shared AddStaffField; it clears itself when this returns true.
  const handleAddStaff = async (data: AddStaffRequest): Promise<boolean> => {
    if (!schedule) return false;
    try {
      const response = await templateStaffApi.add(schedule.id, data);
      // Update local state instead of refetching
      setStaff(prev => [...prev, response.data]);
      return true;
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to add staff'));
      return false;
    }
  };

  // ===== CALLSIGN-ONLY STAFF (no account yet) =====
  // Fix a mistyped callsign and/or send a sign-up invite. The backend renames
  // the matching rotation entry and swaps too, and links straight away when
  // the corrected callsign belongs to an account.
  const handleEditPlaceholder = async (staffMember: StaffMember, changes: { callsign?: string; invite_email?: string }) => {
    if (!schedule) return;
    try {
      await templateStaffApi.updatePlaceholder(schedule.id, staffMember.id, changes);
      await fetchData();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update operator'));
      await fetchData();
    }
  };

  // The callsign now has an account but wasn't taken over automatically (it
  // was invited at a different address); the manager confirms it's them.
  const handleLinkStaff = async (staffMember: StaffMember) => {
    if (!schedule) return;
    if (!confirm(linkConfirmText(staffMember))) return;
    try {
      await templateStaffApi.updatePlaceholder(schedule.id, staffMember.id, { link: true });
      await fetchData();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to link operator'));
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
        const rotationMember = members.find((m: RotationMember) => samePerson(m, staffMember));
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

    // Active staff (accounts and callsign-only operators alike) plus the manager.
    const peopleToAdd = uniquePeople([
      ...staff.filter((s: StaffMember) => s.is_active).map((s: StaffMember) => toPerson(s)),
      ...(schedule.owner_id ? [toPerson({ user_id: schedule.owner_id, user_callsign: schedule.owner_callsign })] : []),
    ]);
    const missing = peopleToAdd.filter(
      (p: SchedulePerson) => !members.some((m: RotationMember) => samePerson(m, { user_id: p.user_id, user_callsign: p.callsign }))
    );

    if (missing.length === 0) {
      setError('All active staff and the manager are already in the rotation');
      return;
    }
    
    try {
      for (const person of missing) {
        await ncsRotationApi.addMember(schedule.id, personPayload(person));
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
  // The 5th-week pick comes from the manager and active staff, including
  // operators on the staff list by callsign only, plus whoever holds it now.
  const directoryPerson = (id: number) => {
    const u = users.find((x: User) => x.id === id);
    return u ? userToPerson(u) : null;
  };
  const availableFifthWeekPeople: SchedulePerson[] = uniquePeople([
    ...(ownerId && directoryPerson(ownerId) ? [directoryPerson(ownerId)!] : []),
    ...staff.filter((s: StaffMember) => s.is_active).map((s: StaffMember) => {
      const fromDirectory = s.user_id != null ? directoryPerson(s.user_id) : null;
      return fromDirectory ?? toPerson(s);
    }),
    ...(templateSummary?.fifth_week_user_callsign
      ? [toPerson({ user_id: templateSummary.fifth_week_user_id, user_callsign: templateSummary.fifth_week_user_callsign, user_name: templateSummary.fifth_week_user_name })]
      : []),
  ]);

  // Get NCS-only roles for display
  const ncsRoles = netRoles.filter((r: NetRole) => r.role === 'NCS');

  const hasTemplateContext = !!templateId;

  const handleUpdateFifthWeekUser = async (selected: SchedulePerson | null) => {
    if (!schedule) return;
    setFifthWeekSaving(true);
    try {
      await templateApi.update(schedule.id, {
        fifth_week_user_id: selected?.user_id ?? null,
        fifth_week_callsign: selected && selected.user_id == null ? selected.callsign : null,
      });
      setTemplateSummary(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          fifth_week_user_id: selected?.user_id ?? null,
          fifth_week_user_callsign: selected?.callsign ?? null,
          fifth_week_user_name: selected?.name ?? null,
          fifth_week_has_account: selected ? selected.has_account : true,
        };
      });
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update fifth-week operator'));
    } finally {
      setFifthWeekSaving(false);
    }
  };

  const renderRotationTab = () => (
    <NCSStaffRotationTab
      hasTemplateContext={hasTemplateContext}
      canEdit={canEdit}
      isScheduleContext={isScheduleContext}
      isMobile={isMobile}
      members={members}
      staff={staff}
      templateSummary={templateSummary}
      availableFifthWeekPeople={availableFifthWeekPeople}
      fifthWeekSaving={fifthWeekSaving}
      handleClearAllMembers={handleClearAllMembers}
      handleCreateRotationFromStaff={handleCreateRotationFromStaff}
      handleMoveMember={handleMoveMember}
      handleDragReorder={handleDragReorder}
      handleToggleMemberActive={handleToggleMemberActive}
      handleRemoveMember={handleRemoveMember}
      handleUpdateFifthWeekUser={handleUpdateFifthWeekUser}
    />
  );

  const renderScheduleTab = () => (
    <NCSStaffScheduleTab
      hasTemplateContext={hasTemplateContext}
      templateSummary={templateSummary}
      scheduleEntries={scheduleEntries}
      canEdit={canEdit}
      isScheduleContext={isScheduleContext}
      scheduleId={schedule?.id}
      scheduleOwnerId={schedule?.owner_id}
      staff={staff}
      users={users}
      refetch={fetchData}
      reportError={setError}
    />
  );


  const renderSubscribersTab = () => (
    <NCSStaffSubscribersTab
      hasTemplateContext={hasTemplateContext}
      templateId={templateId ?? null}
      canViewSubscribers={canViewSubscribers}
      subscribers={subscribers}
    />
  );

  // Render the staff list. Owners and admins see inline add/remove/toggle controls.
  const renderStaffList = () => (
    <NCSStaffRosterTab
      isScheduleContext={isScheduleContext}
      isNetContext={isNetContext}
      canEdit={canEdit && !netFromSchedule}
      isMobile={isMobile}
      availableStaffUsers={availableStaffUsers}
      selectedUser={selectedUser}
      setSelectedUser={setSelectedUser}
      users={users}
      handleAddStaff={handleAddStaff}
      handleEditPlaceholder={handleEditPlaceholder}
      handleLinkStaff={handleLinkStaff}
      localOwner={localOwner}
      schedule={schedule}
      net={net}
      setProfileUserId={setProfileUserId}
      editingManager={editingManager}
      setEditingManager={setEditingManager}
      pendingManager={pendingManager}
      setPendingManager={setPendingManager}
      managerSaving={managerSaving}
      handleSaveManager={handleSaveManager}
      staff={staff}
      handleToggleCoManager={handleToggleCoManager}
      handleToggleStaffActive={handleToggleStaffActive}
      handleRemoveStaff={handleRemoveStaff}
      members={members}
      scheduleEntries={scheduleEntries}
      ncsRoles={ncsRoles}
      handleAddNetRole={handleAddNetRole}
      handleRemoveNetRole={handleRemoveNetRole}
    />
  );

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
          {/* Shows on a net created from a schedule */}
          {netFromSchedule && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This net's staff and NCS come from its schedule. To change them, open the schedule's staff below.
              A swap on the schedule's Schedule tab changes who runs this net.
            </Alert>
          )}
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
          {footerNotice && (
            <Alert severity={footerNotice.severity} onClose={() => setFooterNotice(null)} sx={{ width: '100%' }}>
              {footerNotice.message}
            </Alert>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            {/* Net from a schedule: its staff are managed on the schedule.
                Opens the schedule's own Staff dialog on top of this one, so
                closing it comes straight back here. */}
            <Box>
              {netFromSchedule && isAuthenticated && (
                <ScheduleStaffButton
                  templateId={net!.template_id!}
                  onClosed={() => { fetchData(); onUpdate?.(); }}
                />
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

// ========== OPEN THE SCHEDULE'S STAFF ==========
// For a net created from a schedule (the net's Staff dialog and Edit Net's
// Net Staff tab): opens that schedule's own Staff dialog on top of the
// current view, where staff, the rotation and swaps are managed. Closing it
// returns to exactly where the user was, and onClosed refreshes that view.
export const ScheduleStaffButton: React.FC<{ templateId: number; onClosed?: () => void }> = ({ templateId, onClosed }) => {
  const [schedule, setSchedule] = useState<NCSStaffModalProps['schedule']>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpening(true);
    setOpenError(null);
    try {
      const { data } = await templateApi.get(templateId);
      setSchedule({
        id: data.id,
        name: data.name,
        owner_id: data.owner_id,
        owner_callsign: data.owner_callsign || undefined,
        owner_name: data.owner_name || undefined,
      });
    } catch (err: any) {
      setOpenError(getErrorMessage(err, "Couldn't open the schedule"));
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <Button variant="outlined" startIcon={<EventRepeatIcon />} onClick={handleOpen} disabled={opening}>
        Open the schedule's staff
      </Button>
      {openError && <Alert severity="error" sx={{ mt: 1 }}>{openError}</Alert>}
      {schedule && (
        <NCSStaffModal
          open
          schedule={schedule}
          onClose={() => { setSchedule(null); onClosed?.(); }}
        />
      )}
    </>
  );
};

export default NCSStaffModal;
