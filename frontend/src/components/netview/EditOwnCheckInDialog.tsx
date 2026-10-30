import React, { useState } from 'react';
import CheckInFormDialog, { type CheckInFormState } from './CheckInFormDialog';
import type { CustomFieldDefinition } from './CustomFieldInput';
import type { CoverageSite } from '../../utils/coverageSites';
import { checkInApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formFromCheckIn, ownCheckInChanges } from '../../utils/ownCheckInEdit';

// ========== EDIT YOUR OWN CHECK-IN ==========
// A station correcting its own check-in: a field it forgot (Ken N1KWG's
// members, 2026-10-29: the FLDIGI box), a new callsign, its frequency or
// site. Opened from the pencil on the station's own row and from the
// toolbar's Edit check-in button, in NetView and the popped-out check-in
// list. The server has always let a check-in's own account edit it
// (routers/check_ins.py::update_check_in); before this the app only offered
// the status dropdown, so the rest needed net control.
//
// Keeps its own form state rather than NetView's checkInForm, which is the
// staff entry row's: opening this mid-entry would wipe the station net
// control was typing in.

interface EditOwnCheckInDialogProps {
  checkIn: any;
  net: any;
  customFields: CustomFieldDefinition[];
  fieldDefinitions?: { name: string; label?: string | null }[];
  coverageSites?: CoverageSite[];
  savedTown?: string;
  pollResponses?: string[];
  formatFrequency: (freq: any) => string;
  onClose: () => void;
  onSaved: (updated: any) => void;
  onToast: (message: string) => void;
}

const EditOwnCheckInDialog: React.FC<EditOwnCheckInDialogProps> = ({
  checkIn, net, customFields, fieldDefinitions, coverageSites, savedTown, pollResponses,
  formatFrequency, onClose, onSaved, onToast,
}) => {
  const [form, setForm] = useState<CheckInFormState>(() => formFromCheckIn(checkIn));
  const original = formFromCheckIn(checkIn);
  // In person has no frequency, and the server refuses one (_settle_frequencies).
  const inPerson = form.status === 'in_person';

  const save = async () => {
    try {
      const response = await checkInApi.update(checkIn.id, ownCheckInChanges(original, form, net?.field_config));
      onSaved(response.data);
    } catch (error: any) {
      onToast(getErrorMessage(error, 'Failed to save your check-in'));
    }
  };

  return (
    <CheckInFormDialog
      mode="edit"
      dialog={{ open: true, onOpen: () => {}, onClose, onToggle: onClose }}
      customFields={customFields}
      fieldDefinitions={fieldDefinitions}
      netName={net?.name}
      fieldConfig={net?.field_config}
      frequencies={inPerson ? undefined : net?.frequencies}
      checkInForm={form}
      setCheckInForm={setForm}
      onCheckIn={save}
      formatFrequency={formatFrequency}
      topicOfWeekEnabled={net?.topic_of_week_enabled}
      topicOfWeekPrompt={net?.topic_of_week_prompt}
      pollEnabled={net?.poll_enabled}
      pollQuestion={net?.poll_question}
      pollResponses={pollResponses}
      coverageSites={coverageSites}
      savedTown={savedTown}
    />
  );
};

export default EditOwnCheckInDialog;
