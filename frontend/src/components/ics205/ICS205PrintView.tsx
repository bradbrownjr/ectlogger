import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  LANDSCAPE_PAGE_HEIGHT, LANDSCAPE_PAGE_WIDTH, cellStyle, gridTableStyle, printPageStyle,
} from '../traffic/print/printStyles';
import ExerciseMarking from '../traffic/print/ExerciseMarking';
import { formDate, formTime } from '../../utils/ics214';
import { ICS205_COLUMNS as COLUMNS, Ics205Row, paginateIcs205 } from '../../utils/channelPlan';

// ========== ICS205PrintView ==========
// FEMA's ICS 205 Incident Radio Communications Plan (v3.1), for the PDF
// downloaded from the net's ICS-205 page (pages/Ics205.tsx). Letter
// landscape. Blocks as the form has them: 1 Incident Name, 2 Date/Time
// Prepared, 3 Operational Period, 4 Basic Radio Channel Use, 5 Special
// Instructions, 6 Prepared by (Communications Unit Leader), and the
// "ICS 205 / IAP Page / Date/Time" footer.
//
// Block 4 can run past one page, so this view lays out its own pages, as
// ICS214PrintView does: it renders every block and row once to measure
// them, splits the rows (utils/channelPlan.ts::paginateIcs205), then draws
// each page LANDSCAPE_PAGE_HEIGHT tall for exportPagesToPdf. Every page
// repeats blocks 1-3, the table heading, block 6 and the footer; block 5
// follows the last row. onReady fires once the pages are drawn. A drill's
// net (one with a drill plan) is marked as an exercise on every page.

export interface Ics205Header {
  incidentName: string;
  periodFrom: string | null;
  periodTo: string | null;
  preparedBy: string;
  specialInstructions: string;
  exercise: boolean;
}

interface Props {
  id: string;
  header: Ics205Header;
  rows: Ics205Row[];
  preferUtc: boolean;
  // Block 2 and the footer's Date/Time: when the PDF was made
  preparedAt: string;
  onReady?: () => void;
}

const label: React.CSSProperties = { ...cellStyle, fontWeight: 700, fontSize: 10 };
const small: React.CSSProperties = { ...cellStyle, fontSize: 10, overflowWrap: 'anywhere' };
const pageStyle: React.CSSProperties = { ...printPageStyle, width: LANDSCAPE_PAGE_WIDTH };
// Slack for rounding between the measuring pass and the pages
const SAFETY_PX = 6;


const ICS205PrintView: React.FC<Props> = ({ id, header: h, rows, preferUtc, preparedAt, onReady }) => {
  const [layout, setLayout] = useState<{ pages: number[][]; instructionsPage: number } | null>(null);
  const measure = useRef<HTMLDivElement>(null);

  // ========== BLOCKS ==========
  const title = (
    <>
      {h.exercise && <ExerciseMarking position="top" />}
      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        INCIDENT RADIO COMMUNICATIONS PLAN (ICS 205)
      </div>
    </>
  );
  const block123 = (
    <table style={gridTableStyle}>
      <tbody>
        <tr>
          <td style={{ ...label, width: '34%' }}>1. Incident Name:</td>
          <td style={{ ...label, width: '26%' }}>2. Date/Time Prepared:</td>
          <td style={{ ...label, width: '40%' }}>3. Operational Period:</td>
        </tr>
        <tr>
          <td style={cellStyle}>{h.incidentName}</td>
          <td style={cellStyle}>
            Date: {formDate(preparedAt, preferUtc)}<br />
            Time: {formTime(preparedAt, preferUtc)}{preferUtc ? ' (UTC)' : ''}
          </td>
          <td style={cellStyle}>
            Date From: {formDate(h.periodFrom, preferUtc)}&nbsp;&nbsp;&nbsp;Date To: {formDate(h.periodTo, preferUtc)}<br />
            Time From: {formTime(h.periodFrom, preferUtc)}&nbsp;&nbsp;&nbsp;Time To: {formTime(h.periodTo, preferUtc)}
            {preferUtc ? ' (UTC)' : ''}
          </td>
        </tr>
      </tbody>
    </table>
  );
  // ---- Block 4: one table per page, so the headings and the rows share
  // one set of column widths (the colgroup, with table-layout: fixed) ----
  const columns = (
    <colgroup>
      {COLUMNS.map((c) => <col key={c.heading} style={{ width: c.width }} />)}
    </colgroup>
  );
  const tableHead = (continued: boolean) => (
    <thead>
      <tr><td style={label} colSpan={COLUMNS.length}>4. Basic Radio Channel Use{continued ? ' (continuation)' : ''}:</td></tr>
      <tr>
        {COLUMNS.map((c) => (
          <td key={c.heading} style={{ ...label, textAlign: 'center', verticalAlign: 'bottom' }}>{c.heading}</td>
        ))}
      </tr>
    </thead>
  );
  const block4 = (indexes: number[], continued: boolean) => (
    <table style={{ ...gridTableStyle, marginTop: -1 }}>
      {columns}
      {tableHead(continued)}
      <tbody>{indexes.map(row)}</tbody>
    </table>
  );
  const row = (i: number) => {
    const r = rows[i];
    return (
      <tr key={r.key}>
        {COLUMNS.map((c) => (
          <td key={c.heading} style={{ ...small, ...(c.nowrap ? { whiteSpace: 'nowrap' } : {}) }}>{r[c.key]}</td>
        ))}
      </tr>
    );
  };
  const block5 = (
    <table style={{ ...gridTableStyle, marginTop: -1 }}>
      <tbody>
        <tr><td style={label}>5. Special Instructions:</td></tr>
        <tr><td style={{ ...cellStyle, whiteSpace: 'pre-wrap', minHeight: 40, height: 40 }}>{h.specialInstructions}</td></tr>
      </tbody>
    </table>
  );
  const footer = (
    <>
      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...label, width: '60%' }}>
              6. Prepared by (Communications Unit Leader): Name: <span style={{ fontWeight: 400 }}>{h.preparedBy}</span>
            </td>
            <td style={{ ...label, width: '40%' }}>Signature:</td>
          </tr>
        </tbody>
      </table>
      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...label, width: '20%' }}>ICS 205</td>
            <td style={{ ...label, width: '30%' }}>IAP Page ______</td>
            <td style={{ ...label, width: '50%' }}>
              Date/Time: <span style={{ fontWeight: 400 }}>{formDate(preparedAt, preferUtc)} {formTime(preparedAt, preferUtc)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      {h.exercise && <ExerciseMarking position="bottom" />}
    </>
  );

  // ========== MEASURE, THEN SPLIT INTO PAGES ==========
  useLayoutEffect(() => {
    const root = measure.current;
    if (!root || layout) return;
    const height = (name: string) => (root.querySelector(`[data-measure="${name}"]`) as HTMLElement | null)?.offsetHeight ?? 0;
    const rowHeights = Array.from(root.querySelectorAll('[data-measure="rows"] tr'), (tr) => (tr as HTMLElement).offsetHeight);
    const pagePadding = (printPageStyle.padding as number) * 2;
    const fixed = pagePadding + height('title') + height('block123') + height('tableHeading') + height('footer') + SAFETY_PX;
    setLayout(paginateIcs205(rowHeights, LANDSCAPE_PAGE_HEIGHT - fixed, height('block5')));
  }, [layout]);

  useLayoutEffect(() => {
    if (layout) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  if (!layout) {
    // ========== MEASURING PASS (never exported) ==========
    return (
      <div ref={measure} style={pageStyle}>
        <div data-measure="title">{title}</div>
        <div data-measure="block123">{block123}</div>
        <table data-measure="tableHeading" style={gridTableStyle}>{columns}{tableHead(false)}</table>
        <table data-measure="rows" style={gridTableStyle}>{columns}<tbody>{rows.map((_, i) => row(i))}</tbody></table>
        <div data-measure="block5">{block5}</div>
        <div data-measure="footer">{footer}</div>
      </div>
    );
  }

  // ========== THE PAGES ==========
  return (
    <div id={id}>
      {layout.pages.map((indexes, p) => (
        <div
          key={p}
          data-pdf-page
          // minHeight, not height: a page whose special instructions run
          // longer than the paper grows, and the export scales it to fit.
          style={{ ...pageStyle, minHeight: LANDSCAPE_PAGE_HEIGHT, display: 'flex', flexDirection: 'column' }}
        >
          {title}
          {block123}
          {/* Block 4 on every page with rows, and on the first page even with none */}
          {(indexes.length > 0 || p === 0) && block4(indexes, p > 0)}
          {p === layout.instructionsPage && block5}
          <div style={{ marginTop: 'auto' }}>{footer}</div>
        </div>
      ))}
    </div>
  );
};

export default ICS205PrintView;
