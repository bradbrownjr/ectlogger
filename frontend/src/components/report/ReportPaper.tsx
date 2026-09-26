import React from 'react';
import Box from '@mui/material/Box';
import { ReportAccentProvider } from './ReportAccent';

// ========== REPORT PAPER ==========
// The white page every net and schedule report is drawn on, on screen as
// well as in the PDF, regardless of the app's theme. Forces MUI's own
// surfaces and text to print colors (a dark theme would otherwise put light
// text on the forced-white page), and provides the report's accent colors
// from the logo to everything inside it. `id` is what the PDF export captures.

interface ReportPaperProps {
  id: string;
  accentColors?: string[] | null;
  children: React.ReactNode;
}

const ReportPaper: React.FC<ReportPaperProps> = ({ id, accentColors, children }) => (
  <ReportAccentProvider colors={accentColors}>
    <Box
      id={id}
      sx={{
        backgroundColor: '#ffffff !important',
        color: '#000000 !important',
        p: { xs: 2, sm: 4 },
        borderRadius: 1,
        // Force all text to be dark for printing
        '& *': {
          colorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        },
        '& .MuiTypography-root': {
          color: '#000000 !important',
        },
        '& .MuiTypography-colorTextSecondary': {
          color: '#666666 !important',
        },
        '& .MuiPaper-root': {
          backgroundColor: '#ffffff !important',
        },
        '& .MuiTableCell-root': {
          color: '#000000 !important',
          borderColor: '#e0e0e0 !important',
        },
        '& .MuiCard-root': {
          backgroundColor: '#ffffff !important',
        },
        '& .MuiCardContent-root': {
          backgroundColor: '#ffffff !important',
        },
        '& .MuiChip-label': {
          color: '#000000 !important',
        },
        '& .MuiChip-root': {
          borderColor: '#666666 !important',
        },
      }}
    >
      {children}
    </Box>
  </ReportAccentProvider>
);

export default ReportPaper;
