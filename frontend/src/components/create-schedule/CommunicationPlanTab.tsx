import React from 'react';
import CommunicationPlanPanel from '../forms/CommunicationPlanPanel';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 3: COMMUNICATION PLAN ==========
// Thin wrapper — reads frequency state from CreateScheduleContext, renders shared panel

const CommunicationPlanTab: React.FC = () => {
  const {
    frequencies, setFrequencies,
    selectedFrequencyIds, setSelectedFrequencyIds,
    propagationLoggingEnabled,
    coverageExcludedFrequencyIds, setCoverageExcludedFrequencyIds,
    scheduleId,
  } = useCreateScheduleContext();

  return (
    <CommunicationPlanPanel
      frequencies={frequencies}
      setFrequencies={setFrequencies as any}
      selectedFrequencyIds={selectedFrequencyIds}
      setSelectedFrequencyIds={setSelectedFrequencyIds}
      context={scheduleId ? { template_id: parseInt(scheduleId) } : undefined}
      coverageExcludedFrequencyIds={propagationLoggingEnabled ? coverageExcludedFrequencyIds : undefined}
      setCoverageExcludedFrequencyIds={propagationLoggingEnabled ? setCoverageExcludedFrequencyIds : undefined}
    />
  );
};

export default CommunicationPlanTab;
