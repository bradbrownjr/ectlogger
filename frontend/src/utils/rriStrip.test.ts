import { describe, it, expect } from 'vitest';
import { composeStripText, splitStripText, StripSlot } from './rriStrip';

// A three-field layout whose last field opens a new "/ /" section, the same
// shape backend/app/traffic/rri_strip.py builds from _STRIP_SPECS.
const slots: StripSlot[] = [
  { name: 'call_sign', startsNewSection: false },
  { name: 'city', startsNewSection: false },
  { name: 'temp', startsNewSection: true },
];

describe('composeStripText', () => {
  it('matches format_rri_strip: keyword, "/ /" section breaks, "//" terminator', () => {
    expect(composeStripText('WXOBS', slots, ['w1aw', 'Bangor', '42'], true))
      .toBe('WXOBS/W1AW/BANGOR/ /42//');
  });

  it('keeps a blank field as an empty token so later values stay aligned', () => {
    expect(composeStripText('WXOBS', slots, ['W1AW', '', '42'], true))
      .toBe('WXOBS/W1AW// /42//');
  });

  it('leaves values verbatim when the type stores raw text', () => {
    expect(composeStripText('ETO', slots, ['w1aw', 'Bangor', '42'], false))
      .toBe('ETO/w1aw/Bangor/ /42//');
  });

  it('omits the leading token when the strip has no keyword', () => {
    expect(composeStripText('', slots, ['A', 'B', 'C'])).toBe('A/B/ /C//');
  });
});

describe('splitStripText', () => {
  it('round-trips a composed strip back onto the same fields', () => {
    const text = composeStripText('WXOBS', slots, ['W1AW', 'BANGOR', '42'], true);
    const { values, warnings } = splitStripText(text, 'WXOBS', slots);
    expect(values).toEqual(['W1AW', 'BANGOR', '42']);
    expect(warnings).toEqual([]);
  });

  it('preserves a blank mid-strip rather than shifting later values up', () => {
    const { values } = splitStripText('WXOBS/W1AW// /42//', 'WXOBS', slots);
    expect(values).toEqual(['W1AW', '', '42']);
  });

  it('reads a strip pasted without its keyword as values only', () => {
    const { values, warnings } = splitStripText('W1AW/BANGOR/ /42//', 'WXOBS', slots);
    expect(values).toEqual(['W1AW', 'BANGOR', '42']);
    expect(warnings.join(' ')).toContain('does not start with WXOBS');
  });

  it('flattens a strip pasted across several lines', () => {
    const { values } = splitStripText('WXOBS/W1AW/BANGOR\n/ /42//', 'WXOBS', slots);
    expect(values).toEqual(['W1AW', 'BANGOR', '42']);
  });

  it('warns when the strip is short, and fills what it can', () => {
    const { values, warnings } = splitStripText('WXOBS/W1AW//', 'WXOBS', slots);
    expect(values).toEqual(['W1AW', '', '']);
    expect(warnings.join(' ')).toContain('1 of 3');
  });

  it('warns about values beyond the layout instead of dropping them silently', () => {
    const { warnings } = splitStripText('WXOBS/W1AW/BANGOR/ /42/EXTRA//', 'WXOBS', slots);
    expect(warnings.join(' ')).toContain('extra value');
  });
});
