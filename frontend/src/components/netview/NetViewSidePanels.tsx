import React from 'react';
import { Box, Grid } from '@mui/material';
import FloatingWindow from '../FloatingWindow';
import Chat from '../Chat';
import ActivityLog from '../ActivityLog';
import CheckInMap from '../CheckInMap';
import CoveragePanel from './CoveragePanel';
import TrafficPanel from './TrafficPanel';
import ResizeHandle from '../ResizeHandle';
import useResizableSplit from '../../hooks/useResizableSplit';
import useLayoutTier from '../../hooks/useLayoutTier';
import { STORAGE_KEYS } from '../../utils/localStorageKeys';

// ========== NET VIEW SIDE PANELS (Chat + Map + Coverage + Traffic + Activity Log) ==========
// The right-column stack, docked or detached. All five detach independently
// of each other and of the check-in list. Each pane's docked Box renders
// only when that pane is actually docked/shown, so the others expand to
// fill the freed space instead of the whole column disappearing (or, if
// none are present, the column itself doesn't render). The check-in list's
// own width (NetView.tsx) expands separately once nothing is left in this
// column.
//
// Stacking order is fixed: Chat, then whichever of Map/Coverage/Traffic are
// open, then Activity Log LAST — see the `panes.push` calls below. Activity
// Log is always the bottom-most pane so it stays in a predictable place
// regardless of which on-demand panels happen to be open that session.
//
// Unlike Chat/Activity Log (always present once docked), Map and Coverage
// are on-demand — only opened via the toolbar — so they additionally need
// mapOpen/coverageOpen true, not just mapDocked/coverageDocked. Map's own
// minimize state lives inside CheckInMap itself (not lifted here), so its
// flex share is always 1 rather than being part of the chat/activityLog
// minimized cross-referencing below. Coverage's minimize state IS lifted
// (coverageMinimized), same as Chat/Activity Log, since CoveragePanel is a
// simple Chat-style chrome wrapper rather than CheckInMap's own multi-mode
// (dialog/maximized/embedded) component.
// Purely presentational — the parent owns all state and handlers.

interface NetViewSidePanelsProps {
  netId: string | undefined;
  net: any;
  canManage: boolean;
  searchQuery: string;
  onlineUserIds: number[];
  width: number;
  // Inline style override for resizable column-width mode (md+) - see
  // NetView.tsx's rightColumnStyle / useResizableSplit.ts.
  columnStyle?: React.CSSProperties;
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
  handlePopOutChat: () => void;
  handlePopOutActivityLog: () => void;
  handleFloatToWindowChat: () => void;
  handleFloatToWindowActivityLog: () => void;
  // Map (right column, on-demand — no width gate; see DESIGN.md "Docked
  // Pane Width Gating")
  mapOpen: boolean;
  mapDocked: boolean;
  filteredCheckIns: any[];
  ncsUserIds: number[];
  loggerUserIds: number[];
  relayUserIds: number[];
  onCloseMap: () => void;
  onUndockMap: () => void;
  handlePopOutMap: () => void;
  mapMinimized: boolean;
  onMinimizeMap: () => void;
  onRestoreMap: () => void;
  // "Can hear" coverage overlay data (Phase 4, see docs/ROADMAP.md) - passed
  // through to the docked CheckInMap exactly as NetView.tsx passes it to its
  // own floating CheckInMap instance, rather than re-fetching here.
  canHearReports: any[];
  // Station Coverage side panel (Phase 3 chrome + Phase 4 map cross-link).
  // On-demand like Map above (opened via the toolbar), so it also needs
  // coverageOpen true, not just coverageDocked.
  coverageOpen: boolean;
  coverageDocked: boolean;
  coverageMinimized: boolean;
  onCloseCoverage: () => void;
  onUndockCoverage: () => void;
  onAttachCoverage: () => void;
  handlePopOutCoverage: () => void;
  handleFloatToWindowCoverage: () => void;
  onMinimizeCoverage: () => void;
  onRestoreCoverage: () => void;
  // Shared with CheckInMap's coverage overlay - the same two pieces of
  // state threaded to both the docked CheckInMap instance and CoveragePanel
  // is what makes clicking a callsign in one reflect in the other.
  coverageOverlayOn: boolean;
  onToggleCoverageOverlay: () => void;
  highlightedCallsign: string | null;
  setHighlightedCallsign: (callsign: string | null) => void;
  onShowCoverageOnMap: () => void;
  // Traffic side panel (Assisted Traffic Handling & Forms). On-demand like
  // Map/Coverage above -- opened from the toolbar's Traffic button, which
  // itself only exists when net.traffic_enabled and the viewer is that net's
  // NCS/logger/owner/admin (TRAFFIC-HANDLING-DESIGN.md D3 rule 4).
  currentUserId?: number;
  showTraffic: boolean;
  trafficOpen: boolean;
  trafficDocked: boolean;
  trafficMinimized: boolean;
  onCloseTraffic: () => void;
  // Opens NetView's page-level FileTrafficDialog. Both the docked and the
  // floating TrafficPanel get it, since either can be the one on screen.
  onComposeTraffic: () => void;
  onUndockTraffic: () => void;
  onAttachTraffic: () => void;
  handlePopOutTraffic: () => void;
  handleFloatToWindowTraffic: () => void;
  onMinimizeTraffic: () => void;
  onRestoreTraffic: () => void;
}

const NetViewSidePanels: React.FC<NetViewSidePanelsProps> = ({
  netId,
  net,
  canManage,
  searchQuery,
  onlineUserIds,
  width,
  columnStyle,
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
  handlePopOutChat,
  handlePopOutActivityLog,
  handleFloatToWindowChat,
  handleFloatToWindowActivityLog,
  mapOpen,
  mapDocked,
  filteredCheckIns,
  ncsUserIds,
  loggerUserIds,
  relayUserIds,
  onCloseMap,
  onUndockMap,
  handlePopOutMap,
  mapMinimized,
  onMinimizeMap,
  onRestoreMap,
  canHearReports,
  coverageOpen,
  coverageDocked,
  coverageMinimized,
  onCloseCoverage,
  onUndockCoverage,
  onAttachCoverage,
  handlePopOutCoverage,
  handleFloatToWindowCoverage,
  onMinimizeCoverage,
  onRestoreCoverage,
  coverageOverlayOn,
  onToggleCoverageOverlay,
  highlightedCallsign,
  setHighlightedCallsign,
  onShowCoverageOnMap,
  currentUserId,
  showTraffic,
  trafficOpen,
  trafficDocked,
  trafficMinimized,
  onCloseTraffic,
  onComposeTraffic,
  onUndockTraffic,
  onAttachTraffic,
  handlePopOutTraffic,
  handleFloatToWindowTraffic,
  onMinimizeTraffic,
  onRestoreTraffic,
}) => {
  const chatDocked = !chatDetached && !chatWindowOpen;
  const activityLogDocked = !activityLogDetached && !activityLogWindowOpen;
  const showMap = mapOpen && mapDocked;
  const showCoverageDocked = coverageOpen && coverageDocked;
  // Frequency label lookup shared by the docked CheckInMap and CoveragePanel
  // below - same shape/convention NetView.tsx's own instances build.
  const frequencyLabels = Object.fromEntries(
    (net?.frequencies || []).map((f: any) => [f.id, `${f.frequency || f.network || ''} ${f.mode || ''}`.trim()])
  );

  const layoutTier = useLayoutTier();
  const { containerRef, getWeight, hasExplicitWeight, startDrag } = useResizableSplit(`${STORAGE_KEYS.RIGHT_PANELS_SPLIT}_${layoutTier}`, 'column');
  // Chat (and Activity Log, when expanded) legitimately want to grow into
  // whatever height the column has -- a scrolling conversation/log looks
  // right filling the space. Traffic's list does not: with only a handful
  // of items it has nothing to grow INTO, and forcing it to fill an equal
  // flex-grow share left a slab of blank space below its table with nothing
  // else in the panel to explain it. Until a user deliberately drags it
  // bigger (hasExplicitWeight becomes true and it re-joins the normal
  // weighted pool below), Traffic sizes to its own content and leaves any
  // surplus column height to Chat, same as it would for a plain web page
  // that doesn't fill a tall viewport.
  const paneFlex = (key: string, minimized: boolean): string => {
    if (minimized) return '0 0 auto';
    if (key === 'traffic' && !hasExplicitWeight('traffic')) return '0 1 auto';
    return `${getWeight(key)} 1 0px`;
  };

  // Ordered list of the panes actually rendered this pass, so a
  // ResizeHandle is only inserted between two panes that are genuinely
  // adjacent in the DOM (e.g. Chat+Map directly if Activity Log is
  // detached) and only when both sides are expanded - a minimized
  // neighbor keeps its fixed '0 0 auto' height and doesn't participate
  // in the resizable pool.
  const panes: Array<{ key: string; minimized: boolean; content: React.ReactNode }> = [];
  if (chatDocked) {
    panes.push({
      key: 'chat',
      minimized: chatMinimized,
      content: (
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
      ),
    });
  }
  if (showMap) {
    panes.push({
      key: 'map',
      minimized: mapMinimized,
      content: (
        <CheckInMap
          embedded
          open={mapOpen}
          onClose={onCloseMap}
          checkIns={filteredCheckIns}
          netName={net?.name || 'Net'}
          ncsUserIds={ncsUserIds}
          loggerUserIds={loggerUserIds}
          relayUserIds={relayUserIds}
          onUndock={onUndockMap}
          onPopOut={handlePopOutMap}
          minimized={mapMinimized}
          onMinimize={onMinimizeMap}
          onRestore={onRestoreMap}
          canHearReports={canHearReports}
          frequencyLabels={frequencyLabels}
          coverageOverlayOn={coverageOverlayOn}
          onToggleCoverageOverlay={onToggleCoverageOverlay}
          highlightedCallsign={highlightedCallsign}
        />
      ),
    });
  }
  if (showCoverageDocked) {
    panes.push({
      key: 'coverage',
      minimized: coverageMinimized,
      content: (
        <CoveragePanel
          netId={Number(netId)}
          reports={canHearReports}
          frequencyLabels={frequencyLabels}
          showFrequencyColumn={(net?.frequencies || []).length > 1}
          highlightedCallsign={highlightedCallsign}
          onHighlightCallsign={setHighlightedCallsign}
          onShowOnMap={onShowCoverageOnMap}
          onClose={onCloseCoverage}
          onDetach={onUndockCoverage}
          onPopOut={handlePopOutCoverage}
          minimized={coverageMinimized}
          onMinimize={onMinimizeCoverage}
          onRestore={onRestoreCoverage}
        />
      ),
    });
  }
  if (showTraffic) {
    panes.push({
      key: 'traffic',
      minimized: trafficMinimized,
      content: (
        <TrafficPanel
          netId={Number(netId)}
          currentUserId={currentUserId}
          onCompose={onComposeTraffic}
          onClose={onCloseTraffic}
          onDetach={onUndockTraffic}
          onPopOut={handlePopOutTraffic}
          minimized={trafficMinimized}
          onMinimize={onMinimizeTraffic}
          onRestore={onRestoreTraffic}
        />
      ),
    });
  }
  // Activity Log is pushed LAST regardless of which on-demand panels above
  // are open, so it always renders at the bottom of the stack. It's the
  // net's running record — the one pane an NCS expects to find in the same
  // place every time, rather than shuffled by whichever panels happen to be
  // open. See DESIGN.md "Docked Pane Stacking Order".
  if (activityLogDocked) {
    panes.push({
      key: 'activityLog',
      minimized: activityLogMinimized,
      content: (
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
      ),
    });
  }

  return (
    <>
      {/* Right column, stacked vertically in `panes` order (Chat, then
          Map/Coverage/Traffic, then Activity Log last — see the push calls
          above). Each pane renders only when it's docked/shown, so the
          others expand into the freed space instead of the whole column
          disappearing. Drag handles between expanded panes let the split be
          resized; see useResizableSplit.ts. */}
      {panes.length > 0 && (
      <Grid item xs={12} md={width} ref={containerRef} data-pane-key="right" style={columnStyle} sx={{ pl: { md: 0.25 }, display: 'flex', flexDirection: 'column', gap: 0.25, minHeight: { xs: 300, md: 0 }, height: { xs: 'auto', md: '100%' } }}>
        {panes.map((pane, idx) => (
          <React.Fragment key={pane.key}>
            {idx > 0 && !panes[idx - 1].minimized && !pane.minimized && (
              <ResizeHandle direction="column" onDragStart={startDrag(panes[idx - 1].key, pane.key)} />
            )}
            <Box data-pane-key={pane.key} sx={{
              display: 'flex',
              flexDirection: 'column',
              flex: paneFlex(pane.key, pane.minimized),
              minHeight: pane.minimized ? 'auto' : 0,
              overflow: 'hidden',
            }}>
              {pane.content}
            </Box>
          </React.Fragment>
        ))}
      </Grid>
      )}

      {/* Floating Chat when detached */}
      {chatDetached && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
        <FloatingWindow
          title="Chat"
          isDetached={true}
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

      {/* Floating Station Coverage panel - on-demand like Map (needs
          coverageOpen true, not just "not docked"), unlike Chat/Activity Log
          which are always present once opted into floating and so have no
          separate "closed" state. onAttachCoverage (dock, available at any
          width -- see DESIGN.md "Docked Pane Width Gating") and
          onCloseCoverage (real close, always available) are two distinct
          actions -- see FloatingWindow.tsx's onAttach/onClose. */}
      {coverageOpen && !coverageDocked && (net.status === 'active' || net.status === 'lobby' || net.status === 'closed' || net.status === 'archived') && (
        <FloatingWindow
          title="Station Coverage"
          isDetached={true}
          onAttach={onAttachCoverage}
          onClose={onCloseCoverage}
          onPopOut={handleFloatToWindowCoverage}
          // Wide enough by default to fit Reporter/Link Type/Heard
          // Station/Frequency/Reported without wrapping - matches Traffic's
          // default just below.
          defaultWidth={900}
          defaultHeight={450}
          minWidth={350}
          minHeight={250}
          storageKey="coverage"
        >
          <CoveragePanel
            netId={Number(netId)}
            reports={canHearReports}
            frequencyLabels={frequencyLabels}
            showFrequencyColumn={(net?.frequencies || []).length > 1}
            highlightedCallsign={highlightedCallsign}
            onHighlightCallsign={setHighlightedCallsign}
            onShowOnMap={onShowCoverageOnMap}
          />
        </FloatingWindow>
      )}

      {/* Floating Traffic panel - same on-demand shape as Coverage above.
          Unlike Coverage, no net-status gate: traffic filed on a closed or
          archived net still needs viewing and handing off afterwards, which
          is the whole point of the chain of custody. */}
      {trafficOpen && !trafficDocked && (
        <FloatingWindow
          title="Traffic"
          isDetached={true}
          onAttach={onAttachTraffic}
          onClose={onCloseTraffic}
          onPopOut={handleFloatToWindowTraffic}
          // Wide enough by default to fit TrafficTable's seven columns
          // (Number, Precedence, Type, Addressee, Disposition, Age, Held By)
          // without wrapping the header text or needing horizontal scroll --
          // Coverage/Map's narrower defaults suit their leaner tables, not
          // this one.
          defaultWidth={900}
          defaultHeight={550}
          minWidth={350}
          minHeight={250}
          storageKey="traffic"
        >
          <TrafficPanel netId={Number(netId)} currentUserId={currentUserId} onCompose={onComposeTraffic} />
        </FloatingWindow>
      )}
    </>
  );
};

export default NetViewSidePanels;
