// Coarse HF/VHF/UHF marker color-coding for the Profile Coverage map, matching
// the same palette and "named mix" strategy as the sibling mepn packet radio
// node map (frontend/src/lib/mepnMap.ts in that project). That file's own
// comment explains why: an earlier version blended band primaries in OKLab so
// a mix was a pure function of its components, but OKLab averaging walks the
// straight line between two colors through the neutral point (yellow + blue
// came out gray, not green) - reader-intuitive mixing is subtractive (paint),
// which no cheap RGB-derived blend reproduces. A fixed three-tier taxonomy
// keeps the four named mixes (three pairs + one all-three) honest and finite.

export type BandTier = 'hf' | 'vhf' | 'uhf';

const TIER_ORDER: BandTier[] = ['hf', 'vhf', 'uhf'];

// Maps the fine-grained band label ECTLogger's backend derives
// (backend/app/band_utils.py, e.g. "2m", "40m") to the coarse tier used for
// marker color. Same ARRL band-plan thresholds mepnMap.ts's bandsForPort
// uses: <30 MHz = HF, 30-300 MHz = VHF, 300 MHz-3 GHz = UHF.
const TIER_BY_BAND: Record<string, BandTier> = {
  '160m': 'hf', '80m': 'hf', '60m': 'hf', '40m': 'hf', '30m': 'hf',
  '20m': 'hf', '17m': 'hf', '15m': 'hf', '12m': 'hf', '10m': 'hf',
  '6m': 'vhf', '2m': 'vhf', '1.25m': 'vhf',
  '70cm': 'uhf', '33cm': 'uhf', '23cm': 'uhf',
};

export function bandTierFor(band: string | null | undefined): BandTier | null {
  if (!band) return null;
  return TIER_BY_BAND[band] ?? null;
}

// One primary per tier - identical hexes to mepnMap.ts's BAND_BASE_HEX, so a
// user who knows that map's legend already knows this one.
const TIER_BASE_HEX: Record<BandTier, string> = {
  hf: '#EDB200',
  vhf: '#3D4DCC',
  uhf: '#ED1D24',
};

// Named mixes (not computed) for the four ways 2-3 tiers combine on one
// marker - see the file header comment for why these are hand-picked rather
// than blended.
const TIER_MIX_HEX: Record<string, string> = {
  hf: TIER_BASE_HEX.hf,
  vhf: TIER_BASE_HEX.vhf,
  uhf: TIER_BASE_HEX.uhf,
  'hf-vhf': '#4E9B1E',
  'hf-uhf': '#F07A00',
  'vhf-uhf': '#8A3FA8',
  'hf-vhf-uhf': '#7A5C3A',
};

// Stations with no determinable band (digital-only frequency, or a report
// with no frequency on a net with more than one) fall back to this neutral
// rather than inventing a color for missing data - same rationale as
// mepnMap.ts's BAND_FALLBACK_HEX.
export const BAND_UNKNOWN_HEX = '#6B7183';

// Fill color for a marker covering the given set of tiers - a single tier is
// its own primary, 2-3 tiers use the named mix, and no known tier at all
// falls back to BAND_UNKNOWN_HEX.
export function bandFillFor(tiers: BandTier[]): string {
  const distinct = TIER_ORDER.filter((t) => tiers.includes(t));
  if (!distinct.length) return BAND_UNKNOWN_HEX;
  return TIER_MIX_HEX[distinct.join('-')] || BAND_UNKNOWN_HEX;
}

export const BAND_LEGEND: { tier: BandTier; label: string; hex: string }[] = [
  { tier: 'hf', label: 'HF', hex: TIER_BASE_HEX.hf },
  { tier: 'vhf', label: 'VHF', hex: TIER_BASE_HEX.vhf },
  { tier: 'uhf', label: 'UHF', hex: TIER_BASE_HEX.uhf },
];
