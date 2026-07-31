import React from 'react';
import { Box, Grid } from '@mui/material';
import NetScript from '../NetScript';
import Announcements from '../Announcements';

// ========== NET VIEW LEFT PANELS (Script + Announcements) ==========
// Ultrawide-only docked slot (see the xl-breakpoint gating in NetView.tsx).
// Unlike the right column (Chat/Activity Log/Map, which are always present
// once docked), Script and Announcements are on-demand — only opened via
// the toolbar — so each pane, and the column itself, only renders when that
// pane is both open AND docked. Purely presentational — the parent owns
// all state and handlers.

interface NetViewLeftPanelsProps {
  netId: string | undefined;
  net: any;
  canManage: boolean;
  width: number;
  scriptOpen: boolean;
  scriptDocked: boolean;
  announcementsOpen: boolean;
  announcementsDocked: boolean;
  onCloseScript: () => void;
  onCloseAnnouncements: () => void;
  onUndockScript: () => void;
  onUndockAnnouncements: () => void;
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
  announcementsOpen,
  announcementsDocked,
  onCloseScript,
  onCloseAnnouncements,
  onUndockScript,
  onUndockAnnouncements,
  onScriptSaved,
  onAnnouncementsSaved,
}) => {
  const showScript = scriptOpen && scriptDocked;
  const showAnnouncements = announcementsOpen && announcementsDocked;

  if (!showScript && !showAnnouncements) return null;

  return (
    <Grid item xs={12} xl={width} sx={{ pr: { xl: 0.5 }, display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: { xs: 300, xl: 0 }, height: { xs: 'auto', xl: '100%' } }}>
      {showScript && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
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
          />
        </Box>
      )}
      {showAnnouncements && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
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
          />
        </Box>
      )}
    </Grid>
  );
};

export default NetViewLeftPanels;
