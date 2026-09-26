import React, { useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from 'recharts';
import { ReportAccentProvider, useReportAccent } from './ReportAccent';
import ReportMasthead from './ReportMasthead';
import ReportFigures, { ReportFigure } from './ReportFigures';
import ReportSectionTitle from './ReportSectionTitle';
import { getCheckInMarkerColor } from '../../utils/checkInMarkers';
import { getStatusLabel } from '../netview/checkInStatusHelpers';
import type { TimelineBin } from '../../utils/checkInTimeline';

// ========== SOCIAL SUMMARY IMAGES ==========
// The net's social-media images: header, figures, graphs and the check-in
// list in one image, continued on "2 of 2", "3 of 3"... when the list runs
// long. Rendered off-screen only while the PNG export runs; each page carries
// data-social-page and is captured by NetReport.tsx one at a time.
//
// Every page must stay within 4:5 (width:height), the tallest shape Facebook
// and Instagram show uncropped in a feed. The page is 960 px wide, but
// exportToPng trims its margins and adds the 32 px credit footer, so the
// final image is about 944 px wide: 4:5 of that is 1180, less the footer and
// a little slack gives the 1140 px page cap below.

export const SOCIAL_PAGE_WIDTH_PX = 960;
const PAGE_MAX_HEIGHT_PX = 1140;
const ROW_HEIGHT_PX = 32;

export interface SocialRosterRow {
  callsign: string;
  name?: string | null;
  location?: string | null;
}

interface SocialSummaryImagesProps {
  accentColors?: string[] | null;
  logoUrl?: string | null;
  title: string;
  when?: string;
  whenDetail?: string;
  figures: ReportFigure[];
  timeline: TimelineBin[];
  binSize: number;
  statusCounts: Record<string, number>;
  frequencyCounts: Record<string, number>;
  /** One row per station, in check-in order. */
  rows: SocialRosterRow[];
}

interface PageSlice {
  from: number;
  count: number;
}

// ---------- Graphs (first page only) ----------
// A graph with a single category (every station "Checked In", or every
// check-in on one frequency) says nothing in a post, so it is left out; its
// number is still in the figures row and the full report.
const SocialGraphs: React.FC<Pick<SocialSummaryImagesProps, 'timeline' | 'binSize' | 'statusCounts' | 'frequencyCounts'>> = ({
  timeline, binSize, statusCounts, frequencyCounts,
}) => {
  const { accent } = useReportAccent();
  const statuses = Object.entries(statusCounts).filter(([, v]) => v > 0);
  const freqs = Object.entries(frequencyCounts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const pair: React.ReactNode[] = [];

  if (statuses.length > 1) {
    pair.push(
      <Box key="status">
        <ReportSectionTitle sx={{ mt: 0 }} fontSize={15}>Status</ReportSectionTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <PieChart width={170} height={170}>
            <Pie data={statuses.map(([k, v]) => ({ k, v }))} dataKey="v" cx={85} cy={85} innerRadius={48} outerRadius={78} isAnimationActive={false} stroke="#fff">
              {statuses.map(([k]) => <Cell key={k} fill={getCheckInMarkerColor({ status: k })} />)}
            </Pie>
          </PieChart>
          <Box sx={{ display: 'grid', gap: 0.75, fontSize: 16 }}>
            {statuses.map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: getCheckInMarkerColor({ status: k }) }} />
                {getStatusLabel(k)} <Box component="b" sx={{ fontWeight: 700 }}>{v}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }
  if (freqs.length > 1) {
    const shown = freqs.slice(0, 6);
    pair.push(
      <Box key="freq">
        <ReportSectionTitle sx={{ mt: 0 }} fontSize={15}>By frequency</ReportSectionTitle>
        <BarChart width={pair.length ? 420 : 888} height={Math.max(96, shown.length * 34)} data={shown.map(([k, v]) => ({ k, v }))} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis dataKey="k" type="category" width={96} tick={{ fontSize: 15, fill: '#1a1c21' }} axisLine={false} tickLine={false} />
          <Bar dataKey="v" fill={accent} radius={[0, 3, 3, 0]} barSize={20} isAnimationActive={false}>
            <LabelList dataKey="v" position="right" style={{ fontSize: 15, fontWeight: 700, fill: '#1a1c21' }} />
          </Bar>
        </BarChart>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.5, mb: 2.5 }}>
      {timeline.length >= 2 && (
        <Box>
          <ReportSectionTitle sx={{ mt: 0 }} fontSize={15}>Check-in activity · per {binSize} min</ReportSectionTitle>
          <AreaChart width={888} height={180} data={timeline} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="#e6e8ec" />
            <XAxis dataKey="label" tick={{ fontSize: 14, fill: '#4a505c' }} interval={Math.max(0, Math.floor(timeline.length / 7) - 1)} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 14, fill: '#7b8190' }} axisLine={false} tickLine={false} />
            <Area type="monotone" dataKey="count" stroke={accent} strokeWidth={3} fill={accent} fillOpacity={0.14} dot={false} isAnimationActive={false} />
          </AreaChart>
        </Box>
      )}
      {pair.length === 1 && pair[0]}
      {pair.length === 2 && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3.5 }}>{pair}</Box>}
    </Box>
  );
};

// ---------- Check-in list ----------
const Roster: React.FC<{ rows: SocialRosterRow[]; from: number }> = ({ rows, from }) => {
  const { accent } = useReportAccent();
  return (
    <Box
      sx={{
        display: 'grid',
        gridAutoFlow: 'column',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, ${ROW_HEIGHT_PX}px)`,
        columnGap: 4,
      }}
    >
      {rows.map((r, k) => (
        <Box key={`${r.callsign}-${k}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, borderBottom: '1px solid #eef0f3', fontSize: 16 }}>
          <Box sx={{ width: 26, flex: 'none', textAlign: 'right', fontSize: 13, color: '#7b8190', fontVariantNumeric: 'tabular-nums' }}>{from + k + 1}</Box>
          <Box sx={{ width: 84, flex: 'none', fontFamily: '"Roboto Mono", ui-monospace, monospace', fontWeight: 700, fontSize: 17, color: accent }}>{r.callsign}</Box>
          <Box sx={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1a1c21' }}>
            {r.name || '—'}
            {r.location && <Box component="span" sx={{ ml: 1, fontSize: 14, color: '#7b8190' }}>{r.location}</Box>}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const PageShell = React.forwardRef<HTMLDivElement, { children: React.ReactNode; page?: number }>(({ children, page }, ref) => (
  <Box
    ref={ref}
    data-social-page={page}
    sx={{ width: SOCIAL_PAGE_WIDTH_PX, boxSizing: 'border-box', bgcolor: '#ffffff', color: '#1a1c21', p: '34px 36px 24px', fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif' }}
  >
    {children}
  </Box>
));
PageShell.displayName = 'PageShell';

const SocialSummaryImages: React.FC<SocialSummaryImagesProps> = (props) => {
  const { accentColors, logoUrl, title, when, whenDetail, figures, rows } = props;
  const firstProbe = useRef<HTMLDivElement>(null);
  const nextProbe = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageSlice[] | null>(null);

  const masthead = (eyebrow: string) => (
    <ReportMasthead compact logoUrl={logoUrl} eyebrow={eyebrow} title={title} when={when} whenDetail={whenDetail} />
  );
  const firstTop = (
    <>
      <ReportFigures compact figures={figures} />
      <SocialGraphs timeline={props.timeline} binSize={props.binSize} statusCounts={props.statusCounts} frequencyCounts={props.frequencyCounts} />
    </>
  );
  const listTitle = (text: string) => <ReportSectionTitle sx={{ mt: 0 }} fontSize={15}>{text}</ReportSectionTitle>;

  // Measure what the header (plus, on page one, figures and graphs) leaves
  // under the cap, and give the list that many rows per column. Measured
  // once: the parent mounts this fresh for each export and unmounts it after.
  useLayoutEffect(() => {
    if (!firstProbe.current || !nextProbe.current) return;
    const perColumn = (el: HTMLDivElement) =>
      Math.max(1, Math.floor((PAGE_MAX_HEIGHT_PX - el.offsetHeight) / ROW_HEIGHT_PX));
    const firstCap = perColumn(firstProbe.current) * 2;
    const nextCap = perColumn(nextProbe.current) * 2;
    const out: PageSlice[] = [];
    let i = 0;
    do {
      const count = Math.min(out.length ? nextCap : firstCap, rows.length - i);
      out.push({ from: i, count });
      i += count;
    } while (i < rows.length);
    setPages(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ReportAccentProvider colors={accentColors}>
      {/* Off-screen: this exists only to be captured. */}
      <Box aria-hidden sx={{ position: 'fixed', left: -20000, top: 0, display: 'grid', gap: 2 }}>
        {pages === null ? (
          <>
            <PageShell ref={firstProbe}>{masthead('Net Summary')}{firstTop}{listTitle('Check-ins')}</PageShell>
            <PageShell ref={nextProbe}>{masthead('Net Summary · 2 of 2')}{listTitle('Check-ins')}</PageShell>
          </>
        ) : (
          pages.map((p, k) => (
            <PageShell key={k} page={k}>
              {masthead(pages.length > 1 ? `Net Summary · ${k + 1} of ${pages.length}` : 'Net Summary')}
              {k === 0 && firstTop}
              {p.count > 0 && (
                <>
                  {listTitle(pages.length === 1
                    ? `Check-ins (${rows.length})`
                    : `Check-ins ${p.from + 1}–${p.from + p.count} of ${rows.length}`)}
                  <Roster rows={rows.slice(p.from, p.from + p.count)} from={p.from} />
                </>
              )}
            </PageShell>
          ))
        )}
      </Box>
    </ReportAccentProvider>
  );
};

export default SocialSummaryImages;
