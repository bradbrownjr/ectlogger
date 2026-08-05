// ========== CHECK-IN TIMELINE BINNING ==========
// Bins a net's check-ins into an adaptive time window for NetStatistics.tsx's
// activity chart, extracted here so the edge case that crashed the page
// (negative minutes-from-start) is covered by a regression test rather than
// only re-discoverable by reproducing it live.
//
// A check-in's minutes-from-start CAN be negative: a lobby check-in logged
// before "Start Net" is clicked, or (confirmed on beta net 50, 2026-08-06) a
// net whose started_at was re-stamped by a later restart while its original
// check-ins -- days earlier -- stayed attached. The label is still well-
// formed (backend/app/routers/statistics_net.py emits "+{minutes}m"
// unconditionally), so parsing it never fails -- the bug was purely
// arithmetic: a negative max minute flows into a negative bin count, and
// `new Array(negativeNumber)` throws RangeError, which an ErrorBoundary
// caught as a full-page crash rather than a chart merely looking wrong.

export interface TimelinePoint {
  label: string;
}

export interface TimelineBin {
  label: string;
  count: number;
}

export interface CheckInTimelineResult {
  timelineData: TimelineBin[];
  binSize: number;
}

const EMPTY: CheckInTimelineResult = { timelineData: [], binSize: 5 };

export function computeCheckInTimeline(points: TimelinePoint[] | undefined | null): CheckInTimelineResult {
  if (!points || points.length < 2) return EMPTY;

  const parse = (lbl: string) => parseInt(lbl.replace('+', '').replace('m', ''), 10);
  // Clamp to 0 -- see the module comment above. This is the fix: without
  // it, a net with only pre-start check-ins pushes maxMinutes, and every
  // bin count derived from it, negative.
  const minutes = points
    .map((p) => parse(p.label))
    .filter((n) => !isNaN(n))
    .map((n) => Math.max(0, n));
  if (minutes.length === 0) return EMPTY;
  const maxMinutes = Math.max(...minutes);

  const bin = maxMinutes < 30 ? 2 : maxMinutes < 120 ? 5 : maxMinutes < 300 ? 10 : 15;
  const numBins = Math.ceil(maxMinutes / bin) + 1;
  const bins = new Array(numBins).fill(0);
  for (const m of minutes) {
    const idx = Math.floor(m / bin);
    if (idx < numBins) bins[idx]++;
  }

  // Drop trailing empty bins (net left open after last check-in).
  let last = bins.length - 1;
  while (last > 0 && bins[last] === 0) last--;

  const data = bins.slice(0, last + 1).map((count, i) => ({
    label: `+${i * bin}m`,
    count,
  }));

  return { timelineData: data, binSize: bin };
}
