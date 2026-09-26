import React from 'react';
import Box from '@mui/material/Box';

// ========== REPORT SECTION TITLE ==========
// Uppercase label with a hairline running to the right edge, shared by every
// section of the net and schedule reports. `action` (e.g. a PNG download
// button) sits after the line. Plain Box, not Typography, for the same
// print-override reason as ReportMasthead.

interface ReportSectionTitleProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  sx?: object;
  /** 15 in the social-media images, where the page is scaled down in a feed. */
  fontSize?: number;
}

const ReportSectionTitle: React.FC<ReportSectionTitleProps> = ({ children, action, sx, fontSize = 13 }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mt: 3, mb: 1.5, ...sx }}>
    <Box
      component="h2"
      sx={{ flex: '0 1 auto', fontSize, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1a1c21', m: 0 }}
    >
      {children}
    </Box>
    <Box sx={{ flex: '1 0 24px', height: '1px', bgcolor: '#dde0e6' }} />
    {action}
  </Box>
);

export default ReportSectionTitle;
