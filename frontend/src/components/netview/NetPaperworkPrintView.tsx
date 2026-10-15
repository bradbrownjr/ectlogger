import React, { useLayoutEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { printPageStyle } from '../traffic/print/printStyles';
import MarkdownRender from '../shared/MarkdownRender';

// ========== NetPaperworkPrintView ==========
// Printable page for the net's Markdown documents: the script, the
// schedule's announcements, and the net's own notes, one or several at a
// time. Rendered off-screen at its own fixed print width by
// utils/markdownDocsPdf.tsx and captured through utils/pdfExport.ts (same
// pattern as RadiogramPrintView/ICS309PrintView), so the PDF never depends
// on whether, where, or how wide a panel is open on screen.

// html2canvas 1.4 draws a native list marker right-aligned against the
// item's edge with no gap, and drops the period of a numbered marker below
// the line ("1 ." beside the text). Bullets only need the gap; numbers are
// drawn here as ordinary text from a CSS counter instead, which it renders
// like any other text.
const printListSx = {
  '& ul > li': { pl: '0.4em' },
  '& ol': { listStyle: 'none', counterReset: 'paperwork-item' },
  '& ol > li': { counterIncrement: 'paperwork-item' },
  '& ol > li::before': {
    content: 'counter(paperwork-item) "."',
    display: 'inline-block',
    minWidth: '1.6em',
    ml: '-1.6em',
  },
};

export interface PaperworkSection {
  title: string;
  content: string;
}

interface NetPaperworkPrintViewProps {
  id: string;
  netName: string;
  // What the page is, under the net's name ("Net Script", "Net Paperwork").
  label: string;
  sections: PaperworkSection[];
}

const NetPaperworkPrintView: React.FC<NetPaperworkPrintViewProps> = ({ id, netName, label, sections }) => {
  const today = new Date().toLocaleDateString();
  const rootRef = useRef<HTMLDivElement>(null);
  // A Markdown list that starts at 3 renders as <ol start="3">, which a CSS
  // counter ignores; seed each counter from it. Layout effect, so it is in
  // place before the synchronous render in markdownDocsPdf.tsx is captured.
  useLayoutEffect(() => {
    rootRef.current?.querySelectorAll('ol').forEach((ol) => {
      const start = Number(ol.getAttribute('start') || '1');
      ol.style.counterReset = `paperwork-item ${start - 1}`;
    });
  });
  // A single document is already named in the page header, so it gets no
  // second heading of its own.
  const showSectionTitles = sections.length > 1;

  return (
    <div id={id} ref={rootRef} style={printPageStyle}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{netName}</div>
        <div style={{ fontSize: 12 }}>{label} — {today}</div>
      </div>

      {sections.map((section) => (
        <Box key={section.title} sx={{ mb: 3 }}>
          {showSectionTitles && (
            <Typography variant="h6" sx={{ borderBottom: '2px solid #000000', color: '#000000', pb: 0.5, mb: 1 }}>
              {section.title}
            </Typography>
          )}
          <MarkdownRender content={section.content} emptyText="" variant="bordered" sx={{ color: '#000000', ...printListSx }} />
        </Box>
      ))}
    </div>
  );
};

export default NetPaperworkPrintView;
