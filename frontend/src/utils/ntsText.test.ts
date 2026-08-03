/**
 * Test suite for ARRL NTS text normalization.
 *
 * Uses shared test fixture (backend/tests/fixtures/nts_text_vectors.json)
 * to ensure TypeScript and Python implementations remain in sync.
 */

import { describe, it, expect } from 'vitest';
import { normalizeNtsText, countNtsCheck, normalizeAndCount } from './ntsText';

// Import the shared fixture
import vectors from '../../../backend/tests/fixtures/nts_text_vectors.json';

describe('normalizeNtsText', () => {
  it.each(vectors)('normalizes "$raw" to "$expected_normalized"', ({ raw, expected_normalized }) => {
    expect(normalizeNtsText(raw)).toBe(expected_normalized);
  });
});

describe('countNtsCheck', () => {
  it('counts X and QUERY prowords in normalized text', () => {
    // "WOW X GREAT X RIGHT" is 5 words once normalized (X counts as a word each time)
    const normalized = normalizeNtsText('Wow! Great, right.');
    expect(normalized).toBe('WOW X GREAT X RIGHT');
    expect(countNtsCheck(normalized)).toBe(5);
  });

  it('groups long digit runs by five', () => {
    // 6 digits -> ceil(6/5) = 2 words; 5 or fewer -> 1 word
    expect(countNtsCheck('12345')).toBe(1);
    expect(countNtsCheck('123456')).toBe(2);
  });

  it('treats decimal between digits as one token', () => {
    // 146.52 should be treated as one number, not split
    expect(countNtsCheck('146.52')).toBe(1);
  });
});

describe('normalizeAndCount', () => {
  it('uses normalized text for counting, not raw text', () => {
    /**
     * Prove the port does NOT reproduce format_nts_radiogram's fallback bug.
     *
     * bpq-apps's format_nts_radiogram fallback path counts the RAW text
     * when no pre-computed check is available, which disagrees with
     * fill_form's normalize-then-count order. Punctuation like "!" and
     * "," becomes an X proword only after normalization, so counting
     * raw vs. normalized text gives different totals for the same string.
     */
    const raw = 'Wow! Great, right.';

    const rawCount = countNtsCheck(raw);
    const normalizedCount = countNtsCheck(normalizeNtsText(raw));

    // The two orders genuinely disagree for this string
    expect(rawCount).toBe(3);
    expect(normalizedCount).toBe(5);
    expect(rawCount).not.toBe(normalizedCount);

    // normalizeAndCount must side with fill_form's order (normalized),
    // never with format_nts_radiogram's fallback order (raw)
    const [normalizedText, check] = normalizeAndCount(raw);
    expect(normalizedText).toBe('WOW X GREAT X RIGHT');
    expect(check).toBe(normalizedCount);
    expect(check).not.toBe(rawCount);
  });

  it('returns both normalized text and count', () => {
    const [normalized, count] = normalizeAndCount('Test? String!');
    expect(normalized).toBe('TEST QUERY STRING');
    expect(count).toBe(3);
  });
});
