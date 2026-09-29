// ========== SKYWARN SPOTTER NUMBER ==========
// Mirrors backend/app/utils.py::normalize_spotter_number -- keep both in
// sync. There is no national format (each NWS office assigns its own), so
// this checks characters and length only: letters, numbers, hyphens and
// spaces. Enough to turn away a link or email, never a real spotter ID.
export const SPOTTER_NUMBER_MAX_LENGTH = 20;
export const SPOTTER_NUMBER_RULE =
  `Spotter # can only contain letters, numbers, hyphens and spaces (up to ${SPOTTER_NUMBER_MAX_LENGTH} characters)`;
const SPOTTER_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9 -]*$/;

export function isValidSpotterNumber(value: string): boolean {
  const normalized = value.trim().split(/\s+/).join(' ').toUpperCase();
  if (!normalized) return true;
  return normalized.length <= SPOTTER_NUMBER_MAX_LENGTH && SPOTTER_NUMBER_PATTERN.test(normalized);
}
