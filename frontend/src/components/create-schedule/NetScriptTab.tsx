import React from 'react';
import NetScriptPanel from '../forms/NetScriptPanel';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 4: NET SCRIPT ==========
// Thin wrapper — reads script state from CreateScheduleContext, renders shared panel

const NetScriptTab: React.FC = () => {
  const { script, setScript } = useCreateScheduleContext();
  return <NetScriptPanel script={script} setScript={setScript} />;
};

export default NetScriptTab;
