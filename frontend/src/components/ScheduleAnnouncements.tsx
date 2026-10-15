import React, { useEffect, useState } from 'react';
import { templateApi } from '../services/api';
import MarkdownDocPanel from './shared/MarkdownDocPanel';

// ========== SCHEDULE ANNOUNCEMENTS ==========
// The schedule's standing announcements (NetTemplate.announcements), shown on
// each of its nets. Not part of the net's own data, so this wrapper fetches
// them itself whenever the panel opens. All of the panel itself is
// MarkdownDocPanel.

interface ScheduleAnnouncementsProps {
  open: boolean;
  onClose?: () => void;
  templateId: number;
  netName: string;
  canEdit?: boolean;
  embedded?: boolean;
  onUndock?: () => void;
  onDock?: () => void;
  onPopOut?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const ScheduleAnnouncements: React.FC<ScheduleAnnouncementsProps> = ({ templateId, canEdit = false, ...panel }) => {
  const [announcements, setAnnouncements] = useState('');

  useEffect(() => {
    if (panel.open && templateId) {
      templateApi.get(templateId)
        .then(res => setAnnouncements(res.data.announcements || ''))
        .catch(() => setAnnouncements(''));
    }
  }, [panel.open, templateId]);

  return (
    <MarkdownDocPanel
      {...panel}
      title="Announcements"
      content={announcements}
      emptyText="No schedule announcements have been defined."
      look="colored"
      defaultX={100}
      canEdit={canEdit}
      editTooltip="Edit announcements"
      draftKey={templateId ? `schedule-announcements:${templateId}` : null}
      onSave={async (text) => {
        await templateApi.update(templateId, { announcements: text });
        setAnnouncements(text);
      }}
    />
  );
};

export default ScheduleAnnouncements;
