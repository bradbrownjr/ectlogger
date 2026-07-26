import React from 'react';
import AnnouncementsPanel from '../forms/AnnouncementsPanel';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 5: ANNOUNCEMENTS ==========
// Thin wrapper — reads announcements state from CreateScheduleContext, renders shared panel

const AnnouncementsTab: React.FC = () => {
  const { announcements, setAnnouncements } = useCreateScheduleContext();
  return (
    <AnnouncementsPanel
      announcements={announcements}
      setAnnouncements={setAnnouncements}
      footerCaption={`${announcements.length} characters • Supports Markdown formatting • Saved with the schedule on Save Changes`}
    />
  );
};

export default AnnouncementsTab;
