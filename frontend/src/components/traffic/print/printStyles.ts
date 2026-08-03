import React from 'react';

// ========== printStyles ==========
// Shared constants/styles for the form-accurate print views (RadiogramPrintView,
// ICS213PrintView, ICS309PrintView). These are captured by utils/pdfExport.ts
// (html2canvas -> jsPDF), which already forces light-mode on its clone -- these
// views go further and hardcode black-on-white directly, so they look identical
// to the real paper form regardless of the app's current theme.

export const PRINT_PAGE_WIDTH = 780; // px; approximates an 8.5in letter page at capture resolution

export const printPageStyle: React.CSSProperties = {
  width: PRINT_PAGE_WIDTH,
  margin: '0 auto',
  backgroundColor: '#ffffff',
  color: '#000000',
  padding: 20,
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: 11,
  boxSizing: 'border-box',
};

export const gridTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
};

export const cellStyle: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '3px 6px',
  verticalAlign: 'top',
  fontSize: 11,
  color: '#000000',
};

export const labelCaptionStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: '0.3px',
  marginBottom: 2,
  color: '#000000',
};

export const valueTextStyle: React.CSSProperties = {
  fontSize: 12,
  minHeight: 14,
  whiteSpace: 'pre-wrap',
  color: '#000000',
};

export function formatFiledDate(filedAt: string | null | undefined): string {
  if (!filedAt) return '';
  const d = new Date(filedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase().replace(',', '');
}
