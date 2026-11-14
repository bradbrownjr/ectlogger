import { describe, expect, it } from 'vitest';
import { FrequencyRow, clampPage, filterFrequencies, pageRows, sortFrequencies } from './communicationPlanTable';

const LIST: FrequencyRow[] = [
  { id: 1, frequency: '446.000', mode: 'FM', description: 'Simplex' },
  { id: 2, frequency: '146.520', mode: 'FM', description: 'National calling' },
  { id: 3, network: 'BrandMeister', talkgroup: '3123', mode: 'DMR' },
  { id: 4, frequency: '3.940', mode: 'SSB', description: 'ME ARES 75m' },
  { id: 5, network: 'UFB', mode: 'YSF' },
];
const ids = (rows: FrequencyRow[]) => rows.map((r) => r.id);

describe('filterFrequencies', () => {
  it('matches any text column, ignoring case', () => {
    expect(ids(filterFrequencies(LIST, 'ares', false, []))).toEqual([4]);
    expect(ids(filterFrequencies(LIST, 'brandmeister', false, []))).toEqual([3]);
    expect(ids(filterFrequencies(LIST, '', false, []))).toEqual([1, 2, 3, 4, 5]);
  });
  it('keeps only ticked rows with Selected only, together with the filter', () => {
    expect(ids(filterFrequencies(LIST, '', true, [2, 4]))).toEqual([2, 4]);
    expect(ids(filterFrequencies(LIST, 'fm', true, [2, 4]))).toEqual([2]);
  });
});

describe('sortFrequencies', () => {
  it('sorts by one column with numbers in order', () => {
    expect(ids(sortFrequencies(LIST, 'frequency', 'asc', null))).toEqual([4, 2, 1, 3, 5]);
    expect(ids(sortFrequencies(LIST, 'frequency', 'desc', null))).toEqual([5, 3, 1, 2, 4]);
  });
  it('lists pinned rows first, each group in column order', () => {
    // mode asc: DMR(3), FM(1), FM(2), SSB(4), YSF(5); pinned 5 and 1 come first
    expect(ids(sortFrequencies(LIST, 'mode', 'asc', [5, 1]))).toEqual([1, 5, 3, 2, 4]);
  });
  it('does not change the order when nothing is pinned', () => {
    expect(ids(sortFrequencies(LIST, 'mode', 'asc', []))).toEqual(ids(sortFrequencies(LIST, 'mode', 'asc', null)));
  });
  it('does not reorder the input', () => {
    const copy = [...LIST];
    sortFrequencies(copy, 'mode', 'asc', [5]);
    expect(ids(copy)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('paging', () => {
  const rows = Array.from({ length: 60 }, (_, i) => i);
  it('slices pages of the chosen size', () => {
    expect(pageRows(rows, 0, 25)).toEqual(rows.slice(0, 25));
    expect(pageRows(rows, 2, 25)).toEqual(rows.slice(50, 60));
  });
  it('shows every row with All (-1)', () => {
    expect(pageRows(rows, 3, -1)).toEqual(rows);
    expect(clampPage(3, 60, -1)).toBe(0);
  });
  it('keeps the page in range when the list shrinks', () => {
    expect(clampPage(2, 30, 25)).toBe(1);
    expect(pageRows(rows.slice(0, 30), 2, 25)).toEqual(rows.slice(25, 30));
    expect(clampPage(1, 0, 25)).toBe(0);
  });
});
