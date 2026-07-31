import React from 'react';
import { Box, Grid } from '@mui/material';
import NetScript from '../NetScript';
import Announcements from '../Announcements';
import ScheduleAnnouncements from '../ScheduleAnnouncements';

// ========== NET VIEW LEFT PANELS (Script + Notes + Schedule Announcements) ==========
// Ultrawide-only docked slot (see the xl-breakpoint gating in NetView.tsx).
// Unlike the right column (Chat/Activity Log/Map, which are always present
// once docked), these three are on-demand — only opened via the toolbar —
// so each pane, and the column itself, only renders when that pane is both
// open AND docked. Each visible pane's flex share is just its own minimized
// state (0 0 auto when minimized, 1 otherwise) — flexbox distributes the
// freed space across however many flex:1 panes remain, so no cross-
// referencing between siblings is needed the way it might first seem.
// Purely presentational — the parent owns all state and handlers.

interface NetViewLeftPanelsProps {
  netId: string | undefined;
  net: any;
  canManage: boolean;
  width: number;
  scriptOpen: boolean;
  scriptDocked: boolean;
  scriptMinimized: boolean;
  announcementsOpen: boolean;
  announcementsDocked: boolean;
  announcementsMinimized: boolean;
  scheduleAnnouncementsOpen: boolean;
  scheduleAnnouncementsDocked: boolean;
  scheduleAnnouncementsMinimized: boolean;
  onCloseScript: () => void;
  onCloseAnnouncements: () => void;
  onCloseScheduleAnnouncements: () => void;
  onUndockScript: () => void;
  onUndockAnnouncements: () => void;
  onUndockScheduleAnnouncements: () => void;
  onMinimizeScript: () => void;
  onRestoreScript: () => void;
  onMinimizeAnnouncements: () => void;
  onRestoreAnnouncements: () => void;
  onMinimizeScheduleAnnouncements: () => void;
  onRestoreScheduleAnnouncements: () => void;
  onScriptSaved: (newScript: string) => void;
  onAnnouncementsSaved: (newAnnouncements: string) => void;
}

const NetViewLeftPanels: React.FC<NetViewLeftPanelsProps> = ({
  netId,
  net,
  canManage,
  width,
  scriptOpen,
  scriptDocked,
  scriptMinimized,
  announcementsOpen,
  announcementsDocked,
  announcementsMinimized,
  scheduleAnnouncementsOpen,
  scheduleAnnouncementsDocked,
  scheduleAnnouncementsMinimized,
  onCloseScript,
  onCloseAnnouncements,
  onCloseScheduleAnnouncements,
  onUndockScript,
  onUndockAnnouncements,
  onUndockScheduleAnnouncements,
  onMinimizeScript,
  onRestoreScript,
  onMinimizeAnnouncements,
  onRestoreAnnouncements,
  onMinimizeScheduleAnnouncements,
  onRestoreScheduleAnnouncements,
  onScriptSaved,
  onAnnouncementsSaved,
}) => {
  const showScript = scriptOpen && scriptDocked;
  const showAnnouncements = announcementsOpen && announcementsDocked;
  const showScheduleAnnouncements = scheduleAnnouncementsOpen && scheduleAnnouncementsDocked;

  if (!showScript && !showAnnouncements && !showScheduleAnnouncements) return null;

  return (
    <Grid item xs={12} xl={width} sx={{ pr: { xl: 0.5 }, display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: { xs: 300, xl: 0 }, height: { xs: 'auto', xl: '100%' } }}>
      {showScript && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: scriptMinimized ? '0 0 auto' : 1,
          minHeight: scriptMinimized ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          <NetScript
            embedded
            open={scriptOpen}
            onClose={onCloseScript}
            script={net?.script || ''}
            netName={net?.name || 'Net'}
            netId={Number(netId)}
            templateId={net?.template_id}
            canEdit={canManage && !!net?.template_id}
            onSaved={onScriptSaved}
            onUndock={onUndockScript}
            minimized={scriptMinimized}
            onMinimize={onMinimizeScript}
            onRestore={onRestoreScript}
          />
        </Box>
      )}
      {showAnnouncements && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: announcementsMinimized ? '0 0 auto' : 1,
          minHeight: announcementsMinimized ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          <Announcements
            embedded
            open={announcementsOpen}
            onClose={onCloseAnnouncements}
            announcements={net?.announcements || ''}
            netName={net?.name || 'Net'}
            netId={Number(netId)}
            templateId={net?.template_id}
            canEdit={canManage && !!net?.template_id}
            onSaved={onAnnouncementsSaved}
            onUndock={onUndockAnnouncements}
            minimized={announcementsMinimized}
            onMinimize={onMinimizeAnnouncements}
            onRestore={onRestoreAnnouncements}
          />
        </Box>
      )}
      {showScheduleAnnouncements && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: scheduleAnnouncementsMinimized ? '0 0 auto' : 1,
          minHeight: scheduleAnnouncementsMinimized ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          <ScheduleAnnouncements
            embedded
            open={scheduleAnnouncementsOpen}
            onClose={onCloseScheduleAnnouncements}
            netName={net?.name || 'Net'}
            templateId={net?.template_id}
            canEdit={canManage}
            onUndock={onUndockScheduleAnnouncements}
            minimized={scheduleAnnouncementsMinimized}
            onMinimize={onMinimizeScheduleAnnouncements}
            onRestore={onRestoreScheduleAnnouncements}
          />
        </Box>
      )}
    </Grid>
  );
};

export default NetViewLeftPanels;
