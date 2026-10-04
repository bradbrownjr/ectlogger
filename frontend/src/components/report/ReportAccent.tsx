import React, { createContext, useContext } from 'react';
import { getContrastRatio, lighten, type Theme } from '@mui/material/styles';

// ========== REPORT ACCENT COLORS ==========
// Net and schedule reports are tinted to match the club's logo. The colors
// arrive from the API as `logo_accent_colors`: 0-2 hex values the backend
// has already mapped onto a palette of standard colors that are readable on
// white (backend/app/logo_accent.py). Those are the print colors, and what
// every export uses.
//
// On screen a report follows the app's theme. The palette is dark (navy,
// maroon, forest), so on a dark theme each accent is lightened just enough
// to read on the dark page (getScreenReportAccent), and ReportPaper tells
// the PDF export to swap the print color back in (data-export-colors).
//
// The fallback is a fixed readable blue, not theme.palette.primary, so the
// fallback prints the same whatever theme the person exporting it uses.

export const DEFAULT_REPORT_ACCENT = '#1565c0';

// WCAG AA for normal text: the accent colors small labels as well as figures
const MIN_SCREEN_CONTRAST = 4.5;

export interface ReportAccent {
  /** Headings, figures, callsigns, the masthead rule. */
  accent: string;
  /** The logo's second color, for the short end of the masthead rule.
   *  Same as `accent` when the logo has only one color. */
  flag: string;
}

/** The print accent: what the report looks like on paper. */
export const getReportAccent = (colors?: string[] | null): ReportAccent => {
  const accent = colors?.[0] || DEFAULT_REPORT_ACCENT;
  return { accent, flag: colors?.[1] || accent };
};

/** Lighten `color` in small steps until it reads on `background`. */
export const readableOn = (color: string, background: string): string => {
  for (let step = 0; step <= 20; step++) {
    const candidate = step === 0 ? color : lighten(color, step * 0.05);
    if (getContrastRatio(candidate, background) >= MIN_SCREEN_CONTRAST) return candidate;
  }
  return '#ffffff';
};

const toHex = (color: string): string => {
  const m = color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  return m ? '#' + m.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('') : color;
};

/** The accent as the report shows it on screen in `theme`. */
export const getScreenReportAccent = (colors: string[] | null | undefined, theme: Theme): ReportAccent => {
  const print = getReportAccent(colors);
  if (theme.palette.mode !== 'dark') return print;
  const background = theme.palette.background.paper;
  return { accent: toHex(readableOn(print.accent, background)), flag: toHex(readableOn(print.flag, background)) };
};

/**
 * The screen-to-print color swaps for the PDF export (utils/pdfExport.ts,
 * `data-export-colors`), or undefined when the screen already shows print
 * colors.
 */
export const reportExportColors = (screen: ReportAccent, print: ReportAccent): string | undefined => {
  const swaps: Record<string, string> = {};
  if (screen.accent !== print.accent) swaps[screen.accent.toLowerCase()] = print.accent;
  if (screen.flag !== print.flag) swaps[screen.flag.toLowerCase()] = print.flag;
  return Object.keys(swaps).length ? JSON.stringify(swaps) : undefined;
};

const ReportAccentContext = createContext<ReportAccent>(getReportAccent());

export const ReportAccentProvider: React.FC<{ accent: ReportAccent; children: React.ReactNode }> = ({
  accent,
  children,
}) => <ReportAccentContext.Provider value={accent}>{children}</ReportAccentContext.Provider>;

export const useReportAccent = (): ReportAccent => useContext(ReportAccentContext);
