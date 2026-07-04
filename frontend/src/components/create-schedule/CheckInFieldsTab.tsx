import React from 'react';
import { Typography } from '@mui/material';
import CheckInFieldsPanel from '../forms/CheckInFieldsPanel';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 6: CHECK-IN FIELDS ==========
// Thin wrapper — reads field state from CreateScheduleContext, renders shared panel

const CheckInFieldsTab: React.FC = () => {
  const {
    fieldDefinitions,
    fieldConfig, setFieldConfig,
    pollEnabled,
    topicOfWeekEnabled,
    showToast,
  } = useCreateScheduleContext();

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Configure which fields are available when stations check in to nets created from this schedule.
      </Typography>
      <CheckInFieldsPanel
        fieldDefinitions={fieldDefinitions}
        fieldConfig={fieldConfig}
        setFieldConfig={setFieldConfig}
        pollEnabled={pollEnabled}
        topicOfWeekEnabled={topicOfWeekEnabled}
        showToast={showToast}
      />
    </>
  );
};

export default CheckInFieldsTab;
