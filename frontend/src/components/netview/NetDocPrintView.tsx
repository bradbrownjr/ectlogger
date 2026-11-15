import React, { useLayoutEffect, useRef } from 'react';
import ReportPaper from '../report/ReportPaper';
import ReportMasthead from '../report/ReportMasthead';
import ReportFooter from '../report/ReportFooter';
import { useReportAccent } from '../report/ReportAccent';
import MarkdownRender from '../shared/MarkdownRender';
import { PRINT_PAGE_WIDTH } from '../traffic/print/printStyles';
import { formatDateTime } from '../../utils/dateUtils';

// ========== NetDocPrintView ==========
// Printable page for one of the net's Markdown documents: the script, the
// schedule's announcements, or the net's own notes. Drawn on the same report
// parts as the net report and the schedule's announcements dialog
// (ReportPaper, ReportMasthead, ReportFooter), so it carries the net's logo
// and colors, its name, the ECTLogger credit, and where to get the latest
// copy. Rendered off-screen at the print width by utils/markdownDocsPdf.tsx
// and captured through utils/pdfExport.ts, so the PDF never depends on
// whether, where, or how wide a panel is open on screen.

// The net a document belongs to, as much as the printed page needs.
export interface DocNet {
  id: number;
  name: string;
  template_id?: number | null;
  logo_url?: string | null;
  logo_accent_colors?: string[] | null;
}

// html2canvas 1.4 draws a native list marker right-aligned against the
// item's edge with no gap, and drops the period of a numbered marker below
// the line ("1 ." beside the text). Both markers are drawn here as ordinary
// text instead, numbers from a CSS counter, in the same gutter, so a bulleted
// list lines up with a numbered one rather than looking nested under it.
const listMarker = { display: 'inline-block', minWidth: '1.6em', ml: '-1.6em' };
const printListSx = {
  '& ul': { listStyle: 'none' },
  '& ul > li::before': { content: '"•"', ...listMarker },
  '& ol': { listStyle: 'none', counterReset: 'paperwork-item' },
  '& ol > li': { counterIncrement: 'paperwork-item' },
  '& ol > li::before': { content: 'counter(paperwork-item) "."', ...listMarker },
};

interface NetDocPrintViewProps {
  id: string;
  net: DocNet;
  // The document's name, shown above the net's name ("Net Script").
  title: string;
  content: string;
  // Where a reader gets the latest copy, printed under the title.
  latestCopyUrl: string;
  preferUtc: boolean;
}

// Inside ReportPaper, so headings and links take the logo's accent color.
const DocBody: React.FC<{ content: string }> = ({ content }) => {
  const { accent } = useReportAccent();
  return (
    <MarkdownRender
      content={content}
      emptyText=""
      variant="colored"
      sx={{
        // Body text at about 11 pt on a Letter page (PRINT_PAGE_WIDTH spans
        // the printable width), headings scaled from it
        fontSize: 16,
        lineHeight: 1.5,
        '& h1, & h2, & h3': { mt: 2.5, mb: 1, color: accent },
        '& a': { color: accent },
        ...printListSx,
      }}
    />
  );
};

const NetDocPrintView: React.FC<NetDocPrintViewProps> = ({ id, net, title, content, latestCopyUrl, preferUtc }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const now = new Date().toISOString();
  // A Markdown list that starts at 3 renders as <ol start="3">, which a CSS
  // counter ignores; seed each counter from it. Layout effect, so it is in
  // place before the synchronous render in markdownDocsPdf.tsx is captured.
  useLayoutEffect(() => {
    rootRef.current?.querySelectorAll('ol').forEach((ol) => {
      const start = Number(ol.getAttribute('start') || '1');
      ol.style.counterReset = `paperwork-item ${start - 1}`;
    });
  });

  return (
    <div ref={rootRef} style={{ width: PRINT_PAGE_WIDTH, backgroundColor: '#ffffff' }}>
      <ReportPaper id={id} accentColors={net.logo_accent_colors}>
        <ReportMasthead
          logoUrl={net.logo_url}
          eyebrow={title}
          title={net.name}
          when={formatDateTime(now, preferUtc)}
          whenDetail={`Latest copy: ${latestCopyUrl.replace(/^https?:\/\//, '')}`}
        />
        <DocBody content={content} />
        <ReportFooter generatedAt={formatDateTime(now, preferUtc)} credit="From ECTLogger" />
      </ReportPaper>
    </div>
  );
};

export default NetDocPrintView;
