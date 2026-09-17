import React from 'react';
import { Box, Typography } from '@mui/material';
import { printPageStyle } from '../traffic/print/printStyles';
import MarkdownRender from '../shared/MarkdownRender';

// ========== NetPaperworkPrintView ==========
// Combined net script + notes export for an NCS running (or prepping for) a
// net from a printed page -- see ROADMAP.md "Export net announcements and
// the net script to PDF". "Notes" here is net.announcements / Announcements.tsx
// (titled "Net Notes" in its own toolbar/dialog, per-net-only) -- distinct
// from the schedule-level "Announcements" feature (ScheduleAnnouncements.tsx,
// NetTemplate-backed standing text), which this export does not include.
// Reads straight from net state rather than capturing either panel's live
// DOM: Announcements.tsx and NetScript.tsx are independently
// dockable/floating/closed, so a DOM capture would only work when both
// happened to be open at once. Rendering off-screen at this component's own
// fixed print width (same pattern as RadiogramPrintView/ICS309PrintView,
// captured via utils/pdfExport.ts) means the export always works regardless
// of what's currently on screen.

interface NetPaperworkPrintViewProps {
  id: string;
  netName: string;
  script: string;
  notes: string;
}

const NetPaperworkPrintView: React.FC<NetPaperworkPrintViewProps> = ({ id, netName, script, notes }) => {
  const today = new Date().toLocaleDateString();

  return (
    <div id={id} style={printPageStyle}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{netName}</div>
        <div style={{ fontSize: 12 }}>Net Paperwork — {today}</div>
      </div>

      {!!script && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ borderBottom: '2px solid #000000', color: '#000000', pb: 0.5, mb: 1 }}>
            Net Script
          </Typography>
          <MarkdownRender content={script} emptyText="" variant="bordered" sx={{ color: '#000000' }} />
        </Box>
      )}

      {!!notes && (
        <Box>
          <Typography variant="h6" sx={{ borderBottom: '2px solid #000000', color: '#000000', pb: 0.5, mb: 1 }}>
            Net Notes
          </Typography>
          <MarkdownRender content={notes} emptyText="" variant="bordered" sx={{ color: '#000000' }} />
        </Box>
      )}
    </div>
  );
};

export default NetPaperworkPrintView;
