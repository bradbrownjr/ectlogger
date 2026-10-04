import { describe, expect, it } from 'vitest';
import { createTheme, getContrastRatio } from '@mui/material/styles';
import { getReportAccent, getScreenReportAccent, readableOn, reportExportColors } from './ReportAccent';

// The backend's vetted palette (backend/app/logo_accent.py ACCENT_PALETTE)
const PALETTE = [
  '#8e1b2c', '#c62828', '#a3400f', '#b7410e', '#1b5e20', '#2e7d32', '#00695c',
  '#00796b', '#1f3d8f', '#1565c0', '#4a148c', '#6a1b9a', '#880e4f', '#ad1457',
];

const dark = createTheme({ palette: { mode: 'dark' } });
const light = createTheme({ palette: { mode: 'light' } });

describe('screen report accents', () => {
  it('lightens every palette color until it reads on the dark page', () => {
    for (const color of PALETTE) {
      const { accent } = getScreenReportAccent([color], dark);
      expect(accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(getContrastRatio(accent, dark.palette.background.paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the print colors in light mode', () => {
    expect(getScreenReportAccent(['#1f3d8f', '#c62828'], light)).toEqual(getReportAccent(['#1f3d8f', '#c62828']));
  });

  it('leaves a color that already reads alone', () => {
    expect(readableOn('#90caf9', '#121212')).toBe('#90caf9');
  });

  it('tells the export to swap each screen color back to print', () => {
    const print = getReportAccent(['#1f3d8f', '#c62828']);
    const screen = getScreenReportAccent(['#1f3d8f', '#c62828'], dark);
    expect(JSON.parse(reportExportColors(screen, print)!)).toEqual({
      [screen.accent]: '#1f3d8f',
      [screen.flag]: '#c62828',
    });
    expect(reportExportColors(print, print)).toBeUndefined();
  });
});
