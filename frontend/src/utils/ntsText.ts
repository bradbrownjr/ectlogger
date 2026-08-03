/**
 * ARRL NTS radiogram text normalization and word-count helpers.
 *
 * Ported from backend/app/traffic/nts_text.py (which was itself ported from
 * bpq-apps apps/forms.py and reviewed/approved by ARRL Digital Section Manager Jim KY2D).
 * See docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5 for the confirmed QUERY-vs-INT
 * question and section 5.1 for a bug in the reference's fallback path (counting raw text
 * instead of normalized text) that this port deliberately does not reproduce — always call
 * normalizeAndCount, which normalizes first.
 */

/**
 * The complete NTS punctuation / prosign substitution table, in application order.
 * Order matters: digit-separator handling must run before generic punctuation,
 * and word-hyphen handling must run before the catch-all hyphen-to-space rule.
 */
export const NTS_SUBSTITUTIONS: Array<[RegExp, string, string]> = [
  [/(\d)[.:/](\d)/g, '$1R$2', 'decimal / fraction / time colon between digits -> R'],
  [/'/g, '', 'apostrophe dropped'],
  [/&/g, ' AND ', 'ampersand -> AND'],
  [/@/g, ' AT ', 'at-sign -> AT'],
  // Confirmed QUERY (not INT) per docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5.
  [/\?/g, ' QUERY ', 'question mark -> QUERY'],
  [/[()]/g, ' ', 'parentheses dropped'],
  [/(\w)\s*-\s*(\w)/g, '$1 X $2', 'hyphen between words -> X'],
  [/-/g, ' ', 'remaining hyphens -> space'],
  [/[.,!;:]/g, ' X ', 'period, comma, exclamation, semicolon, colon -> X'],
];

/**
 * Apply ARRL NTS prosign encoding to message text.
 *
 * Matches Winlink fixpunct() behavior:
 *   , ! ;     -> X    |  ? -> QUERY  |  & -> AND  |  ' -> dropped
 *   d.d d/d d:d -> R  |  hyphen between words -> X
 * Trailing punctuation and prosigns are stripped.
 */
export function normalizeNtsText(text: string): string {
  let t = text.toUpperCase().trim();

  // Strip trailing punctuation before any conversion
  t = t.replace(/[.,!?;:\s]+$/, '').trim();

  // Apply substitutions in order
  for (const [pattern, replacement] of NTS_SUBSTITUTIONS) {
    t = t.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  t = t.replace(/ {2,}/g, ' ').trim();

  // Strip trailing prosign words (no standalone meaning at end)
  const words = t.split(' ');
  while (words.length > 0 && (words[words.length - 1] === 'X' || words[words.length - 1] === 'QUERY')) {
    words.pop();
  }

  return words.join(' ');
}

/**
 * Compute NTS check (word count) per ARRL/Winlink rules.
 *
 * Strips punctuation without prosign substitution — matches Winlink
 * Strippunct+wordcount behavior. Pure-digit strings >5 chars count
 * as ceil(len/5) words each per ARRL NTS standard.
 */
export function countNtsCheck(text: string): number {
  let t = text.toUpperCase().trim();

  // Treat decimal between digits as one number token (146.52 -> 14652 -> 1 word)
  t = t.replace(/(\d)\.(\d)/g, '$1$2');

  // Strip all remaining punctuation
  t = t.replace(/[^\w\s]/g, ' ');
  t = t.replace(/ {2,}/g, ' ').trim();

  let count = 0;
  for (const w of t.split(' ')) {
    if (/^\d+$/.test(w)) {
      count += Math.ceil(w.length / 5);
    } else {
      count += 1;
    }
  }

  return count;
}

/**
 * Normalize NTS text and compute its check, in the correct order.
 *
 * Normalize first, then count the normalized text — this is what
 * bpq-apps's fill_form does, and what its comment says is correct
 * ("so X prowords are included"). bpq-apps's format_nts_radiogram has a
 * fallback path that counts the raw text instead; that is a bug in the
 * reference (see docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5.1)
 * and must not be reproduced. Callers should use this function rather
 * than calling normalizeNtsText and countNtsCheck separately, so
 * that bug can't be reintroduced by accident.
 */
export function normalizeAndCount(text: string): [string, number] {
  const normalized = normalizeNtsText(text);
  const check = countNtsCheck(normalized);
  return [normalized, check];
}
