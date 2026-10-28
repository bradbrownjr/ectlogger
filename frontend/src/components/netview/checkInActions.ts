import { callsignRoleApi, checkInApi, netApi, netBlockApi, netRoleApi, userApi } from '../../services/api';
import type { DeleteCheckInChoice } from '../../hooks/useDeleteCheckInPrompt';
import { roleMatchesCheckIn, StationRole } from '../../utils/stationRoles';
import api from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { isFieldShown, withOnlyShownFields } from '../../utils/checkInFields';
import { placeChoice } from '../../utils/stationPlace';
import { withCheckIn } from '../../utils/checkInList';

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

// The profile fields callsign lookup fills into the check-in form.
const LOOKUP_FIELDS = ['name', 'location', 'skywarn_number'] as const;
export type LookupFilled = Partial<Record<(typeof LOOKUP_FIELDS)[number], string>>;

export interface CheckInActionsDeps {
  netId: string | undefined;
  net: any;
  checkIns: any[];
  // Account and callsign-only roles merged (utils/stationRoles.ts).
  netRoles: StationRole[];
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
  // What the last callsign lookup filled into the check-in form, so the
  // next lookup can replace those values without touching anything typed
  // by hand. See handleCallsignLookup.
  lookupFilledRef: React.MutableRefObject<LookupFilled>;

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
  // Confirms a delete, and for net control offers Remove and block
  // (hooks/useDeleteCheckInPrompt.tsx).
  askDelete: (checkIn: { callsign: string }) => Promise<DeleteCheckInChoice>;
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
  handleSetActiveFrequency: (frequencyId: number | null) => Promise<void>;
  handleFrequencyChipClick: (frequencyId: number, event: React.MouseEvent) => Promise<void>;
}

export function getCheckInActions(deps: CheckInActionsDeps): CheckInActions {
  const {
    netId, net, checkIns, netRoles, user, isOwner, isAdmin,
    canManageCheckIns, userNetRole, ws,
    checkInForm, inlineEditingId, inlineEditValues, activeSpeakerId, inlineEditRowRef, lookupFilledRef,
    setCheckInForm, setToastMessage, setInlineEditingId, setInlineEditFocusField,
    setInlineEditValues, setCheckIns, setActiveSpeakerId, setNet, setFilteredFrequencyIds,
    fetchCheckIns, fetchNetRoles, askDelete,
  } = deps;

  // Look up user info by callsign and auto-fill form fields (for NCS).
  //
  // A field is filled only when it is empty or still holds what the previous
  // lookup put there, and only when this net shows it (a hidden field is one
  // the NCS can't see or clear, see utils/checkInFields.ts). The second rule
  // is what lets a corrected callsign bring in the right station: before it,
  // changing N1AAA to N1BBB left N1AAA's name and location in the form,
  // because they were no longer empty. Anything typed by hand is kept.
  const handleCallsignLookup = async (callsign: string) => {
    if (!callsign || callsign.length < 3) return;

    let userData: any = {};
    try {
      const response = await userApi.lookupByCallsign(callsign);
      userData = response.data || {};
    } catch (error) {
      // Not registered or lookup failed: still clear the previous station's
      // values below, so they aren't logged against this callsign.
      console.debug('Callsign lookup failed:', error);
    }

    const fieldConfig = net?.field_config;
    const previous = lookupFilledRef.current;
    const filled: LookupFilled = {};
    for (const field of LOOKUP_FIELDS) {
      if (isFieldShown(fieldConfig, field) && userData[field]) filled[field] = userData[field];
    }

    setCheckInForm((prev: any) => {
      const next = { ...prev };
      for (const field of LOOKUP_FIELDS) {
        const untouched = !prev[field] || prev[field] === previous[field];
        if (untouched) next[field] = filled[field] || '';
      }
      return next;
    });
    lookupFilledRef.current = filled;
  };

  const handleCheckIn = async () => {
    // Validate required fields
    if (!checkInForm.callsign) {
      setToastMessage('Callsign is required');
      return;
    }

    try {
      // Send only the fields this net shows. The form keeps its values after
      // a failed save, so a rejected value in a hidden field would otherwise
      // block this station and every one after it.
      const checkInData = withOnlyShownFields({
        ...checkInForm,
        custom_fields: checkInForm.custom_fields,
      }, net?.field_config);
      const response = await checkInApi.create(Number(netId), checkInData);
      lookupFilledRef.current = {};

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
        // Reset to Standard, never NCS or Logger. This form is reused for
        // every subsequent check-in (staff logging stations by voice), so
        // leaving a role request latched here would silently promote an
        // eligible operator who later types their own callsign into it.
        self_role_choice: 'standard',
      });

      // Add the new row from the response instead of re-reading the list.
      // Every check-in creates a new row -- a recheck included (see
      // routers/check_ins.py::create_check_in) -- and the list is ordered by
      // checked_in_at, so the newest row always belongs at the end. The
      // server's own broadcast may already have put it there (withCheckIn).
      setCheckIns((prev: any[]) => withCheckIn(prev, response.data));

      // Focus back on callsign field
      setTimeout(() => {
        const callsignInput = document.querySelector('input[placeholder="Callsign"]') as HTMLInputElement;
        if (callsignInput) callsignInput.focus();
      }, 100);

      // Other connected clients learn about this check-in from the server's
      // own broadcast (routers/check_ins.py::create_check_in), not a relay
      // sent from here -- see that broadcast's comment for why depending on
      // this client's own socket to notify everyone else was the bug.
    } catch (error: any) {
      console.error('Failed to create check-in:', error);
      setToastMessage(getErrorMessage(error, 'Failed to check in station'));
    }
  };

  const handleStatusChange = async (checkInId: number, newStatus: string) => {
    const checkIn = checkIns.find((ci: any) => ci.id === checkInId);
    if (!checkIn) {
      return;
    }

    // Set only on the optimistic (plain status) branch below, so the catch
    // knows whether there's a local change to undo. Role assignment doesn't
    // update optimistically and therefore has nothing to roll back.
    let rollbackStatus: (() => void) | null = null;

    try {
      // The role this station holds now, account or callsign-only. Matched by
      // station, never user_id alone: a guest row and a callsign-only role
      // both have user_id null.
      const existingRole = netRoles.find((r) => roleMatchesCheckIn(r, checkIn));
      if ((newStatus === 'ncs' || newStatus === 'logger') && checkIn.user_id) {
        // Remove any existing role
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
        // ========== ROLE FOR A STATION WITH NO ACCOUNT ==========
        // Credited by callsign (NetCallsignRole): the report and the closing
        // log name them, but it grants no net controls. The server replaces
        // any role the callsign already holds, refuses a callsign that has an
        // account, and applies the same who-may rule as the Roles dialog.
        await callsignRoleApi.assign(Number(netId), checkIn.callsign, newStatus.toUpperCase());
        await checkInApi.update(checkInId, { status: 'checked_in' });
        await fetchNetRoles();
        await fetchCheckIns();
      } else {
        // ========== OPTIMISTIC STATUS UPDATE ==========
        // Paint the new status immediately instead of waiting on the write.
        // The control's value derives from server state, so without this the
        // operator stares at the old icon for the whole round trip -- on a
        // rural mobile link that's seconds, which reads as "it didn't save"
        // and drives people to click again. Confirmed against the server's
        // authoritative response below; restored by rollbackStatus on failure,
        // where the existing error toast already explains what happened.
        //
        // Deliberately not applied to the role branch above: assigning
        // NCS/Logger mutates netRoles as well as the check-in, and the
        // control's value derives from both, so faking it locally would make
        // a rollback genuinely confusing rather than merely surprising.
        const previousStatus = checkIn.status;
        const applyStatus = (value: string) =>
          setCheckIns((prev: any[]) => prev.map(ci => (ci.id === checkInId ? { ...ci, status: value } : ci)));
        applyStatus(newStatus);
        rollbackStatus = () => applyStatus(previousStatus);

        // Only owner/admin may revoke a role when changing to a non-role status.
        // Regular NCS users changing their own status must not trigger a DELETE they
        // can't authorize (the backend rejects it with 403). The net owner is not
        // exempted here: an owner holding an NCS/Logger/Relay role who picks a
        // plain status must actually lose that role like anyone else, or the
        // check-in row keeps showing the old role icon forever (reported on the
        // ME Dirigo Net, 2026-09-06). The backend's own remove_net_role guard
        // already blocks removing the last active NCS from an active net.
        if (checkIn.user_id && existingRole && (isOwner || isAdmin)) {
          await api.delete(`/nets/${netId}/roles/${existingRole.id}`);
          await fetchNetRoles();
        }
        // A callsign-only role grants nothing, so whoever may give one may
        // take it back (the server checks the same rule as assigning it).
        if (!checkIn.user_id && existingRole?.callsign_only && net?.actions?.manage_roles) {
          await callsignRoleApi.remove(Number(netId), existingRole.id);
          await fetchNetRoles();
        }
        // Patch the one row from the write's own response instead of re-reading
        // the whole list. PUT /check-ins/{id} returns the authoritative
        // CheckInResponse, and the list is ordered by checked_in_at -- which a
        // status change never touches -- so replacing in place keeps row order
        // correct while removing a full round trip. Same shape handleToggleHand
        // already used.
        const response = await checkInApi.update(checkInId, { status: newStatus });
        setCheckIns((prev: any[]) => prev.map(ci => (ci.id === checkInId ? response.data : ci)));
      }
    } catch (error: any) {
      console.error('Failed to update status:', error);
      // Undo the optimistic paint so the row reflects what the server actually
      // holds, rather than leaving a change that looks saved but isn't.
      if (rollbackStatus) rollbackStatus();
      const message = getErrorMessage(error, 'Failed to update status');
      setToastMessage(message);
    }
  };

  const handleDeleteCheckIn = async (checkInId: number) => {
    const checkIn = checkIns.find((ci: any) => ci.id === checkInId);
    if (!checkIn) return;
    const choice = await askDelete(checkIn);
    if (!choice) return;
    try {
      if (choice === 'block') {
        // The server removes every row under the callsign; drop them here too.
        await netBlockApi.block(Number(netId), checkInId);
        const callsign = String(checkIn.callsign).toUpperCase();
        setCheckIns((prev: any[]) => prev.filter(ci => String(ci.callsign).toUpperCase() !== callsign));
        setToastMessage(`${checkIn.callsign} removed and blocked from this net`);
        return;
      }
      await checkInApi.delete(checkInId);
      // Drop the row locally rather than re-reading the list; the server's
      // check_in_deleted broadcast does the same for every other client.
      setCheckIns((prev: any[]) => prev.filter(ci => ci.id !== checkInId));
    } catch (error) {
      console.error('Failed to delete check-in:', error);
      setToastMessage(getErrorMessage(error, 'Failed to delete check-in'));
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
      // The Site cell (nets with sites); saved only if the place changed.
      coverage_site_id: checkIn.coverage_site_id ?? null,
      operating_position: checkIn.operating_position || '',
      status: checkIn.status,
    });
  };

  // Save inline edit
  const handleSaveInlineEdit = async () => {
    if (!inlineEditingId) return;

    const checkIn = checkIns.find((c: any) => c.id === inlineEditingId);
    if (!checkIn) return;

    try {
      // Hidden fields are left out, so a stored value the server would now
      // reject (a pre-rule spotter number) can't block editing the rest.
      const response = await checkInApi.update(inlineEditingId, withOnlyShownFields({
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
        ...placeEdit(checkIn, inlineEditValues),
      }, net?.field_config));
      setInlineEditingId(null);
      setInlineEditValues({});
      setInlineEditFocusField(null);
      // Patch from the write's response rather than re-reading the list -- an
      // edit never changes checked_in_at, so row order is unaffected.
      const edited = response.data;
      setCheckIns((prev: any[]) => prev.map(ci => (ci.id === edited.id ? edited : ci)));
    } catch (error) {
      console.error('Failed to update check-in:', error);
      setToastMessage(getErrorMessage(error, 'Failed to update check-in'));
    }
  };

  // A corrected Site: sent only when the place changed, so an ordinary edit
  // never touches it. The backend pairs coverage_site_id and
  // operating_position (routers/check_ins.py::update_check_in). Traveling is
  // the Mobile status, so a change to or from it sends the status too.
  const placeEdit = (checkIn: any, values: any) => {
    if (!('operating_position' in values) || placeChoice(values) === placeChoice(checkIn)) return {};
    return {
      coverage_site_id: values.coverage_site_id ?? null,
      operating_position: values.operating_position || '',
      ...(values.status !== checkIn.status ? { status: values.status } : {}),
    };
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

  // null clears the net's active frequency (a second click on the active chip).
  const handleSetActiveFrequency = async (frequencyId: number | null) => {
    try {
      const response = frequencyId === null
        ? await netApi.clearActiveFrequency(Number(netId!))
        : await netApi.setActiveFrequency(Number(netId!), frequencyId);
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
  // Clicking the chip that is already yours (an NCS's claim) or already active
  // (anyone else) releases it, so a net manager coordinating every band isn't
  // stuck on the last one they clicked. Until 2026-10-24 a second click just
  // claimed it again and nothing in the app released a frequency, though the
  // server always had both clear actions.
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
    } else if (canManageCheckIns && userNetRole?.role === 'NCS' && userNetRole.active_frequency_id === frequencyId) {
      // NCS clicking their own claimed frequency: release it
      try {
        await netRoleApi.clearFrequency(Number(netId), userNetRole.id);
        await fetchNetRoles();
        setToastMessage("You're no longer on a frequency. Pick one for each check-in, or click a frequency to claim it.");
      } catch (error: any) {
        setToastMessage(getErrorMessage(error, 'Failed to release frequency'));
      }
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
        setToastMessage(getErrorMessage(error, 'Failed to claim frequency'));
      }
    } else if (canManageCheckIns) {
      // Non-NCS managers: set the active frequency, or clear it when it is
      // already the active one
      handleSetActiveFrequency(net?.active_frequency_id === frequencyId ? null : frequencyId);
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
