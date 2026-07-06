import { checkInApi, netApi, netRoleApi, userApi } from '../../services/api';
import api from '../../services/api';

// ========== CHECK-IN ACTIONS ==========
// The check-in row action handlers: create/edit/delete a check-in, change
// status (including role assignment via the status select), inline-edit
// save/cancel/field-change/keydown/blur, active-speaker toggle, hand-raise
// toggle, and frequency claim/filter/set-active. Extracted from NetView.
//
// This is a plain factory function, NOT a React hook: several handlers need
// canManage/isOwner/ncsRoles/userNetRole, which NetView computes AFTER its
// `if (!net) return` early return. A hook can't be called after a
// conditional return (Rules of Hooks), but a plain function can be called
// anywhere — same pattern already used by getCheckInStatusHelpers.

export interface CheckInActionsDeps {
  netId: string | undefined;
  net: any;
  checkIns: any[];
  netRoles: any[];
  user: any;
  isOwner: boolean;
  isAdmin: boolean;
  owner: any;
  canManageCheckIns: boolean | undefined;
  userNetRole: any;
  ws: WebSocket | null;

  checkInForm: any;
  inlineEditingId: number | null;
  inlineEditValues: any;
  activeSpeakerId: number | null;
  inlineEditRowRef: React.RefObject<HTMLTableRowElement | null>;

  setCheckInForm: (value: any) => void;
  setToastMessage: (value: string) => void;
  setInlineEditingId: (value: number | null) => void;
  setInlineEditFocusField: (value: string | null) => void;
  setInlineEditValues: (value: any) => void;
  setCheckIns: (updater: (prev: any[]) => any[]) => void;
  setActiveSpeakerId: (value: number | null) => void;
  setNet: (value: any) => void;
  setFilteredFrequencyIds: (updater: (prev: number[]) => number[]) => void;

  fetchCheckIns: () => Promise<void>;
  fetchNetRoles: () => Promise<void>;
  fetchPollResponses: () => Promise<void>;
}

export interface CheckInActions {
  handleCallsignLookup: (callsign: string) => Promise<void>;
  handleCheckIn: () => Promise<void>;
  handleStatusChange: (checkInId: number, newStatus: string) => Promise<void>;
  handleDeleteCheckIn: (checkInId: number) => Promise<void>;
  handleStartInlineEdit: (checkIn: any, focusField?: string) => void;
  handleSaveInlineEdit: () => Promise<void>;
  handleCancelInlineEdit: () => void;
  handleInlineFieldChange: (field: string, value: string) => void;
  handleInlineKeyDown: (e: React.KeyboardEvent) => void;
  handleInlineBlur: (e: React.FocusEvent) => void;
  handleSetActiveSpeaker: (checkInId: number | null) => void;
  handleToggleHand: (checkInId: number) => Promise<void>;
  handleSetActiveFrequency: (frequencyId: number) => Promise<void>;
  handleFrequencyChipClick: (frequencyId: number, event: React.MouseEvent) => Promise<void>;
}

export function getCheckInActions(deps: CheckInActionsDeps): CheckInActions {
  const {
    netId, net, checkIns, netRoles, user, isOwner, isAdmin, owner,
    canManageCheckIns, userNetRole, ws,
    checkInForm, inlineEditingId, inlineEditValues, activeSpeakerId, inlineEditRowRef,
    setCheckInForm, setToastMessage, setInlineEditingId, setInlineEditFocusField,
    setInlineEditValues, setCheckIns, setActiveSpeakerId, setNet, setFilteredFrequencyIds,
    fetchCheckIns, fetchNetRoles, fetchPollResponses,
  } = deps;

  // Look up user info by callsign and auto-fill form fields (for NCS)
  const handleCallsignLookup = async (callsign: string) => {
    if (!callsign || callsign.length < 3) return;

    try {
      const response = await userApi.lookupByCallsign(callsign);
      const userData = response.data;

      // Only auto-fill fields that are currently empty
      if (userData.name || userData.location || userData.skywarn_number) {
        setCheckInForm((prev: any) => ({
          ...prev,
          name: prev.name || userData.name || '',
          location: prev.location || userData.location || '',
          skywarn_number: prev.skywarn_number || userData.skywarn_number || '',
        }));
      }
    } catch (error) {
      // Silently fail - user may not be registered
      console.debug('Callsign lookup failed:', error);
    }
  };

  const handleCheckIn = async () => {
    // Validate required fields
    if (!checkInForm.callsign) {
      setToastMessage('Callsign is required');
      return;
    }

    try {
      // Prepare check-in data with custom fields
      const checkInData = {
        ...checkInForm,
        custom_fields: checkInForm.custom_fields,
      };
      await checkInApi.create(Number(netId), checkInData);

      // Clear form for next check-in
      setCheckInForm({
        callsign: '',
        name: '',
        location: '',
        skywarn_number: '',
        weather_observation: '',
        power_source: '',
        power: '',
        feedback: '',
        notes: '',
        relayed_by: '',
        available_frequency_ids: [],
        custom_fields: {},
        topic_response: '',
        poll_response: '',
        status: 'checked_in',
      });

      fetchCheckIns();

      // Refresh poll responses after new check-in (in case new response was added)
      if (net?.poll_enabled) {
        fetchPollResponses();
      }

      // Focus back on callsign field
      setTimeout(() => {
        const callsignInput = document.querySelector('input[placeholder="Callsign"]') as HTMLInputElement;
        if (callsignInput) callsignInput.focus();
      }, 100);

      // Broadcast via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'check_in',
          data: checkInForm,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error: any) {
      console.error('Failed to create check-in:', error);
      setToastMessage(error.response?.data?.detail || 'Failed to check in station');
    }
  };

  const handleStatusChange = async (checkInId: number, newStatus: string) => {
    const checkIn = checkIns.find((ci: any) => ci.id === checkInId);
    if (!checkIn) {
      return;
    }

    try {
      if ((newStatus === 'ncs' || newStatus === 'logger') && checkIn.user_id) {
        // Remove any existing role
        const existingRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
        if (existingRole) {
          await api.delete(`/nets/${netId}/roles/${existingRole.id}`);
        }
        // Assign new role
        await api.post(`/nets/${netId}/roles`, null, {
          params: {
            user_id: checkIn.user_id,
            role: newStatus.toUpperCase()
          }
        });
        // Always set status to checked_in for roles
        await checkInApi.update(checkInId, { status: 'checked_in' });
        await fetchNetRoles();
        await fetchCheckIns();
      } else if (newStatus === 'ncs' || newStatus === 'logger') {
        setToastMessage('Cannot assign roles to stations without user accounts');
        return;
      } else {
        // Only owner/admin may revoke a role when changing to a non-role status.
        // Regular NCS users changing their own status must not trigger a DELETE they
        // can't authorize (the backend rejects it with 403).
        if (checkIn.user_id && (isOwner || isAdmin)) {
          const existingRole = netRoles.find((r: any) => r.user_id === checkIn.user_id);
          if (existingRole && owner?.id !== checkIn.user_id) {
            await api.delete(`/nets/${netId}/roles/${existingRole.id}`);
            await fetchNetRoles();
          }
        }
        await checkInApi.update(checkInId, { status: newStatus });
        await fetchCheckIns();
      }
    } catch (error: any) {
      console.error('Failed to update status:', error);
      const message = error.response?.data?.detail || 'Failed to update status';
      setToastMessage(message);
    }
  };

  const handleDeleteCheckIn = async (checkInId: number) => {
    if (!confirm('Delete this check-in entry?')) return;
    try {
      await checkInApi.delete(checkInId);
      fetchCheckIns();
    } catch (error) {
      console.error('Failed to delete check-in:', error);
      setToastMessage('Failed to delete check-in');
    }
  };

  // ========== INLINE EDITING HANDLERS ==========
  // Start inline editing when a row is clicked (except on certain elements)
  // focusField: the field name to focus (e.g., 'callsign', 'name', 'location', etc.)
  const handleStartInlineEdit = (checkIn: any, focusField: string = 'callsign') => {
    if (!canManageCheckIns) return;
    setInlineEditingId(checkIn.id);
    setInlineEditFocusField(focusField);
    setInlineEditValues({
      callsign: checkIn.callsign,
      name: checkIn.name || '',
      location: checkIn.location || '',
      skywarn_number: checkIn.skywarn_number || '',
      weather_observation: checkIn.weather_observation || '',
      power_source: checkIn.power_source || '',
      power: checkIn.power || '',
      notes: checkIn.notes || '',
      relayed_by: checkIn.relayed_by || '',
      topic_response: checkIn.topic_response || '',
      poll_response: checkIn.poll_response || '',
      custom_fields: checkIn.custom_fields || {},
    });
  };

  // Save inline edit
  const handleSaveInlineEdit = async () => {
    if (!inlineEditingId) return;

    const checkIn = checkIns.find((c: any) => c.id === inlineEditingId);
    if (!checkIn) return;

    try {
      await checkInApi.update(inlineEditingId, {
        callsign: inlineEditValues.callsign || checkIn.callsign,
        name: inlineEditValues.name,
        location: inlineEditValues.location,
        skywarn_number: inlineEditValues.skywarn_number,
        weather_observation: inlineEditValues.weather_observation,
        power_source: inlineEditValues.power_source,
        power: inlineEditValues.power,
        notes: inlineEditValues.notes,
        relayed_by: inlineEditValues.relayed_by,
        topic_response: inlineEditValues.topic_response,
        poll_response: inlineEditValues.poll_response,
        custom_fields: inlineEditValues.custom_fields,
        // Keep existing frequency settings
        available_frequency_ids: checkIn.available_frequencies || [],
      });
      setInlineEditingId(null);
      setInlineEditValues({});
      setInlineEditFocusField(null);
      fetchCheckIns();
      // Refresh poll responses in case a new answer was added
      if (net?.poll_enabled) {
        fetchPollResponses();
      }
    } catch (error) {
      console.error('Failed to update check-in:', error);
      setToastMessage('Failed to update check-in');
    }
  };

  // Cancel inline edit
  const handleCancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineEditValues({});
    setInlineEditFocusField(null);
  };

  // Handle inline field change
  const handleInlineFieldChange = (field: string, value: string) => {
    if (field.startsWith('custom_')) {
      const customFieldName = field.replace('custom_', '');
      setInlineEditValues((prev: any) => ({
        ...prev,
        custom_fields: {
          ...prev.custom_fields,
          [customFieldName]: value,
        },
      }));
    } else {
      setInlineEditValues((prev: any) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  // Handle key press in inline edit (Enter to save, Escape to cancel, Tab to navigate)
  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveInlineEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelInlineEdit();
    }
    // Tab is handled naturally by the browser - don't prevent it
  };

  // Handle blur on inline edit fields - only save if focus leaves the editing row entirely
  const handleInlineBlur = (_e: React.FocusEvent) => {
    // Use setTimeout to allow the new focus target to be set before checking
    setTimeout(() => {
      // Check if focus moved to another element within the same editing row
      const activeElement = document.activeElement;
      if (inlineEditRowRef.current && inlineEditRowRef.current.contains(activeElement)) {
        // Focus is still within the editing row, don't save
        return;
      }
      // Focus left the row, save the edit
      handleSaveInlineEdit();
    }, 0);
  };

  const handleSetActiveSpeaker = (checkInId: number | null) => {
    const newActiveSpeakerId = activeSpeakerId === checkInId ? null : checkInId;

    // Show toast if setting someone with "listening" status as active speaker
    const checkIn = checkIns.find((ci: any) => ci.id === checkInId);
    if (checkIn && checkIn.status === 'listening' && newActiveSpeakerId !== null) {
      setToastMessage(`${checkIn.callsign} is set to "Just Listening"`);
    }

    setActiveSpeakerId(newActiveSpeakerId);

    // Broadcast active speaker change via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'active_speaker',
        data: { checkInId: newActiveSpeakerId },
        timestamp: new Date().toISOString()
      }));
    }
  };

  const handleToggleHand = async (checkInId: number) => {
    try {
      const response = await checkInApi.toggleHand(checkInId);
      // Update local state with the response
      setCheckIns((prev: any[]) => prev.map(ci =>
        ci.id === checkInId
          ? { ...ci, hand_raised: response.data.hand_raised }
          : ci
      ));
    } catch (error) {
      console.error('Failed to toggle hand:', error);
      setToastMessage('Failed to toggle hand');
    }
  };

  const handleSetActiveFrequency = async (frequencyId: number) => {
    try {
      const response = await netApi.setActiveFrequency(Number(netId!), frequencyId);
      setNet(response.data);

      // Broadcast frequency change via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'active_frequency',
          data: { frequencyId },
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('Failed to set active frequency:', error);
      setToastMessage('Failed to change frequency');
    }
  };

  // Handle frequency chip click - NCS claims frequency, or Ctrl+click filters
  // For closed/archived nets, only allow Ctrl+click filtering (no claiming/setting active)
  const handleFrequencyChipClick = async (frequencyId: number, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle frequency filter (always allowed)
      setFilteredFrequencyIds((prev: number[]) =>
        prev.includes(frequencyId)
          ? prev.filter(id => id !== frequencyId)
          : [...prev, frequencyId]
      );
    } else if (net?.status === 'closed' || net?.status === 'archived') {
      // For closed/archived nets, regular clicks do nothing (chips are view-only)
      return;
    } else if (canManageCheckIns && userNetRole?.role === 'NCS') {
      // NCS clicking: claim this frequency and add to their available frequencies
      try {
        await netRoleApi.claimFrequency(Number(netId), userNetRole.id, frequencyId);
        // Also add this frequency to the NCS's check-in available_frequencies
        const ncsCheckIn = checkIns.find((ci: any) => ci.user_id === user?.id && ci.status !== 'checked_out');
        if (ncsCheckIn) {
          const currentFreqs = ncsCheckIn.available_frequencies || [];
          if (!currentFreqs.includes(frequencyId)) {
            await checkInApi.update(ncsCheckIn.id, {
              available_frequency_ids: [...currentFreqs, frequencyId]
            });
          }
        }
        await fetchNetRoles();
        await fetchCheckIns();
        // Show reminder toast if multiple frequencies
        if (net.frequencies.length > 1) {
          setToastMessage('You are now monitoring this frequency. Other NCS operators can claim different frequencies.');
        }
      } catch (error: any) {
        setToastMessage(error.response?.data?.detail || 'Failed to claim frequency');
      }
    } else if (canManageCheckIns) {
      // Non-NCS managers: set active frequency (existing behavior)
      handleSetActiveFrequency(frequencyId);
    }
  };

  return {
    handleCallsignLookup,
    handleCheckIn,
    handleStatusChange,
    handleDeleteCheckIn,
    handleStartInlineEdit,
    handleSaveInlineEdit,
    handleCancelInlineEdit,
    handleInlineFieldChange,
    handleInlineKeyDown,
    handleInlineBlur,
    handleSetActiveSpeaker,
    handleToggleHand,
    handleSetActiveFrequency,
    handleFrequencyChipClick,
  };
}
