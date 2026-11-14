import React from 'react';
import { TextField } from '@mui/material';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';
import NetFeaturesPanel from '../forms/NetFeaturesPanel';
import NetLogoSection from '../NetLogoSection';

// ========== TAB 0: BASIC INFO ==========
// Name, description, info URL, logo, then the feature switches
// (components/forms/NetFeaturesPanel.tsx)

const BasicInfoTab: React.FC = () => {
  const ctx = useCreateScheduleContext();
  const {
    isEdit,
    scheduleId,
    name, setName,
    description, setDescription,
    infoUrl, setInfoUrl,
    logoUrl, setLogoUrl,
    featureSections,
  } = ctx;

  return (
    <>
      <TextField
        fullWidth
        label="Schedule Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        margin="normal"
        required
        helperText="e.g., 'Weekly SKYWARN Net', 'Monthly Emergency Preparedness Net'"
      />

      <TextField
        fullWidth
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        margin="normal"
        multiline
        rows={4}
        helperText="Optional description of the net schedule"
      />

      <TextField
        fullWidth
        label="Info URL"
        value={infoUrl}
        onChange={(e) => setInfoUrl(e.target.value)}
        margin="normal"
        type="url"
        placeholder="https://example.com/net-info"
        helperText="Optional URL for net, club or organization info"
      />

      {/* Logo — only once the schedule exists (upload needs an id). Seeds the
          logo for nets created from this schedule and shows on the schedule card. */}
      {isEdit && scheduleId && (
        <NetLogoSection
          entityType="template"
          entityId={Number(scheduleId)}
          logoUrl={logoUrl}
          onLogoChange={setLogoUrl}
        />
      )}

      {/* ========== FEATURES ========== */}
      {/* Shared with the net form. Lobby, auto-close and chat grace are on
          the Schedule tab, where they depend on the schedule type. */}
      <NetFeaturesPanel scope="schedule" fields={ctx} sections={featureSections} />

      {/* Owner selector is in the Net Staff tab alongside the rotation. */}
    </>
  );
};

export default BasicInfoTab;
