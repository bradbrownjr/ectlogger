import React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useReportAccent } from './ReportAccent';

// ========== REPORT FIGURES ROW ==========
// The report's headline numbers as one row divided by hairlines (two by two
// on a phone), all in the report's accent color. Replaces the four
// separately-colored cards the reports used to open with.

export interface ReportFigure {
  value: React.ReactNode;
  label: string;
}

// `compact` (the social-media images) puts number and label side by side on
// one slim line, leaving the height to the check-in list.
const ReportFigures: React.FC<{ figures: ReportFigure[]; compact?: boolean }> = ({ figures, compact }) => {
  const { accent } = useReportAccent();
  const RULE = useTheme().palette.divider;
  if (compact) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${figures.length}, 1fr)`, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, mb: 2.25 }}>
        {figures.map((f, i) => (
          <Box
            key={f.label}
            sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1, py: 0.875, px: 1, borderLeft: i ? `1px solid ${RULE}` : 'none' }}
          >
            <Box sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: accent, fontVariantNumeric: 'tabular-nums' }}>{f.value}</Box>
            <Box sx={{ fontSize: 15, color: 'text.secondary' }}>{f.label}</Box>
          </Box>
        ))}
      </Box>
    );
  }
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
          <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{f.label}</Box>
        </Box>
      ))}
    </Box>
  );
};

export default ReportFigures;
