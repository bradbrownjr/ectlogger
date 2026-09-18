import { describe, it, expect } from 'vitest';
import { computeDualMapData } from './dualMap';

// A tight Maine cluster (roughly Portland-area spread) plus one Texas outlier -
// the real shape of net 95 (WSSM MOTA), whose stations were all within about a
// degree of each other except KR1ZAN in Garland, TX.
const MAINE_CLUSTER = [
  { lat: 43.66, lon: -70.26 },
  { lat: 43.75, lon: -70.10 },
  { lat: 43.39, lon: -70.55 },
  { lat: 44.10, lon: -70.22 },
  { lat: 43.52, lon: -70.44 },
];
const TEXAS_OUTLIER = { lat: 32.91, lon: -96.63 };

describe('computeDualMapData', () => {
  it('returns null for fewer than 3 points', () => {
    expect(computeDualMapData([])).toBeNull();
    expect(computeDualMapData([MAINE_CLUSTER[0], TEXAS_OUTLIER])).toBeNull();
  });

  it('returns null for a cluster with no outlier', () => {
    expect(computeDualMapData(MAINE_CLUSTER)).toBeNull();
  });

  it('splits a tight cluster with one distant station', () => {
    const result = computeDualMapData([...MAINE_CLUSTER, TEXAS_OUTLIER]);
    expect(result).not.toBeNull();
    expect(result!.allPositions).toHaveLength(6);
    expect(result!.clusterPositions).toHaveLength(5);
    // The outlier belongs to the overview map only
    expect(result!.clusterPositions).not.toContainEqual([TEXAS_OUTLIER.lat, TEXAS_OUTLIER.lon]);
    expect(result!.allPositions).toContainEqual([TEXAS_OUTLIER.lat, TEXAS_OUTLIER.lon]);
  });

  it('returns null when the split would leave fewer than 2 cluster points', () => {
    expect(computeDualMapData([
      MAINE_CLUSTER[0],
      { lat: 32.91, lon: -96.63 },
      { lat: 21.31, lon: -157.86 },
    ])).toBeNull();
  });
});
