import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PRINT_PAGE_HEIGHT, cellStyle, gridTableStyle, printPageStyle,
} from '../traffic/print/printStyles';
import ExerciseMarking from '../traffic/print/ExerciseMarking';
import { Ics214Form, formDate, formTime, lineDateTime, splitPages } from '../../utils/ics214';

// ========== ICS214PrintView ==========
// FEMA's ICS 214 Activity Log, for the PDF downloaded from the net's ICS-214
// page (pages/Ics214.tsx). Blocks as the form has them: 1 Incident Name,
// 2 Operational Period, 3 Name, 4 ICS Position, 5 Home Agency (and Unit),
// 6 Resources Assigned, 7 Activity Log, 8 Prepared by, and "ICS 214,
// Page N" at the foot.
//
// Continuation pages repeat blocks 1, 2 and 8, as FEMA's own continuation
// sheet does, so this view lays out its own pages: it first renders every
// block and row once to measure them, splits the rows into pages
// (utils/ics214.ts::splitPages), then draws each page PRINT_PAGE_HEIGHT
// tall for utils/pdfExport.ts::exportPagesToPdf. onReady fires once the
// pages are drawn. Hidden lines and resources are left out. A drill's net
// (one with a drill plan) is marked as an exercise on every page.

interface Props {
  id: string;
  form: Ics214Form;
  preferUtc: boolean;
  // Block 8's Date/Time: when the PDF was made
  preparedAt: string;
  onReady?: () => void;
}

const label: React.CSSProperties = { ...cellStyle, fontWeight: 700, fontSize: 10 };
const small: React.CSSProperties = { ...cellStyle, fontSize: 10 };
// Slack for rounding between the measuring pass and the pages
const SAFETY_PX = 6;

const ICS214PrintView: React.FC<Props> = ({ id, form, preferUtc, preparedAt, onReady }) => {
  const resources = useMemo(() => form.resources.filter((r) => !r.hidden), [form.resources]);
  const lines = useMemo(() => form.lines.filter((l) => !l.hidden), [form.lines]);
  const h = form.header;
  const period = { from: h.period_from, to: h.period_to };
  const [pages, setPages] = useState<number[][] | null>(null);
  const measure = useRef<HTMLDivElement>(null);

  // ========== BLOCKS ==========
  const title = (
    <>
      {form.exercise && <ExerciseMarking position="top" />}
      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>ACTIVITY LOG (ICS 214)</div>
    </>
  );
  const block12 = (
    <table style={gridTableStyle}>
      <tbody>
        <tr>
          <td style={{ ...label, width: '45%' }}>1. Incident Name:</td>
          <td style={{ ...label, width: '55%' }}>2. Operational Period:</td>
        </tr>
        <tr>
          <td style={cellStyle}>{h.incident_name}</td>
          <td style={cellStyle}>
            Date From: {formDate(h.period_from, preferUtc)}&nbsp;&nbsp;&nbsp;Date To: {formDate(h.period_to, preferUtc)}<br />
            Time From: {formTime(h.period_from, preferUtc)}&nbsp;&nbsp;&nbsp;Time To: {formTime(h.period_to, preferUtc)}
            {preferUtc ? ' (UTC)' : ''}
          </td>
        </tr>
      </tbody>
    </table>
  );
  const block345 = (
    <table style={{ ...gridTableStyle, marginTop: -1 }}>
      <tbody>
        <tr>
          <td style={{ ...label, width: '33%' }}>3. Name:</td>
          <td style={{ ...label, width: '34%' }}>4. ICS Position:</td>
          <td style={{ ...label, width: '33%' }}>5. Home Agency (and Unit):</td>
        </tr>
        <tr>
          <td style={cellStyle}>{h.unit_name}</td>
          <td style={cellStyle}>{h.leader}</td>
          <td style={cellStyle}>{h.home_agency}</td>
        </tr>
      </tbody>
    </table>
  );
  const resourceHeading = (continued: boolean) => (
    <table style={{ ...gridTableStyle, marginTop: -1 }}>
      <tbody>
        <tr><td style={label} colSpan={3}>6. Resources Assigned{continued ? ' (continuation)' : ''}:</td></tr>
        <tr>
          <td style={{ ...label, width: '40%', textAlign: 'center' }}>Name</td>
          <td style={{ ...label, width: '25%', textAlign: 'center' }}>ICS Position</td>
          <td style={{ ...label, width: '35%', textAlign: 'center' }}>Home Agency (and Unit)</td>
        </tr>
      </tbody>
    </table>
  );
  const lineHeading = (continued: boolean) => (
    <table style={{ ...gridTableStyle, marginTop: -1 }}>
      <tbody>
        <tr><td style={label} colSpan={2}>7. Activity Log{continued ? ' (continuation)' : ''}:</td></tr>
        <tr>
          <td style={{ ...label, width: '18%', textAlign: 'center' }}>Date/Time</td>
          <td style={{ ...label, width: '82%', textAlign: 'center' }}>Notable Activities</td>
        </tr>
      </tbody>
    </table>
  );
  const resourceRow = (i: number) => {
    const r = resources[i];
    return (
      <tr key={`r${i}`}>
        <td style={{ ...small, width: '40%' }}>{r.name ? `${r.name}, ${r.callsign}` : r.callsign}</td>
        <td style={{ ...small, width: '25%' }}>{r.position}</td>
        <td style={{ ...small, width: '35%' }}>{r.agency}</td>
      </tr>
    );
  };
  const lineRow = (i: number) => {
    const l = lines[i];
    return (
      <tr key={`l${i}`}>
        <td style={{ ...small, width: '18%', whiteSpace: 'nowrap' }}>{lineDateTime(l.at, period, preferUtc)}</td>
        <td style={{ ...small, width: '82%' }}>{l.text}</td>
      </tr>
    );
  };
  const footer = (page: number) => (
    <>
      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...label, width: '40%' }}>8. Prepared by: Name: <span style={{ fontWeight: 400 }}>{h.prepared_name}</span></td>
            <td style={{ ...label, width: '30%' }}>Position/Title: <span style={{ fontWeight: 400 }}>{h.prepared_position}</span></td>
            <td style={{ ...label, width: '30%' }}>Signature:</td>
          </tr>
          <tr>
            <td style={label}>ICS 214, Page {page + 1}</td>
            <td style={label} colSpan={2}>
              Date/Time: <span style={{ fontWeight: 400 }}>{formDate(preparedAt, preferUtc)} {formTime(preparedAt, preferUtc)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      {form.exercise && <ExerciseMarking position="bottom" />}
    </>
  );

  // ========== MEASURE, THEN SPLIT INTO PAGES ==========
  useLayoutEffect(() => {
    const root = measure.current;
    if (!root || pages) return;
    const height = (name: string) => (root.querySelector(`[data-measure="${name}"]`) as HTMLElement | null)?.offsetHeight ?? 0;
    const rows = (name: string) => Array.from(root.querySelectorAll(`[data-measure="${name}"] tr`), (tr) => (tr as HTMLElement).offsetHeight);
    const pagePadding = (printPageStyle.padding as number) * 2;
    const fixed = pagePadding + height('title') + height('block12') + height('footer') + SAFETY_PX;
    const block345 = height('block345');
    const items = [
      ...rows('resources').map((rowHeight) => ({ section: 'resources' as const, height: rowHeight })),
      ...rows('lines').map((rowHeight) => ({ section: 'lines' as const, height: rowHeight })),
    ];
    setPages(splitPages(items, (p) => PRINT_PAGE_HEIGHT - fixed - (p === 0 ? block345 : 0), {
      resources: height('resourceHeading'), lines: height('lineHeading'),
    }));
  }, [pages]);

  useLayoutEffect(() => {
    if (pages) onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  if (!pages) {
    // ========== MEASURING PASS (never exported) ==========
    return (
      <div ref={measure} style={printPageStyle}>
        <div data-measure="title">{title}</div>
        <div data-measure="block12">{block12}</div>
        <div data-measure="block345">{block345}</div>
        <div data-measure="resourceHeading">{resourceHeading(false)}</div>
        <table data-measure="resources" style={gridTableStyle}><tbody>{resources.map((_, i) => resourceRow(i))}</tbody></table>
        <div data-measure="lineHeading">{lineHeading(false)}</div>
        <table data-measure="lines" style={gridTableStyle}><tbody>{lines.map((_, i) => lineRow(i))}</tbody></table>
        <div data-measure="footer">{footer(0)}</div>
      </div>
    );
  }

  // ========== THE PAGES ==========
  const lineOffset = resources.length;
  return (
    <div id={id}>
      {pages.map((indexes, p) => {
        const res = indexes.filter((i) => i < lineOffset);
        const lin = indexes.filter((i) => i >= lineOffset).map((i) => i - lineOffset);
        const resContinued = res.length > 0 && res[0] > 0;
        const linContinued = lin.length > 0 && lin[0] > 0;
        return (
          <div
            key={p}
            data-pdf-page
            style={{ ...printPageStyle, height: PRINT_PAGE_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {title}
            {block12}
            {p === 0 && block345}
            {/* Block 6 on the first page, and on any page it runs on to */}
            {(p === 0 || res.length > 0) && resourceHeading(resContinued)}
            {res.length > 0 && (
              <table style={{ ...gridTableStyle, marginTop: -1 }}><tbody>{res.map(resourceRow)}</tbody></table>
            )}
            {(lin.length > 0 || (p === 0 && lines.length === 0)) && lineHeading(linContinued)}
            {lin.length > 0 && (
              <table style={{ ...gridTableStyle, marginTop: -1 }}><tbody>{lin.map(lineRow)}</tbody></table>
            )}
            <div style={{ marginTop: 'auto' }}>{footer(p)}</div>
          </div>
        );
      })}
    </div>
  );
};

export default ICS214PrintView;
