import React from 'react';
import Box from '@mui/material/Box';
import { useReportAccent } from './ReportAccent';

// ========== REPORT FIGURES ROW ==========
// The report's headline numbers as one row divided by hairlines (two by two
// on a phone), all in the report's accent color. Replaces the four
// separately-colored cards the reports used to open with.

export interface ReportFigure {
  value: React.ReactNode;
  label: string;
}

const RULE = '#dde0e6';

const ReportFigures: React.FC<{ figures: ReportFigure[] }> = ({ figures }) => {
  const { accent } = useReportAccent();
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${figures.length}, 1fr)` },
        borderTop: `1px solid ${RULE}`,
        borderBottom: `1px solid ${RULE}`,
        mb: 3,
      }}
    >
      {figures.map((f, i) => (
        <Box
          key={f.label}
          sx={{
            py: 2,
            px: 1.5,
            textAlign: 'center',
            borderLeft: { xs: i % 2 ? `1px solid ${RULE}` : 'none', sm: i ? `1px solid ${RULE}` : 'none' },
            borderTop: { xs: i >= 2 ? `1px solid ${RULE}` : 'none', sm: 'none' },
          }}
        >
          <Box sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 700, lineHeight: 1.1, color: accent, fontVariantNumeric: 'tabular-nums' }}>
            {f.value}
          </Box>
          <Box sx={{ fontSize: 12, color: '#4a505c', mt: 0.5 }}>{f.label}</Box>
        </Box>
      ))}
    </Box>
  );
};

export default ReportFigures;
