import React from 'react';
import { netApi } from '../services/api';
import MarkdownDocPanel from './shared/MarkdownDocPanel';

// ========== NET NOTES ==========
// This one net's own notes (net.announcements), titled "Net Notes" on
// screen. Not the schedule's standing announcements, which are
// ScheduleAnnouncements.tsx. All of the panel itself is MarkdownDocPanel.

interface AnnouncementsProps {
  open: boolean;
  onClose?: () => void;
  announcements: string;
  netName: string;
  netId: number;
  canEdit?: boolean;
  onSaved?: (newAnnouncements: string) => void;
  embedded?: boolean;
  onUndock?: () => void;
  onDock?: () => void;
  onPopOut?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const Announcements: React.FC<AnnouncementsProps> = ({ announcements, netId, canEdit = false, onSaved, ...panel }) => (
  <MarkdownDocPanel
    {...panel}
    title="Net Notes"
    content={announcements}
    emptyText="No notes have been added to this net."
    look="colored"
    canEdit={canEdit}
    editTooltip="Edit notes"
    draftKey={netId ? `net-announcements:${netId}` : null}
    onSave={async (text) => {
      await netApi.update(netId, { announcements: text });
      onSaved?.(text);
    }}
  />
);

export default Announcements;
