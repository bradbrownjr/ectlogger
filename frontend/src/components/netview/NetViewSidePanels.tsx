import React from 'react';
import { Box, Grid } from '@mui/material';
import FloatingWindow from '../FloatingWindow';
import Chat from '../Chat';
import ActivityLog from '../ActivityLog';

// ========== NET VIEW SIDE PANELS (Chat + Activity Log) ==========
// The right-column Chat/Activity Log pair, docked or detached. Chat and
// Activity Log detach independently of each other and of the check-in list.
// Each pane's docked Box renders only when that pane is actually docked, so
// undocking one (float or real-window pop-out) lets the other expand to
// fill the freed space instead of the whole column disappearing. The
// check-in list's own width (NetView.tsx) expands separately once BOTH
// panes are undocked and this column has nothing left in it.
// Purely presentational — the parent owns all state and handlers.

interface NetViewSidePanelsProps {
  netId: string | undefined;
  net: any;
  canManage: boolean;
  searchQuery: string;
  onlineUserIds: number[];
  checkInListDetached: boolean;
  checkInListWindowOpen: boolean;
  chatDetached: boolean;
  activityLogDetached: boolean;
  chatWindowOpen: boolean;
  activityLogWindowOpen: boolean;
  chatMinimized: boolean;
  activityLogMinimized: boolean;
  setProfileUserId: (userId: number | null) => void;
  setChatMinimized: (v: boolean) => void;
  setActivityLogMinimized: (v: boolean) => void;
  setActivityLogDetached: (v: boolean) => void;
  handleAttachChat: () => void;
  handleDetachChat: () => void;
  handleAttachActivityLog: () => void;
  handleDetachActivityLog: () => void;
  handlePopOutChat: () => void;
  handlePopOutActivityLog: () => void;
  handleFloatToWindowChat: () => void;
  handleFloatToWindowActivityLog: () => void;
}

const NetViewSidePanels: React.FC<NetViewSidePanelsProps> = ({
  netId,
  net,
  canManage,
  searchQuery,
  onlineUserIds,
  checkInListDetached,
  checkInListWindowOpen,
  chatDetached,
  activityLogDetached,
  chatWindowOpen,
  activityLogWindowOpen,
  chatMinimized,
  activityLogMinimized,
  setProfileUserId,
  setChatMinimized,
  setActivityLogMinimized,
  setActivityLogDetached,
  handleAttachChat,
  handleDetachChat,
  handleAttachActivityLog,
  handleDetachActivityLog,
  handlePopOutChat,
  handlePopOutActivityLog,
  handleFloatToWindowChat,
  handleFloatToWindowActivityLog,
}) => {
  const chatDocked = !chatDetached && !chatWindowOpen;
  const activityLogDocked = !activityLogDetached && !activityLogWindowOpen;

  return (
    <>
      {/* Right column: Chat + Activity Log stacked vertically. Each pane
          renders only when it's docked, so the other expands into the
          freed space instead of the whole column disappearing. */}
      {(chatDocked || activityLogDocked) && (
      <Grid item xs={12} md={(checkInListDetached || checkInListWindowOpen) ? 12 : 4} sx={{ pl: { md: 0.5 }, display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: { xs: 300, md: 0 }, height: { xs: 'auto', md: '100%' } }}>
        {/* Chat panel */}
        {chatDocked && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: (!activityLogDocked || activityLogMinimized) ? 1 : (chatMinimized ? '0 0 auto' : 1),
          minHeight: chatMinimized ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          <FloatingWindow
            title="Chat"
            isDetached={false}
            onAttach={handleAttachChat}
            defaultWidth={450}
            defaultHeight={500}
            minWidth={300}
            minHeight={250}
            storageKey="chat"
          >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Chat netId={Number(netId)} netStartedAt={net?.started_at} netStatus={net?.status} searchQuery={searchQuery} canManage={canManage} onDetach={handleDetachChat} onPopOut={handlePopOutChat}
                  chatGracePeriodMinutes={net?.chat_grace_period_minutes ?? undefined} closedAt={net?.closed_at}
                  onlineUserIds={onlineUserIds} onProfileClick={(id) => setProfileUserId(id)}
                  minimized={chatMinimized} onMinimize={() => setChatMinimized(true)} onRestore={() => setChatMinimized(false)} />
              </Box>
            </Box>
          </FloatingWindow>
        </Box>
        )}

        {/* Activity Log panel */}
        {activityLogDocked && (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: (!chatDocked || chatMinimized) ? 1 : (activityLogMinimized ? '0 0 auto' : 1),
          minHeight: activityLogMinimized ? 'auto' : 0,
          overflow: 'hidden',
        }}>
          <FloatingWindow
            title="Activity Log"
            isDetached={false}
            onAttach={() => {}}
            defaultWidth={450}
            defaultHeight={500}
            minWidth={300}
            minHeight={250}
            storageKey="activityLog"
          >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ActivityLog netId={Number(netId)}
                  minimized={activityLogMinimized} onMinimize={() => setActivityLogMinimized(true)} onRestore={() => setActivityLogMinimized(false)} onDetach={() => setActivityLogDetached(true)} onPopOut={handlePopOutActivityLog} />
            </Box>
          </FloatingWindow>
        </Box>
        )}
      </Grid>
      )}

      {/* Floating Chat when detached */}
      {chatDetached && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
        <FloatingWindow
          title="Chat"
          isDetached={true}
          onDetach={handleDetachChat}
          onAttach={handleAttachChat}
          onPopOut={handleFloatToWindowChat}
          defaultWidth={450}
          defaultHeight={500}
          minWidth={300}
          minHeight={250}
          storageKey="chat"
        >
          <Chat netId={Number(netId)} netStartedAt={net?.started_at} netStatus={net?.status} searchQuery={searchQuery} canManage={canManage}
            chatGracePeriodMinutes={net?.chat_grace_period_minutes ?? undefined} closedAt={net?.closed_at}
            onlineUserIds={onlineUserIds} onProfileClick={(id) => setProfileUserId(id)} />
        </FloatingWindow>
      )}

      {/* Floating Activity Log when detached */}
      {activityLogDetached && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
        <FloatingWindow
          title="Activity Log"
          isDetached={true}
          onDetach={handleDetachActivityLog}
          onAttach={handleAttachActivityLog}
          onPopOut={handleFloatToWindowActivityLog}
          defaultWidth={450}
          defaultHeight={500}
          minWidth={300}
          minHeight={250}
          storageKey="activityLog"
        >
          <ActivityLog netId={Number(netId)} />
        </FloatingWindow>
      )}
    </>
  );
};

export default NetViewSidePanels;
