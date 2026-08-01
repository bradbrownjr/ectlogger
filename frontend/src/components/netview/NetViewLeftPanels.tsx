import React from 'react';
import { Box, Grid } from '@mui/material';
import NetScript from '../NetScript';
import Announcements from '../Announcements';
import ScheduleAnnouncements from '../ScheduleAnnouncements';
import ResizeHandle from '../ResizeHandle';
import useResizableSplit from '../../hooks/useResizableSplit';
import useLayoutTier from '../../hooks/useLayoutTier';
import { STORAGE_KEYS } from '../../utils/localStorageKeys';

// ========== NET VIEW LEFT PANELS (Script + Announcements + Net Notes) ==========
// Ultrawide-only docked slot (see the xl-breakpoint gating in NetView.tsx).
// Unlike the right column (Chat/Activity Log/Map, which are always present
// once docked), these three are on-demand — only opened via the toolbar —
// so each pane, and the column itself, only renders when that pane is both
// open AND docked. Each visible pane's flex share is its minimized state
// ('0 0 auto') or a persisted resizable weight (see useResizableSplit.ts) —
// flexbox distributes the freed space across however many weighted panes
// remain, so no cross-referencing between siblings is needed.
// Purely presentational — the parent owns all state and handlers.

interface NetViewLeftPanelsProps {
  netId: string | undefined;
  net: any;
  canManage: boolean;
  width: number;
  // Inline style override for resizable column-width mode (md+) - see
  // NetView.tsx's leftColumnStyle / useResizableSplit.ts.
  columnStyle?: React.CSSProperties;
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
  columnStyle,
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
  const showScheduleAnnouncements = scheduleAnnouncementsOpen && scheduleAnnouncementsDocked;
  const showAnnouncements = announcementsOpen && announcementsDocked;

  const layoutTier = useLayoutTier();
  const { containerRef, getWeight, startDrag } = useResizableSplit(`${STORAGE_KEYS.LEFT_PANELS_SPLIT}_${layoutTier}`, 'column');

  const panes: Array<{ key: string; minimized: boolean; content: React.ReactNode }> = [];
  if (showScript) {
    panes.push({
      key: 'script',
      minimized: scriptMinimized,
      content: (
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
      ),
    });
  }
  if (showScheduleAnnouncements) {
    panes.push({
      key: 'scheduleAnnouncements',
      minimized: scheduleAnnouncementsMinimized,
      content: (
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
      ),
    });
  }
  if (showAnnouncements) {
    panes.push({
      key: 'notes',
      minimized: announcementsMinimized,
      content: (
        <Announcements
          embedded
          open={announcementsOpen}
          onClose={onCloseAnnouncements}
          announcements={net?.announcements || ''}
          netName={net?.name || 'Net'}
          netId={Number(netId)}
          canEdit={canManage}
          onSaved={onAnnouncementsSaved}
          onUndock={onUndockAnnouncements}
          minimized={announcementsMinimized}
          onMinimize={onMinimizeAnnouncements}
          onRestore={onRestoreAnnouncements}
        />
      ),
    });
  }

  if (panes.length === 0) return null;

  return (
    <Grid item xs={12} xl={width} ref={containerRef} data-pane-key="left" style={columnStyle} sx={{ pr: { xl: 0.25 }, display: 'flex', flexDirection: 'column', gap: 0.25, minHeight: { xs: 300, xl: 0 }, height: { xs: 'auto', xl: '100%' } }}>
      {panes.map((pane, idx) => (
        <React.Fragment key={pane.key}>
          {idx > 0 && !panes[idx - 1].minimized && !pane.minimized && (
            <ResizeHandle direction="column" onDragStart={startDrag(panes[idx - 1].key, pane.key)} />
          )}
          <Box data-pane-key={pane.key} sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: pane.minimized ? '0 0 auto' : `${getWeight(pane.key)} 1 0px`,
            minHeight: pane.minimized ? 'auto' : 0,
            overflow: 'hidden',
          }}>
            {pane.content}
          </Box>
        </React.Fragment>
      ))}
    </Grid>
  );
};

export default NetViewLeftPanels;
