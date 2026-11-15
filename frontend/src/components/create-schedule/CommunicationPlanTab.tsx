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
    ics205Enabled, setIcs205Enabled,
    channelPlan, setChannelPlan,
    ics205SpecialInstructions, setIcs205SpecialInstructions,
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
      ics205={{
        enabled: ics205Enabled, setEnabled: setIcs205Enabled,
        plan: channelPlan, setPlan: setChannelPlan,
        specialInstructions: ics205SpecialInstructions, setSpecialInstructions: setIcs205SpecialInstructions,
      }}
    />
  );
};

export default CommunicationPlanTab;
