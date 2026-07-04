import React from 'react';
import CommunicationPlanPanel from '../forms/CommunicationPlanPanel';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 3: COMMUNICATION PLAN ==========
// Thin wrapper — reads frequency state from CreateScheduleContext, renders shared panel

const CommunicationPlanTab: React.FC = () => {
  const {
    frequencies, setFrequencies,
    selectedFrequencyIds, setSelectedFrequencyIds,
  } = useCreateScheduleContext();

  return (
    <CommunicationPlanPanel
      frequencies={frequencies}
      setFrequencies={setFrequencies as any}
      selectedFrequencyIds={selectedFrequencyIds}
      setSelectedFrequencyIds={setSelectedFrequencyIds}
    />
  );
};

export default CommunicationPlanTab;
