import React, { useMemo } from 'react';
import { Box, Chip, Divider, Tooltip, Typography } from '@mui/material';
import FloatingWindow from '../FloatingWindow';
import { CoverageSite } from '../../utils/coverageSites';
import { BoardGroup, buildSiteBoard } from '../../utils/stationPlace';

// ========== SITES BOARD ==========
// A tag-out board for a net with sites: every station checked in right now,
// grouped by where it is (each site, Traveling, Home, Field Deployed, Not at
// a site). A site the net is working shows even with nobody there, so an
// unstaffed shelter stands out. Live from the check-in list, so it moves as
// stations check in, move and check out (utils/stationPlace.ts). Floating,
// so net control can keep it beside the check-in table.
//
// SiteGroups is the list itself, shared with the net report (which shows
// every row, not just live ones).

export const SiteGroups: React.FC<{ groups: BoardGroup[]; dense?: boolean }> = ({ groups, dense }) => (
  <Box>
    {groups.map((group, i) => (
      <Box key={group.key} sx={{ py: dense ? 0.5 : 1 }}>
        {i > 0 && <Divider sx={{ mb: dense ? 0.5 : 1 }} />}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" component="h3">{group.label}</Typography>
          {group.detail && <Typography variant="caption" color="text.secondary">{group.detail}</Typography>}
          <Typography variant="caption" color={group.stations.length ? 'text.secondary' : 'warning.main'} sx={{ ml: 'auto' }}>
            {group.stations.length ? `${group.stations.length} station${group.stations.length === 1 ? '' : 's'}` : 'Nobody here'}
          </Typography>
        </Box>
        {group.stations.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {group.stations.map((st) => (
              <Tooltip key={st.checkInId} title={[st.name, st.location].filter(Boolean).join(', ')}>
                <Chip size="small" variant="outlined" label={st.callsign} />
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>
    ))}
  </Box>
);

interface SitesBoardProps {
  open: boolean;
  onClose: () => void;
  checkIns: any[];
  sites: CoverageSite[];
}

const SitesBoard: React.FC<SitesBoardProps> = ({ open, onClose, checkIns, sites }) => {
  const groups = useMemo(() => buildSiteBoard(checkIns, sites, true), [checkIns, sites]);
  if (!open) return null;
  return (
    <FloatingWindow title="Sites" isDetached onClose={onClose} storageKey="sitesBoard" defaultWidth={380} defaultHeight={460}>
      <Box sx={{ p: 1.5, overflowY: 'auto', height: '100%' }}>
        <SiteGroups groups={groups} />
      </Box>
    </FloatingWindow>
  );
};

export default SitesBoard;
