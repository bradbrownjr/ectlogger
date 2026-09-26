import React from 'react';
import Box from '@mui/material/Box';
import { useReportAccent } from './ReportAccent';

// ========== REPORT MASTHEAD ==========
// The top of every net and schedule report: the net's logo as the main
// image, the net name as the title, and the report type as a small label
// above it. ECTLogger itself is credited in ReportFooter, not here.
//
// Plain Box elements, not Typography: the report wrappers force every
// .MuiTypography-root to black (!important) for print, which would erase
// the accent color from the label.

interface ReportMastheadProps {
  logoUrl?: string | null;
  /** Small label above the title, e.g. "Net Report" or "Schedule Report · Last 90 days". */
  eyebrow: string;
  title: string;
  /** Bold lead-in of the line under the title, e.g. the date. */
  when?: string;
  /** Rest of that line, e.g. the time span. */
  whenDetail?: string;
}

const ReportMasthead: React.FC<ReportMastheadProps> = ({ logoUrl, eyebrow, title, when, whenDetail }) => {
  const { accent, flag } = useReportAccent();
  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: 'grid',
          // With no logo the title takes the full width; no placeholder image.
          gridTemplateColumns: logoUrl ? { xs: '84px 1fr', sm: '148px 1fr' } : '1fr',
          gap: { xs: 2, sm: 3.5 },
          alignItems: 'center',
          pb: 2.5,
        }}
      >
        {logoUrl && (
          <Box
            component="img"
            src={logoUrl}
            alt=""
            sx={{ width: { xs: 84, sm: 148 }, height: { xs: 84, sm: 148 }, objectFit: 'contain' }}
          />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>
            {eyebrow}
          </Box>
          <Box
            component="h1"
            sx={{
              fontSize: { xs: 25, sm: 38 },
              lineHeight: 1.1,
              fontWeight: 900,
              letterSpacing: '-0.01em',
              color: '#1a1c21',
              m: 0,
              mt: 0.75,
              mb: 1.25,
              textWrap: 'balance',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </Box>
          {(when || whenDetail) && (
            <Box sx={{ fontSize: { xs: 14, sm: 17 }, color: '#4a505c' }}>
              {when && <Box component="span" sx={{ fontWeight: 500, color: '#1a1c21' }}>{when}</Box>}
              {when && whenDetail && ' · '}
              {whenDetail}
            </Box>
          )}
        </Box>
      </Box>
      {/* Accent rule; the logo's second color, when it has one, takes the short end. */}
      <Box sx={{ height: 4, background: `linear-gradient(90deg, ${accent} 0 88%, ${flag} 88% 100%)` }} />
    </Box>
  );
};

export default ReportMasthead;
