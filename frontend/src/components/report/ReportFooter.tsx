import React from 'react';
import Box from '@mui/material/Box';
import AppLogo from '../AppLogo';

// ========== REPORT FOOTER ==========
// The ECTLogger credit, deliberately small: the net is the subject of the
// report, so the app that logged it is a footnote. window.location.host
// rather than a fixed URL, so a self-hosted instance credits its own
// address (and AppLogo shows its own uploaded logo). In a PDF this sits at
// the end of the report; every page separately gets the net name and
// "Page X of Y" from exportToPdf's pageFooter.

const ReportFooter: React.FC<{ generatedAt: string }> = ({ generatedAt }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '8px 16px',
      mt: 3,
      pt: 1.5,
      borderTop: '1px solid #dde0e6',
      fontSize: 11,
      color: '#7b8190',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <AppLogo size={16} variant="light" />
      Logged with ECTLogger · {window.location.host}
    </Box>
    <Box>Generated {generatedAt}</Box>
  </Box>
);

export default ReportFooter;
