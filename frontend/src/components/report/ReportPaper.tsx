import React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { ReportAccentProvider, getReportAccent, getScreenReportAccent, reportExportColors } from './ReportAccent';

// ========== REPORT PAPER ==========
// The page every net and schedule report is drawn on. On screen it follows
// the app's theme, so a dark-mode user reading statistics stays in dark mode.
// Paper is the export's job: utils/pdfExport.ts recolors an off-screen copy
// for print, and data-export-colors tells it which on-screen accents to turn
// back into the logo's print colors. Until 2026-10-04 this was forced white
// on screen too, and every MUI surface it didn't think to override (sticky
// table headings) came out black on black in dark mode.
// Provides the report's accent colors to everything inside it. `id` is what
// the PDF export captures.

interface ReportPaperProps {
  id: string;
  accentColors?: string[] | null;
  children: React.ReactNode;
}

const ReportPaper: React.FC<ReportPaperProps> = ({ id, accentColors, children }) => {
  const theme = useTheme();
  const screen = getScreenReportAccent(accentColors, theme);
  return (
    <ReportAccentProvider accent={screen}>
      <Box
        id={id}
        data-export-colors={reportExportColors(screen, getReportAccent(accentColors))}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          p: { xs: 2, sm: 4 },
          borderRadius: 1,
        }}
      >
        {children}
      </Box>
    </ReportAccentProvider>
  );
};

export default ReportPaper;
