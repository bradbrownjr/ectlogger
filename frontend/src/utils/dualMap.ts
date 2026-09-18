/**
 * Dual-Map Outlier Detection
 *
 * Detects whether a set of check-in positions has significant geographic
 * outliers that justify showing two maps side-by-side: one zoomed into the
 * cluster and one full overview. Uses degree-based Euclidean distance from
 * the centroid (sufficient for relative comparison - no need for great-circle
 * accuracy when the only question is "is this point far off compared to the
 * rest").
 *
 * Shared by NetReport.tsx and NetStatistics.tsx, which present the same net's
 * map. It lived as a copy in each page until 2026-09-18; the copies happened
 * to stay in sync, but the sibling location-processing loops they sat next to
 * did not (see hooks/useMappedCheckIns.ts).
 */

export interface DualMapData {
  clusterPositions: [number, number][];
  allPositions: [number, number][];
}

export const computeDualMapData = (
  pts: { lat: number; lon: number }[]
): DualMapData | null => {
  if (pts.length < 3) return null;

  // Centroid
  const centLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const centLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;

  // Distance from centroid for each point (degrees)
  const dists = pts.map(p =>
    Math.sqrt(Math.pow(p.lat - centLat, 2) + Math.pow(p.lon - centLon, 2))
  );

  const sorted = [...dists].sort((a, b) => a - b);
  const medianDist = sorted[Math.floor(sorted.length / 2)];
  const maxDist = sorted[sorted.length - 1];

  // Only split when the maximal outlier is >3x the median distance AND
  // the cluster itself spans a meaningful area (>=0.5 degrees, roughly 50 km)
  if (medianDist < 0.5 || maxDist < medianDist * 3) return null;

  const clusterThreshold = medianDist * 2.5;
  const clusterPositions = pts
    .filter((_, i) => dists[i] <= clusterThreshold)
    .map(p => [p.lat, p.lon] as [number, number]);

  const allPositions = pts.map(p => [p.lat, p.lon] as [number, number]);

  // Only worth splitting if there are >=2 cluster points AND at least 1 outlier
  if (clusterPositions.length < 2 || clusterPositions.length === allPositions.length) return null;

  return { clusterPositions, allPositions };
};
