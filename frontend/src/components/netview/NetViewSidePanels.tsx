import React from 'react';
import { Box, Grid } from '@mui/material';
import FloatingWindow from '../FloatingWindow';
import Chat from '../Chat';
import ActivityLog from '../ActivityLog';

// ========== NET VIEW SIDE PANELS (Chat + Activity Log) ==========
// The right-column Chat/Activity Log pair, docked or detached. Chat and
// Activity Log detach independently of each other and of the check-in list.
// Purely presentational — the parent owns all state and handlers.
//
// Note (preserved from the original, not changed by this extraction): the
// docked column only renders when Chat is NOT detached (`!chatDetached`), so
// if Chat is popped out while Activity Log stays docked, Activity Log's own
// docked slot disappears along with the whole column. Activity Log has its
// own inner `!activityLogDetached` check for its own detached state, but that
// inner check can't fire if the outer column itself never renders. The same
// applies to `chatWindowOpen`/`activityLogWindowOpen` (popped into a real
// browser window rather than the in-page floating overlay) — both states
// hide a pane's docked slot the same way.

interface NetViewSidePanelsProps {
  netId: string | undefined;
  net: any;
  canManage: boolean;
  searchQuery: string;
  onlineUserIds: number[];
  checkInListDetached: boolean;
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
}

const NetViewSidePanels: React.FC<NetViewSidePanelsProps> = ({
  netId,
  net,
  canManage,
  searchQuery,
  onlineUserIds,
  checkInListDetached,
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
}) => {
  return (
    <>
      {/* Right column: Chat + Activity Log stacked vertically */}
      {!chatDetached && !chatWindowOpen && (
      <Grid item xs={12} md={checkInListDetached ? 12 : 4} sx={{ pl: { md: 0.5 }, display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: { xs: 300, md: 0 }, height: { xs: 'auto', md: '100%' } }}>
        {/* Chat panel */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: activityLogMinimized ? 1 : (chatMinimized ? '0 0 auto' : 1),
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

        {/* Activity Log panel */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: chatMinimized ? 1 : (activityLogMinimized ? '0 0 auto' : 1),
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
              {!activityLogDetached && !activityLogWindowOpen && <ActivityLog netId={Number(netId)}
                  minimized={activityLogMinimized} onMinimize={() => setActivityLogMinimized(true)} onRestore={() => setActivityLogMinimized(false)} onDetach={() => setActivityLogDetached(true)} onPopOut={handlePopOutActivityLog} />}
            </Box>
          </FloatingWindow>
        </Box>
      </Grid>
      )}

      {/* Floating Chat when detached */}
      {chatDetached && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
        <FloatingWindow
          title="Chat"
          isDetached={true}
          onDetach={handleDetachChat}
          onAttach={handleAttachChat}
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
