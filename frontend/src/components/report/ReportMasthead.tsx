import React from 'react';
import Box from '@mui/material/Box';
import { useReportAccent } from './ReportAccent';

// ========== REPORT MASTHEAD ==========
// The top of every net and schedule report: the net's logo as the main
// image, the net name as the title, and the report type as a small label
// above it. ECTLogger itself is credited in ReportFooter, not here.
//
// Plain Box elements with theme text colors, so the masthead follows the
// app's theme on screen; the PDF export recolors its copy for paper.

interface ReportMastheadProps {
  logoUrl?: string | null;
  /** Small label above the title, e.g. "Net Report" or "Schedule Report · Last 90 days". */
  eyebrow: string;
  title: string;
  /** Bold lead-in of the line under the title, e.g. the date. */
  when?: string;
  /** Rest of that line, e.g. the time span. */
  whenDetail?: string;
  /** Smaller fixed sizes for the social-media images (SocialSummaryImages),
   *  which are always 960 px wide and need the room for the check-in list. */
  compact?: boolean;
}

const ReportMasthead: React.FC<ReportMastheadProps> = ({ logoUrl, eyebrow, title, when, whenDetail, compact }) => {
  const { accent, flag } = useReportAccent();
  const logoSize = compact ? 84 : { xs: 84, sm: 148 };
  return (
    <Box sx={{ mb: compact ? 2.5 : 3 }}>
      <Box
        sx={{
          display: 'grid',
          // With no logo the title takes the full width; no placeholder image.
          gridTemplateColumns: logoUrl ? (compact ? '84px 1fr' : { xs: '84px 1fr', sm: '148px 1fr' }) : '1fr',
          gap: compact ? 2.75 : { xs: 2, sm: 3.5 },
          alignItems: 'center',
          pb: compact ? 2.25 : 2.5,
        }}
      >
        {logoUrl && (
          <Box
            component="img"
            src={logoUrl}
            alt=""
            sx={{ width: logoSize, height: logoSize, objectFit: 'contain' }}
          />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: compact ? 14 : 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>
            {eyebrow}
          </Box>
          <Box
            component="h1"
            sx={{
              fontSize: compact ? 32 : { xs: 25, sm: 38 },
              lineHeight: 1.1,
              fontWeight: 900,
              letterSpacing: '-0.01em',
              color: 'text.primary',
              m: 0,
              mt: compact ? 0.5 : 0.75,
              mb: compact ? 0.75 : 1.25,
              textWrap: 'balance',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </Box>
          {(when || whenDetail) && (
            <Box sx={{ fontSize: compact ? 18 : { xs: 14, sm: 17 }, color: 'text.secondary' }}>
              {when && <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>{when}</Box>}
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
