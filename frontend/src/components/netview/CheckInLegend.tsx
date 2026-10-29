import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';

// ========== CHECK-IN LIST LEGEND ==========
// The key above the check-in list: net roles, station statuses, and the
// Recheck marker (docs/reference/station-statuses.md explains the mix).
// Shared by the attached and detached lists in NetView and the popped-out
// list in NetPaneWindow, which each kept a copy until 2026-10-29. The copies
// had drifted apart in their tooltips, and all three left out Mobile.
// The caller keeps its own outer box, since those differ by placement.

const LEGEND_ITEMS: { icon: string; label: string; tooltip: string }[] = [
  { icon: '👑', label: 'NCS', tooltip: 'Net Control Station - manages the net' },
  { icon: '🤴', label: '2nd NCS', tooltip: '2nd NCS - assists primary Net Control Station' },
  { icon: '📋', label: 'Logger', tooltip: 'Logger - assists NCS with logging' },
  { icon: '✅', label: 'Standard', tooltip: 'Checked in and available' },
  { icon: '🔄', label: 'Recheck', tooltip: 'Re-checked into the net' },
  { icon: '👂', label: 'Listening', tooltip: 'Monitoring only, not transmitting' },
  { icon: '📡', label: 'Relay', tooltip: 'Relay station - can relay stations NCS cannot hear' },
  { icon: '⏸️', label: 'Away', tooltip: 'Temporarily away, will return' },
  { icon: '🚨', label: 'Traffic', tooltip: 'Has traffic or emergency to report' },
  { icon: '📢', label: 'Announce', tooltip: 'Has announcements to share' },
  { icon: '🚗', label: 'Mobile', tooltip: 'Mobile - may only be available briefly' },
  { icon: '🧍', label: 'In person', tooltip: "In person, not on the radio - don't call on the air" },
  { icon: '👋', label: 'Out', tooltip: 'Checked out of net' },
];

interface CheckInLegendProps {
  // Multi-frequency net with an active frequency: explain the blue rows
  showActiveFrequency?: boolean;
  // NCS/Logger while the log is open: rows can be edited in place
  showEditHint?: boolean;
}

const CheckInLegend: React.FC<CheckInLegendProps> = ({ showActiveFrequency, showEditHint }) => (
  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Legend:</Typography>
    {LEGEND_ITEMS.map(({ icon, label, tooltip }) => (
      <Tooltip key={label} title={tooltip} placement="top" arrow>
        <Typography variant="caption" sx={{ cursor: 'help' }}>{icon} {label}</Typography>
      </Tooltip>
    ))}
    {/* Shows on a multi-frequency net with an active frequency */}
    {showActiveFrequency && (
      <Tooltip title="Station is available on the active frequency" placement="top" arrow>
        <Typography variant="caption" sx={{ cursor: 'help', backgroundColor: 'rgba(25, 118, 210, 0.15)', px: 0.5, borderRadius: 0.5 }}>
          🔵 On Active Freq
        </Typography>
      </Tooltip>
    )}
    {/* Shows for NCS/Logger while the log is open (utils/netLog.ts) */}
    {showEditHint && (
      <Tooltip title="Click any row to edit check-in details inline" placement="top" arrow>
        <Typography variant="caption" sx={{ cursor: 'help', color: 'primary.main', fontStyle: 'italic' }}>
          💡 Click row to edit
        </Typography>
      </Tooltip>
    )}
  </Box>
);

export default CheckInLegend;
