import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';

// ========== REPORT PAGE HEADER ==========
// The toolbar above the net report, a net's statistics and a schedule's
// statistics: back, the page title, and the page's buttons. Shared so the
// three pages lay out the same, and outside the exported content on every
// one of them. On a wide screen it is one row; on a phone the buttons drop
// to their own wrapping row under the title. Until 2026-10-04 two of these
// pages kept everything on one row, so a phone squeezed the title into a
// narrow column and the page scrolled sideways.

interface ReportPageHeaderProps {
  onBack: () => void;
  title: React.ReactNode;
  /** Line(s) under the title: a description, or a status chip and dates. */
  subtitle?: React.ReactNode;
  /** The page's buttons and controls. */
  children?: React.ReactNode;
  mb?: number;
}

const ReportPageHeader: React.FC<ReportPageHeaderProps> = ({ onBack, title, subtitle, children, mb = 3 }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 280px', minWidth: 0 }}>
      <IconButton onClick={onBack} aria-label="Back">
        <ArrowBack />
      </IconButton>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" fontWeight="bold" sx={{ overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        {subtitle}
      </Box>
    </Box>
    {children && (
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        {children}
      </Box>
    )}
  </Box>
);

export default ReportPageHeader;
