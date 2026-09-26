import React, { createContext, useContext } from 'react';

// ========== REPORT ACCENT COLORS ==========
// Net and schedule reports are tinted to match the club's logo. The colors
// arrive from the API as `logo_accent_colors`: 0-2 hex values the backend
// has already mapped onto a palette of standard colors that are readable on
// white (backend/app/logo_accent.py). This file never picks colors itself.
//
// The fallback is a fixed readable blue, not theme.palette.primary: the
// report is always a white page (it is what the PDF captures), and a dark
// theme's primary is a light blue that would be unreadable on it.

export const DEFAULT_REPORT_ACCENT = '#1565c0';

export interface ReportAccent {
  /** Headings, figures, callsigns, the masthead rule. */
  accent: string;
  /** The logo's second color, for the short end of the masthead rule.
   *  Same as `accent` when the logo has only one color. */
  flag: string;
}

export const getReportAccent = (colors?: string[] | null): ReportAccent => {
  const accent = colors?.[0] || DEFAULT_REPORT_ACCENT;
  return { accent, flag: colors?.[1] || accent };
};

const ReportAccentContext = createContext<ReportAccent>(getReportAccent());

export const ReportAccentProvider: React.FC<{ colors?: string[] | null; children: React.ReactNode }> = ({
  colors,
  children,
}) => (
  <ReportAccentContext.Provider value={getReportAccent(colors)}>{children}</ReportAccentContext.Provider>
);

export const useReportAccent = (): ReportAccent => useContext(ReportAccentContext);
