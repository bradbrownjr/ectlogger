import React, { useState } from 'react';
import { Box, Chip, Menu, MenuItem, Tooltip } from '@mui/material';
import { formatTimeWithDate } from '../../utils/dateUtils';
import { StationRow } from '../../utils/stationRows';

// ========== A STATION'S CHANNELS AT ONE PLACE ==========
// One chip per channel the station has there (utils/stationRows.ts):
//   filled   - checked in on it, so it's worked both ways
//   outlined - listed as reachable, not checked in on yet
//   greyed   - marked offline, with the time; never taken off the row
// The channel of the station's newest check-in carries the radio icon.
// Net control clicks a chip to mark it offline or bring it back.
// Shared by the desktop check-in table and the mobile list.

type NcsColor = { bg: string; border: string; text: string } | null;

interface StationChannelsProps {
  group: StationRow<any>;
  frequencies: any[];
  formatFrequencyDisplay: (freq: any) => string;
  getNcsColorForFrequency?: (frequencyId: number) => NcsColor;
  preferUtc: boolean;
  netStartedAt?: string;
  // Net control, while the log is open: chips open the offline menu.
  onMark?: (checkInId: number, frequencyId: number, offline: boolean) => void;
}

const StationChannels: React.FC<StationChannelsProps> = ({
  group, frequencies, formatFrequencyDisplay, getNcsColorForFrequency, preferUtc, netStartedAt, onMark,
}) => {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; frequencyId: number } | null>(null);
  const current = group.row.status !== 'checked_out' ? group.row.frequency_id : null;

  const chip = (frequencyId: number, worked: boolean) => {
    const freq = frequencies.find((f: any) => f.id === frequencyId);
    if (!freq) return null;
    const offlineAt = group.offline[frequencyId];
    const isCurrent = frequencyId === current && !offlineAt;
    const ncsColor = worked && !offlineAt ? getNcsColorForFrequency?.(frequencyId) ?? null : null;
    const label = isCurrent ? `📡 ${formatFrequencyDisplay(freq)}` : formatFrequencyDisplay(freq);
    const tooltip = offlineAt
      ? `Offline since ${formatTimeWithDate(offlineAt, preferUtc, netStartedAt)}`
      : worked ? 'Checked in on this channel' : 'Listed as reachable; not checked in on yet';
    return (
      <Tooltip key={frequencyId} title={onMark ? `${tooltip}. Click to ${offlineAt ? 'bring it back' : 'mark it offline'}.` : tooltip}>
        <Chip
          label={label}
          size="small"
          variant={worked ? 'filled' : 'outlined'}
          onClick={onMark ? (e) => { e.stopPropagation(); setMenu({ anchor: e.currentTarget, frequencyId }); } : undefined}
          sx={{
            height: 18,
            fontSize: '0.7rem',
            ...(offlineAt ? {
              opacity: 0.5,
              textDecoration: 'line-through',
              backgroundColor: 'transparent',
              border: 1,
              borderStyle: 'dashed',
              borderColor: 'text.disabled',
            } : ncsColor ? {
              backgroundColor: ncsColor.bg,
              border: `1px solid ${ncsColor.border}`,
              '& .MuiChip-label': { color: ncsColor.text },
            } : isCurrent ? {
              backgroundColor: 'primary.main',
              '& .MuiChip-label': { color: 'white' },
            } : worked ? {
              backgroundColor: 'action.selected',
            } : {}),
          }}
        />
      </Tooltip>
    );
  };

  const offlineNow = menu ? !!group.offline[menu.frequencyId] : false;
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {group.worked.map((fid) => chip(fid, true))}
      {group.listed.map((fid) => chip(fid, false))}
      {/* Opens from a chip, net control only */}
      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)} onClick={(e) => e.stopPropagation()}>
        <MenuItem
          onClick={() => {
            if (menu) onMark?.(group.row.id, menu.frequencyId, !offlineNow);
            setMenu(null);
          }}
        >
          {offlineNow ? 'Back online' : 'Mark offline'}
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default StationChannels;
