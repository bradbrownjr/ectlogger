import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '../hooks/useFormDefinitions';
import { acceptStripFormType, isNamedStripDefinition, rawStripFormType } from './trafficStripSettings';

const def = (form_type: string, output_format: string) => ({ form_type, output_format } as FormDefinition);
const DEFINITIONS = [
  def('RADIOGRAM', 'radiogram'),
  def('WXOBS', 'rri_strip'),
  def('RRI_STRIP_OTHER', 'rri_strip_raw'),
];

describe('isNamedStripDefinition', () => {
  it('offers named strip types and not the raw catch-all', () => {
    expect(DEFINITIONS.filter(isNamedStripDefinition).map((d) => d.form_type)).toEqual(['WXOBS']);
  });
});

describe('rawStripFormType', () => {
  it('finds the raw catch-all by its output format', () => {
    expect(rawStripFormType(DEFINITIONS)).toBe('RRI_STRIP_OTHER');
    expect(rawStripFormType([def('RAW_RENAMED', 'rri_strip_raw')])).toBe('RAW_RENAMED');
  });
  it('is null when the instance has none', () => {
    expect(rawStripFormType([def('RADIOGRAM', 'radiogram')])).toBeNull();
  });
});

describe('acceptStripFormType', () => {
  it('adds the strip type to a narrowed list', () => {
    expect(acceptStripFormType(['RADIOGRAM'], 'WXOBS')).toEqual(['RADIOGRAM', 'WXOBS']);
  });
  it('leaves an empty list alone, since empty already means every type', () => {
    const all: string[] = [];
    expect(acceptStripFormType(all, 'WXOBS')).toBe(all);
  });
  it('returns the same list when the type is already there or there is none', () => {
    const list = ['RADIOGRAM', 'WXOBS'];
    expect(acceptStripFormType(list, 'WXOBS')).toBe(list);
    expect(acceptStripFormType(list, null)).toBe(list);
  });
});
